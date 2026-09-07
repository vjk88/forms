@isTest
private class FinalAutofillServiceTest {
    private static Map<String, Object> createSpecWithDisclosures(
        List<String> guestFields
    ) {
        List<Object> mappings = new List<Object>();
        for (String f : guestFields) {
            mappings.add(
                new Map<String, Object>{
                    'id' => 'm_' + f,
                    'from' => f,
                    'to' => 'el_' + f.toLowerCase(),
                    'guestAllowed' => true
                }
            );
        }
        return new Map<String, Object>{
            'specVersion' => 1,
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'source' => 'sourceRecord',
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'r_contact',
                            'enabled' => true,
                            'source' => new Map<String, Object>{
                                'type' => 'link',
                                'objectApiName' => 'Contact'
                            },
                            'mappings' => mappings
                        }
                    }
                }
            }
        };
    }

    @isTest
    static void testDisclosureDiffing() {
        Map<String, Object> spec1 = createSpecWithDisclosures(
            new List<String>{ 'FirstName', 'Email' }
        );
        Map<String, Object> spec2 = createSpecWithDisclosures(
            new List<String>{ 'FirstName', 'Email' }
        );
        Map<String, Object> spec3 = createSpecWithDisclosures(
            new List<String>{ 'FirstName', 'Email', 'Phone' }
        );
        Map<String, Object> spec4 = createSpecWithDisclosures(
            new List<String>{ 'FirstName' }
        );

        // Identical
        System.assertEquals(
            false,
            FinalAutofillService.hasGuestDisclosureChanged(spec1, spec2)
        );

        // Added field -> changed
        System.assertEquals(
            true,
            FinalAutofillService.hasGuestDisclosureChanged(spec1, spec3)
        );

        // Removed field -> changed
        System.assertEquals(
            true,
            FinalAutofillService.hasGuestDisclosureChanged(spec1, spec4)
        );

        // Null checks
        System.assertEquals(
            true,
            FinalAutofillService.hasGuestDisclosureChanged(null, spec1)
        );
        System.assertEquals(
            false,
            FinalAutofillService.hasGuestDisclosureChanged(null, null)
        );
    }

    @isTest
    static void testResolveLinkSourceSurvey() {
        Form__c survey = new Form__c(
            Name = 'Test Survey',
            Form_Type__c = 'Survey',
            Primary_Context_Object__c = 'Contact',
            Status__c = 'Draft'
        );
        insert survey;

        Test.startTest();
        FinalAutofillService.LinkSourceContract contract = FinalAutofillService.resolveLinkSource(
            survey.Id
        );
        Test.stopTest();

        System.assertNotEquals(null, contract);
        System.assertEquals('Contact', contract.objectApiName);
        System.assertEquals(true, contract.isSurvey);
    }
}
