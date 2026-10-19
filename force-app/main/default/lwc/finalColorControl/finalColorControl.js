import { LightningElement, api } from 'lwc';
import { contrastRatio } from 'c/finalThemeEngine';

/** WCAG non-text minimum: an accent must reach this against its surface. */
const PRESET_MIN = 3;

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
    @api
    focus() {
        this.template.querySelector('input')?.focus();
    }

    /** Row label, e.g. "Accent". */
    @api label;
    /** Optional reference color; when set, the WCAG badge renders for the pair. */
    @api contrastWith;
    /** What the pair colors, for the badge hint. Default "Text". */
    @api subject;
    /** Parent-owned cascade marker — shows the edited dot. */
    @api edited = false;
    @api disabled = false;
    /** Optional one-click colors: [{ name, value }] (Accent's brand presets). */
    @api presets;
    /** The surface the color sits on (opaque hex). A preset reaching under
     *  3 : 1 against it is shown but can't be applied. Unset = all usable. */
    @api presetBackground;

    _value = '';
    /** Key of the swatch whose "why it's dimmed" note is showing. */
    _noteKey = '';
    /** Roving focus target inside the radiogroup. */
    _focusKey = '';

    @api
    get value() {
        return this._value;
    }
    set value(v) {
        // Unparseable (keywords like `transparent`, color-mix() strings) →
        // EMPTY, never a stale or default-black lie (round-2 audit: freezing
        // on the last good value showed #000000 for tokens the picker can't
        // parse). Systematic non-hex sources route through the engine's
        // guaranteed-hex `--c-*-swatch` companions instead.
        this._value = normalizeHex(v) || '';
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

    // ----- presets (radiogroup of swatches) -----

    get hasPresets() {
        return Array.isArray(this.presets) && this.presets.length > 0;
    }

    get presetGroupLabel() {
        return `${this.label || 'Color'} presets`;
    }

    get swatches() {
        const list = this.hasPresets ? this.presets : [];
        const current = this._value;
        const rows = list.map((p, i) => {
            const value = normalizeHex(p.value) || '';
            const ratio = this.presetBackground
                ? contrastRatio(value, this.presetBackground)
                : null;
            const checked = value !== '' && value === current;
            // dimming is for colors you'd switch TO; the one the form already
            // uses is never shown as "too faint" (UX review)
            const usable =
                !this.disabled &&
                (checked || ratio === null || ratio >= PRESET_MIN);
            const key = `p${i}`;
            const reason = usable
                ? ''
                : this.disabled
                  ? `${p.name} is unavailable`
                  : `${p.name} is too faint on this theme (${ratio.toFixed(1)}:1)`;
            return {
                key,
                reasonKey: `${key}-r`,
                reasonId: usable ? null : `${key}-reason`,
                name: p.name,
                value,
                usable,
                checked,
                reason,
                title: usable ? `${p.name} ${value}` : reason,
                ariaChecked: checked ? 'true' : 'false',
                ariaDisabled: usable ? null : 'true',
                chipStyle: `background-color: ${value};`,
                cls: `swatch${checked ? ' is-on' : ''}${usable ? '' : ' is-off'}`
            };
        });
        // roving tabindex: the focused swatch, else the checked one, else
        // the first — exactly one tab stop for the whole group
        const anchor =
            rows.find((r) => r.key === this._focusKey) ||
            rows.find((r) => r.checked) ||
            rows[0];
        // disabled: no tab stop at all, like the picker beside it
        return rows.map((r) => ({
            ...r,
            tabindex:
                !this.disabled && anchor && r.key === anchor.key ? '0' : '-1'
        }));
    }

    get noteText() {
        if (!this._noteKey) {
            return '';
        }
        const s = this.swatches.find((x) => x.key === this._noteKey);
        return s && !s.usable ? s.reason : '';
    }

    _pick(key) {
        const s = this.swatches.find((x) => x.key === key);
        if (!s) {
            return;
        }
        if (!s.usable) {
            // tap or click on a dimmed swatch explains instead of applying
            this._noteKey = key;
            return;
        }
        this._noteKey = '';
        this._value = s.value;
        this.dispatchEvent(
            new CustomEvent('presetpick', { detail: { value: s.value } })
        );
    }

    handleSwatchClick(event) {
        this._pick(event.currentTarget.dataset.key);
    }

    handleSwatchFocus(event) {
        const key = event.currentTarget.dataset.key;
        this._focusKey = key;
        const s = this.swatches.find((x) => x.key === key);
        this._noteKey = s && !s.usable ? key : '';
    }

    handleSwatchBlur(event) {
        this._noteKey = '';
        // leaving the group: the tab stop goes back to the checked swatch
        const next = event.relatedTarget;
        if (!next || next.getAttribute?.('role') !== 'radio') {
            this._focusKey = '';
        }
    }

    handleSwatchKeydown(event) {
        const rows = this.swatches;
        const i = rows.findIndex((r) => r.key === this._focusKey);
        let next = -1;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                next = (i + 1) % rows.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                next = (i - 1 + rows.length) % rows.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = rows.length - 1;
                break;
            case ' ':
            case 'Enter':
                event.preventDefault();
                if (i >= 0) {
                    this._pick(rows[i].key);
                }
                return;
            default:
                return;
        }
        event.preventDefault();
        // arrows move focus only; Space/Enter applies (each apply is an undo
        // step, so browsing the row must not write the spec)
        this._focusKey = rows[next].key;
        const btn = this.template.querySelector(
            `button[data-key="${rows[next].key}"]`
        );
        if (btn) {
            btn.focus();
        }
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
 * need an opaque hex starting point. LIMIT (documented, round-2 audit):
 * alpha is DROPPED, so a translucent wash approximates to its opaque ink —
 * tokens where that lies (input fill, section surfaces) must feed the
 * swatch from a `--c-*-swatch` companion, never the painted token.
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
