/**
 * Handler for FormPageTrigger.
 *
 * Business Rule: auto-generate stable Key__c slug on insert when blank
 * (LAYOUT_SPEC §9). Never regenerated on update — Layout Specs reference
 * these keys and must survive renames and clones.
 */
public with sharing class FormPageTriggerHandler {
  public static void handleBeforeInsert(List<Form_Page__c> newPages) {
    FormKeyUtil.ensurePageKeys(newPages);
  }
}
