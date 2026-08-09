/**
 * Thin Lightning boundary for Studio form actions.
 */
public with sharing class FinalFormActionsController {
    /**
     * Clones the current in-memory authoring state into a new private Draft.
     * @param formId Source Form__c identifier.
     * @param currentSpecJson Current Studio authoring JSON, including unsaved edits.
     * @param requestedName User-confirmed clone name.
     * @return Map containing the new formId and versionId.
     */
    @AuraEnabled
    public static Map<String, Object> cloneForm(
        Id formId,
        String currentSpecJson,
        String requestedName
    ) {
        try {
            FinalFormActionsService.CloneResult result = FinalFormActionsService.cloneForm(
                formId,
                currentSpecJson,
                requestedName
            );
            return new Map<String, Object>{
                'formId' => result.formId,
                'versionId' => result.versionId
            };
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be cloned.');
        }
    }
}
