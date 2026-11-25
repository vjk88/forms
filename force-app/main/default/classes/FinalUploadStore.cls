/**
 * Narrow system-context persistence for token-authorized form uploads.
 * Guests intentionally have no ledger CRUD or authoring access. Entry services validate
 * actor, secret token and exact public/version gates before exposing safe projections.
 */
@SuppressWarnings('PMD.ApexCRUDViolation')
public without sharing class FinalUploadStore {
    private static final String ATTEMPT_FIELDS = 'Id, Public_Key__c, Token_Hash__c, Form__c, Form_Version__c, Actor_User__c, Guest_User_Id__c, Public_Host__c, Status__c, Expires_At__c, Files_JSON__c, Submission_Key__c, Result_Record_Id__c, Result_Child_Count__c, Consumed_At__c, Cleanup_After__c';

    /** Lock only this operation's attempts. Public keys are lookup hints, never authorization. */
    public static Map<String, Form_Upload__c> lockAttempts(Set<String> keys) {
        Map<String, Form_Upload__c> result = new Map<String, Form_Upload__c>();
        if (keys.isEmpty()) {
            return result;
        }
        for (
            SObject row : Database.queryWithBinds(
                'SELECT ' +
                    ATTEMPT_FIELDS +
                    ' FROM Form_Upload__c WHERE Public_Key__c IN :keys FOR UPDATE',
                new Map<String, Object>{ 'keys' => keys },
                AccessLevel.SYSTEM_MODE
            )
        ) {
            Form_Upload__c attempt = (Form_Upload__c) row;
            result.put(attempt.Public_Key__c, attempt);
        }
        return result;
    }

    /** Bulk-load server-owned published specs, applying user access only for internal hosts. */
    public static Map<Id, Map<String, Object>> specs(
        List<Form_Upload__c> attempts
    ) {
        Set<Id> versionIds = new Set<Id>();
        Set<Id> formIds = new Set<Id>();
        Set<Id> internalForms = new Set<Id>();
        for (Form_Upload__c a : attempts) {
            versionIds.add(a.Form_Version__c);
            formIds.add(a.Form__c);
            if (!a.Public_Host__c) {
                internalForms.add(a.Form__c);
            }
        }
        Map<Id, Form__c> forms = new Map<Id, Form__c>(
            [
                SELECT Id, Status__c, Is_Public__c
                FROM Form__c
                WHERE Id IN :formIds
            ]
        );
        Set<Id> accessible = new Set<Id>();
        if (!internalForms.isEmpty()) {
            for (Form__c f : [
                SELECT Id
                FROM Form__c
                WHERE Id IN :internalForms
                WITH USER_MODE
            ]) {
                accessible.add(f.Id);
            }
        }
        Map<Id, Form_Version__c> versions = new Map<Id, Form_Version__c>(
            [
                SELECT
                    Id,
                    Form__c,
                    Is_Active__c,
                    Spec_JSON__c,
                    Spec_JSON_2__c,
                    Spec_JSON_3__c
                FROM Form_Version__c
                WHERE Id IN :versionIds
            ]
        );
        Map<Id, Map<String, Object>> result = new Map<Id, Map<String, Object>>();
        for (Form_Upload__c a : attempts) {
            Form__c form = forms.get(a.Form__c);
            Form_Version__c v = versions.get(a.Form_Version__c);
            if (
                form == null ||
                form.Status__c != 'Published' ||
                v == null ||
                !v.Is_Active__c ||
                v.Form__c != form.Id ||
                (a.Public_Host__c
                    ? !form.Is_Public__c
                    : !accessible.contains(form.Id))
            ) {
                throw FinalUploadService.refuse(null);
            }
            Map<String, Object> spec = FinalUploadPolicy.mapOf(
                JSON.deserializeUntyped(FinalSpecStore.read(v))
            );
            if (
                !FinalUploadPolicy.staged(spec) ||
                FinalSubmitService.isClosed(spec)
            ) {
                throw FinalUploadService.refuse(null);
            }
            result.put(v.Id, spec);
        }
        return result;
    }

    public static void insertAttempt(Form_Upload__c row) {
        insert row;
    }
    public static void saveAttempts(List<Form_Upload__c> rows) {
        if (!rows.isEmpty()) {
            update rows;
        }
    }

    /** Metadata only. Never query file bodies. */
    public static Map<Id, ContentVersion> versions(Set<Id> ids) {
        if (ids.isEmpty()) {
            return new Map<Id, ContentVersion>();
        }
        return new Map<Id, ContentVersion>(
            [
                SELECT
                    Id,
                    ContentDocumentId,
                    ContentSize,
                    FileExtension,
                    FileType,
                    PathOnClient,
                    VersionNumber,
                    Form_Upload_Key__c,
                    Final_Upload_fileupload__c,
                    ContentDocument.OwnerId,
                    ContentDocument.LatestPublishedVersionId
                FROM ContentVersion
                WHERE Id IN :ids
            ]
        );
    }

    public static List<ContentVersion> documentVersions(Set<Id> documents) {
        if (documents.isEmpty()) {
            return new List<ContentVersion>();
        }
        return [
            SELECT Id, ContentDocumentId, Form_Upload_Key__c
            FROM ContentVersion
            WHERE ContentDocumentId IN :documents
        ];
    }
    public static List<ContentDocumentLink> links(Set<Id> ids) {
        if (ids.isEmpty()) {
            return new List<ContentDocumentLink>();
        }
        return [
            SELECT ContentDocumentId, LinkedEntityId
            FROM ContentDocumentLink
            WHERE ContentDocumentId IN :ids
        ];
    }
    public static Set<Id> distributed(Set<Id> ids) {
        Set<Id> result = new Set<Id>();
        if (!ids.isEmpty()) {
            for (ContentDistribution d : [
                SELECT ContentVersion.ContentDocumentId
                FROM ContentDistribution
                WHERE ContentVersion.ContentDocumentId IN :ids
            ]) {
                result.add(d.ContentVersion.ContentDocumentId);
            }
        }
        return result;
    }
    /** Guest linking is authorized by the locked attempt and server-created target only. */
    public static void linkFiles(
        List<ContentDocumentLink> links,
        Boolean guest
    ) {
        if (links.isEmpty()) {
            return;
        }
        if (guest) {
            insert links;
        } else {
            Database.insert(links, AccessLevel.USER_MODE);
        }
    }
    public static List<Database.DeleteResult> deleteFiles(
        List<ContentDocument> documents
    ) {
        return Database.delete(documents, false);
    }
    public static void patchVersions(List<ContentVersion> versions) {
        if (!versions.isEmpty()) {
            update versions;
        }
    }
}
