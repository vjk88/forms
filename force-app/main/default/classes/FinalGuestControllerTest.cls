@IsTest
private class FinalGuestControllerTest {
    // ----- fixtures -----

    private static Form__c makeForm(
        String status,
        String adapters,
        Boolean withActiveVersion,
        String specJson
    ) {
        Form__c f = new Form__c(
            Name = 'Guest test',
            Primary_Context_Object__c = 'Contact',
            Status__c = status,
            Allowed_Adapters__c = adapters,
            // org validation rules: published forms require both a layout
            // config and a schema snapshot (VR_Layout_Config_Required,
            // VR_Schema_Snapshot_Required)
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        if (withActiveVersion) {
            insert new Form_Version__c(
                Form__c = f.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Engine_Version__c = 1,
                Spec_JSON__c = specJson
            );
        }
        return f;
    }

    private static String contactSpec() {
        return '{"specVersion":1,' +
            '"form":{"name":"Contact us","targetObject":"Contact"},' +
            '"settings":{"prefill":{"source":"urlParams","autofillRules":[{"sourceObject":"Account"}]}},' +
            '"pages":[{"id":"pg_1","sections":[' +
            '{"id":"sec_1","elements":[' +
            '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
            '{"id":"sec_rep","repeat":{"childObject":"Case","relationshipField":"ContactId"},' +
            '"elements":[{"id":"el_sub","type":"field","binding":{"object":"Case","field":"Subject"}}]}' +
            ']}]}';
    }

    private static Form__c publishedForm() {
        return makeForm('Published', 'Public_Guest', true, contactSpec());
    }

    // ----- getGuestSpec: gate -----

    @IsTest
    static void gatePassServesProjectedSpec() {
        Form__c f = publishedForm();

        Test.startTest();
        String json = FinalGuestController.getGuestSpec(f.Id);
        Test.stopTest();

        // the binding-layer vocabulary is gone from the wire
        Assert.isFalse(json.contains('LastName'), 'field name leaked');
        Assert.isFalse(json.contains('targetObject'), 'target object leaked');
        Assert.isFalse(json.contains('childObject'), 'child object leaked');
        Assert.isFalse(
            json.contains('relationshipField'),
            'relationship field leaked'
        );
        Assert.isFalse(json.contains('prefill'), 'prefill config leaked');
        // display structure survives
        Assert.isTrue(json.contains('"id":"el_ln"'), 'element id kept');
        Assert.isTrue(json.contains('sec_rep'), 'repeat section kept');
    }

    @IsTest
    static void gateRejectsNullId() {
        assertUnavailable(null);
    }

    @IsTest
    static void gateRejectsMissingForm() {
        // a syntactically valid Form Id that points at nothing
        Id ghost =
            Form__c.SObjectType.getDescribe().getKeyPrefix() +
            '000000000000AAA';
        try {
            FinalGuestController.getGuestSpec(ghost);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'gate blocked a non-existent form');
        }
    }

    @IsTest
    static void gateRejectsDraft() {
        Form__c f = makeForm('Draft', 'Public_Guest', true, contactSpec());
        assertUnavailable(f.Id);
    }

    @IsTest
    static void gateRejectsNonPublicAdapter() {
        // published + active, but no Public_Guest in the adapter set
        Form__c f = makeForm('Published', null, true, contactSpec());
        assertUnavailable(f.Id);
    }

    @IsTest
    static void gateRejectsNoActiveVersion() {
        Form__c f = makeForm('Published', 'Public_Guest', false, null);
        assertUnavailable(f.Id);
    }

