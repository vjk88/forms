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
        Map<String, Object> page = (Map<String, Object>) (
            (List<Object>) spec.get('pages')
        )[0];
        Map<String, Object> section = (Map<String, Object>) (
            (List<Object>) page.get('sections')
        )[0];
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
        (
            (Map<String, Object>) (
                (Map<String, Object>) spec.get('settings')
            ).get('prefill')
        ).put('autofillRules', rules);
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
                new Map<String, Object>{ 'from' => fromField, 'to' => 'el_phone' }
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
}
