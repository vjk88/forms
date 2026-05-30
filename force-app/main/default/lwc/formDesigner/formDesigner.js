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
  @track primaryTab = 'forms';
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
  @track formHeader = {
    visible: true,
    title: "Form Title",
    subtitle: "",
    showLogo: false,
    logoUrl: "",
    alignment: "left",
    backgroundColor: "#ffffff",
    backgroundImage: ""
  };
  @track isHeaderSelected = false;
  @track relatedObjectFields = [];
  @track relatedObjectLabel = "";
  @track selectedSectionContext = "Parent";
  showCreateModal = false;
  isProcessing = false;

  get isHeaderSelected() {
    return this.panelSelection && this.panelSelection.type === "header";
  }

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

  get filteredForms() {
    const wantType = this.primaryTab === 'surveys' ? 'Survey' : 'Form';
    return this.forms.filter((f) => (f.Form_Type__c || 'Form') === wantType);
  }

  get formOptions() {
    return this.filteredForms.map((f) => ({
      label: f.Primary_Context_Object__c
        ? `${f.Name} (${f.Primary_Context_Object__c})`
        : f.Name,
      value: f.Id
    }));
  }

  get formsTabClass() {
    return `primary-tab${this.primaryTab === 'forms' ? ' active' : ''}`;
  }

  get surveysTabClass() {
    return `primary-tab${this.primaryTab === 'surveys' ? ' active' : ''}`;
  }

  get newButtonLabel() {
    return this.primaryTab === 'surveys' ? 'New Survey' : 'New Form';
  }

  get emptyStateTitle() {
    return this.primaryTab === 'surveys' ? 'No Survey Selected' : 'No Form Selected';
  }

  get emptyStateMessage() {
    const noun = this.primaryTab === 'surveys' ? 'survey' : 'form';
    return `Select a ${noun} from the dropdown or create a new one.`;
  }

  handlePrimaryTabChange(event) {
    const tab = event.currentTarget.dataset.tab;
    if (tab === this.primaryTab) return;

    // Remember current selection for the tab we're leaving
    this._selectionByTab = this._selectionByTab || {};
    this._selectionByTab[this.primaryTab] = {
      formId: this.selectedFormId,
      versionId: this.selectedVersionId
    };

    this.primaryTab = tab;

    // Restore selection for the tab we're switching to, if any
    const remembered = this._selectionByTab[tab];
    if (remembered && remembered.formId) {
      this.selectedFormId = remembered.formId;
      this.currentForm = this.forms.find((f) => f.Id === remembered.formId);
      this.selectedVersionId = remembered.versionId;
      this.currentVersion = null;
      this.canvasSections = [];
      this.panelSelection = null;
      if (this.currentForm) {
        this.loadObjectMetadata();
      }
    } else {
      this.selectedFormId = null;
      this.selectedVersionId = null;
      this.currentForm = null;
      this.currentVersion = null;
      this.canvasSections = [];
      this.panelSelection = null;
    }
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

  get currentLayoutMode() {
    return this.currentVersion?.Layout_Mode__c
      || this.currentForm?.Layout_Mode__c
      || 'Single_Page';
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
    this.relatedObjectFields = [];
    this.relatedObjectLabel = "";
    this.selectedSectionContext = "Parent";

    this.formHeader = {
      title: this.currentForm ? this.currentForm.Name : "Form Title",
      subtitle: "Please fill out this form",
      showLogo: false,
      alignment: "left",
      backgroundImage: ""
    };

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
      .then(() => {
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
    if (!apiName) return "";
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
      showHeader: true,
      headerBackgroundColor: "#f3f3f3",
      gridColumns: 1,
      padding: "medium",
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
    this.isHeaderSelected = false;
    const { index, section } = event.detail;
    this.panelSelection = {
      type: "section",
      index,
      name: section.name,
      showHeader: section.showHeader,
      headerBackgroundColor: section.headerBackgroundColor,
      gridColumns: section.gridColumns,
      padding: section.padding,
      collapsible: section.collapsible,
      collapsedByDefault: section.collapsedByDefault,
      description: section.description,
      visibilityExpression: section.visibilityExpression
    };

    if (section.contextType === "Related_Child" && section.parentSObjectApi) {
      this.selectedSectionContext = "Related_Child";
      this.relatedObjectLabel = section.name || section.parentSObjectApi;

      getObjectFields({ objectApiName: section.parentSObjectApi })
        .then((data) => {
          this.relatedObjectFields = data;
        })
        .catch((error) => {
          console.error("Error loading related fields:", error);
          this.relatedObjectFields = [];
        });
    } else {
      this.selectedSectionContext = "Parent";
      this.relatedObjectFields = [];
      this.relatedObjectLabel = "";
    }
  }

  handleEditSection(event) {
    this.handleSelectSection(event);
  }

  handleDeleteSection(event) {
    const { index } = event.detail;
    this.canvasSections = this.canvasSections.filter((_, i) => i !== index);
    this.panelSelection = null;
    this.selectedSectionContext = "Parent";
    this.relatedObjectFields = [];
    this.relatedObjectLabel = "";
  }

  handleSelectElement(event) {
    this.isHeaderSelected = false;
    const { sectionIndex, elementIndex, element } = event.detail;
    this.panelSelection = {
      type: "element",
      sectionIndex,
      elementIndex,
      name: element.label,
      elementType: element.type,
      fieldApiName: element.fieldApiName,
      fieldType: element.fieldType,
      uiBehavior: element.uiBehavior || "None",
      renderAs: element.renderAs || "Default",
      customOptionsJson: element.customOptionsJson || "[]",
      helpText: element.helpText,
      placeholder: element.placeholder,
      visibilityExpression: element.visibilityExpression
    };

    const section = this.canvasSections[sectionIndex];
    if (
      section &&
      section.contextType === "Related_Child" &&
      section.parentSObjectApi
    ) {
      this.selectedSectionContext = "Related_Child";
      this.relatedObjectLabel = section.name || section.parentSObjectApi;

      getObjectFields({ objectApiName: section.parentSObjectApi })
        .then((data) => {
          this.relatedObjectFields = data;
        })
        .catch((error) => {
          console.error("Error loading related fields:", error);
          this.relatedObjectFields = [];
        });
    } else {
      this.selectedSectionContext = "Parent";
      this.relatedObjectFields = [];
      this.relatedObjectLabel = "";
    }
  }

  handleSelectHeader() {
    this.isHeaderSelected = true;
    this.panelSelection = {
      type: "header",
      ...this.formHeader
    };
    this.selectedSectionContext = "Parent";
    this.relatedObjectFields = [];
    this.relatedObjectLabel = "";
  }

  switchToRelatedContext(relatedSection) {
    this.isHeaderSelected = false;
    this.selectedSectionContext = "Related_Child";
    this.relatedObjectLabel = relatedSection.name || relatedSection.parentSObjectApi;

    if (relatedSection.parentSObjectApi) {
      getObjectFields({ objectApiName: relatedSection.parentSObjectApi })
        .then((data) => { this.relatedObjectFields = data; })
        .catch((err) => {
          console.error("Error loading related fields:", err);
          this.relatedObjectFields = [];
        });
    }
  }

  handleSelectRelatedSection(event) {
    const { sectionIndex, relatedIndex, relatedSection } = event.detail;
    this.switchToRelatedContext(relatedSection);
    this.panelSelection = {
      type: "section",
      index: sectionIndex,
      relatedIndex,
      name: relatedSection.name,
      gridColumns: relatedSection.gridColumns || 1,
      contextType: "Related_Child",
      parentSObjectApi: relatedSection.parentSObjectApi,
      linkingField: relatedSection.linkingField
    };
  }

  handleSelectRelatedElement(event) {
    const { sectionIndex, relatedIndex, elementIndex, element } = event.detail;
    const relSection = this.canvasSections[sectionIndex]?.relatedSections?.[relatedIndex];
    if (relSection) {
      this.switchToRelatedContext(relSection);
    }
    this.panelSelection = {
      type: "element",
      sectionIndex,
      relatedIndex,
      elementIndex,
      name: element.label,
      elementType: element.type,
      fieldApiName: element.fieldApiName,
      fieldType: element.fieldType,
      uiBehavior: element.uiBehavior || "None",
      renderAs: element.renderAs || "Default",
      customOptionsJson: element.customOptionsJson || "[]",
      helpText: element.helpText,
      placeholder: element.placeholder
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
    const { apiName, label, fieldType, sectionIndex, fieldSource } =
      event.detail;

    const targetSection = this.canvasSections[sectionIndex];
    if (targetSection) {
      if (
        targetSection.contextType === "Related_Child" &&
        fieldSource !== "related"
      ) {
        this.showToast(
          "Warning",
          `Only fields from the related object (${targetSection.parentSObjectApi}) can be added to this repeater section.`,
          "warning"
        );
        return;
      }
      if (targetSection.contextType === "Parent" && fieldSource !== "primary") {
        this.showToast(
          "Warning",
          `Only fields from the primary object (${this.currentForm?.Primary_Context_Object__c}) can be added to standard sections.`,
          "warning"
        );
        return;
      }
    }

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
      uiBehavior: "None",
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

  handleAddRelatedToSection(event) {
    const { sectionIndex, name, childObject, childObjectLabel, fieldName } = event.detail;

    const newRelated = {
      id: "rel-" + Date.now(),
      name: childObjectLabel,
      gridColumns: 1,
      contextType: "Related_Child",
      isRepeatable: true,
      relationshipName: name,
      parentSObjectApi: childObject,
      linkingField: fieldName,
      elements: []
    };

    const updated = [...this.canvasSections];
    const existing = updated[sectionIndex].relatedSections || [];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      relatedSections: [...existing, newRelated]
    };
    this.canvasSections = updated;

    getObjectFields({ objectApiName: childObject })
      .then((data) => {
        this.relatedObjectFields = data;
        this.relatedObjectLabel = childObjectLabel;
        this.selectedSectionContext = "Related_Child";
      })
      .catch((err) => console.error("Error loading related fields:", err));
  }

  handleDeleteRelatedSection(event) {
    const { sectionIndex, relatedIndex } = event.detail;
    const updated = [...this.canvasSections];
    const relSections = [...(updated[sectionIndex].relatedSections || [])];
    relSections.splice(relatedIndex, 1);
    updated[sectionIndex] = { ...updated[sectionIndex], relatedSections: relSections };
    this.canvasSections = updated;
  }

  handleRemoveRelatedElement(event) {
    const { sectionIndex, relatedIndex, elementIndex } = event.detail;
    const updated = [...this.canvasSections];
    const relSections = [...(updated[sectionIndex].relatedSections || [])];
    const elements = [...relSections[relatedIndex].elements];
    elements.splice(elementIndex, 1);
    relSections[relatedIndex] = { ...relSections[relatedIndex], elements };
    updated[sectionIndex] = { ...updated[sectionIndex], relatedSections: relSections };
    this.canvasSections = updated;
  }

  handleDropRelateField(event) {
    const { apiName, label, fieldType, fieldSource, sectionIndex, relatedIndex } = event.detail;

    if (fieldSource === "primary") {
      this.showToast(
        "Warning",
        "Only related object fields can be added to a related list section.",
        "warning"
      );
      return;
    }

    const updated = [...this.canvasSections];
    const relSections = [...(updated[sectionIndex].relatedSections || [])];

    const newElement = {
      id: "elem-" + Date.now(),
      type: "Field",
      name: label,
      fieldApiName: apiName,
      fieldType,
      uiBehavior: "None",
      helpText: "",
      placeholder: ""
    };

    const elements = [...(relSections[relatedIndex].elements || []), newElement];
    relSections[relatedIndex] = { ...relSections[relatedIndex], elements };
    updated[sectionIndex] = { ...updated[sectionIndex], relatedSections: relSections };
    this.canvasSections = updated;
  }

  // --- Property panel handlers ---

  handlePropertyChange(event) {
    const { selectionType, property, value } = event.detail;

    if (selectionType === "header") {
      this.formHeader = { ...this.formHeader, [property]: value };
      this.panelSelection = { ...this.panelSelection, [property]: value };
    } else if (selectionType === "section") {
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