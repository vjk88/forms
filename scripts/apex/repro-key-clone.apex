// Repro: global-unique Form_Element__c.Key__c vs verbatim copy in cloneVersionChildren.
// Build form → page/section/element on v1 → activate v1 → createDraftFromActive.
Map<String, Object> created = FormDesignerController.createForm(
  'KeyCloneRepro', 'Contact', 'Form', 'Single_Page', null
);
Id formId = (Id) created.get('formId');
Id v1 = (Id) created.get('versionId');

Form_Page__c page = [SELECT Id FROM Form_Page__c WHERE Form_Version__c = :v1 LIMIT 1];
Form_Section__c sec = new Form_Section__c(Name = 'S1', Form_Page__c = page.Id, Sequence__c = 1);
insert sec;
Form_Element__c el = new Form_Element__c(
  Name = 'E1', Form_Section__c = sec.Id, Key__c = 'el_repro_1',
  Type__c = 'Field', Field_API_Name__c = 'LastName', Sequence__c = 1
);
insert el;

Form_Version__c ver = new Form_Version__c(Id = v1, Is_Active__c = true);
update ver;

try {
  Map<String, Object> draft = FormDesignerController.createDraftFromActive(formId);
  System.debug('NO CONFLICT — draft created: ' + draft);
  // cleanup
  delete [SELECT Id FROM Form__c WHERE Id = :formId];
} catch (Exception e) {
  System.debug('REPRODUCED: ' + e.getMessage());
  delete [SELECT Id FROM Form__c WHERE Id = :formId];
}
