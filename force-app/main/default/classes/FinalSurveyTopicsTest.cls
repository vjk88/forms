/** S2c — the managed topic vocabulary endpoints (FinalStudioController). */
@isTest
private class FinalSurveyTopicsTest {
    @isTest
    static void listReturnsActiveTopicsSorted() {
        insert new List<Survey_Topic__c>{
            new Survey_Topic__c(Name = 'Support'),
            new Survey_Topic__c(Name = 'Billing'),
            new Survey_Topic__c(Name = 'Retired', Active__c = false)
        };
        Test.startTest();
        List<FinalStudioController.TopicEntry> topics = FinalStudioController.listSurveyTopics();
        Test.stopTest();
        System.assertEquals(2, topics.size(), 'retired topics hidden');
        System.assertEquals('Billing', topics[0].name, 'sorted by name');
        System.assertEquals('Support', topics[1].name, 'sorted by name');
    }

    @isTest
    static void createMintsOnceAndReusesByName() {
        Test.startTest();
        FinalStudioController.TopicEntry first = FinalStudioController.createSurveyTopic(
            '  Onboarding  '
        );
        FinalStudioController.TopicEntry again = FinalStudioController.createSurveyTopic(
            'Onboarding'
        );
        Test.stopTest();
        System.assertEquals('Onboarding', first.name, 'trimmed');
        System.assertEquals(first.id, again.id, 'same name reuses the record');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Survey_Topic__c],
            'no duplicate vocabulary rows'
        );
    }

    @isTest
    static void createRejectsBlank() {
        Boolean threw = false;
        try {
            FinalStudioController.createSurveyTopic('   ');
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'blank topic rejected');
    }
}
