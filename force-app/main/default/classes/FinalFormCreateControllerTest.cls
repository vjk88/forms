@isTest
private class FinalFormCreateControllerTest {
    @isTest
    static void getUpdatableObjects_includesCommonObjects() {
        Test.startTest();
        List<Map<String, String>> objs = FinalFormCreateController.getUpdatableObjects();
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
        for (String v : values) {
            System.assert(
                !v.endsWith('Share') &&
                    !v.endsWith('History') &&
                    !v.endsWith('__Feed') &&
                    !v.endsWith('__Tag') &&
                    !v.endsWith('ChangeEvent'),
                'system tables never offered: ' + v
            );
        }
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
            SELECT
                Name,
                Primary_Context_Object__c,
                Layout_Mode__c,
                Submission_Storage__c
            FROM Form__c
            WHERE Id = :formId
        ];
        System.assertEquals('Contact Intake', form.Name);
        System.assertEquals('Contact', form.Primary_Context_Object__c);
        // DATA_MODEL_DELTA tripwire: deprecated/retired fields stay UNWRITTEN.
        // Layout truth is Spec_JSON layout.type — a picklist default must not
        // resurrect the old build's fields on new-world records.
        System.assertEquals(
            null,
            form.Layout_Mode__c,
            'Deprecated Layout_Mode__c must not be stamped on final-created forms'
        );
        System.assertEquals(
            null,
            form.Submission_Storage__c,
            'Retired Submission_Storage__c must not be stamped on final-created forms'
        );

