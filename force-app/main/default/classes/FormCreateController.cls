/**
 * Create-side controller for the gallery-first creation experience
 * (PHASE2 creation redesign). Clean-break / new-era: it does NOT live on the
 * legacy FormDesignerController, but it writes the SAME shared data model
 * (Form__c → Form_Version__c → Form_Page__c) and the SAME draft body contract
 * (Layout_Config__c JSON), so a template-created form opens correctly in the
 * existing builder and renders in c/formViewer.
 *
 * Single-writer invariant (LAYOUT_SPEC §6): any Layout_Spec__c is validated by
 * FormLayoutSpecValidator server-side before persistence — the wizard has no
 * bypass path.
 */
public with sharing class FormCreateController {
  /**
   * Create a draft Form from a gallery template.
   * @param formName        user-confirmed name
   * @param objectApiName    chosen/remapped primary object (blank only for a
   *                         Survey with no context record)
   * @param formType         'Form' | 'Survey'
   * @param layoutMode       Single_Page | Multi_Page_Wizard | …
   * @param allowedAdapters  ';'-joined adapter list
   * @param bodyJson         Layout_Config__c body (c/formTemplates.toBodyJson)
   * @param layoutSpecJson   materialized layout spec (validated here)
   * @return { formId, versionId }
   */
  @AuraEnabled
  public static Map<String, Object> createFromTemplate(
    String formName,
    String objectApiName,
    String formType,
    String layoutMode,
    String allowedAdapters,
    String bodyJson,
    String layoutSpecJson
  ) {
    if (String.isBlank(formName)) {
      throw new AuraHandledException('A form name is required.');
    }
    String type = String.isBlank(formType) ? 'Form' : formType;
    Boolean isForm = (type == 'Form');
    if (isForm && String.isBlank(objectApiName)) {
      throw new AuraHandledException('A primary object is required for a Form.');
    }
    String resolvedObject = null;
    if (String.isNotBlank(objectApiName)) {
      Schema.SObjectType t = Schema.getGlobalDescribe()
        .get(objectApiName.toLowerCase());
      if (t == null) {
        throw new AuraHandledException('Invalid object selected.');
      }
      resolvedObject = t.getDescribe().getName();
    }

    // Validate the spec BEFORE any DML (single-writer invariant). A blank
    // spec is allowed (the builder will materialize one), a malformed one is
    // rejected outright.
    if (String.isNotBlank(layoutSpecJson)) {
      FormLayoutSpecValidator.Result vr = FormLayoutSpecValidator.validate(
        layoutSpecJson
      );
      if (!vr.ok) {
        throw new AuraHandledException(
          'The template layout is invalid: ' + summarize(vr)
        );
      }
    }

    String resolvedLayout = String.isBlank(layoutMode)
      ? 'Single_Page'
      : layoutMode;
    String storage = isForm ? 'Primary_Object' : 'Form_Response';

    Savepoint sp = Database.setSavepoint();
    try {
      Form__c form = new Form__c();
      form.Name = formName.trim();
      form.Primary_Context_Object__c = resolvedObject;
      form.Form_Type__c = type;
      form.Layout_Mode__c = resolvedLayout;
      form.Submission_Storage__c = storage;
      form.Allowed_Adapters__c = String.isBlank(allowedAdapters)
        ? 'Internal_Record_Page'
        : allowedAdapters;
      form.Status__c = 'Draft';
      insert as user form;

      Form_Version__c version = new Form_Version__c();
      version.Form__c = form.Id;
      version.Version_Number__c = 1;
      version.Is_Active__c = false;
      version.Layout_Mode__c = resolvedLayout;
      version.Layout_Config__c = bodyJson; // draft body (builder source of truth)
      if (String.isNotBlank(layoutSpecJson)) {
        version.Layout_Spec__c = layoutSpecJson;
      }
      insert as user version;

      // First page row so the builder has a page to anchor to. The richer
      // page/section tree lives in the JSON body until publish materializes
      // the relational Form_Section__c/Form_Element__c records.
      Form_Page__c page = new Form_Page__c();
      page.Form_Version__c = version.Id;
      page.Name = 'Page 1';
      page.Sequence__c = 1;
      insert as user page;

      return new Map<String, Object>{
        'formId' => form.Id,
        'versionId' => version.Id
      };
    } catch (AuraHandledException e) {
      Database.rollback(sp);
      throw e;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error creating form: ' + e.getMessage());
    }
  }

  /**
   * Objects a form can bind to — createable/queryable/accessible/updateable,
   * custom or an allow-listed standard object. Mirrors the designer's object
   * list so the gallery's remap picker offers the same set. Cacheable.
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getCreateObjects() {
    Set<String> allowedStd = new Set<String>{
      'account', 'contact', 'lead', 'opportunity', 'case', 'task', 'event'
    };
    List<Map<String, String>> out = new List<Map<String, String>>();
    for (
      Schema.SObjectType st : Schema.getGlobalDescribe().values()
    ) {
      try {
        Schema.DescribeSObjectResult d = st.getDescribe();
        if (
          d.isCreateable() &&
          d.isQueryable() &&
          d.isAccessible() &&
          d.isUpdateable() &&
          !d.isDeprecatedAndHidden() &&
          (d.isCustom() || allowedStd.contains(d.getName().toLowerCase()))
        ) {
          out.add(
            new Map<String, String>{ 'label' => d.getLabel(), 'value' => d.getName() }
          );
        }
      } catch (Exception ignored) {
        // Some describes throw for restricted types — skip them.
      }
    }
    out.sort(new LabelSorter());
    return out;
  }

  // Sorts {label,value} maps by label for a stable picker order.
  private class LabelSorter implements Comparator<Map<String, String>> {
    public Integer compare(Map<String, String> a, Map<String, String> b) {
      String la = a.get('label') == null ? '' : a.get('label').toLowerCase();
      String lb = b.get('label') == null ? '' : b.get('label').toLowerCase();
      return la.compareTo(lb);
    }
  }

  private static String summarize(FormLayoutSpecValidator.Result vr) {
    List<String> msgs = new List<String>();
    for (FormLayoutSpecValidator.Issue i : vr.errors) {
      msgs.add(i.message);
      if (msgs.size() == 3) {
        break;
      }
    }
    return String.join(msgs, '; ');
  }
}
