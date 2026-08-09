@IsTest
private class FinalStudioLifecycleControllerTest {
    @IsTest
    static void shouldReturnArchivedPosture_WhenStaleStudioUrlLoads() {
        Form__c form = TestDataFactory.createForms(1, 'Survey', null, true)[0];
        form.Name = 'Archived survey';
        form.Status__c = 'Archived';
        update as user form;
        TestDataFactory.createFinalFormVersion(
            form.Id,
            1,
            true,
            '{"specVersion":1}',
            true
        );

        Test.startTest();
        Map<String, Object> result = FinalStudioController.loadStudio(form.Id);
        Test.stopTest();

        Assert.isTrue(
            (Boolean) result.get('isArchived'),
            'Archived roots should not reopen an editable spec.'
        );
        Assert.isNull(
            result.get('specJson'),
            'The stale Studio route must not expose editable authoring JSON.'
        );
    }

    @IsTest
    static void shouldSeparateCurrentAndArchivedLibraryFilters() {
        List<Form__c> forms = TestDataFactory.createForms(
            2,
            'Form',
            'Account',
            true
        );
        forms[0].Name = 'Current form';
        forms[1].Name = 'Archived form';
        forms[1].Status__c = 'Archived';
        update as user forms;

        Test.startTest();
        List<Map<String, Object>> current = FinalStudioController.listForms(
            false
        );
        List<Map<String, Object>> archived = FinalStudioController.listForms(
            true
        );
        Test.stopTest();

        Assert.areEqual(
            1,
            current.size(),
            'Default library hides archived roots.'
        );
        Assert.areEqual(
            'Current form',
            current[0].get('name'),
            'Current filter should return the editable root.'
        );
        Assert.areEqual(1, archived.size(), 'Archived filter is explicit.');
        Assert.areEqual(
            'Archived',
            archived[0].get('status'),
            'Archived rows carry lifecycle status for Restore.'
        );
    }
}
