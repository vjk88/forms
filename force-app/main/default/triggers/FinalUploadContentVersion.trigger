trigger FinalUploadContentVersion on ContentVersion(
    before insert,
    after insert,
    before update
) {
    if (Trigger.isInsert && Trigger.isBefore) {
        FinalUploadProofGuard.beforeInsert(Trigger.new);
    }
    if (Trigger.isInsert && Trigger.isAfter) {
        FinalUploadProofGuard.afterInsert(Trigger.new);
    }
    if (Trigger.isUpdate) {
        FinalUploadProofGuard.beforeUpdate(Trigger.new, Trigger.oldMap);
    }
}
