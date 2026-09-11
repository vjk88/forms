/**
 * Tests for FinalLookupPolicy (IMPL_PLAN_DEPENDENT_LOOKUP §10).
 *
 * Fixture note. The plan's example is Account then Contact; this org carries an
 * always-firing Account validation rule, so any test that inserts an Account
 * fails for reasons that have nothing to do with lookups. The dependency here
 * is the same shape without that landmine: **pick a manager, then pick one of
 * their reports** — `Case.ContactId` supplies the Contact target and
 * `Contact.ReportsToId` is the dependent criterion.
 *
 * A second landmine worth recording, because it cost real time: this org has
 * PHANTOM FIELDS that the Apex compiler accepts but that do not exist at
 * runtime — describe omits them and SOQL refuses them. Both
 * `Job_Application__c.Related_Contact__c` (a field file sitting untracked in the
 * repo, never deployed) and the standard `Contact.HasOptedOutOfEmail` behave
 * this way here. A class that references one still deploys, and only fails when
 * the query runs. Every field these tests touch was checked against RUNTIME
 * describe first, not against the compiler and not against the repo.
 */
@isTest
private class FinalLookupPolicyTest {
    private static final String SRC = 'el_manager';
    private static final String DEP = 'el_report';

    // =================================================================
    // Spec builders
    // =================================================================

    private static Map<String, Object> element(
        String id,
        String objectName,
        String fieldName,
        String inputType
    ) {
        return new Map<String, Object>{
            'id' => id,
            'type' => 'field',
            'binding' => new Map<String, Object>{
                'object' => objectName,
                'field' => fieldName
            },
            'config' => new Map<String, Object>{ 'inputType' => inputType }
        };
    }

    private static Map<String, Object> answerCriterion(
        String critId,
        String fieldPath,
        String operator,
        String sourceElementId
    ) {
        return new Map<String, Object>{
            'id' => critId,
            'fieldPath' => fieldPath,
            'operator' => operator,
            'value' => new Map<String, Object>{
                'kind' => 'answer',
                'elementId' => sourceElementId
            }
        };
    }

    private static Map<String, Object> constantCriterion(
        String critId,
        String fieldPath,
        String operator,
        Object constant
    ) {
        return new Map<String, Object>{
            'id' => critId,
            'fieldPath' => fieldPath,
            'operator' => operator,
            'value' => new Map<String, Object>{
                'kind' => 'constant',
                'value' => constant
            }
        };
    }

    private static Map<String, Object> lookupConfig(
        Object version,
        String mode,
        List<Object> criteria
    ) {
        return new Map<String, Object>{
            'version' => version,
            'filter' => new Map<String, Object>{
                'mode' => mode,
                'criteria' => criteria
            }
        };
    }

