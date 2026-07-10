/**
 * FinalSubmitController — the submit engine (BUILD_PHASES P3 slice 7).
 *
 * The client sends answers keyed by ELEMENT ID (schema §8) — never a
 * Salesforce field name. The server loads the version's spec (the binding
 * truth), maps answers → fields, coerces by describe type, strips anything
 * the running user can't create (CRUD/FLS via Security.stripInaccessible),
 * and inserts the parent + every repeatable-section child inside ONE
 * savepoint — parent and entries are atomic (schema §8; the old build's
 * FormSubmitController proved this path).
 *
 * INTERNAL audience (with sharing + as user): the guest path arrives with
 * the hosting/guest slice as its own allow-listed controller (RUNTIME_NOTES
 * elevated-context rules) — this class never serves guests.
 */
public with sharing class FinalSubmitController {
    public class SubmitResult {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public Integer childCount;
    }

    @AuraEnabled
    public static SubmitResult submitForm(
        Id formId,
        Id versionId,
        String payloadJson
    ) {
        if (String.isBlank(payloadJson)) {
            throw new AuraHandledException('A submission payload is required.');
        }
        Map<String, Object> spec = loadSpec(formId, versionId);
        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            throw new AuraHandledException('The payload is not valid JSON.');
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

        // one walk splits parent-scope elements from repeat sections
        Map<String, Object> parentBindings = new Map<String, Object>(); // field → raw answer
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
            List<SObject> stripped = Security.stripInaccessible(
                    AccessType.CREATABLE,
                    new List<SObject>{ parent }
                )
                .getRecords();
            insert as user stripped;
            Id parentId = stripped[0].Id;

            Integer childCount = 0;
            for (RepeatPlan plan : repeatPlans) {
                childCount += insertEntries(plan, repeats, parentId);
            }

            SubmitResult res = new SubmitResult();
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
        Id parentId
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
            SObject child = buildRecord(childType, bindings);
            children.add(child);
        }
        if (children.isEmpty()) {
            return 0;
        }
        // FLS first, then the linking field (schema §6: the linking field is
        // config, never an authored element — stripping must not eat it)
        List<SObject> stripped = Security.stripInaccessible(
                AccessType.CREATABLE,
                children
            )
            .getRecords();
        for (SObject child : stripped) {
            child.put(plan.relationshipField, parentId);
        }
        insert as user stripped;
        return stripped.size();
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

    /** The submitted version's spec: explicit version, else the ACTIVE one. */
    private static Map<String, Object> loadSpec(Id formId, Id versionId) {
        List<Form_Version__c> versions;
        if (versionId != null) {
            versions = [
                SELECT Spec_JSON__c
                FROM Form_Version__c
                WHERE Id = :versionId
                WITH USER_MODE
                LIMIT 1
            ];
        } else if (formId != null) {
            versions = [
                SELECT Spec_JSON__c
                FROM Form_Version__c
                WHERE Form__c = :formId AND Is_Active__c = TRUE
                WITH USER_MODE
                ORDER BY Version_Number__c DESC
                LIMIT 1
            ];
        } else {
            throw new AuraHandledException('A form or version Id is required.');
        }
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(
                'This form has no published version to submit to.'
            );
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(
                versions[0].Spec_JSON__c
            );
        } catch (Exception e) {
            throw new AuraHandledException(
                'The form specification could not be read.'
            );
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
