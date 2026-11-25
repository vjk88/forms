trigger FinalUploadContentVersion on ContentVersion(
    before insert,
    after insert,
    before update
) {
    List<ContentVersion> proofRows = new List<ContentVersion>();
    for (ContentVersion row : Trigger.new) {
        Boolean production = FinalUploadGuard.production(row);
        if (Trigger.isUpdate) {
            production =
                production ||
                FinalUploadGuard.production(Trigger.oldMap.get(row.Id));
        }
        if (!production) {
            proofRows.add(row);
        }
    }
    if (Trigger.isInsert && Trigger.isBefore) {
        FinalUploadGuard.beforeInsert(Trigger.new);
        FinalUploadProofGuard.beforeInsert(proofRows);
    }
    if (Trigger.isInsert && Trigger.isAfter) {
        FinalUploadGuard.afterInsert(Trigger.new);
        FinalUploadProofGuard.afterInsert(proofRows);
    }
    if (Trigger.isUpdate) {
        FinalUploadGuard.beforeUpdate(Trigger.new, Trigger.oldMap);
        FinalUploadProofGuard.beforeUpdate(proofRows, Trigger.oldMap);
    }
}