        Form_Version__c v = [
            SELECT
                Spec_JSON__c,
                Engine_Version__c,
                Version_Number__c,
                Layout_Mode__c
            FROM Form_Version__c
            WHERE Id = :versionId
        ];
        System.assertEquals(1, v.Engine_Version__c);
        System.assertEquals(
            null,
            v.Layout_Mode__c,
            'Deprecated Layout_Mode__c must not be stamped on final-created versions'
        );
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
        Map<String, Object> options = (Map<String, Object>) layout.get(
            'options'
        );
        System.assertEquals(
            'oneAtATime',
            options.get('paneFlow'),
            'Conversational card must ride layout.options.paneFlow'
        );
        // a new Split form starts carded and Wide (owner 2026-10-25)
        Assert.areEqual(false, options.get('fullBleed'), 'starts carded');
        Assert.areEqual('wide', layout.get('maxWidth'), 'starts Wide');
    }

    // The table every new form starts from. finalLayoutRegistry's jest test
    // (newLayoutDefaults.test.js) pins the SAME literal, so the new-form
    // preview and the created form cannot drift apart.
    private static final String NEW_LAYOUT_TABLE =
        'scroll:medium:-|stepper:medium:-|tabs:medium:-|accordion:medium:-|' +
        'rail:medium:-|oneAtATime:medium:-|splitHero:wide:false';

    @IsTest
    static void layoutBlock_matchesTheSharedTable() {
        List<String> rows = new List<String>();
        for (
            String layout : new List<String>{
                'scroll',
                'stepper',
                'tabs',
                'accordion',
                'rail',
                'oneAtATime',
                'splitHero'
            }
        ) {
            Map<String, Object> block = FinalFormCreateController.layoutBlock(
                layout,
                null
            );
            Map<String, Object> options = (Map<String, Object>) block.get(
                'options'
            );
            Object bleed = options.get('fullBleed');
            rows.add(
                layout +
                    ':' +
                    block.get('maxWidth') +
                    ':' +
                    (bleed == null ? '-' : String.valueOf(bleed))
            );
        }
        Assert.areEqual(NEW_LAYOUT_TABLE, String.join(rows, '|'), 'table');
    }

    @IsTest
    static void createForm_plainSplitHero_startsCardedAndWide() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createForm(
            'Split Start',
            'Contact',
            'splitHero',
            'marbleSplit',
            null
        );
        Test.stopTest();
        Map<String, Object> layout = specLayout((Id) res.get('versionId'));
        Map<String, Object> options = (Map<String, Object>) layout.get(
            'options'
        );
        Assert.areEqual(false, options.get('fullBleed'), 'starts carded');
        Assert.areEqual('wide', layout.get('maxWidth'), 'starts Wide');
        Assert.isFalse(options.containsKey('paneFlow'), 'no pane flow');
    }

    @IsTest
    static void createForm_otherLayouts_startMediumWithoutBleedChoice() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createForm(
            'OAAT Start',
            'Contact',
            'oneAtATime',
            'sandstone',
            null
        );
        Test.stopTest();
        Map<String, Object> layout = specLayout((Id) res.get('versionId'));
        Map<String, Object> options = (Map<String, Object>) layout.get(
            'options'
        );
        Assert.areEqual('medium', layout.get('maxWidth'), 'Medium');
        // unset = One at a time keeps its open page (full-bleed default ON)
        Assert.isFalse(options.containsKey('fullBleed'), 'no bleed choice');
    }

    @IsTest
    static void createFreeform_splitHero_startsCardedAndWide() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createFreeformFromTemplate(
            'blank',
            'Split freeform',
            'marbleSplit',
            'splitHero',
            null
        );
        Test.stopTest();
        Map<String, Object> layout = specLayout((Id) res.get('versionId'));
        Map<String, Object> options = (Map<String, Object>) layout.get(
            'options'
        );
        Assert.areEqual(false, options.get('fullBleed'), 'starts carded');
        Assert.areEqual('wide', layout.get('maxWidth'), 'starts Wide');
    }

    private static Map<String, Object> specLayout(Id versionId) {
        Form_Version__c v = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :versionId
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        return (Map<String, Object>) spec.get('layout');
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

    // ---------------------------------------------------------- Freeform

    @IsTest
    static void createFreeform_hasNoObjectAnywhere() {
        Test.startTest();
        Map<String, Object> res = FinalFormCreateController.createFreeformFromTemplate(
            'blank',
            'Partner application',
            'nordic',
            'stepper',
            null
        );
        Test.stopTest();

        Form__c form = [
            SELECT Name, Form_Type__c, Primary_Context_Object__c, Status__c
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        Assert.areEqual('Freeform', form.Form_Type__c, 'typed Freeform');
        Assert.areEqual('Partner application', form.Name, 'named');
        // The survey path writes a placeholder 'Contact' here to satisfy an
        // old validation rule. Freeform must not: F2 reads this emptiness.
        Assert.isNull(form.Primary_Context_Object__c, 'no placeholder object');

        Form_Version__c version = [
            SELECT Spec_JSON__c, Is_Active__c, Version_Number__c
            FROM Form_Version__c
            WHERE Id = :(Id) res.get('versionId')
        ];
        Assert.isTrue(version.Is_Active__c, 'draft is active');
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        Map<String, Object> formBlock = (Map<String, Object>) spec.get('form');
        Assert.areEqual('freeform', formBlock.get('type'), 'spec type');
        Assert.isFalse(
            formBlock.containsKey('targetObject'),
            'a freeform spec never names an object'
        );
        Assert.areEqual(
            'freeform',
            FinalFormTypes.fromSpec(spec),
            'the type table agrees'
        );
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        Assert.areEqual('stepper', layout.get('type'), 'chosen layout');
    }

    @IsTest
    static void createFreeform_startsEmpty() {
        Map<String, Object> res = FinalFormCreateController.createFreeformFromTemplate(
            'blank',
            null,
            null,
            null,
            null
        );
        Form__c form = [
            SELECT Name
            FROM Form__c
            WHERE Id = :(Id) res.get('formId')
        ];
        Assert.areEqual('Untitled Freeform', form.Name, 'default name');
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            [
                SELECT Spec_JSON__c
                FROM Form_Version__c
                WHERE Id = :(Id) res.get('versionId')
            ]
            .Spec_JSON__c
        );
        Map<String, Object> layout = (Map<String, Object>) spec.get('layout');
        Assert.areEqual('scroll', layout.get('type'), 'default layout');
        List<Object> pages = (List<Object>) spec.get('pages');
        Map<String, Object> section = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) pages[0])
            .get('sections'))[0];
        // Owner ruling: a blank freeform seeds nothing. Anything seeded is
        // something every author has to delete.
        Assert.areEqual(
            0,
            ((List<Object>) section.get('elements')).size(),
            'no starter questions'
        );
    }

    @IsTest
    static void createFreeform_refusesNonsenseInput() {
        // paneFlow belongs to splitHero alone
        Boolean threwPaneFlow = false;
        try {
            FinalFormCreateController.createFreeformFromTemplate(
                'blank',
                'x',
                null,
                'scroll',
                'oneAtATime'
            );
        } catch (AuraHandledException e) {
            threwPaneFlow = true;
        }
        Assert.isTrue(threwPaneFlow, 'pane flow off splitHero is refused');

        Boolean threwTemplate = false;
        try {
            FinalFormCreateController.createFreeformFromTemplate(
                'partner-application',
                'x',
                null,
                null,
                null
            );
        } catch (AuraHandledException e) {
            threwTemplate = true;
        }
        Assert.isTrue(
            threwTemplate,
            'an unbuilt template is refused, not silently blanked'
        );

        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form__c WHERE Name = 'x'],
            'nothing was left behind by either refusal'
        );
    }
}
