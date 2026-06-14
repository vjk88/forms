/**
 * Trigger for Form_Page__c.
 *
 * Business Rules:
 * - Auto-generate stable Key__c slug on insert (LAYOUT_SPEC §9)
 */
trigger FormPageTrigger on Form_Page__c(before insert) {
  FormPageTriggerHandler.handleBeforeInsert(Trigger.new);
}
