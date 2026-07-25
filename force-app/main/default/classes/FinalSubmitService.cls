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
