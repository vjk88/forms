@IsTest
private with sharing class FinalUploadServiceTest {
    @IsTest
    static void sessionAndSlotsWriteNothingUntilAFileArrives() {
        Form_Version__c v = FinalUploadTestData.published(false);
        Test.startTest();
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> status = FinalUploadTestData.call(
            new Map<String, Object>{
                'action' => 'status',
                'sessionToken' => token
            }
        );
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.reserve(token);
        FinalUploadTestData.call(
            new Map<String, Object>{
                'action' => 'cancel',
                'sessionToken' => token
            }
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Upload__c],
            'No record from a session, two slots or a cancel'
        );
        FinalUploadTestData.upload((String) slot.get('tag'), 'one.txt');
        Test.stopTest();
        Form_Upload__c a = [
            SELECT Status__c, Public_Host__c, Guest_User_Id__c, Expires_At__c
            FROM Form_Upload__c
        ];
        Assert.areEqual('OPEN', a.Status__c, 'First file opens the attempt');
        Assert.isFalse(a.Public_Host__c, 'Host taken from the marker');
        Assert.isNull(a.Guest_User_Id__c, 'Signed-in attempt');
        Assert.isTrue(
            a.Expires_At__c > System.now().addMinutes(110),
            'Two-hour attempt expiry taken from the marker'
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
                    Final_Upload_fileupload__c = (String) slot.get('tag')
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
        String forged = FinalUploadTestData.tamper(token);
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
        FinalUploadTestData.upload(
            (String) FinalUploadTestData.reserve(token).get('tag'),
            'one.txt'
        );
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
    static void oneTagTakesSeveralFilesOnOneAttempt() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        String tag = (String) FinalUploadTestData.reserve(token).get('tag');
        FinalUploadTestData.upload(tag, 'first.txt');
        Test.startTest();
        Database.SaveResult result = FinalUploadTestData.tryUpload(
            tag,
            'second.txt'
        );
        Test.stopTest();
        Assert.isTrue(result.isSuccess(), 'The same tag takes another file');
        Form_Upload__c a = [SELECT Files_JSON__c FROM Form_Upload__c];
        List<Object> files = FinalUploadService.files(a);
        Assert.areEqual(2, files.size(), 'Both files on the one attempt');
        Assert.areNotEqual(
            FinalUploadPolicy.mapOf(files[0]).get('key'),
            FinalUploadPolicy.mapOf(files[1]).get('key'),
            'Each file gets its own server key'
        );
    }
    @IsTest
    static void anotherSessionCannotRemoveThisFile() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String mine = FinalUploadTestData.attempt(v);
        FinalUploadTestData.upload(
            (String) FinalUploadTestData.reserve(mine).get('tag'),
            'mine.txt'
        );
        String key = FinalUploadTestData.keys(mine)[0];
        String other = FinalUploadTestData.attempt(v);
        Test.startTest();
        FinalUploadTestData.remove(other, key);
        Test.stopTest();
        Assert.areEqual(
            1,
            FinalUploadTestData.keys(mine).size(),
            'A key alone cannot remove another visit\'s file'
        );
        Assert.areEqual(1, [SELECT COUNT() FROM ContentDocument], 'Kept');
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
                Final_Upload_fileupload__c = (String) slot.get('tag')
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
            (String) slot.get('tag'),
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
    static void alteredMarkerIsRefused() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        String marker = (String) FinalUploadTestData.reserve(token).get('tag');
        // Flip the public-host flag (the segment before the signature).
        List<String> parts = marker.split('\\.');
        parts[5] = parts[5] == '0' ? '1' : '0';
        Test.startTest();
        Database.SaveResult flipped = FinalUploadTestData.tryUpload(
            String.join(parts, '.'),
            'flipped.txt'
        );
        Database.SaveResult forged = FinalUploadTestData.tryUpload(
            FinalUploadTestData.tamper(marker),
            'forged.txt'
        );
        Test.stopTest();
        Assert.isFalse(flipped.isSuccess(), 'Host flag cannot be changed');
        Assert.isFalse(forged.isSuccess(), 'Signature cannot be forged');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Upload__c],
            'No record from refused files'
        );
    }
    @IsTest
    static void refusedFirstFileLeavesTheTagUsable() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String marker = (String) FinalUploadTestData.reserve(
                FinalUploadTestData.attempt(v)
            )
            .get('tag');
        Test.startTest();
        Database.SaveResult refused = FinalUploadTestData.tryUpload(
            marker,
            'image.png' // not on the question's .pdf,.txt list
        );
        Database.SaveResult retried = FinalUploadTestData.tryUpload(
            marker,
            'retry.txt'
        );
        Test.stopTest();
        Assert.isFalse(refused.isSuccess(), 'First file refused');
        Assert.isTrue(retried.isSuccess(), 'Same tag accepts the re-pick');
        Form_Upload__c a = [SELECT Files_JSON__c FROM Form_Upload__c];
        Assert.areEqual(
            1,
            FinalUploadService.files(a).size(),
            'One attempt holding the one accepted file'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'Refused file rolled back'
        );
    }
    @IsTest
    static void markerOnlyWorksForItsOwnUser() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String marker = (String) FinalUploadTestData.reserve(
                FinalUploadTestData.attempt(v)
            )
            .get('tag');
        User other = new User(
            ProfileId = [
                SELECT Id
                FROM Profile
                WHERE Name = 'System Administrator'
                LIMIT 1
            ]
            .Id,
            LastName = 'Other',
            Email = 'upload-other@example.com',
            Username = 'upload-other-' +
                System.currentTimeMillis() +
                '@example.com',
            Alias = 'uother',
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert other;
        Database.SaveResult result;
        Test.startTest();
        System.runAs(other) {
            result = FinalUploadTestData.tryUpload(marker, 'stolen.txt');
        }
        Test.stopTest();
        Assert.isFalse(
            result.isSuccess(),
            'Another user cannot use the marker'
        );
    }
    @IsTest
    static void uploadsSwitchedOffAfterReserveAreRefused() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String marker = (String) FinalUploadTestData.reserve(
                FinalUploadTestData.attempt(v)
            )
            .get('tag');
        Final_Settings__c s = Final_Settings__c.getInstance('org');
        s.Uploads_Enabled__c = false;
        update s;
        Test.startTest();
        Database.SaveResult result = FinalUploadTestData.tryUpload(
            marker,
            'off.txt'
        );
        Test.stopTest();
        Assert.isFalse(result.isSuccess(), 'Switch rechecked on arrival');
        Assert.areEqual(0, [SELECT COUNT() FROM Form_Upload__c], 'No record');
    }
    @IsTest
    static void countLimitIsEnforcedOnArrival() {
        Form_Version__c v = FinalUploadTestData.published(false);
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            FinalSpecStore.read(
                [
                    SELECT Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c
                    FROM Form_Version__c
                    WHERE Id = :v.Id
                ]
            )
        );
        ((Map<String, Object>) ((Map<String, Object>) spec.get('settings'))
                .get('uploads'))
            .put('maxFiles', 1);
        FinalSpecStore.write(v, JSON.serialize(spec));
        update v;
        String token = FinalUploadTestData.attempt(v);
        // Two slots handed out before any file arrived: reserve cannot know.
        String first = (String) FinalUploadTestData.reserve(token).get('tag');
        String second = (String) FinalUploadTestData.reserve(token).get('tag');
        Test.startTest();
        FinalUploadTestData.upload(first, 'one.txt');
        Database.SaveResult over = FinalUploadTestData.tryUpload(
            second,
            'two.txt'
        );
        Test.stopTest();
        Assert.isFalse(over.isSuccess(), 'Second file over the limit refused');
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'Only the first file kept'
        );
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
