/**
 * Publish warnings (FREEFORM_SPEC §6.3).
 *
 * Two things are being tested in equal measure: that a real consequence is
 * named, and that nothing is said when there is nothing to say. A warning
 * that fires on every publish is noise, and noise gets clicked through.
 */
@IsTest
private class FinalPublishWarningsTest {
    private static Form__c form;

    private static Map<String, Object> specOf(List<Object> elements) {
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'type' => 'freeform' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => elements
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> q(
        String elId,
        String label,
        String inputType
    ) {
        return new Map<String, Object>{
            'id' => elId,
            'type' => 'field',
            'label' => label,
            'config' => new Map<String, Object>{ 'inputType' => inputType }
        };
    }

    /** A live form with one stored answer for `answeredKey`. */
    private static Id publishLive(
        List<Object> elements,
        String answeredKey,
        Boolean isPublic
    ) {
        form = new Form__c(
            Name = 'Warnings test',
            Form_Type__c = 'Freeform',
            Allowed_Adapters__c = isPublic
                ? 'Internal_Record_Page;Public_Guest'
                : 'Internal_Record_Page'
        );
        insert form;
        Form_Version__c live = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(specOf(elements)),
            Engine_Version__c = 1
        );
        insert live;
        if (answeredKey != null) {
            Form_Submission__c sub = new Form_Submission__c(
                Form__c = form.Id,
                Form_Version__c = live.Id,
                Submitted_Date__c = Datetime.now()
            );
            insert sub;
            insert new Form_Submission_Answer__c(
                Form_Submission__c = sub.Id,
                Element_Key__c = answeredKey,
                Answer_Type__c = 'Text',
                Text_Value__c = 'an answer'
            );
        }
        return form.Id;
    }

