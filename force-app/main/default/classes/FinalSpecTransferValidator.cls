/**
 * Security boundary for untrusted FinalDesign specifications. It validates
 * schema vocabulary, structural references, and describe-based bindings.
 */
public with sharing class FinalSpecTransferValidator {
    private static final Set<String> FORM_TYPES = new Set<String>{
        'form',
        'survey'
    };
    private static final Set<String> SAVE_MODES = new Set<String>{
        'create',
        'update'
    };
    private static final Set<String> LAYOUT_TYPES = new Set<String>{
        'scroll',
        'stepper',
        'tabs',
        'accordion',
        'rail',
        'splitHero',
        'oneAtATime'
    };
    private static final Set<String> ELEMENT_TYPES = new Set<String>{
        'field',
        'lookup',
        'file',
        'signature',
        'map',
        'video',
        'image',
        'richText',
        'divider',
        'spacer',
        'callout',
        'consent',
        'emptySpace',
        'nps',
        'rating',
        'scale',
        'emojiScale',
        'likert',
        'yesNo',
        'imageChoice',
        'ranking',
        'matrix'
    };
    private static final Set<String> RULE_OPERATORS = new Set<String>{
        'equals',
        'notEquals',
        'contains',
        'greaterThan',
        'lessThan',
        'isBlank',
        'isNotBlank'
    };
    private static final Set<String> RULE_ACTIONS = new Set<String>{
        'show',
        'hide'
    };
    private static final Set<String> RULE_LOGIC = new Set<String>{
        'all',
        'any',
        'custom'
    };
    private static final Set<String> VALIDATION_TYPES = new Set<String>{
        'required',
        'pattern',
        'range',
        'custom'
    };
    /** Validated target and the complete structural remap. */
    public class Result {
        public String targetObject;
        public String saveMode;
        public Map<String, String> freshIdByOld = new Map<String, String>();
        public Set<String> elementIds = new Set<String>();
        public Map<String, String> repeatSectionByElement = new Map<String, String>();
    }

    /**
     * Validates a parsed v1 specification without mutating storage.
     * @param spec Parsed specification object.
     * @param expectedType Source root type, lowercase.
     * @return Validated target and fresh structural-id mapping.
     * @throws ValidationException when any schema or describe gate fails.
     */
    public static Result validate(
        Map<String, Object> spec,
        String expectedType
    ) {
        if (!FORM_TYPES.contains(expectedType)) {
            throw new ValidationException(
                'The source form type is unsupported.'
            );
        }
        if (String.valueOf(spec.get('specVersion')) != '1') {
            throw new ValidationException(
                'Only form specification version 1 is supported.'
            );
        }
        Map<String, Object> formBlock = requireMap(
            spec.get('form'),
            'The form block'
        );
        String formType = requireString(formBlock.get('type'), 'The form type');
        if (!FORM_TYPES.contains(formType) || formType != expectedType) {
            throw new ValidationException(
                'The form type does not match the source record.'
            );
        }
        String saveMode = nullableString(formBlock.get('saveMode'));
        saveMode = String.isBlank(saveMode) ? 'create' : saveMode;
        if (!SAVE_MODES.contains(saveMode)) {
            throw new ValidationException('The form save mode is unsupported.');
        }

        String targetObject = nullableString(formBlock.get('targetObject'));
        if (formType == 'form' && String.isBlank(targetObject)) {
            throw new ValidationException(
                'A Form requires a connected Salesforce object.'
            );
        }
        if (String.isNotBlank(targetObject)) {
            targetObject = validateObject(
                targetObject,
                saveMode,
                formType == 'survey'
            );
            formBlock.put('targetObject', targetObject);
        }

        Map<String, Object> layout = requireMap(
            spec.get('layout'),
            'The layout block'
        );
        String layoutType = requireString(
            layout.get('type'),
            'The layout type'
        );
        if (!LAYOUT_TYPES.contains(layoutType)) {
            throw new ValidationException(
                'The layout type is unsupported: ' + layoutType + '.'
            );
        }

        Result result = new Result();
        result.targetObject = targetObject;
        result.saveMode = saveMode;
        List<Object> pages = requireList(
            spec.get('pages'),
            'The pages collection'
        );
        if (pages.isEmpty()) {
            throw new ValidationException('A form needs at least one page.');
        }
        collectNodes(pages, result);
        validateRules(pages, result);
        return result;
    }

    private static void collectNodes(List<Object> pages, Result result) {
        for (Object pageValue : pages) {
            Map<String, Object> page = requireMap(pageValue, 'Each page');
            registerId(page, 'pg_', result, null);
            for (
                Object sectionValue : requireList(
                    page.get('sections'),
                    'Each page sections collection'
                )
            ) {
                Map<String, Object> section = requireMap(
                    sectionValue,
                    'Each section'
                );
                String sectionId = registerId(section, 'sec_', result, null);
                Map<String, Object> repeat = optionalMap(
                    section.get('repeat'),
                    'The repeat block'
                );
                String bindingObject = result.targetObject;
                if (repeat != null) {
                    bindingObject = validateRepeat(repeat, result.targetObject);
                }
                for (
                    Object elementValue : requireList(
                        section.get('elements'),
                        'Each section elements collection'
                    )
                ) {
                    Map<String, Object> element = requireMap(
                        elementValue,
                        'Each element'
                    );
                    String elementId = registerId(
                        element,
                        'el_',
                        result,
                        repeat == null ? null : sectionId
                    );
                    String elementType = requireString(
                        element.get('type'),
                        'The element type'
                    );
                    if (!ELEMENT_TYPES.contains(elementType)) {
                        throw new ValidationException(
                            'Unsupported element type: ' + elementType + '.'
                        );
                    }
                    validateBinding(
                        element,
                        bindingObject,
                        repeat == null ? result.saveMode : 'create'
                    );
                    result.elementIds.add(elementId);
                }
            }
        }
    }

    private static String validateRepeat(
        Map<String, Object> repeat,
        String parentObject
    ) {
        try {
            return FinalSpecDescribeValidator.validateRepeat(
                repeat,
                parentObject
            );
        } catch (FinalSpecDescribeValidator.DescribeException e) {
            throw new ValidationException(e.getMessage());
        }
    }

    private static void validateBinding(
        Map<String, Object> element,
        String expectedObject,
        String saveMode
    ) {
        try {
            FinalSpecDescribeValidator.validateBinding(
                element,
                expectedObject,
                saveMode
            );
        } catch (FinalSpecDescribeValidator.DescribeException e) {
            throw new ValidationException(e.getMessage());
        }
    }

    private static void validateRules(List<Object> pages, Result result) {
        for (Object pageValue : pages) {
            Map<String, Object> page = requireMap(pageValue, 'Each page');
            validateRule(page.get('visibility'), result, null);
            for (
                Object sectionValue : requireList(
                    page.get('sections'),
                    'Each page sections collection'
                )
            ) {
                Map<String, Object> section = requireMap(
                    sectionValue,
                    'Each section'
                );
                String sectionId = requireString(
                    section.get('id'),
                    'The section id'
                );
                String repeatScope = section.get('repeat') == null
                    ? null
                    : sectionId;
                validateRule(section.get('visibility'), result, repeatScope);
                for (
                    Object elementValue : requireList(
                        section.get('elements'),
                        'Each section elements collection'
                    )
                ) {
                    Map<String, Object> element = requireMap(
                        elementValue,
                        'Each element'
                    );
                    validateRule(
                        element.get('visibility'),
                        result,
                        repeatScope
                    );
                    Object entries = element.get('validation');
                    if (entries == null) {
                        continue;
                    }
                    for (
                        Object entryValue : requireList(
                            entries,
                            'The validation collection'
                        )
                    ) {
                        Map<String, Object> entry = requireMap(
                            entryValue,
                            'Each validation entry'
                        );
                        String validationType = requireString(
                            entry.get('type'),
                            'The validation type'
                        );
                        if (!VALIDATION_TYPES.contains(validationType)) {
                            throw new ValidationException(
                                'Unsupported validation type: ' +
                                    validationType +
                                    '.'
                            );
                        }
                        String validationOperator = nullableString(
                            entry.get('operator')
                        );
                        if (
                            String.isNotBlank(validationOperator) &&
                            !RULE_OPERATORS.contains(validationOperator)
                        ) {
                            throw new ValidationException(
                                'Unsupported validation operator: ' +
                                    validationOperator +
                                    '.'
                            );
                        }
                        String compareTo = nullableString(
                            entry.get('compareTo')
                        );
                        if (String.isNotBlank(compareTo)) {
                            validateElementReference(
                                compareTo,
                                result,
                                repeatScope
                            );
                        }
                        validateRule(entry.get('when'), result, repeatScope);
                    }
                }
            }
        }
    }

    private static void validateRule(
        Object ruleValue,
        Result result,
        String repeatScope
    ) {
        if (ruleValue == null) {
            return;
        }
        Map<String, Object> rule = requireMap(ruleValue, 'Each rule block');
        String action = nullableString(rule.get('action'));
        if (String.isNotBlank(action) && !RULE_ACTIONS.contains(action)) {
            throw new ValidationException(
                'Unsupported rule action: ' + action + '.'
            );
        }
        String logic = nullableString(rule.get('logic'));
        if (String.isNotBlank(logic) && !RULE_LOGIC.contains(logic)) {
            throw new ValidationException(
                'Unsupported rule logic: ' + logic + '.'
            );
        }
        Object rows = rule.get('rules');
        if (rows == null) {
            return;
        }
        for (Object rowValue : requireList(rows, 'The rule rows')) {
            Map<String, Object> row = requireMap(rowValue, 'Each rule row');
            String source = requireString(row.get('source'), 'The rule source');
            String operator = requireString(
                row.get('operator'),
                'The rule operator'
            );
            if (!RULE_OPERATORS.contains(operator)) {
                throw new ValidationException(
                    'Unsupported rule operator: ' + operator + '.'
                );
            }
            if (source.startsWith('record:')) {
                validateRecordSource(source, result.targetObject);
            } else {
                validateElementReference(source, result, repeatScope);
            }
        }
    }

    private static void validateElementReference(
        String source,
        Result result,
        String repeatScope
    ) {
        if (!result.elementIds.contains(source)) {
            throw new ValidationException(
                'A rule references a missing element: ' + source + '.'
            );
        }
        String sourceRepeat = result.repeatSectionByElement.get(source);
        if (
            sourceRepeat != null &&
            (repeatScope == null ||
            sourceRepeat != repeatScope)
        ) {
            throw new ValidationException(
                'A rule crosses a repeatable-section boundary.'
            );
        }
    }

    private static void validateRecordSource(
        String source,
        String targetObject
    ) {
        try {
            FinalSpecDescribeValidator.validateRecordSource(
                source,
                targetObject
            );
        } catch (FinalSpecDescribeValidator.DescribeException e) {
            throw new ValidationException(e.getMessage());
        }
    }

    private static String registerId(
        Map<String, Object> node,
        String prefix,
        Result result,
        String repeatSectionId
    ) {
        String oldId = requireString(node.get('id'), 'A structural id');
        if (
            !oldId.startsWith(prefix) || result.freshIdByOld.containsKey(oldId)
        ) {
            throw new ValidationException(
                'Structural ids must be unique and use the correct prefix.'
            );
        }
        result.freshIdByOld.put(oldId, freshId(prefix));
        if (prefix == 'el_' && repeatSectionId != null) {
            result.repeatSectionByElement.put(oldId, repeatSectionId);
        }
        return oldId;
    }

    private static String freshId(String prefix) {
        return prefix +
            EncodingUtil.convertToHex(Crypto.generateAesKey(128))
                .substring(0, 16);
    }

    private static String validateObject(
        String objectApi,
        String saveMode,
        Boolean surveyContext
    ) {
        try {
            return FinalSpecDescribeValidator.validateObject(
                objectApi,
                saveMode,
                surveyContext
            );
        } catch (FinalSpecDescribeValidator.DescribeException e) {
            throw new ValidationException(e.getMessage());
        }
    }

    private static Map<String, Object> requireMap(Object value, String label) {
        if (!(value instanceof Map<String, Object>)) {
            throw new ValidationException(label + ' must be a JSON object.');
        }
        return (Map<String, Object>) value;
    }

    private static Map<String, Object> optionalMap(Object value, String label) {
        return value == null ? null : requireMap(value, label);
    }

    private static List<Object> requireList(Object value, String label) {
        if (!(value instanceof List<Object>)) {
            throw new ValidationException(label + ' must be a JSON array.');
        }
        return (List<Object>) value;
    }

    private static String requireString(Object value, String label) {
        String result = nullableString(value);
        if (String.isBlank(result)) {
            throw new ValidationException(label + ' is required.');
        }
        return result;
    }

    private static String nullableString(Object value) {
        return value instanceof String ? ((String) value).trim() : null;
    }

    /** Error raised when untrusted specification validation fails. */
    public class ValidationException extends Exception {
    }
}
