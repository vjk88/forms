import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import isGuest from '@salesforce/user/isGuest';
import { materialize } from 'c/layoutModel';
import { evalVisibility } from 'c/formVisibility';
import { getEmblemMarkUrl, getContrastRatio, getBackgroundHex } from 'c/brandEmblem';
import getViewerForm from '@salesforce/apex/FormViewerController.getViewerForm';
import getViewerFormByVersion from '@salesforce/apex/FormViewerController.getViewerFormByVersion';
import submitViewerForm from '@salesforce/apex/FormViewerController.submitViewerForm';
import getAutofillRecord from '@salesforce/apex/FormViewerController.getAutofillRecord';

/**
 * c/formViewer — the NEW respondent experience (PHASE2_WORKPLAN §2.3).
 * Loads the form definition, resolves the layout spec (stored Layout_Spec__c,
 * else the legacy-layout → archetype map), evaluates visibility rules, and
 * drives c/formLayoutEngine in live mode. Owns value/validity aggregation
 * (composed events up from c/formSectionRenderer), page-nav validation,
 * submission via FormViewerController.submitViewerForm, error routing, and
 * the thank-you / redirect ending.
 *
 * Deliberately does NOT import c/formThemes (owner decision 2026-06-12) —
 * the stored theme JSON passes through to the engine's `skin` api as opaque
 * data, and the legacy layout id is read straight off the theme config.
 *
 * Values survive page unmount (wizard shells mount one page at a time): every
 * 'sectionvalue' event is cached, and the cache is fed back through the
 * engine's prefillValues so a remounting section restores what was typed.
 */

// Legacy → Phase 1 archetype (materialized on the fly, never persisted).
// Two legacy axes resolve to one new-era archetype:
//   - layoutMode  = the NAV structure (single vs wizard vs side/top nav)
//   - theme.layout = the VISUAL template (classic/split/immersive/…)
// The nav axis wins when it implies multi-page navigation — otherwise a
// 9-page wizard would collapse into a single classic scroll (§2.3 froze the
// visual map; the nav map is the matching half, finalized under T2.4 QA).
const LEGACY_ARCHETYPE = {
    classic: 'classic',
    split: 'splitHero',
    immersive: 'immersiveGlass',
    stepped: 'wizardStepper',
    compact: 'document'
};
const LEGACY_NAV_ARCHETYPE = {
    Multi_Page_Wizard: 'wizardStepper',
    Vertical_Navigation: 'sideNav',
    Top_Navigation: 'tabbedCard'
};

const SETTINGS_DEFAULTS = {
    submitLabel: 'Submit Form',
    thankYouMessage: 'Thank you for your submission!',
    autoRedirect: false,
    redirectUrl: '',
    redirectDelay: 5,
    showReturnButton: false,
    returnButtonLabel: 'Fill Out Again'
};

export default class FormViewer extends NavigationMixin(LightningElement) {
    @api formId;
    @api versionId; // render a specific version (wizard preview / test)
    @api recordId; // edit-mode context (record pages, URL)
    @api mode = 'published'; // published | test | preview (test/preview = validate, no DML)
    @api previewWidth; // CSS width for the device toggle (passed to the engine)

    // In-memory definition injection (builder live preview): when set, render
    // THIS definition directly and skip the Apex load entirely. Shape mirrors
    // the FormViewerController payload: { formName, primaryObject, formType,
    // hasActiveVersion, bodyJson, layoutSpecJson }. Re-applies live on edits,
    // preserving the page you're on so typing doesn't bounce you to page 1.
    _previewDef;
    @api get previewDefinition() {
        return this._previewDef;
    }
    set previewDefinition(v) {
        this._previewDef = v;
        if (v && this._connected) this.applyDefinition(v, true);
    }
    _connected = false;

    @track isLoading = true;
    @track loadError = '';
    @track noActiveVersion = false;
    @track isSubmitted = false;
    @track submitErrors = [];
    @track liveValues = {};
    @track _captchaToken = '';
    @track _redirectCountdown = null;

