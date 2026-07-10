@IsTest
private class FinalSubmitControllerTest {
    private static Id makeActiveVersion(String targetObject, String pagesJson) {
        Form__c f = new Form__c(
            Name = 'Submit test',
            Primary_Context_Object__c = targetObject
        );
        insert f;
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"' +
                targetObject +
                '"},"pages":' +
                pagesJson +
                '}'
        );
        insert v;
        return v.Id;
    }

    @IsTest
    static void mapsAnswersCoercesTypesAndInserts() {
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
                '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}},' +
                '{"id":"el_em","type":"field","binding":{"object":"Contact","field":"Email"}},' +
                '{"id":"el_bd","type":"field","binding":{"object":"Contact","field":"Birthdate"}},' +
                '{"id":"el_dnc","type":"field","binding":{"object":"Contact","field":"DoNotCall"}},' +
                '{"id":"el_unbound","type":"field"}' +
                ']}]}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{
                    'el_ln' => 'Riley',
                    'el_em' => 'riley@example.com',
                    'el_bd' => '1990-04-01',
                    'el_dnc' => true,
                    'el_unbound' => 'ignored',
                    'el_ghost' => 'ignored too'
                }
            }
        );

        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            versionId,
            payload
        );
        Test.stopTest();

        Contact saved = [
            SELECT LastName, Email, Birthdate
            FROM Contact
            WHERE Id = :res.recordId
        ];
        Assert.areEqual('Riley', saved.LastName);
        Assert.areEqual('riley@example.com', saved.Email);
        Assert.areEqual(Date.newInstance(1990, 4, 1), saved.Birthdate);
        // DoNotCall stays in the payload to exercise boolean coercion, but
        // its FLS is org-dependent (stripInaccessible may drop it) — no
        // persisted assert.
        Assert.areEqual(0, res.childCount);
    }

    @IsTest
    static void repeatsInsertChildrenLinkedToTheParent() {
        // parent Contact / child Case — this dev org blocks EVERY Account
        // insert (joke always-true rule) and assets demand account-parented
        // contacts; cases parent to contacts freely
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[' +
                '{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
                '{"id":"sec_rep","repeat":{"childObject":"Case","relationshipField":"ContactId"},' +
                '"elements":[{"id":"el_an","type":"field","binding":{"object":"Case","field":"Subject"}}]}' +
                ']}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Parent' },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{ 'el_an' => 'One' },
                        new Map<String, Object>{ 'el_an' => 'Two' },
                        new Map<String, Object>{ 'el_an' => '' } // blank entry inserts nothing
                    }
                }
            }
        );

        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            versionId,
            payload
        );
        Test.stopTest();

        Assert.areEqual(2, res.childCount);
        List<Case> kids = [
            SELECT Subject
            FROM Case
            WHERE ContactId = :res.recordId
            ORDER BY Subject
        ];
        Assert.areEqual(2, kids.size());
        Assert.areEqual('One', kids[0].Subject);
    }

    @IsTest
    static void aFailingChildRollsBackTheParent() {
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[' +
                '{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
                '{"id":"sec_rep","repeat":{"childObject":"Asset","relationshipField":"ContactId"},' +
                '"elements":[' +
                '{"id":"el_an","type":"field","binding":{"object":"Asset","field":"Name"}},' +
                '{"id":"el_dt","type":"field","binding":{"object":"Asset","field":"InstallDate"}}' +
                ']}' +
                ']}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Doomed' },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{
                            'el_an' => 'Bad',
                            'el_dt' => 'not-a-date'
                        }
                    }
                }
            }
        );

        Integer before = [
            SELECT COUNT()
            FROM Contact
            WHERE LastName = 'Doomed'
        ];
        try {
            FinalSubmitController.submitForm(null, versionId, payload);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Assert.areEqual(
            before,
            [SELECT COUNT() FROM Contact WHERE LastName = 'Doomed'],
            'parent rolled back with the failing child'
        );
    }

    @IsTest
    static void resolvesTheActiveVersionFromTheFormId() {
        Form__c f = new Form__c(
            Name = 'Active pick',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"Contact"},"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]}]}]}'
        );
        // an inactive DRAFT above it must NOT be the submit target
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 2,
            Is_Active__c = false,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"Account"},"pages":[]}'
        );

        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            f.Id,
            null,
            '{"answers":{"el_ln":"ViaForm"}}'
        );
        Assert.areEqual(
            'ViaForm',
            [SELECT LastName FROM Contact WHERE Id = :res.recordId].LastName
        );
    }

    @IsTest
    static void guardsRejectMissingInputs() {
        try {
            FinalSubmitController.submitForm(null, null, '{}');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        try {
            FinalSubmitController.submitForm(null, null, null);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }
}
