/**
 * Prepares validated authoring specifications for a new Form__c root. This
 * pure service performs no SOQL or DML.
 */
public with sharing class FinalSpecTransferService {
    private static final Integer MAX_SPEC_CHARS = 131072;

    /** Prepared, validated authoring state used by the action transaction. */
    public class PreparedSpec {
        public Map<String, Object> spec;
        public String targetObject;
        public Set<Id> assetVersionIds = new Set<Id>();
    }

    /**
     * Parses, validates, cleans, and remaps a client-provided clone spec.
     * @param specJson Current in-memory authoring JSON.
     * @param expectedType Type from the source Form__c, lowercase.
     * @return Prepared specification with fresh structural ids.
     * @throws TransferException when the untrusted specification is invalid.
     */
    public static PreparedSpec prepareClone(
        String specJson,
        String expectedType
    ) {
        return prepareSpec(specJson, expectedType, true);
    }

    /**
     * Validates and cleans an authoring spec for a portable export while
     * retaining structural ids so rule references remain intact.
     * @param specJson Current in-memory authoring JSON.
     * @param expectedType Type from the source Form__c, lowercase.
     * @return Cleaned export specification and referenced asset ids.
     * @throws TransferException when the untrusted specification is invalid.
     */
    public static PreparedSpec prepareExport(
        String specJson,
        String expectedType
    ) {
        return prepareSpec(specJson, expectedType, false);
    }

    private static PreparedSpec prepareSpec(
        String specJson,
        String expectedType,
        Boolean remapStructure
    ) {
        if (String.isBlank(specJson)) {
            throw new TransferException('The current form design is empty.');
        }
        if (specJson.length() > MAX_SPEC_CHARS) {
            throw new TransferException(
                'The form design exceeds 131,072 characters.'
            );
        }

        Map<String, Object> spec;
        try {
            spec = requireMap(
                JSON.deserializeUntyped(specJson),
                'The form design'
            );
        } catch (JSONException e) {
            throw new TransferException(
                'The current form design is not valid JSON.'
            );
        }

        FinalSpecTransferValidator.Result validation;
        try {
            validation = FinalSpecTransferValidator.validate(
                spec,
                expectedType
            );
        } catch (FinalSpecTransferValidator.ValidationException e) {
            throw new TransferException(e.getMessage());
        }

        if (remapStructure) {
            rewriteStructure(spec, validation);
        }
        cleanTransferredState(spec);

        PreparedSpec prepared = new PreparedSpec();
        prepared.spec = spec;
        prepared.targetObject = validation.targetObject;
        collectAssetVersionIds(spec, prepared.assetVersionIds);
        return prepared;
    }

    /**
     * Applies the new root identity and returns storage-ready JSON.
     * @param prepared Previously validated prepared specification.
     * @param newFormId Newly inserted Form__c identifier.
     * @param requestedName User-confirmed clone name.
     * @return Serialized authoring specification.
     * @throws TransferException when required identity data is missing or too large.
     */
    public static String bindIdentityAndSerialize(
        PreparedSpec prepared,
        Id newFormId,
        String requestedName
    ) {
        if (
            prepared == null ||
            prepared.spec == null ||
            newFormId == null ||
            String.isBlank(requestedName)
        ) {
            throw new TransferException('The new form identity is incomplete.');
        }
        Map<String, Object> formBlock = requireMap(
            prepared.spec.get('form'),
            'The form block'
        );
        formBlock.put('id', String.valueOf(newFormId));
        formBlock.put('name', requestedName.trim());

        String specJson = JSON.serialize(prepared.spec);
        if (specJson.length() > MAX_SPEC_CHARS) {
            throw new TransferException(
                'The new form design exceeds 131,072 characters.'
            );
        }
        return specJson;
    }

    private static void rewriteStructure(
        Map<String, Object> spec,
        FinalSpecTransferValidator.Result validation
    ) {
        for (Object pageValue : requireList(spec.get('pages'), 'The pages')) {
            Map<String, Object> page = requireMap(pageValue, 'Each page');
            rewriteRule(page.get('visibility'), validation.freshIdByOld);
            page.put(
                'id',
                validation.freshIdByOld.get(String.valueOf(page.get('id')))
            );
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
                rewriteRule(section.get('visibility'), validation.freshIdByOld);
                section.put(
                    'id',
                    validation.freshIdByOld.get(
                        String.valueOf(section.get('id'))
                    )
                );
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
                    rewriteRule(
                        element.get('visibility'),
                        validation.freshIdByOld
                    );
                    Object validationValue = element.get('validation');
                    if (validationValue != null) {
                        for (
                            Object entryValue : requireList(
                                validationValue,
                                'The validation collection'
                            )
                        ) {
                            Map<String, Object> entry = requireMap(
                                entryValue,
                                'Each validation entry'
                            );
                            Object compareTo = entry.get('compareTo');
                            if (
                                compareTo instanceof String &&
                                validation.freshIdByOld.containsKey(
                                    (String) compareTo
                                )
                            ) {
                                entry.put(
                                    'compareTo',
                                    validation.freshIdByOld.get(
                                        (String) compareTo
                                    )
                                );
                            }
                            rewriteRule(
                                entry.get('when'),
                                validation.freshIdByOld
                            );
                        }
                    }
                    element.put(
                        'id',
                        validation.freshIdByOld.get(
                            String.valueOf(element.get('id'))
                        )
                    );
                }
            }
        }
    }

    private static void rewriteRule(
        Object ruleValue,
        Map<String, String> freshIdByOld
    ) {
        if (!(ruleValue instanceof Map<String, Object>)) {
            return;
        }
        Map<String, Object> rule = (Map<String, Object>) ruleValue;
        if (!(rule.get('rules') instanceof List<Object>)) {
            return;
        }
        for (Object rowValue : (List<Object>) rule.get('rules')) {
            Map<String, Object> row = requireMap(rowValue, 'Each rule row');
            Object source = row.get('source');
            if (
                source instanceof String &&
                freshIdByOld.containsKey((String) source)
            ) {
                row.put('source', freshIdByOld.get((String) source));
            }
        }
    }

    private static void cleanTransferredState(Map<String, Object> spec) {
        spec.remove('resolved');
        spec.remove('publication');
        spec.remove('responses');
        spec.remove('invitations');
        Map<String, Object> formBlock = requireMap(
            spec.get('form'),
            'The form block'
        );
        formBlock.remove('id');
        formBlock.remove('status');
        formBlock.remove('isPublic');
        formBlock.remove('publicUrl');
        formBlock.remove('publishedAt');
        formBlock.remove('publishedDate');
        formBlock.remove('versionId');
    }

    private static void collectAssetVersionIds(Object value, Set<Id> ids) {
        if (value instanceof Map<String, Object>) {
            Map<String, Object> row = (Map<String, Object>) value;
            for (String key : row.keySet()) {
                Object child = row.get(key);
                if (
                    (key == 'versionId' || key == 'contentVersionId') &&
                    child instanceof String
                ) {
                    try {
                        ids.add(Id.valueOf((String) child));
                    } catch (Exception ignored) {
                        // Foreign or stale asset ids do not block a same-org clone.
                    }
                } else {
                    collectAssetVersionIds(child, ids);
                }
            }
        } else if (value instanceof List<Object>) {
            for (Object child : (List<Object>) value) {
                collectAssetVersionIds(child, ids);
            }
        }
    }

    private static Map<String, Object> requireMap(Object value, String label) {
        if (!(value instanceof Map<String, Object>)) {
            throw new TransferException(label + ' must be a JSON object.');
        }
        return (Map<String, Object>) value;
    }

    private static List<Object> requireList(Object value, String label) {
        if (!(value instanceof List<Object>)) {
            throw new TransferException(label + ' must be a JSON array.');
        }
        return (List<Object>) value;
    }

    /** Domain error returned to the action service. */
    public class TransferException extends Exception {
    }
}
