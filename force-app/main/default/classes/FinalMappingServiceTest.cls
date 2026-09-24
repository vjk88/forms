/**
 * One mapping run (FREEFORM_F2_MAPPING_SPEC 6.4). run() is called directly:
 * these prove the service, the trigger has its own tests. The job the
 * trigger queues on insert never runs here — nothing calls Test.stopTest.
 */
@IsTest
private class FinalMappingServiceTest {
    private static Id arrange(
        List<Object> actions,
        Map<String, String> answers
    ) {
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                actions
            )
        );
        return FinalMappingTestData.submit(answers);
    }

    private static Map<String, String> jane() {
        return new Map<String, String>{
            'el_last' => 'Jane',
            'el_email' => 'jane@example.com',
            'el_title' => 'CTO'
        };
    }

    @IsTest
    static void aCreateStepMakesTheRecordAndRecordsIt() {
        Id subId = arrange(
            new List<Object>{ FinalMappingTestData.createContact('act_a') },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Contact c = [
            SELECT LastName, Email
            FROM Contact
            WHERE Email = 'jane@example.com'
        ];
        Assert.areEqual('Jane', c.LastName);
        Form_Submission__c sub = FinalMappingTestData.reload(subId);
        Assert.areEqual(1, sub.Mapping_Attempts__c);
        Map<String, Object> created = (Map<String, Object>) JSON.deserializeUntyped(
            sub.Created_Records__c
        );
        Assert.areEqual(String.valueOf(c.Id), created.get('act_a'));
    }

    @IsTest
    static void twoMatchesWriteNothing() {
        // Test 3 (D33).
        insert new List<Contact>{
            new Contact(LastName = 'One', Email = 'jane@example.com'),
            new Contact(LastName = 'Two', Email = 'jane@example.com')
        };
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'update')
            },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('more than one'), r.message);
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void aFailedRunKeepsItsAttemptAndSaysWhy() {
        // Test 4: the savepoint sits after the attempts write.
        insert new List<Contact>{
            new Contact(LastName = 'One', Email = 'jane@example.com'),
            new Contact(LastName = 'Two', Email = 'jane@example.com')
        };
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
            },
            jane()
        );

        FinalMappingService.run(subId);

        Form_Submission__c sub = FinalMappingTestData.reload(subId);
        Assert.areEqual('Failed', sub.Mapping_Status__c);
        Assert.areEqual(
            1,
            sub.Mapping_Attempts__c,
            'the attempt survived the rollback'
        );
        Assert.isTrue(String.isNotBlank(sub.Mapping_Message__c));
    }

    @IsTest
    static void runningTwiceMakesOneSetOfRecords() {
        // Test 5.
        Id subId = arrange(
            new List<Object>{ FinalMappingTestData.createContact('act_a') },
            jane()
        );
        FinalMappingService.run(subId);
        FinalMappingService.Result second = FinalMappingService.run(subId);
        Assert.areEqual('Done', second.status);
        Assert.isTrue(
            second.message.contains('Nothing to run'),
            second.message
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void aRecordRefPointsAtTheEarlierStepsRecord() {
        // Test 6, created case.
        Map<String, Object> manager = FinalMappingTestData.createContact(
            'act_a'
        );
        Map<String, Object> report = new Map<String, Object>{
            'id' => 'act_b',
            'object' => 'Contact',
            'operation' => 'create',
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'LastName',
                    FinalMappingTestData.literal('Report')
                ),
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('action:act_a')
                )
            }
        };
        Id subId = arrange(new List<Object>{ manager, report }, jane());

        FinalMappingService.run(subId);

        Contact boss = [
            SELECT Id
            FROM Contact
            WHERE Email = 'jane@example.com'
        ];
        Assert.areEqual(
            boss.Id,
            [SELECT ReportsToId FROM Contact WHERE LastName = 'Report']
            .ReportsToId
        );
    }

    @IsTest
    static void aRecordRefPointsAtTheRecordAnEarlierStepFound() {
        // Test 6, found case.
        Contact existing = new Contact(
            LastName = 'Already here',
            Email = 'jane@example.com'
        );
        insert existing;
        Map<String, Object> report = new Map<String, Object>{
            'id' => 'act_b',
            'object' => 'Contact',
            'operation' => 'create',
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'LastName',
                    FinalMappingTestData.literal('Report')
                ),
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('action:act_a')
                )
            }
        };
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'reuse'),
                report
            },
            jane()
        );

        FinalMappingService.run(subId);

        Assert.areEqual(
            existing.Id,
            [SELECT ReportsToId FROM Contact WHERE LastName = 'Report']
            .ReportsToId
        );
    }

    @IsTest
    static void reuseWritesNothingToTheMatch() {
        // Test 7.
        Contact existing = new Contact(
            LastName = 'Original',
            Email = 'jane@example.com',
            Title = 'Old'
        );
        insert existing;
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
            },
            jane()
        );

        FinalMappingService.run(subId);

        Contact after = [
            SELECT LastName, Title
            FROM Contact
            WHERE Id = :existing.Id
        ];
        Assert.areEqual('Original', after.LastName);
        Assert.areEqual('Old', after.Title);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact],
            'no duplicate was made'
        );
    }

    @IsTest
    static void updateWritesOnlyFlaggedFieldsAndNeverTheMatchField() {
        // Test 8.
        Contact existing = new Contact(
            LastName = 'Original',
            Email = 'jane@example.com',
            Title = 'Old'
        );
        insert existing;
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'update'
        );
        for (Object o : (List<Object>) action.get('fields')) {
            Map<String, Object> f = (Map<String, Object>) o;
            if (f.get('field') == 'Title') {
                f.put('writeOnMatch', true);
            }
        }
        Id subId = arrange(new List<Object>{ action }, jane());

        FinalMappingService.run(subId);

        Contact after = [
            SELECT LastName, Email, Title
            FROM Contact
            WHERE Id = :existing.Id
        ];
        Assert.areEqual('CTO', after.Title, 'the flagged field was written');
        Assert.areEqual(
            'Original',
            after.LastName,
            'an unflagged field was left alone'
        );
        Assert.areEqual('jane@example.com', after.Email);
    }

    @IsTest
    static void aSkippedAnswerLeavesTheFieldAlone() {
        // Test 13 (D44).
        Contact existing = new Contact(
            LastName = 'Original',
            Email = 'jane@example.com',
            Title = 'Keep me'
        );
        insert existing;
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'update'
        );
        for (Object o : (List<Object>) action.get('fields')) {
            ((Map<String, Object>) o)
                .put(
                    'writeOnMatch',
                    ((Map<String, Object>) o).get('field') == 'Title'
                );
        }
        Map<String, String> answers = jane();
        answers.put('el_title', null); // skipped: no row at all
        Id subId = arrange(new List<Object>{ action }, answers);

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            'Keep me',
            [SELECT Title FROM Contact WHERE Id = :existing.Id].Title
        );
    }

    @IsTest
    static void aBlankMatchValueFailsWithoutSearching() {
        // Test 14 (D44).
        Contact noEmail = new Contact(LastName = 'No email');
        insert noEmail;
        Map<String, String> answers = jane();
        answers.put('el_email', null);
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'update')
            },
            answers
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('left blank'), r.message);
        Assert.areEqual(
            'No email',
            [SELECT LastName FROM Contact WHERE Id = :noEmail.Id].LastName
        );
    }

    @IsTest
    static void aChoiceIsSearchedTheWayItIsWritten() {
        // Write the label, search the value, and every submission quietly makes
        // another Contact. Both paths go through the one conversion now.
        Map<String, Object> action = new Map<String, Object>{
            'id' => 'act_a',
            'object' => 'Contact',
            'operation' => 'findOrCreate',
            'match' => new Map<String, Object>{
                'field' => 'Title',
                'source' => FinalMappingTestData.answer('el_tier'),
                'filter' => FinalMappingTestData.anyNamedContact(),
                'onMatch' => 'reuse'
            },
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'LastName',
                    FinalMappingTestData.answer('el_last')
                ),
                FinalMappingTestData.field(
                    'Title',
                    FinalMappingTestData.answer('el_tier')
                )
            }
        };
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                new List<Object>{
                    FinalMappingTestData.question(
                        'el_last',
                        'text',
                        'Your surname'
                    ),
                    tierQuestion()
                },
                new List<Object>{ action }
            )
        );

        FinalMappingService.run(tierSubmission());
        FinalMappingService.Result second = FinalMappingService.run(
            tierSubmission()
        );

        Assert.areEqual('Done', second.status, 'message: ' + second.message);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Title = 'Priority customer'],
            'the second submission found the first one’s Contact'
        );
    }

    @IsTest
    static void aFilterConvertsAnAnswerInsideAnIsOneOfList() {
        // "is one of" keeps its entries in `values`, which the compiler never
        // resolves tokens inside. Unconverted, the search compares Title with
        // the literal text "$field.el_tier", matches nothing, and quietly makes
        // a second Contact.
        Contact existing = new Contact(
            LastName = 'Existing',
            Email = 'jane@example.com',
            Title = 'Priority customer'
        );
        insert existing;

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
                            'fieldPath' => 'Title',
                            'operator' => 'in',
                            'values' => new List<Object>{ '$field.el_tier' }
                        }
                    }
                }
            );
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                new List<Object>{
                    FinalMappingTestData.question(
                        'el_last',
                        'text',
                        'Your surname'
                    ),
                    FinalMappingTestData.question(
                        'el_email',
                        'email',
                        'Work email'
                    ),
                    tierQuestion()
                },
                new List<Object>{ action }
            )
        );

        FinalMappingService.Result r = FinalMappingService.run(
            tierSubmission()
        );

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact],
            'it found the one that exists'
        );
    }

    private static Map<String, Object> tierQuestion() {
        return new Map<String, Object>{
            'id' => 'el_tier',
            'type' => 'field',
            'label' => 'Tier',
            'required' => true,
            'config' => new Map<String, Object>{
                'inputType' => 'picklist',
                'options' => new List<Object>{
                    new Map<String, Object>{
                        'value' => 'vip',
                        'label' => 'Priority customer'
                    }
                }
            }
        };
    }

    /** A submission whose tier answer is a stored choice value. */
    private static Id tierSubmission() {
        Id subId = FinalMappingTestData.submit(
            new Map<String, String>{
                'el_last' => 'Jane',
                'el_email' => 'jane@example.com',
                'el_tier' => 'vip'
            }
        );
        update new Form_Submission_Answer__c(
            Id = [
                SELECT Id
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__c = :subId AND Element_Key__c = 'el_tier'
            ]
            .Id,
            Answer_Type__c = 'Choice'
        );
        return subId;
    }

    @IsTest
    static void aFailureLeavesTheSubmissionAndAnswers() {
        // Test 15.
        insert new List<Contact>{
            new Contact(LastName = 'One', Email = 'jane@example.com'),
            new Contact(LastName = 'Two', Email = 'jane@example.com')
        };
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
            },
            jane()
        );

        FinalMappingService.run(subId);

        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Submission__c WHERE Id = :subId]
        );
        Assert.areEqual(
            3,
            [
                SELECT COUNT()
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__c = :subId
            ]
        );
    }

    @IsTest
    static void aLaterStepFailingUndoesTheEarlierOnes() {
        // All-or-nothing per submission (FREEFORM_SPEC F2 contract 4).
        insert new List<Contact>{
            new Contact(LastName = 'One', Email = 'dup@example.com'),
            new Contact(LastName = 'Two', Email = 'dup@example.com')
        };
        Map<String, Object> second = FinalMappingTestData.findOrCreateContact(
            'act_b',
            'reuse'
        );
        ((Map<String, Object>) second.get('match'))
            .put('source', FinalMappingTestData.answer('el_title'));
        Map<String, String> answers = jane();
        answers.put('el_title', 'dup@example.com');
        Id subId = arrange(
            new List<Object>{
                FinalMappingTestData.createContact('act_a'),
                second
            },
            answers
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com'],
            'step 1 was rolled back'
        );
    }

    @IsTest
    static void aSubmissionThatIsGoneIsReportedNotThrown() {
        Id missing = Id.valueOf(
            Form_Submission__c.SObjectType.getDescribe().getKeyPrefix() +
            '000000000000'
        );
        FinalMappingService.Result r = FinalMappingService.run(missing);
        Assert.isNull(r.status);
        Assert.isTrue(r.message.contains('no longer exists'), r.message);
    }

    @IsTest
    static void aSalesforceRefusalBecomesASentence() {
        // No Last Name. Publish would refuse this, but the run must still fail
        // cleanly if the org changes underneath a form already published.
        Map<String, Object> action = new Map<String, Object>{
            'id' => 'act_a',
            'object' => 'Contact',
            'operation' => 'create',
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'Title',
                    FinalMappingTestData.literal('CTO')
                )
            }
        };
        Id subId = arrange(new List<Object>{ action }, jane());

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.startsWith('Step 1 (Contact): '), r.message);
        Assert.areEqual(0, [SELECT COUNT() FROM Contact]);
    }

    @IsTest
    static void anObjectThatNoLongerExistsFailsTheRun() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        action.put('object', 'No_Such_Object__c');
        Id subId = arrange(new List<Object>{ action }, jane());

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('no longer exists'), r.message);
    }

    @IsTest
    static void aRecordPickedInALookupFillsTheRelationship() {
        Contact boss = new Contact(LastName = 'Boss');
        insert boss;
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('answer:el_title')
                )
            );
        Map<String, String> answers = jane();
        answers.put('el_title', String.valueOf(boss.Id));
        Id subId = arrange(new List<Object>{ action }, answers);

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            boss.Id,
            [SELECT ReportsToId FROM Contact WHERE Email = 'jane@example.com']
            .ReportsToId
        );
    }

    @IsTest
    static void aPickedRecordThatIsNotAnIdFails() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('answer:el_title')
                )
            );
        Id subId = arrange(new List<Object>{ action }, jane());

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('record id'), r.message);
    }

    @IsTest
    static void anUnreadableAnswerIntoADateFailsNamingTheQuestion() {
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
        Id subId = arrange(new List<Object>{ action }, jane());
        update new Form_Submission_Answer__c(
            Id = [
                SELECT Id
                FROM Form_Submission_Answer__c
                WHERE
                    Form_Submission__c = :subId
                    AND Element_Key__c = 'el_title'
            ]
            .Id,
            Answer_Type__c = 'Date',
            Value_Unparsed__c = true
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('Job title'), r.message);
    }

    @IsTest
    static void aFilterThatCannotBeAppliedFailsTheStep() {
        // Both shapes: a single value, and an "is one of" list. Neither may
        // quietly drop out and widen the search.
        for (
            Map<String, Object> row : new List<Map<String, Object>>{
                new Map<String, Object>{
                    'fieldPath' => 'Title',
                    'operator' => 'eq',
                    'value' => '$field.el_nothing'
                },
                new Map<String, Object>{
                    'fieldPath' => 'Title',
                    'operator' => 'in',
                    'values' => new List<Object>{ '$field.el_nothing' }
                }
            }
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
                        'rows' => new List<Object>{ row }
                    }
                );
            Id subId = arrange(new List<Object>{ action }, jane());

            FinalMappingService.Result r = FinalMappingService.run(subId);

            Assert.areEqual('Failed', r.status, String.valueOf(row));
            Assert.isTrue(r.message.contains('search filter'), r.message);
        }
    }

    /**
     * Find-or-create by email, narrowed to Contacts whose LastName equals the
     * surname answer — the filter row compares with an answer (D49).
     */
    private static Map<String, Object> findBySurname() {
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
                            'fieldPath' => 'LastName',
                            'operator' => 'eq',
                            'value' => '$field.el_last'
                        }
                    }
                }
            );
        return action;
    }

    private static void assertFoundNotCreated(String surname) {
        insert new Contact(LastName = surname, Email = 'typed@example.com');
        Id subId = arrange(
            new List<Object>{ findBySurname() },
            new Map<String, String>{
                'el_last' => surname,
                'el_email' => 'typed@example.com',
                'el_title' => 'CTO'
            }
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Email = 'typed@example.com'],
            'the Contact with that literal surname was found, not duplicated'
        );
    }

    @IsTest
    static void rowAnswerIsNeverReadAsAToken() {
        // A respondent typed "$User.Name". It must be searched as that text,
        // not swapped for the running user's name.
        assertFoundNotCreated('$User.Name');
    }

    @IsTest
    static void rowAnswerThatLooksLikeAFieldTokenIsLiteral() {
        assertFoundNotCreated('$field.x');
    }

    // ------------------------------------------- typed conditions (D50, Task 10)

    /** Find-or-create by email, narrowed by conditions the author typed. */
    private static Map<String, Object> typed(String soql) {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        Map<String, Object> match = (Map<String, Object>) action.get('match');
        match.put('filterMode', 'soql');
        match.put('soql', soql);
        return action;
    }

    @IsTest
    static void typedConditionsFindTheRightRecord() {
        insert new List<Contact>{
            new Contact(LastName = 'Jane', Email = 'jane@example.com'),
            new Contact(LastName = 'Other', Email = 'jane@example.com')
        };
        Id subId = arrange(
            new List<Object>{ typed('LastName = {!el_last}') },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com'],
            'Jane was found, nothing was created'
        );
    }

    @IsTest
    static void aTypedChoiceIsSearchedByItsLabel() {
        insert new Contact(
            LastName = 'Jane',
            Email = 'jane@example.com',
            Title = 'Priority customer'
        );
        List<Object> questions = FinalMappingTestData.standardQuestions();
        questions.add(tierQuestion());
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                questions,
                new List<Object>{ typed('Title = {!el_tier}') }
            )
        );

        FinalMappingService.Result r = FinalMappingService.run(
            tierSubmission()
        );

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com'],
            'found by the label, not searched as "vip"'
        );
    }

    @IsTest
    static void aTypedLikeAnswerMatchesAsTyped() {
        // Unescaped, "50%" would also match "500" and the step would fail
        // as ambiguous. Escaped, it finds only the Contact titled "50%".
        insert new List<Contact>{
            new Contact(
                LastName = 'A',
                Email = 'jane@example.com',
                Title = '50%'
            ),
            new Contact(
                LastName = 'B',
                Email = 'jane@example.com',
                Title = '500'
            )
        };
        Id subId = arrange(
            new List<Object>{ typed('Title LIKE {!el_title}') },
            new Map<String, String>{
                'el_last' => 'Jane',
                'el_email' => 'jane@example.com',
                'el_title' => '50%'
            }
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Done', r.status, 'message: ' + r.message);
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void aSkippedTypedAnswerFailsWithoutSearching() {
        Id subId = arrange(
            new List<Object>{ typed('Title = {!el_title}') },
            new Map<String, String>{
                'el_last' => 'Jane',
                'el_email' => 'jane@example.com',
                'el_title' => null
            }
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('was left blank'), r.message);
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void typedConditionsBrokenAfterPublishFailTheStep() {
        Id subId = arrange(
            new List<Object>{ typed('Nope__c = {!el_last}') },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.startsWith('Step 1 (Contact)'), r.message);
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void typedConditionsThatDoNotParseFailTheStep() {
        Id subId = arrange(
            new List<Object>{ typed('LastName = \'a\'; DELETE') },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(
            r.message.contains('its conditions can’t run'),
            r.message
        );
    }

    @IsTest
    static void typedConditionsWithTwoMatchesStillWriteNothing() {
        insert new List<Contact>{
            new Contact(LastName = 'Jane', Email = 'jane@example.com'),
            new Contact(LastName = 'Jane', Email = 'jane@example.com')
        };
        Id subId = arrange(
            new List<Object>{ typed('LastName = {!el_last}') },
            jane()
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual('Failed', r.status);
        Assert.isTrue(r.message.contains('more than one'), r.message);
    }
}
