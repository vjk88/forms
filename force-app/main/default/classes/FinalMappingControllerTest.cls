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
}
