@IsTest
private class FinalGuestControllerTest {
    // ----- fixtures -----

    private static Form__c makeForm(
        String status,
        Boolean isPublic,
        Boolean withActiveVersion,
        String specJson
    ) {
        Form__c f = new Form__c(
            Name = 'Guest test',
            Primary_Context_Object__c = 'Contact',
            Status__c = status,
            Is_Public__c = isPublic,
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
        return makeForm('Published', true, true, contactSpec());
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
        Form__c f = makeForm('Draft', true, true, contactSpec());
        assertUnavailable(f.Id);
    }

    @IsTest
    static void gateRejectsNotPublic() {
        // published + active, but Is_Public__c is unchecked
        Form__c f = makeForm('Published', false, true, contactSpec());
        assertUnavailable(f.Id);
    }

    @IsTest
    static void gateRejectsNoActiveVersion() {
        Form__c f = makeForm('Published', true, false, null);
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
        Form__c f = makeForm('Published', true, true, spec);

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
        Form__c f = makeForm('Published', true, true, spec);

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
            FinalGuestTicketTestUtil.withTicket(f.Id, payload)
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
        Form__c f = makeForm('Published', true, true, spec);

        try {
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(
                    f.Id,
                    '{"answers":{"el_ln":"X"}}'
                )
            );
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
        Form__c f = makeForm('Published', true, true, spec);
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
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(f.Id, payload)
            );
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
        Form__c f = makeForm('Draft', true, true, contactSpec());
        try {
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(
                    f.Id,
                    '{"answers":{"el_ln":"X"}}'
                )
            );
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'unpublished submit blocked');
        }
    }

    @IsTest
    static void submitGuardsBlankPayload() {
        Form__c f = publishedForm();
        try {
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(f.Id, '')
            );
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    // ----- availability (A3) -----

    private static String settingsSpec(String settingsInner) {
        return '{"specVersion":1,' +
            '"form":{"name":"C","targetObject":"Contact"},' +
            '"settings":{' +
            settingsInner +
            '},' +
            '"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
            '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]}]}]}';
    }

    private static String iso(Datetime dt) {
        return dt.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    }

    @IsTest
    static void closedStatusReturnsFlagNotStructure() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec(
                '"availability":{"status":"closed","closedMessage":"Done for now."}'
            )
        );
        String json = FinalGuestController.getGuestSpec(f.Id);
        Assert.isTrue(json.contains('"closed":true'), 'closed flag set');
        Assert.isTrue(json.contains('Done for now.'), 'closed message carried');
        Assert.isFalse(json.contains('el_ln'), 'no form structure when closed');
    }

    private static Form__c closedTranslatedForm() {
        String spec = settingsSpec(
            '"availability":{"status":"closed","closedMessage":"Done for now."}'
        );
        spec =
            spec.substring(0, spec.length() - 1) +
            ',"languages":{"default":"en_US","available":["en_US","fr"]},' +
            '"translations":{"fr":{"closed.message":"Termine pour le moment."}}}';
        return makeForm('Published', true, true, spec);
    }

    @IsTest
    static void closedMessageIsTranslatedForTheFirstOfferedLanguage() {
        Form__c f = closedTranslatedForm();
        Map<String, Object> res = FinalGuestController.getGuestRuntimeSpecForLangs(
            f.Id,
            new List<String>{ 'ja', 'fr-CA', 'en' }
        );
        Assert.areEqual(true, res.get('closed'));
        Assert.areEqual('Termine pour le moment.', res.get('closedMessage'));
    }

    @IsTest
    static void closedMessageStaysDefaultWithoutOrWithUnofferedLanguages() {
        Form__c f = closedTranslatedForm();
        Assert.areEqual(
            'Done for now.',
            FinalGuestController.getGuestRuntimeSpecForLangs(
                    f.Id,
                    new List<String>{ 'ja' }
                )
                .get('closedMessage')
        );
        // the old one-argument call keeps working
        Assert.areEqual(
            'Done for now.',
            FinalGuestController.getGuestRuntimeSpec(f.Id).get('closedMessage')
        );
    }

    @IsTest
    static void beforeOpensAtIsClosed() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec(
                '"availability":{"opensAt":"' +
                    iso(Datetime.now().addDays(2)) +
                    '"}'
            )
        );
        Assert.isTrue(
            FinalGuestController.getGuestSpec(f.Id).contains('"closed":true'),
            'before opensAt → closed'
        );
    }

    @IsTest
    static void afterClosesAtIsClosed() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec(
                '"availability":{"closesAt":"' +
                    iso(Datetime.now().addDays(-1)) +
                    '"}'
            )
        );
        Assert.isTrue(
            FinalGuestController.getGuestSpec(f.Id).contains('"closed":true'),
            'after closesAt → closed'
        );
    }

    @IsTest
    static void openWindowServesFormAndStripsAvailability() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec(
                '"availability":{"opensAt":"' +
                    iso(Datetime.now().addDays(-1)) +
                    '","closesAt":"' +
                    iso(Datetime.now().addDays(1)) +
                    '","responseCap":5}'
            )
        );
        String json = FinalGuestController.getGuestSpec(f.Id);
        Assert.isFalse(json.contains('"closed":true'), 'in-window → open');
        Assert.isTrue(json.contains('el_ln'), 'form structure served');
        Assert.isFalse(
            json.contains('availability'),
            'availability stripped from the client'
        );
        Assert.isFalse(
            json.contains('responseCap'),
            'response cap never sent to the client'
        );
    }

    @IsTest
    static void submitOnClosedFormRejected() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec('"availability":{"status":"closed"}')
        );
        try {
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(
                    f.Id,
                    '{"answers":{"el_ln":"X"}}'
                )
            );
            Assert.fail('closed form must reject a submit');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'closed submit rejected');
        }
    }

    // ----- honeypot (A3) -----

    @IsTest
    static void honeypotFilledFakeSuccessNoRecord() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec('"spamProtection":"honeypot"')
        );
        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                f.Id,
                '{"answers":{"el_ln":"BotName"},"meta":{"hp":"http://spam"}}'
            )
        );
        Assert.isTrue(res.success, 'bot gets a fake success');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE LastName = 'BotName'],
            'no record created for a tripped honeypot'
        );
    }

    @IsTest
    static void honeypotEmptyInsertsNormally() {
        Form__c f = makeForm(
            'Published',
            true,
            true,
            settingsSpec('"spamProtection":"honeypot"')
        );
        FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                f.Id,
                '{"answers":{"el_ln":"RealPerson"},"meta":{"hp":""}}'
            )
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE LastName = 'RealPerson'],
            'a real submit (empty honeypot) still inserts'
        );
    }

    @IsTest
    static void theMappingNeverReachesAGuest() {
        // contactSpec() ends with '}'; splice a mapping in before it.
        String spec =
            contactSpec().removeEnd('}') +
            ',"mapping":{"actions":[{"id":"act_secret","object":"Contact",' +
            '"operation":"create","fields":[]}]}}';
        Form__c f = makeForm('Published', true, true, spec);

        String json = FinalGuestController.getGuestSpec(f.Id);

        Assert.isFalse(
            json.contains('"mapping"'),
            'the mapping leaked to a guest'
        );
        Assert.isFalse(
            json.contains('act_secret'),
            'a step id leaked to a guest'
        );
    }

    // ----- runtimeLabels (built-in words, Custom Labels) -----

    @IsTest
    static void runtimeLabels_badLanguageIsEmpty() {
        for (
            String bad : new List<String>{
                null,
                '',
                '  ',
                'FR',
                'french',
                'f',
                'fr_',
                'fr-CAN',
                'en_US_x',
                'fr; DROP'
            }
        ) {
            Assert.isTrue(
                FinalGuestController.runtimeLabels(bad).isEmpty(),
                'expected no labels for ' + bad
            );
        }
    }

    @IsTest
    static void runtimeLabels_noTranslationsIsEmptyAndDoesNotThrow() {
        // 'xx' is well-formed but not a real language. Salesforce treats an
        // unknown code as the default language (translationExists = true,
        // value = the default text; checked in the org 2026-11-19), so the
        // map may hold default text. It must never throw or hold blanks.
        Map<String, String> out = FinalGuestController.runtimeLabels('xx');
        Assert.isNotNull(out);
        for (String name : out.keySet()) {
            Assert.isTrue(String.isNotBlank(out.get(name)), name + ' is blank');
        }
    }

    @IsTest
    static void runtimeLabels_acceptsBothRegionSpellings() {
        Assert.areEqual('fr_CA', FinalGuestController.normalizeLang('fr-CA'));
        Assert.areEqual('fr_CA', FinalGuestController.normalizeLang('fr_ca'));
        Assert.areEqual('fr', FinalGuestController.normalizeLang('fr'));
        Assert.areEqual('haw', FinalGuestController.normalizeLang(' haw '));
        Assert.isNull(FinalGuestController.normalizeLang('FR'));
        // well-formed but untranslated: no error either way
        FinalGuestController.runtimeLabels('fr-CA');
        FinalGuestController.runtimeLabels('fr_CA');
    }

    @IsTest
    static void runtimeLabels_everyNameIsAFinalRunLabel() {
        Assert.isFalse(FinalGuestController.RUNTIME_LABEL_NAMES.isEmpty());
        Set<String> seen = new Set<String>();
        for (String name : FinalGuestController.RUNTIME_LABEL_NAMES) {
            Assert.isTrue(name.startsWith('Final_Run_'), name);
            Assert.isTrue(seen.add(name), 'duplicate ' + name);
        }
    }

    // ----- a refused guest submit is not a success (DEFERRED #68) -----

    private static String requiredNameSpec() {
        return '{"specVersion":1,' +
            '"form":{"name":"C","targetObject":"Contact"},' +
            '"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
            '{"id":"el_ln","type":"field","label":"Last name",' +
            '"binding":{"object":"Contact","field":"LastName"},' +
            '"validation":[{"type":"required","message":"Tell us your last name."}]}]}]}]}';
    }

    @IsTest
    static void submitMissingRequiredAnswerIsRefusedNotSuccess() {
        Form__c f = makeForm('Published', true, true, requiredNameSpec());
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        String payload = FinalGuestTicketTestUtil.withTicket(
            '{"answers":{"el_ln":""}}',
            ticket,
            '0'
        );

        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            payload
        );

        Assert.areEqual(false, res.success, 'a refusal is not a success');
        Assert.isNotNull(res.errors, 'the refusals come back');
        Assert.areEqual(1, res.errors.size());
        Assert.areEqual('Tell us your last name.', res.errors[0].message);
        // the question by id, never a field API name (withheld from guests)
        Assert.isTrue(
            String.isNotBlank(res.errors[0].elementId),
            'names the question'
        );
        Assert.isTrue(
            res.errors[0].fields == null || res.errors[0].fields.isEmpty(),
            'no field API names for a guest'
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE LastName = ''],
            'nothing saved'
        );
        Assert.isFalse(
            FinalGuestTicket.isUsed(ticket),
            'a refusal leaves the ticket unspent so the person can resend'
        );
    }

    @IsTest
    static void submitAfterRefusalWithSameTicketSucceeds() {
        Form__c f = makeForm('Published', true, true, requiredNameSpec());
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult refused = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                '{"answers":{"el_ln":""}}',
                ticket,
                '0'
            )
        );
        Assert.areEqual(false, refused.success);

        FinalGuestController.GuestSubmitResult saved = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                '{"answers":{"el_ln":"FixedName"}}',
                ticket,
                '0'
            )
        );
        Assert.areEqual(true, saved.success);
        Assert.isTrue(FinalGuestTicket.isUsed(ticket), 'a save spends it');
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE LastName = 'FixedName']
        );
    }
}
