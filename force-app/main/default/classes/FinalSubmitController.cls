/**
 * FinalSubmitController — INTERNAL submit entry point (BUILD_PHASES P3 slice 7).
 *
 * The mapping/coercion/atomic-DML engine now lives in the shared
 * FinalSubmitService (Phase A slice A1); this class is the thin, internal-
 * audience wrapper: it loads the version's spec under the running user
 * (WITH USER_MODE), parses the payload, and runs the service in INTERNAL
 * posture (the user's own CRUD/FLS via stripInaccessible + `insert as user`).
 * Public API (submitForm → SubmitResult) is unchanged.
 *
 * The guest path is a SEPARATE allow-listed controller (FinalGuestController,
 * `without sharing`) that runs the SAME service in GUEST posture — this class
 * never serves guests (RUNTIME_NOTES elevated-context rules).
 */
public with sharing class FinalSubmitController {
    public class SubmitResult {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public Integer childCount;
    }

    @AuraEnabled
    public static SubmitResult submitForm(
        Id formId,
        Id versionId,
        String payloadJson
    ) {
        if (String.isBlank(payloadJson)) {
            throw new AuraHandledException('A submission payload is required.');
        }
        Map<String, Object> spec = loadSpec(formId, versionId);
        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            throw new AuraHandledException('The payload is not valid JSON.');
        }
        FinalSubmitService.SubmitOutcome outcome = FinalSubmitService.run(
            spec,
            payload,
            FinalSubmitService.Posture.INTERNAL
        );
        SubmitResult res = new SubmitResult();
        res.recordId = outcome.recordId;
        res.childCount = outcome.childCount;
        return res;
    }

    /** The submitted version's spec: explicit version, else the ACTIVE one. */
    private static Map<String, Object> loadSpec(Id formId, Id versionId) {
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
                WHERE Form__c = :formId AND Is_Active__c = TRUE
                WITH USER_MODE
                ORDER BY Version_Number__c DESC
                LIMIT 1
            ];
        } else {
            throw new AuraHandledException('A form or version Id is required.');
        }
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(
                'This form has no published version to submit to.'
            );
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(
                versions[0].Spec_JSON__c
            );
        } catch (Exception e) {
            throw new AuraHandledException(
                'The form specification could not be read.'
            );
        }
    }
}
