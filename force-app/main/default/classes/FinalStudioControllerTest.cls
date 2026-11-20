@IsTest
private class FinalStudioControllerTest {
    private static Form__c makeForm(String name) {
        // Primary_Context_Object__c is required by an org validation rule
        Form__c f = new Form__c(
            Name = name,
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        return f;
    }

    private static Form_Version__c makeVersion(
        Id formId,
        Integer number_x,
        Boolean active,
        String spec
    ) {
        Form_Version__c v = new Form_Version__c(
            Form__c = formId,
            Version_Number__c = number_x,
            Is_Active__c = active,
            Spec_JSON__c = spec,
            Engine_Version__c = 1
        );
        insert v;
        return v;
    }

    @IsTest
    static void loadPrefersDraftOverActive() {
        Form__c f = makeForm('Load test');
        makeVersion(f.Id, 1, true, '{"specVersion":1,"v":"active"}');
        Form_Version__c draft = makeVersion(
            f.Id,
            2,
            false,
            '{"specVersion":1,"v":"draft"}'
        );

        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);
        Assert.areEqual(draft.Id, out.get('draftVersionId'), 'draft wins');
        Assert.isTrue(
            String.valueOf(out.get('specJson')).contains('"draft"'),
            'draft spec returned'
        );
        Assert.areEqual(1, out.get('activeVersionNumber'));
    }

