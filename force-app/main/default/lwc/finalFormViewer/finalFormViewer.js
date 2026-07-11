import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import { resolveTokens } from 'c/finalThemeEngine';
import { getLayout } from 'c/finalLayoutRegistry';
import { ensureFont } from 'c/finalFontLoader';
import { evaluateVisibility, validateElement } from 'c/finalExpressionEngine';

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

    /** Live answers keyed by element id (schema §8) — fed by the valuechange
     *  re-emit chain; drives rule evaluation now, submission in the P3
     *  submit slice. Replaced wholesale so getters recompute. */
    answers = {};

    _inlineSpec;
    _urlFormId;
    _urlVersionId;
    _loadedKey;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        this._urlFormId = ref && ref.state ? ref.state.c__formId : undefined;
        this._urlVersionId =
            ref && ref.state ? ref.state.c__versionId : undefined;
        this._load();
    }

    connectedCallback() {
        this._load();
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
        // Same layout + page count (a live-preview retint/retitle) keeps the
        // visitor's place; anything structural restarts at page 1.
        const keepNav =
            preserveNav &&
            this.model &&
            this.model.pages.length === (spec.pages || []).length &&
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
            (header.highlight && header.highlight.text)
        );
        const zonesDefault = (spec.layout && spec.layout.zonesDefault) || {};
        let options = (spec.layout && spec.layout.options) || {};
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
        if (layout.ownsHeader && header.style !== 'none') {
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
        for (const page of spec.pages || []) {
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
            // Each page ships with its zones config pre-merged (sparse page
            // override on top of layout.zonesDefault — schema §4).
            pages: (spec.pages || []).map((page) => ({
                ...page,
                zones: { ...zonesDefault, ...(page.zones || {}) }
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
            // Immersive full-bleed: only bleed-capable layouts (splitHero),
            // ON by default, reverted with options.fullBleed === false — the
            // toggle restores the carded-pane render exactly.
            bleed: Boolean(layout.bleed) && options.fullBleed !== false,
            // Only set when the spec configures the pane EXPLICITLY (above) —
            // then the form side keeps a minimal title lockup for context.
            paneLockup
        };
        this.error = undefined;
    }

    _ruleCtx() {
        return {
            getValue: (id) => this.answers[id],
            getType: (id) => this._ruleTypeIndex.get(id)
        };
    }

    /** The nav renders VISIBLE pages only — rules filter all three levels
     *  live against the answers, and REVEALED pages carry their elements'
     *  validation failures inline (`el.errors`, rendered by the element
     *  renderer). No-rules no-reveal specs pass through untouched. */
    get visiblePages() {
        if (!this.model) {
            return [];
        }
        const needErrors =
            this._hasValidation && (this._revealed || []).length > 0;
        if (!this._hasRules && !needErrors) {
            return this.model.pages;
        }
        const ctx = this._ruleCtx();
        let pages = this.model.pages;
        if (this._hasRules) {
            pages = pages.filter((page) =>
                evaluateVisibility(page.visibility, ctx)
            );
        }
        return pages.map((page, pi) => {
            const reveal = needErrors && this._revealed.includes(pi);
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
                                // repeat entries answer as ONE consolidated
                                // value — per-entry failure display is
                                // DEFERRED, so never annotate inside
                                if (!reveal || s.repeat) {
                                    return el;
                                }
                                const errors = validateElement(
                                    el,
                                    this.answers[el.id],
                                    ctx
                                );
                                return errors.length ? { ...el, errors } : el;
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
        this.answers = { ...this.answers, [elementId]: value };
        // a rule may have hidden the current page out from under us
        const last = this.visiblePages.length - 1;
        if (this.pageIndex > last) {
            this.pageIndex = Math.max(last, 0);
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
     *  half-typed form stays quiet); they live-update as answers change. */
    _reveal(pageIndex) {
        if (!this._revealed.includes(pageIndex)) {
            this._revealed = [...this._revealed, pageIndex];
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
        return {
            answers,
            repeats,
            meta: {
                startedAt: this._startedAt,
                submittedAt: new Date().toISOString()
            }
        };
    }

    // ----- After Submit EXECUTION (settings.completion — display is
    // c/finalAfterSubmit's; navigation is ours) -----

    _scheduleCompletion() {
        const c = (this.model && this.model.afterSubmit) || {};
        if (c.mode === 'toast') {
            // toast ALWAYS redirects (schema §3) — a beat to read the bar
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => this._navigate(c.redirectTo, c.redirectUrl), 1500);
            return;
        }
        if (c.autoRedirect) {
            const delay = Number(c.redirectDelay);
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(
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
