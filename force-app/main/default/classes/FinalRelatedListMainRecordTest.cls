/**
 * Related lists whose "Show" conditions compare with the main record
 * (IMPL_PLAN_RELATED_RECORDS P2.4, slice 2b): "Cases whose Subject equals
 * this Contact's Title". The loader and the save both read the Contact as
 * the signed-in person; a blank Contact value matches nothing instead of
 * breaking the list; Publish refuses a path that isn't a field.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRelatedListMainRecordTest {
    private static Map<String, Object> subjectIsContactTitle() {
        return new Map<String, Object>{
            'filter' => new Map<String, Object>{
                'logic' => 'all',
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'fieldPath' => 'Subject',
                        'operator' => 'eq',
                        'value' => '$record.Title'
                    }
                }
            }
        };
    }

    private static Id version() {
        Form__c f = new Form__c(
            Name = 'Main record lists',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> grp = new Map<String, Object>{
            'id' => 'sec_l',
            'title' => 'Matching cases',
            'repeat' => new Map<String, Object>{
                'childObject' => 'Case',
                'relationshipField' => 'ContactId',
                'relationshipName' => 'Cases',
                'min' => 0,
                'show' => subjectIsContactTitle()
            },
            'elements' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_l_desc',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'Description'
                    }
                }
            }
        };
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
                                },
                                grp
                            }
                        }
                    }
                }
            )
        );
        insert v;
        return v.Id;
    }

    private static Contact contact(String title) {
        Contact c = new Contact(LastName = 'Main', Title = title);
        insert c;
        insert new List<Case>{
            new Case(ContactId = c.Id, Subject = 'Buyer', Description = 'orig'),
            new Case(ContactId = c.Id, Subject = 'Other', Description = 'orig')
        };
        return c;
    }

    private static Case caseNamed(Id contactId, String subject) {
        return [
            SELECT Id, Description
            FROM Case
            WHERE ContactId = :contactId AND Subject = :subject
            LIMIT 1
        ];
    }

    @IsTest
    static void theListShowsOnlyCasesMatchingTheContactsOwnField() {
        Contact c = contact('Buyer');
        Id v = version();
        Test.startTest();
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Test.stopTest();
        Assert.isNull(lists[0].error);
        Assert.areEqual(1, lists[0].total);
        Assert.areEqual(caseNamed(c.Id, 'Buyer').Id, lists[0].rows[0].id);
    }

    @IsTest
    static void aBlankContactValueMatchesNothingAndDoesNotBreakTheList() {
        Contact c = contact(null);
        Id v = version();
        List<FinalRelatedListService.RelatedList> lists = FinalRelatedListService.load(
            v,
            c.Id
        );
        Assert.isNull(lists[0].error);
        Assert.areEqual(0, lists[0].total);
    }

    @IsTest
    static void theSaveJudgesMembershipOnTheContactAsStored() {
        Contact c = contact('Buyer');
        Id v = version();
        Case member = caseNamed(c.Id, 'Buyer');
        Case outsider = caseNamed(c.Id, 'Other');

        // the Title changes in the same Save: membership is judged on the
        // Contact as stored, so the Buyer case is still the list's
        String ok = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_title' => 'Seller' },
                'repeats' => new Map<String, Object>{
                    'sec_l' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => member.Id,
                            'sec_l_desc' => 'changed'
                        }
                    }
                },
                'meta' => new Map<String, Object>{ 'existingRecordId' => c.Id }
            }
        );
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            v,
            ok
        );
        Assert.isTrue(
            res.errors == null || res.errors.isEmpty(),
            JSON.serialize(res)
        );
        Assert.areEqual('changed', caseNamed(c.Id, 'Buyer').Description);

        // a Case outside the list can't be changed through it
        String sneaky = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_title' => 'Buyer' },
                'repeats' => new Map<String, Object>{
                    'sec_l' => new List<Object>{
                        new Map<String, Object>{
                            '$id' => outsider.Id,
                            'sec_l_desc' => 'sneaky'
                        }
                    }
                },
                'meta' => new Map<String, Object>{ 'existingRecordId' => c.Id }
            }
        );
        try {
            res = FinalSubmitController.submitForm(null, v, sneaky);
            Assert.isFalse(res.errors == null || res.errors.isEmpty());
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
        }
        Assert.areEqual('orig', caseNamed(c.Id, 'Other').Description);
    }

    @IsTest
    static void recordValuesReadOnlyRealReadableFields() {
        Contact c = new Contact(LastName = 'Vals', Title = 'Chef');
        insert c;
        Map<String, Object> show = new Map<String, Object>{
            'filter' => new Map<String, Object>{
                'rows' => new List<Object>{
                    new Map<String, Object>{
                        'fieldPath' => 'Subject',
                        'operator' => 'eq',
                        'value' => '$record.Title'
                    },
                    new Map<String, Object>{
                        'fieldPath' => 'Subject',
                        'operator' => 'eq',
                        'value' => '$record.No_Such__c'
                    }
                }
            }
        };
        Map<String, Object> vals = FinalLookupService.recordValues(
            show,
            'Contact',
            c.Id
        );
        Assert.areEqual('Chef', vals.get('$record.Title'));
        Assert.isFalse(vals.containsKey('$record.No_Such__c'));
        Assert.areEqual(
            'a condition compares with "No_Such__c", which isn’t a field of Contact.',
            FinalLookupService.recordPathProblem(show, 'Contact')
        );
        Assert.isNull(
            FinalLookupService.recordPathProblem(
                subjectIsContactTitle(),
                'Contact'
            )
        );
    }

    @IsTest
    static void publishRefusesAConditionOnAFieldTheFormObjectLacks() {
        Form__c f = new Form__c(
            Name = 'Publish main record',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            [SELECT Spec_JSON__c FROM Form_Version__c WHERE Id = :version()]
            .Spec_JSON__c
        );
        Map<String, Object> grp = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                'pages'
            ))[0])
            .get('sections'))[1];
        Map<String, Object> row = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) grp.get(
                        'repeat'
                    ))
                    .get('show'))
                .get('filter'))
            .get('rows'))[0];
        row.put('value', '$record.No_Such__c');
        spec.put(
            'resolved',
            new Map<String, Object>{
                'tokens' => new Map<String, Object>{ '--c-text' => '#000' }
            }
        );
        try {
            FinalSpecController.publishSpec(f.Id, JSON.serialize(spec));
            Assert.fail('a condition on a missing field must not publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().contains('No_Such__c'),
                e.getMessage()
            );
        }
    }
}
