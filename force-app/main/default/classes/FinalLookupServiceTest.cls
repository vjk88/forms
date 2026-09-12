/**
 * Contact-only fixtures, on purpose.
 *
 * Account inserts fail in this org (an always-true validation rule), and
 * Work_History__c looked like the alternative until the runtime describe said
 * otherwise: it carries only `Name` and `Job_Application__c`, its `Title__c`
 * lives in an untracked metadata file that was never deployed, and its `Name`
 * is auto-number, so a typed value never lands and every search misses.
 *
 * Contact has real writable fields and a self-relationship (ReportsTo), which
 * exercises traversal without needing a second object at all.
 */
@isTest
private class FinalLookupServiceTest {
    private static Map<String, Object> cfg(String obj, List<Object> rows) {
        return new Map<String, Object>{
            'targetObject' => obj,
            'displayFields' => new List<Object>{ 'LastName' },
            'searchFields' => new List<Object>{ 'LastName' },
            'filter' => new Map<String, Object>{
                'logic' => 'all',
                'rows' => rows
            }
        };
    }

    private static Map<String, Object> row(
        String path,
        String op,
        Object value
    ) {
        return new Map<String, Object>{
            'fieldPath' => path,
            'operator' => op,
            'value' => value
        };
    }

    private static Map<String, Object> setup() {
        Contact boss = new Contact(LastName = 'Zimmerman');
        Contact other = new Contact(LastName = 'Okafor');
        insert new List<Contact>{ boss, other };
        Contact underBoss = new Contact(
            LastName = 'Principalson',
            ReportsToId = boss.Id
        );
        Contact underOther = new Contact(
            LastName = 'Principalsen',
            ReportsToId = other.Id
        );
        insert new List<Contact>{ underBoss, underOther };
        return new Map<String, Object>{
            'boss' => boss.Id,
            'other' => other.Id,
            'a' => underBoss.Id,
            'b' => underOther.Id
        };
    }

    // ------------------------------------------------------------ filtering

    @isTest
    static void filtersByAnotherAnswer() {
        Map<String, Object> ids = setup();
        Map<String, Object> c = cfg(
            'Contact',
            new List<Object>{ row('ReportsToId', 'eq', '$field.el_mgr') }
        );
        Map<String, Object> answers = new Map<String, Object>{
            'el_mgr' => ids.get('boss')
        };
        Test.startTest();
        List<FinalLookupService.Row> found = FinalLookupService.search(
            c,
            'Principals',
            answers
        );
        Test.stopTest();
        System.assertEquals(1, found.size(), 'only that manager2 report');
        System.assertEquals('Principalson', found[0].title);
    }

    @isTest
    static void missingControllingAnswerReturnsNothingNotEverything() {
        setup();
        Map<String, Object> c = cfg(
            'Contact',
            new List<Object>{ row('ReportsToId', 'eq', '$field.el_mgr') }
        );
        Test.startTest();
        List<FinalLookupService.Row> found = FinalLookupService.search(
            c,
            'Principals',
            new Map<String, Object>()
        );
        FinalLookupService.Compiled comp = FinalLookupService.compile(
            c,
            new Map<String, Object>(),
            'Contact'
        );
        Test.stopTest();
        System.assertEquals(0, found.size(), 'a blocked filter finds nothing');
        System.assert(comp.blocked, 'and says so rather than widening');
    }

    @isTest
    static void traversesRelationshipsWrittenEitherWay() {
        setup();
        // The same hop, spelled as the relationship and as the field. Authors
        // disagree about which is natural, so both must resolve.
        for (String path : new List<String>{
            'ReportsTo.LastName',
            'ReportsToId.LastName'
        }) {
            Map<String, Object> c = cfg(
                'Contact',
                new List<Object>{ row(path, 'eq', 'Zimmerman') }
            );
            List<FinalLookupService.Row> found = FinalLookupService.search(
                c,
                'Principals',
                new Map<String, Object>()
            );
            System.assertEquals(
                1,
                found.size(),
                'relationship filter via ' + path
            );
            System.assertEquals('Principalson', found[0].title);
        }
    }

