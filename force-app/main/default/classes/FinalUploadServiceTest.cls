@IsTest
private with sharing class FinalUploadServiceTest {
    @IsTest
    static void createsOnePrivateAttemptAndReturnsNoIds() {
        Form_Version__c v = FinalUploadTestData.published(false);
        Test.startTest();
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> status = FinalUploadTestData.call(
            new Map<String, Object>{
                'action' => 'status',
                'sessionToken' => token
            }
        );
        Test.stopTest();
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Upload__c],
            'One attempt record'
        );
        Assert.areEqual('OPEN', status.get('state'), 'Open attempt');
        Assert.isFalse(
            JSON.serialize(status).contains('Token_Hash'),
            'No hashes returned'
        );
        Assert.isFalse(
            JSON.serialize(status).contains('recordId'),
            'No ledger IDs returned'
        );
    }
    @IsTest
    static void signedInLimitsHaveNoGuestFallback() {
        Test.startTest();
        FinalUploadPolicy.Rules r = FinalUploadPolicy.limits(
            new Map<String, Object>(),
            false
        );
        Test.stopTest();
        Assert.isNull(r.maxFileBytes, 'No authenticated per-file default');
        Assert.isNull(r.maxTotalBytes, 'No authenticated total default');
        Assert.isNull(r.maxFiles, 'No authenticated count default');
        Assert.isNull(r.maxEntries, 'No authenticated lifetime count default');
    }
    @IsTest
    static void adminsCanRaiseGuestDefaults() {
        FinalSettingsController.manageOverride = true;
        Test.startTest();
        FinalSettingsController.saveUploadSettings(
            true,
            31457280,
            104857600,
            12,
            30
        );
        FinalUploadPolicy.Rules r = FinalUploadPolicy.limits(
            new Map<String, Object>(),
            true
        );
        Test.stopTest();
        Assert.areEqual(
            31457280,
            r.maxFileBytes,
            'Raised guest per-file default'
        );
        Assert.areEqual(12, r.maxFiles, 'Raised guest count');
        Assert.areEqual(104857600, r.maxTotalBytes, 'Raised guest total');
    }
    @IsTest
    static void adminsCanLowerGuestDefaults() {
        FinalSettingsController.manageOverride = true;
        Test.startTest();
        FinalSettingsController.saveUploadSettings(
            true,
            1048576,
            2097152,
            2,
            4
        );
        FinalUploadPolicy.Rules r = FinalUploadPolicy.limits(
            new Map<String, Object>(),
            true
        );
        Test.stopTest();
        Assert.areEqual(
            1048576,
            r.maxFileBytes,
            'Lowered guest per-file default'
        );
        Assert.areEqual(2, r.maxFiles, 'Lowered guest count');
    }
    @IsTest
    static void acceptsSixFilesOnOneSignedInAttempt() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        List<ContentVersion> uploads = new List<ContentVersion>();
        for (Integer i = 0; i < 6; i++) {
            Map<String, Object> slot = FinalUploadTestData.reserve(token);
            uploads.add(
                new ContentVersion(
                    Title = 'Sample',
                    PathOnClient = 'sample.txt',
                    VersionData = Blob.valueOf('small'),
                    Final_Upload_fileupload__c = (String) slot.get('slotToken')
                )
            );
        }
        Test.startTest();
        insert uploads;
        Test.stopTest();
        Form_Upload__c a = [SELECT Files_JSON__c FROM Form_Upload__c LIMIT 1];
        Assert.areEqual(
            6,
            FinalUploadService.files(a).size(),
            'All six file entries remain on one record'
        );
        Assert.areEqual(
            6,
            [SELECT COUNT() FROM ContentDocument],
            'Six native file inserts'
        );
        for (Object value : FinalUploadService.files(a)) {
            Assert.areEqual(
                'READY',
                FinalUploadPolicy.mapOf(value).get('state'),
                'Each entry accepted'
            );
        }
    }
    @IsTest
    static void unknownSecretCannotReadAttempt() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        String forged =
            token.substringBefore('.') +
            '.' +
            FinalUploadCapability.mint();
        Test.startTest();
        try {
            FinalUploadTestData.call(
                new Map<String, Object>{
                    'action' => 'status',
                    'sessionToken' => forged
                }
            );
            Assert.fail('Forged token accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().length() > 0, 'Safe refusal');
        }
        Test.stopTest();
    }
    @IsTest
    static void expiredAttemptCannotReserve() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Form_Upload__c a = [SELECT Id FROM Form_Upload__c LIMIT 1];
        a.Expires_At__c = System.now().addSeconds(-1);
        update a;
        Test.startTest();
        try {
            FinalUploadTestData.reserve(token);
            Assert.fail('Expired attempt accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().length() > 0, 'Safe refusal');
        }
        Test.stopTest();
    }
    @IsTest
    static void malformedJsonFailsClosed() {
        Test.startTest();
        try {
            FinalUploadController.uploadRequest('{');
            Assert.fail('Malformed JSON accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().length() > 0, 'Safe refusal');
        }
        Test.stopTest();
    }
    @IsTest
    static void missingUploadLimitsStayUnbounded() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Test.startTest();
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        Test.stopTest();
        Assert.isNull(
            slot.get('maxBytes'),
            'No hidden authenticated byte limit'
        );
    }
    @IsTest
    static void duplicateFileTokenCannotCommitTwice() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('slotToken'), 'first.txt');
        Test.startTest();
        Database.SaveResult result = Database.insert(
            new ContentVersion(
                Title = 'Second',
                PathOnClient = 'second.txt',
                VersionData = Blob.valueOf('small'),
                Final_Upload_fileupload__c = (String) slot.get('slotToken')
            ),
            false
        );
        Test.stopTest();
        Assert.isFalse(result.isSuccess(), 'Single-use file token');
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'No second committed document'
        );
    }
    @IsTest
    static void disallowedExtensionLeavesNoFile() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        Test.startTest();
        Database.SaveResult result = Database.insert(
            new ContentVersion(
                Title = 'Image',
                PathOnClient = 'image.png',
                VersionData = Blob.valueOf('small'),
                Final_Upload_fileupload__c = (String) slot.get('slotToken')
            ),
            false
        );
        Test.stopTest();
        Assert.isFalse(result.isSuccess(), 'Guard checks author allowlist');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ContentDocument],
            'Rejected document rolled back'
        );
    }
    @IsTest
    static void markerClearedAndSafeReceiptHasNoFileIds() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        Test.startTest();
        ContentVersion file = FinalUploadTestData.upload(
            (String) slot.get('slotToken'),
            'sample.txt'
        );
        Map<String, Object> status = FinalUploadTestData.call(
            new Map<String, Object>{
                'action' => 'status',
                'sessionToken' => token
            }
        );
        Test.stopTest();
        ContentVersion saved = [
            SELECT Final_Upload_fileupload__c, Form_Upload_Key__c
            FROM ContentVersion
            WHERE Id = :file.Id
        ];
        Assert.isNull(saved.Final_Upload_fileupload__c, 'Raw secret removed');
        Assert.isNotNull(
            saved.Form_Upload_Key__c,
            'Non-secret attempt reference retained'
        );
        Assert.isFalse(
            JSON.serialize(status).contains('contentDocumentId'),
            'No file IDs returned'
        );
    }
    @IsTest
    static void unmarkedBulkUploadsDoNotUseAttemptQueriesPerRow() {
        List<ContentVersion> files = new List<ContentVersion>();
        for (Integer i = 0; i < 251; i++) {
            files.add(
                new ContentVersion(
                    Title = 'small',
                    PathOnClient = 'small.txt',
                    VersionData = Blob.valueOf('x')
                )
            );
        }
        Test.startTest();
        insert files;
        Integer queries = Limits.getQueries();
        Test.stopTest();
        Assert.areEqual(
            251,
            [SELECT COUNT() FROM ContentDocument],
            'Bulk ordinary Files remain available'
        );
        Assert.isTrue(queries < 20, 'No per-file queries');
    }
    @IsTest
    static void explicitRestrictionsStillApplyToSignedInUsers() {
        Map<String, Object> spec = new Map<String, Object>{
            'settings' => new Map<String, Object>{
                'uploads' => new Map<String, Object>{
                    'transport' => 'stagedV1',
                    'maxTotalBytes' => 1000,
                    'maxFiles' => 2
                }
            }
        };
        Test.startTest();
        FinalUploadPolicy.Rules r = FinalUploadPolicy.limits(spec, false);
        FinalUploadPolicy.validateSpec(spec);
        Test.stopTest();
        Assert.areEqual(1000, r.maxTotalBytes, 'Explicit total limit');
        Assert.areEqual(2, r.maxFiles, 'Explicit count');
        Assert.isNull(r.maxFileBytes, 'No implicit file maximum');
    }
    @IsTest
    static void omittedAcceptAllowsAnyExtension() {
        Test.startTest();
        Set<String> none = FinalUploadPolicy.extensions(null);
        Set<String> custom = FinalUploadPolicy.extensions('.custom,.PDF');
        Test.stopTest();
        Assert.areEqual(0, none.size(), 'No app type restriction');
        Assert.isTrue(
            custom.contains('custom'),
            'Author may allow arbitrary extensions'
        );
        Assert.isTrue(custom.contains('pdf'), 'Case normalized');
    }
    @IsTest
    static void knownMimeAliasesHaveServerParity() {
        Test.startTest();
        Set<String> types = FinalUploadPolicy.extensions(
            'image/*,application/pdf'
        );
        Test.stopTest();
        Assert.isTrue(types.contains('jpg'), 'Image alias mapped');
        Assert.isTrue(types.contains('pdf'), 'PDF MIME mapped');
    }
    @IsTest
    static void runtimeSecretsCannotBeImported() {
        Test.startTest();
        try {
            FinalUploadPolicy.validateSpec(
                new Map<String, Object>{ 'slotToken' => 'secret' }
            );
            Assert.fail('Runtime data accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().contains('runtime'),
                'Repairable import diagnostic'
            );
        }
        Test.stopTest();
    }
    @IsTest
    static void unknownTransportCannotPublish() {
        Test.startTest();
        try {
            FinalUploadPolicy.validateSpec(
                new Map<String, Object>{
                    'settings' => new Map<String, Object>{
                        'uploads' => new Map<String, Object>{
                            'transport' => 'other'
                        }
                    }
                }
            );
            Assert.fail('Unknown transport accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().contains('supported'),
                'Repairable publish diagnostic'
            );
        }
        Test.stopTest();
    }
    @IsTest
    static void settingsRequireExistingAdminPermission() {
        FinalSettingsController.manageOverride = false;
        Test.startTest();
        try {
            FinalSettingsController.saveUploadSettings(true, 1, 1, 1, 1);
            Assert.fail('Non-admin changed settings');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().length() > 0,
                'Safe permission refusal'
            );
        }
        Test.stopTest();
    }
}
