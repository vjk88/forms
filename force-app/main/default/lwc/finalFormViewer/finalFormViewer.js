import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import getRecordContext from '@salesforce/apex/FinalSurveyObjectController.getRecordContext';
import { resolveTokens } from 'c/finalThemeEngine';
import { getLayout } from 'c/finalLayoutRegistry';
import { ensureFont } from 'c/finalFontLoader';
import { evaluateVisibility, validateElement } from 'c/finalExpressionEngine';

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

    /** Submit-engine state (slice 7). */
    submitError;
    submittedRecordId = null;
    _submitting = false;
    _startedAt = null;
    _redirectTimer = null;

    /** Live answers keyed by element id (schema §8) — fed by the valuechange
     *  re-emit chain; drives rule evaluation now, submission in the P3
     *  submit slice. Replaced wholesale so getters recompute. */
    answers = {};

    /** SO-3 record-rule verdicts from getRecordContext ({factKey: boolean}).
     *  DECLARED (reactive) — visibility getters recompute when facts land;
     *  null = no record context, record rows read "no match". */
    _ruleFacts = null;

    _inlineSpec;
    _urlFormId;
    _urlVersionId;
    _loadedKey;

    /** Record context for survey-object prefill/writeback (record-page and
     *  embedded hosts set the property; links use ?c__recordId=). */
    @api recordId;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        this._urlFormId = ref && ref.state ? ref.state.c__formId : undefined;
        this._urlVersionId =
            ref && ref.state ? ref.state.c__versionId : undefined;
        this._urlRecordId =
            ref && ref.state ? ref.state.c__recordId : undefined;
        this._load();
    }

    connectedCallback() {
        if (this._connectedOnce) {
            this._refreshNavCtor();
        }
        this._connectedOnce = true;
        this._load();
    }

    /** A scheduled post-submit redirect must die with the component — firing
     *  _navigate() after unmount steers the host page from a dead instance.
     *  (An LWR reconnect re-arms nothing: completion state survives, and the
     *  respondent can still use the completion screen's own controls.) */
    disconnectedCallback() {
        clearTimeout(this._redirectTimer);
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
        try {
            const raw = await getSpec({
                formId: formId || null,
                versionId: versionId || null
            });
            await this._apply(JSON.parse(raw));
        } catch (e) {
            this.model = null;
            this.error =
                (e && e.body && e.body.message) ||
                'This form could not be loaded.';
        }
    }

    async _apply(spec, { preserveNav } = {}) {
        if (!spec || spec.specVersion !== 1) {
            this.error = 'This form uses an unsupported specification version.';
            this.model = null;
            return;
        }
        const seq = (this._applySeq = (this._applySeq || 0) + 1);
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
        this.answers = {};
        this._revealed = [];
        this.submitError = undefined;
        this.submittedRecordId = null;
        this._startedAt = new Date().toISOString();
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

        // Survey-object record context (SURVEY_OBJECT_SPEC + V2 SO-3): one
        // round trip seeds mapped-question prefill AND freezes record-rule
        // verdicts. Authenticated renders only — authoring previews simulate,
        // guests (delegateSubmit) wait for SO-4 tokens. _recordCtx doubles as
        // the payload flag.
        this._recordCtx = null;
        this._ruleFacts = null;
        const rid = this.recordId || this._urlRecordId;
        if (
            rid &&
            !this.authoring &&
            !this.delegateSubmit &&
            spec.form &&
            spec.form.type === 'survey' &&
            spec.form.targetObject &&
            (specHasMappings(spec) || specHasRecordRules(spec))
        ) {
            this._recordCtx = rid;
            getRecordContext({
                versionId: this.effectiveVersionId || null,
                formId: this.effectiveFormId || null,
                recordId: rid
            })
                .then((res) => {
                    if (seq !== this._applySeq || !res) {
                        return;
                    }
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
                        this.answers = merged;
                    }
                })
                .catch(() => {
                    // best-effort: an unreadable record must never block the
                    // survey itself from rendering — record rules read "no
                    // match" exactly like a plain no-context link
                });
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
                                const base =
                                    answered !== undefined && !s.repeat
                                        ? { ...el, value: answered }
                                        : el;
                                // repeat entries answer as ONE consolidated
                                // value — per-entry failure display is
                                // DEFERRED, so never annotate inside
                                if (!reveal || s.repeat) {
                                    return base;
                                }
                                const errors = validateElement(
                                    base,
                                    this.answers[el.id],
                                    ctx
                                );
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
        // The page under the user must stay THE SAME PAGE when this answer
        // flips a visibility rule — hiding/showing an EARLIER page renumbers
        // the filtered list, and a raw index would silently move the view
        // (same identity law as _revealed). Re-locate by revealKey; fall
        // back to the clamp only when the current page itself was hidden
        // (the next page slides into its place).
        const current = this.visiblePages[this.pageIndex];
        const key = current ? current.revealKey : undefined;
        this.answers = { ...this.answers, [elementId]: value };
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

    async handleSubmit() {
        // Submit validates EVERY visible page; the first invalid one becomes
        // the current page with its failures shown.
        const validity = this.pageValidity;
        const firstInvalid = validity.findIndex((ok) => ok === false);
        if (firstInvalid >= 0) {
            this.pageIndex = firstInvalid;
            this._reveal(firstInvalid);
            return;
        }
        if (this._submitting) {
            return; // one click, one record
        }
        // Delegated submit (guest host): validation passed — hand the payload
        // to the host, which owns the guest Apex call. MUST precede the
        // inline-spec simulate below, because the host feeds the viewer an
        // inline spec.
        if (this.delegateSubmit) {
            this._submitting = true;
            this.submitError = undefined;
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
        this.submitError = undefined;
        try {
            const res = await submitForm({
                formId: this.effectiveFormId || null,
                versionId: this.effectiveVersionId || null,
                payloadJson: JSON.stringify(this._payload())
            });
            this.submittedRecordId = res ? res.recordId : null;
            this.completed = true;
            this._scheduleCompletion();
        } catch (e) {
            this.submitError =
                (e && e.body && e.body.message) ||
                'Your response could not be saved. Please try again.';
        } finally {
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
        this.submitError =
            message || 'Your response could not be saved. Please try again.';
    }

    /** Schema §8: answers keyed by element id; repeat sections answer as
     *  ONE consolidated `repeat:{sectionId}` entry → the repeats map. */
    _payload() {
        const answers = {};
        const repeats = {};
        for (const key of Object.keys(this.answers)) {
            if (key.indexOf('repeat:') === 0) {
                repeats[key.slice(7)] = this.answers[key];
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
        }
        return { answers, repeats, meta };
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
}
