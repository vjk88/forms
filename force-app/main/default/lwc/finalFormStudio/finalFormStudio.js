import { LightningElement, track, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import LightningConfirm from 'lightning/confirm';
import loadStudio from '@salesforce/apex/FinalStudioController.loadStudio';
import saveDraft from '@salesforce/apex/FinalStudioController.saveDraft';
import discardDraft from '@salesforce/apex/FinalStudioController.discardDraft';
import listVersions from '@salesforce/apex/FinalStudioController.listVersions';
import publishSpec from '@salesforce/apex/FinalSpecController.publishSpec';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import { resolveSpecForPublish } from 'c/finalThemeCatalog';

/**
 * finalFormStudio — the builder shell (FORM_STUDIO_IA §2–4, P3 slice 1).
 *
 * URL contract (locked): the form comes from the URL, nothing else —
 * `c__formId` via CurrentPageReference. No id → redirect to the Forms tab
 * (the library IS the picker). Bad id → friendly not-found, never a spinner.
 *
 * Draft model (spec-first ruling, DATA_MODEL_DELTA §2): the working spec is
 * a Form_Version__c row; edits autosave it (debounced); Publish resolves
 * tokens client-side (builder MAY import the catalog — the published path
 * never does) and activates via FinalSpecController.publishSpec, then the
 * draft row is discarded.
 *
 * This slice ships the shell + Design mode (the P2 panel over real drafts).
 * Build mode is a placeholder until the canvas slice; undo/redo until the
 * history slice. All chrome classes st-prefixed (the LEX .stage leak).
 */

const FORMS_TAB = 'Final_Forms';
const SAVE_DEBOUNCE_MS = 900;

/** Schema §6: prefixed, crypto-random, client-minted, 8+ chars. */
function mintId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (const b of bytes) {
        suffix += (b % 36).toString(36);
    }
    return `${prefix}_${suffix}`;
}

export default class FinalFormStudio extends NavigationMixin(LightningElement) {
    @track spec;
    formId;
    formName = '';
    draftVersionId = null;
    versionNumber;
    activeVersionNumber;
    activeVersionId = null;

    /** Top-bar picker rows ({id, versionNumber, isActive, isDraft}). */
    versions = [];
    /** Non-null = viewing that version READ-ONLY; `spec` stays the draft. */
    viewVersionId = null;
    viewSpec = null;
    viewEntry = null;

    mode = 'design';
    /** Build-mode state: what's selected + which page the blueprint shows. */
    selection = null;
    buildPageIndex = 0;
    objectApi = null;
    saveState = 'saved'; // saved | dirty | saving | error
    notFound = false;
    loading = true;
    publishing = false;

    _saveTimer;
    _redirected = false;

    /**
     * LEX CACHES nav-item component instances — a one-shot guard here left a
     * reused instance stuck on the pre-redirect state forever. React to every
     * emission: a (new) id loads; no id with nothing loaded redirects ONCE
     * (the library IS the picker). Emissions for other pages while this
     * instance stays alive fall through harmlessly.
     */
    @wire(CurrentPageReference)
    routed(ref) {
        if (!ref) {
            return;
        }
        const id = ref.state && ref.state.c__formId;
        if (id) {
            this._redirected = false;
            if (id !== this.formId) {
                this.formId = id;
                this._load();
            }
            return;
        }
        if (!this.formId && !this._redirected) {
            this._redirected = true;
            this[NavigationMixin.Navigate]({
                type: 'standard__navItemPage',
                attributes: { apiName: FORMS_TAB }
            });
        }
    }

