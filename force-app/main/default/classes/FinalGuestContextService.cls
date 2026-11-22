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
 *
 * AUDIENCE (owner 2026-11-22): link mappings carry a "Show to people who
 * aren't signed in" tick. A GUEST gets only the ticked rows, read here by the
 * server. A SIGNED-IN respondent gets those same ticked rows PLUS every
 * unticked row, but the unticked rows are read WITH THAT USER'S OWN ACCESS
 * (AccessLevel.USER_MODE: their field security and sharing). A field they
 * can't read, or a record they can't see, simply yields no value. The
 * `signedIn` flag is set only by the signed-in entry point
 * (FinalAutofillController.getLinkContext); the guest entry point never sets
 * it, and a Guest-type running user is refused the user-mode branch outright.
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
        return compute(spec, targetObject, recordId, false);
    }

    /**
     * @param signedIn true ONLY from the signed-in entry point: also fills the
     *        rule's UNTICKED link rows, read in USER_MODE. false (the guest
     *        default) = ticked rows only, never any user-mode read.
     */
    public static Map<String, Object> compute(
        Map<String, Object> spec,
        String targetObject,
        Id recordId,
        Boolean signedIn
    ) {
        // Belt and braces: a Guest-type running user never reaches user mode.
        Boolean viewerIsSignedIn =
            signedIn == true &&
            UserInfo.getUserType() != 'Guest';
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

        // Autofill rules link mappings with guestAllowed == true
        Map<String, Object> settings = asMap(spec.get('settings'));
        Map<String, Object> prefillSettings = settings != null
            ? asMap(settings.get('prefill'))
            : null;
        List<Object> rules = prefillSettings != null
            ? asList(prefillSettings.get('autofillRules'))
            : null;

        Map<String, Object> activeLinkRule = null;
        List<Map<String, Object>> guestLinkMappings = new List<Map<String, Object>>();
        // Unticked rows: collected for a signed-in respondent ONLY.
        List<Map<String, Object>> userLinkMappings = new List<Map<String, Object>>();
        if (rules != null) {
            for (Object rObj : rules) {
                Map<String, Object> rule = asMap(rObj);
                if (rule == null || rule.get('enabled') != true)
                    continue;
                Map<String, Object> source = asMap(rule.get('source'));
                if (source != null && (String) source.get('type') == 'link') {
                    String srcObj = (String) source.get('objectApiName');
                    if (
                        String.isNotBlank(srcObj) &&
                        srcObj.equalsIgnoreCase(targetObject)
                    ) {
                        activeLinkRule = rule;
                        for (Object mObj : asList(rule.get('mappings'))) {
                            Map<String, Object> m = asMap(mObj);
                            if (
                                m == null ||
                                m.get('from') == null ||
                                m.get('to') == null
                            ) {
                                continue;
                            }
                            if (m.get('guestAllowed') == true) {
                                guestLinkMappings.add(m);
                            } else if (viewerIsSignedIn) {
                                userLinkMappings.add(m);
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (
            ruleRows.isEmpty() &&
            prefillFields.isEmpty() &&
            guestLinkMappings.isEmpty() &&
            userLinkMappings.isEmpty()
        ) {
            return empty;
        }

        // ONE query: rule fields + survey prefill fields + guest-allowed autofill fields, spec-declared only.
        Set<String> fields = new Set<String>();
        for (Map<String, Object> row : ruleRows) {
            // own field or one hop (Account.Type), resolved the same way as
            // the signed-in path
            String path = FinalSurveyObjectController.recordRulePath(
                targetObject,
                (String) row.get('source')
            );
            if (path != null) {
                fields.add(path);
            }
        }
        for (String f : prefillFields.values()) {
            if (fieldMap.containsKey(f.toLowerCase())) {
                fields.add(f);
            }
        }
        // A guest-allowed field or one hop (Account.Name), in its SELECT
        // spelling. The author and the person minting passed the readability
        // checks; this read is the token-authorized system read.
        Map<String, String> guestPaths = new Map<String, String>();
        for (Map<String, Object> m : guestLinkMappings) {
            String f = (String) m.get('from');
            String path = FinalLookupService.canonicalPath(targetObject, f);
            if (path != null && path.countMatches('.') <= 1) {
                guestPaths.put(f, path);
                fields.add(path);
            }
        }
        // Only unticked rows: still confirm the token's record exists (a
        // system read of its Id alone), so the link reads as "applied".
        if (fields.isEmpty() && !userLinkMappings.isEmpty()) {
            fields.add('Id');
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

        if (rec == null && !fields.isEmpty()) {
            return empty;
        }

        // rule verdicts — same factKey + coercion as the authenticated path
        Map<String, Boolean> ruleFacts = new Map<String, Boolean>();
        for (Map<String, Object> row : ruleRows) {
            String source = (String) row.get('source');
            String operator = (String) row.get('operator');
            Object value = row.get('value');
            String key = FinalSurveyObjectController.factKey(
                source,
                operator,
                value
            );
            String path = FinalSurveyObjectController.recordRulePath(
                targetObject,
                source
            );
            ruleFacts.put(
                key,
                FinalSurveyObjectController.rowMatches(
                    operator,
                    FinalSurveyObjectController.valueAt(rec, path),
                    value,
                    path == null
                        ? null
                        : FinalLookupService.fieldAt(targetObject, path)
                )
            );
        }

        // prefill — author-opted fields only (surveys)
        Map<String, Object> populated = rec == null
            ? new Map<String, Object>()
            : rec.getPopulatedFieldsAsMap();
        Map<String, Object> populatedLower = new Map<String, Object>();
        for (String k : populated.keySet()) {
            populatedLower.put(k.toLowerCase(), populated.get(k));
        }

        Map<String, Object> prefill = new Map<String, Object>();
        for (String elId : prefillFields.keySet()) {
            String field = prefillFields.get(elId);
            if (
                populatedLower.containsKey(field.toLowerCase()) &&
                populatedLower.get(field.toLowerCase()) != null
            ) {
                prefill.put(elId, populatedLower.get(field.toLowerCase()));
            }
        }

        // autofill — published guest-opted link mappings
        List<Map<String, Object>> autofillList = new List<Map<String, Object>>();
        if (
            activeLinkRule != null &&
            (!guestLinkMappings.isEmpty() || !userLinkMappings.isEmpty())
        ) {
            Map<String, Object> ruleValues = new Map<String, Object>();
            for (Map<String, Object> m : guestLinkMappings) {
                String fromField = (String) m.get('from');
                String toEl = (String) m.get('to');
                String path = guestPaths.get(fromField);
                if (path != null && rec != null) {
                    // An empty lookup reads as null: present, and cleared by
                    // the runtime's ownership rules. Always keyed by the
                    // question, never by the source field.
                    ruleValues.put(
                        toEl,
                        FinalSurveyObjectController.valueAt(rec, path)
                    );
                }
            }
            // Signed-in only: the unticked rows, with the user's OWN access.
            // A ticked row for the same question wins.
            if (rec != null && !userLinkMappings.isEmpty()) {
                addUserModeValues(
                    targetObject,
                    recordId,
                    fieldMap,
                    userLinkMappings,
                    ruleValues
                );
            }
            autofillList.add(
                new Map<String, Object>{
                    'ruleId' => (String) activeLinkRule.get('id'),
                    'values' => ruleValues
                }
            );
        }

        return new Map<String, Object>{
            'prefill' => prefill,
            'ruleFacts' => ruleFacts,
            'autofill' => autofillList,
            'recordFound' => (rec != null)
        };
    }

    /**
     * Reads the unticked link rows as the running user (USER_MODE: their
     * field security + sharing) and adds `question => value` to `out`.
     * Never throws and never leaks: a field the user can't read is dropped
     * before the query, a record they can't see returns no row, and any
     * failure fills nothing extra.
     */
    private static void addUserModeValues(
        String targetObject,
        Id recordId,
        Map<String, Schema.SObjectField> fieldMap,
        List<Map<String, Object>> mappings,
        Map<String, Object> out
    ) {
        Map<String, String> pathByQuestion = new Map<String, String>();
        Set<String> paths = new Set<String>();
        for (Map<String, Object> m : mappings) {
            String toEl = (String) m.get('to');
            if (out.containsKey(toEl) || pathByQuestion.containsKey(toEl)) {
                continue; // a ticked (or earlier) row already answers it
            }
            String path = FinalLookupService.canonicalPath(
                targetObject,
                (String) m.get('from')
            );
            if (
                path != null &&
                path.countMatches('.') <= 1 &&
                userCanRead(targetObject, fieldMap, path)
            ) {
                pathByQuestion.put(toEl, path);
                paths.add(path);
            }
        }
        if (paths.isEmpty()) {
            return;
        }
        SObject userRec = null;
        try {
            List<SObject> found = Database.queryWithBinds(
                'SELECT ' +
                    String.join(new List<String>(paths), ', ') +
                    ' FROM ' +
                    targetObject +
                    ' WHERE Id = :recordId LIMIT 1',
                new Map<String, Object>{ 'recordId' => recordId },
                AccessLevel.USER_MODE
            );
            userRec = found.isEmpty() ? null : found[0];
        } catch (Exception e) {
            return; // no access to the object/field: fill nothing extra
        }
        if (userRec == null) {
            return; // no sharing to the record
        }
        for (String toEl : pathByQuestion.keySet()) {
            out.put(
                toEl,
                FinalSurveyObjectController.valueAt(
                    userRec,
                    pathByQuestion.get(toEl)
                )
            );
        }
    }

    /** Can the running user read this field (and, for a hop, the lookup that
     *  leads to it)? A describe pre-check so one unreadable field doesn't sink
     *  the other rows' single query. */
    private static Boolean userCanRead(
        String targetObject,
        Map<String, Schema.SObjectField> fieldMap,
        String path
    ) {
        Schema.DescribeFieldResult last = FinalLookupService.fieldAt(
            targetObject,
            path
        );
        if (last == null || !last.isAccessible()) {
            return false;
        }
        Integer dot = path.indexOf('.');
        if (dot < 0) {
            return true;
        }
        String rel = path.substring(0, dot);
        for (Schema.SObjectField f : fieldMap.values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (
                d.getType() == Schema.DisplayType.REFERENCE &&
                rel.equalsIgnoreCase(d.getRelationshipName())
            ) {
                return d.isAccessible();
            }
        }
        return false;
    }

    private static Map<String, Object> asMap(Object obj) {
        return obj instanceof Map<String, Object>
            ? (Map<String, Object>) obj
            : null;
    }

    private static List<Object> asList(Object obj) {
        return obj instanceof List<Object>
            ? (List<Object>) obj
            : new List<Object>();
    }
}
