import { LightningElement, track, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { refreshApex } from "@salesforce/apex";

import getOrgObjects from "@salesforce/apex/FormDesignerController.getOrgObjects";
import getAllForms from "@salesforce/apex/FormDesignerController.getAllForms";
import getFormVersions from "@salesforce/apex/FormDesignerController.getFormVersions";
import getObjectFields from "@salesforce/apex/FormDesignerController.getObjectFields";
import getChildRelationships from "@salesforce/apex/FormDesignerController.getChildRelationships";
import createDraftFromActive from "@salesforce/apex/FormDesignerController.createDraftFromActive";
import publishVersion from "@salesforce/apex/FormDesignerController.publishVersion";
import deleteDraftVersion from "@salesforce/apex/FormDesignerController.deleteDraftVersion";

export default class FormDesigner extends LightningElement {
  @track selectedFormId;
  @track selectedVersionId;
  @track currentForm;
  @track currentVersion;

  forms = [];
  versions = [];
  objectOptions = [];
  @track objectFields = [];
  @track childRelationships = [];
  @track canvasSections = [];
  @track panelSelection = null;
  showCreateModal = false;
  isProcessing = false;

  wiredFormsResult;
  wiredVersionsResult;

  @wire(getAllForms)
  wiredForms(result) {
    this.wiredFormsResult = result;
    if (result.data) {
      this.forms = result.data;
    }
  }

  @wire(getFormVersions, { formId: "$selectedFormId" })
  wiredVersions(result) {
    this.wiredVersionsResult = result;
    if (result.data && this.selectedFormId) {
      this.versions = result.data;
    }
  }

  connectedCallback() {
    this.loadObjectOptions();
  }

  loadObjectOptions() {
    getOrgObjects()
      .then((data) => {
        this.objectOptions = data;
      })
      .catch((error) => {
        console.error("Error loading objects:", error);
      });
  }

  // --- Computed properties ---

  get formOptions() {
    return this.forms.map((f) => ({
      label: `${f.Name} (${f.Primary_Context_Object__c})`,
      value: f.Id
    }));
  }

  get versionOptions() {
    return this.versions.map((v) => ({
      label: `v${v.Version_Number__c} (${v.Is_Active__c ? "Published" : "Draft"})`,
      value: v.Id
    }));
  }

  get hasFormSelected() {
    return !!this.selectedFormId;
  }

  get hasVersionSelected() {
    return !!this.selectedVersionId && !!this.currentVersion;
  }

  get isDraft() {
    return this.currentVersion && !this.currentVersion.Is_Active__c;
  }

  get versionStatusLabel() {
    if (!this.currentVersion) return "";
    return this.currentVersion.Is_Active__c ? "Published" : "Draft";
  }

  get versionBadgeClass() {
    return this.isDraft
      ? "slds-m-right_small slds-theme_warning"
      : "slds-m-right_small slds-theme_success";
  }

  get formDetailText() {
    if (!this.currentForm || !this.currentVersion) return "";
    const obj = this.currentForm.Primary_Context_Object__c || "";
    const ver = this.currentVersion.Version_Number__c || "";
    const mode = this.currentForm.Layout_Mode__c || "";
    return `${obj} · Version ${ver} · ${mode.replace("_", " ")}`;
  }

  get canCreateDraft() {
    if (!this.selectedFormId || !this.versions || this.versions.length === 0)
      return false;
    const hasActive = this.versions.some((v) => v.Is_Active__c === true);
    const hasDraft = this.versions.some((v) => v.Is_Active__c === false);
    return hasActive && !hasDraft;
  }

  get createDraftDisabled() {
    return !this.canCreateDraft;
  }

  get createDraftTooltip() {
    if (this.canCreateDraft) return "Create new draft from published version";
    const hasDraft =
      this.versions && this.versions.some((v) => v.Is_Active__c === false);
    if (hasDraft) return "A draft already exists";
    return "No published version to clone";
  }

  // --- Event handlers ---

  handleFormSelect(event) {
    this.selectedFormId = event.detail.value;
    this.selectedVersionId = null;
    this.currentVersion = null;
    this.currentForm = this.forms.find((f) => f.Id === this.selectedFormId);

    this.canvasSections = [];
    this.panelSelection = null;

    if (this.currentForm && this.currentForm.Form_Versions__r) {
      const draft = this.currentForm.Form_Versions__r.find(
        (v) => !v.Is_Active__c
      );
      const active = this.currentForm.Form_Versions__r.find(
        (v) => v.Is_Active__c
      );
      const versionToLoad = draft || active;
      if (versionToLoad) {
        this.selectedVersionId = versionToLoad.Id;
        this.currentVersion = versionToLoad;
      }
    }

    if (this.currentForm) {
      this.loadObjectMetadata();
    }
  }

  handleVersionSelect(event) {
    this.selectedVersionId = event.detail.value;
    this.currentVersion = this.versions.find(
      (v) => v.Id === this.selectedVersionId
    );
  }

  handleNewForm() {
    this.showCreateModal = true;
  }

  handleCloseModal() {
    this.showCreateModal = false;
  }

  handleFormCreated(event) {
    const { formId, versionId } = event.detail;
    this.showCreateModal = false;
    this.showToast("Success", "Form created successfully", "success");

    refreshApex(this.wiredFormsResult)
      .then(() => {
        this.selectedFormId = formId;
        this.currentForm = this.forms.find((f) => f.Id === formId);
        this.selectedVersionId = versionId;
        return refreshApex(this.wiredVersionsResult);
      })
      .then(() => {
        this.currentVersion = this.versions.find((v) => v.Id === versionId);
      });
  }

  handleCreateDraft() {
    if (!this.canCreateDraft) return;

    this.isProcessing = true;
    createDraftFromActive({ formId: this.selectedFormId })
      .then((result) => {
        this.showToast("Success", "Draft version created", "success");
        return refreshApex(this.wiredVersionsResult);
      })
      .then(() => {
        this.isProcessing = false;
        const draft = this.versions.find((v) => !v.Is_Active__c);
        if (draft) {
          this.selectedVersionId = draft.Id;
          this.currentVersion = draft;
        }
      })
      .catch((error) => {
        this.isProcessing = false;
        this.showToast("Error", this.getErrorMessage(error), "error");
      });
  }

  handlePublish() {
    if (!this.selectedVersionId || !this.isDraft) return;

    this.isProcessing = true;
    publishVersion({ versionId: this.selectedVersionId })
      .then(() => {
        this.showToast("Success", "Version published successfully", "success");
        return refreshApex(this.wiredFormsResult);
      })
      .then(() => refreshApex(this.wiredVersionsResult))
      .then(() => {
        this.isProcessing = false;
        this.currentForm = this.forms.find((f) => f.Id === this.selectedFormId);
        this.currentVersion = this.versions.find(
          (v) => v.Id === this.selectedVersionId
        );
      })
      .catch((error) => {
        this.isProcessing = false;
        this.showToast("Error", this.getErrorMessage(error), "error");
      });
  }

  handleDeleteVersion() {
    if (!this.selectedVersionId || !this.isDraft) return;

    this.isProcessing = true;
    deleteDraftVersion({ versionId: this.selectedVersionId })
      .then(() => {
        this.showToast("Success", "Draft version deleted", "success");
        this.selectedVersionId = null;
        this.currentVersion = null;
        return refreshApex(this.wiredVersionsResult);
      })
      .then(() => {
        this.isProcessing = false;
        const active = this.versions.find((v) => v.Is_Active__c);
        if (active) {
          this.selectedVersionId = active.Id;
          this.currentVersion = active;
        }
      })
      .catch((error) => {
        this.isProcessing = false;
        this.showToast("Error", this.getErrorMessage(error), "error");
      });
  }

  handlePreview() {
    this.showToast("Info", "Preview coming in the next phase", "info");
  }

  // --- Object metadata loading ---

  get currentObjectLabel() {
    if (!this.currentForm) return "";
    const apiName = this.currentForm.Primary_Context_Object__c;
    const opt = this.objectOptions.find(
      (o) => o.value.toLowerCase() === apiName.toLowerCase()
    );
    return opt ? opt.label : apiName;
  }

  loadObjectMetadata() {
    const objectApiName = this.currentForm?.Primary_Context_Object__c;
    if (!objectApiName) return;

    getObjectFields({ objectApiName })
      .then((data) => {
        this.objectFields = data;
      })
      .catch((err) => console.error("Error loading fields:", err));

    getChildRelationships({ objectApiName })
      .then((data) => {
        this.childRelationships = data;
      })
      .catch((err) => console.error("Error loading relationships:", err));
  }

  // --- Canvas event handlers ---

  handleAddSection() {
    const newSection = {
      id: "new-" + Date.now(),
      name: "New Section",
      gridColumns: 1,
      contextType: "Parent",
      collapsible: false,
      collapsedByDefault: false,
      isRepeatable: false,
      description: "",
      elements: []
    };
    this.canvasSections = [...this.canvasSections, newSection];
  }

  handleSelectSection(event) {
    const { index, section } = event.detail;
    this.panelSelection = {
      type: "section",
      index,
      name: section.name,
      gridColumns: section.gridColumns,
      collapsible: section.collapsible,
      collapsedByDefault: section.collapsedByDefault,
      description: section.description,
      visibilityExpression: section.visibilityExpression
    };
  }

  handleEditSection(event) {
    this.handleSelectSection(event);
  }

  handleDeleteSection(event) {
    const { index } = event.detail;
    this.canvasSections = this.canvasSections.filter((_, i) => i !== index);
    this.panelSelection = null;
  }

  handleSelectElement(event) {
    const { sectionIndex, elementIndex, element } = event.detail;
    this.panelSelection = {
      type: "element",
      sectionIndex,
      elementIndex,
      name: element.label,
      elementType: element.type,
      fieldApiName: element.fieldApiName,
      isRequired: element.required,
      helpText: element.helpText,
      placeholder: element.placeholder,
      visibilityExpression: element.visibilityExpression
    };
  }

  handleRemoveElement(event) {
    const { sectionIndex, elementIndex } = event.detail;
    const updated = [...this.canvasSections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      elements: updated[sectionIndex].elements.filter(
        (_, i) => i !== elementIndex
      )
    };
    this.canvasSections = updated;
    this.panelSelection = null;
  }

  handleDropField(event) {
    const { apiName, label, fieldType, sectionIndex } = event.detail;

    const alreadyExists = this.canvasSections.some((s) =>
      (s.elements || []).some(
        (e) =>
          e.fieldApiName &&
          e.fieldApiName.toLowerCase() === apiName.toLowerCase()
      )
    );
    if (alreadyExists) {
      this.showToast("Warning", `${label} is already on the form`, "warning");
      return;
    }

    const newElement = {
      id: "elem-" + Date.now(),
      type: "Field",
      name: label,
      fieldApiName: apiName,
      fieldType,
      isRequired: false,
      helpText: "",
      placeholder: ""
    };

    const updated = [...this.canvasSections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      elements: [...(updated[sectionIndex].elements || []), newElement]
    };
    this.canvasSections = updated;
  }

  handleDropComponent(event) {
    const { componentType, sectionIndex } = event.detail;
    const newElement = {
      id: "elem-" + Date.now(),
      type: componentType,
      name: componentType.replace("_", " ")
    };

    const updated = [...this.canvasSections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      elements: [...(updated[sectionIndex].elements || []), newElement]
    };
    this.canvasSections = updated;
  }

  handleDropRelationship(event) {
    const { relationshipName, childObject, fieldName } = event.detail;
    const newSection = {
      id: "new-" + Date.now(),
      name: childObject,
      gridColumns: 1,
      contextType: "Related_Child",
      isRepeatable: true,
      relationshipName,
      parentSObjectApi: childObject,
      elements: []
    };
    this.canvasSections = [...this.canvasSections, newSection];
  }

  // --- Property panel handlers ---

  handlePropertyChange(event) {
    const { selectionType, property, value } = event.detail;

    if (selectionType === "section") {
      const idx = event.detail.index;
      const updated = [...this.canvasSections];
      updated[idx] = { ...updated[idx], [property]: value };
      this.canvasSections = updated;
      this.panelSelection = { ...this.panelSelection, [property]: value };
    } else if (selectionType === "element") {
      const { sectionIndex, elementIndex } = event.detail;
      const updated = [...this.canvasSections];
      const elements = [...updated[sectionIndex].elements];
      elements[elementIndex] = { ...elements[elementIndex], [property]: value };
      updated[sectionIndex] = { ...updated[sectionIndex], elements };
      this.canvasSections = updated;
      this.panelSelection = { ...this.panelSelection, [property]: value };
    }
  }

  handleEditVisibility() {
    this.showToast(
      "Info",
      "Visibility rule editor coming in the next phase",
      "info"
    );
  }

  // --- Utilities ---

  showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  getErrorMessage(error) {
    if (!error) return "Unknown error";
    if (Array.isArray(error.body)) {
      return error.body.map((e) => e.message).join(", ");
    }
    if (error.body && typeof error.body.message === "string") {
      return error.body.message;
    }
    if (typeof error.message === "string") {
      return error.message;
    }
    return "Unknown error";
  }
}
