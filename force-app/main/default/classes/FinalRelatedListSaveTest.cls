/**
 * Saving related lists on a record page (IMPL_PLAN_RELATED_RECORDS Part 2,
 * slice 2): changed rows update their record (only the changed fields), new
 * rows insert, and everything is checked before the first write.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRelatedListSaveTest {
    private static Map<String, Object> grp(
        String id,
        String title,
        Map<String, Object> extra
    ) {
        Map<String, Object> repeat = new Map<String, Object>{
            'childObject' => 'Case',
            'relationshipField' => 'ContactId',
            'relationshipName' => 'Cases',
            'min' => 0
        };
        if (extra != null) {
            repeat.putAll(extra);
        }
        return new Map<String, Object>{
            'id' => id,
            'title' => title,
            'repeat' => repeat,
            'elements' => new List<Object>{
                new Map<String, Object>{
                    'id' => id + '_subj',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'Subject'
                    }
                },
                new Map<String, Object>{
                    'id' => id + '_desc',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'Description'
                    }
                }
            }
        };
    }

    private static Map<String, Object> subjectIs(String subject) {
        return new Map<String, Object>{
            'filter' => new Map<String, Object>{
                'logic' => 'all',
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'fieldPath' => 'Subject',
                        'operator' => 'like',
                        'value' => subject
                    }
                }
            }
        };
    }

    private static Id version(List<Object> groups) {
        Form__c f = new Form__c(
            Name = 'Save lists',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        List<Object> sections = new List<Object>{
            new Map<String, Object>{
                'id' => 'sec_1',
                'elements' => new List<Object>{
                    new Map<String, Object>{
                        'id' => 'el_title',
                        'type' => 'field',
                        'binding' => new Map<String, Object>{
                            'object' => 'Contact',
                            'field' => 'Title'
                        }
                    }
                }
            }
        };
        sections.addAll(groups);
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = JSON.serialize(
                new Map<String, Object>{
                    'specVersion' => 1,
                    'form' => new Map<String, Object>{
                        'targetObject' => 'Contact',
                        'saveMode' => 'update'
                    },
                    'pages' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'pg_1',
                            'sections' => sections
                        }
                    }
                }
            )
        );
        insert v;
        return v.Id;
    }

    private static String payload(Id contactId, Map<String, Object> repeats) {
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_title' => 'Edited' },
                'repeats' => repeats,
                'meta' => new Map<String, Object>{
                    'existingRecordId' => contactId
                }
            }
        );
    }

    /** Submits; the refusal message, the first field error's, or null. */
    private static Object submit(Id v, String body) {
        try {
            FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
                null,
                v,
                body
            );
            return res.errors != null && !res.errors.isEmpty()
                ? (Object) res.errors[0]
                : null;
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
    }

    private static Contact contactWithCases(List<String> subjects) {
        Contact c = new Contact(LastName = 'Lists', Title = 'Before');
        insert c;
        List<Case> cases = new List<Case>();
        for (String s : subjects) {
            cases.add(
                new Case(ContactId = c.Id, Subject = s, Description = 'orig')
            );
        }
        insert cases;
        return c;
    }

    private static Case caseNamed(String subject) {
        return [
            SELECT Id, Subject, Description
            FROM Case
            WHERE Subject = :subject
            LIMIT 1
        ];
    }

    @IsTest
    static void changedRowsUpdateOnlyTheirChangedFieldsAndNewRowsInsert() {
        Contact c = contactWithCases(new List<String>{ 'Open one' });
        Case one = caseNamed('Open one');
        Id v = version(new List<Object>{ grp('sec_open', 'Open cases', null) });

        Test.startTest();
        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => one.Id,
                            'sec_open_subj' => 'Open one, fixed'
                        },
                        new Map<String, Object>{
                            'sec_open_subj' => 'Brand new'
                        }
                    }
                }
            )
        );
        Test.stopTest();

        Assert.isNull(out, 'the save should go through');
        Case after = [SELECT Subject, Description FROM Case WHERE Id = :one.Id];
        Assert.areEqual('Open one, fixed', after.Subject);
        Assert.areEqual('orig', after.Description, 'unchanged field untouched');
        Assert.areEqual(2, [SELECT COUNT() FROM Case WHERE ContactId = :c.Id]);
        Assert.areEqual(
            'Edited',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title
        );
    }

    @IsTest
    static void someoneElsesCaseIsRefusedAndNothingIsWritten() {
        Contact c = contactWithCases(new List<String>{ 'Mine' });
        Contact other = contactWithCases(new List<String>{ 'Theirs' });
        Case theirs = caseNamed('Theirs');
        Id v = version(new List<Object>{ grp('sec_open', 'Open cases', null) });

        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => theirs.Id,
                            'sec_open_subj' => 'Hijacked'
                        }
                    }
                }
            )
        );

        Assert.isTrue(out instanceof FinalSubmitService.FieldError);
        FinalSubmitService.FieldError fe = (FinalSubmitService.FieldError) out;
        Assert.areEqual('sec_open', fe.sectionId);
        Assert.areEqual(0, fe.entryIndex);
        Assert.areEqual('Theirs', caseNamed('Theirs').Subject);
        Assert.areEqual(
            'Before',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title
        );
    }

    @IsTest
    static void aRecordOutsideTheListsConditionsIsRefused() {
        Contact c = contactWithCases(new List<String>{ 'Open a', 'Closed b' });
        Case closed = caseNamed('Closed b');
        Id v = version(
            new List<Object>{
                grp(
                    'sec_open',
                    'Open cases',
                    new Map<String, Object>{ 'show' => subjectIs('Open') }
                )
            }
        );
        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => closed.Id,
                            'sec_open_desc' => 'sneaky'
                        }
                    }
                }
            )
        );
        Assert.isTrue(out instanceof FinalSubmitService.FieldError);
        Assert.areEqual('orig', caseNamed('Closed b').Description);
    }

    @IsTest
    static void aReadOnlyListTakesNothing() {
        Contact c = contactWithCases(new List<String>{ 'Open a' });
        Case one = caseNamed('Open a');
        Id v = version(
            new List<Object>{
                grp(
                    'sec_ro',
                    'Closed cases',
                    new Map<String, Object>{ 'readOnly' => true }
                )
            }
        );
        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_ro' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => one.Id,
                            'sec_ro_subj' => 'Changed'
                        }
                    }
                }
            )
        );
        Assert.areEqual(
            'Closed cases is read-only, so nothing in it can be changed.',
            out
        );
        Assert.areEqual('Open a', caseNamed('Open a').Subject);
    }

    @IsTest
    static void maxJudgesOnlyWhatTheSaveAdds() {
        Contact c = contactWithCases(new List<String>{ 'One', 'Two', 'Three' });
        Case one = caseNamed('One');
        // already above Max 2: an edit that adds nothing still saves
        Id v = version(
            new List<Object>{
                grp(
                    'sec_all',
                    'All cases',
                    new Map<String, Object>{ 'max' => 2 }
                )
            }
        );
        Assert.isNull(
            submit(
                v,
                payload(
                    c.Id,
                    new Map<String, Object>{
                        'sec_all' => new List<Object>{
                            new Map<String, Object>{
                                '$id' => one.Id,
                                'sec_all_desc' => 'changed'
                            }
                        }
                    }
                )
            )
        );
        // adding one more is refused
        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_all' => new List<Object>{
                        new Map<String, Object>{ 'sec_all_subj' => 'Four' }
                    }
                }
            )
        );
        Assert.areEqual('All cases can have at most 2 Cases.', out);
        Assert.areEqual(3, [SELECT COUNT() FROM Case WHERE ContactId = :c.Id]);
    }

    @IsTest
    static void oneRecordChangedInTwoListsMergesOrIsRefused() {
        Contact c = contactWithCases(new List<String>{ 'Open shared' });
        Case shared = caseNamed('Open shared');
        Id v = version(
            new List<Object>{
                grp('sec_a', 'Open cases', null),
                grp('sec_b', 'All cases', null)
            }
        );
        // different fields: merged into one update
        Assert.isNull(
            submit(
                v,
                payload(
                    c.Id,
                    new Map<String, Object>{
                        'sec_a' => new List<Object>{
                            new Map<String, Object>{
                                '$id' => shared.Id,
                                'sec_a_subj' => 'Open shared, renamed'
                            }
                        },
                        'sec_b' => new List<Object>{
                            new Map<String, Object>{
                                '$id' => shared.Id,
                                'sec_b_desc' => 'noted'
                            }
                        }
                    }
                )
            )
        );
        Case merged = [
            SELECT Subject, Description
            FROM Case
            WHERE Id = :shared.Id
        ];
        Assert.areEqual('Open shared, renamed', merged.Subject);
        Assert.areEqual('noted', merged.Description);

        // the same field with two values: refused
        Object out = submit(
            v,
            payload(
                c.Id,
                new Map<String, Object>{
                    'sec_a' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => shared.Id,
                            'sec_a_desc' => 'x'
                        }
                    },
                    'sec_b' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => shared.Id,
                            'sec_b_desc' => 'y'
                        }
                    }
                }
            )
        );
        Assert.isTrue(out instanceof FinalSubmitService.FieldError);
        Assert.areEqual('noted', caseNamed('Open shared, renamed').Description);
    }

    @IsTest
    static void aCreateFormNeverChangesExistingRecords() {
        Contact c = contactWithCases(new List<String>{ 'Existing' });
        Case one = caseNamed('Existing');
        Form__c f = new Form__c(
            Name = 'Create',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = JSON.serialize(
                new Map<String, Object>{
                    'specVersion' => 1,
                    'form' => new Map<String, Object>{
                        'targetObject' => 'Contact'
                    },
                    'pages' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'pg_1',
                            'sections' => new List<Object>{
                                grp('sec_x', 'Cases', null)
                            }
                        }
                    }
                }
            )
        );
        insert v;
        Object out = submit(
            v.Id,
            JSON.serialize(
                new Map<String, Object>{
                    'answers' => new Map<String, Object>(),
                    'repeats' => new Map<String, Object>{
                        'sec_x' => new List<Object>{
                            new Map<String, Object>{
                                '$id' => one.Id,
                                'sec_x_subj' => 'Stolen'
                            }
                        }
                    }
                }
            )
        );
        Assert.areEqual(
            'Existing records can only be changed on a record page.',
            out
        );
        Assert.areEqual('Existing', caseNamed('Existing').Subject);
    }

    @IsTest
    static void theLoaderSaysWhichRowsCanBeEdited() {
        Contact c = contactWithCases(new List<String>{ 'Mine' });
        Id v = version(new List<Object>{ grp('sec_open', 'Open cases', null) });
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Assert.isTrue(lists[0].rows[0].canEdit);
    }
}
