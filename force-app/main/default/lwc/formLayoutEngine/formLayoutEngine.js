import { LightningElement, api, track } from 'lwc';
import { normalize, resolveArchetype } from 'c/layoutModel';
import { createNavState, next, back, goTo, toView } from 'c/layoutNavState';
import { themeVars, resolveSectionStyle } from 'c/formThemes';

/**
 * c/formLayoutEngine — thin orchestrator (PHASE1_WORKPLAN §2.2).
 * Normalizes the spec, builds the page view-model, lazy-loads the archetype
 * shell, owns nav state. NO Apex calls. NO archetype conditionals beyond the
 * literal-import loader below.
 *
 * Loader note: literal import() per shell (not import(variable)) — statically
 * analyzable, LWS/2GP-safe, still lazy-loads one shell chunk at a time.
 */
/**
 * Shell copy. Every shell renders its action text / badges from model.labels
 * (never hardcoded), so all of it is form-configurable and translatable.
 * Precedence (low→high): DEFAULT_LABELS → per-archetype default → form override.
 */
const DEFAULT_LABELS = {
    submit: 'Submit',
    next: 'Next',
    back: 'Back',
    continue: 'Continue',
    ok: 'OK',
    cancel: 'Cancel',
    draftBadge: 'DRAFT',
    stepWord: 'Step',
    breadcrumbRoot: 'Form'
};
const ARCHETYPE_LABEL_DEFAULTS = {
    console: { submit: 'Save' },
    document: { submit: 'Submit application' }
};

// 8 canonical layouts → 7 shell modules (stacked + bento share c/shellStack;
// bento differs only by the MOSAIC fill rule). Literal import() per entry —
// statically analyzable, LWS/2GP-safe, lazy one chunk at a time.
const SHELL_LOADERS = {
    stacked:        () => import('c/shellStack'),
    bento:          () => import('c/shellStack'),
    stepper:        () => import('c/shellWizard'),
    splitHero:      () => import('c/shellSplitHero'),
    sideNav:        () => import('c/shellSideNav'),
    oneAtATime:     () => import('c/shellConversational'),
    tabbed:         () => import('c/shellTabbed'),
    accordion:      () => import('c/shellAccordion')
};

export default class FormLayoutEngine extends LightningElement {
    @api pages = [];      // [{ key, label, order }]
    @api sections = [];   // [{ key, pageKey, title, style, order }]
    @api elements = [];   // [{ key, sectionKey, label, type, required, colSpan, order }]
    @api skin;            // theme spec (c/formThemes shape)
    @api mode = 'live';   // live | preview | canvas
    @api previewScale;    // 0.1–1 (preview mode)
    @api previewWidth;    // CSS width (e.g. '390px') — render at a TRUE width so
                          // container queries see it; scale only shrinks visually.
    @api formTitle;
    @api formDescription;
    @api formLogo;        // header logo URL (optional)
    @api formArrangement; // header layout: stacked|inline|logoBeside|textOnly
    @api formHighlight;   // header highlight banner text (optional)
    @api labels;          // {submit,next,back,…} form-configurable shell copy
    @api proposedSpec;    // ghost preview (copilot) — takes render precedence

    // Live-mode record context (T2.2). Stamped onto each section VM so it
    // reaches c/layoutSectionHost through the shells WITHOUT widening the
    // shell contract — shells stay chrome-only and never see record data.
    @api objectApiName;
    @api recordTypeId;
    @api recordId;
    @api prefillValues;   // {fieldApi: value} — URL/record prefill
    // (pageKey) => boolean — live-mode page gate supplied by c/formViewer.
    // Passed into the navState machine, which applies it only where the nav
    // model gates (stepper/oneAtATime forward moves).
    @api validatePage;

    @track shellCtor;
    @track loadError;
    // _navState is a plain object built lazily inside get model(); reassigning it
    // doesn't re-render on its own, so nav actions bump this reactive tick to force
    // navView (and the shell's `nav` prop) to recompute. Without it, Next/Back move
    // the state but the view never updates in modes with no external re-render driver
    // (e.g. the builder preview).
    @track _navTick = 0;
    _spec;
    _navState;
    _loadedArchetype;

    @api get spec() { return this._spec; }
    set spec(v) {
        this._spec = v;
        this._navState = null; // rebuilt on next render
    }

    get effectiveSpec() { return this.proposedSpec || this._spec; }

    // ------------------------------------------------------------ rendering
    // Responsiveness is 100% CSS now: every shell/zone declares
    // `container-type: inline-size` and reflows via @container, so it reads its
    // OWN width. (The old ResizeObserver measured the engine host, which
    // misreads inside Lightning columns — retired.)
    renderedCallback() {
        const spec = this.effectiveSpec;
        if (!spec) return;
        if (spec.archetype !== this._loadedArchetype) this.loadShell(spec.archetype);
    }

    loadShell(archetype) {
        this._loadedArchetype = archetype;
        const loader = SHELL_LOADERS[resolveArchetype(archetype)];
        if (!loader) {
            this.shellCtor = null;
            this.loadError = `Shell for archetype "${archetype}" is not implemented yet`;
            return;
        }
        loader().then((m) => {
            if (this._loadedArchetype === archetype) {
                this.shellCtor = m.default;
                this.loadError = null;
            }
        }).catch((e) => {
            this.shellCtor = null;
            this.loadError = `Failed to load shell "${archetype}": ${e && e.message}`;
        });
    }

