import { LightningElement, api } from 'lwc';
import { buildBrandTheme } from 'c/finalBrandTheme';
import { suggestColors, readImagePixels } from 'c/finalBrandColors';

/**
 * finalBrandInputs — the "Your brand" starting point of the theme dialog
 * (IMPL_PLAN_THEME_CREATOR; the inputs of the old "Create from your brand"
 * dialog, IMPL_PLAN_FONTS_AND_BRAND_THEME §B, moved here unchanged): logo
 * (optional, suggests colours), Main + optional Second colour, Swap, and the
 * Clean / Bold header / Dark style cards drawn from the real recipes.
 *
 * Colours (§B.4): Main (required) paints the button, Bold header and page
 * tint; the optional Second paints the highlights. Logo swatches: the first
 * tap is Main, the next is Second; tapping a chosen one unpicks it, and
 * unpicking Main promotes Second. A logo auto-picks Main only.
 *
 * It never uploads or saves: the dialog does that at Save. Emits
 *   brandchange { color, second, style }   when any of the three changes
 *   logochange  { dataUrl, fileName, useAsLogo }
 */

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_MB = 5;
const FULL_HEX = /^#?([0-9a-f]{6})$/i;
const ANY_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const BRAND_STYLE_CARDS = [
    { value: 'clean', label: 'Clean', hint: 'White card, brand buttons' },
    {
        value: 'boldHeader',
        label: 'Bold header',
        hint: 'Header in your colour'
    },
    { value: 'dark', label: 'Dark', hint: 'Dark page, brand glow' }
];

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function normalizeHex(text) {
    const m = ANY_HEX.exec(String(text || '').trim());
    if (!m) {
        return null;
    }
    const h =
        m[1].length === 3
            ? m[1]
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m[1];
    return `#${h.toLowerCase()}`;
}

export default class FinalBrandInputs extends LightningElement {
    /** Starting values (reopening a brand theme); later changes are ours. */
    @api initialColor = '';
    @api initialSecond = '';
    @api initialStyle = 'clean';
    /** The theme's fonts, so the style cards preview them. */
    @api fonts = null;
    /** The form's current logo, if any: the logo option then REPLACES it. */
    @api currentLogoUrl = '';
    /** The header arrangement ('textOnly' shows no logo). */
    @api headerArrangement = '';

    color = '';
    colorText = '';
    colorError = '';
    _colorFromLogo = false;
    second = '';
    secondText = '';
    secondError = '';
    _secondFromLogo = false;
    announce = ''; // read out when a tap changes a role nobody pressed
    style = 'clean';

    logoDataUrl = null;
    logoFileName = '';
    logoError = '';
    logoReading = false;
    suggestions = [];
    noSuggestions = false;
    _useAsLogo = null; // null = the default for this form

    _brandSig = '';
    _logoSig = '';
    _memo = { key: '', cards: null };

    connectedCallback() {
        const color = normalizeHex(this.initialColor);
        if (color) {
            this.color = color;
            this.colorText = color;
        }
        const second = normalizeHex(this.initialSecond);
        if (second) {
            this.second = second;
            this.secondText = second;
        }
        if (BRAND_STYLE_CARDS.some((s) => s.value === this.initialStyle)) {
            this.style = this.initialStyle;
        }
        // what we started with is not a change
        this._brandSig = this._brandSignature();
        this._logoSig = this._logoSignature();
    }

    /** Every change reaches the dialog once, whatever handler made it. */
    renderedCallback() {
        const brand = this._brandSignature();
        if (brand !== this._brandSig) {
            this._brandSig = brand;
            this.dispatchEvent(
                new CustomEvent('brandchange', {
                    detail: {
                        color: this.color,
                        second: this.second,
                        style: this.style
                    }
                })
            );
        }
        const logo = this._logoSignature();
        if (logo !== this._logoSig) {
            this._logoSig = logo;
            this.dispatchEvent(
                new CustomEvent('logochange', {
                    detail: {
                        dataUrl: this.logoDataUrl,
                        fileName: this.logoFileName,
                        useAsLogo: this.useAsLogo
                    }
                })
            );
        }
    }

    _brandSignature() {
        return `${this.color}|${this.second}|${this.style}`;
    }

    _logoSignature() {
        return `${this.logoDataUrl ? this.logoDataUrl.length : 0}|${this.logoFileName}|${this.useAsLogo}`;
    }

