import { LightningElement, api } from 'lwc';

/**
 * finalPageFrame — the ONE implementation of page chrome (ARCHITECTURE §2.1).
 *
 * `.page` (backdrop: bg color + the user's image, fixed 2-layer stack, always present)
 * → `.fx` (mesh + texture ONLY, fixed slots) → `.panel` (content surface) → slots.
 *
 * This host is also the single token application point (§5): the engine's token map
 * arrives via `tokens` and is written as inline custom properties on :host, where it
 * wins over the neutral base declarations in the CSS. No other component ever writes
 * a `--c-*` value.
 */

// Structure, not appearance — layout owns max-width (spec `layout.maxWidth`).
const MAX_WIDTHS = {
    narrow: '560px',
    medium: '760px',
    wide: '1040px',
    full: 'none'
};

// Bleed layouts own their canvas, so the panel cap is inert there — instead an
// EXPLICIT Max width choice reaches their inner column (oneAtATime's floating
// card, splitHero's form pane) as --frame-max, on a tighter scale (owner
// ruling 2026-07-08: "wide" must never mean a comically wide question card).
// Unset = no var = each layout keeps its locked default (540px card / 480px pane).
const BLEED_MAX_WIDTHS = {
    narrow: '480px',
    medium: '560px',
    wide: '680px',
    // '100%' not 'none': consumers use the var inside calc() for grid track
    // sizing (splitHero's form column) — calc(none + …) is invalid CSS and
    // would void the whole declaration at computed-value time.
    full: '100%'
};

// Inside Lightning Experience the platform chrome owns the viewport. A raw
// 100vh minimum guarantees a permanent double scroll there (P1 checklist #5),
// but content-driven height strands the backdrop mid-screen (owner QA
// 2026-07-07). Ruling: FILL THE REMAINING VIEWPORT — measure the frame's top
// offset once rendered and set min-height = viewport − offset. Content may
// still grow past it; the page owns any scrolling.
const EMBEDDED_IN_LEX =
    typeof window !== 'undefined' &&
    /^\/lightning\//.test(window.location.pathname);

export default class FinalPageFrame extends LightningElement {
    // No initializer: an initially-undefined template binding would NOT
    // overwrite it (LWC skips undefined in the first props pass), making
    // "unset" indistinguishable from an explicit 'medium'. The carded path
    // falls back to medium below; bleed treats unset as "layout default".
    @api maxWidth;
    /**
     * Full-bleed mode (splitHero's Immersive toggle): the panel drops its
     * surface, padding, and max-width so the primitive owns the canvas
     * edge-to-edge. The .page backdrop stack and .fx layer stay untouched —
     * bleed changes the FRAME, never the background contract.
     */
    @api bleed = false;

    /**
     * Embedded-surface override (tri-state). Undefined = auto-detect via the
     * URL (real LEX hosting). Previews force it: the studio's stage sets true
     * so the embedded-only treatments (page corner rounding, viewport-fill
     * min-height) render regardless of where the studio itself is hosted —
     * the /apex/FinalStudio host broke the URL sniff for previews.
     */
    @api embedded;

    _tokens = {};
    _appliedKeys = [];
    _connected = false;

    get _isEmbedded() {
        if (this.embedded === undefined || this.embedded === null) {
            return EMBEDDED_IN_LEX;
        }
        return Boolean(this.embedded);
    }

    @api
    get tokens() {
        return this._tokens;
    }
    set tokens(value) {
        this._tokens = value || {};
        if (this._connected) {
            this._applyTokens();
        }
    }

    connectedCallback() {
        this._connected = true;
        this._applyTokens();
    }

    renderedCallback() {
        // Measure only in AUTO mode: a forcing host (the preview stage)
        // supplies its own --frame-offset for the synthetic device viewport.
        if (
            this.embedded !== undefined ||
            !EMBEDDED_IN_LEX ||
            this._embedMeasured
        ) {
            return;
        }
        const page = this.template.querySelector('.page');
        if (!page) {
            return;
        }
        const top = Math.max(0, Math.round(page.getBoundingClientRect().top));
        // Custom property read by .page--embedded; measured once per mount —
        // LEX chrome height is stable, and re-measuring on scroll would jitter.
        this.template.host.style.setProperty('--frame-offset', `${top}px`);
        this._embedMeasured = true;
    }

    get pageClass() {
        const embedded = this._isEmbedded ? ' page--embedded' : '';
        return (this.bleed ? 'page page--bleed' : 'page') + embedded;
    }

    get panelClass() {
        return this.bleed ? 'panel panel--bleed' : 'panel';
    }

    get panelStyle() {
        if (this.bleed) {
            const cap = BLEED_MAX_WIDTHS[this.maxWidth];
            return cap ? `--frame-max: ${cap}` : '';
        }
        return `max-width: ${MAX_WIDTHS[this.maxWidth] || MAX_WIDTHS.medium}`;
    }

    _applyTokens() {
        const style = this.template.host.style;
        for (const key of this._appliedKeys) {
            if (!(key in this._tokens)) {
                style.removeProperty(key);
            }
        }
        for (const [key, value] of Object.entries(this._tokens)) {
            style.setProperty(key, value);
        }
        this._appliedKeys = Object.keys(this._tokens);
    }
}