    formName = '';
    primaryObject = '';
    formType = '';
    layoutMode = 'Single_Page';
    header = {};
    formSettings = { ...SETTINGS_DEFAULTS };
    spec;
    _pages = [];
    _sections = [];
    _elements = [];
    _urlPrefill = {};
    _autofillDone = {}; // autofill rule key → source recordId already applied (anti-loop)
    _sectionValues = {}; // sectionKey → last 'sectionvalue' payload
    _renderers = new Map(); // sectionKey → section-renderer host element
    _pendingFieldErrors = {}; // sectionKey → {fieldApi: msg} applied on register
    _blockRoutes = []; // submit child blocks → {sectionKey, repeaterId}
    _currentPageKey = null;
    _submitting = false;
    _honeypot = '';
    savedRecordId = null;
    _redirectInterval = null;
    _urlParams = null;
    // Stable function identity so the engine @api isn't re-set every render.
    _pageValidator = (pageKey) => this.runPageValidation(pageKey);

    // ------------------------------------------------------------------ load

    connectedCallback() {
        this._connected = true;
        if (this._previewDef) {
            this.applyDefinition(this._previewDef, true);
            return;
        }
        this.load();
    }

    disconnectedCallback() {
        this.clearRedirect();
    }

    get urlParams() {
        if (this._urlParams) return this._urlParams;
        const params = {};
        try {
            new URLSearchParams(window.location.search || '').forEach((v, k) => {
                params[k.toLowerCase()] = v;
            });
        } catch {
            /* no usable location — params stay empty */
        }
        this._urlParams = params;
        return params;
    }

    get effectiveFormId() {
        return this.urlParams.formid || this.formId;
    }
    get effectiveVersionId() {
        return this.urlParams.versionid || this.versionId;
    }
    get effectiveRecordId() {
        return this.urlParams.recordid || this.recordId;
    }

    load() {
        const vid = this.effectiveVersionId;
        const fid = this.effectiveFormId;
        if (!vid && !fid) {
            this.isLoading = false;
            this.loadError = 'No form selected.';
            return;
        }
        const call = vid
            ? getViewerFormByVersion({ versionId: vid })
            : getViewerForm({ formId: fid });
        call
            .then((vf) => this.applyDefinition(vf))
            .catch((e) => {
                this.isLoading = false;
                this.loadError =
                    (e && e.body && e.body.message) || 'Unable to load the form.';
            });
    }

    applyDefinition(vf, isLiveReapply) {
        this.isLoading = false;
        this.loadError = '';
        this.noActiveVersion = false;
        this.formName = vf.formName || '';
        this.primaryObject = vf.primaryObject || '';
        this.formType = vf.formType || '';
        if (!vf.hasActiveVersion || !vf.bodyJson) {
            this.noActiveVersion = true;
            return;
        }

        let body;
        try {
            body = JSON.parse(vf.bodyJson);
        } catch {
            this.loadError = 'The form layout could not be read.';
            return;
        }
        // A fresh definition starts clean; a live re-apply (builder preview) keeps
        // the header/settings defaults only as the floor.
        this.header = body.header || {};
        this.formSettings = { ...SETTINGS_DEFAULTS, ...(body.formSettings || {}) };
        this.layoutMode = body.layoutMode || 'Single_Page';

        const rawPages = Array.isArray(body.pages)
            ? body.pages
            : [{ id: 'p1', name: 'Page 1', sections: body.sections || [] }];

        const prevPage = this._currentPageKey;
        this.flattenBody(rawPages);
        this.applyUrlPrefills();
        // A fresh load re-runs autofill from scratch; a live re-apply (builder
        // preview) keeps what's already been fetched so edits don't re-fire it.
        if (!isLiveReapply) this._autofillDone = {};
        this.runAllAutofill();
        this.resolveSpec(vf.layoutSpecJson);
        // Preserve the page you're on across live edits; otherwise start at page 1.
        const keep =
            isLiveReapply &&
            prevPage &&
            this._pages.some((p) => p.key === prevPage);
        this._currentPageKey = keep
            ? prevPage
            : this._pages.length
            ? this._pages[0].key
            : null;
    }

