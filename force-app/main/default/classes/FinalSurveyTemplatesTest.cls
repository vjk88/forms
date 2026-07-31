/** S5 — the gallery's survey templates (FinalFormCreateController). */
@isTest
private class FinalSurveyTemplatesTest {
    @isTest
    static void csatTemplateCreatesDraftSurvey() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'csat'
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name, Form_Type__c
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        System.assertEquals('Survey', form.Form_Type__c, 'survey typed');
        System.assertEquals('CSAT Pulse', form.Name, 'named');
        Form_Version__c v = [
            SELECT Spec_JSON__c, Is_Active__c
            FROM Form_Version__c
            WHERE Id = :(Id) res.get('versionId')
        ];
        System.assert(v.Is_Active__c, 'active version');
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        Map<String, Object> formNode = (Map<String, Object>) spec.get('form');
        System.assertEquals('survey', formNode.get('type'), 'spec type');
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        System.assertEquals(
            'oneAtATime',
            layout.get('type'),
            'creation-flow ruling: oneAtATime default'
        );
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Survey_Topic__c WHERE Name = 'Satisfaction'],
            'topic minted once into the vocabulary'
        );
    }

    @isTest
    static void eventTemplateIsAnonymous() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'event'
        );
        Test.stopTest();
        Form_Version__c v = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :(Id) res.get('versionId')
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        Map<String, Object> settings = (Map<String, Object>) spec.get(
            'settings'
        );
        System.assertEquals(
            true,
            settings.get('anonymous'),
            'event feedback ships anonymous'
        );
    }

    @isTest
    static void templatesReuseTopicsByName() {
        Test.startTest();
        FinalFormCreateController.createSurveyFromTemplate('csat');
        FinalFormCreateController.createSurveyFromTemplate('csat');
        Test.stopTest();
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Survey_Topic__c WHERE Name = 'Satisfaction'],
            'second template REUSES the topic — vocabulary never splits'
        );
    }

    @isTest
    static void unknownTemplateRejected() {
        Boolean threw = false;
        try {
            FinalFormCreateController.createSurveyFromTemplate('nope');
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'unknown key rejected');
    }
}
