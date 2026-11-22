/**
 * FinalAnswerValidator (IMPL_PLAN_SERVER_VALIDATION, phase 1).
 *
 * Unit tests drive the validator directly with hand-built specs; the
 * end-to-end tests go through FinalSubmitService.run on all three paths and
 * prove that a refused submit writes nothing while a valid one still saves.
 */
@IsTest
private class FinalAnswerValidatorTest {
    private static Map<String, Object> required() {
        return new Map<String, Object>{ 'type' => 'required' };
    }

    private static Map<String, Object> el(
        String id,
        String elType,
        List<Object> validation
    ) {
        return new Map<String, Object>{
            'id' => id,
            'type' => elType,
            'label' => 'Label ' + id,
            'validation' => validation
        };
    }

    private static Map<String, Object> specOf(List<Object> elements) {
        return specOf(elements, null, null);
    }

    private static Map<String, Object> specOf(
        List<Object> elements,
        Map<String, Object> pageExtra,
        Map<String, Object> sectionExtra
    ) {
        Map<String, Object> sec = new Map<String, Object>{
            'id' => 'sec_1',
            'elements' => elements
        };
        if (sectionExtra != null) {
            sec.putAll(sectionExtra);
        }
        Map<String, Object> page = new Map<String, Object>{
            'id' => 'pg_1',
            'sections' => new List<Object>{ sec }
        };
        if (pageExtra != null) {
            page.putAll(pageExtra);
        }
        return new Map<String, Object>{ 'pages' => new List<Object>{ page } };
    }

    private static Map<String, Object> oneRule() {
        return new Map<String, Object>{
            'action' => 'show',
            'rules' => new List<Object>{
                new Map<String, Object>{
                    'source' => 'el_other',
                    'operator' => 'equals',
                    'value' => 'x'
                }
            }
        };
    }

    private static List<FinalSubmitService.FieldError> check(
        Map<String, Object> spec,
        Map<String, Object> answers,
        Boolean isUpdate
    ) {
        return FinalAnswerValidator.validate(spec, answers, isUpdate);
    }

    // ------------------------------------------------------------ required

