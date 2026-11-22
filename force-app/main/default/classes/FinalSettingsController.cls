/**
 * FinalSettingsController - the org-wide Settings tab (finalSettings).
 *
 * Anyone with access to this class may READ the settings; only people holding
 * the custom permission Final_Manage_Settings may change them or run Test
 * connection (which makes a real, billable provider call as that person).
 * The settings live in one protected row of Final_Settings__c named 'org'.
 */
public with sharing class FinalSettingsController {
    private static final String PERM = 'Final_Manage_Settings';
    private static final String SETTINGS_NAME = 'org';
    private static final String NEED_PERMISSION = 'You need the Manage form settings permission to change this.';
    private static final String BAD_PROVIDER = 'Choose a provider from the list.';
    private static final String BAD_CLASS = 'That Apex class can\'t be used. It must exist, have a public constructor with no arguments, and implement FinalAddressProvider.';
    private static final Set<String> PROVIDERS = new Set<String>{
        'None',
        'Google',
        'Custom'
    };

    /** Test seam: pretend the user can / cannot manage settings. */
    @TestVisible
    private static Boolean manageOverride;

    public class AddressSettings {
        @AuraEnabled
        public String provider;
        @AuraEnabled
        public String apexClass;
        @AuraEnabled
        public Boolean canManage;
    }

    public class TestResult {
        @AuraEnabled
        public Boolean ok;
        @AuraEnabled
        public Integer count;
        @AuraEnabled
        public String code;
    }

    private static Boolean canManage() {
        return manageOverride != null
            ? manageOverride
            : FeatureManagement.checkPermission(PERM);
    }

    private static AuraHandledException refuse(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }

    @AuraEnabled
    public static AddressSettings getAddressSettings() {
        Final_Settings__c s = Final_Settings__c.getInstance(SETTINGS_NAME);
        AddressSettings r = new AddressSettings();
        r.provider = s == null || String.isBlank(s.Address_Provider__c)
            ? 'None'
            : s.Address_Provider__c;
        r.apexClass = s == null ? null : s.Address_Apex_Class__c;
        r.canManage = canManage();
        return r;
    }

    @AuraEnabled
    public static void saveAddressSettings(String provider, String apexClass) {
        if (!canManage()) {
            throw refuse(NEED_PERMISSION);
        }
        if (provider == null || !PROVIDERS.contains(provider)) {
            throw refuse(BAD_PROVIDER);
        }
        String cls = null;
        if (provider == 'Custom') {
            cls = apexClass == null ? null : apexClass.trim();
            if (
                String.isBlank(cls) || !FinalAddressService.isUsableClass(cls)
            ) {
                throw refuse(BAD_CLASS);
            }
        }
        Final_Settings__c s = Final_Settings__c.getInstance(SETTINGS_NAME);
        if (s == null) {
            s = new Final_Settings__c(Name = SETTINGS_NAME);
            s.Address_Provider__c = provider;
            s.Address_Apex_Class__c = cls;
            insert s;
        } else {
            Final_Settings__c u = new Final_Settings__c(Id = s.Id);
            u.Address_Provider__c = provider;
            u.Address_Apex_Class__c = cls;
            update u;
        }
    }

    /** Never throws for a provider failure: the code comes back so the screen
     *  can explain it. */
    @AuraEnabled
    public static TestResult testAddressConnection(
        String provider,
        String apexClass
    ) {
        if (!canManage()) {
            throw refuse(NEED_PERMISSION);
        }
        TestResult r = new TestResult();
        try {
            r.count = FinalAddressService.testProvider(provider, apexClass);
            r.ok = true;
        } catch (FinalAddressService.AddressException e) {
            r.ok = false;
            r.code = e.getMessage();
        }
        return r;
    }
}
