/**
 * Read-side controller for c/formViewer — the NEW respondent experience
 * (PHASE2_WORKPLAN T2.0). Clean-break stack: no references to the legacy
 * FormPlayerController/FormGuestController (those serve c/formPlayer until
 * its Phase 6 deletion).
 *
 * Internal users: with sharing + USER_MODE. Guests are delegated to the
 * explicitly-elevated, hard-gated FormViewerGuest (separate class so the
 * elevation surface stays minimal and auditable).
 *
 * The form BODY (pages/sections/elements/theme) is the Layout_Config__c
 * JSON; the structural LAYOUT (archetype + zone tree, LAYOUT_SPEC.md) is
 * Form_Version__c.Layout_Spec__c. Legacy forms have no spec — the viewer
 * maps their legacy layout to an archetype preset client-side.
 */
public with sharing class FormViewerController {
  public class ViewerForm {
    @AuraEnabled public Id formId;
    @AuraEnabled public String formName;
    @AuraEnabled public String primaryObject;
    @AuraEnabled public String formType;
    @AuraEnabled public String allowedAdapters;
    @AuraEnabled public Boolean hasActiveVersion;
    @AuraEnabled public String bodyJson; // Layout_Config__c
    @AuraEnabled public String layoutSpecJson; // Layout_Spec__c (null = legacy)
  }

  /** Published/active form for filling. Entry point for both audiences. */
  @AuraEnabled
  public static ViewerForm getViewerForm(Id formId) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }
    if (UserInfo.getUserType() == 'Guest') {
      return FormViewerGuest.getGuestViewerForm(formId);
    }

    List<Form__c> forms = [
      SELECT Id, Name, Primary_Context_Object__c, Form_Type__c, Allowed_Adapters__c
      FROM Form__c
      WHERE Id = :formId
      WITH USER_MODE
      LIMIT 1
    ];
    if (forms.isEmpty()) {
      throw new AuraHandledException('Form not found.');
    }

    List<Form_Version__c> versions = [
      SELECT Layout_Config__c, Layout_Spec__c
      FROM Form_Version__c
      WHERE Form__c = :formId AND Is_Active__c = TRUE
      WITH USER_MODE
      ORDER BY Version_Number__c DESC
      LIMIT 1
    ];

    return build(
      forms[0],
      versions.isEmpty() ? null : versions[0].Layout_Config__c,
      versions.isEmpty() ? null : versions[0].Layout_Spec__c
    );
  }

  /** A specific version — wizard preview / "test before publish" mode. */
  @AuraEnabled
  public static ViewerForm getViewerFormByVersion(Id versionId) {
    if (UserInfo.getUserType() == 'Guest') {
      throw new AuraHandledException('Not available.');
    }
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    List<Form_Version__c> versions = [
      SELECT
        Layout_Config__c,
        Layout_Spec__c,
        Form__r.Id,
        Form__r.Name,
        Form__r.Primary_Context_Object__c,
        Form__r.Form_Type__c,
        Form__r.Allowed_Adapters__c
      FROM Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (versions.isEmpty()) {
      throw new AuraHandledException('Version not found.');
    }

    Form_Version__c v = versions[0];
    Form__c f = new Form__c(
      Id = v.Form__r.Id,
      Name = v.Form__r.Name,
      Primary_Context_Object__c = v.Form__r.Primary_Context_Object__c,
      Form_Type__c = v.Form__r.Form_Type__c,
      Allowed_Adapters__c = v.Form__r.Allowed_Adapters__c
    );
    return build(f, v.Layout_Config__c, v.Layout_Spec__c);
  }

  /**
   * Active picklist values per field so the renderer can draw radio groups,
   * dropdowns and checkbox groups from real schema values. FLS enforced via
   * isAccessible(). Authenticated only — guest forms use the elements'
   * Custom_Options_JSON__c instead (publish-time snapshot, no describe).
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, List<Map<String, String>>> getPicklistOptions(
    String objectApiName
  ) {
    if (UserInfo.getUserType() == 'Guest') {
      throw new AuraHandledException('Not available.');
    }
    Map<String, List<Map<String, String>>> result = new Map<String, List<Map<String, String>>>();
    if (String.isBlank(objectApiName)) {
      return result;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      return result;
    }
    for (Schema.SObjectField fld : t.getDescribe().fields.getMap().values()) {
      Schema.DescribeFieldResult d = fld.getDescribe();
      if (!d.isAccessible()) {
        continue;
      }
      Schema.DisplayType dt = d.getType();
      if (dt != Schema.DisplayType.PICKLIST && dt != Schema.DisplayType.MULTIPICKLIST) {
        continue;
      }
      List<Map<String, String>> opts = new List<Map<String, String>>();
      for (Schema.PicklistEntry pe : d.getPicklistValues()) {
        if (pe.isActive()) {
          opts.add(new Map<String, String>{ 'label' => pe.getLabel(), 'value' => pe.getValue() });
        }
      }
      result.put(d.getName(), opts);
    }
    return result;
  }

  /**
   * Single submit entry for c/formViewer. The primary object is resolved
   * SERVER-SIDE from the form — the client never chooses what gets created.
   * Internal users go through FormSubmitController (USER_MODE, atomic,
   * repeater-aware); guests are delegated to FormViewerGuest's hard-gated,
   * insert-only path.
   */
  @AuraEnabled
  public static FormSubmitController.SubmitResult submitViewerForm(
    Id formId,
    Map<String, Object> parentValues,
    Id existingRecordId,
    List<FormSubmitController.ChildBlock> children,
    List<FormSubmitController.FileUpload> files
  ) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }
    if (UserInfo.getUserType() == 'Guest') {
      return FormViewerGuest.submitGuestForm(formId, parentValues, children, files);
    }
    List<Form__c> forms = [
      SELECT Primary_Context_Object__c
      FROM Form__c
      WHERE Id = :formId
      WITH USER_MODE
      LIMIT 1
    ];
    if (forms.isEmpty()) {
      throw new AuraHandledException('Form not found.');
    }
    return FormSubmitController.submitCore(
      normalizeObjectName(forms[0].Primary_Context_Object__c),
      parentValues,
      existingRecordId,
      children,
      files
    );
  }

  /**
   * Autofill source-record fetch — reads the mapped fields off a source record so
   * c/formViewer can copy them into form fields (lookup-driven or URL-param driven).
   * Internal users read WITH USER_MODE (sharing + FLS govern what's returned).
   * Guests are delegated to FormViewerGuest's hard-gated, allow-listed path — only
   * the object/fields the PUBLISHED form's autofill rules declare are ever exposed.
   */
  @AuraEnabled
  public static Map<String, Object> getAutofillRecord(
    Id formId,
    String objectApiName,
    Id recordId,
    List<String> fieldApiNames
  ) {
    Map<String, Object> out = new Map<String, Object>();
    if (recordId == null || String.isBlank(objectApiName) || fieldApiNames == null || fieldApiNames.isEmpty()) {
      return out;
    }
    if (UserInfo.getUserType() == 'Guest') {
      return FormViewerGuest.getGuestAutofillRecord(formId, objectApiName, recordId, fieldApiNames);
    }
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName.toLowerCase());
    if (t == null) {
      return out;
    }
    Map<String, Schema.SObjectField> fmap = t.getDescribe().fields.getMap();
    List<String> safe = new List<String>();
    for (String fn : fieldApiNames) {
      if (String.isBlank(fn)) {
        continue;
      }
      Schema.SObjectField sf = fmap.get(fn.toLowerCase());
      if (sf != null && sf.getDescribe().isAccessible()) {
        safe.add(sf.getDescribe().getName());
      }
    }
    if (safe.isEmpty()) {
      return out;
    }
    String q =
      'SELECT ' + String.join(safe, ',') +
      ' FROM ' + t.getDescribe().getName() +
      ' WHERE Id = :recordId WITH USER_MODE LIMIT 1';
    List<SObject> rows = Database.query(q);
    if (!rows.isEmpty()) {
      for (String fn : safe) {
        out.put(fn, rows[0].get(fn));
      }
    }
    return out;
  }

  /** Case-corrects an object API name via describe (e.g. "contact" → "Contact"). */
  public static String normalizeObjectName(String name) {
    if (String.isBlank(name)) {
      return name;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe().get(name.toLowerCase());
    return t == null ? name : t.getDescribe().getName();
  }

  private static ViewerForm build(Form__c f, String bodyJson, String specJson) {
    ViewerForm vf = new ViewerForm();
    vf.formId = f.Id;
    vf.formName = f.Name;
    vf.primaryObject = normalizeObjectName(f.Primary_Context_Object__c);
    vf.formType = f.Form_Type__c;
    vf.allowedAdapters = f.Allowed_Adapters__c;
    vf.hasActiveVersion = String.isNotBlank(bodyJson);
    vf.bodyJson = bodyJson;
    vf.layoutSpecJson = specJson;
    return vf;
  }
}
