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

export default class FinalPageFrame extends LightningElement {
    @api maxWidth = 'medium';

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

    get panelStyle() {
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
