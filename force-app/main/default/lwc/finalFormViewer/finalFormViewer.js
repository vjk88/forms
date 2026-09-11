import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import getRecordContext from '@salesforce/apex/FinalSurveyObjectController.getRecordContext';
import { resolveTokens } from 'c/finalThemeEngine';
import { getLayout } from 'c/finalLayoutRegistry';
import { ensureFont } from 'c/finalFontLoader';
import { evaluateVisibility, validateElement } from 'c/finalExpressionEngine';
import {
    reconcileAnswers,
    reconcileAutofillSession,
    pageAnchor,
    restorePage
} from './previewSession';
import {
    indexLookups,
    buildGraph,
    affectedLookups,
    compileFilter,
    filterFingerprint,
    displayInfoOf,
    matchingInfoOf,
    sameAnswer,
    BLOCKED
} from 'c/finalLookupUtils';
import {
    createAutofillSession,
    extractAutofillRules,
    computeRulesFingerprint,
    seedStaticDefaults,
    onManualEdit,
    onSourceChanged,
    onResult,
    isRequestCurrent,
    onRequestFailure
} from './autofillEngine';

/**
 * Where an answer came from. Every write to `_answers` names one, because the
 * origin decides what else is allowed to happen:
 *
 *  - `user`       a respondent touched the control. Only this marks the answer
 *                 manually edited, which is what stops Autofill overwriting it.
 *  - `autofill`   a rule filled it in.
 *  - `dependency` a parent lookup changed and this child had to be cleared.
 *                 Emphatically NOT a manual edit: treating it as one would
 *                 make an automatic clear look like a deliberate answer and
 *                 permanently pin the field against Autofill.
 *  - `hydrate`    loading a record, a draft, a preview or a prefill.
 *  - `reset`      a wholesale replacement, e.g. switching spec or edit target.
 */
export const ANSWER_ORIGIN = {
    USER: 'user',
    AUTOFILL: 'autofill',
    DEPENDENCY: 'dependency',
    HYDRATE: 'hydrate',
    RESET: 'reset'
};

/**
 * One-question-per-screen auto-split (SURVEY_PLAN §10 Q4, ruled 2026-07-27,
 * built 2026-07-31). RENDER-TIME only — the authored spec keeps its pages and
 * sections; each question becomes its own virtual page whose single section
 * inherits the parent's title/style/visibility, so section theming, rules and
 * OneAtATime's section-label eyebrow keep working. The in-card section header
 * renders only on the section's FIRST question (the renderer's existing
 * `showHeader !== false` escape — this is its first writer). Repeat sections
 * stay ATOMIC: one screen for the whole repeater. Virtual pages drop `name`
 * so steppers/tabs fall back to honest numbering (Step 1…N).
 */
/** True when any question declares a survey-object mapping (spec walk —
 *  cheap, and it gates every prefill/writeback call). */
function specHasMappings(spec) {
    for (const page of spec.pages || []) {
        for (const sec of page.sections || []) {
            if (sec.repeat) {
                continue;
            }
            for (const el of sec.elements || []) {
                if (el.mapping && el.mapping.field) {
                    return true;
                }
            }
        }
    }
    return false;
}

/** SO-3: any record-sourced rule row anywhere a rules config can live —
 *  page/section/element visibility plus validation `when` gates. */
