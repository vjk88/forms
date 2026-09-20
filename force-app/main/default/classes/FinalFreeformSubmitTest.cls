/**
 * Freeform submit (FREEFORM_SPEC F1, slice S5).
 *
 * The promises under test are the ones a report depends on: the SAME question
 * always stores the same way, a value that will not convert is kept and
 * flagged rather than dropped, a retried submit stores one submission, and a
 * response limit cannot be walked past.
 */
@IsTest
private class FinalFreeformSubmitTest {
    private static Id versionId;
    private static Id formId;

    /** A freeform version carrying one question of every storage shape. */
    private static Map<String, Object> makeForm(
        List<Object> elements,
        Map<String, Object> settings
    ) {
        Form__c form = new Form__c(
            Name = 'Freeform submit test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        formId = form.Id;
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => form.Id,
                'name' => form.Name,
                'type' => 'freeform'
            },
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'settings' => settings == null
                ? new Map<String, Object>()
                : settings,
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => elements
                        }
                    }
                }
            }
        };
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec),
            Engine_Version__c = 1
        );
        insert version;
        versionId = version.Id;
        return spec;
    }

    private static Map<String, Object> question(
        String elId,
        String elType,
        String label,
        Map<String, Object> config
    ) {
        return new Map<String, Object>{
            'id' => elId,
            'type' => elType,
            'label' => label,
            'config' => config == null ? new Map<String, Object>() : config
        };
    }

    private static Map<String, Object> payload(
        Map<String, Object> answers,
        String key
    ) {
        Map<String, Object> meta = new Map<String, Object>{
            'sessionId' => 'sess-1'
        };
        if (key != null) {
            meta.put('submissionKey', key);
        }
        return new Map<String, Object>{ 'answers' => answers, 'meta' => meta };
    }

    private static Map<String, Form_Submission_Answer__c> answersByKey(
        Id submissionId
    ) {
        Map<String, Form_Submission_Answer__c> out = new Map<String, Form_Submission_Answer__c>();
        for (Form_Submission_Answer__c a : [
            SELECT
                Element_Key__c,
                Label_Snapshot__c,
                Answer_Type__c,
                Value_Unparsed__c,
                Text_Value__c,
                Numeric_Value__c,
                Boolean_Value__c,
                Date_Value__c,
                Selected_Options_JSON__c
            FROM Form_Submission_Answer__c
            WHERE Form_Submission__c = :submissionId
        ]) {
            out.put(a.Element_Key__c, a);
        }
        return out;
    }

    @IsTest
    static void storesEachAnswerUnderItsPublishedType() {
        Map<String, Object> spec = makeForm(
            new List<Object>{
                question(
                    'el_email',
                    'field',
                    'Your email',
                    new Map<String, Object>{ 'inputType' => 'email' }
                ),
                question(
                    'el_phone',
                    'field',
                    'Phone',
                    new Map<String, Object>{ 'inputType' => 'phone' }
                ),
                question(
                    'el_when',
                    'field',
                    'When',
                    new Map<String, Object>{ 'inputType' => 'date' }
                ),
                question(
                    'el_many',
                    'field',
                    'Pick some',
                    new Map<String, Object>{
                        'inputType' => 'picklist',
                        'renderAs' => 'Checkbox_Group'
                    }
                ),
                question(
                    'el_one',
                    'field',
                    'Pick one',
                    new Map<String, Object>{
                        'inputType' => 'picklist',
                        'renderAs' => 'Dropdown'
                    }
                ),
                question('el_yes', 'yesNo', 'Subscribed?', null),
                question('el_score', 'nps', 'Recommend us?', null)
            },
            null
        );

        Test.startTest();
        FinalSubmitService.SubmitOutcome out = FinalSubmitService.run(
            spec,
            payload(
                new Map<String, Object>{
                    'el_email' => 'a@b.com',
                    'el_phone' => '+44 20 7946 0000',
                    'el_when' => '2026-09-19',
                    'el_many' => new List<Object>{ 'x', 'y' },
                    'el_one' => 'x',
                    'el_yes' => false,
                    'el_score' => 9
                },
                'key-types'
            ),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        Assert.isNotNull(out.recordId, 'submission stored');
        Map<String, Form_Submission_Answer__c> rows = answersByKey(
            out.recordId
        );
        Assert.areEqual(7, rows.size(), 'one row per answered question');

        Assert.areEqual('Email', rows.get('el_email').Answer_Type__c, 'email');
        Assert.areEqual(
            'a@b.com',
            rows.get('el_email').Text_Value__c,
            'email text'
        );
        Assert.areEqual('Phone', rows.get('el_phone').Answer_Type__c, 'phone');
        Assert.areEqual('Date', rows.get('el_when').Answer_Type__c, 'date');
        Assert.areEqual(
            Date.newInstance(2026, 9, 19),
            rows.get('el_when').Date_Value__c,
            'date column'
        );
        Assert.areEqual(
            'Options',
            rows.get('el_many').Answer_Type__c,
            'multi choice'
        );
        Assert.isTrue(
            rows.get('el_many').Selected_Options_JSON__c.contains('"y"'),
            'options json'
        );
        Assert.areEqual(
            'Choice',
            rows.get('el_one').Answer_Type__c,
            'single choice'
        );
        Assert.areEqual(
            'Number',
            rows.get('el_score').Answer_Type__c,
            'nps is a number'
        );
        Assert.areEqual(
            9,
            rows.get('el_score').Numeric_Value__c,
            'score column'
        );

        // Boolean false is an ANSWER, not an absence - and Answer_Type__c is
        // what makes the ticked/unticked column meaningful.
        Assert.areEqual('Boolean', rows.get('el_yes').Answer_Type__c, 'yes/no');
        Assert.areEqual(
            false,
            rows.get('el_yes').Boolean_Value__c,
            'false is stored'
        );

        // and the question wording as submitted
        Assert.areEqual(
            'Your email',
            rows.get('el_email').Label_Snapshot__c,
            'label snapshot'
        );
    }

    @IsTest
    static void storesTheSameWayWhateverShapeTheJsonUsed() {
        Map<String, Object> spec = makeForm(
            new List<Object>{
                question(
                    'el_n',
                    'field',
                    'How many',
                    new Map<String, Object>{ 'inputType' => 'number' }
                )
            },
            null
        );
        FinalSubmitService.SubmitOutcome asNumber = FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_n' => 42 }, 'k-num'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        FinalSubmitService.SubmitOutcome asString = FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_n' => '42' }, 'k-str'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Assert.areEqual(
            42,
            answersByKey(asNumber.recordId).get('el_n').Numeric_Value__c,
            'number payload'
        );
        Assert.areEqual(
            42,
            answersByKey(asString.recordId).get('el_n').Numeric_Value__c,
            'string payload stores identically'
        );
    }

    @IsTest
    static void keepsAValueItCannotConvertAndSaysSo() {
        Map<String, Object> spec = makeForm(
            new List<Object>{
                question(
                    'el_n',
                    'field',
                    'How many',
                    new Map<String, Object>{ 'inputType' => 'number' }
                )
            },
            null
        );
        FinalSubmitService.SubmitOutcome out = FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_n' => 'about ten' }, 'k-bad'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Form_Submission_Answer__c row = answersByKey(out.recordId).get('el_n');
        Assert.areEqual('Number', row.Answer_Type__c, 'declared type kept');
        Assert.isNull(row.Numeric_Value__c, 'no number stored');
        Assert.areEqual('about ten', row.Text_Value__c, 'raw value kept');
        Assert.isTrue(row.Value_Unparsed__c, 'and flagged as not converted');
    }

    @IsTest
    static void aRetriedSubmitStoresOneSubmission() {
        Map<String, Object> spec = makeForm(
            new List<Object>{ question('el_t', 'field', 'Anything', null) },
            null
        );
        Map<String, Object> same = payload(
            new Map<String, Object>{ 'el_t' => 'hello' },
            'key-retry'
        );

        Test.startTest();
        FinalSubmitService.SubmitOutcome first = FinalSubmitService.run(
            spec,
            same,
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        // the browser never saw the first answer and sends it again
        FinalSubmitService.SubmitOutcome retry = FinalSubmitService.run(
            spec,
            same,
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        Assert.areEqual(
            first.recordId,
            retry.recordId,
            'the retry returns the submission already stored'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :formId],
            'exactly one submission'
        );
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__c = :first.recordId
            ],
            'answers were not doubled'
        );
    }

    @IsTest
    static void aFreshFormGetsItsOwnSubmission() {
        Map<String, Object> spec = makeForm(
            new List<Object>{ question('el_t', 'field', 'Anything', null) },
            null
        );
        FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_t' => 'one' }, 'k-1'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_t' => 'two' }, 'k-2'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :formId],
            'different keys, different submissions'
        );
    }

    @IsTest
    static void aGuestSubmitStampsNoUser() {
        Map<String, Object> spec = makeForm(
            new List<Object>{ question('el_t', 'field', 'Anything', null) },
            null
        );
        FinalSubmitService.SubmitOutcome out = FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_t' => 'hi' }, 'k-guest'),
            versionId,
            FinalSubmitService.Posture.GUEST
        );
        Form_Submission__c stored = [
            SELECT Submitted_By__c, Form__c, Form_Version__c, Session_Id__c
            FROM Form_Submission__c
            WHERE Id = :out.recordId
        ];
        Assert.isNull(stored.Submitted_By__c, 'guests stamp no user');
        Assert.areEqual(formId, stored.Form__c, 'form stamped from the server');
        Assert.areEqual(
            versionId,
            stored.Form_Version__c,
            'version stamped from the server'
        );
    }

    @IsTest
    static void aResponseLimitCloses() {
        Map<String, Object> spec = makeForm(
            new List<Object>{ question('el_t', 'field', 'Anything', null) },
            new Map<String, Object>{
                'availability' => new Map<String, Object>{
                    'responseCap' => 1,
                    'closedMessage' => 'That is enough, thank you.'
                }
            }
        );
        FinalSubmitService.run(
            spec,
            payload(new Map<String, Object>{ 'el_t' => 'first' }, 'cap-1'),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Boolean refused = false;
        try {
            FinalSubmitService.run(
                spec,
                payload(new Map<String, Object>{ 'el_t' => 'second' }, 'cap-2'),
                versionId,
                FinalSubmitService.Posture.INTERNAL
            );
        } catch (AuraHandledException e) {
            refused = true;
        }
        Assert.isTrue(refused, 'the limit holds');
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :formId],
            'and nothing extra was stored'
        );
    }

    @IsTest
    static void skippedQuestionsStoreNoRowButFalseDoes() {
        Map<String, Object> spec = makeForm(
            new List<Object>{
                question('el_skipped', 'field', 'Skipped', null),
                question('el_blank', 'field', 'Blank', null),
                question('el_no', 'yesNo', 'No?', null)
            },
            null
        );
        FinalSubmitService.SubmitOutcome out = FinalSubmitService.run(
            spec,
            payload(
                new Map<String, Object>{ 'el_blank' => '', 'el_no' => false },
                'k-blank'
            ),
            versionId,
            FinalSubmitService.Posture.INTERNAL
        );
        Map<String, Form_Submission_Answer__c> rows = answersByKey(
            out.recordId
        );
        Assert.areEqual(1, rows.size(), 'only the false answer is a row');
        Assert.isTrue(rows.containsKey('el_no'), 'and it is the yes/no one');
    }
}
