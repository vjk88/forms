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

const COMMON_COMPONENTS = [
  { label: "Display Text", value: "Rich_Text", icon: "utility:richtextbulletedlist" },
  { label: "Image", value: "Image", icon: "utility:image" },
  { label: "Callout", value: "Callout", icon: "utility:info" },
  { label: "Divider", value: "Divider", icon: "utility:rules" },
  { label: "Spacer", value: "Spacer", icon: "utility:expand_alt" },
  { label: "Consent", value: "Consent", icon: "utility:check" },
  { label: "File Upload", value: "File_Upload", icon: "utility:upload" }
];

const SURVEY_QUESTION_TYPES = [
  { label: "NPS Score (0-10)", value: "NPS_Score", icon: "utility:rating" },
  { label: "Likert Scale", value: "Likert_Scale", icon: "utility:groups" },
  { label: "Star Rating", value: "Star_Rating", icon: "utility:favorite" },
  { label: "Long Text Response", value: "Long_Text_Response", icon: "utility:textarea" }
];

export default class ZFieldPalette extends LightningElement {
  @api objectLabel = "";
  @api fields = [];
  @api relationships = [];
  @api relatedObjectFields = [];
  @api relatedObjectLabel = "";
  @api selectedSectionContext = "Parent";
  @api mode = "forms";
  @api usedFields = [];
  @api layoutMode = "Single_Page";

  @track activeTab = "fields";
  @track searchTerm = "";
  @track requiredExpanded = false;
  @track fieldsExpanded = true;
  @track relatedExpanded = true;

  get isSurveyMode() {
    return this.mode === 'surveys';
  }

  get surveyQuestionTypes() {
    return SURVEY_QUESTION_TYPES;
  }

  get hasSurveyQuestionTypes() {
    return this.isSurveyMode;
  }

  get displayComponents() {
    return COMMON_COMPONENTS;
  }

  get hasRelationships() {
    return this.relationships && this.relationships.length > 0;
  }

  get relationshipCount() {
    return this.relationships ? this.relationships.length : 0;
  }

  get usedSet() {
    return new Set(
      (this.usedFields || []).map((n) => String(n).toLowerCase())
    );
  }

  get objectBadge() {
    return (this.objectLabel || "").toUpperCase();
  }

  get objectSubtitle() {
    return this.objectLabel
      ? `Fields from ${this.objectLabel} object`
      : "Fields";
  }

  enrich(f) {
    const isUsed = this.usedSet.has(String(f.apiName).toLowerCase());
    return {
      ...f,
      iconName: FIELD_TYPE_ICONS[f.type] || "utility:text",
      isUsed,
      draggable: !isUsed,
      itemClass: isUsed ? "palette-item is-used" : "palette-item"
    };
  }

  get enrichedFields() {
    return (this.fields || []).map((f) => this.enrich(f));
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

  get showRelatedFieldsGroup() {
    return (
      this.selectedSectionContext === "Related_Child" &&
      this.relatedObjectFields &&
      this.relatedObjectFields.length > 0
    );
  }

  get relatedChevron() {
    return this.relatedExpanded
      ? "utility:chevrondown"
      : "utility:chevronright";
  }

  get enrichedRelatedFields() {
    return (this.relatedObjectFields || []).map((f) => this.enrich(f));
  }

  get filteredRelatedFields() {
    let result = this.enrichedRelatedFields;
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

  get filteredRelatedFieldCount() {
    return this.filteredRelatedFields.length;
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

  toggleRelatedSection() {
    this.relatedExpanded = !this.relatedExpanded;
  }

  handleFieldDragStart(event) {
    const apiName = event.currentTarget.dataset.api;
    if (this.usedSet.has(String(apiName).toLowerCase())) {
      event.preventDefault();
      return;
    }
    const source = event.currentTarget.dataset.source || "primary";
    const data = {
      dragType: "field",
      apiName,
      label: event.currentTarget.dataset.label,
      fieldType: event.currentTarget.dataset.type,
      fieldSource: source
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
