@isTest
private class FinalAutofillControllerTest {
    @TestSetup
    static void setup() {
        PermissionSet ps = new PermissionSet(
            Name = 'AutofillCtrlTestPS',
            Label = 'AutofillCtrlTestPS'
        );
        insert ps;
        insert new ObjectPermissions(
            ParentId = ps.Id,
            SobjectType = 'Job_Application__c',
            PermissionsRead = true,
            PermissionsCreate = true,
            PermissionsEdit = true
        );
        insert new FieldPermissions(
            ParentId = ps.Id,
            SobjectType = 'Form__c',
            Field = 'Form__c.Links_Invalidated_On__c',
            PermissionsRead = true,
            PermissionsEdit = true
        );
        insert new PermissionSetAssignment(
            AssigneeId = UserInfo.getUserId(),
            PermissionSetId = ps.Id
        );
    }

    private static Form__c createTestForm() {
        Form__c f = new Form__c(
            Name = 'Autofill Form',
            Form_Type__c = 'Form',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest',
            // VR_Primary_Object_Required (ACTIVE): a Form-typed record must
            // carry its primary object or the insert is rejected.
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert f;

        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{
                'type' => 'form',
                'targetObject' => 'Job_Application__c'
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec1',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_name',
                                    'type' => 'field',
                                    'binding' => 'Applicant_Name__c',
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'text'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'af_link1',
                            'name' => 'Link Rule 1',
                            'enabled' => true,
                            'policy' => 'preserveEdits',
                            'source' => new Map<String, Object>{
                                'type' => 'link',
                                'objectApiName' => 'Job_Application__c'
                            },
                            'mappings' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'm1',
                                    'from' => 'Applicant_Name__c',
                                    'to' => 'el_name',
                                    'guestAllowed' => true
                                }
                            }
                        }
                    }
                }
            }
        };

        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        return f;
    }

    @isTest
    static void testDescribeSourceFields() {
        Form__c f = createTestForm();
        Test.startTest();
        List<Map<String, Object>> fields = FinalAutofillController.describeSourceFields(
            f.Id,
            'Job_Application__c'
        );
        Test.stopTest();
        System.assertNotEquals(null, fields);
        System.assert(fields.size() > 0, 'should return readable fields');
    }

    @isTest
    static void testGetLookupPlan() {
        Form__c f = createTestForm();
        Form_Version__c v = [
            SELECT Id
            FROM Form_Version__c
            WHERE Form__c = :f.Id AND Is_Active__c = TRUE
            LIMIT 1
        ];

        Test.startTest();
        Map<String, Object> plan = FinalAutofillController.getLookupPlan(
            f.Id,
            v.Id
        );
        Test.stopTest();

        System.assertEquals(v.Id, (Id) plan.get('versionId'));
        System.assertNotEquals(null, plan.get('lookups'));
        System.assertNotEquals(null, plan.get('rules'));
    }

    @isTest
    static void testGetTestRecordValues() {
        Form__c f = createTestForm();
        Job_Application__c ja = new Job_Application__c(
            Applicant_Name__c = 'Ada Lovelace'
        );
        insert ja;

        Test.startTest();
        Map<String, Object> vals = FinalAutofillController.getTestRecordValues(
            f.Id,
            'Job_Application__c',
            ja.Id,
            new List<String>{ 'Applicant_Name__c' }
        );
        Test.stopTest();

        System.assertEquals('Ada Lovelace', vals.get('Applicant_Name__c'));
    }

    /**
     * R5 — a Final element binding is an OBJECT ({object, field}), which is what
     * the builder actually writes. inspectLookups used to hard-cast it to String,
     * so getLookupPlan threw System.TypeException on EVERY normally bound form.
     * The old fixture hid this by using a bare String binding.
     */
    private static Form__c createObjectBoundForm() {
        Form__c f = new Form__c(
            Name = 'Object Bound Form',
            Form_Type__c = 'Form',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest',
            // VR_Primary_Object_Required (ACTIVE): a Form-typed record must
            // carry its primary object or the insert is rejected.
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert f;

        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{
                'type' => 'form',
                'targetObject' => 'Job_Application__c'
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec1',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_name',
                                    'type' => 'field',
                                    // the REAL shape the builder persists
                                    'binding' => new Map<String, Object>{
                                        'object' => 'Job_Application__c',
                                        'field' => 'Applicant_Name__c'
                                    },
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'text'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>()
                }
            }
        };

        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        return f;
    }

    @isTest
    static void lookupPlanSurvivesObjectShapedBindings() {
        Form__c f = createObjectBoundForm();
        Form_Version__c v = [
            SELECT Id
            FROM Form_Version__c
            WHERE Form__c = :f.Id AND Is_Active__c = TRUE
            LIMIT 1
        ];

        Test.startTest();
        Map<String, Object> plan = FinalAutofillController.getLookupPlan(
            f.Id,
            v.Id
        );
        Test.stopTest();

        // Before the fix this line was never reached: the hard (String) cast
        // threw TypeException while walking the element.
        System.assertNotEquals(null, plan, 'plan should resolve');
        System.assertNotEquals(null, plan.get('lookups'));
    }

    @isTest
    static void disclosureGateRejectsUnreadableFields() {
        // R8 — the gate must refuse when a disclosed field cannot be read.
        // A field that does not exist stands in for one the minter lacks FLS on;
        // both take the same branch in canDiscloseFields.
        FinalAutofillService.LinkSourceContract bad = new FinalAutofillService.LinkSourceContract(
            'Job_Application__c',
            'af_link1',
            new List<Map<String, Object>>{
                new Map<String, Object>{
                    'from' => 'No_Such_Field__c',
                    'to' => 'el_name',
                    'guestAllowed' => true
                }
            },
            false
        );
        System.assertEquals(
            false,
            FinalAutofillService.canDiscloseFields(bad),
            'a field the minter cannot read must block minting'
        );

        FinalAutofillService.LinkSourceContract ok = new FinalAutofillService.LinkSourceContract(
            'Job_Application__c',
            'af_link1',
            new List<Map<String, Object>>{
                new Map<String, Object>{
                    'from' => 'Applicant_Name__c',
                    'to' => 'el_name',
                    'guestAllowed' => true
                }
            },
            false
        );
        System.assertEquals(
            true,
            FinalAutofillService.canDiscloseFields(ok),
            'a readable disclosed field must be allowed'
        );
    }

    @isTest
    static void flowLinkMintingStaysBulkSafeAcrossDistinctForms() {
        // R12 — the invocable used to resolve each distinct form with its own
        // pair of SOQL statements, so ~50 forms in one Flow batch blew the
        // synchronous query limit. Resolution is now set-based.
        List<FinalSurveyLinkInvocable.Request> reqs = new List<FinalSurveyLinkInvocable.Request>();
        for (Integer i = 0; i < 10; i++) {
            Form__c f = createTestForm();
            Job_Application__c ja = new Job_Application__c(
                Applicant_Name__c = 'Bulk ' + i
            );
            insert ja;
            FinalSurveyLinkInvocable.Request r = new FinalSurveyLinkInvocable.Request();
            r.formId = f.Id;
            r.recordId = ja.Id;
            reqs.add(r);
        }

        Test.startTest();
        Integer before = Limits.getQueries();
        List<FinalSurveyLinkInvocable.Result> res = FinalSurveyLinkInvocable.createLinks(
            reqs
        );
        Integer used = Limits.getQueries() - before;
        Test.stopTest();

        System.assertEquals(10, res.size(), 'one result per request');
        // Per-form resolution would be ~20 for 10 forms and would scale with the
        // batch; set-based resolution stays flat.
        System.assert(
            used <= 8,
            'resolution must not scale with distinct form count (used ' +
                used +
                ' queries)'
        );
    }
    @isTest
    static void describeFieldsOffersSingleTargetLookupsWithTheirTarget() {
        // R5a — inputTypeOf had no REFERENCE branch, so describeFields dropped
        // every lookup field. The palette could not create the lookup element
        // that lookup Autofill needs as its source, which is why the authoring
        // path dead-ended at 'Add a lookup field first'.
        // A permission set assigned inside a test only takes effect for a FRESH
        // runAs context — without this the FLS granted in @TestSetup is invisible
        // here and describeFields silently omits the lookup.
        List<Map<String, Object>> fields;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            fields = FinalStudioController.describeFields('Contact');
        }
        Test.stopTest();

        Map<String, Object> lookupRow = null;
        List<String> refRows = new List<String>();
        for (Map<String, Object> f : fields) {
            if (f.get('inputType') == 'reference') {
                refRows.add(
                    (String) f.get('apiName') + '->' + f.get('referenceTo')
                );
            }
            if (f.get('apiName') == 'AccountId') {
                lookupRow = f;
            }
        }
        System.assertNotEquals(
            null,
            lookupRow,
            'a single-target lookup must be offerable as a destination; reference rows returned=' +
                refRows +
                '; total fields=' +
                fields.size()
        );
        System.assertEquals('reference', lookupRow.get('inputType'));
        // The target comes from Describe — the element stamps it as
        // config.referenceTo purely as an authoring convenience.
        System.assertEquals('Account', lookupRow.get('referenceTo'));
    }
}