    /**
     * Body JSON → the engine's flat pages/sections/elements arrays. Page-level
     * visibility is evaluated ONCE here (against URL prefill + form context):
     * the engine's nav state is built from the page set, so pages don't
     * appear/disappear mid-fill. Section/element visibility stays reactive.
     */
    flattenBody(rawPages) {
        const pages = [];
        const sections = [];
        const elements = [];
        const ctx = this.visibilityContext;
        let secOrder = 0;
        let elOrder = 0;
        rawPages.forEach((p, pi) => {
            if (!evalVisibility(p.visibilityExpression, ctx)) return;
            const pageKey = p.id || `p${pi + 1}`;
            pages.push({ key: pageKey, label: p.name, order: pi + 1 });
            (p.sections || []).forEach((s, si) => {
                const sectionKey = s.id || `${pageKey}_s${si + 1}`;
                secOrder += 1;
                sections.push({
                    ...s,
                    key: sectionKey,
                    pageKey,
                    title: s.name,
                    order: secOrder
                });
                (s.elements || []).forEach((el, ei) => {
                    elOrder += 1;
                    elements.push({
                        ...el,
                        key: el.id || `${sectionKey}_e${ei + 1}`,
                        sectionKey,
                        order: elOrder
                    });
                });
            });
        });
        this._pages = pages;
        this._sections = sections;
        this._elements = elements;
    }

    // Direct URL-parameter prefill (elements opt in via urlPrefillParam).
    applyUrlPrefills() {
        const params = this.urlParams;
        const pf = {};
        this._elements.forEach((el) => {
            if (!el.urlPrefillParam || !el.fieldApiName) return;
            const v = params[el.urlPrefillParam.toLowerCase()];
            if (v !== undefined && v !== '') pf[el.fieldApiName] = v;
        });
        this._urlPrefill = pf;
        if (Object.keys(pf).length) {
            this.liveValues = { ...this.liveValues, ...pf };
        }
    }

    resolveSpec(layoutSpecJson) {
        if (layoutSpecJson) {
            try {
                this.spec = JSON.parse(layoutSpecJson);
                return;
            } catch {
                /* fall through to the legacy map */
            }
        }
        const theme = (this.formSettings && this.formSettings.theme) || {};
        // Multi-page nav modes only matter when there's more than one page;
        // a single-page form always uses the visual-template map.
        const navArchetype =
            this._pages.length > 1 ? LEGACY_NAV_ARCHETYPE[this.layoutMode] : null;
        const archetype =
            navArchetype || LEGACY_ARCHETYPE[theme.layout || 'classic'] || 'classic';
        try {
            this.spec = materialize(archetype, this._pages, this._sections);
        } catch {
            try {
                this.spec = materialize('classic', this._pages, this._sections);
            } catch {
                this.loadError = 'The form layout could not be built.';
            }
        }
    }

    // ------------------------------------------------------------ visibility

    get visibilityContext() {
        return {
            ...this.liveValues,
            '$Form.layoutMode': this.layoutMode || '',
            '$Form.type': this.formType || '',
            '$User.Type': isGuest ? 'Guest' : 'Standard'
        };
    }

    get engineSections() {
        const ctx = this.visibilityContext;
        return this._sections.map((s) => ({
            ...s,
            visible: evalVisibility(s.visibilityExpression, ctx)
        }));
    }

    get engineElements() {
        const ctx = this.visibilityContext;
        const secVisible = new Map(
            this.engineSections.map((s) => [s.key, s.visible])
        );
        return this._elements.map((el) => ({
            ...el,
            visible:
                secVisible.get(el.sectionKey) !== false &&
                evalVisibility(el.visibilityExpression, ctx)
        }));
    }

    get enginePages() {
        return this._pages;
    }

    /** Theme passthrough — opaque data, no c/formThemes dependency here. */
    get skin() {
        return (this.formSettings && this.formSettings.theme) || {};
    }

    /**
     * Form-configurable shell copy → engine model.labels. The legacy
     * `submitLabel` maps onto `submit`; everything else rides a `labels`
     * object on formSettings. Undefined keys fall back to engine defaults.
     */
    get engineLabels() {
        const fs = this.formSettings || {};
        const out = { ...(fs.labels || {}) };
        if (fs.submitLabel) out.submit = fs.submitLabel;
        return out;
    }

    /**
     * URL prefill + everything typed so far. Feeding the live cache back as
     * prefill is what restores values when a wizard page remounts (renderers
     * skip user-edited fields, so this never fights active typing).
     */
    get enginePrefill() {
        return { ...this._urlPrefill, ...this.liveValues };
    }

