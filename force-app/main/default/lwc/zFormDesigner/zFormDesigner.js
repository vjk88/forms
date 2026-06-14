import { LightningElement, track, wire } from "lwc";
import { loadStyle } from "lightning/platformResourceLoader";
import hideHeader from "@salesforce/resourceUrl/hideHeader";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { refreshApex } from "@salesforce/apex";

import getOrgObjects from "@salesforce/apex/Z_FormDesignerController.getOrgObjects";
import getAllForms from "@salesforce/apex/Z_FormDesignerController.getAllForms";
import getFormVersions from "@salesforce/apex/Z_FormDesignerController.getFormVersions";
import getObjectFields from "@salesforce/apex/Z_FormDesignerController.getObjectFields";
import getChildRelationships from "@salesforce/apex/Z_FormDesignerController.getChildRelationships";
import createDraftFromActive from "@salesforce/apex/Z_FormDesignerController.createDraftFromActive";
import publishVersion from "@salesforce/apex/Z_FormDesignerController.publishVersion";
import deleteDraftVersion from "@salesforce/apex/Z_FormDesignerController.deleteDraftVersion";
import saveFormLayout from "@salesforce/apex/Z_FormDesignerController.saveFormLayout";
import getFormLayout from "@salesforce/apex/Z_FormDesignerController.getFormLayout";
import generateAISpec from "@salesforce/apex/Z_FormDesignerController.generateAISpec";
import getPicklistOptions from "@salesforce/apex/FormPlayerController.getPicklistOptions";
import getLookupTargets from "@salesforce/apex/FormPlayerController.getLookupTargets";
import { PRESET_THEMES, radiusToken, themeVars, hasPageBackground } from "c/zFormThemes";

const DEFAULT_HEADER_CONFIG = {
  visible: true,
  title: "Header Title",
  subtitle: "Subtitle goes here",
  showLogo: true,
  logoUrl: "",
  logoVersionId: "",
  logoSize: "medium",
  alignment: "left",
  backgroundColor: "#6e6e6e",
  backgroundImage: "",
  backgroundVersionId: "",
  fontFamily: "default",
  titleSize: "large",
  titleColor: "#ffffff",
  subtitleColor: "#ffffff"
};

function getDefaultFormHeader(title) {
  return {
    ...DEFAULT_HEADER_CONFIG,
    title: title || DEFAULT_HEADER_CONFIG.title
  };
}

export default class ZFormDesigner extends LightningElement {
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
  @track _canvasPages = [{ id: "page-1", name: "Page 1", showInProgress: true, sections: [] }];
  @track currentPageIndex = 0;
  // Builder-editable layout mode; falls back to the version/form record value.
  @track _layoutMode = null;
  @track panelSelection = null;
  @track _formHeader = getDefaultFormHeader();
  @track _formSettings = {
    submitLabel: "Submit Form",
    // After-submit behavior: "Screen" (thank-you screen) or "ToastAndGo"
    afterSubmitMode: "Screen",
    // Toast & go
    toastAndGoTarget: "Record", // Record | Custom
    toastAndGoUrl: "",
    // Completion screen
    thankYouMessage:
      "Thank you for your submission! Your information has been securely recorded.",
    autoRedirect: false,
    redirectTarget: "Record", // Record | Custom
    redirectUrl: "",
    redirectDelay: 5,
    showActionButton: false,
    actionButtonLabel: "Continue",
    actionButtonTarget: "Record", // Record | Custom
    actionButtonUrl: ""
  };
  @track isCompletionActive = false;
  @track renamingPageIndex = -1;

  // Visibility rule editor modal
  @track showVisibilityModal = false;
  @track visibilityRulesJson = "";
  @track visibilityContextLabel = "component";
  @track userFields = [];
  @track picklistValues = {};
  @track lookupTargets = [];
  @track showAutofillModal = false;
  @track autofillRulesJson = "[]";
  _picklistObj = null;
  visibilityTarget = null;

  // Dirty tracking — set whenever canvas or header changes (except during load)
  @track isDirty = false;
  @track isSaving = false;
  @track lastSavedTime = null;
  _suppressDirty = false;

  // Side-panel collapse (give the canvas more room)
  @track leftCollapsed = false;
  @track rightCollapsed = false;

  // Undo / redo — a debounced snapshot stack of the editable layout state.
  @track _historyIndex = -1;
  _history = [];
  _savedHistoryIndex = 0;
  _snapshotTimer = null;

