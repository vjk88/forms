/**
 * FinalSpecController — published-spec fetch for the rebuild viewer.
 *
 * P0 scope: INTERNAL users only (with sharing + USER_MODE). The guest-facing
 * delivery path arrives in P5 as a separate guarded `without sharing` family
 * per docs/FinalDesign/RUNTIME_NOTES.md — never by loosening this class.
 */
public with sharing class FinalSpecController {
    /**
     * Returns the Spec_JSON__c blob for a specific version, or the active
     * published version of a form when only formId is given.
     */
    @AuraEnabled(cacheable=true)
    public static String getSpec(Id formId, Id versionId) {
        try {
            List<Form_Version__c> versions;
            if (versionId != null) {
                versions = [
                    SELECT Spec_JSON__c
                    FROM Form_Version__c
                    WHERE Id = :versionId
                    WITH USER_MODE
                    LIMIT 1
                ];
            } else if (formId != null) {
                versions = [
                    SELECT Spec_JSON__c
                    FROM Form_Version__c
                    WHERE Form__c = :formId AND Is_Active__c = true
                    WITH USER_MODE
                    ORDER BY Version_Number__c DESC
                    LIMIT 1
                ];
            } else {
                throw new AuraHandledException(
                    'A form Id or version Id is required.'
                );
            }
            if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
                throw new AuraHandledException(
                    'No published specification found for this form.'
                );
            }
            return versions[0].Spec_JSON__c;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('The form could not be loaded.');
        }
    }
}
