import { LightningElement, api, track } from "lwc";

const FIELD_TYPE_ICONS = {
  STRING: "utility:text",
  TEXTAREA: "utility:textarea",
  PHONE: "utility:call",
  EMAIL: "utility:email",
  URL: "utility:link",
  BOOLEAN: "utility:check",
  CURRENCY: "utility:moneybag",
  DOUBLE: "utility:number_input",
  INTEGER: "utility:number_input",
  PERCENT: "utility:percent",
  DATE: "utility:date_input",
  DATETIME: "utility:date_time",
  PICKLIST: "utility:picklist_type",
  MULTIPICKLIST: "utility:multi_picklist",
  REFERENCE: "utility:record_lookup"
};

const DISPLAY_COMPONENTS = [
  { label: "Static Text", value: "Static_Text", icon: "utility:text_template" },
  { label: "Divider", value: "Divider", icon: "utility:rules" },
  { label: "File Upload", value: "File_Upload", icon: "utility:upload" },
  { label: "Signature", value: "Signature", icon: "utility:signature" }
];

export default class FieldPalette extends LightningElement {
  @api objectLabel = "";
  @api fields = [];
  @api relationships = [];

  @track activeTab = "fields";
  @track searchTerm = "";
  @track requiredExpanded = false;
  @track fieldsExpanded = true;

  get displayComponents() {
    return DISPLAY_COMPONENTS;
  }

  get hasRelationships() {
    return this.relationships && this.relationships.length > 0;
  }

  get relationshipCount() {
    return this.relationships ? this.relationships.length : 0;
  }

  get enrichedFields() {
    return (this.fields || []).map((f) => ({
      ...f,
      iconName: FIELD_TYPE_ICONS[f.type] || "utility:text"
    }));
  }

  get requiredFields() {
    return this.enrichedFields.filter((f) => f.required);
  }

  get hasRequiredFields() {
    return this.requiredFields.length > 0;
  }

  get requiredFieldCount() {
    return this.requiredFields.length;
  }

  get filteredFields() {
    let result = this.enrichedFields;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (f) =>
          f.label.toLowerCase().includes(term) ||
          f.apiName.toLowerCase().includes(term)
      );
    }
    return result;
  }

  get filteredFieldCount() {
    return this.filteredFields.length;
  }

  get requiredChevron() {
    return this.requiredExpanded
      ? "utility:chevrondown"
      : "utility:chevronright";
  }

  get fieldsChevron() {
    return this.fieldsExpanded ? "utility:chevrondown" : "utility:chevronright";
  }

  handleTabChange(event) {
    this.activeTab = event.target.value;
  }

  handleSearch(event) {
    this.searchTerm = event.target.value;
  }

  toggleRequiredSection() {
    this.requiredExpanded = !this.requiredExpanded;
  }

  toggleFieldsSection() {
    this.fieldsExpanded = !this.fieldsExpanded;
  }

  handleFieldDragStart(event) {
    const data = {
      dragType: "field",
      apiName: event.currentTarget.dataset.api,
      label: event.currentTarget.dataset.label,
      fieldType: event.currentTarget.dataset.type
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copy";
  }

  handleComponentDragStart(event) {
    const data = {
      dragType: "component",
      componentType: event.currentTarget.dataset.type
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copy";
  }

  handleRelationshipDragStart(event) {
    const el = event.currentTarget;
    const data = {
      dragType: "relationship",
      relationshipName: el.dataset.name,
      childObject: el.dataset.child,
      fieldName: el.dataset.field
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copy";
  }
}
