// T18 backfill: fill blank Key__c on existing Form_Page__c / Form_Section__c.
// Idempotent — only touches records where Key__c is blank, so re-running is safe.
// Run: sf apex run -f scripts/apex/backfill-keys.apex
List<Form_Page__c> pages = [
  SELECT Id, Name, Key__c FROM Form_Page__c WHERE Key__c = NULL LIMIT 9000
];
FormKeyUtil.ensurePageKeys(pages);
update pages;

List<Form_Section__c> sections = [
  SELECT Id, Name, Key__c FROM Form_Section__c WHERE Key__c = NULL LIMIT 9000
];
FormKeyUtil.ensureSectionKeys(sections);
update sections;

System.debug('Backfilled keys — pages: ' + pages.size() + ', sections: ' + sections.size());
