/**
 * One background mapping run (FREEFORM_F2_MAPPING_SPEC 6.3). Deliberately
 * thin: an uncaught exception here stays uncaught. Its reason lives in
 * Setup → Apex Jobs and the submission keeps its status (D43).
 */
public without sharing class FinalMappingJob implements Queueable {
    private final Id submissionId;

    public FinalMappingJob(Id submissionId) {
        this.submissionId = submissionId;
    }

    public void execute(QueueableContext context) {
        FinalMappingService.run(submissionId);
    }
}
