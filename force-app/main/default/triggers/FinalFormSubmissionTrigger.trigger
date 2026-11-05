/**
 * The one entry point for every mapping run (FREEFORM_F2_MAPPING_SPEC D41),
 * and for queueing the saved PDF copy (IMPL_PLAN_FORM_PDF §6.4).
 * Before insert decides the status; after insert queues new runs; after
 * update queues a run only on a change TO Ready for Retry.
 */
trigger FinalFormSubmissionTrigger on Form_Submission__c(
    before insert,
    after insert,
    after update
) {
    if (Trigger.isBefore && Trigger.isInsert) {
        FinalMappingTriggerHandler.beforeInsert(Trigger.new);
        // the saved PDF copy (IMPL_PLAN_FORM_PDF §6.4)
        FinalSubmissionCopyTrigger.beforeInsert(Trigger.new);
    } else if (Trigger.isAfter && Trigger.isInsert) {
        FinalMappingTriggerHandler.afterInsert(Trigger.new);
        FinalSubmissionCopyTrigger.afterInsert(Trigger.new);
    } else if (Trigger.isAfter && Trigger.isUpdate) {
        FinalMappingTriggerHandler.afterUpdate(Trigger.new, Trigger.oldMap);
    }
}
