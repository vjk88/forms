/**
 * Decides which submissions need a mapping run and queues them
 * (FREEFORM_F2_MAPPING_SPEC 6.3, D41, D46).
 *
 * Capacity is measured at the moment of queueing, never assumed: other
 * automation in the same transaction may already have used it, even for a
 * single guest submission. Going over is an error Apex cannot catch, and it
 * would take the respondent's submission down with it.
 */
public without sharing class FinalMappingTriggerHandler {
    @TestVisible
    private static final String NO_CAPACITY_ON_INSERT =
        'The mapping couldn’t be started: no background-job capacity was left ' +
        'when this submission was saved. Retry it.';

    public static Integer capacity() {
        return Limits.getLimitQueueableJobs() - Limits.getQueueableJobs();
    }

    public static void beforeInsert(List<Form_Submission__c> rows) {
        Set<Id> versionIds = new Set<Id>();
        for (Form_Submission__c s : rows) {
            if (s.Form_Version__c != null) {
                versionIds.add(s.Form_Version__c);
            }
        }
        Set<Id> mapped = new Set<Id>();
        if (!versionIds.isEmpty()) {
            // System mode: a guest cannot read Form_Version__c.
            for (Form_Version__c v : [
                SELECT Id, Spec_JSON__c
                FROM Form_Version__c
                WHERE Id IN :versionIds
                WITH SYSTEM_MODE
            ]) {
                if (hasMapping(v.Spec_JSON__c)) {
                    mapped.add(v.Id);
                }
            }
        }
        for (Form_Submission__c s : rows) {
            s.Mapping_Status__c = mapped.contains(s.Form_Version__c)
                ? FinalMappingRules.STATUS_QUEUED
                : FinalMappingRules.STATUS_NOT_NEEDED;
        }
    }

    /** New submissions are never refused: refusing would roll back the answers (D46). */
    public static void afterInsert(List<Form_Submission__c> rows) {
        List<Id> toQueue = new List<Id>();
        for (Form_Submission__c s : rows) {
            if (s.Mapping_Status__c == FinalMappingRules.STATUS_QUEUED) {
                toQueue.add(s.Id);
            }
        }
        if (toQueue.isEmpty()) {
            return;
        }
        Integer room = capacity();
        List<Form_Submission__c> failed = new List<Form_Submission__c>();
        for (Integer i = 0; i < toQueue.size(); i++) {
            if (i >= room) {
                failed.add(failedRow(toQueue[i], NO_CAPACITY_ON_INSERT));
                continue;
            }
            try {
                System.enqueueJob(new FinalMappingJob(toQueue[i]));
            } catch (Exception e) {
                failed.add(
                    failedRow(
                        toQueue[i],
                        'The mapping couldn’t be started: ' + e.getMessage()
                    )
                );
            }
        }
        if (!failed.isEmpty()) {
            Database.update(failed, true, AccessLevel.SYSTEM_MODE);
        }
    }

    /** A bulk retry is refused whole when it won't fit, with the real number. */
    public static void afterUpdate(
        List<Form_Submission__c> rows,
        Map<Id, Form_Submission__c> oldById
    ) {
        List<Form_Submission__c> retries = new List<Form_Submission__c>();
        for (Form_Submission__c s : rows) {
            if (
                s.Mapping_Status__c ==
                FinalMappingRules.STATUS_READY_FOR_RETRY &&
                oldById.get(s.Id).Mapping_Status__c !=
                FinalMappingRules.STATUS_READY_FOR_RETRY
            ) {
                retries.add(s);
            }
        }
        if (retries.isEmpty()) {
            return;
        }
        Integer room = capacity();
        if (retries.size() > room) {
            String message = noRoomForRetry(room);
            for (Form_Submission__c s : retries) {
                s.addError(message);
            }
            return;
        }
        for (Form_Submission__c s : retries) {
            try {
                System.enqueueJob(new FinalMappingJob(s.Id));
            } catch (Exception e) {
                s.addError('The retry couldn’t be started: ' + e.getMessage());
            }
        }
    }

    @TestVisible
    private static String noRoomForRetry(Integer room) {
        if (room <= 0) {
            return 'No background jobs can be started in this save — other automation has ' +
                'already used them. Retry in a separate save.';
        }
        if (room == 1) {
            return 'Only 1 more background job can be started in this save — retry 1 submission at a time.';
        }
        return 'Only ' +
            room +
            ' more background jobs can be started in this save — retry ' +
            room +
            ' or fewer submissions at a time.';
    }

    private static Form_Submission__c failedRow(
        Id submissionId,
        String message
    ) {
        return new Form_Submission__c(
            Id = submissionId,
            Mapping_Status__c = FinalMappingRules.STATUS_FAILED,
            Mapping_Message__c = message
        );
    }

    private static Boolean hasMapping(String specJson) {
        if (String.isBlank(specJson) || !specJson.contains('"mapping"')) {
            return false;
        }
        try {
            return !FinalMappingRules.actionsOf(
                    (Map<String, Object>) JSON.deserializeUntyped(specJson)
                )
                .isEmpty();
        } catch (Exception e) {
            return false;
        }
    }
}