    @isTest
    static void unknownFieldPathBlocksBeforeReachingSoql() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            cfg(
                'Contact',
                new List<Object>{ row('Definitely_Not__c', 'eq', 'x') }
            ),
            new Map<String, Object>(),
            'Contact'
        );
        System.assert(c.blocked, 'an unknown path must block');
        System.assert(
            c.blockedReason.contains('Definitely_Not__c'),
            'and name the offender: ' + c.blockedReason
        );
        System.assertEquals(null, c.whereClause);
    }

    @isTest
    static void booleanFalseIsAnAnswerNotAnAbsence() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            cfg(
                'Contact',
                new List<Object>{ row('IsEmailBounced', 'eq', false) }
            ),
            new Map<String, Object>(),
            'Contact'
        );
        System.assert(!c.blocked, 'false is a value: ' + c.blockedReason);
        System.assertEquals(false, c.binds.get('b0'));
    }

    @isTest
    static void multiValueOperatorBindsAList() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            new Map<String, Object>{
                'targetObject' => 'Contact',
                'filter' => new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{
                        new Map<String, Object>{
                            'fieldPath' => 'LeadSource',
                            'operator' => 'in',
                            'values' => new List<Object>{ 'Web', 'Phone' }
                        }
                    }
                }
            },
            new Map<String, Object>(),
            'Contact'
        );
        System.assert(!c.blocked, c.blockedReason);
        System.assert(c.whereClause.contains('IN :b0'), c.whereClause);
        System.assertEquals(
            new List<String>{ 'Web', 'Phone' },
            (List<String>) c.binds.get('b0')
        );
    }

    @isTest
    static void blankOperatorsNeedNoValue() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            new Map<String, Object>{
                'targetObject' => 'Contact',
                'filter' => new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{
                        new Map<String, Object>{
                            'fieldPath' => 'Title',
                            'operator' => 'isNotBlank'
                        }
                    }
                }
            },
            new Map<String, Object>(),
            'Contact'
        );
        System.assert(!c.blocked, c.blockedReason);
        System.assertEquals('Title != NULL', c.whereClause);
    }

    @isTest
    static void searchIgnoresTermsBelowTheMinimum() {
        setup();
        System.assertEquals(
            0,
            FinalLookupService.search(
                    cfg('Contact', new List<Object>()),
                    'P',
                    new Map<String, Object>()
                )
                .size(),
            'one character is not a search'
        );
    }

    @isTest
    static void wildcardsTypedByAUserAreLiteral() {
        setup();
        // A typed '%' must not become "match everything".
        System.assertEquals(
            0,
            FinalLookupService.search(
                    cfg('Contact', new List<Object>()),
                    '%%',
                    new Map<String, Object>()
                )
                .size(),
            'a typed percent is a character, not a wildcard'
        );
    }

    // -------------------------------------------------------------- verify

    @isTest
    static void verifyAcceptsQualifyingAndRefusesTheRest() {
        Map<String, Object> ids = setup();
        Map<String, Object> c = cfg(
            'Contact',
            new List<Object>{ row('ReportsToId', 'eq', '$field.el_mgr') }
        );
        Map<String, Object> answers = new Map<String, Object>{
            'el_mgr' => ids.get('boss')
        };
        Test.startTest();
        Set<Id> ok = FinalLookupService.verify(
            c,
            new Set<Id>{ (Id) ids.get('a'), (Id) ids.get('b') },
            answers
        );
        Test.stopTest();
        System.assert(ok.contains((Id) ids.get('a')), 'qualifying row kept');
        System.assert(
            !ok.contains((Id) ids.get('b')),
            'the other manager report is refused'
        );
    }

    @isTest
    static void verifyRefusesAnIdOfTheWrongObject() {
        setup();
        Set<Id> ok = FinalLookupService.verify(
            cfg('Contact', new List<Object>()),
            new Set<Id>{ UserInfo.getUserId() }, // a User, not a Contact
            new Map<String, Object>()
        );
        System.assertEquals(0, ok.size(), 'wrong object can never qualify');
    }

    @isTest
    static void verifyRefusesEverythingWhenTheFilterCannotCompile() {
        Map<String, Object> ids = setup();
        Set<Id> ok = FinalLookupService.verify(
            cfg(
                'Contact',
                new List<Object>{ row('ReportsToId', 'eq', '$field.el_missing') }
            ),
            new Set<Id>{ (Id) ids.get('a') },
            new Map<String, Object>()
        );
        System.assertEquals(
            0,
            ok.size(),
            'an uncompilable filter disqualifies, it does not pass'
        );
    }

    // --------------------------------------------------------- custom logic

    @isTest
    static void customLogicCombinesWithCorrectPrecedence() {
        List<String> pieces = new List<String>{ 'A = 1', 'B = 2', 'C = 3' };
        System.assertEquals(
            '(A = 1 AND (B = 2 OR C = 3))',
            FinalLookupLogic.combine('1 AND (2 OR 3)', pieces)
        );
        // AND binds tighter than OR, same as the browser evaluator
        System.assertEquals(
            '(A = 1 OR (B = 2 AND C = 3))',
            FinalLookupLogic.combine('1 OR 2 AND 3', pieces)
        );
    }

    @isTest
    static void malformedLogicReturnsNullSoTheCallerCanBlock() {
        List<String> pieces = new List<String>{ 'A = 1', 'B = 2' };
        for (String bad : new List<String>{
            '1 AND (2',
            '1 AND 9',
            '1 AND DELETE',
            '',
            '1 2',
            'AND 1'
        }) {
            System.assertEquals(
                null,
                FinalLookupLogic.combine(bad, pieces),
                'must reject: ' + bad
            );
        }
    }

    @isTest
    static void malformedLogicBlocksTheWholeFilter() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            new Map<String, Object>{
                'targetObject' => 'Contact',
                'filter' => new Map<String, Object>{
                    'logic' => 'custom',
                    'customLogic' => '1 AND (2',
                    'rows' => new List<Object>{
                        row('LastName', 'eq', 'x'),
                        row('FirstName', 'eq', 'y')
                    }
                }
            },
            new Map<String, Object>(),
            'Contact'
        );
        System.assert(c.blocked, 'malformed logic must block');
        System.assertEquals(null, c.whereClause);
    }

    @isTest
    static void customLogicActuallyWidensTheSearch() {
        Map<String, Object> ids = setup();
        // "reports to the boss OR is named Principalsen" must find both.
        Map<String, Object> c = new Map<String, Object>{
            'targetObject' => 'Contact',
            'displayFields' => new List<Object>{ 'LastName' },
            'searchFields' => new List<Object>{ 'LastName' },
            'filter' => new Map<String, Object>{
                'logic' => 'custom',
                'customLogic' => '1 OR 2',
                'rows' => new List<Object>{
                    row('ReportsToId', 'eq', '$field.el_mgr'),
                    row('LastName', 'eq', 'Principalsen')
                }
            }
        };
        Test.startTest();
        List<FinalLookupService.Row> found = FinalLookupService.search(
            c,
            'Principals',
            new Map<String, Object>{ 'el_mgr' => ids.get('boss') }
        );
        Test.stopTest();
        System.assertEquals(2, found.size(), 'OR must reach both rows');
    }

    @isTest
    static void anyLogicJoinsWithOr() {
        FinalLookupService.Compiled c = FinalLookupService.compile(
            new Map<String, Object>{
                'targetObject' => 'Contact',
                'filter' => new Map<String, Object>{
                    'logic' => 'any',
                    'rows' => new List<Object>{
                        row('LastName', 'eq', 'x'),
                        row('FirstName', 'eq', 'y')
                    }
                }
            },
            new Map<String, Object>(),
            'Contact'
        );
        System.assertEquals('LastName = :b0 OR FirstName = :b1', c.whereClause);
    }

    // ----------------------------------------------------------- authoring

    @isTest
    static void describeOffersFilterableFieldsAndOneHop() {
        Map<String, Object> out = FinalLookupController.describeLookupFields(
            'Contact',
            null
        );
        List<Map<String, Object>> fields = (List<Map<String, Object>>) out.get(
            'fields'
        );
        List<Map<String, Object>> rels = (List<Map<String, Object>>) out.get(
            'relationships'
        );
        System.assert(!fields.isEmpty(), 'Contact has filterable fields');
        System.assert(!rels.isEmpty(), 'and at least one lookup to drill into');
        Boolean sawPicklistValues = false;
        for (Map<String, Object> f : fields) {
            List<String> vals = (List<String>) f.get('picklistValues');
            if (!vals.isEmpty()) {
                sawPicklistValues = true;
            }
        }
        System.assert(
            sawPicklistValues,
            'picklist fields carry their values so the editor can offer a dropdown'
        );
    }

    @isTest
    static void describeCanFollowOneRelationship() {
        Map<String, Object> out = FinalLookupController.describeLookupFields(
            'Contact',
            'ReportsTo'
        );
        List<Map<String, Object>> fields = (List<Map<String, Object>>) out.get(
            'fields'
        );
        Boolean prefixed = false;
        for (Map<String, Object> f : fields) {
            if (((String) f.get('path')).startsWith('ReportsTo.')) {
                prefixed = true;
            }
        }
        System.assert(prefixed, 'hopped fields carry their full path');
    }

    @isTest
    static void describeRefusesAnUnknownObject() {
        try {
            FinalLookupController.describeLookupFields('Not_A_Thing__c', null);
            System.assert(false, 'should have thrown');
        } catch (Exception e) {
            System.assert(
                e instanceof AuraHandledException,
                'got ' + e.getTypeName()
            );
        }
    }

    @isTest
    static void searchRefusesAFormThatIsNotPublished() {
        try {
            FinalLookupController.search(null, null, 'el_x', 'abc', '{}');
            System.assert(false, 'should have thrown');
        } catch (Exception e) {
            System.assert(
                e instanceof AuraHandledException,
                'got ' + e.getTypeName()
            );
        }
    }

    // ------------------------------------------ the published-spec boundary

    /** A published form whose one element carries a lookupConfig. */
    private static Form_Version__c publishedForm(Boolean allowGuest) {
        Form__c f = new Form__c(
            Name = 'Lookup Form',
            Form_Type__c = 'Form',
            Status__c = 'Published',
            Allowed_Adapters__c = 'Public_Guest',
            // VR_Primary_Object_Required (ACTIVE): a Form-typed record must
            // carry its primary object or the insert is rejected.
            Primary_Context_Object__c = 'Job_Application__c'
        );
        insert f;
        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{
                'type' => 'form',
                'targetObject' => 'Job_Application__c'
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec1',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_contact',
                                    'type' => 'field',
                                    'lookupConfig' => new Map<String, Object>{
                                        'targetObject' => 'Contact',
                                        'displayFields' => new List<Object>{
                                            'LastName'
                                        },
                                        'searchFields' => new List<Object>{
                                            'LastName'
                                        },
                                        'allowGuest' => allowGuest,
                                        'filter' => new Map<String, Object>{
                                            'logic' => 'all',
                                            'rows' => new List<Object>()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        insert v;
        return v;
    }

    @isTest
    static void searchReadsItsConfigFromThePublishedSpec() {
        setup();
        Form_Version__c v = publishedForm(false);
        Test.startTest();
        List<FinalLookupService.Row> found = FinalLookupController.search(
            v.Form__c,
            v.Id,
            'el_contact',
            'Principals',
            '{}'
        );
        Test.stopTest();
        System.assertEquals(2, found.size(), 'both Principals contacts');
    }

    @isTest
    static void searchRefusesAnElementWithNoLookupConfig() {
        Form_Version__c v = publishedForm(false);
        try {
            FinalLookupController.search(
                v.Form__c,
                v.Id,
                'el_not_a_lookup',
                'abc',
                '{}'
            );
            System.assert(false, 'should have thrown');
        } catch (Exception e) {
            System.assert(
                e instanceof AuraHandledException,
                'got ' + e.getTypeName()
            );
        }
    }

    @isTest
    static void searchRefusesAVersionThatIsNoLongerActive() {
        Form_Version__c v = publishedForm(false);
        v.Is_Active__c = false;
        update v;
        try {
            FinalLookupController.search(
                v.Form__c,
                v.Id,
                'el_contact',
                'abc',
                '{}'
            );
            System.assert(false, 'should have thrown');
        } catch (Exception e) {
            System.assert(
                e instanceof AuraHandledException,
                'got ' + e.getTypeName()
            );
        }
    }

    @isTest
    static void malformedAnswersJsonIsIgnoredRatherThanFatal() {
        setup();
        Form_Version__c v = publishedForm(false);
        // A broken payload must not take the form down. It resolves no tokens,
        // and any filter that needed one would block on its own.
        List<FinalLookupService.Row> found = FinalLookupController.search(
            v.Form__c,
            v.Id,
            'el_contact',
            'Principals',
            'not json at all'
        );
        System.assertEquals(2, found.size());
    }
}
