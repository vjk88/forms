// T5 smoke: valid spec persists; invalid spec rejected; history ring buffer pushed.
// NOTE: AuraHandledException cannot be thrown/caught in anonymous Apex, so the
// rejection path is asserted via FormLayoutSpecValidator directly; the throw in
// applySpecPatch is guarded by the same vr.ok check.
Form_Version__c draft = [
  SELECT Id FROM Form_Version__c WHERE Is_Active__c = FALSE ORDER BY CreatedDate DESC LIMIT 1
];
// Idempotent: clear any leftovers from prior runs.
delete [SELECT Id FROM Spec_History__c WHERE Form_Version__c = :draft.Id];

String valid = '{"version":1,"archetype":"classic","shell":{"nav":"scroll"},' +
  '"pages":[{"pageKey":"p1","zones":[{"type":"zone","span":12,' +
  '"children":[{"type":"stack","sections":["sec_a"]}]}]}]}';

Map<String, Object> r1 = FormDesignerController.applySpecPatch(draft.Id, valid, null, 'Manual');
System.assertEquals(valid, [SELECT Layout_Spec__c FROM Form_Version__c WHERE Id = :draft.Id].Layout_Spec__c, 'valid spec must persist');
System.debug('OK valid persisted; warnings=' + JSON.serialize(r1.get('warnings')));

String invalid = '{"version":1,"archetype":"classic","shell":{"nav":"diagonal"},"pages":[]}';
FormLayoutSpecValidator.Result vr = FormLayoutSpecValidator.validate(invalid);
System.assert(!vr.ok, 'invalid spec must fail validation');
System.assertEquals(2, vr.errors.size(), 'expect invalid-enum nav + bad-pages');
System.debug('OK rejected: ' + JSON.serialize(vr.errors));

Integer histCount = [SELECT COUNT() FROM Spec_History__c WHERE Form_Version__c = :draft.Id];
System.assertEquals(1, histCount, 'one history entry for the applied patch');
System.debug('OK history entries: ' + histCount);

// Clean up the smoke write (restore null spec via the single writer).
FormDesignerController.applySpecPatch(draft.Id, null, null, 'Manual');
delete [SELECT Id FROM Spec_History__c WHERE Form_Version__c = :draft.Id];
System.debug('SMOKE PASS');