    get headerTitle() {
        return (this.header && this.header.visible && this.header.title) || this.formName;
    }
    get headerDescription() {
        return (this.header && this.header.visible && this.header.subtitle) || '';
    }
    get headerLogo() {
        if (!(this.header && this.header.visible)) return '';
        // An uploaded logo always wins; otherwise fall back to a built-in emblem
        // mark — but only when the user explicitly picked one (no retroactive change).
        return this.header.logo || this.emblemUrl;
    }
    // Built-in logo emblem (c/brandEmblem) rendered as a contrast-aware SVG mark.
    // Same engine the theme-picker card uses, so the live header matches the themes.
    get emblemUrl() {
        const h = this.header || {};
        const emblem = h.emblem;
        if (!emblem || emblem === 'none') return '';
        if ((h.arrangement || 'stacked') === 'textOnly') return '';
        const skin = this.skin || {};
        const onBanner =
            ((this.spec && this.spec.shell && this.spec.shell.header) || 'standard') === 'hero';
        const bg = onBanner ? skin.headerBg || skin.surface : skin.surface || skin.pageBg;
        const text = onBanner ? skin.headerText || '#ffffff' : skin.text || '#16325c';
        const accent = skin.accent || '#6366f1';
        const complexBg = bg && (String(bg).includes('url(') || String(bg).includes('gradient'));
        let color = accent;
        if (complexBg) {
            color = text;
        } else if (getContrastRatio(accent, getBackgroundHex(bg, text)) < 3.5) {
            color = text;
        }
        return getEmblemMarkUrl(emblem, color);
    }
    get headerArrangement() {
        return (this.header && this.header.arrangement) || 'stacked';
    }
    get headerHighlight() {
        return (this.header && this.header.visible && this.header.highlight) || '';
    }

    get pageValidator() {
        return this._pageValidator;
    }

    get isPreview() {
        return this.mode === 'preview';
    }
    // Builder preview: the host pane is taller than the form, so tell the shells
    // to size to content (else flex-pinned action buttons drift to the bottom).
    get viewerStyle() {
        return this.isPreview ? '--c-shell-min-h: auto; --c-shell-rail-h: auto;' : '';
    }
    get showEngine() {
        return (
            !this.isLoading &&
            !this.loadError &&
            !this.noActiveVersion &&
            !this.isSubmitted
        );
    }
    get hasSubmitErrors() {
        return this.submitErrors.length > 0;
    }
    get needsCaptcha() {
        return !!(this.formSettings && this.formSettings.captchaRequired) && isGuest;
    }

    // ----------------------------------------------------- events from below

    handleSectionRegister(event) {
        const { sectionKey, host } = event.detail || {};
        if (!sectionKey || !host) return;
        this._renderers.set(sectionKey, host);
        // A page remount is the moment to paint errors parked for it.
        const pending = this._pendingFieldErrors[sectionKey];
        if (pending && host.applyFieldErrors) {
            delete this._pendingFieldErrors[sectionKey];
            // Wait one tick so the section's fields are rendered.
            Promise.resolve().then(() => {
                if (host.isConnected) host.applyFieldErrors(pending);
            });
        }
    }

    handleSectionValue(event) {
        const { sectionKey, values } = event.detail || {};
        if (!sectionKey) return;
        this._sectionValues[sectionKey] = values || {};
        this.liveValues = { ...this.liveValues, ...values };
        // A lookup may have just been filled — run any autofill rule keyed off it.
        this.runAutofillFor(values || {});
    }

    // ------------------------------------------------------------ autofill
    // Copy mapped fields from a source record into form fields. Source is either a
    // lookup the respondent filled in, or a record Id passed via a URL parameter.
    get autofillRules() {
        return (this.formSettings && this.formSettings.autofillRules) || [];
    }

    // Run every rule whose source record is already known (URL param, or a lookup
    // that's been prefilled/seeded). Called once on load.
    runAllAutofill() {
        this.autofillRules.forEach((rule) => {
            let recId;
            if (rule.sourceType === 'url') {
                recId = this.urlParams[(rule.urlParam || '').toLowerCase()];
            } else if (rule.sourceType === 'lookup') {
                recId = this.liveValues[rule.lookupField];
            }
            if (recId) this.applyAutofill(rule, recId);
        });
    }

    // Run lookup-driven rules whose lookup field is in this batch of changed values.
    runAutofillFor(values) {
        this.autofillRules.forEach((rule) => {
            if (rule.sourceType !== 'lookup') return;
            if (!Object.prototype.hasOwnProperty.call(values, rule.lookupField)) return;
            const recId = values[rule.lookupField];
            if (recId) this.applyAutofill(rule, recId);
        });
    }

