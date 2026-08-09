@isTest
public class TestDataFactory {
    public static List<Form__c> createForms(
        Integer count,
        String formType,
        String primaryObject,
        Boolean doInsert
    ) {
        List<Form__c> forms = new List<Form__c>();
        for (Integer i = 0; i < count; i++) {
            forms.add(
                new Form__c(
                    Name = 'Test Form ' + i,
                    Form_Type__c = formType,
                    Primary_Context_Object__c = primaryObject,
                    Status__c = 'Draft'
                )
            );
        }
        if (doInsert) {
            insert as user forms;
        }
        return forms;
    }

    public static List<Form_Version__c> createFormVersions(
        Integer count,
        Id formId,
        Boolean isActive,
        Boolean doInsert
    ) {
        List<Form_Version__c> versions = new List<Form_Version__c>();
        for (Integer i = 0; i < count; i++) {
            versions.add(
                new Form_Version__c(
                    Form__c = formId,
                    Version_Number__c = i + 1,
                    Is_Active__c = isActive,
                    Layout_Config__c = '{"pages":[]}',
                    Published_Date__c = System.now()
                )
            );
        }
        if (doInsert) {
            insert as user versions;
        }
        return versions;
    }

    /**
     * Creates one FinalDesign specification-backed version for focused tests.
     * @param formId Parent form identifier.
     * @param versionNumber Version sequence number.
     * @param isActive Whether this is the active version.
     * @param specJson FinalDesign authoring specification.
     * @param doInsert Whether to persist the version.
     * @return Prepared or inserted version record.
     */
    public static Form_Version__c createFinalFormVersion(
        Id formId,
        Integer versionNumber,
        Boolean isActive,
        String specJson,
        Boolean doInsert
    ) {
        Form_Version__c version = new Form_Version__c(
            Form__c = formId,
            Version_Number__c = versionNumber,
            Is_Active__c = isActive,
            Spec_JSON__c = specJson,
            Engine_Version__c = 1
        );
        if (doInsert) {
            insert as user version;
        }
        return version;
    }
}