    @IsTest
    static void requiredAbsentAndBlankFailOnCreate() {
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ required() }) }
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>(), false).size(),
            'absent fails'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => '' }, false).size()
        );
        // the browser's isBlank does not trim: whitespace is an answer there,
        // so the server must accept it too (never refuse what the form allowed)
        System.assertEquals(
            0,
            check(spec, new Map<String, Object>{ 'a' => '   ' }, false).size(),
            'whitespace is an answer, as in the browser'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => null }, false).size()
        );
        System.assertEquals(
            1,
            check(
                    spec,
                    new Map<String, Object>{ 'a' => new List<Object>() },
                    false
                )
                .size(),
            'empty list is blank'
        );
        // the browser's isBlank treats only null, '' and [] as blank; an empty
        // map is an answer there (a matrix checks its rows separately)
        System.assertEquals(
            0,
            check(
                    spec,
                    new Map<String, Object>{ 'a' => new Map<String, Object>() },
                    false
                )
                .size(),
            'an empty map is not blank, as in the browser'
        );
        System.assertEquals(
            1,
            check(spec, null, false).size(),
            'null answers map counts as absent'
        );
    }

    @IsTest
    static void requiredPresentPasses() {
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ required() }) }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 'hi' }, false).isEmpty()
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 0 }, false).isEmpty(),
            'zero is an answer'
        );
        System.assert(
            check(
                    spec,
                    new Map<String, Object>{ 'a' => new List<Object>{ 'x' } },
                    false
                )
                .isEmpty()
        );
    }

    @IsTest
    static void yesNoFalseIsAnAnswerConsentFalseFails() {
        Map<String, Object> spec = specOf(
            new List<Object>{
                el('yn', 'yesNo', new List<Object>{ required() }),
                el('cb', 'checkbox', new List<Object>{ required() })
            }
        );
        List<FinalSubmitService.FieldError> errs = check(
            spec,
            new Map<String, Object>{ 'yn' => false, 'cb' => false },
            false
        );
        System.assertEquals(1, errs.size(), 'only the checkbox fails');
        System.assertEquals('Label cb', errs[0].fields[0]);
        System.assert(
            check(
                    spec,
                    new Map<String, Object>{ 'yn' => false, 'cb' => true },
                    false
                )
                .isEmpty()
        );
    }

    @IsTest
    static void matrixPartialFailsNamingMissingRows() {
        Map<String, Object> matrix = el(
            'mx',
            'matrix',
            new List<Object>{ required() }
        );
        matrix.put(
            'config',
            new Map<String, Object>{
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'value' => 'r1',
                        'label' => 'Speed'
                    },
                    new Map<String, Object>{
                        'value' => 'r2',
                        'label' => 'Price'
                    },
                    new Map<String, Object>{ 'value' => 'r3' }
                }
            }
        );
        Map<String, Object> spec = specOf(new List<Object>{ matrix });
        List<FinalSubmitService.FieldError> errs = check(
            spec,
            new Map<String, Object>{
                'mx' => new Map<String, Object>{ 'r1' => 4 }
            },
            false
        );
        System.assertEquals(1, errs.size());
        System.assertEquals('Please answer: Price, r3', errs[0].message);
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>(), false).size(),
            'absent matrix fails'
        );
        System.assert(
            check(
                    spec,
                    new Map<String, Object>{
                        'mx' => new Map<String, Object>{
                            'r1' => 1,
                            'r2' => 2,
                            'r3' => 3
                        }
                    },
                    false
                )
                .isEmpty()
        );
    }

    @IsTest
    static void entryMessageWinsElseDefault() {
        Map<String, Object> custom = required();
        custom.put('message', 'Tell us your name.');
        Map<String, Object> spec = specOf(
            new List<Object>{
                el('a', 'field', new List<Object>{ custom }),
                el('b', 'field', new List<Object>{ required() })
            }
        );
        List<FinalSubmitService.FieldError> errs = check(
            spec,
            new Map<String, Object>(),
            false
        );
        System.assertEquals('Tell us your name.', errs[0].message);
        System.assertEquals('This value is not valid.', errs[1].message);
    }

    // ----------------------------------------------------------- fields key

    @IsTest
    static void fieldsRouteByBindingThenMappingThenLabel() {
        Map<String, Object> bound = el(
            'a',
            'field',
            new List<Object>{ required() }
        );
        bound.put(
            'binding',
            new Map<String, Object>{
                'object' => 'Contact',
                'field' => 'LastName'
            }
        );
        Map<String, Object> mapped = el(
            'b',
            'field',
            new List<Object>{ required() }
        );
        mapped.put('mapping', new Map<String, Object>{ 'field' => 'Score__c' });
        Map<String, Object> plain = el(
            'c',
            'field',
            new List<Object>{ required() }
        );
        Map<String, Object> bare = new Map<String, Object>{
            'id' => 'd',
            'type' => 'field',
            'validation' => new List<Object>{ required() }
        };
        List<FinalSubmitService.FieldError> errs = check(
            specOf(new List<Object>{ bound, mapped, plain, bare }),
            new Map<String, Object>(),
            false
        );
        System.assertEquals(4, errs.size());
        System.assertEquals('LastName', errs[0].fields[0]);
        System.assertEquals('Score__c', errs[1].fields[0]);
        System.assertEquals('Label c', errs[2].fields[0]);
        System.assert(errs[3].fields.isEmpty(), 'unroutable = form-level');
    }

    // -------------------------------------------------------------- pattern

    @IsTest
    static void patternUsesFindSemantics() {
        Map<String, Object> p = new Map<String, Object>{
            'type' => 'pattern',
            'pattern' => '[0-9]+'
        };
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ p }) }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 'abc123def' }, false)
                .isEmpty(),
            'partial match passes, as JS test() does'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => 'abc' }, false).size()
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => '' }, false).isEmpty(),
            'blank is required\'s job'
        );
        System.assert(
            check(spec, new Map<String, Object>(), false).isEmpty(),
            'absent is not checked by pattern'
        );
    }

    @IsTest
    static void malformedPatternNeverBlocks() {
        Map<String, Object> p = new Map<String, Object>{
            'type' => 'pattern',
            'pattern' => '([unclosed'
        };
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ p }) }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 'anything' }, false)
                .isEmpty()
        );
    }

    // ---------------------------------------------------------------- range

    @IsTest
    static void rangeBoundsAndNonNumbers() {
        Map<String, Object> r = new Map<String, Object>{
            'type' => 'range',
            'min' => 1,
            'max' => 10,
            'message' => 'Between 1 and 10.'
        };
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ r }) }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 1 }, false).isEmpty(),
            'min inclusive'
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 10 }, false).isEmpty(),
            'max inclusive'
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => '5.5' }, false)
                .isEmpty(),
            'numeric string parses'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => 0 }, false).size()
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => 11 }, false).size()
        );
        System.assertEquals(
            'Between 1 and 10.',
            check(spec, new Map<String, Object>{ 'a' => 'abc' }, false)[0]
                .message,
            'non-number fails'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => true }, false).size(),
            'a boolean is not a number'
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => '' }, false).isEmpty()
        );
    }

    @IsTest
    static void rangeOneSidedAndDecimalBounds() {
        Map<String, Object> r = new Map<String, Object>{
            'type' => 'range',
            'min' => 0.5
        };
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ r }) }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 9999 }, false).isEmpty()
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => 0.25 }, false).size()
        );
    }

    // ------------------------------------------------------------ exclusions

    @IsTest
    static void ruleGatedRequiredIsSkippedAtEveryLevel() {
        Map<String, Object> elGated = el(
            'a',
            'field',
            new List<Object>{ required() }
        );
        elGated.put('visibility', oneRule());
        Map<String, Object> noRule = new Map<String, Object>{
            'action' => 'show',
            'rules' => new List<Object>()
        };
        Map<String, Object> elEmptyVis = el(
            'a',
            'field',
            new List<Object>{ required() }
        );
        elEmptyVis.put('visibility', noRule);

        Map<String, Object> none = new Map<String, Object>();
        System.assert(
            check(specOf(new List<Object>{ elGated }), none, false).isEmpty(),
            'element rule'
        );
        System.assert(
            check(
                    specOf(
                        new List<Object>{
                            el('a', 'field', new List<Object>{ required() })
                        },
                        null,
                        new Map<String, Object>{ 'visibility' => oneRule() }
                    ),
                    none,
                    false
                )
                .isEmpty(),
            'section rule'
        );
        System.assert(
            check(
                    specOf(
                        new List<Object>{
                            el('a', 'field', new List<Object>{ required() })
                        },
                        new Map<String, Object>{ 'visibility' => oneRule() },
                        null
                    ),
                    none,
                    false
                )
                .isEmpty(),
            'page rule'
        );
        System.assertEquals(
            1,
            check(specOf(new List<Object>{ elEmptyVis }), none, false).size(),
            'a visibility block with no rules gates nothing'
        );
    }

    @IsTest
    static void patternAndRangeStillRunOnGatedElementsWhenSent() {
        Map<String, Object> r = new Map<String, Object>{
            'type' => 'range',
            'max' => 5
        };
        Map<String, Object> gated = el('a', 'field', new List<Object>{ r });
        gated.put('visibility', oneRule());
        System.assertEquals(
            1,
            check(
                    specOf(new List<Object>{ gated }),
                    new Map<String, Object>{ 'a' => 6 },
                    false
                )
                .size(),
            'a sent value is checked even when a rule gates the question'
        );
    }

    @IsTest
    static void whenGatedAndCustomEntriesAreSkipped() {
        Map<String, Object> withWhen = required();
        withWhen.put(
            'when',
            new Map<String, Object>{ 'rules' => new List<Object>() }
        );
        Map<String, Object> rangeWhen = new Map<String, Object>{
            'type' => 'range',
            'max' => 1,
            'when' => new Map<String, Object>{ 'rules' => new List<Object>() }
        };
        Map<String, Object> custom = new Map<String, Object>{
            'type' => 'custom',
            'compareTo' => 'b',
            'operator' => 'equals'
        };
        Map<String, Object> spec = specOf(
            new List<Object>{
                el(
                    'a',
                    'field',
                    new List<Object>{ withWhen, rangeWhen, custom }
                ),
                el(
                    'u',
                    'field',
                    new List<Object>{
                        new Map<String, Object>{ 'type' => 'brandNew' }
                    }
                )
            }
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 99 }, false).isEmpty()
        );
        System.assert(
            check(spec, new Map<String, Object>(), false).isEmpty(),
            'absent + when/custom/unknown: nothing to say'
        );
    }

    @IsTest
    static void repeatSectionsAndFileQuestionsAreSkipped() {
        Map<String, Object> spec = specOf(
            new List<Object>{
                el('f', 'file', new List<Object>{ required() }),
                el('a', 'field', new List<Object>{ required() })
            }
        );
        List<FinalSubmitService.FieldError> errs = check(
            spec,
            new Map<String, Object>(),
            false
        );
        System.assertEquals(1, errs.size(), 'file skipped, text checked');

        Map<String, Object> repeating = specOf(
            new List<Object>{
                el('a', 'field', new List<Object>{ required() })
            },
            null,
            new Map<String, Object>{
                'repeat' => new Map<String, Object>{ 'maxEntries' => 3 }
            }
        );
        System.assert(
            check(repeating, new Map<String, Object>(), false).isEmpty()
        );
    }

    // ---------------------------------------------------------- edit (update)

    @IsTest
    static void editAbsentPassesButSentBlankFails() {
        Map<String, Object> spec = specOf(
            new List<Object>{ el('a', 'field', new List<Object>{ required() }) }
        );
        System.assert(
            check(spec, new Map<String, Object>(), true).isEmpty(),
            'absent = unchanged on an edit'
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => '' }, true).size()
        );
        System.assertEquals(
            1,
            check(spec, new Map<String, Object>{ 'a' => null }, true).size()
        );
        System.assert(
            check(spec, new Map<String, Object>{ 'a' => 'ok' }, true).isEmpty()
        );
    }

    @IsTest
    static void tolerantOfEmptyInput() {
        System.assert(check(null, null, false).isEmpty());
        System.assert(check(new Map<String, Object>(), null, false).isEmpty());
    }

    // ------------------------------------------------------------ end to end

    private static Map<String, Object> formSpec() {
        Map<String, Object> last = el(
            'el_ln',
            'field',
            new List<Object>{ required() }
        );
        last.put(
            'binding',
            new Map<String, Object>{
                'object' => 'Contact',
                'field' => 'LastName'
            }
        );
        Map<String, Object> spec = specOf(new List<Object>{ last });
        spec.put(
            'form',
            new Map<String, Object>{ 'targetObject' => 'Contact' }
        );
        return spec;
    }

    @IsTest
    static void formPathRefusesBeforeAnyWriteThenSavesWhenValid() {
        Map<String, Object> spec = formSpec();
        FinalSubmitService.SubmitOutcome bad = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>(),
                'meta' => new Map<String, Object>()
            },
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertEquals(null, bad.recordId);
        System.assertEquals(1, bad.errors.size());
        System.assertEquals('LastName', bad.errors[0].fields[0]);
        System.assertEquals(0, [SELECT COUNT() FROM Contact]);

        FinalSubmitService.SubmitOutcome ok = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Validated' },
                'meta' => new Map<String, Object>()
            },
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertNotEquals(null, ok.recordId);
        System.assertEquals(1, [SELECT COUNT() FROM Contact]);
    }

    @IsTest
    static void formPathEditTreatsAbsentAsUnchanged() {
        Contact c = new Contact(LastName = 'Original');
        insert c;
        Map<String, Object> spec = formSpec();
        FinalSubmitService.SubmitOutcome absent = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>(),
                'meta' => new Map<String, Object>{ 'existingRecordId' => c.Id }
            },
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertEquals(null, absent.errors, 'absent passes on an edit');

        FinalSubmitService.SubmitOutcome blank = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => '' },
                'meta' => new Map<String, Object>{ 'existingRecordId' => c.Id }
            },
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertEquals(1, blank.errors.size(), 'sent blank is refused');
        System.assertEquals(
            'Original',
            [SELECT LastName FROM Contact WHERE Id = :c.Id].LastName
        );
    }

    private static Form_Version__c makeVersion(
        String formType,
        Map<String, Object> spec
    ) {
        Form__c form = new Form__c(
            Name = 'V ' + formType,
            Form_Type__c = formType
        );
        insert form;
        Map<String, Object> f = new Map<String, Object>{
            'id' => form.Id,
            'type' => formType.toLowerCase()
        };
        spec.put('form', f);
        Form_Version__c v = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec),
            Engine_Version__c = 1
        );
        insert v;
        return v;
    }

    private static Map<String, Object> nameSpec() {
        return specOf(
            new List<Object>{
                el('el_name', 'field', new List<Object>{ required() })
            }
        );
    }

    @IsTest
    static void surveyPathRefusesBeforeAnyWriteThenSavesWhenValid() {
        Map<String, Object> spec = nameSpec();
        Form_Version__c v = makeVersion('Survey', spec);
        FinalSubmitService.SubmitOutcome bad = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>(),
                'meta' => new Map<String, Object>()
            },
            v.Id,
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertEquals(1, bad.errors.size());
        System.assertEquals('Label el_name', bad.errors[0].fields[0]);
        System.assertEquals(0, [SELECT COUNT() FROM Form_Response__c]);

        FinalSubmitService.SubmitOutcome ok = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_name' => 'Pat' },
                'meta' => new Map<String, Object>()
            },
            v.Id,
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertNotEquals(null, ok.recordId);
        System.assertEquals(1, [SELECT COUNT() FROM Form_Response__c]);
    }

    @IsTest
    static void freeformPathRefusesBeforeAnyWriteThenSavesWhenValid() {
        Map<String, Object> spec = nameSpec();
        Form_Version__c v = makeVersion('Freeform', spec);
        FinalSubmitService.SubmitOutcome bad = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>(),
                'meta' => new Map<String, Object>{ 'submissionKey' => 'k-bad' }
            },
            v.Id,
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertEquals(1, bad.errors.size());
        System.assertEquals(0, [SELECT COUNT() FROM Form_Submission__c]);

        FinalSubmitService.SubmitOutcome ok = FinalSubmitService.run(
            spec,
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_name' => 'Pat' },
                'meta' => new Map<String, Object>{ 'submissionKey' => 'k-ok' }
            },
            v.Id,
            FinalSubmitService.Posture.INTERNAL
        );
        System.assertNotEquals(null, ok.recordId);
        System.assertEquals(1, [SELECT COUNT() FROM Form_Submission__c]);
    }

    // ------------------------------------------------------------ address

    private static Map<String, Object> addressEl(List<Object> validation) {
        Map<String, Object> e = el('addr', 'field', validation);
        e.put('config', new Map<String, Object>{ 'inputType' => 'address' });
        return e;
    }

    private static List<FinalSubmitService.FieldError> checkAddress(
        List<Object> validation,
        Object value
    ) {
        return check(
            specOf(new List<Object>{ addressEl(validation) }),
            new Map<String, Object>{ 'addr' => value },
            false
        );
    }

    @IsTest
    static void requiredBlankAddressGetsTheGenericMessage() {
        List<Object> rules = new List<Object>{ required() };
        for (
            Object blank : new List<Object>{
                null,
                new Map<String, Object>(),
                new Map<String, Object>{ 'street' => '  ', 'city' => '' }
            }
        ) {
            List<FinalSubmitService.FieldError> errs = checkAddress(
                rules,
                blank
            );
            Assert.areEqual(1, errs.size());
            Assert.areEqual(
                FinalAnswerValidator.DEFAULT_MESSAGE,
                errs[0].message
            );
        }
    }

    @IsTest
    static void requiredAddressNamesTheFirstMissingPart() {
        List<Object> rules = new List<Object>{ required() };
        List<FinalSubmitService.FieldError> noCity = checkAddress(
            rules,
            new Map<String, Object>{
                'street' => '1 Main St',
                'country' => 'Canada'
            }
        );
        Assert.areEqual(1, noCity.size());
        Assert.areEqual('City is required.', noCity[0].message);

        List<FinalSubmitService.FieldError> noStreet = checkAddress(
            rules,
            new Map<String, Object>{ 'city' => 'Ottawa' }
        );
        Assert.areEqual('Street is required.', noStreet[0].message);

        List<FinalSubmitService.FieldError> noCountry = checkAddress(
            rules,
            new Map<String, Object>{ 'street' => '1 Main', 'city' => 'Ottawa' }
        );
        Assert.areEqual('Country is required.', noCountry[0].message);
    }

    @IsTest
    static void completeAddressPasses() {
        Assert.areEqual(
            0,
            checkAddress(
                    new List<Object>{ required() },
                    new Map<String, Object>{
                        'street' => '1 Main St',
                        'city' => 'Ottawa',
                        'country' => 'Canada'
                    }
                )
                .size(),
            'province and zip are optional'
        );
    }

    @IsTest
    static void optionalAddressAndPatternEntriesAreSkipped() {
        // no required entry: a partly filled address is fine
        Assert.areEqual(
            0,
            checkAddress(
                    new List<Object>(),
                    new Map<String, Object>{ 'city' => 'Ottawa' }
                )
                .size()
        );
        // pattern / range never apply to an address
        List<Object> rules = new List<Object>{
            new Map<String, Object>{
                'type' => 'pattern',
                'pattern' => '^zzz$'
            },
            new Map<String, Object>{ 'type' => 'range', 'min' => 1000 }
        };
        Assert.areEqual(
            0,
            checkAddress(
                    rules,
                    new Map<String, Object>{
                        'street' => '1 Main St',
                        'city' => 'Ottawa',
                        'country' => 'Canada'
                    }
                )
                .size()
        );
    }
}
