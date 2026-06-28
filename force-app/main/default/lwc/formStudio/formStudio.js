import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadStyle } from 'lightning/platformResourceLoader';
import hideHeader from '@salesforce/resourceUrl/hideHeader';
import { materialize, LAYOUT_GROUPS, LAYOUT_LABELS } from 'c/layoutModel';
import { resolveTheme, THEME_OPTIONS, skinsForTheme, THEMES } from 'c/formThemes';
import uploadImage from '@salesforce/apex/FormAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FormAssetController.deleteImage';

// Continuous-flow layouts render as one top-to-bottom page (no page strip);
// everything else is paginated / tabbed → multi-page.
const CONTINUOUS_LAYOUTS = new Set(['stacked', 'bento']);

// Accent quick-swatches for the Theme panel (the picker covers everything else).
const ACCENT_SWATCHES = [
    '#6366f1', '#0176d3', '#7c5cff', '#c0492f',
    '#059669', '#c9a24b', '#e6571f', '#d4380d'
];

// GLOBAL spacing tiers → density (the --c-space scale) + section padding token, so
// every section shares one consistent rhythm (spacing is a theme concern, not a
// per-section knob).
const SPACING_PAD = { compact: 'small', comfortable: 'medium', spacious: 'large' };

// Elements that ALWAYS span every column regardless of the section grid. Mirrors
// formSectionRenderer's FULL_WIDTH_TYPES. Everything else (Image/Callout/Display-Text/
// Consent/File-Upload) sizes by colSpan like a field.
const FULL_WIDTH_TYPES = new Set(['Hero', 'Divider', 'Spacer']);

// Content blocks whose frame is meaningless — a rule, a callout (self-styled), or a
// gap. These are ALWAYS plain regardless of placement, so they never offer a block
// style and the renderer forces 'plain'. (Mirrors formSectionRenderer's set.)
const PLAIN_ONLY_BLOCK_TYPES = new Set(['Divider', 'Callout', 'Spacer']);

// Curated SLDS utility icons offered for section headers (mirrors c/propertyPanel).
const SECTION_ICONS = [
    'user', 'groups', 'people', 'identity', 'company', 'contact_request',
    'info', 'announcement', 'knowledge_base', 'note', 'description',
    'settings', 'dashboard', 'apps', 'home', 'location', 'checkin', 'world',
    'travel_and_places', 'call', 'email', 'chat', 'feed', 'bell',
    'cart', 'currency', 'moneybag', 'products', 'calendar', 'event', 'clock',
    'date_input', 'file', 'attach', 'upload', 'link', 'checklist', 'task',
    'success', 'approval', 'contract', 'lock', 'shield', 'privately_shared',
    'case', 'question', 'help', 'priority', 'warning', 'flag',
    'favorite', 'heart', 'rating', 'edit', 'form', 'list', 'rows', 'table',
    'filter', 'search', 'picklist_type'
];

// Inspector option sets (renderer reads the stored value directly).
const IMAGE_SIZE_OPTIONS = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
    { label: 'Full width', value: 'full' },
    { label: 'Fit to block', value: 'fit' }
];
const CALLOUT_VARIANT_OPTIONS = [
    { label: 'Info', value: 'info' },
    { label: 'Success', value: 'success' },
    { label: 'Warning', value: 'warning' },
    { label: 'Error', value: 'error' }
];
const SPACER_SIZE_OPTIONS = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' }
];

/**
 * Flatten a stored Layout_Config body → engine parts (pages/sections/elements)
 * WITHOUT losing element/section properties. Unlike c/formTemplates'
 * bodyToEngineParts (which keeps only label/type/required), this preserves every
 * authoring prop (uiBehavior, renderAs, helpText, placeholder, customOptionsJson,
 * slider*, urlPrefillParam, visibilityExpression, hero/image/callout fields, …) so
 * the inspector can edit them and the live engine can render them faithfully.
 */
function flattenBody(body) {
    const pages = [];
    const sections = [];
    const elements = [];
    let order = 0;
    const pushEls = (rawEls, secKey) => {
        (rawEls || []).forEach((el) => {
            order += 1;
            const type = el.type || 'Field';
            elements.push({
                ...el,
                key: el.id || `${secKey}_e${order}`,
                sectionKey: secKey,
                type,
                label: el.name || el.fieldApiName || type,
                required: (el.uiBehavior || 'None') === 'Required',
                order
            });
        });
    };
    // A stored relatedSection → a flat Related_Child section + its child-field elements.
    const pushRelated = (rs, pageKey) => {
        const relKey = rs.id || `rl_${order}`;
        // De-dupe: a related list can appear BOTH nested under a parent (legacy) and
        // as a standalone wrapper. Drop any earlier copy (+ its elements) so the
        // later one — the standalone wrapper, which carries the newest edits — wins.
        const exIdx = sections.findIndex((x) => x.key === relKey);
        if (exIdx >= 0) {
            sections.splice(exIdx, 1);
            for (let i = elements.length - 1; i >= 0; i--) {
                if (elements[i].sectionKey === relKey) elements.splice(i, 1);
            }
        }
        sections.push({
            key: relKey,
            pageKey,
            title: rs.name || '',
            contextType: 'Related_Child',
            relationshipName: rs.relationshipName,
            childObjectApiName: rs.childObjectApiName || rs.parentSObjectApi,
            linkingField: rs.linkingField,
            displayStyle: rs.displayStyle || 'stacked',
            addLabel: rs.addLabel || '',
            minRows: rs.minRows != null ? rs.minRows : 0,
            maxRows: rs.maxRows != null ? rs.maxRows : 0,
            gridColumns: rs.gridColumns || 1,
            order: order + 1
        });
        pushEls(rs.elements, relKey);
    };
    const rawPages = Array.isArray(body && body.pages) ? body.pages : [];
    rawPages.forEach((p, pi) => {
        const pageKey = p.id || `p${pi + 1}`;
        pages.push({ key: pageKey, label: p.name, order: pi + 1 });
        (p.sections || []).forEach((s, si) => {
            const secKey = s.id || `${pageKey}_s${si + 1}`;
            const related = Array.isArray(s.relatedSections) ? s.relatedSections : [];
            const ownEls = s.elements || [];
            // Pure Related-List wrapper (no own fields, one relatedSection) → just
            // the flat related section. Otherwise a normal field-section, plus any
            // legacy-nested related lists flattened out after it.
            if (related.length === 1 && ownEls.length === 0) {
                pushRelated(related[0], pageKey);
            } else {
                const flat = {
                    ...s,
                    key: secKey,
                    pageKey,
                    title: s.name || '',
                    style: s.sectionStyle || s.style,
                    gridColumns: s.gridColumns || 1,
                    order: order + 1
                };
                // Related lists are un-nested into their own standalone sections
                // below — the parent must not keep a stale nested copy.
                delete flat.relatedSections;
                sections.push(flat);
                pushEls(ownEls, secKey);
                related.forEach((rs) => pushRelated(rs, pageKey));
            }
        });
    });
    return { pages, sections, elements };
}

import { refreshApex } from "@salesforce/apex";
import LightningConfirm from "lightning/confirm";
import getAllForms from "@salesforce/apex/FormStudioController.getAllForms";
import getFormVersions from "@salesforce/apex/FormStudioController.getFormVersions";
import getObjectFields from "@salesforce/apex/FormStudioController.getObjectFields";
import getChildRelationships from "@salesforce/apex/FormStudioController.getChildRelationships";
import getFormLayout from "@salesforce/apex/FormStudioController.getFormLayout";
import saveFormLayout from "@salesforce/apex/FormStudioController.saveFormLayout";
import createDraftFromActive from "@salesforce/apex/FormStudioController.createDraftFromActive";
import publishVersion from "@salesforce/apex/FormStudioController.publishVersion";
import deleteDraftVersion from "@salesforce/apex/FormStudioController.deleteDraftVersion";

// Empty working model — used until a real form/version is loaded (no more dummy
// "sample" form; the UI shows a proper empty state instead).
const EMPTY_PARTS = { pages: [], sections: [], elements: [] };

const ELEMENT_TYPES = [
    { value: 'Section', label: 'Section', icon: 'utility:rows', group: 'Structure' },
    { value: 'Hero', label: 'Hero', icon: 'utility:image', group: 'Content' },
    { value: 'Rich_Text', label: 'Display Text', icon: 'utility:richtextbulletedlist', group: 'Content' },
    { value: 'Image', label: 'Image', icon: 'utility:image', group: 'Content' },
    { value: 'Callout', label: 'Callout', icon: 'utility:info', group: 'Content' },
    { value: 'Divider', label: 'Divider', icon: 'utility:rules', group: 'Content' },
    { value: 'Spacer', label: 'Spacer', icon: 'utility:expand_alt', group: 'Content' },
    { value: 'Consent', label: 'Consent', icon: 'utility:check', group: 'Content' },
    { value: 'File_Upload', label: 'File Upload', icon: 'utility:upload', group: 'Content' },
    { value: 'Empty_Space', label: 'Empty space', icon: 'utility:layout', group: 'Layout' },
    { value: 'Related_List', label: 'Related List', icon: 'utility:table', group: 'Data' }
];

const FIELD_ICONS = {
    'STRING': 'utility:text',
    'TEXTAREA': 'utility:textarea',
    'PHONE': 'utility:call',
    'EMAIL': 'utility:email',
    'URL': 'utility:link',
    'BOOLEAN': 'utility:check',
    'CURRENCY': 'utility:currency',
    'DOUBLE': 'utility:number',
    'INTEGER': 'utility:number',
    'DATE': 'utility:date_input',
    'DATETIME': 'utility:date_time',
    'PICKLIST': 'utility:picklist',
    'MULTIPICKLIST': 'utility:multi_picklist',
    'REFERENCE': 'utility:lookup',
    'PERCENT': 'utility:percent'
};

// Undo/redo history depth (snapshots of the whole editor state).
const HISTORY_MAX = 100;

const BUILD_PANELS = ['fields', 'insert', 'autofill'];
const DESIGN_PANELS = ['canvas', 'brand', 'type', 'flow'];

export default class FormStudio extends LightningElement {
    @track mode = 'build'; // build | design
    @track panel = 'fields';
    @track device = 'desktop'; // desktop | mobile
    @track editorHidden = false;
    @track selectedKey = null;
    @track search = '';
    @track showVisModal = false;
    @track iconSearch = '';         // section header-icon picker filter
    @track _uploading = false;      // image upload in flight (disables the button)
    @track _previewMounted = true;  // toggled to re-mount the live preview (refresh)
    @track showRelPicker = false;   // Related List → child-relationship picker modal
    @track relationships = [];      // child relationships of the primary object
    @track relatedFields = [];      // child-object fields for the selected related section
    _relatedFieldsObj = null;       // which child object relatedFields currently holds
    // Where a Related List should land once its relationship is chosen — captured at
    // drop time so the picker (async) doesn't lose the drop position and append blindly.
    _pendingRelDrop = null;         // { pageKey, beforeSectionKey } | null = append to active page

    // Pages + drag-and-drop
    @track currentPageKey = null;   // active page in the multi-page tab strip
    @track renamingPageKey = null;  // page tab being inline-renamed
    // Drop highlight is applied IMPERATIVELY during a drag (direct classList toggle)
    // rather than through reactive state — mutating @track on every dragover
    // re-rendered the blueprint under the cursor, which was the drag-cursor flicker.
    // _hlNode/_hlCls track the single currently-highlighted node so we can clear it.
    _hlNode = null;
    _hlCls = '';
    _dragKind = null;               // what's being dragged: section|element|page|palette-*
    _dragElSig = 'parent';          // data-context sig of a dragged element's source section
    _boundScrollEl = null;          // blueprint scroll el the autoscroll is bound to

    // ---- undo / redo ----
    // Snapshots of the whole serialized editor state (structure + design + autofill);
    // the same serializeForm()↔flattenBody round-trip Save/dirty already rely on, so
    // one mechanism covers everything. Captured debounced from renderedCallback.
    @track _histIndex = -1;         // pointer into _history (-1 = uninitialized)
    _history = [];                  // array of serialized snapshot strings
    _restoringHistory = false;      // true while applying a snapshot (suppresses capture)
    _histTimer = null;

