/** Curated unbound Freeform templates and their creation contracts. */
@isTest
private class FinalFreeformTemplatesTest {
    private static final List<String> TEMPLATE_KEYS = new List<String>{
        'contact',
        'eventRegistration',
        'support',
        'partner'
    };
    private static final List<String> TEMPLATE_NAMES = new List<String>{
        'Contact Request',
        'Event Registration',
        'Support Request',
        'Partner Application'
    };

    @isTest
    static void eachCuratedTemplateCreatesUnboundQuestions() {
        List<Id> formIds = new List<Id>();
        List<Id> versionIds = new List<Id>();
        List<Map<String, Object>> results = new List<Map<String, Object>>();
        Test.startTest();
        for (Integer i = 0; i < TEMPLATE_KEYS.size(); i++) {
            Map<String, Object> result = FinalFormCreateController.createFreeformFromTemplate(
                TEMPLATE_KEYS[i],
                null,
                null,
                null,
                null
            );
            results.add(result);
            formIds.add((Id) result.get('formId'));
            versionIds.add((Id) result.get('versionId'));
        }
        Test.stopTest();
        Map<Id, Form__c> formsById = new Map<Id, Form__c>(
            [
                SELECT Name, Form_Type__c, Primary_Context_Object__c
                FROM Form__c
                WHERE Id IN :formIds
            ]
        );
        Map<Id, Form_Version__c> versionsById = new Map<Id, Form_Version__c>(
            [
                SELECT Spec_JSON__c, Is_Active__c
                FROM Form_Version__c
                WHERE Id IN :versionIds
            ]
        );
        for (Integer i = 0; i < results.size(); i++) {
            Map<String, Object> result = results[i];
            Form__c form = formsById.get((Id) result.get('formId'));
            Assert.areEqual(
                TEMPLATE_NAMES[i],
                form.Name,
                'default template title'
            );
            Assert.areEqual(
                'Freeform',
                form.Form_Type__c,
                'Freeform record type'
            );
            Assert.isTrue(
                String.isBlank(form.Primary_Context_Object__c),
                'no object placeholder'
            );

            Form_Version__c version = versionsById.get(
                (Id) result.get('versionId')
            );
            Assert.isTrue(version.Is_Active__c, 'active initial version');
            Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
                version.Spec_JSON__c
            );
            Map<String, Object> formNode = (Map<String, Object>) spec.get(
                'form'
            );
            Assert.areEqual(
                'freeform',
                formNode.get('type'),
                'spec remains Freeform'
            );
            Assert.isFalse(
                formNode.containsKey('targetObject'),
                'no object in spec'
            );
            Assert.isFalse(
                spec.containsKey('mapping'),
                'no mapping configuration'
            );

            List<Object> pages = (List<Object>) spec.get('pages');
            Assert.isTrue(pages.size() > 0, 'template has at least one page');
            Set<String> ids = new Set<String>();
            Boolean hasRequired = false;
            for (Object pageValue : pages) {
                Map<String, Object> page = (Map<String, Object>) pageValue;
                for (
                    Object sectionValue : (List<Object>) page.get('sections')
                ) {
                    Map<String, Object> section = (Map<String, Object>) sectionValue;
                    for (
                        Object elementValue : (List<Object>) section.get(
                            'elements'
                        )
                    ) {
                        Map<String, Object> element = (Map<String, Object>) elementValue;
                        String id = (String) element.get('id');
                        Assert.isTrue(
                            ids.add(id),
                            'question ids are unique within template'
                        );
                        Assert.isTrue(
                            id.startsWith('el_'),
                            'question id has stable prefix'
                        );
                        Assert.areEqual(
                            'field',
                            element.get('type'),
                            'supported general input'
                        );
                        Assert.isFalse(
                            element.containsKey('binding') &&
                            element.get('binding') != null,
                            'no object binding'
                        );
                        Assert.isFalse(
                            element.containsKey('analytics'),
                            'no topics or analytics'
                        );
                        if ((Boolean) element.get('required')) {
                            List<Object> validations = (List<Object>) element.get(
                                'validation'
                            );
                            Assert.areEqual(
                                'required',
                                ((Map<String, Object>) validations[0])
                                    .get('type'),
                                'required questions include required runtime validation'
                            );
                        }
                        String inputType = (String) ((Map<String, Object>) element.get(
                                'config'
                            ))
                            .get('inputType');
                        Assert.isTrue(
                            new Set<String>{
                                    'text',
                                    'email',
                                    'phone',
                                    'textarea',
                                    'url',
                                    'date',
                                    'checkbox',
                                    'number'
                                }
                                .contains(inputType),
                            'input type is supported and not file or signature'
                        );
                        hasRequired =
                            hasRequired || (Boolean) element.get('required');
                    }
                }
            }
            Assert.isTrue(hasRequired, 'each template has required essentials');
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Survey_Topic__c],
            'freeform templates do not create topics'
        );
    }

    @isTest
    static void blankTemplateRemainsEmptyAndCustomNameWins() {
        Test.startTest();
        Map<String, Object> result = FinalFormCreateController.createFreeformFromTemplate(
            'blank',
            '  My Blank Form  ',
            null,
            null,
            null
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name
            FROM Form__c
            WHERE Id = :(Id) result.get('formId')
        ];
        Assert.areEqual(
            'My Blank Form',
            form.Name,
            'trimmed name overrides default'
        );
        Form_Version__c version = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :(Id) result.get('versionId')
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        List<Object> pages = (List<Object>) spec.get('pages');
        Map<String, Object> page = (Map<String, Object>) pages[0];
        Map<String, Object> section = (Map<String, Object>) ((List<Object>) page.get(
            'sections'
        ))[0];
        Assert.areEqual(
            'My Blank Form',
            section.get('title'),
            'blank section title follows form name'
        );
        Assert.areEqual(
            0,
            ((List<Object>) section.get('elements')).size(),
            'blank remains empty'
        );
    }

    @isTest
    static void honorsLayoutThemePaneFlowAndCustomName() {
        Test.startTest();
        Map<String, Object> result = FinalFormCreateController.createFreeformFromTemplate(
            'support',
            '  Help Desk  ',
            'editorialIvory',
            'splitHero',
            'oneAtATime'
        );
        Test.stopTest();
        Form__c form = [
            SELECT Name
            FROM Form__c
            WHERE Id = :(Id) result.get('formId')
        ];
        Assert.areEqual('Help Desk', form.Name, 'trimmed custom name');
        Form_Version__c version = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :(Id) result.get('versionId')
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        Assert.areEqual('splitHero', layout.get('type'), 'layout override');
        Assert.areEqual(
            'oneAtATime',
            ((Map<String, Object>) layout.get('options')).get('paneFlow'),
            'pane flow override'
        );
        Assert.areEqual(
            'editorialIvory',
            ((Map<String, Object>) spec.get('theme')).get('name'),
            'theme override'
        );
    }

    @isTest
    static void unknownTemplateIsRejected() {
        Boolean rejected = false;
        try {
            FinalFormCreateController.createFreeformFromTemplate(
                'unknown',
                null,
                null,
                null,
                null
            );
        } catch (AuraHandledException exceptionValue) {
            rejected = true;
        }
        Assert.isTrue(rejected, 'unknown template key rejected');
    }
}
