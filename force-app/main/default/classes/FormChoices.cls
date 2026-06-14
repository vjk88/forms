/**
 * Design-time picklist for the Form Player's "Form" property in Lightning App
 * Builder. Lists active (published) forms by name; the stored value is the
 * Form Id. Referenced from formPlayer.js-meta.xml via datasource="apex://FormChoices".
 */
global with sharing class FormChoices extends VisualEditor.DynamicPickList {
  global override VisualEditor.DataRow getDefaultValue() {
    return null;
  }

  global override VisualEditor.DynamicPickListRows getValues() {
    VisualEditor.DynamicPickListRows rows = new VisualEditor.DynamicPickListRows();
    for (Form__c f : [
      SELECT Id, Name, Primary_Context_Object__c
      FROM Form__c
      WHERE Status__c = 'Published'
      WITH USER_MODE
      ORDER BY Name ASC
    ]) {
      String label = String.isBlank(f.Primary_Context_Object__c)
        ? f.Name
        : f.Name + ' (' + f.Primary_Context_Object__c + ')';
      rows.addRow(new VisualEditor.DataRow(label, (String) f.Id));
    }
    return rows;
  }
}