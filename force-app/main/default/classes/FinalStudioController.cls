/**
 * FinalStudioController — the builder's draft plumbing (BUILD_PHASES P3,
 * spec-first ruling 2026-07-08 in DATA_MODEL_DELTA §2).
 *
 * The draft is a Form_Version__c row (Is_Active__c=false) whose Spec_JSON__c
 * holds the complete working spec. Convention (no new fields): the draft is
 * the single INACTIVE version numbered ABOVE the active one — deactivated
 * older versions are history and are never touched.
 *
 * INTERNAL builders only: `with sharing` + USER_MODE everywhere. Publishing
 * stays FinalSpecController.publishSpec (the resolve-at-publish contract
 * lives there); this class only manages the working copy around it.
 */
public with sharing class FinalStudioController {
    /** Studio bootstrap: form identity + the spec to edit (draft, else active). */
    @AuraEnabled
    public static Map<String, Object> loadStudio(Id formId) {
        if (formId == null) {
            throw new AuraHandledException('A form Id is required.');
        }
        try {
            List<Form__c> forms = [
                SELECT Id, Name
                FROM Form__c
                WHERE Id = :formId
                WITH USER_MODE
                LIMIT 1
            ];
            if (forms.isEmpty()) {
                throw new AuraHandledException('FORM_NOT_FOUND');
            }
            List<Form_Version__c> versions = [
                SELECT Id, Version_Number__c, Is_Active__c, Spec_JSON__c
                FROM Form_Version__c
                WHERE Form__c = :formId
                WITH USER_MODE
                ORDER BY Version_Number__c DESC
            ];
            Form_Version__c active;
            for (Form_Version__c v : versions) {
                if (v.Is_Active__c) {
                    active = v;
                    break;
                }
            }
            Form_Version__c draft = draftOf(versions, active);
            Form_Version__c source = draft != null ? draft : active;
            if (source == null || String.isBlank(source.Spec_JSON__c)) {
                throw new AuraHandledException(
                    'This form has no specification to edit.'
                );
            }
            return new Map<String, Object>{
                'formId' => forms[0].Id,
                'name' => forms[0].Name,
                'specJson' => source.Spec_JSON__c,
                'draftVersionId' => draft != null ? (Object) draft.Id : null,
                'versionNumber' => source.Version_Number__c,
                'activeVersionNumber' => active != null
                    ? (Object) active.Version_Number__c
                    : null
            };
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be loaded.');
        }
    }

    /**
     * Autosave: update the draft row, creating it (max version + 1) on the
     * first edit. Returns the draft version Id.
     */
    @AuraEnabled
    public static Id saveDraft(Id formId, String specJson) {
        if (formId == null || String.isBlank(specJson)) {
            throw new AuraHandledException('A form Id and spec are required.');
        }
        Object parsed;
        try {
            parsed = JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw new AuraHandledException('The spec is not valid JSON.');
        }
        if (!(parsed instanceof Map<String, Object>)) {
            throw new AuraHandledException('The spec must be a JSON object.');
        }
        Savepoint sp = Database.setSavepoint();
        try {
            List<Form_Version__c> versions = [
                SELECT Id, Version_Number__c, Is_Active__c
                FROM Form_Version__c
                WHERE Form__c = :formId
                WITH USER_MODE
                ORDER BY Version_Number__c DESC
            ];
            Form_Version__c active;
            for (Form_Version__c v : versions) {
                if (v.Is_Active__c) {
                    active = v;
                    break;
                }
            }
            Form_Version__c draft = draftOf(versions, active);
            if (draft != null) {
                draft.Spec_JSON__c = specJson;
                update as user draft;
                return draft.Id;
            }
            Decimal maxNumber = versions.isEmpty()
                ? 0
                : versions[0].Version_Number__c;
            Form_Version__c fresh = new Form_Version__c(
                Form__c = formId,
                Version_Number__c = maxNumber + 1,
                Is_Active__c = false,
                Spec_JSON__c = specJson,
                Engine_Version__c = 1
            );
            insert as user fresh;
            return fresh.Id;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('The draft could not be saved.');
        }
    }

    /** Post-publish cleanup: the working copy is transient — delete it. */
    @AuraEnabled
    public static void discardDraft(Id draftVersionId) {
        if (draftVersionId == null) {
            return;
        }
        try {
            List<Form_Version__c> rows = [
                SELECT Id, Is_Active__c
                FROM Form_Version__c
                WHERE Id = :draftVersionId AND Is_Active__c = false
                WITH USER_MODE
                LIMIT 1
            ];
            if (!rows.isEmpty()) {
                delete as user rows;
            }
        } catch (Exception e) {
            // cleanup only — an orphaned inactive row below the active
            // version is inert by the draft convention
        }
    }

    /** The Forms library listing. */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> listForms() {
        try {
            List<Map<String, Object>> out = new List<Map<String, Object>>();
            for (Form__c f : [
                SELECT
                    Id,
                    Name,
                    Primary_Context_Object__c,
                    LastModifiedDate,
                    (
                        SELECT Version_Number__c, Is_Active__c
                        FROM Form_Versions__r
                        ORDER BY Version_Number__c DESC
                    )
                FROM Form__c
                WITH USER_MODE
                ORDER BY LastModifiedDate DESC
                LIMIT 200
            ]) {
                Decimal activeNumber;
                Boolean hasDraft = false;
                Decimal maxNumber = 0;
                for (Form_Version__c v : f.Form_Versions__r) {
                    if (v.Version_Number__c > maxNumber) {
                        maxNumber = v.Version_Number__c;
                    }
                    if (v.Is_Active__c && activeNumber == null) {
                        activeNumber = v.Version_Number__c;
                    }
                }
                hasDraft = maxNumber > 0 &&
                    (activeNumber == null || maxNumber > activeNumber);
                out.add(
                    new Map<String, Object>{
                        'id' => f.Id,
                        'name' => f.Name,
                        'objectApi' => f.Primary_Context_Object__c,
                        'modified' => f.LastModifiedDate,
                        'activeVersion' => activeNumber,
                        'hasDraft' => hasDraft
                    }
                );
            }
            return out;
        } catch (Exception e) {
            throw new AuraHandledException('Forms could not be listed.');
        }
    }

    /** Draft = the single inactive version numbered above the active one. */
    private static Form_Version__c draftOf(
        List<Form_Version__c> versionsDesc,
        Form_Version__c active
    ) {
        Decimal floorNumber = active != null ? active.Version_Number__c : 0;
        for (Form_Version__c v : versionsDesc) {
            if (!v.Is_Active__c && v.Version_Number__c > floorNumber) {
                return v;
            }
        }
        return null;
    }
}
