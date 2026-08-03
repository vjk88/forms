/**
 * FinalGuestContextService — SO-4 Tier 1: compute a guest survey's record
 * context (rule verdicts + author-opted prefill) once a token has been
 * verified.
 *
 * WHY A SEPARATE `without sharing` CLASS: the guest user has no sharing access
 * to the business record — the VERIFIED TOKEN is the authorization (spec
 * invariant 4: guest record reads run only behind a signature an internal user
 * minted). So the record read must run without sharing. It stays fenced:
 *  - never @AuraEnabled — only FinalGuestController calls it, AFTER resolving
 *    and validating the token (form match, expiry, kill-switch, sObjectType);
 *  - the field list comes ONLY from the published spec (record-rule rows +
 *    guest-opted mappings) — client input can never name a field;
 *  - it returns VERDICT BOOLEANS for rules (values never leave the server) and
 *    VALUES only for fields the author explicitly opted into a guest link.
 *
 * Rule scoring reuses FinalSurveyObjectController's shared helpers, so the
 * guest verdict for a row is byte-identical to the authenticated one.
 */
public without sharing class FinalGuestContextService {
    /**
     * @return { 'prefill' => {elementId: value}, 'ruleFacts' => {factKey: bool} }
     *         — one system-mode read over spec-declared fields only.
     */
    public static Map<String, Object> compute(
        Map<String, Object> spec,
        String targetObject,
        Id recordId
    ) {
        Map<String, Object> empty = new Map<String, Object>{
            'prefill' => new Map<String, Object>(),
            'ruleFacts' => new Map<String, Boolean>()
        };
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(targetObject.toLowerCase());
        if (t == null) {
            return empty;
        }
        Map<String, Schema.SObjectField> fieldMap = t.getDescribe()
            .fields.getMap();

        List<Map<String, Object>> ruleRows = FinalSurveyObjectController.recordRuleRows(
            spec
        );
        Map<String, String> prefillFields = FinalSurveyObjectController.guestPrefillFields(
            spec,
            targetObject
        );
        if (ruleRows.isEmpty() && prefillFields.isEmpty()) {
            return empty;
        }

        // ONE query: rule fields + opted prefill fields, spec-declared only.
        Set<String> fields = new Set<String>();
        for (Map<String, Object> row : ruleRows) {
            String f = ((String) row.get('source')).substring(7);
            if (fieldMap.containsKey(f.toLowerCase())) {
                fields.add(f);
            }
        }
        for (String f : prefillFields.values()) {
            if (fieldMap.containsKey(f.toLowerCase())) {
                fields.add(f);
            }
        }
        SObject rec = null;
        if (!fields.isEmpty()) {
            String soql =
                'SELECT ' +
                String.join(new List<String>(fields), ', ') +
                ' FROM ' +
                targetObject +
                ' WHERE Id = :recordId LIMIT 1';
            List<SObject> found = Database.queryWithBinds(
                soql,
                new Map<String, Object>{ 'recordId' => recordId },
                AccessLevel.SYSTEM_MODE
            );
            rec = found.isEmpty() ? null : found[0];
        }

        // rule verdicts — same factKey + coercion as the authenticated path
        Map<String, Boolean> ruleFacts = new Map<String, Boolean>();
        for (Map<String, Object> row : ruleRows) {
            String source = (String) row.get('source');
            String field = source.substring(7);
            String operator = (String) row.get('operator');
            Object value = row.get('value');
            String key = FinalSurveyObjectController.factKey(
                source,
                operator,
                value
            );
            Schema.SObjectField fTok = fieldMap.get(field.toLowerCase());
            Object actual = (rec == null ||
                fTok == null)
                ? null
                : rec.get(field);
            ruleFacts.put(
                key,
                FinalSurveyObjectController.rowMatches(
                    operator,
                    actual,
                    value,
                    fTok == null ? null : fTok.getDescribe()
                )
            );
        }

        // prefill — author-opted fields only
        Map<String, Object> populated = rec == null
            ? new Map<String, Object>()
            : rec.getPopulatedFieldsAsMap();
        Map<String, Object> prefill = new Map<String, Object>();
        for (String elId : prefillFields.keySet()) {
            String field = prefillFields.get(elId);
            if (populated.containsKey(field) && populated.get(field) != null) {
                prefill.put(elId, populated.get(field));
            }
        }

        return new Map<String, Object>{
            'prefill' => prefill,
            'ruleFacts' => ruleFacts
        };
    }
}
