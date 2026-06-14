import { LightningElement, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { materialize, LAYOUT_GROUPS, LAYOUT_LABELS } from 'c/layoutModel';
import {
    FORM_TEMPLATES,
    toEngineParts,
    toBodyJson,
    bareLayoutTemplate,
    sampleLayoutParts,
    bodyToEngineParts,
    customRecordToTemplate,
    SAMPLE_HEADER
} from 'c/formTemplates';
import {
    THEME_OPTIONS,
    skinsForTheme,
    resolveTheme,
    THEMES
} from 'c/formThemes';
import getCreateObjects from '@salesforce/apex/FormCreateController.getCreateObjects';
import createFromTemplate from '@salesforce/apex/FormCreateController.createFromTemplate';
import listTemplates from '@salesforce/apex/FormTemplateController.listTemplates';
import deleteTemplateApex from '@salesforce/apex/FormTemplateController.deleteTemplate';

// Each card mounts a LIVE preview engine; lazy-mount past the first row.
const INITIAL_BATCH = 6;
const ACCENT_SWATCHES = [
    '#0176d3', '#4f46e5', '#7c3aed', '#0d9488',
    '#059669', '#c9a24b', '#d4380d', '#e8590c'
];

/**
 * c/formCreationGallery — form creation, two entry modes (Phase 3 T3.5):
 *   • Start from a template — all templates (built-in + saved custom)
 *   • Start from scratch    — the 8 layouts (3 groups) as live previews
 * Screen 2 = big live preview + Layout / Theme / Skin dropdowns + Accent picker
 * + name/object. Appearance rides the new Theme→Skin→Accent model (resolveTheme).
 * "Save as my template" was removed (moved to a form-level action — tabled).
 *
 * Emits `formcreated` {formId, versionId} and `close`.
 */
export default class FormCreationGallery extends LightningElement {
    @track entryMode = 'template'; // 'template' | 'scratch'
    @track selectedId = null;
    @track formName = '';
    @track chosenObject = '';

    // Screen-2 appearance selection (the new model).
    @track chosenLayout = 'stacked';
    @track chosenThemeId = 'cloud';
    @track chosenSkinId = 'light';
    @track chosenAccent = '';

    @track isCreating = false;
    @track errorMessage = '';
    @track createdInfo = null;
    @track previewDevice = 'desktop';

    _objectOptions = [];
    @track _customTemplates = [];
    _wiredTemplates;

    @track _visibleKeys = [];
    _observer;

    // -------------------------------------------------------------- wires
    @wire(getCreateObjects)
    wiredObjects({ data }) {
        if (data) {
            this._objectOptions = data.map((o) => ({ label: o.label, value: o.value }));
        }
    }
    get objectOptions() {
        return this._objectOptions;
    }

    @wire(listTemplates)
    wiredTemplates(result) {
        this._wiredTemplates = result;
        if (result.data) {
            this._customTemplates = result.data.map(customRecordToTemplate);
        }
    }

    // ------------------------------------------------------ entry mode (Screen 1)
    get isGalleryView() {
        return !this.selectedId;
    }
    get isTemplateMode() {
        return this.entryMode === 'template';
    }
    get isScratchMode() {
        return this.entryMode === 'scratch';
    }
    get templateTabClass() {
        return this.isTemplateMode ? 'entry-tab is-active' : 'entry-tab';
    }
    get scratchTabClass() {
        return this.isScratchMode ? 'entry-tab is-active' : 'entry-tab';
    }
    handleEntryTemplate() {
        this._visibleKeys = [];
        this.entryMode = 'template';
    }
    handleEntryScratch() {
        this._visibleKeys = [];
        this.entryMode = 'scratch';
    }

    // ------------------------------------------------------ catalogs
    // Templates = built-in + saved custom (the "Start from a template" grid).
    get templateSources() {
        const builtIn = FORM_TEMPLATES.map((t) => ({ ...t, source: 'builtin' }));
        return [...this._customTemplates, ...builtIn];
    }
    // Layouts = the 8 canonical layouts, grouped (the "Start from scratch" grid).
    get layoutSources() {
        return LAYOUT_GROUPS.flatMap((g) => g.layouts.map((id) => bareLayoutTemplate(id)));
    }

    templateByIdLocal(id) {
        return [...this.templateSources, ...this.layoutSources].find((t) => t.id === id) || null;
    }

    get templateCards() {
        const visible = new Set(this._visibleKeys);
        return this.templateSources.map((t, i) =>
            this.toCard(t, visible.has(t.id) || i < INITIAL_BATCH)
        );
    }

    // Grouped layout cards for "Start from scratch".
    get scratchGroups() {
        const visible = new Set(this._visibleKeys);
        let n = 0;
        return LAYOUT_GROUPS.map((g) => ({
            id: g.id,
            label: g.label,
            hint: g.hint,
            cards: g.layouts.map((id) => {
                const card = this.toCard(bareLayoutTemplate(id), visible.has(`layout-${id}`) || n < INITIAL_BATCH);
                n += 1;
                return card;
            })
        }));
    }

    // ------------------------------------------------- live engine parts
    // Resolve a template/layout's preview skin via the new Theme→Skin→Accent
    // model. accentOverride applies the Screen-2 accent picker.
    skinFor(tpl, accentOverride) {
        const themeId = (tpl && tpl.themeId) || 'cloud';
        const skinId = (tpl && tpl.skinId) || THEMES[themeId]?.defaultSkin || 'light';
        const accent = accentOverride || (tpl && tpl.accent) || '';
        return resolveTheme(themeId, skinId, accent ? { accent } : undefined);
    }

    engineFor(tpl, layoutId, skin) {
        const archetype = layoutId || (tpl && tpl.archetype) || 'stacked';
        if (tpl && tpl.source === 'custom') {
            let body = {};
            let spec = null;
            try { body = JSON.parse(tpl.bodyJson || '{}'); } catch { body = {}; }
            const parts = bodyToEngineParts(body);
            try {
                spec = tpl.specJson ? JSON.parse(tpl.specJson) : materialize(archetype, parts.pages, parts.sections);
            } catch { spec = null; }
            if (spec) spec.density = spec.density || 'comfortable';
            return { parts, spec, skin };
        }
        const parts = tpl && tpl.source === 'layout' ? sampleLayoutParts() : toEngineParts(tpl, null);
        let spec = null;
        try {
            spec = materialize(archetype, parts.pages, parts.sections);
            if (spec) spec.density = 'comfortable';
        } catch { spec = null; }
        return { parts, spec, skin };
    }

    toCard(tpl, showPreview) {
        const base = {
            id: tpl.id,
            name: tpl.name,
            description: tpl.description,
            icon: tpl.icon,
            isCustom: tpl.source === 'custom',
            objectTag:
                tpl.source === 'layout'
                    ? 'Layout'
                    : tpl.suggestedObjectLabel || (tpl.formType === 'Survey' ? 'Survey' : 'Pick an object'),
            showPreview,
            previewScale: '0.18'
        };
        if (!showPreview) {
            return { ...base, spec: null, pages: [], sections: [], elements: [], skin: null, title: '' };
        }
        const eng = this.engineFor(tpl, null, this.skinFor(tpl, null));
        return {
            ...base,
            spec: eng.spec,
            pages: eng.parts.pages,
            sections: eng.parts.sections,
            elements: eng.parts.elements,
            skin: eng.skin,
            title: this.previewHeader(tpl).title
        };
    }

    // ------------------------------------------------- lazy preview mounting
    renderedCallback() {
        if (!this.isGalleryView) return;
        if (!this._observer && typeof IntersectionObserver !== 'undefined') {
            this._observer = new IntersectionObserver(
                (entries) => this.onCardsIntersect(entries),
                { root: null, rootMargin: '300px 0px', threshold: 0.01 }
            );
        }
        if (!this._observer) return;
        this.template.querySelectorAll('.t-card').forEach((el) => {
            if (el.dataset.showing !== '1') this._observer.observe(el);
        });
    }
    onCardsIntersect(entries) {
        const next = new Set(this._visibleKeys);
        let changed = false;
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.dataset.id;
            if (id && !next.has(id)) { next.add(id); changed = true; }
            entry.target.dataset.showing = '1';
            this._observer.unobserve(entry.target);
        });
        if (changed) this._visibleKeys = [...next];
    }
    disconnectedCallback() {
        if (this._observer) { this._observer.disconnect(); this._observer = undefined; }
    }

    handlePick(event) {
        this.openDetail(event.currentTarget.dataset.id);
    }
    handlePickKey(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.openDetail(event.currentTarget.dataset.id);
        }
    }

    // --------------------------------------------------------- detail (Screen 2)
    openDetail(id) {
        const tpl = this.templateByIdLocal(id);
        if (!tpl) return;
        this.selectedId = id;
        this.formName = tpl.name === `${LAYOUT_LABELS[tpl.archetype]} layout` ? '' : tpl.name;
        this.chosenObject = tpl.suggestedObject || '';
        this.chosenLayout = tpl.archetype || 'stacked';
        this.chosenThemeId = tpl.themeId || 'cloud';
        this.chosenSkinId = tpl.skinId || THEMES[this.chosenThemeId]?.defaultSkin || 'light';
        this.chosenAccent = tpl.accent || '';
        this.errorMessage = '';
        this.createdInfo = null;
        this.previewDevice = 'desktop';
    }

    get selectedTemplate() {
        return this.selectedId ? this.templateByIdLocal(this.selectedId) : null;
    }
    get isDetailView() {
        return !!this.selectedId && !this.createdInfo;
    }
    get isDoneView() {
        return !!this.createdInfo;
    }

    // ---- Screen-2 dropdowns ----
    get layoutOptions() {
        return LAYOUT_GROUPS.flatMap((g) =>
            g.layouts.map((id) => ({ label: `${LAYOUT_LABELS[id]} · ${g.label}`, value: id }))
        );
    }
    get themeOptions() {
        return THEME_OPTIONS;
    }
    get skinOptions() {
        return skinsForTheme(this.chosenThemeId);
    }
    get accentSwatches() {
        return ACCENT_SWATCHES.map((hex) => ({
            hex,
            style: `background:${hex};`,
            cls: hex === this.chosenAccent ? 'swatch is-active' : 'swatch'
        }));
    }

    handleLayout(e) { this.chosenLayout = e.detail.value; }
    handleTheme(e) {
        this.chosenThemeId = e.detail.value;
        // reset skin to the new theme's default (skins differ per theme)
        this.chosenSkinId = THEMES[this.chosenThemeId]?.defaultSkin || 'light';
    }
    handleSkin(e) { this.chosenSkinId = e.detail.value; }
    handleAccentInput(e) { this.chosenAccent = e.target.value; }
    handleAccentSwatch(e) { this.chosenAccent = e.currentTarget.dataset.hex; }
    handleAccentClear() { this.chosenAccent = ''; }

    get effectiveSkin() {
        return resolveTheme(
            this.chosenThemeId,
            this.chosenSkinId,
            this.chosenAccent ? { accent: this.chosenAccent } : undefined
        );
    }

    get detailCard() {
        const tpl = this.selectedTemplate;
        if (!tpl) return null;
        const eng = this.engineFor(tpl, this.chosenLayout, this.effectiveSkin);
        const hdr = this.previewHeader(tpl);
        return {
            spec: eng.spec,
            pages: eng.parts.pages,
            sections: eng.parts.sections,
            elements: eng.parts.elements,
            skin: eng.skin,
            title: hdr.title,
            subtitle: hdr.subtitle,
            logo: hdr.logo
        };
    }

    previewHeader(tpl) {
        if (tpl && tpl.source === 'layout') return SAMPLE_HEADER;
        return {
            title: (tpl && tpl.header && tpl.header.title) || '',
            subtitle: (tpl && tpl.header && tpl.header.subtitle) || '',
            logo: ''
        };
    }

    get detailScale() {
        return this.previewDevice === 'mobile' ? '0.5' : '0.42';
    }
    get stageStyle() {
        const w = this.previewDevice === 'mobile' ? '390px' : '100%';
        return `width:${w}; max-width:100%; margin:0 auto;`;
    }
    get desktopBtnClass() {
        return this.previewDevice === 'desktop' ? 'dev-btn is-on' : 'dev-btn';
    }
    get mobileBtnClass() {
        return this.previewDevice === 'mobile' ? 'dev-btn is-on' : 'dev-btn';
    }
    handleDesktop() { this.previewDevice = 'desktop'; }
    handleMobile() { this.previewDevice = 'mobile'; }

    // ---- object + name ----
    get needsObjectPicker() {
        const tpl = this.selectedTemplate;
        return !!tpl && !tpl.suggestedObject && tpl.formType !== 'Survey';
    }
    get boundObjectLabel() {
        const tpl = this.selectedTemplate;
        if (!tpl) return '';
        if (tpl.suggestedObject) return tpl.suggestedObjectLabel || tpl.suggestedObject;
        return tpl.formType === 'Survey' ? 'Survey responses' : '';
    }
    get showBoundObject() {
        return !this.needsObjectPicker && !!this.boundObjectLabel;
    }
    handleName(e) { this.formName = e.detail.value; }
    handleObjectChange(e) { this.chosenObject = e.detail.value; }

    get createDisabled() {
        if (this.isCreating || !this.formName.trim()) return true;
        if (this.needsObjectPicker && !this.chosenObject) return true;
        return false;
    }
    get isCustomSelected() {
        const t = this.selectedTemplate;
        return !!t && t.source === 'custom';
    }

    handleBack() {
        this.selectedId = null;
        this.errorMessage = '';
        this._visibleKeys = [];
    }
    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    // ---- payload + create ----
    buildPayload(tpl, object) {
        const skin = this.effectiveSkin;
        if (tpl.source === 'custom') {
            let bodyJson = tpl.bodyJson;
            try {
                const body = JSON.parse(tpl.bodyJson || '{}');
                body.formSettings = body.formSettings || {};
                body.formSettings.theme = { ...skin };
                bodyJson = JSON.stringify(body);
            } catch { /* keep original */ }
            let specJson = tpl.specJson;
            try {
                const parts = bodyToEngineParts(JSON.parse(tpl.bodyJson || '{}'));
                specJson = JSON.stringify(materialize(this.chosenLayout, parts.pages, parts.sections));
            } catch { /* keep original spec */ }
            return { bodyJson, specJson };
        }
        const parts = toEngineParts(tpl, null);
        let specJson = '';
        try {
            specJson = JSON.stringify(materialize(this.chosenLayout, parts.pages, parts.sections));
        } catch { specJson = ''; }
        const body = toBodyJson(tpl, object, null);
        body.formSettings.theme = { ...skin, layout: body.formSettings.theme && body.formSettings.theme.layout };
        return { bodyJson: JSON.stringify(body), specJson };
    }

    handleCreate() {
        if (this.createDisabled) return;
        const tpl = this.selectedTemplate;
        if (!tpl) return;
        this.isCreating = true;
        this.errorMessage = '';
        const object = this.chosenObject || '';
        const payload = this.buildPayload(tpl, object);

        createFromTemplate({
            formName: this.formName.trim(),
            objectApiName: object || null,
            formType: tpl.formType,
            layoutMode: tpl.layoutMode,
            allowedAdapters: (tpl.adapters || ['Internal_Record_Page']).join(';'),
            bodyJson: payload.bodyJson,
            layoutSpecJson: payload.specJson
        })
            .then((res) => {
                this.isCreating = false;
                this.createdInfo = res;
                this.dispatchEvent(
                    new CustomEvent('formcreated', {
                        detail: { formId: res.formId, versionId: res.versionId }
                    })
                );
            })
            .catch((e) => {
                this.isCreating = false;
                this.errorMessage =
                    (e && e.body && e.body.message) || 'Something went wrong creating the form.';
            });
    }

    handleDeleteTemplate() {
        const tpl = this.selectedTemplate;
        if (!tpl || tpl.source !== 'custom') return;
        deleteTemplateApex({ templateId: tpl.id })
            .then(() => {
                this.selectedId = null;
                return refreshApex(this._wiredTemplates);
            })
            .catch((e) => {
                this.errorMessage =
                    (e && e.body && e.body.message) || 'Could not delete template.';
            });
    }

    handleStartOver() {
        this.selectedId = null;
        this.createdInfo = null;
    }
}
