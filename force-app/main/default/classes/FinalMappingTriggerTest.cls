/**
 * The trigger starts every run (D41) and measures its room first (D46).
 * Tests 12 and 16 use capacity up deliberately, so they prove the trigger
 * reads what is left rather than assuming 50.
 */
@IsTest
private class FinalMappingTriggerTest {
    /** Takes up one background-job slot and does nothing. */
    public class Filler implements Queueable {
        public void execute(QueueableContext c) {
        }
    }

    private static void fill(Integer slots) {
        for (Integer i = 0; i < slots; i++) {
            System.enqueueJob(new Filler());
        }
    }

    private static Map<String, String> jane() {
        return new Map<String, String>{
            'el_last' => 'Jane',
            'el_email' => 'jane@example.com'
        };
    }

    private static void publishWithMapping() {
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                new List<Object>{ FinalMappingTestData.createContact('act_a') }
            )
        );
    }

    @IsTest
    static void aSubmissionWithoutMappingIsNotNeeded() {
        FinalMappingTestData.publish(
            FinalMappingTestData.spec(
                FinalMappingTestData.standardQuestions(),
                null
            )
        );
        Id subId = FinalMappingTestData.submit(jane());
        Assert.areEqual(
            'Not needed',
            FinalMappingTestData.reload(subId).Mapping_Status__c
        );
    }

    @IsTest
    static void aNewSubmissionIsQueuedAndRunsInTheBackground() {
        publishWithMapping();
        Test.startTest();
        Id subId = FinalMappingTestData.submit(jane());
        Assert.areEqual(
            'Queued',
            FinalMappingTestData.reload(subId).Mapping_Status__c
        );
        Test.stopTest(); // runs the queued job

        Assert.areEqual(
            'Done',
            FinalMappingTestData.reload(subId).Mapping_Status__c
        );
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
        );
    }

    @IsTest
    static void aSubmissionWithNoRoomIsSavedAsFailedNotRefused() {
        // Test 16 (D46): other code has used every slot.
        publishWithMapping();
        Test.startTest();
        fill(Limits.getLimitQueueableJobs());
        Id subId = FinalMappingTestData.submit(jane());
        Test.stopTest();

        Form_Submission__c sub = FinalMappingTestData.reload(subId);
        Assert.areEqual('Failed', sub.Mapping_Status__c, 'saved, not refused');
        Assert.isTrue(
            sub.Mapping_Message__c.contains('no background-job capacity'),
            sub.Mapping_Message__c
        );
        Assert.areEqual(
            2,
            [
                SELECT COUNT()
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__c = :subId
            ],
            'the answers survived'
        );
    }

    @IsTest
    static void readyForRetryQueuesARun() {
        publishWithMapping();
        Id subId = FinalMappingTestData.submit(jane());
        update new Form_Submission__c(Id = subId, Mapping_Status__c = 'Failed');

        Test.startTest();
        update new Form_Submission__c(
            Id = subId,
            Mapping_Status__c = 'Ready for Retry'
        );
        Test.stopTest();

        Assert.areEqual(
            'Done',
            FinalMappingTestData.reload(subId).Mapping_Status__c
        );
    }

    @IsTest
    static void aBulkRetryBiggerThanTheRoomLeftIsRefusedWithTheRealNumber() {
        // Test 12: 5 slots left, 6 retries asked for.
        publishWithMapping();
        List<Form_Submission__c> subs = new List<Form_Submission__c>();
        for (Integer i = 0; i < 6; i++) {
            subs.add(
                new Form_Submission__c(
                    Id = FinalMappingTestData.submit(jane()),
                    Mapping_Status__c = 'Failed'
                )
            );
        }
        update subs;

        Test.startTest();
        fill(Limits.getLimitQueueableJobs() - Limits.getQueueableJobs() - 5);
        for (Form_Submission__c s : subs) {
            s.Mapping_Status__c = 'Ready for Retry';
        }
        String message = '';
        try {
            update subs;
        } catch (DmlException e) {
            message = e.getDmlMessage(0);
        }
        Test.stopTest();

        Assert.isTrue(message.contains('Only 5 more'), message);
        Assert.isTrue(message.contains('retry 5 or fewer'), message);
    }

    @IsTest
    static void aDoneSubmissionIsNotRequeuedByOtherEdits() {
        publishWithMapping();
        Id subId = FinalMappingTestData.submit(jane());
        update new Form_Submission__c(Id = subId, Mapping_Status__c = 'Done');
        Test.startTest();
        update new Form_Submission__c(
            Id = subId,
            Mapping_Message__c = 'a note'
        );
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();
        Assert.areEqual(0, queued, 'only a change TO Ready for Retry queues');
    }
}
