@isTest
private class FinalFormCreateControllerTest {
    @isTest
    static void getUpdatableObjects_includesCommonObjects() {
        Test.startTest();
        List<Map<String, String>> objs =
            FinalFormCreateController.getUpdatableObjects();
        Test.stopTest();

        System.assert(!objs.isEmpty(), 'Expected some updatable objects');
        Set<String> values = new Set<String>();
        for (Map<String, String> o : objs) {
            values.add(o.get('value'));
        }
        System.assert(
            values.contains('Contact'),
            'Contact should be an updatable object'
        );
        // Sorted by label — first label <= second.
        if (objs.size() > 1) {
            System.assert(
                objs[0].get('label').toLowerCase() <=
                    objs[1].get('label').toLowerCase(),
                'Objects should be label-sorted'
            );
        }
    }

    @isTest
    static void createForm_buildsDraftWithSpec() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createForm(
            'Contact Intake',
            'Contact',
            'stepper',
            'nordic',
            null
        );
        Test.stopTest();

        Id formId = (Id) res.get('formId');
        Id versionId = (Id) res.get('versionId');
        System.assertNotEquals(null, formId, 'formId returned');
        System.assertNotEquals(null, versionId, 'versionId returned');

        Form__c form = [
            SELECT Name, Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :formId
        ];
        System.assertEquals('Contact Intake', form.Name);
        System.assertEquals('Contact', form.Primary_Context_Object__c);

        Form_Version__c v = [
            SELECT Spec_JSON__c, Engine_Version__c, Version_Number__c
            FROM Form_Version__c
            WHERE Id = :versionId
        ];
        System.assertEquals(1, v.Engine_Version__c);
        System.assert(
            String.isNotBlank(v.Spec_JSON__c),
            'Spec_JSON should be populated'
        );

        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        System.assertEquals(1, (Integer) spec.get('specVersion'));
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        System.assertEquals('stepper', layout.get('type'));
        Map<String, Object> theme = (Map<String, Object>) spec.get('theme');
        System.assertEquals('nordic', theme.get('name'));
        Map<String, Object> formBlock = (Map<String, Object>) spec.get('form');
        System.assertEquals('Contact', formBlock.get('targetObject'));

        List<Object> pages = (List<Object>) spec.get('pages');
        System.assertEquals(1, pages.size(), 'one starter page');
        Map<String, Object> page = (Map<String, Object>) pages[0];
        List<Object> sections = (List<Object>) page.get('sections');
        Map<String, Object> section = (Map<String, Object>) sections[0];
        List<Object> els = (List<Object>) section.get('elements');
        System.assert(!els.isEmpty(), 'starter should seed some fields');
    }

    @isTest
    static void createForm_splitHeroPaneFlow_landsInLayoutOptions() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createForm(
            'VIP Sign-in',
            'Contact',
            'splitHero',
            'auraSplit',
            'oneAtATime'
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
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        System.assertEquals('splitHero', layout.get('type'));
        Map<String, Object> options = (Map<String, Object>) layout.get('options');
        System.assertEquals(
            'oneAtATime',
            options.get('paneFlow'),
            'Conversational card must ride layout.options.paneFlow'
        );
    }

    @isTest
    static void createForm_rejectsPaneFlowOffSplitHero() {
        Boolean threw = false;
        try {
            FinalFormCreateController.createForm(
                'X',
                'Contact',
                'stepper',
                'nordic',
                'oneAtATime'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(
            threw,
            'paneFlow on a non-splitHero layout must be rejected'
        );
    }

    @isTest
    static void createForm_rejectsBlankName() {
        assertBadInput('', 'Contact');
    }

    @isTest
    static void createForm_rejectsBlankObject() {
        assertBadInput('X', '');
    }

    @isTest
    static void createForm_rejectsUnknownObject() {
        assertBadInput('X', 'Not_A_Real_Object__x');
    }

    // AuraHandledException.getMessage() is "Script-thrown exception" in test
    // context, so we assert the exception TYPE, not its user-facing text.
    private static void assertBadInput(String name, String obj) {
        Boolean threw = false;
        try {
            FinalFormCreateController.createForm(
                name,
                obj,
                'scroll',
                'nordic',
                null
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(
            threw,
            'Expected an AuraHandledException for input: ' + name + '/' + obj
        );
    }
}
