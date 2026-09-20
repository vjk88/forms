/**
 * The fenced insert (ruling 7-2, FREEFORM_SPEC §5.4 / §7.3).
 *
 * `insertFenced` runs in SYSTEM_MODE — it skips the permission check — so a
 * guest who owns nothing and can create nothing is still able to leave a
 * submission. That makes it the one place in the submit path where
 * permissions do not apply, and therefore the one place worth an explicit
 * list of what may go through it.
 *
 * It is tested directly, private or not, because the method IS the boundary.
 * Testing it only through the callers would prove what today's callers pass,
 * which is exactly the assumption that let the guard go missing.
 */
@IsTest
private class FinalSubmitFenceTest {
    /** Every object a submission is allowed to create. */
    private static final List<SObject> ALLOWED = new List<SObject>{
        new Form_Response__c(),
        new Form_Response_Answer__c(),
        new Form_Answer_Topic__c(),
        new Form_Submission__c(),
        new Form_Submission_Answer__c()
    };

    @IsTest
    static void refusesAnObjectThatIsNotAnAnswerStore() {
        // Form__c deliberately: even OUR OWN configuration object has no
        // business being created by someone filling in a form. A guest who
        // could reach this could mint forms.
        Boolean refused = false;
        String message = '';
        try {
            FinalSubmitService.insertFenced(
                new List<SObject>{ new Form__c(Name = 'Should never save') }
            );
        } catch (FinalSubmitService.FenceException e) {
            refused = true;
            message = e.getMessage();
        }

        Assert.isTrue(refused, 'a stranger does not get through the fence');
        Assert.isTrue(
            message.contains('Form__c'),
            'and the error names what was refused: ' + message
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form__c WHERE Name = 'Should never save'],
            'nothing was written'
        );
    }

    @IsTest
    static void refusesAStrangerHidingBehindAllowedRecords() {
        // The check is per RECORD, not "the first one looks fine".
        Form__c smuggled = new Form__c(Name = 'Riding along');
        Boolean refused = false;
        try {
            FinalSubmitService.insertFenced(
                new List<SObject>{
                    new Form_Submission__c(),
                    smuggled,
                    new Form_Submission__c()
                }
            );
        } catch (FinalSubmitService.FenceException e) {
            refused = true;
        }

        Assert.isTrue(refused, 'one stranger refuses the whole list');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Submission__c],
            'and the allowed records did not slip through either'
        );
    }

    @IsTest
    static void letsEveryAnswerStoreObjectThrough() {
        // The guard must not have quietly closed the door it exists to keep
        // open. Each type is checked for ACCEPTANCE by the fence; a required
        // field failing afterwards is the database talking, not the fence.
        for (SObject record : ALLOWED) {
            String name = record.getSObjectType().getDescribe().getName();
            try {
                FinalSubmitService.insertFenced(new List<SObject>{ record });
            } catch (FinalSubmitService.FenceException e) {
                Assert.fail(name + ' is an answer store and must be allowed');
            } catch (Exception e) {
                // DmlException here means it passed the fence and then failed
                // on its own required fields, which is not what is under test.
                Assert.isFalse(
                    e instanceof FinalSubmitService.FenceException,
                    name + ' was refused by the fence'
                );
            }
        }
    }

    @IsTest
    static void anEmptyListIsNotAnError() {
        FinalSubmitService.insertFenced(new List<SObject>());
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Submission__c],
            'nothing to insert, nothing inserted, nothing thrown'
        );
    }
}