    /**
     * Before Save: a brand start needs a valid main colour and no half-typed
     * second. Shows the error, focuses the box, returns false when blocked.
     */
    @api
    validate() {
        if (!this.color) {
            this.colorError = 'Pick a main colour first.';
            this.template.querySelector('.bd-hex')?.focus();
            return false;
        }
        if (this.colorError) {
            this.template.querySelector('.bd-hex')?.focus();
            return false;
        }
        if (this.secondError) {
            this.template.querySelector('.bd-hex2')?.focus();
            return false;
        }
        return true;
    }

    // ----------------------------------------------------------- styles

    /** For boolean child properties (bare attributes do not set true). */
    get yes() {
        return true;
    }

    get hasColor() {
        return Boolean(this.color);
    }

    // One build per colours/fonts, not per render.
    get styleCards() {
        const key = `${this.color}|${this.second}|${JSON.stringify(this.fonts)}`;
        if (this._memo.key !== key) {
            this._memo = {
                key,
                cards: BRAND_STYLE_CARDS.map((s) => ({
                    ...s,
                    recipe: this.color
                        ? buildBrandTheme({
                              color: this.color,
                              secondColor: this.second || null,
                              style: s.value,
                              fonts: this.fonts
                          })
                        : null
                }))
            };
        }
        return this._memo.cards.map((c) => ({
            ...c,
            selected: c.value === this.style
        }));
    }

    get pickerValue() {
        return this.color || '#888888';
    }

    get pickerClass() {
        return this.color ? 'bd-picker is-set' : 'bd-picker';
    }

    get hexInvalid() {
        return this.colorError ? 'true' : 'false';
    }

    get secondPickerValue() {
        return this.second || '#888888';
    }

    get secondPickerClass() {
        return this.second
            ? 'bd-picker bd-picker2 is-set'
            : 'bd-picker bd-picker2';
    }

    get secondInvalid() {
        return this.secondError ? 'true' : 'false';
    }

    get canSwap() {
        return Boolean(this.color && this.second);
    }

    // ------------------------------------------------------------- logo

    get hasLogo() {
        return Boolean(this.logoDataUrl);
    }

    get replacesLogo() {
        return Boolean(this.currentLogoUrl);
    }

    get useAsLogo() {
        return this._useAsLogo === null ? !this.replacesLogo : this._useAsLogo;
    }

    get useAsLogoLabel() {
        return this.replacesLogo
            ? 'Replace this form’s logo with it'
            : 'Also use as this form’s logo';
    }

    get logoHiddenHint() {
        return this.useAsLogo && this.headerArrangement === 'textOnly'
            ? 'This form’s header is set to show text only, so the logo won’t appear until you change Header → Arrangement.'
            : '';
    }

    handleLogoPick() {
        this.template.querySelector('.bd-file').click();
    }

