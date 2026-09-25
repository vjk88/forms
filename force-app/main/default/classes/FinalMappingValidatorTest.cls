/**
 * Publish refuses what cannot run and warns about what can hurt
 * (FREEFORM_F2_MAPPING_SPEC section 7). Spec tests 9, 10 and 17 live here
 * in validator form; FinalSpecControllerTest proves publishSpec calls it.
 */
@IsTest
private class FinalMappingValidatorTest {
    private static List<FinalMappingValidator.Diagnostic> check(
        List<Object> actions
    ) {
        return FinalMappingValidator.validate(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                actions
            ),
            null
        );
    }

    private static List<String> blockers(
        List<FinalMappingValidator.Diagnostic> found
    ) {
        List<String> out = new List<String>();
        for (FinalMappingValidator.Diagnostic d : found) {
            if (d.severity == 'blocker') {
                out.add(d.message);
            }
        }
        return out;
    }

    private static Boolean anyContains(List<String> messages, String fragment) {
        for (String m : messages) {
            if (m.contains(fragment)) {
                return true;
            }
        }
        return false;
    }

    @IsTest
    static void aCleanMappingHasNoBlockers() {
        List<String> found = blockers(
            check(
                new List<Object>{
                    FinalMappingTestData.createContact('act_a'),
                    FinalMappingTestData.findOrCreateContact('act_b', 'reuse')
                }
            )
        );
        Assert.areEqual(new List<String>(), found);
    }

    @IsTest
    static void anUnansweredMatchQuestionBlocks() {
        List<String> found = blockers(
            check(
                new List<Object>{
                    FinalMappingTestData.findOrCreateContact('act_a', null)
                }
            )
        );
        Assert.isTrue(
            anyContains(
                found,
                'choose what happens when a matching record is found'
            ),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void elevenStepsBlock() {
        List<Object> actions = new List<Object>();
        for (Integer i = 0; i < 11; i++) {
            actions.add(FinalMappingTestData.createContact('act_' + i));
        }
        Assert.isTrue(anyContains(blockers(check(actions)), 'at most 10'));
    }

    @IsTest
    static void aSetupObjectBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        action.put('object', 'User');
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'together with ordinary records'
            )
        );
    }

    @IsTest
    static void aFieldThatCanPointAtSeveralKindsOfRecordBlocks() {
        // A Task is fine; its Related To is not (D48).
        Map<String, Object> action = new Map<String, Object>{
            'id' => 'act_a',
            'object' => 'Task',
            'operation' => 'create',
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'Subject',
                    FinalMappingTestData.literal('Follow up')
                ),
                FinalMappingTestData.field(
                    'WhatId',
                    FinalMappingTestData.ref('action:act_x')
                )
            }
        };
        List<String> found = blockers(check(new List<Object>{ action }));
        Assert.isTrue(
            anyContains(found, 'more than one kind of record'),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void aMissingFilterBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) action.get('match')).remove('filter');
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'needs a filter'
            )
        );
    }

    @IsTest
    static void currentUserInAFilterBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) action.get('match'))
            .put(
                'filter',
                new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{
                        new Map<String, Object>{
                            'fieldPath' => 'OwnerId',
                            'operator' => 'eq',
                            'value' => '$User.Id'
                        }
                    }
                }
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'current user'
            )
        );
    }

    @IsTest
    static void aReferenceToALaterStepBlocks() {
        Map<String, Object> first = FinalMappingTestData.createContact('act_a');
        ((List<Object>) first.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('action:act_b')
                )
            );
        List<String> found = blockers(
            check(
                new List<Object>{
                    first,
                    FinalMappingTestData.createContact('act_b')
                }
            )
        );
        Assert.isTrue(anyContains(found, 'comes later or no longer exists'));
    }

    @IsTest
    static void aLinkReferenceBlocksInF2() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('link')
                )
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'personalized-link'
            )
        );
    }

    @IsTest
    static void anIncompatibleAnswerBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'Birthdate',
                    FinalMappingTestData.answer('el_title')
                )
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'can’t go into'
            )
        );
    }

    @IsTest
    static void aRequiredFieldWithNoSourceBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        action.put(
            'fields',
            new List<Object>{
                FinalMappingTestData.field(
                    'Email',
                    FinalMappingTestData.answer('el_email')
                )
            }
        );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'Last Name empty'
            )
        );
    }

    @IsTest
    static void overwritingTheMatchFieldBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'update'
        );
        for (Object o : (List<Object>) action.get('fields')) {
            Map<String, Object> f = (Map<String, Object>) o;
            if (f.get('field') == 'Email') {
                f.put('writeOnMatch', true);
            }
        }
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'the field used to find the record'
            )
        );
    }

    @IsTest
    static void anOptionalSourceForARequiredFieldWarns() {
        Map<String, Object> optional = FinalMappingTestData.question(
            'el_last',
            'text',
            'Your surname'
        );
        optional.put('required', false);
        List<FinalMappingValidator.Diagnostic> found = FinalMappingValidator.validate(
            FinalMappingTestData.spec(
                new List<Object>{
                    optional,
                    FinalMappingTestData.question(
                        'el_email',
                        'email',
                        'Work email'
                    )
                },
                new List<Object>{ FinalMappingTestData.createContact('act_a') }
            ),
            null
        );
        Boolean warned = false;
        for (FinalMappingValidator.Diagnostic d : found) {
            warned |=
                d.severity == 'warning' && d.message.contains('can be skipped');
        }
        Assert.isTrue(warned, 'skipping it would fail the step');
    }

    @IsTest
    static void thePublishersOwnPermissionsDecide() {
        // Spec test 10, as the publisher: someone who cannot create Contacts
        // cannot publish a form that creates them.
        Profile minimum = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Minimum Access - Salesforce'
        ];
        User noAccess = new User(
            Alias = 'nomap',
            Email = 'nomap@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'No mapping access',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = minimum.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            Username = 'nomap' + Crypto.getRandomInteger() + '@example.com'
        );
        insert noAccess;

        List<String> found;
        System.runAs(noAccess) {
            found = blockers(
                check(
                    new List<Object>{
                        FinalMappingTestData.createContact('act_a')
                    }
                )
            );
        }
        Assert.isTrue(
            anyContains(found, 'You can’t create Contacts'),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void validateForPublishThrowsTheFirstBlocker() {
        try {
            FinalMappingValidator.validateForPublish(
                null,
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{
                        FinalMappingTestData.findOrCreateContact('act_a', null)
                    }
                )
            );
            Assert.fail('a blocker must refuse the publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().contains('matching record is found'),
                e.getMessage()
            );
        }
    }

    // ---- every refusal says why --------------------------------------
    // Each case is one broken step and a fragment of the sentence publish
    // must give for it. Fragments avoid the curly apostrophes on purpose.

    private static Map<String, Object> contact(List<Object> extraFields) {
        Map<String, Object> a = FinalMappingTestData.createContact('act_a');
        ((List<Object>) a.get('fields')).addAll(extraFields);
        return a;
    }

    private static Map<String, Object> field(
        String api,
        Map<String, Object> src
    ) {
        return FinalMappingTestData.field(api, src);
    }

    private static List<Object> questionsPlus(List<Object> extra) {
        List<Object> qs = FinalMappingTestData.standardQuestions();
        qs.addAll(extra);
        return qs;
    }

    private static void assertRefused(
        String why,
        List<Object> actions,
        String fragment
    ) {
        assertRefused(
            why,
            FinalMappingTestData.standardQuestions(),
            actions,
            fragment
        );
    }

    private static void assertRefused(
        String why,
        List<Object> questions,
        List<Object> actions,
        String fragment
    ) {
        List<String> found = blockers(
            FinalMappingValidator.validate(
                FinalMappingTestData.spec(questions, actions),
                null
            )
        );
        Assert.isTrue(
            anyContains(found, fragment),
            why +
                ' -> expected "' +
                fragment +
                '" in: ' +
                String.join(found, ' | ')
        );
    }

    @IsTest
    static void brokenStepsAreRefusedWithAReason() {
        assertRefused(
            'unreadable step',
            new List<Object>{ null },
            'is unreadable'
        );

        assertRefused(
            'two steps, one id',
            new List<Object>{
                FinalMappingTestData.createContact('act_a'),
                FinalMappingTestData.createContact('act_a')
            },
            'shares one with another step'
        );

        Map<String, Object> ghost = FinalMappingTestData.createContact('act_a');
        ghost.put('object', 'No_Such_Object__c');
        assertRefused(
            'unknown object',
            new List<Object>{ ghost },
            'names an object that'
        );

        Map<String, Object> noOp = FinalMappingTestData.createContact('act_a');
        noOp.put('operation', 'delete');
        assertRefused(
            'no operation',
            new List<Object>{ noOp },
            'has no operation'
        );

        Map<String, Object> noSearch = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        noSearch.remove('match');
        assertRefused(
            'find or create without a search',
            new List<Object>{ noSearch },
            'has no search set up'
        );

        assertRefused(
            'a field that does not exist',
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'No_Such_Field__c',
                            FinalMappingTestData.literal('x')
                        )
                    }
                )
            },
            'writes to a field that'
        );

        assertRefused(
            'the same field twice',
            new List<Object>{
                contact(
                    new List<Object>{
                        field('LastName', FinalMappingTestData.literal('again'))
                    }
                )
            },
            'twice'
        );

        assertRefused(
            'a field nobody can set',
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'CreatedDate',
                            FinalMappingTestData.literal('2020-01-01')
                        )
                    }
                )
            },
            'set Created Date on'
        );

        assertRefused(
            'an answer that is not on the form',
            new List<Object>{
                contact(
                    new List<Object>{
                        field('Title', FinalMappingTestData.answer('el_gone'))
                    }
                )
            },
            'no longer on the form'
        );

        assertRefused(
            'a fixed value in a lookup',
            new List<Object>{
                contact(
                    new List<Object>{
                        field('ReportsToId', FinalMappingTestData.literal('x'))
                    }
                )
            },
            'Point it at another record instead'
        );

        assertRefused(
            'a fixed value that does not fit',
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'Birthdate',
                            FinalMappingTestData.literal('not a date')
                        )
                    }
                )
            },
            'fit Birthdate'
        );

        assertRefused(
            'a record link into a plain field',
            new List<Object>{
                contact(
                    new List<Object>{
                        field('Title', FinalMappingTestData.ref('action:act_x'))
                    }
                )
            },
            'a lookup, so it'
        );

        assertRefused(
            'a link to a question that is gone',
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'ReportsToId',
                            FinalMappingTestData.ref('answer:el_gone')
                        )
                    }
                )
            },
            'no longer on the form'
        );

        assertRefused(
            'a link to a question that is not a lookup',
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'ReportsToId',
                            FinalMappingTestData.ref('answer:el_last')
                        )
                    }
                )
            },
            'point at the record picked in'
        );

        assertRefused(
            'a link the form cannot identify',
            new List<Object>{
                contact(
                    new List<Object>{
                        field('ReportsToId', FinalMappingTestData.ref('bogus'))
                    }
                )
            },
            'a record the form can'
        );

        assertRefused(
            'a field with no source',
            new List<Object>{
                contact(new List<Object>{ field('Title', null) })
            },
            'has no source for'
        );

        Map<String, Object> caseStep = new Map<String, Object>{
            'id' => 'act_case',
            'object' => 'Case',
            'operation' => 'create',
            'fields' => new List<Object>{
                field('Subject', FinalMappingTestData.literal('Hello'))
            }
        };
        assertRefused(
            'a lookup pointed at the wrong kind of record',
            new List<Object>{
                caseStep,
                contact(
                    new List<Object>{
                        field(
                            'ReportsToId',
                            FinalMappingTestData.ref('action:act_case')
                        )
                    }
                )
            },
            'point at a Case'
        );
    }

    @IsTest
    static void brokenSearchesAreRefusedWithAReason() {
        Map<String, Object> a = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) a.get('match')).put('field', 'No_Such_Field__c');
        assertRefused(
            'search on a missing field',
            new List<Object>{ a },
            'searches on a field that'
        );

        a = FinalMappingTestData.findOrCreateContact('act_a', 'reuse');
        ((Map<String, Object>) a.get('match')).put('field', 'Description');
        assertRefused(
            'search on a long text field',
            new List<Object>{ a },
            'search by'
        );

        a = FinalMappingTestData.findOrCreateContact('act_a', 'reuse');
        ((Map<String, Object>) a.get('match'))
            .put('source', FinalMappingTestData.answer('el_gone'));
        assertRefused(
            'search with a question that is gone',
            new List<Object>{ a },
            'searches using a question'
        );

        a = FinalMappingTestData.findOrCreateContact('act_a', 'reuse');
        ((Map<String, Object>) a.get('match'))
            .put('source', FinalMappingTestData.answer('el_last'));
        ((Map<String, Object>) a.get('match')).put('field', 'Birthdate');
        assertRefused(
            'search comparing text with a date',
            new List<Object>{ a },
            'be compared with'
        );

        a = FinalMappingTestData.findOrCreateContact('act_a', 'reuse');
        ((Map<String, Object>) a.get('match'))
            .put(
                'filter',
                new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{
                        new Map<String, Object>{
                            'fieldPath' => 'No_Such_Field__c',
                            'operator' => 'eq',
                            'value' => 'x'
                        }
                    }
                }
            );
        assertRefused(
            'a filter that will not compile',
            new List<Object>{ a },
            'filter:'
        );

        a = FinalMappingTestData.findOrCreateContact('act_a', 'reuse');
        for (Object o : (List<Object>) a.get('fields')) {
            Map<String, Object> f = (Map<String, Object>) o;
            if (f.get('field') == 'Title') {
                f.put('writeOnMatch', true);
            }
        }
        assertRefused(
            'an overwrite on a step that only reuses',
            new List<Object>{ a },
            'update found records'
        );
    }

    @IsTest
    static void questionShapesThatCannotFillAFieldAreRefused() {
        Map<String, Object> grid = new Map<String, Object>{
            'id' => 'el_grid',
            'type' => 'matrix',
            'label' => 'Rate us',
            'config' => new Map<String, Object>()
        };
        assertRefused(
            'a grid question into one field',
            questionsPlus(new List<Object>{ grid }),
            new List<Object>{
                contact(
                    new List<Object>{
                        field('Title', FinalMappingTestData.answer('el_grid'))
                    }
                )
            },
            'more than one value'
        );

        Map<String, Object> source = FinalMappingTestData.question(
            'el_src',
            'picklist',
            'How did you hear'
        );
        ((Map<String, Object>) source.get('config'))
            .put(
                'options',
                new List<Object>{
                    new Map<String, Object>{
                        'value' => 'Not_A_Real_Lead_Source',
                        'label' => 'Nope'
                    }
                }
            );
        assertRefused(
            'a choice the picklist does not have',
            questionsPlus(new List<Object>{ source }),
            new List<Object>{
                contact(
                    new List<Object>{
                        field(
                            'LeadSource',
                            FinalMappingTestData.answer('el_src')
                        )
                    }
                )
            },
            'is an option on the form but not a value'
        );
    }

    @IsTest
    static void aPublicFormThatOverwritesSaysSoOutLoud() {
        Form__c form = new Form__c(
            Name = 'Public',
            Form_Type__c = 'Freeform',
            Allowed_Adapters__c = 'Public_Guest'
        );
        insert form;
        Map<String, Object> a = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'update'
        );
        for (Object o : (List<Object>) a.get('fields')) {
            Map<String, Object> f = (Map<String, Object>) o;
            if (f.get('field') == 'Title') {
                f.put('writeOnMatch', true);
            }
        }
        Boolean warned = false;
        for (
            FinalMappingValidator.Diagnostic d : FinalMappingValidator.validate(
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{ a }
                ),
                form.Id
            )
        ) {
            warned |=
                d.severity == 'warning' &&
                d.message.contains('This form is public');
        }
        Assert.isTrue(
            warned,
            'anyone could overwrite Title on a matched Contact'
        );
    }

    // ------------------------------------------- answers in filter rows (D49)

    /** Find-or-create by email, filtered by one row that compares with an answer. */
    private static List<FinalMappingValidator.Diagnostic> checkRow(
        List<Object> questions,
        Map<String, Object> filterRow
    ) {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) action.get('match'))
            .put(
                'filter',
                new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{ filterRow }
                }
            );
        return FinalMappingValidator.validate(
            FinalMappingTestData.spec(questions, new List<Object>{ action }),
            null
        );
    }

    private static Map<String, Object> filterRow(
        String field,
        String op,
        String key
    ) {
        return new Map<String, Object>{
            'fieldPath' => field,
            'operator' => op,
            'value' => '$field.' + key
        };
    }

    private static List<Object> questionsPlus(Map<String, Object> extra) {
        List<Object> out = FinalMappingTestData.standardQuestions();
        out.add(extra);
        return out;
    }

    private static List<String> warnings(
        List<FinalMappingValidator.Diagnostic> found
    ) {
        List<String> out = new List<String>();
        for (FinalMappingValidator.Diagnostic d : found) {
            if (d.severity == 'warning') {
                out.add(d.message);
            }
        }
        return out;
    }

    @IsTest
    static void aFittingRequiredAnswerInARowIsFine() {
        List<FinalMappingValidator.Diagnostic> found = checkRow(
            FinalMappingTestData.standardQuestions(),
            filterRow('LastName', 'eq', 'el_last')
        );
        Assert.areEqual(new List<String>(), blockers(found));
        Assert.areEqual(new List<String>(), warnings(found));
    }

    @IsTest
    static void aRowAnswerThatIsGoneBlocks() {
        List<String> found = blockers(
            checkRow(
                FinalMappingTestData.standardQuestions(),
                filterRow('LastName', 'eq', 'el_gone')
            )
        );
        Assert.isTrue(
            anyContains(found, 'no longer on the form'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aSeveralValueAnswerInARowBlocks() {
        Map<String, Object> many = new Map<String, Object>{
            'id' => 'el_many',
            'type' => 'imageChoice',
            'label' => 'Pick several',
            'required' => true,
            'config' => new Map<String, Object>{ 'multiple' => true }
        };
        List<String> found = blockers(
            checkRow(questionsPlus(many), filterRow('Title', 'eq', 'el_many'))
        );
        Assert.isTrue(
            anyContains(found, 'more than one value'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aRowAnswerThatDoesNotFitTheFieldBlocks() {
        Map<String, Object> age = FinalMappingTestData.question(
            'el_age',
            'number',
            'Age'
        );
        age.put('type', 'number');
        List<String> found = blockers(
            checkRow(questionsPlus(age), filterRow('LastName', 'eq', 'el_age'))
        );
        Assert.isTrue(
            anyContains(found, 'can’t be compared with'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aRowAnswerUnderAListComparisonBlocks() {
        Map<String, Object> row = new Map<String, Object>{
            'fieldPath' => 'LastName',
            'operator' => 'in',
            'values' => new List<Object>{ '$field.el_last' }
        };
        List<String> found = blockers(
            checkRow(FinalMappingTestData.standardQuestions(), row)
        );
        Assert.isTrue(
            anyContains(found, 'with that comparison'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aSkippableRowAnswerWarns() {
        Map<String, Object> nick = FinalMappingTestData.question(
            'el_nick',
            'text',
            'Nickname'
        );
        nick.put('required', false);
        List<FinalMappingValidator.Diagnostic> found = checkRow(
            questionsPlus(nick),
            filterRow('LastName', 'eq', 'el_nick')
        );
        Assert.areEqual(new List<String>(), blockers(found));
        Assert.isTrue(
            anyContains(warnings(found), 'can be skipped'),
            String.valueOf(warnings(found))
        );
    }

    // ------------------------------------------- typed conditions (D50, Task 9)

    private static List<FinalMappingValidator.Diagnostic> checkTyped(
        List<Object> questions,
        String soql
    ) {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        Map<String, Object> match = (Map<String, Object>) action.get('match');
        match.put('filterMode', 'soql');
        match.put('soql', soql);
        return FinalMappingValidator.validate(
            FinalMappingTestData.spec(questions, new List<Object>{ action }),
            null
        );
    }

    private static List<String> conditionBlockers(
        List<FinalMappingValidator.Diagnostic> found
    ) {
        List<String> out = new List<String>();
        for (FinalMappingValidator.Diagnostic d : found) {
            if (d.severity == 'blocker' && d.field == 'conditions') {
                out.add(d.message);
            }
        }
        return out;
    }

    @IsTest
    static void cleanTypedConditionsProduceNothing() {
        List<FinalMappingValidator.Diagnostic> found = checkTyped(
            FinalMappingTestData.standardQuestions(),
            'LastName = {!el_last} AND CreatedDate = LAST_N_DAYS:30'
        );
        Assert.areEqual(new List<String>(), blockers(found));
        Assert.areEqual(new List<String>(), warnings(found));
    }

    @IsTest
    static void aTypedConditionThatDoesNotParseBlocks() {
        List<String> found = conditionBlockers(
            checkTyped(
                FinalMappingTestData.standardQuestions(),
                'LastName = \'a\'; DELETE'
            )
        );
        Assert.areEqual(1, found.size(), String.valueOf(found));
        Assert.isTrue(
            found[0]
                .startsWith(
                    'Step 1 (Contact)’s conditions: Remove the semicolon'
                )
        );
    }

    @IsTest
    static void aTypedConditionSalesforceRefusesBlocksInItsWords() {
        List<String> found = conditionBlockers(
            checkTyped(
                FinalMappingTestData.standardQuestions(),
                'Nope__c = \'x\''
            )
        );
        Assert.isTrue(anyContains(found, 'don’t run'), String.valueOf(found));
        Assert.isTrue(anyContains(found, 'Nope__c'), String.valueOf(found));
    }

    @IsTest
    static void anUnfittingTypedAnswerBlocks() {
        List<String> found = conditionBlockers(
            checkTyped(
                FinalMappingTestData.standardQuestions(),
                'Birthdate = {!el_last}'
            )
        );
        Assert.isTrue(
            anyContains(found, 'can’t be compared with'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aSeveralValueTypedAnswerBlocks() {
        Map<String, Object> many = new Map<String, Object>{
            'id' => 'el_many',
            'type' => 'imageChoice',
            'label' => 'Pick several',
            'required' => true,
            'config' => new Map<String, Object>{ 'multiple' => true }
        };
        List<String> found = conditionBlockers(
            checkTyped(questionsPlus(many), 'Title = {!el_many}')
        );
        Assert.isTrue(
            anyContains(found, 'more than one value'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void likeOnANonTextFieldBlocks() {
        Map<String, Object> bday = FinalMappingTestData.question(
            'el_bd',
            'date',
            'Birthday'
        );
        List<String> found = conditionBlockers(
            checkTyped(questionsPlus(bday), 'Birthdate LIKE {!el_bd}')
        );
        Assert.isTrue(
            anyContains(found, 'with that comparison'),
            String.valueOf(found)
        );
    }

    @IsTest
    static void aSkippableTypedAnswerWarns() {
        Map<String, Object> nick = FinalMappingTestData.question(
            'el_nick',
            'text',
            'Nickname'
        );
        nick.put('required', false);
        List<FinalMappingValidator.Diagnostic> found = checkTyped(
            questionsPlus(nick),
            'LastName = {!el_nick}'
        );
        Assert.areEqual(new List<String>(), conditionBlockers(found));
        Assert.isTrue(
            anyContains(warnings(found), 'can be skipped'),
            String.valueOf(warnings(found))
        );
    }

    @IsTest
    static void typedConditionsRunAsThePublisher() {
        Profile minimum = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Minimum Access - Salesforce'
        ];
        User noAccess = new User(
            Alias = 'nosoql',
            Email = 'nosoql@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'No typed access',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = minimum.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            Username = 'nosoql' + Crypto.getRandomInteger() + '@example.com'
        );
        insert noAccess;
        // May create Contacts, but has no access to Title.
        PermissionSet contactsOnly = new PermissionSet(
            Name = 'NoTitle' + Crypto.getRandomInteger().toString().remove('-'),
            Label = 'Contacts without Title'
        );
        insert contactsOnly;
        insert new ObjectPermissions(
            ParentId = contactsOnly.Id,
            SobjectType = 'Contact',
            PermissionsRead = true,
            PermissionsCreate = true
        );
        insert new PermissionSetAssignment(
            AssigneeId = noAccess.Id,
            PermissionSetId = contactsOnly.Id
        );
        List<String> found;
        System.runAs(noAccess) {
            found = conditionBlockers(
                checkTyped(
                    FinalMappingTestData.standardQuestions(),
                    'Title = \'x\''
                )
            );
        }
        Assert.isTrue(anyContains(found, 'don’t run'), String.valueOf(found));
    }

    @IsTest
    static void junkInTypedConditionsIsNamed() {
        List<String> found = conditionBlockers(
            checkTyped(
                FinalMappingTestData.standardQuestions(),
                'LastName != null OR FirstName = \'a\' aelksdhjawldna'
            )
        );
        Assert.isTrue(
            anyContains(found, '“aelksdhjawldna”'),
            String.valueOf(found)
        );
        found = conditionBlockers(
            checkTyped(
                FinalMappingTestData.standardQuestions(),
                'LastName = \'x\' AND'
            )
        );
        Assert.isTrue(
            anyContains(found, 'end too soon'),
            String.valueOf(found)
        );
    }
}
