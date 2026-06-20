import { LightningElement, api, track, wire } from 'lwc';
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
    THEME_CATALOG,
    THEME_FILTERS,
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
    // 'form' | 'survey' — set by the host (formStudio's active tab). Drives the
    // create noun/labels and the formType for type-agnostic (layout/scratch) picks.
    @api mode = 'form';

    @track entryMode = 'scratch'; // 'template' | 'scratch' — scratch is the default tab
    @track selectedId = null;
    @track formName = '';
    @track chosenObject = '';

    // Screen-2 appearance selection (the new model).
    @track chosenLayout = 'stacked';
    @track chosenThemeId = 'cloud';
    @track chosenSkinId = 'light';
    @track chosenAccent = '';

    // Theme-picker step (scratch path: layout → theme → details).
    @track pickingTheme = false;
    @track themeFilter = ''; // '' = All; else a tag value from THEME_FILTERS

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

    // ---- noun / labels (form vs survey) ----
    get isSurveyMode() {
        return this.mode === 'survey';
    }
    get noun() {
        return this.isSurveyMode ? 'survey' : 'form';
    }
    get gTitle() {
        return this.isSurveyMode ? 'Create a survey' : 'Create a form';
    }
    get createLabel() {
        return this.isSurveyMode ? 'Create survey' : 'Create form';
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
    // aria-selected reflects the active entry tab (string per ARIA).
    get templateSelected() {
        return this.isTemplateMode ? 'true' : 'false';
    }
    get scratchSelected() {
        return this.isScratchMode ? 'true' : 'false';
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
            // Layout + theme for the scratch grid's CSS mini-mockup (c/layoutThumb).
            archetype: tpl.archetype,
            themeId: tpl.themeId,
            skinId: tpl.skinId,
            isCustom: tpl.source === 'custom',
            objectTag:
                tpl.source === 'layout'
                    ? 'Layout'
                    : tpl.suggestedObjectLabel || (tpl.formType === 'Survey' ? 'Survey' : 'Pick an object'),
            ariaLabel:
                tpl.source === 'layout'
                    ? `${tpl.name} — layout`
                    : `${tpl.name} — ${tpl.suggestedObjectLabel || (tpl.formType === 'Survey' ? 'Survey' : 'pick an object')}`,
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

    // ------------------------------------------------- focus management
    // Move focus on view transitions so keyboard/SR users don't lose their place.
    _pendingFocus;
    _lastOpenedId;
    _manageFocus() {
        if (!this._pendingFocus) return;
        let el = null;
        if (this._pendingFocus === 'detail') {
            el = this.template.querySelector('.d-back');
        } else if (this._pendingFocus === 'done') {
            el = this.template.querySelector('.done-title');
        } else if (this._pendingFocus === 'gallery') {
            el =
                (this._lastOpenedId &&
                    this.template.querySelector(`.t-card[data-id="${this._lastOpenedId}"]`)) ||
                this.template.querySelector('.entry-tab.is-active') ||
                this.template.querySelector('.entry-tab');
        } else if (this._pendingFocus === 'theme') {
            el = this.template.querySelector('.thm-back');
        }
        if (el) {
            el.focus();
            this._pendingFocus = null;
        }
    }

    // ------------------------------------------------- lazy preview mounting
    renderedCallback() {
        this._manageFocus();
        if (!this.isGalleryView) return; // only the gallery's live-engine cards lazy-mount
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
        this.selectCard(event.currentTarget.dataset.id);
    }
    handlePickKey(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.selectCard(event.currentTarget.dataset.id);
        }
    }

    // A card pick routes by source: the "scratch" layouts go through the theme
    // step first (layout → theme → details); real templates carry their own
    // theme, so they jump straight to details.
    selectCard(id) {
        const tpl = this.templateByIdLocal(id);
        if (!tpl) return;
        this._initDetail(id, tpl);
        const scratch = tpl.source === 'layout';
        this.pickingTheme = scratch;
        this._pendingFocus = scratch ? 'theme' : 'detail';
        if (scratch) this._visibleKeys = [];
    }

    // --------------------------------------------------------- detail (Screen 2)
    // Seed all of Screen-2's state from the picked card (shared by both paths).
    _initDetail(id, tpl) {
        this.selectedId = id;
        this._lastOpenedId = id;
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
    get isThemeStep() {
        return !!this.selectedId && this.pickingTheme && !this.createdInfo;
    }
    get isDetailView() {
        return !!this.selectedId && !this.pickingTheme && !this.createdInfo;
    }
    get isDoneView() {
        return !!this.createdInfo;
    }

    // --------------------------------------------------- theme step (cards)
    get themeFilterPills() {
        const all = [{ value: '', label: 'All' }, ...THEME_FILTERS];
        return all.map((f) => ({
            ...f,
            cls: this.themeFilter === f.value ? 'thm-pill is-on' : 'thm-pill'
        }));
    }
    get themeStepTitle() {
        return 'Pick a theme';
    }
    // One c/formThemeCard per theme (filtered). The card renders its own themed
    // mock preview from the engine tokens — no live form engine per card.
    get themeCards() {
        const filter = this.themeFilter;
        return THEME_CATALOG.filter(
            (t) => !filter || (t.tags || []).includes(filter)
        ).map((t) => ({
            id: t.id,
            label: t.label,
            description: t.description || '',
            skinId: t.defaultSkin,
            selected: t.id === this.chosenThemeId
        }));
    }
    handleThemeFilter(e) {
        this.themeFilter = e.currentTarget.dataset.value || '';
    }
    handlePickTheme(e) {
        this._applyTheme(e.detail && e.detail.themeId);
    }
    _applyTheme(themeId) {
        if (!themeId) return;
        this.chosenThemeId = themeId;
        this.chosenSkinId = THEMES[themeId]?.defaultSkin || 'light';
        this.pickingTheme = false;
        this._pendingFocus = 'detail';
    }
    // Back from the theme step → the gallery.
    handleThemeBack() {
        this.selectedId = null;
        this.pickingTheme = false;
        this._visibleKeys = [];
        this._pendingFocus = 'gallery';
    }
    // From details, reopen the theme step to change the theme.
    handleChangeTheme() {
        this.pickingTheme = true;
        this._visibleKeys = [];
        this._pendingFocus = 'theme';
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
    get hasMultipleSkins() {
        return this.skinOptions.length > 1;
    }
    get chosenThemeLabel() {
        return THEMES[this.chosenThemeId]?.label || this.chosenThemeId;
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

    // Device preview — SAME pattern as the working FormDesigner preview: pin the
    // frame to a REAL device width and let the form reflow via its own container
    // queries. NO transform:scale (scale + width:calc(100%/scale) inflated the
    // width the @container rules measured, so they never hit the mobile bp).
    // Desktop renders at a true 1024px (the detail pane is only ~760px, below the
    // 768 structure bp, so it would self-collapse at 100%) and the stage scrolls.
    get stageStyle() {
        if (this.previewDevice === 'mobile') {
            return 'width:390px; max-width:100%; margin:0 auto;';
        }
        if (this.previewDevice === 'tablet') {
            return 'width:834px; max-width:100%; margin:0 auto;';
        }
        return 'width:1024px; margin:0 auto;'; // no max-width → .d-stage scrolls
    }
    get previewFrameClass() {
        return `pv-frame pv-frame_${this.previewDevice}`;
    }
    get desktopBtnClass() {
        return this.previewDevice === 'desktop' ? 'dev-btn is-on' : 'dev-btn';
    }
    get tabletBtnClass() {
        return this.previewDevice === 'tablet' ? 'dev-btn is-on' : 'dev-btn';
    }
    get mobileBtnClass() {
        return this.previewDevice === 'mobile' ? 'dev-btn is-on' : 'dev-btn';
    }
    handleDesktop() { this.previewDevice = 'desktop'; }
    handleTablet() { this.previewDevice = 'tablet'; }
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
        this.errorMessage = '';
        this._visibleKeys = [];
        // Scratch path went layout → theme → details, so Back returns to the
        // theme step; template path returns straight to the gallery.
        if (this.selectedTemplate && this.selectedTemplate.source === 'layout') {
            this.pickingTheme = true;
            this._pendingFocus = 'theme';
        } else {
            this.selectedId = null;
            this._pendingFocus = 'gallery';
        }
    }
    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    // ---- payload + create ----
    // Editor design-state block the builder (c/formStudio) reloads from on open.
    // MUST mirror formStudio.serializeForm()'s `studioMeta` shape — without it the
    // builder restores nothing and the chosen Layout/Theme/Skin/Accent are lost
    // (only the form name carries, via the Form record).
    studioMetaFor(header) {
        const h = header || {};
        return {
            layout: this.chosenLayout,
            themeId: this.chosenThemeId,
            skinId: this.chosenSkinId,
            accent: this.chosenAccent || '',
            spacing: 'comfortable',
            header: {
                arrangement: 'stacked',
                title: h.title || '',
                description: h.subtitle || h.description || '',
                logo: h.logo || '',
                highlight: ''
            },
            autofill: []
        };
    }

    buildPayload(tpl, object) {
        const skin = this.effectiveSkin;
        if (tpl.source === 'custom') {
            let bodyJson = tpl.bodyJson;
            try {
                const body = JSON.parse(tpl.bodyJson || '{}');
                body.formSettings = body.formSettings || {};
                body.formSettings.theme = { ...skin };
                body.studioMeta = this.studioMetaFor(body.header);
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
        body.studioMeta = this.studioMetaFor(body.header);
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
        // Type-agnostic picks (the "Start from scratch" layouts) follow the host
        // mode; real templates carry their own formType.
        const formType = tpl.source === 'layout'
            ? (this.isSurveyMode ? 'Survey' : 'Form')
            : tpl.formType;

        createFromTemplate({
            formName: this.formName.trim(),
            objectApiName: object || null,
            formType,
            layoutMode: tpl.layoutMode,
            allowedAdapters: (tpl.adapters || ['Internal_Record_Page']).join(';'),
            bodyJson: payload.bodyJson,
            layoutSpecJson: payload.specJson
        })
            .then((res) => {
                this.isCreating = false;
                this.createdInfo = res;
                this._pendingFocus = 'done';
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
        this._pendingFocus = 'gallery';
    }
}
