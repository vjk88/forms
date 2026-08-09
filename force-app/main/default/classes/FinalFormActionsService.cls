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

    /** Builds a validated portable package from the current authoring state. */
    public static FinalFormPackageService.ExportResult exportForm(
        Id sourceFormId,
        String currentSpecJson
    ) {
        Form__c source = requireEditableSource(sourceFormId);
        String expectedType = source.Form_Type__c == 'Survey'
            ? 'survey'
            : 'form';
        try {
            FinalSpecTransferService.PreparedSpec prepared = FinalSpecTransferService.prepareExport(
                currentSpecJson,
                expectedType
            );
            return FinalFormPackageService.buildExport(source, prepared);
        } catch (FinalSpecTransferService.TransferException e) {
            throw new ActionException(e.getMessage());
        } catch (FinalFormPackageService.PackageException e) {
            throw new ActionException(e.getMessage());
        }
    }

    /** Inspects a package without DML. */
    public static FinalFormPackageService.ImportPlan inspectImport(
        String packageJson
    ) {
        try {
            return FinalFormPackageService.inspect(packageJson);
        } catch (FinalFormPackageService.PackageException e) {
            throw new ActionException(e.getMessage());
        }
    }

    /** Creates a new private Draft from a revalidated package. */
    public static CloneResult importForm(
        String packageJson,
        String requestedName,
        List<String> acceptedWarningCodes
    ) {
        String importName = validateNewName(requestedName, 'imported');
        FinalFormPackageService.ImportPlan plan = inspectImport(packageJson);
        Set<String> accepted = new Set<String>();
        if (acceptedWarningCodes != null) {
            accepted.addAll(acceptedWarningCodes);
        }
        if (
            !accepted.containsAll(
                FinalFormPackageService.requiredWarningCodes(plan)
            )
        ) {
            throw new ActionException(
                'Review and accept the import warnings before creating the form.'
            );
        }
        if (
            plan.description != null &&
            plan.description.length() >
            Form__c.Description__c.getDescribe().getLength()
        ) {
            throw new ActionException('The imported description is too long.');
        }

        Savepoint savepoint = Database.setSavepoint();
        try {
            FinalFormPackageService.materializeDependencies(plan);
            Form__c imported = new Form__c(
                Name = importName,
                Description__c = plan.description,
                Form_Type__c = plan.formType == 'survey' ? 'Survey' : 'Form',
                Status__c = 'Draft',
                Primary_Context_Object__c = plan.prepared.targetObject,
                Allowed_Adapters__c = 'Internal_Record_Page'
            );
            insert as user imported;

            String specJson = FinalSpecTransferService.bindIdentityAndSerialize(
                plan.prepared,
                imported.Id,
                importName
            );
            Form_Version__c version = new Form_Version__c(
                Form__c = imported.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Spec_JSON__c = specJson,
                Engine_Version__c = 1
            );
            insert as user version;

            List<ContentDocumentLink> links = new List<ContentDocumentLink>();
            for (Id documentId : plan.assetDocumentIds) {
                links.add(
                    new ContentDocumentLink(
                        ContentDocumentId = documentId,
                        LinkedEntityId = imported.Id,
                        ShareType = 'V',
                        Visibility = 'AllUsers'
                    )
                );
            }
            if (!links.isEmpty()) {
                insert as user links;
            }

            CloneResult result = new CloneResult();
            result.formId = imported.Id;
            result.versionId = version.Id;
            return result;
        } catch (DmlException e) {
            Database.rollback(savepoint);
            throw new ActionException('The imported form could not be saved.');
        } catch (Exception e) {
            Database.rollback(savepoint);
            throw new ActionException('The form could not be imported.');
        }
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
        String cloneName = validateNewName(requestedName, 'cloned');
        Form__c source = requireEditableSource(sourceFormId);

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

    /** Returns the response-aware Delete form preflight. */
    public static FinalFormLifecycleService.ActionSummary getActionSummary(
        Id formId
    ) {
        try {
            return FinalFormLifecycleService.getActionSummary(formId);
        } catch (FinalFormLifecycleService.LifecycleException e) {
            throw new ActionException(e.getMessage());
        }
    }

    /** Archives one root while retaining all response history. */
    public static void archiveForm(Id formId) {
        try {
            FinalFormLifecycleService.archiveForm(formId);
        } catch (FinalFormLifecycleService.LifecycleException e) {
            throw new ActionException(e.getMessage());
        }
    }

    /** Deletes one zero-response root after exact-name confirmation. */
    public static void deleteForm(Id formId, String confirmationName) {
        try {
            FinalFormLifecycleService.deleteForm(formId, confirmationName);
        } catch (FinalFormLifecycleService.LifecycleException e) {
            throw new ActionException(e.getMessage());
        }
    }

    /** Restores one archived root as a private Draft. */
    public static void restoreForm(Id formId) {
        try {
            FinalFormLifecycleService.restoreForm(formId);
        } catch (FinalFormLifecycleService.LifecycleException e) {
            throw new ActionException(e.getMessage());
        }
    }

    private static Form__c requireEditableSource(Id sourceFormId) {
        if (sourceFormId == null) {
            throw new ActionException('A source form is required.');
        }
        Form__c source = FinalFormActionsSelector.selectFormById(sourceFormId);
        if (source == null) {
            throw new ActionException('The source form is unavailable.');
        }
        if (source.Status__c == 'Archived') {
            throw new ActionException(
                'Restore the archived form before using Studio Actions.'
            );
        }
        return source;
    }

    private static String validateNewName(String requestedName, String action) {
        String name = requestedName == null ? null : requestedName.trim();
        if (String.isBlank(name)) {
            throw new ActionException(
                'Enter a name for the ' + action + ' form.'
            );
        }
        if (name.length() > Form__c.Name.getDescribe().getLength()) {
            throw new ActionException(
                'The ' + action + ' form name is too long.'
            );
        }
        return name;
    }

    /** Domain error surfaced through the thin Aura controller. */
    public class ActionException extends Exception {
    }
}
