/**
 * FinalSurveyTokenService — SO-4 Tier 1 stateless guest-link tokens.
 *
 * A record link handed to an external contact must let the survey see the
 * record's rule verdicts + author-opted prefill WITHOUT the record Id ever
 * appearing in — or decoding out of — the URL. So the payload is
 * ENCRYPT-THEN-MAC: AES-256 encrypt (opacity — invariant 1, a mere signature
 * would base64-decode the recordId in the clear), then HMAC-SHA256 over the
 * ciphertext (integrity — a tampered token fails the MAC and never decrypts).
 *
 * Token = base64url(mac) + '.' + base64url(ciphertext). Stateless: resolve is
 * decrypt-and-verify in memory, ZERO database rows per link. Keys live in the
 * protected FinalLinkSecret__c custom setting, minted once on first use.
 *
 * Payload (pipe-joined): formId | recordId | sObjectType | issuedAtMs | expiryMs
 */
public with sharing class FinalSurveyTokenService {
    /** Default link lifetime — the per-link "stops working after" control
     *  (distinct from Form__c.Links_Invalidated_On__c, the mass kill switch). */
    public static final Integer DEFAULT_TTL_DAYS = 30;

    private static final String AES = 'AES256';
    private static final String HMAC = 'hmacSHA256';

    @TestVisible
    private static Blob encKeyCache;
    @TestVisible
    private static Blob macKeyCache;

    /** Resolved token payload, or null when a token is absent/forged/garbled. */
    public class Claims {
        public Id formId;
        public Id recordId;
        public String sObjectType;
        public Long issuedAt;
        public Long expiry;
    }

    // --------------------------------------------------------------- mint

    public static String mint(Id formId, Id recordId, String sObjectType) {
        return mint(formId, recordId, sObjectType, DEFAULT_TTL_DAYS);
    }

    public static String mint(
        Id formId,
        Id recordId,
        String sObjectType,
        Integer ttlDays
    ) {
        if (formId == null || recordId == null) {
            throw new AuraHandledException('A form and record are required.');
        }
        Long now = Datetime.now().getTime();
        Integer days = (ttlDays == null ||
            ttlDays <= 0)
            ? DEFAULT_TTL_DAYS
            : ttlDays;
        Long expiry = now + (Long) days * 24L * 60L * 60L * 1000L;
        return buildToken(formId, recordId, sObjectType, now, expiry);
    }

    /** Encrypt-then-MAC a token with explicit timestamps. Seam for tests that
     *  need an already-expired token (public mint always dates to the future). */
    @TestVisible
    private static String buildToken(
        Id formId,
        Id recordId,
        String sObjectType,
        Long issuedAt,
        Long expiry
    ) {
        String payload = String.join(
            new List<String>{
                String.valueOf(formId),
                String.valueOf(recordId),
                sObjectType,
                String.valueOf(issuedAt),
                String.valueOf(expiry)
            },
            '|'
        );
        loadKeys(true);
        Blob ct = Crypto.encryptWithManagedIV(
            AES,
            encKeyCache,
            Blob.valueOf(payload)
        );
        Blob mac = Crypto.generateMac(HMAC, ct, macKeyCache);
        return urlB64(mac) + '.' + urlB64(ct);
    }

    // ------------------------------------------------------------ resolve

    /** Decrypt + verify a token. Returns null for ANY failure (missing keys,
     *  bad shape, MAC mismatch, un-parseable payload) — the caller degrades to
     *  "no record context", never distinguishing why (no oracle). */
    public static Claims resolve(String token) {
        if (String.isBlank(token) || !token.contains('.')) {
            return null;
        }
        loadKeys(false);
        if (encKeyCache == null || macKeyCache == null) {
            return null; // never provisioned — nothing was ever minted
        }
        try {
            List<String> segs = token.split('\\.');
            if (segs.size() != 2) {
                return null;
            }
            Blob mac = urlB64Decode(segs[0]);
            Blob ct = urlB64Decode(segs[1]);
            Blob expected = Crypto.generateMac(HMAC, ct, macKeyCache);
            if (!macEquals(mac, expected)) {
                return null; // tampered / wrong key
            }
            Blob pt = Crypto.decryptWithManagedIV(AES, encKeyCache, ct);
            List<String> parts = pt.toString().split('\\|');
            if (parts.size() != 5) {
                return null;
            }
            Claims c = new Claims();
            c.formId = Id.valueOf(parts[0]);
            c.recordId = Id.valueOf(parts[1]);
            c.sObjectType = parts[2];
            c.issuedAt = Long.valueOf(parts[3]);
            c.expiry = Long.valueOf(parts[4]);
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    // --------------------------------------------------------------- keys

    /** Read (and, when minting, provision) the AES + MAC keys. Resolve never
     *  provisions — a guest must never write the secret; if it's missing,
     *  resolve simply yields null. */
    private static void loadKeys(Boolean provision) {
        if (encKeyCache != null && macKeyCache != null) {
            return;
        }
        FinalLinkSecret__c s = FinalLinkSecret__c.getInstance('keys');
        if (
            s == null ||
            String.isBlank(s.Enc_Key__c) ||
            String.isBlank(s.Mac_Key__c)
        ) {
            if (!provision) {
                return;
            }
            Blob enc = Crypto.generateAesKey(256);
            Blob mac = Crypto.generateAesKey(256);
            s = new FinalLinkSecret__c(
                Name = 'keys',
                Enc_Key__c = EncodingUtil.base64Encode(enc),
                Mac_Key__c = EncodingUtil.base64Encode(mac)
            );
            insert s;
        }
        encKeyCache = EncodingUtil.base64Decode(s.Enc_Key__c);
        macKeyCache = EncodingUtil.base64Decode(s.Mac_Key__c);
    }

    // ------------------------------------------------------------- helpers

    /** Length-safe MAC comparison over hex (the keys are secret; this guards
     *  the shape, forgery needs the key). */
    private static Boolean macEquals(Blob a, Blob b) {
        if (a == null || b == null) {
            return false;
        }
        String ha = EncodingUtil.convertToHex(a);
        String hb = EncodingUtil.convertToHex(b);
        if (ha.length() != hb.length()) {
            return false;
        }
        Integer diff = 0;
        for (Integer i = 0; i < ha.length(); i++) {
            diff |= ha.charAt(i) ^ hb.charAt(i);
        }
        return diff == 0;
    }

    private static String urlB64(Blob b) {
        return EncodingUtil.base64Encode(b)
            .replace('+', '-')
            .replace('/', '_')
            .replace('=', '');
    }

    private static Blob urlB64Decode(String s) {
        String t = s.replace('-', '+').replace('_', '/');
        Integer pad = Math.mod(4 - Math.mod(t.length(), 4), 4);
        for (Integer i = 0; i < pad; i++) {
            t += '=';
        }
        return EncodingUtil.base64Decode(t);
    }
}
