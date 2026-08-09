/**
 * Removes non-portable Salesforce bindings from imported Surveys while
 * preserving their questions, layout, and analytics.
 */
public with sharing class FinalSurveyImportNormalizer {
    /**
     * Normalizes a parsed Survey specification in place and records the
     * explicit disconnected-import warning when anything is removed.
     */
    public static void normalize(
        Map<String, Object> spec,
        List<Map<String, Object>> warnings
    ) {
        Map<String, Object> form = asMap(spec.get('form'));
        if (form == null) {
            return;
        }
        String objectApi = optionalString(form.get('targetObject'));
        String saveMode = optionalString(form.get('saveMode'));
        saveMode = String.isBlank(saveMode) ? 'create' : saveMode;
        Boolean disconnectAll = false;
        if (String.isNotBlank(objectApi)) {
            try {
                objectApi = FinalSpecDescribeValidator.validateObject(
                    objectApi,
                    saveMode,
                    true
                );
            } catch (FinalSpecDescribeValidator.DescribeException e) {
                disconnectAll = true;
                form.put('targetObject', null);
                form.put('saveMode', 'create');
            }
        }
        Integer removed = normalizePages(
            asList(spec.get('pages')),
            objectApi,
            saveMode,
            disconnectAll
        );
        if (disconnectAll || removed > 0) {
            warnings.add(
                new Map<String, Object>{
                    'code' => 'SURVEY_DISCONNECTED',
                    'message' => 'Unavailable survey mappings or record rules will be removed; survey questions are preserved.',
                    'requiresConfirmation' => true
                }
            );
        }
    }

    private static Integer normalizePages(
        List<Object> pages,
        String rootObject,
        String saveMode,
        Boolean disconnectAll
    ) {
        Integer removed = 0;
        for (Object pageValue : pages) {
            Map<String, Object> page = asMap(pageValue);
            removed += pruneRecordRules(page, rootObject, disconnectAll);
            for (Object sectionValue : asList(page.get('sections'))) {
                Map<String, Object> section = asMap(sectionValue);
                removed += pruneRecordRules(section, rootObject, disconnectAll);
                Map<String, Object> repeat = asMap(section.get('repeat'));
                String bindingObject = rootObject;
                Boolean removeBindings = disconnectAll;
                if (repeat != null && !disconnectAll) {
                    try {
                        bindingObject = FinalSpecDescribeValidator.validateRepeat(
                            repeat,
                            rootObject
                        );
                    } catch (FinalSpecDescribeValidator.DescribeException e) {
                        section.remove('repeat');
                        removeBindings = true;
                        removed++;
                    }
                } else if (repeat != null) {
                    section.remove('repeat');
                    removeBindings = true;
                    removed++;
                }
                for (Object elementValue : asList(section.get('elements'))) {
                    Map<String, Object> element = asMap(elementValue);
                    removed += pruneRecordRules(
                        element,
                        rootObject,
                        disconnectAll
                    );
                    if (element.get('binding') != null) {
                        Boolean bindingValid = !removeBindings;
                        if (bindingValid) {
                            try {
                                FinalSpecDescribeValidator.validateBinding(
                                    element,
                                    bindingObject,
                                    repeat == null ? saveMode : 'create'
                                );
                            } catch (FinalSpecDescribeValidator.DescribeException e) {
                                bindingValid = false;
                            }
                        }
                        if (!bindingValid) {
                            element.remove('binding');
                            removed++;
                        }
                    }
                    for (
                        Object validationValue : asList(
                            element.get('validation')
                        )
                    ) {
                        removed += pruneRecordRules(
                            asMap(validationValue),
                            rootObject,
                            disconnectAll
                        );
                    }
                }
            }
        }
        return removed;
    }

    private static Integer pruneRecordRules(
        Map<String, Object> owner,
        String objectApi,
        Boolean disconnectAll
    ) {
        if (owner == null) {
            return 0;
        }
        Map<String, Object> rule = asMap(
            owner.containsKey('when')
                ? owner.get('when')
                : owner.get('visibility')
        );
        if (rule == null) {
            return 0;
        }
        List<Object> retained = new List<Object>();
        Integer removed = 0;
        for (Object rowValue : asList(rule.get('rules'))) {
            Map<String, Object> row = asMap(rowValue);
            String source = row == null
                ? null
                : optionalString(row.get('source'));
            Boolean keep = true;
            if (String.isNotBlank(source) && source.startsWith('record:')) {
                if (disconnectAll) {
                    keep = false;
                } else {
                    try {
                        FinalSpecDescribeValidator.validateRecordSource(
                            source,
                            objectApi
                        );
                    } catch (FinalSpecDescribeValidator.DescribeException e) {
                        keep = false;
                    }
                }
            }
            if (keep) {
                retained.add(rowValue);
            } else {
                removed++;
            }
        }
        rule.put('rules', retained);
        return removed;
    }

    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<String, Object>
            ? (Map<String, Object>) value
            : null;
    }

    private static List<Object> asList(Object value) {
        return value instanceof List<Object>
            ? (List<Object>) value
            : new List<Object>();
    }

    private static String optionalString(Object value) {
        return value instanceof String ? ((String) value).trim() : null;
    }
}
