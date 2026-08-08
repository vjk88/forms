/**
 * FinalSurveyTokenServiceTest — SO-4 Tier 1 crypto: a token round-trips, a
 * tampered or garbage token resolves to null (no oracle), and keys provision
 * exactly once.
 */
@isTest
private class FinalSurveyTokenServiceTest {
    private static Id sampleFormId() {
        Form__c f = new Form__c(Name = 'Tok', Form_Type__c = 'Survey');
        insert f;
        return f.Id;
    }

    private static Id sampleRecordId() {
        Job_Application__c ja = new Job_Application__c(Desired_Salary__c = 1);
        insert ja;
        return ja.Id;
    }

    @isTest
    static void roundTripPreservesClaims() {
        Id formId = sampleFormId();
        Id recordId = sampleRecordId();
        Test.startTest();
        String token = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c'
        );
        FinalSurveyTokenService.Claims c = FinalSurveyTokenService.resolve(
            token
        );
        Test.stopTest();
        System.assertNotEquals(null, c, 'valid token resolves');
        System.assertEquals(formId, c.formId, 'formId survives');
        System.assertEquals(recordId, c.recordId, 'recordId survives');
        System.assertEquals(
            'Job_Application__c',
            c.sObjectType,
            'sObjectType survives'
        );
        System.assert(c.expiry > c.issuedAt, 'expiry is after issue');
        System.assert(
            !token.contains(String.valueOf(recordId)),
            'the raw record Id never appears in the token (encrypted, not signed)'
        );
    }

    @isTest
    static void tamperedTokenIsRejected() {
        Id formId = sampleFormId();
        Id recordId = sampleRecordId();
        String token = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c'
        );
        // flip a character in the ciphertext segment
        List<String> segs = token.split('\\.');
        String ct = segs[1];
        String flipped =
            (ct.substring(0, 1) == 'A' ? 'B' : 'A') + ct.substring(1);
        String bad = segs[0] + '.' + flipped;
        Test.startTest();
        FinalSurveyTokenService.Claims c = FinalSurveyTokenService.resolve(bad);
        Test.stopTest();
        System.assertEquals(null, c, 'a tampered ciphertext fails the MAC');
    }

    @isTest
    static void garbageAndBlankResolveToNull() {
        // provision keys so resolve gets past the "no keys" short-circuit
        FinalSurveyTokenService.mint(
            sampleFormId(),
            sampleRecordId(),
            'Job_Application__c'
        );
        Test.startTest();
        System.assertEquals(
            null,
            FinalSurveyTokenService.resolve(null),
            'null → null'
        );
        System.assertEquals(
            null,
            FinalSurveyTokenService.resolve('not-a-token'),
            'no dot → null'
        );
        System.assertEquals(
            null,
            FinalSurveyTokenService.resolve('AAAA.BBBB'),
            'bad MAC → null'
        );
        Test.stopTest();
    }

    @isTest
    static void trackedTokenCarriesInvitationNonce() {
        Id formId = sampleFormId();
        Id recordId = sampleRecordId();
        Test.startTest();
        // any valid Id round-trips as the nonce (real nonce = a Survey_Invitation__c Id)
        String tracked = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c',
            30,
            recordId
        );
        String untracked = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c'
        );
        Test.stopTest();
        System.assertEquals(
            recordId,
            FinalSurveyTokenService.resolve(tracked).invitationId,
            'the nonce round-trips'
        );
        System.assertEquals(
            null,
            FinalSurveyTokenService.resolve(untracked).invitationId,
            'an untracked link has no invitation nonce'
        );
    }

    @isTest
    static void keysProvisionOnceAndAreReused() {
        Id formId = sampleFormId();
        Id recordId = sampleRecordId();
        Test.startTest();
        String t1 = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c'
        );
        String t2 = FinalSurveyTokenService.mint(
            formId,
            recordId,
            'Job_Application__c'
        );
        Test.stopTest();
        // both resolve against the SAME provisioned key material
        System.assertNotEquals(
            null,
            FinalSurveyTokenService.resolve(t1),
            't1 valid'
        );
        System.assertNotEquals(
            null,
            FinalSurveyTokenService.resolve(t2),
            't2 valid'
        );
        System.assertEquals(
            1,
            [SELECT COUNT() FROM FinalLinkSecret__c],
            'exactly one key row provisioned'
        );
    }
}
