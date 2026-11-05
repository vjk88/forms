/**
 * Survey responses: queues the saved PDF copy (IMPL_PLAN_FORM_PDF §6.4).
 * Before insert decides the status; after insert queues the job.
 */
trigger FinalFormResponseTrigger on Form_Response__c(
    before insert,
    after insert
) {
    if (Trigger.isBefore) {
        FinalSubmissionCopyTrigger.beforeInsert(Trigger.new);
    } else {
        FinalSubmissionCopyTrigger.afterInsert(Trigger.new);
    }
}
