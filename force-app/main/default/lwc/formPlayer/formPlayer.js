import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getActiveForm from '@salesforce/apex/FormPlayerController.getActiveForm';
import getFormByVersion from '@salesforce/apex/FormPlayerController.getFormByVersion';
import getUserContext from '@salesforce/apex/FormPlayerController.getUserContext';
import getCurrentUserFields from '@salesforce/apex/FormPlayerController.getCurrentUserFields';
import getPicklistOptions from '@salesforce/apex/FormPlayerController.getPicklistOptions';
import getRecordFields from '@salesforce/apex/FormPlayerController.getRecordFields';

export default class FormPlayer extends NavigationMixin(LightningElement) {
    // Record-page / app-page context
    @api recordId;

    // Which form to render (one of these)
    @api formId;          // loads the active published version
    @api versionId;       // loads a specific version (builder preview)

    // Direct injection (builder preview without saving)
    @api previewMode = false;
    _injectedLayout;
    _injectedObject;

    @api
    get layoutJson() {
        return this._injectedLayout;
    }
    set layoutJson(value) {
        this._injectedLayout = value;
        if (value) this.applyLayout(value);
    }

    @api
    get objectApiName() {
        return this._injectedObject;
    }
    set objectApiName(value) {
        this._injectedObject = value;
        if (value) {
            this.primaryObject = value;
            this.loadPicklistMap();
        }
    }

    @track primaryObject;
    @track formName = '';
    @track header = { visible: false };
    @track formSettings = {
        submitLabel: 'Submit Form',
        thankYouMessage: 'Thank you for your submission!',
        autoRedirect: false,
        redirectUrl: '',
        redirectDelay: 5,
        showReturnButton: false,
        returnButtonLabel: 'Fill Out Again'
    };
    @track pages = [];
    @track layoutMode = 'Single_Page';
    formType = '';
    allowedAdapters = '';

    @track currentPageIndex = 0;
    @track isLoading = true;
    @track loadError = '';
    @track isSubmitted = false;
    // True from the moment a valid submit is fired until success/error returns.
    // Guards against double-submit creating duplicate records.
    @track _submitting = false;
    // Active auto-redirect countdown (seconds remaining); null when not counting.
    @track _redirectCountdown = null;
    _redirectInterval = null;
    _redirectTarget = null;
    _redirectUrl = null;
    // Live field values, used to evaluate conditional visibility reactively
    // and to hold the values of "Render As" custom controls.
    @track liveValues = {};
    // Values pushed into native fields by autofill (separate from liveValues so
    // user typing isn't overwritten on re-render).
    @track prefillValues = {};
    @track picklistMap = {};
    _picklistObj = null;
    // Aggregated submit/validation errors shown near the submit button.
    @track submitErrors = [];
    // Per-field inline messages for custom controls (keyed by field API name).
    @track fieldErrors = {};
    // Native fields the user has manually edited — never overwrite them with
    // a prefill/autofill value on a later re-render.
    _userEditedFields = new Set();

    get hasSubmitErrors() {
        return this.submitErrors.length > 0;
    }

    get isSubmitting() {
        return this._submitting;
    }

    get isRedirecting() {
        return this._redirectCountdown !== null && this._redirectCountdown > 0;
    }

    get redirectCountdownText() {
        const n = this._redirectCountdown;
        return `Redirecting in ${n} second${n === 1 ? '' : 's'}…`;
    }

