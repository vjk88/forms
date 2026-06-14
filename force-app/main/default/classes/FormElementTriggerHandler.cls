public with sharing class FormElementTriggerHandler {
  public static void handleBeforeInsertUpdate(
    List<Form_Element__c> newElements,
    Map<Id, Form_Element__c> oldMap
  ) {
    if (newElements == null || newElements.isEmpty()) {
      return;
    }

    Set<Id> sectionIdsToResolve = new Set<Id>();
    List<Form_Element__c> elementsToCheck = new List<Form_Element__c>();

    for (Form_Element__c element : newElements) {
      if (String.isBlank(element.Key__c) || element.Form_Section__c == null) {
        continue;
      }

      Boolean keyChanged =
        oldMap == null ||
        !oldMap.containsKey(element.Id) ||
        oldMap.get(element.Id).Key__c != element.Key__c;

      if (keyChanged) {
        sectionIdsToResolve.add(element.Form_Section__c);
        elementsToCheck.add(element);
      }
    }

    if (elementsToCheck.isEmpty()) {
      return;
    }

    Map<Id, Id> sectionIdToVersionId = new Map<Id, Id>();
    for (Form_Section__c section : [
      SELECT Id, Form_Page__r.Form_Version__c
      FROM Form_Section__c
      WHERE Id IN :sectionIdsToResolve
      WITH USER_MODE
    ]) {
      sectionIdToVersionId.put(
        section.Id,
        section.Form_Page__r.Form_Version__c
      );
    }

    Set<Id> versionIds = new Set<Id>(sectionIdToVersionId.values());

    // Collect IDs of records in this batch so we exclude them from the DB query
    Set<Id> batchRecordIds = new Set<Id>();
    for (Form_Element__c element : newElements) {
      if (element.Id != null) {
        batchRecordIds.add(element.Id);
      }
    }

    Map<String, Set<String>> existingKeysByVersion = new Map<String, Set<String>>();
    for (Form_Element__c existing : [
      SELECT Id, Key__c, Form_Section__r.Form_Page__r.Form_Version__c
      FROM Form_Element__c
      WHERE
        Form_Section__r.Form_Page__r.Form_Version__c IN :versionIds
        AND Id NOT IN :batchRecordIds
      WITH USER_MODE
    ]) {
      String versionId = existing.Form_Section__r.Form_Page__r.Form_Version__c;
      if (!existingKeysByVersion.containsKey(versionId)) {
        existingKeysByVersion.put(versionId, new Set<String>());
      }
      existingKeysByVersion.get(versionId).add(existing.Key__c.toLowerCase());
    }

    // Check for duplicates: both against DB and within the current batch
    Set<String> batchKeysUsed = new Set<String>();

    for (Form_Element__c element : elementsToCheck) {
      Id versionId = sectionIdToVersionId.get(element.Form_Section__c);
      if (versionId == null) {
        continue;
      }

      String keyLower = element.Key__c.toLowerCase();
      String compositeKey = versionId + ':' + keyLower;

      Boolean existsInDb =
        existingKeysByVersion.containsKey(versionId) &&
        existingKeysByVersion.get(versionId).contains(keyLower);
      Boolean existsInBatch = batchKeysUsed.contains(compositeKey);

      if (existsInDb || existsInBatch) {
        element.addError(
          'Key "' +
            element.Key__c +
            '" is already used in this form version. Each element must have a unique key.'
        );
      } else {
        batchKeysUsed.add(compositeKey);
      }
    }
  }
}