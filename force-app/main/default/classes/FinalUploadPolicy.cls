/** Published upload rules. Missing limits are unbounded for signed-in respondents. */
public with sharing class FinalUploadPolicy {
    public class Rules {
        public Decimal maxFileBytes;
        public Decimal maxTotalBytes;
        public Integer maxFiles;
        public Integer maxEntries;
    }

    /** Resolve guest defaults and explicit form restrictions using the real audience. */
    public static Rules limits(Map<String, Object> spec, Boolean guest) {
        Rules r = new Rules();
        Final_Settings__c settings = Final_Settings__c.getInstance('org');
        if (guest) {
            r.maxFileBytes = settings?.Guest_Upload_Max_File_Bytes__c ??
                10485760;
            r.maxTotalBytes = settings?.Guest_Upload_Max_Total_Bytes__c ??
                26214400;
            r.maxFiles = Integer.valueOf(
                settings?.Guest_Upload_Max_Files__c ?? 5
            );
            r.maxEntries = Integer.valueOf(
                settings?.Guest_Upload_Max_Entries__c ?? 20
            );
        }
        Map<String, Object> uploads = mapOf(
            mapOf(spec.get('settings')).get('uploads')
        );
        if (guest) {
            Map<String, Object> defaults = mapOf(uploads.get('guestDefaults'));
            r.maxFileBytes = minLimit(
                r.maxFileBytes,
                positive(defaults.get('maxFileBytes'))
            );
            r.maxTotalBytes = minLimit(
                r.maxTotalBytes,
                positive(defaults.get('maxTotalBytes'))
            );
            r.maxFiles = integerLimit(
                minLimit(r.maxFiles, positive(defaults.get('maxFiles')))
            );
        }
        r.maxTotalBytes = minLimit(
            r.maxTotalBytes,
            positive(uploads.get('maxTotalBytes'))
        );
        r.maxFiles = integerLimit(
            minLimit(r.maxFiles, positive(uploads.get('maxFiles')))
        );
        return r;
    }

    /** True only for explicitly published staged transport. */
    public static Boolean staged(Map<String, Object> spec) {
        return mapOf(mapOf(spec.get('settings')).get('uploads'))
                .get('transport') == 'stagedV1';
    }

    /** Query-free map of non-repeating file questions, including requirement applicability. */
    public static Map<String, Map<String, Object>> elements(
        Map<String, Object> spec
    ) {
        Map<String, Map<String, Object>> result = new Map<String, Map<String, Object>>();
        for (Object pageValue : listOf(spec.get('pages'))) {
            Map<String, Object> page = mapOf(pageValue);
            for (Object sectionValue : listOf(page.get('sections'))) {
                Map<String, Object> section = mapOf(sectionValue);
                for (Object elementValue : listOf(section.get('elements'))) {
                    Map<String, Object> element = mapOf(elementValue);
                    if (element.get('type') != 'file') {
                        continue;
                    }
                    if (
                        section.get('repeat') != null &&
                        section.get('repeat') != false
                    ) {
                        throw FinalUploadService.refuse(
                            'File questions cannot be inside repeating groups.'
                        );
                    }
                    Map<String, Object> copy = new Map<String, Object>(element);
                    copy.put(
                        'requiredApplicable',
                        !hasVisibility(page) &&
                            !hasVisibility(section) &&
                            !hasVisibility(element)
                    );
                    result.put(stringOf(element.get('id')), copy);
                }
            }
        }
        return result;
    }

    /** Validate the supported upload vocabulary during publish and import. */
    public static void validateSpec(Map<String, Object> spec) {
        String encoded = JSON.serialize(spec);
        if (
            encoded.contains('"slotToken":') ||
            encoded.contains('"uploadSessionToken":') ||
            encoded.contains('"Files_JSON__c":')
        ) {
            throw FinalUploadService.refuse(
                'Upload runtime data cannot be stored in a form design.'
            );
        }
        String transport = stringOf(
            mapOf(mapOf(spec.get('settings')).get('uploads')).get('transport')
        );
        if (transport != null && transport != 'stagedV1') {
            throw FinalUploadService.refuse(
                'Choose a supported file upload transport.'
            );
        }

        if (!staged(spec)) {
            return;
        }
        Map<String, Object> uploads = mapOf(
            mapOf(spec.get('settings')).get('uploads')
        );
        checkNumber(uploads, 'maxTotalBytes');
        checkNumber(uploads, 'maxFiles');
        Map<String, Object> defaults = mapOf(uploads.get('guestDefaults'));
        checkNumber(defaults, 'maxFileBytes');
        checkNumber(defaults, 'maxTotalBytes');
        checkNumber(defaults, 'maxFiles');
        for (Map<String, Object> element : elements(spec).values()) {
            Map<String, Object> config = mapOf(element.get('config'));
            checkNumber(config, 'maxSizeBytes');
            checkNumber(config, 'maxFiles');
            // MIME wildcard aliases have a deterministic server-side extension mapping.
            extensions(stringOf(config.get('accept')));
        }
    }

    /** Extension allow-list; absent means no application type restriction. */
    public static Set<String> extensions(String accept) {
        Set<String> result = new Set<String>();
        if (String.isBlank(accept)) {
            return result;
        }
        Map<String, String> aliases = new Map<String, String>{
            'image/*' => 'jpg,jpeg,png,gif,webp,bmp,tif,tiff,heic,heif,avif,svg',
            'image/jpeg' => 'jpg,jpeg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
            'text/plain' => 'txt',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx'
        };
        for (String part : accept.toLowerCase().split(',')) {
            String token = part.trim();
            if (aliases.containsKey(token)) {
                result.addAll(aliases.get(token).split(','));
            } else if (Pattern.matches('^\\.?[a-z0-9][a-z0-9_-]*$', token)) {
                result.add(token.startsWith('.') ? token.substring(1) : token);
            } else {
                throw FinalUploadService.refuse(
                    'Use file extensions such as .pdf or a supported file type.'
                );
            }
        }
        return result;
    }

    /** Whether this guest identity stays enrolled, even while admission is disabled. */
    public static Boolean enrolled() {
        if (UserInfo.getUserType() != 'Guest') {
            return false;
        }
        for (
            Final_Upload_Policy__mdt p : Final_Upload_Policy__mdt.getAll()
                .values()
        ) {
            if (p.Guest_User_Id__c == String.valueOf(UserInfo.getUserId())) {
                return true;
            }
        }
        return false;
    }

    /** Admission is separate from enrollment so the off switch cannot bypass the guard. */
    public static Boolean enabled() {
        if (Final_Settings__c.getInstance('org')?.Uploads_Enabled__c != true) {
            return false;
        }
        if (UserInfo.getUserType() != 'Guest') {
            return true;
        }
        for (
            Final_Upload_Policy__mdt p : Final_Upload_Policy__mdt.getAll()
                .values()
        ) {
            if (
                p.Guest_User_Id__c == String.valueOf(UserInfo.getUserId()) &&
                p.Admission_Enabled__c
            ) {
                return true;
            }
        }
        return false;
    }

    public static Map<String, Object> mapOf(Object value) {
        return value instanceof Map<String, Object>
            ? (Map<String, Object>) value
            : new Map<String, Object>();
    }
    public static List<Object> listOf(Object value) {
        return value instanceof List<Object>
            ? (List<Object>) value
            : new List<Object>();
    }
    public static String stringOf(Object value) {
        return value instanceof String ? (String) value : null;
    }
    public static Decimal positive(Object value) {
        if (value == null) {
            return null;
        }
        Decimal d = Decimal.valueOf(String.valueOf(value));
        return d > 0 ? d : null;
    }
    public static Decimal minLimit(Decimal a, Decimal b) {
        return a == null ? b : b == null ? a : Math.min(a, b);
    }
    public static Integer integerLimit(Decimal value) {
        return value == null ? null : Integer.valueOf(value);
    }
    private static Boolean hasVisibility(Map<String, Object> node) {
        return !listOf(mapOf(node.get('visibility')).get('rules')).isEmpty();
    }
    private static void checkNumber(Map<String, Object> config, String key) {
        Object value = config.get(key);
        if (
            value != null &&
            (positive(value) == null ||
            Decimal.valueOf(String.valueOf(value)).scale() > 0)
        ) {
            throw FinalUploadService.refuse(
                'Upload limits must be positive whole numbers.'
            );
        }
    }
}
