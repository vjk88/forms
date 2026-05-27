/**
 * Handler class for FormSectionTrigger to enforce data integrity constraints.
 *
 * Business Rule: Auto-set Is_Repeatable__c = true when Context_Type__c = Related_Child.
 * Related child sections represent child records in a parent-child relationship and must be repeatable.
 */
public with sharing class FormSectionTriggerHandler {
  /**
   * Handles before insert and before update events for Form_Section__c.
   * Auto-sets Is_Repeatable__c based on Context_Type__c.
   *
   * @param newSections List of new or updated Form_Section__c records
   */
  public static void handleBeforeInsertUpdate(
    List<Form_Section__c> newSections
  ) {
    // Guard clause for null/empty input
    if (newSections == null || newSections.isEmpty()) {
      return;
    }

    // Auto-set Is_Repeatable__c for Related_Child sections
    for (Form_Section__c section : newSections) {
      if (section.Context_Type__c == 'Related_Child') {
        section.Is_Repeatable__c = true;
      }
    }
  }
}
