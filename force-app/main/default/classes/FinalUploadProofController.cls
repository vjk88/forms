/** Operator-only sandbox proof endpoints. No guest Apex access or production form routes. */
public with sharing class FinalUploadProofController {
    /** @param actorUserId Current operator or explicitly enrolled guest. @param maxBytes One-file limit. @return In-memory grant. */
    @AuraEnabled
    public static Map<String, Object> createGrant(
        Id actorUserId,
        Integer maxBytes
    ) {
        requireOperator();
        if (
            actorUserId == null ||
            maxBytes == null ||
            maxBytes < 1 ||
            maxBytes > FinalUploadProofPolicy.MAX_BYTES
        ) {
            throw denied();
        }
        List<User> actors = FinalUploadProofStore.actors(actorUserId);
        if (
            actors.isEmpty() ||
            (actors[0].UserType == 'Guest' &&
            !FinalUploadProofPolicy.requiresMarker('Guest', actorUserId))
        ) {
            throw denied();
        }
        String policyKey = FinalUploadProofPolicy.policyKey(actorUserId);
        if (policyKey == null) {
            throw denied();
        }
        Savepoint checkpoint = Database.setSavepoint();
        try {
            FinalUploadProofStore.lockLedger(true);
            FinalUploadProofStore.checkBudget(maxBytes);
            String token = FinalUploadCapability.mint();
            Datetime expiry = System.now().addMinutes(10);
            FinalUploadProofStore.insertGrant(
                new Final_Upload_Proof__c(
                    Token_Hash__c = FinalUploadCapability.digest(token),
                    Actor_User__c = actorUserId,
                    Policy_Key__c = policyKey,
                    State__c = 'RESERVED',
                    Expires_At__c = expiry,
                    Max_Bytes__c = maxBytes
                )
            );
            return new Map<String, Object>{
                'slotToken' => token,
                'markerField' => FinalUploadProofPolicy.markerField(),
                'maxBytes' => maxBytes,
                'accept' => FinalUploadProofPolicy.ACCEPT,
                'expiresAt' => expiry
            };
        } catch (Exception failure) {
            Database.rollback(checkpoint);
            throw denied();
        }
    }

    /** @param slotToken Original in-memory grant. @return Operator-only ledger metadata for QA, never file bytes. */
    @AuraEnabled
    public static Map<String, Object> inspectGrant(String slotToken) {
        requireOperator();
        String hash = FinalUploadCapability.digest(slotToken);
        if (hash == null) {
            throw denied();
        }
        try {
            FinalUploadProofStore.lockLedger(false);
            Final_Upload_Proof__c grant = FinalUploadProofStore.grants(
                    new Set<String>{ hash }
                )
                .get(hash);
            if (grant == null) {
                throw denied();
            }
            Map<String, Object> result = new Map<String, Object>{
                'state' => grant.State__c,
                'bytes' => grant.Actual_Bytes__c,
                'versionId' => grant.Version_Id__c,
                'documentId' => grant.Document_Id__c,
                'expiresAt' => grant.Expires_At__c
            };
            if (grant.Version_Id__c != null) {
                Id versionId = (Id) grant.Version_Id__c;
                ContentVersion version = FinalUploadProofStore.versions(
                        new Set<Id>{ versionId }
                    )
                    .get(versionId);
                result.put('versionStillExists', version != null);
                if (version != null) {
                    result.put(
                        'markerCleared',
                        version.Final_Upload_fileupload__c == null
                    );
                    result.put('ownerId', version.ContentDocument.OwnerId);
                    result.put(
                        'latestVersionId',
                        version.ContentDocument.LatestPublishedVersionId
                    );
                    result.put('fileType', version.FileType);
                    result.put(
                        'links',
                        FinalUploadProofStore.links(
                            new Set<Id>{ version.ContentDocumentId }
                        )
                    );
                }
            }
            return result;
        } catch (Exception failure) {
            throw denied();
        }
    }

    private static void requireOperator() {
        if (
            UserInfo.getUserType() != 'Standard' ||
            !FeatureManagement.checkPermission('Final_Upload_Proof_Admin') ||
            !FinalUploadProofPolicy.permittedEnvironment()
        ) {
            throw denied();
        }
    }

    private static AuraHandledException denied() {
        return new AuraHandledException(FinalUploadProofPolicy.REFUSED);
    }
}
