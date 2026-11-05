@IsTest
private class FinalSaveCopyActionTest {
    @IsTest
    static void makesTheCopyAndReportsFailuresAsResults() {
        Form__c form = new Form__c(
            Name = 'Action test',
            Form_Type__c = 'Survey'
        );
        insert form;
        Form_Version__c v = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"type":"survey"},"pages":[]}'
        );
        insert v;
        Form_Response__c r = new Form_Response__c(
            Form_Version__c = v.Id,
            Status__c = 'Completed'
        );
        insert r;

        Test.startTest();
        List<FinalSaveCopyAction.Result> out = FinalSaveCopyAction.run(
            new List<Id>{ r.Id, UserInfo.getUserId() }
        );
        Test.stopTest();

        Assert.areEqual(
            'Saved',
            out[0].status,
            out[0].message == null ? 'saved' : out[0].message
        );
        Assert.areEqual('Failed', out[1].status, 'a user is not a submission');
        Assert.isNotNull(out[1].message, 'and says why');
    }
}