  // canvasSections proxies the CURRENT page's sections (or concatenates all sections
  // in Single Page mode so the entire form is rendered/edited as one), so all existing
  // section/element handlers keep working unchanged.
  get canvasSections() {
    if (this.currentLayoutMode === "Single_Page") {
      return (this._canvasPages || []).reduce((acc, p) => [...acc, ...(p.sections || [])], []);
    }
    const page = this._canvasPages[this.currentPageIndex];
    return page ? page.sections : [];
  }
  set canvasSections(value) {
    const pages = [...this._canvasPages];
    if (this.currentLayoutMode === "Single_Page") {
      pages[0] = { ...pages[0], sections: value };
      for (let i = 1; i < pages.length; i++) {
        pages[i] = { ...pages[i], sections: [] };
      }
    } else {
      pages[this.currentPageIndex] = {
        ...pages[this.currentPageIndex],
        sections: value
      };
    }
    this._canvasPages = pages;
    this.markDirty();
  }

  get formSettings() {
    return this._formSettings;
  }
  set formSettings(value) {
    this._formSettings = value;
    this.markDirty();
  }

  get formHeader() {
    return this._formHeader;
  }
  set formHeader(value) {
    this._formHeader = value;
    this.markDirty();
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
    // User object fields for the "Current User" visibility source.
    getObjectFields({ objectApiName: "User" })
      .then((data) => {
        this.userFields = data;
      })
      .catch(() => {
        this.userFields = [];
      });
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

  // String form for aria-expanded (reflects open/closed to assistive tech).
  get formMenuExpanded() {
    return String(this.showFormMenu);
  }

  get versionMenuExpanded() {
    return String(this.showVersionMenu);
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

  // Keyboard support for the custom app-bar menus: Escape closes (and returns
  // focus to the trigger), Arrow keys move between items. The items are real
  // <button>s, so Tab/Enter already work.
  handleMenuKeydown(event) {
    if (event.key === 'Escape') {
      const trigger = event.currentTarget.classList.contains('dd-menu')
        ? null
        : event.currentTarget;
      this.closeMenus();
      if (trigger && trigger.focus) trigger.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!this.anyMenuOpen) return;
    event.preventDefault();
    const items = [...this.template.querySelectorAll('.dd-menu .dd-item')];
    if (!items.length) return;
    const active = this.template.activeElement;
    const current = items.indexOf(active);
    let next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].focus();
  }

  // --- Side-panel collapse ---
  get designerBodyClass() {
    let c = "designer-body";
    if (this.leftCollapsed) c += " left-collapsed";
    if (this.rightCollapsed) c += " right-collapsed";
    return c;
  }

  toggleLeftPanel() {
    this.leftCollapsed = !this.leftCollapsed;
  }

  toggleRightPanel() {
    this.rightCollapsed = !this.rightCollapsed;
  }

  // --- Canvas toolbar breadcrumb (what's currently selected) ---
  get breadcrumbItems() {
    const items = [
      { key: "form", label: this.currentFormName || "Form", icon: "utility:form", sep: false }
    ];
    const push = (key, label, icon) =>
      items.push({ key, label, icon, sep: true });

    if (this.isCompletionActive) {
      push("completion", "Completion", "utility:success");
      return items;
    }
    if (this.isMultiPageLayout) {
      const pg = this._canvasPages[this.currentPageIndex];
      push("page", (pg && pg.name) || `Page ${this.currentPageIndex + 1}`, "utility:page");
    }
    const sel = this.panelSelection;
    if (sel) {
      if (sel.type === "header") push("sel", "Header", "utility:header");
      else if (sel.type === "section") push("sel", sel.name || "Section", "utility:layout");
      else if (sel.type === "element") push("sel", sel.name || "Field", "utility:text");
    }
    return items;
  }

  // --- Undo / redo ---
  get canUndo() {
    return this._historyIndex > 0;
  }
  get canRedo() {
    return this._historyIndex < this._history.length - 1;
  }
  get undoDisabled() {
    return !this.canUndo;
  }
  get redoDisabled() {
    return !this.canRedo;
  }

  // Set isDirty AND queue a (debounced) history snapshot. Single choke point
  // so every committed edit is undoable without instrumenting each handler.
  markDirty() {
    if (this._suppressDirty) return;
    this.isDirty = true;
    this.scheduleSnapshot();
  }

  scheduleSnapshot() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._snapshotTimer = window.setTimeout(() => this.captureSnapshot(), 350);
  }

  flushSnapshot() {
    if (this._snapshotTimer) {
      window.clearTimeout(this._snapshotTimer);
      this._snapshotTimer = null;
      this.captureSnapshot();
    }
  }