    applyAutofill(rule, recId) {
        const mappings = (rule.mappings || []).filter((m) => m.from && m.to);
        if (!mappings.length || !rule.sourceObject) return;
        // Guard against re-fetch loops: applying values re-renders sections, which
        // re-emits sectionvalue. Skip if we've already pulled this record for this rule.
        const ruleKey = rule.sourceType === 'url' ? `url:${rule.urlParam}` : `lkp:${rule.lookupField}`;
        if (this._autofillDone[ruleKey] === recId) return;
        this._autofillDone = { ...this._autofillDone, [ruleKey]: recId };
        getAutofillRecord({
            formId: this.effectiveFormId,
            objectApiName: rule.sourceObject,
            recordId: recId,
            fieldApiNames: mappings.map((m) => m.from)
        })
            .then((res) => {
                if (!res) return;
                const lv = { ...this.liveValues };
                const pf = { ...this._urlPrefill };
                mappings.forEach((m) => {
                    if (res[m.from] !== undefined && res[m.from] !== null) {
                        lv[m.to] = res[m.from];
                        pf[m.to] = res[m.from];
                    }
                });
                this.liveValues = lv;
                this._urlPrefill = pf;
            })
            .catch(() => {
                /* a failed source read just leaves fields blank */
            });
    }

    handlePageChange(event) {
        const v = event.detail || {};
        if (v.currentPageKey) this._currentPageKey = v.currentPageKey;
    }

    // ------------------------------------------------------------ validation

    sectionHost(sectionKey) {
        const host = this._renderers.get(sectionKey);
        if (host && host.isConnected) return host;
        if (host) this._renderers.delete(sectionKey);
        return null;
    }

    runPageValidation(pageKey) {
        let valid = true;
        this._sections
            .filter((s) => s.pageKey === pageKey)
            .forEach((s) => {
                const host = this.sectionHost(s.key);
                if (host && host.reportValidity && !host.reportValidity()) {
                    valid = false;
                }
            });
        this.submitErrors = valid
            ? []
            : [{ key: 'err-page', text: 'Please fix the highlighted fields before continuing.' }];
        return valid;
    }

    /**
     * Whole-form check at submit. Mounted sections validate natively; for
     * sections on unmounted pages (wizard already gated them on Next, but
     * free-nav shells don't), authored-Required elements are checked against
     * the cached values. Schema-level rules are the server's call either way.
     */
    validateAll() {
        const secVisible = new Map(
            this.engineSections.map((s) => [s.key, s.visible])
        );
        const elVisible = new Map(
            this.engineElements.map((el) => [el.key, el.visible])
        );
        let firstBadPage = null;
        let valid = true;
        this._sections.forEach((s) => {
            if (secVisible.get(s.key) === false) return;
            const host = this.sectionHost(s.key);
            if (host && host.reportValidity) {
                if (!host.reportValidity()) {
                    valid = false;
                    if (!firstBadPage) firstBadPage = s.pageKey;
                }
                return;
            }
            const missing = this._elements.some(
                (el) =>
                    el.sectionKey === s.key &&
                    el.uiBehavior === 'Required' &&
                    el.fieldApiName &&
                    elVisible.get(el.key) !== false &&
                    this.isEmptyValue(this.liveValues[el.fieldApiName])
            );
            if (missing) {
                valid = false;
                if (!firstBadPage) firstBadPage = s.pageKey;
            }
        });
        return { valid, firstBadPage };
    }

    isEmptyValue(v) {
        if (v === undefined || v === null) return true;
        if (Array.isArray(v)) return v.length === 0;
        return String(v).trim() === '';
    }

    // ---------------------------------------------------------------- submit

