/**
 * Reads and writes Form_Version__c spec JSON across three long-text fields
 * (Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c) so a spec can be up to
 * 3 x 131,072 characters. Every reader and writer of the spec goes through
 * here; nothing else should touch the three fields directly.
 */
public inherited sharing class FinalSpecStore {
    public static final Integer PART = 131072;
    public static final Integer MAX = 3 * PART;

    /** Field list for dynamic SOQL. */
    public static final String FIELDS = 'Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c';

    public class TooLargeException extends Exception {
    }
    public class NotQueriedException extends Exception {
    }

    /** The whole spec, or null when the version has none. */
    public static String read(Form_Version__c v) {
        if (v == null) {
            return null;
        }
        String p1 = v.Spec_JSON__c;
        // PART - 1: a part may end one short when it kept an emoji whole
        if (p1 != null && p1.length() >= PART - 1) {
            requireQueried(v, 'Spec_JSON_2__c');
        }
        String p2 = requireQueriedValue(v, 'Spec_JSON_2__c');
        if (p2 != null && p2.length() >= PART - 1) {
            requireQueried(v, 'Spec_JSON_3__c');
        }
        String p3 = requireQueriedValue(v, 'Spec_JSON_3__c');
        if (p1 == null && p2 == null && p3 == null) {
            return null;
        }
        return (p1 == null ? '' : p1) +
            (p2 == null ? '' : p2) +
            (p3 == null ? '' : p3);
    }

    /** Splits json across the three fields; unused parts are nulled. */
    public static void write(Form_Version__c v, String json) {
        if (String.isBlank(json)) {
            v.Spec_JSON__c = null;
            v.Spec_JSON_2__c = null;
            v.Spec_JSON_3__c = null;
            return;
        }
        Integer n = json.length();
        if (n > MAX) {
            throw new TooLargeException(
                'This form is too large to save (' +
                    n.format() +
                    ' characters; the limit is ' +
                    MAX.format() +
                    '). Remove some questions or split it into two forms.'
            );
        }
        // Cut points step back one character when they would split an emoji
        // (a UTF-16 surrogate pair) across two fields.
        Integer cut1 = cutAt(json, 0);
        Integer cut2 = cutAt(json, cut1);
        if (n - cut2 > PART) {
            throw new TooLargeException(
                'This form is too large to save (' +
                    n.format() +
                    ' characters; the limit is ' +
                    MAX.format() +
                    '). Remove some questions or split it into two forms.'
            );
        }
        v.Spec_JSON__c = json.substring(0, cut1);
        v.Spec_JSON_2__c = cut1 < n ? json.substring(cut1, cut2) : null;
        v.Spec_JSON_3__c = cut2 < n ? json.substring(cut2, n) : null;
    }

    /** End of the part starting at `start`: PART long, never mid-surrogate. */
    private static Integer cutAt(String json, Integer start) {
        Integer n = json.length();
        Integer endAt = Math.min(n, start + PART);
        if (endAt < n && endAt > start) {
            Integer last = json.charAt(endAt - 1);
            if (last >= 55296 && last <= 56319) {
                endAt -= 1; // high surrogate: keep the pair together
            }
        }
        return endAt;
    }

    private static void requireQueried(Form_Version__c v, String fieldName) {
        if (!v.isSet(fieldName)) {
            throw new NotQueriedException(
                'Spec_JSON_2__c and Spec_JSON_3__c must be queried with Spec_JSON__c'
            );
        }
    }

    private static String requireQueriedValue(
        Form_Version__c v,
        String fieldName
    ) {
        if (!v.isSet(fieldName)) {
            return null;
        }
        return (String) v.get(fieldName);
    }
}
