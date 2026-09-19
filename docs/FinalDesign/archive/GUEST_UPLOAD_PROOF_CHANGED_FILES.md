# Guest upload proof — actual files prepared

Prepared 2026-09-09. Paths verified on disk; no Git commands used. This inventory covers the isolated transport-proof batch, not the full guest upload feature.

## New source and targeted manifest

- [force-app/main/default/classes/FinalUploadCapability.cls](../../force-app/main/default/classes/FinalUploadCapability.cls)
- [force-app/main/default/classes/FinalUploadCapability.cls-meta.xml](../../force-app/main/default/classes/FinalUploadCapability.cls-meta.xml)
- [force-app/main/default/classes/FinalUploadProofController.cls](../../force-app/main/default/classes/FinalUploadProofController.cls)
- [force-app/main/default/classes/FinalUploadProofController.cls-meta.xml](../../force-app/main/default/classes/FinalUploadProofController.cls-meta.xml)
- [force-app/main/default/classes/FinalUploadProofGuard.cls](../../force-app/main/default/classes/FinalUploadProofGuard.cls)
- [force-app/main/default/classes/FinalUploadProofGuard.cls-meta.xml](../../force-app/main/default/classes/FinalUploadProofGuard.cls-meta.xml)
- [force-app/main/default/classes/FinalUploadProofPolicy.cls](../../force-app/main/default/classes/FinalUploadProofPolicy.cls)
- [force-app/main/default/classes/FinalUploadProofPolicy.cls-meta.xml](../../force-app/main/default/classes/FinalUploadProofPolicy.cls-meta.xml)
- [force-app/main/default/classes/FinalUploadProofStore.cls](../../force-app/main/default/classes/FinalUploadProofStore.cls)
- [force-app/main/default/classes/FinalUploadProofStore.cls-meta.xml](../../force-app/main/default/classes/FinalUploadProofStore.cls-meta.xml)
- [force-app/main/default/classes/FinalUploadProofTest.cls](../../force-app/main/default/classes/FinalUploadProofTest.cls)
- [force-app/main/default/classes/FinalUploadProofTest.cls-meta.xml](../../force-app/main/default/classes/FinalUploadProofTest.cls-meta.xml)
- [force-app/main/default/customMetadata/Final_Upload_Proof_Policy.Disabled.md-meta.xml](../../force-app/main/default/customMetadata/Final_Upload_Proof_Policy.Disabled.md-meta.xml)
- [force-app/main/default/customPermissions/Final_Upload_Proof_Admin.customPermission-meta.xml](../../force-app/main/default/customPermissions/Final_Upload_Proof_Admin.customPermission-meta.xml)
- [force-app/main/default/lwc/finalUploadProof/**tests**/finalUploadProof.test.js](../../force-app/main/default/lwc/finalUploadProof/__tests__/finalUploadProof.test.js)
- [force-app/main/default/lwc/finalUploadProof/**tests**/finalUploadProofGuest.test.js](../../force-app/main/default/lwc/finalUploadProof/__tests__/finalUploadProofGuest.test.js)
- [force-app/main/default/lwc/finalUploadProof/finalUploadProof.html](../../force-app/main/default/lwc/finalUploadProof/finalUploadProof.html)
- [force-app/main/default/lwc/finalUploadProof/finalUploadProof.js](../../force-app/main/default/lwc/finalUploadProof/finalUploadProof.js)
- [force-app/main/default/lwc/finalUploadProof/finalUploadProof.js-meta.xml](../../force-app/main/default/lwc/finalUploadProof/finalUploadProof.js-meta.xml)
- [force-app/main/default/objects/ContentVersion/fields/Final_Upload_fileupload\_\_c.field-meta.xml](../../force-app/main/default/objects/ContentVersion/fields/Final_Upload_fileupload__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Actor_User**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Actor_User__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Actual_Bytes**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Actual_Bytes__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Document_Id**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Document_Id__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Expires_At**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Expires_At__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Extension**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Extension__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/File_Name**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/File_Name__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Max_Bytes**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Max_Bytes__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Policy_Key**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Policy_Key__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/State**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/State__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Token_Hash**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Token_Hash__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/fields/Version_Id**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/fields/Version_Id__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof**c/Final_Upload_Proof**c.object-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof__c/Final_Upload_Proof__c.object-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Lock**c/fields/Key**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Lock__c/fields/Key__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Lock**c/Final_Upload_Proof_Lock**c.object-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Lock__c/Final_Upload_Proof_Lock__c.object-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Policy**mdt/fields/Actor_User_Id**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Policy__mdt/fields/Actor_User_Id__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Policy**mdt/fields/Admission_Enabled**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Policy__mdt/fields/Admission_Enabled__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Policy**mdt/fields/Guest_User_Id**c.field-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Policy__mdt/fields/Guest_User_Id__c.field-meta.xml)
- [force-app/main/default/objects/Final_Upload_Proof_Policy**mdt/Final_Upload_Proof_Policy**mdt.object-meta.xml](../../force-app/main/default/objects/Final_Upload_Proof_Policy__mdt/Final_Upload_Proof_Policy__mdt.object-meta.xml)
- [force-app/main/default/permissionsets/Final_Upload_Proof_Admin.permissionset-meta.xml](../../force-app/main/default/permissionsets/Final_Upload_Proof_Admin.permissionset-meta.xml)
- [force-app/main/default/triggers/FinalUploadContentVersion.trigger](../../force-app/main/default/triggers/FinalUploadContentVersion.trigger)
- [force-app/main/default/triggers/FinalUploadContentVersion.trigger-meta.xml](../../force-app/main/default/triggers/FinalUploadContentVersion.trigger-meta.xml)
- [manifest/guest-upload-proof.xml](../../manifest/guest-upload-proof.xml)

## Documentation and validation output

- [IMPL_PLAN_GUEST_FILE_UPLOAD.md](./IMPL_PLAN_GUEST_FILE_UPLOAD.md) — updated
- [PENDING_WORK.md](./PENDING_WORK.md) — updated
- [GUEST_UPLOAD_PROOF_HANDOFF.md](./GUEST_UPLOAD_PROOF_HANDOFF.md) — new
- [GUEST_UPLOAD_PROOF_ANALYZER.json](./GUEST_UPLOAD_PROOF_ANALYZER.json) — new
- [GUEST_UPLOAD_PROOF_CHANGED_FILES.md](./GUEST_UPLOAD_PROOF_CHANGED_FILES.md) — this inventory

No existing production form components, submission controllers, or authoring flows were changed. No deployment, site publication, settings changes, or Git operations were performed.