    handleSubmitRequest() {
        if (this._submitting) return;
        this.submitErrors = [];

        // Honeypot: a hidden field humans never see — if a bot filled it,
        // drop the submission silently (same behavior as the legacy player).
        if (this._honeypot) return;

        const errors = [];
        if (this.needsCaptcha && !this._captchaToken) {
            errors.push("Please verify that you're not a robot.");
        }
        const { valid, firstBadPage } = this.validateAll();
        if (!valid) errors.push('Please complete the required fields.');
        if (errors.length) {
            this.setBanner(errors);
            if (firstBadPage) this.jumpToPage(firstBadPage);
            return;
        }

        // Test / builder-preview: full validation, no DML — just show the ending.
        if (this.mode === 'test' || this.mode === 'preview') {
            this.isSubmitted = true;
            return;
        }

        this._submitting = true;
        this._sections.forEach((s) => {
            const host = this.sectionHost(s.key);
            if (host && host.clearServerErrors) host.clearServerErrors();
        });

        const parentValues = this.collectParentValues();
        const children = [];
        this._blockRoutes = [];
        this._sections.forEach((s) => {
            const host = this.sectionHost(s.key);
            if (!host || !host.collectRepeaterBlocks) return;
            (host.collectRepeaterBlocks() || []).forEach((block) => {
                if (!block || !block.rows || !block.rows.length) return;
                children.push({
                    childObjectApiName: block.childObjectApiName,
                    linkingField: block.linkingField,
                    rows: block.rows
                });
                this._blockRoutes.push({
                    sectionKey: s.key,
                    repeaterId: block.repeaterId
                });
            });
        });

        submitViewerForm({
            formId: this.effectiveFormId,
            parentValues,
            existingRecordId: this.effectiveRecordId || null,
            children,
            files: this.collectFiles()
        })
            .then((res) => this.handleSubmitResult(res))
            .catch((e) => {
                this._submitting = false;
                this.setBanner([
                    (e && e.body && e.body.message) ||
                        'There was a problem saving the form.'
                ]);
            });
    }

    /** Respondent file uploads across all sections → [{fileName, base64, contentType}]. */
    collectFiles() {
        const files = [];
        this._sections.forEach((s) => {
            const host = this.sectionHost(s.key);
            if (!host || !host.collectFiles) return;
            (host.collectFiles() || []).forEach((f) => files.push(f));
        });
        return files;
    }

    /** Cached values (covers unmounted pages) overlaid with live ones. */
    collectParentValues() {
        const values = {};
        this._sections.forEach((s) => {
            Object.assign(values, this._sectionValues[s.key] || {});
        });
        this._sections.forEach((s) => {
            const host = this.sectionHost(s.key);
            if (host && host.getValues) Object.assign(values, host.getValues());
        });
        return values;
    }

    handleSubmitResult(res) {
        this._submitting = false;
        if (res && res.success) {
            this.savedRecordId = res.recordId;
            this.afterSuccess();
            return;
        }
        this.applySubmitErrors((res && res.errors) || []);
    }

    /**
     * SubmitResult.errors → the exact field/row. Parent field errors go to
     * the section that owns the field (parked if that page isn't mounted);
     * child errors go back to the repeater that produced the block.
     */
    applySubmitErrors(errors) {
        const summary = [];
        const bySection = {}; // sectionKey → {fieldApi: msg}
        const byBlock = {}; // blockIndex → [RowError]
        const sectionOfField = new Map();
        this._elements.forEach((el) => {
            if (el.fieldApiName && !sectionOfField.has(el.fieldApiName)) {
                sectionOfField.set(el.fieldApiName, el.sectionKey);
            }
        });

        errors.forEach((e) => {
            if (e.message) summary.push(e.message);
            if (e.scope === 'child') {
                (byBlock[e.blockIndex] = byBlock[e.blockIndex] || []).push(e);
            } else {
                (e.fields || []).forEach((fieldApi) => {
                    const secKey = sectionOfField.get(fieldApi);
                    if (!secKey) return;
                    (bySection[secKey] = bySection[secKey] || {})[fieldApi] =
                        e.message;
                });
            }
        });

        let firstBadPage = null;
        Object.keys(bySection).forEach((secKey) => {
            const sec = this._sections.find((s) => s.key === secKey);
            if (sec && !firstBadPage) firstBadPage = sec.pageKey;
            const host = this.sectionHost(secKey);
            if (host && host.applyFieldErrors) {
                host.applyFieldErrors(bySection[secKey]);
            } else {
                this._pendingFieldErrors[secKey] = bySection[secKey];
            }
        });

        Object.keys(byBlock).forEach((bi) => {
            const route = this._blockRoutes[Number(bi)];
            if (!route) return;
            const sec = this._sections.find((s) => s.key === route.sectionKey);
            if (sec && !firstBadPage) firstBadPage = sec.pageKey;
            const host = this.sectionHost(route.sectionKey);
            if (host && host.applyRepeaterRowErrors) {
                host.applyRepeaterRowErrors(route.repeaterId, byBlock[bi]);
            }
        });

        this.setBanner(
            summary.length ? summary : ['There was a problem saving the form.']
        );
        if (firstBadPage) this.jumpToPage(firstBadPage);
    }

