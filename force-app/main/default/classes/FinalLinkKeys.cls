/**
 * FinalLinkKeys - the one reader of the protected FinalLinkSecret__c keys.
 *
 * The same row ('keys') backs two signed things: personalized-link tokens
 * (FinalSurveyTokenService: AES + HMAC) and guest load tickets
 * (FinalGuestTicket: a key derived from the HMAC key). Keeping the loading in
 * one place means both read the identical row and neither can drift.
 *
 * `load(false)` only READS - a guest must never write the secret. `load(true)`
 * creates the row when it is missing and NEVER rotates an existing one, so
 * links already handed out keep working. Authenticated callers only (minting a
 * link, publishing a form).
 */
public with sharing class FinalLinkKeys {
    @TestVisible
    private static Blob encKeyCache;
    @TestVisible
    private static Blob macKeyCache;

    /** Are both keys present (after the last load)? */
    public static Boolean hasKeys() {
        return encKeyCache != null && macKeyCache != null;
    }

    public static Blob encKey() {
        return encKeyCache;
    }

    public static Blob macKey() {
        return macKeyCache;
    }

    /** Read (and, when asked, provision) the AES + MAC keys into the caches. */
    public static void load(Boolean provision) {
        if (hasKeys()) {
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
}
