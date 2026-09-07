/**
 * FinalAutofillController — Authenticated respondent and builder API for Autofill Rules (IMPL_PLAN_AUTOFILL_RULES §5).
 *
 * - describeSourceFields: Author-only read-only source field picker (accessible fields).
 * - getLookupPlan: Authenticated respondent metadata plan for lookups & lookup autofill rules.
 * - resolveLinkForUser: Authenticated respondent token verification & link autofill rule read plan.
 *
 * Enforces:
 * - Rejects guest callers on all methods (UserInfo.getUserType() == 'Guest').
 * - Active published version identity verification.
 * - SObject describe and FLS filtering.
 */
public with sharing class FinalAutofillController {
    private static final String UNAVAILABLE = 'This form is not available.';

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> describeSourceFields(
        Id formId,
        String objectApiName
    ) {
        gateNotGuest();
        return FinalStudioController.describeSourceFields(
            formId,
            objectApiName
        );
    }

    @AuraEnabled
    public static Map<String, Object> getTestRecordValues(
        Id formId,
        String objectApiName,
        Id recordId,
        List<String> fieldApiNames
    ) {
        gateNotGuest();
        if (
            String.isBlank(objectApiName) ||
            recordId == null ||
            fieldApiNames == null ||
            fieldApiNames.isEmpty()
        ) {
            return new Map<String, Object>();
        }
        if (formId != null) {
            List<Form__c> forms = [
                SELECT Id
                FROM Form__c
                WHERE Id = :formId
                WITH USER_MODE
                LIMIT 1
            ];
            if (forms.isEmpty()) {
                throw new AuraHandledException('FORM_NOT_FOUND');
            }
        }
        Schema.SObjectType sType = Schema.getGlobalDescribe()
            .get(objectApiName.toLowerCase());
        if (sType == null || !sType.getDescribe().isAccessible()) {
            throw new AuraHandledException(
                'You do not have access to ' + objectApiName
            );
        }
        Map<String, Schema.SObjectField> fieldMap = sType.getDescribe()
            .fields.getMap();
        List<String> validFields = new List<String>();
        for (String fName : fieldApiNames) {
            Schema.SObjectField f = fieldMap.get(fName.toLowerCase());
            if (f != null && f.getDescribe().isAccessible()) {
                validFields.add(f.getDescribe().getName());
            }
        }
        if (validFields.isEmpty()) {
            return new Map<String, Object>();
        }
        String soql =
            'SELECT ' +
            String.join(validFields, ', ') +
            ' FROM ' +
            String.escapeSingleQuotes(sType.getDescribe().getName()) +
            ' WHERE Id = :recordId WITH USER_MODE LIMIT 1';
        List<SObject> records = Database.query(soql);
        if (records.isEmpty()) {
            return new Map<String, Object>();
        }
        SObject rec = records[0];
        Map<String, Object> result = new Map<String, Object>();
        for (String fName : validFields) {
            result.put(fName, rec.get(fName));
        }
        return result;
    }

    @AuraEnabled
    public static Map<String, Object> getLookupPlan(Id formId, Id versionId) {
        gateNotGuest();
        if (formId == null || versionId == null) {
            throw new AuraHandledException(
                'Form Id and Version Id are required.'
            );
        }

        Form_Version__c version = loadActivePublishedVersion(formId, versionId);
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );

        String formTargetObject = getFormTargetObject(spec);
        Map<String, String> lookupObjectsByElementId = new Map<String, String>();
        List<Map<String, Object>> lookupDescriptors = new List<Map<String, Object>>();

        // Inspect elements to find reference/lookup fields
        inspectLookups(
            spec,
            formTargetObject,
            lookupObjectsByElementId,
            lookupDescriptors
        );

        // Inspect autofillRules for lookup rules
        List<Map<String, Object>> rulePlans = new List<Map<String, Object>>();
        Map<String, Object> settings = asMap(spec.get('settings'));
        Map<String, Object> prefill = settings != null
            ? asMap(settings.get('prefill'))
            : null;
        List<Object> rules = prefill != null
            ? asList(prefill.get('autofillRules'))
            : null;

        if (rules != null) {
            for (Object rObj : rules) {
                Map<String, Object> rule = asMap(rObj);
                if (rule == null || rule.get('enabled') != true)
                    continue;
                Map<String, Object> source = asMap(rule.get('source'));
                if (source != null && (String) source.get('type') == 'lookup') {
                    String elId = (String) source.get('elementId');
                    String sObj = lookupObjectsByElementId.get(elId);
                    if (String.isNotBlank(sObj)) {
                        List<Map<String, Object>> mappings = extractAccessibleMappings(
                            rule,
                            sObj
                        );
                        rulePlans.add(
                            new Map<String, Object>{
                                'ruleId' => (String) rule.get('id'),
                                'sourceElementId' => elId,
                                'objectApiName' => sObj,
                                'policy' => rule.get('policy') != null
                                    ? (String) rule.get('policy')
                                    : 'preserveEdits',
                                'mappings' => mappings
                            }
                        );
                    }
                }
            }
        }

        return new Map<String, Object>{
            'versionId' => version.Id,
            'lookups' => lookupDescriptors,
            'rules' => rulePlans
        };
    }

    @AuraEnabled
    public static Map<String, Object> resolveLinkForUser(
        Id formId,
        Id versionId,
        String token
    ) {
        gateNotGuest();
        if (formId == null || versionId == null || String.isBlank(token)) {
            throw new AuraHandledException(
                'Form Id, Version Id, and Token are required.'
            );
        }

        Form_Version__c version = loadActivePublishedVersion(formId, versionId);
        FinalAutofillService.LinkSourceContract contract = FinalAutofillService.resolveLinkSource(
            formId
        );

        String targetObject = contract.objectApiName;
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(targetObject.toLowerCase());
        if (t == null) {
            throw new AuraHandledException(UNAVAILABLE);
        }

        FinalSurveyTokenService.Claims c = FinalSurveyTokenService.resolve(
            token
        );
        if (c == null || c.formId != formId) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        Long now = Datetime.now().getTime();
        if (c.expiry != null && c.expiry < now) {
            throw new AuraHandledException(UNAVAILABLE);
        }

        // Kill switch cutoff
        List<Form__c> forms = [
            SELECT Links_Invalidated_On__c
            FROM Form__c
            WHERE Id = :formId
            LIMIT 1
        ];
        if (!forms.isEmpty() && forms[0].Links_Invalidated_On__c != null) {
            Long cutoff = forms[0].Links_Invalidated_On__c.getTime();
            if (c.issuedAt == null || c.issuedAt <= cutoff) {
                throw new AuraHandledException(UNAVAILABLE);
            }
        }

        if (c.recordId == null || c.recordId.getSObjectType() != t) {
            throw new AuraHandledException(UNAVAILABLE);
        }

        // Tracked invitation check if applicable
        if (c.invitationId != null) {
            List<Survey_Invitation__c> invRows = [
                SELECT
                    Id,
                    Form__c,
                    Record_Id__c,
                    Revoked__c,
                    Single_Use__c,
                    Expires_On__c,
                    Responded_On__c
                FROM Survey_Invitation__c
                WHERE Id = :c.invitationId
                LIMIT 1
            ];
            if (
                invRows.isEmpty() ||
                invRows[0].Revoked__c == true ||
                invRows[0].Form__c != formId ||
                invRows[0].Record_Id__c != String.valueOf(c.recordId) ||
                (invRows[0].Expires_On__c != null &&
                invRows[0].Expires_On__c < Datetime.now()) ||
                (invRows[0].Single_Use__c == true &&
                invRows[0].Responded_On__c != null)
            ) {
                throw new AuraHandledException(UNAVAILABLE);
            }
        }

        // Extract mappings from published spec
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        Map<String, Object> settings = asMap(spec.get('settings'));
        Map<String, Object> prefill = settings != null
            ? asMap(settings.get('prefill'))
            : null;
        List<Object> rules = prefill != null
            ? asList(prefill.get('autofillRules'))
            : null;

        Map<String, Object> linkRule = null;
        if (rules != null) {
            for (Object rObj : rules) {
                Map<String, Object> r = asMap(rObj);
                if (
                    r != null &&
                    r.get('enabled') == true &&
                    (String) r.get('id') == contract.ruleId
                ) {
                    linkRule = r;
                    break;
                }
            }
        }

        List<Map<String, Object>> mappings = linkRule != null
            ? extractAccessibleMappings(linkRule, targetObject)
            : new List<Map<String, Object>>();

        return new Map<String, Object>{
            'versionId' => version.Id,
            'rule' => new Map<String, Object>{
                'ruleId' => contract.ruleId,
                'recordId' => c.recordId,
                'objectApiName' => targetObject,
                'policy' => linkRule != null &&
                    linkRule.get('policy') != null
                    ? (String) linkRule.get('policy')
                    : 'preserveEdits',
                'mappings' => mappings
            }
        };
    }

    private static void gateNotGuest() {
        if (UserInfo.getUserType() == 'Guest') {
            throw new AuraHandledException('Unauthorized');
        }
    }

    private static Form_Version__c loadActivePublishedVersion(
        Id formId,
        Id versionId
    ) {
        List<Form__c> forms = [
            SELECT Id, Status__c, Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            LIMIT 1
        ];
        if (forms.isEmpty() || forms[0].Status__c != 'Published') {
            throw new AuraHandledException(UNAVAILABLE);
        }

        List<Form_Version__c> versions = [
            SELECT Id, Spec_JSON__c, Is_Active__c
            FROM Form_Version__c
            WHERE Id = :versionId AND Form__c = :formId AND Is_Active__c = TRUE
            LIMIT 1
        ];
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        return versions[0];
    }

    private static String getFormTargetObject(Map<String, Object> spec) {
        Map<String, Object> form = asMap(spec.get('form'));
        if (form == null)
            return null;
        String s = (String) form.get('targetObject');
        return String.isNotBlank(s) ? s : null;
    }

    private static void inspectLookups(
        Map<String, Object> spec,
        String formTargetObject,
        Map<String, String> lookupObjectsByElementId,
        List<Map<String, Object>> lookupDescriptors
    ) {
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null)
                continue;
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null)
                    continue;
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null)
                        continue;
                    String elId = (String) el.get('id');
                    Map<String, Object> config = asMap(el.get('config'));
                    String inputType = config != null
                        ? (String) config.get('inputType')
                        : null;
                    if (inputType != 'reference')
                        continue;

                    // R5 — a Final binding is an OBJECT ({object, field}), not a
                    // String. The previous `(String) el.get('binding')` cast threw
                    // TypeException on EVERY normally bound element, lookup or
                    // not, so getLookupPlan could not survive a real published
                    // spec. A bare String is still honoured for simple specs.
                    String bindObject = bindingObject(
                        el.get('binding'),
                        formTargetObject
                    );
                    String bindField = bindingField(el.get('binding'));
                    if (
                        String.isBlank(bindObject) || String.isBlank(bindField)
                    ) {
                        continue;
                    }

                    Map<String, Schema.SObjectField> fieldMap = fieldsOf(
                        bindObject
                    );
                    if (fieldMap == null)
                        continue;
                    Schema.SObjectField f = fieldMap.get(
                        bindField.toLowerCase()
                    );
                    if (f == null)
                        continue;

                    Schema.DescribeFieldResult fd = f.getDescribe();
                    if (
                        !fd.isAccessible() ||
                        fd.getType() != Schema.DisplayType.REFERENCE
                    ) {
                        continue;
                    }

                    // Single-target only (§5): a polymorphic lookup has no one
                    // object for LDS to read through. The target comes from
                    // Describe, never from a client-authored `referenceTo`.
                    List<Schema.SObjectType> refToList = fd.getReferenceTo();
                    if (refToList == null || refToList.size() != 1)
                        continue;

                    String refName = refToList[0].getDescribe().getName();
                    lookupObjectsByElementId.put(elId, refName);
                    lookupDescriptors.add(
                        new Map<String, Object>{
                            'elementId' => elId,
                            'objectApiName' => refName
                        }
                    );
                }
            }
        }
    }

    private static List<Map<String, Object>> extractAccessibleMappings(
        Map<String, Object> rule,
        String objectApiName
    ) {
        List<Map<String, Object>> mappings = new List<Map<String, Object>>();
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(objectApiName.toLowerCase());
        if (t == null || !t.getDescribe().isAccessible()) {
            return mappings;
        }
        Map<String, Schema.SObjectField> fieldMap = t.getDescribe()
            .fields.getMap();

        for (Object mObj : asList(rule.get('mappings'))) {
            Map<String, Object> m = asMap(mObj);
            if (m == null)
                continue;
            String fromField = (String) m.get('from');
            String toEl = (String) m.get('to');
            if (String.isNotBlank(fromField) && String.isNotBlank(toEl)) {
                Schema.SObjectField f = fieldMap.get(fromField.toLowerCase());
                if (f != null && f.getDescribe().isAccessible()) {
                    mappings.add(
                        new Map<String, Object>{
                            'from' => f.getDescribe().getName(),
                            'to' => toEl
                        }
                    );
                }
            }
        }
        return mappings;
    }

    private static Map<String, Object> asMap(Object obj) {
        return obj instanceof Map<String, Object>
            ? (Map<String, Object>) obj
            : null;
    }

    /**
     * Binding-shape helpers (R5). A Final element binding is
     * `{ object: 'Case', field: 'AccountId' }`. Some simple/older specs carry a
     * bare field-name String, which implicitly belongs to the form's target
     * object. Anything else yields null and the caller skips the element —
     * never a hard cast, which is what broke getLookupPlan.
     */
    private static String bindingObject(Object binding, String fallbackObject) {
        Map<String, Object> b = asMap(binding);
        if (b != null) {
            String o = (String) b.get('object');
            return String.isNotBlank(o) ? o : fallbackObject;
        }
        if (binding instanceof String && String.isNotBlank((String) binding)) {
            return fallbackObject;
        }
        return null;
    }

    private static String bindingField(Object binding) {
        Map<String, Object> b = asMap(binding);
        if (b != null) {
            return (String) b.get('field');
        }
        return binding instanceof String ? (String) binding : null;
    }

    /** Describe field map for an object, memoised for the transaction. */
    private static Map<String, Map<String, Schema.SObjectField>> fieldMapCache = new Map<String, Map<String, Schema.SObjectField>>();

    private static Map<String, Schema.SObjectField> fieldsOf(
        String objectApiName
    ) {
        if (String.isBlank(objectApiName)) {
            return null;
        }
        String key = objectApiName.toLowerCase();
        if (fieldMapCache.containsKey(key)) {
            return fieldMapCache.get(key);
        }
        Map<String, Schema.SObjectField> result = null;
        Schema.SObjectType t = Schema.getGlobalDescribe().get(key);
        if (t != null && t.getDescribe().isAccessible()) {
            result = t.getDescribe().fields.getMap();
        }
        fieldMapCache.put(key, result);
        return result;
    }

    private static List<Object> asList(Object obj) {
        return obj instanceof List<Object>
            ? (List<Object>) obj
            : new List<Object>();
    }
}
