/**
 * FinalSurveySubmitTest — S1 answer-store runtime (IMPL_PLAN_SURVEY_S1 §5).
 *
 * Covers the survey branch end-to-end through BOTH public entry points:
 * typed columns, label/topic snapshots, normalized score, repeat entry
 * indexes, the anonymous flag, savepoint atomicity, the availability gate
 * (7-1: closed flag + response cap), multi-topic junction rows, and bulk.
 */
@isTest
private class FinalSurveySubmitTest {
    // ----- spec builders (hand-authored specs ARE the S1 test surface —
    // survey-repeat authoring in the builder is a tracked follow-up) -----

    private static Map<String, Object> element(
        String id,
        String elType,
        String label,
        Map<String, Object> config,
        Map<String, Object> analytics
    ) {
        Map<String, Object> el = new Map<String, Object>{
            'id' => id,
            'type' => elType,
            'label' => label,
            'binding' => null
        };
        if (config != null) {
            el.put('config', config);
        }
        if (analytics != null) {
            el.put('analytics', analytics);
        }
        return el;
    }

    private static String surveySpec(
        List<Object> elements,
        List<Object> repeatElements,
        Map<String, Object> settings
    ) {
        List<Object> sections = new List<Object>{
            new Map<String, Object>{
                'id' => 'sec_main',
                'elements' => elements
            }
        };
        if (repeatElements != null) {
            sections.add(
                new Map<String, Object>{
                    'id' => 'sec_rep',
                    'repeat' => new Map<String, Object>{ 'maxEntries' => 5 },
                    'elements' => repeatElements
                }
            );
        }
        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{ 'type' => 'survey' },
            'pages' => new List<Object>{
                new Map<String, Object>{ 'id' => 'p1', 'sections' => sections }
            }
        };
        if (settings != null) {
            spec.put('settings', settings);
        }
        return JSON.serialize(spec);
    }

    /** Form + active version carrying the given spec; returns the version. */
    private static Form_Version__c makeSurvey(String specJson) {
        Form__c form = new Form__c(
            Name = 'Pulse',
            Form_Type__c = 'Survey',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest'
        );
        insert form;
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = specJson
        );
        insert version;
        return version;
    }

    private static String payload(
        Map<String, Object> answers,
        Map<String, Object> repeats
    ) {
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => answers,
                'repeats' => repeats == null
                    ? new Map<String, Object>()
                    : repeats,
                'meta' => new Map<String, Object>{
                    'startedAt' => '2026-07-27T10:00:00.000Z',
                    'submittedAt' => '2026-07-27T10:02:05.000Z'
                }
            }
        );
    }

    // ----- 1: every typed column lands typed -----

    @isTest
    static void typedColumnsLandTyped() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_text',
                        'field',
                        'Your name',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    ),
                    element(
                        'el_num',
                        'field',
                        'How many?',
                        new Map<String, Object>{ 'inputType' => 'number' },
                        null
                    ),
                    element(
                        'el_date',
                        'field',
                        'Which day?',
                        new Map<String, Object>{ 'inputType' => 'date' },
                        null
                    ),
                    element(
                        'el_dt',
                        'field',
                        'Exact moment?',
                        new Map<String, Object>{ 'inputType' => 'datetime' },
                        null
                    ),
                    element('el_bool', 'consent', 'I agree', null, null),
                    element(
                        'el_multi',
                        'field',
                        'Pick many',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                null,
                null
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(
                new Map<String, Object>{
                    'el_text' => 'Ada Lovelace',
                    'el_num' => 42,
                    'el_date' => '2026-07-01',
                    'el_dt' => '2026-07-01T09:30:00.000Z',
                    'el_bool' => true,
                    'el_multi' => new List<Object>{ 'A', 'C' }
                },
                null
            )
        );
        Test.stopTest();

        Form_Response__c resp = [
            SELECT
                Status__c,
                Form_Version__c,
                Submitted_By__c,
                Completion_Time_Seconds__c
            FROM Form_Response__c
            WHERE Id = :res.recordId
        ];
        System.assertEquals('Completed', resp.Status__c, 'status');
        System.assertEquals(
            version.Id,
            resp.Form_Version__c,
            'server-anchored version'
        );
        System.assertEquals(
            UserInfo.getUserId(),
            resp.Submitted_By__c,
            'internal identity'
        );
        System.assertEquals(
            125,
            resp.Completion_Time_Seconds__c,
            'meta-derived seconds'
        );

        Map<String, Form_Response_Answer__c> byKey = new Map<String, Form_Response_Answer__c>();
        for (Form_Response_Answer__c a : [
            SELECT
                Element_Key__c,
                Text_Value__c,
                Numeric_Value__c,
                Date_Value__c,
                DateTime_Value__c,
                Boolean_Value__c,
                Selected_Options_JSON__c,
                Label_Snapshot__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId
        ]) {
            byKey.put(a.Element_Key__c, a);
        }
        System.assertEquals(6, byKey.size(), 'one row per answered element');
        System.assertEquals(
            'Ada Lovelace',
            byKey.get('el_text').Text_Value__c,
            'text column'
        );
        System.assertEquals(
            'Your name',
            byKey.get('el_text').Label_Snapshot__c,
            'label photocopy'
        );
        System.assertEquals(
            42,
            byKey.get('el_num').Numeric_Value__c,
            'number column'
        );
        System.assertEquals(
            Date.newInstance(2026, 7, 1),
            byKey.get('el_date').Date_Value__c,
            'date column'
        );
        System.assertNotEquals(
            null,
            byKey.get('el_dt').DateTime_Value__c,
            'datetime column'
        );
        System.assertEquals(
            true,
            byKey.get('el_bool').Boolean_Value__c,
            'boolean column'
        );
        System.assert(
            byKey.get('el_multi').Selected_Options_JSON__c.contains('"A"'),
            'multi-select stored as JSON list'
        );
    }

    // ----- 2: normalized score math -----

    @isTest
    static void normalizedScoreLinearMap() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_rate',
                        'rating',
                        'Rate onboarding',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 5
                        }
                    ),
                    element(
                        'el_nps',
                        'nps',
                        'Recommend us?',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 0,
                            'scaleMax' => 10
                        }
                    ),
                    element(
                        'el_plain',
                        'field',
                        'Anything else?',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                null,
                null
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(
                new Map<String, Object>{
                    'el_rate' => 4,
                    'el_nps' => 8,
                    'el_plain' => 'nope'
                },
                null
            )
        );
        Test.stopTest();

        Map<String, Form_Response_Answer__c> byKey = new Map<String, Form_Response_Answer__c>();
        for (Form_Response_Answer__c a : [
            SELECT Element_Key__c, Normalized_Score__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId
        ]) {
            byKey.put(a.Element_Key__c, a);
        }
        System.assertEquals(
            75.00,
            byKey.get('el_rate').Normalized_Score__c,
            '4 on 1-5 = 75'
        );
        System.assertEquals(
            80.00,
            byKey.get('el_nps').Normalized_Score__c,
            '8 on 0-10 = 80'
        );
        System.assertEquals(
            null,
            byKey.get('el_plain').Normalized_Score__c,
            'no score role = null'
        );
    }

    // ----- 3: repeat answers carry Entry # -----

    @isTest
    static void repeatAnswersCarryEntryIndex() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_one',
                        'field',
                        'Solo',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                new List<Object>{
                    element(
                        'el_job',
                        'field',
                        'Job title',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                null
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(
                new Map<String, Object>{ 'el_one' => 'hi' },
                new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{ 'el_job' => 'Baker' },
                        new Map<String, Object>{ 'el_job' => 'Astronaut' }
                    }
                }
            )
        );
        Test.stopTest();

        List<Form_Response_Answer__c> jobs = [
            SELECT Text_Value__c, Entry_Index__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId AND Element_Key__c = 'el_job'
            ORDER BY Entry_Index__c
        ];
        System.assertEquals(2, jobs.size(), 'two entries, two rows');
        System.assertEquals(0, jobs[0].Entry_Index__c, 'first entry index 0');
        System.assertEquals('Baker', jobs[0].Text_Value__c, 'entry 0 value');
        System.assertEquals(1, jobs[1].Entry_Index__c, 'second entry index 1');
        System.assertEquals(
            'Astronaut',
            jobs[1].Text_Value__c,
            'entry 1 value'
        );
        List<Form_Response_Answer__c> solo = [
            SELECT Entry_Index__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId AND Element_Key__c = 'el_one'
        ];
        System.assertEquals(
            null,
            solo[0].Entry_Index__c,
            'non-repeat rows carry no index'
        );
    }

    // ----- 4: anonymous flag skips identity -----

    @isTest
    static void anonymousSkipsIdentity() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_rate',
                        'rating',
                        'Rate',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 5
                        }
                    )
                },
                null,
                new Map<String, Object>{ 'anonymous' => true }
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(new Map<String, Object>{ 'el_rate' => 5 }, null)
        );
        Test.stopTest();

        Form_Response__c resp = [
            SELECT Submitted_By__c, IP_Address__c
            FROM Form_Response__c
            WHERE Id = :res.recordId
        ];
        System.assertEquals(
            null,
            resp.Submitted_By__c,
            'anonymous: no user link'
        );
        System.assertEquals(null, resp.IP_Address__c, 'anonymous: no IP');
    }

    // ----- 5: savepoint atomicity -----

    @isTest
    static void rollbackLeavesNothing() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_text',
                        'field',
                        'Name',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                null,
                null
            )
        );
        FinalSubmitService.testFailAnswerInsert = true;
        Boolean threw = false;
        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                null,
                version.Id,
                payload(new Map<String, Object>{ 'el_text' => 'x' }, null)
            );
        } catch (Exception e) {
            threw = true;
        }
        Test.stopTest();
        FinalSubmitService.testFailAnswerInsert = false;

        System.assert(threw, 'injected failure surfaces');
        System.assertEquals(
            0,
            [SELECT COUNT() FROM Form_Response__c],
            'NOTHING persists — response rolled back with its answers'
        );
    }

    // ----- 6: guest posture through FinalGuestController -----

    @isTest
    static void guestSubmitStoresAnswersWithoutIdentity() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_rate',
                        'rating',
                        'Rate',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 5
                        }
                    )
                },
                null,
                null
            )
        );
        Id formId = [SELECT Form__c FROM Form_Version__c WHERE Id = :version.Id]
        .Form__c;
        Test.startTest();
        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            formId,
            payload(new Map<String, Object>{ 'el_rate' => 3 }, null)
        );
        Test.stopTest();

        System.assertEquals(true, res.success, 'guest submit succeeds');
        System.assertEquals(1, res.childCount, 'one answer row');
        Form_Response__c resp = [
            SELECT Submitted_By__c
            FROM Form_Response__c
            LIMIT 1
        ];
        System.assertEquals(
            null,
            resp.Submitted_By__c,
            'guest: no user identity'
        );
    }

    // ----- 7: availability — closed flag gates INTERNAL submits (7-1) -----

    @isTest
    static void closedFlagBlocksInternalSubmit() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_text',
                        'field',
                        'Name',
                        new Map<String, Object>{ 'inputType' => 'text' },
                        null
                    )
                },
                null,
                new Map<String, Object>{
                    'availability' => new Map<String, Object>{
                        'status' => 'closed',
                        'closedMessage' => 'Pencils down.'
                    }
                }
            )
        );
        Boolean threw = false;
        String message;
        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                null,
                version.Id,
                payload(new Map<String, Object>{ 'el_text' => 'late' }, null)
            );
        } catch (Exception e) {
            threw = true;
            message = e.getMessage();
        }
        Test.stopTest();
        System.assert(threw, 'closed survey rejects internal submit');
        System.assertEquals(
            0,
            [SELECT COUNT() FROM Form_Response__c],
            'nothing stored'
        );
    }

    // ----- 8: availability — response cap closes guest survey (7-1) -----

    @isTest
    static void responseCapClosesGuestSurvey() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_rate',
                        'rating',
                        'Rate',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 5
                        }
                    )
                },
                null,
                new Map<String, Object>{
                    'availability' => new Map<String, Object>{
                        'responseCap' => 1
                    }
                }
            )
        );
        Id formId = [SELECT Form__c FROM Form_Version__c WHERE Id = :version.Id]
        .Form__c;
        Test.startTest();
        FinalGuestController.submitGuest(
            formId,
            payload(new Map<String, Object>{ 'el_rate' => 4 }, null)
        );
        Boolean threw = false;
        try {
            FinalGuestController.submitGuest(
                formId,
                payload(new Map<String, Object>{ 'el_rate' => 2 }, null)
            );
        } catch (Exception e) {
            threw = true;
        }
        String closedJson = FinalGuestController.getGuestSpec(formId);
        Test.stopTest();

        System.assert(threw, 'cap reached: second submit rejected');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Form_Response__c],
            'exactly cap responses'
        );
        System.assert(
            closedJson.contains('"closed":true'),
            'capped survey serves the closed screen, not the form'
        );
    }

    // ----- 9: multi-topic tags → junction rows + display string -----

    @isTest
    static void multiTopicWritesJunctionsAndDisplay() {
        Survey_Topic__c support = new Survey_Topic__c(Name = 'Support');
        Survey_Topic__c pricing = new Survey_Topic__c(Name = 'Pricing');
        insert new List<Survey_Topic__c>{ support, pricing };

        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_rate',
                        'rating',
                        'Rate support pricing',
                        null,
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 5,
                            'topics' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => support.Id,
                                    'name' => 'Support'
                                },
                                new Map<String, Object>{
                                    'id' => pricing.Id,
                                    'name' => 'Pricing'
                                },
                                new Map<String, Object>{
                                    'id' => 'a00000000000000AAA',
                                    'name' => 'Ghost'
                                }
                            }
                        }
                    )
                },
                null,
                null
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(new Map<String, Object>{ 'el_rate' => 4 }, null)
        );
        Test.stopTest();

        Form_Response_Answer__c ans = [
            SELECT Id, Topic_Snapshot__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId
        ];
        System.assertEquals(
            'Support; Pricing; Ghost',
            ans.Topic_Snapshot__c,
            'display string keeps every name, even the unlinkable one'
        );
        List<Form_Answer_Topic__c> links = [
            SELECT Topic__c
            FROM Form_Answer_Topic__c
            WHERE Answer__c = :ans.Id
        ];
        System.assertEquals(
            2,
            links.size(),
            'ghost id skipped, submit not failed'
        );
        Set<Id> linked = new Set<Id>();
        for (Form_Answer_Topic__c l : links) {
            linked.add(l.Topic__c);
        }
        System.assert(linked.contains(support.Id), 'linked to Support');
        System.assert(linked.contains(pricing.Id), 'linked to Pricing');
    }

    // ----- 10: bulk — 200 answers, one transaction -----

    @isTest
    static void bulkTwoHundredAnswers() {
        List<Object> elements = new List<Object>();
        Map<String, Object> answers = new Map<String, Object>();
        for (Integer i = 0; i < 200; i++) {
            String elId = 'el_' + i;
            elements.add(
                element(
                    elId,
                    'field',
                    'Q' + i,
                    new Map<String, Object>{ 'inputType' => 'text' },
                    null
                )
            );
            answers.put(elId, 'answer ' + i);
        }
        Form_Version__c version = makeSurvey(surveySpec(elements, null, null));
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(answers, null)
        );
        Test.stopTest();
        System.assertEquals(
            200,
            res.childCount,
            'all 200 rows in one transaction'
        );
        System.assertEquals(
            200,
            [
                SELECT COUNT()
                FROM Form_Response_Answer__c
                WHERE Form_Response__c = :res.recordId
            ],
            'persisted'
        );
    }

    // ----- 11: matrix expands one row per statement (S4) -----

    @isTest
    static void matrixWritesOneRowPerStatement() {
        Form_Version__c version = makeSurvey(
            surveySpec(
                new List<Object>{
                    element(
                        'el_mx',
                        'matrix',
                        'Rate these',
                        new Map<String, Object>{
                            'rows' => new List<Object>{
                                new Map<String, Object>{
                                    'value' => 'ease',
                                    'label' => 'Easy to use'
                                },
                                new Map<String, Object>{
                                    'value' => 'speed',
                                    'label' => 'Fast support'
                                }
                            }
                        },
                        new Map<String, Object>{
                            'role' => 'score',
                            'scaleMin' => 1,
                            'scaleMax' => 4
                        }
                    )
                },
                null,
                null
            )
        );
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            version.Id,
            JSON.serialize(
                new Map<String, Object>{
                    'answers' => new Map<String, Object>{
                        'el_mx' => new Map<String, Object>{
                            'ease' => 4,
                            'speed' => 2
                        }
                    },
                    'repeats' => new Map<String, Object>(),
                    'meta' => new Map<String, Object>()
                }
            )
        );
        Test.stopTest();
        Map<String, Form_Response_Answer__c> byKey = new Map<String, Form_Response_Answer__c>();
        for (Form_Response_Answer__c a : [
            SELECT
                Element_Key__c,
                Numeric_Value__c,
                Normalized_Score__c,
                Label_Snapshot__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :res.recordId
        ]) {
            byKey.put(a.Element_Key__c, a);
        }
        System.assertEquals(2, byKey.size(), 'one row per statement');
        System.assertEquals(
            4,
            byKey.get('el_mx:ease').Numeric_Value__c,
            'ease pick'
        );
        System.assertEquals(
            100.0,
            byKey.get('el_mx:ease').Normalized_Score__c,
            '4 on 1-4 = 100'
        );
        System.assertEquals(
            'Rate these — Easy to use',
            byKey.get('el_mx:ease').Label_Snapshot__c,
            'combined photocopy'
        );
        System.assertEquals(
            33.33,
            byKey.get('el_mx:speed').Normalized_Score__c,
            '2 on 1-4 = 33.33'
        );
    }
}