    setBanner(list) {
        this.submitErrors = (list || [])
            .filter(Boolean)
            .map((t, i) => ({ key: `err-${i}`, text: t }));
        if (this.submitErrors.length) {
            Promise.resolve().then(() => {
                const box = this.template.querySelector('.viewer-errors');
                if (box && box.scrollIntoView) {
                    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }

    jumpToPage(pageKey) {
        if (!pageKey || pageKey === this._currentPageKey) return;
        const engine = this.template.querySelector('c-form-layout-engine');
        if (engine && engine.goToPage) engine.goToPage(pageKey);
    }

    // ------------------------------------------------------------- spam guard

    handleHoneypotChange(event) {
        this._honeypot = event.target.value;
    }
    // Provider hook: a real reCAPTCHA/hCaptcha callback would set this token.
    handleCaptchaChange(event) {
        this._captchaToken = event.target.checked ? 'verified' : '';
    }

    // ---------------------------------------------------------- after submit

    afterSuccess() {
        const s = this.formSettings;
        if (s.afterSubmitMode === 'ToastAndGo') {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: this.effectiveRecordId ? 'Record updated' : 'Record created',
                    variant: 'success'
                })
            );
            this.navigateTo(s.toastAndGoTarget, s.toastAndGoUrl);
            return;
        }
        this.isSubmitted = true;
        if (s.autoRedirect) {
            this.startRedirectCountdown(
                Number(s.redirectDelay || 0),
                s.redirectTarget,
                s.redirectUrl
            );
        }
    }

    get thankYouMessage() {
        return this.formSettings.thankYouMessage;
    }
    get isRedirecting() {
        return this._redirectCountdown !== null && this._redirectCountdown > 0;
    }
    get redirectCountdownText() {
        const n = this._redirectCountdown;
        return `Redirecting in ${n} second${n === 1 ? '' : 's'}…`;
    }
    get showReturnButton() {
        return !!this.formSettings.showReturnButton;
    }
    get returnButtonLabel() {
        return this.formSettings.returnButtonLabel || 'Fill Out Again';
    }

    startRedirectCountdown(seconds, target, url) {
        if (!seconds || seconds <= 0) {
            this.navigateTo(target, url);
            return;
        }
        this._redirectCountdown = seconds;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._redirectInterval = window.setInterval(() => {
            this._redirectCountdown -= 1;
            if (this._redirectCountdown <= 0) {
                this.clearRedirect();
                this.navigateTo(target, url);
            }
        }, 1000);
    }

    clearRedirect() {
        if (this._redirectInterval) {
            window.clearInterval(this._redirectInterval);
            this._redirectInterval = null;
        }
    }

    handleCancelRedirect() {
        this.clearRedirect();
        this._redirectCountdown = null;
    }

    handleReturnClick() {
        // Fresh fill: the engine subtree below remounts clean, the value
        // caches reset, and prefill re-applies from the URL params.
        this.clearRedirect();
        this._redirectCountdown = null;
        this.isSubmitted = false;
        this.submitErrors = [];
        this.liveValues = { ...this._urlPrefill };
        this._sectionValues = {};
        this._pendingFieldErrors = {};
        this._renderers = new Map();
        this.savedRecordId = null;
        this._captchaToken = '';
        this._currentPageKey = this._pages.length ? this._pages[0].key : null;
    }

    /** 'Record' → saved record; 'Custom' → URL with {recordId} tokens. */
    navigateTo(target, url) {
        if (this.mode === 'test' || this.mode === 'preview') return;
        if (target === 'Custom') {
            const resolved = (url || '')
                .replace(/{recordId}/g, this.savedRecordId || '')
                .replace(/{objectApiName}/g, this.primaryObject || '');
            if (!resolved) return;
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: { url: this.normalizeUrl(resolved) }
            });
        } else if (this.savedRecordId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.savedRecordId,
                    objectApiName: this.primaryObject,
                    actionName: 'view'
                }
            });
        }
    }

    normalizeUrl(url) {
        if (/^https?:\/\//i.test(url) || url.charAt(0) === '/') return url;
        return 'https://' + url;
    }
}
