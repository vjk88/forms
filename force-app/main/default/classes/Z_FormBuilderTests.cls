@isTest
private class Z_FormBuilderTests {

    @isTest
    static void testAISpecGenerator() {
        // 1. Create target Form
        Z_Form__c form = new Z_Form__c(
            Name = 'Test Primary Form',
            Z_Primary_Object__c = 'Account',
            Z_Status__c = 'Draft',
            Z_Form_Type__c = 'Form'
        );
        insert as user form;

        // 2. Prepare AI Request
        Z_FormAISpecGenerator.AIRequest req = new Z_FormAISpecGenerator.AIRequest();
        req.formId = form.Id;
        req.userPrompt = 'Make this a split-page dark theme onboarding form';

        // 3. Execute Action
        Test.startTest();
        List<Z_FormAISpecGenerator.AIResponse> responses = Z_FormAISpecGenerator.generateFormJSON(new List<Z_FormAISpecGenerator.AIRequest>{ req });
        Test.stopTest();

        // 4. Assertions
        System.assertEquals(1, responses.size(), 'Should return exactly one response');
        System.assertNotEquals(null, responses[0].updatedFormDefinition, 'Should return updated JSON string');
        
        Z_Form__c updatedForm = [SELECT Id, Z_Form_Definition_JSON__c FROM Z_Form__c WHERE Id = :form.Id];
        System.assertNotEquals(null, updatedForm.Z_Form_Definition_JSON__c, 'Definition JSON should be saved');
        System.assert(updatedForm.Z_Form_Definition_JSON__c.contains('split-page'), 'Layout should be split-page');
    }

    @isTest
    static void testFormSubmissionController() {
        // 1. Create parent Form
        Z_Form__c form = new Z_Form__c(
            Name = 'Test Primary Form',
            Z_Primary_Object__c = 'Account',
            Z_Status__c = 'Draft',
            Z_Form_Type__c = 'Form'
        );
        insert as user form;

        // 2. Setup Form Definition JSON
        String mockDefinition = '{' +
            '"layout": {' +
                '"variant": "single-page"' +
            '},' +
            '"pages": [' +
                '{' +
                    '"pageId": "page_1",' +
                    '"sections": [' +
                        '{' +
                            '"sectionId": "sec_1",' +
                            '"elements": [' +
                                '{' +
                                    '"key": "acc_name",' +
                                    '"type": "field",' +
                                    '"fieldApiName": "Name",' +
                                    '"required": true' +
                                '}' +
                            ']' +
                        '}' +
                    ']' +
                '}' +
            '],' +
            '"relatedLists": [' +
                '{' +
                    '"relationshipName": "Contacts",' +
                    '"childSObject": "Contact",' +
                    '"displayMode": "table",' +
                    '"fields": [' +
                        '{' +
                            '"key": "con_lastname",' +
                            '"fieldApiName": "LastName",' +
                            '"required": true' +
                        '}' +
                    ']' +
                '}' +
            ']' +
        '}';

        // 3. Create Version
        Z_Form_Version__c version = new Z_Form_Version__c(
            Z_Form__c = form.Id,
            Z_Version_Number__c = 1,
            Z_Is_Active__c = true,
            Z_Form_Definition_JSON__c = mockDefinition,
            Z_Schema_Snapshot__c = '{}',
            Z_Published_Date__c = System.now()
        );
        insert as user version;

        // Update Form's Active Version
        form.Z_Active_Version__c = version.Id;
        update as user form;

        // 4. Create Submission Payload
        Z_FormSubmissionController.SubmissionPayload payload = new Z_FormSubmissionController.SubmissionPayload();
        payload.formVersionId = version.Id;
        payload.responseJson = '{"acc_name": "Acme AI Corp", "Contacts": [{"con_lastname": "Einstein"}]}';

        // 5. Submit
        Test.startTest();
        Map<String, String> submitResult = Z_FormSubmissionController.processSubmission(payload);
        Test.stopTest();

        // 6. Assertions
        System.assertEquals('SUCCESS', submitResult.get('status'), 'Submission should be successful');
        Id generatedAccountId = (Id) submitResult.get('recordId');
        System.assertNotEquals(null, generatedAccountId, 'Should return generated record ID');

        // Verify Account was created
        Account acc = [SELECT Id, Name FROM Account WHERE Id = :generatedAccountId];
        System.assertEquals('Acme AI Corp', acc.Name, 'Account name should match payload');

        // Verify Contact was created and linked
        Contact con = [SELECT Id, LastName, AccountId FROM Contact WHERE AccountId = :generatedAccountId];
        System.assertEquals('Einstein', con.LastName, 'Contact lastname should match');

        // Verify Submission Record Log
        Z_Form_Submission__c subLog = [SELECT Id, Z_Primary_Record_Id__c, Z_Status__c 
                                       FROM Z_Form_Submission__c 
                                       WHERE Z_Form_Version__c = :version.Id];
        System.assertEquals(String.valueOf(generatedAccountId), subLog.Z_Primary_Record_Id__c, 'Submission should log primary ID');
        System.assertEquals('Processed', subLog.Z_Status__c, 'Submission status should be Processed');
    }
}
