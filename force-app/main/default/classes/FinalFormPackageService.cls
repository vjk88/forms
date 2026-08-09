/**
 * Builds and inspects portable FinalDesign JSON packages. All client JSON is
 * treated as untrusted and passes through the shared transfer validator.
 */
public with sharing class FinalFormPackageService {
    private static final String PACKAGE_KIND = 'final-form-package';
    private static final Integer PACKAGE_VERSION = 1;
    private static final Integer MAX_PACKAGE_CHARS = 393216;

    /** Server result consumed by the explicit browser download gesture. */
    public class ExportResult {
        public String fileName;
        public String packageJson;
        public List<Map<String, Object>> warnings = new List<Map<String, Object>>();
    }

    /** Fully revalidated import work unit used inside the create transaction. */
    public class ImportPlan {
        public String requestedDefaultName;
        public String description;
        public String formType;
        public FinalSpecTransferService.PreparedSpec prepared;
        public List<Map<String, Object>> warnings = new List<Map<String, Object>>();
        public Map<String, Id> topicIdByName = new Map<String, Id>();
        public Set<String> topicsToCreate = new Set<String>();
        public Id themeId;
        public Theme_Definition__c themeToCreate;
        public Set<Id> assetDocumentIds = new Set<Id>();
        public Integer pageCount = 0;
        public Integer questionCount = 0;

        /** Converts the plan to a read-only inspection response. */
        public Map<String, Object> toInspectionMap() {
            Map<String, Object> theme = asMap(prepared.spec.get('theme'));
            return new Map<String, Object>{
                'valid' => true,
                'name' => requestedDefaultName,
                'description' => description,
                'type' => formType,
                'pageCount' => pageCount,
                'questionCount' => questionCount,
                'connectedObject' => prepared.targetObject,
                'themeName' => theme == null ? null : theme.get('name'),
                'warnings' => warnings,
                'errors' => new List<String>()
            };
        }
    }

    /** Builds the v1 package envelope from a validated current authoring spec. */
    public static ExportResult buildExport(
        Form__c source,
        FinalSpecTransferService.PreparedSpec prepared
    ) {
        if (source == null || prepared == null || prepared.spec == null) {
            throw new PackageException('The export source is incomplete.');
        }
        Map<String, Object> formBlock = requireMap(
            prepared.spec.get('form'),
            'The form block'
        );
        Map<String, Object> dependencies = new Map<String, Object>{
            'customTheme' => FinalFormPackageDependencyService.exportCustomTheme(
                prepared.spec
            ),
            'topics' => FinalFormPackageDependencyService.exportTopics(
                prepared.spec
            ),
            'assets' => new List<Object>()
        };
        ExportResult result = new ExportResult();
        Set<String> assetReferences = FinalFormPackageDependencyService.collectAssetReferences(
            prepared.spec
        );
        dependencies.put(
            'assets',
            FinalFormPackageDependencyService.exportAssets(
                assetReferences,
                result.warnings
            )
        );
        Map<String, Object> envelope = new Map<String, Object>{
            'kind' => PACKAGE_KIND,
            'packageVersion' => PACKAGE_VERSION,
            'exportedAt' => System.now()
                .formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\''),
            'metadata' => new Map<String, Object>{
                'name' => source.Name,
                'type' => formBlock.get('type'),
                'description' => source.Description__c == null
                    ? ''
                    : source.Description__c
            },
            'spec' => prepared.spec,
            'dependencies' => dependencies
        };
        result.fileName = safeFileName(source.Name) + '.finalform.json';
        result.packageJson = JSON.serializePretty(envelope);
        return result;
    }

    /** Parses, normalizes, and revalidates a package without performing DML. */
    public static ImportPlan inspect(String packageJson) {
        Map<String, Object> envelope = parseEnvelope(packageJson);
        Map<String, Object> metadata = requireMap(
            envelope.get('metadata'),
            'Package metadata'
        );
        String formType = requireString(metadata.get('type'), 'Package type')
            .toLowerCase();
        if (formType != 'form' && formType != 'survey') {
            throw new PackageException('The package form type is unsupported.');
        }
        Map<String, Object> spec = requireMap(
            envelope.get('spec'),
            'Package spec'
        );
        ImportPlan plan = new ImportPlan();
        plan.formType = formType;
        plan.requestedDefaultName = requireString(
            metadata.get('name'),
            'Package form name'
        );
        plan.description = optionalString(metadata.get('description'));
        if (formType == 'survey') {
            FinalSurveyImportNormalizer.normalize(spec, plan.warnings);
        }
        try {
            plan.prepared = FinalSpecTransferService.prepareClone(
                JSON.serialize(spec),
                formType
            );
        } catch (FinalSpecTransferService.TransferException e) {
            throw new PackageException(e.getMessage());
        }
        Map<String, Object> dependencies = optionalMap(
            envelope.get('dependencies'),
            'Package dependencies'
        );
        dependencies = dependencies == null
            ? new Map<String, Object>()
            : dependencies;
        FinalFormPackageDependencyService.inspectDependencies(
            plan,
            dependencies
        );
        countStructure(plan);
        return plan;
    }

    /** Creates approved shared dependencies and rewrites their local ids. */
    public static void materializeDependencies(ImportPlan plan) {
        FinalFormPackageDependencyService.materialize(plan);
    }

    /** Returns warning codes that require explicit import confirmation. */
    public static Set<String> requiredWarningCodes(ImportPlan plan) {
        Set<String> codes = new Set<String>();
        for (Map<String, Object> warning : plan.warnings) {
            if (warning.get('requiresConfirmation') == true) {
                codes.add(String.valueOf(warning.get('code')));
            }
        }
        return codes;
    }

    private static Map<String, Object> parseEnvelope(String packageJson) {
        if (String.isBlank(packageJson)) {
            throw new PackageException(
                'Choose a Final Form package to import.'
            );
        }
        if (packageJson.length() > MAX_PACKAGE_CHARS) {
            throw new PackageException('The import package is too large.');
        }
        Map<String, Object> envelope;
        try {
            envelope = requireMap(
                JSON.deserializeUntyped(packageJson),
                'The import package'
            );
        } catch (JSONException e) {
            throw new PackageException('The import package is not valid JSON.');
        }
        if (envelope.get('kind') != PACKAGE_KIND) {
            throw new PackageException('This is not a Final Form package.');
        }
        if (String.valueOf(envelope.get('packageVersion')) != '1') {
            throw new PackageException('Only package version 1 is supported.');
        }
        return envelope;
    }

    private static void countStructure(ImportPlan plan) {
        List<Object> pages = asList(plan.prepared.spec.get('pages'));
        plan.pageCount = pages.size();
        for (Object pageValue : pages) {
            for (
                Object sectionValue : asList(asMap(pageValue).get('sections'))
            ) {
                plan.questionCount += asList(
                        asMap(sectionValue).get('elements')
                    )
                    .size();
            }
        }
    }

    private static String safeFileName(String value) {
        String safe = String.isBlank(value)
            ? 'untitled-form'
            : value.trim().toLowerCase().replaceAll('[^a-z0-9._-]+', '-');
        safe = safe.replaceAll('^-+|-+$', '');
        return String.isBlank(safe) ? 'untitled-form' : safe.left(100);
    }

    private static Map<String, Object> requireMap(Object value, String label) {
        if (!(value instanceof Map<String, Object>)) {
            throw new PackageException(label + ' must be a JSON object.');
        }
        return (Map<String, Object>) value;
    }

    private static Map<String, Object> optionalMap(Object value, String label) {
        return value == null ? null : requireMap(value, label);
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
            throw new PackageException(label + ' is required.');
        }
        return result;
    }

    private static String optionalString(Object value) {
        return value instanceof String ? ((String) value).trim() : null;
    }

    /** Sanitized package validation error surfaced by the action service. */
    public class PackageException extends Exception {
    }
}
