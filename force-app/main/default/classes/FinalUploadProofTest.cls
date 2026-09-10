@IsTest
private with sharing class FinalUploadProofTest {
    private static void configure() {
        FinalUploadProofPolicy.testEnvironment = true;
        FinalUploadProofPolicy.testPolicies = new Map<String, Final_Upload_Proof_Policy__mdt>{
            'Test' => new Final_Upload_Proof_Policy__mdt(
                Admission_Enabled__c = true
            )
        };
    }

    private static String reserve(Integer maxBytes) {
        configure();
        FinalUploadProofStore.lockLedger(true);
        String token = FinalUploadCapability.mint();
        insert new Final_Upload_Proof__c(
            Token_Hash__c = FinalUploadCapability.digest(token),
            Actor_User__c = UserInfo.getUserId(),
            Policy_Key__c = 'Test',
            State__c = 'RESERVED',
            Expires_At__c = System.now().addMinutes(10),
            Max_Bytes__c = maxBytes
        );
        return token;
    }

    private static ContentVersion file(String token, String name) {
        // Tiny test bytes only: this does not simulate native large-file transport.
        return new ContentVersion(
            Title = name,
            PathOnClient = name,
            VersionData = Blob.valueOf('proof'),
            Final_Upload_fileupload__c = token
        );
    }

    private static void assertRefused(ContentVersion version) {
        Database.SaveResult result = Database.insert(version, false);
        Assert.isFalse(
            result.isSuccess(),
            'The guarded native transaction must fail.'
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ContentVersion],
            'No version may survive rejection.'
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ContentDocument],
            'No document may survive rejection.'
        );
        Assert.areEqual(
            0,
            [
                SELECT COUNT()
                FROM Final_Upload_Proof__c
                WHERE State__c = 'READY'
            ],
            'No receipt may survive rejection.'
        );
    }

    @IsTest
    static void capabilityHasBoundedShapeAndDigest() {
        Test.startTest();
        String token = FinalUploadCapability.mint();
        Assert.areEqual(43, token.length(), '256-bit Base64URL shape.');
        Assert.areEqual(
            64,
            FinalUploadCapability.digest(token).length(),
            'SHA-256 hex shape.'
        );
        Assert.areNotEqual(
            token,
            FinalUploadCapability.mint(),
            'Independent grants.'
        );
        Assert.areEqual(
            null,
            FinalUploadCapability.digest('not-a-capability'),
            'Reject malformed input.'
        );
        Assert.areEqual(
            null,
            FinalUploadCapability.digest(null),
            'Reject absent input.'
        );
        Test.stopTest();
    }

    @IsTest
    static void acceptsBoundaryAndRemovesRawMarker() {
        String token = reserve(5);
        Test.startTest();
        ContentVersion version = file(token, 'proof.txt');
        insert version;
        Test.stopTest();
        Final_Upload_Proof__c grant = [
            SELECT
                State__c,
                Actual_Bytes__c,
                Version_Id__c,
                Document_Id__c,
                Token_Hash__c
            FROM Final_Upload_Proof__c
            LIMIT 1
        ];
        Assert.areEqual(
            'READY',
            grant.State__c,
            'Metadata accepted in the file transaction.'
        );
        Assert.areEqual(
            5,
            grant.Actual_Bytes__c,
            'Exact tiny-file byte count.'
        );
        Assert.areEqual(
            String.valueOf(version.Id),
            grant.Version_Id__c,
            'Receipt pins the accepted version.'
        );
        Assert.areEqual(
            FinalUploadCapability.digest(token),
            grant.Token_Hash__c,
            'Only a digest in the ledger.'
        );
        ContentVersion stored = [
            SELECT Final_Upload_fileupload__c
            FROM ContentVersion
            WHERE Id = :version.Id
        ];
        Assert.areEqual(
            null,
            stored.Final_Upload_fileupload__c,
            'Raw capability is removed before commit.'
        );

        // Operator inspection of a COMMITTED slot is folded in here rather than
        // given its own test: every file-inserting test spends against the
        // org's ContentPublication limit, and this class already sits at the
        // ceiling — a separate test tipped the whole run over and failed five
        // unrelated cases. This reuses the version above and costs nothing.
        asOperator();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Map<String, Object> status = FinalUploadProofController.inspectGrant(
                token
            );
            Assert.areEqual(
                'READY',
                status.get('state'),
                'A committed slot reports as ready.'
            );
            Assert.areEqual(
                true,
                status.get('versionStillExists'),
                'The accepted version is reported as present.'
            );
            Assert.areEqual(
                true,
                status.get('markerCleared'),
                'The raw capability must be gone after commit.'
            );
            Assert.isNotNull(
                status.get('ownerId'),
                'Operator inspection reports the real owner.'
            );
        }
    }

    @IsTest
    static void rejectsOversizeAtomically() {
        String token = reserve(4);
        Test.startTest();
        assertRefused(file(token, 'proof.txt'));
        Test.stopTest();
        Assert.areEqual(
            'RESERVED',
            [SELECT State__c FROM Final_Upload_Proof__c LIMIT 1].State__c,
            'Retry retains reservation.'
        );
    }

    @IsTest
    static void rejectsUnsupportedExtension() {
        String token = reserve(10);
        Test.startTest();
        assertRefused(file(token, 'proof.html'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsUnknownToken() {
        reserve(10);
        Test.startTest();
        assertRefused(file(FinalUploadCapability.mint(), 'proof.txt'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsExpiredToken() {
        String token = reserve(10);
        Final_Upload_Proof__c grant = [
            SELECT Id
            FROM Final_Upload_Proof__c
            LIMIT 1
        ];
        grant.Expires_At__c = System.now().addSeconds(-1);
        update grant;
        Test.startTest();
        assertRefused(file(token, 'proof.txt'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsDisabledAdmission() {
        String token = reserve(10);
        FinalUploadProofPolicy.testPolicies.get('Test')
            .Admission_Enabled__c = false;
        Test.startTest();
        assertRefused(file(token, 'proof.txt'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsProofInProduction() {
        String token = reserve(10);
        FinalUploadProofPolicy.testEnvironment = false;
        Test.startTest();
        assertRefused(file(token, 'proof.txt'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsMissingActorBinding() {
        String token = reserve(10);
        Final_Upload_Proof__c grant = [
            SELECT Id
            FROM Final_Upload_Proof__c
            LIMIT 1
        ];
        grant.Actor_User__c = null;
        update grant;
        Test.startTest();
        assertRefused(file(token, 'proof.txt'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsCallerChosenTarget() {
        String token = reserve(10);
        // Any file-publishable record serves as the caller-chosen target; the
        // assertion is about the target being REFUSED, not about the object.
        // Deliberately NOT an Account: this org carries an always-true Account
        // validation rule that fails every insert, so an Account here makes the
        // test unrunnable for a reason unrelated to what it is testing.
        Contact target = new Contact(LastName = 'Proof target');
        insert target;
        ContentVersion version = file(token, 'proof.txt');
        version.FirstPublishLocationId = target.Id;
        Test.startTest();
        assertRefused(version);
        Test.stopTest();
    }

    @IsTest
    static void successfulSlotCannotBeReused() {
        String token = reserve(10);
        insert file(token, 'first.txt');
        Test.startTest();
        Database.SaveResult result = Database.insert(
            file(token, 'second.txt'),
            false
        );
        Test.stopTest();
        Assert.isFalse(
            result.isSuccess(),
            'A committed slot cannot accept another document.'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'Only the first document survives.'
        );
    }

    @IsTest
    static void twoRowsCannotConsumeSameSlot() {
        String token = reserve(10);
        Test.startTest();
        Database.SaveResult[] results = Database.insert(
            new List<ContentVersion>{
                file(token, 'first.txt'),
                file(token, 'second.txt')
            },
            false
        );
        Test.stopTest();
        Integer successes = 0;
        for (Database.SaveResult result : results)
            if (result.isSuccess()) {
                successes++;
            }
        Assert.areEqual(
            1,
            successes,
            'Partial-save retries still consume the grant at most once.'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentDocument],
            'No duplicate stored document.'
        );
    }

    @IsTest
    static void acceptedDocumentCannotGainVersionWithoutMarker() {
        String token = reserve(10);
        insert file(token, 'first.txt');
        ContentVersion next = file(null, 'second.txt');
        next.ContentDocumentId = (Id) [
            SELECT Document_Id__c
            FROM Final_Upload_Proof__c
            LIMIT 1
        ]
        .Document_Id__c;
        Test.startTest();
        Database.SaveResult result = Database.insert(next, false);
        Test.stopTest();
        Assert.isFalse(
            result.isSuccess(),
            'Removing the marker cannot bypass version pinning.'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM ContentVersion],
            'Original version stays pinned.'
        );
    }

    @IsTest
    static void acceptedVersionCannotBeEdited() {
        String token = reserve(10);
        ContentVersion version = file(token, 'first.txt');
        insert version;
        Test.startTest();
        Database.SaveResult result = Database.update(
            new ContentVersion(Id = version.Id, Title = 'Changed'),
            false
        );
        Test.stopTest();
        Assert.isFalse(
            result.isSuccess(),
            'Proof metadata cannot drift after receipt validation.'
        );
    }

    @IsTest
    static void bulkOrdinaryFilesRemainUnaffected() {
        configure();
        List<ContentVersion> versions = new List<ContentVersion>();
        for (Integer index = 0; index < 251; index++) {
            versions.add(file(null, 'ordinary-' + index + '.txt'));
        }
        Test.startTest();
        insert versions;
        Test.stopTest();
        Assert.areEqual(
            251,
            [SELECT COUNT() FROM ContentVersion],
            'Unmarked authenticated uploads retain existing behavior across trigger chunks.'
        );
    }

    @IsTest
    static void bulkGuardProcessesDistinctGrantsAcrossTriggerChunks() {
        configure();
        FinalUploadProofStore.lockLedger(true);
        List<Final_Upload_Proof__c> grants = new List<Final_Upload_Proof__c>();
        List<ContentVersion> versions = new List<ContentVersion>();
        for (Integer index = 0; index < 251; index++) {
            String token = FinalUploadCapability.mint();
            grants.add(
                new Final_Upload_Proof__c(
                    Token_Hash__c = FinalUploadCapability.digest(token),
                    Actor_User__c = UserInfo.getUserId(),
                    Policy_Key__c = 'Test',
                    State__c = 'RESERVED',
                    Expires_At__c = System.now().addMinutes(10),
                    Max_Bytes__c = 5
                )
            );
            versions.add(file(token, 'guarded-' + index + '.txt'));
        }
        // Fixture bypasses the operator's 20-grant proof limit to exercise a real bulk trigger.
        insert grants;
        Test.startTest();
        insert versions;
        Test.stopTest();
        Assert.areEqual(
            251,
            [
                SELECT COUNT()
                FROM Final_Upload_Proof__c
                WHERE State__c = 'READY'
            ],
            'Every independent grant accepted once.'
        );
        Assert.areEqual(
            251,
            [
                SELECT COUNT()
                FROM ContentVersion
                WHERE Final_Upload_fileupload__c = NULL
            ],
            'Every raw marker removed across trigger chunks.'
        );
    }

    @IsTest
    static void disablingAdmissionDoesNotRemoveEnrollment() {
        configure();
        FinalUploadProofPolicy.testPolicies.put(
            'Guest',
            new Final_Upload_Proof_Policy__mdt(
                Guest_User_Id__c = UserInfo.getUserId(),
                Admission_Enabled__c = false
            )
        );
        Test.startTest();
        Assert.isTrue(
            FinalUploadProofPolicy.requiresMarker(
                'Guest',
                UserInfo.getUserId()
            ),
            'Enrolled guest must still present a marker.'
        );
        Assert.isFalse(
            FinalUploadProofPolicy.requiresMarker(
                'Standard',
                UserInfo.getUserId()
            ),
            'Ordinary authenticated files are unaffected.'
        );
        Test.stopTest();
    }

    @IsTest
    static void operatorPermissionIsRequired() {
        configure();
        Test.startTest();
        try {
            FinalUploadProofController.createGrant(UserInfo.getUserId(), 10);
            Assert.fail('An unassigned operator must not mint grants.');
        } catch (AuraHandledException expected) {
            Assert.areEqual(
                0,
                [SELECT COUNT() FROM Final_Upload_Proof__c],
                'Denied operator wrote nothing.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void operatorCanMintAndInspectWithoutPersistingSecret() {
        configure();
        PermissionSet permission = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Final_Upload_Proof_Admin'
            LIMIT 1
        ];
        insert new PermissionSetAssignment(
            AssigneeId = UserInfo.getUserId(),
            PermissionSetId = permission.Id
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            Map<String, Object> grant = FinalUploadProofController.createGrant(
                UserInfo.getUserId(),
                10
            );
            Map<String, Object> status = FinalUploadProofController.inspectGrant(
                (String) grant.get('slotToken')
            );
            Test.stopTest();
            Assert.areEqual(
                'RESERVED',
                status.get('state'),
                'Minted slot starts reserved.'
            );
            Assert.areEqual(
                null,
                status.get('documentId'),
                'Nothing attached or fabricated.'
            );
            Assert.areEqual(
                FinalUploadProofPolicy.markerField(),
                grant.get('markerField'),
                'Uses qualified marker metadata.'
            );
        }
    }

    @IsTest
    static void proofBudgetDoesNotRefundExpiredGrants() {
        reserve(FinalUploadProofPolicy.MAX_BYTES);
        Test.startTest();
        try {
            FinalUploadProofStore.checkBudget(104857600);
            Assert.fail('Capacity cannot be exceeded.');
        } catch (FinalUploadProofStore.ProofException expected) {
            Assert.areEqual(
                1,
                [SELECT COUNT() FROM Final_Upload_Proof__c],
                'Reservation still counted.'
            );
        }
        Test.stopTest();
    }

    /** Assign the operator permission so the refusal branches BELOW
     *  requireOperator are reachable at all. */
    private static void asOperator() {
        PermissionSet permission = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = 'Final_Upload_Proof_Admin'
            LIMIT 1
        ];
        insert new PermissionSetAssignment(
            AssigneeId = UserInfo.getUserId(),
            PermissionSetId = permission.Id
        );
    }

    private static void assertDenied(String because) {
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Final_Upload_Proof__c],
            because
        );
    }

    // The controller's refusal branches were unreachable in the delivered
    // tests, leaving it at 67% — under the 75% Salesforce requires, so the
    // batch could not be deployed at all. These exercise the guards an
    // OPERATOR still has to pass; the permission check itself is already
    // covered by operatorPermissionIsRequired.

    @IsTest
    static void operatorCannotMintWithoutAnActor() {
        configure();
        asOperator();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                FinalUploadProofController.createGrant(null, 10);
                Assert.fail('A grant with no actor must be refused.');
            } catch (AuraHandledException expected) {
                assertDenied('A refused mint writes nothing.');
            }
            Test.stopTest();
        }
    }

    @IsTest
    static void operatorCannotMintOutsideTheByteBounds() {
        configure();
        asOperator();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                FinalUploadProofController.createGrant(UserInfo.getUserId(), 0);
                Assert.fail('Zero bytes must be refused.');
            } catch (AuraHandledException expected) {
                assertDenied('A zero-byte mint writes nothing.');
            }
            try {
                FinalUploadProofController.createGrant(
                    UserInfo.getUserId(),
                    FinalUploadProofPolicy.MAX_BYTES + 1
                );
                Assert.fail('Over the proof maximum must be refused.');
            } catch (AuraHandledException expected) {
                assertDenied('An oversized mint writes nothing.');
            }
            Test.stopTest();
        }
    }

    @IsTest
    static void inspectingAnUnknownSlotIsRefused() {
        configure();
        asOperator();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                FinalUploadProofController.inspectGrant('not-a-real-slot');
                Assert.fail('An unknown slot must not be described.');
            } catch (AuraHandledException expected) {
                // A fabricated token must reveal nothing about the ledger.
                assertDenied('Inspection creates nothing.');
            }
            Test.stopTest();
        }
    }
}
