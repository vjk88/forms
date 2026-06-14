/**
 * Atomic submission engine for the Form Player.
 *
 * Saves a form's primary record together with any related-list ("repeater")
 * child records in a SINGLE transaction: the parent is inserted/updated first
 * so its Id can stamp each child's linking lookup, then children are inserted.
 * If ANY row fails (FLS, validation rule, required, etc.) the whole thing is
 * rolled back to a savepoint — no orphaned parents.
 *
 * Errors are returned (not thrown) as a structured list mapped back to the
 * exact parent / child-block / row / field, so the player can show them inline
 * the same way lightning-record-edit-form's onerror does for simple forms.
 *
 * Security: WITH USER_MODE / `AccessLevel.USER_MODE` enforces CRUD + FLS for
 * the running user; field writes are pre-filtered to createable/updateable.
 * Guests are rejected here — the public/guest submit path is a separate,
 * explicitly-elevated controller (mirrors FormPlayerController).
 */
public with sharing class FormSubmitController {
  // ---- Inputs ------------------------------------------------------------

  /** One related-list repeater block: a child object + the rows to create. */
  public class ChildBlock {
    @AuraEnabled
    public String childObjectApiName;
    @AuraEnabled
    public String linkingField; // lookup field on the child pointing to parent
    @AuraEnabled
    public List<Map<String, Object>> rows;
  }

  // ---- Outputs -----------------------------------------------------------

  public class SubmitResult {
    @AuraEnabled
    public Boolean success;
    @AuraEnabled
    public Id recordId; // parent record id (on success)
    @AuraEnabled
    public List<RowError> errors;

    public SubmitResult() {
      this.success = false;
      this.errors = new List<RowError>();
    }
  }

  /** A single failure, routed back to where the player should display it. */
  public class RowError {
    @AuraEnabled
    public String scope; // 'parent' | 'child'
    @AuraEnabled
    public Integer blockIndex; // child: index into the children[] input
    @AuraEnabled
    public Integer rowIndex; // child: index into that block's rows[]
    @AuraEnabled
    public List<String> fields; // affected field api names (may be empty)
    @AuraEnabled
    public String message;
  }

  // Internal: keeps each built child SObject aligned to its origin row so a
  // SaveResult at position i can be mapped back to (block, row).
  private class ChildRef {
    Integer blockIndex;
    Integer rowIndex;
  }

  // ---- Entry point -------------------------------------------------------

  /**
   * @param objectApiName    primary object api name
   * @param parentValues     field api name -> raw value (from the player)
   * @param existingRecordId null = insert, set = update (edit mode)
   * @param children         related-list repeater blocks (may be null/empty)
   */
  @AuraEnabled
  public static SubmitResult submitForm(
    String objectApiName,
    Map<String, Object> parentValues,
    Id existingRecordId,
    List<ChildBlock> children
  ) {
    assertAuthenticated();
    return submitCore(objectApiName, parentValues, existingRecordId, children);
  }

  /**
   * Same engine without the guest assert — the entry points own audience
   * gating: submitForm (authenticated) above, and FormViewerGuest's
   * hard-gated guest path (Published + Public_Guest, insert-only). Always
   * AccessLevel.USER_MODE, so the RUNNING user's CRUD/FLS applies — for a
   * guest that is the guest profile's create access, nothing more.
   */
  public static SubmitResult submitCore(
    String objectApiName,
    Map<String, Object> parentValues,
    Id existingRecordId,
    List<ChildBlock> children
  ) {
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('A primary object is required.');
    }

    SubmitResult result = new SubmitResult();
    System.Savepoint sp = Database.setSavepoint();
    try {
      // 1) Build + save the parent so we have its Id for the children.
      Boolean isUpdate = existingRecordId != null;
      SObject parent = buildSObject(
        objectApiName,
        parentValues,
        existingRecordId,
        isUpdate
      );

      Database.SaveResult parentSr = isUpdate
        ? Database.update(parent, false, AccessLevel.USER_MODE)
        : Database.insert(parent, false, AccessLevel.USER_MODE);

      if (!parentSr.isSuccess()) {
        Database.rollback(sp);
        result.errors = parentErrors(parentSr);
        return result;
      }
      Id parentId = parentSr.getId();

      // 2) Build all child rows, stamping the linking lookup with the parent.
      List<SObject> childRecords = new List<SObject>();
      List<ChildRef> refs = new List<ChildRef>();

      if (children != null) {
        for (Integer b = 0; b < children.size(); b++) {
          ChildBlock block = children[b];
          if (block == null || block.rows == null || block.rows.isEmpty()) {
            continue;
          }
          if (String.isBlank(block.childObjectApiName) ||
              String.isBlank(block.linkingField)) {
            continue;
          }
          for (Integer r = 0; r < block.rows.size(); r++) {
            Map<String, Object> row = block.rows[r];
            if (isRowEmpty(row)) {
              continue; // skip blank "add another" slots
            }
            SObject child = buildSObject(
              block.childObjectApiName,
              row,
              null,
              false
            );
            child.put(
              normalizeField(block.childObjectApiName, block.linkingField),
              parentId
            );
            childRecords.add(child);
            ChildRef ref = new ChildRef();
            ref.blockIndex = b;
            ref.rowIndex = r;
            refs.add(ref);
          }
        }
      }

      // 3) Save the children (bulk). Roll the whole transaction back if any fail.
      if (!childRecords.isEmpty()) {
        Database.SaveResult[] srs = Database.insert(
          childRecords,
          false,
          AccessLevel.USER_MODE
        );
        List<RowError> childErrs = childErrors(srs, refs);
        if (!childErrs.isEmpty()) {
          Database.rollback(sp);
          result.errors = childErrs;
          return result;
        }
      }

      result.success = true;
      result.recordId = parentId;
      return result;
    } catch (AuraHandledException e) {
      Database.rollback(sp);
      throw e;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException(e.getMessage());
    }
  }

  // ---- Builders ----------------------------------------------------------

  /**
   * Build an SObject from a {fieldApiName -> rawValue} map, coercing each value
   * to the field's type and skipping fields the running user cannot write.
   */
  private static SObject buildSObject(
    String objectApiName,
    Map<String, Object> values,
    Id existingId,
    Boolean isUpdate
  ) {
    Schema.SObjectType t = typeForName(objectApiName);
    Map<String, Schema.SObjectField> fmap = t.getDescribe().fields.getMap();
    SObject rec = t.newSObject();
    if (existingId != null) {
      rec.put('Id', existingId);
    }
    if (values == null) {
      return rec;
    }
    for (String key : values.keySet()) {
      if (String.isBlank(key)) {
        continue;
      }
      Schema.SObjectField sf = fmap.get(key.toLowerCase());
      if (sf == null) {
        continue;
      }
      Schema.DescribeFieldResult dfr = sf.getDescribe();
      // FLS: only set fields the user may write in this mode.
      if (isUpdate ? !dfr.isUpdateable() : !dfr.isCreateable()) {
        continue;
      }
      rec.put(dfr.getName(), coerceValue(dfr, values.get(key)));
    }
    return rec;
  }

  /** Coerce a raw (usually string) value into the field's Apex type. */
  private static Object coerceValue(Schema.DescribeFieldResult dfr, Object raw) {
    if (raw == null) {
      return null;
    }
    String s = String.valueOf(raw);
    if (String.isBlank(s)) {
      return null;
    }
    switch on dfr.getType() {
      when Boolean {
        return (raw instanceof Boolean) ? raw : Boolean.valueOf(s);
      }
      when Date {
        // JSON.deserialize handles ISO 'yyyy-MM-dd' from native date inputs.
        return (Date) JSON.deserialize('"' + s + '"', Date.class);
      }
      when Datetime {
        return (Datetime) JSON.deserialize('"' + s + '"', Datetime.class);
      }
      when Integer {
        return Integer.valueOf(s);
      }
      when Double, Currency, Percent {
        return Decimal.valueOf(s);
      }
      when Reference {
        return Id.valueOf(s);
      }
      when else {
        // String, TextArea, Email, Phone, Url, Picklist, MultiPicklist (the
        // player joins multi-select values with ';' already), etc.
        return s;
      }
    }
  }

  // ---- Error mapping -----------------------------------------------------

  private static List<RowError> parentErrors(Database.SaveResult sr) {
    List<RowError> out = new List<RowError>();
    for (Database.Error e : sr.getErrors()) {
      RowError re = new RowError();
      re.scope = 'parent';
      re.fields = e.getFields();
      re.message = e.getMessage();
      out.add(re);
    }
    return out;
  }

  private static List<RowError> childErrors(
    Database.SaveResult[] srs,
    List<ChildRef> refs
  ) {
    List<RowError> out = new List<RowError>();
    for (Integer i = 0; i < srs.size(); i++) {
      if (srs[i].isSuccess()) {
        continue;
      }
      ChildRef ref = refs[i];
      for (Database.Error e : srs[i].getErrors()) {
        RowError re = new RowError();
        re.scope = 'child';
        re.blockIndex = ref.blockIndex;
        re.rowIndex = ref.rowIndex;
        re.fields = e.getFields();
        re.message = e.getMessage();
        out.add(re);
      }
    }
    return out;
  }

  // ---- Helpers -----------------------------------------------------------

  private static Boolean isRowEmpty(Map<String, Object> row) {
    if (row == null || row.isEmpty()) {
      return true;
    }
    for (Object v : row.values()) {
      if (v != null && String.isNotBlank(String.valueOf(v))) {
        return false;
      }
    }
    return true;
  }

  private static Schema.SObjectType typeForName(String objectApiName) {
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      throw new AuraHandledException('Unknown object: ' + objectApiName);
    }
    return t;
  }

  /** Resolve a field's proper-case api name (defensive against casing). */
  private static String normalizeField(String objectApiName, String fieldName) {
    Schema.SObjectField sf = typeForName(objectApiName)
      .getDescribe()
      .fields.getMap()
      .get(fieldName.toLowerCase());
    return sf == null ? fieldName : sf.getDescribe().getName();
  }

  private static void assertAuthenticated() {
    if (UserInfo.getUserType() == 'Guest') {
      throw new AuraHandledException(
        'This form is not available to guest users.'
      );
    }
  }
}