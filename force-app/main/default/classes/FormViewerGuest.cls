/**
 * Explicitly-elevated guest path for c/formViewer (PHASE2_WORKPLAN T2.0).
 * Runs `without sharing` so an unauthenticated guest can read a published
 * form definition — STRICTLY gated: only forms that are (1) Published AND
 * (2) explicitly allow the Public_Guest adapter are ever served.
 *
 * Body comes from the Form-level Layout_Config__c snapshot captured at
 * publish. The structural Layout_Spec__c lives on the active version and is
 * read here ONLY after both gates pass — the same trust boundary; no other
 * Form_Version__c data is exposed to guests.
 *
 * Submission rights are governed separately (guest profile object/field
 * create access) — this class only controls definition rendering.
 */
public without sharing class FormViewerGuest {
  public static FormViewerController.ViewerForm getGuestViewerForm(Id formId) {
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

    List<Form_Version__c> versions = [
      SELECT Layout_Spec__c
      FROM Form_Version__c
      WHERE Form__c = :f.Id AND Is_Active__c = TRUE
      ORDER BY Version_Number__c DESC
      LIMIT 1
    ];

    FormViewerController.ViewerForm vf = new FormViewerController.ViewerForm();
    vf.formId = f.Id;
    vf.formName = f.Name;
    vf.primaryObject = FormViewerController.normalizeObjectName(
      f.Primary_Context_Object__c
    );
    vf.formType = f.Form_Type__c;
    vf.allowedAdapters = f.Allowed_Adapters__c;
    vf.hasActiveVersion = String.isNotBlank(f.Layout_Config__c);
    vf.bodyJson = f.Layout_Config__c;
    vf.layoutSpecJson = versions.isEmpty() ? null : versions[0].Layout_Spec__c;
    return vf;
  }

  /**
   * Guest submit — same hard gates as the definition read (Published +
   * Public_Guest), then:
   *  - the primary object is forced to the form's own, never client-chosen;
   *  - INSERT ONLY (no existingRecordId — a guest must never update records);
   *  - child blocks are allow-listed against the published body snapshot's
   *    related sections (object + linking field must both match);
   *  - the actual DML runs in FormSubmitController.submitCore with
   *    AccessLevel.USER_MODE, so the guest profile's CRUD/FLS governs what
   *    is actually written. This class only widens READ of the definition.
   */
  public static FormSubmitController.SubmitResult submitGuestForm(
    Id formId,
    Map<String, Object> parentValues,
    List<FormSubmitController.ChildBlock> children,
    List<FormSubmitController.FileUpload> files
  ) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }
    List<Form__c> forms = [
      SELECT
        Id,
        Primary_Context_Object__c,
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
    if (f.Status__c != 'Published' || !isPublic) {
      throw new AuraHandledException('This form is not available.');
    }

    List<FormSubmitController.ChildBlock> safeChildren = new List<FormSubmitController.ChildBlock>();
    if (children != null && !children.isEmpty()) {
      Set<String> allowed = allowedChildBlocks(f.Layout_Config__c);
      for (FormSubmitController.ChildBlock b : children) {
        if (
          b == null ||
          String.isBlank(b.childObjectApiName) ||
          String.isBlank(b.linkingField)
        ) {
          continue;
        }
        String sig =
          b.childObjectApiName.toLowerCase() +
          '|' +
          b.linkingField.toLowerCase();
        if (!allowed.contains(sig)) {
          throw new AuraHandledException(
            'This form does not accept those related records.'
          );
        }
        safeChildren.add(b);
      }
    }

    return FormSubmitController.submitCore(
      FormViewerController.normalizeObjectName(f.Primary_Context_Object__c),
      parentValues,
      null, // guests never update
      safeChildren,
      files
    );
  }

  /**
   * Guest autofill source-record fetch. Read-widening for an unauthenticated user,
   * so it is fenced on every axis:
   *  - the form must be Published AND allow Public_Guest (same trust gate as render);
   *  - the source object + EACH requested field must appear in the PUBLISHED body's
   *    autofill rules (a guest can't fish arbitrary objects/fields by crafting args);
   *  - only those allow-listed fields are ever selected or returned.
   * Runs `without sharing` (class-level) so the published record is readable, but the
   * allow-list — not sharing — is what bounds exposure.
   */
  public static Map<String, Object> getGuestAutofillRecord(
    Id formId,
    String objectApiName,
    Id recordId,
    List<String> fieldApiNames
  ) {
    Map<String, Object> out = new Map<String, Object>();
    if (formId == null || recordId == null || String.isBlank(objectApiName) || fieldApiNames == null || fieldApiNames.isEmpty()) {
      return out;
    }
    List<Form__c> forms = [
      SELECT Status__c, Allowed_Adapters__c, Layout_Config__c
      FROM Form__c
      WHERE Id = :formId
      LIMIT 1
    ];
    if (forms.isEmpty()) {
      return out;
    }
    Form__c f = forms[0];
    Boolean isPublic =
      String.isNotBlank(f.Allowed_Adapters__c) &&
      f.Allowed_Adapters__c.contains('Public_Guest');
    if (f.Status__c != 'Published' || !isPublic) {
      return out;
    }

    // Allow-list of source fields per source object, from the published rules.
    Map<String, Set<String>> allowed = allowedAutofillFields(f.Layout_Config__c);
    Set<String> allowFields = allowed.get(objectApiName.toLowerCase());
    if (allowFields == null || allowFields.isEmpty()) {
      return out;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName.toLowerCase());
    if (t == null) {
      return out;
    }
    Map<String, Schema.SObjectField> fmap = t.getDescribe().fields.getMap();
    List<String> safe = new List<String>();
    for (String fn : fieldApiNames) {
      if (String.isBlank(fn) || !allowFields.contains(fn.toLowerCase())) {
        continue; // not declared by the published rules ⇒ never read
      }
      Schema.SObjectField sf = fmap.get(fn.toLowerCase());
      if (sf != null) {
        safe.add(sf.getDescribe().getName());
      }
    }
    if (safe.isEmpty()) {
      return out;
    }
    String q =
      'SELECT ' + String.join(safe, ',') +
      ' FROM ' + t.getDescribe().getName() +
      ' WHERE Id = :recordId LIMIT 1';
    List<SObject> rows = Database.query(q);
    if (!rows.isEmpty()) {
      for (String fn : safe) {
        out.put(fn, rows[0].get(fn));
      }
    }
    return out;
  }

  /** sourceObject(lower) → set of mapping source-field(lower) the published rules declare. */
  private static Map<String, Set<String>> allowedAutofillFields(String bodyJson) {
    Map<String, Set<String>> out = new Map<String, Set<String>>();
    if (String.isBlank(bodyJson)) {
      return out;
    }
    try {
      Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(bodyJson);
      Object fsObj = parsed.get('formSettings');
      if (!(fsObj instanceof Map<String, Object>)) {
        return out;
      }
      Object rulesObj = ((Map<String, Object>) fsObj).get('autofillRules');
      if (!(rulesObj instanceof List<Object>)) {
        return out;
      }
      for (Object rObj : (List<Object>) rulesObj) {
        if (!(rObj instanceof Map<String, Object>)) {
          continue;
        }
        Map<String, Object> rule = (Map<String, Object>) rObj;
        Object srcObj = rule.get('sourceObject');
        Object mapsObj = rule.get('mappings');
        if (!(srcObj instanceof String) || !(mapsObj instanceof List<Object>)) {
          continue;
        }
        String src = ((String) srcObj).toLowerCase();
        Set<String> fields = out.containsKey(src) ? out.get(src) : new Set<String>();
        for (Object mObj : (List<Object>) mapsObj) {
          if (!(mObj instanceof Map<String, Object>)) {
            continue;
          }
          Object fromVal = ((Map<String, Object>) mObj).get('from');
          if (fromVal instanceof String) {
            fields.add(((String) fromVal).toLowerCase());
          }
        }
        out.put(src, fields);
      }
    } catch (Exception e) {
      // Unparseable snapshot ⇒ nothing allowed.
    }
    return out;
  }

  /** "childObject|linkingField" pairs the published body actually defines. */
  private static Set<String> allowedChildBlocks(String bodyJson) {
    Set<String> out = new Set<String>();
    if (String.isBlank(bodyJson)) {
      return out;
    }
    try {
      Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
        bodyJson
      );
      List<Object> pages = parsed.get('pages') instanceof List<Object>
        ? (List<Object>) parsed.get('pages')
        : new List<Object>();
      // Single-page bodies store sections at the top level.
      if (pages.isEmpty() && parsed.get('sections') instanceof List<Object>) {
        pages.add(
          new Map<String, Object>{ 'sections' => parsed.get('sections') }
        );
      }
      for (Object pObj : pages) {
        if (!(pObj instanceof Map<String, Object>)) {
          continue;
        }
        Object secsObj = ((Map<String, Object>) pObj).get('sections');
        if (!(secsObj instanceof List<Object>)) {
          continue;
        }
        for (Object sObj : (List<Object>) secsObj) {
          if (!(sObj instanceof Map<String, Object>)) {
            continue;
          }
          Object relObj = ((Map<String, Object>) sObj).get('relatedSections');
          if (!(relObj instanceof List<Object>)) {
            continue;
          }
          for (Object rObj : (List<Object>) relObj) {
            if (!(rObj instanceof Map<String, Object>)) {
              continue;
            }
            Map<String, Object> rel = (Map<String, Object>) rObj;
            // Stored-model naming: parentSObjectApi IS the child object.
            Object childObj = rel.get('childObjectApiName') != null
              ? rel.get('childObjectApiName')
              : rel.get('parentSObjectApi');
            Object link = rel.get('linkingField');
            if (childObj instanceof String && link instanceof String) {
              out.add(
                ((String) childObj).toLowerCase() +
                  '|' +
                  ((String) link).toLowerCase()
              );
            }
          }
        }
      }
    } catch (Exception e) {
      // Unparseable snapshot ⇒ no child blocks allowed.
    }
    return out;
  }
}
