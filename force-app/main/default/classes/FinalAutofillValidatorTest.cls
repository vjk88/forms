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
}
