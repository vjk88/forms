/**
 * Related lists on a record page, slice 1 "See"
 * (IMPL_PLAN_RELATED_RECORDS Part 2): existing children load read-only, per
 * list, filtered by the list's own "Show" conditions, newest first, with
 * picklist labels and lookup names, capped at 50 with the true total.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRelatedListServiceTest {
    private static Map<String, Object> grp(
        String id,
        String title,
        Map<String, Object> show
    ) {
        Map<String, Object> repeat = new Map<String, Object>{
            'childObject' => 'Case',
            'relationshipField' => 'ContactId',
            'relationshipName' => 'Cases'
        };
        if (show != null) {
            repeat.put('show', show);
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
                    'id' => id + '_status',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'Status'
                    }
                },
                new Map<String, Object>{
                    'id' => id + '_esc',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'IsEscalated'
                    }
                },
                new Map<String, Object>{
                    'id' => id + '_note',
                    'type' => 'richText'
                }
            }
        };
    }

    private static Map<String, Object> statusIs(String status) {
        return new Map<String, Object>{
            'filter' => new Map<String, Object>{
                'logic' => 'all',
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'fieldPath' => 'Status',
                        'operator' => 'eq',
                        'value' => status
                    }
                }
            }
        };
    }

    private static Id version(List<Object> sections) {
        Form__c f = new Form__c(
            Name = 'Lists test',
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
                            'sections' => sections
                        }
                    }
                }
            )
        );
        insert v;
        return v.Id;
    }

    private static String closedStatus() {
        return [
            SELECT ApiName
            FROM CaseStatus
            WHERE IsClosed = TRUE
            LIMIT 1
        ]
        .ApiName;
    }

    private static String openStatus() {
        return [
            SELECT ApiName
            FROM CaseStatus
            WHERE IsClosed = FALSE
            LIMIT 1
        ]
        .ApiName;
    }

    @IsTest
    static void twoListsOfOneObjectEachShowTheirOwnRows() {
        Contact c = new Contact(LastName = 'Lists');
        insert c;
        String open = openStatus();
        String closed = closedStatus();
        insert new List<Case>{
            new Case(ContactId = c.Id, Subject = 'Open one', Status = open),
            new Case(
                ContactId = c.Id,
                Subject = 'Closed one',
                Status = closed,
                IsEscalated = true
            )
        };
        // another Contact's Case never shows
        Contact other = new Contact(LastName = 'Other');
        insert other;
        insert new Case(
            ContactId = other.Id,
            Subject = 'Not mine',
            Status = open
        );

        Id v = version(
            new List<Object>{
                grp('sec_open', 'Open cases', statusIs(open)),
                grp('sec_closed', 'Closed cases', statusIs(closed)),
                grp('sec_all', 'All cases', null)
            }
        );

        Test.startTest();
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Test.stopTest();

        Assert.areEqual(3, lists.size());
        Assert.areEqual('sec_open', lists[0].sectionId);
        Assert.areEqual(1, lists[0].total);
        Assert.areEqual(
            'Open one',
            lists[0].rows[0].cells.get('sec_open_subj')
        );
        Assert.areEqual(
            'Closed one',
            lists[1].rows[0].cells.get('sec_closed_subj')
        );
        Assert.areEqual('Yes', lists[1].rows[0].cells.get('sec_closed_esc'));
        Assert.areEqual(
            closed,
            lists[1].rows[0].values.get('sec_closed_status'),
            'rules compare the stored value, not the label'
        );
        Assert.areEqual(true, lists[1].rows[0].values.get('sec_closed_esc'));
        Assert.isNotNull(lists[1].rows[0].cells.get('sec_closed_status'));
        Assert.areEqual(2, lists[2].total);
        Assert.areEqual('Case', lists[2].childLabel);
        Assert.isNotNull(lists[2].rows[0].name, 'the Case Number is the name');
        Assert.isFalse(
            lists[2].rows[0].cells.containsKey('sec_all_note'),
            'display blocks have no cell'
        );
        Assert.isNull(lists[2].error);
    }

    @IsTest
    static void showsFiftyNewestAndTheTrueTotal() {
        Contact c = new Contact(LastName = 'Many');
        insert c;
        List<Case> cases = new List<Case>();
        for (Integer i = 0; i < 53; i++) {
            cases.add(new Case(ContactId = c.Id, Subject = 'Case ' + i));
        }
        insert cases;
        Id v = version(new List<Object>{ grp('sec_all', 'All', null) });

        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Assert.areEqual(53, lists[0].total);
        Assert.areEqual(50, lists[0].rows.size());
    }

    @IsTest
    static void aConditionThatCannotCompileFailsOnlyItsOwnList() {
        Contact c = new Contact(LastName = 'Broken');
        insert c;
        Map<String, Object> bad = new Map<String, Object>{
            'filter' => new Map<String, Object>{
                'logic' => 'all',
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'fieldPath' => 'No_Such_Field__c',
                        'operator' => 'eq',
                        'value' => 'x'
                    }
                }
            }
        };
        Id v = version(
            new List<Object>{
                grp('sec_bad', 'Bad', bad),
                grp('sec_ok', 'Fine', null)
            }
        );
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Assert.isNotNull(lists[0].error);
        Assert.isNull(lists[1].error);
    }

    @IsTest
    static void aRecordOfAnotherObjectIsRefused() {
        Id v = version(new List<Object>{ grp('sec_all', 'All', null) });
        Case notAContact = new Case(Subject = 'x');
        insert notAContact;
        try {
            FinalRelatedListService.load(v, notAContact.Id);
            Assert.fail('a Case is not the form’s Contact');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('Contact'), e.getMessage());
        }
    }

    @IsTest
    static void publishRefusesAShowConditionThatCannotCompile() {
        Form__c f = new Form__c(
            Name = 'Publish show',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> bad = statusIs('x');
        ((Map<String, Object>) ((List<Object>) ((Map<String, Object>) bad.get(
                    'filter'
                ))
                .get('rows'))[0])
            .put('fieldPath', 'Nope__c');
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'targetObject' => 'Contact' },
            'resolved' => new Map<String, Object>{
                'tokens' => new Map<String, Object>{ '--c-text' => '#000' }
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        grp('sec_x', 'Open cases', bad)
                    }
                }
            }
        };
        try {
            FinalSpecController.publishSpec(f.Id, JSON.serialize(spec));
            Assert.fail('a Show condition on a missing field must not publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().startsWith('“Open cases” can’t be published: '),
                e.getMessage()
            );
        }
    }
}
