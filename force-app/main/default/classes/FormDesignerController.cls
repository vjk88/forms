public with sharing class FormDesignerController {
  public class OptionDTO implements Comparable {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String value;

    public OptionDTO(String l, String v) {
      this.label = l;
      this.value = v;
    }

    public Integer compareTo(Object other) {
      OptionDTO o = (OptionDTO) other;
      String thisLabel = (this.label == null) ? '' : this.label.toLowerCase();
      String otherLabel = (o.label == null) ? '' : o.label.toLowerCase();
      return thisLabel.compareTo(otherLabel);
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<OptionDTO> getOrgObjects() {
    Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
    List<OptionDTO> options = new List<OptionDTO>();

    for (String apiName : globalDescribe.keySet()) {
      try {
        Schema.DescribeSObjectResult d = globalDescribe.get(apiName)
          .getDescribe();
        if (
          d.isCreateable() &&
          d.isQueryable() &&
          d.isAccessible() &&
          d.isUpdateable() &&
          !d.isDeprecatedAndHidden() &&
          (d.isCustom() || isAllowedStandardObject(apiName))
        ) {
          // d.getName() is the proper-case API name; the map key is lowercase
          options.add(new OptionDTO(d.getLabel(), d.getName()));
        }
      } catch (Exception e) {
        System.debug(LoggingLevel.FINEST, 'Skipped object describe: ' + e.getMessage());
      }
    }

    options.sort();
    return options;
  }

  private static Boolean isAllowedStandardObject(String apiName) {
    if (String.isBlank(apiName)) {
      return false;
    }
    Set<String> allowed = new Set<String>{
      'account',
      'contact',
      'lead',
      'opportunity',
      'case',
      'task',
      'event'
    };
    return allowed.contains(apiName.toLowerCase());
  }

  /**
   * Returns the proper-case API name for an object. Older forms may have
   * stored the lowercase global-describe key (e.g., "form_section__c").
   */
  public static String normalizeObjectName(String name) {
    if (String.isBlank(name))
      return name;
    Schema.SObjectType t = Schema.getGlobalDescribe().get(name.toLowerCase());
    return t == null ? name : t.getDescribe().getName();
  }

  public class FieldDTO implements Comparable {
    @AuraEnabled
    public String apiName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public Boolean required;
    @AuraEnabled
    public Boolean isNameField;

    public FieldDTO(
      String apiName,
      String label,
      String type,
      Boolean required,
      Boolean isNameField
    ) {
      this.apiName = apiName;
      this.label = label;
      this.type = type;
      this.required = required;
      this.isNameField = isNameField;
    }

    public Integer compareTo(Object other) {
      FieldDTO o = (FieldDTO) other;
      String thisLabel = (this.label == null) ? '' : this.label.toLowerCase();
      String otherLabel = (o.label == null) ? '' : o.label.toLowerCase();
      return thisLabel.compareTo(otherLabel);
    }
  }

  public class RelationshipDTO implements Comparable {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String childObject;
    @AuraEnabled
    public String childObjectLabel;
    @AuraEnabled
    public String fieldName;

    public RelationshipDTO(
      String name,
      String childObject,
      String childObjectLabel,
      String fieldName
    ) {
      this.name = name;
      this.childObject = childObject;
      this.childObjectLabel = childObjectLabel;
      this.fieldName = fieldName;
    }

    public Integer compareTo(Object other) {
      RelationshipDTO o = (RelationshipDTO) other;
      String thisLabel = (this.childObjectLabel == null)
        ? ''
        : this.childObjectLabel.toLowerCase();
      String otherLabel = (o.childObjectLabel == null)
        ? ''
        : o.childObjectLabel.toLowerCase();
      return thisLabel.compareTo(otherLabel);
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<FieldDTO> getObjectFields(String objectApiName) {
    if (String.isBlank(objectApiName))
      return new List<FieldDTO>();

    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
    if (sObjType == null)
      return new List<FieldDTO>();

    Schema.DescribeSObjectResult objDesc = sObjType.getDescribe();
    Map<String, Schema.SObjectField> fieldMap = objDesc.fields.getMap();
    List<FieldDTO> result = new List<FieldDTO>();

    Set<Schema.DisplayType> supported = new Set<Schema.DisplayType>{
      Schema.DisplayType.String,
      Schema.DisplayType.TextArea,
      Schema.DisplayType.Phone,
      Schema.DisplayType.Email,
      Schema.DisplayType.Url,
      Schema.DisplayType.Boolean,
      Schema.DisplayType.Currency,
      Schema.DisplayType.Double,
      Schema.DisplayType.Integer,
      Schema.DisplayType.Date,
      Schema.DisplayType.DateTime,
      Schema.DisplayType.Picklist,
      Schema.DisplayType.MultiPicklist,
      Schema.DisplayType.Reference,
      Schema.DisplayType.Percent
    };

    for (String fname : fieldMap.keySet()) {
      Schema.DescribeFieldResult fd = fieldMap.get(fname).getDescribe();
      if (
        fd.isAccessible() &&
        supported.contains(fd.getType()) &&
        !isSystemField(fd)
      ) {
        result.add(
          new FieldDTO(
            fd.getName(),
            fd.getLabel(),
            fd.getType().name(),
            !fd.isNillable() && fd.isCreateable(),
            fd.isNameField()
          )
        );
      }
    }

    result.sort();
    return result;
  }

  // Internal, non-user-meaningful system fields hidden everywhere in the app.
  // Note: audit fields (CreatedDate, LastModifiedDate, LastActivityDate, etc.)
  // are intentionally KEPT — only the purely-internal ones are excluded.
  private static Boolean isSystemField(Schema.DescribeFieldResult fd) {
    String n = fd.getName().toLowerCase();
    return n == 'isdeleted' || n == 'systemmodstamp';
  }

  @AuraEnabled(cacheable=true)
  public static List<RelationshipDTO> getChildRelationships(
    String objectApiName
  ) {
    if (String.isBlank(objectApiName))
      return new List<RelationshipDTO>();

    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
    if (sObjType == null)
      return new List<RelationshipDTO>();

    List<RelationshipDTO> result = new List<RelationshipDTO>();
    for (
      Schema.ChildRelationship cr : sObjType.getDescribe()
        .getChildRelationships()
    ) {
      if (cr.getRelationshipName() == null)
        continue;

      Schema.DescribeSObjectResult childDesc = cr.getChildSObject()
        .getDescribe();
      if (
        childDesc.isAccessible() &&
        childDesc.isCreateable() &&
        childDesc.isQueryable()
      ) {
        result.add(
          new RelationshipDTO(
            cr.getRelationshipName(),
            childDesc.getName(),
            childDesc.getLabel(),
            cr.getField().getDescribe().getName()
          )
        );
      }
    }

    result.sort();
    return result;
  }

  @AuraEnabled(cacheable=true)
  public static List<Form__c> getAllForms() {
    List<Form__c> forms = [
      SELECT
        Id,
        Name,
        Primary_Context_Object__c,
        Form_Type__c,
        Layout_Mode__c,
        Submission_Storage__c,
        Allowed_Adapters__c,
        Status__c,
        (
          SELECT
            Id,
            Name,
            Version_Number__c,
            Is_Active__c,
            Layout_Mode__c,
            Published_Date__c
          FROM Form_Versions__r
          ORDER BY Version_Number__c DESC
        )
      FROM Form__c
      WITH USER_MODE
      ORDER BY Name ASC
    ];

    // Normalize any lowercase-stored object names to proper case
    Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
    for (Form__c f : forms) {
      if (!String.isBlank(f.Primary_Context_Object__c)) {
        Schema.SObjectType t = gd.get(
          f.Primary_Context_Object__c.toLowerCase()
        );
        if (t != null) {
          f.Primary_Context_Object__c = t.getDescribe().getName();
        }
      }
    }
    return forms;
  }

  @AuraEnabled(cacheable=true)
  public static List<Form_Version__c> getFormVersions(Id formId) {
    if (formId == null)
      return new List<Form_Version__c>();
    return [
      SELECT
        Id,
        Name,
        Version_Number__c,
        Is_Active__c,
        Layout_Mode__c,
        Published_Date__c,
        Published_By__c,
        Change_Notes__c
      FROM Form_Version__c
      WHERE Form__c = :formId
      WITH USER_MODE
      ORDER BY Version_Number__c DESC
    ];
  }

  @AuraEnabled
  public static Map<String, Object> createForm(
    String formName,
    String objectApiName,
    String formType,
    String layoutMode,
    String allowedAdapters
  ) {
    if (String.isBlank(formName)) {
      throw new AuraHandledException('Form name is required.');
    }

    // Storage is implied by type: a Form always writes to its primary
    // SObject; a Survey always writes to the generic Response/Answer store.
    String type = String.isBlank(formType) ? 'Form' : formType;
    Boolean isForm = (type == 'Form');
    String storage = isForm ? 'Primary_Object' : 'Form_Response';

    // A Form must be bound to an object. A Survey's object (if any) is just
    // the context record its responses link to, so it's optional.
    if (isForm && String.isBlank(objectApiName)) {
      throw new AuraHandledException('A primary object is required for a Form.');
    }

    if (!String.isBlank(objectApiName)) {
      Schema.SObjectType sObjType = Schema.getGlobalDescribe()
        .get(objectApiName);
      if (sObjType == null) {
        throw new AuraHandledException('Invalid object selected.');
      }
    }

    String resolvedLayout = String.isBlank(layoutMode)
      ? 'Single_Page'
      : layoutMode;

    Savepoint sp = Database.setSavepoint();
    try {
      Form__c form = new Form__c();
      form.Name = formName.trim();
      form.Primary_Context_Object__c = String.isBlank(objectApiName)
        ? null
        : objectApiName;
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
      version.Published_Date__c = System.now();
      insert as user version;

      Form_Page__c page = new Form_Page__c();
      page.Form_Version__c = version.Id;
      page.Name = 'Page 1';
      page.Sequence__c = 1;
      insert as user page;

      return new Map<String, Object>{
        'formId' => form.Id,
        'versionId' => version.Id
      };
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error creating form: ' + e.getMessage());
    }
  }

  @AuraEnabled
  public static Map<String, Object> createDraftFromActive(Id formId) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }

    List<Form_Version__c> existingDrafts = [
      SELECT Id
      FROM Form_Version__c
      WHERE Form__c = :formId AND Is_Active__c = FALSE
      WITH USER_MODE
      LIMIT 1
    ];
    if (!existingDrafts.isEmpty()) {
      throw new AuraHandledException('A draft version already exists.');
    }

    List<Form_Version__c> activeVersions = [
      SELECT Id, Version_Number__c
      FROM Form_Version__c
      WHERE Form__c = :formId AND Is_Active__c = TRUE
      WITH USER_MODE
      LIMIT 1
    ];
    if (activeVersions.isEmpty()) {
      throw new AuraHandledException('No active version found to clone.');
    }

    Id activeVersionId = activeVersions[0].Id;

    Form_Version__c activeFull = [
      SELECT Id, Layout_Config__c, Schema_Snapshot__c, Layout_Mode__c
      FROM Form_Version__c
      WHERE Id = :activeVersionId
      WITH USER_MODE
      LIMIT 1
    ];

    AggregateResult[] agg = [
      SELECT MAX(Version_Number__c) maxVer
      FROM Form_Version__c
      WHERE Form__c = :formId
      WITH USER_MODE
    ];
    Decimal nextVersion = ((Decimal) agg[0].get('maxVer')) + 1;

    Savepoint sp = Database.setSavepoint();
    try {
      Form_Version__c draft = new Form_Version__c();
      draft.Form__c = formId;
      draft.Version_Number__c = nextVersion;
      draft.Is_Active__c = false;
      draft.Layout_Config__c = activeFull.Layout_Config__c;
      draft.Layout_Mode__c = activeFull.Layout_Mode__c;
      draft.Published_Date__c = System.now();
      insert as user draft;

      cloneVersionChildren(activeVersionId, draft.Id);

      return new Map<String, Object>{
        'versionId' => draft.Id,
        'versionNumber' => draft.Version_Number__c
      };
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error creating draft: ' + e.getMessage());
    }
  }

  @AuraEnabled
  public static void publishVersion(Id versionId) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    Form_Version__c version = [
      SELECT Id, Is_Active__c, Form__c, Layout_Config__c, Schema_Snapshot__c
      FROM Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];

    if (version.Is_Active__c) {
      throw new AuraHandledException('This version is already published.');
    }
    if (String.isBlank(version.Layout_Config__c)) {
      throw new AuraHandledException(
        'Add and save form content before publishing.'
      );
    }

    // Capture the schema snapshot (object + fields used) once, at publish.
    List<Form__c> forms = [
      SELECT Id, Primary_Context_Object__c
      FROM Form__c
      WHERE Id = :version.Form__c
      WITH USER_MODE
      LIMIT 1
    ];
    String objectApi = forms.isEmpty()
      ? null
      : forms[0].Primary_Context_Object__c;
    String snapshot = String.isNotBlank(version.Schema_Snapshot__c)
      ? version.Schema_Snapshot__c
      : buildSchemaSnapshot(objectApi, version.Layout_Config__c);

    version.Is_Active__c = true;
    version.Published_Date__c = System.now();
    version.Published_By__c = UserInfo.getUserId();
    version.Schema_Snapshot__c = snapshot;

    // The Form mirrors the published layout + snapshot (the runtime can read
    // the live layout straight off the Form; satisfies the publish VRs).
    Form__c form = new Form__c(
      Id = version.Form__c,
      Status__c = 'Published',
      Published_Date__c = System.now(),
      Layout_Config__c = version.Layout_Config__c,
      Schema_Snapshot__c = snapshot
    );

    // Publishing flips app-managed status/audit fields on records the user
    // already has access to (with sharing + the AuraEnabled entry-point gate
    // it). Run the status flip in system mode so it doesn't require the running
    // user to hold edit FLS on these managed fields — the same approach as the
    // single-active-version trigger.
    Savepoint sp = Database.setSavepoint();
    try {
      update as system version;
      update as system form;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException(
        'Error publishing version: ' + e.getMessage()
      );
    }
  }

  /**
   * Builds a schema snapshot for a published form: the primary object plus the
   * describe metadata of every SObject field used in the layout. Lets the
   * runtime render against a frozen schema even if the org's fields later
   * change, and satisfies the publish-time integrity rules.
   */
  private static String buildSchemaSnapshot(
    String objectApiName,
    String layoutJson
  ) {
    Map<String, Object> snap = new Map<String, Object>{
      'object' => objectApiName,
      'capturedAt' => String.valueOf(System.now())
    };
    Set<String> fieldApis = new Set<String>();
    try {
      Map<String, Object> layout = (Map<String, Object>) JSON.deserializeUntyped(
        layoutJson
      );
      Object pages = layout.get('pages');
      if (pages instanceof List<Object>) {
        for (Object po : (List<Object>) pages) {
          Map<String, Object> page = (Map<String, Object>) po;
          collectFieldApis(page.get('sections'), fieldApis);
        }
      }
    } catch (Exception ignored) {
      // Unparseable layout still yields a valid (object-only) snapshot.
    }

    Map<String, Object> fieldsMap = new Map<String, Object>();
    if (String.isNotBlank(objectApiName)) {
      Schema.SObjectType t = Schema.getGlobalDescribe()
        .get(objectApiName.toLowerCase());
      if (t != null) {
        Map<String, Schema.SObjectField> fm = t.getDescribe().fields.getMap();
        for (String f : fieldApis) {
          Schema.SObjectField sf = fm.get(f.toLowerCase());
          if (sf == null) {
            continue;
          }
          Schema.DescribeFieldResult d = sf.getDescribe();
          List<String> refs = new List<String>();
          for (Schema.SObjectType rt : d.getReferenceTo()) {
            refs.add(rt.getDescribe().getName());
          }
          fieldsMap.put(
            d.getName(),
            new Map<String, Object>{
              'label' => d.getLabel(),
              'type' => d.getType().name(),
              'required' => !d.isNillable(),
              'createable' => d.isCreateable(),
              'updateable' => d.isUpdateable(),
              'referenceTo' => refs
            }
          );
        }
      }
    }
    snap.put('fields', fieldsMap);
    return JSON.serialize(snap);
  }

  private static void collectFieldApis(Object sectionsObj, Set<String> out) {
    if (!(sectionsObj instanceof List<Object>)) {
      return;
    }
    for (Object so : (List<Object>) sectionsObj) {
      Map<String, Object> section = (Map<String, Object>) so;
      Object elements = section.get('elements');
      if (elements instanceof List<Object>) {
        for (Object eo : (List<Object>) elements) {
          Map<String, Object> el = (Map<String, Object>) eo;
          String type = (String) el.get('type');
          String fapi = (String) el.get('fieldApiName');
          if (
            String.isNotBlank(fapi) &&
            (type == null || type == 'Field')
          ) {
            out.add(fapi);
          }
        }
      }
      // Recurse into nested related-list sections.
      collectFieldApis(section.get('relatedSections'), out);
    }
  }

  @AuraEnabled
  public static void deleteDraftVersion(Id versionId) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    Form_Version__c version = [
      SELECT Id, Is_Active__c
      FROM Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];

    if (version.Is_Active__c) {
      throw new AuraHandledException('Cannot delete a published version.');
    }

    try {
      delete as user version;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error deleting draft version: ' + e.getMessage()
      );
    }
  }

  private static void cloneVersionChildren(
    Id sourceVersionId,
    Id targetVersionId
  ) {
    List<Form_Page__c> sourcePages = [
      SELECT
        Id,
        Name,
        Sequence__c,
        Description__c,
        Skip_Condition_Expression__c,
        Show_Progress_Bar__c,
        Allow_Back_Navigation__c
      FROM Form_Page__c
      WHERE Form_Version__c = :sourceVersionId
      WITH USER_MODE
      ORDER BY Sequence__c
    ];

    if (sourcePages.isEmpty())
      return;

    List<Form_Page__c> newPages = new List<Form_Page__c>();
    for (Form_Page__c p : sourcePages) {
      Form_Page__c np = p.clone(false, true);
      np.Form_Version__c = targetVersionId;
      newPages.add(np);
    }
    insert as user newPages;

    Map<Id, Id> pageIdMap = new Map<Id, Id>();
    for (Integer i = 0; i < sourcePages.size(); i++) {
      pageIdMap.put(sourcePages[i].Id, newPages[i].Id);
    }

    List<Form_Section__c> sourceSections = [
      SELECT
        Id,
        Name,
        Form_Page__c,
        Sequence__c,
        Context_Type__c,
        Is_Repeatable__c,
        Max_Repetitions__c,
        Min_Repetitions__c,
        Parent_SObject_API__c,
        Relationship_Name__c,
        Visibility_Expression__c,
        Grid_Columns__c,
        Description__c,
        Collapsible__c,
        Collapsed_By_Default__c
      FROM Form_Section__c
      WHERE Form_Page__c IN :pageIdMap.keySet()
      WITH USER_MODE
      ORDER BY Sequence__c
    ];

    if (sourceSections.isEmpty())
      return;

    List<Form_Section__c> newSections = new List<Form_Section__c>();
    for (Form_Section__c s : sourceSections) {
      Form_Section__c ns = s.clone(false, true);
      ns.Form_Page__c = pageIdMap.get(s.Form_Page__c);
      newSections.add(ns);
    }
    insert as user newSections;

    Map<Id, Id> sectionIdMap = new Map<Id, Id>();
    for (Integer i = 0; i < sourceSections.size(); i++) {
      sectionIdMap.put(sourceSections[i].Id, newSections[i].Id);
    }

    List<Form_Element__c> sourceElements = [
      SELECT
        Id,
        Name,
        Form_Section__c,
        Key__c,
        Type__c,
        Sequence__c,
        Field_API_Name__c,
        Render_As__c,
        Column_Width__c,
        Is_Required__c,
        Help_Text__c,
        Placeholder__c,
        Grid_Position__c,
        Default_Value__c,
        Min_Value__c,
        Max_Value__c,
        Min_Length__c,
        Max_Length__c,
        Pattern__c,
        Pattern_Error_Message__c,
        Visibility_Expression__c,
        Calculation_Formula__c,
        Prefill_Type__c,
        Prefill_Token__c,
        Static_Text_Content__c
      FROM Form_Element__c
      WHERE Form_Section__c IN :sectionIdMap.keySet()
      WITH USER_MODE
      ORDER BY Sequence__c
    ];

    if (!sourceElements.isEmpty()) {
      List<Form_Element__c> newElements = new List<Form_Element__c>();
      for (Form_Element__c e : sourceElements) {
        Form_Element__c ne = e.clone(false, true);
        ne.Form_Section__c = sectionIdMap.get(e.Form_Section__c);
        ne.Key__c = e.Key__c;
        newElements.add(ne);
      }
      insert as user newElements;
    }
  }

  // --- Builder draft save / load ---
  // The draft builder state (header + sections tree) is stored as JSON in
  // Form_Version__c.Layout_Config__c. Relational Form_Section__c/Form_Element__c
  // records are generated from this JSON at publish time.

  @AuraEnabled
  public static void saveFormLayout(Id versionId, String layoutJson) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    List<Form_Version__c> versions = [
      SELECT Id, Is_Active__c
      FROM Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (versions.isEmpty()) {
      throw new AuraHandledException('Version not found.');
    }
    if (versions[0].Is_Active__c) {
      throw new AuraHandledException(
        'Published versions are read-only. Create a new draft to edit.'
      );
    }

    versions[0].Layout_Config__c = layoutJson;

    // Keep Layout_Mode__c in sync with the nav style stored in the layout JSON
    // (the builder can change it via the Settings tab).
    try {
      Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
        layoutJson
      );
      Object lm = parsed.get('layoutMode');
      if (lm != null && String.isNotBlank(String.valueOf(lm))) {
        versions[0].Layout_Mode__c = String.valueOf(lm);
      }
    } catch (Exception ignored) {
      // Layout JSON without a parseable mode just leaves the field unchanged.
    }

    try {
      update as user versions[0];
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error saving form layout: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled(cacheable=false)
  public static String getFormLayout(Id versionId) {
    if (versionId == null) {
      return null;
    }
    List<Form_Version__c> versions = [
      SELECT Layout_Config__c
      FROM Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    return versions.isEmpty() ? null : versions[0].Layout_Config__c;
  }
}