  currentLayoutSnapshot() {
    return JSON.parse(
      JSON.stringify({
        layoutMode: this.currentLayoutMode,
        header: this._formHeader,
        formSettings: this._formSettings,
        pages: this._canvasPages,
        currentPageIndex: this.currentPageIndex
      })
    );
  }

  captureSnapshot() {
    this._snapshotTimer = null;
    const snap = this.currentLayoutSnapshot();
    // Drop any redo branch, then append the new state.
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(snap);
    if (this._history.length > 60) {
      this._history.shift();
      if (this._savedHistoryIndex > 0) this._savedHistoryIndex -= 1;
    }
    this._historyIndex = this._history.length - 1;
  }

  // Establish a clean baseline after a load / save / fresh form.
  resetHistory() {
    this._history = [this.currentLayoutSnapshot()];
    this._historyIndex = 0;
    this._savedHistoryIndex = 0;
  }

  handleUndo() {
    this.flushSnapshot();
    if (!this.canUndo) return;
    this._historyIndex -= 1;
    this.restoreSnapshot(this._history[this._historyIndex]);
  }

  handleRedo() {
    if (!this.canRedo) return;
    this._historyIndex += 1;
    this.restoreSnapshot(this._history[this._historyIndex]);
  }

  restoreSnapshot(snap) {
    const s = JSON.parse(JSON.stringify(snap));
    this._suppressDirty = true;
    this._canvasPages = s.pages;
    this._formHeader = s.header;
    this._formSettings = s.formSettings;
    this._layoutMode = s.layoutMode;
    this.currentPageIndex = Math.min(
      s.currentPageIndex || 0,
      s.pages.length - 1
    );
    // Selection indices may no longer line up — clear to avoid stale edits.
    this.panelSelection = null;
    this.isHeaderSelected = false;
    this.isCompletionActive = false;
    this.isDirty = this._historyIndex !== this._savedHistoryIndex;
    Promise.resolve().then(() => {
      this._suppressDirty = false;
    });
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

  get isScreenModePreview() {
    return (this._formSettings.afterSubmitMode || "Screen") === "Screen";
  }

  get isToastModePreview() {
    return this._formSettings.afterSubmitMode === "ToastAndGo";
  }

  get toastAndGoDestination() {
    const target = this._formSettings.toastAndGoTarget || "Record";
    if (target === "Record") return "The new / updated record";
    return this._formSettings.toastAndGoUrl || "Custom URL";
  }

  get redirectDestination() {
    const target = this._formSettings.redirectTarget || "Record";
    if (target === "Record") return "the created record";
    return this._formSettings.redirectUrl || "custom URL";
  }

  get themeConfig() {
    return (this._formSettings && this._formSettings.theme) || PRESET_THEMES.default;
  }

  // The template's default section style, passed to the canvas so sections that
  // aren't explicitly overridden follow the chosen template.
  get currentSectionDefaultStyle() {
    return this.themeConfig.sectionDefault || "card";
  }

  get formCardPreviewStyle() {
    const t = this.themeConfig;
    const accent = t.accent || PRESET_THEMES.default.accent;
    const surface = t.surface || "#ffffff";
    const radius = t.radius === "pill" ? "18px" : radiusToken(t.radius);
    return `background-color: ${surface}; border-top: 4px solid ${accent}; border-radius: ${radius};`;
  }

  get accentButtonStyle() {
    const t = this.themeConfig;
    const accent = t.submitColor || t.accent || PRESET_THEMES.default.accent;
    const radius = radiusToken(t.radius);
    return `background-color: ${accent}; border-color: ${accent}; color: #ffffff; border-radius: ${radius};`;
  }

  get designerLayout() {
    return (this.themeConfig && this.themeConfig.layout) || "classic";
  }

  get isSplitLayout() {
    const layout = this.designerLayout;
    return layout === "split" || layout === "splitSidebarImg" || layout === "splitBgOverlay" || layout === "asymmetricLanding" || layout === "floatingCardSplit";
  }

  get showInlineHeader() {
    return this.formHeader.visible && !this.isSplitLayout;
  }

  get designerLayoutContainerClass() {
    return `designer-layout-container layout-${this.designerLayout}`;
  }

  // Canvas stage style — cascades the same theme tokens the player uses + width
  // + the page background, so the builder looks like the rendered form.
  get stageInnerClass() {
    let c = "stage-inner";
    if (hasPageBackground(this.themeConfig)) c += " has-page-bg";
    c += ` layout-${this.designerLayout}`;
    return c;
  }

  get designerStageStyle() {
    const parts = [themeVars(this.themeConfig)];
    const ff = (this._formSettings && this._formSettings.fontFamily) || (this._formHeader && this._formHeader.fontFamily);
    if (ff && ff !== "default") parts.push(`font-family: ${ff}`);
    
    if (this.isSplitLayout) {
      parts.push("max-width: 1080px");
    } else {
      parts.push("max-width: 100%");
    }
    parts.push("margin: 0 auto");
    // Show the template's page background behind the card in the canvas too.
    parts.push("background: var(--c-page-bg, transparent)");
    return parts.join("; ");
  }

  get formStageStyle() {
    const fw = this._formSettings && Number(this._formSettings.formWidth);
    if (fw) {
      if (fw <= 100) {
        return `max-width: ${fw}%; margin: 0 auto; width: 100%;`;
      }
      return `max-width: ${fw}px; margin: 0 auto; width: 100%;`;
    }
    return "max-width: 100%; margin: 0 auto; width: 100%;";
  }

  // --- Page management ---

  get isMultiPageLayout() {
    return this.currentLayoutMode !== "Single_Page";
  }

  get pageTabs() {
    const multi = this.isMultiPageLayout;
    return (this._canvasPages || []).map((p, i) => {
      const active = !this.isCompletionActive && i === this.currentPageIndex;
      return {
        id: p.id,
        // Single-page forms always show one fixed "Single Page" tab.
        name: multi ? p.name || `Page ${i + 1}` : "Single Page",
        index: i,
        isActive: active,
        isRenaming: multi && i === this.renamingPageIndex,
        tabItemClass: active
          ? "slds-tabs_default__item slds-is-active"
          : "slds-tabs_default__item"
      };
    });
  }

  get completionTabItemClass() {
    return this.isCompletionActive
      ? "slds-tabs_default__item completion-tab slds-is-active"
      : "slds-tabs_default__item completion-tab";
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
      showInProgress: page.showInProgress !== false,
      nextLabel: page.nextLabel || "Next",
      submitLabel: page.submitLabel || this._formSettings.submitLabel || "Submit",
      isLastPage: idx === this._canvasPages.length - 1,
      isMultiPage: this.isMultiPageLayout,
      visibilityExpression: page.visibilityExpression
    };
  }

