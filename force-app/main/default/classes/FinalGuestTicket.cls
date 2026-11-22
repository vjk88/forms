/**
 * FinalGuestTicket - the invisible bot checks for guest submits.
 *
 * A guest (public-site respondent) can only be slowed, never proven human, so
 * this is FRICTION, not a gate: a signed load ticket, a minimum ticket age, a
 * small proof-of-work puzzle and best-effort replay detection. No data model,
 * no records written per check. See docs/FinalDesign/IMPL_PLAN_GUEST_BOT_CHECKS.md.
 *
 * Ticket = base64url(payload) + '.' + base64url(HMAC-SHA256(derivedKey, payload))
 * payload = v1|formId(18)|issuedAtMs|random128bitHex|difficulty
 * derivedKey = HMAC-SHA256(key = decoded Mac_Key__c, message = 'guest-ticket-v1'),
 * so a personalized-link token (which uses the raw key) can never pass as a
 * ticket. Signed, not encrypted: nothing secret is inside.
 *
 * Proof-of-work: the browser finds a decimal nonce where
 * SHA-256(ticket + ':' + nonce) (UTF-8, lowercase hex) starts with `difficulty`
 * zero bits; Apex checks it with one digest call.
 *
 * Replay detection: after a SAVED submit the controller calls markUsed, which
 * writes a marker to the Org cache partition `local.FinalGuest`. Every cache
 * call is wrapped and FAILS OPEN (no partition / no capacity / any error = the
 * check is skipped). Check-then-mark is not atomic, so this is best effort and
 * must never be described as a rate limiter.
 *
 * Failures throw AuraHandledException whose message is exactly one of the
 * FINAL_BOT:* codes below; the public host turns them into respondent wording.
 * Guests never provision keys (FinalLinkKeys.load(false) only).
 */
