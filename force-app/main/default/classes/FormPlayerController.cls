/**
 * Runtime controller for the Form Player. Returns the active published
 * version's layout for a given form so the player can render it.
 */
public with sharing class FormPlayerController {
  public class FormDef {
    @AuraEnabled
    public Id formId;
    @AuraEnabled
    public String formName;
    @AuraEnabled
    public String primaryObject;
    @AuraEnabled
    public String formType;
    @AuraEnabled
    public String layoutJson;
    @AuraEnabled
    public Boolean hasActiveVersion;
    @AuraEnabled
    public String allowedAdapters;
  }

  /**
   * Running-user + profile context for "Advanced" visibility filters
   * ($User.* and $Profile.Name). Static for the session.
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, String> getUserContext() {
    Map<String, String> ctx = new Map<String, String>();
    ctx.put('$User.Id', UserInfo.getUserId());
    ctx.put('$User.Name', UserInfo.getName());
    ctx.put('$User.FirstName', UserInfo.getFirstName());
    ctx.put('$User.LastName', UserInfo.getLastName());
    ctx.put('$User.Email', UserInfo.getUserEmail());
    ctx.put('$User.Username', UserInfo.getUserName());
    ctx.put('$User.ProfileId', UserInfo.getProfileId());
    ctx.put('$User.Type', UserInfo.getUserType());
    String profileName = '';
    try {
      List<Profile> profs = [
        SELECT Name
        FROM Profile
        WHERE Id = :UserInfo.getProfileId()
        WITH USER_MODE
        LIMIT 1
      ];
      if (!profs.isEmpty()) {
        profileName = profs[0].Name;
      }
    } catch (Exception ignored) {
      // Profile not readable — leave blank.
    }
    ctx.put('$Profile.Name', profileName);
    return ctx;
  }

  /**
   * Values of the requested fields on the running User record, for the
   * "Current User" visibility source. Only accessible fields are queried
   * (FLS enforced). Returns a map of fieldApiName -> string value.
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, String> getCurrentUserFields(
    List<String> fieldApiNames
  ) {
    Map<String, String> result = new Map<String, String>();
    if (fieldApiNames == null || fieldApiNames.isEmpty()) {
      return result;
    }
    Map<String, Schema.SObjectField> fmap = User.SObjectType.getDescribe()
      .fields.getMap();
    List<String> safe = new List<String>();
    Set<String> seen = new Set<String>();
    for (String f : fieldApiNames) {
      if (String.isBlank(f)) {
        continue;
      }
      String key = f.toLowerCase();
      if (seen.contains(key) || !fmap.containsKey(key)) {
        continue;
      }
      Schema.DescribeFieldResult dfr = fmap.get(key).getDescribe();
      if (!dfr.isAccessible()) {
        continue;
      }
      seen.add(key);
      safe.add(dfr.getName());
    }
    if (safe.isEmpty()) {
      return result;
    }
    Map<String, Object> binds = new Map<String, Object>{
      'uid' => UserInfo.getUserId()
    };
    String soql =
      'SELECT ' +
      String.join(safe, ', ') +
      ' FROM User WHERE Id = :uid LIMIT 1';
    List<User> us = Database.queryWithBinds(
      soql,
      binds,
      AccessLevel.USER_MODE
    );
    if (!us.isEmpty()) {
      for (String f : safe) {
        Object v = us[0].get(f);
        result.put(f, v == null ? '' : String.valueOf(v));
      }
    }
    return result;
  }

  /**
   * This is the internal (authenticated) player controller. Guest/public
   * rendering will be served by a separate, explicitly-elevated controller
   * with its own object/field allowlists when the public adapter is built.
   */
  private static void assertAuthenticated() {
    if (UserInfo.getUserType() == 'Guest') {
      throw new AuraHandledException(
        'This form is not available to guest users.'
      );
    }
  }

  @AuraEnabled
  public static FormDef getActiveForm(Id formId) {
    if (formId == null) {
      throw new AuraHandledException('Form Id is required.');
    }
    // Guests are served by the explicitly-elevated, strictly-gated guest path
    // (published + Public_Guest forms only).
    if (UserInfo.getUserType() == 'Guest') {
      return FormGuestController.getGuestForm(formId);
    }
    assertAuthenticated();

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
      SELECT Layout_Config__c
      FROM Form_Version__c
      WHERE Form__c = :formId AND Is_Active__c = TRUE
      WITH USER_MODE
      ORDER BY Version_Number__c DESC
      LIMIT 1
    ];

    FormDef def = new FormDef();
    def.formId = forms[0].Id;
    def.formName = forms[0].Name;
    def.primaryObject = normalizeObjectName(forms[0].Primary_Context_Object__c);
    def.formType = forms[0].Form_Type__c;
    def.allowedAdapters = forms[0].Allowed_Adapters__c;
    def.hasActiveVersion = !versions.isEmpty();
    def.layoutJson = versions.isEmpty() ? null : versions[0].Layout_Config__c;
    return def;
  }

  public static String normalizeObjectName(String name) {
    if (String.isBlank(name)) return name;
    Schema.SObjectType t = Schema.getGlobalDescribe().get(name.toLowerCase());
    return t == null ? name : t.getDescribe().getName();
  }

  /**
   * Returns the layout for a specific version — used by the builder's
   * Preview to render the in-progress draft.
   */
  @AuraEnabled
  public static FormDef getFormByVersion(Id versionId) {
    assertAuthenticated();
    if (versionId == null) {
      throw new AuraHandledException('Version Id is required.');
    }

    List<Form_Version__c> versions = [
      SELECT
        Layout_Config__c,
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

    FormDef def = new FormDef();
    def.formId = versions[0].Form__r.Id;
    def.formName = versions[0].Form__r.Name;
    def.primaryObject = normalizeObjectName(
      versions[0].Form__r.Primary_Context_Object__c
    );
    def.formType = versions[0].Form__r.Form_Type__c;
    def.allowedAdapters = versions[0].Form__r.Allowed_Adapters__c;
    def.hasActiveVersion = true;
    def.layoutJson = versions[0].Layout_Config__c;
    return def;
  }

  /**
   * Active picklist/multipicklist values for an object, so the player can
   * render fields as radio buttons / dropdowns / checkbox groups using the
   * field's own schema values. Honors FLS via isAccessible().
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, List<Map<String, String>>> getPicklistOptions(
    String objectApiName
  ) {
    assertAuthenticated();
    Map<String, List<Map<String, String>>> result = new Map<String, List<Map<String, String>>>();
    if (String.isBlank(objectApiName)) {
      return result;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      return result;
    }
    for (
      Schema.SObjectField f : t.getDescribe().fields.getMap().values()
    ) {
      Schema.DescribeFieldResult d = f.getDescribe();
      if (!d.isAccessible()) {
        continue;
      }
      Schema.DisplayType dt = d.getType();
      if (
        dt == Schema.DisplayType.Picklist ||
        dt == Schema.DisplayType.MultiPicklist
      ) {
        List<Map<String, String>> opts = new List<Map<String, String>>();
        for (Schema.PicklistEntry pe : d.getPicklistValues()) {
          if (pe.isActive()) {
            opts.add(
              new Map<String, String>{
                'label' => pe.getLabel(),
                'value' => pe.getValue()
              }
            );
          }
        }
        result.put(d.getName(), opts);
      }
    }
    return result;
  }

  /**
   * Shared related-record fetch engine. Returns the requested fields of a
   * single record (by Id) as a map of fieldApiName -> string value, FLS-safe.
   * Powers autofill, one-level relationship visibility, and edit-mode seeding.
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, String> getRecordFields(
    String objectApiName,
    Id recordId,
    List<String> fieldApiNames
  ) {
    assertAuthenticated();
    Map<String, String> result = new Map<String, String>();
    if (
      String.isBlank(objectApiName) ||
      recordId == null ||
      fieldApiNames == null ||
      fieldApiNames.isEmpty()
    ) {
      return result;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      return result;
    }
    Map<String, Schema.SObjectField> fmap = t.getDescribe().fields.getMap();
    List<String> safe = new List<String>();
    Set<String> seen = new Set<String>();
    for (String f : fieldApiNames) {
      if (String.isBlank(f)) {
        continue;
      }
      String key = f.toLowerCase();
      if (seen.contains(key) || !fmap.containsKey(key)) {
        continue;
      }
      Schema.DescribeFieldResult dfr = fmap.get(key).getDescribe();
      if (!dfr.isAccessible()) {
        continue;
      }
      seen.add(key);
      safe.add(dfr.getName());
    }
    if (safe.isEmpty()) {
      return result;
    }
    Map<String, Object> binds = new Map<String, Object>{ 'rid' => recordId };
    String soql =
      'SELECT ' +
      String.join(safe, ', ') +
      ' FROM ' +
      t.getDescribe().getName() +
      ' WHERE Id = :rid LIMIT 1';
    List<SObject> recs = Database.queryWithBinds(
      soql,
      binds,
      AccessLevel.USER_MODE
    );
    if (!recs.isEmpty()) {
      for (String f : safe) {
        Object v = recs[0].get(f);
        result.put(f, v == null ? '' : String.valueOf(v));
      }
    }
    return result;
  }

  /**
   * For the builder's visibility & autofill editors: the single-target lookup
   * fields on an object, each with its target object's selectable fields,
   * enabling one-level relationship traversal (e.g. Account.Type).
   */
  @AuraEnabled(cacheable=true)
  public static List<LookupTarget> getLookupTargets(String objectApiName) {
    assertAuthenticated();
    List<LookupTarget> out = new List<LookupTarget>();
    if (String.isBlank(objectApiName)) {
      return out;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      return out;
    }
    Set<Schema.DisplayType> supported = new Set<Schema.DisplayType>{
      Schema.DisplayType.String, Schema.DisplayType.TextArea,
      Schema.DisplayType.Phone, Schema.DisplayType.Email,
      Schema.DisplayType.Url, Schema.DisplayType.Boolean,
      Schema.DisplayType.Currency, Schema.DisplayType.Double,
      Schema.DisplayType.Integer, Schema.DisplayType.Date,
      Schema.DisplayType.DateTime, Schema.DisplayType.Picklist,
      Schema.DisplayType.Percent
    };
    for (
      Schema.SObjectField f : t.getDescribe().fields.getMap().values()
    ) {
      Schema.DescribeFieldResult d = f.getDescribe();
      if (
        d.getType() != Schema.DisplayType.Reference ||
        !d.isAccessible() ||
        d.getReferenceTo().size() != 1
      ) {
        continue; // single-target, accessible lookups only
      }
      Schema.SObjectType target = d.getReferenceTo()[0];
      Schema.DescribeSObjectResult td = target.getDescribe();
      if (!td.isAccessible()) {
        continue;
      }
      LookupTarget lt = new LookupTarget();
      lt.lookupField = d.getName();
      lt.relationshipName = d.getRelationshipName();
      lt.targetObject = td.getName();
      lt.targetLabel = td.getLabel();
      lt.fields = new List<Map<String, String>>();
      for (
        Schema.SObjectField tf : td.fields.getMap().values()
      ) {
        Schema.DescribeFieldResult tfd = tf.getDescribe();
        String n = tfd.getName().toLowerCase();
        if (
          !tfd.isAccessible() ||
          !supported.contains(tfd.getType()) ||
          n == 'isdeleted' ||
          n == 'systemmodstamp'
        ) {
          continue;
        }
        lt.fields.add(
          new Map<String, String>{
            'apiName' => tfd.getName(),
            'label' => tfd.getLabel(),
            'type' => tfd.getType().name()
          }
        );
      }
      out.add(lt);
    }
    return out;
  }

  public class LookupTarget {
    @AuraEnabled
    public String lookupField;
    @AuraEnabled
    public String relationshipName;
    @AuraEnabled
    public String targetObject;
    @AuraEnabled
    public String targetLabel;
    @AuraEnabled
    public List<Map<String, String>> fields;
  }
}
