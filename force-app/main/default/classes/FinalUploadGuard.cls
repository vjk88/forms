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
        }
        if (candidates.isEmpty()) {
            return;
        }
        try {
            if (!FinalUploadPolicy.enabled()) {
                throw FinalUploadService.refuse(null);
            }
            List<FinalUploadToken.Claims> claims = slotClaims(candidates);
            Map<String, Form_Upload__c> attempts = resolve(claims);
            FinalUploadStore.specs(attempts.values());
            Set<String> seen = new Set<String>();
            for (Integer i = 0; i < candidates.size(); i++) {
                ContentVersion row = candidates[i];
                FinalUploadToken.Claims c = claims[i];
                Form_Upload__c attempt = attempts.get(c.publicKey);
                FinalUploadService.requireOpen(attempt);
                String slot = c.publicKey + '.' + c.slotKey;
                if (
                    hasEntry(attempt, c.slotKey) ||
                    seen.contains(slot) ||
                    row.ContentDocumentId != null ||
                    (row.FirstPublishLocationId != null &&
                    row.FirstPublishLocationId != UserInfo.getUserId())
                ) {
                    row.addError(Label.Final_Run_UploadUnavailable);
                }
                seen.add(slot);
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
        Set<Id> ids = new Set<Id>();
        for (ContentVersion row : rows) {
            if (production(row)) {
                candidates.add(row);
                ids.add(row.Id);
            }
        }
        if (candidates.isEmpty()) {
            return;
        }
        try {
            List<FinalUploadToken.Claims> claims = slotClaims(candidates);
            Map<String, Form_Upload__c> attempts = resolve(claims);
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
            for (Integer i = 0; i < candidates.size(); i++) {
                ContentVersion row = candidates[i];
                FinalUploadToken.Claims c = claims[i];
                Form_Upload__c attempt = attempts.get(c.publicKey);
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
                List<Object> entries = lists.get(c.publicKey);
                Map<String, Object> spec = specs.get(attempt.Form_Version__c);
                FinalUploadPolicy.Rules limits = FinalUploadPolicy.limits(
                    spec,
                    attempt.Guest_User_Id__c != null
                );
                Map<String, Object> element = FinalUploadPolicy.elements(spec)
                    .get(c.elementId);
                if (element == null) {
                    throw FinalUploadService.refuse(null);
                }
                // The slot carries no reservation, so every count limit is
                // enforced here, on arrival, against the locked attempt.
                Integer active = 0;
                Integer elementCount = 0;
                for (Object value : entries) {
                    Map<String, Object> item = FinalUploadPolicy.mapOf(value);
                    if (item.get('key') == c.slotKey) {
                        throw FinalUploadService.refuse(null); // one file per slot
                    }
                    if (item.get('state') == 'READY') {
                        active++;
                        if (item.get('elementId') == c.elementId) {
                            elementCount++;
                        }
                    }
                }
                Map<String, Object> config = FinalUploadPolicy.mapOf(
                    element.get('config')
                );
                Decimal perElement = config.get('multiple') == false
                    ? 1
                    : FinalUploadPolicy.positive(config.get('maxFiles'));
                if (
                    (limits.maxFiles != null &&
                    active >= limits.maxFiles) ||
                    (perElement != null &&
                    elementCount >= perElement) ||
                    (limits.maxEntries != null &&
                    entries.size() >= limits.maxEntries)
                ) {
                    throw FinalUploadService.refuse(
                        Label.Final_Run_UploadCount
                    );
                }
                String path = v.PathOnClient == null
                    ? ''
                    : v.PathOnClient.replace('\\', '/');
                String name = path.substring(path.lastIndexOf('/') + 1);
                if (String.isBlank(name) || name.length() > 255) {
                    throw FinalUploadService.refuse(null);
                }
                Map<String, Object> entry = new Map<String, Object>{
                    'key' => c.slotKey,
                    'elementId' => c.elementId,
                    'state' => 'READY',
                    'name' => name,
                    'sizeBytes' => v.ContentSize,
                    'extension' => v.FileExtension == null
                        ? ''
                        : v.FileExtension.toLowerCase(),
                    'contentVersionId' => String.valueOf(v.Id),
                    'contentDocumentId' => String.valueOf(v.ContentDocumentId),
                    'cleanupStatus' => 'NONE'
                };
                FinalUploadValidation.file(entry, element, limits);
                entries.add(entry);
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
            // The first file is the only thing that creates an attempt.
            List<Form_Upload__c> fresh = new List<Form_Upload__c>();
            List<Form_Upload__c> existing = new List<Form_Upload__c>();
            for (Form_Upload__c a : attempts.values()) {
                if (a.Id == null) {
                    fresh.add(a);
                } else {
                    existing.add(a);
                }
            }
            FinalUploadStore.insertAttempts(fresh);
            FinalUploadStore.saveAttempts(existing);
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
    /** Verified, unexpired slot claims for each marked row, in row order. */
    private static List<FinalUploadToken.Claims> slotClaims(
        List<ContentVersion> rows
    ) {
        Boolean guest = UserInfo.getUserType() == 'Guest';
        Datetime now = System.now();
        List<FinalUploadToken.Claims> result = new List<FinalUploadToken.Claims>();
        for (ContentVersion row : rows) {
            FinalUploadToken.Claims c = FinalUploadToken.readSlot(
                row.Final_Upload_fileupload__c
            );
            if (
                c == null ||
                c.guest != guest ||
                c.slotExpires <= now ||
                c.attemptExpires <= now
            ) {
                throw FinalUploadService.refuse(null);
            }
            result.add(c);
        }
        return result;
    }

    /**
     * Locked stored attempts, plus an unsaved draft for each first file. Every
     * marker must agree with the attempt it names (actor, version, host, guest).
     */
    private static Map<String, Form_Upload__c> resolve(
        List<FinalUploadToken.Claims> claims
    ) {
        Set<String> keys = new Set<String>();
        Set<Id> versionIds = new Set<Id>();
        for (FinalUploadToken.Claims c : claims) {
            keys.add(c.publicKey);
            versionIds.add(c.versionId);
        }
        Map<String, Form_Upload__c> attempts = FinalUploadStore.lockAttempts(
            keys
        );
        Map<Id, Id> forms;
        for (FinalUploadToken.Claims c : claims) {
            if (!attempts.containsKey(c.publicKey)) {
                if (forms == null) {
                    forms = FinalUploadStore.formsOf(versionIds);
                }
                attempts.put(
                    c.publicKey,
                    FinalUploadService.draft(c, forms.get(c.versionId))
                );
            }
            FinalUploadService.requireMatch(attempts.get(c.publicKey), c);
        }
        return attempts;
    }

    private static Boolean hasEntry(Form_Upload__c a, String key) {
        for (Object value : FinalUploadService.files(a)) {
            if (FinalUploadPolicy.mapOf(value).get('key') == key) {
                return true;
            }
        }
        return false;
    }
    private static void reject(List<ContentVersion> rows) {
        for (ContentVersion row : rows) {
            row.addError(Label.Final_Run_UploadUnavailable);
        }
    }
}
