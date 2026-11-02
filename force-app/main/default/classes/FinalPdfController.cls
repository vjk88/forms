/**
 * FinalPdfController — image bytes for PDFs built by signed-in users
 * (IMPL_PLAN_FORM_PDF §5): a submission's copy, the Studio's blank form, a
 * respondent's copy on an internal page.
 *
 * USER MODE: the browser names the files, and the running user's own access
 * decides which come back. Asking for a file you cannot open returns it in
 * `skipped`, exactly like a file that does not exist.
 *
 * Guests never reach this class (it is not on the guest profile); their
 * images come from FinalGuestController.getGuestPdfImages.
 */
public with sharing class FinalPdfController {
    @AuraEnabled
    public static FinalPdfImageService.Result getImages(List<Id> versionIds) {
        return FinalPdfImageService.read(
            versionIds == null ? new Set<Id>() : new Set<Id>(versionIds),
            true
        );
    }
}
