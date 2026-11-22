/**
 * "The record in the link" (DEFERRED 32): a Freeform find-or-create step that
 * finds the record a personalized link carries, and only ever UPDATES it.
 *
 * Three layers, each proved on its own:
 *  - plumbing: the Id comes from the server-verified token (guest and
 *    signed-in), is stored on the submission, and never from the browser;
 *  - runtime: no link or no match skips the step (never fails, never creates);
 *  - publish: only a field the link's record can match, only "equals", and
 *    only when the form has a link Autofill rule.
 */
@IsTest
private class FinalMappingLinkTest {
    private static final String NO_SUCH_CONTACT = '003000000000000AAA';

    // ------------------------------------------------------------- fixtures

    private static Map<String, Object> linkRows(String fieldPath) {
        return new Map<String, Object>{
            'logic' => 'all',
            'rows' => new List<Object>{
                new Map<String, Object>{
                    'fieldPath' => fieldPath,
                    'operator' => 'eq',
                    'value' => '$link.Id'
                }
            }
        };
    }

    /** Finds the link's Contact and updates its Title. */
    private static Map<String, Object> linkStep(String id, Boolean typed) {
        Map<String, Object> match = new Map<String, Object>{
            'onMatch' => 'update'
        };
        if (typed) {
            match.put('filterMode', 'soql');
            match.put('soql', 'Id = {!$link.Id}');
        } else {
            match.put('filter', linkRows('Id'));
        }
        Map<String, Object> title = FinalMappingTestData.field(
            'Title',
            FinalMappingTestData.literal('Updated')
        );
        title.put('writeOnMatch', true);
        return new Map<String, Object>{
            'id' => id,
            'object' => 'Contact',
            'operation' => 'findOrCreate',
            'match' => match,
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'LastName',
                    FinalMappingTestData.literal('Linked')
                ),
                title
            }
        };
    }

    private static Id arrange(List<Object> actions, Id linkRecordId) {
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                actions
            )
        );
        Id subId = FinalMappingTestData.submit(
            new Map<String, String>{
                'el_last' => 'Jane',
                'el_email' => 'jane@example.com',
                'el_title' => 'CTO'
            }
        );
        if (linkRecordId != null) {
            update new Form_Submission__c(
                Id = subId,
                Link_Record_Id__c = String.valueOf(linkRecordId)
            );
        }
        return subId;
    }

    private static Contact linked() {
        Contact c = new Contact(LastName = 'Linked', Title = 'Old');
        insert c;
        return c;
    }

    // -------------------------------------------------------------- runtime

    @IsTest
    static void aValidLinkFindsTheRecordAndUpdatesIt() {
        Contact c = linked();
        Id subId = arrange(new List<Object>{ linkStep('act_a', false) }, c.Id);

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual(
            FinalMappingRules.STATUS_DONE,
            r.status,
            '' + r.message
        );
        Assert.areEqual(
            'Updated',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title
        );
        Assert.areEqual(1, [SELECT COUNT() FROM Contact]);
        Map<String, Object> made = (Map<String, Object>) JSON.deserializeUntyped(
            FinalMappingTestData.reload(subId).Created_Records__c
        );
        Assert.areEqual(String.valueOf(c.Id), made.get('act_a'));
    }

    @IsTest
    static void typedConditionsFindTheLinkRecordToo() {
        Contact c = linked();
        Id subId = arrange(new List<Object>{ linkStep('act_a', true) }, c.Id);

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual(
            FinalMappingRules.STATUS_DONE,
            r.status,
            '' + r.message
        );
        Assert.areEqual(
            'Updated',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title
        );
    }

    @IsTest
    static void noLinkSkipsTheStepAndTheOtherStepsStillRun() {
        Contact c = linked();
        Id subId = arrange(
            new List<Object>{
                linkStep('act_a', false),
                FinalMappingTestData.createContact('act_b')
            },
            null
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual(
            FinalMappingRules.STATUS_DONE,
            r.status,
            '' + r.message
        );
        Assert.areEqual(
            'Old',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title,
            'the linked record was not touched'
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com'],
            'the other step still made its record'
        );
        Map<String, Object> made = (Map<String, Object>) JSON.deserializeUntyped(
            FinalMappingTestData.reload(subId).Created_Records__c
        );
        Assert.isFalse(made.containsKey('act_a'), 'a skipped step makes none');
        Assert.isTrue(made.containsKey('act_b'));
    }

    @IsTest
    static void noMatchSkipsTheStepAndNeverCreates() {
        Contact c = linked();
        Id subId = arrange(
            new List<Object>{ linkStep('act_a', false) },
            Id.valueOf(NO_SUCH_CONTACT)
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual(
            FinalMappingRules.STATUS_DONE,
            r.status,
            '' + r.message
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact],
            'nothing was created from a link step'
        );
        Assert.areEqual(
            'Old',
            [SELECT Title FROM Contact WHERE Id = :c.Id].Title
        );
    }

    @IsTest
    static void aLaterLookupToASkippedStepIsLeftBlank() {
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
            new List<Object>{ linkStep('act_a', false), report },
            null
        );

        FinalMappingService.Result r = FinalMappingService.run(subId);

        Assert.areEqual(
            FinalMappingRules.STATUS_DONE,
            r.status,
            '' + r.message
        );
        Contact made = [
            SELECT ReportsToId
            FROM Contact
            WHERE LastName = 'Report'
        ];
        Assert.isNull(made.ReportsToId, 'the lookup stays blank');
    }

    // ------------------------------------------------------------- plumbing

    private static Form__c freeformWithLinkRule() {
        Form__c form = new Form__c(
            Name = 'Link plumbing',
            Form_Type__c = 'Freeform',
            Status__c = 'Published',
            Is_Public__c = true
        );
        insert form;
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => form.Id,
                'name' => form.Name,
                'type' => 'freeform'
            },
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'autofillRules' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'rule_1',
                            'enabled' => true,
                            'source' => new Map<String, Object>{
                                'type' => 'link',
                                'objectApiName' => 'Contact'
                            },
                            'mappings' => new List<Object>()
                        }
                    }
                }
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_t',
                                    'type' => 'field',
                                    'label' => 'Anything',
                                    'config' => new Map<String, Object>()
                                }
                            }
                        }
                    }
                }
            }
        };
        insert new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec),
            Engine_Version__c = 1
        );
        return form;
    }

    private static String payload(Id formId, Map<String, Object> meta) {
        Id versionId = [
            SELECT Id
            FROM Form_Version__c
            WHERE Form__c = :formId
            LIMIT 1
        ]
        .Id;
        meta.put('specVersionId', String.valueOf(versionId));
        meta.put('submissionKey', 'k-' + String.valueOf(Math.random()));
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_t' => 'hi' },
                'repeats' => new Map<String, Object>(),
                'meta' => meta
            }
        );
    }

    private static String storedLink(Id formId) {
        return [
            SELECT Link_Record_Id__c
            FROM Form_Submission__c
            WHERE Form__c = :formId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ]
        .Link_Record_Id__c;
    }

    @IsTest
    static void aGuestSubmitStoresTheTokensRecord() {
        Form__c form = freeformWithLinkRule();
        Contact c = linked();
        String token = FinalSurveyTokenService.mint(form.Id, c.Id, 'Contact');
        String body = payload(
            form.Id,
            new Map<String, Object>{ 'rt' => token }
        );

        FinalGuestController.submitGuest(
            form.Id,
            FinalGuestTicketTestUtil.withTicket(form.Id, body)
        );

        Assert.areEqual(String.valueOf(c.Id), storedLink(form.Id));
    }

    @IsTest
    static void aSignedInSubmitStoresTheTokensRecord() {
        Form__c form = freeformWithLinkRule();
        Contact c = linked();
        String token = FinalSurveyTokenService.mint(form.Id, c.Id, 'Contact');

        FinalSubmitController.submitForm(
            form.Id,
            null,
            payload(form.Id, new Map<String, Object>{ 'rt' => token })
        );

        Assert.areEqual(String.valueOf(c.Id), storedLink(form.Id));
    }

    @IsTest
    static void anExpiredOrMissingTokenStoresNothing() {
        Form__c form = freeformWithLinkRule();
        Contact c = linked();
        String expired = FinalSurveyTokenService.buildToken(
            form.Id,
            c.Id,
            'Contact',
            Datetime.now().addDays(-40).getTime(),
            Datetime.now().addDays(-10).getTime()
        );

        FinalSubmitController.submitForm(
            form.Id,
            null,
            payload(form.Id, new Map<String, Object>{ 'rt' => expired })
        );
        Assert.isNull(storedLink(form.Id), 'expired link');

        FinalSubmitController.submitForm(
            form.Id,
            null,
            payload(form.Id, new Map<String, Object>())
        );
        Assert.isNull(storedLink(form.Id), 'no link');
    }

    @IsTest
    static void aTokenForAnotherFormStoresNothing() {
        Form__c form = freeformWithLinkRule();
        Form__c other = new Form__c(Name = 'Other', Form_Type__c = 'Freeform');
        insert other;
        Contact c = linked();
        String foreign = FinalSurveyTokenService.mint(
            other.Id,
            c.Id,
            'Contact'
        );

        FinalSubmitController.submitForm(
            form.Id,
            null,
            payload(form.Id, new Map<String, Object>{ 'rt' => foreign })
        );

        Assert.isNull(storedLink(form.Id));
    }

    @IsTest
    static void aRecordIdSentFromTheBrowserIsNeverUsed() {
        Form__c form = freeformWithLinkRule();
        Contact c = linked();

        FinalSubmitController.submitForm(
            form.Id,
            null,
            payload(
                form.Id,
                new Map<String, Object>{
                    'linkRecordId' => String.valueOf(c.Id),
                    'recordId' => String.valueOf(c.Id)
                }
            )
        );

        Assert.isNull(storedLink(form.Id));
    }

    // ------------------------------------------------------------ publish

    private static Map<String, Object> specWith(
        Map<String, Object> step,
        String linkObject
    ) {
        Map<String, Object> spec = FinalMappingTestData.spec(
            FinalMappingTestData.standardQuestions(),
            new List<Object>{ step }
        );
        if (linkObject != null) {
            spec.put(
                'settings',
                new Map<String, Object>{
                    'prefill' => new Map<String, Object>{
                        'autofillRules' => new List<Object>{
                            new Map<String, Object>{
                                'id' => 'rule_1',
                                'enabled' => true,
                                'source' => new Map<String, Object>{
                                    'type' => 'link',
                                    'objectApiName' => linkObject
                                },
                                'mappings' => new List<Object>()
                            }
                        }
                    }
                }
            );
        }
        return spec;
    }

    /** Blockers that are about the link, so unrelated ones cannot mask a result. */
    private static List<String> linkBlockers(Map<String, Object> spec) {
        List<String> out = new List<String>();
        for (
            FinalMappingValidator.Diagnostic d : FinalMappingValidator.validate(
                spec,
                null
            )
        ) {
            if (
                d.severity == FinalMappingValidator.BLOCKER &&
                (d.message.contains('record in the link') ||
                d.message.contains('Autofill rule') ||
                d.message.contains('compares with an answer'))
            ) {
                out.add(d.message);
            }
        }
        return out;
    }

    private static Map<String, Object> contactStep(
        Map<String, Object> filter,
        String soql
    ) {
        Map<String, Object> step = linkStep('act_a', soql != null);
        Map<String, Object> match = (Map<String, Object>) step.get('match');
        if (soql != null) {
            match.put('soql', soql);
        } else {
            match.put('filter', filter);
        }
        return step;
    }

    @IsTest
    static void theIdOfTheLinkObjectIsAccepted() {
        Assert.isTrue(
            linkBlockers(specWith(contactStep(linkRows('Id'), null), 'Contact'))
                .isEmpty(),
            'a link-only search is a real search'
        );
        Assert.isTrue(
            linkBlockers(
                    specWith(contactStep(null, 'Id = {!$link.Id}'), 'Contact')
                )
                .isEmpty()
        );
    }

    @IsTest
    static void aLookupToTheLinkObjectIsAccepted() {
        Map<String, Object> step = new Map<String, Object>{
            'id' => 'act_a',
            'object' => 'Case',
            'operation' => 'findOrCreate',
            'match' => new Map<String, Object>{
                'onMatch' => 'reuse',
                'filter' => linkRows('ContactId')
            },
            'fields' => new List<Object>()
        };
        Assert.isTrue(linkBlockers(specWith(step, 'Contact')).isEmpty());
    }

    @IsTest
    static void aFieldTheLinkRecordCannotMatchIsRefused() {
        // the step's object is not the link's object
        List<String> wrongObject = linkBlockers(
            specWith(contactStep(linkRows('Id'), null), 'Account')
        );
        Assert.areEqual(1, wrongObject.size(), String.valueOf(wrongObject));
        Assert.isTrue(wrongObject[0].contains('the Id of an Account'));
        Assert.isTrue(wrongObject[0].contains('or a lookup to one'));

        // a plain text field
        Assert.areEqual(
            1,
            linkBlockers(
                    specWith(contactStep(linkRows('LastName'), null), 'Contact')
                )
                .size()
        );
        Assert.areEqual(
            1,
            linkBlockers(
                    specWith(
                        contactStep(null, 'LastName = {!$link.Id}'),
                        'Contact'
                    )
                )
                .size()
        );
    }

    @IsTest
    static void onlyEqualsIsAllowed() {
        Map<String, Object> filter = linkRows('Id');
        ((Map<String, Object>) ((List<Object>) filter.get('rows'))[0])
            .put('operator', 'notEquals');
        Assert.areEqual(
            1,
            linkBlockers(specWith(contactStep(filter, null), 'Contact')).size()
        );
        Assert.areEqual(
            1,
            linkBlockers(
                    specWith(contactStep(null, 'Id != {!$link.Id}'), 'Contact')
                )
                .size()
        );
    }

    @IsTest
    static void aFormWithNoLinkRuleCannotUseIt() {
        List<String> found = linkBlockers(
            specWith(contactStep(linkRows('Id'), null), null)
        );
        Assert.areEqual(1, found.size(), String.valueOf(found));
        Assert.isTrue(
            found[0]
                .contains(
                    'Add an Autofill rule that fills from the record in the link first'
                )
        );
    }

    @IsTest
    static void theSoqlBoxReadsTheLinkToken() {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            'Id = {!$link.Id} AND Email = {!el_email}'
        );
        Assert.isNull(p.problem);
        Assert.areEqual(2, p.tokens.size());
        Assert.isTrue(FinalMappingSoql.usesLink(p));
        Assert.areEqual('Id = :m0 AND Email = :m1', p.whereClause);
        Assert.isFalse(
            FinalMappingSoql.usesLink(
                FinalMappingSoql.parse('Email = {!el_email}')
            )
        );
        Assert.isNotNull(
            FinalMappingSoql.parse('Id = {!$other.Id}').problem,
            'only the link token has a dollar sign'
        );
    }
}
