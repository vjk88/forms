/**
 * FinalSurveyObjectController — the survey-object program's READ side
 * (SURVEY_OBJECT_SPEC, owner 2026-07-31; V2 SO-3 2026-08-02): prefill mapped
 * questions from a record of the survey's optional targetObject, and freeze
 * record-sourced visibility rules into verdict booleans.
 *
 * AUTHENTICATED contexts only — the guest host never calls this (guest
 * record context waits for SO-4 tokens).
 *
 * Postures inside (owner ruling 2026-08-02):
 *  - ROW-level: the runner must be able to SEE the record (UserRecordAccess)
 *    — otherwise survey links become an Id-probing oracle.
 *  - PREFILL is display → USER MODE + stripInaccessible (values a runner
 *    can't read stay out of their inputs).
 *  - RULES are the AUTHOR's logic → SYSTEM MODE over spec-declared fields,
 *    verdicts only (validation-rule/formula/Flow precedent). Field VALUES
 *    never leave the server for rules.
 */
public with sharing class FinalSurveyObjectController {
    /**
     * @return { elementId => current field value } for every mapped question
     *         the running user can read. Empty map when nothing is mapped.
     */
    @AuraEnabled
    public static Map<String, Object> getPrefill(
        Id versionId,
        Id formId,
        Id recordId
    ) {
        Ctx ctx = load(versionId, formId, recordId);
        return prefillValues(ctx);
    }

    /**
     * SO-3: one round trip per session — prefill values (FLS-stripped) plus
     * rule-fact booleans keyed `source|operator|value` (the SAME factKey the
     * client engine builds, finalExpressionEngine.factKey).
     */
    @AuraEnabled
    public static Map<String, Object> getRecordContext(
        Id versionId,
        Id formId,
        Id recordId
    ) {
        Ctx ctx = load(versionId, formId, recordId);
        return new Map<String, Object>{
            'prefill' => prefillValues(ctx),
            'ruleFacts' => ruleFacts(ctx)
        };
    }

    // ------------------------------------------------------------ shared core

    private class Ctx {
        Map<String, Object> spec;
        String targetObject;
        Id recordId;
    }

    /** Load + validate the survey, then the ROW-level record gate. */
    private static Ctx load(Id versionId, Id formId, Id recordId) {
        if ((versionId == null && formId == null) || recordId == null) {
            throw new AuraHandledException('A survey and record are required.');
        }
        List<Form_Version__c> versions = versionId != null
            ? [
                  SELECT Spec_JSON__c
                  FROM Form_Version__c
                  WHERE Id = :versionId
                  WITH USER_MODE
                  LIMIT 1
              ]
            : [
                  SELECT Spec_JSON__c
                  FROM Form_Version__c
                  WHERE Form__c = :formId AND Is_Active__c = TRUE
                  WITH USER_MODE
                  ORDER BY Version_Number__c DESC
                  LIMIT 1
              ];
        if (versions.isEmpty()) {
            throw new AuraHandledException('Survey version not found.');
        }
        Ctx ctx = new Ctx();
        ctx.spec = (Map<String, Object>) JSON.deserializeUntyped(
            versions[0].Spec_JSON__c
        );
        ctx.recordId = recordId;
        Map<String, Object> formNode = (Map<String, Object>) ctx.spec.get(
            'form'
        );
        Object formType = formNode == null ? null : formNode.get('type');
        ctx.targetObject = formNode == null
            ? null
            : (String) formNode.get('targetObject');
        if (
            !(formType instanceof String) ||
            (String) formType != 'survey' ||
            String.isBlank(ctx.targetObject)
        ) {
            throw new AuraHandledException(
                'This survey has no connected object.'
            );
        }
        if (
            recordId.getSObjectType() !=
            Schema.getGlobalDescribe().get(ctx.targetObject.toLowerCase())
        ) {
            throw new AuraHandledException(
                'That record does not belong to this survey\'s object.'
            );
        }
        // ROW-level gate: raw-recordId links must never let a runner probe
        // records they can't see (rule facts run system-mode below). The
        // refusal is indistinguishable from a nonexistent record.
        List<UserRecordAccess> access = [
            SELECT RecordId, HasReadAccess
            FROM UserRecordAccess
            WHERE UserId = :UserInfo.getUserId() AND RecordId = :recordId
        ];
        if (access.isEmpty() || !access[0].HasReadAccess) {
            throw new AuraHandledException('Record not found.');
        }
        return ctx;
    }

    /** PREFILL (display): USER_MODE query + stripInaccessible(READABLE). */
    private static Map<String, Object> prefillValues(Ctx ctx) {
        // 'read' skips write-only mappings (SO-2 direction)
        Map<String, String> fieldByElement = mappedFields(
            ctx.spec,
            ctx.targetObject,
            'read'
        );
        if (fieldByElement.isEmpty()) {
            return new Map<String, Object>();
        }
        // Schema drift: a mapped field deleted/renamed in Setup since
        // authoring must degrade to "that one doesn't prefill" — an
        // unfiltered SELECT would throw and take rule facts down with it.
        Map<String, Schema.SObjectField> fieldMap = Schema.getGlobalDescribe()
            .get(ctx.targetObject.toLowerCase())
            .getDescribe()
            .fields.getMap();
        Set<String> fields = new Set<String>();
        for (String f : fieldByElement.values()) {
            if (fieldMap.containsKey(f.toLowerCase())) {
                fields.add(f);
            }
        }
        if (fields.isEmpty()) {
            return new Map<String, Object>();
        }
        // access level rides the queryWithBinds argument — a WITH clause in
        // the string as well is a SecurityException (pick one, not both)
        String soql =
            'SELECT ' +
            String.join(new List<String>(fields), ', ') +
            ' FROM ' +
            ctx.targetObject +
            ' WHERE Id = :recordId LIMIT 1';
        List<SObject> found = Database.queryWithBinds(
            soql,
            new Map<String, Object>{ 'recordId' => ctx.recordId },
            AccessLevel.USER_MODE
        );
        if (found.isEmpty()) {
            throw new AuraHandledException('Record not found.');
        }
        // FLS belt over the sharing suspenders: drop unreadable fields
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.READABLE,
            found
        );
        SObject rec = decision.getRecords()[0];
        Map<String, Object> populated = rec.getPopulatedFieldsAsMap();

        Map<String, Object> out = new Map<String, Object>();
        for (String elId : fieldByElement.keySet()) {
            String field = fieldByElement.get(elId);
            if (populated.containsKey(field) && populated.get(field) != null) {
                out.put(elId, populated.get(field));
            }
        }
        return out;
    }

    // ------------------------------------------------- SO-3 rule fact engine

    /**
     * Every record-sourced rule row in the spec, frozen to a boolean. Keyed
     * `source|operator|value` — identical rows share one fact. SYSTEM MODE:
     * the author's branching logic runs the same for every runner (the
     * ROW-level gate in load() already proved the runner may see the record).
     */
    private static Map<String, Boolean> ruleFacts(Ctx ctx) {
        List<Map<String, Object>> rows = recordRuleRows(ctx.spec);
        if (rows.isEmpty()) {
            return new Map<String, Boolean>();
        }
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(ctx.targetObject.toLowerCase());
        Map<String, Schema.SObjectField> fieldMap = t.getDescribe()
            .fields.getMap();
        Set<String> fields = new Set<String>();
        for (Map<String, Object> row : rows) {
            String field = ((String) row.get('source')).substring(7);
            if (fieldMap.containsKey(field.toLowerCase())) {
                fields.add(field);
            }
        }
        SObject rec = null;
        if (!fields.isEmpty()) {
            String soql =
                'SELECT ' +
                String.join(new List<String>(fields), ', ') +
                ' FROM ' +
                ctx.targetObject +
                ' WHERE Id = :recordId LIMIT 1';
            List<SObject> found = Database.queryWithBinds(
                soql,
                new Map<String, Object>{ 'recordId' => ctx.recordId },
                AccessLevel.SYSTEM_MODE
            );
            rec = found.isEmpty() ? null : found[0];
        }
        Map<String, Boolean> out = new Map<String, Boolean>();
        for (Map<String, Object> row : rows) {
            String source = (String) row.get('source');
            String field = source.substring(7);
            String operator = (String) row.get('operator');
            Object value = row.get('value');
            String key = factKey(source, operator, value);
            Schema.SObjectField fTok = fieldMap.get(field.toLowerCase());
            Object actual = (rec == null ||
                fTok == null)
                ? null
                : rec.get(field);
            out.put(
                key,
                rowMatches(
                    operator,
                    actual,
                    value,
                    fTok == null ? null : fTok.getDescribe()
                )
            );
        }
        return out;
    }

    /** The SAME fact key the client engine builds (finalExpressionEngine
     *  `factKey`): `source|operator|value` (null value → ''). Shared so the
     *  guest path (FinalGuestContextService) and the internal path key
     *  verdicts identically. */
    public static String factKey(String source, String operator, Object value) {
        return source +
            '|' +
            operator +
            '|' +
            (value == null ? '' : String.valueOf(value));
    }

    /** Walk pages/sections/elements for visibility configs AND validation
     *  `when` gates; collect rows whose source is `record:<Field>`. Public so
     *  the guest context service reuses ONE rule walker (no divergence). */
    public static List<Map<String, Object>> recordRuleRows(
        Map<String, Object> spec
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Object pageObj : toList(spec.get('pages'))) {
            Map<String, Object> page = toMap(pageObj);
            if (page == null) {
                continue;
            }
            collectRows(toMap(page.get('visibility')), out);
            for (Object secObj : toList(page.get('sections'))) {
                Map<String, Object> sec = toMap(secObj);
                if (sec == null) {
                    continue;
                }
                collectRows(toMap(sec.get('visibility')), out);
                for (Object elObj : toList(sec.get('elements'))) {
                    Map<String, Object> el = toMap(elObj);
                    if (el == null) {
                        continue;
                    }
                    collectRows(toMap(el.get('visibility')), out);
                    for (Object vObj : toList(el.get('validation'))) {
                        Map<String, Object> v = toMap(vObj);
                        if (v != null) {
                            collectRows(toMap(v.get('when')), out);
                        }
                    }
                }
            }
        }
        return out;
    }

    private static void collectRows(
        Map<String, Object> config,
        List<Map<String, Object>> out
    ) {
        if (config == null) {
            return;
        }
        for (Object ruleObj : toList(config.get('rules'))) {
            Map<String, Object> rule = toMap(ruleObj);
            if (rule == null) {
                continue;
            }
            String source = (String) rule.get('source');
            if (source != null && source.startsWith('record:')) {
                out.add(rule);
            }
        }
    }

    /**
     * One record row → verdict. Coercion is describe-driven (the server
     * KNOWS the field type — the client engine's stringly answer semantics
     * apply only to answer rows): numeric fields compare as decimals, dates
     * as dates, everything else as strings (contains = case-insensitive).
     * Unknown field / unparseable comparison → false (fail safe, §7).
     * Public so the guest context service scores rows with the SAME coercion.
     */
    public static Boolean rowMatches(
        String operator,
        Object actual,
        Object value,
        Schema.DescribeFieldResult fd
    ) {
        if (fd == null) {
            return false; // field vanished since authoring
        }
        Boolean actualBlank =
            actual == null ||
            String.valueOf(actual).trim() == '';
        if (operator == 'isBlank') {
            return actualBlank;
        }
        if (operator == 'isNotBlank') {
            return !actualBlank;
        }
        String want = value == null ? '' : String.valueOf(value).trim();
        Schema.SoapType st = fd.getSoapType();
        Boolean isNumeric =
            st == Schema.SoapType.DOUBLE ||
            st == Schema.SoapType.INTEGER;
        Boolean isDate =
            st == Schema.SoapType.DATE ||
            st == Schema.SoapType.DATETIME;
        if (operator == 'equals' || operator == 'notEquals') {
            Boolean same;
            if (isNumeric) {
                Decimal a = toDecimal(actual);
                Decimal b = toDecimal(want);
                same = a != null && b != null ? a == b : eq(actual, want);
            } else if (isDate) {
                Long a = toTime(actual);
                Long b = toTime(want);
                same = a != null && b != null ? a == b : eq(actual, want);
            } else {
                same = eq(actual, want);
            }
            return operator == 'equals' ? same : !same;
        }
        if (operator == 'contains') {
            if (actualBlank) {
                return false;
            }
            return String.valueOf(actual)
                .toLowerCase()
                .contains(want.toLowerCase());
        }
        if (operator == 'greaterThan' || operator == 'lessThan') {
            Long diffSign;
            if (isDate) {
                Long a = toTime(actual);
                Long b = toTime(want);
                if (a == null || b == null) {
                    return false;
                }
                diffSign = a - b;
            } else {
                Decimal a = toDecimal(actual);
                Decimal b = toDecimal(want);
                if (a == null || b == null) {
                    return false;
                }
                diffSign = a == b ? 0 : (a > b ? 1 : -1);
            }
            return operator == 'greaterThan' ? diffSign > 0 : diffSign < 0;
        }
        return false; // unknown operator — fail safe
    }

    private static Boolean eq(Object actual, String want) {
        return (actual == null ? '' : String.valueOf(actual)) == want;
    }

    private static Decimal toDecimal(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(v).trim());
        } catch (Exception e) {
            return null;
        }
    }

    /** Date/Datetime/ISO string → epoch millis; null when unparseable. */
    private static Long toTime(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Datetime) {
            return ((Datetime) v).getTime();
        }
        if (v instanceof Date) {
            Date d = (Date) v;
            return Datetime.newInstanceGmt(d, Time.newInstance(0, 0, 0, 0))
                .getTime();
        }
        String s = String.valueOf(v).trim();
        try {
            if (s.length() == 10) {
                // date-only ('2027-01-01') — the rule editor's common form
                return Datetime.newInstanceGmt(
                        Date.valueOf(s),
                        Time.newInstance(0, 0, 0, 0)
                    )
                    .getTime();
            }
            return ((Datetime) JSON.deserialize('"' + s + '"', Datetime.class))
                .getTime();
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------- mapping walker

    /** All mappings regardless of direction (back-compat 2-arg form). */
    public static Map<String, String> mappedFields(
        Map<String, Object> spec,
        String targetObject
    ) {
        return mappedFields(spec, targetObject, null);
    }

    /**
     * Walk the spec for el.mapping entries targeting the survey's object.
     * SO-2 direction: `mapping.mode` 'prefill' = read-only, 'write' =
     * write-only, absent/'both' = both ways. Pass direction 'read'|'write'
     * to get only the mappings that participate in that flow; null = all.
     */
    public static Map<String, String> mappedFields(
        Map<String, Object> spec,
        String targetObject,
        String direction
    ) {
        Map<String, String> out = new Map<String, String>();
        for (Object pageObj : toList(spec.get('pages'))) {
            Map<String, Object> page = toMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : toList(page.get('sections'))) {
                Map<String, Object> sec = toMap(secObj);
                if (sec == null || toMap(sec.get('repeat')) != null) {
                    continue; // repeaters are not mappable (spec v1)
                }
                for (Object elObj : toList(sec.get('elements'))) {
                    Map<String, Object> el = toMap(elObj);
                    if (el == null) {
                        continue;
                    }
                    Map<String, Object> mapping = toMap(el.get('mapping'));
                    String elId = el == null ? null : (String) el.get('id');
                    if (mapping == null || elId == null) {
                        continue;
                    }
                    String obj = (String) mapping.get('object');
                    String field = (String) mapping.get('field');
                    if (
                        String.isNotBlank(field) &&
                        obj != null &&
                        obj.equalsIgnoreCase(targetObject) &&
                        modeAllows((String) mapping.get('mode'), direction)
                    ) {
                        out.put(elId, field);
                    }
                }
            }
        }
        return out;
    }

    /**
     * SO-4: the guest-prefill subset — mapped fields the author explicitly
     * opted into a guest link (`mapping.guestPrefill === true`) AND that
     * participate in the read (prefill) direction. Shipping a value into an
     * input IS disclosure, so this is per-field opt-in, default OFF: a guest
     * link never reveals a field the author didn't check.
     */
    public static Map<String, String> guestPrefillFields(
        Map<String, Object> spec,
        String targetObject
    ) {
        Map<String, String> out = new Map<String, String>();
        for (Object pageObj : toList(spec.get('pages'))) {
            Map<String, Object> page = toMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : toList(page.get('sections'))) {
                Map<String, Object> sec = toMap(secObj);
                if (sec == null || toMap(sec.get('repeat')) != null) {
                    continue;
                }
                for (Object elObj : toList(sec.get('elements'))) {
                    Map<String, Object> el = toMap(elObj);
                    Map<String, Object> mapping = el == null
                        ? null
                        : toMap(el.get('mapping'));
                    String elId = el == null ? null : (String) el.get('id');
                    if (mapping == null || elId == null) {
                        continue;
                    }
                    String obj = (String) mapping.get('object');
                    String field = (String) mapping.get('field');
                    if (
                        mapping.get('guestPrefill') == true &&
                        String.isNotBlank(field) &&
                        obj != null &&
                        obj.equalsIgnoreCase(targetObject) &&
                        modeAllows((String) mapping.get('mode'), 'read')
                    ) {
                        out.put(elId, field);
                    }
                }
            }
        }
        return out;
    }

    private static Boolean modeAllows(String mode, String direction) {
        if (direction == null || String.isBlank(mode) || mode == 'both') {
            return true;
        }
        return (direction == 'read' && mode == 'prefill') ||
            (direction == 'write' &&
            mode == 'write');
    }

    private static List<Object> toList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
    private static Map<String, Object> toMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }
}
