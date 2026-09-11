/**
 * Submit-time enforcement of lookup filters
 * (IMPL_PLAN_DEPENDENT_LOOKUP §8, slice 4).
 *
 * These tests go through FinalSubmitService, not through FinalLookupPolicy
 * directly, because the claim being defended is that a form REFUSES TO SAVE a
 * selection the filter does not allow. A policy that returns the right verdict
 * into a void would pass a unit test and change nothing.
 *
 * Fixture is the same manager-and-report shape as FinalLookupPolicyTest, for
 * the same reasons recorded there.
 */
@isTest
private class FinalLookupSubmitTest {
    private static final String SRC = 'el_manager';
    private static final String DEP = 'el_report';

    private static Map<String, Object> spec() {
        Map<String, Object> manager = new Map<String, Object>{
            'id' => SRC,
            'type' => 'field',
            'label' => 'Manager',
            'binding' => new Map<String, Object>{
                'object' => 'Case',
                'field' => 'ContactId'
            },
            'config' => new Map<String, Object>{ 'inputType' => 'reference' }
        };
        Map<String, Object> report = new Map<String, Object>{
            'id' => DEP,
            'type' => 'field',
            'label' => 'Team member',
            'binding' => new Map<String, Object>{
                'object' => 'Case',
                'field' => 'ContactId'
            },
            'config' => new Map<String, Object>{ 'inputType' => 'reference' },
            'lookupConfig' => new Map<String, Object>{
                'version' => 1,
                'filter' => new Map<String, Object>{
                    'mode' => 'all',
                    'criteria' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'lc_1',
                            'fieldPath' => 'ReportsToId',
                            'operator' => 'eq',
                            'value' => new Map<String, Object>{
                                'kind' => 'answer',
                                'elementId' => SRC
                            }
                        }
                    }
                }
            }
        };
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'type' => 'form',
                'targetObject' => 'Case'
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => new List<Object>{ manager, report }
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> payload(Id managerId, Id selectedId) {
        Map<String, Object> answers = new Map<String, Object>();
        if (managerId != null) {
            answers.put(SRC, String.valueOf(managerId));
        }
        if (selectedId != null) {
            answers.put(DEP, String.valueOf(selectedId));
        }
        return new Map<String, Object>{ 'answers' => answers };
    }

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
    static void savesASelectionTheFilterAllows() {
        List<Contact> t = team();

        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            spec(),
            payload(t[0].Id, t[1].Id),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        System.assertEquals(
            null,
            res.errors,
            'A legitimate selection must save without complaint.'
        );
        System.assertNotEquals(null, res.recordId, 'The record should exist.');
    }

    @isTest
    static void refusesATamperedSelectionAndWritesNothing() {
        List<Contact> t = team();
        Integer before = [SELECT COUNT() FROM Case];

        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            spec(),
            // Claims one manager, submits the other manager's report. The
            // client would never build this; a hand-made payload would.
            payload(t[0].Id, t[2].Id),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        System.assertNotEquals(null, res.errors, 'The save must be refused.');
        System.assertEquals(1, res.errors.size());
        System.assert(
            res.errors[0].message.contains('Team member'),
            'The complaint should name the question: ' + res.errors[0].message
        );
        System.assertEquals(
            new List<String>{ 'ContactId' },
            res.errors[0].fields,
            'It should blame the bound field, the way DML rejections do.'
        );
        System.assertEquals(null, res.recordId);
        System.assertEquals(
            before,
            [SELECT COUNT() FROM Case],
            'A refused submission must commit nothing at all.'
        );
    }

    @isTest
    static void refusesWhenTheControllingAnswerIsMissing() {
        List<Contact> t = team();

        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            spec(),
            // Omitting the parent would, if the criterion were dropped, widen
            // the filter to every contact in the org.
            payload(null, t[1].Id),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        System.assertNotEquals(null, res.errors);
        System.assert(
            res.errors[0].message.contains('depends on'),
            'It should say what to fix: ' + res.errors[0].message
        );
    }

    @isTest
    static void tellsAGuestNothingAboutWhichQuestionFailed() {
        List<Contact> t = team();
        Boolean threw = false;
        String message;

        Test.startTest();
        try {
            FinalSubmitService.run(
                spec(),
                payload(t[0].Id, t[2].Id),
                FinalSubmitService.Posture.GUEST
            );
        } catch (Exception e) {
            threw = true;
            message = e.getMessage();
        }
        Test.stopTest();

        System.assert(threw, 'A guest submission must be refused.');
        System.assert(
            !message.contains('Team member') && !message.contains('ContactId'),
            'A public form must not become a probe: ' + message
        );
    }

    @isTest
    static void leavesAnUnfilteredFormCompletelyAlone() {
        List<Contact> t = team();
        Map<String, Object> plain = spec();
        // Strip the filter: this is every form that exists today.
        List<Object> elements = (List<Object>) ((Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) plain.get(
                    'pages'
                ))[0])
                .get('sections'))[0])
            .get('elements');
        ((Map<String, Object>) elements[1]).remove('lookupConfig');

        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            plain,
            // The "wrong" contact, which without a filter is simply a contact.
            payload(t[0].Id, t[2].Id),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        System.assertEquals(
            null,
            res.errors,
            'A form with no lookup filter must behave exactly as before.'
        );
        System.assertNotEquals(null, res.recordId);
    }

    @isTest
    static void acceptsAnEmptyOptionalLookup() {
        List<Contact> t = team();

        Test.startTest();
        FinalSubmitService.SubmitOutcome res = FinalSubmitService.run(
            spec(),
            payload(t[0].Id, null),
            FinalSubmitService.Posture.INTERNAL
        );
        Test.stopTest();

        System.assertEquals(
            null,
            res.errors,
            'Leaving an optional lookup blank is not an offence.'
        );
    }
}
