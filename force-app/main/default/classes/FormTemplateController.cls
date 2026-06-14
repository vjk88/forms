/**
 * CRUD for saved, reusable form templates (Form_Template__c) — the "custom
 * templates" half of gallery-first creation. The whole template definition
 * (body, layout spec, theme, custom CSS, metadata) is one JSON blob in
 * Definition__c, so adding a template property never needs a schema change.
 *
 * with sharing + USER_MODE throughout. Any embedded Layout_Spec is validated
 * by FormLayoutSpecValidator before persistence (single-writer invariant).
 */
public with sharing class FormTemplateController {
  public class TemplateDTO {
    @AuraEnabled public Id id;
    @AuraEnabled public String name;
    @AuraEnabled public String category;
    @AuraEnabled public String definition; // JSON blob (LWC parses)
  }

  /** Active saved templates, newest first. Cacheable. */
  @AuraEnabled(cacheable=true)
  public static List<TemplateDTO> listTemplates() {
    List<TemplateDTO> out = new List<TemplateDTO>();
    for (Form_Template__c t : [
      SELECT Id, Name, Category__c, Definition__c
      FROM Form_Template__c
      WHERE Is_Active__c = TRUE
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
      LIMIT 500
    ]) {
      TemplateDTO d = new TemplateDTO();
      d.id = t.Id;
      d.name = t.Name;
      d.category = t.Category__c;
      d.definition = t.Definition__c;
      out.add(d);
    }
    return out;
  }

  /**
   * Create or update a saved template.
   * @param templateId  null = create, set = update
   * @param name        template name
   * @param category    gallery grouping
   * @param definition  JSON blob (see Definition__c); a `specJson` key inside
   *                    is validated before save.
   * @return the record Id
   */
  @AuraEnabled
  public static Id saveTemplate(
    Id templateId,
    String name,
    String category,
    String definition
  ) {
    if (String.isBlank(name)) {
      throw new AuraHandledException('A template name is required.');
    }
    if (String.isBlank(definition)) {
      throw new AuraHandledException('Template definition is required.');
    }
    validateEmbeddedSpec(definition);

    Form_Template__c rec = new Form_Template__c();
    if (templateId != null) {
      rec.Id = templateId;
    }
    rec.Name = name.trim();
    rec.Category__c = String.isBlank(category) ? 'Custom' : category.trim();
    rec.Definition__c = definition;
    rec.Is_Active__c = true;
    try {
      upsert as user rec;
    } catch (Exception e) {
      throw new AuraHandledException('Could not save template: ' + e.getMessage());
    }
    return rec.Id;
  }

  /** Soft-delete (hide from the gallery). Hard delete stays a data-admin task. */
  @AuraEnabled
  public static void deleteTemplate(Id templateId) {
    if (templateId == null) {
      throw new AuraHandledException('Template Id is required.');
    }
    List<Form_Template__c> recs = [
      SELECT Id, Is_Active__c
      FROM Form_Template__c
      WHERE Id = :templateId
      WITH USER_MODE
      LIMIT 1
    ];
    if (recs.isEmpty()) {
      throw new AuraHandledException('Template not found.');
    }
    recs[0].Is_Active__c = false;
    try {
      update as user recs[0];
    } catch (Exception e) {
      throw new AuraHandledException('Could not delete template: ' + e.getMessage());
    }
  }

  // The definition's embedded specJson goes through the SAME gate as every
  // other Layout_Spec writer — a malformed spec can't be parked in a template.
  private static void validateEmbeddedSpec(String definition) {
    String specJson;
    try {
      Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
        definition
      );
      Object s = parsed.get('specJson');
      if (s instanceof String) {
        specJson = (String) s;
      }
    } catch (Exception e) {
      throw new AuraHandledException('Template definition is not valid JSON.');
    }
    if (String.isNotBlank(specJson)) {
      FormLayoutSpecValidator.Result vr = FormLayoutSpecValidator.validate(
        specJson
      );
      if (!vr.ok) {
        String msg = vr.errors.isEmpty() ? 'invalid' : vr.errors[0].message;
        throw new AuraHandledException('Template layout is invalid: ' + msg);
      }
    }
  }
}