    async _load() {
        this.loading = true;
        this.notFound = false;
        try {
            const out = await loadStudio({ formId: this.formId });
            this.formName = out.name;
            this.draftVersionId = out.draftVersionId;
            this.versionNumber = out.versionNumber;
            this.activeVersionNumber = out.activeVersionNumber;
            const spec = JSON.parse(out.specJson);
            // `resolved` is a publish artifact (ARCH §5) — a draft seeded
            // from a published version inherits the frozen token snapshot,
            // and the viewer then ignores every theme change (resolved wins
            // over the live engine by contract). Authoring always runs the
            // engine live; Publish re-stamps `resolved` fresh.
            delete spec.resolved;
            this.spec = spec;
            this.objectApi =
                (this.spec.form && this.spec.form.targetObject) ||
                out.objectApi ||
                null;
            this.selection = null;
            this.buildPageIndex = 0;
            this.viewVersionId = null;
            this.viewSpec = null;
            this.viewEntry = null;
            this.saveState = 'saved';
            // not awaited — the picker is chrome, never a gate on first paint
            this._refreshVersions();
        } catch {
            this.notFound = true;
        } finally {
            this.loading = false;
        }
    }

    /** The picker is optional chrome — on failure fall back to the chip. */
    async _refreshVersions() {
        try {
            this.versions = (await listVersions({ formId: this.formId })) || [];
        } catch {
            this.versions = [];
        }
        const active = this.versions.find((v) => v.isActive);
        this.activeVersionId = active ? active.id : null;
    }

    /** Native <option selected> only sets DEFAULT selectedness — after the
     *  user touches the select, the live value must be forced back in sync
     *  (e.g. "Back to draft" from the notice). */
    renderedCallback() {
        const sel = this.template.querySelector('.st-verselect');
        const current = this.viewVersionId || this.editableVersionId;
        if (sel && current && sel.value !== current) {
            sel.value = current;
        }
    }

    // ----- top bar -----

    /** Fallback when the versions list is unavailable. */
    get versionChip() {
        if (this.draftVersionId) {
            return `v${this.versionNumber} · Draft`;
        }
        return this.activeVersionNumber
            ? `v${this.activeVersionNumber} · Published`
            : 'Draft';
    }

    get hasVersions() {
        return this.versions.length > 0;
    }

    /** The one selectable state that edits: the draft, else the active. */
    get editableVersionId() {
        return this.draftVersionId || this.activeVersionId;
    }

    get versionOptions() {
        const current = this.viewVersionId || this.editableVersionId;
        return this.versions.map((v) => {
            let label = `v${v.versionNumber}`;
            if (v.isDraft) {
                label += ' · Draft';
            } else if (v.isActive) {
                label += ' · Published';
            } else {
                // same word the read-only notice uses — one vocabulary
                label += ' · Archived';
            }
            return { id: v.id, label, selected: v.id === current };
        });
    }

    // ----- read-only version viewing -----

    get isReadOnly() {
        return Boolean(this.viewVersionId);
    }

    get isEditable() {
        return !this.isReadOnly;
    }

    get publishDisabled() {
        return this.publishing || this.isReadOnly;
    }

    get readOnlyTitle() {
        const v = this.viewEntry;
        if (!v) {
            return '';
        }
        const kind = v.isActive ? 'published' : 'archived';
        return `Viewing v${v.versionNumber} (${kind}) — read-only.`;
    }

    get readOnlyText() {
        const target = this.draftVersionId ? 'draft' : 'current version';
        return `Switch to the ${target} to edit.`;
    }

    get backToEditableLabel() {
        return this.draftVersionId
            ? 'Back to draft'
            : 'Back to current version';
    }

    async handleVersionChange(event) {
        const id = event.target.value;
        if (!id || id === this.editableVersionId) {
            this.handleBackToEditable();
            return;
        }
        const entry = this.versions.find((v) => v.id === id);
        if (!entry) {
            return;
        }
        // flush a pending edit BEFORE the read-only guards arm — switching
        // to view history must never eat the draft's last keystrokes
        if (this.saveState === 'dirty') {
            clearTimeout(this._saveTimer);
            await this._save();
        }
        try {
            const json = await getSpec({ versionId: id });
            // read-only viewing KEEPS `resolved` — the frozen tokens ARE the
            // published render; stripping is only for specs re-entering the
            // editor (see _load)
            this.viewSpec = JSON.parse(json);
            this.viewEntry = entry;
            this.viewVersionId = id;
            this.selection = null;
            this.propsOpen = false;
        } catch {
            // stay editable; renderedCallback snaps the select back
            this.handleBackToEditable();
        }
    }

