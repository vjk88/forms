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
    private static final String LINK_REFUSED = 'This link is no longer valid. Nothing was recorded.';

    public class SubmitResult {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public Integer childCount;
        /** Field-level rejections, so the respondent lands on the field that
         *  actually failed instead of reading one generic sentence. Null on
         *  success. Authenticated callers only — the guest controller never
         *  discloses field detail. */
        @AuraEnabled
        public List<FinalSubmitService.FieldError> errors;
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
        Form_Version__c version = loadVersion(formId, versionId);
        Map<String, Object> spec = parseSpec(version.Spec_JSON__c);
        // Availability (DEFERRED #20 → S1 ruling 7-1): the authored closed
        // flag / open-close window now gates INTERNAL submits too — same one
        // truth the guest controller enforces.
        if (FinalSubmitService.isClosed(spec)) {
            throw new AuraHandledException(
                FinalSubmitService.closedMessage(spec)
            );
        }
        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            throw new AuraHandledException('The payload is not valid JSON.');
        }
        // Personalized link (?c__rt=): the same checks a guest gets (owner
        // 2026-09-15 - links work for everyone). A revoked/expired/used tracked
        // link is refused before anything saves; a single-use link burns; the
        // response is stamped with the link's record.
        Map<String, Object> meta = payload.get(
                'meta'
            ) instanceof Map<String, Object>
            ? (Map<String, Object>) payload.get('meta')
            : null;
        Object rt = meta == null ? null : meta.get('rt');
        FinalLinkService.LinkSubmit link;
        try {
            link = FinalLinkService.beginSubmit(
                version.Form__c,
                spec,
                rt instanceof String ? (String) rt : null
            );
        } catch (FinalLinkService.LinkException e) {
            throw new AuraHandledException(LINK_REFUSED);
        }
        FinalSubmitService.SubmitOutcome outcome;
        try {
            outcome = FinalSubmitService.run(
                spec,
                payload,
                version.Id, // the SERVER-loaded version identity (never client-claimed)
                FinalSubmitService.Posture.INTERNAL
            );
        } catch (Exception e) {
            link.rollback();
            throw e;
        }
        // Field errors mean nothing saved: leave the link unused.
        if (outcome.errors == null || outcome.errors.isEmpty()) {
            try {
                link.finish(outcome.recordId);
            } catch (FinalLinkService.LinkException e) {
                throw new AuraHandledException(LINK_REFUSED);
            }
        }
        SubmitResult res = new SubmitResult();
        res.recordId = outcome.recordId;
        res.childCount = outcome.childCount;
        res.errors = outcome.errors;
        return res;
    }

    /** The submitted version (Id + spec): explicit version, else the ACTIVE
     *  one. Returning the RECORD (not just the parsed spec) is the rev-2
     *  trust fix — the service anchors survey responses to the Id the server
     *  actually loaded. */
    private static Form_Version__c loadVersion(Id formId, Id versionId) {
        List<Form_Version__c> versions;
        if (versionId != null) {
            versions = [
                SELECT Id, Form__c, Spec_JSON__c
                FROM Form_Version__c
                WHERE Id = :versionId
                WITH USER_MODE
                LIMIT 1
            ];
        } else if (formId != null) {
            versions = [
                SELECT Id, Form__c, Spec_JSON__c
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
        return versions[0];
    }

    private static Map<String, Object> parseSpec(String specJson) {
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw new AuraHandledException(
                'The form specification could not be read.'
            );
        }
    }
}
