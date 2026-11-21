// One-time backfill (IMPL_PLAN_FLOW_AND_PUBLIC Part 2): copy the old public switch
// (Allowed_Adapters__c includes 'Public_Guest') onto the new Form__c.Is_Public__c checkbox.
// Idempotent: only touches forms not yet flagged, so re-running is safe.
// Check first:  SELECT COUNT() FROM Form__c WHERE Allowed_Adapters__c INCLUDES ('Public_Guest')
// Run: sf apex run -f scripts/apex/backfillIsPublic.apex
List<Form__c> forms = [
  SELECT Id, Name, Is_Public__c
  FROM Form__c
  WHERE Allowed_Adapters__c INCLUDES ('Public_Guest') AND Is_Public__c = false
  LIMIT 9000
];
List<String> ids = new List<String>();
for (Form__c f : forms) {
  f.Is_Public__c = true;
  ids.add(String.valueOf(f.Id));
}
update forms;
System.debug('Backfilled Is_Public__c on ' + forms.size() + ' form(s).');
System.debug('Ids: ' + String.join(ids, ', '));
