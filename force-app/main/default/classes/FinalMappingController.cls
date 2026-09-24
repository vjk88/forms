/**
 * FinalMappingController — what the Studio's Data mode reads
 * (FREEFORM_F2_MAPPING_SPEC section 5). with sharing, as the author: the
 * object list reflects what they can create, which is what publish will
 * check anyway.
 */
public with sharing class FinalMappingController {
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> listCreatableObjects() {
        List<Map<String, String>> out = new List<Map<String, String>>();
        for (Schema.SObjectType st : Schema.getGlobalDescribe().values()) {
            try {
                Schema.DescribeSObjectResult d = st.getDescribe();
                if (
                    d.isCreateable() &&
                    d.isQueryable() &&
                    d.isAccessible() &&
                    !d.isDeprecatedAndHidden() &&
                    !d.isCustomSetting() &&
                    !FinalFormCreateController.isSystemTable(d.getName()) &&
                    !FinalMappingRules.SETUP_OBJECTS.contains(
                        d.getName().toLowerCase()
                    )
                ) {
                    out.add(
                        new Map<String, String>{
                            'label' => d.getLabel(),
                            'value' => d.getName()
                        }
                    );
                }
            } catch (Exception ignored) {
                // Some describes throw for restricted types — skip them.
            }
        }
        out.sort(new ByLabel());
        return out;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, List<String>> compatibility() {
        Map<String, List<String>> out = new Map<String, List<String>>();
        for (String answerType : FinalMappingRules.COMPATIBLE.keySet()) {
            List<String> types = new List<String>();
            for (
                Schema.DisplayType t : FinalMappingRules.COMPATIBLE.get(
                    answerType
                )
            ) {
                types.add(t.name());
            }
            types.sort();
            out.put(answerType, types);
        }
        return out;
    }

    @AuraEnabled
    public static List<Map<String, Object>> describeQuestions(String specJson) {
        Map<String, Object> spec;
        try {
            spec = (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw FinalMappingRules.refusal('The form couldn’t be read.');
        }
        Set<String> skippable = FinalMappingRules.skippableElementIds(spec);
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Map<String, Object> q : FinalMappingRules.questionsInOrder(spec)) {
            String id = (String) q.get('id');
            Map<String, Object> config = FinalMappingRules.asMap(
                q.get('config')
            );
            out.add(
                new Map<String, Object>{
                    'elementKey' => id,
                    'label' => q.get('label'),
                    'answerType' => FinalSubmitService.answerTypeOf(q),
                    'skippable' => skippable.contains(id),
                    'mappable' => !FinalMappingRules.UNMAPPABLE_ELEMENT_TYPES.contains(
                        String.valueOf(q.get('type'))
                    ),
                    'referenceTo' => config == null
                        ? null
                        : config.get('referenceTo')
                }
            );
        }
        return out;
    }

    /**
     * Check conditions (IMPL_PLAN_F2_SEARCH Task 11, decision 21): the same
     * check publishing runs on typed conditions, on the text in the dialog,
     * before anything is applied. Nothing is written. Only what the typed
     * clause says about this step comes back.
     */
    @AuraEnabled
    public static List<FinalMappingValidator.Diagnostic> checkConditions(
        String specJson,
        String actionId,
        String soql
    ) {
        if (Auth.CommunitiesUtil.isGuestUser()) {
            throw FinalMappingRules.refusal('Sign in to check conditions.');
        }
        Map<String, Object> spec;
        try {
            spec = (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw FinalMappingRules.refusal('The form couldn’t be read.');
        }
        Map<String, Object> action = null;
        for (Map<String, Object> a : FinalMappingRules.actionsOf(spec)) {
            if (a.get('id') == actionId) {
                action = a;
            }
        }
        if (action == null) {
            throw FinalMappingRules.refusal('That step isn’t in this form.');
        }
        Map<String, Object> match = FinalMappingRules.asMap(
            action.get('match')
        );
        if (match == null) {
            match = new Map<String, Object>();
            action.put('match', match);
        }
        match.put('filterMode', FinalMappingValidator.FILTER_MODE_SOQL);
        match.put('soql', soql);

        List<FinalMappingValidator.Diagnostic> out = new List<FinalMappingValidator.Diagnostic>();
        for (
            FinalMappingValidator.Diagnostic d : FinalMappingValidator.validate(
                spec,
                null
            )
        ) {
            if (
                d.actionId == actionId &&
                d.field == FinalMappingValidator.CONDITIONS_FIELD
            ) {
                out.add(d);
            }
        }
        return out;
    }

    private class ByLabel implements System.Comparator<Map<String, String>> {
        public Integer compare(Map<String, String> a, Map<String, String> b) {
            return a.get('label').compareTo(b.get('label'));
        }
    }
}
