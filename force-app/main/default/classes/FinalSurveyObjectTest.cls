/**
 * FinalSurveyObjectTest — the survey-object program v1 (SURVEY_OBJECT_SPEC,
 * owner 2026-07-31): prefill mapped questions from a record, write mapped
 * answers back on submit, and every guard between. Runs on the app's own
 * Job_Application__c test object (the org's Account carries joke validation
 * rules that block inserts — the famous booby-trap).
 */
@isTest
private class FinalSurveyObjectTest {
    /**
     * USER_MODE everywhere means the runner needs real FLS on the demo
     * object. Granted here IN the test (runAs dodges mixed-DML) so the
     * packaged permsets stay free of demo-object noise.
     */
    private static void grantFls() {
        PermissionSet ps = new PermissionSet(
            Name = 'FinalSurveyObjectTestPS',
            Label = 'FinalSurveyObjectTestPS'
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
            insert new List<FieldPermissions>{
                new FieldPermissions(
                    ParentId = ps.Id,
                    SobjectType = 'Job_Application__c',
                    Field = 'Job_Application__c.Desired_Salary__c',
                    PermissionsRead = true,
                    PermissionsEdit = true
                ),
                new FieldPermissions(
                    ParentId = ps.Id,
                    SobjectType = 'Job_Application__c',
                    Field = 'Job_Application__c.Applicant_Name__c',
                    PermissionsRead = true,
                    PermissionsEdit = true
                )
            };
            insert new PermissionSetAssignment(
                AssigneeId = UserInfo.getUserId(),
                PermissionSetId = ps.Id
            );
        }
    }

    private static Map<String, Object> mappedElement(
        String id,
        String inputType,
        String field
    ) {
        Map<String, Object> el = new Map<String, Object>{
            'id' => id,
            'type' => 'field',
            'label' => id,
            'binding' => null,
            'config' => new Map<String, Object>{ 'inputType' => inputType }
        };
        if (field != null) {
            el.put(
                'mapping',
                new Map<String, Object>{
                    'object' => 'Job_Application__c',
                    'field' => field
                }
            );
        }
        return el;
    }

    /** SO-2: stamp a direction onto a mapped element's mapping. */
    private static Map<String, Object> withMode(
        Map<String, Object> el,
        String mode
    ) {
        ((Map<String, Object>) el.get('mapping')).put('mode', mode);
        return el;
    }

