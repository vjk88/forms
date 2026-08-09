/**
 * Bounded, user-mode reads used by Studio form actions.
 */
public inherited sharing class FinalFormActionsSelector {
    /**
     * Loads one form root for an action transaction.
     * @param formId Form record identifier.
     * @return The visible form, or null when it is unavailable to the user.
     */
    public static Form__c selectFormById(Id formId) {
        if (formId == null) {
            return null;
        }
        List<Form__c> forms = [
            SELECT
                Id,
                Name,
                Description__c,
                Form_Type__c,
                Status__c,
                Primary_Context_Object__c,
                Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            WITH USER_MODE
            LIMIT 1
        ];
        return forms.isEmpty() ? null : forms[0];
    }

    /**
     * Finds source-form file links whose content versions are referenced by
     * the current authoring specification.
     * @param formId Source form identifier.
     * @param contentVersionIds Referenced ContentVersion identifiers.
     * @return Visible ContentDocumentLink rows, bounded by the supplied ids.
     */
    public static List<ContentDocumentLink> selectReferencedFileLinks(
        Id formId,
        Set<Id> contentVersionIds
    ) {
        if (
            formId == null ||
            contentVersionIds == null ||
            contentVersionIds.isEmpty()
        ) {
            return new List<ContentDocumentLink>();
        }

        Set<Id> contentDocumentIds = new Set<Id>();
        for (ContentVersion version : [
            SELECT Id, ContentDocumentId
            FROM ContentVersion
            WHERE Id IN :contentVersionIds
            WITH USER_MODE
            LIMIT 500
        ]) {
            contentDocumentIds.add(version.ContentDocumentId);
        }
        if (contentDocumentIds.isEmpty()) {
            return new List<ContentDocumentLink>();
        }

        return [
            SELECT Id, ContentDocumentId, ShareType, Visibility
            FROM ContentDocumentLink
            WHERE
                LinkedEntityId = :formId
                AND ContentDocumentId IN :contentDocumentIds
            WITH USER_MODE
            LIMIT 500
        ];
    }
}