    // Capturing dragover for the whole blueprint canvas. Two jobs:
    //  1) Blanket preventDefault + a stable dropEffect so the native cursor never
    //     flips to the OS "no-drop" badge over a dead zone between specific drop
    //     targets — that flip (against the valid drag badge) is the cursor flicker.
    //     Specific dragover handlers still refine the highlight and may set
    //     dropEffect 'none' to reject a genuinely invalid target.
    //  2) Auto-scroll while dragging near the top/bottom edge. Must be capturing so
    //     it fires even where an element/gap dragover stops propagation.
    _autoScroll = (e) => {
        // The single place that decides whether the canvas accepts this drag:
        // calling preventDefault marks the spot droppable; leaving it alone keeps the
        // browser's native "no-drop" cursor — which IS the rejection feedback (no
        // toast). dropEffect drives the badge: copy for palette adds, move for
        // reorders, none where the drop isn't allowed.
        const allow = this._dragAllowedAt(e.target);
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = !allow
                ? 'none'
                : this._dragKind && this._dragKind.indexOf('palette') === 0
                ? 'copy'
                : 'move';
        }
        if (allow) e.preventDefault();
        const sc = this._boundScrollEl;
        if (!sc) return;
        const r = sc.getBoundingClientRect();
        const EDGE = 52;
        const SPEED = 16;
        if (e.clientY < r.top + EDGE) sc.scrollTop -= SPEED;
        else if (e.clientY > r.bottom - EDGE) sc.scrollTop += SPEED;
    };

    renderedCallback() {
        const sc = this.template.querySelector('.bpscroll');
        if (sc && sc !== this._boundScrollEl) {
            // Capture phase: runs before target handlers and before any
            // stopPropagation, so it covers the entire canvas (see _autoScroll).
            sc.addEventListener('dragover', this._autoScroll, true);
            this._boundScrollEl = sc;
        } else if (!sc) {
            this._boundScrollEl = null;
        }
        this._trackHistory();
    }

    connectedCallback() {
        window.addEventListener('keydown', this._onKeydown);
        loadStyle(this, hideHeader).catch((error) => {
            console.error("Error loading hideHeader stylesheet:", error);
        });
    }
    disconnectedCallback() {
        window.removeEventListener('keydown', this._onKeydown);
        clearTimeout(this._histTimer);
    }

    // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo. Skipped while the user
    // is in a text field so the browser's own field-level undo still works there.
    _onKeydown = (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = (e.key || '').toLowerCase();
        if (k !== 'z' && k !== 'y') return;
        if (this._isEditable(this._deepActive())) return;
        e.preventDefault();
        if (k === 'y' || (k === 'z' && e.shiftKey)) this.handleRedo();
        else this.handleUndo();
    };
    // Focused element, drilling through shadow roots (inputs live in child bundles).
    _deepActive() {
        let a = document.activeElement;
        while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
        return a;
    }
    _isEditable(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }

    // Database Integration States
    @track primaryTab = 'forms'; // forms | surveys
    @track selectedFormId;
    @track selectedVersionId;
    @track currentForm;
    // Serialized snapshot of the last saved/loaded state — drives the dirty
    // indicator (compared against the live serializeForm output). null = nothing
    // loaded yet (treated as clean).
    @track _savedHash = null;
    @track _saving = false;
    @track currentVersion;
    
    @track forms = [];
    @track versions = [];
    @track objectFields = [];
    @track showFormMenu = false;
    @track showVersionMenu = false;
    @track _parts = EMPTY_PARTS;

    // ---- design (appearance) state — drives the live preview ----
    @track _layout = 'stacked';          // chosen layout preset (8, 3 groups)
    @track _themeId = 'cloud';
    @track _skinId = 'light';
    @track _accent = '';                 // '' = use the skin's own accent
    @track _spacing = 'comfortable';     // GLOBAL spacing for all sections (compact|comfortable|spacious)
    @track _header = { arrangement: 'stacked', title: '', description: '', logo: '', highlight: '' };
    @track _buttons = { submitLabel: 'Submit', nextLabel: 'Next', backLabel: 'Back', alignment: 'right' };
    @track _after = { action: 'message', message: 'Thank you! Your response has been recorded.', redirectUrl: '' };
    // Per-form custom theme overrides (→ resolveTheme overrides lane) + structural
    // shell overlay (→ Layout_Spec__c shell) — both driven by c/designPanel.
    @track _customTheme = {};
    @track _shell = {};
    @track _responsive = {};
    @track _autofill = [];                // form-level autofill rules (formSettings.autofillRules)
    @track showAutofillModal = false;     // single-rule editor modal (c/formAutofill)
    _afEditIndex = -1;                     // rule being edited; -1 = creating a new one
    @track showGallery = false;           // creation gallery overlay (New form / New survey)

    wiredFormsResult;
    wiredVersionsResult;

    @wire(getAllForms)
    wiredForms(result) {
        this.wiredFormsResult = result;
        if (result.data) {
            this.forms = result.data;
            this.autoSelectFirstForm();
        }
    }

    @wire(getFormVersions, { formId: '$selectedFormId' })
    wiredVersions(result) {
        this.wiredVersionsResult = result;
        if (result.data && this.selectedFormId) {
            this.versions = result.data;
            this.autoSelectFirstVersion();
        }
    }

    autoSelectFirstForm() {
        const list = this.filteredForms;
        if (list.length > 0) {
            this.selectForm(list[0].Id);
        } else {
            this.selectedFormId = null;
            this.currentForm = null;
            this.selectedVersionId = null;
            this.currentVersion = null;
            this.versions = [];
            this.objectFields = [];
            this._parts = EMPTY_PARTS;
        }
    }

    autoSelectFirstVersion() {
        if (this.versions.length > 0) {
            // Keep the current selection if it's still valid (e.g. after a
            // refreshApex following save/publish) so we don't yank the user off
            // their draft or reload the layout over unsaved edits.
            if (this.selectedVersionId && this.versions.some(v => v.Id === this.selectedVersionId)) {
                this.currentVersion = this.versions.find(v => v.Id === this.selectedVersionId);
                return;
            }
            const active = this.versions.find(v => v.Is_Active__c);
            const target = active ? active : this.versions[0];
            this.selectVersion(target.Id);
        } else {
            this.selectedVersionId = null;
            this.currentVersion = null;
            this.objectFields = [];
            this._parts = EMPTY_PARTS;
        }
    }

    selectForm(formId) {
        this.selectedFormId = formId;
        this.currentForm = this.forms.find(f => f.Id === formId);
        this.selectedVersionId = null;
        this.currentVersion = null;
        this.versions = [];
        this.objectFields = [];
        this._parts = EMPTY_PARTS;
    }

    selectVersion(versionId) {
        this.selectedVersionId = versionId;
        this.currentVersion = this.versions.find(v => v.Id === versionId);
        this.loadObjectFields();
        this.loadLayout(versionId);
    }

    loadObjectFields() {
        const objectApiName = this.currentForm?.Primary_Context_Object__c;
        if (!objectApiName) {
            this.objectFields = [];
            return;
        }
        getObjectFields({ objectApiName })
            .then(data => {
                this.objectFields = data;
            })
            .catch(err => {
                console.error('Error loading fields:', err);
                this.objectFields = [];
            });
    }

    loadLayout(versionId) {
        if (!versionId) return;
        // A new form/version is loading — drop any prior undo history and clear the
        // inspector selection so it doesn't point at a node from the previous form.
        this._resetHistory();
        this.selectedKey = null;
        getFormLayout({ versionId })
            .then(json => {
                if (json) {
                    try {
                        const parsed = JSON.parse(json);
                        this._parts = flattenBody(parsed);
                        this._restoreStudioMeta(parsed.studioMeta, parsed.header);
                        // Autofill: studioMeta wins; fall back to formSettings (legacy
                        // bodies / forms saved before studioMeta carried it). Reset per
                        // load so rules never leak across forms.
                        this._autofill =
                            (parsed.studioMeta && parsed.studioMeta.autofill) ||
                            (parsed.formSettings && parsed.formSettings.autofillRules) ||
                            [];
                    } catch (e) {
                        console.error('Error parsing layout:', e);
                        this._parts = EMPTY_PARTS;
                        this._restoreStudioMeta(null);
                        this._autofill = [];
                    }
                } else {
                    this._parts = EMPTY_PARTS;
                    this._restoreStudioMeta(null);
                    this._autofill = [];
                }
                // Mark this loaded state as the clean baseline.
                this._savedHash = JSON.stringify(this.serializeForm());
                // Switching forms/surveys → mount a fresh viewer so the preview
                // fully re-renders (not a stale live-reapply of the prior form).
                this._remountPreview();
            })
            .catch(err => {
                console.error('Error loading layout:', err);
                this._parts = EMPTY_PARTS;
                this._restoreStudioMeta(null);
                this._autofill = [];
                this._savedHash = JSON.stringify(this.serializeForm());
                this._remountPreview();
            });
    }

    // Restore the Design-panel state saved alongside the structure (studioMeta).
    // ALWAYS reset to defaults first, then overlay what this form provides — so
    // nothing leaks from the previously-loaded form (older forms carry no
    // studioMeta, or only some keys; without a reset the survey's layout/theme/
    // header would persist into the next form). bodyHeader is the loaded body's
    // own header, used when studioMeta has none (pre-studioMeta forms).
    _restoreStudioMeta(meta, bodyHeader) {
        const m = meta || {};
        this._layout = m.layout || 'stacked';
        this._themeId = m.themeId || 'cloud';
        this._skinId = m.skinId || 'light';
        this._accent = m.accent || '';
        this._spacing = m.spacing || 'comfortable';
        this._customTheme = m.customTheme ? { ...m.customTheme } : {};
        this._shell = m.shell ? { ...m.shell } : {};
        this._responsive = m.responsive ? { ...m.responsive } : {};
        const hdr = m.header ||
            (bodyHeader ? { title: bodyHeader.title || '', description: bodyHeader.subtitle || '' } : {});
        this._header = { arrangement: 'stacked', title: '', description: '', logo: '', highlight: '', ...hdr };
        this._buttons = { submitLabel: 'Submit', nextLabel: 'Next', backLabel: 'Back', alignment: 'right', ...(m.buttons || {}) };
        this._after = { action: 'message', message: 'Thank you! Your response has been recorded.', redirectUrl: '', ...(m.after || {}) };
        this.currentPageKey = null;
    }

    // ---- preview (real engine on the sample/loaded form) ----
    get parts() {
        return this._parts || EMPTY_PARTS;
    }
    get spec() {
        const pages = this.parts.pages || [];
        const sections = this.parts.sections || [];
        const s = materialize(this.currentLayout, pages, sections);
        s.density = this._spacing === 'compact' ? 'compact' : 'comfortable';
        // Buttons panel overrides the preset's submit alignment.
        if (s.shell && s.shell.submit) {
            s.shell.submit = { ...s.shell.submit, alignment: this._buttons.alignment };
        }
        this._applyShellOverlay(s);
        return s;
    }
    // Overlay the Design panel's structural settings onto the materialized spec.
    // Each is guarded so we never produce a combo the validator rejects.
    _applyShellOverlay(s) {
        const sh = this._shell || {};
        const shell = s.shell || (s.shell = { nav: 'scroll' });
        if (sh.maxWidth) shell.maxWidth = sh.maxWidth;
        if (sh.chrome) shell.chrome = sh.chrome;
        if (sh.progress) shell.progress = sh.progress;
        if (sh.headerStyle) shell.header = sh.headerStyle;
        if (shell.nav === 'stepper') {
            if (sh.stepperPlacement) shell.stepperPlacement = sh.stepperPlacement;
            if (sh.stepperMode) shell.stepperMode = sh.stepperMode;
        }
        if (shell.brandPanel) {
            if (sh.brandSide) shell.brandPanel.side = sh.brandSide;
            if (sh.brandWidth) shell.brandPanel.width = `${parseInt(sh.brandWidth, 10)}%`;
            if (Array.isArray(sh.brandContent)) shell.brandPanel.content = sh.brandContent;
            if (sh.brandSticky != null) shell.brandPanel.sticky = !!sh.brandSticky;
        }
        if (sh.submitPlacement && shell.submit) shell.submit.placement = sh.submitPlacement;
        const cb = (this._responsive || {}).collapseBelow;
        if (cb) s.responsive = { ...(s.responsive || {}), collapseBelow: cb };
    }
    // Compose customTheme: fold border width/style/color into the cardBorder
    // shorthand the Phase-0 override lane consumes.
    get _composedCustomTheme() {
        const ct = { ...(this._customTheme || {}) };
        if (ct.borderWidth != null || ct.borderStyle || ct.border) {
            const w = ct.borderWidth != null ? ct.borderWidth : 1;
            const st = ct.borderStyle || 'solid';
            const col = ct.border || 'var(--c-border, #d8dde6)';
            ct.cardBorder = st === 'none' || Number(w) === 0
                ? '0 solid transparent'
                : `${w}px ${st} ${col}`;
        }
        return ct;
    }
    get skin() {
        const ct = { ...this._composedCustomTheme };
        // Section padding: custom override wins, else the global spacing default.
        ct.sectionPadding = ct.sectionPadding || SPACING_PAD[this._spacing] || 'medium';
        const opts = { overrides: ct };
        if (this._accent) opts.accent = this._accent;
        const t = resolveTheme(this._themeId, this._skinId, opts);
        // CRITICAL: carry `overrides` on the resolved object. themeVars() re-resolves
        // an object that has a `.theme` string (resolveTheme(a.theme, a.skin, a)), so
        // without this the per-form custom tokens are dropped at render time.
        return { ...t, overrides: ct };
    }
    get previewWidth() {
        return this.device === 'mobile' ? '390px' : '';
    }
    get previewStageClass() {
        return this.device === 'mobile' ? 'pvstage mobile-mode' : 'pvstage desktop-mode';
    }
    // Only render the live runtime once there's something to render; otherwise a
    // clean empty state (no more dummy sample form).
    get hasContent() {
        return (this.parts.sections || []).length > 0;
    }
    get showLivePreview() {
        return this.hasContent;
    }
    get previewEmptyText() {
        if (!this.selectedFormId) return 'Select a form to preview it here.';
        return 'This form is empty — add sections and fields and they’ll appear here, live.';
    }

    // ---- WYSIWYG preview: render the live model through the REAL respondent
    // runtime (c/formViewer) instead of re-deriving chrome here. We serialize the
    // working model into the exact body-JSON shape formViewer parses and inject it
    // (no Apex, no DML). This serializer is also the inverse of formViewer's
    // flattenBody — the same shape Save/Publish will persist.
    serializeForm() {
        const parts = this.parts;
        const elsBySec = {};
        (parts.elements || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach((el) => {
                (elsBySec[el.sectionKey] = elsBySec[el.sectionKey] || []).push({
                    ...el,
                    id: el.key,
                    name: el.label,
                    type: el.type || 'Field'
                });
            });
        const secsByPage = {};
        (parts.sections || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach((s) => {
                const els = elsBySec[s.key] || [];
                let sectionJson;
                if (s.contextType === 'Related_Child') {
                    // A standalone Related List → a wrapper section carrying ONE
                    // relatedSection (the shape formSectionRenderer/c-form-repeater read).
                    sectionJson = {
                        id: `${s.key}__rlw`,
                        name: '',
                        showHeader: false,
                        sectionStyle: 'plain',
                        gridColumns: 1,
                        elements: [],
                        relatedSections: [{
                            id: s.key,
                            name: s.title || '',
                            isRepeatable: true,
                            relationshipName: s.relationshipName,
                            // runtime reads parentSObjectApi AS the child object
                            parentSObjectApi: s.childObjectApiName,
                            childObjectApiName: s.childObjectApiName,
                            linkingField: s.linkingField,
                            displayStyle: s.displayStyle || 'stacked',
                            addLabel: s.addLabel || '',
                            minRows: s.minRows != null ? s.minRows : 0,
                            maxRows: s.maxRows != null ? s.maxRows : 0,
                            gridColumns: s.gridColumns || 1,
                            elements: els
                        }]
                    };
                } else {
                    sectionJson = {
                        ...s,
                        id: s.key,
                        name: s.title || '',
                        sectionStyle: s.style,
                        gridColumns: s.gridColumns || 1,
                        elements: els
                    };
                    // Related lists are serialized as their own standalone wrapper
                    // sections — never re-nest a stale copy under a field-section.
                    delete sectionJson.relatedSections;
                }
                (secsByPage[s.pageKey] = secsByPage[s.pageKey] || []).push(sectionJson);
            });
        const pages = (parts.pages || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((p) => ({
                id: p.key,
                name: p.label || '',
                sections: secsByPage[p.key] || []
            }));

        return {
            header: {
                visible: true,
                title: this._header.title || '',
                subtitle: this._header.description || '',
                logo: this._header.logo || '',
                bgImage: this._header.bgImage || '',
                emblem: this._header.emblem || '',
                arrangement: this._header.arrangement || 'stacked',
                highlight: this._header.highlight || ''
            },
            formSettings: {
                // Resolved theme object passes straight through to the engine skin.
                theme: this.skin,
                submitLabel: this._buttons.submitLabel || 'Submit',
                labels: { next: this._buttons.nextLabel || 'Next', back: this._buttons.backLabel || 'Back' },
                thankYouMessage: this._after.message || 'Thank you!',
                afterSubmitMode: this._after.action === 'redirect' ? 'Redirect' : 'Message',
                redirectUrl: this._after.redirectUrl || '',
                // Form-level autofill rules the runtime (c/formViewer) reads & applies.
                autofillRules: this._autofill || []
            },
            layoutMode: this.isMultiPageLayout ? 'Multi_Page' : 'Single_Page',
            // Editor-only design state so the Design panels reload to the chosen
            // layout/theme/etc. The runtime (flattenBody) ignores this key.
            studioMeta: {
                layout: this.currentLayout,
                themeId: this._themeId,
                skinId: this._skinId,
                accent: this._accent,
                spacing: this._spacing,
                customTheme: { ...this._customTheme },
                shell: { ...this._shell },
                responsive: { ...this._responsive },
                header: { ...this._header },
                buttons: { ...this._buttons },
                after: { ...this._after },
                autofill: this._autofill || []
            },
            pages
        };
    }

    // The injected definition (mirrors the FormViewerController payload shape).
    get previewDefinition() {
        return {
            formName: this.currentForm?.Name || '',
            primaryObject: this.currentForm?.Primary_Context_Object__c || '',
            formType: this.currentForm?.Form_Type__c || 'Form',
            hasActiveVersion: true,
            bodyJson: JSON.stringify(this.serializeForm()),
            layoutSpecJson: JSON.stringify(this.spec)
        };
    }

    // ---- mode / panel state ----
    get isBuild() {
        return this.mode === 'build';
    }
    get isDesign() {
        return this.mode === 'design';
    }
    get appClass() {
        let c = 'app';
        if (this.mode === 'design') c += ' design';
        if (this.editorHidden) c += ' collapsed';
        return c;
    }
    get buildToggleClass() {
        return this.mode === 'build' ? 'on' : '';
    }
    get designToggleClass() {
        return this.mode === 'design' ? 'on' : '';
    }
    get railBuild() {
        return [
            { id: 'fields', label: 'Fields', icon: 'utility:text' },
            { id: 'insert', label: 'Insert', icon: 'utility:add' },
            { id: 'autofill', label: 'Autofill', icon: 'utility:magicwand' }
        ].map((i) => ({ ...i, cls: this.panel === i.id ? 'ico active' : 'ico' }));
    }
    get railDesign() {
        return [
            { id: 'canvas', label: 'Canvas', icon: 'utility:layout_banner' },
            { id: 'brand', label: 'Brand', icon: 'utility:image' },
            { id: 'type', label: 'Fields', icon: 'utility:text' },
            { id: 'flow', label: 'Flow', icon: 'utility:flow' }
        ].map((i) => ({ ...i, cls: this.panel === i.id ? 'ico active' : 'ico' }));
    }

    get panelTitle() {
        const map = {
            fields: 'Fields', insert: 'Insert', autofill: 'Autofill',
            canvas: 'Canvas & Frame', brand: 'Brand & Identity',
            type: 'Typography & Fields', flow: 'Interaction & Flow'
        };
        return map[this.panel] || '';
    }
    get panelSub() {
        if (this.panel === 'fields') {
            const objLabel = this.currentForm?.Primary_Context_Object__c || 'Account';
            return `${objLabel} · primary object`;
        }
        const map = {
            insert: 'Drag onto the form', autofill: 'Prefill from a source record',
            canvas: 'Shell, size & backdrops', brand: 'Logo, header & rails',
            type: 'Fonts, inputs & surfaces', flow: 'Accent, buttons & completion'
        };
        return map[this.panel] || '';
    }
    get isFields() { return this.panel === 'fields'; }
    get isInsert() { return this.panel === 'insert'; }
    get isAutofill() { return this.panel === 'autofill'; }
    // ---- autofill (form-level prefill rules) — rail list + single-rule modal,
    //      mirroring the visibility-rules pattern (parent owns list + persistence)
    get autofillRules() { return this._autofill; }
    get autofillObject() { return (this.currentForm && this.currentForm.Primary_Context_Object__c) || ''; }
    get hasAutofillObject() { return !!this.autofillObject; }
    get hasAutofillRules() { return (this._autofill || []).length > 0; }
    get autofillSummaries() {
        return (this._autofill || []).map((r, i) => {
            const n = (r.mappings || []).filter((m) => m.from && m.to).length;
            const obj = r.sourceObject || 'a record';
            const via = r.sourceType === 'url'
                ? `URL ?${r.urlParam || '…'}`
                : `via ${r.lookupField || '…'}`;
            return {
                key: `af-${i}`,
                index: i,
                sourceText: `From ${obj} · ${via}`,
                mapText: n === 1 ? 'Fills 1 field' : `Fills ${n} fields`
            };
        });
    }
    // The rule handed to the modal; null while creating a new one.
    get editingAutofillRule() {
        return this._afEditIndex >= 0 ? this._autofill[this._afEditIndex] : null;
    }
    handleNewAutofill() {
        this._afEditIndex = -1;
        this.showAutofillModal = true;
    }
    handleEditAutofill(e) {
        this._afEditIndex = parseInt(e.currentTarget.dataset.index, 10);
        this.showAutofillModal = true;
    }
    handleDeleteAutofill(e) {
        const i = parseInt(e.currentTarget.dataset.index, 10);
        const next = [...(this._autofill || [])];
        next.splice(i, 1);
        this._autofill = next;
    }
    handleAutofillSave(e) {
        const rule = e.detail && e.detail.rule;
        if (rule) {
            const next = [...(this._autofill || [])];
            if (this._afEditIndex >= 0) next[this._afEditIndex] = rule;
            else next.push(rule);
            this._autofill = next;
        }
        this.showAutofillModal = false;
    }
    handleAutofillModalCancel() { this.showAutofillModal = false; }
    get isLayout() { return this.panel === 'layout'; }
    get isTheme() { return this.panel === 'theme'; }
    get isHeaderPanel() { return this.panel === 'header'; }
    get isButtons() { return this.panel === 'buttons'; }
    get isAfter() { return this.panel === 'after'; }

    // ================= DESIGN PANELS (drive the live preview) =================
    // --- Layout: 8 presets in 3 groups, theme-tinted c/layoutThumb mockups ---
    get layoutGroups() {
        return LAYOUT_GROUPS.map((g) => ({
            id: g.id,
            label: g.label,
            hint: g.hint,
            layouts: g.layouts.map((id) => ({
                id,
                label: LAYOUT_LABELS[id] || id,
                themeId: this._themeId,
                skinId: this._skinId,
                accent: this._accent,
                cls: this.currentLayout === id ? 'lay-card is-on' : 'lay-card'
            }))
        }));
    }

    // --- Theme & Color: theme (7) → skin (per-theme) → accent ---
    get themeOptions() {
        return THEME_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            cls: this._themeId === o.value ? 'th-chip is-on' : 'th-chip'
        }));
    }
    get skinOptions() {
        return skinsForTheme(this._themeId).map((o) => ({
            value: o.value,
            label: o.label,
            cls: this._skinId === o.value ? 'sk-chip is-on' : 'sk-chip'
        }));
    }
    get spacingOptions() {
        const cur = this._spacing;
        return [
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'spacious', label: 'Spacious' }
        ].map((o) => ({ ...o, cls: o.value === cur ? 'sk-chip on' : 'sk-chip' }));
    }
    get accentSwatches() {
        return ACCENT_SWATCHES.map((c) => ({
            color: c,
            style: `background:${c};`,
            cls: this._accent === c ? 'ac-sw is-on' : 'ac-sw'
        }));
    }
    get accentValue() { return this._accent || (this.skin && this.skin.accent) || '#6366f1'; }
    get accentIsDefault() { return !this._accent; }

    // --- Header arrangement ---
    get headerArrangeOptions() {
        return [
            { value: 'stacked', label: 'Stacked' },
            { value: 'inline', label: 'Inline' },
            { value: 'logoBeside', label: 'Logo beside' },
            { value: 'textOnly', label: 'Text only' }
        ].map((o) => ({ ...o, selected: this._header.arrangement === o.value }));
    }
    get headerTitleVal() { return this._header.title; }
    get headerDescVal() { return this._header.description; }
    get headerLogoVal() { return this._header.logo; }
    get headerHighlightVal() { return this._header.highlight; }

    // --- Buttons ---
    get submitLabelVal() { return this._buttons.submitLabel; }
    get nextLabelVal() { return this._buttons.nextLabel; }
    get backLabelVal() { return this._buttons.backLabel; }
    get showNavLabels() { return this.isMultiPageLayout; }
    get alignLeftClass() { return this._buttons.alignment === 'left' ? 'seg on' : 'seg'; }
    get alignCenterClass() { return this._buttons.alignment === 'center' ? 'seg on' : 'seg'; }
    get alignRightClass() { return this._buttons.alignment === 'right' ? 'seg on' : 'seg'; }

    // --- After submit ---
    get afterOptions() {
        return [
            { value: 'message', label: 'Show a thank-you message' },
            { value: 'redirect', label: 'Redirect to a URL' }
        ].map((o) => ({ ...o, selected: this._after.action === o.value }));
    }
    get afterIsMessage() { return this._after.action === 'message'; }
    get afterIsRedirect() { return this._after.action === 'redirect'; }
    get afterMessageVal() { return this._after.message; }
    get afterRedirectVal() { return this._after.redirectUrl; }

    // ---- field list (inline "• required" legend, NOT a separate list) ----
    // fieldApiNames already placed on the form (dedupe target). Object fields only.
    get usedFieldApis() {
        const set = new Set();
        (this.parts.elements || []).forEach((e) => {
            if ((e.type || 'Field') === 'Field' && e.fieldApiName) {
                set.add(e.fieldApiName.toLowerCase());
            }
        });
        return set;
    }
    get fieldRows() {
        const term = this.search.trim().toLowerCase();
        const used = this.usedFieldApis;
        return this.objectFields.filter(
            (f) => !term || f.label.toLowerCase().includes(term) || f.apiName.toLowerCase().includes(term)
        ).map((f) => {
            const isUsed = used.has(f.apiName.toLowerCase());
            return {
                key: f.apiName,
                api: f.apiName,
                label: f.label,
                required: f.required,
                icon: FIELD_ICONS[f.type] || 'utility:text',
                isUsed,
                itemClass: isUsed ? 'item is-used' : 'item',
                draggable: isUsed ? 'false' : 'true'
            };
        });
    }
    get insertGroups() {
        const groups = {};
        ELEMENT_TYPES.forEach((e) => {
            (groups[e.group] = groups[e.group] || []).push(e);
        });
        return Object.keys(groups).map((g) => ({ key: g, label: g, items: groups[g] }));
    }

    // ---- layout family + pages ----
    // Stepped layouts (wizard/sideNav/splitHero) keep pages as steps; flowing
    // layouts (Single_Page family) flatten every page into one top-to-bottom flow.
    get currentLayout() {
        return this._layout || 'stacked';
    }
    get isMultiPageLayout() {
        // Continuous-flow layouts flatten to one page; everything else paginates.
        return !CONTINUOUS_LAYOUTS.has(this.currentLayout);
    }
    get pageList() {
        const pages = (this.parts.pages || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        return pages.length ? pages : [{ key: 'p1', label: 'Page 1', order: 1 }];
    }
    get activePageKey() {
        const pages = this.pageList;
        if (this.currentPageKey && pages.some((p) => p.key === this.currentPageKey)) {
            return this.currentPageKey;
        }
        return pages[0].key;
    }
    get showPageStrip() {
        return this.isMultiPageLayout;
    }
    get pageTabs() {
        const active = this.activePageKey;
        return this.pageList.map((p, i) => {
            const isActive = p.key === active;
            let cls = 'bp-page';
            if (isActive) cls += ' is-active';
            return {
                key: p.key,
                label: p.label || `Page ${i + 1}`,
                isActive,
                isRenaming: this.renamingPageKey === p.key,
                cls
            };
        });
    }
    _pageIndex(pageKey) {
        const i = this.pageList.findIndex((p) => p.key === pageKey);
        return i < 0 ? 0 : i;
    }
    // Sections to render in the blueprint right now: the active page only when
    // stepped; every section (page-ordered) when flowing.
    get _visibleSections() {
        const all = this.parts.sections || [];
        if (!this.isMultiPageLayout) {
            return all.slice().sort(
                (a, b) => (this._pageIndex(a.pageKey) - this._pageIndex(b.pageKey)) || ((a.order || 0) - (b.order || 0))
            );
        }
        const pk = this.activePageKey;
        const first = this.pageList[0].key;
        return all
            .filter((s) => (s.pageKey || first) === pk)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    // Data-context signature — fields can only move between sections that share it
    // (a Related-list section's fields stay in that related object; parent stays parent).
    _sectionContextSig(s) {
        if (!s) return 'parent';
        return s.contextType === 'Related_Child' ? `rel:${s.parentSObjectApi || ''}` : 'parent';
    }
    // A content block = a chromeless, page-level section holding one full-width
    // element (Hero/Image/…). It's a sibling of field-sections, never nested, and
    // never holds fields. (style 'plain' is also a legit field-section style, so we
    // key off an explicit flag — not the style.)
    _isContentBlockSection(s) {
        return !!(s && (s.contentBlock || s.key === 'hero'));
    }

    // ---- blueprint (structural render) ----
    get blueprintSections() {
        const elements = this.parts.elements || [];
        return this._visibleSections.map((s) => {
            const isContentBlock = this._isContentBlockSection(s);
            const cols = s.gridColumns || 1;
            const els = elements
                .filter((e) => e.sectionKey === s.key)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((e) => {
                    const isHero = e.type === 'Hero';
                    const isField = e.type === 'Field';
                    // Full in the schematic if it's an always-full type OR it spans
                    // every column (colSpan ≥ cols; content blocks are 1-col → full).
                    const isFull = isHero || FULL_WIDTH_TYPES.has(e.type) || Number(e.colSpan || 1) >= cols;
                    let cls = this.selectedKey === e.key ? 'bp-el is-sel' : 'bp-el';
                    if (isFull) cls += ' is-full';
                    // How many of the section's columns this chip spans in the schematic.
                    const span = Math.min(isFull ? cols : Number(e.colSpan || 1), cols);
                    return {
                        key: e.key,
                        sectionKey: s.key,
                        isHero,
                        isField,
                        isContent: !isHero && !isField,
                        typeLabel: (e.type || 'Field').replace(/_/g, ' '),
                        label: e.label || e.headline || e.type,
                        required: !!e.required,
                        // content-block elements drag via the block head, not themselves
                        drag: isContentBlock ? 'false' : 'true',
                        // content-block elements (hero etc.) are deleted via the block-head
                        // × — a per-element × would overlap the schematic and be redundant
                        delEl: !isContentBlock,
                        gridStyle: `grid-column: span ${span};`,
                        selCls: cls
                    };
                });
            const base = isContentBlock ? 'bp-block' : 'bp-sec';
            let selCls = base;
            if (!isContentBlock && this.selectedKey === s.key) selCls += ' is-sel';
            // Drop highlight (drop-on/drop-before) is added imperatively while dragging.
            return {
                key: s.key,
                isContentBlock,
                // The block's single element — clicking the block head selects IT (so the
                // element + Block-style inspector opens), not the wrapping section.
                elKey: (els[0] && els[0].key) || null,
                // The drop zone that precedes this section (highlights on drag-over).
                gapCls: 'bp-gap',
                blockLabel: isContentBlock ? ((els[0] && els[0].typeLabel) || 'Block') : '',
                title: s.title || 'Section',
                ctxLabel: s.contextType === 'Related_Child' ? `↻ ${s.childObjectApiName || 'Related'}` : '',
                desc: s.description || '',
                cols: s.gridColumns || 1,
                gridCls: `bp-fields bp-cols-${cols}`,
                selCls,
                showEmptyDrop: !isContentBlock && els.length === 0,
                elements: els
            };
        });
    }

    get endGapCls() {
        return 'bp-gap bp-gap-end'; // is-over added imperatively while dragging
    }

    // ---- selection / property inspector ----
    get selectedSection() {
        return (this.parts.sections || []).find((s) => s.key === this.selectedKey) || null;
    }
    get selectedElement() {
        return (this.parts.elements || []).find((e) => e.key === this.selectedKey) || null;
    }
    get inspectorOpen() {
        return this.isBuild && !!this.selectedKey && !!(this.selectedSection || this.selectedElement);
    }
    get isSelSection() { return !!this.selectedSection; }
    get isSelHero() { return !!this.selectedElement && this.selectedElement.type === 'Hero'; }
    get isSelField() { return !!this.selectedElement && this.selectedElement.type === 'Field'; }
    get isSelContent() {
        const el = this.selectedElement;
        return !!el && el.type !== 'Hero' && el.type !== 'Field';
    }
    get selType() { return (this.selectedElement && this.selectedElement.type) || ''; }
    get isSelImage() { return this.selType === 'Image'; }
    get isSelCallout() { return this.selType === 'Callout'; }
    get isSelSpacer() { return this.selType === 'Spacer'; }
    get isSelConsent() { return this.selType === 'Consent'; }
    get isSelDivider() { return this.selType === 'Divider'; }
    get isSelDisplayText() { return this.selType === 'Rich_Text' || this.selType === 'Static_Text'; }
    get isSelFileUpload() { return this.selType === 'File_Upload'; }
    // A field-section bound to a child relationship (repeater) — its inspector is
    // owned by the related-list workstream, so flag it rather than show field props.
    get isSelRelated() {
        const s = this.selectedSection;
        return !!s && (s.contextType === 'Related_Child' || s.relatedIndex != null);
    }
    get inspectorTitle() {
        if (this.isSelSection) return this.isSelRelated ? 'Related list' : 'Section';
        if (this.isSelHero) return 'Hero';
        if (this.isSelField) return 'Field';
        if (this.isSelImage) return 'Image';
        if (this.isSelCallout) return 'Callout';
        if (this.isSelSpacer) return 'Spacer';
        if (this.isSelConsent) return 'Consent';
        if (this.isSelDivider) return 'Divider';
        if (this.isSelDisplayText) return 'Display text';
        if (this.isSelFileUpload) return 'File upload';
        if (this.isSelEmptySpace) return 'Empty space';
        return 'Element';
    }
    get headerTitle() { return this.inspectorOpen ? this.inspectorTitle : this.panelTitle; }
    get headerSub() { return this.inspectorOpen ? 'Edit properties' : this.panelSub; }

    // selected-value convenience getters (inspector inputs)
    get selLabel() { return (this.selectedElement && this.selectedElement.label) || ''; }
    get selRequired() { return !!(this.selectedElement && this.selectedElement.required); }
    get selHeadline() { return (this.selectedElement && this.selectedElement.headline) || ''; }
    get selSubtext() { return (this.selectedElement && this.selectedElement.subtext) || ''; }
    get selCta() { return (this.selectedElement && this.selectedElement.cta) || {}; }
    get selCtaLabel() { return this.selCta.label || ''; }
    get selCtaAction() { return this.selCta.action || 'start'; }
    get selCtaHref() { return this.selCta.href || ''; }
    get selCtaIsLink() { return this.selCtaAction === 'link'; }
    get selTitle() { return (this.selectedSection && this.selectedSection.title) || ''; }
    // ---- related-list (Related_Child) section inspector ----
    get selRelChildObject() { return (this.selectedSection && this.selectedSection.childObjectApiName) || ''; }
    get selRelStyle() { return (this.selectedSection && this.selectedSection.displayStyle) || 'stacked'; }
    get relStyleOptions() {
        const cur = this.selRelStyle;
        return [
            { value: 'stacked', label: 'Stacked cards' },
            { value: 'table', label: 'Table / grid' },
            { value: 'tile', label: 'Tiles + modal' }
        ].map((o) => ({ ...o, selected: o.value === cur }));
    }
    get selRelAddLabel() { return (this.selectedSection && this.selectedSection.addLabel) || ''; }
    get selRelMinRows() { const v = this.selectedSection && this.selectedSection.minRows; return v != null ? v : 0; }
    get selRelMaxRows() { const v = this.selectedSection && this.selectedSection.maxRows; return v != null ? v : 0; }
    // Child-object fields offered for the selected related section (added via the
    // inspector, since the left panel shows the inspector — not the Fields list —
    // while a section is selected). Dedups against fields already in THIS section.
    get relatedFieldRows() {
        if (!this.isSelRelated) return [];
        const secKey = this.selectedKey;
        const used = new Set(
            (this.parts.elements || [])
                .filter((el) => el.sectionKey === secKey && el.fieldApiName)
                .map((el) => el.fieldApiName.toLowerCase())
        );
        return (this.relatedFields || []).map((f) => {
            const isUsed = used.has(f.apiName.toLowerCase());
            return {
                key: f.apiName,
                api: f.apiName,
                label: f.label,
                icon: FIELD_ICONS[f.type] || 'utility:text',
                isUsed,
                itemClass: isUsed ? 'rel-fld is-used' : 'rel-fld'
            };
        });
    }
    get hasRelatedFields() { return this.relatedFieldRows.length > 0; }
    get selStyle() { return (this.selectedSection && this.selectedSection.style) || 'card'; }
    get selCols() { return Number((this.selectedSection && this.selectedSection.gridColumns) || 1); }
    get col1Class() { return this.selCols === 1 ? 'seg on' : 'seg'; }
    get col2Class() { return this.selCols === 2 ? 'seg on' : 'seg'; }
    get col3Class() { return this.selCols === 3 ? 'seg on' : 'seg'; }
    get col4Class() { return this.selCols === 4 ? 'seg on' : 'seg'; }
    get reqBtnClass() { return this.selRequired ? 'req-toggle on' : 'req-toggle'; }
    get reqBtnLabel() { return this.selRequired ? 'Required' : 'Optional'; }
    get selShowHeader() { return !this.selectedSection || this.selectedSection.showHeader !== false; }
    get showHeaderBtnClass() { return this.selShowHeader ? 'req-toggle on' : 'req-toggle'; }
    get showHeaderBtnLabel() { return this.selShowHeader ? 'Header shown' : 'Header hidden'; }
    // ---- section description / collapsible (padding is a GLOBAL setting, not per-section) ----
    get selDescription() { return (this.selectedSection && this.selectedSection.description) || ''; }
    get selCollapsible() { return !!(this.selectedSection && this.selectedSection.collapsible); }
    get collapsibleBtnClass() { return this.selCollapsible ? 'req-toggle on' : 'req-toggle'; }
    get collapsibleBtnLabel() { return this.selCollapsible ? 'Collapsible' : 'Not collapsible'; }
    get selCollapsedDefault() { return !!(this.selectedSection && this.selectedSection.collapsedByDefault); }
    get collapsedDefaultBtnClass() { return this.selCollapsedDefault ? 'req-toggle on' : 'req-toggle'; }
    get collapsedDefaultBtnLabel() { return this.selCollapsedDefault ? 'Starts collapsed' : 'Starts open'; }
    // Section header icon picker
    get selIcon() { return (this.selectedSection && this.selectedSection.icon) || ''; }
    get hasSelIcon() { return !!this.selIcon; }
    get iconChoices() {
        const term = (this.iconSearch || '').trim().toLowerCase();
        const cur = this.selIcon;
        return SECTION_ICONS
            .filter((n) => !term || n.includes(term))
            .map((n) => {
                const name = `utility:${n}`;
                return { name, key: name, btnClass: name === cur ? 'ic-choice on' : 'ic-choice' };
            });
    }
    get ctaIsStart() { return this.selCtaAction === 'start'; }
    get hasNoFields() { return this.fieldRows.length === 0; }

    // ---- content-element inspector values (renderer reads these keys directly) ----
    get selContent() { return (this.selectedElement && this.selectedElement.content) || ''; }
    // Image + Hero share imageUrl/imageVersionId/imageAlt.
    get selImageUrl() { return (this.selectedElement && this.selectedElement.imageUrl) || ''; }
    get selHasImage() { return !!this.selImageUrl; }
    get selImageAlt() { return (this.selectedElement && this.selectedElement.imageAlt) || ''; }
    get uploadBtnLabel() {
        if (this._uploading) return 'Uploading…';
        return this.selHasImage ? 'Replace image' : 'Upload image';
    }
    get selImageSize() { return (this.selectedElement && this.selectedElement.imageSize) || 'medium'; }
    get imageSizeOptions() {
        const cur = this.selImageSize;
        return IMAGE_SIZE_OPTIONS.map((o) => ({ ...o, selected: o.value === cur }));
    }
    get selCalloutVariant() { return (this.selectedElement && this.selectedElement.calloutVariant) || 'info'; }
    get calloutVariantOptions() {
        const cur = this.selCalloutVariant;
        return CALLOUT_VARIANT_OPTIONS.map((o) => ({ ...o, selected: o.value === cur }));
    }
    get selSpacerSize() { return (this.selectedElement && this.selectedElement.spacerSize) || 'medium'; }
    get spacerSizeOptions() {
        const cur = this.selSpacerSize;
        return SPACER_SIZE_OPTIONS.map((o) => ({ ...o, selected: o.value === cur }));
    }
    get selConsentRequired() { return !this.selectedElement || this.selectedElement.consentRequired !== false; }
    get consentReqBtnClass() { return this.selConsentRequired ? 'req-toggle on' : 'req-toggle'; }
    get consentReqBtnLabel() { return this.selConsentRequired ? 'Required' : 'Optional'; }
    get isSelEmptySpace() { return this.selType === 'Empty_Space'; }
    // Content elements that show their own props (label, type fields) — Empty space
    // is content-typed but has no label/content, only a width.
    get isSelContentEditable() { return this.isSelContent && !this.isSelEmptySpace; }

    // ---- per-element width (field + empty space) inside a multi-column section ----
    get selElementSection() {
        const el = this.selectedElement;
        if (!el) return null;
        return (this.parts.sections || []).find((s) => s.key === el.sectionKey) || null;
    }
    get selFieldCols() { return Number((this.selElementSection && this.selElementSection.gridColumns) || 1); }
    // Content that sizes like a field (everything except the always-full types).
    get isSelSizableContent() { return this.isSelContentEditable && !FULL_WIDTH_TYPES.has(this.selType); }
    get showWidth() {
        return (this.isSelField || this.isSelEmptySpace || this.isSelSizableContent) && this.selFieldCols > 1;
    }
    // Empty space dropped in a 1-column section can't be sized — explain why.
    get showEmptySpaceNote() { return this.isSelEmptySpace && this.selFieldCols <= 1; }
    get selColSpan() { return Number((this.selectedElement && this.selectedElement.colSpan) || 1); }
    get widthOptions() {
        const n = this.selFieldCols;
        const cur = Math.min(this.selColSpan, n);
        const opts = [];
        for (let k = 1; k <= n; k++) {
            opts.push({
                value: String(k),
                label: k === n ? 'Full width' : (k === 1 ? '1 column' : `${k} columns`),
                selected: k === n ? cur >= n : cur === k
            });
        }
        return opts;
    }

    // ---- standalone content-block style (card/plain/boxed) ----
    // Only when the selected content/hero element is alone in its own content block.
    get selElementBlock() {
        const s = this.selElementSection;
        return s && this._isContentBlockSection(s) ? s : null;
    }
    get isSelStandaloneBlock() {
        // Divider/Callout/Spacer are always plain — no style picker for them.
        return (this.isSelContentEditable || this.isSelHero)
            && !!this.selElementBlock
            && !PLAIN_ONLY_BLOCK_TYPES.has(this.selType);
    }
    get selBlockStyle() { return (this.selElementBlock && this.selElementBlock.style) || 'plain'; }
    get blockStyleOptions() {
        const cur = this.selBlockStyle;
        return [
            { value: 'plain', label: 'Plain' },
            { value: 'card', label: 'Card' },
            { value: 'boxed', label: 'Boxed' }
        ].map((o) => ({ ...o, selected: o.value === cur }));
    }

    // ---- full FIELD property inspector (ported from zPropertyPanel) ----
    get elFieldApi() { return (this.selectedElement && this.selectedElement.fieldApiName) || ''; }
    get hasFieldApi() { return !!this.elFieldApi; }
    get elFieldType() { return (this.selectedElement && this.selectedElement.fieldType) || ''; }
    get elBehavior() {
        const el = this.selectedElement;
        if (!el) return 'None';
        return el.uiBehavior || (el.required ? 'Required' : 'None');
    }
    get behaviorOptions() {
        const cur = this.elBehavior;
        return [
            { label: 'Editable', value: 'None' },
            { label: 'Required', value: 'Required' },
            { label: 'Read only', value: 'Read_Only' },
            { label: 'Hidden (prefilled)', value: 'Hidden' }
        ].map((o) => ({ ...o, selected: o.value === cur }));
    }
    get elHelpText() { return (this.selectedElement && this.selectedElement.helpText) || ''; }
    get elPlaceholder() { return (this.selectedElement && this.selectedElement.placeholder) || ''; }
    get elRenderAs() { return (this.selectedElement && this.selectedElement.renderAs) || 'Default'; }
    get renderAsOptions() {
        const ft = this.elFieldType;
        const opts = [{ label: 'Default (from schema)', value: 'Default' }];
        if (['STRING', 'TEXTAREA'].includes(ft)) {
            opts.push({ label: 'Dropdown', value: 'Dropdown' }, { label: 'Radio buttons', value: 'Radio_Buttons' }, { label: 'Checkbox group', value: 'Checkbox_Group' });
        }
        if (ft === 'PICKLIST') {
            opts.push({ label: 'Radio buttons', value: 'Radio_Buttons' }, { label: 'Dropdown', value: 'Dropdown' });
        }
        if (ft === 'MULTIPICKLIST') {
            opts.push({ label: 'Checkbox group', value: 'Checkbox_Group' }, { label: 'Multi-select dropdown', value: 'Custom_MultiSelect' });
        }
        if (ft === 'BOOLEAN') {
            opts.push({ label: 'Toggle', value: 'Toggle' }, { label: 'Checkbox', value: 'Default' });
        }
        if (['DOUBLE', 'INTEGER', 'CURRENCY', 'PERCENT'].includes(ft)) {
            opts.push({ label: 'Slider', value: 'Slider' });
        }
        if (ft === 'REFERENCE') {
            opts.push({ label: 'Lookup typeahead', value: 'Lookup_Typeahead' }, { label: 'Lookup modal', value: 'Lookup_Modal' });
        }
        const cur = this.elRenderAs;
        return opts.map((o) => ({ ...o, selected: o.value === cur }));
    }
    get hasRenderAsChoices() { return this.renderAsOptions.length > 1; }
    get isSliderRender() { return this.elRenderAs === 'Slider'; }
    get showCustomValues() {
        const ra = this.elRenderAs;
        const ft = this.elFieldType;
        return ['Dropdown', 'Radio_Buttons', 'Checkbox_Group', 'Custom_MultiSelect'].includes(ra)
            && ['STRING', 'TEXTAREA', 'PICKLIST', 'MULTIPICKLIST'].includes(ft);
    }
    get customOptions() {
        try {
            const arr = JSON.parse((this.selectedElement && this.selectedElement.customOptionsJson) || '[]');
            return arr.map((o, i) => ({ label: o.label || '', value: o.value || '', key: `opt-${i}`, index: i }));
        } catch {
            return [];
        }
    }
    get elSliderMin() { const v = this.selectedElement && this.selectedElement.sliderMin; return v != null ? v : 0; }
    get elSliderMax() { const v = this.selectedElement && this.selectedElement.sliderMax; return v != null ? v : 100; }
    get elSliderStep() { const v = this.selectedElement && this.selectedElement.sliderStep; return v != null ? v : 1; }
    get elUrlPrefill() { return (this.selectedElement && this.selectedElement.urlPrefillParam) || ''; }

    // ---- visibility rules (shared by field + section; reuses c/zVisibilityEditor) ----
    get showVisibility() { return this.isSelField || this.isSelSection; }
    get selVisibilityJson() {
        const node = this.selectedElement || this.selectedSection;
        return (node && node.visibilityExpression) || '';
    }
    get visObjectLabel() { return (this.currentForm && this.currentForm.Primary_Context_Object__c) || ''; }
    get visFields() { return this.objectFields; }
    get visContextLabel() { return this.isSelSection ? (this.selTitle || 'Section') : (this.selLabel || 'Field'); }
    get visibilitySummary() {
        let cfg;
        try {
            cfg = this.selVisibilityJson ? JSON.parse(this.selVisibilityJson) : null;
        } catch {
            cfg = null;
        }
        const rules = (cfg && cfg.rules) || [];
        if (!rules.length) return null;
        const OP = {
            equals: 'equals', notEqual: 'does not equal', contains: 'contains',
            notContains: 'does not contain', startsWith: 'starts with',
            greaterThan: '>', lessThan: '<', greaterOrEqual: '≥', lessOrEqual: '≤',
            isNull: 'is blank', isNotNull: 'is not blank'
        };
        const NO_VAL = { isNull: true, isNotNull: true };
        const items = rules.map((r, i) => {
            const op = OP[r.operator] || r.operator;
            const val = NO_VAL[r.operator] ? '' : ` "${r.value == null ? '' : r.value}"`;
            return { key: `vr-${i}`, text: `${r.field} ${op}${val}` };
        });
        let logicText = 'Show when ALL match:';
        if (cfg.logic === 'any') logicText = 'Show when ANY matches:';
        if (cfg.logic === 'custom') logicText = 'Show on custom logic:';
        return { logicText, items };
    }
    get hasVisibility() { return !!this.visibilitySummary; }
    get visBtnLabel() { return this.hasVisibility ? 'Edit visibility rules' : 'Add visibility rules'; }

    // ---- top-bar getters ----
    get formsSegClass() {
        return this.primaryTab === 'forms' ? 'on' : '';
    }
    get surveysSegClass() {
        return this.primaryTab === 'surveys' ? 'on' : '';
    }
    get formTitleLabel() {
        return this.currentForm ? this.currentForm.Name : (this.primaryTab === 'surveys' ? 'Select a survey' : 'Select a form');
    }
    get versionPillLabel() {
        if (!this.currentVersion) return 'Select a version';
        const num = this.currentVersion.Version_Number__c;
        const status = this.currentVersion.Is_Active__c ? 'Published' : 'Draft';
        return `v${num} (${status})`;
    }
    get versionPillClass() {
        return this.isDraft ? 'ddl ver' : 'ddl ver published';
    }
    get isDraft() {
        return this.currentVersion && !this.currentVersion.Is_Active__c;
    }

    // ---- save / publish state ----
    get isDirty() {
        if (this._savedHash === null) return false;
        return this._savedHash !== JSON.stringify(this.serializeForm());
    }
    get saveStateLabel() {
        if (this._saving) return 'Saving…';
        return this.isDirty ? 'Unsaved changes' : 'All changes saved';
    }
    get saveStateIcon() {
        return this.isDirty ? 'utility:edit' : 'utility:check';
    }
    get saveDisabled() {
        return !this.selectedFormId || this._saving || (!this.isDirty && !!this.selectedVersionId);
    }
    get publishDisabled() {
        if (!this.selectedFormId || this._saving) return true;
        // An active version with no pending changes has nothing new to publish.
        if (this.currentVersion && this.currentVersion.Is_Active__c && !this.isDirty) return true;
        return false;
    }
    get formOptions() {
        return this.filteredForms.map((f) => ({
            label: f.Primary_Context_Object__c
                ? `${f.Name} (${f.Primary_Context_Object__c})`
                : f.Name,
            value: f.Id
        }));
    }
    get versionOptions() {
        return this.versions.map((v) => ({
            label: `v${v.Version_Number__c} (${v.Is_Active__c ? "Published" : "Draft"})`,
            value: v.Id
        }));
    }
    get hasNoForms() {
        return this.filteredForms.length === 0;
    }
    get anyMenuOpen() {
        return this.showFormMenu || this.showVersionMenu;
    }
    get hasFormSelected() {
        return !!this.selectedFormId;
    }
    get hasVersionSelected() {
        return !!this.selectedVersionId && !!this.currentVersion;
    }
    get filteredForms() {
        const wantType = this.primaryTab === 'surveys' ? 'Survey' : 'Form';
        return this.forms.filter((f) => (f.Form_Type__c || 'Form') === wantType);
    }
    get desktopBtnClass() { return this.device === 'desktop' ? 'dev-btn is-on' : 'dev-btn'; }
    get mobileBtnClass() { return this.device === 'mobile' ? 'dev-btn is-on' : 'dev-btn'; }
    get hideEditorLabel() { return this.editorHidden ? 'Show editor' : 'Hide editor'; }

    // ---- handlers ----
    handlePrimaryTabChange(event) {
        const tab = event.currentTarget.dataset.tab;
        if (tab === this.primaryTab) return;
        this.primaryTab = tab;
        this.selectedFormId = null;
        this.selectedVersionId = null;
        this.currentForm = null;
        this.currentVersion = null;
        this.versions = [];
        this.objectFields = [];
        this._parts = EMPTY_PARTS;
        this.autoSelectFirstForm();
    }

    handlePickForm(event) {
        const formId = event.currentTarget.dataset.id;
        this.closeMenus();
        if (formId === this.selectedFormId) return;
        this.selectForm(formId);
    }

    handlePickVersion(event) {
        const versionId = event.currentTarget.dataset.id;
        this.closeMenus();
        if (versionId === this.selectedVersionId) return;
        this.selectVersion(versionId);
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

    // ---- creation gallery (New form / New survey) ----
    // The gallery is the create surface; it owns the templates/preview and emits
    // formcreated{formId,versionId} after createFromTemplate has done the DML. The
    // mode follows the active tab so a survey-tab create makes a Survey.
    get galleryMode() { return this.primaryTab === 'surveys' ? 'survey' : 'form'; }
    get newItemLabel() { return this.primaryTab === 'surveys' ? 'New survey' : 'New form'; }
    get emptyTitle() { return this.primaryTab === 'surveys' ? 'No surveys yet' : 'No forms yet'; }
    get emptyDesc() {
        return this.primaryTab === 'surveys'
            ? 'Start a survey from a template or a blank layout.'
            : 'Start a form from a template or a blank layout.';
    }
    handleOpenGallery() {
        this.closeMenus();
        this.showGallery = true;
    }
    handleGalleryClose() {
        this.showGallery = false;
    }
    // A form was just created — close the gallery and open it in the builder.
    async handleFormCreated(event) {
        const { formId } = (event && event.detail) || {};
        this.showGallery = false;
        if (!formId) return;
        // The new Form__c isn't in the cached wire yet — refresh, then select it.
        await refreshApex(this.wiredFormsResult);
        const form = (this.forms || []).find((f) => f.Id === formId);
        // Land on the tab matching what was created (survey-tab create → Survey).
        this.primaryTab = form && (form.Form_Type__c || 'Form') === 'Survey' ? 'surveys' : 'forms';
        // selectForm sets selectedFormId → the versions wire refetches and
        // autoSelectFirstVersion loads the draft into the blueprint.
        this.selectForm(formId);
        this.mode = 'build';
        if (!BUILD_PANELS.includes(this.panel)) this.panel = 'fields';
    }

    handleBuild() { this.mode = 'build'; if (!BUILD_PANELS.includes(this.panel)) this.panel = 'fields'; }
    handleDesign() { this.mode = 'design'; if (!DESIGN_PANELS.includes(this.panel)) this.panel = 'canvas'; }
    handleRail(e) { this.panel = e.currentTarget.dataset.id; this.selectedKey = null; }
    handleSearch(e) { this.search = e.target.value; }
    handleSelect(e) {
        // Always select (never toggle off) — a second click, or the second click of a
        // double-click, must NOT close the property panel. Deselect is via the
        // inspector's close button / clicking empty canvas.
        this.selectedKey = e.currentTarget.dataset.key;
        this._maybeLoadRelatedFields();
    }

    // ---- save / publish ----
    _errMsg(e, fallback) {
        return (e && e.body && e.body.message) || (e && e.message) || fallback;
    }
    // Ensure there's a DRAFT version to write to. Published versions are
    // read-only, so editing one auto-forks a new draft (the chosen model).
    async _ensureDraftVersion() {
        const needDraft =
            !this.selectedVersionId ||
            (this.currentVersion && this.currentVersion.Is_Active__c);
        if (!needDraft) return this.selectedVersionId;
        const draft = await createDraftFromActive({ formId: this.selectedFormId });
        this.selectedVersionId = draft.versionId;
        await refreshApex(this.wiredVersionsResult);
        this.currentVersion =
            (this.versions || []).find(v => v.Id === draft.versionId) || this.currentVersion;
        return draft.versionId;
    }

    async handleSave() {
        if (!this.selectedFormId) {
            this._toast('Select a form first.', 'info');
            return;
        }
        this._saving = true;
        try {
            const versionId = await this._ensureDraftVersion();
            await saveFormLayout({
                versionId,
                layoutJson: JSON.stringify(this.serializeForm()),
                layoutSpecJson: JSON.stringify(this.spec)
            });
            this._savedHash = JSON.stringify(this.serializeForm());
            this._toast('Saved.', 'success');
        } catch (e) {
            this._toast(this._errMsg(e, 'Save failed.'), 'error');
        } finally {
            this._saving = false;
        }
    }

    async handlePublish() {
        if (!this.selectedFormId) {
            this._toast('Select a form first.', 'info');
            return;
        }
        this._saving = true;
        try {
            // Persist the latest edits to a draft first (also forks one off an
            // active version), then publish that draft.
            const versionId = await this._ensureDraftVersion();
            if (this.isDirty || this._savedHash === null) {
                await saveFormLayout({
                    versionId,
                    layoutJson: JSON.stringify(this.serializeForm()),
                    layoutSpecJson: JSON.stringify(this.spec)
                });
                this._savedHash = JSON.stringify(this.serializeForm());
            }
            await publishVersion({ versionId });
            await refreshApex(this.wiredVersionsResult);
            this.currentVersion =
                (this.versions || []).find(v => v.Id === versionId) || this.currentVersion;
            this._toast('Published.', 'success');
        } catch (e) {
            this._toast(this._errMsg(e, 'Publish failed.'), 'error');
        } finally {
            this._saving = false;
        }
    }

    // ---- Related List: child-relationship picker → standalone related section ----
    get relPickerOptions() {
        return (this.relationships || []).map((r) => ({
            key: r.relationshipName,
            relationshipName: r.relationshipName,
            childObject: r.childObject,
            childObjectLabel: r.childObjectLabel,
            linkingField: r.linkingField,
            sub: `${r.childObject} · via ${r.linkingField}`
        }));
    }
    get hasRelOptions() { return this.relPickerOptions.length > 0; }
    openRelationshipPicker(dropTarget) {
        const obj = this.currentForm && this.currentForm.Primary_Context_Object__c;
        if (!obj) {
            this._toast('Select a form with a primary object first.', 'info');
            return;
        }
        // Remember where the user dropped it so we can place it there once a
        // relationship is picked (null = click-add → append to the active page).
        this._pendingRelDrop = dropTarget || null;
        this.showRelPicker = true;
        getChildRelationships({ objectApiName: obj })
            .then((data) => { this.relationships = data || []; })
            .catch(() => { this.relationships = []; });
    }
    handleRelPickerCancel() { this.showRelPicker = false; this._pendingRelDrop = null; }
    handlePickRelationship(e) {
        const t = e.currentTarget.dataset;
        this._addRelatedSection({
            relationshipName: t.rel,
            childObject: t.child,
            childObjectLabel: t.label,
            linkingField: t.linking
        });
        this.showRelPicker = false;
    }
    // Add a standalone Related_Child section bound to the chosen relationship — at
    // the drop position captured when the picker opened (or appended on click-add).
    _addRelatedSection(rel) {
        const drop = this._pendingRelDrop;
        this._pendingRelDrop = null;
        const sec = {
            key: this._uid('s'),
            pageKey: (drop && drop.pageKey) || this.activePageKey,
            title: rel.childObjectLabel || rel.childObject,
            contextType: 'Related_Child',
            relationshipName: rel.relationshipName,
            childObjectApiName: rel.childObject,
            linkingField: rel.linkingField,
            displayStyle: 'stacked',
            addLabel: '',
            minRows: 0,
            maxRows: 0,
            gridColumns: 1,
            order: 0
        };
        const arr = (this.parts.sections || []).map((s) => ({ ...s }));
        this._spliceSection(arr, sec, (drop && drop.beforeSectionKey) || null);
        this._setSections(arr);
        this.selectedKey = sec.key;
        this._maybeLoadRelatedFields();
    }

    async handleDiscardDraft() {
        if (!this.isDraft || !this.selectedVersionId) return;
        const ok = await LightningConfirm.open({
            message: 'Discard this draft and all its unsaved changes? This cannot be undone.',
            label: 'Discard draft',
            variant: 'header',
            theme: 'warning'
        });
        if (!ok) return;
        this._saving = true;
        try {
            await deleteDraftVersion({ versionId: this.selectedVersionId });
            // Clear the selection so the version list auto-selects the active
            // (or remaining) version and reloads its layout.
            this.selectedVersionId = null;
            this.currentVersion = null;
            await refreshApex(this.wiredVersionsResult);
            this._toast('Draft discarded.', 'success');
        } catch (e) {
            this._toast(this._errMsg(e, 'Discard failed.'), 'error');
        } finally {
            this._saving = false;
        }
    }

    handleDesktop() { this.device = 'desktop'; }
    handleMobile() { this.device = 'mobile'; }
    handleToggleEditor() { this.editorHidden = !this.editorHidden; }

    // ---- design panel handlers (mutate appearance state → preview updates) ----
    handlePickLayout(e) {
        const id = e.currentTarget.dataset.id;
        const prev = this.currentLayout;
        if (id === prev) return;
        this._layout = id;
        // Switching families may strand the active page; reset to the first.
        this.currentPageKey = null;
        // Tell the user what the new flow does to their pages/sections.
        const msg = this._layoutEffectMessage(prev, id);
        if (msg) this._toast(msg, 'info', 'Layout changed');
    }
    // The page/flow model each layout family imposes — used to warn on a switch.
    _layoutFlow(id) {
        if (CONTINUOUS_LAYOUTS.has(id)) return 'continuous';
        if (id === 'oneAtATime') return 'oneAtATime';
        if (id === 'tabbed') return 'tabbed';
        if (id === 'accordion') return 'accordion';
        return 'paginated'; // stepper / splitHero / sideNav
    }
    _layoutEffectMessage(from, to) {
        if (this._layoutFlow(from) === this._layoutFlow(to)) return '';
        switch (this._layoutFlow(to)) {
            case 'continuous':
                return 'All pages are merged into one — every section now shows on a single scrolling page.';
            case 'oneAtATime':
                return 'One section per screen — respondents move through your sections one at a time.';
            case 'tabbed':
                return 'Your pages/sections become tabs on a single page.';
            case 'accordion':
                return 'Your pages/sections become collapsible panels on a single page.';
            case 'paginated':
                return 'Each page becomes a step — respondents navigate one page at a time.';
            default:
                return '';
        }
    }
    handleRefreshPreview() {
        this._remountPreview();
    }
    // Force a fresh c-form-viewer: it re-applies the definition from scratch (nav
    // back to page 1, entered values cleared, autofill re-run). Used by the refresh
    // button AND on every form/version load — a persistent viewer only LIVE-reapplies
    // (preserving page/values for in-place edits), which would carry stale state when
    // you switch to a different form/survey. A remount guarantees a clean render.
    _remountPreview() {
        this._previewMounted = false;
        Promise.resolve().then(() => { this._previewMounted = true; });
    }
    handlePickTheme(e) {
        this._themeId = e.currentTarget.dataset.id;
        // Re-anchor the skin to this theme's default (skins don't cross themes).
        const def = THEMES[this._themeId] && THEMES[this._themeId].defaultSkin;
        const skins = skinsForTheme(this._themeId);
        this._skinId = def || (skins[0] && skins[0].value) || 'light';
    }
    handlePickSkin(e) { this._skinId = e.currentTarget.dataset.id; }
    handlePickSpacing(e) { this._spacing = e.currentTarget.dataset.val; }
    handlePickAccent(e) { this._accent = e.currentTarget.dataset.color; }
    handleAccentInput(e) { this._accent = e.target.value; }
    handleResetAccent() { this._accent = ''; }

    handleHeaderArrange(e) { this._header = { ...this._header, arrangement: e.target.value }; }
    handleHeaderTitle(e) { this._header = { ...this._header, title: e.target.value }; }
    handleHeaderDesc(e) { this._header = { ...this._header, description: e.target.value }; }
    handleHeaderLogo(e) { this._header = { ...this._header, logo: e.target.value }; }
    handleHeaderHighlight(e) { this._header = { ...this._header, highlight: e.target.value }; }

    handleSubmitLabel(e) { this._buttons = { ...this._buttons, submitLabel: e.target.value }; }
    handleNextLabel(e) { this._buttons = { ...this._buttons, nextLabel: e.target.value }; }
    handleBackLabel(e) { this._buttons = { ...this._buttons, backLabel: e.target.value }; }
    handleAlign(e) { this._buttons = { ...this._buttons, alignment: e.currentTarget.dataset.align }; }

    handleAfterAction(e) { this._after = { ...this._after, action: e.target.value }; }
    handleAfterMessage(e) { this._after = { ...this._after, message: e.target.value }; }
    handleAfterRedirect(e) { this._after = { ...this._after, redirectUrl: e.target.value }; }

    // ---- c/designPanel: one object in, one {scope,key,value} event out -------
    get designState() {
        const layout = this.currentLayout;
        return {
            layout,
            themeId: this._themeId,
            skinId: this._skinId,
            accent: this._accent,
            spacing: this._spacing,
            customTheme: this._customTheme,
            shell: this._shell,
            responsive: this._responsive,
            header: this._header,
            buttons: this._buttons,
            after: this._after,
            isMultiPage: this.isMultiPageLayout
        };
    }
    handleDesignChange(e) {
        const { scope, key, value } = e.detail || {};
        switch (scope) {
            case 'layout':
                this.handlePickLayout({ currentTarget: { dataset: { id: value } } });
                break;
            case 'spacing':
                this._spacing = value;
                break;
            case 'accent':
                this._accent = value;
                break;
            case 'preset': {
                // Pick a base theme and clear per-form overrides so it shows clean.
                this._themeId = value;
                this._skinId = (THEMES[value] && THEMES[value].defaultSkin) || 'light';
                this._customTheme = {};
                break;
            }
            case 'theme':
                this._customTheme = { ...this._customTheme, [key]: value };
                // "Global is boss": the Section look control bulk-applies to every
                // field section. Content blocks & related lists keep their own
                // style; per-section style stays the escape hatch (set afterward).
                if (key === 'sectionDefault') {
                    this._parts = {
                        ...this.parts,
                        sections: (this.parts.sections || []).map((s) =>
                            (this._isContentBlockSection(s) || s.contextType === 'Related_Child')
                                ? s
                                : { ...s, style: value })
                    };
                }
                break;
            case 'shell':
                this._shell = { ...this._shell, [key]: value };
                break;
            case 'responsive':
                this._responsive = { ...this._responsive, [key]: value };
                break;
            case 'header':
                this._header = { ...this._header, [key]: value };
                break;
            case 'headerAsset':
                // key = 'logo' | 'banner'; value = File (upload) or null (remove).
                if (value) this._uploadHeaderAsset(value, key);
                else this._removeHeaderAsset(key);
                break;
            case 'bgAsset':
                // key = 'pageBg'; value = File (upload) or null (remove).
                if (value) this._uploadBgAsset(value);
                else this._removeBgAsset();
                break;
            case 'buttons':
                this._buttons = { ...this._buttons, [key]: value };
                break;
            case 'after':
                this._after = { ...this._after, [key]: value };
                break;
            default:
                break;
        }
    }

    // ---- authoring (in-memory model mutation; preview updates live) ----
    _uid(p) { return `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`; }
    _nextOrder() {
        return (this.parts.elements || []).reduce((m, e) => Math.max(m, e.order || 0), 0) + 1;
    }
    // Resolve the section new content should land in: the selected section, the
    // selected element's section, the last body (non-hero) section, or a new one.
    _ensureSection() {
        const sections = this.parts.sections || [];
        // A real parent field-section — not a content block, not a related (child) list.
        const isParentSec = (s) => s && !this._isContentBlockSection(s) && s.contextType !== 'Related_Child';
        if (this.selectedKey) {
            const sec = sections.find((s) => s.key === this.selectedKey);
            if (isParentSec(sec)) return sec.key;
            const el = (this.parts.elements || []).find((e) => e.key === this.selectedKey);
            if (el) {
                const elSec = sections.find((s) => s.key === el.sectionKey);
                if (isParentSec(elSec)) return el.sectionKey;
            }
        }
        const body = sections.filter(isParentSec);
        if (body.length) return body[body.length - 1].key;
        const pageKey = (this.parts.pages && this.parts.pages[0] && this.parts.pages[0].key) || 'p1';
        const sec = { key: this._uid('s'), pageKey, title: 'Section', style: (this._customTheme && this._customTheme.sectionDefault) || 'card', gridColumns: 1, order: 1 };
        this._parts = { ...this.parts, sections: [...sections, sec] };
        return sec.key;
    }
    _patchSection(patch) {
        const key = this.selectedKey;
        this._parts = {
            ...this.parts,
            sections: (this.parts.sections || []).map((s) => (s.key === key ? { ...s, ...patch } : s))
        };
    }
    _patchElement(patch) {
        const key = this.selectedKey;
        this._parts = {
            ...this.parts,
            elements: (this.parts.elements || []).map((e) => (e.key === key ? { ...e, ...patch } : e))
        };
    }

    handleAddField(e) {
        const api = e.currentTarget.dataset.api;
        const f = this.objectFields.find((x) => x.apiName === api);
        if (!f) return;
        if (this.usedFieldApis.has(api.toLowerCase())) {
            this._toast(`"${f.label}" is already on the form.`, 'info');
            return;
        }
        const sectionKey = this._ensureSection();
        const el = {
            key: this._uid('e'), sectionKey, type: 'Field',
            label: f.label, fieldApiName: f.apiName, fieldType: f.type,
            uiBehavior: f.required ? 'Required' : 'None',
            required: !!f.required, order: this._nextOrder()
        };
        // Leave selection alone so several fields can be added in a row.
        this._parts = { ...this.parts, elements: [...(this.parts.elements || []), el] };
    }

    handleInsertElement(e) {
        // Click-add: Section/content → a page-level block; Empty space → into the
        // active page's section (it's grid-only). Selects the new node.
        const type = e.currentTarget.dataset.type;
        if (type === 'Related_List') {
            this.openRelationshipPicker();
        } else if (type === 'Empty_Space') {
            this._placeContent(type, null, null, this.activePageKey, true);
        } else {
            this._insertBlock(type, this.activePageKey, null, true);
        }
    }

    handleAddSection() {
        this._addSection(this.activePageKey, null, true);
    }

    handleDeleteNode() {
        const key = this.selectedKey;
        if (!key) return;
        const sections = this.parts.sections || [];
        if (sections.some((s) => s.key === key)) {
            this._parts = {
                ...this.parts,
                sections: sections.filter((s) => s.key !== key),
                elements: (this.parts.elements || []).filter((e) => e.sectionKey !== key)
            };
            this.selectedKey = null;
            this._renumber();
        } else {
            this._deleteElement(key);
        }
    }

    // Per-section delete (the × on each section / content-block header).
    handleDeleteSec(e) {
        e.stopPropagation();
        this._deleteSection(e.currentTarget.dataset.key);
    }
    _deleteSection(key) {
        if (!key) return;
        const sections = this.parts.sections || [];
        if (!sections.some((s) => s.key === key)) return;
        this._parts = {
            ...this.parts,
            sections: sections.filter((s) => s.key !== key),
            elements: (this.parts.elements || []).filter((e) => e.sectionKey !== key)
        };
        if (this.selectedKey === key) this.selectedKey = null;
        this._renumber();
    }

    // Per-element delete (the × on each blueprint element).
    handleDeleteEl(e) {
        e.stopPropagation();
        this._deleteElement(e.currentTarget.dataset.key);
    }
    _deleteElement(key) {
        const sections = this.parts.sections || [];
        const elements = this.parts.elements || [];
        const el = elements.find((x) => x.key === key);
        const remaining = elements.filter((x) => x.key !== key);
        let secs = sections;
        // a content block that just lost its only element has no reason to exist
        if (el) {
            const sec = sections.find((s) => s.key === el.sectionKey);
            if (sec && this._isContentBlockSection(sec) && !remaining.some((x) => x.sectionKey === sec.key)) {
                secs = sections.filter((s) => s.key !== sec.key);
            }
        }
        this._parts = { ...this.parts, sections: secs, elements: remaining };
        if (this.selectedKey === key) this.selectedKey = null;
        this._renumber();
    }

    handleCloseInspector() { this.selectedKey = null; }

    // inspector field edits (text inputs commit on blur; toggles/selects live)
    handleTitleInput(e) { this._patchSection({ title: e.target.value }); }
    handleColsClick(e) { this._patchSection({ gridColumns: parseInt(e.currentTarget.dataset.cols, 10) }); }
    handleFieldWidthChange(e) { this._patchElement({ colSpan: Number(e.target.value) }); }
    handleBlockStyleChange(e) {
        const s = this.selElementBlock;
        if (s) this._patchSectionByKey(s.key, { style: e.target.value });
    }
    _patchSectionByKey(key, patch) {
        this._parts = {
            ...this.parts,
            sections: (this.parts.sections || []).map((s) => (s.key === key ? { ...s, ...patch } : s))
        };
    }
    handleLabelInput(e) { this._patchElement({ label: e.target.value }); }
    handleRequiredToggle() { this._patchElement({ required: !this.selRequired }); }
    handleHeadlineInput(e) { this._patchElement({ headline: e.target.value }); }
    handleSubtextInput(e) { this._patchElement({ subtext: e.target.value }); }
    handleCtaLabelInput(e) { this._patchElement({ cta: { ...this.selCta, label: e.target.value } }); }
    handleCtaActionChange(e) { this._patchElement({ cta: { ...this.selCta, action: e.target.value } }); }
    handleCtaHrefInput(e) { this._patchElement({ cta: { ...this.selCta, href: e.target.value } }); }

    // full field-property edits
    handleBehaviorChange(e) {
        const v = e.target.value;
        this._patchElement({ uiBehavior: v, required: v === 'Required' });
    }
    handleHelpTextInput(e) { this._patchElement({ helpText: e.target.value }); }
    handlePlaceholderInput(e) { this._patchElement({ placeholder: e.target.value }); }
    handleRenderAsChange(e) { this._patchElement({ renderAs: e.target.value }); }
    handleUrlPrefillInput(e) { this._patchElement({ urlPrefillParam: e.target.value }); }
    handleSliderMin(e) { this._patchElement({ sliderMin: Number(e.target.value) }); }
    handleSliderMax(e) { this._patchElement({ sliderMax: Number(e.target.value) }); }
    handleSliderStep(e) { this._patchElement({ sliderStep: Number(e.target.value) }); }

    // custom option rows (dropdown/radio/checkbox values)
    _setCustomOptions(arr) { this._patchElement({ customOptionsJson: JSON.stringify(arr) }); }
    handleAddOption() {
        const a = this.customOptions.map(({ label, value }) => ({ label, value }));
        a.push({ label: '', value: '' });
        this._setCustomOptions(a);
    }
    handleRemoveOption(e) {
        const i = parseInt(e.currentTarget.dataset.index, 10);
        const a = this.customOptions.map(({ label, value }) => ({ label, value }));
        a.splice(i, 1);
        this._setCustomOptions(a);
    }
    handleOptionChange(e) {
        const i = parseInt(e.currentTarget.dataset.index, 10);
        const field = e.currentTarget.dataset.field;
        const a = this.customOptions.map(({ label, value }) => ({ label, value }));
        a[i][field] = e.target.value;
        this._setCustomOptions(a);
    }

    // ---- section header icon + style + visibility-of-header ----
    handleShowHeaderToggle() { this._patchSection({ showHeader: !this.selShowHeader }); }
    handleIconSearch(e) { this.iconSearch = e.target.value; }
    handleSelectIcon(e) { this._patchSection({ icon: e.currentTarget.dataset.icon }); }
    handleClearIcon() { this._patchSection({ icon: '' }); }
    handleDescriptionInput(e) { this._patchSection({ description: e.target.value }); }
    handleCollapsibleToggle() { this._patchSection({ collapsible: !this.selCollapsible }); }
    handleCollapsedDefaultToggle() { this._patchSection({ collapsedByDefault: !this.selCollapsedDefault }); }

    // ---- related-list (Related_Child) section edits ----
    handleRelStyleChange(e) { this._patchSection({ displayStyle: e.target.value }); }
    handleRelAddLabel(e) { this._patchSection({ addLabel: e.target.value }); }
    handleRelMinRows(e) { this._patchSection({ minRows: Math.max(0, parseInt(e.target.value, 10) || 0) }); }
    handleRelMaxRows(e) { this._patchSection({ maxRows: Math.max(0, parseInt(e.target.value, 10) || 0) }); }
    // Add a child-object field to the selected related section.
    handleAddRelatedField(e) {
        if (!this.isSelRelated) return;
        const api = e.currentTarget.dataset.api;
        const f = (this.relatedFields || []).find((x) => x.apiName === api);
        if (!f) return;
        const secKey = this.selectedKey;
        const used = new Set(
            (this.parts.elements || [])
                .filter((el) => el.sectionKey === secKey && el.fieldApiName)
                .map((el) => el.fieldApiName.toLowerCase())
        );
        if (used.has(api.toLowerCase())) {
            this._toast(`"${f.label}" is already in this list.`, 'info');
            return;
        }
        const el = {
            key: this._uid('e'), sectionKey: secKey, type: 'Field',
            label: f.label, fieldApiName: f.apiName, fieldType: f.type,
            uiBehavior: f.required ? 'Required' : 'None', required: !!f.required, order: 0
        };
        const arr = (this.parts.elements || []).map((x) => ({ ...x }));
        this._spliceElement(arr, el, secKey, null);
        this._setElements(arr);
    }
    // Load the child object's fields when a related section is selected (the
    // inspector shows them — the left Fields panel is hidden during selection).
    _maybeLoadRelatedFields() {
        const s = this.selectedSection;
        if (!s || s.contextType !== 'Related_Child' || !s.childObjectApiName) return;
        if (this._relatedFieldsObj === s.childObjectApiName && this.relatedFields.length) return;
        this._relatedFieldsObj = s.childObjectApiName;
        this.relatedFields = [];
        getObjectFields({ objectApiName: s.childObjectApiName })
            .then((data) => {
                if (this._relatedFieldsObj === s.childObjectApiName) this.relatedFields = data || [];
            })
            .catch(() => { this.relatedFields = []; });
    }

    // ---- content-element edits (renderer reads these keys) ----
    handleContentInput(e) { this._patchElement({ content: e.target.value }); }
    handleImageAltInput(e) { this._patchElement({ imageAlt: e.target.value }); }
    handleImageSizeChange(e) { this._patchElement({ imageSize: e.target.value }); }
    handleCalloutVariantChange(e) { this._patchElement({ calloutVariant: e.target.value }); }
    handleSpacerSizeChange(e) { this._patchElement({ spacerSize: e.target.value }); }
    handleConsentToggle() { this._patchElement({ consentRequired: !this.selConsentRequired }); }

    // ---- image upload (Image element + Hero media) via FormAssetController ----
    // Stored as a Salesforce File linked to the Form; only the URL + ContentVersion
    // Id land in the layout JSON (never base64). Mirrors c/propertyPanel.uploadAndStore.
    handleMediaUpload(e) {
        const file = e.target.files && e.target.files[0];
        if (file) this._uploadAndStore(file, 'imageUrl', 'imageVersionId');
        e.target.value = ''; // allow re-picking the same file
    }
    handleMediaRemove() { this._removeImage('imageUrl', 'imageVersionId'); }

    // Header assets (logo + banner) — same ContentVersion path as element media,
    // but stored on _header instead of an element. The banner also drives the
    // --c-header-bg token (scrim + image) so every shell's hero header paints it.
    _uploadHeaderAsset(file, kind) {
        const formId = this.currentForm && this.currentForm.Id;
        const prev = kind === 'logo' ? this._header.logoVersionId : this._header.bgImageVersionId;
        this._uploading = true;
        const reader = new FileReader();
        reader.onload = () => {
            uploadImage({ base64Data: reader.result, fileName: file.name, formId })
                .then((res) => {
                    if (kind === 'logo') {
                        this._header = { ...this._header, logo: res.url, logoVersionId: res.contentVersionId };
                    } else {
                        this._header = { ...this._header, bgImage: res.url, bgImageVersionId: res.contentVersionId };
                        // Scrim keeps overlaid title legible over any image; white text pairs with it.
                        this._customTheme = {
                            ...this._customTheme,
                            headerBg: `linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42)), url('${res.url}')`,
                            headerText: '#ffffff'
                        };
                    }
                    if (prev) deleteImage({ contentVersionId: prev }).catch(() => {});
                })
                .catch((error) => {
                    const msg = (error && error.body && error.body.message) || 'Image upload failed.';
                    this._toast(msg, 'error');
                })
                .finally(() => { this._uploading = false; });
        };
        reader.readAsDataURL(file);
    }
    _removeHeaderAsset(kind) {
        if (kind === 'logo') {
            const v = this._header.logoVersionId;
            this._header = { ...this._header, logo: '', logoVersionId: '' };
            if (v) deleteImage({ contentVersionId: v }).catch(() => {});
        } else {
            const v = this._header.bgImageVersionId;
            this._header = { ...this._header, bgImage: '', bgImageVersionId: '' };
            const ct = { ...this._customTheme };
            delete ct.headerBg;
            delete ct.headerText;
            this._customTheme = ct;
            if (v) deleteImage({ contentVersionId: v }).catch(() => {});
        }
    }

    // Page background image — same ContentVersion path as header assets, but
    // stored on the custom theme so it rides skin.overrides → --c-page-bg-image.
    _uploadBgAsset(file) {
        const formId = this.currentForm && this.currentForm.Id;
        const prev = this._customTheme && this._customTheme.pageBgImageVersionId;
        this._uploading = true;
        const reader = new FileReader();
        reader.onload = () => {
            uploadImage({ base64Data: reader.result, fileName: file.name, formId })
                .then((res) => {
                    this._customTheme = {
                        ...this._customTheme,
                        pageBgImage: res.url,
                        pageBgImageVersionId: res.contentVersionId
                    };
                    if (prev) deleteImage({ contentVersionId: prev }).catch(() => {});
                })
                .catch((error) => {
                    const msg = (error && error.body && error.body.message) || 'Image upload failed.';
                    this._toast(msg, 'error');
                })
                .finally(() => { this._uploading = false; });
        };
        reader.readAsDataURL(file);
    }
    _removeBgAsset() {
        const v = this._customTheme && this._customTheme.pageBgImageVersionId;
        const ct = { ...this._customTheme };
        delete ct.pageBgImage;
        delete ct.pageBgImageVersionId;
        this._customTheme = ct;
        if (v) deleteImage({ contentVersionId: v }).catch(() => {});
    }

    // Patch a specific element by key — the async upload resolves after the user may
    // have clicked elsewhere, so we never rely on selectedKey at callback time.
    _patchElementByKey(key, patch) {
        this._parts = {
            ...this.parts,
            elements: (this.parts.elements || []).map((el) => (el.key === key ? { ...el, ...patch } : el))
        };
    }
    _uploadAndStore(file, urlProp, versionProp) {
        const key = this.selectedKey;
        const el = this.selectedElement;
        const prevVersionId = el ? el[versionProp] : null;
        const formId = this.currentForm && this.currentForm.Id;
        this._uploading = true;
        const reader = new FileReader();
        reader.onload = () => {
            uploadImage({ base64Data: reader.result, fileName: file.name, formId })
                .then((res) => {
                    this._patchElementByKey(key, { [urlProp]: res.url, [versionProp]: res.contentVersionId });
                    if (prevVersionId) deleteImage({ contentVersionId: prevVersionId }).catch(() => {});
                })
                .catch((error) => {
                    const msg = (error && error.body && error.body.message) || 'Image upload failed.';
                    this._toast(msg, 'error');
                })
                .finally(() => { this._uploading = false; });
        };
        reader.readAsDataURL(file);
    }
    _removeImage(urlProp, versionProp) {
        const el = this.selectedElement;
        const versionId = el ? el[versionProp] : null;
        this._patchElement({ [urlProp]: '', [versionProp]: '' });
        if (versionId) deleteImage({ contentVersionId: versionId }).catch(() => {});
    }

    // visibility rules modal (uses c/visibilityEditor — the non-z editor)
    handleEditVisibility() { this.showVisModal = true; }
    handleVisCancel() { this.showVisModal = false; }
    handleVisSave(e) {
        const json = (e.detail && e.detail.json) || '';
        if (this.isSelSection) this._patchSection({ visibilityExpression: json });
        else this._patchElement({ visibilityExpression: json });
        this.showVisModal = false;
    }

    // =====================================================================
    // PAGES (tab strip — stepped layouts only)
    // =====================================================================
    handleSelectPage(e) {
        if (this.renamingPageKey) return;
        this.currentPageKey = e.currentTarget.dataset.key;
        this.selectedKey = null;
    }
    handleAddPage() {
        const order = this.pageList.length + 1;
        const pg = { key: this._uid('p'), label: `Page ${order}`, order };
        this._parts = { ...this.parts, pages: [...(this.parts.pages || []), pg] };
        this.currentPageKey = pg.key;
        this.selectedKey = null;
    }
    handleDeletePage(e) {
        e.stopPropagation();
        const key = e.currentTarget.dataset.key;
        const pages = this.parts.pages || [];
        if (pages.length <= 1) {
            this._toast('A form needs at least one page.', 'info');
            return;
        }
        const deadSecKeys = new Set(
            (this.parts.sections || []).filter((s) => s.pageKey === key).map((s) => s.key)
        );
        const newPages = pages.filter((p) => p.key !== key);
        this._parts = {
            ...this.parts,
            pages: newPages,
            sections: (this.parts.sections || []).filter((s) => s.pageKey !== key),
            elements: (this.parts.elements || []).filter((el) => !deadSecKeys.has(el.sectionKey))
        };
        if (this.currentPageKey === key) this.currentPageKey = newPages[0].key;
        this.selectedKey = null;
        this._renumber();
    }
    handleStartRename(e) {
        this.renamingPageKey = e.currentTarget.dataset.key;
    }
    handleRenameInput(e) {
        const key = this.renamingPageKey;
        if (!key) return;
        this._parts = {
            ...this.parts,
            pages: (this.parts.pages || []).map((p) => (p.key === key ? { ...p, label: e.target.value } : p))
        };
    }
    handleRenameCommit() { this.renamingPageKey = null; }
    handleRenameKey(e) {
        if (e.key === 'Enter' || e.key === 'Escape') this.renamingPageKey = null;
    }

    // =====================================================================
    // DRAG & DROP
    // Native HTML5 DnD (same dataTransfer-JSON mechanism as designerCanvas):
    //   t: 'section' | 'element' | 'page' | 'palette-field' | 'palette-el'
    // =====================================================================
    _setDrag(e, data) {
        e.dataTransfer.setData('text/plain', JSON.stringify(data));
        // Palette items are COPIED into the form; existing nodes are MOVED. Matching
        // effectAllowed to the intent keeps the native cursor badge stable and
        // correct (a badge that flips or coerces to "none" is the drag flicker), and
        // must agree with the dropEffect the canvas sets in _autoScroll.
        const isPalette = data.t === 'palette-field' || data.t === 'palette-el';
        e.dataTransfer.effectAllowed = isPalette ? 'copy' : 'move';
    }
    _readDrag(e) {
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }
    allowDrop(e) { e.preventDefault(); }
    handleDragEnter(e) {
        const node = e.currentTarget;
        const key = node.dataset.key || null;
        const sec = key && (this.parts.sections || []).find((s) => s.key === key);
        // Page tabs (no matching section) highlight on enter; section enter is
        // maintained by dragover, so only act here for tabs / to reject.
        if (sec && !this._sectionAcceptsDrag(sec)) this._clearHighlight();
        else if (!sec) this._setHighlight(node, 'drop-on');
    }
    handleDragLeave(e) { if (this._hlNode === e.currentTarget) this._clearHighlight(); }
    handleDragEndClear() { this._clearDnd(); this._dragKind = null; }
    _clearDnd() { this._clearHighlight(); }

    // Imperative drop highlight — toggles a class directly on the node so the
    // blueprint never re-renders mid-drag (the flicker fix). One node at a time.
    _setHighlight(node, cls) {
        if (this._hlNode === node && this._hlCls === cls) return;
        if (this._hlNode) this._hlNode.classList.remove(this._hlCls);
        this._hlNode = node || null;
        this._hlCls = cls || '';
        if (node && cls) node.classList.add(cls);
    }
    _clearHighlight() {
        if (this._hlNode) this._hlNode.classList.remove(this._hlCls);
        this._hlNode = null;
        this._hlCls = '';
    }

    // --- Drop validity (one source of truth for the cursor AND the highlight) ---
    // A palette FIELD only belongs in a real field-section; an existing ELEMENT only
    // moves between sections sharing its data context; content blocks never hold
    // either. Section/page reorders and content-block (palette-el) drops are valid
    // across the canvas. Invalid spots stay a native no-drop — no toast.
    _sectionAcceptsDrag(sec) {
        if (!sec) return false;
        const kind = this._dragKind;
        if (kind === 'section' || kind === 'page' || kind === 'palette-el') return true;
        if (this._isContentBlockSection(sec)) return false; // field/element can't go in a block
        if (kind === 'palette-field') return sec.contextType !== 'Related_Child';
        if (kind === 'element') return this._sectionContextSig(sec) === this._dragElSig;
        return true;
    }
    // The blueprint section enclosing a dragover target (walks light-DOM ancestors).
    _sectionAt(target) {
        const sections = this.parts.sections || [];
        let node = target;
        while (node && node !== this._boundScrollEl) {
            const ds = node.dataset;
            if (ds) {
                let sec = ds.key && sections.find((s) => s.key === ds.key);
                if (!sec && ds.sectionKey) sec = sections.find((s) => s.key === ds.sectionKey);
                if (sec) return sec;
            }
            node = node.parentElement;
        }
        return null;
    }
    // Whether the current drag may drop at this target (used by the capture handler).
    _dragAllowedAt(target) {
        const kind = this._dragKind;
        if (!kind) return false;
        if (kind === 'section' || kind === 'page' || kind === 'palette-el') return true;
        const sec = this._sectionAt(target);
        if (kind === 'element' && !sec) return true; // bare canvas → move to a real section
        return this._sectionAcceptsDrag(sec);
    }

    // Over a section's whitespace → highlight the section (drop = reorder/append).
    // preventDefault is owned by the capture handler (_autoScroll); here we only set
    // the highlight imperatively, and skip it where the drop isn't allowed.
    handleSecDragOver(e) {
        const node = e.currentTarget;
        const sec = (this.parts.sections || []).find((s) => s.key === node.dataset.key);
        if (sec && !this._sectionAcceptsDrag(sec)) {
            this._clearHighlight();
            return;
        }
        // Section/block reorder → an insertion LINE before it; a field/element/content
        // INTO a field-section → a "drops in here" highlight.
        const isBlock = sec && this._isContentBlockSection(sec);
        this._setHighlight(node, this._dragKind === 'section' || isBlock ? 'drop-before' : 'drop-on');
    }
    // Over an element chip → insertion line before it. stopPropagation so the
    // parent section's dragover doesn't steal the highlight.
    handleElDragOver(e) {
        // When a SECTION/block is being dragged, don't claim the drop with an
        // element-level line — let the event reach the parent section so its
        // section insertion line shows (you're reordering sections, not fields).
        if (this._dragKind === 'section') return;
        e.stopPropagation();
        const node = e.currentTarget;
        const sec = (this.parts.sections || []).find((s) => s.key === node.dataset.sectionKey);
        if (sec && !this._sectionAcceptsDrag(sec)) {
            this._clearHighlight();
            return;
        }
        this._setHighlight(node, 'drop-before');
    }

    // Inter-section drop zone — reorders a section/block, or drops a palette content
    // item as a standalone block here. Fields can't live between sections, so they
    // get no insertion line (the capture handler leaves them a native no-drop).
    handleGapDragOver(e) {
        if (this._dragKind === 'palette-field') {
            this._clearHighlight();
            return;
        }
        e.stopPropagation();
        this._setHighlight(e.currentTarget, 'is-over');
    }
    handleGapLeave(e) {
        if (this._hlNode === e.currentTarget) this._clearHighlight();
    }
    handleGapDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const data = this._readDrag(e);
        this._clearDnd();
        if (!data) return;
        const before = e.currentTarget.dataset.before || null; // null = end of the page
        const pageKey = this.activePageKey;
        if (data.t === 'section') {
            if (before) this._reorderSectionBefore(data.key, before);
            else this._moveSectionToPage(data.key, pageKey);
        } else if (data.t === 'palette-el') {
            // A Related List needs a child relationship chosen first → picker. Carry
            // the drop position so it lands here, not appended at the end.
            if (data.elType === 'Related_List') {
                this.openRelationshipPicker({ pageKey, beforeSectionKey: before });
            } else {
                // a content item dropped in a gap → a standalone block, right here
                this._insertBlock(data.elType, pageKey, before, true);
            }
        }
        // Fields and element drags ignore gaps — a field can't live between sections,
        // so the canvas leaves it a native no-drop (the drop never fires here).
    }
    handleSelectBlock(e) {
        // Non-toggling, same as handleSelect — keep the panel open on re-click.
        const k = e.currentTarget.dataset.sel;
        if (k) this.selectedKey = k;
    }

    // --- drag sources ---
    handleSectionDragStart(e) {
        this._dragKind = 'section';
        this._setDrag(e, { t: 'section', key: e.currentTarget.dataset.key });
    }
    handleElementDragStart(e) {
        e.stopPropagation();
        this._dragKind = 'element';
        const key = e.currentTarget.dataset.key;
        const el = (this.parts.elements || []).find((x) => x.key === key);
        const srcSec = el && (this.parts.sections || []).find((s) => s.key === el.sectionKey);
        this._dragElSig = this._sectionContextSig(srcSec);
        this._setDrag(e, { t: 'element', key, sectionKey: el ? el.sectionKey : null });
    }
    handlePageDragStart(e) {
        this._dragKind = 'page';
        this._setDrag(e, { t: 'page', key: e.currentTarget.dataset.key });
    }
    handlePaletteFieldDragStart(e) {
        this._dragKind = 'palette-field';
        this._setDrag(e, { t: 'palette-field', api: e.currentTarget.dataset.api });
    }
    handlePaletteElDragStart(e) {
        this._dragKind = 'palette-el';
        this._setDrag(e, { t: 'palette-el', elType: e.currentTarget.dataset.type });
    }

    // --- drop targets ---
    handleSectionDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) return;
        const secKey = e.currentTarget.dataset.key;
        const sec = (this.parts.sections || []).find((s) => s.key === secKey);
        const pageKey = (sec && sec.pageKey) || this.activePageKey;
        if (data.t === 'section') this._reorderSectionBefore(data.key, secKey);
        else if (data.t === 'element') this._moveElementToSection(data.key, secKey, null);
        else if (data.t === 'palette-field') this._addFieldToSection(data.api, secKey, null);
        // Drop a content item onto a section → into a field-section (append), or a
        // sibling block before a content block. _placeContent decides.
        else if (data.t === 'palette-el') this._placeContent(data.elType, secKey, null, pageKey, false);
    }
    handleElementDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) return;
        const beforeKey = e.currentTarget.dataset.key;
        const secKey = e.currentTarget.dataset.sectionKey;
        const sec = (this.parts.sections || []).find((s) => s.key === secKey);
        const pageKey = (sec && sec.pageKey) || this.activePageKey;
        // A section/block released over a field still reorders (the field area is
        // most of a section's surface — don't make the user aim for the header).
        if (data.t === 'section') this._reorderSectionBefore(data.key, secKey);
        else if (data.t === 'element') this._moveElementToSection(data.key, secKey, beforeKey);
        else if (data.t === 'palette-field') this._addFieldToSection(data.api, secKey, beforeKey);
        // Drop a content item onto an element inside a section → insert it there.
        else if (data.t === 'palette-el') this._placeContent(data.elType, secKey, beforeKey, pageKey, false);
    }
    handlePageTabDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) return;
        const pageKey = e.currentTarget.dataset.key;
        if (data.t === 'page') this._reorderPageBefore(data.key, pageKey);
        else if (data.t === 'section') this._moveSectionToPage(data.key, pageKey);
        else if (data.t === 'element') this._moveElementToPage(data.key, pageKey);
        else if (data.t === 'palette-field') {
            this._addFieldToSection(data.api, this._ensureSectionOnPage(pageKey), null);
            this.currentPageKey = pageKey;
        } else if (data.t === 'palette-el') {
            this._placeContent(data.elType, null, null, pageKey, false);
            this.currentPageKey = pageKey;
        }
    }
    handlePageStripDrop(e) {
        e.preventDefault();
        this._clearDnd();
        const data = this._readDrag(e);
        if (data && data.t === 'page') this._reorderPageBefore(data.key, null);
    }
    handleSheetDrop(e) {
        e.preventDefault();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) return;
        if (data.t === 'section') {
            this._moveSectionToPage(data.key, this.activePageKey);
        } else if (data.t === 'palette-el') {
            this._placeContent(data.elType, null, null, this.activePageKey, false);
        } else if (data.t === 'element') {
            this._moveElementToSection(data.key, this._ensureSection(), null);
        }
    }

    // --- mutations (operate on a copy in display order, then renumber) ---
    _reorderSectionBefore(dragKey, targetKey) {
        if (dragKey === targetKey) return;
        let secs = (this.parts.sections || []).map((s) => ({ ...s }));
        const drag = secs.find((s) => s.key === dragKey);
        const target = secs.find((s) => s.key === targetKey);
        if (!drag || !target) return;
        drag.pageKey = target.pageKey; // dropping onto a section in another page moves it there
        secs = secs.filter((s) => s.key !== dragKey);
        const ti = secs.findIndex((s) => s.key === targetKey);
        secs.splice(ti < 0 ? secs.length : ti, 0, drag);
        this._setSections(secs);
    }
    _moveSectionToPage(dragKey, pageKey) {
        let secs = (this.parts.sections || []).map((s) => ({ ...s }));
        const drag = secs.find((s) => s.key === dragKey);
        if (!drag) return;
        drag.pageKey = pageKey;
        secs = secs.filter((s) => s.key !== dragKey);
        let lastIdx = -1;
        secs.forEach((s, i) => { if (s.pageKey === pageKey) lastIdx = i; });
        secs.splice(lastIdx + 1, 0, drag);
        this._setSections(secs);
        this.currentPageKey = pageKey;
    }
    // Cross-page element move (stepped layouts): drop a field on another page's tab.
    _moveElementToPage(dragKey, pageKey) {
        const sectionKey = this._ensureSectionOnPage(pageKey);
        this._moveElementToSection(dragKey, sectionKey, null);
        this.currentPageKey = pageKey;
    }
    // Last field-section on a page (creating one if the page has none).
    _ensureSectionOnPage(pageKey) {
        const first = this.pageList[0].key;
        const onPage = (this.parts.sections || []).filter(
            (s) => (s.pageKey || first) === pageKey && !this._isContentBlockSection(s) && s.contextType !== 'Related_Child'
        );
        if (onPage.length) return onPage[onPage.length - 1].key;
        return this._addSection(pageKey, null, false);
    }
    _reorderPageBefore(dragKey, targetKey) {
        if (dragKey === targetKey) return;
        let pages = this.pageList.map((p) => ({ ...p }));
        const drag = pages.find((p) => p.key === dragKey);
        if (!drag) return;
        pages = pages.filter((p) => p.key !== dragKey);
        if (targetKey) {
            const ti = pages.findIndex((p) => p.key === targetKey);
            pages.splice(ti < 0 ? pages.length : ti, 0, drag);
        } else {
            pages.push(drag);
        }
        this._parts = { ...this.parts, pages: pages.map((p, i) => ({ ...p, order: i + 1 })) };
    }
    _moveElementToSection(dragKey, targetSecKey, beforeElKey) {
        if (!targetSecKey) return;
        const tgtSec = (this.parts.sections || []).find((s) => s.key === targetSecKey);
        // These invalid targets are already blocked at dragover (native no-drop), so
        // the drop can't fire on them — these guards just keep the mutation safe.
        if (tgtSec && this._isContentBlockSection(tgtSec)) return;
        const els = this.parts.elements || [];
        const drag = els.find((e) => e.key === dragKey);
        if (!drag) return;
        if (drag.sectionKey !== targetSecKey) {
            const srcSec = (this.parts.sections || []).find((s) => s.key === drag.sectionKey);
            if (this._sectionContextSig(srcSec) !== this._sectionContextSig(tgtSec)) return;
        }
        let arr = els.map((e) => ({ ...e }));
        const d = arr.find((e) => e.key === dragKey);
        d.sectionKey = targetSecKey;
        arr = arr.filter((e) => e.key !== dragKey);
        this._spliceElement(arr, d, targetSecKey, beforeElKey);
        this._setElements(arr);
    }
    _addFieldToSection(api, sectionKey, beforeElKey) {
        const f = this.objectFields.find((x) => x.apiName === api);
        if (!f) return;
        if (this.usedFieldApis.has(api.toLowerCase())) {
            this._toast(`"${f.label}" is already on the form.`, 'info');
            return;
        }
        const sec = (this.parts.sections || []).find((s) => s.key === sectionKey);
        // Related-list (child-bound) sections and content blocks can't hold a
        // primary-object field. These are already blocked at dragover (native
        // no-drop), so the drop can't land here — silently bail as a safety net,
        // never relocate to another section.
        if (sec && (sec.contextType === 'Related_Child' || this._isContentBlockSection(sec))) return;
        // Defensive: an unknown/missing target falls back to a real field-section.
        if (!sec) {
            sectionKey = this._ensureSection();
            beforeElKey = null;
        }
        const el = {
            key: this._uid('e'), sectionKey, type: 'Field',
            label: f.label, fieldApiName: f.apiName, fieldType: f.type,
            uiBehavior: f.required ? 'Required' : 'None', required: !!f.required, order: 0
        };
        const arr = (this.parts.elements || []).map((e) => ({ ...e }));
        this._spliceElement(arr, el, sectionKey, beforeElKey);
        this._setElements(arr);
    }
    // Content element types (everything draggable that isn't a field or a Section).
    // These can live INSIDE a field-section (as a plain element) OR on the canvas as
    // their own styled content block — the drop target decides (_placeContent).
    _isContentType(type) {
        return type !== 'Section' && type !== 'Field';
    }
    // Build a content element with its per-type defaults (shared by in-section and
    // block creation so the two paths never drift).
    _makeContentEl(type, sectionKey) {
        let el = { key: this._uid('e'), sectionKey, type, order: 0 };
        if (type === 'Hero') {
            el = { ...el, headline: 'Headline', subtext: 'Supporting text', cta: { label: 'Get started', action: 'start' } };
        } else if (type === 'Empty_Space') {
            el.label = 'Empty space';
            el.colSpan = 1;
        } else {
            el.label = type.replace(/_/g, ' ');
        }
        return el;
    }
    // Route a dropped/clicked content type to the right place:
    //  • inside a field-section → a plain in-section element (where the user dropped)
    //  • on the canvas / a content block → its own styled content block
    //  • Empty space is grid-only → always lands inside a field-section
    _placeContent(type, secKey, beforeElKey, pageKey, select) {
        // A Related List isn't a content element — it needs a child relationship
        // chosen first, so route it to the picker. Drop it before the section it was
        // released on (or append to the page when dropped on open canvas).
        if (type === 'Related_List') {
            this.openRelationshipPicker({ pageKey: pageKey || this.activePageKey, beforeSectionKey: secKey || null });
            return;
        }
        const sec = secKey ? (this.parts.sections || []).find((s) => s.key === secKey) : null;
        const isFieldSec = !!sec && !this._isContentBlockSection(sec);
        if (type === 'Empty_Space') {
            const target = isFieldSec ? secKey : this._ensureSectionOnPage(pageKey || this.activePageKey);
            this._addContentToSection(type, target, isFieldSec ? beforeElKey : null, select);
        } else if (isFieldSec) {
            this._addContentToSection(type, secKey, beforeElKey, select);
        } else {
            this._insertBlock(type, pageKey || this.activePageKey, secKey, select);
        }
    }
    // Add a content element as a plain child of a field-section.
    _addContentToSection(type, sectionKey, beforeElKey, select) {
        const el = this._makeContentEl(type, sectionKey);
        const arr = (this.parts.elements || []).map((e) => ({ ...e }));
        this._spliceElement(arr, el, sectionKey, beforeElKey);
        this._setElements(arr);
        if (select) this.selectedKey = el.key;
        return el.key;
    }
    // Insert a page-level block. Section → a field-section; everything else
    // (Hero/Image/Callout/Divider/Rich_Text/…) → its own content block, a sibling
    // of sections, NEVER nested inside one.
    _insertBlock(type, pageKey, beforeSectionKey, select) {
        if (type === 'Section') return this._addSection(pageKey, beforeSectionKey, select);
        return this._addContentBlock(type, pageKey, beforeSectionKey, select);
    }
    _addSection(pageKey, beforeSectionKey, select) {
        const sec = {
            key: this._uid('s'), pageKey: pageKey || this.activePageKey,
            title: 'New section', style: 'card', gridColumns: 1, order: 0
        };
        const arr = (this.parts.sections || []).map((s) => ({ ...s }));
        this._spliceSection(arr, sec, beforeSectionKey);
        this._setSections(arr);
        if (select) this.selectedKey = sec.key;
        return sec.key;
    }
    _addContentBlock(type, pageKey, beforeSectionKey, select) {
        const secKey = this._uid('s');
        const sec = {
            key: secKey, pageKey: pageKey || this.activePageKey,
            title: '', style: 'plain', contentBlock: true, gridColumns: 1, order: 0
        };
        const el = this._makeContentEl(type, secKey);
        const secs = (this.parts.sections || []).map((s) => ({ ...s }));
        this._spliceSection(secs, sec, beforeSectionKey);
        const els = [...(this.parts.elements || []).map((e) => ({ ...e })), el];
        this._parts = { ...this.parts, sections: secs, elements: els };
        this._renumber();
        if (select) this.selectedKey = el.key;
    }
    // Insert `sec` into `arr` before `beforeKey`, or at the end of its page.
    _spliceSection(arr, sec, beforeKey) {
        if (beforeKey) {
            const ti = arr.findIndex((s) => s.key === beforeKey);
            arr.splice(ti < 0 ? arr.length : ti, 0, sec);
        } else {
            let lastIdx = -1;
            arr.forEach((s, i) => { if (s.pageKey === sec.pageKey) lastIdx = i; });
            arr.splice(lastIdx + 1, 0, sec);
        }
    }
    // Insert `el` into `arr` before `beforeElKey`, or at the end of its section.
    _spliceElement(arr, el, sectionKey, beforeElKey) {
        if (beforeElKey && beforeElKey !== el.key) {
            const ti = arr.findIndex((e) => e.key === beforeElKey);
            arr.splice(ti < 0 ? arr.length : ti, 0, el);
        } else {
            let lastIdx = -1;
            arr.forEach((e, i) => { if (e.sectionKey === sectionKey) lastIdx = i; });
            arr.splice(lastIdx + 1, 0, el);
        }
    }
    _setSections(secs) { this._parts = { ...this.parts, sections: secs }; this._renumber(); }
    _setElements(els) { this._parts = { ...this.parts, elements: els }; this._renumber(); }

    // Recompute global monotonic order while grouping sections by page and
    // elements by section (preserving each group's current array order). Keeps the
    // flattenBody ordering contract the preview engine relies on.
    _renumber() {
        const parts = this.parts;
        const pages = this.pageList;
        const sections = parts.sections || [];
        const elements = parts.elements || [];
        let secOrder = 0;
        const newSecs = [];
        pages.forEach((pg) => {
            sections
                .filter((s) => (s.pageKey || pages[0].key) === pg.key)
                .forEach((s) => newSecs.push({ ...s, order: ++secOrder }));
        });
        sections
            .filter((s) => !pages.some((p) => p.key === (s.pageKey || pages[0].key)))
            .forEach((s) => newSecs.push({ ...s, order: ++secOrder }));
        let elOrder = 0;
        const newEls = [];
        newSecs.forEach((s) => {
            elements
                .filter((e) => e.sectionKey === s.key)
                .forEach((e) => newEls.push({ ...e, order: ++elOrder }));
        });
        elements
            .filter((e) => !newSecs.some((s) => s.key === e.sectionKey))
            .forEach((e) => newEls.push({ ...e, order: ++elOrder }));
        this._parts = { ...parts, sections: newSecs, elements: newEls };
    }

    _toast(message, variant, title) {
        this.dispatchEvent(new ShowToastEvent({ title: title || '', message, variant: variant || 'info' }));
    }

    // ================= UNDO / REDO =================
    get undoDisabled() { return this._histIndex <= 0; }
    get redoDisabled() { return this._histIndex < 0 || this._histIndex >= this._history.length - 1; }

    // Wipe history to a clean baseline — called when a different form/version loads
    // so undo can't reach across forms.
    _resetHistory() {
        clearTimeout(this._histTimer);
        this._history = [];
        this._histIndex = -1;
        this._restoringHistory = false;
    }

    // Debounced capture (from renderedCallback). Coalesces a burst of reactive
    // re-renders (and rapid typing) into one history entry.
    _trackHistory() {
        if (this._restoringHistory || !this.selectedFormId) return;
        clearTimeout(this._histTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._histTimer = window.setTimeout(() => this._commitHistory(), 350);
    }

    _commitHistory() {
        if (this._restoringHistory || !this.selectedFormId) return;
        const snap = JSON.stringify(this.serializeForm());
        if (this._histIndex < 0) {
            // First snapshot for this form = the baseline.
            this._history = [snap];
            this._histIndex = 0;
            return;
        }
        if (snap === this._history[this._histIndex]) return; // nothing changed
        // A new edit after undo drops the redo tail.
        this._history = this._history.slice(0, this._histIndex + 1);
        this._history.push(snap);
        if (this._history.length > HISTORY_MAX) this._history.shift();
        this._histIndex = this._history.length - 1;
    }

    handleUndo() {
        if (this.undoDisabled) return;
        // Make sure the latest in-flight edit is captured before stepping back, so
        // a debounce that hasn't fired yet isn't lost.
        this._commitHistory();
        if (this.undoDisabled) return;
        this._histIndex -= 1;
        this._applySnapshot(this._history[this._histIndex]);
    }
    handleRedo() {
        if (this.redoDisabled) return;
        this._histIndex += 1;
        this._applySnapshot(this._history[this._histIndex]);
    }

    _applySnapshot(json) {
        this._restoringHistory = true;
        clearTimeout(this._histTimer);
        try {
            const parsed = JSON.parse(json);
            this._parts = flattenBody(parsed);
            this._restoreStudioMeta(parsed.studioMeta);
            this._autofill =
                (parsed.studioMeta && parsed.studioMeta.autofill) ||
                (parsed.formSettings && parsed.formSettings.autofillRules) ||
                [];
            // Drop a selection that no longer exists in the restored model.
            if (this.selectedKey && !this.selectedSection && !this.selectedElement) {
                this.selectedKey = null;
            }
        } catch {
            /* a corrupt snapshot just leaves the current state in place */
        }
        // Release the guard after the resulting render settles (longer than the
        // capture debounce so the restore itself is never recorded as a new entry).
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        window.setTimeout(() => { this._restoringHistory = false; }, 400);
    }
}
