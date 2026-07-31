/**
 * FinalSurveyObjectController — the survey-object program's READ side
 * (SURVEY_OBJECT_SPEC, owner 2026-07-31): prefill mapped questions from a
 * record of the survey's optional targetObject.
 *
 * AUTHENTICATED contexts only — the guest host never calls this (guest
 * prefill waits for the signed-token program, GUEST_PREFILL_LOOKUP_SPEC).
 * Everything runs in USER MODE + stripInaccessible: the runner only ever
 * sees fields they can already read.
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
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            versions[0].Spec_JSON__c
        );
        Map<String, Object> formNode = (Map<String, Object>) spec.get('form');
        Object formType = formNode == null ? null : formNode.get('type');
        String targetObject = formNode == null
            ? null
            : (String) formNode.get('targetObject');
        if (
            !(formType instanceof String) ||
            (String) formType != 'survey' ||
            String.isBlank(targetObject)
        ) {
            throw new AuraHandledException(
                'This survey has no connected object.'
            );
        }
        if (
            recordId.getSObjectType() !=
            Schema.getGlobalDescribe().get(targetObject.toLowerCase())
        ) {
            throw new AuraHandledException(
                'That record does not belong to this survey\'s object.'
            );
        }

        // elementId → field API name, straight from the spec (never client input)
        Map<String, String> fieldByElement = mappedFields(spec, targetObject);
        if (fieldByElement.isEmpty()) {
            return new Map<String, Object>();
        }

        Set<String> fields = new Set<String>(fieldByElement.values());
        // access level rides the queryWithBinds argument — a WITH clause in
        // the string as well is a SecurityException (pick one, not both)
        String soql =
            'SELECT ' +
            String.join(new List<String>(fields), ', ') +
            ' FROM ' +
            targetObject +
            ' WHERE Id = :recordId LIMIT 1';
        List<SObject> found = Database.queryWithBinds(
            soql,
            new Map<String, Object>{ 'recordId' => recordId },
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

    /** Walk the spec for el.mapping entries targeting the survey's object. */
    public static Map<String, String> mappedFields(
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
                        obj.equalsIgnoreCase(targetObject)
                    ) {
                        out.put(elId, field);
                    }
                }
            }
        }
        return out;
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
