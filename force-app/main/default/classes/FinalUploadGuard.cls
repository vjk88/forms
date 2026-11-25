/** Native Files guard for production attempts. File bytes never enter these services. */
public with sharing class FinalUploadGuard {
    @TestVisible
    private static String testDiagnostic;
    private static Set<Id> clearing = new Set<Id>();

    /** Separate existing proof tokens from production tokens without weakening either guard. */
    public static Boolean production(ContentVersion row) {
        String marker = (String) row.get(
            ContentVersion.Final_Upload_fileupload__c.getDescribe().getName()
        );
        return (marker != null && marker.contains('.')) ||
            row.Form_Upload_Key__c != null;
    }

    public static void beforeInsert(List<ContentVersion> rows) {
        protectVersions(rows);
        List<ContentVersion> candidates = new List<ContentVersion>();
        Set<String> keys = new Set<String>();
        for (ContentVersion row : rows) {
            if (!production(row)) {
                if (
                    UserInfo.getUserType() == 'Guest' &&
                    FinalUploadPolicy.enrolled()
                ) {
                    row.addError(Label.Final_Run_UploadUnavailable);
                }
                continue;
            }
            candidates.add(row);
            try {
                keys.add(
                    FinalUploadService.tokenParts(
                        row.Final_Upload_fileupload__c,
                        3
                    )[0]
                );
            } catch (Exception e) {
                row.addError(Label.Final_Run_UploadUnavailable);
            }
        }
        if (candidates.isEmpty()) {
            return;
        }
        try {
            if (!FinalUploadPolicy.enabled()) {
                throw FinalUploadService.refuse(null);
            }
            Map<String, Form_Upload__c> attempts = FinalUploadStore.lockAttempts(
                keys
            );
            FinalUploadStore.specs(attempts.values());
            Set<String> seen = new Set<String>();
            for (ContentVersion row : candidates) {
                List<String> parts = FinalUploadService.tokenParts(
                    row.Final_Upload_fileupload__c,
                    3
                );
                Form_Upload__c attempt = attempts.get(parts[0]);
                if (attempt == null) {
                    throw FinalUploadService.refuse(null);
                }
                FinalUploadService.requireOpen(attempt);
                String key = FinalUploadService.fileKey(
                    attempt,
                    row.Final_Upload_fileupload__c
                );
                Map<String, Object> entry = find(attempt, key);
                if (
                    entry.get('state') != 'RESERVED' ||
                    FinalUploadService.expired(entry) ||
                    seen.contains(row.Final_Upload_fileupload__c) ||
                    row.ContentDocumentId != null ||
                    (row.FirstPublishLocationId != null &&
                    row.FirstPublishLocationId != UserInfo.getUserId())
                ) {
                    row.addError(Label.Final_Run_UploadUnavailable);
                }
                seen.add(row.Final_Upload_fileupload__c);
            }
        } catch (Exception e) {
            if (Test.isRunningTest()) {
                testDiagnostic =
                    e.getTypeName() +
                    ': ' +
                    e.getMessage() +
                    ' ' +
                    e.getStackTraceString();
            }
            reject(candidates);
        }
    }

    public static void afterInsert(List<ContentVersion> rows) {
        List<ContentVersion> candidates = new List<ContentVersion>();
        Set<String> keys = new Set<String>();
        Set<Id> ids = new Set<Id>();
        for (ContentVersion row : rows) {
            if (production(row)) {
                candidates.add(row);
                ids.add(row.Id);
                try {
                    keys.add(
                        FinalUploadService.tokenParts(
                            row.Final_Upload_fileupload__c,
                            3
                        )[0]
                    );
                } catch (Exception e) {
                    row.addError(Label.Final_Run_UploadUnavailable);
                }
            }
        }
        if (candidates.isEmpty()) {
            return;
        }
        try {
            Map<String, Form_Upload__c> attempts = FinalUploadStore.lockAttempts(
                keys
            );
            Map<Id, Map<String, Object>> specs = FinalUploadStore.specs(
                attempts.values()
            );
            Map<Id, ContentVersion> versions = FinalUploadStore.versions(ids);
            Set<Id> documents = new Set<Id>();
            Map<Id, Id> owners = new Map<Id, Id>();
            for (ContentVersion v : versions.values()) {
                documents.add(v.ContentDocumentId);
                owners.put(v.ContentDocumentId, v.ContentDocument.OwnerId);
            }
            Set<Id> invalid = FinalUploadStore.distributed(documents);
            for (ContentDocumentLink link : FinalUploadStore.links(documents)) {
                if (link.LinkedEntityId != owners.get(link.ContentDocumentId)) {
                    invalid.add(link.ContentDocumentId);
                }
            }
            Map<String, List<Object>> lists = new Map<String, List<Object>>();
            for (String key : attempts.keySet()) {
                lists.put(key, FinalUploadService.files(attempts.get(key)));
            }
            List<ContentVersion> patches = new List<ContentVersion>();
            for (ContentVersion row : candidates) {
                List<String> parts = FinalUploadService.tokenParts(
                    row.Final_Upload_fileupload__c,
                    3
                );
                Form_Upload__c attempt = attempts.get(parts[0]);
                FinalUploadService.requireOpen(attempt);
                ContentVersion v = versions.get(row.Id);
                if (
                    v == null ||
                    invalid.contains(v.ContentDocumentId) ||
                    v.VersionNumber != '1' ||
                    v.ContentDocument.OwnerId == null
                ) {
                    throw FinalUploadService.refuse(null);
                }
                Map<String, Object> entry;
                for (Object value : lists.get(parts[0])) {
                    Map<String, Object> item = FinalUploadPolicy.mapOf(value);
                    if (item.get('key') == parts[1]) {
                        entry = item;
                    }
                }
                if (
                    entry == null ||
                    entry.get('state') != 'RESERVED' ||
                    entry.get('tokenHash') !=
                    FinalUploadCapability.digest(parts[2]) ||
                    FinalUploadService.expired(entry)
                ) {
                    throw FinalUploadService.refuse(null);
                }
                String path = v.PathOnClient == null
                    ? ''
                    : v.PathOnClient.replace('\\', '/');
                String name = path.substring(path.lastIndexOf('/') + 1);
                if (String.isBlank(name) || name.length() > 255) {
                    throw FinalUploadService.refuse(null);
                }
                entry.put('name', name);
                entry.put('sizeBytes', v.ContentSize);
                entry.put(
                    'extension',
                    v.FileExtension == null ? '' : v.FileExtension.toLowerCase()
                );
                entry.put('contentVersionId', String.valueOf(v.Id));
                entry.put(
                    'contentDocumentId',
                    String.valueOf(v.ContentDocumentId)
                );
                entry.put('state', 'READY');
                Map<String, Object> spec = specs.get(attempt.Form_Version__c);
                FinalUploadValidation.file(
                    entry,
                    FinalUploadPolicy.elements(spec)
                        .get(
                            FinalUploadPolicy.stringOf(entry.get('elementId'))
                        ),
                    FinalUploadPolicy.limits(
                        spec,
                        attempt.Guest_User_Id__c != null
                    )
                );
                patches.add(
                    new ContentVersion(
                        Id = v.Id,
                        Final_Upload_fileupload__c = null,
                        Form_Upload_Key__c = attempt.Public_Key__c
                    )
                );
                clearing.add(v.Id);
            }
            for (String key : attempts.keySet()) {
                Form_Upload__c a = attempts.get(key);
                Decimal total = 0;
                for (Object entry : lists.get(key)) {
                    total += FinalUploadService.pendingBytes(
                        FinalUploadPolicy.mapOf(entry)
                    );
                }
                Decimal maximum = FinalUploadPolicy.limits(
                        specs.get(a.Form_Version__c),
                        a.Guest_User_Id__c != null
                    )
                    .maxTotalBytes;
                if (maximum != null && total > maximum) {
                    throw FinalUploadService.refuse(null);
                }
                a.Files_JSON__c = FinalUploadService.encode(lists.get(key));
            }
            FinalUploadStore.saveAttempts(attempts.values());
            FinalUploadStore.patchVersions(patches);
        } catch (Exception e) {
            if (Test.isRunningTest()) {
                testDiagnostic =
                    e.getTypeName() +
                    ': ' +
                    e.getMessage() +
                    ' ' +
                    e.getStackTraceString();
            }
            reject(candidates);
        } finally {
            clearing.clear();
        }
    }

    public static void beforeUpdate(
        List<ContentVersion> rows,
        Map<Id, ContentVersion> oldRows
    ) {
        Set<Id> ids = new Set<Id>();
        for (ContentVersion row : rows) {
            if (!clearing.contains(row.Id))
                ids.add(row.Id);
        }
        Map<Id, ContentVersion> stored = FinalUploadStore.versions(ids);
        for (ContentVersion row : rows) {
            if (
                clearing.contains(row.Id) &&
                row.Final_Upload_fileupload__c == null
            )
                continue;
            ContentVersion original = stored.get(row.Id);
            String key = original?.Form_Upload_Key__c;
            if (key == null)
                key = oldRows.get(row.Id).Form_Upload_Key__c;
            if (key != null) {
                if (
                    row.Form_Upload_Key__c != null &&
                    row.Form_Upload_Key__c != key
                ) {
                    if (Test.isRunningTest())
                        testDiagnostic = 'Attempt reference changed';
                    row.addError(Label.Final_Run_UploadUnavailable);
                }
                // A record-link publication may send sparse/stale custom fields.
                // The stored accepted version is authoritative; never erase its
                // reference or resurrect its already-consumed secret marker.
                row.Form_Upload_Key__c = key;
                row.Final_Upload_fileupload__c = null;
            } else if (production(row) || production(oldRows.get(row.Id))) {
                if (Test.isRunningTest())
                    testDiagnostic = 'Marked update without accepted stored version';
                row.addError(Label.Final_Run_UploadUnavailable);
            }
        }
    }

    private static void protectVersions(List<ContentVersion> rows) {
        Set<Id> documents = new Set<Id>();
        for (ContentVersion row : rows) {
            if (row.ContentDocumentId != null) {
                documents.add(row.ContentDocumentId);
            }
        }
        List<ContentVersion> previous = FinalUploadStore.documentVersions(
            documents
        );
        Set<String> keys = new Set<String>();
        for (ContentVersion v : previous) {
            if (v.Form_Upload_Key__c != null) {
                keys.add(v.Form_Upload_Key__c);
            }
        }
        Map<String, Form_Upload__c> attempts = FinalUploadStore.lockAttempts(
            keys
        );
        Set<Id> blocked = new Set<Id>();
        for (ContentVersion v : previous) {
            Form_Upload__c a = attempts.get(v.Form_Upload_Key__c);
            if (a != null && a.Status__c != 'CONSUMED') {
                blocked.add(v.ContentDocumentId);
            }
        }
        for (ContentVersion row : rows) {
            if (blocked.contains(row.ContentDocumentId)) {
                row.addError(Label.Final_Run_UploadUnavailable);
            }
        }
    }
    private static Map<String, Object> find(Form_Upload__c a, String key) {
        for (Object value : FinalUploadService.files(a)) {
            Map<String, Object> e = FinalUploadPolicy.mapOf(value);
            if (e.get('key') == key) {
                return e;
            }
        }
        throw FinalUploadService.refuse(null);
    }
    private static void reject(List<ContentVersion> rows) {
        for (ContentVersion row : rows) {
            row.addError(Label.Final_Run_UploadUnavailable);
        }
    }
}