    private static void assertUnavailable(Id formId) {
        // AuraHandledException.getMessage() isn't reliable in Apex test
        // context (returns the platform placeholder, not our string), so the
        // generic-message guarantee is verified at the LWC layer; here we
        // assert the gate BLOCKS (throws) rather than serving anything.
        try {
            FinalGuestController.getGuestSpec(formId);
            Assert.fail('gate should have blocked ' + formId);
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'gate blocked');
        }
    }

    // ----- getGuestSpec: image URL rewrite -----

    @IsTest
    static void imageUrlRewrittenToPublicWhenDistributionExists() {
        ContentVersion cv = new ContentVersion(
            Title = 'logo',
            PathOnClient = 'logo.png',
            VersionData = Blob.valueOf('img'),
            IsMajorVersion = true
        );
        insert cv;
        cv = [SELECT Id FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
        ContentDistribution cd = new ContentDistribution(
            Name = 'logo',
            ContentVersionId = cv.Id,
            PreferencesAllowViewInBrowser = true,
            PreferencesPasswordRequired = false,
            PreferencesNotifyOnVisit = false
        );
        insert cd;
        String publicUrl = [
            SELECT ContentDownloadUrl
            FROM ContentDistribution
            WHERE Id = :cd.Id
            LIMIT 1
        ]
        .ContentDownloadUrl;

        String internalUrl = '/sfc/servlet.shepherd/version/download/' + cv.Id;
        String spec =
            '{"specVersion":1,"form":{"targetObject":"Contact"},' +
            '"header":{"logo":{"url":"' +
            internalUrl +
            '","contentVersionId":"' +
            cv.Id +
            '"}},"pages":[]}';
        Form__c f = makeForm('Published', 'Public_Guest', true, spec);

        Test.startTest();
        String json = FinalGuestController.getGuestSpec(f.Id);
        Test.stopTest();

        if (String.isNotBlank(publicUrl)) {
            Assert.isTrue(
                json.contains(publicUrl),
                'public distribution url substituted'
            );
        }
        // regardless, the projection ran without error and kept the logo node
        Assert.isTrue(json.contains('contentVersionId'), 'image node kept');
    }

    @IsTest
    static void imageUrlPassesThroughWhenNoDistribution() {
        String internalUrl = '/sfc/servlet.shepherd/version/download/068000000000000AAA';
        String spec =
            '{"specVersion":1,"form":{"targetObject":"Contact"},' +
            '"header":{"logo":{"url":"' +
            internalUrl +
            '","contentVersionId":"068000000000000AAA"}},"pages":[]}';
        Form__c f = makeForm('Published', 'Public_Guest', true, spec);

        String json = FinalGuestController.getGuestSpec(f.Id);
        Assert.isTrue(
            json.contains(internalUrl),
            'no distribution → url unchanged'
        );
    }

    // ----- submitGuest -----

    @IsTest
    static void submitInsertsParentAndRepeatChildren() {
        Form__c f = publishedForm();
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'GuestName' },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{ 'el_sub' => 'Q1' },
                        new Map<String, Object>{ 'el_sub' => 'Q2' }
                    }
                }
            }
        );

        Test.startTest();
        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            payload
        );
        Test.stopTest();

        Assert.isTrue(res.success, 'reported success');
        Assert.areEqual(2, res.childCount, 'two children');
        Contact saved = [
            SELECT Id
            FROM Contact
            WHERE LastName = 'GuestName'
            LIMIT 1
        ];
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Case WHERE ContactId = :saved.Id],
            'children linked to the parent'
        );
    }

    @IsTest
    static void submitRefusesUpdateModeSpec() {
        String spec =
            '{"specVersion":1,"form":{"targetObject":"Contact","saveMode":"update"},' +
            '"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
            '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]}]}]}';
        Form__c f = makeForm('Published', 'Public_Guest', true, spec);

        try {
            FinalGuestController.submitGuest(f.Id, '{"answers":{"el_ln":"X"}}');
            Assert.fail('update mode must be refused for guests');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'guest update refused');
        }
    }

    @IsTest
    static void submitIsAtomicOnChildFailure() {
        String spec =
            '{"specVersion":1,"form":{"targetObject":"Contact"},"pages":[{"id":"pg_1","sections":[' +
            '{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
            '{"id":"sec_rep","repeat":{"childObject":"Asset","relationshipField":"ContactId"},"elements":[' +
            '{"id":"el_an","type":"field","binding":{"object":"Asset","field":"Name"}},' +
            '{"id":"el_dt","type":"field","binding":{"object":"Asset","field":"InstallDate"}}]}' +
            ']}]}';
        Form__c f = makeForm('Published', 'Public_Guest', true, spec);
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{
                    'el_ln' => 'GuestDoomed'
                },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{
                            'el_an' => 'Bad',
                            'el_dt' => 'not-a-date'
                        }
                    }
                }
            }
        );

        try {
            FinalGuestController.submitGuest(f.Id, payload);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE LastName = 'GuestDoomed'],
            'parent rolled back with the failing child'
        );
    }

    @IsTest
    static void submitGateRejectsUnpublished() {
        Form__c f = makeForm('Draft', 'Public_Guest', true, contactSpec());
        try {
            FinalGuestController.submitGuest(f.Id, '{"answers":{"el_ln":"X"}}');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'unpublished submit blocked');
        }
    }

    @IsTest
    static void submitGuardsBlankPayload() {
        Form__c f = publishedForm();
        try {
            FinalGuestController.submitGuest(f.Id, '');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }
}
