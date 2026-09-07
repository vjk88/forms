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
        @InvocableVariable(
            label='Track & control invitation'
            description='Optional. When true, mints a revocable Survey Invitation row (Tier 2) instead of a stateless link.'
        )
        public Boolean tracked;
        @InvocableVariable(
            label='Recipient'
            description='Optional label for who the tracked invitation is sent to.'
        )
        public String recipient;
        @InvocableVariable(
            label='Single use'
            description='Optional. When true (tracked only), the invitation burns on its first submit.'
        )
        public Boolean singleUse;
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
        Map<Id, FinalAutofillService.LinkSourceContract> contractCache = new Map<Id, FinalAutofillService.LinkSourceContract>();
        Map<Id, String> contractErrors = new Map<Id, String>();

        // R12 — resolve every distinct form's contract within a BOUNDED query
        // budget. This used to call resolveLinkSource(fid) once per form, and
        // each of those ran two SOQL statements, so a batch of ~50 distinct
        // forms exhausted the synchronous query limit before any other work in
        // the transaction. These two set-based reads serve any batch size.
        Map<Id, Form__c> formsById = new Map<Id, Form__c>(
            [
                SELECT Id, Form_Type__c, Primary_Context_Object__c
                FROM Form__c
                WHERE Id IN :formIds
                WITH USER_MODE
            ]
        );
        Map<Id, Map<String, Object>> specByFormId = new Map<Id, Map<String, Object>>();
        for (Form_Version__c v : [
            SELECT Form__c, Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c IN :formIds AND Is_Active__c = TRUE
            WITH USER_MODE
            ORDER BY Version_Number__c ASC
        ]) {
            if (String.isNotBlank(v.Spec_JSON__c)) {
                try {
                    specByFormId.put(
                        v.Form__c,
                        (Map<String, Object>) JSON.deserializeUntyped(
                            v.Spec_JSON__c
                        )
                    );
                } catch (Exception ignored) {
                    // Leave absent — the form reports a contract error below.
                }
            }
        }

        for (Id fid : formIds) {
            Form__c f = formsById.get(fid);
            if (f == null) {
                contractErrors.put(fid, 'FORM_NOT_FOUND');
                continue;
            }
            if (
                f.Form_Type__c == 'Survey' &&
                String.isBlank(f.Primary_Context_Object__c)
            ) {
                contractErrors.put(
                    fid,
                    'Connect an object before creating record links.'
                );
                continue;
            }
            Map<String, Object> spec = specByFormId.get(fid);
            if (spec == null && f.Form_Type__c != 'Survey') {
                contractErrors.put(
                    fid,
                    'Publish the form before creating personalized links.'
                );
                continue;
            }
            FinalAutofillService.LinkSourceContract c = FinalAutofillService.resolveLinkSourceFromSpec(
                spec,
                f.Form_Type__c,
                f.Primary_Context_Object__c
            );
            if (c == null) {
                contractErrors.put(
                    fid,
                    'This form does not have an enabled personalized link autofill rule.'
                );
                continue;
            }
            // R8 — Flow mints through the same disclosure gate as Studio, so
            // the two entry points cannot disagree about who may issue a link.
            if (!FinalAutofillService.canDiscloseFields(c)) {
                contractErrors.put(fid, FinalAutofillService.DISCLOSURE_DENIED);
                continue;
            }
            contractCache.put(fid, c);
        }
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
            if (r.formId == null) {
                res.error = 'Form Id is required.';
                continue;
            }
            FinalAutofillService.LinkSourceContract contract = contractCache.get(
                r.formId
            );
            if (contract == null) {
                res.error = contractErrors.containsKey(r.formId)
                    ? contractErrors.get(r.formId)
                    : 'Not a survey or form not found.';
                continue;
            }
            String targetObject = contract.objectApiName;
            if (String.isBlank(targetObject)) {
                res.error =
                    'This ' +
                    (contract.isSurvey ? 'survey' : 'form') +
                    ' has no connected object.';
                continue;
            }
            Schema.SObjectType t = Schema.getGlobalDescribe()
                .get(targetObject.toLowerCase());
            if (
                r.recordId == null ||
                t == null ||
                r.recordId.getSObjectType() != t
            ) {
                res.error =
                    'Record does not match the ' +
                    (contract.isSurvey ? 'survey' : 'form') +
                    '\'s object.';
                continue;
            }
            if (!readable.contains(r.recordId)) {
                res.error = 'No access to this record.';
                continue;
            }
            String canonical = t.getDescribe().getName();
            Integer ttl = (r.ttlDays == null ||
                r.ttlDays <= 0)
                ? FinalSurveyTokenService.DEFAULT_TTL_DAYS
                : r.ttlDays;
            Id invitationId = null;
            if (r.tracked == true) {
                invitationId = FinalSurveyInvitationService.createInvitation(
                    r.formId,
                    r.recordId,
                    canonical,
                    Datetime.now().addDays(ttl),
                    r.recipient,
                    r.singleUse == true
                );
                FinalSurveyInvitationService.publishEvent(
                    'minted',
                    r.formId,
                    invitationId,
                    r.recordId
                );
            }
            res.token = FinalSurveyTokenService.mint(
                r.formId,
                r.recordId,
                canonical,
                ttl,
                invitationId
            );
            res.query = '?c__formId=' + r.formId + '&c__rt=' + res.token;
        }
        return out;
    }
}
