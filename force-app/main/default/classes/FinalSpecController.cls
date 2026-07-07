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

    /**
     * Resolve-at-publish (BUILD_PHASES P2): activates a new version carrying
     * the given spec. The contract is enforced HERE, not trusted from the
     * client: a publishable spec must be v1 and carry a non-empty
     * `resolved.tokens` snapshot — the published render never runs the theme
     * pipeline. Deactivates prior versions in the same transaction.
     */
    @AuraEnabled
    public static Id publishSpec(Id formId, String specJson) {
        if (formId == null || String.isBlank(specJson)) {
            throw new AuraHandledException(
                'A form Id and a specification are required.'
            );
        }
        Map<String, Object> spec;
        try {
            spec = (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw new AuraHandledException(
                'The specification is not valid JSON.'
            );
        }
        if ((Integer) spec.get('specVersion') != 1) {
            throw new AuraHandledException(
                'Unsupported specification version.'
            );
        }
        Object resolvedObj = spec.get('resolved');
        Map<String, Object> resolved = resolvedObj instanceof Map<String, Object>
            ? (Map<String, Object>) resolvedObj
            : null;
        Object tokensObj = resolved == null ? null : resolved.get('tokens');
        Map<String, Object> tokens = tokensObj instanceof Map<String, Object>
            ? (Map<String, Object>) tokensObj
            : null;
        if (tokens == null || tokens.isEmpty()) {
            throw new AuraHandledException(
                'Only resolved specifications can be published — the resolved.tokens snapshot is missing.'
            );
        }

        Savepoint sp = Database.setSavepoint();
        try {
            List<AggregateResult> maxRows = [
                SELECT MAX(Version_Number__c) latest
                FROM Form_Version__c
                WHERE Form__c = :formId
                WITH USER_MODE
            ];
            Decimal latest = (Decimal) maxRows[0].get('latest');
            Decimal nextNumber = latest == null ? 1 : latest + 1;

            List<Form_Version__c> actives = [
                SELECT Id
                FROM Form_Version__c
                WHERE Form__c = :formId AND Is_Active__c = true
                WITH USER_MODE
            ];
            for (Form_Version__c v : actives) {
                v.Is_Active__c = false;
            }
            if (!actives.isEmpty()) {
                update as user actives;
            }

            Decimal engineVersion;
            Object ev = resolved.get('engineVersion');
            engineVersion = ev instanceof Decimal
                ? (Decimal) ev
                : (ev instanceof Integer ? Decimal.valueOf((Integer) ev) : 1);

            Form_Version__c published = new Form_Version__c(
                Name = 'v' + nextNumber.intValue(),
                Form__c = formId,
                Version_Number__c = nextNumber,
                Is_Active__c = true,
                Spec_JSON__c = specJson,
                Engine_Version__c = engineVersion
            );
            insert as user published;
            return published.Id;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Publishing failed: ' + e.getMessage()
            );
        }
    }
}
