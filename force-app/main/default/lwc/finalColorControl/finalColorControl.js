import { LightningElement, api } from 'lwc';
import { contrastRatio } from 'c/finalThemeEngine';

/**
 * finalColorControl — reusable color input row (catalog §6).
 *
 * Label + hex readout + native picker, with the 3-state WCAG badge folded in
 * (owner 2026-07-06: no standalone contrastBadge component — pass `contrast-with`
 * and this control renders the verdict; the math is finalThemeEngine.contrastRatio,
 * the ONE computation every badge shares).
 *
 * Rules:
 * - Always OPAQUE — no alpha in the picker (catalog: translucency is each surface's
 *   own Opacity slider, composed to rgba by the engine).
 * - Dumb leaf: the parent owns cascade/edited tracking and echoes `value`; this
 *   control only reports `change` and never stores design state.
 * - Badge semantics (FORM_STUDIO_IA §7): ≥4.5 AA pass · ≥3 large-text-only · <3 fail.
 */
export default class FinalColorControl extends LightningElement {
    /** Row label, e.g. "Accent". */
    @api label;
    /** Optional reference color; when set, the WCAG badge renders for the pair. */
    @api contrastWith;
    /** What the pair colors, for the badge hint. Default "Text". */
    @api subject;
    /** Parent-owned cascade marker — shows the edited dot. */
    @api edited = false;
    @api disabled = false;

    _value = '#000000';

    @api
    get value() {
        return this._value;
    }
    set value(v) {
        const norm = normalizeHex(v);
        if (norm) {
            this._value = norm;
        }
    }

    handleInput(event) {
        this._value = event.target.value;
        this.dispatchEvent(
            new CustomEvent('change', { detail: { value: this._value } })
        );
    }

    get pickerAria() {
        return this.label ? `${this.label} color` : 'Color';
    }

    // ----- badge (3-state, keyed to the consumer) -----

    get ratio() {
        if (!this.contrastWith) {
            return null;
        }
        return contrastRatio(this._value, this.contrastWith);
    }

    get showBadge() {
        return this.ratio !== null;
    }

    get verdict() {
        const r = this.ratio;
        if (r === null) {
            return null;
        }
        const txt = `${r.toFixed(1)}:1`;
        const what = this.subject || 'Text';
        if (r >= 4.5) {
            return { cls: 'badge pass', label: `${txt} · AA ✓`, hint: '' };
        }
        if (r >= 3) {
            return {
                cls: 'badge large',
                label: `${txt} · large text only`,
                hint: `${what} needs 4.5:1. Darken the color.`
            };
        }
        return {
            cls: 'badge fail',
            label: `${txt} · fails AA ✗`,
            hint: 'Unreadable. Pick a darker color.'
        };
    }

    get badgeClass() {
        return this.verdict ? this.verdict.cls : 'badge';
    }

    get badgeLabel() {
        return this.verdict ? this.verdict.label : '';
    }

    get badgeHint() {
        return this.verdict ? this.verdict.hint : '';
    }
}

/**
 * #abc / #aabbcc (case-insensitive, # optional) → #aabbcc; else null.
 * Also accepts rgb()/rgba() strings, dropping alpha — theme defaults like
 * headerTextWeak/borderColor are often rgba, and the native picker + badge
 * need an opaque hex starting point (not a stale black swatch).
 */
function normalizeHex(v) {
    if (typeof v !== 'string') {
        return null;
    }
    const rgb = v
        .trim()
        .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[,)]/i);
    if (rgb) {
        const to2 = (n) =>
            Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
        return `#${to2(rgb[1])}${to2(rgb[2])}${to2(rgb[3])}`;
    }
    const h = v.trim().replace(/^#/, '');
    const full =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h;
    return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toLowerCase()}` : null;
}
