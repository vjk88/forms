import { LightningElement, api, track } from 'lwc';
import {
    buildScreens,
    clampIndex,
    isLastScreen,
    progressFraction,
    shouldAdvanceOnKey,
    isMultilineTarget,
    isTouchOnly
} from 'c/finalStepFlow';

/**
 * finalNavSplitHero — brand pane + form pane (catalog §2).
 *
 * The brand pane IS the product's hero (owner 2026-07-05): full-pane imagery
 * with a composed color veil, logo-else-wordmark, RICH-TEXT title/subtitle and
 * a highlight — each block placed Top / Center / Bottom. When this layout is
 * chosen the pane replaces formHeader entirely (registry row: ownsHeader).
 *
 * Pane Flow = Pages rides the viewer's Next/Back/Submit; Pane Flow =
 * One at a Time runs the form pane on the SAME finalStepFlow engine as
 * navOneAtATime — one engine, presentation per primitive.
 */

const ZONES = ['top', 'center', 'bottom'];

// Own Back/Continue row (One-at-a-Time pane flow): the shared arrangement
// vocabulary, mirrored from navOneAtATime so the setting means the same
// thing on both (audit fix 2026-07-11: this row used to ignore it).
const ARRANGE_CLASS = {
    'together-left': 'arr-start',
    'together-right': 'arr-end',
    split: 'arr-split'
};

