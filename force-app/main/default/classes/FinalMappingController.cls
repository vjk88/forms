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

    private class ByLabel implements System.Comparator<Map<String, String>> {
        public Integer compare(Map<String, String> a, Map<String, String> b) {
            return a.get('label').compareTo(b.get('label'));
        }
    }
}
