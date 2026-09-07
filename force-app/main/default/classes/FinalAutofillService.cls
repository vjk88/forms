/**
 * FinalAutofillService — Core service for Autofill link resolution and disclosure tracking.
 *
 * Owned by server runtime and publish pipeline (IMPL_PLAN_AUTOFILL_RULES §7, §8).
 * - Diffing guest disclosure contracts to trigger link invalidation on republish
 * - Resolving active link source contract for both Survey and classic forms
 */
public with sharing class FinalAutofillService {
    /** Minting is refused when the minter cannot read something the link would
     *  hand out. Deliberately does NOT name the field: the minter is being told
     *  they lack access to it, so echoing it back leaks the schema detail the
     *  check exists to protect, and Flow surfaces this text per request. */
    public static final String DISCLOSURE_DENIED = 'You can\'t create a link for this form — it shares information you don\'t have permission to read.';

    public class LinkSourceContract {
        public String objectApiName;
        public String ruleId;
        public List<Map<String, Object>> mappings;
        public Boolean isSurvey;
        /** The published spec this contract came from, so a caller can run the
         *  disclosure check (R8) without re-querying the version. */
        public Map<String, Object> spec;

        public LinkSourceContract(
            String objectApiName,
            String ruleId,
            List<Map<String, Object>> mappings,
            Boolean isSurvey
        ) {
            this.objectApiName = objectApiName;
            this.ruleId = ruleId;
            this.mappings = mappings;
            this.isSurvey = isSurvey;
        }
    }

    /**
     * The fields a published guest link would ACTUALLY disclose, grouped by
     * object: the union of (a) enabled link mappings opted in with
     * `guestAllowed`, resolved through the same contract the runtime uses, and
     * (b) the existing survey guest-prefill providers.
     */
    public static Map<String, Set<String>> disclosedFieldsByObject(
        LinkSourceContract contract
    ) {
        Map<String, Set<String>> out = new Map<String, Set<String>>();
        if (contract == null) {
            return out;
        }

        if (
            String.isNotBlank(contract.objectApiName) &&
            contract.mappings != null
        ) {
            for (Map<String, Object> m : contract.mappings) {
                if (m == null || m.get('guestAllowed') != true)
                    continue;
                String fromField = (String) m.get('from');
                if (String.isNotBlank(fromField)) {
                    addDisclosedField(out, contract.objectApiName, fromField);
                }
            }
        }

        Map<String, Object> spec = contract.spec;
        String targetObj = spec == null
            ? null
            : (String) asMap(spec.get('form'))?.get('targetObject');
        if (String.isNotBlank(targetObj)) {
            try {
                Map<String, String> surveyPrefills = FinalSurveyObjectController.guestPrefillFields(
                    spec,
                    targetObj
                );
                for (String fieldName : surveyPrefills.values()) {
                    if (String.isNotBlank(fieldName)) {
                        addDisclosedField(out, targetObj, fieldName);
                    }
                }
            } catch (Exception e) {
                // Best effort if the spec is not a survey
            }
        }
        return out;
    }

    private static void addDisclosedField(
        Map<String, Set<String>> acc,
        String objectApiName,
        String field
    ) {
        if (!acc.containsKey(objectApiName)) {
            acc.put(objectApiName, new Set<String>());
        }
        acc.get(objectApiName).add(field);
    }

    /**
     * R8 — the minter must be able to READ every field the link will disclose.
     *
     * Record access alone is not enough. The guest read deliberately runs in
     * SYSTEM context once the token authorizes it, so a user who can see the
     * record but not a published sensitive field could otherwise mint a link
     * that hands that field to anyone holding the URL. Studio and Flow both
     * call this so the two entry points cannot disagree.
     *
     * Throws AuraHandledException; callers let it propagate (Studio) or convert
     * it to a per-request Flow error.
     */
    public static void assertCanDiscloseFields(LinkSourceContract contract) {
        if (!canDiscloseFields(contract)) {
            throw new AuraHandledException(DISCLOSURE_DENIED);
        }
    }

    /** Boolean form of the R8 gate. Flow needs this rather than catching the
     *  exception: AuraHandledException.getMessage() is not a dependable carrier
     *  for a per-request Flow error. */
    public static Boolean canDiscloseFields(LinkSourceContract contract) {
        Map<String, Set<String>> byObject = disclosedFieldsByObject(contract);
        for (String objName : byObject.keySet()) {
            Schema.SObjectType t = Schema.getGlobalDescribe()
                .get(objName.toLowerCase());
            if (t == null || !t.getDescribe().isAccessible()) {
                return false;
            }
            Map<String, Schema.SObjectField> fields = t.getDescribe()
                .fields.getMap();
            for (String f : byObject.get(objName)) {
                Schema.SObjectField sf = fields.get(f.toLowerCase());
                if (sf == null || !sf.getDescribe().isAccessible()) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Compares the effective guest disclosure contract between an old published spec
     * and a newly publishing spec.
     * Returns true if any guest disclosure changed (source object, added/removed/changed field mappings).
     */
    public static Boolean hasGuestDisclosureChanged(
        Map<String, Object> oldSpec,
        Map<String, Object> newSpec
    ) {
        if (oldSpec == null && newSpec == null) {
            return false;
        }
        if (oldSpec == null || newSpec == null) {
            return true;
        }

        Set<String> oldDisclosures = extractGuestDisclosures(oldSpec);
        Set<String> newDisclosures = extractGuestDisclosures(newSpec);

        return !oldDisclosures.equals(newDisclosures);
    }

    /**
     * Extracts normalized set of "object:field->destination" disclosure tokens.
     */
    public static Set<String> extractGuestDisclosures(
        Map<String, Object> spec
    ) {
        Set<String> disclosures = new Set<String>();
        if (spec == null) {
            return disclosures;
        }

        // 1. Autofill rules link disclosures
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
                if (source == null || (String) source.get('type') != 'link')
                    continue;

                String sObj = (String) source.get('objectApiName');
                if (String.isBlank(sObj))
                    continue;

                List<Object> mappings = asList(rule.get('mappings'));
                if (mappings == null)
                    continue;

                for (Object mObj : mappings) {
                    Map<String, Object> m = asMap(mObj);
                    if (m == null || m.get('guestAllowed') != true)
                        continue;
                    String fromField = (String) m.get('from');
                    String toEl = (String) m.get('to');
                    if (
                        String.isNotBlank(fromField) && String.isNotBlank(toEl)
                    ) {
                        disclosures.add(
                            sObj.toLowerCase() +
                                ':' +
                                fromField.toLowerCase() +
                                '->' +
                                toEl
                        );
                    }
                }
            }
        }

        // 2. Existing survey guest prefill fields
        String targetObj = (String) asMap(spec.get('form'))
            ?.get('targetObject');
        if (String.isNotBlank(targetObj)) {
            try {
                Map<String, String> surveyPrefills = FinalSurveyObjectController.guestPrefillFields(
                    spec,
                    targetObj
                );
                for (String elId : surveyPrefills.keySet()) {
                    String fieldName = surveyPrefills.get(elId);
                    disclosures.add(
                        'survey:' +
                            targetObj.toLowerCase() +
                            ':' +
                            fieldName.toLowerCase() +
                            '->' +
                            elId
                    );
                }
            } catch (Exception e) {
                // Best effort if spec is not survey
            }
        }

        return disclosures;
    }

    /**
     * Query-free contract resolution from an ALREADY-AUTHORIZED published spec.
     *
     * The guest runtime MUST use this one. `FinalGuestController` is
     * `without sharing`, and its gate() + activeVersion() ARE the trust check —
     * between them they have already loaded this exact active published spec in
     * system context. Re-deriving the contract through `resolveLinkSource(formId)`
     * re-queries Form__c / Form_Version__c `WITH USER_MODE` as the Guest User,
     * who deliberately has no access to authoring records, so every valid guest
     * link resolved to `unavailable` (review R2).
     *
     * Minting keeps the user-mode path below — a minter must be authorized.
     * Never widen guest access to authoring records to make a read succeed.
     *
     * Returns null when no eligible link contract exists; each caller supplies
     * its own audience-appropriate message (guests get a generic one).
     */
    public static LinkSourceContract resolveLinkSourceFromSpec(
        Map<String, Object> spec,
        String formType,
        String primaryContextObject
    ) {
        Boolean isSurvey = formType == 'Survey';
        String ruleId = null;
        String ruleObject = null;
        List<Map<String, Object>> mList = new List<Map<String, Object>>();

        Map<String, Object> settings = spec != null
            ? asMap(spec.get('settings'))
            : null;
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
                if (source == null || (String) source.get('type') != 'link')
                    continue;

                String sObj = (String) source.get('objectApiName');
                // A classic form takes its source object from the rule, so a rule
                // without one is unusable — keep looking. A survey takes it from
                // the connected object instead, so the first link rule wins.
                if (!isSurvey && String.isBlank(sObj))
                    continue;

                ruleId = (String) rule.get('id');
                ruleObject = sObj;
                for (
                    Object m : (asList(rule.get('mappings')) != null
                        ? asList(rule.get('mappings'))
                        : new List<Object>())
                ) {
                    Map<String, Object> mMap = asMap(m);
                    if (mMap != null)
                        mList.add(mMap);
                }
                break;
            }
        }

        // One token supplies one source record (§7), so a connected survey keeps
        // its primary context object. Surveys carrying NO autofill rule still
        // resolve — that is the pre-existing prefill path.
        String resolvedObject = isSurvey ? primaryContextObject : ruleObject;
        if (String.isBlank(resolvedObject)) {
            return null;
        }
        LinkSourceContract contract = new LinkSourceContract(
            resolvedObject,
            ruleId,
            mList,
            isSurvey
        );
        // Carried so minters can run the R8 disclosure check without re-reading
        // the published version.
        contract.spec = spec;
        return contract;
    }

    /**
     * Resolves the active published link source contract for a form.
     * Supports both classic forms (via active enabled link rule) and Survey forms.
     *
     * USER MODE — for minting and other authorized author paths ONLY. The guest
     * runtime must call resolveLinkSourceFromSpec with its already-gated spec.
     */
    public static LinkSourceContract resolveLinkSource(Id formId) {
        if (formId == null) {
            throw new AuraHandledException('A form Id is required.');
        }

        List<Form__c> forms = [
            SELECT Id, Form_Type__c, Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :formId
            WITH USER_MODE
            LIMIT 1
        ];
        if (forms.isEmpty()) {
            throw new AuraHandledException('FORM_NOT_FOUND');
        }

        Form__c f = forms[0];
        if (
            f.Form_Type__c == 'Survey' &&
            String.isBlank(f.Primary_Context_Object__c)
        ) {
            throw new AuraHandledException(
                'Connect an object before creating record links.'
            );
        }

        List<Form_Version__c> versions = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            WITH USER_MODE
            ORDER BY Version_Number__c DESC
            LIMIT 1
        ];

        Map<String, Object> spec = null;
        if (
            !versions.isEmpty() && String.isNotBlank(versions[0].Spec_JSON__c)
        ) {
            spec = (Map<String, Object>) JSON.deserializeUntyped(
                versions[0].Spec_JSON__c
            );
        } else if (f.Form_Type__c != 'Survey') {
            throw new AuraHandledException(
                'Publish the form before creating personalized links.'
            );
        }

        LinkSourceContract contract = resolveLinkSourceFromSpec(
            spec,
            f.Form_Type__c,
            f.Primary_Context_Object__c
        );
        if (contract == null) {
            throw new AuraHandledException(
                'This form does not have an enabled personalized link autofill rule.'
            );
        }
        return contract;
    }

    private static Map<String, Object> asMap(Object obj) {
        return obj instanceof Map<String, Object>
            ? (Map<String, Object>) obj
            : null;
    }

    private static List<Object> asList(Object obj) {
        return obj instanceof List<Object> ? (List<Object>) obj : null;
    }
}
