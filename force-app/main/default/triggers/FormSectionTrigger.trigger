/**
 * Trigger for Form_Section__c object to enforce data integrity constraints.
 *
 * Business Rules:
 * - Auto-set Is_Repeatable__c = true when Context_Type__c = Related_Child
 */
trigger FormSectionTrigger on Form_Section__c(before insert, before update) {
  FormSectionTriggerHandler.handleBeforeInsertUpdate(Trigger.new);
}