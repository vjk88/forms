/**
 * Reads one Freeform submission back (FREEFORM_SPEC §8).
 *
 * The rule that shapes this class: a submission is rendered from the version
 * that was FILLED IN, never from the current draft (D19). Renaming a question
 * must not re-word an answer someone already gave, and a question added last
 * week must not appear as "No answer" on a submission from last month. The
 * version is already on the record; this class simply refuses to look
 * anywhere else.
 *
 * USER_MODE throughout: the reader sees a submission only if they can read it.
 */
public with sharing class FinalSubmissionController {
    /**
     * @param submissionId a Form_Submission__c id
     * @return submission header, its version's spec, and its answer rows
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getSubmission(Id submissionId) {
        if (submissionId == null) {
            throw new AuraHandledException('A submission is required.');
        }
        List<Form_Submission__c> found = [
            SELECT
                Id,
                Name,
                Submitted_Date__c,
                Completion_Time_Seconds__c,
                Submitted_By__c,
                Submitted_By__r.Name,
                Form__c,
                Form__r.Name,
                Form_Version__c,
                Form_Version__r.Version_Number__c,
                Form_Version__r.Spec_JSON__c,
                Copy_Status__c,
                Copy_Message__c,
                Copy_File_Id__c
            FROM Form_Submission__c
            WHERE Id = :submissionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (found.isEmpty()) {
            // Indistinguishable from "does not exist" on purpose.
            throw new AuraHandledException('That submission is not available.');
        }
        Form_Submission__c sub = found[0];

        List<Map<String, Object>> answers = new List<Map<String, Object>>();
        for (Form_Submission_Answer__c a : [
            SELECT
                Element_Key__c,
                Label_Snapshot__c,
                Answer_Type__c,
                Value_Unparsed__c,
                Entry_Index__c,
                Text_Value__c,
                Numeric_Value__c,
                Boolean_Value__c,
                Date_Value__c,
                DateTime_Value__c,
                Selected_Options_JSON__c
            FROM Form_Submission_Answer__c
            WHERE Form_Submission__c = :submissionId
            WITH USER_MODE
            ORDER BY Entry_Index__c NULLS FIRST, Element_Key__c
        ]) {
            answers.add(
                new Map<String, Object>{
                    'elementKey' => a.Element_Key__c,
                    'label' => a.Label_Snapshot__c,
                    'answerType' => a.Answer_Type__c,
                    'unparsed' => a.Value_Unparsed__c,
                    'entryIndex' => a.Entry_Index__c,
                    'text' => a.Text_Value__c,
                    'number' => a.Numeric_Value__c,
                    'checked' => a.Boolean_Value__c,
                    'date' => a.Date_Value__c,
                    'dateTime' => a.DateTime_Value__c,
                    'options' => a.Selected_Options_JSON__c
                }
            );
        }

        return new Map<String, Object>{
            'submissionNumber' => sub.Name,
            'formName' => sub.Form__r == null ? null : sub.Form__r.Name,
            'versionNumber' => sub.Form_Version__r == null
                ? null
                : sub.Form_Version__r.Version_Number__c,
            'submittedDate' => sub.Submitted_Date__c,
            'submittedBy' => sub.Submitted_By__r == null
                ? null
                : sub.Submitted_By__r.Name,
            'completionSeconds' => sub.Completion_Time_Seconds__c,
            // The spec AS PUBLISHED when this submission was filled in.
            'specJson' => sub.Form_Version__r == null
                ? null
                : sub.Form_Version__r.Spec_JSON__c,
            'answers' => answers,
            'files' => fileLinks(submissionId, sub.Copy_File_Id__c),
            'copy' => copyInfo(sub)
        };
    }

    /**
     * The saved PDF copy (IMPL_PLAN_FORM_PDF §6.4): its status and, once
     * saved, the file to open. Null when the form doesn't save copies.
     */
    private static Map<String, Object> copyInfo(Form_Submission__c sub) {
        return copyInfo(
            sub.Copy_Status__c,
            sub.Copy_Message__c,
            sub.Copy_File_Id__c
        );
    }

    private static Map<String, Object> copyInfo(
        String status,
        String message,
        String fileId
    ) {
        if (
            String.isBlank(status) ||
            status == FinalSubmissionCopy.STATUS_NOT_NEEDED
        ) {
            return null;
        }
        Id documentId = null;
        if (String.isNotBlank(fileId)) {
            for (ContentVersion cv : [
                SELECT ContentDocumentId
                FROM ContentVersion
                WHERE Id = :fileId
                WITH USER_MODE
                LIMIT 1
            ]) {
                documentId = cv.ContentDocumentId;
            }
        }
        return new Map<String, Object>{
            'status' => status,
            'message' => message,
            'documentId' => documentId
        };
    }

    /**
     * Makes a PDF copy now, as the person asking: for a copy that failed, or
     * one that was never made. Works for a Freeform submission and a survey
     * response (the two answer stores written once at submit). The person
     * must be able to read the record (USER_MODE); the copy holds only what
     * that record already shows.
     * @return the refreshed copy info
     */
    @AuraEnabled
    public static Map<String, Object> saveCopy(Id submissionId) {
        if (submissionId == null) {
            throw new AuraHandledException('That submission is not available.');
        }
        SObjectType type = submissionId.getSObjectType();
        if (
            type != Form_Submission__c.SObjectType &&
            type != Form_Response__c.SObjectType
        ) {
            throw new AuraHandledException(
                'PDF copies are made for submissions and survey responses only.'
            );
        }
        String objectName = type.getDescribe().getName();
        List<SObject> found = Database.queryWithBinds(
            'SELECT Id FROM ' + objectName + ' WHERE Id = :recordId LIMIT 1',
            new Map<String, Object>{ 'recordId' => submissionId },
            AccessLevel.USER_MODE
        );
        if (found.isEmpty()) {
            throw new AuraHandledException('That submission is not available.');
        }
        FinalSubmissionCopy.save(submissionId, true);
        SObject row = Database.queryWithBinds(
            'SELECT Copy_Status__c, Copy_Message__c, Copy_File_Id__c FROM ' +
                objectName +
                ' WHERE Id = :recordId',
            new Map<String, Object>{ 'recordId' => submissionId },
            AccessLevel.SYSTEM_MODE
        )[0];
        return copyInfo(
            (String) row.get('Copy_Status__c'),
            (String) row.get('Copy_Message__c'),
            (String) row.get('Copy_File_Id__c')
        );
    }

    /** Files attached to the submission itself, newest first — never the
     *  saved PDF copy, which has its own place on the card. */
    private static List<Map<String, Object>> fileLinks(
        Id submissionId,
        String copyVersionId
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        Set<Id> docIds = new Set<Id>();
        for (ContentDocumentLink link : [
            SELECT ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :submissionId
        ]) {
            docIds.add(link.ContentDocumentId);
        }
        if (docIds.isEmpty()) {
            return out;
        }
        for (ContentVersion cv : [
            SELECT Id, Title, FileExtension, ContentSize, ContentDocumentId
            FROM ContentVersion
            WHERE ContentDocumentId IN :docIds AND IsLatest = TRUE
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            if (isSavedCopy(cv, copyVersionId)) {
                continue;
            }
            out.add(
                new Map<String, Object>{
                    'id' => cv.Id,
                    'documentId' => cv.ContentDocumentId,
                    'title' => cv.Title,
                    'extension' => cv.FileExtension,
                    'size' => cv.ContentSize
                }
            );
        }
        return out;
    }

    /** The current saved copy, or an earlier one replaced by Try again. */
    private static Boolean isSavedCopy(
        ContentVersion cv,
        String copyVersionId
    ) {
        return (copyVersionId != null &&
            String.valueOf(cv.Id) == copyVersionId) ||
            (cv.FileExtension == 'pdf' &&
            cv.Title != null &&
            cv.Title.endsWith(' (saved copy)'));
    }
}