    @IsTest
    static void warnsWhenAQuestionWithAnswersChangesType() {
        Id formId = publishLive(
            new List<Object>{ q('el_1', 'How many', 'text') },
            'el_1',
            false
        );
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(new List<Object>{ q('el_1', 'How many', 'number') })
                )
            )
            .warnings;
        Assert.areEqual(1, found.size(), 'one warning');
        Assert.isTrue(found[0].contains('How many'), 'names the question');
        Assert.isTrue(found[0].contains('text'), 'says what it was');
        Assert.isTrue(found[0].contains('number'), 'and what it becomes');
    }

    @IsTest
    static void saysNothingWhenTheTypeChangesButNothingWasCollected() {
        Id formId = publishLive(
            new List<Object>{ q('el_1', 'How many', 'text') },
            null,
            false
        );
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(new List<Object>{ q('el_1', 'How many', 'number') })
                )
            )
            .warnings;
        Assert.areEqual(
            0,
            found.size(),
            'no answers means no consequence to warn about'
        );
    }

    @IsTest
    static void warnsWhenRemovingAQuestionThatHasAnswers() {
        Id formId = publishLive(
            new List<Object>{
                q('el_1', 'Keep me', 'text'),
                q('el_2', 'Delete me', 'text')
            },
            'el_2',
            false
        );
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(new List<Object>{ q('el_1', 'Keep me', 'text') })
                )
            )
            .warnings;
        Assert.areEqual(1, found.size(), 'one warning');
        Assert.isTrue(found[0].contains('Delete me'), 'names the question');
        Assert.isTrue(
            found[0].contains('different question'),
            'explains that re-adding it does not reunite the answers'
        );
    }

    @IsTest
    static void saysNothingWhenRemovingAnUnansweredQuestion() {
        Id formId = publishLive(
            new List<Object>{
                q('el_1', 'Keep me', 'text'),
                q('el_2', 'Never answered', 'text')
            },
            'el_1',
            false
        );
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(new List<Object>{ q('el_1', 'Keep me', 'text') })
                )
            )
            .warnings;
        Assert.areEqual(0, found.size(), 'nothing was lost');
    }

    @IsTest
    static void warnsAboutFileQuestionsOnAPublicForm() {
        Id formId = publishLive(
            new List<Object>{ q('el_1', 'Anything', 'text') },
            null,
            true
        );
        Map<String, Object> fileQuestion = new Map<String, Object>{
            'id' => 'el_cv',
            'type' => 'file',
            'label' => 'Attach your CV'
        };
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(
                        new List<Object>{
                            q('el_1', 'Anything', 'text'),
                            fileQuestion
                        }
                    )
                )
            )
            .warnings;
        Assert.areEqual(1, found.size(), 'one warning');
        Assert.isTrue(found[0].contains('Attach your CV'), 'names it');
        Assert.isTrue(
            found[0].contains('not signed in'),
            'says who it fails for'
        );
    }

    @IsTest
    static void saysNothingAboutFileQuestionsOnAPrivateForm() {
        Id formId = publishLive(
            new List<Object>{ q('el_1', 'Anything', 'text') },
            null,
            false
        );
        List<String> found = FinalPublishWarnings.forPublish(
                formId,
                JSON.serialize(
                    specOf(
                        new List<Object>{
                            q('el_1', 'Anything', 'text'),
                            new Map<String, Object>{
                                'id' => 'el_cv',
                                'type' => 'file',
                                'label' => 'Attach your CV'
                            }
                        }
                    )
                )
            )
            .warnings;
        Assert.areEqual(
            0,
            found.size(),
            'signed-in respondents can upload, so there is nothing to say'
        );
    }

    @IsTest
    static void saysNothingOnAFirstPublish() {
        form = new Form__c(Name = 'Brand new', Form_Type__c = 'Freeform');
        insert form;
        List<String> found = FinalPublishWarnings.forPublish(
                form.Id,
                JSON.serialize(
                    new List<Object>{ q('el_1', 'Anything', 'text') }
                )
            )
            .warnings;
        Assert.areEqual(0, found.size(), 'nothing is live to compare against');
    }

    @IsTest
    static void survivesRubbishInputInsteadOfBlockingPublish() {
        Id formId = publishLive(
            new List<Object>{ q('el_1', 'Anything', 'text') },
            'el_1',
            false
        );
        Assert.areEqual(
            0,
            FinalPublishWarnings.forPublish(formId, 'not json').warnings.size(),
            'publish itself refuses bad specs, and says why'
        );
        Assert.areEqual(
            0,
            FinalPublishWarnings.forPublish(null, '{}').warnings.size(),
            'no form, no warnings'
        );
    }

    @IsTest
    static void mappingBlockersComeBackSeparately() {
        Form__c form = new Form__c(
            Name = 'Dialog test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        FinalPublishWarnings.PublishCheck check = FinalPublishWarnings.forPublish(
            form.Id,
            JSON.serialize(
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{
                        FinalMappingTestData.findOrCreateContact('act_a', null)
                    }
                )
            )
        );
        Assert.areEqual(
            1,
            check.blockers.size(),
            String.join(check.blockers, ' | ')
        );
        Assert.isTrue(check.blockers[0].contains('Choose what happens to it'));
    }

    @IsTest
    static void eachFindingSaysWhereItIsFixed() {
        Form__c form = new Form__c(Name = 'Placed', Form_Type__c = 'Freeform');
        insert form;
        FinalPublishWarnings.PublishCheck check = FinalPublishWarnings.forPublish(
            form.Id,
            JSON.serialize(
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{
                        FinalMappingTestData.findOrCreateContact('act_a', null)
                    }
                )
            )
        );
        Assert.areEqual(1, check.items.size(), JSON.serialize(check.items));
        FinalPublishWarnings.Item i = check.items[0];
        Assert.areEqual('blocker', i.severity);
        Assert.areEqual('data', i.area);
        Assert.areEqual('act_a', i.actionId);
        Assert.areEqual('Step 1 · Contact', i.step);
        Assert.areEqual('If one is found', i.section);
        // the sentence alone: the dialog shows the step above it
        Assert.isTrue(i.text.startsWith('Choose what happens to it'), i.text);
    }

    @IsTest
    static void aLookupThatSearchesNothingIsABlockerOnTheBuildTab() {
        Form__c form = new Form__c(
            Name = 'Lookup warn',
            Form_Type__c = 'Freeform'
        );
        insert form;
        Map<String, Object> spec = FinalMappingTestData.spec(
            new List<Object>{
                new Map<String, Object>{
                    'id' => 'el_pick',
                    'type' => 'field',
                    'label' => 'Your company',
                    'config' => new Map<String, Object>{
                        'inputType' => 'reference'
                    }
                },
                // a bound lookup takes its object from the field: fine
                new Map<String, Object>{
                    'id' => 'el_bound',
                    'type' => 'field',
                    'label' => 'Account',
                    'binding' => new Map<String, Object>{
                        'object' => 'Contact',
                        'field' => 'AccountId'
                    },
                    'config' => new Map<String, Object>{
                        'inputType' => 'reference'
                    }
                }
            },
            null
        );
        FinalPublishWarnings.PublishCheck check = FinalPublishWarnings.forPublish(
            form.Id,
            JSON.serialize(spec)
        );
        Assert.areEqual(
            1,
            check.blockers.size(),
            String.join(check.blockers, ' | ')
        );
        FinalPublishWarnings.Item i = check.items[0];
        Assert.areEqual('blocker', i.severity);
        Assert.areEqual('build', i.area);
        Assert.areEqual('el_pick', i.elementId);
        Assert.areEqual('Choose which object “Your company” searches.', i.text);
    }
}
