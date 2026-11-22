/**
 * FinalAddressController - address search for SIGNED-IN users (the Studio
 * preview and Lightning pages). Guests get their own ticket-checked path in
 * FinalGuestController.
 *
 * Every call must name a form and the address question it is for. People who
 * can edit the form (authors previewing a question that may not be published
 * yet) are let through; everyone else needs the question to exist on the
 * form's active published spec with search switched on. That keeps the
 * endpoint from being a free geocoder for arbitrary text.
 *
 * Failures reach the browser as AuraHandledException "FINAL_ADDR:<code>".
 */
public with sharing class FinalAddressController {
    /** Test seam: pretend the user can / cannot edit the form (tests run as an
     *  admin, who always can, so the respondent path needs this). */
    @TestVisible
    private static Boolean editOverride;

    @AuraEnabled(cacheable=true)
    public static FinalAddressService.Status status() {
        return FinalAddressService.status();
    }

    @AuraEnabled
    public static List<FinalAddress.Suggestion> suggest(
        Id formId,
        String elementId,
        String text,
        String sessionToken,
        String container
    ) {
        try {
            checkQuestion(formId, elementId);
            return FinalAddressService.suggest(text, sessionToken, container);
        } catch (FinalAddressService.AddressException e) {
            throw FinalAddressService.toAura(e);
        }
    }

    @AuraEnabled
    public static FinalAddress.Result details(
        Id formId,
        String elementId,
        String placeId,
        String sessionToken
    ) {
        try {
            checkQuestion(formId, elementId);
            return FinalAddressService.details(placeId, sessionToken);
        } catch (FinalAddressService.AddressException e) {
            throw FinalAddressService.toAura(e);
        }
    }

    private static void checkQuestion(Id formId, String elementId) {
        if (formId == null) {
            throw new FinalAddressService.AddressException(
                FinalAddressService.NOT_ALLOWED
            );
        }
        List<Form__c> forms;
        try {
            forms = [
                SELECT Id
                FROM Form__c
                WHERE Id = :formId
                WITH USER_MODE
                LIMIT 1
            ];
        } catch (QueryException e) {
            // no read access to the object or its fields at all
            forms = new List<Form__c>();
        }
        if (forms.isEmpty()) {
            throw new FinalAddressService.AddressException(
                FinalAddressService.NOT_ALLOWED
            );
        }
        if (canEdit(formId)) {
            return;
        }
        List<Form_Version__c> versions;
        try {
            versions = [
                SELECT Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c
                FROM Form_Version__c
                WHERE Form__c = :formId AND Is_Active__c = TRUE
                WITH USER_MODE
                ORDER BY Version_Number__c DESC
                LIMIT 1
            ];
        } catch (QueryException e) {
            versions = new List<Form_Version__c>();
        }
        String specJson = versions.isEmpty()
            ? null
            : FinalSpecStore.read(versions[0]);
        if (String.isBlank(specJson)) {
            throw new FinalAddressService.AddressException(
                FinalAddressService.NOT_ALLOWED
            );
        }
        Object parsed;
        try {
            parsed = JSON.deserializeUntyped(specJson);
        } catch (JSONException e) {
            throw new FinalAddressService.AddressException(
                FinalAddressService.NOT_ALLOWED
            );
        }
        FinalAddressService.requireSearchQuestion(
            parsed instanceof Map<String, Object>
                ? (Map<String, Object>) parsed
                : null,
            elementId
        );
    }

    /** Edit access = an author, who may preview an unpublished question. */
    private static Boolean canEdit(Id formId) {
        if (editOverride != null) {
            return editOverride;
        }
        for (UserRecordAccess a : [
            SELECT RecordId, HasEditAccess
            FROM UserRecordAccess
            WHERE UserId = :UserInfo.getUserId() AND RecordId = :formId
        ]) {
            return a.HasEditAccess;
        }
        return false;
    }
}
