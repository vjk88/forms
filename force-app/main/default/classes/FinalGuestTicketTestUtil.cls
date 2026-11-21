/**
 * Shared test helper for every test that calls FinalGuestController.submitGuest.
 *
 * Production code has no test bypass: a guest submit must carry a real signed
 * ticket (meta.tk) and its proof-of-work nonce (meta.pow). This mints one
 * through FinalGuestTicket's @TestVisible seams instead: an already-aged
 * ticket (the clock seam) at difficulty 0 (so nonce "0" is a valid proof) and
 * injects it next to whatever meta the payload already had.
 */
@IsTest
public class FinalGuestTicketTestUtil {
    /** Old enough to clear the 2 s time trap, young enough to be unexpired. */
    public static final Long AGED_MS = 10000L;

    /** Make sure the signing keys exist (what Publish does in production). */
    public static void ensureKeys() {
        FinalLinkKeys.load(true);
    }

    /** A valid, pre-aged, difficulty-0 ticket for a form. */
    public static String agedTicket(Id formId) {
        return ticketAged(formId, AGED_MS, 0);
    }

    /** A ticket issued `ageMs` ago, signed with `difficulty`. The test seams
     *  are restored before returning. */
    public static String ticketAged(Id formId, Long ageMs, Integer difficulty) {
        ensureKeys();
        Long savedNow = FinalGuestTicket.nowOverride;
        Integer savedDifficulty = FinalGuestTicket.difficultyOverride;
        try {
            FinalGuestTicket.nowOverride = Datetime.now().getTime() - ageMs;
            FinalGuestTicket.difficultyOverride = difficulty;
            return FinalGuestTicket.mint(formId);
        } finally {
            FinalGuestTicket.nowOverride = savedNow;
            FinalGuestTicket.difficultyOverride = savedDifficulty;
        }
    }

    /** The payload with meta.tk / meta.pow set from a fresh aged ticket.
     *  A payload that is not a JSON object is returned untouched so the
     *  tests that exercise bad payloads keep their meaning. */
    public static String withTicket(Id formId, String payloadJson) {
        if (String.isBlank(payloadJson)) {
            return payloadJson;
        }
        return withTicket(payloadJson, agedTicket(formId), '0');
    }

    /** The payload with the given ticket and nonce injected into meta. */
    public static String withTicket(
        String payloadJson,
        String ticket,
        String nonce
    ) {
        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            return payloadJson;
        }
        if (payload == null) {
            return payloadJson;
        }
        Map<String, Object> meta = payload.get(
                'meta'
            ) instanceof Map<String, Object>
            ? (Map<String, Object>) payload.get('meta')
            : new Map<String, Object>();
        if (ticket == null) {
            meta.remove('tk');
        } else {
            meta.put('tk', ticket);
        }
        if (nonce == null) {
            meta.remove('pow');
        } else {
            meta.put('pow', nonce);
        }
        payload.put('meta', meta);
        return JSON.serialize(payload);
    }
}