function specHasRecordRules(spec) {
    const inConfig = (config) =>
        (config && config.rules ? config.rules : []).some(
            (r) =>
                typeof r.source === 'string' && r.source.startsWith('record:')
        );
    for (const page of spec.pages || []) {
        if (inConfig(page.visibility)) {
            return true;
        }
        for (const sec of page.sections || []) {
            if (inConfig(sec.visibility)) {
                return true;
            }
            for (const el of sec.elements || []) {
                if (inConfig(el.visibility)) {
                    return true;
                }
                for (const v of el.validation || []) {
                    if (inConfig(v.when)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function splitOnePerScreen(pages) {
    const out = [];
    const pageId = (page, suffix) => `${page.id || page.key || 'p'}~${suffix}`;
    for (const page of pages) {
        (page.sections || []).forEach((section, si) => {
            // Builder specs always carry ids; positional fallbacks guard
            // hand-authored JSON from `p~undefined` LWC key collisions.
            const secId = section.id || `s${si}`;
            // repeaters are atomic by nature; keepTogether is the AUTHORED
            // version of the same promise (Card Deck multi-input step,
            // owner 2026-08-01) — the whole section rides one screen
            if (section.repeat || section.keepTogether) {
                out.push({
                    ...page,
                    name: undefined,
                    id: pageId(page, secId),
                    key: pageId(page, secId),
                    sections: [section]
                });
                return;
            }
            (section.elements || []).forEach((el, i) => {
                const elKey = el.id || `${secId}e${i}`;
                out.push({
                    ...page,
                    name: undefined,
                    id: pageId(page, elKey),
                    key: pageId(page, elKey),
                    sections: [
                        {
                            ...section,
                            id: `${secId}~${elKey}`,
                            showHeader: i === 0 ? section.showHeader : false,
                            // reviewer blocker B2 (2026-07-31): a one-question
                            // screen is never an accordion — inherited
                            // collapse flags left screen 1 EMPTY behind a
                            // chevron while Next walked right past it
                            collapsible: false,
                            defaultCollapsed: false,
                            // conversational scale (owner 2026-07-31): a lone
                            // question is a HEADLINE, not a 13px form label —
                            // the section renderer promotes the type tiers
                            convo: true,
                            elements: [el]
                        }
                    ]
                });
            });
        });
    }
    return out;
}

/**
 * finalFormViewer — P0 minimal viewer: fetches one published Spec_JSON__c blob,
 * parses it (FORM_SPEC_SCHEMA v1), resolves tokens, lazy-loads the nav primitive
 * from the registry, and hands everything to finalPageFrame.
 *
 * Token source (ARCH §5): a published `resolved.tokens` snapshot wins; otherwise
 * the engine runs live (builder-preview semantics — fine for internal P0).
 * `?c__formId=` / `?c__versionId=` URL params override the configured properties.
 */
export default class FinalFormViewer extends NavigationMixin(LightningElement) {
    @api formId;
    @api versionId;

    /**
     * Builder-preview mode: clicks on rendered elements re-emit as
     * `elementselect` {elementId} so the studio can sync its selection
     * (P3 preview-click requirement). The section renderer announces the
     * clicked element with a COMPOSED `elementclick` (synthetic shadow
     * retargets composedPath, so the viewer cannot resolve it from here) —
     * no nav primitive knows. Never set on published/guest renders.
     */
    @api authoring = false;

    /** Opt-in only from the Studio stage; guest inline-spec semantics stay unchanged. */
    @api preservePreview = false;
    @api previewState;
    _previewSpec;
    _previewRevision = 0;

    @api
    getPreviewState() {
        if (!this.preservePreview) return undefined;
        if (!this._previewSpec) return this.previewState;
        return {
            spec: this._previewSpec,
            answers: { ...this.answers },
            anchor: pageAnchor(this.visiblePages[this.pageIndex]),
            pageIndex: this.pageIndex,
            startedAt: this._startedAt
        };
    }

    /**
     * Embedded-surface override forwarded to the page frame (tri-state:
     * undefined = frame auto-detects from the URL). The studio's preview
     * stage forces true so embedded-only page treatments render in previews
     * hosted outside /lightning/ (the VF full-page studio).
     */
    @api embedded;

    /**
     * Delegated submit (guest host, Phase A2). When true, a validated submit
     * does NOT call internal Apex or simulate — it emits `submitrequest`
     * {payload} and waits for the host to resolve it via `completeSubmit()` or
     * `failSubmit(message)`. The host owns the guest Apex call; the viewer stays
     * a pure renderer that never imports the guest controller. Wins over the
     * inline-spec simulate below (the host feeds the viewer an inline spec).
     */
    @api delegateSubmit = false;

    /**
     * Inline spec (pre-save preview — creation flow step 3, builder preview
     * later). When set, it wins over formId/versionId and no Apex load runs.
     * Re-setting it re-applies; navigation position survives when the layout
     * and page count are unchanged (so live-typing the title doesn't yank the
     * preview back to page 1).
     */
    @api
    get spec() {
        return this._inlineSpec;
    }
    set spec(value) {
        this._inlineSpec = value;
        if (value) {
            this._apply(value, { preserveNav: true });
        }
    }

    model;
    tokens = {};
    navCtor;
    error;

    /** Step-flow state (paginated layouts). The viewer is the engine for now. */
    pageIndex = 0;

    /** Pages whose validation failures are SHOWN (a blocked advance or
     *  submit reveals them; before that a half-typed form stays quiet).
     *  Reassigned wholesale so the getters recompute. */
    _revealed = [];

    /** Post-submit: true renders c/finalAfterSubmit instead of the nav.
     *  MUST be a declared field — undeclared assignments aren't reactive. */
    completed = false;

    /** Submit-engine state (slice 7).
     *
     *  Exposed READ-ONLY. This was briefly `@api submitError`, which made every
     *  one of the component's own assignments an `@lwc/lwc/no-api-reassignments`
     *  violation — a component may not reassign its own public property, and
     *  LWC's one-way data flow says the owner writes it. Nothing outside ever
     *  set it (only Studio/tests READ it), so a getter over private state gives
     *  the same access without breaking the contract. */
    _submitError;

    @api
    get submitError() {
        return this._submitError;
    }
    submittedRecordId = null;
    _submitting = false;
    _startedAt = null;
    _redirectTimer = null;

    /** Live answers keyed by element id (schema §8) — fed by the valuechange
     *  re-emit chain; drives rule evaluation now, submission in the P3
     *  submit slice. Replaced wholesale so getters recompute.
     *
     *  Exposed READ-ONLY for the same reason as submitError above: this is the
     *  component's own state, reassigned constantly, so `@api answers` made
     *  every assignment an LWC violation. Reassigning the private field is
     *  still reactive, and external callers (Studio, tests) only read. */
    _answers = {};

    @api
    get answers() {
        return this._answers;
    }

    /** SO-3 record-rule verdicts from getRecordContext ({factKey: boolean}).
     *  DECLARED (reactive) — visibility getters recompute when facts land;
     *  null = no record context, record rows read "no match". */
    _ruleFacts = null;

    _inlineSpec;
    _urlFormId;
    _urlVersionId;
    _loadedKey;
    /** SO-4: guest-host-injected {ruleFacts, prefill} (see recordContext). */
    _injectedCtx;

    /** Explicit host inputs. Blank means create / no survey context. */
    _existingRecordId;
    _surveyContextRecordId;
    _pageRef;
    _urlExistingRecordId;
    _urlSurveyContextRecordId;
    _surveyContextKey;
    _surveyLoading = false;
    _editConfigurationError;

    @api
    get existingRecordId() {
        return this._existingRecordId;
    }
    set existingRecordId(value) {
        this._existingRecordId = value;
        this._recordInputsChanged();
    }

    @api
    get surveyContextRecordId() {
        return this._surveyContextRecordId;
    }
    set surveyContextRecordId(value) {
        this._surveyContextRecordId = value;
        this._recordInputsChanged();
    }

    _recordInput(property, urlValue) {
        return String(property || '').trim() || String(urlValue || '').trim();
    }

    _isPageRecordExpression(value) {
        return value === 'recordId' || value === '{!recordId}';
    }

    _resolveRecordInput(value) {
        const candidate = this._isPageRecordExpression(value)
            ? this._pageRef?.type === 'standard__recordPage'
                ? this._pageRef.attributes?.recordId
                : null
            : value;
        return /^(?:[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})$/.test(candidate || '')
            ? candidate
            : null;
    }

    get _existingInput() {
        return this._recordInput(
            this._existingRecordId,
            this._urlExistingRecordId
        );
    }

    get _surveyInput() {
        return this._recordInput(
            this._surveyContextRecordId,
            this._urlSurveyContextRecordId
        );
    }

    _surveyKey() {
        return JSON.stringify([
            this._surveyInput,
            this._resolveRecordInput(this._surveyInput)
        ]);
    }

    _recordInputsChanged() {
        if (
            !this._editSpec ||
            this.authoring ||
            this.preservePreview ||
            this.delegateSubmit
        )
            return;
        if (this.error && !this.model) {
            this._apply(this._editSpec);
        } else if (this._editSpec.form?.type === 'survey') {
            if (this._surveyKey() !== this._surveyContextKey) {
                // Invalidate the old response before the next asynchronous apply.
                this.model = null;
                this._applyAnswers({}, ANSWER_ORIGIN.RESET, { replace: true });
                this._recordCtx = null;
                this._ruleFacts = null;
                this._injectedCtx = null;
                clearTimeout(this._redirectTimer);
                this._apply(this._editSpec);
            }
        } else {
            this._prepareEditMode(this._editSpec);
        }
    }

    /** The hosting record page's object, injected by the platform on
     *  `lightning__RecordPage` ONLY. Undefined on every other host, which is
     *  what keeps the placement guard in `_apply` inert everywhere else. */
    _objectApiName;
    @api
    get objectApiName() {
        return this._objectApiName;
    }
    set objectApiName(value) {
        if (value === this._objectApiName) return;
        this._objectApiName = value;
        if (this._editSpec) this._apply(this._editSpec);
    }

    /** Edit mode (IMPL_PLAN_RECORD_PAGE_EDIT Slice 2): the record this form
     *  edits, the bound fields to read off it, and the element↔field map used
     *  to seed answers. Set only when existingRecordId is explicitly configured. */
    _editRecordId = null;
    _editObject = null;
    _editFields = [];
    _editFieldByElement = [];
    _editSpec;
    _editContextKey;
    _editState = 'inactive';
    _editGeneration = 0;
    _editReaders = [];
    _editStartedRevisions = {};
    _submitGeneration = 0;
    /** elementId -> [message] from the SERVER's rejection of the last submit.
     *  Separate from client validation so the two can coexist on one field. */
    _serverFieldErrors = {};

    /** Autofill state machine and active lookup queries (IMPL_PLAN_AUTOFILL_RULES §6). */
    _autofillSession = null;
    activeAutofillRequests = [];
    _autofillTimers = new Map();

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        this._urlFormId = ref && ref.state ? ref.state.c__formId : undefined;
        this._urlVersionId =
            ref && ref.state ? ref.state.c__versionId : undefined;
        this._pageRef = ref;
        this._urlExistingRecordId = ref?.state?.c__existingRecordId;
        this._urlSurveyContextRecordId = ref?.state?.c__surveyContextRecordId;
        this._recordInputsChanged();
        this._load();
    }

    connectedCallback() {
        if (this._connectedOnce) {
            this._refreshNavCtor();
            if (this._surveyLoading && this._editSpec)
                this._apply(this._editSpec);
            if (
                this._editState === 'loading' &&
                this._editRecordId &&
                this._autofillSession
            )
                this._beginEditRead();
        }
        this._connectedOnce = true;
        this._load();
    }

    /** A scheduled post-submit redirect must die with the component — firing
     *  _navigate() after unmount steers the host page from a dead instance.
     *  (An LWR reconnect re-arms nothing: completion state survives, and the
     *  respondent can still use the completion screen's own controls.) */
    disconnectedCallback() {
        this._editGeneration += 1;
        this._editReaders = [];
        this._submitGeneration += 1;
        this._submitting = false;
        clearTimeout(this._redirectTimer);
        for (const timerId of this._autofillTimers.values()) {
            clearTimeout(timerId);
        }
        this._autofillTimers.clear();
    }

    /**
     * LWR page caching (Experience Cloud) can reconnect a SURVIVING viewer
     * instance into a freshly rebuilt Locker realm (tab-away/tab-back). The
     * statically imported children re-upgrade fine, but the `lwc:is` ctor
     * cached on this instance still points at the OLD realm's class — the new
     * realm's registry refuses it ("Illegal constructor" /
     * "getDefinition of undefined") and the page goes blank. `_load()` can't
     * help: the `_loadedKey` guard short-circuits on an unchanged form. So on
     * every reconnect, drop the cached ctor and re-resolve it through the
     * registry so the CURRENT realm supplies the class. Spec, answers, and
     * page position all survive — only the nav element remounts.
     * (FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md, Option B.)
     */
    async _refreshNavCtor() {
        if (!this._appliedLayoutType && !this.navCtor) {
            return; // nothing applied yet — first _load/_apply owns it
        }
        this.navCtor = undefined; // unmount the stale element first
        try {
            const module = await getLayout(this._appliedLayoutType).load();
            this.navCtor = module.default;
        } catch {
            // chunk load failed at reconnect — say so instead of a blank page
            this.error = 'This form could not be loaded.';
        }
    }

    get effectiveFormId() {
        return this._urlFormId || this.formId;
    }

    get effectiveVersionId() {
        return this._urlVersionId || this.versionId;
    }

    async _load() {
        if (this._inlineSpec) {
            return;
        }
        const formId = this.effectiveFormId;
        const versionId = this.effectiveVersionId;
        if (!formId && !versionId) {
            return;
        }
        const key = `${formId}|${versionId}`;
        if (key === this._loadedKey) {
            return;
        }
        this._loadedKey = key;
        this._submitGeneration += 1;
        this._submitting = false;
        this._editSpec = null;
        this._editGeneration += 1;
        this._editReaders = [];
        this.model = null;
        try {
            const raw = await getSpec({
                formId: formId || null,
                versionId: versionId || null
            });
            if (key !== this._loadedKey) return;
            await this._apply(JSON.parse(raw));
        } catch (e) {
            if (key !== this._loadedKey) return;
            this.model = null;
            this.error =
                (e && e.body && e.body.message) ||
                'This form could not be loaded.';
        }
    }

    async _apply(spec, { preserveNav } = {}) {
        const seq = (this._applySeq = (this._applySeq || 0) + 1);
        this._submitGeneration += 1;
        this._submitting = false;
        if (this._requiresEditRecord(spec) || this._editState !== 'inactive')
            this.model = null;
        this._editSpec = spec;
        this._editGeneration += 1;
        this._editReaders = [];
        if (this._requiresEditRecord(spec)) this._editState = 'loading';
        if (!spec || spec.specVersion !== 1) {
            this.error = 'This form uses an unsupported specification version.';
            this.model = null;
            return;
        }
        // Creating on a record page does not consume that page's record.
        // Explicit IDs are validated by LDS/Apex against the form target.
        const placementTarget = spec.form && spec.form.targetObject;
        if (
            this._isPageRecordExpression(
                spec.form?.type === 'survey'
                    ? this._surveyInput
                    : this._existingInput
            ) &&
            this.objectApiName &&
            placementTarget &&
            this.objectApiName !== placementTarget
        ) {
            this.error = `This form saves to ${placementTarget}, so it can't be used on a ${this.objectApiName} page.`;
            this.model = null;
            return;
        }
        // The P2 gate, by construction: a PUBLISHED spec carries resolved
        // tokens and must never fetch the theme catalog (managed recipes stay
        // out of the delivered bundle). Only the draft/preview path — no
        // `resolved` block — lazy-loads the catalog to run the engine live.
        let theme = null;
        if (!(spec.resolved && spec.resolved.tokens) && spec.theme) {
            if (spec.theme.source === 'builtin') {
                const catalog = await import('c/finalThemeCatalog');
                if (seq !== this._applySeq) {
                    return; // a newer spec landed while the catalog loaded
                }
                theme = catalog.getBuiltinTheme(spec.theme.name);
            } else if (spec.theme.source === 'custom' && spec.theme.name) {
                // draft-path only; a deleted record degrades to overrides +
                // engine defaults (guests stay safe via `resolved` — schema §3)
                try {
                    const json = await getCustomTheme({
                        themeId: spec.theme.name
                    });
                    theme = JSON.parse(json);
                } catch {
                    theme = null;
                }
                if (seq !== this._applySeq) {
                    return;
                }
            }
        }
        this.tokens =
            (spec.resolved && spec.resolved.tokens) ||
            resolveTokens(theme, spec.theme ? spec.theme.overrides : null);

        // Surveys are ALWAYS top-labeled (owner 2026-07-31): a theme carrying
        // labelPosition 'left' must not sneak sideways labels in. Patched on
        // the token bag so published resolved specs are clamped too. The
        // values mirror the engine's LABEL_FLOWS.top (mb by var reference so
        // density still decides the actual gap).
        if (spec.form && spec.form.type === 'survey') {
            this.tokens = {
                ...this.tokens,
                '--c-label-flow': 'column',
                '--c-label-basis': 'none',
                '--c-label-mb': 'var(--c-space-1)',
                '--c-label-gap': '0px',
                '--c-label-align': 'stretch'
            };
        }

        // Custom brand font: tokens only TYPESET the family — the @font-face
        // must be registered globally (CUSTOM_FONTS.md). Idempotent; also runs
        // for published specs since resolved tokens still name the family.
        const customFont =
            (spec.theme &&
                spec.theme.overrides &&
                spec.theme.overrides.customFont) ||
            (theme && theme.customFont) ||
            null;
        if (customFont) {
            ensureFont(customFont);
        }

        const layout = getLayout(spec.layout ? spec.layout.type : undefined);
        const module = await layout.load();
        if (seq !== this._applySeq) {
            return; // a newer spec landed while the primitive loaded
        }
        this.navCtor = module.default;
        // Capture after async theme/layout work: answers entered while it was
        // loading belong to this session too. Stale applies exit above.
        const preview = this.preservePreview ? this.getPreviewState() : null;
        // One question per screen (Design → Paging, surveys only): the split
        // rides paginating layouts — scroll has no paging machinery to ride.
        const onePerScreen = Boolean(
            spec.form &&
            spec.form.type === 'survey' &&
            spec.settings &&
            spec.settings.onePerScreen &&
            layout.paginates
        );
        this._onePerScreen = onePerScreen;
        const effectivePages = onePerScreen
            ? splitOnePerScreen(spec.pages || [])
            : spec.pages || [];
        // Same layout + page count (a live-preview retint/retitle) keeps the
        // visitor's place; anything structural restarts at page 1.
        const keepNav =
            preserveNav &&
            this.model &&
            this.model.pages.length === effectivePages.length &&
            this._appliedLayoutType === (spec.layout && spec.layout.type);
        if (!keepNav) {
            this.pageIndex = 0;
        }
        this._appliedLayoutType = spec.layout ? spec.layout.type : undefined;

        const header = spec.header || {};
        const hasLockup = Boolean(
            header.title ||
            header.description ||
            header.brandName ||
            (header.logo && header.logo.url) ||
            (header.highlight && header.highlight.text) ||
            // a banner alone still earns the band (owner 2026-07-18: surface
            // config must never silently paint nothing)
            (header.bgImage && header.bgImage.url)
        );
        const zonesDefault = (spec.layout && spec.layout.zonesDefault) || {};
        let options = (spec.layout && spec.layout.options) || {};
        if (onePerScreen && options.showStepCount === undefined) {
            // long flows are the NORM in split mode; without the counter a
            // 20-question stepper is unlabeled dots (reviewer 2026-07-31).
            // An explicit authored false still wins.
            options = { ...options, showStepCount: true };
        }
        // splitHero's brand pane replaces formHeader (registry: ownsHeader);
        // its Pane Flow = One at a Time also owns the advance, like oneAtATime.
        const ownsAdvance = Boolean(
            layout.ownsAdvance ||
            (layout.ownsHeader && options.paneFlow === 'oneAtATime')
        );

        // ownsHeader layouts: the pane IS the header (catalog §2). A spec with
        // no explicit pane config — every form the creation flow makes — must
        // render its header lockup IN the pane, never on the form side (owner
        // 2026-07-06: "header on the right" bug). Explicit pane config wins
        // untouched, and only then does the form side keep the minimal lockup.
        let paneLockup = null;
        // NOTE: no header.style gate here — the pane always shows its lockup.
        // 'none' can't be chosen on splitHero (control hidden 2026-07-18) and
        // a stale value set on another layout must not blank the pane.
        if (layout.ownsHeader) {
            // Surface mapping (sweep slice 3): the Banner image is header
            // surface, and on ownsHeader layouts the pane IS the header —
            // independent of the lockup mapping below.
            if (header.bgImage && header.bgImage.url) {
                options = { ...options, paneImage: header.bgImage };
            }
            const paneConfigured = Boolean(
                options.paneTitle ||
                options.paneSubtitle ||
                options.paneBrandName ||
                (options.paneLogo && options.paneLogo.url) ||
                (options.paneHighlight && options.paneHighlight.text)
            );
            if (!paneConfigured && hasLockup) {
                options = {
                    ...options,
                    paneTitle: header.title,
                    paneSubtitle: header.description,
                    paneBrandName: header.brandName,
                    paneLogo: header.logo,
                    paneHighlight: header.highlight
                };
            } else if (paneConfigured && (header.title || header.description)) {
                paneLockup = {
                    title: header.title,
                    description: header.description
                };
            }
        }
        // Any spec change resets the post-submit state — the Design preview
        // returns to the form the moment a control is touched.
        this.completed = false;
        this._applyAnswers(
            preview
                ? reconcileAnswers(preview.answers, preview.spec, spec)
                : {},
            ANSWER_ORIGIN.RESET,
            { replace: true }
        );
        // R6 — preservation mode must still CREATE a session when there is not
        // one yet. Studio sets preserve-session, so on the first mount this took
        // the reconcile branch with a null session, reconcile returned null
        // immediately, and the preview never got an Autofill session at all.
        // (The old call also passed `preview?.spec` — the OLD spec — as the
        // reconcile target; the engine takes exactly two arguments, so the new
        // spec in the third was silently dropped.)
        if (this.preservePreview && this._autofillSession) {
            this._autofillSession = reconcileAutofillSession(
                this._autofillSession,
                spec
            );
            this._dropCancelledAutofillRequests();
        } else {
            this._autofillSession = createAutofillSession({
                specVersionId: this.effectiveVersionId || null,
                rules: extractAutofillRules(spec),
                initialAnswers: this.answers
            });
        }
        const defaults = seedStaticDefaults(spec, this.answers);
        if (this._autofillSession) {
            this._autofillSession.staticDefaults = defaults;
        }
        let defaultsApplied = false;
        const seededAnswers = { ...this.answers };
        for (const [elId, defVal] of Object.entries(defaults)) {
            if (seededAnswers[elId] === undefined) {
                seededAnswers[elId] = defVal;
                defaultsApplied = true;
            }
        }
        if (defaultsApplied) {
            this._applyAnswers(seededAnswers, ANSWER_ORIGIN.HYDRATE, {
                replace: true
            });
        }
        this._revealed = [];
        this._submitError = undefined;
        this.submittedRecordId = null;
        this._startedAt = preview?.startedAt || new Date().toISOString();
        if (this.preservePreview) {
            this._previewSpec = spec;
            this._previewRevision += 1;
        }
        // Rule support (schema §7): one walk indexes element types for the
        // engine's date coercion and flags whether ANY rule exists — the
        // no-rules fast path skips per-keystroke filtering entirely.
        this._ruleTypeIndex = new Map();
        this._hasRules = false;
        this._hasValidation = false;
        for (const page of effectivePages) {
            if (page.visibility) {
                this._hasRules = true;
            }
            for (const section of page.sections || []) {
                if (section.visibility) {
                    this._hasRules = true;
                }
                for (const el of section.elements || []) {
                    if (el.visibility) {
                        this._hasRules = true;
                    }
                    if ((el.validation || []).length) {
                        this._hasValidation = true;
                    }
                    // render = publish-compiled; config = the draft-side hint
                    // the renderer itself reads (canvas writes config.inputType)
                    const input =
                        (el.render && el.render.inputType) ||
                        (el.config && el.config.inputType);
                    this._ruleTypeIndex.set(
                        el.id,
                        input === 'date' || input === 'datetime'
                            ? input
                            : el.type
                    );
                }
            }
        }
        this.model = {
            // RAW (may be undefined): pageFrame falls back to medium for the
            // carded panel, while bleed layouts keep their locked column
            // width unless the user chose explicitly (--frame-max).
            maxWidth: spec.layout && spec.layout.maxWidth,
            // After Submit config (owner FormBuilder port; SCHEMA §3
            // settings.completion) — rendered by c/finalAfterSubmit on
            // submit; redirect EXECUTION lands with P3.
            afterSubmit: (spec.settings && spec.settings.completion) || {},
            header:
                !layout.ownsHeader && header.style !== 'none' && hasLockup
                    ? header
                    : null,
            // Each page carries the layout's zonesDefault. (The per-page
            // sparse override was deleted 2026-07-18 — sweep DELETE ruling:
            // schema'd but no writer ever existed.)
            pages: effectivePages.map((page, i) => ({
                ...page,
                // Reveal identity: authored id / split key, else full-list
                // position. Reveal bookkeeping must never use the FILTERED
                // index — visibility rules renumber that list live and
                // index-keyed reveals drifted onto neighboring pages.
                revealKey: page.id || page.key || `pg_${i}`,
                zones: { ...zonesDefault }
            })),
            submit: spec.submit || {},
            // Action-row arrangement (LAYOUT_REFINEMENTS §3): form override wins,
            // else the layout's registry default, else split. Honored by the
            // shared submitBar AND oneAtATime's own action row.
            buttonArrangement:
                (spec.submit && spec.submit.buttonArrangement) ||
                layout.buttonArrangement ||
                'split',
            layoutOptions: options,
            paginates: Boolean(layout.paginates),
            ownsAdvance,
            // Immersive full-bleed: only bleed-capable layouts (splitHero,
            // oneAtATime), ON by default, reverted with fullBleed === false —
            // the toggle restores the carded render exactly.
            bleed: Boolean(layout.bleed) && options.fullBleed !== false,
            // Only set when the spec configures the pane EXPLICITLY (above) —
            // then the form side keeps a minimal title lockup for context.
            paneLockup
        };
        this.error = undefined;
        this._prepareEditMode(spec, true);
        this._executeLookupRulesFromAnswers();

        if (preview) {
            this.pageIndex = restorePage(
                this.visiblePages,
                preview.anchor,
                preview.pageIndex
            );
        }
        if (this.preservePreview) {
            this.dispatchEvent(new CustomEvent('previewready'));
        }

        // Survey-object record context (SURVEY_OBJECT_SPEC + V2 SO-3): one
        // round trip seeds mapped-question prefill AND freezes record-rule
        // verdicts. Authenticated renders only — authoring previews simulate,
        // guests (delegateSubmit) wait for SO-4 tokens. _recordCtx doubles as
        // the payload flag.
        this._recordCtx = null;
        this._ruleFacts = null;
        const rid = this._resolveRecordInput(this._surveyInput);
        this._surveyContextKey = this._surveyKey();
        this._surveyLoading = false;
        if (
            spec.form?.type === 'survey' &&
            this._surveyInput &&
            !rid &&
            !this.authoring &&
            !this.preservePreview &&
            !this.delegateSubmit
        ) {
            this.error =
                'Survey context needs a valid record ID. The configured current-record expression requires a record page.';
            this.model = null;
            return;
        }
        if (
            rid &&
            !this.authoring &&
            !this.preservePreview &&
            !this.delegateSubmit &&
            spec.form &&
            spec.form.type === 'survey' &&
            spec.form.targetObject &&
            (specHasMappings(spec) || specHasRecordRules(spec))
        ) {
            this._recordCtx = rid;
            this._surveyLoading = true;
            getRecordContext({
                versionId: this.effectiveVersionId || null,
                formId: this.effectiveFormId || null,
                recordId: rid
            })
                .then((res) => {
                    if (seq !== this._applySeq || !this.isConnected) {
                        return;
                    }
                    // Clearing this is what re-enables Submit. Only the catch
                    // used to do it, so a survey whose record context loaded
                    // SUCCESSFULLY stayed blocked forever — the failure path
                    // recovered and the happy path did not. Caught in a
                    // browser 2026-09-09; 843 green tests did not see it.
                    this._surveyLoading = false;
                    // REASSIGN, never mutate — facts feed render getters
                    this._ruleFacts = res.ruleFacts || null;
                    const values = res.prefill || {};
                    const merged = { ...this.answers };
                    let any = false;
                    for (const k of Object.keys(values)) {
                        if (merged[k] === undefined) {
                            merged[k] = values[k];
                            any = true;
                        }
                    }
                    if (any) {
                        this._applyAnswers(merged, ANSWER_ORIGIN.HYDRATE, {
                            replace: true
                        });
                    }
                })
                .catch(() => {
                    if (seq !== this._applySeq || !this.isConnected) return;
                    this._surveyLoading = false;
                    // best-effort: an unreadable record must never block the
                    // survey itself from rendering — record rules read "no
                    // match" exactly like a plain no-context link
                });
        }
        // SO-4 guest path: re-seed any injected record context. The guest host
        // owns the Apex fetch (the viewer never calls survey-object Apex on a
        // delegated submit); it feeds verdicts + opted prefill in via the
        // `recordContext` property. Runs after the reset above so a spec
        // re-apply can't wipe it.
        this._applyInjectedContext();
    }

    /**
     * SO-4: record context injected by the guest host ({ruleFacts, prefill}).
     * Guests can't call FinalSurveyObjectController; the host resolves the URL
     * token server-side and hands the verdicts + author-opted prefill here.
     */
    @api
    get recordContext() {
        return this._injectedCtx;
    }
    set recordContext(value) {
        this._injectedCtx = value;
        this._applyInjectedContext();
    }

    /**
     * R4 — the authenticated Autofill plan from FinalAutofillController.
     *
     * A logged-in respondent reads source records through LDS with their OWN
     * access, so they need the source object and field API names. The guest
     * projection deliberately strips those (an anonymous client must never see
     * them), which left a logged-in customer on the public host with rules that
     * carried destination ids only — `_handleSourceLookupChange` could never
     * match a source element, so lookup Autofill silently did nothing.
     *
     * Shape: { versionId, lookups: [{elementId, objectApiName}], rules: [...] }.
     * The server validated every name against the authorized published version,
     * so this upgrades the session rather than being merely trusted decoration.
     */
    @api
    get autofillPlan() {
        return this._autofillPlan;
    }
    set autofillPlan(value) {
        this._autofillPlan = value;
        this._applyAutofillPlan();
    }

    _autofillPlan;
    /** elementId → source object, for rendering the picker and reading via LDS. */
    _lookupObjects = {};

    _applyAutofillPlan() {
        const plan = this._autofillPlan;
        if (!plan || !this._autofillSession) {
            return;
        }
        // A plan for a different published version must never be applied — the
        // element ids it names may not mean the same thing here.
        if (
            plan.versionId &&
            this._autofillSession.specVersionId &&
            plan.versionId !== this._autofillSession.specVersionId
        ) {
            return;
        }

        const objects = {};
        for (const l of plan.lookups || []) {
            if (l && l.elementId && l.objectApiName) {
                objects[l.elementId] = l.objectApiName;
            }
        }
        this._lookupObjects = objects;

        // Upgrade each projected rule with the source identity and real field
        // names the plan supplies. Destinations still come from the rule the
        // runtime already had.
        const byId = new Map(
            (plan.rules || [])
                .filter((r) => r && r.ruleId)
                .map((r) => [r.ruleId, r])
        );
        const upgraded = (this._autofillSession.rules || []).map((rule) => {
            const p = byId.get(rule.id);
            if (!p) {
                return rule;
            }
            return {
                ...rule,
                policy: p.policy || rule.policy,
                source: {
                    ...(rule.source || {}),
                    type: 'lookup',
                    elementId: p.sourceElementId,
                    objectApiName: p.objectApiName
                },
                mappings: Array.isArray(p.mappings) ? p.mappings : rule.mappings
            };
        });
        this._autofillSession.rules = upgraded;
        // The fingerprint guards request identity, so it must move with the
        // rules or a later result would be judged against a stale contract.
        this._autofillSession.rulesFingerprint =
            computeRulesFingerprint(upgraded);

        // A restored or pre-selected lookup answer must fire without waiting for
        // a DOM change event (§6 initialization order).
        this._executeLookupRulesFromAnswers();
    }

    /**
     * Edit mode setup (IMPL_PLAN_RECORD_PAGE_EDIT Slice 2).
     *
     * An explicit edit target requires a successful read before saving;
     * an unresolved expression is an explicit blocked state. The exclusions are deliberate:
     * noise: the STUDIO PREVIEW and authoring canvas must never load — or
     * later save over — a real customer record, and `delegateSubmit` is the
     * guest host, which the server refuses for update specs anyway.
     */
    _requiresEditRecord(spec) {
        return (
            Boolean(this._existingInput) &&
            spec?.form &&
            spec.form.type !== 'survey' &&
            !this.authoring &&
            !this.preservePreview &&
            !this.delegateSubmit
        );
    }

    _prepareEditMode(spec, force = false) {
        const form = spec.form || {};
        const rid = this._resolveRecordInput(this._existingInput);
        if (!this._requiresEditRecord(spec)) {
            const wasEditing = this._editContextKey;
            this._editGeneration += 1;
            this._editConfigurationError = null;
            this._editState = 'inactive';
            this._editRecordId = null;
            this._editContextKey = null;
            this._editReaders = [];
            if (wasEditing && !force) {
                this.model = null;
                this._applyAnswers({}, ANSWER_ORIGIN.RESET, { replace: true });
                clearTimeout(this._redirectTimer);
                this._apply(spec);
            }
            return;
        }
        const key = JSON.stringify([
            this.effectiveFormId,
            this.effectiveVersionId,
            rid,
            this._existingInput,
            form.targetObject,
            this.objectApiName
        ]);
        if (!force && key === this._editContextKey) return;
        const switching = this._editContextKey && key !== this._editContextKey;
        this._editContextKey = key;
        this._editGeneration += 1;
        this._submitGeneration += 1;
        this._submitting = false;
        this._editReaders = [];
        this._editConfigurationError = null;
        this._editState = rid ? 'loading' : 'missingRecord';
        this._editRecordId = rid;
        this._editObject = form.targetObject;
        clearTimeout(this._redirectTimer);
        for (const timer of this._autofillTimers.values()) clearTimeout(timer);
        this._autofillTimers.clear();
        this.activeAutofillRequests = [];
        this._autofillSession = createAutofillSession({
            specVersionId: this.effectiveVersionId || null,
            rules: extractAutofillRules(spec)
        });
        const defaults = seedStaticDefaults(spec);
        this._autofillSession.staticDefaults = defaults;
        this._applyAnswers(defaults, ANSWER_ORIGIN.RESET, { replace: true });
        if (switching) this._injectedCtx = null;
        this._ruleFacts = null;
        this._recordCtx = null;
        this._revealed = [];
        this.pageIndex = 0;
        this.completed = false;
        this.submittedRecordId = null;
        this._submitError = undefined;
        this._startedAt = new Date().toISOString();
        // Revision baseline belongs to the record session, not each retry.
        this._editStartedRevisions = {};

        // Same walk the server does: only elements the SPEC binds, and repeat
        // sections skipped (an edit form may not contain one — owner D2).
        const pairs = [];
        const fields = new Set();
        for (const page of spec.pages || []) {
            for (const section of page.sections || []) {
                if (section.repeat) {
                    continue;
                }
                for (const el of section.elements || []) {
                    const field = el && el.binding && el.binding.field;
                    if (!field || !el.id) {
                        continue;
                    }
                    pairs.push({ elementId: el.id, field });
                    fields.add(field);
                }
            }
        }
        this._editFields = Array.from(fields);
        this._editFieldByElement = pairs;
        const hasRepeats = (spec.pages || []).some((page) =>
            (page.sections || []).some((section) => section.repeat)
        );
        const pageObject =
            this.objectApiName || this._pageRef?.attributes?.objectApiName;
        if (hasRepeats) {
            this._editConfigurationError =
                'Editing an existing record is not supported for forms with repeating sections.';
        } else if (
            this._isPageRecordExpression(this._existingInput) &&
            pageObject &&
            form.targetObject &&
            pageObject !== form.targetObject
        ) {
            this._editConfigurationError = `This form saves to ${form.targetObject}, but the current page is for ${pageObject}.`;
        }
        if (this._editConfigurationError) this._editState = 'error';
        else if (rid && form.targetObject) this._beginEditRead();
        else if (rid) this._editState = 'error';
    }

    _beginEditRead() {
        this._editGeneration += 1;
        this._editState = 'loading';
        this._editReaders = [
            {
                key: this._editGeneration,
                generation: this._editGeneration,
                sessionId: this._autofillSession.sessionId,
                recordId: this._editRecordId,
                objectApiName: this._editObject,
                fields: this._editFields
            }
        ];
    }

    get isEditBlocked() {
        return this._editState !== 'inactive' && this._editState !== 'ready';
    }

    get isSubmitBlocked() {
        return (
            this.isEditBlocked ||
            this._surveyLoading ||
            this.isAutofillPending ||
            this._submitting
        );
    }

    get isEditLoading() {
        return this._editState === 'loading';
    }
    get canRetryEdit() {
        return this._editState === 'error' && !this._editConfigurationError;
    }
    get editError() {
        if (this._editConfigurationError) return this._editConfigurationError;
        if (this._editState === 'missingRecord')
            return 'This form needs a valid existing record ID. A current-record expression requires a record page.';
        if (this._editState === 'error')
            return 'Could not load this record. Retry to continue.';
        return null;
    }

    _isCurrentEditResponse(detail) {
        return (
            this.isConnected &&
            this._editState === 'loading' &&
            detail?.recordId === this._editRecordId &&
            detail.generation === this._editGeneration &&
            detail.sessionId === this._autofillSession?.sessionId
        );
    }

    handleEditRecordError(event) {
        if (!this._isCurrentEditResponse(event.detail)) return;
        this._editState = 'error';
    }

    async handleEditRetry() {
        if (!this.canRetryEdit) return;
        const generation = ++this._editGeneration;
        this._editState = 'loading';
        try {
            // Refresh LDS before remounting; remount alone can replay a cached failure.
            await notifyRecordUpdateAvailable([
                { recordId: this._editRecordId }
            ]);
            if (generation !== this._editGeneration || !this.isConnected)
                return;
            this._beginEditRead();
        } catch {
            if (generation === this._editGeneration && this.isConnected)
                this._editState = 'error';
        }
    }

    /**
     * Seeds the form from the record being edited. Runs ONCE — re-seeding
     * after the respondent has started typing would silently undo their work
     * every time LDS refreshed the record.
     *
     * A field present but null is written as null on purpose: on an edit form
     * the record is the truth, so an empty field on the record must show empty
     * rather than keep a static default. A field ABSENT from the payload was
     * unreadable to this user, and is left alone.
     */
    handleEditRecordLoad(event) {
        if (!this._isCurrentEditResponse(event.detail)) return;
        const values = (event.detail && event.detail.values) || {};
        const patch = {};
        for (const pair of this._editFieldByElement) {
            const revision =
                this._autofillSession.editRevision[pair.elementId] || 0;
            if (
                revision ===
                    (this._editStartedRevisions[pair.elementId] || 0) &&
                Object.prototype.hasOwnProperty.call(values, pair.field)
            ) {
                const v = values[pair.field];
                patch[pair.elementId] = v === undefined ? null : v;
            }
        }
        // Loading the record being edited is hydration, not a respondent
        // filling the form in one field at a time.
        this._applyAnswers(patch, ANSWER_ORIGIN.HYDRATE);
        this._editState = 'ready';
        this._applyInjectedContext();
        this._executeLookupRulesFromAnswers();
    }

    _applyInjectedContext() {
        const ctx = this._injectedCtx;
        if (!this.model || this.isEditBlocked) {
            return;
        }
        // R6 — a null context must actually REMOVE what Autofill applied.
        // "Clear test data" sets recordContext to null, and this returned early,
        // leaving the test values sitting in the preview.
        if (!ctx) {
            this._ruleFacts = null;
            this._clearInjectedAutofill();
            return;
        }
        this._ruleFacts = ctx.ruleFacts || null;
        const values = ctx.prefill || {};
        const merged = { ...this.answers };
        let any = false;
        for (const k of Object.keys(values)) {
            if (merged[k] === undefined) {
                merged[k] = values[k];
                any = true;
            }
        }
        if (any) {
            this._applyAnswers(merged, ANSWER_ORIGIN.HYDRATE, {
                replace: true
            });
        }

        // Autofill rules from guest context or injected link context
        if (Array.isArray(ctx.autofill) && this._autofillSession) {
            for (const item of ctx.autofill) {
                if (!item || !item.ruleId || !item.values) {
                    continue;
                }
                const { requestIdentity } = onSourceChanged(
                    this._autofillSession,
                    item.ruleId,
                    'injected_link'
                );
                if (requestIdentity) {
                    const res = onResult(
                        this._autofillSession,
                        requestIdentity,
                        this._toSourceKeyed(item.ruleId, item.values),
                        this.answers,
                        true // isInitialLinkLoad
                    );
                    if (
                        res.applied &&
                        res.patch &&
                        Object.keys(res.patch).length > 0
                    ) {
                        this._applyAutofillPatch(res.patch);
                    }
                }
            }
        }
    }

    /**
     * R6 — injected contexts speak DESTINATION ids; the engine speaks SOURCE
     * field names.
     *
     * Both injection paths (the guest server's `autofill[].values` and the
     * Studio panel's test values) are keyed by element id, but `onResult` looks
     * each mapping up by `mapping.from`. For `{ from:'Email', to:'el_email' }`
     * a payload of `{ el_email: '…' }` therefore matched nothing and produced an
     * empty patch. LDS results arrive already source-keyed on a different path
     * (handleAutofillRecordSuccess) and must NOT be run through this.
     *
     * Only keys actually present are copied, which keeps "omitted" (unreadable)
     * distinct from an explicit null.
     *
     * A GUEST rule has no `from` at all. The guest projection strips source
     * field names on purpose, so `extractAutofillRules` rebuilds its mappings
     * from `destinationElementIds` as `{ to }` only. Keying on a bare `m.from`
     * therefore wrote every value to the single key `undefined`, and `onResult`
     * — which resolves its lookup key as `mapping.from || destId` — went looking
     * for `el_fn` and found nothing, so a personalized link filled NOTHING for
     * an anonymous respondent. Falling back to `m.to` here is the same identity
     * `onResult` already assumes; org-verified on the guest site 2026-09-07.
     */
    _toSourceKeyed(ruleId, values) {
        const rule = (this._autofillSession?.rules || []).find(
            (r) => r.id === ruleId
        );
        if (!rule || !values) {
            return {};
        }
        const out = {};
        for (const m of rule.mappings || []) {
            if (
                m &&
                m.to &&
                Object.prototype.hasOwnProperty.call(values, m.to)
            ) {
                out[m.from || m.to] = values[m.to];
            }
        }
        return out;
    }

    /** Clears values still owned by an injected (link or test) source. Manual
     *  edits are preserved — onSourceChanged only releases what Autofill owns. */
    _clearInjectedAutofill() {
        const session = this._autofillSession;
        if (!session) {
            return;
        }
        const patch = {};
        for (const rule of session.rules || []) {
            const req = session.requests?.[rule.id];
            if (!req || req.sourceKey !== 'injected_link') {
                continue;
            }
            const { clearedPatch } = onSourceChanged(session, rule.id, null);
            Object.assign(patch, clearedPatch);
        }
        if (Object.keys(patch).length > 0) {
            this._applyAutofillPatch(patch);
        }
    }

    _ruleCtx() {
        return {
            getValue: (id) => this.answers[id],
            getType: (id) => this._ruleTypeIndex.get(id),
            // SO-3: server-frozen record-rule verdicts (null = no context)
            getRecordFacts: () => this._ruleFacts
        };
    }

    /** The nav renders VISIBLE pages only — rules filter all three levels
     *  live against the answers, REVEALED pages carry their elements'
     *  validation failures inline (`el.errors`), and EVERY element is
     *  hydrated with its live answer. Hydration must never be skipped: the
     *  old no-rules fast path returned raw model pages, so native inputs
     *  remounted BLANK after Back on plain forms (ext audit 2026-08-02,
     *  org-repro'd) — only filtering and error work are gated now. */
    get visiblePages() {
        if (!this.model) {
            return [];
        }
        const needErrors =
            this._hasValidation && (this._revealed || []).length > 0;
        const ctx = this._ruleCtx();
        let pages = this.model.pages;
        if (this._hasRules) {
            pages = pages.filter((page) =>
                evaluateVisibility(page.visibility, ctx)
            );
            if (this._onePerScreen) {
                // One-per-screen: a rule-hidden question must not leave a
                // blank screen — virtual pages whose only element (or whole
                // section) is hidden drop out HERE, so the nav never pages
                // onto an empty screen. (Reveals key by page identity, not
                // position, so this renumbering can't misplace errors.)
                // Repeaters never split; section visibility is their check.
                pages = pages.filter((page) =>
                    (page.sections || []).some(
                        (s) =>
                            evaluateVisibility(s.visibility, ctx) &&
                            (s.repeat ||
                                (s.elements || []).some((el) =>
                                    evaluateVisibility(el.visibility, ctx)
                                ))
                    )
                );
            }
        }
        return pages.map((page) => {
            const reveal =
                needErrors && this._revealed.includes(page.revealKey);
            return {
                ...page,
                sections: (page.sections || [])
                    .filter(
                        (s) =>
                            !this._hasRules ||
                            evaluateVisibility(s.visibility, ctx)
                    )
                    .map((s) => ({
                        ...s,
                        ...(this.preservePreview
                            ? {
                                  previewEntries:
                                      this.answers[`repeat:${s.id}`] || [],
                                  previewRevision: this._previewRevision
                              }
                            : {}),
                        elements: (s.elements || [])
                            .filter(
                                (el) =>
                                    !this._hasRules ||
                                    evaluateVisibility(el.visibility, ctx)
                            )
                            .map((el) => {
                                // hydrate the element with its live answer —
                                // stateful widgets (S2 scale family) repaint
                                // their selection from el.value after any
                                // model rebuild; native inputs ignore it
                                const answered = this.answers[el.id];
                                let base =
                                    answered !== undefined && !s.repeat
                                        ? { ...el, value: answered }
                                        : el;
                                // R4 — on the guest host the projection strips
                                // bindings, so a lookup element arrives with no
                                // target object and the picker cannot render.
                                // The server-validated plan supplies it.
                                const planObject = this._lookupObjects[el.id];
                                if (planObject && !base.config?.referenceTo) {
                                    base = {
                                        ...base,
                                        config: {
                                            ...(base.config || {}),
                                            referenceTo: planObject
                                        }
                                    };
                                }
                                // A filtered lookup carries its COMPILED
                                // filter, not its authored one: the criteria
                                // are resolved against the answers as they
                                // stand right now. `lookupGeneration` is the
                                // stamp the adapter checks a selection
                                // against, because a native event carries no
                                // request identity of its own.
                                const lookupState = this._lookupStateFor(el.id);
                                if (lookupState) {
                                    base = { ...base, ...lookupState };
                                }
                                if (this.preservePreview) {
                                    base = {
                                        ...base,
                                        value: s.repeat ? undefined : answered,
                                        previewRevision: this._previewRevision
                                    };
                                }
                                // repeat entries answer as ONE consolidated
                                // value — per-entry failure display is
                                // DEFERRED, so never annotate inside
                                // Server rejections bypass the reveal gate:
                                // the respondent has already submitted, so
                                // there is nothing left to "reveal", and a
                                // form with no client validation at all must
                                // still be able to show what the save refused.
                                const fromServer =
                                    this._serverFieldErrors[el.id] || [];
                                if (!reveal || s.repeat) {
                                    return fromServer.length
                                        ? { ...base, errors: fromServer }
                                        : base;
                                }
                                const errors = [
                                    ...validateElement(
                                        base,
                                        this.answers[el.id],
                                        ctx
                                    ),
                                    ...fromServer
                                ];
                                return errors.length
                                    ? { ...base, errors }
                                    : base;
                            })
                    }))
            };
        });
    }

    handleElementClick(event) {
        event.stopPropagation(); // the announcement ends at the viewer
        if (!this.authoring || !event.detail || !event.detail.elementId) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('elementselect', {
                detail: { elementId: event.detail.elementId }
            })
        );
    }

    handleValueChange(event) {
        const { elementId, value } = event.detail;
        // A server rejection describes the value that was SENT. The moment the
        // respondent changes that field the message is about something that no
        // longer exists, so it goes — otherwise they fix the field and the
        // complaint stays on screen.
        if (this._serverFieldErrors[elementId]) {
            const next = { ...this._serverFieldErrors };
            delete next[elementId];
            this._serverFieldErrors = next;
        }
        if (this._autofillSession) {
            onManualEdit(this._autofillSession, elementId, value);
        }
        this._applyAnswers({ [elementId]: value }, ANSWER_ORIGIN.USER);
        this._handleSourceLookupChange(elementId, value);
    }

    get lastPageIndex() {
        return this.model ? this.visiblePages.length - 1 : 0;
    }

    /**
     * Per-page validity — the engine's truth the primitives render gating
     * from (F8): a page is valid when every visible element on it passes its
     * validation entries against the current answers. Specs without
     * validation are all-valid without recompute.
     */
    get pageValidity() {
        if (!this.model) {
            return [];
        }
        if (!this._hasValidation) {
            return this.visiblePages.map(() => true);
        }
        const ctx = this._ruleCtx();
        // repeat sections validate server/entry-side (DEFERRED per-entry
        // gating) — their child elements never read the flat answers store
        return this.visiblePages.map((page) =>
            (page.sections || [])
                .filter((s) => !s.repeat)
                .every((s) =>
                    (s.elements || []).every(
                        (el) =>
                            validateElement(el, this.answers[el.id], ctx)
                                .length === 0
                    )
                )
        );
    }

    get showBack() {
        return (
            this.model &&
            this.model.paginates &&
            !this.model.ownsAdvance &&
            this.pageIndex > 0
        );
    }

    get showNext() {
        return (
            this.model &&
            this.model.paginates &&
            !this.model.ownsAdvance &&
            this.pageIndex < this.lastPageIndex
        );
    }

    /** Submit ONLY on the final page (BUILD_PHASES checklist #1). */
    get showSubmit() {
        return (
            this.model &&
            (!this.model.paginates || this.pageIndex === this.lastPageIndex)
        );
    }

    handlePageChange(event) {
        const index = event.detail ? event.detail.index : undefined;
        if (
            typeof index === 'number' &&
            index >= 0 &&
            index <= this.lastPageIndex
        ) {
            this.pageIndex = index;
        }
    }

    /** A blocked advance shows the page's failures (before that, a
     *  half-typed form stays quiet); they live-update as answers change.
     *  Stored as page revealKeys, not indexes — a rule hiding an earlier
     *  page renumbers the visible list, and an index reveal would decorate
     *  whichever page inherited the position. */
    _reveal(pageIndex) {
        const page = this.visiblePages[pageIndex];
        const key = page ? page.revealKey : undefined;
        if (key !== undefined && !this._revealed.includes(key)) {
            this._revealed = [...this._revealed, key];
        }
    }

    handleNext() {
        // F8 advance-denial: an invalid page refuses Next and shows why.
        if (this.pageValidity[this.pageIndex] === false) {
            this._reveal(this.pageIndex);
            return;
        }
        if (this.pageIndex < this.lastPageIndex) {
            this.pageIndex += 1;
        }
    }

    handleBack() {
        if (this.pageIndex > 0) {
            this.pageIndex -= 1;
        }
    }

    /** ownsAdvance primitives deny their own forward moves (same F8 rule)
     *  and announce the blocked page — the viewer reveals its failures. */
    handleAdvanceBlocked(event) {
        const index = event.detail ? event.detail.pageIndex : undefined;
        this._reveal(typeof index === 'number' ? index : this.pageIndex);
    }

    /**
     * Server rejection -> the exact field that failed.
     *
     * The old build did this and the rebuild lost it: every save failure
     * collapsed into one sentence, so a validation rule on a single field told
     * the respondent nothing about which field, or which page it was on.
     *
     * `fields` comes from `DmlException.getDmlFields`, which is already the API
     * names the spec binds, so mapping is a straight lookup. Anything the
     * server blames on no field we render — an object-level or cross-field
     * rule — has nowhere to land and stays by the Save button.
     */
    /**
     * Field identity, normalised — because `DmlException.getDmlFieldNames`
     * does NOT answer consistently, and this cost a false-green Apex test:
     *
     *   anonymous Apex / Apex test  ->  "LastName"    (API name)
     *   live LWC request            ->  "Last Name"   (the LABEL)
     *
     * Verified in this org 2026-09-09 on the same failing insert. A test that
     * asserts the API name therefore passes while the real submit maps
     * nothing. Lowercasing, dropping a `__c`/`__r` suffix and stripping every
     * non-alphanumeric collapses both spellings — and collapses a custom
     * field's API name onto its label too (`Applicant_Name__c` and
     * `Applicant Name` both become `applicantname`).
     */
    _normalizeFieldKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/__(c|r)$/, '')
            .replace(/[^a-z0-9]/g, '');
    }

    _applyServerErrors(errors) {
        const byField = new Map();
        const index = (key, id) => {
            if (!key) {
                return;
            }
            if (!byField.has(key)) {
                byField.set(key, []);
            }
            if (!byField.get(key).includes(id)) {
                byField.get(key).push(id);
            }
        };
        for (const page of (this._editSpec && this._editSpec.pages) || []) {
            for (const section of page.sections || []) {
                for (const el of section.elements || []) {
                    if (!el || !el.id) {
                        continue;
                    }
                    // A classic form BINDS a field; a survey question MAPS one
                    // (`el.mapping`) for writeback onto the connected record.
                    // Both reach real Salesforce fields and both can be
                    // rejected, so both are indexed — routing built only on
                    // `binding` was blind to every survey.
                    const field =
                        (el.binding && el.binding.field) ||
                        (el.mapping && el.mapping.field);
                    if (!field) {
                        continue;
                    }
                    // Indexed under BOTH the API name and the element's own
                    // wording, because the platform does not answer
                    // consistently — see `_normalizeFieldKey`.
                    index(this._normalizeFieldKey(field), el.id);
                    index(this._normalizeFieldKey(el.label), el.id);
                    index(this._normalizeFieldKey(el.title), el.id);
                }
            }
        }

        const mapped = {};
        const unmapped = [];
        for (const err of errors) {
            const message = (err && err.message) || 'This answer was rejected.';
            const targets = [];
            for (const field of (err && err.fields) || []) {
                for (const id of byField.get(this._normalizeFieldKey(field)) ||
                    []) {
                    targets.push(id);
                }
            }
            if (!targets.length) {
                unmapped.push(message);
                continue;
            }
            for (const id of targets) {
                if (!mapped[id]) {
                    mapped[id] = [];
                }
                mapped[id].push(message);
            }
        }

        this._serverFieldErrors = mapped;
        const anyField = Object.keys(mapped).length > 0;
        // Something ALWAYS shows next to Save, even when every message also
        // landed on a field — the respondent pressed a button there and needs
        // an answer there.
        this._submitError = unmapped.length
            ? unmapped.join(' ')
            : anyField
              ? 'Some answers were not accepted. See the highlighted fields.'
              : 'Your response could not be saved. Please try again.';

        // Land them on the first page that actually has a problem; a message
        // on a page they cannot see is no message at all.
        const pages = this.visiblePages;
        const bad = pages.findIndex((page) =>
            (page.sections || []).some((section) =>
                (section.elements || []).some(
                    (el) => el.errors && el.errors.length
                )
            )
        );
        if (bad >= 0) {
            this.pageIndex = bad;
            this._reveal(bad);
        }
    }

    async handleSubmit() {
        if (!this.model || this.error || this.isSubmitBlocked) return;
        // Submit validates EVERY visible page; the first invalid one becomes
        // the current page with its failures shown.
        const validity = this.pageValidity;
        const firstInvalid = validity.findIndex((ok) => ok === false);
        if (firstInvalid >= 0) {
            this.pageIndex = firstInvalid;
            this._reveal(firstInvalid);
            return;
        }
        if (this._submitting || this.isAutofillPending) {
            return; // one click, one record / wait for autofill to finish
        }
        // Delegated submit (guest host): validation passed — hand the payload
        // to the host, which owns the guest Apex call. MUST precede the
        // inline-spec simulate below, because the host feeds the viewer an
        // inline spec.
        if (this.delegateSubmit) {
            this._submitting = true;
            this._submitError = undefined;
            this.dispatchEvent(
                new CustomEvent('submitrequest', {
                    detail: { payload: this._payload() }
                })
            );
            return;
        }
        // Previews SIMULATE: the studio's authoring/inline specs (and the
        // read-only history view) must never create records.
        if (this.authoring || this._inlineSpec) {
            this.completed = true;
            return;
        }
        this._submitting = true;
        this._submitError = undefined;
        this._serverFieldErrors = {};
        const submitGeneration = ++this._submitGeneration;
        try {
            const res = await submitForm({
                formId: this.effectiveFormId || null,
                versionId: this.effectiveVersionId || null,
                payloadJson: JSON.stringify(this._payload())
            });
            if (submitGeneration !== this._submitGeneration) return;
            if (res && res.errors && res.errors.length) {
                this._applyServerErrors(res.errors);
                return;
            }
            this.submittedRecordId = res ? res.recordId : null;
            this.completed = true;
            this._scheduleCompletion();
        } catch (e) {
            // A failure that belongs to a record the respondent has already
            // navigated away from cannot be shown on the form now on screen —
            // that form belongs to a different record, and annotating it would
            // blame the wrong one. It is dropped deliberately.
            //
            // This previously raised a sticky `lightning/toast`. Removed
            // 2026-09-09 (owner): that module is used by NOTHING else in this
            // codebase — the other seven components use ShowToastEvent — and
            // its rendering on a Lightning record page was never proven, so
            // the notice may never have appeared at all. Saving already shows
            // a spinner on the submit bar and reports failures inline next to
            // Save, which is where an error belongs.
            if (submitGeneration !== this._submitGeneration) {
                return;
            }
            this._submitError =
                (e && e.body && e.body.message) ||
                'Your response could not be saved. Please try again.';
        } finally {
            if (submitGeneration === this._submitGeneration)
                this._submitting = false;
        }
    }

    /**
     * Host resolved the delegated submit successfully (Phase A2). Shows the
     * After-Submit surface. Guests get NO record id, so the record redirect in
     * `_navigate` no-ops by construction — only a `redirectTo='url'` completion
     * navigates.
     */
    @api
    completeSubmit() {
        this._submitting = false;
        this.submittedRecordId = null;
        this.completed = true;
        this._scheduleCompletion();
    }

    /** Host's delegated submit failed: surface the message and allow retry
     *  (the submit guard is released). */
    @api
    failSubmit(message) {
        this._submitting = false;
        this._submitError =
            message || 'Your response could not be saved. Please try again.';
    }

    /** Schema §8: answers keyed by element id; repeat sections answer as
     *  ONE consolidated `repeat:{sectionId}` entry → the repeats map; file
     *  answers lift OUT of `answers` into the top-level `files` array, since
     *  they become ContentVersion records rather than a field on the target
     *  object. `files` is omitted entirely when nothing was attached. */
    _payload() {
        const answers = {};
        const repeats = {};
        const files = [];
        for (const key of Object.keys(this.answers)) {
            if (key.indexOf('repeat:') === 0) {
                repeats[key.slice(7)] = this.answers[key];
            } else if (this._ruleTypeIndex.get(key) === 'file') {
                for (const f of this.answers[key] || []) {
                    if (f && f.base64) {
                        files.push({
                            elementId: key,
                            name: f.name,
                            base64: f.base64
                        });
                    }
                }
            } else {
                answers[key] = this.answers[key];
            }
        }
        const meta = {
            startedAt: this._startedAt,
            submittedAt: new Date().toISOString()
        };
        if (this._recordCtx) {
            // survey-object writeback context — server re-validates the type
            // and walks the SPEC for mappings; never guest (guard in _apply)
            meta.recordId = this._recordCtx;
        } else if (this._editRecordId) {
            // The explicit edit target selects update. Apex validates its
            // object and enforces the running user's access.
            meta.existingRecordId = this._editRecordId;
        }
        const payload = { answers, repeats, meta };
        if (files.length) {
            payload.files = files;
        }
        return payload;
    }

    // ----- After Submit EXECUTION (settings.completion — display is
    // c/finalAfterSubmit's; navigation is ours) -----

    _scheduleCompletion() {
        const c = (this.model && this.model.afterSubmit) || {};
        if (c.mode === 'toast') {
            // toast ALWAYS redirects (schema §3) — a beat to read the bar
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._redirectTimer = setTimeout(
                () => this._navigate(c.redirectTo, c.redirectUrl),
                1500
            );
            return;
        }
        if (c.autoRedirect) {
            const delay = Number(c.redirectDelay);
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._redirectTimer = setTimeout(
                () => this._navigate(c.redirectTo, c.redirectUrl),
                (Number.isFinite(delay) && delay >= 0 ? delay : 5) * 1000
            );
        }
    }

    handleAfterContinue(event) {
        const { goesTo, url } = event.detail || {};
        this._navigate(goesTo, url);
    }

    _navigate(dest, url) {
        if (dest === 'url' && url) {
            window.location.assign(url);
            return;
        }
        if (this.submittedRecordId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.submittedRecordId,
                    actionName: 'view'
                }
            });
        }
    }

    // ----- Autofill Runtime (IMPL_PLAN_AUTOFILL_RULES §6) -----

    get isAutofillPending() {
        return (this.activeAutofillRequests || []).length > 0;
    }

    get effectiveSubmitConfig() {
        const base = (this.model && this.model.submit) || {};
        if (this.isAutofillPending) {
            return {
                ...base,
                label: 'Finishing Autofill…'
            };
        }
        return base;
    }

    get effectiveSubmitLabel() {
        if (this.isAutofillPending) {
            return 'Finishing Autofill…';
        }
        return (
            (this.model && this.model.submit && this.model.submit.label) ||
            'Submit'
        );
    }

    _executeLookupRulesFromAnswers() {
        if (this.isEditBlocked) return;
        if (!this._autofillSession || !this._autofillSession.rules) {
            return;
        }
        for (const rule of this._autofillSession.rules) {
            if (rule.source?.type === 'lookup' && rule.source?.elementId) {
                const val = this.answers[rule.source.elementId];
                if (val) {
                    this._handleSourceLookupChange(rule.source.elementId, val);
                }
            }
        }
    }

    _handleSourceLookupChange(elementId, value) {
        if (this.isEditBlocked) return;
        if (!this._autofillSession || !this._autofillSession.rules) {
            return;
        }
        const lookupRules = this._autofillSession.rules.filter(
            (r) =>
                r.source?.type === 'lookup' && r.source?.elementId === elementId
        );
        for (const rule of lookupRules) {
            const sourceRecordId = value || null;
            const { clearedPatch, requestIdentity } = onSourceChanged(
                this._autofillSession,
                rule.id,
                sourceRecordId
            );
            if (clearedPatch && Object.keys(clearedPatch).length > 0) {
                this._applyAutofillPatch(clearedPatch);
            }
            if (requestIdentity && sourceRecordId) {
                const objectApiName = this._getLookupObjectApiName(
                    rule,
                    elementId
                );
                const fields = (rule.mappings || [])
                    .map((m) => m.from)
                    .filter(Boolean);
                if (objectApiName && fields.length > 0) {
                    this._startAutofillRequest(
                        requestIdentity,
                        objectApiName,
                        fields
                    );
                }
            }
        }
    }

    _getLookupObjectApiName(rule, elementId) {
        if (rule.source?.objectApiName) {
            return rule.source.objectApiName;
        }
        // R4 — the server-validated plan wins over anything in the spec, and is
        // the ONLY source of this on the guest host, where bindings are stripped.
        if (this._lookupObjects && this._lookupObjects[elementId]) {
            return this._lookupObjects[elementId];
        }
        if (!this.model || !this.model.pages) {
            return null;
        }
        for (const page of this.model.pages) {
            for (const sec of page.sections || []) {
                for (const el of sec.elements || []) {
                    if (el.id === elementId) {
                        return (
                            el.config?.referenceTo ||
                            el.config?.targetObject ||
                            el.lookupTargetObject ||
                            (el.binding && el.binding.object) ||
                            null
                        );
                    }
                }
            }
        }
        return null;
    }

    _startAutofillRequest(requestIdentity, objectApiName, fields) {
        const reqKey = `${requestIdentity.ruleId}_${requestIdentity.generation}`;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        const timerId = setTimeout(() => {
            this._handleAutofillTimeout(requestIdentity);
        }, 10000);
        this._autofillTimers.set(reqKey, timerId);

        const requestItem = {
            key: reqKey,
            ruleId: requestIdentity.ruleId,
            recordId: requestIdentity.sourceKey,
            objectApiName,
            fields,
            generation: requestIdentity.generation,
            sessionId: requestIdentity.sessionId
        };

        this.activeAutofillRequests = [
            ...this.activeAutofillRequests.filter(
                (r) => r.ruleId !== requestIdentity.ruleId
            ),
            requestItem
        ];
    }

    _clearAutofillTimeout(ruleId, generation) {
        const reqKey = `${ruleId}_${generation}`;
        if (this._autofillTimers.has(reqKey)) {
            clearTimeout(this._autofillTimers.get(reqKey));
            this._autofillTimers.delete(reqKey);
        }
    }

    /**
     * R10 — after a builder edit, drop the viewer-side bookkeeping for requests
     * the engine just cancelled. Their results were already going to be
     * discarded (the fingerprint moved), but the pending entry kept Submit
     * showing "Finishing Autofill…" until the 10s timer fired, and that timer
     * then raised a fetch error for a rule the author may have just deleted.
     */
    _dropCancelledAutofillRequests() {
        const cancelled = this._autofillSession?.lastCancelledRuleIds || [];
        if (!cancelled.length) {
            return;
        }
        const gone = new Set(cancelled);
        for (const req of this.activeAutofillRequests) {
            if (gone.has(req.ruleId)) {
                this._clearAutofillTimeout(req.ruleId, req.generation);
            }
        }
        this.activeAutofillRequests = this.activeAutofillRequests.filter(
            (r) => !gone.has(r.ruleId)
        );
    }

    _handleAutofillTimeout(identity) {
        this._clearAutofillTimeout(identity.ruleId, identity.generation);
        this.activeAutofillRequests = this.activeAutofillRequests.filter(
            (r) =>
                !(
                    r.ruleId === identity.ruleId &&
                    r.generation === identity.generation
                )
        );
        if (this._autofillSession) {
            onRequestFailure(this._autofillSession, identity, 'timeout');
        }
        this._submitError =
            'Could not fill these details. Enter them yourself or retry.';
    }

    handleAutofillRecordSuccess(event) {
        const { ruleId, recordId, generation, sessionId, values } =
            event.detail;
        const identity = {
            sessionId,
            specVersionId: this._autofillSession?.specVersionId,
            rulesFingerprint: this._autofillSession?.rulesFingerprint,
            ruleId,
            generation,
            sourceKey: recordId
        };
        if (!isRequestCurrent(this._autofillSession, identity)) return;
        this._clearAutofillTimeout(ruleId, generation);
        this.activeAutofillRequests = this.activeAutofillRequests.filter(
            (r) => !(r.ruleId === ruleId && r.generation === generation)
        );
        const res = onResult(
            this._autofillSession,
            identity,
            values,
            this.answers,
            false
        );
        if (res.applied && res.patch && Object.keys(res.patch).length > 0) {
            this._applyAutofillPatch(res.patch);
        }
    }

    handleAutofillRecordError(event) {
        const { ruleId, recordId, generation, sessionId } = event.detail;
        const identity = {
            sessionId,
            specVersionId: this._autofillSession?.specVersionId,
            rulesFingerprint: this._autofillSession?.rulesFingerprint,
            ruleId,
            generation,
            sourceKey: recordId
        };
        if (!isRequestCurrent(this._autofillSession, identity)) return;
        this._clearAutofillTimeout(ruleId, generation);
        this.activeAutofillRequests = this.activeAutofillRequests.filter(
            (r) => !(r.ruleId === ruleId && r.generation === generation)
        );
        if (this._autofillSession) {
            onRequestFailure(this._autofillSession, identity, 'failed');
        }
        this._submitError =
            'Could not fill these details. Enter them yourself or retry.';
    }

    _applyAutofillPatch(patch) {
        this._applyAnswers(patch, ANSWER_ORIGIN.AUTOFILL);
    }

    // =================================================================
    // The one place answers change
    // =================================================================

    /**
     * THE answer-application entry point. Native selection, Autofill,
     * dependency clears and hydration all come through here, so the rules
     * about page identity, same-value writes and dependent lookups are stated
     * once instead of re-derived at every call site.
     *
     * `replace` swaps the whole answer set (a new spec, a new edit target)
     * instead of merging into it.
     */
    _applyAnswers(patch, origin, options) {
        const replace = Boolean(options && options.replace);
        const incoming = patch || {};

        if (replace) {
            this._answers = { ...incoming };
            this._resetLookupCaches();
            this._seedLookupGenerations();
            return [];
        }

        // A write that changes nothing is not a change. Letting one through
        // would clear dependent lookups every time an unrelated rule re-ran
        // over the same values.
        //
        // "Nothing" is judged carefully. A key that was never set is NOT the
        // same as a key holding null or '': loading a record that genuinely
        // has an empty Title must record that emptiness, which is the
        // null-versus-omitted distinction the record-edit work depends on.
        const changed = [];
        for (const id of Object.keys(incoming)) {
            const known = Object.prototype.hasOwnProperty.call(
                this.answers,
                id
            );
            if (!known || !sameAnswer(this.answers[id], incoming[id])) {
                changed.push(id);
            }
        }
        if (!changed.length) {
            return [];
        }

        // The page under the respondent must stay THE SAME PAGE when an answer
        // flips a visibility rule: hiding or showing an EARLIER page renumbers
        // the filtered list, and a raw index would silently move the view.
        // Re-locate by revealKey, and fall back to the clamp only when the
        // current page itself was hidden.
        const current = this.visiblePages[this.pageIndex];
        const key = current ? current.revealKey : undefined;
        this._answers = { ...this.answers, ...incoming };
        const pages = this.visiblePages;
        const at =
            key !== undefined
                ? pages.findIndex((p) => p.revealKey === key)
                : -1;
        if (at >= 0) {
            this.pageIndex = at;
        } else if (this.pageIndex > pages.length - 1) {
            this.pageIndex = Math.max(pages.length - 1, 0);
        }

        // Hydration is a BATCH, not a series of respondent actions. Loading
        // a record that already holds a valid parent and child must not clear
        // the child merely because the parent arrived. Record where every
        // filter now stands instead, so the next real change is measured
        // against that.
        if (
            origin === ANSWER_ORIGIN.HYDRATE ||
            origin === ANSWER_ORIGIN.RESET
        ) {
            this._seedLookupGenerations();
        } else if (origin !== ANSWER_ORIGIN.DEPENDENCY) {
            this._settleDependencies(changed);
        }
        return changed;
    }

    /** Record where every compiled filter currently stands, clearing nothing. */
    _seedLookupGenerations() {
        const index = this._lookupIndex;
        if (!index || !index.size) {
            return;
        }
        const next = {};
        for (const [lookupId, entry] of index) {
            next[lookupId] = filterFingerprint(
                entry.config,
                this.answers,
                this._answerContextKey
            );
        }
        this._lookupGeneration = next;
    }

    // =================================================================
    // Dependent lookups
    // =================================================================

    /**
     * Keyed on the MODEL, not memoised once.
     *
     * Answers are reset before `model` is assigned, so a cache built on first
     * touch would be built against a model that does not exist yet and would
     * then never rebuild — every filtered lookup would silently render as an
     * unfiltered one.
     */
    get _lookupIndex() {
        if (this._lookupModelRef !== this.model) {
            this._lookupModelRef = this.model;
            this._lookupIndexCache = indexLookups(this.model);
            this._lookupGraphCache = buildGraph(this._lookupIndexCache);
            this._lookupGeneration = {};
        }
        return this._lookupIndexCache;
    }

    _resetLookupCaches() {
        this._lookupModelRef = undefined;
        this._lookupIndexCache = undefined;
        this._lookupGraphCache = undefined;
        this._elementLabelModelRef = undefined;
        this._elementLabelCache = undefined;
        this._lookupGeneration = {};
    }

    /**
     * A parent answer moved, so every lookup downstream of it may now be
     * showing a record that no longer qualifies.
     *
     * The native control will not notice. Measured, not assumed: it keeps
     * displaying and reporting a selection that fails the new filter (see
     * DEPENDENT_LOOKUP_SPIKE_EVIDENCE). So the clear is ours to make.
     *
     * Clears are applied ONCE, parent-first, through the same entry point as
     * any other answer, with origin `dependency` so they are never mistaken
     * for a respondent's manual edit.
     */
    _settleDependencies(changedIds) {
        if (this._settling) {
            return;
        }
        const index = this._lookupIndex;
        if (!index || !index.size) {
            return;
        }
        const graph = this._lookupGraphCache;
        const affected = [];
        for (const id of changedIds) {
            for (const lookupId of affectedLookups(graph, id)) {
                if (!affected.includes(lookupId)) {
                    affected.push(lookupId);
                }
            }
        }
        if (!affected.length) {
            return;
        }

        this._settling = true;
        try {
            const clears = {};
            // Decide against a WORKING copy that already carries the clears
            // made so far. `affected` is parent-first, so a grandchild has to
            // see its parent as already cleared — judged against the
            // untouched answers it would look unchanged and survive, which is
            // exactly how a three-deep chain keeps a stale selection.
            const working = { ...this.answers };
            for (const lookupId of affected) {
                const entry = index.get(lookupId);
                if (!entry) {
                    continue;
                }
                const before = this._lookupGeneration[lookupId];
                const after = filterFingerprint(
                    entry.config,
                    working,
                    this._answerContextKey
                );
                this._lookupGeneration[lookupId] = after;
                // Only a filter that actually MOVED invalidates a selection.
                if (before !== undefined && before === after) {
                    continue;
                }
                const held = working[lookupId];
                if (held !== undefined && held !== null && held !== '') {
                    clears[lookupId] = null;
                    working[lookupId] = null;
                }
            }
            if (Object.keys(clears).length) {
                this._applyAnswers(clears, ANSWER_ORIGIN.DEPENDENCY);
                // A cleared lookup is still a lookup change as far as Autofill
                // is concerned: whatever it filled in from the old record has
                // to go too. That is the existing path, and it must NOT run
                // through onManualEdit.
                for (const lookupId of Object.keys(clears)) {
                    this._handleSourceLookupChange(lookupId, null);
                }
            }
        } finally {
            this._settling = false;
        }
    }

    /** Identity of the surrounding configuration. A new spec version or a new
     *  edit target retires every compiled filter, even one whose criteria
     *  happen to look identical. */
    get _answerContextKey() {
        return (
            String(this.effectiveVersionId || '') +
            '|' +
            String(this._editContextKey || '')
        );
    }

    /** Native-facing lookup state for one element, or null when it carries no
     *  filter. */
    _lookupStateFor(elementId) {
        const index = this._lookupIndex;
        const entry = index && index.get(elementId);
        if (!entry) {
            return null;
        }
        const compiled = compileFilter(entry.config, this.answers);
        const generation = filterFingerprint(
            entry.config,
            this.answers,
            this._answerContextKey
        );
        let unavailableMessage;
        if (compiled.blocked) {
            unavailableMessage =
                compiled.reason === BLOCKED.SOURCE_REQUIRED
                    ? this._chooseFirstMessage(entry)
                    : 'This lookup is not set up correctly, so it cannot be used.';
        }
        return {
            filter: compiled.filter,
            generation,
            displayInfo: displayInfoOf(entry.config),
            matchingInfo: matchingInfoOf(entry.config),
            unavailableMessage
        };
    }

    /** "Choose Account first." Named, so the respondent knows what to do. */
    _chooseFirstMessage(entry) {
        const labels = [];
        for (const sourceId of entry.sources) {
            const label = this._elementLabels[sourceId];
            if (label && !labels.includes(label)) {
                labels.push(label);
            }
        }
        if (!labels.length) {
            return 'Answer the question above first.';
        }
        const joined =
            labels.length === 1
                ? labels[0]
                : labels.slice(0, -1).join(', ') +
                  ' and ' +
                  labels[labels.length - 1];
        return 'Choose ' + joined + ' first.';
    }

    /** Keyed on the model for the same reason the lookup index is. */
    get _elementLabels() {
        if (this._elementLabelModelRef !== this.model) {
            this._elementLabelModelRef = this.model;
            const out = {};
            for (const page of (this.model && this.model.pages) || []) {
                for (const section of page.sections || []) {
                    for (const el of section.elements || []) {
                        out[el.id] = el.label || el.id;
                    }
                }
            }
            this._elementLabelCache = out;
        }
        return this._elementLabelCache;
    }
}