public with sharing class FinalGuestTicket {
    public static final String INVALID = 'FINAL_BOT:INVALID';
    public static final String EXPIRED = 'FINAL_BOT:EXPIRED';
    public static final String PROOF = 'FINAL_BOT:PROOF';
    public static final String TOO_FAST = 'FINAL_BOT:TOO_FAST';
    public static final String USED = 'FINAL_BOT:USED';

    /** Thrown by mint when the signing keys were never provisioned. The
     *  controller maps it to the normal "unavailable" message. */
    public class NoKeysException extends Exception {
    }

    /** A ticket lives two hours; this also bounds replay-marker retention. */
    public static final Long LIFETIME_MS = 7200000L;
    /** Server-side minimum ticket age (the "too fast to be human" trap). */
    public static final Long MIN_AGE_MS = 2000L;
    /** Tolerated clock difference for an issuedAt slightly in the future. */
    public static final Long SKEW_MS = 5000L;
    /** Proof-of-work difficulty in leading zero bits. Measured 2026-11-21 with
     *  the real solver in headless Chromium (25 runs each): 16 bits = median
     *  0.45 s at 4x CPU throttle, 0.66 s at 6x (p90 2.1 s); 17 bits doubled
     *  that (6x median 2.0 s, max 7.1 s). The signed value in each ticket lets
     *  the server retune later. */
    public static final Integer DIFFICULTY = 16;

    private static final Integer MAX_TICKET_CHARS = 400;
    private static final Integer MAX_NONCE_CHARS = 20;
    private static final Integer MAX_DIFFICULTY = 32;
    private static final Integer MIN_MARKER_TTL_SECS = 300;
    private static final String VERSION = 'v1';
    private static final String HMAC = 'hmacSHA256';
    private static final String PARTITION = 'local.FinalGuest';

    // ----- test seams (no Test.isRunningTest() anywhere) -----

    /** When set, the clock the ticket logic reads (ms since epoch). */
    @TestVisible
    private static Long nowOverride;
    /** When set, the difficulty mint signs into the ticket. */
    @TestVisible
    private static Integer difficultyOverride;
    /** True simulates the cache being unavailable: every cache call skips. */
    @TestVisible
    private static Boolean cacheUnavailable = false;
    /** When non-null, an in-memory stand-in for the Org cache (key -> ttl
     *  seconds) so tests can observe and force markers deterministically. */
    @TestVisible
    private static Map<String, Integer> memoryCache;

    @TestVisible
    private static Blob derivedKeyCache;

    // --------------------------------------------------------------- mint

    /** A fresh, signed ticket for a form. Never provisions keys; throws
     *  NoKeysException when they are missing (never an unsigned ticket). */
    public static String mint(Id formId) {
        if (formId == null) {
            throw new NoKeysException('A form is required.');
        }
        Blob key = derivedKey();
        if (key == null) {
            throw new NoKeysException('Signing keys are not provisioned.');
        }
        String payload = String.join(
            new List<String>{
                VERSION,
                String.valueOf(formId),
                String.valueOf(nowMs()),
                EncodingUtil.convertToHex(Crypto.generateAesKey(128)),
                String.valueOf(currentDifficulty())
            },
            '|'
        );
        Blob body = Blob.valueOf(payload);
        Blob sig = Crypto.generateMac(HMAC, body, key);
        return urlB64(body) + '.' + urlB64(sig);
    }

    // ------------------------------------------------------------- verify

    /**
     * Check a submit's ticket + nonce for this form. Returns normally when the
     * submit may proceed, otherwise throws a FINAL_BOT:* refusal before
     * anything is written. Order: size bounds, signature, version, form,
     * issue time, expiry, proof-of-work, minimum age, replay marker.
     */
    public static void verify(String ticket, String nonce, Id formId) {
        if (nonce != null && nonce.length() > MAX_NONCE_CHARS) {
            throw refuse(INVALID);
        }
        Claims c = checkSigned(ticket, formId);
        Long now = nowMs();
        if (String.isBlank(nonce) || !Pattern.matches('[0-9]{1,20}', nonce)) {
            throw refuse(PROOF);
        }
        String hex = sha256Hex(ticket + ':' + nonce);
        if (leadingZeroBits(hex) < c.difficulty) {
            throw refuse(PROOF);
        }
        if (now - c.issuedAt < MIN_AGE_MS) {
            throw refuse(TOO_FAST);
        }
        if (isUsed(ticket)) {
            throw refuse(USED);
        }
    }

    /**
     * The cheap check for address-search calls: size, signature, version,
     * form, issue time and expiry exactly as verify does, but NO proof-of-work,
     * NO minimum age and NO used-marker check (the ticket is not spent; that
     * happens only on a saved submit). Throws the same INVALID / EXPIRED codes.
     */
    public static void verifySigned(String ticket, Id formId) {
        checkSigned(ticket, formId);
    }

    /** The part verify and verifySigned share. Returns the claims of a ticket
     *  that is well-formed, signed, for this form and neither from the future
     *  nor expired; otherwise throws INVALID or EXPIRED. */
    private static Claims checkSigned(String ticket, Id formId) {
        if (String.isBlank(ticket) || ticket.length() > MAX_TICKET_CHARS) {
            throw refuse(INVALID);
        }
        Claims c = parse(ticket); // signature + canonical encoding
        if (c == null) {
            throw refuse(INVALID);
        }
        if (c.version != VERSION) {
            throw refuse(INVALID);
        }
        if (c.formId != String.valueOf(formId)) {
            throw refuse(INVALID);
        }
        Long now = nowMs();
        if (c.issuedAt > now + SKEW_MS) {
            throw refuse(INVALID);
        }
        if (now - c.issuedAt > LIFETIME_MS) {
            throw refuse(EXPIRED);
        }
        return c;
    }

    // ------------------------------------------------------ replay marker

    /** Has a saved submit already used this ticket? Fails open (false). */
    public static Boolean isUsed(String ticket) {
        if (cacheUnavailable == true) {
            return false;
        }
        try {
            String key = markerKey(ticket);
            if (memoryCache != null) {
                return memoryCache.containsKey(key);
            }
            Cache.OrgPartition part = Cache.Org.getPartition(PARTITION);
            return part != null && part.get(key) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Record a saved submit's ticket. Fails open (silently skips). */
    public static void markUsed(String ticket) {
        if (cacheUnavailable == true) {
            return;
        }
        try {
            String key = markerKey(ticket);
            Integer ttl = markerTtlSeconds(ticket);
            if (memoryCache != null) {
                memoryCache.put(key, ttl);
                return;
            }
            Cache.OrgPartition part = Cache.Org.getPartition(PARTITION);
            if (part != null) {
                part.put(key, 1, ttl);
            }
        } catch (Exception e) {
            // fail open: no partition, no capacity, any cache error
        }
    }

    /** 'u' + the first 48 hex chars of SHA-256(ticket): alphanumeric only and
     *  49 characters, inside the cache's 50-character key limit. */
    @TestVisible
    private static String markerKey(String ticket) {
        return 'u' + sha256Hex(ticket).substring(0, 48);
    }

    /** Remaining ticket lifetime in seconds, never below five minutes. */
    @TestVisible
    private static Integer markerTtlSeconds(String ticket) {
        Integer ttl = MIN_MARKER_TTL_SECS;
        Claims c = parse(ticket);
        if (c != null) {
            Long left = (c.issuedAt + LIFETIME_MS - nowMs()) / 1000L;
            if (left > ttl) {
                ttl = left.intValue();
            }
        }
        return ttl;
    }

    // ------------------------------------------------------------ helpers

    private class Claims {
        String version;
        String formId;
        Long issuedAt;
        Integer difficulty;
    }

    /** Verify the signature and read the claims; null for ANY problem
     *  (missing keys, bad shape, non-canonical encoding, bad signature,
     *  malformed or out-of-range claims). */
    private static Claims parse(String ticket) {
        Blob key = derivedKey();
        if (key == null || ticket == null) {
            return null;
        }
        try {
            List<String> segs = ticket.split('\\.', -1);
            if (segs.size() != 2) {
                return null;
            }
            Blob body = decodeCanonical(segs[0]);
            Blob sig = decodeCanonical(segs[1]);
            if (body == null || sig == null) {
                return null;
            }
            Blob expected = Crypto.generateMac(HMAC, body, key);
            if (!macEquals(sig, expected)) {
                return null;
            }
            List<String> parts = body.toString().split('\\|', -1);
            if (parts.size() != 5) {
                return null;
            }
            Claims c = new Claims();
            c.version = parts[0];
            c.formId = parts[1];
            c.issuedAt = Long.valueOf(parts[2]);
            c.difficulty = Integer.valueOf(parts[4]);
            if (c.difficulty < 0 || c.difficulty > MAX_DIFFICULTY) {
                return null;
            }
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    private static Blob derivedKey() {
        if (derivedKeyCache != null) {
            return derivedKeyCache;
        }
        FinalLinkKeys.load(false); // read only: a guest never provisions
        Blob mac = FinalLinkKeys.macKey();
        if (mac == null) {
            return null;
        }
        derivedKeyCache = Crypto.generateMac(
            HMAC,
            Blob.valueOf('guest-ticket-v1'),
            mac
        );
        return derivedKeyCache;
    }

    private static Long nowMs() {
        return nowOverride != null ? nowOverride : Datetime.now().getTime();
    }

    private static Integer currentDifficulty() {
        return difficultyOverride != null ? difficultyOverride : DIFFICULTY;
    }

    private static AuraHandledException refuse(String code) {
        AuraHandledException e = new AuraHandledException(code);
        e.setMessage(code);
        return e;
    }

    /** Lowercase hex SHA-256 of the UTF-8 bytes of a string. Shared test
     *  vectors in FinalGuestTicketTest match c/finalProofOfWork's jest tests. */
    @TestVisible
    private static String sha256Hex(String s) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(s))
        );
    }

    /** How many leading zero BITS a lowercase hex digest starts with. */
    @TestVisible
    private static Integer leadingZeroBits(String hex) {
        Integer bits = 0;
        for (Integer i = 0; i < hex.length(); i++) {
            Integer v = '0123456789abcdef'.indexOf(hex.substring(i, i + 1));
            if (v == 0) {
                bits += 4;
                continue;
            }
            if (v < 0) {
                break;
            }
            if (v < 2) {
                bits += 3;
            } else if (v < 4) {
                bits += 2;
            } else if (v < 8) {
                bits += 1;
            }
            break;
        }
        return bits;
    }

    /** Length-safe, constant-time comparison over hex. */
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

    /** Decode base64url, returning null unless the segment is the CANONICAL
     *  (unpadded, re-encodes identically) form, so alternate encodings cannot
     *  create a second identity for one ticket. */
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
