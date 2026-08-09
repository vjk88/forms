/**
 * Applies response-aware archive, restore, and zero-response deletion rules
 * for FinalDesign form roots.
 */
public with sharing class FinalFormLifecycleService {
    private static final String PUBLIC_ADAPTER = 'Public_Guest';
    private static final Integer DOCUMENT_LINK_QUERY_BOUND = 2001;

    /** Read-only destructive-action preflight shown before confirmation. */
    public class ActionSummary {
        public Id formId;
        public String formName;
        public String formType;
        public String status;
        public Integer versionCount;
        public Integer responseCount;
        public Integer invitationCount;
        public Integer configFileCount;

        /** Returns the Lightning-serializable summary contract. */
        public Map<String, Object> toMap() {
            return new Map<String, Object>{
                'formId' => formId,
                'formName' => formName,
                'formType' => formType,
                'status' => status,
                'versionCount' => versionCount,
                'responseCount' => responseCount,
                'invitationCount' => invitationCount,
                'configFileCount' => configFileCount,
                'hardDeleteAllowed' => responseCount == 0
            };
        }
    }

    /** Loads current counts used by the Delete form decision. */
    public static ActionSummary getActionSummary(Id formId) {
        Form__c form = requireForm(formId);
        ActionSummary summary = new ActionSummary();
        summary.formId = form.Id;
        summary.formName = form.Name;
        summary.formType = form.Form_Type__c;
        summary.status = form.Status__c;
        summary.versionCount = FinalFormActionsSelector.countVersions(form.Id);
        summary.responseCount = FinalFormActionsSelector.countResponses(
            form.Id
        );
        summary.invitationCount = FinalFormActionsSelector.countInvitations(
            form.Id
        );
        summary.configFileCount = FinalFormActionsSelector.selectFormFileLinks(
                form.Id
            )
            .size();
        return summary;
    }

    /** Archives a response-bearing form without removing reporting data. */
    public static void archiveForm(Id formId) {
        Form__c form = requireForm(formId);
        if (form.Status__c == 'Archived') {
            throw new LifecycleException('This form is already archived.');
        }
        Savepoint savepoint = Database.setSavepoint();
        try {
            form.Status__c = 'Archived';
            form.Allowed_Adapters__c = removePublicAdapter(
                form.Allowed_Adapters__c
            );
            form.Links_Invalidated_On__c = System.now();
            update as user form;
        } catch (DmlException e) {
            Database.rollback(savepoint);
            throw new LifecycleException('The form could not be archived.');
        }
    }

    /** Restores an archived root as a private Draft without reviving old links. */
    public static void restoreForm(Id formId) {
        Form__c form = requireForm(formId);
        if (form.Status__c != 'Archived') {
            throw new LifecycleException(
                'Only archived forms can be restored.'
            );
        }
        Savepoint savepoint = Database.setSavepoint();
        try {
            form.Status__c = 'Draft';
            form.Allowed_Adapters__c = removePublicAdapter(
                form.Allowed_Adapters__c
            );
            update as user form;
        } catch (DmlException e) {
            Database.rollback(savepoint);
            throw new LifecycleException('The form could not be restored.');
        }
    }

    /**
     * Permanently removes configuration only when no response roots exist.
     * Shared files are unlinked; exclusive files are deleted with the root.
     */
    public static void deleteForm(Id formId, String confirmationName) {
        Form__c form = requireForm(formId);
        if (
            confirmationName == null ||
            !confirmationName.trim().equals(form.Name)
        ) {
            throw new LifecycleException(
                'Type the exact form name to confirm deletion.'
            );
        }
        if (FinalFormActionsSelector.countResponses(form.Id) > 0) {
            throw new LifecycleException(
                'Forms with responses must be archived, not deleted.'
            );
        }

        List<Survey_Invitation__c> invitations = FinalFormActionsSelector.selectInvitations(
            form.Id
        );
        List<ContentDocumentLink> formLinks = FinalFormActionsSelector.selectFormFileLinks(
            form.Id
        );
        FileCleanup cleanup = planFileCleanup(form.Id, formLinks);
        Savepoint savepoint = Database.setSavepoint();
        try {
            if (!invitations.isEmpty()) {
                delete as user invitations;
            }
            if (!cleanup.linksToRemove.isEmpty()) {
                delete as user cleanup.linksToRemove;
            }
            if (!cleanup.documentsToDelete.isEmpty()) {
                delete as user cleanup.documentsToDelete;
            }
            delete as user form;
        } catch (DmlException e) {
            Database.rollback(savepoint);
            throw new LifecycleException('The form could not be deleted.');
        }
    }

    private static FileCleanup planFileCleanup(
        Id formId,
        List<ContentDocumentLink> formLinks
    ) {
        FileCleanup cleanup = new FileCleanup();
        Set<Id> documentIds = new Set<Id>();
        Map<Id, ContentDocumentLink> formLinkByDocument = new Map<Id, ContentDocumentLink>();
        for (ContentDocumentLink link : formLinks) {
            documentIds.add(link.ContentDocumentId);
            formLinkByDocument.put(link.ContentDocumentId, link);
        }
        List<ContentDocumentLink> allLinks = FinalFormActionsSelector.selectDocumentLinks(
            documentIds
        );
        Boolean queryBoundReached =
            allLinks.size() >= DOCUMENT_LINK_QUERY_BOUND;
        Set<Id> externallyLinked = new Set<Id>();
        if (queryBoundReached) {
            externallyLinked.addAll(documentIds);
        } else {
            for (ContentDocumentLink link : allLinks) {
                if (
                    link.LinkedEntityId != formId &&
                    link.LinkedEntityId.getSObjectType() != User.SObjectType
                ) {
                    externallyLinked.add(link.ContentDocumentId);
                }
            }
        }
        for (Id documentId : documentIds) {
            if (externallyLinked.contains(documentId)) {
                cleanup.linksToRemove.add(formLinkByDocument.get(documentId));
            } else {
                cleanup.documentsToDelete.add(
                    new ContentDocument(Id = documentId)
                );
            }
        }
        return cleanup;
    }

    private static Form__c requireForm(Id formId) {
        if (formId == null) {
            throw new LifecycleException('A form is required.');
        }
        Form__c form = FinalFormActionsSelector.selectFormById(formId);
        if (form == null) {
            throw new LifecycleException('The form is unavailable.');
        }
        return form;
    }

    private static String removePublicAdapter(String adapters) {
        if (String.isBlank(adapters)) {
            return null;
        }
        List<String> retained = new List<String>();
        for (String adapter : adapters.split(';')) {
            if (String.isNotBlank(adapter) && adapter != PUBLIC_ADAPTER) {
                retained.add(adapter);
            }
        }
        return retained.isEmpty() ? null : String.join(retained, ';');
    }

    private class FileCleanup {
        private List<ContentDocumentLink> linksToRemove = new List<ContentDocumentLink>();
        private List<ContentDocument> documentsToDelete = new List<ContentDocument>();
    }

    /** Retention or transaction error surfaced through Studio Actions. */
    public class LifecycleException extends Exception {
    }
}
