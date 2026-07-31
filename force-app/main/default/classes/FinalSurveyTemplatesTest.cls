/** S5 — the gallery's survey templates (FinalFormCreateController). */
@isTest
private class FinalSurveyTemplatesTest {
    @isTest
    static void csatTemplateCreatesDraftSurvey() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'csat',
            null,
            null,
            null
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
            'event',
            null,
            null,
            null
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
        FinalFormCreateController.createSurveyFromTemplate(
            'csat',
            null,
            null,
            null
        );
        FinalFormCreateController.createSurveyFromTemplate(
            'csat',
            null,
            null,
            null
        );
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
            FinalFormCreateController.createSurveyFromTemplate(
                'nope',
                null,
                null,
                null
            );
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'unknown key rejected');
    }

    @isTest
    static void customNameOverridesTemplateDefault() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'nps',
            '  Quarterly Pulse  ',
            null,
            null
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        System.assertEquals(
            'Quarterly Pulse',
            form.Name,
            'trimmed custom name wins'
        );
    }

    @isTest
    static void blankTemplateCreatesEmptySurvey() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'blank',
            null,
            null,
            null
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name, Form_Type__c
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        System.assertEquals('Untitled Survey', form.Name, 'default name');
        System.assertEquals('Survey', form.Form_Type__c, 'survey typed');
    }

    @isTest
    static void themeAndObjectStampTheSpec() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'csat',
            null,
            'editorialIvory',
            'Contact'
        );
        Test.stopTest();
        Form__c form = [
            SELECT Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        System.assertEquals(
            'Contact',
            form.Primary_Context_Object__c,
            'optional object lands on the Form record'
        );
        Form_Version__c v = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :(Id) res.get('versionId')
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        Map<String, Object> theme = (Map<String, Object>) spec.get('theme');
        System.assertEquals('builtin', theme.get('source'), 'builtin theme');
        System.assertEquals('editorialIvory', theme.get('name'), 'theme key');
        Map<String, Object> formNode = (Map<String, Object>) spec.get('form');
        System.assertEquals(
            'Contact',
            formNode.get('targetObject'),
            'optional object stamped into the spec for field mapping'
        );
    }

    @isTest
    static void badObjectRejected() {
        Boolean threw = false;
        try {
            FinalFormCreateController.createSurveyFromTemplate(
                'csat',
                null,
                null,
                'No_Such_Object__c'
            );
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'nonexistent object rejected');
    }

    @isTest
    static void blankTemplateHonorsTheTypedName() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createSurveyFromTemplate(
            'blank',
            '  Lunch Feedback  ',
            null,
            null
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name, Form_Type__c
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        System.assertEquals('Lunch Feedback', form.Name, 'typed name, trimmed');
        System.assertEquals('Survey', form.Form_Type__c, 'survey typed');
    }
}
