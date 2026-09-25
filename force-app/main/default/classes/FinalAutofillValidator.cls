/**
 * FinalAutofillValidator — Server-side validation for Autofill rules (IMPL_PLAN_AUTOFILL_RULES §9).
 *
 * Validates settings.prefill.autofillRules for draft diagnostics and publication gates:
 * - Structural and type compatibility
 * - Element existence and repeater boundaries
 * - Single link source object constraint
 * - Single-target lookup element constraint
 * - Destination collision detection (across rules and survey mappings)
 * - Guardrail limits (max 20 rules, 50 mappings, 50 distinct fields)
 */
public with sharing class FinalAutofillValidator {
    public static final Integer MAX_ENABLED_RULES = 20;
    public static final Integer MAX_ENABLED_MAPPINGS = 50;
    public static final Integer MAX_DISTINCT_FIELDS = 50;

    public class Diagnostic {
        @AuraEnabled
        public String code;
        @AuraEnabled
        public String ruleId;
        @AuraEnabled
        public String mappingId;
        @AuraEnabled
        public String message;

        public Diagnostic(
            String code,
            String ruleId,
            String mappingId,
            String message
        ) {
            this.code = code;
            this.ruleId = ruleId;
            this.mappingId = mappingId;
            this.message = message;
        }
    }

    public class AutofillValidationException extends Exception {
    }

    /**
     * Validates a specification for publication. Throws AuraHandledException on any validation failure.
     */
    public static void validateForPublish(Id formId, Map<String, Object> spec) {
        List<Diagnostic> diagnostics = validate(spec, formId);
        if (!diagnostics.isEmpty()) {
            throw new AuraHandledException(
                'Autofill validation failed: ' + diagnostics[0].message
            );
        }
    }

    /**
     * Inspects a specification and returns all validation diagnostics.
     */
    public static List<Diagnostic> validate(
        Map<String, Object> spec,
        Id formId
    ) {
        List<Diagnostic> diagnostics = new List<Diagnostic>();
        if (spec == null) {
            return diagnostics;
        }

        Map<String, Object> settings = asMap(spec.get('settings'));
        if (settings == null) {
            return diagnostics;
        }
        Map<String, Object> prefill = asMap(settings.get('prefill'));
        if (prefill == null) {
            return diagnostics;
        }
        List<Object> rawRules = asList(prefill.get('autofillRules'));
        if (rawRules == null || rawRules.isEmpty()) {
            return diagnostics;
        }

        // 1. Index elements in spec
        Map<String, Map<String, Object>> elementById = new Map<String, Map<String, Object>>();
        Map<String, Boolean> isInsideRepeater = new Map<String, Boolean>();
        Map<String, Boolean> hasSurveyPrefill = new Map<String, Boolean>();
        Boolean hasRequiredLookup = false;

        List<Object> pages = asList(spec.get('pages'));
        for (Object pObj : (pages != null ? pages : new List<Object>())) {
            Map<String, Object> page = asMap(pObj);
            if (page == null)
                continue;
            List<Object> sections = asList(page.get('sections'));
            for (
                Object sObj : (sections != null ? sections : new List<Object>())
            ) {
                Map<String, Object> sec = asMap(sObj);
                if (sec == null)
                    continue;
                Boolean inRep =
                    sec.get('repeat') != null &&
                    sec.get('repeat') != false;
                List<Object> elements = asList(sec.get('elements'));
                for (
                    Object eObj : (elements != null
                        ? elements
                        : new List<Object>())
                ) {
                    Map<String, Object> el = asMap(eObj);
                    if (el == null)
                        continue;
                    String elId = (String) el.get('id');
                    if (String.isNotBlank(elId)) {
                        elementById.put(elId, el);
                        isInsideRepeater.put(elId, inRep);

                        // Check if survey mapping with field exists
                        Map<String, Object> mapping = asMap(el.get('mapping'));
                        if (
                            mapping != null &&
                            String.isNotBlank((String) mapping.get('field'))
                        ) {
                            hasSurveyPrefill.put(elId, true);
                        }

                        // Check if required reference/lookup exists
                        Map<String, Object> cfg = asMap(el.get('config'));
                        String inputType = cfg != null
                            ? (String) cfg.get('inputType')
                            : null;
                        if (
                            inputType == 'reference' &&
                            el.get('required') == true
                        ) {
                            hasRequiredLookup = true;
                        }
                    }
                }
            }
        }

        // Check anonymous audience restriction on required lookups
        if (formId != null && hasRequiredLookup) {
            List<Form__c> forms = [
                SELECT Allowed_Adapters__c
                FROM Form__c
                WHERE Id = :formId
                WITH USER_MODE
                LIMIT 1
            ];
            if (
                !forms.isEmpty() &&
                String.isNotBlank(forms[0].Allowed_Adapters__c) &&
                forms[0].Allowed_Adapters__c.contains('Public_Guest')
            ) {
                diagnostics.add(
                    new Diagnostic(
                        'AUTOFILL_REQUIRED_LOOKUP_ANONYMOUS',
                        null,
                        null,
                        'A required lookup field cannot be published for an anonymous guest audience in this release.'
                    )
                );
            }
        }

        // 2. Form info for connected survey check
        String surveyContextObject = null;
        if (formId != null) {
            List<Form__c> forms = [
                SELECT Form_Type__c, Primary_Context_Object__c
                FROM Form__c
                WHERE Id = :formId
                WITH USER_MODE
                LIMIT 1
            ];
            if (!forms.isEmpty() && forms[0].Form_Type__c == 'Survey') {
                surveyContextObject = forms[0].Primary_Context_Object__c;
            }
        }

        Integer enabledRuleCount = 0;
        Integer enabledMappingCount = 0;
        Set<String> distinctSourceFields = new Set<String>();
        // destination element id -> the claims made on it. A claim is
        // 'rule:<id>', or 'poly:<lookupElementId>:<object>' for a rule on a
        // polymorphic lookup, so rules that can never apply together may share.
        Map<String, Set<String>> claimedDestinations = new Map<String, Set<String>>();
        Set<String> lookupSourceElements = new Set<String>();
        Integer enabledLinkRules = 0;

        for (Object rObj : rawRules) {
            Map<String, Object> rule = asMap(rObj);
            if (rule == null)
                continue;
            Boolean enabled = rule.get('enabled') == true;
            if (!enabled)
                continue;

            enabledRuleCount++;
            String ruleId = (String) rule.get('id');
            Map<String, Object> source = asMap(rule.get('source'));
            String sourceType = source != null
                ? (String) source.get('type')
                : null;

            if (sourceType != 'link' && sourceType != 'lookup') {
                diagnostics.add(
                    new Diagnostic(
                        'AUTOFILL_INVALID_SOURCE_TYPE',
                        ruleId,
                        null,
                        'Invalid source type: ' + sourceType
                    )
                );
                continue;
            }

            // Link rule checks
            String sourceObjectApi = null;
            String destinationClaimKey = 'rule:' + ruleId;
            if (sourceType == 'link') {
                enabledLinkRules++;
                if (enabledLinkRules > 1) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_MULTIPLE_LINK_RULES',
                            ruleId,
                            null,
                            'At most one link autofill rule is allowed per form.'
                        )
                    );
                }
                sourceObjectApi = (String) source.get('objectApiName');
                if (String.isBlank(sourceObjectApi)) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_MISSING_SOURCE_OBJECT',
                            ruleId,
                            null,
                            'Source object is required for link autofill rule.'
                        )
                    );
                } else if (
                    surveyContextObject != null &&
                    !sourceObjectApi.equalsIgnoreCase(surveyContextObject)
                ) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_SURVEY_SOURCE_MISMATCH',
                            ruleId,
                            null,
                            'Survey link source object must match the survey context object (' +
                                surveyContextObject +
                                ').'
                        )
                    );
                }
            } else if (sourceType == 'lookup') {
                String lookupElId = (String) source.get('elementId');
                if (String.isBlank(lookupElId)) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_MISSING_LOOKUP_ELEMENT',
                            ruleId,
                            null,
                            'Lookup element ID is required for lookup autofill rule.'
                        )
                    );
                } else {
                    // One rule per lookup, except a polymorphic lookup, which may
                    // carry one rule per object it can point at.
                    String chosenForKey = (String) source.get('objectApiName');
                    String lookupRuleKey =
                        lookupElId +
                        '|' +
                        (String.isBlank(chosenForKey)
                            ? ''
                            : chosenForKey.toLowerCase());
                    if (lookupSourceElements.contains(lookupRuleKey)) {
                        diagnostics.add(
                            new Diagnostic(
                                'AUTOFILL_DUPLICATE_LOOKUP_RULE',
                                ruleId,
                                null,
                                'Multiple autofill rules cannot be bound to the same lookup element (' +
                                    lookupElId +
                                    ').'
                            )
                        );
                    }
                    lookupSourceElements.add(lookupRuleKey);

                    Map<String, Object> lookupEl = elementById.get(lookupElId);
                    if (lookupEl == null) {
                        diagnostics.add(
                            new Diagnostic(
                                'AUTOFILL_LOOKUP_ELEMENT_NOT_FOUND',
                                ruleId,
                                null,
                                'Lookup source element does not exist: ' +
                                lookupElId
                            )
                        );
                    } else {
                        if (isInsideRepeater.get(lookupElId) == true) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_LOOKUP_IN_REPEATER',
                                    ruleId,
                                    null,
                                    'Lookup source element cannot be inside a repeating group.'
                                )
                            );
                        }
                        Map<String, Object> binding = asMap(
                            lookupEl.get('binding')
                        );
                        Map<String, Object> cfg = asMap(lookupEl.get('config'));
                        String inputType = cfg != null
                            ? (String) cfg.get('inputType')
                            : null;
                        if (
                            inputType != 'reference' &&
                            (binding == null ||
                            binding.get('referenceTo') == null)
                        ) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_INVALID_LOOKUP_BINDING',
                                    ruleId,
                                    null,
                                    'Lookup source element must be a reference field.'
                                )
                            );
                        } else if (
                            binding != null &&
                            binding.get('referenceTo') != null
                        ) {
                            sourceObjectApi = (String) binding.get(
                                'referenceTo'
                            );
                        } else if (
                            binding == null ||
                            binding.get('field') == null
                        ) {
                            // A Freeform Record lookup question: unbound, its
                            // object picked in the inspector. A BOUND lookup
                            // never reads config.referenceTo (an authoring
                            // copy); it keeps exactly today's checks.
                            Object picked = cfg == null
                                ? null
                                : cfg.get('referenceTo');
                            if (
                                picked instanceof String &&
                                String.isNotBlank((String) picked)
                            ) {
                                sourceObjectApi = (String) picked;
                            } else {
                                diagnostics.add(
                                    new Diagnostic(
                                        'AUTOFILL_LOOKUP_NO_OBJECT',
                                        ruleId,
                                        null,
                                        'That lookup question has no object yet. Pick one in its settings.'
                                    )
                                );
                            }
                        }
                        // A polymorphic lookup (Task "Related To") names ONE of
                        // its objects per rule, and the rule fires only when the
                        // chosen record is that object. Describe decides whether
                        // the named object is really a target, never the client.
                        List<Schema.SObjectType> targets = referenceTargetsOf(
                            binding
                        );
                        String chosenObject = (String) source.get(
                            'objectApiName'
                        );
                        String canonicalChosen = canonicalTarget(
                            targets,
                            chosenObject
                        );
                        if (targets != null && targets.size() > 1) {
                            if (String.isBlank(chosenObject)) {
                                diagnostics.add(
                                    new Diagnostic(
                                        'AUTOFILL_POLYMORPHIC_OBJECT_REQUIRED',
                                        ruleId,
                                        null,
                                        'Choose which object this lookup rule reads.'
                                    )
                                );
                            } else if (canonicalChosen == null) {
                                diagnostics.add(
                                    new Diagnostic(
                                        'AUTOFILL_POLYMORPHIC_OBJECT_NOT_A_TARGET',
                                        ruleId,
                                        null,
                                        chosenObject +
                                        ' is not one of the objects this lookup can point at.'
                                    )
                                );
                            } else {
                                sourceObjectApi = canonicalChosen;
                                destinationClaimKey =
                                    'poly:' +
                                    lookupElId +
                                    ':' +
                                    canonicalChosen.toLowerCase();
                            }
                        } else if (
                            String.isNotBlank(chosenObject) &&
                            targets != null &&
                            canonicalChosen == null
                        ) {
                            // The runtime prefers a rule's named object, so a wrong
                            // one on a single-target lookup would read the wrong
                            // object entirely.
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_LOOKUP_OBJECT_MISMATCH',
                                    ruleId,
                                    null,
                                    chosenObject +
                                    ' is not the object this lookup points at.'
                                )
                            );
                        }
                    }
                }
            }

            // SObject describe if object is known
            Map<String, Schema.SObjectField> sourceFieldMap = null;
            if (String.isNotBlank(sourceObjectApi)) {
                Schema.SObjectType sType = Schema.getGlobalDescribe()
                    .get(sourceObjectApi.toLowerCase());
                if (sType == null || !sType.getDescribe().isAccessible()) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_SOURCE_OBJECT_INACCESSIBLE',
                            ruleId,
                            null,
                            'Source object does not exist or is not readable: ' +
                            sourceObjectApi
                        )
                    );
                } else {
                    sourceFieldMap = sType.getDescribe().fields.getMap();
                }
            }

            // Policy validation
            String policy = (String) rule.get('policy');
            if (
                String.isNotBlank(policy) &&
                policy != 'preserveEdits' &&
                policy != 'alwaysReplace'
            ) {
                diagnostics.add(
                    new Diagnostic(
                        'AUTOFILL_INVALID_POLICY',
                        ruleId,
                        null,
                        'Invalid autofill policy: ' + policy
                    )
                );
            }

            // Mappings validation
            List<Object> mappings = asList(rule.get('mappings'));
            if (mappings == null || mappings.isEmpty()) {
                diagnostics.add(
                    new Diagnostic(
                        'AUTOFILL_EMPTY_MAPPINGS',
                        ruleId,
                        null,
                        'Enabled autofill rule has no mappings.'
                    )
                );
                continue;
            }

            for (Object mObj : mappings) {
                Map<String, Object> m = asMap(mObj);
                if (m == null)
                    continue;
                enabledMappingCount++;
                String mapId = (String) m.get('id');
                String fromField = (String) m.get('from');
                String toElement = (String) m.get('to');
                Boolean guestAllowed = m.get('guestAllowed') == true;
                // What the source field is, once known, to pair it with the
                // destination (FinalAutofillRules).
                Schema.DisplayType fromType = null;

                if (sourceType == 'lookup' && guestAllowed) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_LOOKUP_GUEST_DISCLOSURE',
                            ruleId,
                            mapId,
                            'Lookup mappings cannot be marked as guest-allowed.'
                        )
                    );
                }

                if (String.isBlank(fromField)) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_MISSING_FROM_FIELD',
                            ruleId,
                            mapId,
                            'Mapping source field is required.'
                        )
                    );
                } else {
                    distinctSourceFields.add(
                        sourceObjectApi + '.' + fromField.toLowerCase()
                    );
                    if (sourceFieldMap != null) {
                        Schema.SObjectField fld = sourceFieldMap.get(
                            fromField.toLowerCase()
                        );
                        if (fld == null || !fld.getDescribe().isAccessible()) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_SOURCE_FIELD_INACCESSIBLE',
                                    ruleId,
                                    mapId,
                                    'Source field ' +
                                        fromField +
                                        ' does not exist or is not readable on ' +
                                        sourceObjectApi
                                )
                            );
                        } else {
                            Schema.DescribeFieldResult fd = fld.getDescribe();
                            fromType = fd.getType();
                            if (!FinalAutofillRules.isReadableSource(fd)) {
                                diagnostics.add(
                                    new Diagnostic(
                                        'AUTOFILL_UNSUPPORTED_SOURCE_TYPE',
                                        ruleId,
                                        mapId,
                                        'Source field ' +
                                            fromField +
                                            ' has an unsupported type: ' +
                                            fd.getType()
                                    )
                                );
                            }
                        }
                    }
                }

                if (String.isBlank(toElement)) {
                    diagnostics.add(
                        new Diagnostic(
                            'AUTOFILL_MISSING_TO_ELEMENT',
                            ruleId,
                            mapId,
                            'Mapping destination element is required.'
                        )
                    );
                } else {
                    Set<String> priorClaims = claimedDestinations.get(
                        toElement
                    );
                    if (priorClaims == null) {
                        priorClaims = new Set<String>();
                        claimedDestinations.put(toElement, priorClaims);
                    }
                    Boolean destinationConflict = false;
                    for (String prior : priorClaims) {
                        if (!mutuallyExclusive(prior, destinationClaimKey)) {
                            destinationConflict = true;
                        }
                    }
                    if (destinationConflict) {
                        diagnostics.add(
                            new Diagnostic(
                                'AUTOFILL_DESTINATION_CONFLICT',
                                ruleId,
                                mapId,
                                'Multiple enabled autofill rules target the same element: ' +
                                toElement
                            )
                        );
                    }
                    priorClaims.add(destinationClaimKey);

                    if (hasSurveyPrefill.containsKey(toElement)) {
                        diagnostics.add(
                            new Diagnostic(
                                'AUTOFILL_DESTINATION_CONFLICT',
                                ruleId,
                                mapId,
                                'Destination element ' +
                                    toElement +
                                    ' already has an active survey prefill mapping.'
                            )
                        );
                    }

                    Map<String, Object> destEl = elementById.get(toElement);
                    if (destEl == null) {
                        diagnostics.add(
                            new Diagnostic(
                                'AUTOFILL_DESTINATION_NOT_FOUND',
                                ruleId,
                                mapId,
                                'Destination element not found: ' + toElement
                            )
                        );
                    } else {
                        String answerType = FinalAutofillRules.destinationAnswerType(
                            destEl
                        );
                        if (answerType == null) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_INCOMPATIBLE_DESTINATION',
                                    ruleId,
                                    mapId,
                                    'Autofill can’t fill ' +
                                        labelOfElement(destEl, toElement) +
                                        '. It fills text, email, phone, link, number, date and single-choice answers.'
                                )
                            );
                        } else if (
                            fromType != null &&
                            !FinalAutofillRules.fits(fromType, answerType)
                        ) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_TYPE_MISMATCH',
                                    ruleId,
                                    mapId,
                                    fromField +
                                        ' can’t fill ' +
                                        labelOfElement(destEl, toElement) +
                                        ': a ' +
                                        String.valueOf(fromType).toLowerCase() +
                                        ' field doesn’t fit a ' +
                                        answerType.toLowerCase() +
                                        ' answer.'
                                )
                            );
                        }
                        if (destEl.get('readOnly') == true) {
                            diagnostics.add(
                                new Diagnostic(
                                    'AUTOFILL_READONLY_DESTINATION',
                                    ruleId,
                                    mapId,
                                    'Destination element ' +
                                        toElement +
                                        ' is read-only.'
                                )
                            );
                        }
                    }
                }
            }
        }

        // 3. Guardrails check
        if (enabledRuleCount > MAX_ENABLED_RULES) {
            diagnostics.add(
                new Diagnostic(
                    'AUTOFILL_EXCEEDED_MAX_RULES',
                    null,
                    null,
                    'Exceeded maximum enabled autofill rules limit (' +
                        MAX_ENABLED_RULES +
                        ').'
                )
            );
        }
        if (enabledMappingCount > MAX_ENABLED_MAPPINGS) {
            diagnostics.add(
                new Diagnostic(
                    'AUTOFILL_EXCEEDED_MAX_MAPPINGS',
                    null,
                    null,
                    'Exceeded maximum enabled autofill mappings limit (' +
                        MAX_ENABLED_MAPPINGS +
                        ').'
                )
            );
        }
        if (distinctSourceFields.size() > MAX_DISTINCT_FIELDS) {
            diagnostics.add(
                new Diagnostic(
                    'AUTOFILL_EXCEEDED_MAX_FIELDS',
                    null,
                    null,
                    'Exceeded maximum distinct source fields limit (' +
                        MAX_DISTINCT_FIELDS +
                        ').'
                )
            );
        }

        return diagnostics;
    }

    /** The objects a bound lookup field points at, per Describe; null when the
     *  binding cannot be resolved to a real field. */
    private static List<Schema.SObjectType> referenceTargetsOf(
        Map<String, Object> binding
    ) {
        if (binding == null) {
            return null;
        }
        String objectName = (String) binding.get('object');
        String fieldName = (String) binding.get('field');
        if (String.isBlank(objectName) || String.isBlank(fieldName)) {
            return null;
        }
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null) {
            return null;
        }
        Schema.SObjectField f = t.getDescribe()
            .fields.getMap()
            .get(fieldName.toLowerCase());
        return f == null ? null : f.getDescribe().getReferenceTo();
    }

    /** The canonical API name of `objectName` if it is one of `targets`. */
    private static String canonicalTarget(
        List<Schema.SObjectType> targets,
        String objectName
    ) {
        if (targets == null || String.isBlank(objectName)) {
            return null;
        }
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null || !new Set<Schema.SObjectType>(targets).contains(t)) {
            return null;
        }
        return t.getDescribe().getName();
    }

    /** Two destination claims that can never be live together: rules on the SAME
     *  polymorphic lookup naming DIFFERENT objects. */
    private static Boolean mutuallyExclusive(String a, String b) {
        if (a == b || !a.startsWith('poly:') || !b.startsWith('poly:')) {
            return false;
        }
        return a.substringBeforeLast(':') == b.substringBeforeLast(':');
    }

    private static String labelOfElement(
        Map<String, Object> el,
        String fallback
    ) {
        Object label = el == null ? null : el.get('label');
        return label instanceof String && String.isNotBlank((String) label)
            ? '“' + (String) label + '”'
            : fallback;
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
