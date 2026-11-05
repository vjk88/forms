/**
 * Decides which new Freeform submissions get a saved PDF copy and queues the
 * job for each (IMPL_PLAN_FORM_PDF §6.4). Same posture as mapping
 * (FinalMappingTriggerHandler): capacity is measured when queueing, and a
 * submission is never refused for want of it — the copy is marked Failed
 * with the reason, and a person can make it from the Answers card.
 */
public without sharing class FinalSubmissionCopyTrigger {
    @TestVisible
    private static final String NO_CAPACITY = 'The PDF copy couldn’t be started: no background-job capacity was left when this submission was saved. Use Try again on the Answers card.';

    public static void beforeInsert(List<Form_Submission__c> rows) {
        Set<Id> versionIds = new Set<Id>();
        for (Form_Submission__c s : rows) {
            if (s.Form_Version__c != null) {
                versionIds.add(s.Form_Version__c);
            }
        }
        Set<Id> wanted = new Set<Id>();
        if (!versionIds.isEmpty()) {
            // System mode: a guest cannot read Form_Version__c.
            for (Form_Version__c v : [
                SELECT Id, Spec_JSON__c
                FROM Form_Version__c
                WHERE Id IN :versionIds
                WITH SYSTEM_MODE
            ]) {
                if (FinalSubmissionCopy.wanted(v.Spec_JSON__c)) {
                    wanted.add(v.Id);
                }
            }
        }
        for (Form_Submission__c s : rows) {
            s.Copy_Status__c = wanted.contains(s.Form_Version__c)
                ? FinalSubmissionCopy.STATUS_QUEUED
                : FinalSubmissionCopy.STATUS_NOT_NEEDED;
        }
    }

    public static void afterInsert(List<Form_Submission__c> rows) {
        List<Form_Submission__c> failed = new List<Form_Submission__c>();
        for (Form_Submission__c s : rows) {
            if (s.Copy_Status__c != FinalSubmissionCopy.STATUS_QUEUED) {
                continue;
            }
            if (
                Limits.getLimitQueueableJobs() - Limits.getQueueableJobs() <= 0
            ) {
                failed.add(failedRow(s.Id, NO_CAPACITY));
                continue;
            }
            try {
                System.enqueueJob(new FinalSubmissionCopyJob(s.Id));
            } catch (Exception e) {
                failed.add(
                    failedRow(
                        s.Id,
                        'The PDF copy couldn’t be started: ' + e.getMessage()
                    )
                );
            }
        }
        if (!failed.isEmpty()) {
            Database.update(failed, true, AccessLevel.SYSTEM_MODE);
        }
    }

    private static Form_Submission__c failedRow(Id id, String message) {
        return new Form_Submission__c(
            Id = id,
            Copy_Status__c = FinalSubmissionCopy.STATUS_FAILED,
            Copy_Message__c = message.abbreviate(255)
        );
    }
}
