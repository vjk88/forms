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
                SELECT Id, Name, Primary_Context_Object__c
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
                // record-level fallback: pre-creation-controller specs may
                // lack form.targetObject; the palette needs SOME object
                'objectApi' => forms[0].Primary_Context_Object__c,
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

    /** One row of the top-bar versions dropdown. */
    public class VersionEntry {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public Integer versionNumber;
        @AuraEnabled
        public Boolean isActive;
        @AuraEnabled
        public Boolean isDraft;
    }

    /**
     * Version picker data: every version newest first, the draft flagged by
     * the same convention loadStudio uses (single inactive above the active).
     */
    @AuraEnabled
    public static List<VersionEntry> listVersions(Id formId) {
        if (formId == null) {
            throw new AuraHandledException('A form Id is required.');
        }
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
            List<VersionEntry> out = new List<VersionEntry>();
            for (Form_Version__c v : versions) {
                VersionEntry entry = new VersionEntry();
                entry.id = v.Id;
                entry.versionNumber = v.Version_Number__c == null
                    ? null
                    : v.Version_Number__c.intValue();
                entry.isActive = v.Is_Active__c;
                entry.isDraft = draft != null && v.Id == draft.Id;
                out.add(entry);
            }
            return out;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Versions could not be listed.');
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
                WHERE Id = :draftVersionId AND Is_Active__c = FALSE
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

    /**
     * Palette data (P3 canvas): the target object's createable fields, mapped
     * to the spec's inputType vocabulary. Describe respects the running
     * user's FLS via isAccessible/isCreateable. Reference/compound/system
     * fields are excluded — lookups and files become widgets in P4.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> describeFields(String objectApi) {
        if (String.isBlank(objectApi)) {
            throw new AuraHandledException('An object API name is required.');
        }
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApi);
        if (t == null) {
            throw new AuraHandledException('Unknown object: ' + objectApi);
        }
        Schema.DescribeSObjectResult d = t.getDescribe();
        if (!d.isAccessible() || !d.isCreateable()) {
            throw new AuraHandledException(
                'You do not have access to ' + objectApi + '.'
            );
        }
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Schema.SObjectField f : d.fields.getMap().values()) {
            Schema.DescribeFieldResult fd = f.getDescribe();
            if (!fd.isAccessible() || !fd.isCreateable()) {
                continue;
            }
            String inputType = inputTypeOf(fd.getType());
            if (inputType == null) {
                continue;
            }
            Map<String, Object> row = new Map<String, Object>{
                'apiName' => fd.getName(),
                'label' => fd.getLabel(),
                'inputType' => inputType,
                // required at the DB = must be on the form (palette seeds
                // these dimmed + ADDED at creation, IA §4)
                'required' => !fd.isNillable() &&
                !fd.isDefaultedOnCreate() &&
                fd.getType() != Schema.DisplayType.BOOLEAN
            };
            if (
                fd.getType() == Schema.DisplayType.PICKLIST ||
                fd.getType() == Schema.DisplayType.MULTIPICKLIST
            ) {
                List<Map<String, String>> options = new List<Map<String, String>>();
                for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
                    if (pe.isActive()) {
                        options.add(
                            new Map<String, String>{
                                'value' => pe.getValue(),
                                'label' => pe.getLabel()
                            }
                        );
                    }
                }
                row.put('options', options);
            }
            out.add(row);
        }
        return out;
    }

    /**
     * Repeater flow (CANVAS_RULES §4): the primary object's child
     * relationships — the candidates the relationship picker offers. Each
     * carries the child object + label and the child's lookup field back to
     * the parent (repeat.relationshipField — the linking field the submit
     * engine sets, never an authored element). Describe-level access checks
     * mirror describeFields; the linking field itself must be createable or
     * the submit engine could never populate it.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> describeChildRelationships(
        String objectApi
    ) {
        if (String.isBlank(objectApi)) {
            throw new AuraHandledException('An object API name is required.');
        }
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApi);
        if (t == null) {
            throw new AuraHandledException('Unknown object: ' + objectApi);
        }
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (
            Schema.ChildRelationship cr : t.getDescribe()
                .getChildRelationships()
        ) {
            if (cr.getRelationshipName() == null) {
                continue;
            }
            Schema.DescribeSObjectResult child = cr.getChildSObject()
                .getDescribe();
            if (
                !child.isAccessible() ||
                !child.isCreateable() ||
                !child.isQueryable() ||
                child.isDeprecatedAndHidden()
            ) {
                continue;
            }
            Schema.DescribeFieldResult link = cr.getField().getDescribe();
            if (!link.isCreateable()) {
                continue;
            }
            out.add(
                new Map<String, Object>{
                    'relationshipName' => cr.getRelationshipName(),
                    'childObject' => child.getName(),
                    'childObjectLabel' => child.getLabel(),
                    'linkingField' => link.getName(),
                    'linkingFieldLabel' => link.getLabel()
                }
            );
        }
        return out;
    }

    /** DisplayType → spec inputType; null = not palette material (v1). */
    private static String inputTypeOf(Schema.DisplayType t) {
        switch on t {
            when STRING {
                return 'text';
            }
            when EMAIL {
                return 'email';
            }
            when PHONE {
                return 'phone';
            }
            when URL {
                return 'url';
            }
            when DOUBLE, INTEGER, LONG, CURRENCY, PERCENT {
                return 'number';
            }
            when DATE {
                return 'date';
            }
            when DATETIME {
                return 'datetime';
            }
            when BOOLEAN {
                return 'checkbox';
            }
            when TEXTAREA {
                return 'textarea';
            }
            when PICKLIST, MULTIPICKLIST {
                return 'picklist';
            }
            when else {
                return null;
            }
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
                hasDraft =
                    maxNumber > 0 &&
                    (activeNumber == null ||
                    maxNumber > activeNumber);
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
