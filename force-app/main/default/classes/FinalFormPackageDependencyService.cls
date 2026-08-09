/**
 * Resolves portable custom-theme, survey-topic, and Salesforce File
 * dependencies for Final Form packages.
 */
public with sharing class FinalFormPackageDependencyService {
    private static final Integer MAX_THEME_CHARS = 131072;

    /** Returns the portable custom theme dependency, or null for built-ins. */
    public static Object exportCustomTheme(Map<String, Object> spec) {
        Map<String, Object> theme = asMap(spec.get('theme'));
        if (theme == null || theme.get('source') != 'custom') {
            return null;
        }
        Theme_Definition__c record = FinalFormActionsSelector.selectThemeById(
            idOrNull(theme.get('name'))
        );
        if (record == null || String.isBlank(record.Theme_JSON__c)) {
            throw new FinalFormPackageService.PackageException(
                'The custom theme used by this form is unavailable.'
            );
        }
        Object properties;
        try {
            properties = JSON.deserializeUntyped(record.Theme_JSON__c);
        } catch (JSONException e) {
            throw new FinalFormPackageService.PackageException(
                'The custom theme definition is invalid.'
            );
        }
        if (!(properties instanceof Map<String, Object>)) {
            throw new FinalFormPackageService.PackageException(
                'The custom theme definition is invalid.'
            );
        }
        return new Map<String, Object>{
            'sourceId' => record.Id,
            'name' => record.Name,
            'baseTheme' => record.Base_Theme__c,
            'properties' => properties
        };
    }

    /** Returns unique survey topic names with source ids as non-portable hints. */
    public static List<Object> exportTopics(Map<String, Object> spec) {
        Map<String, String> namesById = new Map<String, String>();
        collectTopics(spec, namesById);
        List<Object> topics = new List<Object>();
        for (String sourceId : namesById.keySet()) {
            topics.add(
                new Map<String, Object>{
                    'sourceId' => sourceId,
                    'name' => namesById.get(sourceId)
                }
            );
        }
        return topics;
    }

    /** Builds the v1 asset manifest without embedding binary bytes. */
    public static List<Object> exportAssets(
        Set<String> references,
        List<Map<String, Object>> warnings
    ) {
        Map<Id, ContentVersion> versionsById = new Map<Id, ContentVersion>(
            FinalFormActionsSelector.selectContentVersions(validIds(references))
        );
        List<Object> assets = new List<Object>();
        for (String reference : references) {
            Id versionId = idOrNull(reference);
            ContentVersion version = versionId == null
                ? null
                : versionsById.get(versionId);
            assets.add(
                new Map<String, Object>{
                    'sourceVersionId' => reference,
                    'available' => version != null,
                    'fileName' => version == null
                        ? null
                        : version.Title + '.' + version.FileExtension,
                    'contentSize' => version == null
                        ? null
                        : version.ContentSize
                }
            );
        }
        if (!references.isEmpty()) {
            warnings.add(
                warning(
                    'ASSET_BYTES_OMITTED',
                    'This JSON export lists Salesforce-hosted images but does not include their bytes.',
                    false
                )
            );
        }
        return assets;
    }

    /** Inspects every dependency and mutates only the in-memory import plan. */
    public static void inspectDependencies(
        FinalFormPackageService.ImportPlan plan,
        Map<String, Object> dependencies
    ) {
        inspectTheme(plan, dependencies);
        inspectTopics(plan);
        inspectAssets(plan);
    }

    /** Creates approved dependencies and rewrites the local ids in the spec. */
    public static void materialize(FinalFormPackageService.ImportPlan plan) {
        if (plan.themeToCreate != null) {
            insert as user plan.themeToCreate;
            plan.themeId = plan.themeToCreate.Id;
        }
        if (plan.themeId != null) {
            asMap(plan.prepared.spec.get('theme'))
                .put('name', String.valueOf(plan.themeId));
        }
        if (!plan.topicsToCreate.isEmpty()) {
            List<Survey_Topic__c> topics = new List<Survey_Topic__c>();
            for (String topicName : plan.topicsToCreate) {
                topics.add(
                    new Survey_Topic__c(Name = topicName, Active__c = true)
                );
            }
            insert as user topics;
            for (Survey_Topic__c topic : topics) {
                plan.topicIdByName.put(topic.Name, topic.Id);
            }
        }
        rewriteTopicIds(plan.prepared.spec, plan.topicIdByName);
    }

    /** Finds every content-version reference in the specification. */
    public static Set<String> collectAssetReferences(Object value) {
        Set<String> references = new Set<String>();
        collectAssetReferences(value, references);
        return references;
    }

    private static void inspectTheme(
        FinalFormPackageService.ImportPlan plan,
        Map<String, Object> dependencies
    ) {
        Map<String, Object> theme = asMap(plan.prepared.spec.get('theme'));
        if (theme == null || theme.get('source') != 'custom') {
            return;
        }
        Map<String, Object> dependency = requireMap(
            dependencies.get('customTheme'),
            'The custom theme dependency'
        );
        String name = requireString(dependency.get('name'), 'Custom theme name')
            .left(80);
        Map<String, Object> properties = requireMap(
            dependency.get('properties'),
            'Custom theme properties'
        );
        String themeJson = JSON.serialize(properties);
        if (themeJson.length() > MAX_THEME_CHARS) {
            throw new FinalFormPackageService.PackageException(
                'The custom theme definition is too large.'
            );
        }
        Theme_Definition__c existing = FinalFormActionsSelector.selectThemeById(
            idOrNull(dependency.get('sourceId'))
        );
        existing = existing == null
            ? FinalFormActionsSelector.selectThemeByName(name)
            : existing;
        if (existing != null) {
            plan.themeId = existing.Id;
            return;
        }
        plan.themeToCreate = new Theme_Definition__c(
            Name = name,
            Base_Theme__c = optionalString(dependency.get('baseTheme')),
            Theme_JSON__c = themeJson
        );
        plan.warnings.add(
            warning(
                'CREATE_CUSTOM_THEME',
                'Import will create the shared custom theme "' + name + '".',
                true
            )
        );
    }

    private static void inspectTopics(FinalFormPackageService.ImportPlan plan) {
        Map<String, String> namesById = new Map<String, String>();
        collectTopics(plan.prepared.spec, namesById);
        Set<String> names = new Set<String>();
        names.addAll(namesById.values());
        for (
            Survey_Topic__c topic : FinalFormActionsSelector.selectTopicsByNames(
                names
            )
        ) {
            plan.topicIdByName.put(topic.Name, topic.Id);
        }
        for (String name : names) {
            if (!plan.topicIdByName.containsKey(name)) {
                plan.topicsToCreate.add(name);
            }
        }
        if (!plan.topicsToCreate.isEmpty()) {
            plan.warnings.add(
                warning(
                    'CREATE_SURVEY_TOPICS',
                    'Import will create ' +
                        plan.topicsToCreate.size() +
                        ' shared survey topic' +
                        (plan.topicsToCreate.size() == 1 ? '.' : 's.'),
                    true
                )
            );
        }
    }

    private static void inspectAssets(FinalFormPackageService.ImportPlan plan) {
        Set<String> references = collectAssetReferences(plan.prepared.spec);
        Set<String> found = new Set<String>();
        for (
            ContentVersion version : FinalFormActionsSelector.selectContentVersions(
                validIds(references)
            )
        ) {
            found.add(String.valueOf(version.Id));
            plan.assetDocumentIds.add(version.ContentDocumentId);
        }
        Set<String> missing = new Set<String>();
        for (String reference : references) {
            if (!found.contains(reference)) {
                missing.add(reference);
            }
        }
        if (!missing.isEmpty()) {
            clearMissingAssets(plan.prepared.spec, missing);
            plan.warnings.add(
                warning(
                    'CLEAR_MISSING_ASSETS',
                    'Some source-org images are unavailable and will be cleared.',
                    true
                )
            );
        }
    }

    private static void collectTopics(
        Object value,
        Map<String, String> namesById
    ) {
        if (value instanceof Map<String, Object>) {
            Map<String, Object> row = (Map<String, Object>) value;
            Map<String, Object> analytics = asMap(row.get('analytics'));
            if (analytics != null) {
                for (Object topicValue : asList(analytics.get('topics'))) {
                    Map<String, Object> topic = asMap(topicValue);
                    String name = topic == null
                        ? null
                        : optionalString(topic.get('name'));
                    if (String.isNotBlank(name)) {
                        String sourceId = optionalString(topic.get('id'));
                        namesById.put(
                            String.isBlank(sourceId) ? name : sourceId,
                            name.left(80)
                        );
                    }
                }
            }
            for (Object child : row.values()) {
                collectTopics(child, namesById);
            }
        } else if (value instanceof List<Object>) {
            for (Object child : (List<Object>) value) {
                collectTopics(child, namesById);
            }
        }
    }

    private static void rewriteTopicIds(
        Object value,
        Map<String, Id> topicIdByName
    ) {
        if (value instanceof Map<String, Object>) {
            Map<String, Object> row = (Map<String, Object>) value;
            Map<String, Object> analytics = asMap(row.get('analytics'));
            if (analytics != null) {
                for (Object topicValue : asList(analytics.get('topics'))) {
                    Map<String, Object> topic = asMap(topicValue);
                    String name = topic == null
                        ? null
                        : optionalString(topic.get('name'));
                    if (topicIdByName.containsKey(name)) {
                        topic.put(
                            'id',
                            String.valueOf(topicIdByName.get(name))
                        );
                    }
                }
            }
            for (Object child : row.values()) {
                rewriteTopicIds(child, topicIdByName);
            }
        } else if (value instanceof List<Object>) {
            for (Object child : (List<Object>) value) {
                rewriteTopicIds(child, topicIdByName);
            }
        }
    }

    private static void collectAssetReferences(
        Object value,
        Set<String> references
    ) {
        if (value instanceof Map<String, Object>) {
            Map<String, Object> row = (Map<String, Object>) value;
            for (String key : row.keySet()) {
                Object child = row.get(key);
                if (
                    (key == 'versionId' ||
                    key == 'contentVersionId') &&
                    child instanceof String &&
                    String.isNotBlank((String) child)
                ) {
                    references.add((String) child);
                }
                collectAssetReferences(child, references);
            }
        } else if (value instanceof List<Object>) {
            for (Object child : (List<Object>) value) {
                collectAssetReferences(child, references);
            }
        }
    }

    private static void clearMissingAssets(Object value, Set<String> missing) {
        if (value instanceof Map<String, Object>) {
            Map<String, Object> row = (Map<String, Object>) value;
            Boolean clearLocation = false;
            for (String key : row.keySet()) {
                Object child = row.get(key);
                if (
                    (key == 'versionId' ||
                    key == 'contentVersionId') &&
                    child instanceof String &&
                    missing.contains((String) child)
                ) {
                    row.put(key, null);
                    clearLocation = true;
                } else {
                    clearMissingAssets(child, missing);
                }
            }
            if (clearLocation) {
                if (row.containsKey('url'))
                    row.put('url', null);
                if (row.containsKey('src'))
                    row.put('src', null);
            }
        } else if (value instanceof List<Object>) {
            for (Object child : (List<Object>) value) {
                clearMissingAssets(child, missing);
            }
        }
    }

    private static Set<Id> validIds(Set<String> values) {
        Set<Id> ids = new Set<Id>();
        for (String value : values) {
            Id parsed = idOrNull(value);
            if (parsed != null)
                ids.add(parsed);
        }
        return ids;
    }

    private static Id idOrNull(Object value) {
        if (!(value instanceof String) || String.isBlank((String) value)) {
            return null;
        }
        try {
            return Id.valueOf((String) value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Map<String, Object> warning(
        String code,
        String message,
        Boolean requiresConfirmation
    ) {
        return new Map<String, Object>{
            'code' => code,
            'message' => message,
            'requiresConfirmation' => requiresConfirmation
        };
    }

    private static Map<String, Object> requireMap(Object value, String label) {
        if (!(value instanceof Map<String, Object>)) {
            throw new FinalFormPackageService.PackageException(
                label + ' must be a JSON object.'
            );
        }
        return (Map<String, Object>) value;
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

    private static String requireString(Object value, String label) {
        String result = optionalString(value);
        if (String.isBlank(result)) {
            throw new FinalFormPackageService.PackageException(
                label + ' is required.'
            );
        }
        return result;
    }

    private static String optionalString(Object value) {
        return value instanceof String ? ((String) value).trim() : null;
    }
}