    async handleLogoFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        this.logoError = '';
        this.noSuggestions = false;
        if (!ACCEPT.includes((file.type || '').toLowerCase())) {
            this.logoError = 'Use a PNG, JPG, GIF or WebP image.';
            return;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            this.logoError = `The image is over the ${MAX_MB} MB limit.`;
            return;
        }
        this.logoReading = true;
        try {
            const dataUrl = await readAsDataUrl(file);
            const pixels = await readImagePixels(dataUrl);
            this.logoDataUrl = dataUrl;
            this.logoFileName = file.name;
            this.suggestions = suggestColors(pixels, { max: 5 }).map(
                (s, i) => ({ ...s, key: `${s.hex}-${i}` })
            );
            this.noSuggestions = this.suggestions.length === 0;
            // a Second tapped on the last logo is not on this one; Second is
            // never guessed (it is optional)
            if (this._secondFromLogo) {
                this._setSecond('', false);
            }
            // a colour picked by hand stays; one taken from the last logo
            // follows the new logo
            if (
                this.suggestions.length &&
                (!this.color || this._colorFromLogo)
            ) {
                this._applyColor(this.suggestions[0].hex, true);
            }
        } catch {
            this.logoError = 'That image could not be read. Try another file.';
        } finally {
            this.logoReading = false;
        }
    }

    handleLogoRemove() {
        this.logoDataUrl = null;
        this.logoFileName = '';
        this.suggestions = [];
        this.noSuggestions = false;
        this.logoError = '';
    }

    get swatches() {
        // what tapping an unchosen swatch does (see handleSwatch)
        let next = 'main colour';
        if (this.color) {
            next = this.second
                ? 'second colour, replacing the current one'
                : 'second colour';
        }
        return this.suggestions.map((s) => {
            let role = '';
            if (s.hex === this.color) {
                role = 'Main';
            } else if (s.hex === this.second) {
                role = 'Second';
            }
            return {
                ...s,
                role,
                pressed: role ? 'true' : 'false',
                label: role
                    ? `${s.hex}, ${role.toLowerCase()} colour. Press to remove`
                    : `Use ${s.hex} as ${next}`,
                style: `background:${s.hex};`,
                cls: role ? 'bd-swatch is-on' : 'bd-swatch'
            };
        });
    }

    /** How the swatches work, for whatever is chosen now. */
    get secondHint() {
        if (this.suggestions.length < 2 || !this.color) {
            return '';
        }
        return this.second
            ? 'Pick a chosen colour again to remove it.'
            : 'Pick another logo colour to add a second colour.';
    }

    get sameAsMain() {
        return Boolean(this.second && this.second === this.color);
    }

    /**
     * First tap = Main, next = Second (a third replaces Second). A chosen
     * swatch tapped again is unpicked; unpicking Main promotes Second.
     */
    handleSwatch(event) {
        const hex = event.currentTarget.dataset.hex;
        if (hex === this.color) {
            if (this.second) {
                this._applyColor(this.second, this._secondFromLogo);
                this._setSecond('', false);
                this.announce = `Main colour is now ${this.color}.`;
            } else {
                this.color = '';
                this.colorText = '';
                this.colorError = '';
                this._colorFromLogo = false;
                this.announce = 'Main colour removed.';
            }
        } else if (hex === this.second) {
            this._setSecond('', false);
        } else if (!this.color) {
            this._applyColor(hex, true);
        } else {
            this._setSecond(hex, true);
        }
    }

    handleUseAsLogo(event) {
        this._useAsLogo = event.target.checked;
    }

    // ------------------------------------------------------------ colour

    _applyColor(hex, fromLogo) {
        const normal = normalizeHex(hex);
        if (!normal) {
            return false;
        }
        this.color = normal;
        this.colorText = normal;
        this.colorError = '';
        this._colorFromLogo = Boolean(fromLogo);
        return true;
    }

    /** Live as the picker moves. */
    handleColorPicker(event) {
        this._applyColor(event.target.value, false);
    }

    /**
     * While typing: keep exactly what was typed, and only a complete 6-digit
     * colour takes effect (a 3-digit one is complete only on leaving).
     */
    handleColorText(event) {
        this.colorText = event.target.value;
        this.colorError = '';
        const m = FULL_HEX.exec(this.colorText.trim());
        if (m) {
            this.color = `#${m[1].toLowerCase()}`;
            this._colorFromLogo = false;
        }
    }

    /** On leaving the box: accept #abc, tidy the text, or say what's wrong. */
    handleColorTextDone(event) {
        const text = event.target.value.trim();
        if (!text) {
            this.colorError = '';
            return;
        }
        if (!this._applyColor(text, false)) {
            this.colorError = 'Use a hex colour such as #1e3a8a.';
        }
    }

    // ----------------------------------------------------- second colour

    _setSecond(hex, fromLogo) {
        const normal = hex ? normalizeHex(hex) : '';
        if (normal === null) {
            return false;
        }
        this.second = normal;
        this.secondText = normal;
        this.secondError = '';
        this._secondFromLogo = Boolean(normal && fromLogo);
        return true;
    }

    handleSecondPicker(event) {
        this._setSecond(event.target.value, false);
    }

    /** The same typing rules as Main; an emptied box removes Second. */
    handleSecondText(event) {
        this.secondText = event.target.value;
        this.secondError = '';
        const text = this.secondText.trim();
        const m = FULL_HEX.exec(text);
        if (m) {
            this.second = `#${m[1].toLowerCase()}`;
            this._secondFromLogo = false;
        } else if (!text) {
            this.second = '';
            this._secondFromLogo = false;
        }
    }

    handleSecondTextDone(event) {
        const text = event.target.value.trim();
        if (!this._setSecond(text, false)) {
            this.secondError =
                'Use a hex colour such as #1e3a8a, or leave it empty.';
        }
    }

    handleSecondClear() {
        this._setSecond('', false);
        this.template.querySelector('.bd-hex2').focus();
    }

    handleSwap() {
        const main = { hex: this.color, fromLogo: this._colorFromLogo };
        this._applyColor(this.second, this._secondFromLogo);
        this._setSecond(main.hex, main.fromLogo);
        this.announce = `Main colour is now ${this.color}, second colour ${this.second}.`;
    }

    // ------------------------------------------------------------- style

    handleStyle(event) {
        this.style = event.currentTarget.dataset.value;
    }
}
