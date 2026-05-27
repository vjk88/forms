public with sharing class FormVersionTriggerHandler {
  private static Boolean isRunning = false;

  public static void handleAfterInsertUpdate(
    List<Form_Version__c> newVersions,
    Map<Id, Form_Version__c> oldMap
  ) {
    if (isRunning || newVersions == null || newVersions.isEmpty()) {
      return;
    }

    Set<Id> formIdsBeingActivated = new Set<Id>();
    Set<Id> currentRecordIds = new Set<Id>();

    for (Form_Version__c version : newVersions) {
      currentRecordIds.add(version.Id);

      Boolean isNowActive = version.Is_Active__c;
      Boolean wasActive = oldMap != null && oldMap.containsKey(version.Id)
        ? oldMap.get(version.Id).Is_Active__c
        : false;

      if (isNowActive && !wasActive) {
        formIdsBeingActivated.add(version.Form__c);
      }
    }

    if (formIdsBeingActivated.isEmpty()) {
      return;
    }

    List<Form_Version__c> existingActiveVersions = [
      SELECT Id, Form__c, Is_Active__c
      FROM Form_Version__c
      WHERE
        Form__c IN :formIdsBeingActivated
        AND Is_Active__c = TRUE
        AND Id NOT IN :currentRecordIds
      WITH USER_MODE
    ];

    if (!existingActiveVersions.isEmpty()) {
      for (Form_Version__c existingVersion : existingActiveVersions) {
        existingVersion.Is_Active__c = false;
      }

      isRunning = true;
      try {
        update existingActiveVersions;
      } finally {
        isRunning = false;
      }
    }
  }
}
