/**
 * FinalSubmitService — the shared form-submission engine (Phase A, slice A1).
 *
 * ONE mapping/savepoint engine, TWO postures. Extracted from
 * FinalSubmitController so the internal and guest submit paths run identical
 * spec→record mapping, type coercion, and atomic parent+repeat-children DML —
 * differing ONLY in how the write is authorized:
 *
 *   INTERNAL — the running user's own CRUD/FLS: Security.stripInaccessible
 *              (CREATABLE) then `insert as user`. Byte-for-byte the
 *              pre-refactor FinalSubmitController behavior.
 *   GUEST    — the PUBLISHED SPEC is the allow-list. The field walk only ever
 *              maps fields the spec binds, so a guest can never name an object
 *              or field by crafting a payload. DML runs
 *              Database.insert(records, true, AccessLevel.SYSTEM_MODE) —
 *              system mode stated EXPLICITLY (guests own nothing; user-mode DML
 *              would fail, and v67 flips the default to user mode). The hard
 *              gate + spec allow-list are the trust boundary, not sharing.
 *              Callers (FinalGuestController) own the gating and the
 *              guests-never-update rule.
 *
 * `inherited sharing`: runs with-sharing under FinalSubmitController and
 * without-sharing under FinalGuestController; the guest DML is SYSTEM_MODE so
 * the sharing keyword is moot on that path.
 */
