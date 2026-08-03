/**
 * FinalSurveyLinkInvocable — SO-4: mint guest survey record links from Flow,
 * campaigns, or email-template automations. One Result per Request (index-
 * aligned for Flow).
 *
 * Same law as the studio minter: the RUNNING USER must be able to read each
 * record (UserRecordAccess row-level check, batched) — you can't issue a link
 * for data you can't see. A record the user can't access yields a blank token
 * + an error string, never a link and never a thrown batch failure.
 */
public with sharing class FinalSurveyLinkInvocable {
    public class Request {
        @InvocableVariable(
            required=true
            label='Survey Id'
            description='The Form__c Id of the survey.'
        )
        public Id formId;
        @InvocableVariable(
            required=true
            label='Record Id'
            description='The record to bind the link to (must be the survey\'s connected object).'
        )
        public Id recordId;
        @InvocableVariable(
            label='Link lifetime (days)'
            description='Optional. Defaults to 30 days.'
        )
        public Integer ttlDays;
    }

    public class Result {
        @InvocableVariable(label='Link query string')
        public String query;
        @InvocableVariable(label='Token')
        public String token;
        @InvocableVariable(label='Error')
        public String error;
    }

    @InvocableMethod(
        label='Create survey record links'
        description='Mint guest survey links bound to a record — rules and prefill follow the record, no Id in the URL.'
        category='Surveys'
    )
    public static List<Result> createLinks(List<Request> requests) {
        List<Result> out = new List<Result>();
        if (requests == null || requests.isEmpty()) {
            return out;
        }

        // Batch the two reads: forms, and the running user's row-level access.
        Set<Id> formIds = new Set<Id>();
        Set<Id> recordIds = new Set<Id>();
        for (Request r : requests) {
            if (r.formId != null) {
                formIds.add(r.formId);
            }
            if (r.recordId != null) {
                recordIds.add(r.recordId);
            }
        }
        Map<Id, Form__c> forms = new Map<Id, Form__c>(
            [
                SELECT Id, Form_Type__c, Primary_Context_Object__c
                FROM Form__c
                WHERE Id IN :formIds
                WITH USER_MODE
            ]
        );
        Set<Id> readable = new Set<Id>();
        for (UserRecordAccess a : [
            SELECT RecordId, HasReadAccess
            FROM UserRecordAccess
            WHERE UserId = :UserInfo.getUserId() AND RecordId IN :recordIds
        ]) {
            if (a.HasReadAccess) {
                readable.add(a.RecordId);
            }
        }

        for (Request r : requests) {
            Result res = new Result();
            out.add(res);
            Form__c f = r.formId == null ? null : forms.get(r.formId);
            if (f == null || f.Form_Type__c != 'Survey') {
                res.error = 'Not a survey, or survey not found.';
                continue;
            }
            String targetObject = f.Primary_Context_Object__c;
            if (String.isBlank(targetObject)) {
                res.error = 'This survey has no connected object.';
                continue;
            }
            Schema.SObjectType t = Schema.getGlobalDescribe()
                .get(targetObject.toLowerCase());
            if (
                r.recordId == null ||
                t == null ||
                r.recordId.getSObjectType() != t
            ) {
                res.error = 'Record does not match the survey\'s object.';
                continue;
            }
            if (!readable.contains(r.recordId)) {
                res.error = 'No access to this record.';
                continue;
            }
            res.token = FinalSurveyTokenService.mint(
                r.formId,
                r.recordId,
                t.getDescribe().getName(),
                r.ttlDays
            );
            res.query = '?c__formId=' + r.formId + '&c__rt=' + res.token;
        }
        return out;
    }
}
