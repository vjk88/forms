@IsTest
private class FinalSpecControllerTest {
    private static final String SPEC_OLD = '{"specVersion":1,"marker":"old"}';
    private static final String SPEC_ACTIVE = '{"specVersion":1,"marker":"active"}';

    @TestSetup
    static void setup() {
        Form__c form = new Form__c(
            Name = 'Spec Test Form',
            Primary_Context_Object__c = 'Contact'
        );
        insert form;
        insert new List<Form_Version__c>{
            new Form_Version__c(
                Name = 'v1',
                Form__c = form.Id,
                Version_Number__c = 1,
                Is_Active__c = false,
                Spec_JSON__c = SPEC_OLD,
                Engine_Version__c = 1
            ),
            new Form_Version__c(
                Name = 'v2',
                Form__c = form.Id,
                Version_Number__c = 2,
                Is_Active__c = true,
                Spec_JSON__c = SPEC_ACTIVE,
                Engine_Version__c = 1
            )
        };
    }

    private static User makeViewerUser() {
        Profile p = [
            SELECT Id
            FROM Profile
            WHERE Name IN ('Standard User', 'Standard Platform User')
            ORDER BY Name
            LIMIT 1
        ];
        User u = new User(
            Alias = 'fspec',
            Email = 'finalspec@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'SpecViewer',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            UserName =
                'finalspec.' + System.currentTimeMillis() + '@example.com'
        );
        insert u;
        PermissionSet ps = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Form_Builder_Admin'
            LIMIT 1
        ];
        insert new PermissionSetAssignment(
            AssigneeId = u.Id,
            PermissionSetId = ps.Id
        );
        return u;
    }

    @IsTest
    static void returnsActiveVersionByFormId() {
        Form__c form = [SELECT Id FROM Form__c LIMIT 1];
        String spec;
        System.runAs(makeViewerUser()) {
            Test.startTest();
            spec = FinalSpecController.getSpec(form.Id, null);
            Test.stopTest();
        }
        Assert.isTrue(
            spec.contains('"marker":"active"'),
            'Expected the active version spec, got: ' + spec
        );
    }

    @IsTest
    static void returnsSpecificVersionById() {
        Form_Version__c v1 = [
            SELECT Id
            FROM Form_Version__c
            WHERE Version_Number__c = 1
            LIMIT 1
        ];
        String spec;
        System.runAs(makeViewerUser()) {
            Test.startTest();
            spec = FinalSpecController.getSpec(null, v1.Id);
            Test.stopTest();
        }
        Assert.isTrue(
            spec.contains('"marker":"old"'),
            'Expected version 1 spec, got: ' + spec
        );
    }

    @IsTest
    static void throwsWhenNoIdsGiven() {
        try {
            FinalSpecController.getSpec(null, null);
            Assert.fail('Expected AuraHandledException');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
        }
    }

    @IsTest
    static void throwsWhenNoActiveVersion() {
        Form__c bare = new Form__c(
            Name = 'No Versions',
            Primary_Context_Object__c = 'Contact'
        );
        insert bare;
        try {
            FinalSpecController.getSpec(bare.Id, null);
            Assert.fail('Expected AuraHandledException');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
        }
    }

    private static String resolvedSpec(String marker) {
        return '{"specVersion":1,"marker":"' + marker + '",' +
            '"resolved":{"tokens":{"--c-accent":"#123456"},"engineVersion":1,' +
            '"resolvedAt":"2026-07-06T00:00:00Z"}}';
    }

    @IsTest
    static void publishActivatesNewVersionAndDeactivatesPrior() {
        Form__c form = [SELECT Id FROM Form__c LIMIT 1];

        Test.startTest();
        Id publishedId = FinalSpecController.publishSpec(
            form.Id,
            resolvedSpec('published')
        );
        Test.stopTest();

        Form_Version__c published = [
            SELECT Is_Active__c, Version_Number__c, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :publishedId
        ];
        Assert.isTrue(published.Is_Active__c, 'New version active');
        Assert.areEqual(3, published.Version_Number__c.intValue(), 'max+1');
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM Form_Version__c
                WHERE Form__c = :form.Id AND Is_Active__c = true
            ],
            'Exactly ONE active version after publish'
        );
        // and the runtime fetch serves the new spec
        Assert.isTrue(
            FinalSpecController.getSpec(form.Id, null)
                .contains('"marker":"published"')
        );
    }

    @IsTest
    static void publishRefusesUnresolvedSpec() {
        Form__c form = [SELECT Id FROM Form__c LIMIT 1];
        try {
            FinalSpecController.publishSpec(
                form.Id,
                '{"specVersion":1,"marker":"draft"}'
            );
            Assert.fail('Expected AuraHandledException');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage(), 'Unresolved spec rejected');
        }
    }

    @IsTest
    static void publishRefusesGarbage() {
        Form__c form = [SELECT Id FROM Form__c LIMIT 1];
        for (String bad : new List<String>{
            null,
            'not json',
            '{"specVersion":2,"resolved":{"tokens":{"x":"y"}}}',
            '{"specVersion":1,"resolved":{"tokens":{}}}'
        }) {
            try {
                FinalSpecController.publishSpec(form.Id, bad);
                Assert.fail('Expected exception for: ' + bad);
            } catch (AuraHandledException e) {
                Assert.isNotNull(e.getMessage());
            }
        }
    }
}
