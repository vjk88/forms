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
          options.add(new OptionDTO(d.getLabel(), apiName));
        }
      } catch (Exception e) {
        // Skip inaccessible objects
      }
    }

    options.sort();
    return options;
  }

  private static Boolean isAllowedStandardObject(String apiName) {
    Set<String> allowed = new Set<String>{
      'Account',
      'Contact',
      'Lead',
      'Opportunity',
      'Case',
      'Task',
      'Event'
    };
    return allowed.contains(apiName);
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
      if (fd.isAccessible() && supported.contains(fd.getType())) {
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
    return [
      SELECT
        Id,
        Name,
        Primary_Context_Object__c,
        Form_Type__c,
        Layout_Mode__c,
        Status__c,
        (
          SELECT Id, Name, Version_Number__c, Is_Active__c, Published_Date__c
          FROM Form_Versions__r
          ORDER BY Version_Number__c DESC
        )
      FROM Form__c
      ORDER BY Name ASC
    ];
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
        Published_Date__c,
        Published_By__c,
        Change_Notes__c
      FROM Form_Version__c
      WHERE Form__c = :formId
      ORDER BY Version_Number__c DESC
    ];
  }

  @AuraEnabled
  public static Map<String, Object> createForm(
    String formName,
    String objectApiName,
    String formType,
    String layoutMode
  ) {
    if (String.isBlank(formName)) {
      throw new AuraHandledException('Form name is required.');
    }
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('Primary object is required.');
    }

    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
    if (sObjType == null) {
      throw new AuraHandledException('Invalid object selected.');
    }

    Savepoint sp = Database.setSavepoint();
    try {
      Form__c form = new Form__c();
      form.Name = formName.trim();
      form.Primary_Context_Object__c = objectApiName;
      form.Form_Type__c = String.isBlank(formType) ? 'Form' : formType;
      form.Layout_Mode__c = String.isBlank(layoutMode)
        ? 'Single_Page'
        : layoutMode;
      form.Status__c = 'Draft';
      insert form;

      Form_Version__c version = new Form_Version__c();
      version.Form__c = form.Id;
      version.Version_Number__c = 1;
      version.Is_Active__c = false;
      version.Published_Date__c = System.now();
      insert version;

      Form_Page__c page = new Form_Page__c();
      page.Form_Version__c = version.Id;
      page.Name = 'Page 1';
      page.Sequence__c = 1;
      insert page;

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
      LIMIT 1
    ];
    if (!existingDrafts.isEmpty()) {
      throw new AuraHandledException('A draft version already exists.');
    }

    List<Form_Version__c> activeVersions = [
      SELECT Id, Version_Number__c
      FROM Form_Version__c
      WHERE Form__c = :formId AND Is_Active__c = TRUE
      LIMIT 1
    ];
    if (activeVersions.isEmpty()) {
      throw new AuraHandledException('No active version found to clone.');
    }

    Id activeVersionId = activeVersions[0].Id;

    AggregateResult[] agg = [
      SELECT MAX(Version_Number__c) maxVer
      FROM Form_Version__c
      WHERE Form__c = :formId
    ];
    Decimal nextVersion = ((Decimal) agg[0].get('maxVer')) + 1;

    Savepoint sp = Database.setSavepoint();
    try {
      Form_Version__c draft = new Form_Version__c();
      draft.Form__c = formId;
      draft.Version_Number__c = nextVersion;
      draft.Is_Active__c = false;
      draft.Published_Date__c = System.now();
      insert draft;

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
      SELECT Id, Is_Active__c, Form__c
      FROM Form_Version__c
      WHERE Id = :versionId
      LIMIT 1
    ];

    if (version.Is_Active__c) {
      throw new AuraHandledException('This version is already published.');
    }

    version.Is_Active__c = true;
    version.Published_Date__c = System.now();
    version.Published_By__c = UserInfo.getUserId();
    update version;

    Form__c form = new Form__c(
      Id = version.Form__c,
      Status__c = 'Published',
      Published_Date__c = System.now()
    );
    update form;
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
      LIMIT 1
    ];

    if (version.Is_Active__c) {
      throw new AuraHandledException('Cannot delete a published version.');
    }

    delete version;
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
    insert newPages;

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
    insert newSections;

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
      insert newElements;
    }
  }
}
