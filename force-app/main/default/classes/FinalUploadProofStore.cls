/**
 * Narrow system-context proof ledger. Callers are the capability-checking ContentVersion
 * guard and the custom-permission-gated sandbox operator. Never grant guest ledger CRUD.
 * No Aura endpoints, arbitrary object names, or binary reads belong in this class.
 * CRUD suppression is intentional for this narrowly scoped system ledger: native guest
 * callers must not receive ledger/Files read permissions. The controller checks the
 * operator custom permission; the trigger checks the hashed grant and actual actor.
 */
@SuppressWarnings('PMD.ApexCRUDViolation')
public without sharing class FinalUploadProofStore {
    private static final String LOCK_KEY = 'TRANSPORT_PROOF';

    /** Serialize proof grants, uploads, and operator inspection through one bounded sandbox lock. */
    public static void lockLedger(Boolean initialize) {
        if (initialize) {
            List<Final_Upload_Proof_Lock__c> existing = [
                SELECT Id
                FROM Final_Upload_Proof_Lock__c
                WHERE Key__c = :LOCK_KEY
                LIMIT 1
            ];
            if (existing.isEmpty()) {
                Database.SaveResult result = Database.insert(
                    new Final_Upload_Proof_Lock__c(Key__c = LOCK_KEY),
                    false
                );
                if (
                    !result.isSuccess() &&
                    result.getErrors()[0].getStatusCode() !=
                    StatusCode.DUPLICATE_VALUE
                ) {
                    throw new ProofException(FinalUploadProofPolicy.REFUSED);
                }
            }
        }
        List<Final_Upload_Proof_Lock__c> locks = [
            SELECT Id
            FROM Final_Upload_Proof_Lock__c
            WHERE Key__c = :LOCK_KEY
            LIMIT 1
            FOR UPDATE
        ];
        if (locks.isEmpty()) {
            throw new ProofException(FinalUploadProofPolicy.REFUSED);
        }
    }

    /** @param hashes SHA-256 digests only. @return Locked grants indexed by digest. */
    public static Map<String, Final_Upload_Proof__c> grants(
        Set<String> hashes
    ) {
        Map<String, Final_Upload_Proof__c> result = new Map<String, Final_Upload_Proof__c>();
        for (Final_Upload_Proof__c row : [
            SELECT
                Id,
                Token_Hash__c,
                Actor_User__c,
                Policy_Key__c,
                State__c,
                Expires_At__c,
                Max_Bytes__c,
                Actual_Bytes__c,
                Version_Id__c,
                Document_Id__c,
                File_Name__c,
                Extension__c
            FROM Final_Upload_Proof__c
            WHERE Token_Hash__c IN :hashes
            FOR UPDATE
        ]) {
            result.put(row.Token_Hash__c, row);
        }
        return result;
    }

    /** @param documents Candidate existing documents. @return Protected proof document IDs. */
    public static Set<Id> protectedDocuments(Set<Id> documents) {
        Set<String> keys = new Set<String>();
        for (Id documentId : documents) {
            keys.add(String.valueOf(documentId));
        }
        Set<Id> result = new Set<Id>();
        for (Final_Upload_Proof__c row : [
            SELECT Document_Id__c
            FROM Final_Upload_Proof__c
            WHERE Document_Id__c IN :keys
        ]) {
            result.add((Id) row.Document_Id__c);
        }
        return result;
    }

    /** @param ids Inserted version IDs. @return Metadata only; never VersionData. */
    public static Map<Id, ContentVersion> versions(Set<Id> ids) {
        return new Map<Id, ContentVersion>(
            [
                SELECT
                    Id,
                    ContentDocumentId,
                    ContentDocument.OwnerId,
                    ContentSize,
                    FileExtension,
                    FileType,
                    PathOnClient,
                    VersionNumber,
                    ContentDocument.LatestPublishedVersionId,
                    Final_Upload_fileupload__c,
                    FirstPublishLocationId
                FROM ContentVersion
                WHERE Id IN :ids
            ]
        );
    }

    /** @param documents Accepted candidate documents. @return Links for inspection against the owner. */
    public static List<ContentDocumentLink> links(Set<Id> documents) {
        return [
            SELECT ContentDocumentId, LinkedEntityId
            FROM ContentDocumentLink
            WHERE ContentDocumentId IN :documents
        ];
    }

    /** @param actorId Current user or approved guest user. @return Active actor, if any. */
    public static List<User> actors(Id actorId) {
        return [
            SELECT Id, UserType, IsActive
            FROM User
            WHERE Id = :actorId AND IsActive = TRUE
            LIMIT 1
        ];
    }

    /** Refuse further grants after 20 files or 100 MiB reserved, including expired uncleaned grants. */
    public static void checkBudget(Integer bytes) {
        AggregateResult totals = [
            SELECT COUNT(Id) countRows, SUM(Max_Bytes__c) bytesReserved
            FROM Final_Upload_Proof__c
        ];
        Decimal reserved = (Decimal) totals.get('bytesReserved');
        if (
            (Integer) totals.get('countRows') >= 20 ||
            (reserved == null ? 0 : reserved) + bytes > 104857600
        ) {
            throw new ProofException(
                'Proof capacity is exhausted. An administrator must inspect and clean up the test files.'
            );
        }
    }

    /** @param grant New grant with a hash, never the raw capability. */
    public static void insertGrant(Final_Upload_Proof__c grant) {
        insert grant;
    }

    /** @param rows Successfully verified grants. All-or-none, within the file transaction. */
    public static void saveGrants(List<Final_Upload_Proof__c> rows) {
        update rows;
    }

    /** @param rows Exact accepted versions whose marker is being removed. */
    public static void clearMarkers(List<ContentVersion> rows) {
        update rows;
    }

    public class ProofException extends Exception {
    }
}
