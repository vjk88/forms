/**
 * Seed-field describe for the creation wizard (PHASE2_WORKPLAN T2.5 /
 * CREATION_WIZARD §7). Returns a small, honest set of fields so the wizard's
 * live preview shows real labels + control types the moment an object is
 * picked — no record data, only schema metadata.
 *
 * USER_MODE-equivalent: every field is gated by isAccessible() + the relevant
 * createability, so a user only ever sees fields they could actually fill.
 * Cacheable: N preview re-renders share one describe per object.
 */
public with sharing class FormObjectDescribeController {
  public class SeedField {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type; // Schema.DisplayType name
    @AuraEnabled public Boolean required;
    @AuraEnabled public List<String> picklistSample; // up to 3 active values
  }

  // Control types the wizard preview can render honestly. Anything else
  // (compound parents, base64, etc.) is skipped so the preview never lies.
  private static final Set<Schema.DisplayType> SUPPORTED = new Set<Schema.DisplayType>{
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

  private static final Integer CAP = 6;
  private static final Integer MIN = 3;

  /**
   * Pick order (CREATION_WIZARD §7): name field → required+createable customs
   * → required+createable standards → top createable standards (padding to
   * MIN). Capped at CAP. Returns [] on bad/inaccessible object so the wizard
   * falls back to its neutral skeleton without erroring.
   */
  @AuraEnabled(cacheable=true)
  public static List<SeedField> getSeedFields(String objectApiName) {
    List<SeedField> out = new List<SeedField>();
    if (String.isBlank(objectApiName)) {
      return out;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe()
      .get(objectApiName.toLowerCase());
    if (t == null) {
      return out;
    }
    Schema.DescribeSObjectResult objDesc = t.getDescribe();
    if (!objDesc.isAccessible() || !objDesc.isCreateable()) {
      return out;
    }
    Map<String, Schema.SObjectField> fmap = objDesc.fields.getMap();

    SeedField nameField;
    List<SeedField> requiredCustom = new List<SeedField>();
    List<SeedField> requiredStandard = new List<SeedField>();
    List<SeedField> otherCreateable = new List<SeedField>();

    for (Schema.SObjectField sf : fmap.values()) {
      Schema.DescribeFieldResult fd = sf.getDescribe();
      if (!fd.isAccessible() || !fd.isCreateable()) {
        continue;
      }
      if (!SUPPORTED.contains(fd.getType())) {
        continue;
      }
      // Builder concerns / compound children / system fields — never seeds.
      if (String.isNotBlank(fd.getCompoundFieldName())) {
        continue;
      }
      String n = fd.getName();
      String nl = n.toLowerCase();
      if (nl == 'ownerid' || nl == 'recordtypeid') {
        continue;
      }

      SeedField item = toSeed(fd);
      if (fd.isNameField()) {
        // Auto-number names aren't fillable; skip them as a seed.
        if (!fd.isAutoNumber()) {
          nameField = item;
        }
        continue;
      }
      if (item.required) {
        if (n.endsWith('__c')) {
          requiredCustom.add(item);
        } else {
          requiredStandard.add(item);
        }
      } else {
        otherCreateable.add(item);
      }
    }

    if (nameField != null) {
      out.add(nameField);
    }
    addUpTo(out, requiredCustom, CAP);
    addUpTo(out, requiredStandard, CAP);
    // Pad with ordinary createable fields until we hit MIN (or run out).
    if (out.size() < MIN) {
      addUpTo(out, otherCreateable, CAP);
    }
    return out.size() > CAP ? new List<SeedField>(slice(out, CAP)) : out;
  }

  private static SeedField toSeed(Schema.DescribeFieldResult fd) {
    SeedField s = new SeedField();
    s.apiName = fd.getName();
    s.label = fd.getLabel();
    s.type = fd.getType().name();
    // "Required" = must be supplied on create (not nillable, no default).
    s.required = !fd.isNillable() && !fd.isDefaultedOnCreate();
    s.picklistSample = new List<String>();
    Schema.DisplayType dt = fd.getType();
    if (dt == Schema.DisplayType.Picklist || dt == Schema.DisplayType.MultiPicklist) {
      for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
        if (pe.isActive()) {
          s.picklistSample.add(pe.getLabel());
          if (s.picklistSample.size() == 3) {
            break;
          }
        }
      }
    }
    return s;
  }

  private static void addUpTo(
    List<SeedField> target,
    List<SeedField> source,
    Integer cap
  ) {
    for (SeedField s : source) {
      if (target.size() >= cap) {
        return;
      }
      target.add(s);
    }
  }

  private static List<SeedField> slice(List<SeedField> src, Integer n) {
    List<SeedField> r = new List<SeedField>();
    for (Integer i = 0; i < n && i < src.size(); i++) {
      r.add(src[i]);
    }
    return r;
  }
}
