/**
 * Blocks hard-deleting a saved theme that a live form's working spec still
 * uses (DEFERRED 3). All the logic lives in FinalThemeDeleteGuard.
 */
trigger FinalThemeDefinitionTrigger on Theme_Definition__c(before delete) {
    FinalThemeDeleteGuard.beforeDelete(Trigger.old);
}
