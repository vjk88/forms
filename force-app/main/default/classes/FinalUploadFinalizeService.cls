/** Submission-side receipt validation and atomic file association. */
public with sharing class FinalUploadFinalizeService {
    private static Context current;
    public class Context {
        public Form_Upload__c attempt;
        public List<Map<String, Object>> selected = new List<Map<String, Object>>();
        public Boolean replayed = false;
        /** No file ever arrived: nothing to link, and no record is created. */
        public Boolean empty = false;
    }
    /** Authorize and lock before invitation/form locks. Successful retries return the stored result. */
    public static Context prepare(
        Id formId,
        Id versionId,
        Map<String, Object> spec,
        Map<String, Object> payload,
        Boolean publicHost
    ) {
        current = null;
        Map<String, Object> meta = FinalUploadPolicy.mapOf(payload.get('meta'));
        String token = FinalUploadPolicy.stringOf(
            meta.get('uploadSessionToken')
        );
        if (!FinalUploadPolicy.staged(spec)) {
            if (
                token != null ||
                !FinalUploadPolicy.listOf(payload.get('fileRefs')).isEmpty()
            ) {
                throw FinalUploadService.refuse(null);
            }
            return null;
        }
        if (!FinalUploadPolicy.listOf(payload.get('files')).isEmpty()) {
            throw FinalUploadService.refuse(null);
        }
        Context c = new Context();
        c.attempt = FinalUploadService.authenticate(token);
        Form_Upload__c a = c.attempt;
        String key = FinalUploadPolicy.stringOf(meta.get('submissionKey'));
        if (
            String.isBlank(key) ||
            key.length() > 64 ||
            a.Form__c != formId ||
            a.Public_Host__c != publicHost
        ) {
            throw FinalUploadService.refuse(null);
        }
        if (a.Id == null) {
            // Nothing ever arrived (IMPL_PLAN_UPLOAD_RECORDS_ON_ARRIVAL §5):
            // submit without creating an upload record. Required file
            // questions are still enforced.
            if (
                a.Form_Version__c != versionId ||
                !FinalUploadPolicy.listOf(payload.get('fileRefs')).isEmpty()
            ) {
                throw FinalUploadService.refuse(null);
            }
            FinalUploadValidation.manifest(
                spec,
                new List<Map<String, Object>>(),
                a.Guest_User_Id__c != null
            );
            c.empty = true;
            current = c;
            return c;
        }
        if (a.Status__c == 'CONSUMED') {
            if (a.Submission_Key__c != key || a.Result_Record_Id__c == null) {
                throw FinalUploadService.refuse(null);
            }
            c.replayed = true;
            current = c;
            return c;
        }
        FinalUploadService.requireOpen(a);
        if (FinalSubmitService.existingSubmission(key, formId) != null) {
            throw FinalUploadService.refuse(null);
        }

        if (a.Form_Version__c != versionId) {
            throw FinalUploadService.refuse(null);
        }
        FinalUploadStore.specs(new List<Form_Upload__c>{ a });
        Map<String, Map<String, Object>> entries = new Map<String, Map<String, Object>>();
        for (Object value : FinalUploadService.files(a)) {
            Map<String, Object> e = FinalUploadPolicy.mapOf(value);
            entries.put(FinalUploadPolicy.stringOf(e.get('key')), e);
        }
        if (
            FinalUploadPolicy.listOf(payload.get('fileRefs')).size() >
            entries.size()
        ) {
            throw FinalUploadService.refuse(null);
        }
        Set<String> seen = new Set<String>();
        Set<Id> documents = new Set<Id>();
        Set<Id> versions = new Set<Id>();
        for (Object value : FinalUploadPolicy.listOf(payload.get('fileRefs'))) {
            Map<String, Object> ref = FinalUploadPolicy.mapOf(value);
            String fileKey = FinalUploadService.fileKey(
                a,
                FinalUploadPolicy.stringOf(ref.get('slotToken'))
            );
            Map<String, Object> e = entries.get(fileKey);
            if (e == null) {
                throw FinalUploadService.refuse(null);
            }
            Id documentId = (Id) FinalUploadPolicy.stringOf(
                e.get('contentDocumentId')
            );
            Id fileVersion = (Id) FinalUploadPolicy.stringOf(
                e.get('contentVersionId')
            );
            if (
                e.get('state') != 'READY' ||
                e.get('elementId') != ref.get('elementId') ||
                seen.contains(fileKey) ||
                documentId == null ||
                documents.contains(documentId) ||
                fileVersion == null
            ) {
                throw FinalUploadService.refuse(null);
            }
            seen.add(fileKey);
            documents.add(documentId);
            versions.add(fileVersion);
            c.selected.add(e);
        }
        FinalUploadValidation.manifest(
            spec,
            c.selected,
            a.Guest_User_Id__c != null
        );
        Map<Id, ContentVersion> metadata = FinalUploadStore.versions(versions);
        Map<Id, Id> owners = new Map<Id, Id>();
        for (ContentVersion v : metadata.values()) {
            if (
                v.ContentDocument.LatestPublishedVersionId != v.Id ||
                v.Form_Upload_Key__c != a.Public_Key__c
            ) {
                throw FinalUploadService.refuse(null);
            }
            owners.put(v.ContentDocumentId, v.ContentDocument.OwnerId);
        }
        for (Map<String, Object> entry : c.selected) {
            ContentVersion accepted = metadata.get(
                (Id) FinalUploadPolicy.stringOf(entry.get('contentVersionId'))
            );
            if (
                accepted == null ||
                String.valueOf(accepted.ContentDocumentId) !=
                entry.get('contentDocumentId') ||
                accepted.ContentSize !=
                FinalUploadPolicy.positive(entry.get('sizeBytes')) ||
                (accepted.FileExtension == null
                    ? ''
                    : accepted.FileExtension.toLowerCase()) !=
                entry.get('extension')
            ) {
                throw FinalUploadService.refuse(null);
            }
        }
        if (
            metadata.size() != versions.size() ||
            !FinalUploadStore.distributed(documents).isEmpty()
        ) {
            throw FinalUploadService.refuse(null);
        }
        for (ContentDocumentLink link : FinalUploadStore.links(documents)) {
            if (link.LinkedEntityId != owners.get(link.ContentDocumentId)) {
                throw FinalUploadService.refuse(null);
            }
        }
        a.Submission_Key__c = key;
        current = c;
        return c;
    }

    /** Called inside each submission path's existing savepoint with its server-created target. */
    public static void attach(
        Id targetId,
        Map<String, Object> spec,
        Map<String, Object> payload,
        Boolean guest
    ) {
        if (!FinalUploadPolicy.staged(spec)) {
            return;
        }
        Context c = current;
        if (c != null && c.empty) {
            return; // no file ever arrived; nothing to link or record
        }
        if (c == null || c.replayed || targetId == null) {
            throw FinalUploadService.refuse(null);
        }
        FinalUploadToken.Claims session = FinalUploadToken.readSession(
            FinalUploadPolicy.stringOf(
                FinalUploadPolicy.mapOf(payload.get('meta'))
                    .get('uploadSessionToken')
            )
        );
        if (session == null || session.publicKey != c.attempt.Public_Key__c) {
            throw FinalUploadService.refuse(null);
        }
        // A guest may not create InternalUsers links ("Visibility InternalUsers
        // is not permitted for this linked record"), so guest files use AllUsers.
        String visibility = guest == true ? 'AllUsers' : 'InternalUsers';
        List<ContentDocumentLink> links = new List<ContentDocumentLink>();
        Set<String> selected = new Set<String>();
        for (Map<String, Object> e : c.selected) {
            links.add(
                new ContentDocumentLink(
                    ContentDocumentId = (Id) FinalUploadPolicy.stringOf(
                        e.get('contentDocumentId')
                    ),
                    LinkedEntityId = targetId,
                    ShareType = 'V',
                    Visibility = visibility
                )
            );
            selected.add(FinalUploadPolicy.stringOf(e.get('key')));
        }
        FinalUploadStore.linkFiles(links, guest);
        List<Object> files = FinalUploadService.files(c.attempt);
        Boolean cleanup = false;
        for (Object value : files) {
            Map<String, Object> e = FinalUploadPolicy.mapOf(value);
            if (selected.contains(FinalUploadPolicy.stringOf(e.get('key')))) {
                e.put('state', 'CONSUMED');
            } else if (e.get('state') != 'CONSUMED') {
                e.put(
                    'state',
                    e.get('contentDocumentId') == null ? 'CANCELLED' : 'REMOVED'
                );
                cleanup = cleanup || e.get('contentDocumentId') != null;
            }
        }
        c.attempt.Status__c = 'CONSUMED';
        c.attempt.Result_Record_Id__c = String.valueOf(targetId);
        c.attempt.Consumed_At__c = System.now();
        c.attempt.Cleanup_After__c = cleanup ? System.now() : null;
        FinalUploadService.save(c.attempt, files);
    }

    /** Store the response count after all business DML succeeds, before returning success. */
    public static void complete(Integer childCount) {
        if (
            current != null &&
            !current.replayed &&
            current.attempt.Status__c == 'CONSUMED'
        ) {
            current.attempt.Result_Child_Count__c = childCount;
            FinalUploadStore.saveAttempts(
                new List<Form_Upload__c>{ current.attempt }
            );
        }
    }
}
