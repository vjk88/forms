import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import { resolveTokens } from 'c/finalThemeEngine';
import { getLayout } from 'c/finalLayoutRegistry';
import { ensureFont } from 'c/finalFontLoader';
import { evaluateVisibility } from 'c/finalExpressionEngine';

/**
 * finalFormViewer — P0 minimal viewer: fetches one published Spec_JSON__c blob,
 * parses it (FORM_SPEC_SCHEMA v1), resolves tokens, lazy-loads the nav primitive
 * from the registry, and hands everything to finalPageFrame.
 *
 * Token source (ARCH §5): a published `resolved.tokens` snapshot wins; otherwise
 * the engine runs live (builder-preview semantics — fine for internal P0).
 * `?c__formId=` / `?c__versionId=` URL params override the configured properties.
 */
export default class FinalFormViewer extends LightningElement {
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
    _maxVisited = 0;

    /** Post-submit: true renders c/finalAfterSubmit instead of the nav.
     *  MUST be a declared field — undeclared assignments aren't reactive. */
    completed = false;

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
            this._maxVisited = 0;
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
        // Rule support (schema §7): one walk indexes element types for the
        // engine's date coercion and flags whether ANY rule exists — the
        // no-rules fast path skips per-keystroke filtering entirely.
        this._ruleTypeIndex = new Map();
        this._hasRules = false;
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

    /** The nav renders VISIBLE pages only — rules filter all three levels
     *  live against the answers (no-rules specs pass through untouched). */
    get visiblePages() {
        if (!this.model) {
            return [];
        }
        if (!this._hasRules) {
            return this.model.pages;
        }
        const ctx = {
            getValue: (id) => this.answers[id],
            getType: (id) => this._ruleTypeIndex.get(id)
        };
        return this.model.pages
            .filter((page) => evaluateVisibility(page.visibility, ctx))
            .map((page) => ({
                ...page,
                sections: (page.sections || [])
                    .filter((s) => evaluateVisibility(s.visibility, ctx))
                    .map((s) => ({
                        ...s,
                        elements: (s.elements || []).filter((el) =>
                            evaluateVisibility(el.visibility, ctx)
                        )
                    }))
            }));
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
     * Per-page validity — the engine's truth the primitives render gating from.
     * No validation engine yet (P1): a page counts valid once visited, so gated
     * steppers gate on "how far you've been", never further.
     */
    get pageValidity() {
        if (!this.model) {
            return [];
        }
        return this.visiblePages.map((_page, i) => i <= this._maxVisited);
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
            this._maxVisited = Math.max(this._maxVisited, index);
        }
    }

    handleNext() {
        // Page validation runs here once the validation engine lands (P1 later
        // slices only need the flow; blocked-state UX is already in submitBar).
        if (this.pageIndex < this.lastPageIndex) {
            this.pageIndex += 1;
            this._maxVisited = Math.max(this._maxVisited, this.pageIndex);
        }
    }

    handleBack() {
        if (this.pageIndex > 0) {
            this.pageIndex -= 1;
        }
    }

    handleSubmit() {
        // Submission engine lands in a later slice (BUILD_PHASES — P3 gate is
        // the first end-to-end submit). Until then submit shows the configured
        // After Submit render (owner: controls must never be dead) — P3 will
        // save FIRST, then set this and execute any redirect.
        this.completed = true;
    }
}