function hexToRgba(hex, opacityPct) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) {
        return hex || 'transparent';
    }
    const full =
        m[1].length === 3
            ? m[1]
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m[1];
    const n = parseInt(full, 16);
    const alpha = Math.max(0, Math.min(100, Number(opacityPct))) / 100;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default class FinalNavSplitHero extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /**
     * Spec layout.options.
     * PRODUCT-SET (Design panel / viewer write these): fullBleed, paneFlow,
     * progressStyle, navigation, side, ratio (Pane side / Pane width — sweep
     * BUILD slice 2, 2026-07-18) — plus the pane CONTENT keys the viewer maps
     * from the form header (paneTitle, paneSubtitle, paneBrandName, paneLogo,
     * paneHighlight; header IS the pane editor, finalFormViewer ownsHeader).
     * DORMANT (renderer tolerates, NO product writer — do NOT present as
     * product surface): sticky (KEEP ruling), paneImage, paneBg,
     * paneBgOpacity (BUILD slice 3 pending). blockPlacement deleted
     * 2026-07-18 (sweep DELETE ruling).
     */
    @api options;
    /** Minimal form-side lockup {title, description} — engine-passed; rendered in bleed mode only. */
    @api lockup;
    /** Viewer-resolved action-row arrangement (LAYOUT_REFINEMENTS §3). */
    @api arrangement;
    /** Viewer-computed bleed (capability + fullBleed). The ONE owner of the
     *  decision — the options fallback below only covers direct mounts. */
    @api bleed;

    @track screenIndex = 0;
    @track multilineFocus = false;

    _screens = [];
    _pages = [];

    @api
    get pages() {
        return this._pages;
    }
    set pages(value) {
        this._pages = value || [];
        this._screens = buildScreens(this._pages);
        // Re-passing pages (P3 visibility rules will) must not teleport the
        // user back to screen one — keep the position, clamped to the new list.
        this.screenIndex = clampIndex(this.screenIndex, this._screens);
    }

    get opts() {
        return this.options || {};
    }

    get oneAtATime() {
        return this.opts.paneFlow === 'oneAtATime';
    }

    // ---- shell ----

    /**
     * Immersive full-bleed (default ON): pane and form own the whole canvas;
     * the form renders as a floating content card. `fullBleed: false` restores
     * the carded-pane-inside-panel render exactly. The viewer's `bleed` prop
     * wins when passed (one owner); reading options directly is only the
     * direct-mount fallback (tests, bare embeds).
     */
    get bleedOn() {
        return this.bleed === undefined || this.bleed === null
            ? this.opts.fullBleed !== false
            : Boolean(this.bleed);
    }

    get layoutClass() {
        const side = this.opts.side === 'right' ? 'side-right' : 'side-left';
        const ratio =
            this.opts.ratio === 'third' ? 'ratio-third' : 'ratio-half';
        // Carded split: the brand pane pins by DEFAULT while the form column
        // scrolls (owner 2026-07-11; opt out via sticky:false). Never in
        // bleed — sticky's align-self:start would unstretch the full-height
        // half and collapse the immersive canvas.
        const sticky =
            !this.bleedOn && this.opts.sticky !== false ? ' sticky-pane' : '';
        const bleed = this.bleedOn ? ' mode-bleed' : '';
        return `layout ${side} ${ratio}${sticky}${bleed}`;
    }

    /** Split is this layout's registry default — unknown values land there. */
    get controlsClass() {
        return `controls ${ARRANGE_CLASS[this.arrangement] || ARRANGE_CLASS.split}`;
    }

    get formCardClass() {
        return this.bleedOn ? 'form-card' : 'form-plain';
    }

    get showLockup() {
        return Boolean(
            this.bleedOn &&
            this.lockup &&
            (this.lockup.title || this.lockup.description)
        );
    }

    /** Veil over image: first background layer (topmost) is the composed rgba. */
    get paneStyle() {
        const hasBg =
            this.opts.paneBg !== undefined && this.opts.paneBg !== null;
        const img = this.opts.paneImage && this.opts.paneImage.url;
        // No explicit pane config → the THEME dresses the pane: its header
        // surface + header text (so split themes paint their brand panel, and
        // light-header themes get readable text). Config-driven panes keep the
        // composed veil + hero-white text below, unchanged.
        if (!hasBg && !img) {
            return (
                'background-color: var(--c-header-bg);' +
                ' background-image: var(--c-header-bg-gradient, none);' +
                ' color: var(--c-header-text);'
            );
        }
        const veil = hexToRgba(
            this.opts.paneBg || '#111827',
            this.opts.paneBgOpacity === undefined
                ? 100
                : this.opts.paneBgOpacity
        );
        if (!img) {
            return `background: ${veil}`;
        }
        const url = String(img).replace(/"/g, '%22');
        return (
            `background-image: linear-gradient(${veil}, ${veil}), url("${url}");` +
            ' background-size: cover; background-position: center;'
        );
    }

    // ---- brand + hero blocks ----

    get logoUrl() {
        return (this.opts.paneLogo && this.opts.paneLogo.url) || null;
    }

    get showWordmark() {
        return !this.logoUrl && Boolean(this.opts.paneBrandName);
    }

    /** header.highlight.placement (owner 2026-07-12): 'aboveTitle' = kicker
     *  position; anything else = bottom stack (highlight → divider → progress). */
    get highlightAboveTitle() {
        const hl = this.opts.paneHighlight;
        return Boolean(hl && hl.placement === 'aboveTitle');
    }

    /** Blocks grouped into their Top/Center/Bottom zones (owner model).
     *  Defaults centered (owner 2026-07-12): brand pins top, progress pins
     *  bottom, the pitch floats in the middle — the mockup arrangement. */
    get zoneList() {
        const aboveTitle = this.highlightAboveTitle;
        const placement = {
            title: 'center',
            subtitle: 'center',
            highlight: aboveTitle ? 'center' : 'bottom'
        };
        const hlBlock = {
            kind: 'highlight',
            highlight: this.opts.paneHighlight
        };
        const textBlocks = [
            { kind: 'title', html: this.opts.paneTitle },
            { kind: 'subtitle', html: this.opts.paneSubtitle }
        ];
        // Within-zone order follows array order: the kicker precedes the title.
        const blocks = aboveTitle
            ? [hlBlock, ...textBlocks]
            : [...textBlocks, hlBlock];
        return ZONES.map((zone) => ({
            zone,
            cls: `zone zone-${zone}`,
            blocks: blocks
                .filter((b) => placement[b.kind] === zone)
                .filter((b) => {
                    return b.kind === 'highlight'
                        ? b.highlight && b.highlight.text
                        : b.html;
                })
                .map((b) => ({
                    ...b,
                    key: b.kind,
                    isTitle: b.kind === 'title',
                    isSubtitle: b.kind === 'subtitle',
                    isHighlight: b.kind === 'highlight'
                }))
        }));
    }

    /** Hairline between a bottom-placed highlight and the progress footer. */
    get showPaneDivider() {
        const hl = this.opts.paneHighlight;
        return Boolean(hl && hl.text) && !this.highlightAboveTitle;
    }

    // ---- progress (renders in the brand pane) ----

    get stepCount() {
        return this.oneAtATime
            ? this._screens.length
            : (this._pages || []).length;
    }

    get stepNumber() {
        return (
            (this.oneAtATime ? this.screenIndex : this.currentPageIndex || 0) +
            1
        );
    }

    get showProgressSteps() {
        const style = this.opts.progressStyle || 'default';
        return style === 'default' && this.stepCount > 1;
    }

    get showProgressBar() {
        return this.opts.progressStyle === 'horizontal' && this.stepCount > 1;
    }

    get progressDots() {
        const active = this.stepNumber - 1;
        return Array.from({ length: this.stepCount }, (_, i) => ({
            key: `dot_${i}`,
            cls: i === active ? 'dot active' : i < active ? 'dot done' : 'dot'
        }));
    }

    get progressText() {
        return `Step ${this.stepNumber} of ${this.stepCount}`;
    }

    get progressFillStyle() {
        return `transform: scaleX(${this.stepCount ? this.stepNumber / this.stepCount : 0})`;
    }

    // ---- form pane: Pages flow ----

    get currentPageList() {
        const page = (this._pages || [])[this.currentPageIndex || 0];
        return page
            ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }]
            : [];
    }

    // ---- form pane: One-at-a-Time flow (shared finalStepFlow engine) ----

    get currentScreenList() {
        const screen = this._screens[this.screenIndex];
        return screen ? [screen] : [];
    }

    get currentSections() {
        const screen = this._screens[this.screenIndex];
        return screen ? [screen.section] : [];
    }

    get currentZones() {
        const screen = this._screens[this.screenIndex];
        return screen ? screen.zones : undefined;
    }

    get onLastScreen() {
        return isLastScreen(this.screenIndex, this._screens);
    }

    get showActionsSlot() {
        return !this.oneAtATime || this.onLastScreen;
    }

    get showBackLink() {
        return this.oneAtATime && this.screenIndex > 0;
    }

    get showAdvance() {
        return this.oneAtATime && !this.onLastScreen;
    }

    get keyboardAdvanceOn() {
        return this.oneAtATime && !isTouchOnly();
    }

    get keyboardHelperText() {
        if (!this.keyboardAdvanceOn) {
            return null;
        }
        return this.multilineFocus ? 'or press Ctrl+Enter' : 'or press Return';
    }

    get paneProgressFraction() {
        return progressFraction(this.screenIndex, this._screens);
    }

    handleKeydown(event) {
        if (!this.keyboardAdvanceOn || this.onLastScreen) {
            return;
        }
        const origin = event.composedPath
            ? event.composedPath()[0]
            : event.target;
        if (shouldAdvanceOnKey(event, origin)) {
            event.preventDefault();
            this._go(this.screenIndex + 1);
        }
    }

    handleFocusIn(event) {
        const origin = event.composedPath
            ? event.composedPath()[0]
            : event.target;
        this.multilineFocus = isMultilineTarget(origin);
    }

    handleAdvance() {
        this._go(this.screenIndex + 1);
    }

    handleBack() {
        this._go(this.screenIndex - 1);
    }

    _go(rawIndex) {
        const index = clampIndex(rawIndex, this._screens);
        if (index === this.screenIndex) {
            return;
        }
        const fromPage = this._screens[this.screenIndex].pageIndex;
        const toPage = this._screens[index].pageIndex;
        // F8 advance-denial (same rule as oneAtATime): forward page-crossing
        // needs the current page valid; the viewer reveals the failures.
        if (
            toPage > fromPage &&
            this.pageValidity &&
            this.pageValidity[fromPage] === false
        ) {
            this.dispatchEvent(
                new CustomEvent('advanceblocked', {
                    detail: { pageIndex: fromPage }
                })
            );
            return;
        }
        this.screenIndex = index;
        if (toPage !== fromPage) {
            this.dispatchEvent(
                new CustomEvent('pagechange', { detail: { index: toPage } })
            );
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        requestAnimationFrame(() => {
            const panel = this.template.querySelector('.screen-panel');
            if (panel) {
                panel.focus();
            }
        });
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