  handleSelectCompletion() {
    this.isCompletionActive = true;
    this.isHeaderSelected = false;
    this.panelSelection = {
      type: "formSettings",
      ...this._formSettings,
      layoutMode: this.currentLayoutMode,
      themeName: this.currentThemeName
    };
  }

  handleAddPage() {
    if (!this.isMultiPageLayout) return; // single-page forms have one page only
    const pages = [...this._canvasPages, this.blankPage(this._canvasPages.length)];
    this._canvasPages = pages;
    this.isCompletionActive = false;
    this.currentPageIndex = pages.length - 1;
    this.showPageProps(this.currentPageIndex);
    this.markDirty();
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
    this.markDirty();
  }

  // Inline rename via double-click on a page tab
  handleStartRename(event) {
    if (!this.isMultiPageLayout) return; // the single page can't be renamed
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.renamingPageIndex = idx;
  }

  handleRenameInput(event) {
    const idx = this.renamingPageIndex;
    if (idx < 0) return;
    const pages = [...this._canvasPages];
    pages[idx] = { ...pages[idx], name: event.target.value };
    this._canvasPages = pages;
    this.markDirty();
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
        ? (this.currentForm.Z_Form_Versions__r || []).find(
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
      label: `v${v.Z_Version_Number__c} (${v.Z_Is_Active__c ? "Published" : "Draft"})`,
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
    return this.currentVersion && !this.currentVersion.Z_Is_Active__c;
  }

  get currentLayoutMode() {
    return this._layoutMode || 'Single_Page';
  }

  // --- In-card navigation PREVIEW (non-functional mirror of the player) ---
  get navIsWizard() {
    return this.currentLayoutMode === "Multi_Page_Wizard" && this.hasMultiplePages;
  }
  get navIsVertical() {
    return (this.currentLayoutMode === "Vertical_Navigation" || this.designerLayout === "threeColumnDashboard") && this.hasMultiplePages;
  }
  get navIsTop() {
    return this.currentLayoutMode === "Top_Navigation" && this.hasMultiplePages;
  }

  get cardBodyClass() {
    return this.navIsVertical ? "canvas-card-body has-vnav" : "canvas-card-body";
  }
  // Page list for the previews (name + active state), built from the page tabs.
  get navPreviewItems() {
    return (this.pageTabs || []).map((p, i) => ({
      id: p.id || `pp-${i}`,
      name: p.name,
      itemClass: p.isActive ? "navpv__item is-active" : "navpv__item"
    }));
  }
  get navPreviewCurrentStep() {
    const items = this.navPreviewItems;
    if (!items.length) return null;
    const idx = Math.min(this.currentPageIndex, items.length - 1);
    return (items[idx] || items[0]).id;
  }

  // Theme name (form-level) — recorded in the saved snapshot.
  get currentThemeName() {
    return (this._formSettings.theme && this._formSettings.theme.name) || "default";
  }

  // --- Auto-fill rules (form-level, from the palette Settings tab) ---
  handleOpenAutofill() {
    this.loadPicklistValues(); // ensures lookupTargets are loaded
    const rules = this._formSettings.autofillRules || [];
    this.autofillRulesJson = JSON.stringify(rules);
    this.showAutofillModal = true;
  }

  handleAutofillSave(event) {
    let rules = [];
    try {
      rules = JSON.parse(event.detail.json || "[]");
    } catch {
      rules = [];
    }
    this.formSettings = { ...this._formSettings, autofillRules: rules };
    this.showAutofillModal = false;
  }

  handleAutofillCancel() {
    this.showAutofillModal = false;
  }

  get versionStatusLabel() {
    if (!this.currentVersion) return "";
    return this.currentVersion.Z_Is_Active__c ? "Published" : "Draft";
  }

  get versionBadgeClass() {
    return this.isDraft
      ? "slds-m-right_small slds-theme_warning"
      : "slds-m-right_small slds-theme_success";
  }

  get formDetailText() {
    if (!this.currentForm || !this.currentVersion) return "";
    const obj = this.currentForm.Z_Primary_Object__c || "";
    const ver = this.currentVersion.Z_Version_Number__c || "";
    const mode = this.currentLayoutMode || "";
    return `${obj} · Version ${ver} · ${mode.replace("_", " ")}`;
  }

  get canCreateDraft() {
    if (!this.selectedFormId || !this.versions || this.versions.length === 0)
      return false;
    const hasActive = this.versions.some((v) => v.Z_Is_Active__c === true);
    const hasDraft = this.versions.some((v) => v.Z_Is_Active__c === false);
    return hasActive && !hasDraft;
  }

  get createDraftDisabled() {
    return !this.canCreateDraft;
  }

  get createDraftTooltip() {
    if (this.canCreateDraft) return "Create new draft from published version";
    const hasDraft =
      this.versions && this.versions.some((v) => v.Z_Is_Active__c === false);
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
    const defaultTitle = this.currentForm ? this.currentForm.Name : "Header Title";
    this._formHeader = getDefaultFormHeader(defaultTitle);
    this.isDirty = false;
    Promise.resolve().then(() => {
      this._suppressDirty = false;
    });

    let versionToLoad = null;
    if (this.currentForm && this.currentForm.Z_Form_Versions__r) {
      const draft = this.currentForm.Z_Form_Versions__r.find(
        (v) => !v.Z_Is_Active__c
      );
      const active = this.currentForm.Z_Form_Versions__r.find(
        (v) => v.Z_Is_Active__c
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
        this.resetHistory();
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
        const draft = this.versions.find((v) => !v.Z_Is_Active__c);
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
        const active = this.versions.find((v) => v.Z_Is_Active__c);
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

  @track showPreview = false;
  @track previewLayoutJson = "";
  @track previewDevice = "desktop";

  // Device preview — constrains the preview frame width. The form inside uses
  // container queries, so it reflows to match each device width.
  get previewDeviceStyle() {
    const widths = { desktop: "100%", tablet: "834px", mobile: "390px" };
    const w = widths[this.previewDevice] || "100%";
    return `width: ${w}; max-width: 100%; margin: 0 auto;`;
  }
  get previewFrameClass() {
    return `preview-frame preview-frame_${this.previewDevice}`;
  }
  get desktopVariant() {
    return this.previewDevice === "desktop" ? "brand" : "neutral";
  }
  get tabletVariant() {
    return this.previewDevice === "tablet" ? "brand" : "neutral";
  }
  get mobileVariant() {
    return this.previewDevice === "mobile" ? "brand" : "neutral";
  }
  handlePreviewDevice(event) {
    this.previewDevice = event.currentTarget.dataset.device || "desktop";
  }

  handlePreview() {
    if (!this.currentForm) return;
    if (!this.currentForm.Z_Primary_Object__c) {
      this.showToast(
        "Preview",
        "Live preview needs a primary object. Survey rendering preview is coming next.",
        "info"
      );
      return;
    }
    this.previewLayoutJson = this.buildLayoutJson();
    this.showPreview = true;
  }

  handleClosePreview() {
    this.showPreview = false;
  }

  handleOpenHistory() {
    this.showToast("Info", "Version History mode coming next", "info");
  }

  handleSettings() {
    this.panelSelection = {
      type: "formSettings",
      ...this._formSettings,
      layoutMode: this.currentLayoutMode,
      themeName: this.currentThemeName
    };
  }

  // --- Save / Load ---

  get canSave() {
    return this.hasVersionSelected && this.isDraft;
  }

  get saveDisabled() {
    return !this.canSave || !this.isDirty || this.isSaving;
  }

  get showDiscard() {
    return this.isDraft && this.isDirty && !this.isSaving;
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

  // Revert unsaved changes by reloading the last-saved layout from the server.
  handleDiscard() {
    if (!this.showDiscard) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      "Discard your unsaved changes and revert to the last saved version?"
    );
    if (!ok) return;
    this.panelSelection = null;
    this.isHeaderSelected = false;
    this.isCompletionActive = false;
    this.loadLayout(this.selectedVersionId).then(() => {
      this.showToast("Reverted", "Unsaved changes were discarded", "info");
    });
  }

  saveLayout(showToast) {
    if (!this.canSave || !this.isDirty) {
      return Promise.resolve();
    }

    if (this.currentLayoutMode === "Single_Page" && this._canvasPages.length > 1) {
      const mergedSections = this._canvasPages.reduce((acc, p) => [...acc, ...(p.sections || [])], []);
      this._canvasPages = [{
        ...this._canvasPages[0],
        sections: mergedSections
      }];
      this.currentPageIndex = 0;
    }

    // Make sure the latest edit is in history before we baseline against it.
    this.flushSnapshot();
    this.isSaving = true;
    const versionId = this.selectedVersionId;
    const payload = this.buildLayoutJson();

    return saveFormLayout({ versionId, layoutJson: payload })
      .then(() => {
        this.isSaving = false;
        this.isDirty = false;
        this._savedHistoryIndex = this._historyIndex;
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
        // Reset so currentLayoutMode falls back to the freshly-loaded record,
        // then let the saved layout JSON override if it carries a mode.
        this._layoutMode = null;
        if (json) {
          try {
            const parsed = JSON.parse(json);
            if (parsed.layoutMode) {
              this._layoutMode = parsed.layoutMode;
            }
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
        this.resetHistory();
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

  get currentObjectApiName() {
    return this.currentForm?.Z_Primary_Object__c || "";
  }

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
    const apiName = this.currentForm.Z_Primary_Object__c;
    if (!apiName) return "";
    const opt = this.objectOptions.find(
      (o) => o.value.toLowerCase() === apiName.toLowerCase()
    );
    return opt ? opt.label : apiName;
  }

  loadObjectMetadata() {
    const objectApiName = this.currentForm?.Z_Primary_Object__c;
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
    const { index } = event.detail;
    // The section-card click passes the section; the settings (gear) icon only
    // passes an index — fall back to the current page's section for that case.
    const section = event.detail.section || this.canvasSections[index];
    if (!section) return;
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

  // Header is previewed at the top of the canvas stage (form-level, above the
  // page tabs). Clicking it selects it and clears any section/element highlight.
  handleHeaderClick() {
    this.handleSelectHeader();
    const canvas = this.template.querySelector("c-designer-canvas");
    if (canvas && canvas.clearSelection) canvas.clearSelection();
  }

  // --- Form header preview getters ---
  get headerCardClass() {
    const h = this._formHeader || {};
    const hasBg = !!h.backgroundImage;
    const alignment = h.alignment || "left";
    const style = (this._formSettings && this._formSettings.theme && this._formSettings.theme.headerStyle) || "inherit";
    return `canvas-header-card${this.isHeaderSelected ? " selected" : ""}${hasBg ? " has-bg" : ""} align-${alignment} style-${style}`;
  }

  get headerCardStyle() {
    const h = this._formHeader || {};
    const parts = [];
    if (h.backgroundColor && h.backgroundColor !== "#ffffff") {
      parts.push(`background-color: ${h.backgroundColor}`);
    }
    if (h.backgroundImage) {
      parts.push(`background-image: url('${h.backgroundImage}')`);
      parts.push("background-size: cover");
      parts.push("background-position: center");
    }
    return parts.join("; ");
  }

  get headerTitleClass() {
    const size = (this._formHeader && this._formHeader.titleSize) || "large";
    return `header-title title-${size}`;
  }

  get headerTitleStyle() {
    const c = this._formHeader && this._formHeader.titleColor;
    return c ? `color: ${c};` : "";
  }

  get headerSubtitleStyle() {
    const c = this._formHeader && this._formHeader.subtitleColor;
    return c ? `color: ${c};` : "";
  }

  get headerLogoSrc() {
    return (this._formHeader && this._formHeader.logoUrl) || "";
  }

  get headerLogoImgClass() {
    const size = (this._formHeader && this._formHeader.logoSize) || "medium";
    return `header-logo-img logo-${size}`;
  }

  get hasLogoImage() {
    return !!(
      this._formHeader &&
      this._formHeader.showLogo &&
      this._formHeader.logoUrl
    );
  }

  get hasLogoPlaceholder() {
    return !!(
      this._formHeader &&
      this._formHeader.showLogo &&
      !this._formHeader.logoUrl
    );
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

  // Related-section settings (gear) icon — passes only indices, so resolve the
  // related section and route through the normal select handler.
  handleEditRelatedSection(event) {
    const { sectionIndex, relatedIndex } = event.detail;
    const relatedSection =
      this.canvasSections[sectionIndex]?.relatedSections?.[relatedIndex];
    if (!relatedSection) return;
    this.handleSelectRelatedSection({
      detail: { sectionIndex, relatedIndex, relatedSection }
    });
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
      linkingField: relatedSection.linkingField,
      displayStyle: relatedSection.displayStyle || "stacked",
      addLabel: relatedSection.addLabel || "",
      minRows: relatedSection.minRows != null ? relatedSection.minRows : 0,
      maxRows: relatedSection.maxRows != null ? relatedSection.maxRows : 0
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
          `Only fields from the primary object (${this.currentForm?.Z_Primary_Object__c}) can be added to standard sections.`,
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

  triggerJsonUpload() {
    const fileInput = this.template.querySelector('[data-id="jsonLayoutFile"]');
    if (fileInput) {
      fileInput.click();
    }
  }

  handleJsonUpload(event) {
    const fileInput = event.target;
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        this._suppressDirty = true;

        if (parsed.layoutMode) {
          this._layoutMode = parsed.layoutMode;
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
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          this._canvasPages = parsed.pages;
        } else if (parsed.sections) {
          this._canvasPages = [
            { ...this.blankPage(0), sections: parsed.sections }
          ];
        }

        this.currentPageIndex = 0;
        this.panelSelection = null;
        this.isHeaderSelected = false;
        this.isCompletionActive = false;

        // Clear file input value
        if (fileInput) {
          fileInput.value = '';
        }

        this._suppressDirty = false;
        this.markDirty();
        this.showToast("Success", "Form layout loaded from JSON file", "success");
      } catch (err) {
        console.error("Failed to parse uploaded JSON file", err);
        this.showToast("Error", "Invalid JSON format: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  }

  handleApplyAiStyle(event) {
    const { prompt } = event.detail;
    const primaryObject = this.currentObjectApiName;
    const existingJson = this.buildLayoutJson();

    this.isProcessing = true;
    generateAISpec({ primaryObject, existingJson, prompt })
      .then((result) => {
        this.isProcessing = false;
        if (result) {
          this.applyAiStyle(result);
        }
      })
      .catch((err) => {
        this.isProcessing = false;
        this.showToast("AI Generation Failed", this.getErrorMessage(err), "error");
        // Reset property panel selection to reset button spinner
        if (this.panelSelection) {
          this.panelSelection = { ...this.panelSelection };
        }
      });
  }

  applyAiStyle(generatedJson) {
    try {
      const parsed = JSON.parse(generatedJson);

      this._suppressDirty = true;

      // 1. Merge Theme
      if (parsed.theme) {
        this._formSettings = {
          ...this._formSettings,
          theme: {
            ...(this._formSettings.theme || {}),
            ...parsed.theme
          }
        };
      }

      // 2. Merge Layout
      if (parsed.layout) {
        if (parsed.layout.variant) {
          const resolvedMode = parsed.layout.variant === 'split' ? 'Single_Page' : 
                               parsed.layout.variant === 'single-page' ? 'Single_Page' : 
                               parsed.layout.variant === 'multi-page' ? 'Multi_Page_Wizard' : this._layoutMode;
          this._layoutMode = resolvedMode;
          this._formSettings = {
            ...this._formSettings,
            layoutMode: resolvedMode
          };
        }
        if (parsed.layout.header) {
          this._formHeader = {
            ...this._formHeader,
            ...parsed.layout.header
          };
        }
      }

      // 3. If empty, load generated pages
      const isEmpty = !this._canvasPages || this._canvasPages.length === 0 || 
                      (this._canvasPages.length === 1 && (!this._canvasPages[0].sections || this._canvasPages[0].sections.length === 0));
      if (isEmpty && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        this._canvasPages = parsed.pages;
      }

      // Update property panel selection if open
      if (this.panelSelection && this.panelSelection.type === 'formSettings') {
        this.panelSelection = {
          ...this.panelSelection,
          ...this._formSettings,
          layoutMode: this.currentLayoutMode,
          themeName: this.currentThemeName
        };
      }

      this._suppressDirty = false;
      this.markDirty();
      this.showToast("AI Style Applied", "The theme and layout have been styled by AI.", "success");
    } catch (e) {
      this._suppressDirty = false;
      console.error("Error applying AI style:", e);
      this.showToast("Error", "Failed to parse AI theme response.", "error");
    }
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
      this.markDirty();
      this.panelSelection = { ...this.panelSelection, [property]: value };
    } else if (selectionType === "formSettings") {
      this.formSettings = { ...this.formSettings, [property]: value };
      if (property === "layoutMode") {
        this._layoutMode = value;
      }
      this.panelSelection = { ...this.panelSelection, [property]: value };
    } else if (selectionType === "section") {
      if (event.detail.relatedIndex != null) {
        // Related-list section nested under a parent section.
        const si = event.detail.sectionIndex;
        const ri = event.detail.relatedIndex;
        const updated = [...this.canvasSections];
        const rels = [...(updated[si].relatedSections || [])];
        rels[ri] = { ...rels[ri], [property]: value };
        updated[si] = { ...updated[si], relatedSections: rels };
        this.canvasSections = updated;
      } else {
        const idx = event.detail.index;
        const updated = [...this.canvasSections];
        updated[idx] = { ...updated[idx], [property]: value };
        this.canvasSections = updated;
      }
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

  // --- Visibility rules ---
  handleEditVisibility(event) {
    this.visibilityTarget = { ...event.detail };
    this.visibilityRulesJson = this.panelSelection?.visibilityExpression || "";
    this.visibilityContextLabel =
      this.panelSelection?.name ||
      (event.detail.selectionType === "section" ? "section" : "element");
    this.loadPicklistValues();
    this.showVisibilityModal = true;
  }

  // Picklist values for the form's object — drives type-aware value pickers
  // in the visibility editor. Reuses the shared getPicklistOptions Apex.
  loadPicklistValues() {
    const obj = this.currentForm?.Z_Primary_Object__c;
    if (!obj || this._picklistObj === obj) return;
    this._picklistObj = obj;
    getPicklistOptions({ objectApiName: obj })
      .then((m) => {
        this.picklistValues = m || {};
      })
      .catch(() => {
        this.picklistValues = {};
      });
    getLookupTargets({ objectApiName: obj })
      .then((t) => {
        this.lookupTargets = t || [];
      })
      .catch(() => {
        this.lookupTargets = [];
      });
  }

  get visibilityFields() {
    return this.objectFields || [];
  }

  handleVisibilitySave(event) {
    const json = event.detail.json;
    const t = this.visibilityTarget || {};
    if (t.selectionType === "element") {
      const updated = [...this.canvasSections];
      const els = [...updated[t.sectionIndex].elements];
      els[t.elementIndex] = {
        ...els[t.elementIndex],
        visibilityExpression: json
      };
      updated[t.sectionIndex] = { ...updated[t.sectionIndex], elements: els };
      this.canvasSections = updated;
    } else if (t.selectionType === "section") {
      const updated = [...this.canvasSections];
      updated[t.index] = { ...updated[t.index], visibilityExpression: json };
      this.canvasSections = updated;
    } else if (t.selectionType === "page") {
      const pages = [...this._canvasPages];
      pages[t.index] = { ...pages[t.index], visibilityExpression: json };
      this._canvasPages = pages;
      this.markDirty();
    }
    this.panelSelection = {
      ...this.panelSelection,
      visibilityExpression: json
    };
    this.showVisibilityModal = false;
  }

  handleVisibilityCancel() {
    this.showVisibilityModal = false;
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