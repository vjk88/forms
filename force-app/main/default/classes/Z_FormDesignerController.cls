public with sharing class Z_FormDesignerController {
  
  public class OptionDTO implements Comparable {
    @AuraEnabled public String label;
    @AuraEnabled public String value;

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

  public class FieldDTO implements Comparable {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type;
    @AuraEnabled public Boolean required;
    @AuraEnabled public Boolean isNameField;

    public FieldDTO(String apiName, String label, String type, Boolean required, Boolean isNameField) {
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
    @AuraEnabled public String name;
    @AuraEnabled public String childObject;
    @AuraEnabled public String childObjectLabel;
    @AuraEnabled public String fieldName;

    public RelationshipDTO(String name, String childObject, String childObjectLabel, String fieldName) {
      this.name = name;
      this.childObject = childObject;
      this.childObjectLabel = childObjectLabel;
      this.fieldName = fieldName;
    }

    public Integer compareTo(Object other) {
      RelationshipDTO o = (RelationshipDTO) other;
      String thisLabel = (this.childObjectLabel == null) ? '' : this.childObjectLabel.toLowerCase();
      String otherLabel = (o.childObjectLabel == null) ? '' : o.childObjectLabel.toLowerCase();
      return thisLabel.compareTo(otherLabel);
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<OptionDTO> getOrgObjects() {
    Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
    List<OptionDTO> options = new List<OptionDTO>();

    for (String apiName : globalDescribe.keySet()) {
      try {
        Schema.DescribeSObjectResult d = globalDescribe.get(apiName).getDescribe();
        if (
          d.isCreateable() &&
          d.isQueryable() &&
          d.isAccessible() &&
          d.isUpdateable() &&
          !d.isDeprecatedAndHidden() &&
          (d.isCustom() || isAllowedStandardObject(apiName))
        ) {
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

  @AuraEnabled(cacheable=true)
  public static List<FieldDTO> getObjectFields(String objectApiName) {
    if (String.isBlank(objectApiName)) {
      return new List<FieldDTO>();
    }

    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
    if (sObjType == null) {
      return new List<FieldDTO>();
    }

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

  private static Boolean isSystemField(Schema.DescribeFieldResult fd) {
    String n = fd.getName().toLowerCase();
    return n == 'isdeleted' || n == 'systemmodstamp';
  }

  @AuraEnabled(cacheable=true)
  public static List<RelationshipDTO> getChildRelationships(String objectApiName) {
    if (String.isBlank(objectApiName)) {
      return new List<RelationshipDTO>();
    }

    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
    if (sObjType == null) {
      return new List<RelationshipDTO>();
    }

    List<RelationshipDTO> result = new List<RelationshipDTO>();
    for (Schema.ChildRelationship cr : sObjType.getDescribe().getChildRelationships()) {
      if (cr.getRelationshipName() == null) {
        continue;
      }

      Schema.DescribeSObjectResult childDesc = cr.getChildSObject().getDescribe();
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
  public static List<Z_Form__c> getAllForms() {
    List<Z_Form__c> forms = [
      SELECT
        Id,
        Name,
        Z_Primary_Object__c,
        Z_Form_Type__c,
        Z_Status__c,
        (
          SELECT
            Id,
            Name,
            Z_Version_Number__c,
            Z_Is_Active__c,
            Z_Published_Date__c
          FROM Z_Form_Versions__r
          ORDER BY Z_Version_Number__c DESC
        )
      FROM Z_Form__c
      WITH USER_MODE
      ORDER BY Name ASC
    ];

    // Normalize lowercase-stored object names to proper case
    Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
    for (Z_Form__c f : forms) {
      if (!String.isBlank(f.Z_Primary_Object__c)) {
        Schema.SObjectType t = gd.get(f.Z_Primary_Object__c.toLowerCase());
        if (t != null) {
          f.Z_Primary_Object__c = t.getDescribe().getName();
        }
      }
    }
    return forms;
  }

  @AuraEnabled(cacheable=true)
  public static List<Z_Form_Version__c> getFormVersions(Id formId) {
    if (formId == null) {
      return new List<Z_Form_Version__c>();
    }
    return [
      SELECT
        Id,
        Name,
        Z_Version_Number__c,
        Z_Is_Active__c,
        Z_Published_Date__c
      FROM Z_Form_Version__c
      WHERE Z_Form__c = :formId
      WITH USER_MODE
      ORDER BY Z_Version_Number__c DESC
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

    String type = String.isBlank(formType) ? 'Form' : formType;
    Boolean isForm = (type == 'Form');

    if (isForm && String.isBlank(objectApiName)) {
      throw new AuraHandledException('A primary object is required for a Form.');
    }

    if (!String.isBlank(objectApiName)) {
      Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
      if (sObjType == null) {
        throw new AuraHandledException('Invalid object selected.');
      }
    }

    String resolvedLayout = String.isBlank(layoutMode) ? 'Single_Page' : layoutMode;
    String layoutVariant = resolvedLayout == 'Single_Page' ? 'single-page' : 'multi-page';

    Savepoint sp = Database.setSavepoint();
    try {
      Z_Form__c form = new Z_Form__c();
      form.Name = formName.trim();
      form.Z_Primary_Object__c = String.isBlank(objectApiName) ? null : objectApiName;
      form.Z_Form_Type__c = type;
      form.Z_Status__c = 'Draft';
      insert as user form;

      Z_Form_Version__c version = new Z_Form_Version__c();
      version.Z_Form__c = form.Id;
      version.Z_Version_Number__c = 1;
      version.Z_Is_Active__c = false;
      version.Z_Published_Date__c = System.now();
      
      // Seed a default, valid blank Form Definition JSON
      Map<String, Object> defaultDef = new Map<String, Object>{
        'schemaVersion' => '2.0',
        'layout' => new Map<String, Object>{
          'variant' => layoutVariant,
          'cardStyle' => 'flat',
          'header' => new Map<String, Object>{
            'visible' => true,
            'title' => form.Name,
            'subtitle' => 'Please fill out this form',
            'showLogo' => false,
            'logoUrl' => '',
            'alignment' => 'left'
          }
        },
        'theme' => new Map<String, Object>{
          'global' => new Map<String, Object>{
            'backgroundColor' => '#ffffff',
            'borderRadius' => '8px',
            'fontFamily' => 'sans-serif'
          }
        },
        'pages' => new List<Object>{
          new Map<String, Object>{
            'id' => 'page-' + System.currentTimeMillis() + '-0',
            'name' => 'Page 1',
            'showInProgress' => true,
            'sections' => new List<Object>()
          }
        }
      };
      version.Z_Form_Definition_JSON__c = JSON.serialize(defaultDef);
      insert as user version;

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

    List<Z_Form_Version__c> existingDrafts = [
      SELECT Id
      FROM Z_Form_Version__c
      WHERE Z_Form__c = :formId AND Z_Is_Active__c = FALSE
      WITH USER_MODE
      LIMIT 1
    ];
    if (!existingDrafts.isEmpty()) {
      throw new AuraHandledException('A draft version already exists.');
    }

    List<Z_Form_Version__c> activeVersions = [
      SELECT Id, Z_Version_Number__c, Z_Form_Definition_JSON__c, Z_Schema_Snapshot__c
      FROM Z_Form_Version__c
      WHERE Z_Form__c = :formId AND Z_Is_Active__c = TRUE
      WITH USER_MODE
      LIMIT 1
    ];
    if (activeVersions.isEmpty()) {
      throw new AuraHandledException('No active version found to clone.');
    }

    Z_Form_Version__c activeFull = activeVersions[0];

    AggregateResult[] agg = [
      SELECT MAX(Z_Version_Number__c) maxVer
      FROM Z_Form_Version__c
      WHERE Z_Form__c = :formId
      WITH USER_MODE
    ];
    Decimal nextVersion = ((Decimal) agg[0].get('maxVer')) + 1;

    try {
      Z_Form_Version__c draft = new Z_Form_Version__c();
      draft.Z_Form__c = formId;
      draft.Z_Version_Number__c = nextVersion;
      draft.Z_Is_Active__c = false;
      draft.Z_Form_Definition_JSON__c = activeFull.Z_Form_Definition_JSON__c;
      draft.Z_Schema_Snapshot__c = activeFull.Z_Schema_Snapshot__c;
      draft.Z_Published_Date__c = System.now();
      insert as user draft;

      return new Map<String, Object>{
        'versionId' => draft.Id,
        'versionNumber' => draft.Z_Version_Number__c
      };
    } catch (Exception e) {
      throw new AuraHandledException('Error creating draft: ' + e.getMessage());
    }
  }

  @AuraEnabled
  public static void publishVersion(Id versionId) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    Z_Form_Version__c version = [
      SELECT Id, Z_Is_Active__c, Z_Form__c, Z_Form_Definition_JSON__c, Z_Schema_Snapshot__c
      FROM Z_Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];

    if (version.Z_Is_Active__c) {
      throw new AuraHandledException('This version is already published.');
    }
    if (String.isBlank(version.Z_Form_Definition_JSON__c)) {
      throw new AuraHandledException('Add and save form content before publishing.');
    }

    List<Z_Form__c> forms = [
      SELECT Id, Z_Primary_Object__c
      FROM Z_Form__c
      WHERE Id = :version.Z_Form__c
      WITH USER_MODE
      LIMIT 1
    ];
    String objectApi = forms.isEmpty() ? null : forms[0].Z_Primary_Object__c;
    String snapshot = String.isNotBlank(version.Z_Schema_Snapshot__c)
      ? version.Z_Schema_Snapshot__c
      : buildSchemaSnapshot(objectApi, version.Z_Form_Definition_JSON__c);

    version.Z_Is_Active__c = true;
    version.Z_Published_Date__c = System.now();
    version.Z_Schema_Snapshot__c = snapshot;

    Z_Form__c form = new Z_Form__c(
      Id = version.Z_Form__c,
      Z_Status__c = 'Published',
      Z_Active_Version__c = version.Id
    );

    Savepoint sp = Database.setSavepoint();
    try {
      update as system version;
      update as system form;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error publishing version: ' + e.getMessage());
    }
  }

  private static String buildSchemaSnapshot(String objectApiName, String layoutJson) {
    Map<String, Object> snap = new Map<String, Object>{
      'object' => objectApiName,
      'capturedAt' => String.valueOf(System.now())
    };
    Set<String> fieldApis = new Set<String>();
    try {
      Map<String, Object> layout = (Map<String, Object>) JSON.deserializeUntyped(layoutJson);
      Object pages = layout.get('pages');
      if (pages instanceof List<Object>) {
        for (Object po : (List<Object>) pages) {
          Map<String, Object> page = (Map<String, Object>) po;
          collectFieldApis(page.get('sections'), fieldApis);
        }
      }
    } catch (Exception e) {
      // Ignore parsing errors and keep partial snapshot
    }

    Map<String, Object> fieldsMap = new Map<String, Object>();
    if (String.isNotBlank(objectApiName)) {
      Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName.toLowerCase());
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
          if (String.isNotBlank(fapi) && (type == null || type == 'Field')) {
            out.add(fapi);
          }
        }
      }
      collectFieldApis(section.get('relatedSections'), out);
    }
  }

  @AuraEnabled
  public static void deleteDraftVersion(Id versionId) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    Z_Form_Version__c version = [
      SELECT Id, Z_Is_Active__c
      FROM Z_Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];

    if (version.Z_Is_Active__c) {
      throw new AuraHandledException('Cannot delete a published version.');
    }

    try {
      delete as user version;
    } catch (Exception e) {
      throw new AuraHandledException('Error deleting draft version: ' + e.getMessage());
    }
  }

  @AuraEnabled
  public static void saveFormLayout(Id versionId, String layoutJson) {
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    List<Z_Form_Version__c> versions = [
      SELECT Id, Z_Is_Active__c
      FROM Z_Form_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (versions.isEmpty()) {
      throw new AuraHandledException('Version not found.');
    }
    if (versions[0].Z_Is_Active__c) {
      throw new AuraHandledException('Published versions are read-only. Create a new draft to edit.');
    }

    versions[0].Z_Form_Definition_JSON__c = layoutJson;

    try {
      update as user versions[0];
    } catch (Exception e) {
      throw new AuraHandledException('Error saving form layout: ' + e.getMessage());
    }
  }

  @AuraEnabled(cacheable=true)
  public static String getFormLayout(Id versionId) {
    if (versionId == null) {
      return null;
    }
    Z_Form_Version__c version = [
      SELECT Z_Form_Definition_JSON__c 
      FROM Z_Form_Version__c 
      WHERE Id = :versionId
      WITH USER_MODE
    ];
    return version.Z_Form_Definition_JSON__c;
  }

  @AuraEnabled
  public static String generateAISpec(String primaryObject, String existingJson, String prompt) {
    if (String.isBlank(prompt)) {
      throw new AuraHandledException('Prompt is required.');
    }
    
    String objectFieldsDesc = getObjectFieldSummary(primaryObject);
    String responseJson = '{}';
    try {
        String endpoint = Url.getOrgDomainUrl().toExternalForm() + '/services/data/v61.0/einstein/prompt-templates/Form_Design_Generator/generations';
        HttpRequest httpReq = new HttpRequest();
        httpReq.setEndpoint(endpoint);
        httpReq.setMethod('POST');
        httpReq.setHeader('Authorization', 'OAuth ' + UserInfo.getSessionId());
        httpReq.setHeader('Content-Type', 'application/json');
        
        Map<String, Object> templateInput = new Map<String, Object>();
        templateInput.put('User_Style_Request', prompt);
        templateInput.put('SObject_Fields', objectFieldsDesc);
        templateInput.put('Existing_JSON', String.isNotBlank(existingJson) ? existingJson : '{}');
        
        Map<String, Object> requestBody = new Map<String, Object>();
        requestBody.put('templateInput', templateInput);
        httpReq.setBody(JSON.serialize(requestBody));
        
        Http h = new Http();
        HttpResponse httpRes = h.send(httpReq);
        
        if (httpRes.getStatusCode() == 200) {
            Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(httpRes.getBody());
            responseJson = (String) responseMap.get('generationText');
        } else {
            responseJson = generateMockJSON(primaryObject, prompt);
        }
    } catch (Exception e) {
        responseJson = generateMockJSON(primaryObject, prompt);
    }
    
    try {
        Map<String, Object> validation = (Map<String, Object>) JSON.deserializeUntyped(responseJson);
        if (validation.containsKey('layout') || validation.containsKey('theme')) {
            return responseJson;
        }
    } catch (Exception e) {
        throw new AuraHandledException('AI generated invalid JSON: ' + e.getMessage());
    }
    return responseJson;
  }
  
  private static String getObjectFieldSummary(String sObjectType) {
      if (String.isBlank(sObjectType)) return '';
      Schema.SObjectType targetType = Schema.getGlobalDescribe().get(sObjectType);
      if (targetType == null) return '';
      
      List<String> fieldDescs = new List<String>();
      Map<String, Schema.SObjectField> fieldsMap = targetType.getDescribe().fields.getMap();
      for (String key : fieldsMap.keySet()) {
          Schema.DescribeFieldResult dfr = fieldsMap.get(key).getDescribe();
          if (dfr.isCreateable() || dfr.isUpdateable()) {
              fieldDescs.add(dfr.getName() + ' (' + dfr.getType().name() + ')');
          }
      }
      return String.join(fieldDescs, ', ');
  }

  private static String generateMockJSON(String sObjectType, String prompt) {
      Boolean isDark = prompt.toLowerCase().contains('dark');
      String bg = isDark ? '#0f172a' : '#ffffff';
      String text = isDark ? '#f8fafc' : '#1e293b';
      String inputBg = isDark ? '#1e293b' : '#f8fafc';
      String accent = prompt.toLowerCase().contains('pink') ? '#ec4899' : 
                     (prompt.toLowerCase().contains('emerald') || prompt.toLowerCase().contains('green') ? '#10b981' : '#0176d3');
      String cardStyle = prompt.toLowerCase().contains('elevated') ? 'elevated' : 'flat';
      String layoutMode = prompt.toLowerCase().contains('split') ? 'split' : 'classic';

      return '{' +
          '"layout": {' +
              '"variant": "' + layoutMode + '",' +
              '"cardStyle": "' + cardStyle + '",' +
              '"header": {' +
                  '"title": "AI Styled Form for ' + sObjectType + '",' +
                  '"subtitle": "Styled automatically based on: ' + prompt.replace('"', '\\"') + '"' +
              '}' +
          '},' +
          '"theme": {' +
              '"accent": "' + accent + '",' +
              '"surface": "' + bg + '",' +
              '"pageBg": "' + (isDark ? '#020617' : '#f8fafc') + '",' +
              '"colors": {' +
                  '"bg": "' + bg + '",' +
                  '"text": "' + text + '",' +
                  '"inputBg": "' + inputBg + '",' +
                  '"inputBorder": "#cbd5e1",' +
                  '"label": "#475569"' +
              '},' +
              '"typography": {' +
                  '"fontFamily": "\'Inter\', sans-serif",' +
                  '"borderRadius": "8px"' +
              '}' +
          '}' +
      '}';
  }
}
