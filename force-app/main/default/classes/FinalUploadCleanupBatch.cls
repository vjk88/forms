/** Hourly cleanup of unconsumed files, preserving consumed, shared and reversioned documents. */
@SuppressWarnings('PMD.ApexCRUDViolation')
public without sharing class FinalUploadCleanupBatch implements Database.Batchable<SObject> {
    public Database.QueryLocator start(Database.BatchableContext context) {
        Datetime now = System.now();
        return Database.getQueryLocator(
            [
                SELECT Id, Public_Key__c
                FROM Form_Upload__c
                WHERE Cleanup_After__c <= :now
            ]
        );
    }
    public void execute(
        Database.BatchableContext context,
        List<SObject> scope
    ) {
        Set<String> keys = new Set<String>();
        for (SObject row : scope) {
            keys.add((String) row.get('Public_Key__c'));
        }
        clean(FinalUploadStore.lockAttempts(keys).values());
    }
    public void finish(Database.BatchableContext context) {
    }

    /** Internal-only cleanup; callers must hold the attempt locks. No client IDs accepted. */
    public static void clean(List<Form_Upload__c> attempts) {
        Set<Id> documents = new Set<Id>();
        Map<Id, Map<String, Object>> entries = new Map<Id, Map<String, Object>>();
        Map<Id, List<Object>> fileLists = new Map<Id, List<Object>>();
        Set<Id> versionIds = new Set<Id>();
        for (Form_Upload__c a : attempts) {
            List<Object> files = FinalUploadService.files(a);
            fileLists.put(a.Id, files);
            if (a.Status__c == 'OPEN' && a.Expires_At__c <= System.now()) {
                a.Status__c = 'EXPIRED';
            }
            for (Object value : files) {
                Map<String, Object> e = FinalUploadPolicy.mapOf(value);
                if (
                    e.get('state') == 'CONSUMED' ||
                    e.get('cleanupStatus') == 'DELETED' ||
                    e.get('cleanupStatus') == 'REVIEW'
                ) {
                    continue;
                }
                if (a.Status__c != 'OPEN' || e.get('state') == 'REMOVED') {
                    if (e.get('contentDocumentId') != null) {
                        Id id = (Id) FinalUploadPolicy.stringOf(
                            e.get('contentDocumentId')
                        );
                        documents.add(id);
                        entries.put(id, e);
                        versionIds.add(
                            (Id) FinalUploadPolicy.stringOf(
                                e.get('contentVersionId')
                            )
                        );
                    } else {
                        e.put('state', 'EXPIRED');
                    }
                }
            }
        }
        Map<Id, ContentVersion> versions = FinalUploadStore.versions(
            versionIds
        );
        Map<Id, Id> owners = new Map<Id, Id>();
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (ContentVersion v : FinalUploadStore.documentVersions(documents)) {
            counts.put(
                v.ContentDocumentId,
                (counts.get(v.ContentDocumentId) ?? 0) + 1
            );
        }
        Set<Id> unsafe = FinalUploadStore.distributed(documents);
        for (ContentVersion v : versions.values()) {
            owners.put(v.ContentDocumentId, v.ContentDocument.OwnerId);
            if (
                v.ContentDocument.LatestPublishedVersionId != v.Id ||
                counts.get(v.ContentDocumentId) != 1
            ) {
                unsafe.add(v.ContentDocumentId);
            }
        }
        for (ContentDocumentLink link : FinalUploadStore.links(documents)) {
            if (link.LinkedEntityId != owners.get(link.ContentDocumentId)) {
                unsafe.add(link.ContentDocumentId);
            }
        }
        List<ContentDocument> deletes = new List<ContentDocument>();
        for (Id id : documents) {
            Map<String, Object> e = entries.get(id);
            if (unsafe.contains(id)) {
                e.put('cleanupStatus', 'REVIEW');
            } else if (!owners.containsKey(id)) {
                e.put('cleanupStatus', 'DELETED');
            } else {
                deletes.add(new ContentDocument(Id = id));
            }
        }
        if (!deletes.isEmpty()) {
            List<Database.DeleteResult> results = FinalUploadStore.deleteFiles(
                deletes
            );
            for (Integer i = 0; i < results.size(); i++) {
                entries.get(deletes[i].Id)
                    .put(
                        'cleanupStatus',
                        results[i].isSuccess() ? 'DELETED' : 'RETRY'
                    );
            }
        }
        for (Form_Upload__c a : attempts) {
            Boolean pending = false;
            for (Object value : fileLists.get(a.Id)) {
                Map<String, Object> e = FinalUploadPolicy.mapOf(value);
                pending =
                    pending ||
                    (e.get('state') != 'CONSUMED' &&
                    e.get('contentDocumentId') != null &&
                    e.get('cleanupStatus') != 'DELETED' &&
                    e.get('cleanupStatus') != 'REVIEW');
            }
            a.Files_JSON__c = FinalUploadService.encode(fileLists.get(a.Id));
            a.Cleanup_After__c = a.Status__c == 'OPEN'
                ? a.Expires_At__c
                : pending ? System.now().addHours(1) : null;
        }
        FinalUploadStore.saveAttempts(attempts);
    }
}
