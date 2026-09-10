/** Disabled-by-default sandbox proof enrollment; this is not production admission policy. */
public with sharing class FinalUploadProofPolicy {
    public static final String REFUSED = 'This upload is not authorized or its slot is no longer available.';
    public static final Integer MAX_BYTES = 26214400;
    public static final String ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx';
    @TestVisible
    private static Map<String, Final_Upload_Proof_Policy__mdt> testPolicies;
    @TestVisible
    private static Boolean testEnvironment;

    /** @return Qualified correlation field name, including a package namespace if installed. */
    public static String markerField() {
        return ContentVersion.Final_Upload_fileupload__c.getDescribe()
            .getName();
    }

    /** @return Whether this is a sandbox or Developer Edition, never a production business org. */
    // Organization metadata is used only as a server-side deny gate, never disclosed to guests.
    @SuppressWarnings('PMD.ApexCRUDViolation')
    public static Boolean permittedEnvironment() {
        if (Test.isRunningTest() && testEnvironment != null) {
            return testEnvironment;
        }
        Organization orgInfo = [
            SELECT IsSandbox, OrganizationType
            FROM Organization
            LIMIT 1
        ];
        return orgInfo.IsSandbox ||
            orgInfo.OrganizationType == 'Developer Edition';
    }

    /** @return Whether the current guest identity is enrolled, even with admission disabled. */
    public static Boolean enrolledGuest() {
        return requiresMarker(UserInfo.getUserType(), UserInfo.getUserId());
    }

    /** Pure enrollment decision; entry points always supply the real running identity. */
    public static Boolean requiresMarker(String userType, Id actor) {
        if (userType != 'Guest') {
            return false;
        }
        for (Final_Upload_Proof_Policy__mdt policy : policies().values()) {
            if (sameId(policy.Guest_User_Id__c, actor)) {
                return true;
            }
        }
        return false;
    }

    /** @param actor Actual upload actor. @param key Server-stored policy key. @return Admission decision. */
    public static Boolean enabled(Id actor, String key) {
        Final_Upload_Proof_Policy__mdt policy = policies().get(key);
        if (policy == null || !policy.Admission_Enabled__c) {
            return false;
        }
        if (!String.isBlank(policy.Actor_User_Id__c)) {
            return String.isBlank(policy.Guest_User_Id__c) &&
                sameId(policy.Actor_User_Id__c, actor);
        }
        return String.isBlank(policy.Guest_User_Id__c)
            ? actor == UserInfo.getUserId() && UserInfo.getUserType() != 'Guest'
            : sameId(policy.Guest_User_Id__c, actor);
    }

    /** @param actor Approved running user or enrolled guest. @return Enabled policy key, or null. */
    public static String policyKey(Id actor) {
        for (String key : policies().keySet()) {
            if (enabled(actor, key)) {
                return key;
            }
        }
        return null;
    }

    /** @param extension Platform-derived extension. @return Whether allowed by this proof. */
    public static Boolean allowedExtension(String extension) {
        return extension != null &&
            new Set<String>{
                    'pdf',
                    'jpg',
                    'jpeg',
                    'png',
                    'webp',
                    'txt',
                    'docx',
                    'xlsx'
                }
                .contains(extension.toLowerCase());
    }

    private static Boolean sameId(String configured, Id actual) {
        if (String.isBlank(configured)) {
            return false;
        }
        try {
            return Id.valueOf(configured) == actual;
        } catch (StringException invalidId) {
            return false;
        }
    }

    private static Map<String, Final_Upload_Proof_Policy__mdt> policies() {
        return Test.isRunningTest() && testPolicies != null
            ? testPolicies
            : Final_Upload_Proof_Policy__mdt.getAll();
    }
}
