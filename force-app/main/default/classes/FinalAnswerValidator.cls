/**
 * FinalAnswerValidator - the server half of the spec's `validation` entries
 * (IMPL_PLAN_SERVER_VALIDATION, phase 1).
 *
 * The browser checks required / pattern / range before it sends; that is UX,
 * not security, because the payload is plain JSON anyone can edit. This walk
 * re-checks the same entries on the server, before anything is written, and
 * mirrors finalExpressionEngine.validateEntry / validateElement.
 *
 * Phase 1 checks only what needs no rule engine:
 *   - `required` on elements with no visibility rule on the element, its
 *     section or its page (a rule may have hidden it; phase 2 evaluates rules)
 *   - `pattern` and `range` on a sent, non-blank value
 * and skips repeat sections, file questions, `custom` entries and any entry
 * carrying a `when`.
 *
 * `with sharing`: reads no records; it only inspects the spec and payload.
 */
public with sharing class FinalAnswerValidator {
    /** What the browser shows when an entry carries no message of its own. */
    @TestVisible
    private static final String DEFAULT_MESSAGE = 'This value is not valid.';

    /**
     * @param isUpdate true on a record-page edit: an absent answer means
     *        "unchanged", so only a required answer SENT blank fails. On a
     *        new record or response an absent answer counts as blank.
     * @return one FieldError per failed entry; empty when everything passes.
     *         `fields` carries the key the browser routes by (see fieldsFor).
     */
    public static List<FinalSubmitService.FieldError> validate(
        Map<String, Object> spec,
        Map<String, Object> answers,
        Boolean isUpdate
    ) {
        List<FinalSubmitService.FieldError> out = new List<FinalSubmitService.FieldError>();
        if (spec == null) {
            return out;
        }
        Map<String, Object> sent = answers == null
            ? new Map<String, Object>()
            : answers;
        Boolean editing = isUpdate == true;
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null || sec.get('repeat') != null) {
                    continue; // groups have their own server checks
                }
                Boolean sectionGated = hasRule(page) || hasRule(sec);
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null || (String) el.get('type') == 'file') {
                        continue;
                    }
                    checkElement(
                        el,
                        sent,
                        editing,
                        sectionGated || hasRule(el),
                        out
                    );
                }
            }
        }
        return out;
    }

    private static void checkElement(
        Map<String, Object> el,
        Map<String, Object> answers,
        Boolean editing,
        Boolean gated,
        List<FinalSubmitService.FieldError> out
    ) {
        String elId = (String) el.get('id');
        if (String.isBlank(elId)) {
            return;
        }
        Boolean present = answers.containsKey(elId);
        Object value = answers.get(elId);
        String elType = (String) el.get('type');
        for (Object entryObj : asList(el.get('validation'))) {
            Map<String, Object> entry = asMap(entryObj);
            if (entry == null || entry.get('when') != null) {
                continue;
            }
            String kind = (String) entry.get('type');
            String failure = null;
            if (kind == 'required') {
                // A rule may have hidden the question, and the browser drops
                // hidden answers, so absence proves nothing there.
                // On an edit, absence means "unchanged".
                if (!gated && (present || !editing)) {
                    failure = requiredFailure(el, entry, elType, value);
                }
            } else if (kind == 'pattern') {
                failure = patternFailure(entry, value);
            } else if (kind == 'range') {
                failure = rangeFailure(entry, value);
            }
            // 'custom' and unknown types: phase 2 / forward-compatible no-op
            if (failure != null) {
                out.add(error(el, failure));
            }
        }
    }

    private static String requiredFailure(
        Map<String, Object> el,
        Map<String, Object> entry,
        String elType,
        Object value
    ) {
        // yesNo: FALSE is a real answer
        if (elType == 'yesNo' && isFalse(value)) {
            return null;
        }
        if (elType == 'matrix') {
            Map<String, Object> config = asMap(el.get('config'));
            Map<String, Object> picks = asMap(value);
            List<String> missing = new List<String>();
            for (
                Object rowObj : asList(
                    config == null ? null : config.get('rows')
                )
            ) {
                Map<String, Object> row = asMap(rowObj);
                if (row == null) {
                    continue;
                }
                String rowValue = String.valueOf(row.get('value'));
                if (picks == null || picks.get(rowValue) == null) {
                    String label = (String) row.get('label');
                    missing.add(String.isBlank(label) ? rowValue : label);
                }
            }
            if (missing.isEmpty()) {
                return null;
            }
            return messageOf(
                entry,
                'Please answer: ' + String.join(missing, ', ')
            );
        }
        return isBlank(value) || isFalse(value) ? messageOf(entry, null) : null;
    }

    private static String patternFailure(
        Map<String, Object> entry,
        Object value
    ) {
        if (isBlank(value)) {
            return null;
        }
        Pattern compiled;
        try {
            compiled = Pattern.compile((String) entry.get('pattern'));
        } catch (Exception e) {
            return null; // a malformed pattern never blocks a respondent
        }
        // find(), not matches(): JS RegExp.test() is a partial match
        return compiled.matcher(asText(value)).find()
            ? null
            : messageOf(entry, null);
    }

    private static String rangeFailure(
        Map<String, Object> entry,
        Object value
    ) {
        if (isBlank(value)) {
            return null;
        }
        Decimal n = asNumber(value);
        if (n == null) {
            return messageOf(entry, null);
        }
        Decimal lo = asNumber(entry.get('min'));
        Decimal hi = asNumber(entry.get('max'));
        if ((lo != null && n < lo) || (hi != null && n > hi)) {
            return messageOf(entry, null);
        }
        return null;
    }

    // ------------------------------------------------------------ helpers

    private static String messageOf(
        Map<String, Object> entry,
        String fallback
    ) {
        String m = (String) entry.get('message');
        if (String.isNotBlank(m)) {
            return m;
        }
        return fallback == null ? DEFAULT_MESSAGE : fallback;
    }

    /**
     * `fields` is how the browser routes an error to a question: it indexes
     * each element under its binding field, its mapping field, and its label
     * (finalFormViewer, server-error routing). Same order here, first hit
     * wins. A question with none of those becomes a form-level message.
     */
    private static FinalSubmitService.FieldError error(
        Map<String, Object> el,
        String message
    ) {
        FinalSubmitService.FieldError fe = new FinalSubmitService.FieldError();
        fe.message = message;
        fe.fields = new List<String>();
        String key = fieldKey(asMap(el.get('binding')));
        if (key == null) {
            key = fieldKey(asMap(el.get('mapping')));
        }
        if (key == null && String.isNotBlank((String) el.get('label'))) {
            key = (String) el.get('label');
        }
        if (key != null) {
            fe.fields.add(key);
        }
        return fe;
    }

    private static String fieldKey(Map<String, Object> holder) {
        String f = holder == null ? null : (String) holder.get('field');
        return String.isNotBlank(f) ? f : null;
    }

    /** A visibility block with at least one rule. */
    private static Boolean hasRule(Map<String, Object> node) {
        Map<String, Object> vis = node == null
            ? null
            : asMap(node.get('visibility'));
        return vis != null && !asList(vis.get('rules')).isEmpty();
    }

    /**
     * Blank EXACTLY as the browser's isBlank (finalExpressionEngine): null,
     * the empty string or an empty list. Whitespace is an answer there, so it
     * is one here: the server must never refuse what the browser accepted.
     */
    private static Boolean isBlank(Object v) {
        if (v == null) {
            return true;
        }
        if (v instanceof String) {
            return ((String) v).length() == 0;
        }
        if (v instanceof List<Object>) {
            return ((List<Object>) v).isEmpty();
        }
        return false;
    }

    private static Boolean isFalse(Object v) {
        return v instanceof Boolean && !((Boolean) v);
    }

    private static String asText(Object v) {
        if (v instanceof List<Object>) {
            List<String> parts = new List<String>();
            for (Object o : (List<Object>) v) {
                parts.add(o == null ? '' : String.valueOf(o));
            }
            return String.join(parts, ',');
        }
        return String.valueOf(v);
    }

    /** JS asNumber: booleans and non-numeric text are not numbers. */
    private static Decimal asNumber(Object v) {
        if (v == null || v instanceof Boolean) {
            return null;
        }
        if (v instanceof Decimal) {
            return (Decimal) v;
        }
        if (v instanceof Integer) {
            return Decimal.valueOf((Integer) v);
        }
        if (v instanceof Long) {
            return Decimal.valueOf((Long) v);
        }
        if (v instanceof Double) {
            return Decimal.valueOf((Double) v);
        }
        if (v instanceof String) {
            String s = ((String) v).trim();
            // JS Number('   ') is 0, so whitespace is the number 0 there too
            if (s.length() == 0) {
                return 0;
            }
            try {
                return Decimal.valueOf(s);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
}