    private static Map<String, Object> buildSpec(List<Object> sections) {
        return new Map<String, Object>{
            'specVersion' => 1,
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => sections
                }
            }
        };
    }

    /** Manager then report, both Contact lookups off a Case. */
    private static Map<String, Object> specWith(
        Map<String, Object> dependentLookupConfig,
        Boolean sourceInRepeater
    ) {
        Map<String, Object> manager = element(
            SRC,
            'Case',
            'ContactId',
            'reference'
        );
        Map<String, Object> report = element(
            DEP,
            'Case',
            'ContactId',
            'reference'
        );
        if (dependentLookupConfig != null) {
            report.put('lookupConfig', dependentLookupConfig);
        }

        Map<String, Object> sourceSection = new Map<String, Object>{
            'id' => 'sec_source',
            'elements' => new List<Object>{ manager }
        };
        if (sourceInRepeater) {
            sourceSection.put(
                'repeat',
                new Map<String, Object>{ 'childObject' => 'Work_History__c' }
            );
        }

        return buildSpec(
            new List<Object>{
                sourceSection,
                new Map<String, Object>{
                    'id' => 'sec_plain',
                    'elements' => new List<Object>{ report }
                }
            }
        );
    }

    private static Map<String, Object> validSpec() {
        return specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
                }
            ),
            false
        );
    }

    /** Adds an extra element to the first section of a built spec. */
    private static void addElement(
        Map<String, Object> spec,
        Map<String, Object> el
    ) {
        List<Object> sections = (List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                'pages'
            ))[0])
            .get('sections');
        List<Object> elements = (List<Object>) ((Map<String, Object>) sections[0])
            .get('elements');
        elements.add(el);
    }

    private static Set<String> codesOf(
        List<FinalLookupPolicy.Diagnostic> diagnostics
    ) {
        Set<String> codes = new Set<String>();
        for (FinalLookupPolicy.Diagnostic d : diagnostics) {
            codes.add(d.code);
        }
        return codes;
    }

    // =================================================================
    // Authoring validation
    // =================================================================

    @isTest
    static void acceptsAWellFormedDependentFilter() {
        List<FinalLookupPolicy.Diagnostic> diagnostics = FinalLookupPolicy.validate(
            validSpec()
        );
        System.assertEquals(
            new List<String>(),
            new List<String>(codesOf(diagnostics)),
            'A valid dependent filter should raise nothing.'
        );
    }

    @isTest
    static void ignoresElementsWithNoLookupConfig() {
        System.assert(
            FinalLookupPolicy.validate(specWith(null, false)).isEmpty(),
            'An unfiltered lookup is the existing behaviour, not a problem.'
        );
    }

    @isTest
    static void rejectsAConfigVersionThisBuildDoesNotKnow() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                99,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_VERSION'),
            'An unknown filter version must be refused, never guessed at.'
        );
    }

    @isTest
    static void rejectsAFieldThatDoesNotExist() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'Not_A_Field__c', 'eq', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('UNKNOWN_FIELD')
        );
    }

    @isTest
    static void rejectsRelationshipTraversal() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'Account.Name', 'eq', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('RELATIONSHIP_NOT_SUPPORTED'),
            'v1 filters direct fields only.'
        );
    }

    @isTest
    static void rejectsAnOperatorTheFieldTypeCannotUse() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'gt', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_OPERATOR'),
            'Greater-than is meaningless against a lookup field.'
        );
    }

    @isTest
    static void rejectsADeferredFieldType() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'Birthdate', 'eq', '1990-01-01')
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_FIELD_TYPE'),
            'Dates are deferred in v1 and must be refused, not half-supported.'
        );
    }

    @isTest
    static void rejectsASourceThatIsNotOnTheForm() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', 'el_deleted')
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('MISSING_SOURCE_ELEMENT')
        );
    }

    @isTest
    static void rejectsASourceInsideARepeatingGroup() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
                }
            ),
            true
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('SOURCE_IN_REPEATER'),
            'A repeated answer has no single value to filter by.'
        );
    }

    @isTest
    static void rejectsALookupThatFiltersItselfByItsOwnAnswer() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', DEP)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('SELF_REFERENCE')
        );
    }

    @isTest
    static void rejectsAnAnswerThatCannotStandInForTheField() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', 'el_text')
                }
            ),
            false
        );
        addElement(spec, element('el_text', 'Case', 'Subject', 'text'));

        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('SOURCE_TYPE_MISMATCH'),
            'A line of text is not a Contact.'
        );
    }

    @isTest
    static void rejectsALookupSourcePointingAtTheWrongObject() {
        // AccountId is a Contact lookup filtered by an ACCOUNT id; supplying a
        // Contact id would compile into a query that can never match.
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'AccountId', 'eq', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('SOURCE_TYPE_MISMATCH'),
            'A Contact answer cannot fill an Account criterion.'
        );
    }

    @isTest
    static void rejectsMoreCriteriaThanV1Allows() {
        List<Object> criteria = new List<Object>();
        for (Integer i = 0; i <= FinalLookupPolicy.MAX_CRITERIA; i++) {
            criteria.add(answerCriterion('lc_' + i, 'ReportsToId', 'eq', SRC));
        }
        System.assert(
            codesOf(
                    FinalLookupPolicy.validate(
                        specWith(lookupConfig(1, 'all', criteria), false)
                    )
                )
                .contains('TOO_MANY_CRITERIA')
        );
    }

    @isTest
    static void rejectsAnUnsupportedCombineMode() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'custom',
                new List<Object>{
                    answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_MODE'),
            'There is no custom filter logic in v1.'
        );
    }

    @isTest
    static void rejectsADisplayFieldThatDoesNotExist() {
        Map<String, Object> cfg = lookupConfig(
            1,
            'all',
            new List<Object>{
                answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
            }
        );
        cfg.put(
            'displayInfo',
            new Map<String, Object>{
                'primaryField' => 'Name',
                'additionalFields' => new List<Object>{ 'Not_A_Field__c' }
            }
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(specWith(cfg, false)))
                .contains('UNKNOWN_DISPLAY_FIELD')
        );
    }

    @isTest
    static void rejectsASearchFieldThatIsNotText() {
        // Search eligibility is narrower than filter eligibility: a date is a
        // legal condition field on some types but never a legal search field.
        Map<String, Object> cfg = lookupConfig(
            1,
            'all',
            new List<Object>{
                answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
            }
        );
        cfg.put(
            'matchingInfo',
            new Map<String, Object>{
                'primaryField' => new Map<String, Object>{
                    'fieldPath' => 'Birthdate'
                }
            }
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(specWith(cfg, false)))
                .contains('UNSUPPORTED_SEARCH_FIELD')
        );
    }

    @isTest
    static void acceptsATextSearchField() {
        Map<String, Object> cfg = lookupConfig(
            1,
            'all',
            new List<Object>{
                answerCriterion('lc_1', 'ReportsToId', 'eq', SRC)
            }
        );
        cfg.put(
            'matchingInfo',
            new Map<String, Object>{
                'primaryField' => new Map<String, Object>{
                    'fieldPath' => 'Name',
                    'mode' => 'startsWith'
                }
            }
        );
        System.assert(
            FinalLookupPolicy.validate(specWith(cfg, false)).isEmpty(),
            'Searching on the name field is the ordinary case.'
        );
    }

    @isTest
    static void rejectsTwoLookupsThatDependOnEachOther() {
        Map<String, Object> a = element(
            'el_a',
            'Case',
            'ContactId',
            'reference'
        );
        Map<String, Object> b = element(
            'el_b',
            'Case',
            'ContactId',
            'reference'
        );
        a.put(
            'lookupConfig',
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_a', 'ReportsToId', 'eq', 'el_b')
                }
            )
        );
        b.put(
            'lookupConfig',
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_b', 'ReportsToId', 'eq', 'el_a')
                }
            )
        );
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{ a, b }
                }
            }
        );

        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('DEPENDENCY_CYCLE'),
            'Neither lookup could ever be filled in, so publishing must stop.'
        );
    }

    @isTest
    static void publishGateThrowsRatherThanReturningDiagnostics() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'Not_A_Field__c', 'eq', SRC)
                }
            ),
            false
        );
        Boolean threw = false;
        try {
            FinalLookupPolicy.validateForPublish(null, spec);
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'Publishing an invalid filter must be refused.');
    }

    // =================================================================
    // Selection verification against real records
    // =================================================================

    private static Map<String, Object> submission(Id managerId, Id selectedId) {
        Map<String, Object> answers = new Map<String, Object>();
        if (managerId != null) {
            answers.put(SRC, String.valueOf(managerId));
        }
        if (selectedId != null) {
            answers.put(DEP, String.valueOf(selectedId));
        }
        return answers;
    }

    /** A manager, one of their reports, and somebody else's report. */
    private static List<Contact> team() {
        Contact boss = new Contact(LastName = 'Boss');
        Contact rival = new Contact(LastName = 'Rival Boss');
        insert new List<Contact>{ boss, rival };
        Contact mine = new Contact(
            LastName = 'My Report',
            ReportsToId = boss.Id
        );
        Contact theirs = new Contact(
            LastName = 'Their Report',
            ReportsToId = rival.Id
        );
        insert new List<Contact>{ mine, theirs };
        return new List<Contact>{ boss, mine, theirs };
    }

    @isTest
    static void acceptsASelectionThatSatisfiesTheFilter() {
        List<Contact> t = team();

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            submission(t[0].Id, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            verdicts.get(DEP),
            'That contact really does report to the chosen manager.'
        );
    }

    @isTest
    static void refusesASelectionThatFailsTheFilter() {
        List<Contact> t = team();

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            // Claims one manager, submits the other manager's report.
            submission(t[0].Id, t[2].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SELECTION_UNAVAILABLE,
            verdicts.get(DEP),
            'A tampered selection must not survive the server check.'
        );
    }

    @isTest
    static void refusesASelectionWhenTheControllingAnswerIsMissing() {
        List<Contact> t = team();

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            // The manager answer was omitted. Dropping the criterion would open
            // the filter to every contact in the org.
            submission(null, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SOURCE_REQUIRED,
            verdicts.get(DEP)
        );
    }

    @isTest
    static void refusesASelectionWhenTheControllingAnswerIsBlank() {
        List<Contact> t = team();
        Map<String, Object> answers = submission(null, t[1].Id);
        answers.put(SRC, '');

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            answers
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SOURCE_REQUIRED,
            verdicts.get(DEP),
            'An empty string is an absence, not an answer.'
        );
    }

    @isTest
    static void acceptsAnEmptySelectionWithNoControllingAnswer() {
        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            submission(null, null)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            verdicts.get(DEP),
            'Leaving an optional lookup blank is not an offence.'
        );
    }

    @isTest
    static void refusesAnIdBelongingToAnotherObject() {
        List<Contact> t = team();
        Case c = new Case(Subject = 'Foreign id');
        insert c;

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            validSpec(),
            // A Case id where a Contact id belongs.
            submission(t[0].Id, c.Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SELECTION_UNAVAILABLE,
            verdicts.get(DEP)
        );
    }

    @isTest
    static void refusesAnyValueUnderAConfigurationItCannotCompile() {
        List<Contact> t = team();

        // A criterion naming a field that is not there: the lookup is blocked,
        // never downgraded to an unfiltered search.
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'Not_A_Field__c', 'eq', SRC)
                }
            ),
            false
        );

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            spec,
            submission(t[0].Id, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_CONFIG_UNAVAILABLE,
            verdicts.get(DEP)
        );
    }

    @isTest
    static void treatsAnExplicitNullConstantAsARealCondition() {
        List<Contact> t = team();

        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'ReportsToId', 'eq', null)
                }
            ),
            false
        );

        Test.startTest();
        Map<String, String> theBoss = FinalLookupPolicy.verifySelections(
            spec,
            submission(null, t[0].Id)
        );
        Map<String, String> aReport = FinalLookupPolicy.verifySelections(
            spec,
            submission(null, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            theBoss.get(DEP),
            'Filtering for "reports to nobody" is a real filter, and the boss qualifies.'
        );
        System.assertEquals(
            FinalLookupPolicy.CODE_SELECTION_UNAVAILABLE,
            aReport.get(DEP),
            'Somebody who does report to a manager must fail that same filter.'
        );
    }

    @isTest
    static void keepsZeroAsAnAnswerRatherThanAnAbsence() {
        Job_Application__c zeroSalary = new Job_Application__c(
            Desired_Salary__c = 0
        );
        insert zeroSalary;

        Map<String, Object> dependent = element(
            DEP,
            'Work_History__c',
            'Job_Application__c',
            'reference'
        );
        dependent.put(
            'lookupConfig',
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'Desired_Salary__c', 'eq', 'el_num')
                }
            )
        );
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{
                        element(
                            'el_num',
                            'Job_Application__c',
                            'Desired_Salary__c',
                            'number'
                        ),
                        dependent
                    }
                }
            }
        );

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            spec,
            new Map<String, Object>{
                'el_num' => 0,
                DEP => String.valueOf(zeroSalary.Id)
            }
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            verdicts.get(DEP),
            'Zero is an answer. Treating it as unanswered would disable the lookup.'
        );
    }

    @isTest
    static void checksEverySelectionWithoutRunningOutOfQueries() {
        List<Contact> t = team();
        List<Contact> reports = new List<Contact>();
        for (Integer i = 0; i < 10; i++) {
            reports.add(
                new Contact(LastName = 'Report ' + i, ReportsToId = t[0].Id)
            );
        }
        insert reports;

        List<Object> elements = new List<Object>{
            element(SRC, 'Case', 'ContactId', 'reference')
        };
        Map<String, Object> answers = new Map<String, Object>{
            SRC => String.valueOf(t[0].Id)
        };
        for (Integer i = 0; i < 10; i++) {
            Map<String, Object> el = element(
                'el_dep_' + i,
                'Case',
                'ContactId',
                'reference'
            );
            el.put(
                'lookupConfig',
                lookupConfig(
                    1,
                    'all',
                    new List<Object>{
                        answerCriterion('lc_' + i, 'ReportsToId', 'eq', SRC)
                    }
                )
            );
            elements.add(el);
            answers.put('el_dep_' + i, String.valueOf(reports[i].Id));
        }
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => elements
                }
            }
        );

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            spec,
            answers
        );
        Integer queries = Limits.getQueries();
        Test.stopTest();

        for (Integer i = 0; i < 10; i++) {
            System.assertEquals(
                FinalLookupPolicy.CODE_OK,
                verdicts.get('el_dep_' + i),
                'Every legitimate selection should pass.'
            );
        }
        System.assert(
            queries < Limits.getLimitQueries(),
            'Selection checking must stay well inside the query limit; used ' +
            queries
        );
    }

    @isTest
    static void combinesSeveralConditionsWithAnyAndAll() {
        List<Contact> t = team();

        List<Object> two = new List<Object>{
            answerCriterion('lc_1', 'ReportsToId', 'eq', SRC),
            constantCriterion('lc_2', 'LastName', 'eq', 'Nobody At All')
        };

        Test.startTest();
        Map<String, String> underAll = FinalLookupPolicy.verifySelections(
            specWith(lookupConfig(1, 'all', two), false),
            submission(t[0].Id, t[1].Id)
        );
        Map<String, String> underAny = FinalLookupPolicy.verifySelections(
            specWith(lookupConfig(1, 'any', two), false),
            submission(t[0].Id, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SELECTION_UNAVAILABLE,
            underAll.get(DEP),
            'Under all, failing the second condition is enough to fail.'
        );
        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            underAny.get(DEP),
            'Under any, satisfying the first condition is enough to pass.'
        );
    }

    @isTest
    static void disablesTheWholeLookupUnderAnyWhenASourceIsMissing() {
        List<Contact> t = team();

        List<Object> two = new List<Object>{
            answerCriterion('lc_1', 'ReportsToId', 'eq', SRC),
            constantCriterion('lc_2', 'LastName', 'eq', 'My Report')
        };

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            specWith(lookupConfig(1, 'any', two), false),
            // No manager chosen. The constant condition alone WOULD match, and
            // that is exactly the quiet widening this rule exists to stop.
            submission(null, t[1].Id)
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SOURCE_REQUIRED,
            verdicts.get(DEP),
            'A missing source disables the lookup even under any.'
        );
    }

    // =================================================================
    // Malformed authoring input
    // =================================================================

    @isTest
    static void rejectsAConditionWithNoField() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{ answerCriterion('lc_1', null, 'eq', SRC) }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('MISSING_FIELD')
        );
    }

    @isTest
    static void rejectsAConditionWithNothingToCompareAgainst() {
        Map<String, Object> crit = new Map<String, Object>{
            'id' => 'lc_1',
            'fieldPath' => 'ReportsToId',
            'operator' => 'eq'
        };
        Map<String, Object> spec = specWith(
            lookupConfig(1, 'all', new List<Object>{ crit }),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('MISSING_VALUE')
        );
    }

    @isTest
    static void rejectsAFixedValueThatWasNeverFilledIn() {
        // The key is absent, which is a different thing from an explicit null.
        Map<String, Object> crit = new Map<String, Object>{
            'id' => 'lc_1',
            'fieldPath' => 'ReportsToId',
            'operator' => 'eq',
            'value' => new Map<String, Object>{ 'kind' => 'constant' }
        };
        Map<String, Object> spec = specWith(
            lookupConfig(1, 'all', new List<Object>{ crit }),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('MISSING_VALUE')
        );
    }

    @isTest
    static void rejectsAValueKindItDoesNotRecognize() {
        Map<String, Object> crit = new Map<String, Object>{
            'id' => 'lc_1',
            'fieldPath' => 'ReportsToId',
            'operator' => 'eq',
            'value' => new Map<String, Object>{
                'kind' => 'formula',
                'expression' => 'current user account'
            }
        };
        Map<String, Object> spec = specWith(
            lookupConfig(1, 'all', new List<Object>{ crit }),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_VALUE_KIND'),
            'There are no formula sources in v1.'
        );
    }

    @isTest
    static void rejectsAnAnswerSourceWithNoQuestionChosen() {
        Map<String, Object> crit = new Map<String, Object>{
            'id' => 'lc_1',
            'fieldPath' => 'ReportsToId',
            'operator' => 'eq',
            'value' => new Map<String, Object>{ 'kind' => 'answer' }
        };
        Map<String, Object> spec = specWith(
            lookupConfig(1, 'all', new List<Object>{ crit }),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec)).contains('MISSING_SOURCE')
        );
    }

    private static Map<String, Object> jobApplicationLookup(
        Map<String, Object> cfg
    ) {
        Map<String, Object> dependent = element(
            DEP,
            'Work_History__c',
            'Job_Application__c',
            'reference'
        );
        dependent.put('lookupConfig', cfg);
        return buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{ dependent }
                }
            }
        );
    }

    @isTest
    static void rejectsAFixedValueOfTheWrongShape() {
        Map<String, Object> spec = jobApplicationLookup(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion(
                        'lc_1',
                        'Desired_Salary__c',
                        'gte',
                        'not a number'
                    )
                }
            )
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('VALUE_TYPE_MISMATCH')
        );
    }

    @isTest
    static void rejectsAFixedIdThatPointsAtTheWrongObject() {
        Map<String, Object> spec = specWith(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion(
                        'lc_1',
                        'ReportsToId',
                        'eq',
                        String.valueOf(UserInfo.getUserId())
                    )
                }
            ),
            false
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('VALUE_TYPE_MISMATCH'),
            'A User id is not a Contact id.'
        );
    }

    @isTest
    static void acceptsNumericComparisonsBeyondEquality() {
        Map<String, Object> spec = jobApplicationLookup(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'Desired_Salary__c', 'gte', 1000),
                    constantCriterion('lc_2', 'Desired_Salary__c', 'lt', 200000)
                }
            )
        );
        System.assert(
            FinalLookupPolicy.validate(spec).isEmpty(),
            'Ranges are legal on numbers.'
        );
    }

    @isTest
    static void appliesANumericRangeAtSubmission() {
        Job_Application__c cheap = new Job_Application__c(
            Desired_Salary__c = 500
        );
        Job_Application__c dear = new Job_Application__c(
            Desired_Salary__c = 50000
        );
        insert new List<Job_Application__c>{ cheap, dear };

        Map<String, Object> spec = jobApplicationLookup(
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'Desired_Salary__c', 'gte', 1000)
                }
            )
        );

        Test.startTest();
        Map<String, String> tooCheap = FinalLookupPolicy.verifySelections(
            spec,
            new Map<String, Object>{ DEP => String.valueOf(cheap.Id) }
        );
        Map<String, String> inRange = FinalLookupPolicy.verifySelections(
            spec,
            new Map<String, Object>{ DEP => String.valueOf(dear.Id) }
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_SELECTION_UNAVAILABLE,
            tooCheap.get(DEP)
        );
        System.assertEquals(FinalLookupPolicy.CODE_OK, inRange.get(DEP));
    }

    @isTest
    static void keepsFalseAsAnAnswerRatherThanAnAbsence() {
        // IsEmailBounced is not settable, but it defaults to false, which is
        // exactly the value under test. HasOptedOutOfEmail would read better
        // and is one of this org's phantom fields — see the class header.
        Contact reachable = new Contact(LastName = 'Reachable');
        insert reachable;

        Map<String, Object> dependent = element(
            DEP,
            'Case',
            'ContactId',
            'reference'
        );
        dependent.put(
            'lookupConfig',
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    answerCriterion('lc_1', 'IsEmailBounced', 'eq', 'el_flag')
                }
            )
        );
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{
                        element(
                            'el_flag',
                            'Contact',
                            'IsEmailBounced',
                            'checkbox'
                        ),
                        dependent
                    }
                }
            }
        );

        Test.startTest();
        Map<String, String> verdicts = FinalLookupPolicy.verifySelections(
            spec,
            new Map<String, Object>{
                'el_flag' => false,
                DEP => String.valueOf(reachable.Id)
            }
        );
        Test.stopTest();

        System.assertEquals(
            FinalLookupPolicy.CODE_OK,
            verdicts.get(DEP),
            'False is an answer. Reading it as unanswered would disable the lookup.'
        );
    }

    @isTest
    static void rejectsMoreFilteredLookupsThanV1Allows() {
        List<Object> elements = new List<Object>{
            element(SRC, 'Case', 'ContactId', 'reference')
        };
        for (Integer i = 0; i <= FinalLookupPolicy.MAX_FILTERED_LOOKUPS; i++) {
            Map<String, Object> el = element(
                'el_dep_' + i,
                'Case',
                'ContactId',
                'reference'
            );
            el.put(
                'lookupConfig',
                lookupConfig(
                    1,
                    'all',
                    new List<Object>{
                        answerCriterion('lc_' + i, 'ReportsToId', 'eq', SRC)
                    }
                )
            );
            elements.add(el);
        }
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => elements
                }
            }
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('TOO_MANY_LOOKUPS')
        );
    }

    @isTest
    static void rejectsAFilterOnAnElementBoundToNothing() {
        Map<String, Object> orphan = new Map<String, Object>{
            'id' => DEP,
            'type' => 'field',
            'config' => new Map<String, Object>{ 'inputType' => 'reference' },
            'lookupConfig' => lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'ReportsToId', 'eq', null)
                }
            )
        };
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{ orphan }
                }
            }
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNRESOLVED_BINDING')
        );
    }

    @isTest
    static void rejectsAFilterOnAPolymorphicLookup() {
        // Case.OwnerId can be a User or a Queue. There is no single object to
        // filter against, so v1 refuses it rather than picking one.
        Map<String, Object> el = element(DEP, 'Case', 'OwnerId', 'reference');
        el.put(
            'lookupConfig',
            lookupConfig(
                1,
                'all',
                new List<Object>{
                    constantCriterion('lc_1', 'Name', 'eq', 'anyone')
                }
            )
        );
        Map<String, Object> spec = buildSpec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{ el }
                }
            }
        );
        System.assert(
            codesOf(FinalLookupPolicy.validate(spec))
                .contains('UNSUPPORTED_REFERENCE')
        );
    }

    @isTest
    static void survivesASpecWithNothingInIt() {
        System.assert(
            FinalLookupPolicy.validate(new Map<String, Object>()).isEmpty()
        );
        System.assert(FinalLookupPolicy.validate(null).isEmpty());
        System.assert(FinalLookupPolicy.verifySelections(null, null).isEmpty());
    }
}
