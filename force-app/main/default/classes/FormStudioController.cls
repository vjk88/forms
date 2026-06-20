public with sharing class FormStudioController {

    public class OptionDTO implements Comparable {
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String value;

        public OptionDTO(String l, String v) {
            this.label = l;
            this.value = v;
        }

        public Integer compareTo(Object other) {
            OptionDTO o = (OptionDTO) other;
            String thisLabel = (this.label == null) ? '' : this.label.toLowerCase();
            String otherLabel = (o.label == null) ? '' : o.label.toLowerCase();
            return thisLabel.compareTo(otherLabel);
        }
    }

    public class FieldDTO implements Comparable {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String type;
        @AuraEnabled
        public Boolean required;
        @AuraEnabled
        public Boolean isNameField;

        public FieldDTO(
            String apiName,
            String label,
            String type,
            Boolean required,
            Boolean isNameField
        ) {
            this.apiName = apiName;
            this.label = label;
            this.type = type;
            this.required = required;
            this.isNameField = isNameField;
        }

        public Integer compareTo(Object other) {
            FieldDTO o = (FieldDTO) other;
            String thisLabel = (this.label == null) ? '' : this.label.toLowerCase();
            String otherLabel = (o.label == null) ? '' : o.label.toLowerCase();
            return thisLabel.compareTo(otherLabel);
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Form__c> getAllForms() {
        List<Form__c> forms = [
            SELECT
                Id,
                Name,
                Primary_Context_Object__c,
                Form_Type__c,
                Layout_Mode__c,
                Submission_Storage__c,
                Allowed_Adapters__c,
                Status__c,
                (
                    SELECT
                        Id,
                        Name,
                        Version_Number__c,
                        Is_Active__c,
                        Layout_Mode__c,
                        Published_Date__c
                    FROM Form_Versions__r
                    ORDER BY Version_Number__c DESC
                )
            FROM Form__c
            WITH USER_MODE
            ORDER BY Name ASC
        ];

        // Normalize any lowercase-stored object names to proper case
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        for (Form__c f : forms) {
            if (!String.isBlank(f.Primary_Context_Object__c)) {
                Schema.SObjectType t = gd.get(f.Primary_Context_Object__c.toLowerCase());
                if (t != null) {
                    f.Primary_Context_Object__c = t.getDescribe().getName();
                }
            }
        }
        return forms;
    }

    @AuraEnabled(cacheable=true)
    public static List<Form_Version__c> getFormVersions(Id formId) {
        if (formId == null) {
            return new List<Form_Version__c>();
        }
        return [
            SELECT
                Id,
                Name,
                Version_Number__c,
                Is_Active__c,
                Layout_Mode__c,
                Published_Date__c,
                Published_By__c,
                Change_Notes__c
            FROM Form_Version__c
            WHERE Form__c = :formId
            WITH USER_MODE
            ORDER BY Version_Number__c DESC
        ];
    }

    public class RelationshipDTO implements Comparable {
        @AuraEnabled
        public String relationshipName; // child relationship API name
        @AuraEnabled
        public String childObject; // child SObject API name
        @AuraEnabled
        public String childObjectLabel;
        @AuraEnabled
        public String linkingField; // child lookup field back to the parent

        public RelationshipDTO(String rel, String childObj, String label, String linking) {
            this.relationshipName = rel;
            this.childObject = childObj;
            this.childObjectLabel = label;
            this.linkingField = linking;
        }

        public Integer compareTo(Object other) {
            RelationshipDTO o = (RelationshipDTO) other;
            String a = (this.childObjectLabel == null) ? '' : this.childObjectLabel.toLowerCase();
            String b = (o.childObjectLabel == null) ? '' : o.childObjectLabel.toLowerCase();
            return a.compareTo(b);
        }
    }

    /**
     * Child relationships of an object — the candidates for a Related List. Each
     * carries the relationship name, child object + label, and the child's lookup
     * field back to the parent (the linking field the submit engine sets).
     */
    @AuraEnabled(cacheable=true)
    public static List<RelationshipDTO> getChildRelationships(String objectApiName) {
        if (String.isBlank(objectApiName)) {
            return new List<RelationshipDTO>();
        }
        Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
        if (sObjType == null) {
            return new List<RelationshipDTO>();
        }
        List<RelationshipDTO> result = new List<RelationshipDTO>();
        for (Schema.ChildRelationship cr : sObjType.getDescribe().getChildRelationships()) {
            if (cr.getRelationshipName() == null) {
                continue;
            }
            Schema.DescribeSObjectResult childDesc = cr.getChildSObject().getDescribe();
            if (childDesc.isAccessible() && childDesc.isCreateable() && childDesc.isQueryable()) {
                result.add(
                    new RelationshipDTO(
                        cr.getRelationshipName(),
                        childDesc.getName(),
                        childDesc.getLabel(),
                        cr.getField().getDescribe().getName()
                    )
                );
            }
        }
        result.sort();
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<FieldDTO> getObjectFields(String objectApiName) {
        if (String.isBlank(objectApiName)) {
            return new List<FieldDTO>();
        }

        Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
        if (sObjType == null) {
            return new List<FieldDTO>();
        }

        Schema.DescribeSObjectResult objDesc = sObjType.getDescribe();
        Map<String, Schema.SObjectField> fieldMap = objDesc.fields.getMap();
        List<FieldDTO> result = new List<FieldDTO>();

        Set<Schema.DisplayType> supported = new Set<Schema.DisplayType>{
            Schema.DisplayType.String,
            Schema.DisplayType.TextArea,
            Schema.DisplayType.Phone,
            Schema.DisplayType.Email,
            Schema.DisplayType.Url,
            Schema.DisplayType.Boolean,
            Schema.DisplayType.Currency,
            Schema.DisplayType.Double,
            Schema.DisplayType.Integer,
            Schema.DisplayType.Date,
            Schema.DisplayType.DateTime,
            Schema.DisplayType.Picklist,
            Schema.DisplayType.MultiPicklist,
            Schema.DisplayType.Reference,
            Schema.DisplayType.Percent
        };

        for (String fname : fieldMap.keySet()) {
            Schema.DescribeFieldResult fd = fieldMap.get(fname).getDescribe();
            if (
                fd.isAccessible() &&
                supported.contains(fd.getType()) &&
                !isSystemField(fd)
            ) {
                result.add(
                    new FieldDTO(
                        fd.getName(),
                        fd.getLabel(),
                        fd.getType().name(),
                        !fd.isNillable() && fd.isCreateable(),
                        fd.isNameField()
                    )
                );
            }
        }

        result.sort();
        return result;
    }

    private static Boolean isSystemField(Schema.DescribeFieldResult fd) {
        String n = fd.getName().toLowerCase();
        return n == 'isdeleted' || n == 'systemmodstamp';
    }

    // ======================= AUTOFILL (editor describe) =======================
    // A lookup field on the form's object → the record it points to is an autofill
    // SOURCE. Carries the lookup field + the object it targets (the child lazily
    // loads that object's fields via getObjectFields for the mapping picker).
    public class LookupTargetDTO implements Comparable {
        @AuraEnabled public String lookupField;   // Reference field API on the form object
        @AuraEnabled public String targetObject;  // object it points to
        @AuraEnabled public String targetLabel;   // lookup field label (what the user sees)

        public LookupTargetDTO(String lookupField, String targetObject, String targetLabel) {
            this.lookupField = lookupField;
            this.targetObject = targetObject;
            this.targetLabel = targetLabel;
        }
        public Integer compareTo(Object other) {
            LookupTargetDTO o = (LookupTargetDTO) other;
            String a = (this.targetLabel == null) ? '' : this.targetLabel.toLowerCase();
            String b = (o.targetLabel == null) ? '' : o.targetLabel.toLowerCase();
            return a.compareTo(b);
        }
    }

    /**
     * Lookup (Reference) fields on the form's object, each resolved to the single
     * object it targets — the candidate "From a lookup on the form" autofill
     * sources. Polymorphic lookups (Owner/What/Who) are skipped: no single source
     * object to map from. Only accessible fields whose target is queryable.
     */
    @AuraEnabled(cacheable=true)
    public static List<LookupTargetDTO> getLookupTargets(String objectApiName) {
        List<LookupTargetDTO> result = new List<LookupTargetDTO>();
        if (String.isBlank(objectApiName)) {
            return result;
        }
        Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName.toLowerCase());
        if (sObjType == null) {
            return result;
        }
        for (Schema.SObjectField fld : sObjType.getDescribe().fields.getMap().values()) {
            Schema.DescribeFieldResult fd = fld.getDescribe();
            if (fd.getType() != Schema.DisplayType.Reference || !fd.isAccessible()) {
                continue;
            }
            List<Schema.SObjectType> refs = fd.getReferenceTo();
            if (refs == null || refs.size() != 1) {
                continue; // polymorphic / none → no single source object
            }
            Schema.DescribeSObjectResult target = refs[0].getDescribe();
            if (!target.isAccessible() || !target.isQueryable()) {
                continue;
            }
            result.add(new LookupTargetDTO(fd.getName(), target.getName(), fd.getLabel()));
        }
        result.sort();
        return result;
    }

    /**
     * Accessible, queryable objects in the org — the source-object picker for a
     * "From a URL parameter" autofill rule. Excludes non-queryable, custom
     * settings, and obvious noise (share/history/feed/changeevent/tag).
     */
    @AuraEnabled(cacheable=true)
    public static List<OptionDTO> listObjects() {
        List<OptionDTO> result = new List<OptionDTO>();
        for (Schema.SObjectType t : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult d = t.getDescribe();
            if (!d.isAccessible() || !d.isQueryable() || d.isCustomSetting() || d.isDeprecatedAndHidden()) {
                continue;
            }
            String api = d.getName().toLowerCase();
            if (api.endsWith('__share') || api.endsWith('__history') ||
                api.endsWith('__feed') || api.endsWith('__changeevent') ||
                api.endsWith('__tag') || api.endsWith('__mdt')) {
                continue;
            }
            result.add(new OptionDTO(d.getLabel() + ' (' + d.getName() + ')', d.getName()));
        }
        result.sort();
        return result;
    }

    @AuraEnabled(cacheable=false)
    public static String getFormLayout(Id versionId) {
        if (versionId == null) {
            return null;
        }
        List<Form_Version__c> versions = [
            SELECT Layout_Config__c
            FROM Form_Version__c
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        return versions.isEmpty() ? null : versions[0].Layout_Config__c;
    }

    // =====================================================================
    // SAVE / PUBLISH lifecycle
    // ---------------------------------------------------------------------
    // A form's layout lives on Form_Version__c: Layout_Config__c (the body JSON
    // c/formStudio serializes) + Layout_Spec__c (the materialized layout spec the
    // runtime renders) + Layout_Mode__c. Published versions are read-only; edits
    // happen on a DRAFT version. Publishing flips Is_Active__c — a single-active-
    // version trigger (FormVersionTriggerHandler) deactivates the others. The new
    // runtime (FormViewerController) serves the active version's config + spec.
    // =====================================================================

    public class DraftResult {
        @AuraEnabled
        public Id versionId;
        @AuraEnabled
        public Decimal versionNumber;
    }

    /**
     * Clone the active version into a new editable draft (Version_Number = max+1).
     * If the form has no active version yet, creates an empty v1 draft. Returns
     * the new draft so the studio can switch to it.
     */
    @AuraEnabled
    public static DraftResult createDraftFromActive(Id formId) {
        if (formId == null) {
            throw new AuraHandledException('Form Id is required.');
        }
        List<Form_Version__c> active = [
            SELECT Id, Layout_Config__c, Layout_Spec__c, Layout_Mode__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            WITH USER_MODE
            LIMIT 1
        ];
        AggregateResult ar = [
            SELECT MAX(Version_Number__c) maxVer
            FROM Form_Version__c
            WHERE Form__c = :formId
            WITH USER_MODE
        ];
        Decimal nextVersion = (ar.get('maxVer') == null)
            ? 1
            : ((Decimal) ar.get('maxVer')) + 1;

        Form_Version__c draft = new Form_Version__c(
            Form__c = formId,
            Version_Number__c = nextVersion,
            Is_Active__c = false,
            // Published_Date__c is a required field; stamp it at creation (a
            // "created at" proxy for a draft). publishVersion overwrites it on publish.
            Published_Date__c = System.now()
        );
        if (!active.isEmpty()) {
            draft.Layout_Config__c = active[0].Layout_Config__c;
            draft.Layout_Spec__c = active[0].Layout_Spec__c;
            draft.Layout_Mode__c = active[0].Layout_Mode__c;
        }
        try {
            insert as user draft;
        } catch (Exception e) {
            throw new AuraHandledException('Error creating draft: ' + e.getMessage());
        }
        DraftResult res = new DraftResult();
        res.versionId = draft.Id;
        res.versionNumber = nextVersion;
        return res;
    }

    /**
     * Save the working layout onto a DRAFT version. Writes both the body
     * (Layout_Config__c) and the materialized spec (Layout_Spec__c) the runtime
     * needs, and keeps Layout_Mode__c in sync with the body JSON. Refuses
     * published (active) versions.
     */
    @AuraEnabled
    public static void saveFormLayout(
        Id versionId,
        String layoutJson,
        String layoutSpecJson
    ) {
        if (versionId == null) {
            throw new AuraHandledException('Version Id is required.');
        }
        List<Form_Version__c> versions = [
            SELECT Id, Is_Active__c
            FROM Form_Version__c
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (versions.isEmpty()) {
            throw new AuraHandledException('Version not found.');
        }
        if (versions[0].Is_Active__c) {
            throw new AuraHandledException(
                'Published versions are read-only. Create a new draft to edit.'
            );
        }

        versions[0].Layout_Config__c = layoutJson;
        versions[0].Layout_Spec__c = layoutSpecJson;

        // Keep Layout_Mode__c in sync with the nav style stored in the body JSON.
        try {
            Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
                layoutJson
            );
            Object lm = parsed.get('layoutMode');
            if (lm != null && String.isNotBlank(String.valueOf(lm))) {
                versions[0].Layout_Mode__c = String.valueOf(lm);
            }
        } catch (Exception ignored) {
            // Body JSON without a parseable mode leaves the field unchanged.
        }

        try {
            update as user versions[0];
        } catch (Exception e) {
            throw new AuraHandledException('Error saving form: ' + e.getMessage());
        }
    }

    /**
     * Publish a draft: flip Is_Active__c (the single-active-version trigger
     * deactivates the rest), stamp audit fields, and mirror the layout + schema
     * snapshot onto the Form (Status='Published') to satisfy the publish VRs and
     * give the runtime a live read off the Form too.
     */
    @AuraEnabled
    public static void publishVersion(Id versionId) {
        if (versionId == null) {
            throw new AuraHandledException('Version Id is required.');
        }
        List<Form_Version__c> versions = [
            SELECT Id, Is_Active__c, Form__c, Layout_Config__c, Schema_Snapshot__c
            FROM Form_Version__c
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (versions.isEmpty()) {
            throw new AuraHandledException('Version not found.');
        }
        Form_Version__c version = versions[0];
        if (version.Is_Active__c) {
            throw new AuraHandledException('This version is already published.');
        }
        if (String.isBlank(version.Layout_Config__c)) {
            throw new AuraHandledException('Save form content before publishing.');
        }

        List<Form__c> forms = [
            SELECT Id, Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :version.Form__c
            WITH USER_MODE
            LIMIT 1
        ];
        String objectApi = forms.isEmpty()
            ? null
            : forms[0].Primary_Context_Object__c;
        String snapshot = String.isNotBlank(version.Schema_Snapshot__c)
            ? version.Schema_Snapshot__c
            : buildSchemaSnapshot(objectApi, version.Layout_Config__c);

        version.Is_Active__c = true;
        version.Published_Date__c = System.now();
        version.Published_By__c = UserInfo.getUserId();
        version.Schema_Snapshot__c = snapshot;

        Form__c form = new Form__c(
            Id = version.Form__c,
            Status__c = 'Published',
            Published_Date__c = System.now(),
            Layout_Config__c = version.Layout_Config__c,
            Schema_Snapshot__c = snapshot
        );

        // Status/audit flip on app-managed fields — system mode (same approach as
        // the single-active-version trigger), gated by with sharing + the
        // AuraEnabled entry point. The running user may not hold FLS on these.
        Savepoint sp = Database.setSavepoint();
        try {
            update as system version;
            update as system form;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Error publishing: ' + e.getMessage());
        }
    }

    /**
     * Discard a draft version entirely (revert to the published version). Refuses
     * active/published versions — those are never deletable from the builder.
     */
    @AuraEnabled
    public static void deleteDraftVersion(Id versionId) {
        if (versionId == null) {
            throw new AuraHandledException('Version Id is required.');
        }
        List<Form_Version__c> versions = [
            SELECT Id, Is_Active__c
            FROM Form_Version__c
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (versions.isEmpty()) {
            throw new AuraHandledException('Version not found.');
        }
        if (versions[0].Is_Active__c) {
            throw new AuraHandledException('Published versions cannot be deleted.');
        }
        try {
            delete as user versions[0];
        } catch (Exception e) {
            throw new AuraHandledException('Error discarding draft: ' + e.getMessage());
        }
    }

    /**
     * Schema snapshot for a published form: primary object + describe metadata of
     * every field used in the layout. Lets the runtime render against a frozen
     * schema and satisfies the publish-time integrity rules.
     */
    private static String buildSchemaSnapshot(
        String objectApiName,
        String layoutJson
    ) {
        Map<String, Object> snap = new Map<String, Object>{
            'object' => objectApiName,
            'capturedAt' => String.valueOf(System.now())
        };
        Set<String> fieldApis = new Set<String>();
        try {
            Map<String, Object> layout = (Map<String, Object>) JSON.deserializeUntyped(
                layoutJson
            );
            Object pages = layout.get('pages');
            if (pages instanceof List<Object>) {
                for (Object po : (List<Object>) pages) {
                    Map<String, Object> page = (Map<String, Object>) po;
                    collectFieldApis(page.get('sections'), fieldApis);
                }
            }
        } catch (Exception ignored) {
            // Unparseable layout still yields a valid (object-only) snapshot.
        }

        Map<String, Object> fieldsMap = new Map<String, Object>();
        if (String.isNotBlank(objectApiName)) {
            Schema.SObjectType t = Schema.getGlobalDescribe()
                .get(objectApiName.toLowerCase());
            if (t != null) {
                Map<String, Schema.SObjectField> fm = t.getDescribe()
                    .fields.getMap();
                for (String f : fieldApis) {
                    Schema.SObjectField sf = fm.get(f.toLowerCase());
                    if (sf == null) {
                        continue;
                    }
                    Schema.DescribeFieldResult d = sf.getDescribe();
                    List<String> refs = new List<String>();
                    for (Schema.SObjectType rt : d.getReferenceTo()) {
                        refs.add(rt.getDescribe().getName());
                    }
                    fieldsMap.put(
                        d.getName(),
                        new Map<String, Object>{
                            'label' => d.getLabel(),
                            'type' => d.getType().name(),
                            'required' => !d.isNillable(),
                            'createable' => d.isCreateable(),
                            'updateable' => d.isUpdateable(),
                            'referenceTo' => refs
                        }
                    );
                }
            }
        }
        snap.put('fields', fieldsMap);
        return JSON.serialize(snap);
    }

    private static void collectFieldApis(Object sectionsObj, Set<String> out) {
        if (!(sectionsObj instanceof List<Object>)) {
            return;
        }
        for (Object so : (List<Object>) sectionsObj) {
            Map<String, Object> section = (Map<String, Object>) so;
            Object elements = section.get('elements');
            if (elements instanceof List<Object>) {
                for (Object eo : (List<Object>) elements) {
                    Map<String, Object> el = (Map<String, Object>) eo;
                    String type = (String) el.get('type');
                    String fapi = (String) el.get('fieldApiName');
                    if (String.isNotBlank(fapi) && (type == null || type == 'Field')) {
                        out.add(fapi);
                    }
                }
            }
            collectFieldApis(section.get('relatedSections'), out);
        }
    }
}
