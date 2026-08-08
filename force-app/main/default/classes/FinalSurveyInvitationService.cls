/**
 * FinalSurveyInvitationService — SO-4 Tier 2: the internal (mint-side) half of
 * tracked invitations. Creating the Survey_Invitation__c row is an authenticated
 * author action, so it runs `as user` (the author's CRUD/FLS); the guest-side
 * read/burn lives in the without-sharing guest path.
 *
 * The optional Platform Event (Survey_Invitation_Event__e) is the "external
 * storage add-on" seam: we emit, the customer subscribes and owns the
 * destination. Emission is ALWAYS best-effort — a publish failure (e.g. a guest
 * without Create on the event) must never break a mint or a submit.
 */
public with sharing class FinalSurveyInvitationService {
    /** Insert a tracked invitation and return its Id (the token's nonce). */
    public static Id createInvitation(
        Id formId,
        Id recordId,
        String sObjectType,
        Datetime expiresOn,
        String recipient,
        Boolean singleUse
    ) {
        Survey_Invitation__c inv = new Survey_Invitation__c(
            Form__c = formId,
            Record_Id__c = String.valueOf(recordId),
            Record_Type__c = sObjectType,
            Recipient__c = String.isBlank(recipient)
                ? null
                : recipient.abbreviate(255),
            Expires_On__c = expiresOn,
            Single_Use__c = singleUse == true,
            Sent_On__c = Datetime.now()
        );
        insert as user inv;
        return inv.Id;
    }

    /** Emit an invitation event ('minted' | 'responded'). Best-effort. */
    public static void publishEvent(
        String eventType,
        Id formId,
        Id invitationId,
        Id recordId
    ) {
        try {
            EventBus.publish(
                new Survey_Invitation_Event__e(
                    Event_Type__c = eventType,
                    Form_Id__c = String.valueOf(formId),
                    Invitation_Id__c = String.valueOf(invitationId),
                    Record_Id__c = recordId == null
                        ? null
                        : String.valueOf(recordId),
                    Occurred_On__c = Datetime.now()
                )
            );
        } catch (Exception e) {
            System.debug(
                LoggingLevel.WARN,
                'SO-4 invitation event skipped: ' + e.getMessage()
            );
        }
    }
}