    private static Form_Version__c makeMappedSurvey() {
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
                                mappedElement(
                                    'el_salary',
                                    'number',
                                    'Desired_Salary__c'
                                ),
                                mappedElement(
                                    'el_name',
                                    'text',
                                    'Applicant_Name__c'
                                ),
                                mappedElement('el_free', 'text', null)
                            }
                        }
                    }
                }
            }
        };
        Form__c form = new Form__c(
            Name = 'Mapped Pulse',
            Form_Type__c = 'Survey',
            Status__c = 'Published',
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert form;
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        insert version;
        return version;
    }

    private static String payload(Map<String, Object> answers, Id recordId) {
        Map<String, Object> meta = new Map<String, Object>{
            'startedAt' => '2026-07-31T10:00:00.000Z',
            'submittedAt' => '2026-07-31T10:02:05.000Z'
        };
        if (recordId != null) {
            meta.put('recordId', String.valueOf(recordId));
        }
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => answers,
                'repeats' => new Map<String, Object>(),
                'meta' => meta
            }
        );
    }

    @isTest
    static void prefillReturnsMappedReadableValues() {
        grantFls();
        Form_Version__c version = makeMappedSurvey();
        Map<String, Object> byVersion;
        Map<String, Object> byForm;
        // fresh runAs context = the in-test permset actually applies
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Job_Application__c ja = new Job_Application__c(
                Desired_Salary__c = 250,
                Applicant_Name__c = 'Ada Lovelace'
            );
            insert ja;
            Test.startTest();
            byVersion = FinalSurveyObjectController.getPrefill(
                version.Id,
                null,
                ja.Id
            );
            byForm = FinalSurveyObjectController.getPrefill(
                null,
                version.Form__c,
                ja.Id
            );
            Test.stopTest();
        }
        System.assertEquals(
            250,
            (Decimal) byVersion.get('el_salary'),
            'number prefilled'
        );
        System.assertEquals(
            'Ada Lovelace',
            byVersion.get('el_name'),
            'text prefilled'
        );
        System.assert(
            !byVersion.containsKey('el_free'),
            'unmapped question absent'
        );
        System.assertEquals(
            250,
            (Decimal) byForm.get('el_salary'),
            'formId fallback resolves the active version'
        );
    }

    @isTest
    static void prefillRejectsWrongObjectRecord() {
        grantFls();
        Form_Version__c version = makeMappedSurvey();
        Contact c = new Contact(LastName = 'Wrong');
        insert c;
        Boolean threw = false;
        try {
            FinalSurveyObjectController.getPrefill(version.Id, null, c.Id);
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'record of another object rejected');
    }

    @isTest
    static void submitWritesMappedFieldsBack() {
        grantFls();
        Form_Version__c version = makeMappedSurvey();
        Job_Application__c ja;
        FinalSubmitController.SubmitResult res;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ja = new Job_Application__c(Desired_Salary__c = 1);
            insert ja;
            Test.startTest();
            res = FinalSubmitController.submitForm(
                null,
                version.Id,
                payload(
                    new Map<String, Object>{
                        'el_salary' => 90000,
                        'el_name' => 'Grace Hopper',
                        'el_free' => 'unmapped stays put'
                    },
                    ja.Id
                )
            );
            Test.stopTest();
        }
        Job_Application__c after = [
            SELECT Desired_Salary__c, Applicant_Name__c
            FROM Job_Application__c
            WHERE Id = :ja.Id
        ];
        System.assertEquals(
            90000,
            after.Desired_Salary__c,
            'number written back'
        );
        System.assertEquals(
            'Grace Hopper',
            after.Applicant_Name__c,
            'text written back'
        );
        System.assertEquals(
            3,
            [
                SELECT COUNT()
                FROM Form_Response_Answer__c
                WHERE Form_Response__c = :res.recordId
            ],
            'answer rows still land — writeback is IN ADDITION'
        );
    }

    @isTest
    static void submitWithoutRecordContextTouchesNothing() {
        grantFls();
        Form_Version__c version = makeMappedSurvey();
        Job_Application__c ja = new Job_Application__c(Desired_Salary__c = 1);
        insert ja;
        Test.startTest();
        FinalSubmitController.submitForm(
            null,
            version.Id,
            payload(new Map<String, Object>{ 'el_salary' => 90000 }, null)
        );
        Test.stopTest();
        Job_Application__c after = [
            SELECT Desired_Salary__c
            FROM Job_Application__c
            WHERE Id = :ja.Id
        ];
        System.assertEquals(
            1,
            after.Desired_Salary__c,
            'no record context = byte-identical to the plain survey path'
        );
    }

    /**
     * SO-2 direction: mode='write' never prefills; mode='prefill' never
     * writes back. el_salary is write-only, el_name is prefill-only.
     */
    @isTest
    static void mappingModeGovernsPrefillAndWriteback() {
        grantFls();
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
                                withMode(
                                    mappedElement(
                                        'el_salary',
                                        'number',
                                        'Desired_Salary__c'
                                    ),
                                    'write'
                                ),
                                withMode(
                                    mappedElement(
                                        'el_name',
                                        'text',
                                        'Applicant_Name__c'
                                    ),
                                    'prefill'
                                )
                            }
                        }
                    }
                }
            }
        };
        Form__c form = new Form__c(
            Name = 'Mode Pulse',
            Form_Type__c = 'Survey',
            Status__c = 'Published',
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert form;
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        insert version;

        Job_Application__c ja;
        Map<String, Object> prefill;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ja = new Job_Application__c(
                Desired_Salary__c = 55,
                Applicant_Name__c = 'Original Name'
            );
            insert ja;
            Test.startTest();
            prefill = FinalSurveyObjectController.getPrefill(
                version.Id,
                null,
                ja.Id
            );
            FinalSubmitController.submitForm(
                null,
                version.Id,
                payload(
                    new Map<String, Object>{
                        'el_salary' => 90000,
                        'el_name' => 'Should Not Land'
                    },
                    ja.Id
                )
            );
            Test.stopTest();
        }
        System.assert(
            !prefill.containsKey('el_salary'),
            'write-only mapping never prefills'
        );
        System.assertEquals(
            'Original Name',
            prefill.get('el_name'),
            'prefill-only mapping still prefills'
        );
        Job_Application__c after = [
            SELECT Desired_Salary__c, Applicant_Name__c
            FROM Job_Application__c
            WHERE Id = :ja.Id
        ];
        System.assertEquals(
            90000,
            after.Desired_Salary__c,
            'write-only mapping still writes back'
        );
        System.assertEquals(
            'Original Name',
            after.Applicant_Name__c,
            'prefill-only mapping never writes back'
        );
    }

    @isTest
    static void unansweredMappedQuestionLeavesFieldAlone() {
        grantFls();
        Form_Version__c version = makeMappedSurvey();
        Job_Application__c ja;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ja = new Job_Application__c(
                Desired_Salary__c = 77,
                Applicant_Name__c = 'Keep me'
            );
            insert ja;
            Test.startTest();
            FinalSubmitController.submitForm(
                null,
                version.Id,
                payload(new Map<String, Object>{ 'el_salary' => 3 }, ja.Id)
            );
            Test.stopTest();
        }
        Job_Application__c after = [
            SELECT Desired_Salary__c, Applicant_Name__c
            FROM Job_Application__c
            WHERE Id = :ja.Id
        ];
        System.assertEquals(3, after.Desired_Salary__c, 'answered → written');
        System.assertEquals(
            'Keep me',
            after.Applicant_Name__c,
            'unanswered mapped question never clears the field'
        );
    }
}
