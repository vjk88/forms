/**
 * Coordinates atomic Studio actions across form roots, versions, and files.
 */
public with sharing class FinalFormActionsService {
    private static final String PUBLIC_ADAPTER = 'Public_Guest';

    @TestVisible
    private static Boolean failAfterRootInsert = false;

    /** Result of a successful clone transaction. */
    public class CloneResult {
        public Id formId;
        public Id versionId;
    }

    /**
     * Clones the current authoring state into a private Draft root and v1.
     * @param sourceFormId Existing form being authored.
     * @param currentSpecJson Untrusted current in-memory authoring JSON.
     * @param requestedName User-confirmed name for the clone.
     * @return Identifiers for the new form and version.
     * @throws ActionException when validation or the transaction fails.
     */
    public static CloneResult cloneForm(
        Id sourceFormId,
        String currentSpecJson,
        String requestedName
    ) {
        if (sourceFormId == null) {
            throw new ActionException('A source form is required.');
        }
        String cloneName = requestedName == null ? null : requestedName.trim();
        if (String.isBlank(cloneName)) {
            throw new ActionException('Enter a name for the cloned form.');
        }
        if (cloneName.length() > Form__c.Name.getDescribe().getLength()) {
            throw new ActionException('The cloned form name is too long.');
        }

        Form__c source = FinalFormActionsSelector.selectFormById(sourceFormId);
        if (source == null) {
            throw new ActionException('The source form is unavailable.');
        }
        if (source.Status__c == 'Archived') {
            throw new ActionException(
                'Restore the archived form before cloning it.'
            );
        }

        String expectedType = source.Form_Type__c == 'Survey'
            ? 'survey'
            : 'form';
        FinalSpecTransferService.PreparedSpec prepared;
        try {
            prepared = FinalSpecTransferService.prepareClone(
                currentSpecJson,
                expectedType
            );
        } catch (FinalSpecTransferService.TransferException e) {
            throw new ActionException(e.getMessage());
        }

        List<ContentDocumentLink> sourceLinks = FinalFormActionsSelector.selectReferencedFileLinks(
            source.Id,
            prepared.assetVersionIds
        );

        Savepoint savepoint = Database.setSavepoint();
        try {
            Form__c clone = new Form__c(
                Name = cloneName,
                Description__c = source.Description__c,
                Form_Type__c = source.Form_Type__c,
                Status__c = 'Draft',
                Primary_Context_Object__c = prepared.targetObject,
                Allowed_Adapters__c = removePublicAdapter(
                    source.Allowed_Adapters__c
                )
            );
            insert as user clone;

            if (failAfterRootInsert) {
                throw new ActionException('Simulated clone failure.');
            }

            String cloneSpecJson = FinalSpecTransferService.bindIdentityAndSerialize(
                prepared,
                clone.Id,
                cloneName
            );
            Form_Version__c version = new Form_Version__c(
                Form__c = clone.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Spec_JSON__c = cloneSpecJson,
                Engine_Version__c = 1
            );
            insert as user version;

            List<ContentDocumentLink> cloneLinks = new List<ContentDocumentLink>();
            for (ContentDocumentLink sourceLink : sourceLinks) {
                cloneLinks.add(
                    new ContentDocumentLink(
                        ContentDocumentId = sourceLink.ContentDocumentId,
                        LinkedEntityId = clone.Id,
                        ShareType = 'V',
                        Visibility = sourceLink.Visibility
                    )
                );
            }
            if (!cloneLinks.isEmpty()) {
                insert as user cloneLinks;
            }

            CloneResult result = new CloneResult();
            result.formId = clone.Id;
            result.versionId = version.Id;
            return result;
        } catch (ActionException e) {
            Database.rollback(savepoint);
            throw e;
        } catch (DmlException e) {
            Database.rollback(savepoint);
            throw new ActionException('The cloned form could not be saved.');
        } catch (Exception e) {
            Database.rollback(savepoint);
            throw new ActionException('The form could not be cloned.');
        }
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

    /** Domain error surfaced through the thin Aura controller. */
    public class ActionException extends Exception {
    }
}
