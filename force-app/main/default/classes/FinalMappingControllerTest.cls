@IsTest
private class FinalMappingControllerTest {
    @IsTest
    static void creatableObjectsExcludeSetupObjects() {
        Set<String> names = new Set<String>();
        for (
            Map<String, String> o : FinalMappingController.listCreatableObjects()
        ) {
            names.add(o.get('value'));
        }
        Assert.isTrue(names.contains('Contact'));
        Assert.isFalse(
            names.contains('User'),
            'a setup object would fail every run'
        );
    }

    @IsTest
    static void compatibilityIsTheApexTable() {
        Map<String, List<String>> table = FinalMappingController.compatibility();
        Assert.isTrue(table.get('Email').contains('EMAIL'));
        Assert.isFalse(table.get('Text').contains('DOUBLE'));
    }

    @IsTest
    static void questionsComeBackInFormOrderWithTheirTypes() {
        Map<String, Object> optional = FinalMappingTestData.question(
            'el_title',
            'text',
            'Job title'
        );
        optional.put('required', false);
        List<Map<String, Object>> found = FinalMappingController.describeQuestions(
            JSON.serialize(
                FinalMappingTestData.spec(
                    new List<Object>{
                        FinalMappingTestData.question(
                            'el_email',
                            'email',
                            'Work email'
                        ),
                        optional
                    },
                    null
                )
            )
        );
        Assert.areEqual('el_email', found[0].get('elementKey'));
        Assert.areEqual('Email', found[0].get('answerType'));
        Assert.areEqual(false, found[0].get('skippable'));
        Assert.areEqual(true, found[1].get('skippable'));
        Assert.areEqual(true, found[1].get('mappable'));
    }

    @IsTest
    static void describeFieldsCarriesTheDescribeType() {
        for (
            Map<String, Object> row : FinalStudioController.describeFields(
                'Contact'
            )
        ) {
            if (row.get('apiName') == 'Email') {
                Assert.areEqual('EMAIL', row.get('displayType'));
                return;
            }
        }
        Assert.fail('Contact.Email is creatable and must be listed');
    }

    // ------------------------------------------- Check conditions (Task 11)

    private static String specWithFindOrCreate(List<Object> questions) {
        return JSON.serialize(
            FinalMappingTestData.spec(
                questions,
                new List<Object>{
                    FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
                }
            )
        );
    }

    private static List<FinalMappingValidator.Diagnostic> check(
        List<Object> questions,
        String soql
    ) {
        return FinalMappingController.checkConditions(
            specWithFindOrCreate(questions),
            'act_a',
            soql
        );
    }

    @IsTest
    static void cleanConditionsComeBackEmpty() {
        Assert.areEqual(
            0,
            check(
                    FinalMappingTestData.standardQuestions(),
                    'LastName = {!el_last}'
                )
                .size()
        );
    }

    @IsTest
    static void conditionsSalesforceRefusesSayWhy() {
        List<FinalMappingValidator.Diagnostic> found = check(
            FinalMappingTestData.standardQuestions(),
            'Nope__c = 1'
        );
        Assert.areEqual(1, found.size(), String.valueOf(found));
        Assert.areEqual('blocker', found[0].severity);
        Assert.isTrue(found[0].message.contains('Nope__c'), found[0].message);
    }

    @IsTest
    static void anUnfittingAnswerIsABlocker() {
        List<FinalMappingValidator.Diagnostic> found = check(
            FinalMappingTestData.standardQuestions(),
            'Birthdate = {!el_last}'
        );
        Assert.areEqual('blocker', found[0].severity);
    }

    @IsTest
    static void aSkippableAnswerIsAWarning() {
        List<Object> questions = FinalMappingTestData.standardQuestions();
        Map<String, Object> nick = FinalMappingTestData.question(
            'el_nick',
            'text',
            'Nickname'
        );
        nick.put('required', false);
        questions.add(nick);
        List<FinalMappingValidator.Diagnostic> found = check(
            questions,
            'LastName = {!el_nick}'
        );
        Assert.areEqual(1, found.size(), String.valueOf(found));
        Assert.areEqual('warning', found[0].severity);
    }

    @IsTest
    static void aStepThatIsNotInTheFormIsRefused() {
        try {
            FinalMappingController.checkConditions(
                specWithFindOrCreate(FinalMappingTestData.standardQuestions()),
                'act_nope',
                'LastName = \'x\''
            );
            Assert.fail('expected a refusal');
        } catch (AuraHandledException e) {
            Assert.areEqual('That step isn’t in this form.', e.getMessage());
        }
    }

    @IsTest
    static void guestsCannotCheckConditions() {
        List<User> guests = [
            SELECT Id
            FROM User
            WHERE UserType = 'Guest' AND IsActive = TRUE
            LIMIT 1
        ];
        if (guests.isEmpty()) {
            return; // no site in this org: nothing to prove
        }
        System.runAs(guests[0]) {
            try {
                FinalMappingController.checkConditions('{}', 'act_a', 'x');
                Assert.fail('expected a refusal');
            } catch (AuraHandledException e) {
                Assert.areEqual('Sign in to check conditions.', e.getMessage());
            }
        }
    }
}