    @IsTest
    static void loadFallsBackToActiveAndIgnoresHistory() {
        Form__c f = makeForm('History test');
        // deactivated OLD version (history — below active) is NOT a draft
        makeVersion(f.Id, 1, false, '{"specVersion":1,"v":"old"}');
        makeVersion(f.Id, 2, true, '{"specVersion":1,"v":"active"}');

        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);
        Assert.isNull(out.get('draftVersionId'), 'history is not a draft');
        Assert.isTrue(String.valueOf(out.get('specJson')).contains('"active"'));
    }

    @IsTest
    static void saveCreatesThenUpdatesTheDraft() {
        Form__c f = makeForm('Save test');
        makeVersion(f.Id, 3, true, '{"specVersion":1}');

        Id draftId = FinalStudioController.saveDraft(
            f.Id,
            '{"specVersion":1,"n":1}'
        );
        Form_Version__c draft = [
            SELECT Version_Number__c, Is_Active__c, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :draftId
        ];
        Assert.areEqual(4, draft.Version_Number__c, 'max + 1');
        Assert.isFalse(draft.Is_Active__c);

        Id again = FinalStudioController.saveDraft(
            f.Id,
            '{"specVersion":1,"n":2}'
        );
        Assert.areEqual(draftId, again, 'same row updated, not a new one');
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
        Assert.isTrue(
            [SELECT Spec_JSON__c FROM Form_Version__c WHERE Id = :draftId]
                .Spec_JSON__c.contains('"n":2')
        );
    }

    @IsTest
    static void saveRejectsNonObjectJson() {
        Form__c f = makeForm('Bad json');
        try {
            FinalStudioController.saveDraft(f.Id, 'not json');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        try {
            FinalStudioController.saveDraft(f.Id, '[1,2]');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void discardDeletesOnlyInactiveRows() {
        Form__c f = makeForm('Discard test');
        Form_Version__c active = makeVersion(
            f.Id,
            1,
            true,
            '{"specVersion":1}'
        );
        Form_Version__c draft = makeVersion(
            f.Id,
            2,
            false,
            '{"specVersion":1}'
        );

        FinalStudioController.discardDraft(draft.Id);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
        // active rows are refused even if handed directly
        FinalStudioController.discardDraft(active.Id);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
    }

    @IsTest
    static void listVersionsFlagsTheDraftNewestFirst() {
        Form__c f = makeForm('Versions test');
        makeVersion(f.Id, 1, false, '{"specVersion":1}'); // history
        makeVersion(f.Id, 2, true, '{"specVersion":1}');
        Form_Version__c draft = makeVersion(
            f.Id,
            3,
            false,
            '{"specVersion":1}'
        );

        List<FinalStudioController.VersionEntry> rows = FinalStudioController.listVersions(
            f.Id
        );
        Assert.areEqual(3, rows.size());
        Assert.areEqual(3, rows[0].versionNumber, 'newest first');
        Assert.areEqual(draft.Id, rows[0].id);
        Assert.isTrue(rows[0].isDraft, 'inactive above active is THE draft');
        Assert.isFalse(rows[0].isActive);
        Assert.areEqual(2, rows[1].versionNumber);
        Assert.isTrue(rows[1].isActive);
        Assert.isFalse(rows[1].isDraft);
        Assert.isFalse(rows[2].isDraft, 'history below active is not a draft');
        Assert.isFalse(rows[2].isActive);
    }

    @IsTest
    static void listVersionsWithoutDraftFlagsNothingAndRequiresId() {
        Form__c f = makeForm('No-draft versions');
        makeVersion(f.Id, 1, true, '{"specVersion":1}');

        List<FinalStudioController.VersionEntry> rows = FinalStudioController.listVersions(
            f.Id
        );
        Assert.areEqual(1, rows.size());
        Assert.isTrue(rows[0].isActive);
        Assert.isFalse(rows[0].isDraft, 'no draft exists — nothing flagged');

        try {
            FinalStudioController.listVersions(null);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void listFormsReportsDraftAndActiveState() {
        Form__c f = makeForm('List test');
        makeVersion(f.Id, 1, true, '{"specVersion":1}');
        makeVersion(f.Id, 2, false, '{"specVersion":1}');

        List<Map<String, Object>> rows = FinalStudioController.listForms(false);
        Map<String, Object> row;
        for (Map<String, Object> r : rows) {
            if (r.get('id') == f.Id) {
                row = r;
            }
        }
        Assert.isNotNull(row, 'form listed');
        Assert.areEqual(1, row.get('activeVersion'));
        Assert.areEqual(true, row.get('hasDraft'));
    }

    @IsTest
    static void listFormsSeparatesArchivedFromCurrent() {
        Form__c current = makeForm('Current form');
        makeVersion(current.Id, 1, true, '{"specVersion":1}');
        Form__c archived = makeForm('Archived form');
        makeVersion(archived.Id, 1, true, '{"specVersion":1}');
        archived.Status__c = 'Archived';
        update archived;

        Set<Id> currentIds = new Set<Id>();
        Map<String, Object> currentRow;
        for (Map<String, Object> r : FinalStudioController.listForms(false)) {
            currentIds.add((Id) r.get('id'));
            if (r.get('id') == current.Id) {
                currentRow = r;
            }
        }
        Assert.isTrue(currentIds.contains(current.Id), 'current form listed');
        Assert.isFalse(
            currentIds.contains(archived.Id),
            'archived is excluded from the current list'
        );
        Assert.isNotNull(currentRow, 'current row present');
        Assert.areEqual('Form', currentRow.get('formType'), 'type surfaced');

        Set<Id> archivedIds = new Set<Id>();
        Map<String, Object> archivedRow;
        for (Map<String, Object> r : FinalStudioController.listForms(true)) {
            archivedIds.add((Id) r.get('id'));
            if (r.get('id') == archived.Id) {
                archivedRow = r;
            }
        }
        Assert.isTrue(archivedIds.contains(archived.Id), 'archived listed');
        Assert.isFalse(
            archivedIds.contains(current.Id),
            'current is excluded from the archived list'
        );
        Assert.isNotNull(archivedRow, 'archived row present');
        Assert.areEqual(
            'Archived',
            archivedRow.get('status'),
            'archived status surfaced'
        );
    }

    @IsTest
    static void loadArchivedFormReturnsReadOnlyFlag() {
        Form__c f = makeForm('Archived load');
        makeVersion(f.Id, 1, true, '{"specVersion":1}');
        f.Status__c = 'Archived';
        update f;

        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);
        Assert.areEqual(true, out.get('isArchived'), 'archived flag set');
        Assert.areEqual(false, out.get('isPublic'), 'archived is not public');
        Assert.areEqual(
            false,
            out.get('isPublished'),
            'archived is not published'
        );
        Assert.isNull(
            out.get('specJson'),
            'no spec is returned for an archived form'
        );
    }

    @IsTest
    static void describeFieldsMapsTypesAndRejectsUnknown() {
        List<Map<String, Object>> fields = FinalStudioController.describeFields(
            'Contact'
        );
        Assert.isFalse(fields.isEmpty(), 'Contact has palette fields');
        Map<String, Object> lastName;
        for (Map<String, Object> f : fields) {
            if (f.get('apiName') == 'LastName') {
                lastName = f;
            }
            Assert.isNotNull(f.get('inputType'), 'every row carries a type');
        }
        Assert.isNotNull(lastName, 'LastName is createable text');
        Assert.areEqual('text', lastName.get('inputType'));
        Assert.areEqual(true, lastName.get('required'));

        try {
            FinalStudioController.describeFields('No_Such_Object__x9');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void describeChildRelationshipsFindsContactUnderAccount() {
        List<Map<String, Object>> rels = FinalStudioController.describeChildRelationships(
            'Account'
        );
        Assert.isFalse(rels.isEmpty(), 'Account has creatable children');
        Map<String, Object> contacts;
        for (Map<String, Object> r : rels) {
            Assert.isNotNull(r.get('linkingField'), 'every row carries a link');
            if (
                r.get('childObject') == 'Contact' &&
                r.get('linkingField') == 'AccountId'
            ) {
                contacts = r;
            }
        }
        Assert.isNotNull(contacts, 'Contacts via AccountId is offered');
        Assert.areEqual('Contacts', contacts.get('relationshipName'));

        try {
            FinalStudioController.describeChildRelationships('No_Such__x9');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void loadMissingFormThrowsFriendly() {
        try {
            FinalStudioController.loadStudio(
                Form__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
                    .getKeyPrefix() + '000000000000'
            );
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    // ----- guest access toggle (A1.5) -----

    @IsTest
    static void guestAccessEnableAddsAdapterThenDisableRemoves() {
        Form__c f = makeForm('Guest toggle');

        Boolean isPublic = FinalStudioController.setGuestAccess(f.Id, true);
        Assert.isTrue(isPublic, 'enable returns the public state');
        Assert.isTrue(
            [SELECT Allowed_Adapters__c FROM Form__c WHERE Id = :f.Id]
                .Allowed_Adapters__c.contains('Public_Guest'),
            'Public_Guest added'
        );
        // idempotent — enabling again keeps exactly one value
        Assert.isTrue(
            FinalStudioController.setGuestAccess(f.Id, true),
            'still public'
        );

        Boolean stillPublic = FinalStudioController.setGuestAccess(f.Id, false);
        Assert.isFalse(stillPublic, 'disable returns not-public');
        String adapters = [
            SELECT Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :f.Id
        ]
        .Allowed_Adapters__c;
        Assert.isTrue(
            String.isBlank(adapters) || !adapters.contains('Public_Guest'),
            'Public_Guest removed'
        );
    }

    @IsTest
    static void guestAccessEnableRemintsLinkedImages() {
        Form__c f = makeForm('Remint');
        ContentVersion cv = new ContentVersion(
            Title = 'logo',
            PathOnClient = 'logo.png',
            VersionData = Blob.valueOf('x'),
            IsMajorVersion = true
        );
        insert cv;
        Id docId = [
            SELECT ContentDocumentId
            FROM ContentVersion
            WHERE Id = :cv.Id
        ]
        .ContentDocumentId;
        insert new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId = f.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        Assert.areEqual(
            0,
            [
                SELECT COUNT()
                FROM ContentDistribution
                WHERE ContentVersionId = :cv.Id
            ],
            'no public link before enabling'
        );

        Test.startTest();
        FinalStudioController.setGuestAccess(f.Id, true);
        Test.stopTest();

        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDistribution
                WHERE ContentVersionId = :cv.Id
            ],
            're-mint created the public distribution'
        );
    }

    @IsTest
    static void loadStudioReportsPublicState() {
        Form__c pub = makeForm('Public load');
        pub.Allowed_Adapters__c = 'Public_Guest';
        update pub;
        makeVersion(pub.Id, 1, true, '{"specVersion":1}');
        Map<String, Object> outPub = FinalStudioController.loadStudio(pub.Id);
        Assert.areEqual(true, outPub.get('isPublic'), 'public form → isPublic');

        Form__c priv = makeForm('Private load');
        makeVersion(priv.Id, 1, true, '{"specVersion":1}');
        Map<String, Object> outPriv = FinalStudioController.loadStudio(priv.Id);
        Assert.areEqual(
            false,
            outPriv.get('isPublic'),
            'no adapter → not public'
        );
    }

    @IsTest
    static void guestAccessGuardsNullId() {
        try {
            FinalStudioController.setGuestAccess(null, true);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    // ---- SO-1: setContextObject (SURVEY_OBJECT_SPEC V2) ----

    private static Form__c makeSurvey(String name) {
        Form__c f = new Form__c(
            Name = name,
            Form_Type__c = 'Survey',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        return f;
    }

    @IsTest
    static void setContextObjectConnectsChangesAndDisconnects() {
        Form__c s = makeSurvey('SO1 survey');

        Test.startTest();
        // change (canonical casing comes from the describe, not the caller)
        FinalStudioController.setContextObject(s.Id, 'job_application__c');
        String changed = [
            SELECT Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :s.Id
        ]
        .Primary_Context_Object__c;
        // disconnect — legal for surveys (VR_Primary_Object_Required carves
        // surveys out when Submission_Storage__c is blank)
        FinalStudioController.setContextObject(s.Id, null);
        Test.stopTest();

        Assert.areEqual(
            'Job_Application__c',
            changed,
            'canonical API name stored'
        );
        Assert.isNull(
            [
                SELECT Primary_Context_Object__c
                FROM Form__c
                WHERE Id = :s.Id
            ]
            .Primary_Context_Object__c,
            'disconnect nulls the mirror field'
        );
    }

    @IsTest
    static void setContextObjectRejectsFormsAndBogusObjects() {
        Form__c form = makeForm('SO1 plain form');
        Form__c survey = makeSurvey('SO1 survey 2');

        try {
            FinalStudioController.setContextObject(form.Id, 'Contact');
            Assert.fail('non-survey should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        try {
            FinalStudioController.setContextObject(
                survey.Id,
                'No_Such_Object__c'
            );
            Assert.fail('unknown object should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Assert.areEqual(
            'Contact',
            [
                SELECT Primary_Context_Object__c
                FROM Form__c
                WHERE Id = :survey.Id
            ]
            .Primary_Context_Object__c,
            'refusals leave the field untouched'
        );
    }

    // ----- survey topics: create permission, dedupe, active-only list -----

    /** A brand-new user, optionally holding Form_Builder_Admin (which
     *  carries Create_Survey_Topics). Fresh each call: a fresh user never
     *  inherits the running user's permission set assignments. */
    private static User topicUser(Boolean withPermset) {
        String suffix = String.valueOf(Math.abs(Crypto.getRandomInteger()));
        User u = new User(
            Alias = 'tp' + suffix.left(5),
            Email = 'topic' + suffix + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'TopicTester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = UserInfo.getProfileId(),
            TimeZoneSidKey = 'America/Los_Angeles',
            Username = 'topic' + suffix + '@example.com.test'
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert u;
            if (withPermset) {
                insert new PermissionSetAssignment(
                    AssigneeId = u.Id,
                    PermissionSetId = [
                        SELECT Id
                        FROM PermissionSet
                        WHERE Name = 'Form_Builder_Admin'
                        LIMIT 1
                    ]
                    .Id
                );
            }
        }
        return u;
    }

    @IsTest
    static void createSurveyTopicIsRefusedWithoutThePermission() {
        User plain = topicUser(false);
        System.runAs(plain) {
            Assert.isFalse(
                FinalStudioController.canCreateSurveyTopics(),
                'no permission, no flag'
            );
            try {
                FinalStudioController.createSurveyTopic('Sneaky');
                Assert.fail('should be refused');
            } catch (AuraHandledException e) {
                Assert.isTrue(true);
            }
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Survey_Topic__c WHERE Name = 'Sneaky']
        );
    }

    @IsTest
    static void createSurveyTopicWorksWithThePermissionAndDedupes() {
        User builder = topicUser(true);
        System.runAs(builder) {
            Assert.isTrue(FinalStudioController.canCreateSurveyTopics());
            FinalStudioController.TopicEntry first = FinalStudioController.createSurveyTopic(
                '  Billing   Issues '
            );
            Assert.areEqual(
                'Billing Issues',
                first.name,
                'trimmed, spaces collapsed'
            );
            FinalStudioController.TopicEntry again = FinalStudioController.createSurveyTopic(
                'billing issues'
            );
            Assert.areEqual(first.id, again.id, 'case/space variants reuse it');
            FinalStudioController.TopicEntry third = FinalStudioController.createSurveyTopic(
                'BILLING  ISSUES  '
            );
            Assert.areEqual(first.id, third.id);
            try {
                FinalStudioController.createSurveyTopic('   ');
                Assert.fail('blank name refused');
            } catch (AuraHandledException e) {
                Assert.isTrue(true);
            }
        }
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM Survey_Topic__c
                WHERE Name = 'Billing Issues'
            ]
        );
    }

    @IsTest
    static void createSurveyTopicRefusesAnInactiveNameInsteadOfReusingIt() {
        insert new Survey_Topic__c(Name = 'Retired', Active__c = false);
        User builder = topicUser(true);
        System.runAs(builder) {
            try {
                FinalStudioController.createSurveyTopic('retired');
                Assert.fail('inactive match must not be attached');
            } catch (AuraHandledException e) {
                Assert.isTrue(true);
            }
        }
    }

    @IsTest
    static void listSurveyTopicsHoldsActiveTopicsOnlyByName() {
        insert new List<Survey_Topic__c>{
            new Survey_Topic__c(Name = 'Zeta', Active__c = true),
            new Survey_Topic__c(Name = 'Alpha', Active__c = true),
            new Survey_Topic__c(Name = 'Gone', Active__c = false)
        };
        List<String> names = new List<String>();
        for (
            FinalStudioController.TopicEntry e : FinalStudioController.listSurveyTopics()
        ) {
            names.add(e.name);
        }
        Assert.isFalse(names.contains('Gone'), 'inactive hidden');
        Assert.isTrue(names.contains('Alpha') && names.contains('Zeta'));
        Assert.isTrue(
            names.indexOf('Alpha') < names.indexOf('Zeta'),
            'sorted by name'
        );
    }

    private static String bigSpec(Integer padLength) {
        // Valid, published-shaped spec with a long help text carried in `pad`.
        return JSON.serialize(
            new Map<String, Object>{
                'specVersion' => 1,
                'resolved' => new Map<String, Object>{
                    'tokens' => new Map<String, Object>{
                        '--c-accent' => '#123456'
                    },
                    'engineVersion' => 1,
                    'resolvedAt' => '2026-07-06T00:00:00Z'
                },
                'pad' => 'h'.repeat(padLength)
            }
        );
    }

    @IsTest
    static void saveAndLoadKeepASpecOverOneFieldWhole() {
        Form__c f = makeForm('Big draft');
        makeVersion(f.Id, 1, true, '{"specVersion":1}');
        String big = bigSpec(200000);
        Assert.isTrue(big.length() > FinalSpecStore.PART);

        Id draftId = FinalStudioController.saveDraft(f.Id, big);
        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);

        Assert.areEqual(draftId, out.get('draftVersionId'));
        Assert.areEqual(big, (String) out.get('specJson'), 'identical JSON');

        // saving a small spec afterwards clears the continuation fields
        FinalStudioController.saveDraft(f.Id, '{"specVersion":1,"n":3}');
        Form_Version__c row = [
            SELECT Spec_JSON_2__c, Spec_JSON_3__c
            FROM Form_Version__c
            WHERE Id = :draftId
        ];
        Assert.isNull(row.Spec_JSON_2__c);
        Assert.isNull(row.Spec_JSON_3__c);
    }

    @IsTest
    static void publishedBigSpecIsServedToTheViewerWhole() {
        Form__c f = makeForm('Big publish');
        String big = bigSpec(200000);

        Id publishedId = FinalSpecController.publishSpec(f.Id, big);

        Map<String, Object> env = FinalSpecController.getSpecEnvelope(
            f.Id,
            null
        );
        Assert.areEqual(publishedId, env.get('versionId'));
        Assert.areEqual(big, (String) env.get('spec'), 'identical JSON');
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
            (String) env.get('spec')
        );
        Assert.areEqual(200000, ((String) parsed.get('pad')).length());
        Assert.areEqual(
            big,
            FinalSpecController.getSpec(f.Id, publishedId),
            'by version id too'
        );
    }

    @IsTest
    static void aSpecOverTheLimitSaysSoVerbatim() {
        Form__c f = makeForm('Too big');
        String tooBig = bigSpec(FinalSpecStore.MAX);
        try {
            FinalStudioController.saveDraft(f.Id, tooBig);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().startsWith('This form is too large to save ('),
                e.getMessage()
            );
        }
        try {
            FinalSpecController.publishSpec(f.Id, tooBig);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().startsWith('This form is too large to save ('),
                e.getMessage()
            );
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id],
            'nothing was saved'
        );
    }

    @IsTest
    static void listLanguagesReturnsTheOrgsActiveLanguages() {
        List<Map<String, String>> langs = FinalStudioController.listLanguages();
        Assert.isFalse(langs.isEmpty(), 'every org offers languages');
        Boolean hasEnglish = false;
        for (Map<String, String> l : langs) {
            Assert.isFalse(String.isBlank(l.get('code')), 'code');
            Assert.isFalse(String.isBlank(l.get('label')), 'label');
            hasEnglish = hasEnglish || l.get('code') == 'en_US';
        }
        Assert.isTrue(hasEnglish, 'English (US) is always active');
    }
}
