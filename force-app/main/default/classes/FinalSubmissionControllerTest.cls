/**
 * Reading a Freeform submission back (FREEFORM_SPEC §8).
 *
 * The controller's whole job is to hand over the submission WITH the version
 * that was filled in, so the client can render what was actually asked.
 */
@IsTest
private class FinalSubmissionControllerTest {
    private static Id buildSubmission(String questionLabel) {
        Form__c form = new Form__c(
            Name = 'Reader test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'type' => 'freeform' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'title' => 'About you',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_1',
                                    'type' => 'field',
                                    'label' => questionLabel
                                }
                            }
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
        Form_Submission__c sub = new Form_Submission__c(
            Form__c = form.Id,
            Form_Version__c = version.Id,
            Submitted_Date__c = Datetime.now(),
            Submitted_By__c = UserInfo.getUserId()
        );
        insert sub;
        insert new Form_Submission_Answer__c(
            Form_Submission__c = sub.Id,
            Element_Key__c = 'el_1',
            Label_Snapshot__c = questionLabel,
            Answer_Type__c = 'Text',
            Text_Value__c = 'an answer'
        );
        return sub.Id;
    }

    @IsTest
    static void returnsTheSubmissionWithItsOwnVersionSpec() {
        Id submissionId = buildSubmission('May we email you?');

        Test.startTest();
        Map<String, Object> data = FinalSubmissionController.getSubmission(
            submissionId
        );
        Test.stopTest();

        Assert.areEqual('Reader test', data.get('formName'), 'form name');
        Assert.areEqual(1, data.get('versionNumber'), 'version number');
        Assert.isNotNull(data.get('submittedBy'), 'submitter named');

        // The spec must travel with the submission - rendering from the
        // CURRENT draft is the bug this whole design exists to prevent.
        String specJson = (String) data.get('specJson');
        Assert.isTrue(
            specJson.contains('May we email you?'),
            'the wording as filled in'
        );

        List<Object> answers = (List<Object>) data.get('answers');
        Assert.areEqual(1, answers.size(), 'one answer');
        Map<String, Object> row = (Map<String, Object>) answers[0];
        Assert.areEqual('el_1', row.get('elementKey'), 'keyed by element');
        Assert.areEqual('Text', row.get('answerType'), 'type travels too');
        Assert.areEqual('an answer', row.get('text'), 'value');
    }

    @IsTest
    static void refusesWithoutSayingWhetherItExists() {
        Boolean threw = false;
        try {
            FinalSubmissionController.getSubmission(null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Assert.isTrue(threw, 'a null submission is refused');
    }

    @IsTest
    static void returnsNoFilesWhenNoneWereAttached() {
        Id submissionId = buildSubmission('Anything');
        Map<String, Object> data = FinalSubmissionController.getSubmission(
            submissionId
        );
        List<Object> files = (List<Object>) data.get('files');
        Assert.areEqual(0, files.size(), 'no files, and no error either');
    }
}
