/**
 * Batch-1 native transport proof guard. No production Forms admissions or submission linking.
 * Marked inserts always fail closed. Enrolled guests must supply a marker even when disabled.
 * System ledger access is capability/actor scoped; guest CRUD is deliberately unnecessary.
 */
public with sharing class FinalUploadProofGuard {
    private static Set<Id> clearingMarkers = new Set<Id>();

    /** @param rows Native inserts, before any file commits. */
    public static void beforeInsert(List<ContentVersion> rows) {
        Set<Id> documents = new Set<Id>();
        List<ContentVersion> candidates = new List<ContentVersion>();
        Boolean enrolled = FinalUploadProofPolicy.enrolledGuest();
        for (ContentVersion row : rows) {
            if (row.ContentDocumentId != null) {
                documents.add(row.ContentDocumentId);
            }
            if (!String.isBlank(marker(row)) || enrolled) {
                candidates.add(row);
            }
        }
        if (!documents.isEmpty()) {
            Set<Id> protectedIds = FinalUploadProofStore.protectedDocuments(
                documents
            );
            for (ContentVersion row : rows) {
                if (protectedIds.contains(row.ContentDocumentId)) {
                    refuse(row);
                }
            }
        }
        if (candidates.isEmpty()) {
            return;
        }
        if (!FinalUploadProofPolicy.permittedEnvironment()) {
            refuseAll(candidates);
            return;
        }
        Set<String> hashes = hashesOf(candidates);
        if (hashes.isEmpty()) {
            refuseAll(candidates);
            return;
        }
        try {
            FinalUploadProofStore.lockLedger(false);
            Map<String, Final_Upload_Proof__c> grants = FinalUploadProofStore.grants(
                hashes
            );
            Set<String> seen = new Set<String>();
            for (ContentVersion row : candidates) {
                String hash = FinalUploadCapability.digest(marker(row));
                Final_Upload_Proof__c grant = grants.get(hash);
                if (
                    !validGrant(grant) ||
                    seen.contains(hash) ||
                    row.ContentDocumentId != null ||
                    row.FirstPublishLocationId != null
                ) {
                    refuse(row);
                }
                seen.add(hash);
            }
        } catch (Exception failure) {
            // No database/configuration failure may turn this into an unguarded upload.
            refuseAll(candidates);
        }
    }

    /** @param rows Inserted versions. Size/link failure rolls back native file and ledger DML. */
    public static void afterInsert(List<ContentVersion> rows) {
        List<ContentVersion> candidates = new List<ContentVersion>();
        Set<Id> ids = new Set<Id>();
        for (ContentVersion row : rows) {
            if (!String.isBlank(marker(row))) {
                candidates.add(row);
                ids.add(row.Id);
            }
        }
        if (candidates.isEmpty()) {
            return;
        }
        try {
            FinalUploadProofStore.lockLedger(false);
            Map<String, Final_Upload_Proof__c> grants = FinalUploadProofStore.grants(
                hashesOf(candidates)
            );
            Map<Id, ContentVersion> metadata = FinalUploadProofStore.versions(
                ids
            );
            Set<Id> documents = new Set<Id>();
            Map<Id, Id> owners = new Map<Id, Id>();
            for (ContentVersion version : metadata.values()) {
                documents.add(version.ContentDocumentId);
                owners.put(
                    version.ContentDocumentId,
                    version.ContentDocument.OwnerId
                );
            }
            Set<Id> unexpectedLinks = new Set<Id>();
            for (
                ContentDocumentLink link : FinalUploadProofStore.links(
                    documents
                )
            ) {
                if (link.LinkedEntityId != owners.get(link.ContentDocumentId)) {
                    unexpectedLinks.add(link.ContentDocumentId);
                }
            }
            List<Final_Upload_Proof__c> accepted = new List<Final_Upload_Proof__c>();
            List<ContentVersion> clear = new List<ContentVersion>();
            for (ContentVersion row : candidates) {
                Final_Upload_Proof__c grant = grants.get(
                    FinalUploadCapability.digest(marker(row))
                );
                ContentVersion version = metadata.get(row.Id);
                if (
                    !validGrant(grant) ||
                    !validMetadata(version, grant) ||
                    unexpectedLinks.contains(version.ContentDocumentId)
                ) {
                    refuse(row);
                    continue;
                }
                grant.State__c = 'READY';
                grant.Version_Id__c = String.valueOf(version.Id);
                grant.Document_Id__c = String.valueOf(
                    version.ContentDocumentId
                );
                grant.Actual_Bytes__c = version.ContentSize;
                grant.File_Name__c = fileName(version.PathOnClient);
                grant.Extension__c = version.FileExtension.toLowerCase();
                accepted.add(grant);
                clear.add(
                    new ContentVersion(
                        Id = version.Id,
                        Final_Upload_fileupload__c = null
                    )
                );
                clearingMarkers.add(version.Id);
            }
            if (!accepted.isEmpty()) {
                FinalUploadProofStore.saveGrants(accepted);
                FinalUploadProofStore.clearMarkers(clear);
            }
        } catch (Exception failure) {
            // addError rejects this transaction; a READY receipt cannot outlive a failed native insert.
            refuseAll(candidates);
        } finally {
            clearingMarkers.clear();
        }
    }

    /** @param rows Updated versions. @param oldRows Previous values, including raw marker. */
    public static void beforeUpdate(
        List<ContentVersion> rows,
        Map<Id, ContentVersion> oldRows
    ) {
        Set<Id> documents = new Set<Id>();
        for (ContentVersion row : rows) {
            if (row.ContentDocumentId != null) {
                documents.add(row.ContentDocumentId);
            }
        }
        Set<Id> protectedIds = documents.isEmpty()
            ? new Set<Id>()
            : FinalUploadProofStore.protectedDocuments(documents);
        for (ContentVersion row : rows) {
            // Only our exact after-insert metadata patch may clear the capability.
            if (clearingMarkers.contains(row.Id) && marker(row) == null) {
                continue;
            }
            if (
                !String.isBlank(marker(row)) ||
                !String.isBlank(marker(oldRows.get(row.Id))) ||
                protectedIds.contains(row.ContentDocumentId)
            ) {
                refuse(row);
            }
        }
    }

    private static Boolean validGrant(Final_Upload_Proof__c grant) {
        return grant != null &&
            grant.State__c == 'RESERVED' &&
            grant.Actor_User__c == UserInfo.getUserId() &&
            grant.Expires_At__c != null &&
            grant.Expires_At__c > System.now() &&
            grant.Max_Bytes__c > 0 &&
            grant.Max_Bytes__c <= FinalUploadProofPolicy.MAX_BYTES &&
            FinalUploadProofPolicy.enabled(
                grant.Actor_User__c,
                grant.Policy_Key__c
            );
    }

    private static Boolean validMetadata(
        ContentVersion version,
        Final_Upload_Proof__c grant
    ) {
        if (
            version == null ||
            version.ContentDocumentId == null ||
            version.ContentSize == null ||
            version.ContentSize <= 0 ||
            version.ContentSize > grant.Max_Bytes__c ||
            version.VersionNumber != '1' ||
            !FinalUploadProofPolicy.allowedExtension(version.FileExtension)
        ) {
            return false;
        }
        // Only a platform owner link is tolerated; the actual guest owner still needs org proof.
        Id ownerId = version.ContentDocument.OwnerId;
        if (ownerId == null || ownerId.getSObjectType() != User.SObjectType) {
            return false;
        }
        String name = fileName(version.PathOnClient);
        if (
            String.isBlank(name) ||
            name.length() > 255 ||
            name.lastIndexOf('.') < 1
        ) {
            return false;
        }
        String extension = name.substring(name.lastIndexOf('.') + 1)
            .toLowerCase();
        return extension == version.FileExtension.toLowerCase() &&
            version.FileType != null &&
            !new Set<String>{ 'HTML', 'SVG', 'EXE', 'ZIP', 'JAVASCRIPT' }
                .contains(version.FileType);
    }

    private static String fileName(String path) {
        if (path == null) {
            return null;
        }
        String normalized = path.replace('\\', '/');
        return normalized.substring(normalized.lastIndexOf('/') + 1);
    }

    private static Set<String> hashesOf(List<ContentVersion> rows) {
        Set<String> result = new Set<String>();
        for (ContentVersion row : rows) {
            String hash = FinalUploadCapability.digest(marker(row));
            if (hash != null) {
                result.add(hash);
            }
        }
        return result;
    }

    private static String marker(ContentVersion row) {
        return (String) row.get(FinalUploadProofPolicy.markerField());
    }
    private static void refuse(ContentVersion row) {
        row.addError(FinalUploadProofPolicy.REFUSED);
    }
    private static void refuseAll(List<ContentVersion> rows) {
        for (ContentVersion row : rows) {
            refuse(row);
        }
    }
}