    setSubmitErrors(list) {
        const items = (list || []).filter((t) => t);
        this.submitErrors = items.map((t, i) => ({ key: `err-${i}`, text: t }));
        if (items.length) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            Promise.resolve().then(() => {
                const box = this.template.querySelector('.player-errors');
                if (box && box.scrollIntoView) {
                    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }

    // Turn a record-edit-form onerror detail into readable messages.
    buildServerErrors(detail) {
        const out = [];
        const output = detail && detail.output;
        if (output) {
            (output.errors || []).forEach((e) => {
                if (e && e.message) out.push(e.message);
            });
            const fe = output.fieldErrors || {};
            Object.keys(fe).forEach((api) => {
                (fe[api] || []).forEach((e) => {
                    if (e && e.message) {
                        out.push((e.fieldLabel ? e.fieldLabel + ': ' : '') + e.message);
                    }
                });
            });
        }
        if (!out.length && detail && detail.message) out.push(detail.message);
        if (!out.length) out.push('There was a problem saving the form.');
        return out;
    }

    // Spam protection
    _honeypot = '';
    @track _captchaToken = '';

    get isGuestSession() {
        return this.liveValues['$User.Type'] === 'Guest';
    }
    // CAPTCHA is opt-in per form and only shown to guests.
    get needsCaptcha() {
        return (
            !!(this.formSettings && this.formSettings.captchaRequired) &&
            this.isGuestSession
        );
    }
    handleHoneypotChange(event) {
        this._honeypot = event.target.value;
    }
    // Provider hook: a real reCAPTCHA/hCaptcha callback would set this token.
    // For now a lightweight "I'm not a robot" checkbox satisfies the gate.
    handleCaptchaChange(event) {
        this._captchaToken = event.target.checked ? 'verified' : '';
    }

    _pageRef;
    _loadStarted = false;

    connectedCallback() {
        this.loadUserContext();
        // Builder preview injects the layout directly — load it now.
        if (this._injectedLayout) {
            this.applyLayout(this._injectedLayout);
            this.isLoading = false;
        }
        // Otherwise we wait for CurrentPageReference so URL params can win.
    }

    // Native fields are uncontrolled (no reactive `value` binding) so user
    // input is never wiped on a re-render. Prefill/autofill values are pushed
    // in imperatively here, and only onto fields the user hasn't edited.
    renderedCallback() {
        this.reconcilePrefill();
    }

    reconcilePrefill() {
        const pf = this.prefillValues || {};
        const keys = Object.keys(pf);
        for (let i = 0; i < keys.length; i++) {
            const api = keys[i];
            if (this._userEditedFields.has(api)) continue;
            const v = pf[api];
            if (v === undefined || v === null) continue;
            const field = this.template.querySelector(
                `lightning-input-field[data-prefill="true"][data-field="${api}"]`
            );
            if (field && field.value !== v) field.value = v;
        }
    }

    // URL params take precedence over design/property values, for both formId
    // and recordId. Supports community ?c__ prefixed params too.
    @wire(CurrentPageReference)
    handlePageRef(ref) {
        this._pageRef = ref;
        this.resolveAndLoad();
    }

    get pageState() {
        return (this._pageRef && this._pageRef.state) || {};
    }
    get effectiveFormId() {
        const s = this.pageState;
        return s.formId || s.c__formId || this.formId;
    }
    get effectiveVersionId() {
        const s = this.pageState;
        return s.versionId || s.c__versionId || this.versionId;
    }
    get effectiveRecordId() {
        const s = this.pageState;
        return s.recordId || s.id || s.c__recordId || this.recordId;
    }

    resolveAndLoad() {
        if (this._injectedLayout || this._loadStarted) return;
        this._loadStarted = true;
        if (this.effectiveVersionId) {
            this.loadByVersion();
        } else if (this.effectiveFormId) {
            this.loadActive();
        } else {
            this.isLoading = false;
            this.loadError = 'No form configured.';
        }
    }

    loadActive() {
        getActiveForm({ formId: this.effectiveFormId })
            .then((def) => this.applyDef(def))
            .catch((e) => this.handleLoadError(e));
    }

    loadByVersion() {
        getFormByVersion({ versionId: this.effectiveVersionId })
            .then((def) => this.applyDef(def))
            .catch((e) => this.handleLoadError(e));
    }

    applyDef(def) {
        this.isLoading = false;
        if (!def || !def.hasActiveVersion || !def.layoutJson) {
            this.loadError = 'This form has no published version yet.';
            return;
        }
        this.formName = def.formName;
        this.primaryObject = def.primaryObject;
        this.formType = def.formType || '';
        this.allowedAdapters = def.allowedAdapters || '';
        this.applyLayout(def.layoutJson);
    }

    // Advanced visibility context: $User.* / $Profile.Name (static for session).
    loadUserContext() {
        getUserContext()
            .then((ctx) => {
                if (ctx) this.liveValues = { ...this.liveValues, ...ctx };
            })
            .catch(() => {});
    }

    // Advanced visibility context: $Form.* metadata.
    seedFormContext() {
        this.liveValues = {
            ...this.liveValues,
            '$Form.layoutMode': this.layoutMode || '',
            '$Form.type': this.formType || '',
            '$Form.allowedAdapters': this.allowedAdapters || ''
        };
    }

    // Fetch the User-record values referenced by "Current User" visibility rules.
    loadReferencedUserFields() {
        const fields = this.collectReferencedFields('$User.');
        if (!fields.length) return;
        getCurrentUserFields({ fieldApiNames: fields })
            .then((map) => {
                if (!map) return;
                const merged = { ...this.liveValues };
                Object.keys(map).forEach((k) => {
                    merged[`$User.${k}`] = map[k];
                });
                this.liveValues = merged;
            })
            .catch(() => {});
    }

    // Collect the field names referenced by visibility rules with a given prefix.
    collectReferencedFields(prefix) {
        const out = new Set();
        const scan = (expr) => {
            if (!expr) return;
            try {
                const cfg = JSON.parse(expr);
                (cfg.rules || []).forEach((r) => {
                    if (r.field && r.field.indexOf(prefix) === 0) {
                        out.add(r.field.substring(prefix.length));
                    }
                });
            } catch (e) {
                /* ignore */
            }
        };
        (this.pages || []).forEach((p) => {
            scan(p.visibilityExpression);
            (p.sections || []).forEach((s) => {
                scan(s.visibilityExpression);
                (s.elements || []).forEach((el) => scan(el.visibilityExpression));
            });
        });
        return [...out];
    }

    handleLoadError(e) {
        this.isLoading = false;
        this.loadError =
            (e && e.body && e.body.message) || 'Unable to load the form.';
    }

    applyLayout(json) {
        let parsed;
        try {
            parsed = typeof json === 'string' ? JSON.parse(json) : json;
        } catch (err) {
            this.loadError = 'The form layout could not be read.';
            return;
        }

        this.layoutMode = parsed.layoutMode || 'Single_Page';
        if (parsed.header) this.header = parsed.header;
        if (parsed.formSettings) {
            this.formSettings = { ...this.formSettings, ...parsed.formSettings };
        }

        const rawPages = Array.isArray(parsed.pages)
            ? parsed.pages
            : [{ id: 'p1', name: 'Page 1', sections: parsed.sections || [] }];

        this.pages = rawPages.map((p, i) => this.enrichPage(p, i));
        this.currentPageIndex = 0;
        this.seedFormContext();
        this.loadReferencedUserFields();
        this.loadPicklistMap();
        this.applyUrlPrefills();
        this.runAllAutofill();
        this.seedFromRecord();
    }

    // Direct URL-parameter prefill (e.g. a hidden field carrying ?contactId=…).
    applyUrlPrefills() {
        const params = this.urlParams;
        const pf = { ...this.prefillValues };
        const lv = { ...this.liveValues };
        let changed = false;
        (this.pages || []).forEach((p) =>
            (p.sections || []).forEach((s) =>
                (s.elements || []).forEach((el) => {
                    if (!el.urlPrefillParam || !el.fieldApiName) return;
                    const v = params[el.urlPrefillParam.toLowerCase()];
                    if (v !== undefined && v !== '') {
                        pf[el.fieldApiName] = v;
                        lv[el.fieldApiName] = v;
                        changed = true;
                    }
                })
            )
        );
        if (changed) {
            this.prefillValues = pf;
            this.liveValues = lv;
        }
    }

    get urlParams() {
        if (this._urlParams) return this._urlParams;
        const params = {};
        try {
            new URLSearchParams(window.location.search || '').forEach((v, k) => {
                params[k.toLowerCase()] = v;
            });
        } catch (e) {
            /* ignore */
        }
        this._urlParams = params;
        return params;
    }

    // --- Layout helpers ---

    get isWizard() {
        return this.layoutMode === 'Multi_Page_Wizard' && this.pages.length > 1;
    }

    get isVerticalNav() {
        return this.layoutMode === 'Vertical_Navigation' && this.pages.length > 1;
    }

    get isSinglePage() {
        return !this.isWizard && !this.isVerticalNav;
    }

    enrichPage(page, index) {
        const sections = (page.sections || []).map((s) => this.enrichSection(s));
        return {
            id: page.id || `page-${index}`,
            name: page.name || `Page ${index + 1}`,
            index,
            showInProgress: page.showInProgress !== false,
            nextLabel: page.nextLabel || 'Next',
            submitLabel: page.submitLabel || '',
            visibilityExpression: page.visibilityExpression,
            sections
        };
    }

    enrichSection(section) {
        const cols = section.gridColumns || 1;
        const elements = (section.elements || []).map((e) => this.enrichElement(e));
        return {
            id: section.id,
            name: section.name,
            icon: section.icon,
            showHeader: section.showHeader !== false,
            headerStyle:
                section.showHeader !== false && section.headerBackgroundColor
                    ? `background-color: ${section.headerBackgroundColor}`
                    : '',
            gridClass: `player-grid cols-${cols}`,
            hasElements: elements.length > 0,
            elements,
            isRepeatable: section.contextType === 'Related_Child',
            visibilityExpression: section.visibilityExpression
        };
    }

    enrichElement(el) {
        const type = el.type || 'Field';
        const uiBehavior = el.uiBehavior || 'None';
        const isFullWidth = [
            'Rich_Text',
            'Static_Text',
            'Divider',
            'Image',
            'Callout',
            'Spacer',
            'Consent'
        ].includes(type);
        const CALLOUT_ICONS = {
            success: 'utility:success',
            warning: 'utility:warning',
            error: 'utility:error',
            info: 'utility:info'
        };

        // Resolve the "Render As" override into a concrete control kind.
        let renderKind = 'default';
        if (type === 'Field') {
            switch (el.renderAs) {
                case 'Toggle':
                    renderKind = 'toggle';
                    break;
                case 'Slider':
                    renderKind = 'slider';
                    break;
                case 'Radio_Buttons':
                    renderKind = 'radio';
                    break;
                case 'Dropdown':
                    renderKind = 'dropdown';
                    break;
                case 'Checkbox_Group':
                case 'Custom_MultiSelect':
                    renderKind = 'checkboxgroup';
                    break;
                default:
                    renderKind = 'default';
            }
        }
        const isCustomField = type === 'Field' && renderKind !== 'default';
        const isHidden = uiBehavior === 'Hidden';

        let customOptions = [];
        try {
            if (el.customOptionsJson) {
                const parsed = JSON.parse(el.customOptionsJson);
                if (Array.isArray(parsed)) customOptions = parsed;
            }
        } catch (e) {
            /* ignore malformed option JSON */
        }

        return {
            id: el.id,
            type,
            isField: type === 'Field',
            isFieldDefault: type === 'Field' && !isCustomField,
            isCustomField,
            renderKind,
            isToggle: renderKind === 'toggle',
            isSlider: renderKind === 'slider',
            isRadio: renderKind === 'radio',
            isDropdown: renderKind === 'dropdown',
            isCheckboxGroup: renderKind === 'checkboxgroup',
            isMulti: renderKind === 'checkboxgroup',
            customOptions,
            sliderMin: el.sliderMin != null ? el.sliderMin : 0,
            sliderMax: el.sliderMax != null ? el.sliderMax : 100,
            sliderStep: el.sliderStep != null ? el.sliderStep : 1,
            isDisplayText: type === 'Rich_Text' || type === 'Static_Text',
            isDivider: type === 'Divider',
            isFileUpload: type === 'File_Upload',
            isImage: type === 'Image',
            isCallout: type === 'Callout',
            isSpacer: type === 'Spacer',
            isConsent: type === 'Consent',
            consentContent: el.content || 'I agree to the terms and conditions.',
            consentRequired: el.consentRequired !== false,
            hasImage: !!el.imageUrl,
            imageUrl: el.imageUrl,
            imageAlt: el.imageAlt || el.name || 'Image',
            imageClass: `player-image img-${el.imageSize || 'medium'}`,
            calloutClass: `player-callout callout-${el.calloutVariant || 'info'}`,
            calloutIcon: CALLOUT_ICONS[el.calloutVariant] || CALLOUT_ICONS.info,
            calloutContent: el.content || '',
            spacerClass: `player-spacer spacer-${el.spacerSize || 'medium'}`,
            fieldApiName: el.fieldApiName,
            label: el.name,
            content: el.content,
            required: uiBehavior === 'Required',
            readOnly: uiBehavior === 'Read_Only',
            isHidden,
            urlPrefillParam: el.urlPrefillParam,
            helpText: el.helpText,
            wrapperClass:
                (isFullWidth ? 'player-el full-width' : 'player-el') +
                (isHidden ? ' is-hidden' : ''),
            visibilityExpression: el.visibilityExpression
        };
    }

    // Page wrappers — keep all pages mounted (for single record-edit-form),
    // hide non-current pages in wizard/vnav mode. Also applies conditional
    // visibility rules reactively against the live field values.
    get renderedPages() {
        const vals = this.liveValues;
        return this.pages.map((p) => {
            const onPage = this.isSinglePage || p.index === this.currentPageIndex;
            const pageVisible = this.evalVisibility(p.visibilityExpression, vals);
            return {
                ...p,
                wrapperClass:
                    onPage && pageVisible ? 'player-page' : 'player-page is-hidden',
                sections: (p.sections || []).map((s) => {
                    const sVisible = this.evalVisibility(s.visibilityExpression, vals);
                    return {
                        ...s,
                        sectionClass: sVisible
                            ? 'player-section'
                            : 'player-section is-hidden',
                        elements: (s.elements || []).map((el) => {
                            const elVisible = this.evalVisibility(
                                el.visibilityExpression,
                                vals
                            );
                            const out = {
                                ...el,
                                elWrapperClass: elVisible
                                    ? el.wrapperClass
                                    : `${el.wrapperClass} is-hidden`,
                                // A hidden field must not block submit by being required.
                                effectiveRequired:
                                    el.required && elVisible && !el.isHidden
                            };
                            if (el.isCustomField) {
                                const raw = vals[el.fieldApiName];
                                out.value = el.isMulti
                                    ? Array.isArray(raw)
                                        ? raw
                                        : []
                                    : raw === undefined
                                    ? el.isToggle
                                        ? false
                                        : ''
                                    : raw;
                                out.submitValue = el.isMulti
                                    ? Array.isArray(raw)
                                        ? raw.join(';')
                                        : raw || ''
                                    : out.value;
                                out.options =
                                    el.customOptions && el.customOptions.length
                                        ? el.customOptions
                                        : this.picklistMap[el.fieldApiName] || [];
                                out.hasError = !!this.fieldErrors[
                                    el.fieldApiName
                                ];
                                out.errorMessage =
                                    this.fieldErrors[el.fieldApiName] || '';
                            } else if (el.isFieldDefault) {
                                // Bind to an explicit prefill when one exists,
                                // otherwise fall back to the live value the user
                                // has already entered. Never bind `undefined`
                                // back over a field on a reactive re-render —
                                // that would wipe what the user just typed.
                                const pf = this.prefillValues[el.fieldApiName];
                                out.prefillValue =
                                    pf !== undefined && pf !== null
                                        ? pf
                                        : this.liveValues[el.fieldApiName];
                            }
                            return out;
                        })
                    };
                })
            };
        });
    }

    // --- Conditional visibility engine ---
    handleFieldValueChange(event) {
        const fieldName = event.target && event.target.fieldName;
        if (!fieldName) return;
        // Once the user touches a field, stop pushing prefill values over it.
        this._userEditedFields.add(fieldName);
        const v = event.detail ? event.detail.value : event.target.value;
        this.liveValues = { ...this.liveValues, [fieldName]: v };
        // A lookup change refreshes any related-field values it feeds.
        if (this.traversalMap[fieldName]) this.fetchTraversalFor(fieldName);
        this.runAutofillFor(fieldName);
    }

    // --- One-level relationship traversal (e.g. Account.Type) ---
    get traversalMap() {
        const map = {};
        const scan = (expr) => {
            if (!expr) return;
            try {
                const cfg = JSON.parse(expr);
                (cfg.rules || []).forEach((r) => {
                    if (
                        r.field &&
                        r.field.indexOf('.') > 0 &&
                        r.lookupField &&
                        r.targetObject
                    ) {
                        const rel = r.field.split('.')[0];
                        const tf = r.field.split('.').slice(1).join('.');
                        if (!map[r.lookupField]) {
                            map[r.lookupField] = {
                                targetObject: r.targetObject,
                                relationship: rel,
                                fields: new Set()
                            };
                        }
                        map[r.lookupField].fields.add(tf);
                    }
                });
            } catch (e) {
                /* ignore */
            }
        };
        (this.pages || []).forEach((p) =>
            (p.sections || []).forEach((s) => {
                scan(s.visibilityExpression);
                (s.elements || []).forEach((el) => scan(el.visibilityExpression));
            })
        );
        return map;
    }

    fetchTraversalFor(lookupField) {
        const entry = this.traversalMap[lookupField];
        if (!entry) return;
        const recId = this.liveValues[lookupField];
        if (!recId) return;
        getRecordFields({
            objectApiName: entry.targetObject,
            recordId: recId,
            fieldApiNames: [...entry.fields]
        })
            .then((res) => {
                if (!res) return;
                const merged = { ...this.liveValues };
                Object.keys(res).forEach((f) => {
                    merged[`${entry.relationship}.${f}`] = res[f];
                });
                this.liveValues = merged;
            })
            .catch(() => {});
    }

    fetchAllTraversal() {
        Object.keys(this.traversalMap).forEach((lf) =>
            this.fetchTraversalFor(lf)
        );
    }

    // --- Autofill: copy fields from a source record into form fields ---
    get autofillRules() {
        return (this.formSettings && this.formSettings.autofillRules) || [];
    }

    runAutofillFor(changedLookupField) {
        this.autofillRules.forEach((rule) => {
            if (rule.sourceType === 'lookup' && rule.lookupField === changedLookupField) {
                const recId = this.liveValues[changedLookupField];
                if (recId) this.applyAutofill(rule, recId);
            }
        });
    }

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

    applyAutofill(rule, recId) {
        const mappings = rule.mappings || [];
        if (!mappings.length || !rule.sourceObject) return;
        const sourceFields = mappings.map((m) => m.from);
        getRecordFields({
            objectApiName: rule.sourceObject,
            recordId: recId,
            fieldApiNames: sourceFields
        })
            .then((res) => {
                if (!res) return;
                const lv = { ...this.liveValues };
                const pf = { ...this.prefillValues };
                mappings.forEach((m) => {
                    if (res[m.from] !== undefined) {
                        lv[m.to] = res[m.from];
                        pf[m.to] = res[m.from];
                    }
                });
                this.liveValues = lv;
                this.prefillValues = pf;
            })
            .catch(() => {});
    }

    // Seed live values from an existing record (edit mode) so custom controls
    // prefill and visibility rules evaluate against the real record on load.
    seedFromRecord() {
        if (!this.effectiveRecordId || !this.primaryObject) return;
        const fields = new Set();
        this.allCustomElements.forEach((el) => {
            if (el.fieldApiName) fields.add(el.fieldApiName);
        });
        const scan = (expr) => {
            if (!expr) return;
            try {
                const cfg = JSON.parse(expr);
                (cfg.rules || []).forEach((r) => {
                    if (!r.field || r.field.indexOf('$') === 0) return;
                    if (r.field.indexOf('.') > 0) {
                        if (r.lookupField) fields.add(r.lookupField);
                        return;
                    }
                    fields.add(r.field);
                });
            } catch (e) {
                /* ignore */
            }
        };
        (this.pages || []).forEach((p) =>
            (p.sections || []).forEach((s) => {
                scan(s.visibilityExpression);
                (s.elements || []).forEach((el) => scan(el.visibilityExpression));
            })
        );
        if (!fields.size) {
            this.fetchAllTraversal();
            return;
        }
        getRecordFields({
            objectApiName: this.primaryObject,
            recordId: this.effectiveRecordId,
            fieldApiNames: [...fields]
        })
            .then((res) => {
                if (res) {
                    const merged = { ...this.liveValues };
                    Object.keys(res).forEach((f) => {
                        merged[f] = res[f];
                    });
                    this.allCustomElements.forEach((el) => {
                        const raw = merged[el.fieldApiName];
                        if (raw !== undefined && raw !== '') {
                            merged[el.fieldApiName] = el.isMulti
                                ? String(raw).split(';')
                                : el.isToggle
                                ? raw === 'true' || raw === true
                                : raw;
                        }
                    });
                    this.liveValues = merged;
                }
                this.fetchAllTraversal();
            })
            .catch(() => this.fetchAllTraversal());
    }

    evalVisibility(expr, values) {
        if (!expr) return true;
        let cfg;
        try {
            cfg = typeof expr === 'string' ? JSON.parse(expr) : expr;
        } catch (e) {
            return true;
        }
        const rules = cfg.rules || [];
        if (!rules.length) return true;
        const results = rules.map((r) => this.evalRule(r, values));
        if (cfg.logic === 'any') return results.some(Boolean);
        if (cfg.logic === 'custom' && cfg.customLogic) {
            return this.evalCustomLogic(cfg.customLogic, results);
        }
        return results.every(Boolean);
    }

    evalRule(rule, values) {
        const left = values[rule.field];
        const right = rule.value;
        const ls = left === undefined || left === null ? '' : String(left);
        const rs = right === undefined || right === null ? '' : String(right);
        switch (rule.operator) {
            case 'equals':
                return ls === rs;
            case 'notEqual':
                return ls !== rs;
            case 'contains':
                return ls.includes(rs);
            case 'notContains':
                return !ls.includes(rs);
            case 'startsWith':
                return ls.startsWith(rs);
            case 'greaterThan':
                return Number(left) > Number(right);
            case 'lessThan':
                return Number(left) < Number(right);
            case 'greaterOrEqual':
                return Number(left) >= Number(right);
            case 'lessOrEqual':
                return Number(left) <= Number(right);
            case 'isNull':
                return ls === '';
            case 'isNotNull':
                return ls !== '';
            default:
                return true;
        }
    }

    // Safe boolean evaluator for custom logic like "1 AND (2 OR 3)".
    evalCustomLogic(expr, results) {
        const tokens = String(expr)
            .toUpperCase()
            .match(/\d+|AND|OR|NOT|\(|\)/g);
        if (!tokens) return true;
        let i = 0;
        const parseExpr = () => {
            let v = parseTerm();
            while (tokens[i] === 'OR') {
                i++;
                const r = parseTerm();
                v = v || r;
            }
            return v;
        };
        const parseTerm = () => {
            let v = parseFactor();
            while (tokens[i] === 'AND') {
                i++;
                const r = parseFactor();
                v = v && r;
            }
            return v;
        };
        const parseFactor = () => {
            if (tokens[i] === 'NOT') {
                i++;
                return !parseFactor();
            }
            if (tokens[i] === '(') {
                i++;
                const v = parseExpr();
                if (tokens[i] === ')') i++;
                return v;
            }
            const num = parseInt(tokens[i++], 10);
            return !!results[num - 1];
        };
        try {
            return parseExpr();
        } catch (e) {
            return true;
        }
    }

    get progressSteps() {
        return this.pages
            .filter((p) => p.showInProgress)
            .map((p) => ({
                id: p.id,
                name: p.name,
                index: p.index,
                stepClass:
                    p.index === this.currentPageIndex
                        ? 'progress-step active'
                        : p.index < this.currentPageIndex
                        ? 'progress-step done'
                        : 'progress-step'
            }));
    }

    get navItems() {
        return this.pages.map((p) => ({
            id: p.id,
            name: p.name,
            index: p.index,
            navClass:
                p.index === this.currentPageIndex
                    ? 'vnav-item active'
                    : 'vnav-item'
        }));
    }

    get isFirstPage() {
        return this.currentPageIndex === 0;
    }

    get isLastPage() {
        return this.currentPageIndex === this.pages.length - 1;
    }

    get showSubmit() {
        // Submit on the last page (wizard/vnav) or always (single page)
        return this.isSinglePage || this.isLastPage;
    }

    get showNext() {
        return (this.isWizard || this.isVerticalNav) && !this.isLastPage;
    }

    get nextLabel() {
        const p = this.pages[this.currentPageIndex];
        return (p && p.nextLabel) || 'Next';
    }

    get submitButtonLabel() {
        // Last page can override the form-level submit label.
        const p = this.pages[this.currentPageIndex];
        return (
            (p && p.submitLabel) ||
            this.formSettings.submitLabel ||
            'Submit'
        );
    }

    get showBack() {
        return (this.isWizard || this.isVerticalNav) && !this.isFirstPage;
    }

    // Map the theme's named radius to concrete pixel values.
    radiusToken(name) {
        const map = {
            sharp: '2px',
            rounded: '8px',
            round: '14px',
            pill: '9999px'
        };
        return map[name] || map.rounded;
    }

    get formCardStyle() {
        const parts = [];
        const ff = this.header && this.header.fontFamily;
        if (ff && ff !== 'default') parts.push(`font-family: ${ff}`);

        // Theme tokens cascade to every themed element inside the shell.
        const t = (this.formSettings && this.formSettings.theme) || {};
        const accent = t.accent || '#0176d3';
        parts.push(`--c-accent: ${accent}`);
        parts.push(`--c-brand: ${accent}`);
        parts.push(`--c-brand-dark: ${accent}`);

        const radius = this.radiusToken(t.radius);
        parts.push(`--c-radius: ${radius}`);
        // The card/section radius is capped so a "pill" choice (meant for
        // buttons/inputs) doesn't balloon the whole card.
        parts.push(`--c-radius-card: ${t.radius === 'pill' ? '18px' : radius}`);

        // Submit/Back default to the accent; either can be overridden.
        parts.push(`--c-submit-bg: ${t.submitColor || accent}`);
        parts.push(`--c-back-color: ${t.backColor || accent}`);

        if (t.surface) parts.push(`background: ${t.surface}`);

        // Width is responsive: a max-width cap, full-width on smaller screens.
        const width =
            (this.formSettings && Number(this.formSettings.formWidth)) || 760;
        parts.push(`max-width: ${width}px`);

        return parts.join('; ');
    }

    get headerVisible() {
        return this.header && this.header.visible;
    }

    get playerHeaderStyle() {
        const h = this.header || {};
        const parts = [];
        if (h.backgroundColor && h.backgroundColor !== '#ffffff') {
            parts.push(`background-color: ${h.backgroundColor}`);
        }
        if (h.backgroundImage) {
            parts.push(`background-image: url('${h.backgroundImage}')`);
            parts.push('background-size: cover');
            parts.push('background-position: center');
        }
        return parts.join('; ');
    }

    get playerHeaderClass() {
        const h = this.header || {};
        const hasBg = !!h.backgroundImage;
        const alignment = h.alignment || 'left';
        return `player-header${hasBg ? ' has-bg' : ''} align-${alignment}`;
    }

    get playerTitleClass() {
        const size = (this.header && this.header.titleSize) || 'large';
        return `player-title title-${size}`;
    }

    get playerTitleStyle() {
        const c = this.header && this.header.titleColor;
        return c ? `color: ${c};` : '';
    }

    get playerSubtitleStyle() {
        const c = this.header && this.header.subtitleColor;
        return c ? `color: ${c};` : '';
    }

    get playerLogoClass() {
        const size = (this.header && this.header.logoSize) || 'medium';
        return `player-logo logo-${size}`;
    }

    get isCreateMode() {
        return !this.effectiveRecordId;
    }

    // --- Navigation ---

    // Whether moving forward should validate the current page first. Wizards
    // always gate (you walk steps in order); Vertical-Nav only gates when the
    // form opts in (people often fill those out of order).
    get validateOnNavigate() {
        if (this.isWizard) return true;
        if (this.isVerticalNav) {
            return !!(this.formSettings && this.formSettings.validateOnNavigate);
        }
        return false;
    }

    handleNext() {
        if (this.currentPageIndex < this.pages.length - 1) {
            if (this.validateOnNavigate && !this.validateCurrentPage()) return;
            this.currentPageIndex += 1;
            this.scrollTop();
        }
    }

    handleBack() {
        // Going back is always free — never block a user from reviewing.
        if (this.currentPageIndex > 0) {
            this.submitErrors = [];
            this.currentPageIndex -= 1;
            this.scrollTop();
        }
    }

    handleNavSelect(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        if (Number.isNaN(idx)) return;
        // Jumping forward validates the current page when enabled; jumping
        // backward (or to the current page) is always allowed.
        if (
            idx > this.currentPageIndex &&
            this.validateOnNavigate &&
            !this.validateCurrentPage()
        ) {
            return;
        }
        this.currentPageIndex = idx;
        this.scrollTop();
    }

    scrollTop() {
        const el = this.template.querySelector('.player-scroll');
        if (el) el.scrollTop = 0;
    }

    // --- Submit ---

    // Shared validation core. Pass a page index to validate just that page
    // (used when navigating between pages), or null to validate the whole form
    // (used on submit). Returns collected client-side errors; does not mutate
    // component state. A stale server (validation-rule) error left on a field
    // from a previous submit is intentionally ignored here so a resubmit can
    // reach the server and re-validate.
    collectValidationErrors(pageIndex) {
        const errors = [];
        const fieldErrs = {};
        const erroredFields = [];
        const scopeSel =
            pageIndex == null ? '' : '.player-page:not(.is-hidden) ';

        // Hidden carriers backing custom controls = real validity source.
        const carriers = {};
        this.template
            .querySelectorAll(`${scopeSel}lightning-input-field.slds-hide`)
            .forEach((f) => {
                if (f.fieldName) carriers[f.fieldName] = f;
            });

        // Custom "Render As" controls — validate + render our own inline error.
        const pages =
            pageIndex == null
                ? this.renderedPages
                : [this.renderedPages[pageIndex]].filter(Boolean);
        pages.forEach((p) =>
            (p.sections || []).forEach((s) =>
                (s.elements || []).forEach((el) => {
                    if (!el.isCustomField) return;
                    const carrier = carriers[el.fieldApiName];
                    const carrierMissing = !!(
                        carrier &&
                        carrier.validity &&
                        carrier.validity.valueMissing
                    );
                    const requiredEmpty =
                        el.effectiveRequired && this.isEmptyValue(el.value);
                    if (requiredEmpty || carrierMissing) {
                        fieldErrs[el.fieldApiName] = 'Complete this field.';
                        errors.push(`${el.label || 'A field'} is required.`);
                        erroredFields.push(el.fieldApiName);
                    }
                })
            )
        );

        // Native fields — flag only genuine client-side problems.
        this.template
            .querySelectorAll(`${scopeSel}lightning-input-field`)
            .forEach((f) => {
                if (f.classList && f.classList.contains('slds-hide')) return;
                const v = f.validity;
                if (!v || v.valid) return;
                const clientInvalid =
                    v.valueMissing ||
                    v.typeMismatch ||
                    v.patternMismatch ||
                    v.rangeOverflow ||
                    v.rangeUnderflow ||
                    v.stepMismatch ||
                    v.tooLong ||
                    v.tooShort ||
                    v.badInput;
                if (!clientInvalid) return; // only a stale server error → let it resubmit
                if (typeof f.reportValidity === 'function') f.reportValidity();
                const label = this.fieldLabel(f.fieldName);
                errors.push(
                    v.valueMissing
                        ? `${label} is required.`
                        : `${label} needs a valid value.`
                );
                if (f.fieldName) erroredFields.push(f.fieldName);
            });

        return { errors, fieldErrs, erroredFields };
    }

    // Validate the current page before advancing. Returns true if it's clean.
    validateCurrentPage() {
        const { errors, fieldErrs } = this.collectValidationErrors(
            this.currentPageIndex
        );
        this.fieldErrors = fieldErrs;
        if (errors.length) {
            this.setSubmitErrors(errors);
            this.scrollTop();
            return false;
        }
        this.submitErrors = [];
        return true;
    }

    handleSubmitClick() {
        this.submitErrors = [];
        this.fieldErrors = {};

        // Validate everything up front so errors show inline AND collect into
        // the single summary near the button. (Runs in preview too, so builders
        // can test validation — only the final DML save is skipped in preview.)
        const { errors, fieldErrs, erroredFields } =
            this.collectValidationErrors(null);

        if (this.needsCaptcha && !this._captchaToken) {
            errors.push("Please verify that you're not a robot.");
        }

        this.fieldErrors = fieldErrs;

        if (errors.length) {
            this.setSubmitErrors(errors);
            // In multi-page layouts, jump to the first page that has an error
            // so its inline message is actually on screen (not on a hidden page).
            this.goToFirstErrorPage(erroredFields);
            return;
        }

        // Validation passed. Preview stops here (no DML); a real run saves.
        if (this.previewMode) {
            this.isSubmitted = true;
            return;
        }

        // Lock the submit button for the whole save round-trip so a second
        // click can't fire another DML and create a duplicate record. Cleared
        // in handleSuccess / handleError (and on a honeypot drop).
        this._submitting = true;

        // Clear any stale server (validation-rule) errors still attached to
        // fields from a previous submit so the record-edit-form re-validates
        // from scratch and re-fires onerror if a rule still fails.
        this.template
            .querySelectorAll('lightning-input-field')
            .forEach((f) => {
                if (typeof f.setCustomValidity === 'function') {
                    f.setCustomValidity('');
                }
            });

        const form = this.template.querySelector('lightning-record-edit-form');
        if (form) {
            // Fires onsubmit (merge of custom values) then native DML.
            form.submit();
        }
    }

    isEmptyValue(v) {
        if (v === undefined || v === null) return true;
        if (typeof v === 'string') return v.trim() === '';
        if (Array.isArray(v)) return v.length === 0;
        return false;
    }

    fieldLabel(api) {
        let label = api || 'A field';
        (this.pages || []).forEach((p) =>
            (p.sections || []).forEach((s) =>
                (s.elements || []).forEach((el) => {
                    if (el.fieldApiName === api && el.label) label = el.label;
                })
            )
        );
        return label;
    }

    goToFirstErrorPage(fields) {
        if (this.isSinglePage || !fields || !fields.length) return;
        let target = -1;
        fields.forEach((api) => {
            const idx = this.pageIndexForField(api);
            if (idx >= 0 && (target === -1 || idx < target)) target = idx;
        });
        if (target >= 0 && target !== this.currentPageIndex) {
            this.currentPageIndex = target;
            this.scrollTop();
        }
    }

    pageIndexForField(api) {
        const pages = this.pages || [];
        for (let i = 0; i < pages.length; i++) {
            const sections = pages[i].sections || [];
            for (let j = 0; j < sections.length; j++) {
                const els = sections[j].elements || [];
                for (let k = 0; k < els.length; k++) {
                    if (els[k].fieldApiName === api) return i;
                }
            }
        }
        return -1;
    }

    // --- "Render As" custom controls ---

    // A field rendered as a custom control writes its value into liveValues,
    // which both feeds visibility and is merged into the record on submit.
    handleCustomChange(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;
        const isToggle = event.currentTarget.dataset.toggle === 'true';
        const v = isToggle ? event.target.checked : event.detail.value;
        this.liveValues = { ...this.liveValues, [field]: v };
        // Clear the inline error once the user provides a value.
        if (this.fieldErrors[field] && !this.isEmptyValue(v)) {
            const next = { ...this.fieldErrors };
            delete next[field];
            this.fieldErrors = next;
        }
        if (this.traversalMap[field]) this.fetchTraversalFor(field);
        this.runAutofillFor(field);
    }

    get allCustomElements() {
        const out = [];
        (this.pages || []).forEach((p) =>
            (p.sections || []).forEach((s) =>
                (s.elements || []).forEach((el) => {
                    if (el.isCustomField) out.push(el);
                })
            )
        );
        return out;
    }

    // Custom controls aren't inside the record-edit-form, so merge their
    // values into the submission. Multi-selects are joined for the field.
    handleFormSubmit(event) {
        event.preventDefault();

        // Honeypot: a hidden field humans never see. If a bot filled it, drop
        // the submission silently. (Other validation runs in handleSubmitClick.)
        if (this._honeypot) {
            this._submitting = false;
            return;
        }

        const fields = { ...event.detail.fields };
        this.allCustomElements.forEach((el) => {
            const v = this.liveValues[el.fieldApiName];
            if (v === undefined) return;
            fields[el.fieldApiName] = el.isMulti
                ? Array.isArray(v)
                    ? v.join(';')
                    : v
                : v;
        });

        const form = this.template.querySelector('lightning-record-edit-form');
        if (form) form.submit(fields);
    }

    // Picklist values for the form's object, for radio/dropdown/checkbox renders.
    loadPicklistMap() {
        const obj = this.primaryObject;
        if (!obj || this._picklistObj === obj) return;
        this._picklistObj = obj;
        getPicklistOptions({ objectApiName: obj })
            .then((m) => {
                this.picklistMap = m || {};
            })
            .catch(() => {
                this.picklistMap = {};
            });
    }

    handleSuccess(event) {
        this.savedRecordId = event.detail.id;
        this._submitting = false;
        const created = this.isCreateMode;
        const s = this.formSettings;

        if (s.afterSubmitMode === 'ToastAndGo') {
            // Toast + immediate navigation, no completion screen
            this.dispatchEvent(
                new ShowToastEvent({
                    title: created ? 'Record created' : 'Record updated',
                    variant: 'success'
                })
            );
            this.navigateTo(s.toastAndGoTarget, s.toastAndGoUrl);
            return;
        }

        // Completion screen
        this.isSubmitted = true;
        if (s.autoRedirect) {
            this.startRedirectCountdown(
                Number(s.redirectDelay || 0),
                s.redirectTarget,
                s.redirectUrl
            );
        }
    }

    // Auto-redirect with a visible, cancellable countdown so a reader mid-message
    // isn't yanked away with no recourse.
    startRedirectCountdown(seconds, target, url) {
        this._redirectTarget = target;
        this._redirectUrl = url;
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

    disconnectedCallback() {
        this.clearRedirect();
    }

    handleActionButton() {
        this.navigateTo(
            this.formSettings.actionButtonTarget,
            this.formSettings.actionButtonUrl
        );
    }

    /**
     * Navigate to a destination resolved at runtime:
     *  - 'Record' → the just-saved record (NavigationMixin handles LEX vs community)
     *  - 'Custom' → a URL with {recordId}/{objectApiName} tokens substituted
     */
    navigateTo(target, url) {
        if (this.previewMode) return; // never navigate in preview

        if (target === 'Custom') {
            const resolved = this.resolveTokens(url);
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

    resolveTokens(url) {
        return (url || '')
            .replace(/{recordId}/g, this.savedRecordId || '')
            .replace(/{objectApiName}/g, this.primaryObject || '');
    }

    handleError(event) {
        this._submitting = false;
        const detail = event.detail;
        this.setSubmitErrors(this.buildServerErrors(detail));
        // Native fields get their server (validation-rule) errors inline from
        // the record-edit-form automatically. Custom "Render As" controls are
        // NOT in the form — their only field input is the hidden carrier — so
        // the inline error lands on an invisible element. Route those field
        // errors onto our own inline slot for the custom controls.
        this.applyServerFieldErrors(detail);
    }

    applyServerFieldErrors(detail) {
        const output = detail && detail.output;
        const fe = (output && output.fieldErrors) || {};
        const keys = Object.keys(fe);
        if (!keys.length) return;
        const customApis = new Set(
            this.allCustomElements.map((el) => el.fieldApiName)
        );
        const next = { ...this.fieldErrors };
        const erroredFields = [];
        keys.forEach((api) => {
            if (!customApis.has(api)) return; // native already shows inline
            const msgs = (fe[api] || [])
                .map((e) => e && e.message)
                .filter(Boolean);
            if (msgs.length) {
                next[api] = msgs.join(' ');
                erroredFields.push(api);
            }
        });
        this.fieldErrors = next;
        this.goToFirstErrorPage(erroredFields);
    }

    normalizeUrl(url) {
        // Absolute URLs and relative paths (e.g. /lightning/...) pass through.
        if (/^https?:\/\//i.test(url) || url.charAt(0) === '/') return url;
        return 'https://' + url;
    }

    get thankYouMessage() {
        return this.formSettings.thankYouMessage;
    }

    get actionButtonLabel() {
        return this.formSettings.actionButtonLabel || 'Continue';
    }
}