@isTest
private class FormStudioControllerTest {

    @TestSetup
    static void setupTestData() {
        // Create 5 forms to have multiple records
        List<Form__c> forms = TestDataFactory.createForms(5, 'Form', 'Account', true);
        
        // For the first form, create a couple of versions
        TestDataFactory.createFormVersions(2, forms[0].Id, true, true);
    }

    @isTest
    static void testGetAllForms() {
        // When
        Test.startTest();
        List<Form__c> results = FormStudioController.getAllForms();
        Test.stopTest();

        // Then
        Assert.areEqual(5, results.size(), 'Should return all 5 forms');
        Assert.areEqual('Test Form 0', results[0].Name, 'First form name should match sorted list');
    }

    @isTest
    static void testGetFormVersions_ValidId() {
        // Given
        Form__c form = [SELECT Id FROM Form__c LIMIT 1];

        // When
        Test.startTest();
        List<Form_Version__c> versions = FormStudioController.getFormVersions(form.Id);
        Test.stopTest();

        // Then
        Assert.areEqual(2, versions.size(), 'Should return 2 versions');
    }

    @isTest
    static void testGetFormVersions_NullId() {
        // When
        Test.startTest();
        List<Form_Version__c> versions = FormStudioController.getFormVersions(null);
        Test.stopTest();

        // Then
        Assert.areEqual(0, versions.size(), 'Should return empty list for null ID');
    }

    @isTest
    static void testGetObjectFields_ValidObject() {
        // When
        Test.startTest();
        List<FormStudioController.FieldDTO> fields = FormStudioController.getObjectFields('Account');
        Test.stopTest();

        // Then
        Assert.isTrue(fields.size() > 0, 'Account should have fields returned');
        
        // Find a specific standard field to verify DTO mapping
        FormStudioController.FieldDTO nameField;
        for (FormStudioController.FieldDTO f : fields) {
            if (f.apiName == 'Name') {
                nameField = f;
                break;
            }
        }
        Assert.isNotNull(nameField, 'Name field should be returned');
        Assert.areEqual('STRING', nameField.type, 'Name field type should be STRING');
    }

    @isTest
    static void testGetObjectFields_NullOrBlank() {
        // When
        Test.startTest();
        List<FormStudioController.FieldDTO> fieldsNull = FormStudioController.getObjectFields(null);
        List<FormStudioController.FieldDTO> fieldsBlank = FormStudioController.getObjectFields('');
        Test.stopTest();

        // Then
        Assert.areEqual(0, fieldsNull.size(), 'Null input should return empty list');
        Assert.areEqual(0, fieldsBlank.size(), 'Blank input should return empty list');
    }

    @isTest
    static void testGetObjectFields_InvalidObject() {
        // When
        Test.startTest();
        List<FormStudioController.FieldDTO> fields = FormStudioController.getObjectFields('Invalid_Object_Name__c');
        Test.stopTest();

        // Then
        Assert.areEqual(0, fields.size(), 'Invalid object should return empty list');
    }

    @isTest
    static void testGetFormLayout_ValidId() {
        // Given
        Form_Version__c version = [SELECT Id FROM Form_Version__c LIMIT 1];

        // When
        Test.startTest();
        String layout = FormStudioController.getFormLayout(version.Id);
        Test.stopTest();

        // Then
        Assert.areEqual('{"pages":[]}', layout, 'Layout should match what was inserted');
    }

    @isTest
    static void testGetFormLayout_NullId() {
        // When
        Test.startTest();
        String layout = FormStudioController.getFormLayout(null);
        Test.stopTest();

        // Then
        Assert.isNull(layout, 'Should return null for null ID');
    }

    @isTest
    static void testGetFormLayout_InvalidId() {
        // Given
        // Generate a fake but valid formatted ID for Form_Version__c
        String fakeId = 'a00000000000000AAA';

        // When
        Test.startTest();
        String layout = FormStudioController.getFormLayout((Id) fakeId);
        Test.stopTest();

        // Then
        Assert.isNull(layout, 'Should return null for non-existent ID');
    }

    @isTest
    static void testOptionDTO_Comparable() {
        FormStudioController.OptionDTO opt1 = new FormStudioController.OptionDTO('Apple', '1');
        FormStudioController.OptionDTO opt2 = new FormStudioController.OptionDTO('Banana', '2');
        FormStudioController.OptionDTO opt3 = new FormStudioController.OptionDTO('apple', '3');

        Assert.isTrue(opt1.compareTo(opt2) < 0, 'Apple should be before Banana');
        Assert.isTrue(opt2.compareTo(opt1) > 0, 'Banana should be after Apple');
        Assert.areEqual(0, opt1.compareTo(opt3), 'Apple and apple should be equal (case-insensitive)');
    }

    @isTest
    static void testFieldDTO_Comparable() {
        FormStudioController.FieldDTO field1 = new FormStudioController.FieldDTO('Name', 'Name', 'STRING', true, true);
        FormStudioController.FieldDTO field2 = new FormStudioController.FieldDTO('Phone', 'Phone', 'PHONE', false, false);
        FormStudioController.FieldDTO field3 = new FormStudioController.FieldDTO('name', 'name', 'STRING', true, true);

        Assert.isTrue(field1.compareTo(field2) < 0, 'Name should be before Phone');
        Assert.isTrue(field2.compareTo(field1) > 0, 'Phone should be after Name');
        Assert.areEqual(0, field1.compareTo(field3), 'Name and name should be equal (case-insensitive)');
    }
}
