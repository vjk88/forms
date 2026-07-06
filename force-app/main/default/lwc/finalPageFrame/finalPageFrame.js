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

// Inside Lightning Experience the platform chrome owns the viewport — a 100vh
// minimum guarantees a permanent page scroll there (P1 checklist #5).
const EMBEDDED_IN_LEX =
    typeof window !== 'undefined' &&
    /^\/lightning\//.test(window.location.pathname);

export default class FinalPageFrame extends LightningElement {
    @api maxWidth = 'medium';
    /**
     * Full-bleed mode (splitHero's Immersive toggle): the panel drops its
     * surface, padding, and max-width so the primitive owns the canvas
     * edge-to-edge. The .page backdrop stack and .fx layer stay untouched —
     * bleed changes the FRAME, never the background contract.
     */
    @api bleed = false;

    _tokens = {};
    _appliedKeys = [];
    _connected = false;

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

    get pageClass() {
        const embedded = EMBEDDED_IN_LEX ? ' page--embedded' : '';
        return (this.bleed ? 'page page--bleed' : 'page') + embedded;
    }

    get panelClass() {
        return this.bleed ? 'panel panel--bleed' : 'panel';
    }

    get panelStyle() {
        return this.bleed
            ? ''
            : `max-width: ${MAX_WIDTHS[this.maxWidth] || MAX_WIDTHS.medium}`;
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