public inherited sharing class FinalSubmitService {
    public enum Posture {
        INTERNAL,
        GUEST
    }

    public class SubmitOutcome {
        public Id recordId;
        public Integer childCount;
    }

    /**
     * Maps an already-parsed payload onto the spec's bound target object and
     * repeat children, inserting everything inside ONE savepoint. The caller
     * owns loading/gating the spec and parsing both JSON blobs.
     */
    public static SubmitOutcome run(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Posture mode
    ) {
        return run(spec, payload, null, mode);
    }

    /**
     * 4-arg entry: versionId is the SERVER-loaded version identity — never
     * client-claimed (IMPL_PLAN_SURVEY_S1 rev-2 trust fix). The form path
     * ignores it; the survey path anchors the response row to it.
     */
    public static SubmitOutcome run(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Id versionId,
        Posture mode
    ) {
        Map<String, Object> formNode = asMap(spec.get('form'));
        Object formType = formNode == null ? null : formNode.get('type');
        if (formType instanceof String && (String) formType == 'survey') {
            return runSurvey(spec, payload, versionId, mode);
        }
        Map<String, Object> answers = asMap(payload.get('answers'));
        Map<String, Object> repeats = asMap(payload.get('repeats'));

        Map<String, Object> form = asMap(spec.get('form'));
        String targetObject = form == null
            ? null
            : (String) form.get('targetObject');
        if (String.isBlank(targetObject)) {
            throw new AuraHandledException(
                'This form has no target object to save to.'
            );
        }
        Schema.SObjectType parentType = Schema.getGlobalDescribe()
            .get(targetObject);
        if (parentType == null) {
            throw new AuraHandledException('Unknown object: ' + targetObject);
        }

        // one walk splits parent-scope bindings from repeat sections. Only
        // fields the SPEC binds are ever collected — this is the guest
        // allow-list, by construction (a client-named field is impossible).
        Map<String, Object> parentBindings = new Map<String, Object>();
        List<RepeatPlan> repeatPlans = new List<RepeatPlan>();
        for (Object pageObj : asList(spec.get('pages'))) {
            for (Object secObj : asList(asMap(pageObj).get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                Map<String, Object> repeatCfg = asMap(sec.get('repeat'));
                if (repeatCfg != null) {
                    RepeatPlan plan = new RepeatPlan();
                    plan.sectionId = (String) sec.get('id');
                    plan.childObject = (String) repeatCfg.get('childObject');
                    plan.relationshipField = (String) repeatCfg.get(
                        'relationshipField'
                    );
                    plan.elements = asList(sec.get('elements'));
                    repeatPlans.add(plan);
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    Map<String, Object> binding = asMap(el.get('binding'));
                    String elId = (String) el.get('id');
                    if (
                        binding == null ||
                        String.isBlank((String) binding.get('field')) ||
                        !answers.containsKey(elId)
                    ) {
                        continue;
                    }
                    parentBindings.put(
                        (String) binding.get('field'),
                        answers.get(elId)
                    );
                }
            }
        }

        Savepoint sp = Database.setSavepoint();
        try {
            SObject parent = buildRecord(parentType, parentBindings);
            List<SObject> parentList = stripForCreate(
                new List<SObject>{ parent },
                mode
            );
            doInsert(parentList, mode);
            Id parentId = parentList[0].Id;

            Integer childCount = 0;
            for (RepeatPlan plan : repeatPlans) {
                childCount += insertEntries(plan, repeats, parentId, mode);
            }

            SubmitOutcome res = new SubmitOutcome();
            res.recordId = parentId;
            res.childCount = childCount;
            return res;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Your response could not be saved. Nothing was recorded.'
            );
        }
    }

    private class RepeatPlan {
        String sectionId;
        String childObject;
        String relationshipField;
        List<Object> elements;
    }

    // ===== SURVEY: answer-store submit (SURVEY_PLAN §6 · IMPL_PLAN_SURVEY_S1) =====

    /**
     * Survey path: answers become Form_Response__c + Form_Response_Answer__c
     * rows (+ Form_Answer_Topic__c tag links) instead of business-object
     * fields.
     *
     * SECURITY — SYSTEM-MODE FENCES (owner ruling 7-2, 2026-07-27; documented
     * here for AppExchange Security Review): the inserts below run in system
     * mode for BOTH postures, so any respondent can file answers without
     * object perms (the "mailbox" model — you don't need a key to the post
     * office to mail a letter). The fences that keep that safe:
     *  1. Scope: exactly three app-owned objects (response / answer / link).
     *  2. Create-only — this path never updates or deletes anything.
     *  3. The server decides every field written; client input can never name
     *     a field or column (answers key by element id against the spec the
     *     CONTROLLER loaded and gated).
     *  4. Reads stay permission-checked everywhere else — system mode covers
     *     only the drop-in-the-box moment.
     */
    private static SubmitOutcome runSurvey(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Id versionId,
        Posture mode
    ) {
        if (versionId == null) {
            throw new AuraHandledException(
                'This survey has no published version to submit to.'
            );
        }
        if (responseCapReached(spec, versionId)) {
            throw new AuraHandledException(closedMessage(spec));
        }
        Map<String, Object> answers = asMap(payload.get('answers'));
        Map<String, Object> repeats = asMap(payload.get('repeats'));
        Map<String, Object> meta = asMap(payload.get('meta'));

        // one walk: plain elements + repeat plans (same shape as the form path)
        List<Map<String, Object>> flat = new List<Map<String, Object>>();
        List<RepeatPlan> plans = new List<RepeatPlan>();
        for (Object pageObj : asList(spec.get('pages'))) {
            for (Object secObj : asList(asMap(pageObj).get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null) {
                    continue;
                }
                if (asMap(sec.get('repeat')) != null) {
                    RepeatPlan plan = new RepeatPlan();
                    plan.sectionId = (String) sec.get('id');
                    plan.elements = asList(sec.get('elements'));
                    plans.add(plan);
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el != null && el.get('id') != null) {
                        flat.add(el);
                    }
                }
            }
        }

        Set<Id> validTopics = validTopicIds(flat, plans);

        Form_Response__c response = new Form_Response__c(
            Form_Version__c = versionId,
            Status__c = 'Completed',
            Submitted_Date__c = Datetime.now(),
            Completion_Time_Seconds__c = completionSeconds(meta)
        );
        if (!isAnonymous(spec) && mode == Posture.INTERNAL) {
            // capture what the channel knows: internal = the running user;
            // guests stay null (the site guest user id is noise; IP is v2)
            response.Submitted_By__c = UserInfo.getUserId();
        }
        String sess = getStr(meta, 'sessionId');
        if (sess != null) {
            response.Session_Id__c = sess.abbreviate(255);
        }

        Savepoint sp = Database.setSavepoint();
        try {
            insertFenced(new List<SObject>{ response });

            List<Form_Response_Answer__c> rows = new List<Form_Response_Answer__c>();
            List<List<Id>> topicsPerRow = new List<List<Id>>();
            for (Map<String, Object> el : flat) {
                String elId = (String) el.get('id');
                if (answers == null || !answers.containsKey(elId)) {
                    continue;
                }
                Form_Response_Answer__c row = answerRow(
                    el,
                    answers.get(elId),
                    response.Id,
                    null,
                    validTopics,
                    topicsPerRow
                );
                if (row != null) {
                    rows.add(row);
                }
            }
            for (RepeatPlan plan : plans) {
                List<Object> entries = repeats == null
                    ? null
                    : asList(repeats.get(plan.sectionId));
                if (entries == null) {
                    continue;
                }
                for (Integer i = 0; i < entries.size(); i++) {
                    Map<String, Object> entry = asMap(entries[i]);
                    if (entry == null || entry.isEmpty()) {
                        continue;
                    }
                    for (Object elObj : plan.elements) {
                        Map<String, Object> el = asMap(elObj);
                        String elId = el == null ? null : (String) el.get('id');
                        if (elId == null || !entry.containsKey(elId)) {
                            continue;
                        }
                        Form_Response_Answer__c row = answerRow(
                            el,
                            entry.get(elId),
                            response.Id,
                            i,
                            validTopics,
                            topicsPerRow
                        );
                        if (row != null) {
                            rows.add(row);
                        }
                    }
                }
            }
            if (!rows.isEmpty()) {
                insertFenced(rows);
            }
            List<Form_Answer_Topic__c> links = new List<Form_Answer_Topic__c>();
            for (Integer i = 0; i < rows.size(); i++) {
                for (Id topicId : topicsPerRow[i]) {
                    links.add(
                        new Form_Answer_Topic__c(
                            Answer__c = rows[i].Id,
                            Topic__c = topicId
                        )
                    );
                }
            }
            if (!links.isEmpty()) {
                insertFenced(links);
            }

            SubmitOutcome res = new SubmitOutcome();
            res.recordId = response.Id;
            res.childCount = rows.size();
            return res;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Your response could not be saved. Nothing was recorded.'
            );
        }
    }

    /** One answered element → one typed answer row; its valid topic ids are
     *  appended (as one list) to the parallel topicsPerRow. Blank values
     *  return null — nothing to store (Boolean false is NOT blank). */
    private static Form_Response_Answer__c answerRow(
        Map<String, Object> el,
        Object value,
        Id responseId,
        Integer entryIndex,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow
    ) {
        if (value == null) {
            return null;
        }
        if (value instanceof String && String.isBlank((String) value)) {
            return null;
        }
        if (value instanceof List<Object> && ((List<Object>) value).isEmpty()) {
            return null;
        }
        Form_Response_Answer__c row = new Form_Response_Answer__c(
            Form_Response__c = responseId,
            Element_Key__c = (String) el.get('id'),
            Entry_Index__c = entryIndex
        );
        Object label = el.get('label');
        if (label instanceof String) {
            row.Label_Snapshot__c = ((String) label).abbreviate(255);
        }
        writeTypedValue(row, el, value);
        applyAnalytics(row, el, validTopics, topicsPerRow);
        return row;
    }

    /** Typed storage is part of the type (SURVEY_PLAN principle 2.0.4):
     *  pick the value column from the JSON value's own type first, then the
     *  element's declared kind. Unparseable claims fall back to text —
     *  never a crash, never a dropped answer. */
    private static void writeTypedValue(
        Form_Response_Answer__c row,
        Map<String, Object> el,
        Object value
    ) {
        if (value instanceof Boolean) {
            row.Boolean_Value__c = (Boolean) value;
            return;
        }
        if (value instanceof List<Object>) {
            row.Selected_Options_JSON__c = JSON.serialize(value);
            return;
        }
        if (
            value instanceof Decimal ||
            value instanceof Integer ||
            value instanceof Double ||
            value instanceof Long
        ) {
            row.Numeric_Value__c = Decimal.valueOf(String.valueOf(value));
            return;
        }
        String s = String.valueOf(value);
        String kind = valueKind(el);
        if (kind == 'number') {
            try {
                row.Numeric_Value__c = Decimal.valueOf(s);
                return;
            } catch (Exception e) {
                // fall through to text
            }
        } else if (kind == 'date') {
            try {
                row.Date_Value__c = Date.valueOf(s);
                return;
            } catch (Exception e) {
                // fall through to text
            }
        } else if (kind == 'datetime') {
            try {
                row.DateTime_Value__c = (Datetime) JSON.deserialize(
                    '"' + s + '"',
                    Datetime.class
                );
                return;
            } catch (Exception e) {
                // fall through to text
            }
        }
        row.Text_Value__c = s.abbreviate(32768);
    }

    private static final Set<String> NUMERIC_TYPES = new Set<String>{
        'nps',
        'rating',
        'scale',
        'emojiScale',
        'likert',
        'slider'
    };

    /** number | date | datetime | text — from the registry key, else
     *  config.inputType (unbound survey `field` elements carry it). */
    private static String valueKind(Map<String, Object> el) {
        String t = (String) el.get('type');
        if (NUMERIC_TYPES.contains(t)) {
            return 'number';
        }
        Map<String, Object> config = asMap(el.get('config'));
        Object input = config == null ? null : config.get('inputType');
        if (!(input instanceof String)) {
            return 'text';
        }
        String kind = ((String) input).toLowerCase();
        if (
            kind == 'number' ||
            kind == 'currency' ||
            kind == 'percent' ||
            kind == 'slider'
        ) {
            return 'number';
        }
        if (kind == 'date') {
            return 'date';
        }
        if (kind == 'datetime' || kind == 'datetime-local') {
            return 'datetime';
        }
        return 'text';
    }

    /** Normalized score (0–100 linear map) + topic tags from the element's
     *  analytics block. ALWAYS appends exactly one (possibly empty) topic-id
     *  list to topicsPerRow — the caller's row/topics alignment depends on it.
     *  Unknown/retired topic ids keep their display name but get no link —
     *  never fail a submit over a tag (IMPL_PLAN 7-3). */
    private static void applyAnalytics(
        Form_Response_Answer__c row,
        Map<String, Object> el,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow
    ) {
        List<Id> rowTopics = new List<Id>();
        Map<String, Object> analytics = asMap(el.get('analytics'));
        if (analytics != null) {
            Object role = analytics.get('role');
            if (
                role instanceof String &&
                (String) role == 'score' &&
                row.Numeric_Value__c != null
            ) {
                Decimal minV = numOrNull(analytics.get('scaleMin'));
                Decimal maxV = numOrNull(analytics.get('scaleMax'));
                if (minV != null && maxV != null && maxV > minV) {
                    Decimal norm =
                        ((row.Numeric_Value__c - minV) / (maxV - minV)) * 100;
                    if (norm < 0) {
                        norm = 0;
                    }
                    if (norm > 100) {
                        norm = 100;
                    }
                    row.Normalized_Score__c = norm.setScale(2);
                }
            }
            List<String> names = new List<String>();
            for (Object tObj : asList(analytics.get('topics'))) {
                Map<String, Object> t = asMap(tObj);
                if (t == null) {
                    continue;
                }
                Object nm = t.get('name');
                if (nm instanceof String && String.isNotBlank((String) nm)) {
                    names.add((String) nm);
                }
                Id tid = idOrNull(t.get('id'));
                if (tid != null && validTopics.contains(tid)) {
                    rowTopics.add(tid);
                }
            }
            if (!names.isEmpty()) {
                row.Topic_Snapshot__c = String.join(names, '; ')
                    .abbreviate(255);
            }
        }
        topicsPerRow.add(rowTopics);
    }

    /** Every topic id the spec references, validated in ONE system-mode query
     *  (respondents may lack read on the vocabulary — validation is part of
     *  the fenced storage moment; see runSurvey doc). */
    private static Set<Id> validTopicIds(
        List<Map<String, Object>> flat,
        List<RepeatPlan> plans
    ) {
        Set<Id> wanted = new Set<Id>();
        List<Map<String, Object>> all = new List<Map<String, Object>>(flat);
        for (RepeatPlan plan : plans) {
            for (Object elObj : plan.elements) {
                Map<String, Object> el = asMap(elObj);
                if (el != null) {
                    all.add(el);
                }
            }
        }
        for (Map<String, Object> el : all) {
            Map<String, Object> analytics = asMap(el.get('analytics'));
            if (analytics == null) {
                continue;
            }
            for (Object tObj : asList(analytics.get('topics'))) {
                Map<String, Object> t = asMap(tObj);
                Id tid = t == null ? null : idOrNull(t.get('id'));
                if (tid != null) {
                    wanted.add(tid);
                }
            }
        }
        Set<Id> valid = new Set<Id>();
        if (wanted.isEmpty()) {
            return valid;
        }
        for (
            SObject st : Database.queryWithBinds(
                'SELECT Id FROM Survey_Topic__c WHERE Id IN :ids',
                new Map<String, Object>{ 'ids' => wanted },
                AccessLevel.SYSTEM_MODE
            )
        ) {
            valid.add(st.Id);
        }
        return valid;
    }

    /** Test-only failure injection: the savepoint's all-or-nothing guarantee
     *  is otherwise unreachable through the defensive public API. */
    @TestVisible
    private static Boolean testFailAnswerInsert = false;

    /** SYSTEM-MODE create for the three survey storage objects ONLY (ruling
     *  7-2 — the mailbox). Never reads, updates, or deletes. All-or-none. */
    private static void insertFenced(List<SObject> records) {
        if (
            testFailAnswerInsert &&
            !records.isEmpty() &&
            records[0] instanceof Form_Response_Answer__c
        ) {
            throw new AuraHandledException('Injected test failure.');
        }
        Database.insert(records, true, AccessLevel.SYSTEM_MODE);
    }

    /** settings.anonymous == true → keep scores, store no identity (S1
     *  honors the authored flag; the full anonymous UX is slice S5). */
    private static Boolean isAnonymous(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        Object v = settings == null ? null : settings.get('anonymous');
        return v instanceof Boolean && (Boolean) v;
    }

    /** Client-claimed timing — analytics-grade, never trust-grade. */
    private static Decimal completionSeconds(Map<String, Object> meta) {
        Datetime started = parseIso(getStr(meta, 'startedAt'));
        Datetime submitted = parseIso(getStr(meta, 'submittedAt'));
        if (started == null || submitted == null) {
            return null;
        }
        Long secs = (submitted.getTime() - started.getTime()) / 1000;
        return secs < 0 ? 0 : Decimal.valueOf(secs);
    }

    // ===== availability (ONE truth for both controllers — DEFERRED #20) =====

    /** Closed = manual status='closed', OR before opensAt, OR after closesAt.
     *  Missing/blank window bounds are simply not applied. */
    public static Boolean isClosed(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        if (avail == null) {
            return false;
        }
        if ((String) avail.get('status') == 'closed') {
            return true;
        }
        Datetime now = Datetime.now();
        Datetime opensAt = parseIso((String) avail.get('opensAt'));
        Datetime closesAt = parseIso((String) avail.get('closesAt'));
        return (opensAt != null && now < opensAt) ||
            (closesAt != null &&
            now > closesAt);
    }

    public static String closedMessage(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        Object msg = avail == null ? null : avail.get('closedMessage');
        return msg instanceof String && String.isNotBlank((String) msg)
            ? (String) msg
            : 'This form is no longer accepting responses.';
    }

    /** settings.availability.responseCap: N responses across ALL versions of
     *  the form → closed. Surveys only — a classic form's submissions are
     *  arbitrary business records the platform can't count generically
     *  (DEFERRED #20 note). System-mode counts: the cap must hold for guests
     *  who can see nothing. */
    public static Boolean responseCapReached(
        Map<String, Object> spec,
        Id versionId
    ) {
        if (versionId == null) {
            return false;
        }
        Map<String, Object> avail = availability(spec);
        Decimal cap = avail == null
            ? null
            : numOrNull(avail.get('responseCap'));
        if (cap == null || cap <= 0) {
            return false;
        }
        List<SObject> vs = Database.queryWithBinds(
            'SELECT Form__c FROM Form_Version__c WHERE Id = :vid',
            new Map<String, Object>{ 'vid' => versionId },
            AccessLevel.SYSTEM_MODE
        );
        if (vs.isEmpty()) {
            return false;
        }
        Id formId = (Id) vs[0].get('Form__c');
        Integer taken = Database.countQueryWithBinds(
            'SELECT COUNT() FROM Form_Response__c WHERE Form_Version__r.Form__c = :fid',
            new Map<String, Object>{ 'fid' => formId },
            AccessLevel.SYSTEM_MODE
        );
        return taken >= cap;
    }

    private static Map<String, Object> availability(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        return settings == null ? null : asMap(settings.get('availability'));
    }

    /** ISO-8601 → Datetime; blank/garbage → null (never a crash). */
    private static Datetime parseIso(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return (Datetime) JSON.deserialize('"' + s + '"', Datetime.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static Decimal numOrNull(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static Id idOrNull(Object v) {
        if (!(v instanceof String) || String.isBlank((String) v)) {
            return null;
        }
        try {
            return (Id) (String) v;
        } catch (Exception e) {
            return null;
        }
    }

    private static String getStr(Map<String, Object> m, String key) {
        Object v = m == null ? null : m.get(key);
        return v instanceof String ? (String) v : null;
    }

    /** One repeatable section's entries → child records (schema §4.1/§8). */
    private static Integer insertEntries(
        RepeatPlan plan,
        Map<String, Object> repeats,
        Id parentId,
        Posture mode
    ) {
        List<Object> entries = repeats == null
            ? null
            : asList(repeats.get(plan.sectionId));
        if (entries == null || entries.isEmpty()) {
            return 0;
        }
        Schema.SObjectType childType = Schema.getGlobalDescribe()
            .get(plan.childObject);
        if (childType == null) {
            throw new AuraHandledException(
                'Unknown object: ' + plan.childObject
            );
        }
        // element id → bound field, once per section
        Map<String, String> fieldByElement = new Map<String, String>();
        for (Object elObj : plan.elements) {
            Map<String, Object> el = asMap(elObj);
            Map<String, Object> binding = asMap(el.get('binding'));
            if (binding != null && binding.get('field') != null) {
                fieldByElement.put(
                    (String) el.get('id'),
                    (String) binding.get('field')
                );
            }
        }
        List<SObject> children = new List<SObject>();
        for (Object entryObj : entries) {
            Map<String, Object> entry = asMap(entryObj);
            if (entry == null || entry.isEmpty()) {
                continue;
            }
            Map<String, Object> bindings = new Map<String, Object>();
            Boolean hasValue = false;
            for (String elId : fieldByElement.keySet()) {
                if (entry.containsKey(elId)) {
                    Object v = entry.get(elId);
                    bindings.put(fieldByElement.get(elId), v);
                    if (v != null && String.valueOf(v) != '') {
                        hasValue = true;
                    }
                }
            }
            if (!hasValue) {
                continue; // an untouched blank entry inserts nothing
            }
            children.add(buildRecord(childType, bindings));
        }
        if (children.isEmpty()) {
            return 0;
        }
        // FLS first, then the linking field (schema §6: the linking field is
        // config, never an authored element — stripping must not eat it)
        List<SObject> stripped = stripForCreate(children, mode);
        for (SObject child : stripped) {
            child.put(plan.relationshipField, parentId);
        }
        doInsert(stripped, mode);
        return stripped.size();
    }

    /** Posture-appropriate FLS strip: INTERNAL removes fields the running user
     *  can't create; GUEST trusts the spec allow-list (the walk already bounded
     *  the fields) and strips nothing. */
    private static List<SObject> stripForCreate(
        List<SObject> records,
        Posture mode
    ) {
        if (mode == Posture.GUEST) {
            return records;
        }
        return Security.stripInaccessible(AccessType.CREATABLE, records)
            .getRecords();
    }

    /** Posture-appropriate insert: INTERNAL as the running user (CRUD/FLS via
     *  `as user`); GUEST in system mode (guests own nothing — the gate + spec
     *  allow-list are the boundary). All-or-none either way. */
    private static void doInsert(List<SObject> records, Posture mode) {
        if (mode == Posture.GUEST) {
            Database.insert(records, true, AccessLevel.SYSTEM_MODE);
        } else {
            insert as user records;
        }
    }

    /** Raw JSON answers → a typed SObject (coercion by describe type). */
    private static SObject buildRecord(
        Schema.SObjectType type,
        Map<String, Object> bindings
    ) {
        SObject record = type.newSObject();
        Map<String, Schema.SObjectField> fields = type.getDescribe()
            .fields.getMap();
        for (String fieldName : bindings.keySet()) {
            Schema.SObjectField field = fields.get(fieldName);
            if (field == null) {
                continue; // spec drift — never a crash
            }
            Object coerced = coerce(
                field.getDescribe().getType(),
                bindings.get(fieldName)
            );
            if (coerced != null) {
                record.put(fieldName, coerced);
            }
        }
        return record;
    }

    @SuppressWarnings('PMD.CyclomaticComplexity')
    private static Object coerce(Schema.DisplayType t, Object raw) {
        if (raw == null) {
            return null;
        }
        String s = String.valueOf(raw);
        if (s == '' && t != Schema.DisplayType.BOOLEAN) {
            return null;
        }
        switch on t {
            when BOOLEAN {
                return raw instanceof Boolean ? raw : s == 'true';
            }
            when DOUBLE, CURRENCY, PERCENT {
                return Decimal.valueOf(s);
            }
            when INTEGER, LONG {
                return Integer.valueOf(Decimal.valueOf(s).intValue());
            }
            when DATE {
                return Date.valueOf(s);
            }
            when DATETIME {
                // ISO-8601 from the client — JSON parsing handles zones
                return (Datetime) JSON.deserialize(
                    '"' + s + '"',
                    Datetime.class
                );
            }
            when MULTIPICKLIST {
                if (raw instanceof List<Object>) {
                    List<String> parts = new List<String>();
                    for (Object o : (List<Object>) raw) {
                        parts.add(String.valueOf(o));
                    }
                    return String.join(parts, ';');
                }
                return s;
            }
            when else {
                if (raw instanceof List<Object>) {
                    // checkbox-group answers on text fields
                    List<String> parts = new List<String>();
                    for (Object o : (List<Object>) raw) {
                        parts.add(String.valueOf(o));
                    }
                    return String.join(parts, ';');
                }
                return s;
            }
        }
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
