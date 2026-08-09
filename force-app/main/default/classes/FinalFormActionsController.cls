/**
 * Thin Lightning boundary for Studio form actions.
 */
public with sharing class FinalFormActionsController {
    /** Builds the current authoring state as a v1 JSON download payload. */
    @AuraEnabled
    public static Map<String, Object> exportForm(
        Id formId,
        String currentSpecJson
    ) {
        try {
            FinalFormPackageService.ExportResult result = FinalFormActionsService.exportForm(
                formId,
                currentSpecJson
            );
            return new Map<String, Object>{
                'fileName' => result.fileName,
                'packageJson' => result.packageJson,
                'warnings' => result.warnings
            };
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be exported.');
        }
    }

    /** Inspects an import package without creating or updating records. */
    @AuraEnabled
    public static Map<String, Object> inspectImport(String packageJson) {
        try {
            return FinalFormActionsService.inspectImport(packageJson)
                .toInspectionMap();
        } catch (FinalFormActionsService.ActionException e) {
            return invalidInspection(e.getMessage());
        } catch (Exception e) {
            return invalidInspection(
                'The import package could not be inspected.'
            );
        }
    }

    /** Creates a private Draft from a revalidated package. */
    @AuraEnabled
    public static Map<String, Object> importForm(
        String packageJson,
        String requestedName,
        List<String> acceptedWarningCodes
    ) {
        try {
            FinalFormActionsService.CloneResult result = FinalFormActionsService.importForm(
                packageJson,
                requestedName,
                acceptedWarningCodes
            );
            return new Map<String, Object>{
                'formId' => result.formId,
                'versionId' => result.versionId
            };
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be imported.');
        }
    }

    /** Returns response, invitation, version, and file counts for deletion. */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getActionSummary(Id formId) {
        try {
            return FinalFormActionsService.getActionSummary(formId).toMap();
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('Form details could not be loaded.');
        }
    }

    /** Archives a form while preserving its response graph. */
    @AuraEnabled
    public static void archiveForm(Id formId) {
        try {
            FinalFormActionsService.archiveForm(formId);
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be archived.');
        }
    }

    /** Permanently deletes one zero-response form configuration. */
    @AuraEnabled
    public static void deleteForm(Id formId, String confirmationName) {
        try {
            FinalFormActionsService.deleteForm(formId, confirmationName);
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be deleted.');
        }
    }

    /** Restores an archived form as a private Draft. */
    @AuraEnabled
    public static void restoreForm(Id formId) {
        try {
            FinalFormActionsService.restoreForm(formId);
        } catch (FinalFormActionsService.ActionException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be restored.');
        }
    }

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

    private static Map<String, Object> invalidInspection(String message) {
        return new Map<String, Object>{
            'valid' => false,
            'warnings' => new List<Object>(),
            'errors' => new List<String>{ message }
        };
    }
}
