/**
 * "Save PDF copy" for Flow (IMPL_PLAN_FORM_PDF §6.4): makes a submission's or
 * survey response's PDF copy again, as the user running the Flow. Survey
 * responses have no Answers card, so this is their Try again: an admin adds
 * it to a screen Flow behind a button on the record page, no code needed.
 * Same rules as the card's button (FinalSubmissionController.saveCopy).
 */
public with sharing class FinalSaveCopyAction {
    public class Result {
        @InvocableVariable(label='Status' description='Saved or Failed')
        public String status;
        @InvocableVariable(
            label='Message'
            description='Why it failed, when it did'
        )
        public String message;
    }

    @InvocableMethod(
        label='Save PDF copy'
        description='Makes a PDF copy of a Freeform submission or survey response and saves it in the record\'s Files.'
        category='Forms'
    )
    public static List<Result> run(List<Id> recordIds) {
        List<Result> out = new List<Result>();
        for (Id recordId : recordIds) {
            Result r = new Result();
            try {
                Map<String, Object> info = FinalSubmissionController.saveCopy(
                    recordId
                );
                r.status = info == null ? null : (String) info.get('status');
                r.message = info == null ? null : (String) info.get('message');
            } catch (Exception e) {
                r.status = FinalSubmissionCopy.STATUS_FAILED;
                r.message = e.getMessage();
            }
            out.add(r);
        }
        return out;
    }
}
