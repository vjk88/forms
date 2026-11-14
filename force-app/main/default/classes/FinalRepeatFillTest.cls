/**
 * Fill on new records (IMPL_PLAN_RELATED_RECORDS P2.6): the save sets the
 * fills on every new row after the person's answers, copies main-record
 * fields as the signed-in person (a guest only gets what the form wrote),
 * never touches blank rows; Publish refuses fills that can't work; the
 * Studio offers only main-record fields with the same kind of value.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRepeatFillTest {
    private static Map<String, Object> el(String id, String obj, String field) {
        return new Map<String, Object>{
            'id' => id,
            'type' => 'field',
            'label' => field,
            'binding' => new Map<String, Object>{
                'object' => obj,
                'field' => field
            }
        };
    }

    private static Map<String, Object> spec(List<Object> fills) {
        Map<String, Object> repeat = new Map<String, Object>{
            'childObject' => 'Case',
            'relationshipField' => 'ContactId',
            'min' => 0,
            'fill' => fills
        };
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'targetObject' => 'Contact' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => new List<Object>{
                                el('el_ln', 'Contact', 'LastName'),
                                el('el_em', 'Contact', 'Email')
                            }
                        },
                        new Map<String, Object>{
                            'id' => 'sec_rep',
                            'title' => 'Cases',
                            'repeat' => repeat,
                            'elements' => new List<Object>{
                                el('el_subj', 'Case', 'Subject')
                            }
                        }
                    }
                }
            }
        };
    }

    private static List<Object> fills() {
        return new List<Object>{
            new Map<String, Object>{ 'field' => 'Origin', 'value' => 'Web' },
            new Map<String, Object>{
                'field' => 'SuppliedEmail',
                'from' => 'Email'
            },
            new Map<String, Object>{
                'field' => 'SuppliedPhone',
                'from' => 'Phone'
            }
        };
    }

    private static Map<String, Object> body(
        String lastName,
        List<Object> rows
    ) {
        return new Map<String, Object>{
            'answers' => new Map<String, Object>{
                'el_ln' => lastName,
                'el_em' => 'fill@example.com'
            },
            'repeats' => new Map<String, Object>{ 'sec_rep' => rows }
        };
    }

    private static List<Case> casesOf(String lastName) {
        return [
            SELECT Subject, Origin, SuppliedEmail, SuppliedPhone
            FROM Case
            WHERE Contact.LastName = :lastName
            ORDER BY Subject
        ];
    }

    // ------------------------------------------------------------ the save

    @IsTest
    static void newRowsGetFixedValuesAndTheMainRecordsFields() {
        Map<String, Object> s = spec(fills());
        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            s,
            body(
                'FillSignedIn',
                new List<Object>{
                    new Map<String, Object>{ 'el_subj' => 'A' },
                    new Map<String, Object>{ 'el_subj' => '' },
                    new Map<String, Object>{ 'el_subj' => 'B' }
                }
            ),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();
        Assert.isNotNull(res.recordId, JSON.serialize(res));
        List<Case> rows = casesOf('FillSignedIn');
        // the blank row stays blank: a fill alone never makes a record
        Assert.areEqual(2, rows.size());
        for (Case c : rows) {
            Assert.areEqual('Web', c.Origin);
            Assert.areEqual('fill@example.com', c.SuppliedEmail);
            // the Contact's Phone was blank: nothing to copy
            Assert.isNull(c.SuppliedPhone);
        }
    }

    @IsTest
    static void aGuestCopiesOnlyWhatTheFormWrote() {
        Contact other = new Contact(LastName = 'Other', Phone = '555-0100');
        insert other;
        Map<String, Object> s = spec(fills());
        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            s,
            body(
                'FillGuest',
                new List<Object>{ new Map<String, Object>{ 'el_subj' => 'G' } }
            ),
            FinalSubmitService.Posture.GUEST
        );
        Test.stopTest();
        Assert.isNotNull(res.recordId);
        Case c = casesOf('FillGuest')[0];
        Assert.areEqual('Web', c.Origin);
        Assert.areEqual('fill@example.com', c.SuppliedEmail);
        Assert.isNull(c.SuppliedPhone);
    }

    @IsTest
    static void parentValuesReadOnlyTheWrittenFieldsForAGuest() {
        Contact written = new Contact(LastName = 'W', Email = 'w@example.com');
        Map<String, Object> vals = FinalRepeatFill.parentValues(
            Contact.SObjectType,
            null,
            written,
            new Set<String>{ 'Email', 'Phone' },
            true
        );
        Assert.areEqual('w@example.com', vals.get('Email'));
        Assert.isFalse(vals.containsKey('Phone'));
    }

    @IsTest
    static void aFillThatNoLongerFitsIsSkippedNotACrash() {
        Map<String, Object> s = spec(
            new List<Object>{
                new Map<String, Object>{
                    'field' => 'No_Such__c',
                    'value' => 'x'
                },
                new Map<String, Object>{ 'field' => 'Origin', 'value' => 'Web' }
            }
        );
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            s,
            body(
                'FillDrift',
                new List<Object>{ new Map<String, Object>{ 'el_subj' => 'D' } }
            ),
            FinalSubmitService.Posture.INTERNAL
        );
        Assert.isNotNull(res.recordId);
        Assert.areEqual('Web', casesOf('FillDrift')[0].Origin);
    }

    // ------------------------------------------------------------ publish

    private static String problemFor(List<Object> fillList) {
        Map<String, Object> s = spec(fillList);
        Map<String, Object> sec = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) s.get(
                'pages'
            ))[0])
            .get('sections'))[1];
        return FinalRepeatFill.problem(
            (Map<String, Object>) sec.get('repeat'),
            (List<Object>) sec.get('elements'),
            'Contact',
            'Case'
        );
    }

    private static Map<String, Object> fixed(String field, Object value) {
        return new Map<String, Object>{ 'field' => field, 'value' => value };
    }

    @IsTest
    static void publishAcceptsGoodFills() {
        Assert.isNull(problemFor(fills()));
        Assert.isNull(problemFor(null));
    }

    @IsTest
    static void publishRefusesFillsThatCantWork() {
        Assert.isTrue(
            problemFor(new List<Object>{ fixed('No_Such__c', 'x') })
                .contains('is not a field of Case'),
            'unknown field'
        );
        Assert.isTrue(
            problemFor(new List<Object>{ fixed('ContactId', 'x') })
                .contains('links each Case'),
            'the link field'
        );
        Assert.isTrue(
            problemFor(new List<Object>{ fixed('Subject', 'x') })
                .contains('is a question in the group'),
            'a question'
        );
        Assert.isTrue(
            problemFor(new List<Object>{ fixed('Origin', 'Carrier pigeon') })
                .contains('isn’t one of its choices'),
            'a picklist value'
        );
        Assert.isTrue(
            problemFor(new List<Object>{ fixed('Origin', '') })
                .contains('needs a value'),
            'blank'
        );
        Assert.isTrue(
            problemFor(
                    new List<Object>{ fixed('AccountId', '001000000000000') }
                )
                .contains('can only be filled from the main record'),
            'a fixed lookup'
        );
        Assert.isTrue(
            problemFor(
                    new List<Object>{
                        fixed('Origin', 'Web'),
                        fixed('Origin', 'Web')
                    }
                )
                .contains('filled twice'),
            'twice'
        );
        Assert.isTrue(
            problemFor(
                    new List<Object>{
                        new Map<String, Object>{
                            'field' => 'SuppliedEmail',
                            'from' => 'Birthdate'
                        }
                    }
                )
                .contains('different kinds of value'),
            'a date into an email'
        );
        Assert.isTrue(
            problemFor(
                    new List<Object>{
                        new Map<String, Object>{
                            'field' => 'SuppliedEmail',
                            'from' => 'Nope__c'
                        }
                    }
                )
                .contains('not a field of Contact'),
            'an unknown source'
        );
    }

    @IsTest
    static void publishSpecRefusesABadFill() {
        Form__c f = new Form__c(
            Name = 'Fill publish',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> s = spec(
            new List<Object>{ fixed('Origin', 'Carrier pigeon') }
        );
        s.put(
            'resolved',
            new Map<String, Object>{
                'tokens' => new Map<String, Object>{ '--c-text' => '#000' }
            }
        );
        try {
            FinalSpecController.publishSpec(f.Id, JSON.serialize(s));
            Assert.fail('a bad fill must not publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().startsWith('“Cases” can’t be published: '),
                e.getMessage()
            );
        }
    }

    @IsTest
    static void valuesAreCheckedByType() {
        Map<String, Schema.SObjectField> caseFields = Case.SObjectType.getDescribe()
            .fields.getMap();
        Assert.isNull(
            FinalRepeatFill.valueProblem(
                caseFields.get('IsEscalated').getDescribe(),
                true
            )
        );
        Assert.isNotNull(
            FinalRepeatFill.valueProblem(
                caseFields.get('IsEscalated').getDescribe(),
                'yes'
            )
        );
        Map<String, Schema.SObjectField> contactFields = Contact.SObjectType.getDescribe()
            .fields.getMap();
        Assert.isNull(
            FinalRepeatFill.valueProblem(
                contactFields.get('Birthdate').getDescribe(),
                '2026-01-31'
            )
        );
        Assert.areEqual(
            'needs a date.',
            FinalRepeatFill.valueProblem(
                contactFields.get('Birthdate').getDescribe(),
                '31/01/2026'
            )
        );
    }

    // ------------------------------------------------------------- studio

    @IsTest
    static void theStudioOffersOnlyTheSameKindOfValue() {
        Set<String> forEmail = new Set<String>();
        for (
            Map<String, Object> row : FinalStudioController.describeFillSources(
                'Contact',
                'Case',
                'SuppliedEmail'
            )
        ) {
            forEmail.add((String) row.get('apiName'));
        }
        Assert.isTrue(forEmail.contains('Email'));
        Assert.isFalse(forEmail.contains('Birthdate'));
        Assert.isFalse(forEmail.contains('LastName'));

        Set<String> forAccount = new Set<String>();
        for (
            Map<String, Object> row : FinalStudioController.describeFillSources(
                'Contact',
                'Case',
                'AccountId'
            )
        ) {
            forAccount.add((String) row.get('apiName'));
        }
        Assert.isTrue(forAccount.contains('AccountId'));
        Assert.isFalse(forAccount.contains('ReportsToId'), 'a Contact lookup');
        try {
            FinalStudioController.describeFillSources('Contact', 'Case', '');
            Assert.fail('a field is required');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
        }
    }
}
