/**
 * Signed, record-free upload capabilities (IMPL_PLAN_UPLOAD_RECORDS_ON_ARRIVAL).
 *
 * A session token lets the browser ask for a question's tag; the tag is the
 * value the native uploader stamps on every ContentVersion it uploads for that
 * question during this visit (one tag, any number of files). Neither is saved
 * anywhere: both carry their own claims and an HMAC over those claims plus the
 * caller's user Id (not stored in the token), so only the user they were issued
 * to can present them. The key is derived from the FinalLinkKeys MAC key, the
 * same root the guest bot-check tickets use.
 *
 *   session: s1.<publicKey>.<versionId>.<flags>.<attemptExp>.<sig>
 *   tag:     t1.<publicKey>.<versionId>.<elementId b64url>.<attemptExp>.<flags>.<sig>
 *
 * flags: bit 1 = public host, bit 2 = guest. Expiry values are epoch seconds.
 */
public with sharing class FinalUploadToken {
    private static final String SESSION = 's1';
    private static final String TAG = 't1';
    private static final String HMAC = 'hmacSHA256';
    private static final Integer MAX_ELEMENT_CHARS = 40;
    private static Blob keyCache;

    public class Claims {
        public String publicKey;
        public Id versionId;
        public Boolean publicHost;
        public Boolean guest;
        public Datetime attemptExpires;
        public String elementId;
    }

    /** @return A signed session token for these claims. */
    public static String session(Claims c) {
        return sign(
            new List<String>{
                SESSION,
                c.publicKey,
                String.valueOf(c.versionId),
                flags(c),
                epoch(c.attemptExpires)
            }
        );
    }

    /** @return A signed question tag; refuses element ids it cannot carry. */
    public static String tag(Claims c) {
        if (
            String.isBlank(c.elementId) ||
            c.elementId.length() > MAX_ELEMENT_CHARS
        ) {
            throw FinalUploadService.refuse(null);
        }
        return sign(
            new List<String>{
                TAG,
                c.publicKey,
                String.valueOf(c.versionId),
                urlB64(Blob.valueOf(c.elementId)),
                epoch(c.attemptExpires),
                flags(c)
            }
        );
    }

    /** @return Verified session claims for the current user, or null. Expiry is the caller's check. */
    public static Claims readSession(String token) {
        List<String> p = verify(token, 6, SESSION);
        if (p == null) {
            return null;
        }
        try {
            Claims c = base(p[1], p[2], p[3]);
            c.attemptExpires = datetimeOf(p[4]);
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    /** @return Verified tag claims for the current user, or null. Expiry is the caller's check. */
    public static Claims readTag(String token) {
        List<String> p = verify(token, 7, TAG);
        if (p == null) {
            return null;
        }
        try {
            Claims c = base(p[1], p[2], p[5]);
            Blob element = decodeCanonical(p[3]);
            if (element == null) {
                return null;
            }
            c.elementId = element.toString();
            if (c.elementId.length() > MAX_ELEMENT_CHARS) {
                return null;
            }
            c.attemptExpires = datetimeOf(p[4]);
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    /** A token's whole-second expiry, so claims and records agree exactly. */
    public static Datetime wholeSeconds(Datetime value) {
        return Datetime.newInstance(value.getTime() / 1000 * 1000);
    }

    private static Claims base(String publicKey, String version, String f) {
        if (!Pattern.matches('[A-Za-z0-9_-]{43}', publicKey)) {
            throw FinalUploadService.refuse(null);
        }
        Id versionId = Id.valueOf(version);
        if (versionId.getSObjectType() != Form_Version__c.SObjectType) {
            throw FinalUploadService.refuse(null);
        }
        if (!Pattern.matches('[0-3]', f)) {
            throw FinalUploadService.refuse(null);
        }
        Integer bits = Integer.valueOf(f);
        Claims c = new Claims();
        c.publicKey = publicKey;
        c.versionId = versionId;
        c.publicHost = Math.mod(bits, 2) == 1;
        c.guest = bits >= 2;
        return c;
    }

    private static String sign(List<String> parts) {
        String body = String.join(parts, '.');
        return body + '.' + urlB64(mac(body));
    }

    private static List<String> verify(
        String token,
        Integer size,
        String kind
    ) {
        if (token == null || token.length() > 255) {
            return null;
        }
        List<String> parts = token.split('\\.', -1);
        if (parts.size() != size || parts[0] != kind) {
            return null;
        }
        String signature = parts.remove(size - 1);
        Blob expected = mac(String.join(parts, '.'));
        Blob given = decodeCanonical(signature);
        if (given == null || !macEquals(given, expected)) {
            return null;
        }
        parts.add(signature);
        return parts;
    }

    private static Blob mac(String body) {
        return Crypto.generateMac(
            HMAC,
            Blob.valueOf(body + '|' + UserInfo.getUserId()),
            key()
        );
    }

    private static Blob key() {
        if (keyCache != null) {
            return keyCache;
        }
        FinalLinkKeys.load(false); // read only: a guest never provisions
        Blob root = FinalLinkKeys.macKey();
        if (root == null) {
            throw FinalUploadService.refuse(null);
        }
        keyCache = Crypto.generateMac(
            HMAC,
            Blob.valueOf('final-upload-v2'),
            root
        );
        return keyCache;
    }

    private static String flags(Claims c) {
        return String.valueOf(
            (c.publicHost == true ? 1 : 0) + (c.guest == true ? 2 : 0)
        );
    }

    private static String epoch(Datetime value) {
        return String.valueOf(value.getTime() / 1000);
    }

    private static Datetime datetimeOf(String seconds) {
        if (!Pattern.matches('[0-9]{1,12}', seconds)) {
            throw FinalUploadService.refuse(null);
        }
        return Datetime.newInstance(Long.valueOf(seconds) * 1000);
    }

    private static Boolean macEquals(Blob a, Blob b) {
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

    /** Canonical base64url only, so one value has exactly one encoding. */
    private static Blob decodeCanonical(String seg) {
        if (String.isBlank(seg) || !Pattern.matches('[A-Za-z0-9_-]+', seg)) {
            return null;
        }
        try {
            String t = seg.replace('-', '+').replace('_', '/');
            Integer pad = Math.mod(4 - Math.mod(t.length(), 4), 4);
            for (Integer i = 0; i < pad; i++) {
                t += '=';
            }
            Blob out = EncodingUtil.base64Decode(t);
            return urlB64(out) == seg ? out : null;
        } catch (Exception e) {
            return null;
        }
    }
}
