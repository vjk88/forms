/**
 * Trigger for Form_Element__c object to enforce data integrity constraints.
 *
 * Business Rules:
 * - Enforce Key__c uniqueness per form version
 */
trigger FormElementTrigger on Form_Element__c(before insert, before update) {
  FormElementTriggerHandler.handleBeforeInsertUpdate(
    Trigger.new,
    Trigger.oldMap
  );
}