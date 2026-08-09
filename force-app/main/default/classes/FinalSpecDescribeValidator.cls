/**
 * Describe-driven object, field, relationship, and record-rule validation for
 * untrusted FinalDesign specifications. This class performs no SOQL or DML.
 */
public with sharing class FinalSpecDescribeValidator {
    private static final Pattern API_NAME_PATTERN = Pattern.compile(
        '^[A-Za-z][A-Za-z0-9_]*$'
    );

    /**
     * Validates and canonicalizes an object API name for its use case.
     * @param objectApi Candidate object API name.
     * @param saveMode create or update.
     * @param surveyContext Whether the object is optional Survey context.
     * @return Canonical object API name.
     * @throws DescribeException when the object is invalid or unavailable.
     */
    public static String validateObject(
        String objectApi,
        String saveMode,
        Boolean surveyContext
    ) {
        if (
            String.isBlank(objectApi) ||
            !API_NAME_PATTERN.matcher(objectApi).matches()
        ) {
            throw new DescribeException(
                'The connected object API name is invalid.'
            );
        }
        Schema.SObjectType objectType = getSObjectType(objectApi);
        if (objectType == null) {
            throw new DescribeException(
                'The connected Salesforce object does not exist.'
            );
        }
        Schema.DescribeSObjectResult describe = objectType.getDescribe();
        Boolean writable = saveMode == 'update'
            ? describe.isUpdateable()
            : describe.isCreateable();
        if (
            !describe.isAccessible() ||
            !describe.isQueryable() ||
            (!writable && !surveyContext) ||
            (surveyContext && !describe.isUpdateable())
        ) {
            throw new DescribeException(
                'The connected Salesforce object is unavailable.'
            );
        }
        return describe.getName();
    }

    /**
     * Validates a repeat child and its writable lookup to the parent.
     * @param repeat Repeat specification block, canonicalized in place.
     * @param parentObject Canonical connected parent object.
     * @return Canonical child object API name.
     * @throws DescribeException when the relationship is invalid.
     */
    public static String validateRepeat(
        Map<String, Object> repeat,
        String parentObject
    ) {
        if (String.isBlank(parentObject)) {
            throw new DescribeException(
                'A repeatable section requires a connected parent object.'
            );
        }
        String childObject = validateObject(
            stringValue(repeat.get('childObject'), 'The repeat child object'),
            'create',
            false
        );
        String relationshipField = stringValue(
            repeat.get('relationshipField'),
            'The repeat relationship field'
        );
        Schema.DescribeSObjectResult childDescribe = getSObjectType(childObject)
            .getDescribe();
        Schema.SObjectField relationship = childDescribe.fields.getMap()
            .get(relationshipField);
        if (relationship == null) {
            throw new DescribeException(
                'The repeat relationship field does not exist.'
            );
        }
        Schema.DescribeFieldResult fieldDescribe = relationship.getDescribe();
        Boolean pointsToParent = false;
        for (
            Schema.SObjectType referenceType : fieldDescribe.getReferenceTo()
        ) {
            if (referenceType.getDescribe().getName() == parentObject) {
                pointsToParent = true;
            }
        }
        if (
            fieldDescribe.getType() != Schema.DisplayType.REFERENCE ||
            !fieldDescribe.isCreateable() ||
            !pointsToParent
        ) {
            throw new DescribeException(
                'The repeat relationship is not writable for the connected object.'
            );
        }
        repeat.put('childObject', childObject);
        repeat.put('relationshipField', fieldDescribe.getName());
        return childObject;
    }

    /**
     * Validates and canonicalizes an optional element field binding.
     * @param element Element containing an optional binding object.
     * @param expectedObject Object allowed for this structural scope.
     * @param saveMode create or update.
     * @throws DescribeException when the binding is invalid or unavailable.
     */
    public static void validateBinding(
        Map<String, Object> element,
        String expectedObject,
        String saveMode
    ) {
        Object bindingValue = element.get('binding');
        if (bindingValue == null) {
            return;
        }
        if (!(bindingValue instanceof Map<String, Object>)) {
            throw new DescribeException(
                'The element binding must be a JSON object.'
            );
        }
        Map<String, Object> binding = (Map<String, Object>) bindingValue;
        String objectApi = stringValue(
            binding.get('object'),
            'The binding object'
        );
        String fieldApi = stringValue(
            binding.get('field'),
            'The binding field'
        );
        if (String.isBlank(expectedObject) || objectApi != expectedObject) {
            throw new DescribeException(
                'An element binding points outside its allowed object.'
            );
        }
        Schema.DescribeSObjectResult objectDescribe = getSObjectType(
                expectedObject
            )
            .getDescribe();
        Schema.SObjectField field = objectDescribe.fields.getMap()
            .get(fieldApi);
        if (field == null) {
            throw new DescribeException(
                'A mapped field does not exist: ' + fieldApi + '.'
            );
        }
        Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
        Boolean writable = saveMode == 'update'
            ? fieldDescribe.isUpdateable()
            : fieldDescribe.isCreateable();
        if (
            !fieldDescribe.isAccessible() ||
            !writable ||
            fieldDescribe.isCalculated()
        ) {
            throw new DescribeException(
                'A mapped field is not writable: ' + fieldApi + '.'
            );
        }
        binding.put('object', objectDescribe.getName());
        binding.put('field', fieldDescribe.getName());
    }

    /**
     * Validates a record-prefill rule source without constructing dynamic SOQL.
     * @param source record:FieldApi rule source.
     * @param targetObject Canonical connected object.
     * @throws DescribeException when the source field is invalid or unavailable.
     */
    public static void validateRecordSource(
        String source,
        String targetObject
    ) {
        if (String.isBlank(targetObject)) {
            throw new DescribeException(
                'A record rule requires a connected object.'
            );
        }
        String fieldApi = source.substringAfter('record:');
        if (!API_NAME_PATTERN.matcher(fieldApi).matches()) {
            throw new DescribeException(
                'A record rule contains an invalid field name.'
            );
        }
        Schema.SObjectField field = getSObjectType(targetObject)
            .getDescribe()
            .fields.getMap()
            .get(fieldApi);
        if (field == null || !field.getDescribe().isAccessible()) {
            throw new DescribeException(
                'A record rule references an unavailable field.'
            );
        }
    }

    private static Schema.SObjectType getSObjectType(String objectApi) {
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
        Schema.SObjectType objectType = globalDescribe.get(objectApi);
        return objectType == null
            ? globalDescribe.get(objectApi.toLowerCase())
            : objectType;
    }

    private static String stringValue(Object value, String label) {
        if (!(value instanceof String) || String.isBlank((String) value)) {
            throw new DescribeException(label + ' is required.');
        }
        return ((String) value).trim();
    }

    /** Describe validation error consumed by the transfer validator. */
    public class DescribeException extends Exception {
    }
}