    get rootStyle() {
        const spec = this.effectiveSpec;
        let style = themeVars(this.skin || {}, spec && spec.density);
        // Apply preview sizing for the dedicated preview mode OR whenever a
        // previewWidth is supplied (the builder embeds this engine inside a LIVE
        // c/formViewer but still drives the device-width toggle through it).
        if (this.mode === 'preview' || this.previewWidth) {
            // Shells fill their host (min-height:100%, viewport-tall rails) so a
            // LIVE form reaches the bottom of the page. In the builder preview the
            // host pane is taller than the content, which strands flex-pinned /
            // centered action buttons far below (or off-screen). Tell the shells to
            // size to content instead — they read these vars (default to the
            // full-height live behavior when unset).
            style += '; --c-shell-min-h: auto; --c-shell-rail-h: auto;';
            const s = this.previewScale
                ? Math.min(Math.max(Number(this.previewScale), 0.1), 1)
                : 1;
            if (this.previewWidth) {
                // TRUE-width mode: render the layout at its real width so the
                // shells' @container queries measure it honestly, then shrink it
                // purely visually with scale (no width inflation). This is what a
                // mobile preview MUST use — calc(100%/scale) would lie.
                style += `; width: ${this.previewWidth};`;
                if (s !== 1) {
                    style += ` transform: scale(${s}); transform-origin: top left;`;
                }
            } else if (this.previewScale) {
                // Fit-to-box mode (desktop thumbnails): inflate then shrink so the
                // wide layout fills the smaller preview pane. These previews aren't
                // meant to collapse, so the inflated width is acceptable here.
                style += `; transform: scale(${s}); transform-origin: top left; width: calc(100% / ${s});`;
            }
        }
        return style;
    }
    get rootClass() {
        return `engine mode-${this.mode}${this.proposedSpec ? ' ghost' : ''}`;
    }
    get isInert() { return this.mode !== 'live'; }

    // ------------------------------------------------------------ viewmodel
    get model() {
        const spec = this.effectiveSpec;
        if (!spec) return null;
        const { spec: norm, warnings } = normalize(spec, this.pages, this.sections);
        if (!this._navState) this._navState = createNavState(norm);
        const secByKey = new Map((this.sections || []).map((s) => [s.key, s]));
        const elsBySec = new Map();
        [...(this.elements || [])]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach((el) => {
                if (!elsBySec.has(el.sectionKey)) elsBySec.set(el.sectionKey, []);
                elsBySec.get(el.sectionKey).push(el);
            });
        const labelByPage = new Map((this.pages || []).map((p) => [p.key, p.label]));
        const templateDefault = (this.skin && this.skin.sectionDefault) || 'card';

        const density = norm.density || 'comfortable';
        const sectionVM = (key) => {
            const s = secByKey.get(key) || { key };
            // Spread first: live mode rides extra body-JSON props (icon,
            // showHeader, gridColumns, relatedSections, …) through untouched.
            return {
                ...s,
                key,
                title: s.title,
                style: resolveSectionStyle(s.style, templateDefault),
                elements: elsBySec.get(key) || [],
                density,
                objectApiName: this.objectApiName,
                recordTypeId: this.recordTypeId,
                recordId: this.recordId,
                prefillValues: this.prefillValues
            };
        };
        const childVM = (child, ci) => (child.type === 'stack'
            ? { key: `c${ci}`, isStack: true, sections: child.sections.map(sectionVM) }
            : {
                key: `c${ci}`, isColumns: true,
                style: `grid-template-columns: ${child.ratio.map((r) => `${r}fr`).join(' ')};`,
                tracks: child.tracks.map((t, ti) => ({ key: `t${ti}`, sections: t.map(sectionVM) }))
            });

        return {
            archetype: norm.archetype,
            shell: norm.shell,
            density,
            header: {
                title: this.formTitle,
                description: this.formDescription,
                logo: this.formLogo,
                arrangement: this.formArrangement || 'stacked',
                highlight: this.formHighlight || ''
            },
            labels: {
                ...DEFAULT_LABELS,
                ...(ARCHETYPE_LABEL_DEFAULTS[norm.archetype] || {}),
                ...(this.labels || {})
            },
            warnings,
            pages: norm.pages.map((p) => ({
                pageKey: p.pageKey,
                label: labelByPage.get(p.pageKey),
                zones: p.zones.map((z, zi) => ({
                    key: `z${zi}`, span: z.span, sticky: !!z.sticky,
                    children: z.children.map(childVM)
                }))
            }))
        };
    }

    get navView() {
        // Read _navTick so this getter recomputes when nav advances (the navState
        // field itself isn't reactive — see the _navTick note above).
        return this._navTick >= 0 && this._navState ? toView(this._navState) : null;
    }

    // --------------------------------------------------------------- events
    handleNavRequest(event) {
        const { dir, pageKey } = event.detail || {};
        if (!this._navState) return;
        const gate =
            this.mode === 'live' && typeof this.validatePage === 'function'
                ? (key) => this.validatePage(key) !== false
                : undefined;
        if (dir === 'next') this._navState = next(this._navState, gate);
        else if (dir === 'back') this._navState = back(this._navState);
        else if (pageKey) this._navState = goTo(this._navState, pageKey, gate);
        this._navTick++;
        const v = toView(this._navState);
        this.dispatchEvent(new CustomEvent('pagechange', { detail: v }));
    }

    /** Jump without gating — c/formViewer routes "first error page" here. */
    @api
    goToPage(pageKey) {
        if (!this._navState) return;
        this._navState = goTo(this._navState, pageKey);
        this._navTick++;
        const v = toView(this._navState);
        this.dispatchEvent(new CustomEvent('pagechange', { detail: v }));
    }

    handleSubmitRequest() {
        if (this.isInert) return;
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
