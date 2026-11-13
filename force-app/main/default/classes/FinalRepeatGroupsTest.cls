/**
 * Repeating groups on the server (IMPL_PLAN_RELATED_RECORDS Part 1, §4–§7):
 * the minimum for groups no rule can hide, the 50-entry cap on the raw list,
 * limits that can't be met, the row budget (topic links included), refused
 * related records naming their entry, the publish gate, and the picker's
 * hidden system objects.
 *
 * Contact → Case on purpose: this dev org refuses every Account insert.
 */
@IsTest
private class FinalRepeatGroupsTest {
    // ------------------------------------------------------------ fixtures

    private static Map<String, Object> caseGroup(
        Map<String, Object> repeatExtra,
        Map<String, Object> visibility
    ) {
        Map<String, Object> repeat = new Map<String, Object>{
            'childObject' => 'Case',
            'relationshipField' => 'ContactId'
        };
        if (repeatExtra != null) {
            repeat.putAll(repeatExtra);
        }
        Map<String, Object> sec = new Map<String, Object>{
            'id' => 'sec_rep',
            'title' => 'Cases',
            'repeat' => repeat,
            'elements' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'el_subj',
                    'type' => 'field',
                    'label' => 'Subject',
                    'binding' => new Map<String, Object>{
                        'object' => 'Case',
                        'field' => 'Subject'
                    }
                }
            }
        };
        if (visibility != null) {
            sec.put('visibility', visibility);
        }
        return sec;
    }

    private static Map<String, Object> rule() {
        return new Map<String, Object>{
            'action' => 'show',
            'logic' => 'all',
            'rules' => new List<Object>{
                new Map<String, Object>{
                    'source' => 'el_ln',
                    'operator' => 'equals',
                    'value' => 'Show'
                }
            }
        };
    }

    private static Map<String, Object> formSpec(
        Map<String, Object> grp,
        Map<String, Object> pageVisibility
    ) {
        Map<String, Object> page = new Map<String, Object>{
            'id' => 'pg_1',
            'sections' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_1',
                    'elements' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'el_ln',
                            'type' => 'field',
                            'label' => 'Last Name',
                            'binding' => new Map<String, Object>{
                                'object' => 'Contact',
                                'field' => 'LastName'
                            }
                        }
                    }
                },
                grp
            }
        };
        if (pageVisibility != null) {
            page.put('visibility', pageVisibility);
        }
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'targetObject' => 'Contact' },
            'pages' => new List<Object>{ page }
        };
    }

    private static Id activeVersion(Map<String, Object> spec) {
        Form__c f = new Form__c(
            Name = 'Groups test',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = JSON.serialize(spec)
        );
        insert v;
        return v.Id;
    }

    /** `started` filled entries then `blank` empty ones. */
    private static List<Object> entries(Integer started, Integer blank) {
        List<Object> out = new List<Object>();
        for (Integer i = 0; i < started; i++) {
            out.add(new Map<String, Object>{ 'el_subj' => 'Case ' + i });
        }
        for (Integer i = 0; i < blank; i++) {
            out.add(new Map<String, Object>{ 'el_subj' => '' });
        }
        return out;
    }

    private static String payload(String lastName, List<Object> rows) {
        Map<String, Object> repeats = new Map<String, Object>();
        if (rows != null) {
            repeats.put('sec_rep', rows);
        }
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => lastName },
                'repeats' => repeats
            }
        );
    }

    /** Submits; returns the refusal message, or null when it saved. */
    private static String refusal(Id versionId, String body) {
        try {
            FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
                null,
                versionId,
                body
            );
            return res.errors != null && !res.errors.isEmpty()
                ? res.errors[0].message
                : null;
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
    }

    private static Integer contacts(String lastName) {
        return [SELECT COUNT() FROM Contact WHERE LastName = :lastName];
    }

    // ------------------------------------------------------------- minimum

    @IsTest
    static void alwaysShownGroupBelowItsMinimumIsRefusedAndWritesNothing() {
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 2 }, null),
                null
            )
        );
        Test.startTest();
        String msg = refusal(v, payload('MinShort', entries(1, 1)));
        Test.stopTest();
        Assert.areEqual('Fill in at least 2 entries in Cases.', msg);
        Assert.areEqual(0, contacts('MinShort'));
    }

    @IsTest
    static void leavingTheGroupOutCannotSkipTheMinimum() {
        Id v = activeVersion(formSpec(caseGroup(null, null), null));
        Assert.areEqual(
            'Fill in at least 1 entry in Cases.',
            refusal(v, payload('Skipper', null))
        );
        Assert.areEqual(0, contacts('Skipper'));
    }

    @IsTest
    static void aGroupARuleCanHideIsLeftToTheBrowser() {
        Id onSection = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 1 }, rule()),
                null
            )
        );
        Id onPage = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 1 }, null),
                rule()
            )
        );
        Test.startTest();
        Assert.isNull(refusal(onSection, payload('HiddenSec', null)));
        Assert.isNull(refusal(onPage, payload('HiddenPage', null)));
        Test.stopTest();
        Assert.areEqual(1, contacts('HiddenSec'));
        Assert.areEqual(1, contacts('HiddenPage'));
    }

    @IsTest
    static void minZeroSavesTheParentAlone() {
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 0 }, null),
                null
            )
        );
        Assert.isNull(refusal(v, payload('NoKids', new List<Object>())));
        Assert.areEqual(1, contacts('NoKids'));
    }

    // ----------------------------------------------------------------- cap

    @IsTest
    static void fiftyOneRawItemsAreRefusedEvenWhenBlankAndMaxSays500() {
        Id v = activeVersion(
            formSpec(
                caseGroup(
                    new Map<String, Object>{ 'min' => 0, 'max' => 500 },
                    null
                ),
                null
            )
        );
        Assert.areEqual(
            'Too many entries in Cases.',
            refusal(v, payload('Flood', entries(1, 50)))
        );
        Assert.areEqual(0, contacts('Flood'));
    }

    @IsTest
    static void blankMaxPermitsFiftyRawItems() {
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 0 }, null),
                null
            )
        );
        Test.startTest();
        Assert.isNull(refusal(v, payload('Fifty', entries(1, 49))));
        Test.stopTest();
        Assert.areEqual(1, contacts('Fifty'));
    }

    @IsTest
    static void aPositiveMaxIsEnforcedOnTheRawList() {
        Id v = activeVersion(
            formSpec(
                caseGroup(
                    new Map<String, Object>{ 'min' => 0, 'max' => 5 },
                    null
                ),
                null
            )
        );
        Assert.areEqual(
            'Too many entries in Cases.',
            refusal(v, payload('SixOfFive', entries(1, 5)))
        );
    }

    // ------------------------------------------------- limits that can't hold

    @IsTest
    static void limitsThatCannotBeMetAreRefusedBeforeAnyWrite() {
        List<Map<String, Object>> bad = new List<Map<String, Object>>{
            new Map<String, Object>{ 'min' => 51 },
            new Map<String, Object>{ 'min' => 6, 'max' => 5 },
            new Map<String, Object>{ 'min' => 1.5 },
            new Map<String, Object>{ 'min' => 1, 'max' => -2 }
        };
        Integer n = 0;
        for (Map<String, Object> limits : bad) {
            Id v = activeVersion(formSpec(caseGroup(limits, null), null));
            Assert.areEqual(
                'The entry limits for Cases need to be corrected by the form owner.',
                refusal(v, payload('BadLimits' + n, entries(1, 0))),
                String.valueOf(limits)
            );
            Assert.areEqual(0, contacts('BadLimits' + n));
            n++;
        }
    }

    // -------------------------------------------------------------- budget

    @IsTest
    static void aFormOverTheRowBudgetIsRefusedBeforeAnyWrite() {
        FinalSubmitService.groupRowBudget = 2;
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 0 }, null),
                null
            )
        );
        Assert.areEqual(
            'This response has too many entries. Remove some and try again.',
            refusal(v, payload('Budget', entries(3, 0)))
        );
        Assert.areEqual(0, contacts('Budget'));
        Assert.isNull(refusal(v, payload('BudgetOk', entries(2, 0))));
    }

    private static Form_Version__c survey(List<Object> topics) {
        Map<String, Object> el = new Map<String, Object>{
            'id' => 'el_job',
            'type' => 'field',
            'label' => 'Job',
            'config' => new Map<String, Object>{ 'inputType' => 'text' }
        };
        if (topics != null) {
            el.put('analytics', new Map<String, Object>{ 'topics' => topics });
        }
        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{ 'type' => 'survey' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_rep',
                            'title' => 'Jobs',
                            'repeat' => new Map<String, Object>{ 'min' => 0 },
                            'elements' => new List<Object>{ el }
                        }
                    }
                }
            }
        };
        Form__c form = new Form__c(
            Name = 'Budget survey',
            Form_Type__c = 'Survey',
            Status__c = 'Published'
        );
        insert form;
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec)
        );
        insert version;
        return version;
    }

    private static String jobs(Integer n) {
        List<Object> rows = new List<Object>();
        for (Integer i = 0; i < n; i++) {
            rows.add(new Map<String, Object>{ 'el_job' => 'Job ' + i });
        }
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>(),
                'repeats' => new Map<String, Object>{ 'sec_rep' => rows }
            }
        );
    }

    @IsTest
    static void surveyBudgetCountsTopicLinksAndRollsTheResponseBack() {
        List<Survey_Topic__c> topics = new List<Survey_Topic__c>();
        for (Integer i = 0; i < 4; i++) {
            topics.add(new Survey_Topic__c(Name = 'T' + i));
        }
        insert topics;
        List<Object> refs = new List<Object>();
        for (Survey_Topic__c t : topics) {
            refs.add(new Map<String, Object>{ 'id' => t.Id, 'name' => t.Name });
        }
        // a retired topic id links nothing, so it costs nothing
        refs.add(
            new Map<String, Object>{
                'id' => 'a00000000000000AAA',
                'name' => 'Gone'
            }
        );
        Form_Version__c v = survey(refs);
        FinalSubmitService.groupRowBudget = 20;

        // 5 answers x (1 row + 4 links) = 25 rows: refused, though 5 < 20
        Assert.areEqual(
            'This response has too many entries. Remove some and try again.',
            refusal(v.Id, jobs(5))
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Response__c WHERE Form_Version__c = :v.Id]
        );
        // 4 x 5 = exactly 20: accepted
        Assert.isNull(refusal(v.Id, jobs(4)));
    }

    @IsTest
    static void surveyBudgetOneOverIsRefused() {
        Form_Version__c v = survey(null);
        FinalSubmitService.groupRowBudget = 3;
        Assert.isNull(refusal(v.Id, jobs(3)));
        Assert.areEqual(
            'This response has too many entries. Remove some and try again.',
            refusal(v.Id, jobs(4))
        );
    }

    @IsTest
    static void surveyMinimumIsEnforcedForAnAlwaysShownGroup() {
        Form_Version__c v = survey(null);
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            v.Spec_JSON__c
        );
        Map<String, Object> sec = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((List<Object>) spec.get(
                'pages'
            ))[0])
            .get('sections'))[0];
        ((Map<String, Object>) sec.get('repeat')).put('min', 2);
        v.Spec_JSON__c = JSON.serialize(spec);
        update v;
        Assert.areEqual(
            'Fill in at least 2 entries in Jobs.',
            refusal(v.Id, jobs(1))
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Response__c WHERE Form_Version__c = :v.Id]
        );
    }

    // ------------------------------------------- a refused related record

    @IsTest
    static void aRefusedEntryNamesItsGroupAndItsPlaceAsSent() {
        // Subject is 255 characters at most: entry 3 (index 2, after a
        // skipped blank) is too long, so the insert refuses that row
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 0 }, null),
                null
            )
        );
        List<Object> rows = new List<Object>{
            new Map<String, Object>{ 'el_subj' => 'ok' },
            new Map<String, Object>{ 'el_subj' => '' },
            new Map<String, Object>{ 'el_subj' => 'x'.repeat(300) }
        };
        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            v,
            payload('Refused', rows)
        );
        Test.stopTest();
        Assert.isFalse(res.errors == null || res.errors.isEmpty());
        Assert.areEqual('sec_rep', res.errors[0].sectionId);
        Assert.areEqual(2, res.errors[0].entryIndex);
        Assert.areEqual(0, contacts('Refused'), 'the main record rolls back');
    }

    @IsTest
    static void aGuestGetsTheFlatRefusal() {
        Id v = activeVersion(
            formSpec(
                caseGroup(new Map<String, Object>{ 'min' => 0 }, null),
                null
            )
        );
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            [SELECT Spec_JSON__c FROM Form_Version__c WHERE Id = :v]
            .Spec_JSON__c
        );
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
            payload(
                'GuestRefused',
                new List<Object>{
                    new Map<String, Object>{ 'el_subj' => 'x'.repeat(300) }
                }
            )
        );
        try {
            FinalSubmitService.run(
                spec,
                body,
                FinalSubmitService.Posture.GUEST
            );
            Assert.fail('a refused child must refuse the guest');
        } catch (AuraHandledException e) {
            // the flat refusal: nothing about which field or rule refused
            Assert.isFalse(e.getMessage().contains('Subject'));
            Assert.isFalse(e.getMessage().contains('sec_rep'));
        }
    }

    // ------------------------------------------------- publish and import

    private static Form__c draftForm() {
        Form__c f = new Form__c(
            Name = 'Publish groups',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        return f;
    }

    private static String publishable(Map<String, Object> spec) {
        spec.put(
            'resolved',
            new Map<String, Object>{
                'tokens' => new Map<String, Object>{ '--c-text' => '#000' }
            }
        );
        return JSON.serialize(spec);
    }

    @IsTest
    static void publishRefusesLimitsThatCannotBeMet() {
        Form__c f = draftForm();
        try {
            FinalSpecController.publishSpec(
                f.Id,
                publishable(
                    formSpec(
                        caseGroup(
                            new Map<String, Object>{ 'min' => 3, 'max' => 2 },
                            null
                        ),
                        null
                    )
                )
            );
            Assert.fail('Min above Max must not publish');
        } catch (AuraHandledException e) {
            Assert.areEqual(
                'Min rows for Cases can’t exceed Max rows.',
                e.getMessage()
            );
        }
        try {
            FinalSpecController.publishSpec(
                f.Id,
                publishable(
                    formSpec(
                        caseGroup(new Map<String, Object>{ 'max' => 51 }, null),
                        null
                    )
                )
            );
            Assert.fail('Max 51 must not publish');
        } catch (AuraHandledException e) {
            Assert.areEqual(
                'Max rows for Cases must be blank or a whole number from 0 to 50.',
                e.getMessage()
            );
        }
    }

    @IsTest
    static void publishRefusesALinkFieldThatMissesTheFormObject() {
        Form__c f = draftForm();
        Map<String, Object> grp = caseGroup(null, null);
        // AccountId on Case points at Account, not this Contact form
        ((Map<String, Object>) grp.get('repeat'))
            .put('relationshipField', 'AccountId');
        try {
            FinalSpecController.publishSpec(
                f.Id,
                publishable(formSpec(grp, null))
            );
            Assert.fail('a link to another object must not publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().startsWith('“Cases” can’t be published: '),
                e.getMessage()
            );
        }
    }

    @IsTest
    static void publishAcceptsValidGroups() {
        Form__c f = draftForm();
        Id published = FinalSpecController.publishSpec(
            f.Id,
            publishable(
                formSpec(
                    caseGroup(
                        new Map<String, Object>{ 'min' => 0, 'max' => 50 },
                        null
                    ),
                    null
                )
            )
        );
        Assert.isNotNull(published);
    }

    @IsTest
    static void importValidationRefusesBadLimitsButNotMissingOnes() {
        try {
            FinalSpecDescribeValidator.validateRepeat(
                new Map<String, Object>{
                    'childObject' => 'Case',
                    'relationshipField' => 'ContactId',
                    'min' => 'lots'
                },
                'Contact'
            );
            Assert.fail('a non-number Min must be refused');
        } catch (FinalSpecDescribeValidator.LimitException e) {
            Assert.areEqual(
                'Min rows for this repeating group must be a whole number from 0 to 50.',
                e.getMessage()
            );
        }
        Assert.areEqual(
            'Case',
            FinalSpecDescribeValidator.validateRepeat(
                new Map<String, Object>{
                    'childObject' => 'Case',
                    'relationshipField' => 'ContactId'
                },
                'Contact'
            )
        );
    }

    @IsTest
    static void limitHelperReadsJsonNumbers() {
        Assert.areEqual(3, FinalPublishWarnings.wholeOrNull(3));
        Assert.areEqual(3, FinalPublishWarnings.wholeOrNull(3.0));
        Assert.isNull(FinalPublishWarnings.wholeOrNull(2.5));
        Assert.areEqual(7, FinalPublishWarnings.wholeOrNull(' 7 '));
        Assert.isNull(FinalPublishWarnings.wholeOrNull('seven'));
        Assert.isNull(
            FinalPublishWarnings.repeatLimitProblem(
                new Map<String, Object>{ 'min' => 0, 'max' => 0 },
                'G'
            )
        );
        Assert.isNull(
            FinalPublishWarnings.repeatLimitProblem(
                new Map<String, Object>{ 'min' => 50 },
                'G'
            ),
            'blank Max means up to 50'
        );
    }

    // ------------------------------------------------------------- picker

    @IsTest
    static void thePickerHidesSystemOnlyChildren() {
        Set<String> offered = new Set<String>();
        for (
            Map<String, Object> r : FinalStudioController.describeChildRelationships(
                'Account'
            )
        ) {
            offered.add((String) r.get('childObject'));
        }
        for (
            String hidden : new List<String>{
                'Attachment',
                'AccountFeed',
                'AccountHistory',
                'AccountShare',
                'Note'
            }
        ) {
            Assert.isFalse(offered.contains(hidden), hidden + ' is hidden');
        }
        for (
            String kept : new List<String>{ 'Contact', 'Case', 'Opportunity' }
        ) {
            Assert.isTrue(offered.contains(kept), kept + ' stays');
        }
    }
}
