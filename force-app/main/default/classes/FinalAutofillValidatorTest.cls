@isTest
private class FinalAutofillValidatorTest {
    private static Map<String, Object> createBaseSpec() {
        return new Map<String, Object>{
            'specVersion' => 1,
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 's1',
                            'repeat' => false,
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_first_name',
                                    'type' => 'field',
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'text'
                                    }
                                },
                                new Map<String, Object>{
                                    'id' => 'el_email',
                                    'type' => 'field',
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'email'
                                    }
                                },
                                new Map<String, Object>{
                                    'id' => 'el_account_lookup',
                                    'type' => 'field',
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'reference'
                                    },
                                    'binding' => new Map<String, Object>{
                                        'referenceTo' => 'Account'
                                    }
                                },
                                new Map<String, Object>{
                                    'id' => 'el_phone',
                                    'type' => 'field',
                                    'config' => new Map<String, Object>{
                                        'inputType' => 'phone'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'source' => 'sourceRecord',
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>()
                }
            }
        };
    }

    /** A public form with a REQUIRED lookup question is refused for an
     *  anonymous audience (the switch is Form__c.Is_Public__c). */
    @isTest
    static void aRequiredLookupOnAPublicFormIsRefused() {
        Form__c f = new Form__c(
            Name = 'Public lookup',
            Primary_Context_Object__c = 'Contact',
            Form_Type__c = 'Form',
            Is_Public__c = true
        );
        insert f;
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> lookup = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                    'pages'
                ))[0])
                .get('sections'))[0])
            .get('elements'))[2];
        lookup.put('required', true);
        // the validator only runs for a form that has Autofill rules
        ((Map<String, Object>) ((Map<String, Object>) spec.get('settings'))
                .get('prefill'))
            .put(
                'autofillRules',
                new List<Object>{
                    rule(
                        'r_user',
                        new Map<String, Object>{ 'type' => 'user' },
                        'preserveEdits',
                        new List<Object>{ mapping('m1', 'Email', 'el_email') }
                    )
                }
            );

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> onPublic = FinalAutofillValidator.validate(
            spec,
            f.Id
        );
        f.Is_Public__c = false;
        update f;
        List<FinalAutofillValidator.Diagnostic> onPrivate = FinalAutofillValidator.validate(
            spec,
            f.Id
        );
        Test.stopTest();

        Boolean refused = false;
        for (FinalAutofillValidator.Diagnostic d : onPublic) {
            refused = refused || d.code == 'AUTOFILL_REQUIRED_LOOKUP_ANONYMOUS';
        }
        System.assert(refused, 'public + required lookup is refused');
        for (FinalAutofillValidator.Diagnostic d : onPrivate) {
            System.assertNotEquals(
                'AUTOFILL_REQUIRED_LOOKUP_ANONYMOUS',
                d.code,
                'a form that is not public is not refused'
            );
        }
    }

    private static Map<String, Object> rule(
        String id,
        Map<String, Object> source,
        String policy,
        List<Object> mappings
    ) {
        return new Map<String, Object>{
            'id' => id,
            'name' => id,
            'enabled' => true,
            'source' => source,
            'policy' => policy,
            'mappings' => mappings
        };
    }

    private static Map<String, Object> mapping(
        String id,
        String fromField,
        String toElement
    ) {
        return new Map<String, Object>{
            'id' => id,
            'from' => fromField,
            'to' => toElement,
            'guestAllowed' => false
        };
    }

    /** One rule set full of mistakes: each mistake is named by its own code
     *  (exercises the refusal paths the narrower tests above don't reach). */
    @isTest
    static void everyKindOfMistakeIsNamed() {
        Form__c f = new Form__c(
            Name = 'Mistakes survey',
            Form_Type__c = 'Survey',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> spec = createBaseSpec();
        List<Object> elements = (List<Object>) ((Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                    'pages'
                ))[0])
                .get('sections'))[0])
            .get('elements');
        elements.add(
            new Map<String, Object>{
                'id' => 'el_locked',
                'type' => 'field',
                'readOnly' => true,
                'config' => new Map<String, Object>{ 'inputType' => 'text' }
            }
        );
        Map<String, Object> link = new Map<String, Object>{
            'type' => 'link',
            'objectApiName' => 'Contact'
        };
        List<Object> rules = new List<Object>{
            // a valid link rule, then a second one (only one allowed)
            rule(
                'r_link1',
                link,
                'preserveEdits',
                new List<Object>{ mapping('m1', 'FirstName', 'el_first_name') }
            ),
            rule(
                'r_link2',
                new Map<String, Object>{ 'type' => 'link' }, // no object
                'preserveEdits',
                new List<Object>{ mapping('m2', 'Email', 'el_email') }
            ),
            // a link rule for another object than the survey's own
            rule(
                'r_link3',
                new Map<String, Object>{
                    'type' => 'link',
                    'objectApiName' => 'Account'
                },
                'preserveEdits',
                new List<Object>{ mapping('m3', 'Name', 'el_phone') }
            ),
            // lookup rules: no question, a missing question, not a lookup
            rule(
                'r_lk1',
                new Map<String, Object>{ 'type' => 'lookup' },
                'preserveEdits',
                new List<Object>{ mapping('m4', 'Name', 'el_phone') }
            ),
            rule(
                'r_lk2',
                new Map<String, Object>{
                    'type' => 'lookup',
                    'elementId' => 'el_nowhere'
                },
                'preserveEdits',
                new List<Object>{ mapping('m5', 'Name', 'el_phone') }
            ),
            rule(
                'r_lk3',
                new Map<String, Object>{
                    'type' => 'lookup',
                    'elementId' => 'el_first_name'
                },
                'preserveEdits',
                new List<Object>{ mapping('m6', 'Name', 'el_phone') }
            ),
            // an object nobody can read, a bad policy, no mappings
            rule(
                'r_obj',
                new Map<String, Object>{
                    'type' => 'user',
                    'objectApiName' => 'No_Such_Object__c'
                },
                'whenever',
                new List<Object>()
            ),
            // mappings: no from, no to, a question that doesn't exist, a
            // read-only question
            rule(
                'r_user',
                new Map<String, Object>{ 'type' => 'user' },
                'preserveEdits',
                new List<Object>{
                    mapping('m7', '', 'el_email'),
                    mapping('m8', 'Email', ''),
                    mapping('m9', 'Email', 'el_ghost'),
                    mapping('m10', 'Email', 'el_locked')
                }
            )
        };
        // too many rules
        for (Integer i = 0; i < FinalAutofillValidator.MAX_ENABLED_RULES; i++) {
            rules.add(
                rule(
                    'r_bulk' + i,
                    new Map<String, Object>{ 'type' => 'user' },
                    'preserveEdits',
                    new List<Object>{
                        mapping('mb' + i + 'a', 'Email', 'el_email'),
                        mapping('mb' + i + 'b', 'Phone', 'el_phone'),
                        mapping('mb' + i + 'c', 'Title', 'el_first_name')
                    }
                )
            );
        }
        ((Map<String, Object>) ((Map<String, Object>) spec.get('settings'))
                .get('prefill'))
            .put('autofillRules', rules);

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> diags = FinalAutofillValidator.validate(
            spec,
            f.Id
        );
        Test.stopTest();

        Set<String> codes = new Set<String>();
        for (FinalAutofillValidator.Diagnostic d : diags) {
            codes.add(d.code);
        }
        for (
            String expected : new List<String>{
                'AUTOFILL_MULTIPLE_LINK_RULES',
                'AUTOFILL_MISSING_SOURCE_OBJECT',
                'AUTOFILL_MISSING_LOOKUP_ELEMENT',
                'AUTOFILL_LOOKUP_ELEMENT_NOT_FOUND',
                'AUTOFILL_INVALID_POLICY',
                'AUTOFILL_EMPTY_MAPPINGS',
                'AUTOFILL_MISSING_FROM_FIELD',
                'AUTOFILL_MISSING_TO_ELEMENT',
                'AUTOFILL_DESTINATION_NOT_FOUND',
                'AUTOFILL_EXCEEDED_MAX_RULES',
                'AUTOFILL_EXCEEDED_MAX_MAPPINGS'
            }
        ) {
            System.assert(
                codes.contains(expected),
                expected + ' missing from ' + codes
            );
        }
    }

    /** A connected survey's own context object is read from the form. */
    @isTest
    static void aConnectedSurveyIsValidatedAgainstItsContextObject() {
        Form__c f = new Form__c(
            Name = 'Connected survey',
            Form_Type__c = 'Survey',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> prefill = (Map<String, Object>) ((Map<String, Object>) spec.get(
                'settings'
            ))
            .get('prefill');
        prefill.put(
            'autofillRules',
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'rule_ctx',
                    'name' => 'Context',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'link',
                        'objectApiName' => 'Contact'
                    },
                    'policy' => 'preserveEdits',
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'm1',
                            'from' => 'FirstName',
                            'to' => 'el_first_name',
                            'guestAllowed' => true
                        }
                    }
                }
            }
        );

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> diags = FinalAutofillValidator.validate(
            spec,
            f.Id
        );
        Test.stopTest();

        System.assertNotEquals(null, diags, 'validated against the form');
    }

    @isTest
    static void testValidRulesPass() {
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> settings = (Map<String, Object>) spec.get(
            'settings'
        );
        Map<String, Object> prefill = (Map<String, Object>) settings.get(
            'prefill'
        );

        prefill.put(
            'autofillRules',
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'rule_contact',
                    'name' => 'Contact Link',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'link',
                        'objectApiName' => 'Contact'
                    },
                    'policy' => 'preserveEdits',
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'm1',
                            'from' => 'FirstName',
                            'to' => 'el_first_name',
                            'guestAllowed' => true
                        },
                        new Map<String, Object>{
                            'id' => 'm2',
                            'from' => 'Email',
                            'to' => 'el_email',
                            'guestAllowed' => true
                        }
                    }
                },
                new Map<String, Object>{
                    'id' => 'rule_account',
                    'name' => 'Account Lookup',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'lookup',
                        'elementId' => 'el_account_lookup'
                    },
                    'policy' => 'preserveEdits',
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'm3',
                            'from' => 'Phone',
                            'to' => 'el_phone',
                            'guestAllowed' => false
                        }
                    }
                }
            }
        );

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> diags = FinalAutofillValidator.validate(
            spec,
            null
        );
        Test.stopTest();

        System.assertEquals(
            0,
            diags.size(),
            'Expected no diagnostics for valid rules: ' + JSON.serialize(diags)
        );
    }

    @isTest
    static void testDestinationConflictRejected() {
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> settings = (Map<String, Object>) spec.get(
            'settings'
        );
        Map<String, Object> prefill = (Map<String, Object>) settings.get(
            'prefill'
        );

        prefill.put(
            'autofillRules',
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'r1',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'link',
                        'objectApiName' => 'Contact'
                    },
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'from' => 'FirstName',
                            'to' => 'el_first_name'
                        }
                    }
                },
                new Map<String, Object>{
                    'id' => 'r2',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'lookup',
                        'elementId' => 'el_account_lookup'
                    },
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'from' => 'Name',
                            'to' => 'el_first_name'
                        } // Collision!
                    }
                }
            }
        );

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> diags = FinalAutofillValidator.validate(
            spec,
            null
        );
        Test.stopTest();

        Boolean foundCollision = false;
        for (FinalAutofillValidator.Diagnostic d : diags) {
            if (d.code == 'AUTOFILL_DESTINATION_CONFLICT') {
                foundCollision = true;
                break;
            }
        }
        System.assert(
            foundCollision,
            'Expected AUTOFILL_DESTINATION_CONFLICT diagnostic'
        );
    }

    @isTest
    static void testLookupGuestDisclosureRejected() {
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> settings = (Map<String, Object>) spec.get(
            'settings'
        );
        Map<String, Object> prefill = (Map<String, Object>) settings.get(
            'prefill'
        );

        prefill.put(
            'autofillRules',
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'r_lookup',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'lookup',
                        'elementId' => 'el_account_lookup'
                    },
                    'mappings' => new List<Object>{
                        new Map<String, Object>{
                            'from' => 'Phone',
                            'to' => 'el_phone',
                            'guestAllowed' => true // Rejected for lookup!
                        }
                    }
                }
            }
        );

        Test.startTest();
        List<FinalAutofillValidator.Diagnostic> diags = FinalAutofillValidator.validate(
            spec,
            null
        );
        Test.stopTest();

        Boolean foundGuestError = false;
        for (FinalAutofillValidator.Diagnostic d : diags) {
            if (d.code == 'AUTOFILL_LOOKUP_GUEST_DISCLOSURE') {
                foundGuestError = true;
                break;
            }
        }
        System.assert(
            foundGuestError,
            'Expected AUTOFILL_LOOKUP_GUEST_DISCLOSURE diagnostic'
        );
    }

    @isTest
    static void testValidateForPublishThrowsOnFailure() {
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> settings = (Map<String, Object>) spec.get(
            'settings'
        );
        Map<String, Object> prefill = (Map<String, Object>) settings.get(
            'prefill'
        );

        prefill.put(
            'autofillRules',
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'r_bad',
                    'enabled' => true,
                    'source' => new Map<String, Object>{
                        'type' => 'unknown_type'
                    },
                    'mappings' => new List<Object>()
                }
            }
        );

        Boolean threw = false;
        try {
            FinalAutofillValidator.validateForPublish(null, spec);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(
            threw,
            'Expected validateForPublish to throw AuraHandledException'
        );
    }
    // ----- polymorphic lookups: one object per rule (owner 2026-09-13) -----

    /** Base spec plus a Task "Related To" lookup carrying the given rules. */
    private static Map<String, Object> polymorphicSpec(List<Object> rules) {
        Map<String, Object> spec = createBaseSpec();
        Map<String, Object> page = (Map<String, Object>) ((List<Object>) spec.get(
            'pages'
        ))[0];
        Map<String, Object> section = (Map<String, Object>) ((List<Object>) page.get(
            'sections'
        ))[0];
        ((List<Object>) section.get('elements'))
            .add(
                new Map<String, Object>{
                    'id' => 'el_what',
                    'type' => 'field',
                    'config' => new Map<String, Object>{
                        'inputType' => 'reference'
                    },
                    'binding' => new Map<String, Object>{
                        'object' => 'Task',
                        'field' => 'WhatId'
                    }
                }
            );
        ((Map<String, Object>) ((Map<String, Object>) spec.get('settings'))
                .get('prefill'))
            .put('autofillRules', rules);
        return spec;
    }

    private static Map<String, Object> polyRule(
        String id,
        String objectApiName,
        String fromField
    ) {
        Map<String, Object> source = new Map<String, Object>{
            'type' => 'lookup',
            'elementId' => 'el_what'
        };
        if (objectApiName != null) {
            source.put('objectApiName', objectApiName);
        }
        return new Map<String, Object>{
            'id' => id,
            'enabled' => true,
            'source' => source,
            'mappings' => new List<Object>{
                new Map<String, Object>{
                    'from' => fromField,
                    'to' => 'el_phone'
                }
            }
        };
    }

    private static Set<String> codesOf(Map<String, Object> spec) {
        Set<String> codes = new Set<String>();
        for (
            FinalAutofillValidator.Diagnostic d : FinalAutofillValidator.validate(
                spec,
                null
            )
        ) {
            codes.add(d.code);
        }
        return codes;
    }

    @isTest
    static void polymorphicLookupRuleMustNameItsObject() {
        Set<String> codes = codesOf(
            polymorphicSpec(new List<Object>{ polyRule('r1', null, 'Phone') })
        );
        System.assert(
            codes.contains('AUTOFILL_POLYMORPHIC_OBJECT_REQUIRED'),
            codes
        );
    }

    @isTest
    static void polymorphicLookupRuleRejectsAnObjectTheFieldCannotPointAt() {
        // Related To points at business records, never at User.
        Set<String> codes = codesOf(
            polymorphicSpec(new List<Object>{ polyRule('r1', 'User', 'Phone') })
        );
        System.assert(
            codes.contains('AUTOFILL_POLYMORPHIC_OBJECT_NOT_A_TARGET'),
            codes
        );
    }

    @isTest
    static void polymorphicLookupRuleOnARealTargetIsValid() {
        Set<String> codes = codesOf(
            polymorphicSpec(
                new List<Object>{ polyRule('r1', 'Account', 'Phone') }
            )
        );
        System.assert(
            !codes.contains('AUTOFILL_POLYMORPHIC_OBJECT_REQUIRED'),
            codes
        );
        System.assert(
            !codes.contains('AUTOFILL_POLYMORPHIC_OBJECT_NOT_A_TARGET'),
            codes
        );
        System.assert(
            !codes.contains('AUTOFILL_SOURCE_FIELD_INACCESSIBLE'),
            codes
        );
    }

    @isTest
    static void polymorphicLookupRuleChecksFieldsAgainstItsChosenObject() {
        // Subject is a Case field, not an Account field: mappings are checked
        // against the object the rule names.
        Set<String> codes = codesOf(
            polymorphicSpec(
                new List<Object>{ polyRule('r1', 'Account', 'Subject') }
            )
        );
        System.assert(
            codes.contains('AUTOFILL_SOURCE_FIELD_INACCESSIBLE'),
            codes
        );
    }

    @isTest
    static void onePolymorphicLookupCanHaveARulePerObjectSharingDestinations() {
        // The chosen record is an Account or an Opportunity, never both, so the
        // two rules can never fill the same question at once.
        Set<String> codes = codesOf(
            polymorphicSpec(
                new List<Object>{
                    polyRule('r_acc', 'Account', 'Phone'),
                    polyRule('r_opp', 'Opportunity', 'Name')
                }
            )
        );
        System.assert(!codes.contains('AUTOFILL_DUPLICATE_LOOKUP_RULE'), codes);
        System.assert(!codes.contains('AUTOFILL_DESTINATION_CONFLICT'), codes);
    }

    @isTest
    static void twoRulesForTheSameObjectOnOneLookupAreStillDuplicates() {
        Set<String> codes = codesOf(
            polymorphicSpec(
                new List<Object>{
                    polyRule('r1', 'Account', 'Phone'),
                    polyRule('r2', 'Account', 'Phone')
                }
            )
        );
        System.assert(codes.contains('AUTOFILL_DUPLICATE_LOOKUP_RULE'), codes);
        System.assert(codes.contains('AUTOFILL_DESTINATION_CONFLICT'), codes);
    }

    // ---- IMPL_PLAN_F2_AUTOFILL 6.4 / 6.6: questions, types, lookup questions

    private static Map<String, Object> freeformSpec(
        List<Object> elements,
        List<Object> rules
    ) {
        Map<String, Object> spec = createBaseSpec();
        List<Object> els = (List<Object>) ((Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                    'pages'
                ))[0])
                .get('sections'))[0])
            .get('elements');
        els.addAll(elements);
        ((Map<String, Object>) ((Map<String, Object>) spec.get('settings'))
                .get('prefill'))
            .put('autofillRules', rules);
        return spec;
    }

    private static Map<String, Object> question(String id, String inputType) {
        return new Map<String, Object>{
            'id' => id,
            'type' => 'field',
            'label' => id,
            'config' => new Map<String, Object>{ 'inputType' => inputType }
        };
    }

    private static Map<String, Object> linkRule(List<Object> mappings) {
        return new Map<String, Object>{
            'id' => 'af_link',
            'enabled' => true,
            'source' => new Map<String, Object>{
                'type' => 'link',
                'objectApiName' => 'Account'
            },
            'mappings' => mappings
        };
    }

    private static Map<String, Object> mapping(String fromField, String toEl) {
        return new Map<String, Object>{
            'id' => 'afm_' + toEl,
            'from' => fromField,
            'to' => toEl,
            'guestAllowed' => false
        };
    }

    @isTest
    static void numbersDatesAndChoicesFillMatchingQuestions() {
        Map<String, Object> choice = question('el_industry', 'picklist');
        ((Map<String, Object>) choice.get('config'))
            .put('renderAs', 'Dropdown');
        Map<String, Object> spec = freeformSpec(
            new List<Object>{
                question('el_revenue', 'number'),
                question('el_since', 'date'),
                choice
            },
            new List<Object>{
                linkRule(
                    new List<Object>{
                        mapping('AnnualRevenue', 'el_revenue'),
                        mapping('CreatedDate', 'el_since'),
                        mapping('Industry', 'el_industry')
                    }
                )
            }
        );
        Set<String> codes = codesOf(spec);
        Assert.isFalse(
            codes.contains('AUTOFILL_TYPE_MISMATCH'),
            String.valueOf(codes)
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_INCOMPATIBLE_DESTINATION'),
            String.valueOf(codes)
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_UNSUPPORTED_SOURCE_TYPE'),
            String.valueOf(codes)
        );
    }

    @isTest
    static void aFieldThatDoesNotFitItsAnswerIsRefused() {
        Map<String, Object> spec = freeformSpec(
            new List<Object>{ question('el_revenue', 'number') },
            new List<Object>{
                linkRule(new List<Object>{ mapping('Name', 'el_revenue') })
            }
        );
        Assert.isTrue(codesOf(spec).contains('AUTOFILL_TYPE_MISMATCH'));
    }

    @isTest
    static void aSeveralChoiceQuestionIsNotADestination() {
        Map<String, Object> multi = question('el_tags', 'picklist');
        ((Map<String, Object>) multi.get('config'))
            .put('renderAs', 'Checkbox_Group');
        Map<String, Object> spec = freeformSpec(
            new List<Object>{ multi },
            new List<Object>{
                linkRule(new List<Object>{ mapping('Industry', 'el_tags') })
            }
        );
        Assert.isTrue(
            codesOf(spec).contains('AUTOFILL_INCOMPATIBLE_DESTINATION')
        );
    }

    @isTest
    static void aRecordLookupQuestionIsASourceWithItsPickedObject() {
        Map<String, Object> pick = new Map<String, Object>{
            'id' => 'el_pick',
            'type' => 'field',
            'label' => 'Company',
            'config' => new Map<String, Object>{
                'inputType' => 'reference',
                'referenceTo' => 'Account'
            },
            'lookupConfig' => new Map<String, Object>{
                'targetObject' => 'Account'
            }
        };
        Map<String, Object> rule = new Map<String, Object>{
            'id' => 'af_pick',
            'enabled' => true,
            'source' => new Map<String, Object>{
                'type' => 'lookup',
                'elementId' => 'el_pick'
            },
            'mappings' => new List<Object>{
                mapping('Phone', 'el_phone'),
                mapping('No_Such_Field__c', 'el_first_name')
            }
        };
        Set<String> codes = codesOf(
            freeformSpec(new List<Object>{ pick }, new List<Object>{ rule })
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_INVALID_LOOKUP_BINDING'),
            String.valueOf(codes)
        );
        // fields are checked against the picked object, so a bad one is found
        Assert.isTrue(
            codes.contains('AUTOFILL_SOURCE_FIELD_INACCESSIBLE'),
            String.valueOf(codes)
        );
    }

    @isTest
    static void aLookupQuestionIsNeverADestination() {
        Map<String, Object> spec = freeformSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'el_pick2',
                    'type' => 'field',
                    'label' => 'Pick',
                    'config' => new Map<String, Object>{
                        'inputType' => 'reference',
                        'referenceTo' => 'Account'
                    }
                }
            },
            new List<Object>{
                linkRule(new List<Object>{ mapping('Name', 'el_pick2') })
            }
        );
        Assert.isTrue(
            codesOf(spec).contains('AUTOFILL_INCOMPATIBLE_DESTINATION')
        );
    }

    @isTest
    static void aLookupQuestionWithNoObjectIsSaid() {
        Map<String, Object> pick = new Map<String, Object>{
            'id' => 'el_pick3',
            'type' => 'field',
            'label' => 'Pick',
            'config' => new Map<String, Object>{ 'inputType' => 'reference' }
        };
        Map<String, Object> rule = new Map<String, Object>{
            'id' => 'af_3',
            'enabled' => true,
            'source' => new Map<String, Object>{
                'type' => 'lookup',
                'elementId' => 'el_pick3'
            },
            'mappings' => new List<Object>{ mapping('Phone', 'el_phone') }
        };
        Assert.isTrue(
            codesOf(
                    freeformSpec(
                        new List<Object>{ pick },
                        new List<Object>{ rule }
                    )
                )
                .contains('AUTOFILL_LOOKUP_NO_OBJECT')
        );
    }

    // ---- 7.1 / 7.2

    private static Map<String, Object> rule(
        String id,
        Map<String, Object> source,
        List<Object> mappings
    ) {
        return new Map<String, Object>{
            'id' => id,
            'enabled' => true,
            'source' => source,
            'mappings' => mappings
        };
    }

    @isTest
    static void aLinkRuleMayReadOneHop() {
        Map<String, Object> spec = freeformSpec(
            new List<Object>(),
            new List<Object>{
                rule(
                    'af_c',
                    new Map<String, Object>{
                        'type' => 'link',
                        'objectApiName' => 'Contact'
                    },
                    new List<Object>{
                        mapping('Account.Name', 'el_first_name'),
                        mapping('Account.Owner.Name', 'el_email')
                    }
                )
            }
        );
        List<FinalAutofillValidator.Diagnostic> found = FinalAutofillValidator.validate(
            spec,
            null
        );
        Integer bad = 0;
        for (FinalAutofillValidator.Diagnostic d : found) {
            if (d.code == 'AUTOFILL_SOURCE_FIELD_INACCESSIBLE') {
                bad++;
                Assert.isTrue(
                    d.message.contains('Account.Owner.Name'),
                    d.message
                );
            }
        }
        Assert.areEqual(1, bad, 'one hop reads; two hops never do');
    }

    @isTest
    static void theSignedInPersonReadsTheirOwnRecordAndThreeHops() {
        Map<String, Object> ok = rule(
            'af_u',
            new Map<String, Object>{ 'type' => 'user' },
            new List<Object>{
                mapping('Email', 'el_email'),
                mapping('Manager.Name', 'el_first_name')
            }
        );
        Set<String> codes = codesOf(
            freeformSpec(new List<Object>(), new List<Object>{ ok })
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_INVALID_SOURCE_TYPE'),
            String.valueOf(codes)
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_USER_HOP_NOT_ALLOWED'),
            String.valueOf(codes)
        );
        Assert.isFalse(
            codes.contains('AUTOFILL_SOURCE_FIELD_INACCESSIBLE'),
            String.valueOf(codes)
        );

        Map<String, Object> profile = rule(
            'af_u2',
            new Map<String, Object>{ 'type' => 'user' },
            new List<Object>{ mapping('Profile.Name', 'el_first_name') }
        );
        Assert.isTrue(
            codesOf(
                    freeformSpec(
                        new List<Object>(),
                        new List<Object>{ profile }
                    )
                )
                .contains('AUTOFILL_USER_HOP_NOT_ALLOWED')
        );
    }

    @isTest
    static void theSignedInPersonNeverGoesToGuests() {
        Map<String, Object> m = mapping('Email', 'el_email');
        m.put('guestAllowed', true);
        Map<String, Object> r = rule(
            'af_u3',
            new Map<String, Object>{ 'type' => 'user' },
            new List<Object>{ m }
        );
        Assert.isTrue(
            codesOf(freeformSpec(new List<Object>(), new List<Object>{ r }))
                .contains('AUTOFILL_USER_GUEST_DISCLOSURE')
        );
    }
}
