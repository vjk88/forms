/**
 * Publish refuses what cannot run and warns about what can hurt
 * (FREEFORM_F2_MAPPING_SPEC section 7). Spec tests 9, 10 and 17 live here
 * in validator form; FinalSpecControllerTest proves publishSpec calls it.
 */
@IsTest
private class FinalMappingValidatorTest {
    private static List<FinalMappingValidator.Diagnostic> check(
        List<Object> actions
    ) {
        return FinalMappingValidator.validate(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                actions
            ),
            null
        );
    }

    private static List<String> blockers(
        List<FinalMappingValidator.Diagnostic> found
    ) {
        List<String> out = new List<String>();
        for (FinalMappingValidator.Diagnostic d : found) {
            if (d.severity == 'blocker') {
                out.add(d.message);
            }
        }
        return out;
    }

    private static Boolean anyContains(List<String> messages, String fragment) {
        for (String m : messages) {
            if (m.contains(fragment)) {
                return true;
            }
        }
        return false;
    }

    @IsTest
    static void aCleanMappingHasNoBlockers() {
        List<String> found = blockers(
            check(
                new List<Object>{
                    FinalMappingTestData.createContact('act_a'),
                    FinalMappingTestData.findOrCreateContact('act_b', 'reuse')
                }
            )
        );
        Assert.areEqual(new List<String>(), found);
    }

    @IsTest
    static void anUnansweredMatchQuestionBlocks() {
        List<String> found = blockers(
            check(
                new List<Object>{
                    FinalMappingTestData.findOrCreateContact('act_a', null)
                }
            )
        );
        Assert.isTrue(
            anyContains(
                found,
                'choose what happens when a matching record is found'
            ),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void elevenStepsBlock() {
        List<Object> actions = new List<Object>();
        for (Integer i = 0; i < 11; i++) {
            actions.add(FinalMappingTestData.createContact('act_' + i));
        }
        Assert.isTrue(anyContains(blockers(check(actions)), 'at most 10'));
    }

    @IsTest
    static void aSetupObjectBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        action.put('object', 'User');
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'together with ordinary records'
            )
        );
    }

    @IsTest
    static void aFieldThatCanPointAtSeveralKindsOfRecordBlocks() {
        // A Task is fine; its Related To is not (D48).
        Map<String, Object> action = new Map<String, Object>{
            'id' => 'act_a',
            'object' => 'Task',
            'operation' => 'create',
            'fields' => new List<Object>{
                FinalMappingTestData.field(
                    'Subject',
                    FinalMappingTestData.literal('Follow up')
                ),
                FinalMappingTestData.field(
                    'WhatId',
                    FinalMappingTestData.ref('action:act_x')
                )
            }
        };
        List<String> found = blockers(check(new List<Object>{ action }));
        Assert.isTrue(
            anyContains(found, 'more than one kind of record'),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void aMissingFilterBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) action.get('match')).remove('filter');
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'needs a filter'
            )
        );
    }

    @IsTest
    static void currentUserInAFilterBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'reuse'
        );
        ((Map<String, Object>) action.get('match'))
            .put(
                'filter',
                new Map<String, Object>{
                    'logic' => 'all',
                    'rows' => new List<Object>{
                        new Map<String, Object>{
                            'fieldPath' => 'OwnerId',
                            'operator' => 'eq',
                            'value' => '$User.Id'
                        }
                    }
                }
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'current user'
            )
        );
    }

    @IsTest
    static void aReferenceToALaterStepBlocks() {
        Map<String, Object> first = FinalMappingTestData.createContact('act_a');
        ((List<Object>) first.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('action:act_b')
                )
            );
        List<String> found = blockers(
            check(
                new List<Object>{
                    first,
                    FinalMappingTestData.createContact('act_b')
                }
            )
        );
        Assert.isTrue(anyContains(found, 'comes later or no longer exists'));
    }

    @IsTest
    static void aLinkReferenceBlocksInF2() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'ReportsToId',
                    FinalMappingTestData.ref('link')
                )
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'personalized-link'
            )
        );
    }

    @IsTest
    static void anIncompatibleAnswerBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        ((List<Object>) action.get('fields'))
            .add(
                FinalMappingTestData.field(
                    'Birthdate',
                    FinalMappingTestData.answer('el_title')
                )
            );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'can’t go into'
            )
        );
    }

    @IsTest
    static void aRequiredFieldWithNoSourceBlocks() {
        Map<String, Object> action = FinalMappingTestData.createContact(
            'act_a'
        );
        action.put(
            'fields',
            new List<Object>{
                FinalMappingTestData.field(
                    'Email',
                    FinalMappingTestData.answer('el_email')
                )
            }
        );
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'Last Name empty'
            )
        );
    }

    @IsTest
    static void overwritingTheMatchFieldBlocks() {
        Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
            'act_a',
            'update'
        );
        for (Object o : (List<Object>) action.get('fields')) {
            Map<String, Object> f = (Map<String, Object>) o;
            if (f.get('field') == 'Email') {
                f.put('writeOnMatch', true);
            }
        }
        Assert.isTrue(
            anyContains(
                blockers(check(new List<Object>{ action })),
                'the field used to find the record'
            )
        );
    }

    @IsTest
    static void anOptionalSourceForARequiredFieldWarns() {
        Map<String, Object> optional = FinalMappingTestData.question(
            'el_last',
            'text',
            'Your surname'
        );
        optional.put('required', false);
        List<FinalMappingValidator.Diagnostic> found = FinalMappingValidator.validate(
            FinalMappingTestData.spec(
                new List<Object>{
                    optional,
                    FinalMappingTestData.question(
                        'el_email',
                        'email',
                        'Work email'
                    )
                },
                new List<Object>{ FinalMappingTestData.createContact('act_a') }
            ),
            null
        );
        Boolean warned = false;
        for (FinalMappingValidator.Diagnostic d : found) {
            warned |=
                d.severity == 'warning' && d.message.contains('can be skipped');
        }
        Assert.isTrue(warned, 'skipping it would fail the step');
    }

    @IsTest
    static void thePublishersOwnPermissionsDecide() {
        // Spec test 10, as the publisher: someone who cannot create Contacts
        // cannot publish a form that creates them.
        Profile minimum = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Minimum Access - Salesforce'
        ];
        User noAccess = new User(
            Alias = 'nomap',
            Email = 'nomap@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'No mapping access',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = minimum.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            Username = 'nomap' + Crypto.getRandomInteger() + '@example.com'
        );
        insert noAccess;

        List<String> found;
        System.runAs(noAccess) {
            found = blockers(
                check(
                    new List<Object>{
                        FinalMappingTestData.createContact('act_a')
                    }
                )
            );
        }
        Assert.isTrue(
            anyContains(found, 'You can’t create Contacts'),
            String.join(found, ' | ')
        );
    }

    @IsTest
    static void validateForPublishThrowsTheFirstBlocker() {
        try {
            FinalMappingValidator.validateForPublish(
                null,
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{
                        FinalMappingTestData.findOrCreateContact('act_a', null)
                    }
                )
            );
            Assert.fail('a blocker must refuse the publish');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().contains('matching record is found'),
                e.getMessage()
            );
        }
    }
}
