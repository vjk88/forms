import { LightningElement, api, track } from "lwc";

export default class PropertyPanel extends LightningElement {
  @track _selection = null;

  @api
  get selection() {
    return this._selection;
  }
  set selection(value) {
    this._selection = value ? { ...value } : null;
  }

  get hasSelection() {
    return !!this._selection;
  }

  get isSectionSelected() {
    return this._selection && this._selection.type === "section";
  }

  get isElementSelected() {
    return this._selection && this._selection.type === "element";
  }

  get isFieldType() {
    return this._selection && this._selection.elementType === "Field";
  }

  // --- Section getters ---
  get sectionName() {
    return this._selection?.name || "";
  }
  get sectionColumns() {
    return String(this._selection?.gridColumns || 1);
  }
  get sectionCollapsible() {
    return this._selection?.collapsible || false;
  }
  get sectionCollapsedByDefault() {
    return this._selection?.collapsedByDefault || false;
  }
  get sectionDescription() {
    return this._selection?.description || "";
  }

  // --- Element getters ---
  get elementLabel() {
    return this._selection?.name || "";
  }
  get elementFieldApi() {
    return this._selection?.fieldApiName || "";
  }
  get elementRequired() {
    return this._selection?.isRequired || false;
  }
  get elementHelpText() {
    return this._selection?.helpText || "";
  }
  get elementPlaceholder() {
    return this._selection?.placeholder || "";
  }

  get columnOptions() {
    return [
      { label: "1 Column", value: "1" },
      { label: "2 Columns", value: "2" },
      { label: "3 Columns", value: "3" },
      { label: "4 Columns", value: "4" }
    ];
  }

  get visibilityRuleSummary() {
    const expr = this._selection?.visibilityExpression;
    if (!expr) return "Always visible";
    try {
      const parsed = JSON.parse(expr);
      const count = parsed.rules ? parsed.rules.length : 0;
      return `${count} rule${count !== 1 ? "s" : ""} configured`;
    } catch (e) {
      return "Rules configured";
    }
  }

  // --- Change handlers ---

  firePropertyChange(property, value) {
    this.dispatchEvent(
      new CustomEvent("propertychange", {
        detail: {
          selectionType: this._selection.type,
          index: this._selection.index,
          sectionIndex: this._selection.sectionIndex,
          elementIndex: this._selection.elementIndex,
          property,
          value
        }
      })
    );
  }

  handleSectionNameChange(event) {
    this.firePropertyChange("name", event.detail.value);
  }
  handleColumnsChange(event) {
    this.firePropertyChange("gridColumns", parseInt(event.detail.value, 10));
  }
  handleCollapsibleChange(event) {
    this.firePropertyChange("collapsible", event.detail.checked);
  }
  handleCollapsedDefaultChange(event) {
    this.firePropertyChange("collapsedByDefault", event.detail.checked);
  }
  handleSectionDescChange(event) {
    this.firePropertyChange("description", event.detail.value);
  }

  handleElementLabelChange(event) {
    this.firePropertyChange("name", event.detail.value);
  }
  handleRequiredChange(event) {
    this.firePropertyChange("isRequired", event.detail.checked);
  }
  handleHelpTextChange(event) {
    this.firePropertyChange("helpText", event.detail.value);
  }
  handlePlaceholderChange(event) {
    this.firePropertyChange("placeholder", event.detail.value);
  }

  handleEditVisibilityRules() {
    this.dispatchEvent(
      new CustomEvent("editvisibility", {
        detail: {
          selectionType: this._selection.type,
          index: this._selection.index,
          sectionIndex: this._selection.sectionIndex,
          elementIndex: this._selection.elementIndex
        }
      })
    );
  }
}
