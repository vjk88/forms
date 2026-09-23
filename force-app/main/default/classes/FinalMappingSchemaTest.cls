/**
 * The status values are code, not labels: the trigger, the service and the
 * retry method compare against them. A renamed value would silently stop
 * every run, so the exact list is pinned here.
 */
@IsTest
private class FinalMappingSchemaTest {
    @IsTest
    static void statusValuesAreExactlyTheFiveTheCodeUses() {
        List<String> values = new List<String>();
        for (
            Schema.PicklistEntry pe : Form_Submission__c.Mapping_Status__c.getDescribe()
                .getPicklistValues()
        ) {
            values.add(pe.getValue());
        }
        Assert.areEqual(
            new List<String>{
                'Not needed',
                'Queued',
                'Done',
                'Failed',
                'Ready for Retry'
            },
            values
        );
        Assert.isTrue(
            Form_Submission__c.Mapping_Status__c.getDescribe()
                .isRestrictedPicklist(),
            'restricted, so no code path can invent a sixth value'
        );
    }
}
