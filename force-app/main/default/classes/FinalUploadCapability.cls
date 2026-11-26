/** Small, opaque upload capabilities. No record IDs or respondent information. */
public with sharing class FinalUploadCapability {
    /** @return A new 256-bit Base64URL capability, returned only to its caller. */
    public static String mint() {
        return EncodingUtil.base64Encode(Crypto.generateAesKey(256))
            .replace('+', '-')
            .replace('/', '_')
            .replace('=', '');
    }

    /** @return A new 128-bit Base64URL key (22 characters), for file slots. */
    public static String key128() {
        return EncodingUtil.base64Encode(Crypto.generateAesKey(128))
            .replace('+', '-')
            .replace('/', '_')
            .replace('=', '');
    }

    /** @param token Untrusted capability. @return Digest, or null for invalid input. */
    public static String digest(String token) {
        if (token == null || !Pattern.matches('^[A-Za-z0-9_-]{43}$', token)) {
            return null;
        }
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(token))
        );
    }
}
