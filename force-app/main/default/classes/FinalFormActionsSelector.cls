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
                Allowed_Adapters__c,
                Links_Invalidated_On__c
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

    /** Loads one visible custom theme. */
    public static Theme_Definition__c selectThemeById(Id themeId) {
        if (themeId == null) {
            return null;
        }
        List<Theme_Definition__c> themes = [
            SELECT Id, Name, Base_Theme__c, Theme_JSON__c
            FROM Theme_Definition__c
            WHERE Id = :themeId
            WITH USER_MODE
            LIMIT 1
        ];
        return themes.isEmpty() ? null : themes[0];
    }

    /** Loads one visible custom theme by its portable name. */
    public static Theme_Definition__c selectThemeByName(String themeName) {
        if (String.isBlank(themeName)) {
            return null;
        }
        List<Theme_Definition__c> themes = [
            SELECT Id, Name, Base_Theme__c, Theme_JSON__c
            FROM Theme_Definition__c
            WHERE Name = :themeName
            WITH USER_MODE
            LIMIT 1
        ];
        return themes.isEmpty() ? null : themes[0];
    }

    /** Loads active or inactive survey topics by portable names. */
    public static List<Survey_Topic__c> selectTopicsByNames(
        Set<String> topicNames
    ) {
        if (topicNames == null || topicNames.isEmpty()) {
            return new List<Survey_Topic__c>();
        }
        return [
            SELECT Id, Name, Active__c
            FROM Survey_Topic__c
            WHERE Name IN :topicNames
            WITH USER_MODE
            LIMIT 500
        ];
    }

    /** Loads visible file versions used by an export or same-org import. */
    public static List<ContentVersion> selectContentVersions(
        Set<Id> contentVersionIds
    ) {
        if (contentVersionIds == null || contentVersionIds.isEmpty()) {
            return new List<ContentVersion>();
        }
        return [
            SELECT Id, ContentDocumentId, Title, FileExtension, ContentSize
            FROM ContentVersion
            WHERE Id IN :contentVersionIds
            WITH USER_MODE
            LIMIT 500
        ];
    }

    /** Counts versions owned by one form. */
    public static Integer countVersions(Id formId) {
        return formId == null
            ? 0
            : [
                  SELECT COUNT()
                  FROM Form_Version__c
                  WHERE Form__c = :formId
                  WITH USER_MODE
              ];
    }

    /** Counts response roots across every version of one form. */
    public static Integer countResponses(Id formId) {
        return formId == null
            ? 0
            : [
                  SELECT COUNT()
                  FROM Form_Response__c
                  WHERE Form_Version__r.Form__c = :formId
                  WITH USER_MODE
              ];
    }

    /** Counts tracked invitations owned by one form. */
    public static Integer countInvitations(Id formId) {
        return formId == null
            ? 0
            : [
                  SELECT COUNT()
                  FROM Survey_Invitation__c
                  WHERE Form__c = :formId
                  WITH USER_MODE
              ];
    }

    /** Loads invitations for explicit cleanup during hard deletion. */
    public static List<Survey_Invitation__c> selectInvitations(Id formId) {
        if (formId == null) {
            return new List<Survey_Invitation__c>();
        }
        return [
            SELECT Id
            FROM Survey_Invitation__c
            WHERE Form__c = :formId
            WITH USER_MODE
            LIMIT 5000
        ];
    }

    /** Loads every visible file link directly attached to one form. */
    public static List<ContentDocumentLink> selectFormFileLinks(Id formId) {
        if (formId == null) {
            return new List<ContentDocumentLink>();
        }
        return [
            SELECT Id, ContentDocumentId, LinkedEntityId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :formId
            WITH USER_MODE
            LIMIT 500
        ];
    }

    /**
     * Loads a bounded set of consumers for supplied documents. The extra row
     * lets callers detect the bound and choose the non-destructive path.
     */
    public static List<ContentDocumentLink> selectDocumentLinks(
        Set<Id> contentDocumentIds
    ) {
        if (contentDocumentIds == null || contentDocumentIds.isEmpty()) {
            return new List<ContentDocumentLink>();
        }
        return [
            SELECT Id, ContentDocumentId, LinkedEntityId
            FROM ContentDocumentLink
            WHERE ContentDocumentId IN :contentDocumentIds
            WITH USER_MODE
            LIMIT 2001
        ];
    }
}
