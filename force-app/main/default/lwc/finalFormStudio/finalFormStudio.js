import { LightningElement, track, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import LightningConfirm from 'lightning/confirm';
import loadStudio from '@salesforce/apex/FinalStudioController.loadStudio';
import saveDraft from '@salesforce/apex/FinalStudioController.saveDraft';
import discardDraft from '@salesforce/apex/FinalStudioController.discardDraft';
import publishSpec from '@salesforce/apex/FinalSpecController.publishSpec';
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

export default class FinalFormStudio extends NavigationMixin(
    LightningElement
) {
    @track spec;
    formId;
    formName = '';
    draftVersionId = null;
    versionNumber;
    activeVersionNumber;

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
            this.spec = JSON.parse(out.specJson);
            this.objectApi =
                (this.spec.form && this.spec.form.targetObject) ||
                out.objectApi ||
                null;
            this.selection = null;
            this.buildPageIndex = 0;
            this.saveState = 'saved';
        } catch (e) {
            this.notFound = true;
        } finally {
            this.loading = false;
        }
    }

    // ----- top bar -----

    get versionChip() {
        if (this.draftVersionId) {
            return `v${this.versionNumber} · Draft`;
        }
        return this.activeVersionNumber
            ? `v${this.activeVersionNumber} · Published`
            : 'Draft';
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

    handleModeBuild() {
        this.mode = 'build';
    }

    handleModeDesign() {
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
        const next = JSON.parse(JSON.stringify(this.spec));
        if (fn(next) === false) {
            return;
        }
        this.handleSpecChange({ detail: { spec: next } });
    }

    _currentBuildPage(spec) {
        return (spec.pages || [])[this.buildPageIndex] || null;
    }

    handleAddField(event) {
        const field = event.detail.field;
        this._mutate((spec) => {
            // heal pre-creation-controller specs: the first bound field also
            // records the target object the binding belongs to
            if (spec.form && !spec.form.targetObject && this.objectApi) {
                spec.form.targetObject = this.objectApi;
            }
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
                section = {
                    id: mintId('sec'),
                    title: 'Section',
                    columns: 1,
                    elements: []
                };
                page.sections = page.sections || [];
                page.sections.push(section);
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
            section.elements = section.elements || [];
            section.elements.push(element);
            this.selection = { kind: 'element', id: element.id };
        });
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
        this.spec = event.detail.spec;
        this.saveState = 'dirty';
        clearTimeout(this._saveTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._saveTimer = setTimeout(() => this._save(), SAVE_DEBOUNCE_MS);
    }

    async _save() {
        this.saveState = 'saving';
        try {
            const hadDraft = Boolean(this.draftVersionId);
            this.draftVersionId = await saveDraft({
                formId: this.formId,
                specJson: JSON.stringify(this.spec)
            });
            if (!hadDraft) {
                // first edit created the draft row — the chip must say so
                this.versionNumber = (this.activeVersionNumber || 0) + 1;
            }
            this.saveState = 'saved';
        } catch (e) {
            this.saveState = 'error';
        }
    }

    // ----- publish (resolve-at-publish, P2 contract) -----

    async handlePublish() {
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
        } catch (e) {
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
