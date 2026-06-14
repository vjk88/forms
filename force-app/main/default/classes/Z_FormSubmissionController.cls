public with sharing class Z_FormSubmissionController {
    
    public class SubmissionPayload {
        @AuraEnabled public Id formVersionId;
        @AuraEnabled public String responseJson; // JSON string mapping elements to values
    }

    @AuraEnabled
    public static Map<String, String> processSubmission(SubmissionPayload payload) {
        Map<String, String> result = new Map<String, String>();
        Savepoint sp = Database.setSavepoint();

        try {
            // 1. Fetch Form Version configuration
            Z_Form_Version__c version = [SELECT Id, Z_Form__r.Z_Primary_Object__c, Z_Form_Definition_JSON__c, Z_Schema_Snapshot__c 
                                       FROM Z_Form_Version__c 
                                       WHERE Id = :payload.formVersionId 
                                       WITH USER_MODE];
                                       
            Map<String, Object> definition = (Map<String, Object>) JSON.deserializeUntyped(version.Z_Form_Definition_JSON__c);
            Map<String, Object> responses = (Map<String, Object>) JSON.deserializeUntyped(payload.responseJson);

            // 2. Validate CRUD access on Primary SObject
            String primarySObject = version.Z_Form__r.Z_Primary_Object__c;
            Schema.SObjectType primaryType = Schema.getGlobalDescribe().get(primarySObject);
            if (primaryType == null) {
                throw new AuraHandledException('Invalid primary object: ' + primarySObject);
            }
            if (!primaryType.getDescribe().isCreateable()) {
                throw new AuraHandledException('Insufficient permissions to create ' + primarySObject);
            }

            // 3. Construct Primary SObject Record
            SObject primaryRecord = primaryType.newSObject();
            
            // Map primary fields defined in pages
            List<Object> pages = (List<Object>) definition.get('pages');
            for (Object page : pages) {
                Map<String, Object> pMap = (Map<String, Object>) page;
                List<Object> sections = (List<Object>) pMap.get('sections');
                for (Object section : sections) {
                    Map<String, Object> sMap = (Map<String, Object>) section;
                    List<Object> elements = (List<Object>) sMap.get('elements');
                    if (elements != null) {
                        for (Object element : elements) {
                            Map<String, Object> el = (Map<String, Object>) element;
                            if (el.get('type') == 'field') {
                                String key = (String) el.get('key');
                                String fieldApiName = (String) el.get('fieldApiName');
                                if (responses.containsKey(key)) {
                                    Object val = responses.get(key);
                                    primaryRecord.put(fieldApiName, coerceValue(primaryType, fieldApiName, val));
                                }
                            }
                        }
                    }
                }
            }

            // 4. Secure DML insertion via stripInaccessible
            SObjectAccessDecision decision = Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ primaryRecord });
            insert decision.getRecords();
            Id primaryRecordId = decision.getRecords()[0].Id;

            // 5. Process Child Relationship Collections (Related Lists)
            if (definition.containsKey('relatedLists')) {
                List<Object> relatedLists = (List<Object>) definition.get('relatedLists');
                List<SObject> childRecordsToInsert = new List<SObject>();
                
                for (Object relList : relatedLists) {
                    Map<String, Object> rMap = (Map<String, Object>) relList;
                    String childSObject = (String) rMap.get('childSObject');
                    String relationshipName = (String) rMap.get('relationshipName');
                    
                    Schema.SObjectType childType = Schema.getGlobalDescribe().get(childSObject);
                    if (childType == null) {
                        throw new AuraHandledException('Invalid child object: ' + childSObject);
                    }
                    if (!childType.getDescribe().isCreateable()) {
                        throw new AuraHandledException('Insufficient permissions to create child: ' + childSObject);
                    }
                    
                    // Locate target lookup field on child referencing parent
                    String lookupFieldApiName = findLookupField(childSObject, primarySObject);
                    
                    if (responses.containsKey(relationshipName)) {
                        List<Object> childRows = (List<Object>) responses.get(relationshipName);
                        for (Object rowObj : childRows) {
                            Map<String, Object> row = (Map<String, Object>) rowObj;
                            SObject childRecord = childType.newSObject();
                            
                            // Link child to primary parent ID
                            childRecord.put(lookupFieldApiName, primaryRecordId);
                            
                            List<Object> relFields = (List<Object>) rMap.get('fields');
                            for (Object rField : relFields) {
                                Map<String, Object> rf = (Map<String, Object>) rField;
                                String key = (String) rf.get('key');
                                String fieldApi = (String) rf.get('fieldApiName');
                                if (row.containsKey(key)) {
                                    Object val = row.get(key);
                                    childRecord.put(fieldApi, coerceValue(childType, fieldApi, val));
                                }
                            }
                            childRecordsToInsert.add(childRecord);
                        }
                    }
                }
                
                if (!childRecordsToInsert.isEmpty()) {
                    SObjectAccessDecision childDecision = Security.stripInaccessible(AccessType.CREATABLE, childRecordsToInsert);
                    insert childDecision.getRecords();
                }
            }

            // 6. Log Form Submission record
            Z_Form_Submission__c submission = new Z_Form_Submission__c(
                Z_Form_Version__c = version.Id,
                Z_Primary_Record_Id__c = primaryRecordId,
                Z_Submitted_Date__c = System.now(),
                Z_Status__c = 'Processed',
                Z_Submission_Payload__c = payload.responseJson
            );
            insert as user submission;

            result.put('status', 'SUCCESS');
            result.put('recordId', primaryRecordId);
            return result;
            
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Submission Processing Failed: ' + e.getMessage());
        }
    }

    private static String findLookupField(String childObject, String parentObject) {
        Map<String, Schema.SObjectField> childFields = Schema.getGlobalDescribe().get(childObject).getDescribe().fields.getMap();
        for (String fieldName : childFields.keySet()) {
            Schema.DescribeFieldResult dfr = childFields.get(fieldName).getDescribe();
            if (dfr.getType() == Schema.DisplayType.REFERENCE) {
                for (Schema.SObjectType targetObj : dfr.getReferenceTo()) {
                    if (targetObj.getDescribe().getName() == parentObject) {
                        return dfr.getName();
                    }
                }
            }
        }
        throw new AuraHandledException('Could not resolve lookup link between ' + childObject + ' and ' + parentObject);
    }

    private static Object coerceValue(Schema.SObjectType sObjectType, String fieldApiName, Object rawValue) {
        if (rawValue == null) return null;
        Schema.SObjectField field = sObjectType.getDescribe().fields.getMap().get(fieldApiName);
        if (field == null) return rawValue;
        
        Schema.DisplayType dt = field.getDescribe().getType();
        String strVal = String.valueOf(rawValue);
        
        if (String.isBlank(strVal)) return null;

        if (dt == Schema.DisplayType.DOUBLE || dt == Schema.DisplayType.CURRENCY || dt == Schema.DisplayType.PERCENT) {
            return Decimal.valueOf(strVal);
        } else if (dt == Schema.DisplayType.INTEGER) {
            return Integer.valueOf(strVal);
        } else if (dt == Schema.DisplayType.BOOLEAN) {
            return Boolean.valueOf(strVal);
        } else if (dt == Schema.DisplayType.DATE) {
            return Date.valueOf(strVal);
        } else if (dt == Schema.DisplayType.DATETIME) {
            // Handle ISO 8601 formatting or standard timestamp conversion
            try {
                return (DateTime) JSON.deserialize('"' + strVal + '"', DateTime.class);
            } catch (Exception e) {
                return DateTime.valueOfGmt(strVal.replace('T', ' '));
            }
        }
        return rawValue;
    }
}
