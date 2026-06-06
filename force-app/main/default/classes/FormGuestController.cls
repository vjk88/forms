/**
 * Explicitly-elevated controller for GUEST/public form rendering.
 *
 * This is deliberately separate from FormPlayerController (which is the
 * internal, with-sharing controller). It runs `without sharing` so an
 * unauthenticated guest can read a form definition that hasn't been shared to
 * them — but it is STRICTLY gated: it will only ever return a form that is
 * (1) Published and (2) explicitly allows the Public/Guest adapter. It reads
 * the Form-level Layout_Config__c snapshot captured at publish time, so it
 * never needs to expose the Form_Version__c records to guests.
 *
 * Note: a guest still needs object/field create access (configured on the
 * Experience Cloud guest user profile + sharing) to actually submit; this
 * controller only governs whether the form definition may be rendered.
 */
public without sharing class FormGuestController {
  public static FormPlayerController.FormDef getGuestForm(Id formId) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }

    List<Form__c> forms = [
      SELECT
        Id,
        Name,
        Primary_Context_Object__c,
        Form_Type__c,
        Allowed_Adapters__c,
        Status__c,
        Layout_Config__c
      FROM Form__c
      WHERE Id = :formId
      LIMIT 1
    ];
    if (forms.isEmpty()) {
      throw new AuraHandledException('This form is not available.');
    }

    Form__c f = forms[0];
    Boolean isPublic =
      String.isNotBlank(f.Allowed_Adapters__c) &&
      f.Allowed_Adapters__c.contains('Public_Guest');
    Boolean isPublished = f.Status__c == 'Published';

    // Hard gate: never serve a non-published or non-public form to a guest.
    if (!isPublished || !isPublic) {
      throw new AuraHandledException('This form is not available.');
    }

    FormPlayerController.FormDef def = new FormPlayerController.FormDef();
    def.formId = f.Id;
    def.formName = f.Name;
    def.primaryObject = FormPlayerController.normalizeObjectName(
      f.Primary_Context_Object__c
    );
    def.formType = f.Form_Type__c;
    def.allowedAdapters = f.Allowed_Adapters__c;
    def.hasActiveVersion = String.isNotBlank(f.Layout_Config__c);
    def.layoutJson = f.Layout_Config__c;
    return def;
  }
}
