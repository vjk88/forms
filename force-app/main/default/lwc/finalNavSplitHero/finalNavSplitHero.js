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

function hexToRgba(hex, opacityPct) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) {
        return hex || 'transparent';
    }
    const n = parseInt(m[1], 16);
    const alpha = Math.max(0, Math.min(100, Number(opacityPct))) / 100;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default class FinalNavSplitHero extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /**
     * Spec layout.options: side, ratio, sticky, paneImage, paneBg,
     * paneBgOpacity, paneLogo, paneBrandName, paneTitle, paneSubtitle,
     * paneHighlight, blockPlacement, progressStyle, navigation, paneFlow.
     */
    @api options;
    /** Minimal form-side lockup {title, description} — engine-passed; rendered in bleed mode only. */
    @api lockup;

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
        this.screenIndex = 0;
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
     * the carded-pane-inside-panel render exactly.
     */
    get bleedOn() {
        return this.opts.fullBleed !== false;
    }

    get layoutClass() {
        const side = this.opts.side === 'right' ? 'side-right' : 'side-left';
        const ratio = this.opts.ratio === 'third' ? 'ratio-third' : 'ratio-half';
        const sticky = this.opts.sticky ? ' sticky-pane' : '';
        const bleed = this.bleedOn ? ' mode-bleed' : '';
        return `layout ${side} ${ratio}${sticky}${bleed}`;
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
        const veil = hexToRgba(
            this.opts.paneBg || '#111827',
            this.opts.paneBgOpacity === undefined ? 100 : this.opts.paneBgOpacity
        );
        const img = this.opts.paneImage && this.opts.paneImage.url;
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

    /** Blocks grouped into their Top/Center/Bottom zones (owner model). */
    get zoneList() {
        const placement = this.opts.blockPlacement || {};
        const defaults = { title: 'top', subtitle: 'top', highlight: 'bottom' };
        const blocks = [
            { kind: 'title', html: this.opts.paneTitle },
            { kind: 'subtitle', html: this.opts.paneSubtitle },
            { kind: 'highlight', highlight: this.opts.paneHighlight }
        ];
        return ZONES.map((zone) => ({
            zone,
            cls: `zone zone-${zone}`,
            blocks: blocks
                .filter((b) => (placement[b.kind] || defaults[b.kind]) === zone)
                .filter((b) => (b.kind === 'highlight' ? b.highlight && b.highlight.text : b.html))
                .map((b) => ({
                    ...b,
                    key: b.kind,
                    isTitle: b.kind === 'title',
                    isSubtitle: b.kind === 'subtitle',
                    isHighlight: b.kind === 'highlight'
                }))
        }));
    }

    // ---- progress (renders in the brand pane) ----

    get stepCount() {
        return this.oneAtATime ? this._screens.length : (this._pages || []).length;
    }

    get stepNumber() {
        return (this.oneAtATime ? this.screenIndex : this.currentPageIndex || 0) + 1;
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
        return page ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }] : [];
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
        const origin = event.composedPath ? event.composedPath()[0] : event.target;
        if (shouldAdvanceOnKey(event, origin)) {
            event.preventDefault();
            this._go(this.screenIndex + 1);
        }
    }

    handleFocusIn(event) {
        const origin = event.composedPath ? event.composedPath()[0] : event.target;
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
        this.screenIndex = index;
        const toPage = this._screens[index].pageIndex;
        if (toPage !== fromPage) {
            this.dispatchEvent(
                new CustomEvent('pagechange', { detail: { index: toPage } })
            );
        }
        requestAnimationFrame(() => {
            const panel = this.template.querySelector('.screen-panel');
            if (panel) {
                panel.focus();
            }
        });
    }
}
