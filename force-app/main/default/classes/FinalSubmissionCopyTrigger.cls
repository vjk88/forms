/**
 * Decides which new Freeform submissions and survey responses get a saved
 * PDF copy, and queues the job for each (IMPL_PLAN_FORM_PDF §6.4). Works on
 * either object: both carry Form_Version__c and the three Copy_* fields. Same posture as mapping
 * (FinalMappingTriggerHandler): capacity is measured when queueing, and a
 * submission is never refused for want of it — the copy is marked Failed
 * with the reason, and a person can make it from the Answers card.
 */
public without sharing class FinalSubmissionCopyTrigger {
    @TestVisible
    private static final String NO_CAPACITY = 'The PDF copy couldn’t be started: no background-job capacity was left when this was saved. Make it again with Try again on the Answers card or the Save PDF copy action.';

    public static void beforeInsert(List<SObject> rows) {
        Set<Id> versionIds = new Set<Id>();
        for (SObject s : rows) {
            Id v = (Id) s.get('Form_Version__c');
            if (v != null) {
                versionIds.add(v);
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
        for (SObject s : rows) {
            s.put(
                'Copy_Status__c',
                wanted.contains((Id) s.get('Form_Version__c'))
                    ? FinalSubmissionCopy.STATUS_QUEUED
                    : FinalSubmissionCopy.STATUS_NOT_NEEDED
            );
        }
    }

    public static void afterInsert(List<SObject> rows) {
        List<SObject> failed = new List<SObject>();
        for (SObject s : rows) {
            if (s.get('Copy_Status__c') != FinalSubmissionCopy.STATUS_QUEUED) {
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

    private static SObject failedRow(Id id, String message) {
        SObject row = id.getSObjectType().newSObject(id);
        row.put('Copy_Status__c', FinalSubmissionCopy.STATUS_FAILED);
        row.put('Copy_Message__c', message.abbreviate(255));
        return row;
    }
}
