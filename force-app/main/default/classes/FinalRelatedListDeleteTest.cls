/**
 * Delete on a record page (IMPL_PLAN_RELATED_RECORDS Part 2, slice 3): rows
 * marked "Will be deleted when you save" are deleted by the one Save, only
 * from a list that allows it, only records that belong to that list as
 * stored, as the user. A record changed in one list and deleted in another
 * is refused on both rows; the same delete through two lists is one delete,
 * and one forbidden list refuses it; Min judges what the Save deletes.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRelatedListDeleteTest {
    private static Map<String, Object> grp(
        String id,
        String title,
        Map<String, Object> extra
    ) {
        Map<String, Object> repeat = new Map<String, Object>{
            'childObject' => 'Case',
            'relationshipField' => 'ContactId',
            'relationshipName' => 'Cases',
            'min' => 0,
            'allowDelete' => true
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

    private static Id version(List<Object> groups) {
        Form__c f = new Form__c(
            Name = 'Delete lists',
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
                        'targetObject' => 'Contact'
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

    private static Contact contactWithCases(String name) {
        Contact c = new Contact(LastName = name, Title = 'Before');
        insert c;
        insert new List<Case>{
            new Case(ContactId = c.Id, Subject = 'A', Description = 'orig'),
            new Case(ContactId = c.Id, Subject = 'B', Description = 'orig')
        };
        return c;
    }

    private static Id caseId(Id contactId, String subject) {
        return [
            SELECT Id
            FROM Case
            WHERE ContactId = :contactId AND Subject = :subject
            LIMIT 1
        ]
        .Id;
    }

    private static Integer caseCount(Id contactId) {
        return [SELECT COUNT() FROM Case WHERE ContactId = :contactId];
    }

    private static String body(
        Id contactId,
        Map<String, Object> repeats,
        Map<String, Object> deletes
    ) {
        Map<String, Object> payload = new Map<String, Object>{
            'answers' => new Map<String, Object>{ 'el_title' => 'After' },
            'repeats' => repeats == null ? new Map<String, Object>() : repeats,
            'meta' => new Map<String, Object>{ 'existingRecordId' => contactId }
        };
        if (deletes != null) {
            payload.put('repeatDeletes', deletes);
        }
        return JSON.serialize(payload);
    }

    /** null when it saved; else the refusal (message or first FieldError). */
    private static Object submit(Id v, String json) {
        try {
            FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
                null,
                v,
                json
            );
            return res.errors != null && !res.errors.isEmpty()
                ? (Object) res.errors
                : null;
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
    }

    private static String title(Id contactId) {
        return [SELECT Title FROM Contact WHERE Id = :contactId].Title;
    }

    @IsTest
    static void aMarkedRowIsDeletedAtSaveWithEverythingElse() {
        Contact c = contactWithCases('Del ok');
        Id a = caseId(c.Id, 'A');
        Id v = version(new List<Object>{ grp('sec_l', 'Cases', null) });
        Test.startTest();
        Object out = submit(
            v,
            body(
                c.Id,
                null,
                new Map<String, Object>{ 'sec_l' => new List<Object>{ a } }
            )
        );
        Test.stopTest();
        Assert.isNull(out, 'saved: ' + out);
        Assert.areEqual(1, caseCount(c.Id));
        Assert.areEqual('After', title(c.Id));
        Assert.areEqual(0, [SELECT COUNT() FROM Case WHERE Id = :a]);
    }

    @IsTest
    static void aListWithoutAllowDeleteDeletesNothing() {
        Contact c = contactWithCases('Del off');
        Id v = version(
            new List<Object>{
                grp(
                    'sec_l',
                    'Cases',
                    new Map<String, Object>{ 'allowDelete' => null }
                )
            }
        );
        Object out = submit(
            v,
            body(
                c.Id,
                null,
                new Map<String, Object>{
                    'sec_l' => new List<Object>{ caseId(c.Id, 'A') }
                }
            )
        );
        Assert.areEqual('Records can’t be deleted from Cases.', out);
        Assert.areEqual(2, caseCount(c.Id));
        Assert.areEqual('Before', title(c.Id));
    }

    @IsTest
    static void someoneElsesCaseCantBeDeletedThroughThisList() {
        Contact c = contactWithCases('Del mine');
        Contact other = contactWithCases('Del other');
        Id theirs = caseId(other.Id, 'A');
        Id v = version(new List<Object>{ grp('sec_l', 'Cases', null) });
        Object out = submit(
            v,
            body(
                c.Id,
                null,
                new Map<String, Object>{ 'sec_l' => new List<Object>{ theirs } }
            )
        );
        Assert.isTrue(out instanceof List<FinalSubmitService.FieldError>);
        FinalSubmitService.FieldError fe = ((List<FinalSubmitService.FieldError>) out)[0];
        Assert.areEqual(theirs, fe.recordId, 'named by record: it isn’t sent');
        Assert.areEqual('sec_l', fe.sectionId);
        Assert.areEqual(2, caseCount(other.Id));
        Assert.areEqual('Before', title(c.Id));
    }

    @IsTest
    static void changedInOneListAndDeletedInAnotherIsRefusedOnBothRows() {
        Contact c = contactWithCases('Del clash');
        Id a = caseId(c.Id, 'A');
        Id v = version(
            new List<Object>{
                grp('sec_open', 'Open cases', null),
                grp('sec_all', 'All cases', null)
            }
        );
        Object out = submit(
            v,
            body(
                c.Id,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => a,
                            'sec_open_desc' => 'changed'
                        }
                    }
                },
                new Map<String, Object>{ 'sec_all' => new List<Object>{ a } }
            )
        );
        Assert.isTrue(out instanceof List<FinalSubmitService.FieldError>);
        List<FinalSubmitService.FieldError> errs = (List<FinalSubmitService.FieldError>) out;
        Assert.areEqual(2, errs.size());
        Assert.areEqual(
            'This Case is changed in Open cases and deleted in All cases. Undo the delete, or change it back in Open cases.',
            errs[0].message
        );
        Assert.areEqual('sec_open', errs[0].sectionId);
        Assert.areEqual(0, errs[0].entryIndex);
        Assert.areEqual('sec_all', errs[1].sectionId);
        Assert.areEqual(a, errs[1].recordId);
        Assert.areEqual(2, caseCount(c.Id));
        Assert.areEqual(
            'orig',
            [SELECT Description FROM Case WHERE Id = :a].Description
        );
    }

    @IsTest
    static void theSameDeleteThroughTwoListsIsOneDeleteUnlessOneForbidsIt() {
        Contact c = contactWithCases('Del twice');
        Id a = caseId(c.Id, 'A');
        Id v = version(
            new List<Object>{
                grp('sec_open', 'Open cases', null),
                grp('sec_all', 'All cases', null)
            }
        );
        Object out = submit(
            v,
            body(
                c.Id,
                null,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{ a },
                    'sec_all' => new List<Object>{ a }
                }
            )
        );
        Assert.isNull(out, 'saved: ' + out);
        Assert.areEqual(1, caseCount(c.Id));

        // a permitted list never vouches for a forbidden one
        Contact d = contactWithCases('Del forbid');
        Id b = caseId(d.Id, 'B');
        Id v2 = version(
            new List<Object>{
                grp('sec_open', 'Open cases', null),
                grp(
                    'sec_all',
                    'All cases',
                    new Map<String, Object>{ 'allowDelete' => false }
                )
            }
        );
        out = submit(
            v2,
            body(
                d.Id,
                null,
                new Map<String, Object>{
                    'sec_open' => new List<Object>{ b },
                    'sec_all' => new List<Object>{ b }
                }
            )
        );
        Assert.areEqual('Records can’t be deleted from All cases.', out);
        Assert.areEqual(2, caseCount(d.Id));
    }

    @IsTest
    static void minJudgesWhatTheSaveDeletes() {
        Contact c = contactWithCases('Del min');
        Id v = version(
            new List<Object>{
                grp('sec_l', 'Cases', new Map<String, Object>{ 'min' => 2 })
            }
        );
        Object out = submit(
            v,
            body(
                c.Id,
                null,
                new Map<String, Object>{
                    'sec_l' => new List<Object>{ caseId(c.Id, 'A') }
                }
            )
        );
        Assert.areEqual(
            'Cases needs at least 2 Cases. Undo a delete, or add one.',
            out
        );
        Assert.areEqual(2, caseCount(c.Id));
    }

    @IsTest
    static void aCreateFormNeverDeletes() {
        Contact c = contactWithCases('Del create');
        Id v = version(new List<Object>{ grp('sec_l', 'Cases', null) });
        Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(
            body(
                c.Id,
                null,
                new Map<String, Object>{
                    'sec_l' => new List<Object>{ caseId(c.Id, 'A') }
                }
            )
        );
        ((Map<String, Object>) payload.get('meta')).remove('existingRecordId');
        ((Map<String, Object>) payload.get('answers')).put('el_title', 'New');
        Object out = submit(v, JSON.serialize(payload));
        Assert.areEqual(
            'Existing records can only be deleted on a record page.',
            out
        );
        Assert.areEqual(2, caseCount(c.Id));
    }

    @IsTest
    static void theLoaderSaysWhichRowsCanBeDeleted() {
        Contact c = contactWithCases('Del load');
        Id v = version(new List<Object>{ grp('sec_l', 'Cases', null) });
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Assert.areEqual(2, lists[0].rows.size());
        Assert.isTrue(lists[0].rows[0].canDelete, 'the admin may delete');
    }
}
