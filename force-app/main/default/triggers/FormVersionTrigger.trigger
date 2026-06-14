trigger FormVersionTrigger on Form_Version__c(after insert, after update) {
  FormVersionTriggerHandler.handleAfterInsertUpdate(
    Trigger.new,
    Trigger.oldMap
  );
}