    handleBackToEditable() {
        this.viewVersionId = null;
        this.viewSpec = null;
        this.viewEntry = null;
    }

    get savedText() {
        return {
            saved: '✓ All changes saved',
            dirty: 'Unsaved changes',
            saving: 'Saving…',
            error: '⚠ Save failed — retrying on next change'
        }[this.saveState];
    }

    get isDesign() {
        return this.mode === 'design';
    }

    get buildClass() {
        return this.mode === 'build' ? 'st-mode on' : 'st-mode';
    }

    get designClass() {
        return this.mode === 'design' ? 'st-mode on' : 'st-mode';
    }

    get isBuildPressed() {
        return String(this.mode === 'build');
    }

    get isDesignPressed() {
        return String(this.mode === 'design');
    }

    /** Top-bar read-only pill — the left notice alone was too easy to miss. */
    get readOnlyBadge() {
        const v = this.viewEntry;
        return v ? `Read-only · viewing v${v.versionNumber}` : 'Read-only';
    }

    handleModeBuild() {
        if (this.isReadOnly) {
            return;
        }
        this.mode = 'build';
    }

    handleModeDesign() {
        if (this.isReadOnly) {
            return;
        }
        this.mode = 'design';
    }

    handleExit() {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: FORMS_TAB }
        });
    }

    // ----- Build mode: the studio owns every structural mutation -----

    get usedFields() {
        const out = [];
        for (const page of (this.spec && this.spec.pages) || []) {
            for (const section of page.sections || []) {
                for (const el of section.elements || []) {
                    if (el.binding && el.binding.field) {
                        out.push(el.binding.field);
                    }
                }
            }
        }
        return out;
    }

    /** Labels of UNBOUND field elements (legacy/demo specs carry no
     *  binding) — the palette dedupes those by label so its ADDED state
     *  always agrees with what the canvas shows (owner rule: a field on
     *  the canvas can never be added again). */
    get usedLabels() {
        const out = [];
        for (const page of (this.spec && this.spec.pages) || []) {
            for (const section of page.sections || []) {
                for (const el of section.elements || []) {
                    if (
                        el.type === 'field' &&
                        el.label &&
                        !(el.binding && el.binding.field)
                    ) {
                        out.push(el.label.toLowerCase());
                    }
                }
            }
        }
        return out;
    }

    get selectionLabel() {
        const sel = this.selection;
        if (!sel || !this.spec) {
            return null;
        }
        for (const page of this.spec.pages || []) {
            if (sel.kind === 'page' && page.id === sel.id) {
                return page.name || 'Page';
            }
            for (const section of page.sections || []) {
                if (sel.kind === 'section' && section.id === sel.id) {
                    if (section.block) {
                        const first = (section.elements || [])[0];
                        return (first && first.label) || 'Block';
                    }
                    return section.title || 'Section';
                }
                for (const el of section.elements || []) {
                    if (sel.kind === 'element' && el.id === sel.id) {
                        return el.label || el.type;
                    }
                }
            }
        }
        return null;
    }

    /** The left column swaps to properties on an explicit CANVAS click only —
     *  palette click-add selects (highlight) but keeps the palette, so bulk
     *  adding never becomes add → back → add. */
    propsOpen = false;

    get showProperties() {
        return (
            this.mode === 'build' &&
            this.propsOpen &&
            Boolean(this.selectionLabel)
        );
    }

    /** Mutate via a deep copy, then reuse the ONE autosave path. */
    _mutate(fn) {
        if (this.isReadOnly) {
            return;
        }
        const next = JSON.parse(JSON.stringify(this.spec));
        if (fn(next) === false) {
            return;
        }
        this.handleSpecChange({ detail: { spec: next } });
    }

    _currentBuildPage(spec) {
        return (spec.pages || [])[this.buildPageIndex] || null;
    }

    /** Palette field payload → spec element (click-add AND drag-drop). Also
     *  heals pre-creation-controller specs: the first bound field records
     *  the target object the binding belongs to. */
    _mintElement(spec, field) {
        if (spec.form && !spec.form.targetObject && this.objectApi) {
            spec.form.targetObject = this.objectApi;
        }
        const element = {
            id: mintId('el'),
            type: 'field',
            binding: { object: this.objectApi, field: field.apiName },
            label: field.label,
            required: Boolean(field.required),
            // schema §4: `required` is authoring sugar — the validation
            // entry is what the runtime evaluates
            validation: field.required
                ? [
                      {
                          type: 'required',
                          message: `${field.label} is required.`
                      }
                  ]
                : [],
            config: { inputType: field.inputType },
            visibility: null
        };
        if (field.options) {
            element.config.options = field.options;
        }
        return element;
    }

    _mintSection(title) {
        return { id: mintId('sec'), title, columns: 1, elements: [] };
    }

    _findSection(spec, sectionId) {
        for (const page of spec.pages || []) {
            const section = (page.sections || []).find(
                (s) => s.id === sectionId
            );
            if (section) {
                return { page, section };
            }
        }
        return null;
    }

    _findElement(spec, elId) {
        for (const page of spec.pages || []) {
            for (const section of page.sections || []) {
                const index = (section.elements || []).findIndex(
                    (el) => el.id === elId
                );
                if (index >= 0) {
                    return {
                        page,
                        section,
                        index,
                        element: section.elements[index]
                    };
                }
            }
        }
        return null;
    }

    /** A page's last section, minted if the page has none (the legacy
     *  _ensureSectionOnPage behavior for chip drops). */
    _lastSectionOf(page) {
        page.sections = page.sections || [];
        let section = page.sections[page.sections.length - 1];
        if (!section) {
            section = this._mintSection('Section');
            page.sections.push(section);
        }
        return section;
    }

    handleAddField(event) {
        const field = event.detail.field;
        this._mutate((spec) => {
            let page = this._currentBuildPage(spec);
            if (!page) {
                page = { id: mintId('pg'), name: 'Page 1', sections: [] };
                spec.pages = spec.pages || [];
                spec.pages.push(page);
                this.buildPageIndex = 0;
            }
            let section = null;
            const sel = this.selection || {};
            if (sel.kind === 'section' || sel.kind === 'element') {
                for (const s of page.sections || []) {
                    if (
                        s.id === sel.id ||
                        (s.elements || []).some((el) => el.id === sel.id)
                    ) {
                        section = s;
                    }
                }
            }
            if (!section) {
                section = (page.sections || [])[page.sections.length - 1];
            }
            if (!section) {
                section = this._mintSection('Section');
                page.sections = page.sections || [];
                page.sections.push(section);
            }
            const element = this._mintElement(spec, field);
            section.elements = section.elements || [];
            section.elements.push(element);
            this.selection = { kind: 'element', id: element.id };
        });
    }

    // ----- DnD intents (slice 3b — the canvas validated, the studio moves) -----

    /** Palette field dropped at a position: into a section (before an
     *  element or appended), or onto a page chip (that page's last section). */
    handleDropField(event) {
        const { field, sectionId, beforeId, pageId } = event.detail;
        this._mutate((spec) => {
            let section = null;
            if (sectionId) {
                const hit = this._findSection(spec, sectionId);
                section = hit && hit.section;
            } else if (pageId) {
                const page = (spec.pages || []).find((p) => p.id === pageId);
                if (!page) {
                    return false;
                }
                section = this._lastSectionOf(page);
                // a drop onto a page chip means "work there now"
                this.buildPageIndex = spec.pages.indexOf(page);
            }
            if (!section) {
                return false;
            }
            const element = this._mintElement(spec, field);
            section.elements = section.elements || [];
            const at = beforeId
                ? section.elements.findIndex((el) => el.id === beforeId)
                : -1;
            if (at >= 0) {
                section.elements.splice(at, 0, element);
            } else {
                section.elements.push(element);
            }
            this.selection = { kind: 'element', id: element.id };
            return undefined;
        });
    }

    /** Schema §4: content elements always carry binding null. Labels feed
     *  the blueprint; config defaults keep a fresh block visibly useful
     *  until its properties editor lands. */
    _mintBlockElement(blockType) {
        const defaults = {
            richText: { label: 'Display text', config: { html: '' } },
            image: { label: 'Image', config: {} },
            divider: { label: 'Divider', config: {} },
            spacer: { label: 'Spacer', config: { height: 24 } }
        };
        const d = defaults[blockType] || { label: blockType, config: {} };
        return {
            id: mintId('el'),
            type: blockType,
            binding: null,
            label: d.label,
            required: false,
            validation: [],
            config: d.config,
            visibility: null
        };
    }

    /**
     * Content block placed (CANVAS_RULES §1/§3): INTO a field section
     * ({sectionId, beforeId}) as an ordinary element, or STANDALONE
     * ({pageId, beforeSectionId}) as a marked wrapper section — the legacy
     * serialization invariant, spec-shaped.
     */
    handleDropBlock(event) {
        const { blockType, sectionId, beforeId, beforeSectionId, pageId } =
            event.detail;
        this._mutate((spec) => {
            const element = this._mintBlockElement(blockType);
            if (sectionId) {
                const hit = this._findSection(spec, sectionId);
                if (!hit || hit.section.block) {
                    return false; // §3: blocks hold nothing
                }
                const els = (hit.section.elements = hit.section.elements || []);
                const at = beforeId
                    ? els.findIndex((el) => el.id === beforeId)
                    : -1;
                if (at >= 0) {
                    els.splice(at, 0, element);
                } else {
                    els.push(element);
                }
            } else {
                const page =
                    (spec.pages || []).find((p) => p.id === pageId) ||
                    this._currentBuildPage(spec);
                if (!page) {
                    return false;
                }
                const wrapper = {
                    id: mintId('sec'),
                    title: '',
                    style: 'plain',
                    columns: 1,
                    block: true,
                    elements: [element]
                };
                page.sections = page.sections || [];
                const at = beforeSectionId
                    ? page.sections.findIndex((s) => s.id === beforeSectionId)
                    : -1;
                if (at >= 0) {
                    page.sections.splice(at, 0, wrapper);
                } else {
                    page.sections.push(wrapper);
                }
                if (pageId) {
                    this.buildPageIndex = spec.pages.indexOf(page);
                }
            }
            this.selection = { kind: 'element', id: element.id };
            return undefined;
        });
    }

    /** Palette click-add: a standalone block at the end of the current
     *  page (palette stays — same bulk-add ruling as fields). */
    handleAddBlock(event) {
        this.handleDropBlock({
            detail: { blockType: event.detail.blockType }
        });
    }

    handleMoveElement(event) {
        const { id, sectionId, beforeId, pageId } = event.detail;
        if (beforeId === id) {
            return; // dropped on itself
        }
        this._mutate((spec) => {
            const src = this._findElement(spec, id);
            if (!src) {
                return false;
            }
            let target = null;
            if (sectionId) {
                const hit = this._findSection(spec, sectionId);
                target = hit && hit.section;
            } else if (pageId) {
                const page = (spec.pages || []).find((p) => p.id === pageId);
                if (!page) {
                    return false;
                }
                target = this._lastSectionOf(page);
            }
            if (!target) {
                return false;
            }
            src.section.elements.splice(src.index, 1);
            target.elements = target.elements || [];
            const at = beforeId
                ? target.elements.findIndex((el) => el.id === beforeId)
                : -1;
            if (at >= 0) {
                target.elements.splice(at, 0, src.element);
            } else {
                target.elements.push(src.element);
            }
            this.selection = { kind: 'element', id };
            return undefined;
        });
    }

    handleMoveSection(event) {
        const { id, beforeSectionId, pageId } = event.detail;
        if (id === beforeSectionId) {
            return;
        }
        this._mutate((spec) => {
            let srcPage = null;
            let srcIdx = -1;
            for (const p of spec.pages || []) {
                const i = (p.sections || []).findIndex((s) => s.id === id);
                if (i >= 0) {
                    srcPage = p;
                    srcIdx = i;
                    break;
                }
            }
            const target = (spec.pages || []).find((p) => p.id === pageId);
            if (!srcPage || !target) {
                return false;
            }
            const [section] = srcPage.sections.splice(srcIdx, 1);
            target.sections = target.sections || [];
            const at = beforeSectionId
                ? target.sections.findIndex((s) => s.id === beforeSectionId)
                : -1;
            if (at >= 0) {
                target.sections.splice(at, 0, section);
            } else {
                target.sections.push(section);
            }
            this.selection = { kind: 'section', id };
            return undefined;
        });
    }

    handleMovePage(event) {
        const { id, beforeId } = event.detail;
        if (id === beforeId) {
            return;
        }
        this._mutate((spec) => {
            const pages = spec.pages || [];
            const activeId = (pages[this.buildPageIndex] || {}).id;
            const from = pages.findIndex((p) => p.id === id);
            if (from < 0) {
                return false;
            }
            const [page] = pages.splice(from, 1);
            const at = beforeId
                ? pages.findIndex((p) => p.id === beforeId)
                : -1;
            if (at >= 0) {
                pages.splice(at, 0, page);
            } else {
                pages.push(page);
            }
            // the blueprint keeps showing the page the user was on
            const keep = pages.findIndex((p) => p.id === activeId);
            this.buildPageIndex = keep >= 0 ? keep : 0;
            this.selection = { kind: 'page', id };
            return undefined;
        });
    }

    /** Preview-click selection sync (P3 requirement): a click on an element
     *  in the live preview selects it on the blueprint + opens properties. */
    handlePreviewSelect(event) {
        const id = event.detail.elementId;
        (this.spec.pages || []).forEach((p, i) => {
            for (const s of p.sections || []) {
                if ((s.elements || []).some((el) => el.id === id)) {
                    this.buildPageIndex = i;
                }
            }
        });
        this.selection = { kind: 'element', id };
        this.propsOpen = true;
    }

    handleAddPage() {
        this._mutate((spec) => {
            spec.pages = spec.pages || [];
            const page = {
                id: mintId('pg'),
                name: `Page ${spec.pages.length + 1}`,
                sections: []
            };
            spec.pages.push(page);
            this.buildPageIndex = spec.pages.length - 1;
            this.selection = { kind: 'page', id: page.id };
        });
    }

    handleAddSection(event) {
        const pageId = event.detail.pageId;
        this._mutate((spec) => {
            const page =
                (spec.pages || []).find((p) => p.id === pageId) ||
                this._currentBuildPage(spec);
            if (!page) {
                return false;
            }
            const section = {
                id: mintId('sec'),
                title: `Section ${(page.sections || []).length + 1}`,
                columns: 1,
                elements: []
            };
            page.sections = page.sections || [];
            page.sections.push(section);
            this.selection = { kind: 'section', id: section.id };
            return undefined;
        });
    }

    handleRemoveElement(event) {
        const id = event.detail.id;
        this._mutate((spec) => {
            for (const page of spec.pages || []) {
                for (const section of page.sections || []) {
                    const i = (section.elements || []).findIndex(
                        (el) => el.id === id
                    );
                    if (i >= 0) {
                        section.elements.splice(i, 1);
                        this.selection = null;
                        return undefined;
                    }
                }
            }
            return false;
        });
    }

    handleRemoveSection(event) {
        const id = event.detail.id;
        this._mutate((spec) => {
            for (const page of spec.pages || []) {
                const i = (page.sections || []).findIndex((s) => s.id === id);
                if (i >= 0) {
                    page.sections.splice(i, 1);
                    this.selection = null;
                    return undefined;
                }
            }
            return false;
        });
    }

    handleRemovePage(event) {
        const id = event.detail.id;
        this._mutate((spec) => {
            const i = (spec.pages || []).findIndex((p) => p.id === id);
            if (i < 0 || spec.pages.length < 2) {
                return false; // never delete the only page
            }
            spec.pages.splice(i, 1);
            this.buildPageIndex = Math.min(
                this.buildPageIndex,
                spec.pages.length - 1
            );
            this.selection = null;
            return undefined;
        });
    }

    handleSelect(event) {
        this.selection = event.detail;
        this.propsOpen = true;
    }

    handleBuildPageChange(event) {
        this.buildPageIndex = event.detail.index;
    }

    handleBackToPalette() {
        this.propsOpen = false;
    }

    // ----- edit → autosave -----

    handleSpecChange(event) {
        if (this.isReadOnly) {
            return; // viewing history is inert — autosave must never arm
        }
        this.spec = event.detail.spec;
        this.saveState = 'dirty';
        clearTimeout(this._saveTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._saveTimer = setTimeout(() => this._save(), SAVE_DEBOUNCE_MS);
    }

    async _save() {
        if (this.isReadOnly) {
            return; // belt over the cleared timer — history view never writes
        }
        this.saveState = 'saving';
        try {
            const hadDraft = Boolean(this.draftVersionId);
            this.draftVersionId = await saveDraft({
                formId: this.formId,
                specJson: JSON.stringify(this.spec)
            });
            if (!hadDraft) {
                // first edit created the draft row — chip AND picker must say so
                this.versionNumber = (this.activeVersionNumber || 0) + 1;
                this._refreshVersions();
            }
            this.saveState = 'saved';
        } catch {
            this.saveState = 'error';
        }
    }

    // ----- publish (resolve-at-publish, P2 contract) -----

    async handlePublish() {
        if (this.isReadOnly) {
            return; // publish belongs to the editable state only
        }
        const ok = await LightningConfirm.open({
            message: `Publish "${this.formName}"? The live form updates immediately.`,
            label: 'Publish form'
        });
        if (!ok) {
            return;
        }
        this.publishing = true;
        try {
            clearTimeout(this._saveTimer);
            let customProps = null;
            const theme = this.spec.theme || {};
            if (theme.source === 'custom' && theme.name) {
                const json = await getCustomTheme({ themeId: theme.name });
                customProps = json ? JSON.parse(json) : null;
            }
            const resolved = resolveSpecForPublish(this.spec, customProps);
            await publishSpec({
                formId: this.formId,
                specJson: JSON.stringify(resolved)
            });
            if (this.draftVersionId) {
                await discardDraft({ draftVersionId: this.draftVersionId });
            }
            await this._load();
        } catch {
            this.saveState = 'error';
        } finally {
            this.publishing = false;
        }
    }

    // ----- custom-theme editor (same wiring as the P2 harness) -----

    @track editorOpen = false;
    editorThemeId = null;
    editorStartFrom = null;

    handleThemeEdit(event) {
        this.editorThemeId = event.detail.themeId;
        this.editorStartFrom = event.detail.startFrom;
        this.editorOpen = true;
    }

    handleEditorCancel() {
        this.editorOpen = false;
    }

    async handleThemeSaved(event) {
        this.editorOpen = false;
        const next = JSON.parse(JSON.stringify(this.spec));
        next.theme = { source: 'custom', name: event.detail.id, overrides: {} };
        this.handleSpecChange({ detail: { spec: next } });
        const panel = this.template.querySelector('c-final-design-panel');
        if (panel) {
            await panel.refreshThemes();
        }
    }
}
