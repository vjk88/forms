@IsTest
private with sharing class FinalUploadFinalizeTest {
    @IsTest
    static void linksMultipleFilesAndRetriesWithoutDuplicateRecord() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> first = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) first.get('tag'), 'one.txt');
        Map<String, Object> second = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) second.get('tag'), 'two.txt');
        Map<String, Object> payload = FinalUploadTestData.payload(
            v,
            token,
            new List<Map<String, Object>>{ first, second }
        );
        Test.startTest();
        FinalSubmitController.SubmitResult result = FinalSubmitController.submitForm(
            v.Form__c,
            v.Id,
            JSON.serialize(payload)
        );
        FinalSubmitController.SubmitResult replay = FinalSubmitController.submitForm(
            v.Form__c,
            v.Id,
            JSON.serialize(payload)
        );
        Test.stopTest();
        Assert.isTrue(
            result.errors == null || result.errors.isEmpty(),
            'Submission errors: ' + JSON.serialize(result.errors)
        );
        Assert.areEqual(
            result.recordId,
            replay.recordId,
            'Same result on retry'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE LastName = 'Upload respondent'],
            'One business record'
        );
        Assert.areEqual(
            2,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :result.recordId
            ],
            'Both files linked to the created record'
        );
        Assert.areEqual(
            2,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE
                    LinkedEntityId = :result.recordId
                    AND Visibility = 'InternalUsers'
            ],
            'Signed-in links stay internal'
        );
        Assert.areEqual(
            'CONSUMED',
            [SELECT Status__c FROM Form_Upload__c LIMIT 1].Status__c,
            'Attempt consumed'
        );
    }
    @IsTest
    static void untouchedOptionalFileSubmitsWithoutAnUploadRecord() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        String payload = JSON.serialize(
            FinalUploadTestData.payload(
                v,
                token,
                new List<Map<String, Object>>()
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult result = FinalSubmitController.submitForm(
            v.Form__c,
            v.Id,
            payload
        );
        Test.stopTest();
        Assert.isTrue(
            result.errors == null || result.errors.isEmpty(),
            'Submission errors: ' + JSON.serialize(result.errors)
        );
        Assert.isNotNull(result.recordId, 'Business record created');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Upload__c],
            'No upload record when no file ever arrived'
        );
    }
    @IsTest
    static void removingTheOnlyOptionalFileStillSubmits() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('tag'), 'one.txt');
        FinalUploadTestData.removeFirst(token);
        String payload = JSON.serialize(
            FinalUploadTestData.payload(
                v,
                token,
                new List<Map<String, Object>>()
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult result = FinalSubmitController.submitForm(
            v.Form__c,
            v.Id,
            payload
        );
        Test.stopTest();
        Assert.isTrue(
            result.errors == null || result.errors.isEmpty(),
            'Submission errors: ' + JSON.serialize(result.errors)
        );
        Form_Upload__c a = [
            SELECT Status__c, Files_JSON__c
            FROM Form_Upload__c
            LIMIT 1
        ];
        Assert.areEqual('CONSUMED', a.Status__c, 'Existing attempt finished');
        Assert.areEqual(
            'REMOVED',
            FinalUploadPolicy.mapOf(FinalUploadService.files(a)[0])
                .get('state'),
            'Removed file keeps its cleanup state'
        );
        Assert.areEqual(
            0,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :result.recordId
            ],
            'Nothing linked'
        );
    }
    @IsTest
    static void requiredFileRefusedAfterItsOnlyFileWasRemoved() {
        Form_Version__c v = FinalUploadTestData.published(true);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('tag'), 'one.txt');
        FinalUploadTestData.removeFirst(token);
        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                v.Form__c,
                v.Id,
                JSON.serialize(
                    FinalUploadTestData.payload(
                        v,
                        token,
                        new List<Map<String, Object>>()
                    )
                )
            );
            Assert.fail('Required file question submitted empty');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().length() > 0, 'Required file refused');
        }
        Test.stopTest();
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE LastName = 'Upload respondent'],
            'No business DML'
        );
    }
    @IsTest
    static void requiredFileCannotBeForgedInAnswers() {
        Form_Version__c v = FinalUploadTestData.published(true);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> payload = FinalUploadTestData.payload(
            v,
            token,
            new List<Map<String, Object>>()
        );
        FinalUploadPolicy.mapOf(payload.get('answers'))
            .put(
                'docs',
                new List<Object>{
                    new Map<String, Object>{ 'name' => 'fake.pdf' }
                }
            );
        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                v.Form__c,
                v.Id,
                JSON.serialize(payload)
            );
            Assert.fail('Forged answer bypassed required receipt');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().length() > 0, 'Required file refused');
        }
        Test.stopTest();
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE LastName = 'Upload respondent'],
            'No business DML'
        );
    }
    @IsTest
    static void failedBusinessSaveLeavesReadyFileRetryable() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('tag'), 'one.txt');
        Map<String, Object> payload = FinalUploadTestData.payload(
            v,
            token,
            new List<Map<String, Object>>{ slot }
        );
        payload.put('answers', new Map<String, Object>());
        Test.startTest();
        FinalSubmitController.SubmitResult refused = FinalSubmitController.submitForm(
            v.Form__c,
            v.Id,
            JSON.serialize(payload)
        );
        Test.stopTest();
        Assert.isNotNull(
            refused.errors,
            'Missing required business field is returned as field errors'
        );
        Assert.isFalse(refused.errors.isEmpty(), 'Business save was refused');

        Form_Upload__c a = [
            SELECT Status__c, Files_JSON__c
            FROM Form_Upload__c
            LIMIT 1
        ];
        Assert.areEqual('OPEN', a.Status__c, 'Attempt remains open');
        Assert.areEqual(
            'READY',
            FinalUploadPolicy.mapOf(FinalUploadService.files(a)[0])
                .get('state'),
            'File remains ready'
        );
    }
    @IsTest
    static void removingFileDeletesImmediatelyAndIsRepeatable() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('tag'), 'one.txt');
        Map<String, Object> operation = new Map<String, Object>{
            'action' => 'remove',
            'sessionToken' => token,
            'fileKey' => FinalUploadTestData.keys(token)[0]
        };
        Test.startTest();
        FinalUploadTestData.call(operation);
        FinalUploadTestData.call(operation);
        Test.stopTest();
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ContentDocument],
            'Removed file deleted immediately'
        );
    }
    @IsTest
    static void cleanupPreservesFileSharedElsewhere() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        ContentVersion uploaded = FinalUploadTestData.upload(
            (String) slot.get('tag'),
            'shared.txt'
        );
        ContentVersion file = [
            SELECT ContentDocumentId
            FROM ContentVersion
            WHERE Id = :uploaded.Id
        ];
        Contact target = new Contact(LastName = 'Other');
        insert target;
        try {
            insert new ContentDocumentLink(
                ContentDocumentId = file.ContentDocumentId,
                LinkedEntityId = target.Id,
                ShareType = 'V'
            );
        } catch (DmlException failure) {
            Assert.fail(
                'Sharing insert: ' +
                    failure.getMessage() +
                    '; guard: ' +
                    FinalUploadGuard.testDiagnostic
            );
        }
        Test.startTest();
        FinalUploadTestData.call(
            new Map<String, Object>{
                'action' => 'remove',
                'sessionToken' => token,
                'fileKey' => FinalUploadTestData.keys(token)[0]
            }
        );
        Test.stopTest();
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'Shared file preserved'
        );
        Form_Upload__c a = [SELECT Files_JSON__c FROM Form_Upload__c LIMIT 1];
        Assert.areEqual(
            'REVIEW',
            FinalUploadPolicy.mapOf(FinalUploadService.files(a)[0])
                .get('cleanupStatus'),
            'Review recorded'
        );
    }
    @IsTest
    static void schedulerCleansExpiredAttempts() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = FinalUploadTestData.attempt(v);
        Map<String, Object> slot = FinalUploadTestData.reserve(token);
        FinalUploadTestData.upload((String) slot.get('tag'), 'expired.txt');
        Form_Upload__c a = [SELECT Id FROM Form_Upload__c LIMIT 1];
        a.Expires_At__c = System.now().addHours(-1);
        a.Cleanup_After__c = System.now().addHours(-1);
        update a;
        Test.startTest();
        new FinalUploadCleanupScheduler().execute(null);
        Test.stopTest();
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ContentDocument],
            'Expired abandoned file deleted'
        );
        Assert.areEqual(
            'EXPIRED',
            [SELECT Status__c FROM Form_Upload__c LIMIT 1].Status__c,
            'Attempt expired'
        );
    }
}
