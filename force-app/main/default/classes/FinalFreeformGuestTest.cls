/**
 * Guest submits of a Freeform (FREEFORM_SPEC §7.3, D15, D19).
 *
 * Three promises the guest path makes to a person who is not signed in, and
 * who therefore gets no error detail and no second chance to notice:
 *
 *   - answers are stored against the version they actually SAW, or not at all;
 *   - a retry of an attempt that already landed is answered from the store,
 *     even if the form has since filled up;
 *   - and neither of those may cost an ordinary submit anything.
 */
@IsTest
private class FinalFreeformGuestTest {
    private static Form__c form;
    private static Form_Version__c activeVersion;

    private static String specJson(Integer responseCap) {
        Map<String, Object> settings = new Map<String, Object>();
        if (responseCap != null) {
            settings.put(
                'availability',
                new Map<String, Object>{
                    'responseCap' => responseCap,
                    'closedMessage' => 'That is enough, thank you.'
                }
            );
        }
        return JSON.serialize(
            new Map<String, Object>{
                'specVersion' => 1,
                'form' => new Map<String, Object>{
                    'name' => 'Guest freeform',
                    'type' => 'freeform'
                },
                'settings' => settings,
                'pages' => new List<Object>{
                    new Map<String, Object>{
                        'id' => 'pg_1',
                        'sections' => new List<Object>{
                            new Map<String, Object>{
                                'id' => 'sec_1',
                                'elements' => new List<Object>{
                                    new Map<String, Object>{
                                        'id' => 'el_t',
                                        'type' => 'field',
                                        'label' => 'Anything'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        );
    }

    /** A published, guest-open Freeform with one live version. */
    private static void publish(Integer responseCap) {
        form = new Form__c(
            Name = 'Guest freeform',
            Form_Type__c = 'Freeform',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest',
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert form;
        activeVersion = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = specJson(responseCap)
        );
        insert activeVersion;
    }

    private static String payload(String answer, String key, Id claimedVer) {
        Map<String, Object> meta = new Map<String, Object>{
            'submissionKey' => key
        };
        if (claimedVer != null) {
            meta.put('specVersionId', String.valueOf(claimedVer));
        }
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_t' => answer },
                'meta' => meta
            }
        );
    }

    private static Integer submissionCount() {
        return [
            SELECT COUNT()
            FROM Form_Submission__c
            WHERE Form__c = :form.Id
        ];
    }

    /**
     * The one that D19 exists for. The guest rendered version 1; version 2 is
     * published while they were typing. Storing their answers against v2 would
     * silently reinterpret them and stamp the submission with questions they
     * were never asked.
     */
    @IsTest
    static void refusesAnswersAimedAtAVersionThatIsNoLongerLive() {
        publish(null);
        Id oldVersionId = activeVersion.Id;
        activeVersion.Is_Active__c = false;
        update activeVersion;
        insert new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 2,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = specJson(null)
        );

        Boolean refused = false;
        try {
            FinalGuestController.submitGuest(
                form.Id,
                payload('typed against v1', 'guest-drift', oldVersionId)
            );
        } catch (AuraHandledException e) {
            refused = true;
        }

        Assert.isTrue(refused, 'a stale version is refused, not reinterpreted');
        Assert.areEqual(0, submissionCount(), 'and nothing was stored');
    }

    /**
     * A retry of the submission that took the LAST slot. The cap check used to
     * run before anything looked for a replay, so this attempt was told the
     * form was full by its own earlier self - and the person, who is not
     * signed in, had no way to find out their answers were already safe.
     */
    @IsTest
    static void aRetryAfterTheCapFilledReturnsTheStoredSubmission() {
        publish(1);
        FinalGuestController.GuestSubmitResult first = FinalGuestController.submitGuest(
            form.Id,
            payload('first and last', 'guest-cap', activeVersion.Id)
        );
        Assert.isTrue(first.success, 'the last slot is taken');
        Assert.areEqual(1, submissionCount(), 'one submission');

        // the browser never saw the confirmation and sends the same key again
        FinalGuestController.GuestSubmitResult retry = FinalGuestController.submitGuest(
            form.Id,
            payload('first and last', 'guest-cap', activeVersion.Id)
        );

        Assert.isTrue(retry.success, 'the retry is told what really happened');
        Assert.areEqual(
            first.childCount,
            retry.childCount,
            'and gets the same account of it'
        );
        Assert.areEqual(1, submissionCount(), 'still exactly one submission');
    }

    /** A NEW guest still meets the closed form. The cap did not go soft. */
    @IsTest
    static void aDifferentGuestStillMeetsTheFullForm() {
        publish(1);
        FinalGuestController.submitGuest(
            form.Id,
            payload('mine', 'guest-cap-a', activeVersion.Id)
        );
        Boolean refused = false;
        try {
            FinalGuestController.submitGuest(
                form.Id,
                payload('too late', 'guest-cap-b', activeVersion.Id)
            );
        } catch (AuraHandledException e) {
            refused = true;
        }
        Assert.isTrue(refused, 'the limit still holds for everyone else');
        Assert.areEqual(1, submissionCount(), 'nothing extra was stored');
    }

    /** The silence case: an ordinary submit pays nothing for any of this. */
    @IsTest
    static void anOrdinaryGuestSubmitIsUntouched() {
        publish(null);
        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            form.Id,
            payload('hello', 'guest-plain', activeVersion.Id)
        );
        Assert.isTrue(res.success, 'it saved');
        Assert.areEqual(1, submissionCount(), 'one submission');
        Assert.areEqual(
            'hello',
            [
                SELECT Text_Value__c
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__r.Form__c = :form.Id
                LIMIT 1
            ]
            .Text_Value__c,
            'with the answer as given'
        );
    }

    /**
     * A client that names no version is still served, because most forms have
     * nothing that could go stale. Autofill is the exception, and it has its
     * own coverage in FinalGuestLinkTest.
     */
    @IsTest
    static void aClientThatNamesNoVersionIsStillServed() {
        publish(null);
        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            form.Id,
            payload('no version claimed', 'guest-silent', null)
        );
        Assert.isTrue(res.success, 'no claim, no contradiction');
        Assert.areEqual(1, submissionCount(), 'stored normally');
    }
}
