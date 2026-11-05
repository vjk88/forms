/**
 * Saves one submission's PDF copy in the background (IMPL_PLAN_FORM_PDF §6.4).
 * Thin on purpose: FinalSubmissionCopy records success or failure itself.
 */
public without sharing class FinalSubmissionCopyJob implements Queueable {
    private final Id submissionId;

    public FinalSubmissionCopyJob(Id submissionId) {
        this.submissionId = submissionId;
    }

    public void execute(QueueableContext context) {
        FinalSubmissionCopy.save(submissionId, false);
    }
}
