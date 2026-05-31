import { LightningElement, track, wire } from "lwc";
import { loadStyle } from "lightning/platformResourceLoader";
import hideHeader from "@salesforce/resourceUrl/hideHeader";
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
import saveFormLayout from "@salesforce/apex/FormDesignerController.saveFormLayout";
import getFormLayout from "@salesforce/apex/FormDesignerController.getFormLayout";

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
  @track _canvasPages = [{ id: "page-1", name: "Page 1", showHeader: false, headerTitle: "", headerSubtitle: "", showInProgress: true, sections: [] }];
  @track currentPageIndex = 0;
  @track panelSelection = null;
  @track _formHeader = {
    visible: true,
    title: "Form Title",
    subtitle: "",
    showLogo: false,
    logoUrl: "",
    alignment: "left",
    backgroundColor: "#ffffff",
    backgroundImage: "",
    fontFamily: "default",
    titleSize: "large",
    titleColor: "#1b1c1c",
    subtitleColor: "#706e6b"
  };
  @track _formSettings = {
    submitLabel: "Submit Form",
    thankYouMessage:
      "Thank you for your submission! Your information has been securely recorded.",
    autoRedirect: false,
    redirectUrl: "",
    redirectDelay: 5,
    showReturnButton: false,
    returnButtonLabel: "Fill Out Again"
  };
  @track isCompletionActive = false;
  @track renamingPageIndex = -1;

  // Dirty tracking — set whenever canvas or header changes (except during load)
  @track isDirty = false;
  @track isSaving = false;
  @track lastSavedTime = null;
  _suppressDirty = false;

  // canvasSections proxies the CURRENT page's sections, so all existing
  // section/element handlers keep working unchanged.
  get canvasSections() {
    const page = this._canvasPages[this.currentPageIndex];
    return page ? page.sections : [];
  }
  set canvasSections(value) {
    const pages = [...this._canvasPages];
    pages[this.currentPageIndex] = {
      ...pages[this.currentPageIndex],
      sections: value
    };
    this._canvasPages = pages;
    if (!this._suppressDirty) {
      this.isDirty = true;
    }
  }

  get formSettings() {
    return this._formSettings;
  }
  set formSettings(value) {
    this._formSettings = value;
    if (!this._suppressDirty) {
      this.isDirty = true;
    }
  }

  get formHeader() {
    return this._formHeader;
  }
  set formHeader(value) {
    this._formHeader = value;
    if (!this._suppressDirty) {
      this.isDirty = true;
    }
  }
  @track isHeaderSelected = false;
  @track relatedObjectFields = [];
  @track relatedObjectLabel = "";
  @track selectedSectionContext = "Parent";
  @track showFormMenu = false;
  @track showVersionMenu = false;
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
    loadStyle(this, hideHeader)
      .then(() => {
        console.log("Global header styling overridden.");
      })
      .catch((error) => {
        console.error("Error loading hideHeader stylesheet:", error);
      });
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

  get formsSegClass() {
    return `seg-btn${this.primaryTab === 'forms' ? ' active' : ''}`;
  }

  get surveysSegClass() {
    return `seg-btn${this.primaryTab === 'surveys' ? ' active' : ''}`;
  }

  get currentFormName() {
    return this.currentForm ? this.currentForm.Name : '';
  }

  get formTitleLabel() {
    if (this.currentForm) return this.currentForm.Name;
    return this.primaryTab === 'surveys' ? 'Select a survey' : 'Select a form';
  }

  get primaryTabNoun() {
    return this.primaryTab === 'surveys' ? 'surveys' : 'forms';
  }

  get hasNoForms() {
    return this.filteredForms.length === 0;
  }

  get anyMenuOpen() {
    return this.showFormMenu || this.showVersionMenu;
  }

  toggleFormMenu() {
    this.showFormMenu = !this.showFormMenu;
    this.showVersionMenu = false;
  }

  toggleVersionMenu() {
    this.showVersionMenu = !this.showVersionMenu;
    this.showFormMenu = false;
  }

  closeMenus() {
    this.showFormMenu = false;
    this.showVersionMenu = false;
  }

  handlePickForm(event) {
    const formId = event.currentTarget.dataset.id;
    this.closeMenus();
    if (formId === this.selectedFormId) return;
    this.autoSaveThen(() => this.selectForm(formId));
  }

  handlePickVersion(event) {
    const versionId = event.currentTarget.dataset.id;
    this.closeMenus();
    if (versionId === this.selectedVersionId) return;
    this.autoSaveThen(() => this.selectVersion(versionId));
  }

  // --- Page management ---

  get pageTabs() {
    return (this._canvasPages || []).map((p, i) => ({
      id: p.id,
      name: p.name || `Page ${i + 1}`,
      index: i,
      isActive: !this.isCompletionActive && i === this.currentPageIndex,
      isRenaming: i === this.renamingPageIndex,
      tabClass:
        !this.isCompletionActive && i === this.currentPageIndex
          ? "page-tab active"
          : "page-tab"
    }));
  }

  get completionTabClass() {
    return this.isCompletionActive
      ? "page-tab completion-tab active"
      : "page-tab completion-tab";
  }

  get hasMultiplePages() {
    return (this._canvasPages || []).length > 1;
  }

  get currentPage() {
    return this._canvasPages[this.currentPageIndex];
  }

  // Clicking a page tab selects it AND shows its properties in the right panel
  handleSelectPage(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.isCompletionActive = false;
    this.currentPageIndex = idx;
    this.isHeaderSelected = false;
    this.selectedSectionContext = "Parent";
    this.showPageProps(idx);
  }

  showPageProps(idx) {
    const page = this._canvasPages[idx];
    this.panelSelection = {
      type: "page",
      index: idx,
      name: page.name,
      showHeader: page.showHeader,
      headerTitle: page.headerTitle,
      headerSubtitle: page.headerSubtitle,
      showInProgress: page.showInProgress !== false
    };
  }

  handleSelectCompletion() {
    this.isCompletionActive = true;
    this.isHeaderSelected = false;
    this.panelSelection = null;
  }

  handleAddPage() {
    const pages = [...this._canvasPages, this.blankPage(this._canvasPages.length)];
    this._canvasPages = pages;
    this.isCompletionActive = false;
    this.currentPageIndex = pages.length - 1;
    this.showPageProps(this.currentPageIndex);
    if (!this._suppressDirty) this.isDirty = true;
  }

  handleDeletePage(event) {
    event.stopPropagation();
    if (this._canvasPages.length <= 1) {
      this.showToast("Info", "A form must have at least one page", "info");
      return;
    }
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    const pages = this._canvasPages.filter((_, i) => i !== idx);
    this._canvasPages = pages;
    if (this.currentPageIndex >= pages.length) {
      this.currentPageIndex = pages.length - 1;
    }
    this.panelSelection = null;
    if (!this._suppressDirty) this.isDirty = true;
  }

  // Inline rename via double-click on a page tab
  handleStartRename(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.renamingPageIndex = idx;
  }

  handleRenameInput(event) {
    const idx = this.renamingPageIndex;
    if (idx < 0) return;
    const pages = [...this._canvasPages];
    pages[idx] = { ...pages[idx], name: event.target.value };
    this._canvasPages = pages;
    if (!this._suppressDirty) this.isDirty = true;
  }

  handleRenameCommit() {
    this.renamingPageIndex = -1;
  }

  handleRenameKey(event) {
    if (event.key === "Enter" || event.key === "Escape") {
      this.renamingPageIndex = -1;
    }
  }

  handleCompletionChange(event) {
    const { property, value } = event.detail;
    this.formSettings = { ...this._formSettings, [property]: value };
  }

  handleNewFormFromMenu() {
    this.closeMenus();
    this.handleNewForm();
  }

  handleCreateDraftFromMenu() {
    this.closeMenus();
    this.handleCreateDraft();
  }

  get versionPillLabel() {
    if (!this.currentVersion) return '';
    const num = this.currentVersion.Version_Number__c;
    const status = this.currentVersion.Is_Active__c ? 'Published' : 'Draft';
    return `v${num} (${status})`;
  }

  get versionPillClass() {
    return this.isDraft ? 'version-pill is-draft' : 'version-pill is-published';
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
    this.autoSaveThen(() => this.switchPrimaryTab(tab));
  }

  switchPrimaryTab(tab) {
    // Remember current selection for the tab we're leaving
    this._selectionByTab = this._selectionByTab || {};
    this._selectionByTab[this.primaryTab] = {
      formId: this.selectedFormId,
      versionId: this.selectedVersionId
    };

    this.primaryTab = tab;
    this.panelSelection = null;

    this._suppressDirty = true;
    this.resetCanvasPages();
    this.isDirty = false;
    Promise.resolve().then(() => {
      this._suppressDirty = false;
    });

    // Restore selection for the tab we're switching to, if any
    const remembered = this._selectionByTab[tab];
    if (remembered && remembered.formId) {
      this.selectedFormId = remembered.formId;
      this.currentForm = this.forms.find((f) => f.Id === remembered.formId);
      this.selectedVersionId = remembered.versionId;
      this.currentVersion = this.currentForm
        ? (this.currentForm.Form_Versions__r || []).find(
            (v) => v.Id === remembered.versionId
          )
        : null;
      if (this.currentForm) {
        this.loadObjectMetadata();
      }
      if (remembered.versionId) {
        this.loadLayout(remembered.versionId);
      }
    } else {
      this.selectedFormId = null;
      this.selectedVersionId = null;
      this.currentForm = null;
      this.currentVersion = null;
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
    const newFormId = event.detail.value;
    this.autoSaveThen(() => this.selectForm(newFormId));
  }

  selectForm(formId) {
    this.selectedFormId = formId;
    this.selectedVersionId = null;
    this.currentVersion = null;
    this.currentForm = this.forms.find((f) => f.Id === formId);

    this._suppressDirty = true;
    this.resetCanvasPages();
    this.panelSelection = null;
    this.relatedObjectFields = [];
    this.relatedObjectLabel = "";
    this.selectedSectionContext = "Parent";
    this._formHeader = {
      visible: true,
      title: this.currentForm ? this.currentForm.Name : "Form Title",
      subtitle: "",
      showLogo: false,
      logoUrl: "",
      alignment: "left",
      backgroundColor: "#ffffff",
      backgroundImage: ""
    };
    this.isDirty = false;
    Promise.resolve().then(() => {
      this._suppressDirty = false;
    });

    let versionToLoad = null;
    if (this.currentForm && this.currentForm.Form_Versions__r) {
      const draft = this.currentForm.Form_Versions__r.find(
        (v) => !v.Is_Active__c
      );
      const active = this.currentForm.Form_Versions__r.find(
        (v) => v.Is_Active__c
      );
      versionToLoad = draft || active;
      if (versionToLoad) {
        this.selectedVersionId = versionToLoad.Id;
        this.currentVersion = versionToLoad;
      }
    }

    if (this.currentForm) {
      this.loadObjectMetadata();
    }
    if (versionToLoad) {
      this.loadLayout(versionToLoad.Id);
    }
  }

  handleVersionSelect(event) {
    const newVersionId = event.detail.value;
    this.autoSaveThen(() => this.selectVersion(newVersionId));
  }

  selectVersion(versionId) {
    this.selectedVersionId = versionId;
    this.currentVersion = this.versions.find((v) => v.Id === versionId);
    this.panelSelection = null;
    this.loadLayout(versionId);
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
        // Fresh form — empty canvas, not dirty
        this._suppressDirty = true;
        this.resetCanvasPages();
        this.isDirty = false;
        this.lastSavedTime = null;
        Promise.resolve().then(() => {
          this._suppressDirty = false;
        });
        if (this.currentForm) {
          this.loadObjectMetadata();
        }
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
          this.loadLayout(draft.Id);
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
    // Persist any unsaved changes before publishing
    const ensureSaved = this.isDirty
      ? this.saveLayout(false)
      : Promise.resolve();

    ensureSaved
      .then(() => publishVersion({ versionId: this.selectedVersionId }))
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

  handleOpenHistory() {
    this.showToast("Info", "Version History mode coming next", "info");
  }

  handleSettings() {
    this.showToast("Info", "Form settings coming soon", "info");
  }

  // --- Save / Load ---

  get canSave() {
    return this.hasVersionSelected && this.isDraft;
  }

  get saveDisabled() {
    return !this.canSave || !this.isDirty || this.isSaving;
  }

  get saveButtonLabel() {
    if (this.isSaving) return "Saving...";
    return this.isDirty ? "Save *" : "Save";
  }

  get saveStatusText() {
    if (this.isSaving) return "Saving...";
    if (this.isDirty) return "Unsaved changes";
    if (this.lastSavedTime) {
      return `Saved ${this.lastSavedTime}`;
    }
    return "";
  }

  get saveStatusClass() {
    const base = "slds-m-left_small slds-text-body_small save-status";
    return this.isDirty ? `${base} is-dirty` : `${base} is-saved`;
  }

  get saveStatusIcon() {
    if (this.isSaving) return "utility:sync";
    return this.isDirty ? "utility:edit" : "utility:success";
  }

  buildLayoutJson() {
    return JSON.stringify({
      schemaVersion: "2.0",
      layoutMode: this.currentLayoutMode,
      header: this._formHeader,
      formSettings: this._formSettings,
      pages: this._canvasPages
    });
  }

  blankPage(index) {
    return {
      id: "page-" + Date.now() + "-" + index,
      name: "Page " + (index + 1),
      showHeader: false,
      headerTitle: "",
      headerSubtitle: "",
      showInProgress: true,
      sections: []
    };
  }

  resetCanvasPages() {
    this._canvasPages = [this.blankPage(0)];
    this.currentPageIndex = 0;
  }

  handleSave() {
    return this.saveLayout(true);
  }

  saveLayout(showToast) {
    if (!this.canSave || !this.isDirty) {
      return Promise.resolve();
    }

    this.isSaving = true;
    const versionId = this.selectedVersionId;
    const payload = this.buildLayoutJson();

    return saveFormLayout({ versionId, layoutJson: payload })
      .then(() => {
        this.isSaving = false;
        this.isDirty = false;
        this.lastSavedTime = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });
        if (showToast) {
          this.showToast("Saved", "Your changes have been saved", "success");
        }
      })
      .catch((error) => {
        this.isSaving = false;
        this.showToast("Save failed", this.getErrorMessage(error), "error");
      });
  }

  loadLayout(versionId) {
    if (!versionId) return Promise.resolve();

    return getFormLayout({ versionId })
      .then((json) => {
        this._suppressDirty = true;
        this.currentPageIndex = 0;
        if (json) {
          try {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
              this._canvasPages = parsed.pages;
            } else {
              // Legacy layout (v1.0) stored sections at the top level —
              // migrate into a single page.
              this._canvasPages = [
                { ...this.blankPage(0), sections: parsed.sections || [] }
              ];
            }
            if (parsed.header) {
              this._formHeader = parsed.header;
            }
            if (parsed.formSettings) {
              this._formSettings = {
                ...this._formSettings,
                ...parsed.formSettings
              };
            }
          } catch (e) {
            console.error("Error parsing saved layout:", e);
            this.resetCanvasPages();
          }
        } else {
          // No saved layout yet — fresh canvas
          this.resetCanvasPages();
        }
        this.isDirty = false;
        // Re-enable dirty tracking on next microtask so the assignments above
        // don't mark dirty
        Promise.resolve().then(() => {
          this._suppressDirty = false;
        });
      })
      .catch((error) => {
        this._suppressDirty = false;
        console.error("Error loading layout:", error);
      });
  }

  /**
   * Auto-save current draft if dirty, then run a follow-up action.
   * Used when navigating away (tab switch, form switch, version switch).
   */
  autoSaveThen(next) {
    if (this.canSave && this.isDirty) {
      this.saveLayout(false).then(() => next());
    } else {
      next();
    }
  }

  // --- Object metadata loading ---

  get usedFieldApiNames() {
    const used = [];
    // Fields used on ANY page count as used, so a field can't be added twice.
    (this._canvasPages || []).forEach((page) => {
      (page.sections || []).forEach((s) => {
        (s.elements || []).forEach((e) => {
          if (e.fieldApiName) used.push(e.fieldApiName);
        });
      });
    });
    return used;
  }

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
      content: element.content,
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
    } else if (selectionType === "page") {
      const idx = event.detail.index;
      const pages = [...this._canvasPages];
      pages[idx] = { ...pages[idx], [property]: value };
      this._canvasPages = pages;
      if (!this._suppressDirty) this.isDirty = true;
      this.panelSelection = { ...this.panelSelection, [property]: value };
    } else if (selectionType === "formSettings") {
      this.formSettings = { ...this.formSettings, [property]: value };
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

  // --- Reordering ---

  handleReorderElement(event) {
    const { sectionIndex, fromIndex, toIndex } = event.detail;
    const updated = [...this.canvasSections];
    const elements = [...updated[sectionIndex].elements];
    const [moved] = elements.splice(fromIndex, 1);
    let insertAt = toIndex;
    if (toIndex === -1) {
      insertAt = elements.length; // move to end
    } else if (fromIndex < toIndex) {
      insertAt = toIndex - 1; // account for the removed item shifting indices
    }
    elements.splice(insertAt, 0, moved);
    updated[sectionIndex] = { ...updated[sectionIndex], elements };
    this.canvasSections = updated;
  }

  handleReorderSection(event) {
    const { fromIndex, toIndex } = event.detail;
    const updated = [...this.canvasSections];
    const [moved] = updated.splice(fromIndex, 1);
    const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
    updated.splice(insertAt, 0, moved);
    this.canvasSections = updated;
    this.panelSelection = null;
  }

  // --- Delete / Duplicate from property panel ---

  handleDeleteSelection(event) {
    const { selectionType, index, sectionIndex, relatedIndex, elementIndex } =
      event.detail;

    if (selectionType === "section") {
      this.canvasSections = this.canvasSections.filter((_, i) => i !== index);
    } else if (selectionType === "element") {
      const updated = [...this.canvasSections];
      if (relatedIndex !== undefined && relatedIndex !== null) {
        const relSections = [...(updated[sectionIndex].relatedSections || [])];
        const els = relSections[relatedIndex].elements.filter(
          (_, i) => i !== elementIndex
        );
        relSections[relatedIndex] = {
          ...relSections[relatedIndex],
          elements: els
        };
        updated[sectionIndex] = {
          ...updated[sectionIndex],
          relatedSections: relSections
        };
      } else {
        const els = updated[sectionIndex].elements.filter(
          (_, i) => i !== elementIndex
        );
        updated[sectionIndex] = { ...updated[sectionIndex], elements: els };
      }
      this.canvasSections = updated;
    }
    this.panelSelection = null;
  }

  handleDuplicateSelection(event) {
    const { selectionType, index, sectionIndex, relatedIndex, elementIndex } =
      event.detail;

    if (selectionType === "section") {
      const original = this.canvasSections[index];
      const clone = this.cloneSection(original);
      const updated = [...this.canvasSections];
      updated.splice(index + 1, 0, clone);
      this.canvasSections = updated;
    } else if (selectionType === "element") {
      const updated = [...this.canvasSections];
      if (relatedIndex !== undefined && relatedIndex !== null) {
        const relSections = [...(updated[sectionIndex].relatedSections || [])];
        const els = [...relSections[relatedIndex].elements];
        const clone = this.cloneElement(els[elementIndex]);
        els.splice(elementIndex + 1, 0, clone);
        relSections[relatedIndex] = {
          ...relSections[relatedIndex],
          elements: els
        };
        updated[sectionIndex] = {
          ...updated[sectionIndex],
          relatedSections: relSections
        };
      } else {
        const els = [...updated[sectionIndex].elements];
        const clone = this.cloneElement(els[elementIndex]);
        els.splice(elementIndex + 1, 0, clone);
        updated[sectionIndex] = { ...updated[sectionIndex], elements: els };
      }
      this.canvasSections = updated;
    }
    this.showToast("Duplicated", "A copy was added below", "success");
  }

  cloneElement(el) {
    return {
      ...el,
      id: "elem-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      name: el.name ? `${el.name} Copy` : el.name
    };
  }

  cloneSection(section) {
    const newId = "new-" + Date.now();
    return {
      ...section,
      id: newId,
      name: section.name ? `${section.name} Copy` : section.name,
      elements: (section.elements || []).map((e) => this.cloneElement(e)),
      relatedSections: (section.relatedSections || []).map((rs) => ({
        ...rs,
        id: "rel-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        elements: (rs.elements || []).map((e) => this.cloneElement(e))
      }))
    };
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