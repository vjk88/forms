/**
 * FinalGuestLinkTest — SO-4 Tier 1 end-to-end: a minted record link resolves
 * to rule verdicts + author-opted prefill (and NOTHING else), the kill switch
 * and expiry cut links off, a guest submit stamps the record ref from the
 * TOKEN, and the studio + invocable minters gate on read access.
 *
 * Runs on Job_Application__c (the org's Account has joke validation rules).
 */
@isTest
private class FinalGuestLinkTest {
    // el_name is guest-prefill opted; el_salary is mapped but NOT opted; the
    // gated element shows only when the record's Applicant_Name is 'Ada'.
    private static String specJson() {
        Map<String, Object> elName = new Map<String, Object>{
            'id' => 'el_name',
            'type' => 'field',
            'label' => 'Name',
            'binding' => null,
            'config' => new Map<String, Object>{ 'inputType' => 'text' },
            'mapping' => new Map<String, Object>{
                'object' => 'Job_Application__c',
                'field' => 'Applicant_Name__c',
                'guestPrefill' => true
            }
        };
        Map<String, Object> elSalary = new Map<String, Object>{
            'id' => 'el_salary',
            'type' => 'field',
            'label' => 'Salary',
            'binding' => null,
            'config' => new Map<String, Object>{ 'inputType' => 'number' },
            'mapping' => new Map<String, Object>{
                'object' => 'Job_Application__c',
                'field' => 'Desired_Salary__c'
            }
        };
        Map<String, Object> elGated = new Map<String, Object>{
            'id' => 'el_gated',
            'type' => 'field',
            'label' => 'Gated',
            'binding' => null,
            'config' => new Map<String, Object>{ 'inputType' => 'text' },
            'visibility' => new Map<String, Object>{
                'action' => 'show',
                'logic' => 'all',
                'rules' => new List<Object>{
                    new Map<String, Object>{
                        'source' => 'record:Applicant_Name__c',
                        'operator' => 'equals',
                        'value' => 'Ada Lovelace'
                    }
                }
            }
        };
        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{
                'type' => 'survey',
                'targetObject' => 'Job_Application__c'
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_main',
                            'elements' => new List<Object>{
                                elName,
                                elSalary,
                                elGated
                            }
                        }
                    }
                }
            }
        };
        return JSON.serialize(spec);
    }

    private static Form__c makeGuestSurvey(String name) {
        Form__c form = new Form__c(
            Name = name,
            Form_Type__c = 'Survey',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest',
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert form;
        insert new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = specJson()
        );
        return form;
    }

    private static Job_Application__c makeRecord() {
        Job_Application__c ja = new Job_Application__c(
            Applicant_Name__c = 'Ada Lovelace',
            Desired_Salary__c = 250
        );
        insert ja;
        return ja;
    }

    /** Object read so the studio/invocable USER_MODE + access checks pass. */
    private static void grantJobAppAccess() {
        PermissionSet ps = new PermissionSet(
            Name = 'SO4LinkTestPS',
            Label = 'SO4LinkTestPS'
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert ps;
            insert new ObjectPermissions(
                ParentId = ps.Id,
                SobjectType = 'Job_Application__c',
                PermissionsRead = true,
                PermissionsCreate = true,
                PermissionsEdit = true
            );
            // the studio's invalidateLinks writes this field WITH USER_MODE
            insert new FieldPermissions(
                ParentId = ps.Id,
                SobjectType = 'Form__c',
                Field = 'Form__c.Links_Invalidated_On__c',
                PermissionsRead = true,
                PermissionsEdit = true
            );
            // Tier 2: the tracked mint does `insert as user` on the invitation
            insert new ObjectPermissions(
                ParentId = ps.Id,
                SobjectType = 'Survey_Invitation__c',
                PermissionsRead = true,
                PermissionsCreate = true,
                PermissionsEdit = true
            );
            List<FieldPermissions> invFls = new List<FieldPermissions>();
            for (
                String f : new List<String>{
                    'Form__c',
                    'Record_Id__c',
                    'Record_Type__c',
                    'Recipient__c',
                    'Expires_On__c',
                    'Single_Use__c',
                    'Revoked__c',
                    'Responded_On__c',
                    'Sent_On__c'
                }
            ) {
                invFls.add(
                    new FieldPermissions(
                        ParentId = ps.Id,
                        SobjectType = 'Survey_Invitation__c',
                        Field = 'Survey_Invitation__c.' + f,
                        PermissionsRead = true,
                        PermissionsEdit = true
                    )
                );
            }
            insert invFls;
            insert new PermissionSetAssignment(
                AssigneeId = UserInfo.getUserId(),
                PermissionSetId = ps.Id
            );
        }
    }

    @isTest
    static void guestContextReturnsVerdictsAndOptedPrefillOnly() {
        Form__c form = makeGuestSurvey('Ctx');
        Job_Application__c ja = makeRecord();
        Test.startTest();
        String token = FinalSurveyTokenService.mint(
            form.Id,
            ja.Id,
            'Job_Application__c'
        );
        Map<String, Object> ctx = FinalGuestController.getGuestRecordContext(
            form.Id,
            token
        );
        Test.stopTest();
        Map<String, Object> facts = (Map<String, Object>) ctx.get('ruleFacts');
        Map<String, Object> prefill = (Map<String, Object>) ctx.get('prefill');
        System.assertEquals(
            true,
            facts.get('record:Applicant_Name__c|equals|Ada Lovelace'),
            'record rule froze to a TRUE verdict'
        );
        System.assertEquals(
            'Ada Lovelace',
            prefill.get('el_name'),
            'guest-opted field prefills'
        );
        System.assert(
            !prefill.containsKey('el_salary'),
            'a mapped field NOT opted into guest links never prefills'
        );
    }

    @isTest
    static void killSwitchInvalidatesOutstandingLinks() {
        Form__c form = makeGuestSurvey('Kill');
        Job_Application__c ja = makeRecord();
        String token = FinalSurveyTokenService.mint(
            form.Id,
            ja.Id,
            'Job_Application__c'
        );
        // stamp the cutoff AFTER the token's issue instant
        form.Links_Invalidated_On__c = Datetime.now().addDays(1);
        update form;
        Test.startTest();
        Map<String, Object> ctx = FinalGuestController.getGuestRecordContext(
            form.Id,
            token
        );
        Test.stopTest();
        Map<String, Object> facts = (Map<String, Object>) ctx.get('ruleFacts');
        System.assert(
            facts.isEmpty(),
            'a link older than the kill-switch cutoff yields no context'
        );
    }

    @isTest
    static void expiredTokenYieldsNoContext() {
        Form__c form = makeGuestSurvey('Exp');
        Job_Application__c ja = makeRecord();
        Long past = Datetime.now().addDays(-40).getTime();
        Long expired = Datetime.now().addDays(-10).getTime();
        String token = FinalSurveyTokenService.buildToken(
            form.Id,
            ja.Id,
            'Job_Application__c',
            past,
            expired
        );
        Test.startTest();
        Map<String, Object> ctx = FinalGuestController.getGuestRecordContext(
            form.Id,
            token
        );
        Test.stopTest();
        System.assert(
            ((Map<String, Object>) ctx.get('ruleFacts')).isEmpty(),
            'an expired token yields no context'
        );
    }

    @isTest
    static void tokenForAnotherFormIsIgnored() {
        Form__c formA = makeGuestSurvey('A');
        Form__c formB = makeGuestSurvey('B');
        Job_Application__c ja = makeRecord();
        String tokenA = FinalSurveyTokenService.mint(
            formA.Id,
            ja.Id,
            'Job_Application__c'
        );
        Test.startTest();
        Map<String, Object> ctx = FinalGuestController.getGuestRecordContext(
            formB.Id,
            tokenA
        );
        Test.stopTest();
        System.assert(
            ((Map<String, Object>) ctx.get('ruleFacts')).isEmpty(),
            'a token minted for form A never resolves against form B'
        );
    }

    @isTest
    static void guestSubmitStampsRecordRefFromToken() {
        Form__c form = makeGuestSurvey('Stamp');
        Job_Application__c ja = makeRecord();
        String token = FinalSurveyTokenService.mint(
            form.Id,
            ja.Id,
            'Job_Application__c'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_name' => 'Ada' },
                'repeats' => new Map<String, Object>(),
                'meta' => new Map<String, Object>{ 'rt' => token }
            }
        );
        Test.startTest();
        FinalGuestController.submitGuest(form.Id, payload);
        Test.stopTest();
        Form_Response__c resp = [
            SELECT Related_Record_Id__c, Related_Record_Type__c
            FROM Form_Response__c
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        System.assertEquals(
            String.valueOf(ja.Id),
            resp.Related_Record_Id__c,
            'response stamped with the token-sourced record Id'
        );
        System.assertEquals(
            'Job_Application__c',
            resp.Related_Record_Type__c,
            'and the object type'
        );
    }

    @isTest
    static void guestSubmitWithoutTokenLeavesRefBlank() {
        Form__c form = makeGuestSurvey('NoTok');
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_name' => 'x' },
                'repeats' => new Map<String, Object>(),
                'meta' => new Map<String, Object>()
            }
        );
        Test.startTest();
        FinalGuestController.submitGuest(form.Id, payload);
        Test.stopTest();
        Form_Response__c resp = [
            SELECT Related_Record_Id__c
            FROM Form_Response__c
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        System.assertEquals(
            null,
            resp.Related_Record_Id__c,
            'a tokenless submit is byte-identical to today — no stamp'
        );
    }

    @isTest
    static void studioMintAndInvalidate() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('Studio');
        Map<String, Object> res;
        Datetime cutoff;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            Test.startTest();
            res = FinalStudioController.mintRecordLink(form.Id, ja.Id);
            cutoff = FinalStudioController.invalidateLinks(form.Id);
            Test.stopTest();
        }
        System.assert(
            ((String) res.get('query')).contains('c__rt='),
            'mint returns a ready-to-append link query'
        );
        System.assert(
            ((String) res.get('query')).contains('c__formId='),
            'query carries the form id for the guest host'
        );
        System.assertNotEquals(null, cutoff, 'invalidate returns the cutoff');
        Form__c after = [
            SELECT Links_Invalidated_On__c
            FROM Form__c
            WHERE Id = :form.Id
        ];
        System.assertNotEquals(
            null,
            after.Links_Invalidated_On__c,
            'the kill-switch timestamp is stamped'
        );
    }

    @isTest
    static void invocableMintsAndReportsErrors() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('Invoke');
        List<FinalSurveyLinkInvocable.Result> results;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            FinalSurveyLinkInvocable.Request ok = new FinalSurveyLinkInvocable.Request();
            ok.formId = form.Id;
            ok.recordId = ja.Id;
            // wrong-object request → a per-row error, never a batch failure
            Contact c = new Contact(LastName = 'Wrong');
            insert c;
            FinalSurveyLinkInvocable.Request bad = new FinalSurveyLinkInvocable.Request();
            bad.formId = form.Id;
            bad.recordId = c.Id;
            Test.startTest();
            results = FinalSurveyLinkInvocable.createLinks(
                new List<FinalSurveyLinkInvocable.Request>{ ok, bad }
            );
            Test.stopTest();
        }
        System.assertEquals(2, results.size(), 'one result per request');
        System.assert(
            String.isNotBlank(results[0].token),
            'valid request mints a token'
        );
        System.assert(
            String.isNotBlank(results[1].error),
            'wrong-object request reports an error, no token'
        );
        System.assertEquals(
            null,
            results[1].token,
            'no token for the bad request'
        );
    }

    // ---------------------------------------------------------- Tier 2

    private static String subPayload(String token) {
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_name' => 'Ada' },
                'repeats' => new Map<String, Object>(),
                'meta' => new Map<String, Object>{ 'rt' => token }
            }
        );
    }

    @isTest
    static void trackedMintCreatesInvitationAndNonce() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('Tracked');
        String token;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            Test.startTest();
            Map<String, Object> res = FinalStudioController.mintTrackedLink(
                form.Id,
                ja.Id,
                'ada@example.com',
                true
            );
            Test.stopTest();
            token = (String) res.get('token');
        }
        Survey_Invitation__c inv = [
            SELECT Id, Single_Use__c, Recipient__c, Revoked__c
            FROM Survey_Invitation__c
            WHERE Form__c = :form.Id
            LIMIT 1
        ];
        System.assertEquals(true, inv.Single_Use__c, 'single-use stored');
        System.assertEquals('ada@example.com', inv.Recipient__c, 'recipient');
        System.assertEquals(
            inv.Id,
            FinalSurveyTokenService.resolve(token).invitationId,
            'the token carries the invitation Id as its nonce'
        );
    }

    @isTest
    static void revokedInvitationYieldsNoContext() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('Revoke');
        String token;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            Map<String, Object> res = FinalStudioController.mintTrackedLink(
                form.Id,
                ja.Id,
                null,
                false
            );
            token = (String) res.get('token');
        }
        Survey_Invitation__c inv = [
            SELECT Id
            FROM Survey_Invitation__c
            WHERE Form__c = :form.Id
            LIMIT 1
        ];
        inv.Revoked__c = true;
        update inv;
        Test.startTest();
        Map<String, Object> ctx = FinalGuestController.getGuestRecordContext(
            form.Id,
            token
        );
        Test.stopTest();
        System.assert(
            ((Map<String, Object>) ctx.get('ruleFacts')).isEmpty(),
            'a revoked invitation yields no context'
        );
    }

    @isTest
    static void singleUseBurnsAtSubmitNotLoad() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('Burn');
        String token;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            Map<String, Object> res = FinalStudioController.mintTrackedLink(
                form.Id,
                ja.Id,
                null,
                true
            );
            token = (String) res.get('token');
        }
        Test.startTest();
        // TWO loads must NOT burn it (email scanners prefetch)
        FinalGuestController.getGuestRecordContext(form.Id, token);
        FinalGuestController.getGuestRecordContext(form.Id, token);
        Survey_Invitation__c beforeSubmit = [
            SELECT Responded_On__c
            FROM Survey_Invitation__c
            LIMIT 1
        ];
        System.assertEquals(
            null,
            beforeSubmit.Responded_On__c,
            'loads never burn the invitation'
        );
        // first submit burns it
        FinalGuestController.submitGuest(form.Id, subPayload(token));
        Survey_Invitation__c afterSubmit = [
            SELECT Responded_On__c
            FROM Survey_Invitation__c
            LIMIT 1
        ];
        System.assertNotEquals(
            null,
            afterSubmit.Responded_On__c,
            'submit stamps Responded_On (the single-use burn)'
        );
        // second submit is refused
        Boolean refused = false;
        try {
            FinalGuestController.submitGuest(form.Id, subPayload(token));
        } catch (Exception e) {
            refused = true;
        }
        Test.stopTest();
        System.assert(refused, 'a used single-use link cannot submit again');
    }

    @isTest
    static void midSessionRevokeBlocksSubmit() {
        grantJobAppAccess();
        Form__c form = makeGuestSurvey('MidRevoke');
        String token;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = makeRecord();
            Map<String, Object> res = FinalStudioController.mintTrackedLink(
                form.Id,
                ja.Id,
                null,
                false
            );
            token = (String) res.get('token');
        }
        // revoked AFTER the link resolved once, BEFORE submit
        Survey_Invitation__c inv = [
            SELECT Id
            FROM Survey_Invitation__c
            WHERE Form__c = :form.Id
            LIMIT 1
        ];
        inv.Revoked__c = true;
        update inv;
        Boolean refused = false;
        Test.startTest();
        try {
            FinalGuestController.submitGuest(form.Id, subPayload(token));
        } catch (Exception e) {
            refused = true;
        }
        Test.stopTest();
        System.assert(refused, 'a revoked link cannot submit even mid-session');
    }
}
