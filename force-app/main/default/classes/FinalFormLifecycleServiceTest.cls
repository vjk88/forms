@IsTest
private class FinalFormLifecycleServiceTest {
    @IsTest
    static void shouldReportRelatedCounts_WhenDeleteIsOpened() {
        Form__c form = createForm('Survey', 'Counted survey');
        Form_Version__c version = createVersion(form);
        insert as user new Form_Response__c(Form_Version__c = version.Id);
        insert as user new Survey_Invitation__c(Form__c = form.Id);
        createFileLink(form.Id, 'counted.png');

        Test.startTest();
        Map<String, Object> summary = FinalFormActionsController.getActionSummary(
            form.Id
        );
        Test.stopTest();

        Assert.areEqual(
            1,
            summary.get('versionCount'),
            'One version is owned.'
        );
        Assert.areEqual(
            1,
            summary.get('responseCount'),
            'One response is owned.'
        );
        Assert.areEqual(
            1,
            summary.get('invitationCount'),
            'One invitation is tracked.'
        );
        Assert.areEqual(
            1,
            summary.get('configFileCount'),
            'One file is linked.'
        );
        Assert.isFalse(
            (Boolean) summary.get('hardDeleteAllowed'),
            'Responses must force the Archive branch.'
        );
    }

    @IsTest
    static void shouldArchiveAndPreserveResponses_WhenResponsesExist() {
        Form__c form = createForm('Survey', 'Archive survey');
        form.Allowed_Adapters__c = 'Internal_Record_Page;Public_Guest';
        update as user form;
        Form_Version__c version = createVersion(form);
        insert as user new Form_Response__c(Form_Version__c = version.Id);

        Test.startTest();
        FinalFormActionsController.archiveForm(form.Id);
        Test.stopTest();

        Form__c archived = [
            SELECT Status__c, Allowed_Adapters__c, Links_Invalidated_On__c
            FROM Form__c
            WHERE Id = :form.Id
        ];
        Assert.areEqual('Archived', archived.Status__c, 'Root should archive.');
        Assert.isFalse(
            String.valueOf(archived.Allowed_Adapters__c)
                .contains('Public_Guest'),
            'Archive must turn off guest access.'
        );
        Assert.isNotNull(
            archived.Links_Invalidated_On__c,
            'Archive must invalidate previously issued links.'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Response__c],
            'Archive must preserve responses.'
        );
    }

    @IsTest
    static void shouldBlockHardDelete_WhenResponsesExist() {
        Form__c form = createForm('Survey', 'Retained survey');
        Form_Version__c version = createVersion(form);
        insert as user new Form_Response__c(Form_Version__c = version.Id);

        Test.startTest();
        try {
            FinalFormActionsService.deleteForm(form.Id, form.Name);
            Assert.fail('Response-bearing forms must not be hard deleted.');
        } catch (FinalFormActionsService.ActionException e) {
            Assert.isTrue(
                e.getMessage().contains('archived'),
                'The error should direct the owner to Archive.'
            );
        }
        Test.stopTest();
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form__c WHERE Id = :form.Id],
            'The root should remain after the blocked action.'
        );
    }

    @IsTest
    static void shouldDeleteConfigurationButKeepBusinessRecord_WhenNoResponses() {
        Form__c form = createForm('Form', 'Disposable form');
        createVersion(form);
        insert as user new Survey_Invitation__c(Form__c = form.Id);
        Contact businessRecord = new Contact(LastName = 'Created by a form');
        insert as user businessRecord;

        Test.startTest();
        FinalFormActionsController.deleteForm(form.Id, 'Disposable form');
        Test.stopTest();

        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form__c WHERE Id = :form.Id],
            'The form configuration should be deleted.'
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Survey_Invitation__c WHERE Form__c = :form.Id],
            'Tracked invitations should be cleaned explicitly.'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Id = :businessRecord.Id],
            'Target business records must never be deleted.'
        );
    }

    @IsTest
    static void shouldUnlinkSharedFile_WhenDeletingForm() {
        Form__c form = createForm('Form', 'Shared file form');
        createVersion(form);
        Contact consumer = new Contact(LastName = 'File consumer');
        insert as user consumer;
        ContentVersion version = createFileLink(form.Id, 'shared.png');
        insert as user new ContentDocumentLink(
            ContentDocumentId = version.ContentDocumentId,
            LinkedEntityId = consumer.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );

        Test.startTest();
        FinalFormActionsController.deleteForm(form.Id, form.Name);
        Test.stopTest();

        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDocument
                WHERE Id = :version.ContentDocumentId
            ],
            'A file consumed by another record must remain.'
        );
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE
                    ContentDocumentId = :version.ContentDocumentId
                    AND LinkedEntityId = :consumer.Id
            ],
            'The external business link must remain.'
        );
    }

    @IsTest
    static void shouldDeleteExclusiveFile_WhenDeletingForm() {
        Form__c form = createForm('Form', 'Exclusive file form');
        createVersion(form);
        ContentVersion version = createFileLink(form.Id, 'exclusive.png');

        Test.startTest();
        FinalFormActionsController.deleteForm(form.Id, form.Name);
        Test.stopTest();

        Assert.areEqual(
            0,
            [
                SELECT COUNT()
                FROM ContentDocument
                WHERE Id = :version.ContentDocumentId
            ],
            'An exclusively attached config file should be removed.'
        );
    }

    @IsTest
    static void shouldRestoreAsPrivateDraft_WithoutRevivingOldLinks() {
        Form__c form = createForm('Survey', 'Archived form');
        Datetime invalidated = System.now().addHours(-1);
        form.Status__c = 'Archived';
        form.Allowed_Adapters__c = 'Internal_Record_Page;Public_Guest';
        form.Links_Invalidated_On__c = invalidated;
        update as user form;

        Test.startTest();
        FinalFormActionsController.restoreForm(form.Id);
        Test.stopTest();

        Form__c restored = [
            SELECT Status__c, Allowed_Adapters__c, Links_Invalidated_On__c
            FROM Form__c
            WHERE Id = :form.Id
        ];
        Assert.areEqual(
            'Draft',
            restored.Status__c,
            'Restore returns to Draft.'
        );
        Assert.isFalse(
            String.valueOf(restored.Allowed_Adapters__c)
                .contains('Public_Guest'),
            'Restore must remain private.'
        );
        Assert.areEqual(
            invalidated,
            restored.Links_Invalidated_On__c,
            'Old record links must stay invalid after restore.'
        );
    }

    @IsTest
    static void shouldRequireExactName_WhenHardDeleting() {
        Form__c form = createForm('Form', 'Exact name');
        createVersion(form);

        Test.startTest();
        try {
            FinalFormActionsService.deleteForm(form.Id, 'exact name');
            Assert.fail('Case-sensitive exact-name confirmation is required.');
        } catch (FinalFormActionsService.ActionException e) {
            Assert.isTrue(
                e.getMessage().contains('exact form name'),
                'The owner should be told how to confirm.'
            );
        }
        Test.stopTest();
    }

    private static Form__c createForm(String type, String name) {
        String objectApi = type == 'Survey' ? null : 'Account';
        Form__c form = TestDataFactory.createForms(1, type, objectApi, true)[0];
        form.Name = name;
        update as user form;
        return form;
    }

    private static Form_Version__c createVersion(Form__c form) {
        return TestDataFactory.createFinalFormVersion(
            form.Id,
            1,
            true,
            '{"specVersion":1}',
            true
        );
    }

    private static ContentVersion createFileLink(Id formId, String fileName) {
        ContentVersion version = new ContentVersion(
            Title = fileName,
            PathOnClient = fileName,
            VersionData = Blob.valueOf('image bytes'),
            IsMajorVersion = true
        );
        insert as user version;
        version = [
            SELECT Id, ContentDocumentId
            FROM ContentVersion
            WHERE Id = :version.Id
        ];
        insert as user new ContentDocumentLink(
            ContentDocumentId = version.ContentDocumentId,
            LinkedEntityId = formId,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        return version;
    }
}
