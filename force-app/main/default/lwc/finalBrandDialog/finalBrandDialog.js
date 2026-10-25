import { LightningElement, api } from 'lwc';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import orgName from '@salesforce/apex/FinalThemeController.orgName';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import { buildBrandTheme, brandContrastReport } from 'c/finalBrandTheme';
import { suggestColors, readImagePixels } from 'c/finalBrandColors';
import { resolveFontRefs } from 'c/finalThemeEngine';
import { applyFontPatch } from 'c/finalFontChoices';

/**
 * finalBrandDialog — "Create from your brand"
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §B.1). One screen, live preview on the
 * right:
 *   1. Logo (PNG, JPG, GIF, WebP — the types the uploader and Apex accept):
 *      up to 5 colours suggested from it, or a plain message and the hex box;
 *   2. Brand colour (picker + hex);
 *   3. Style: Clean, Bold header, Dark — each card drawn from its real recipe;
 *   4. Fonts: the font picker (theme level);
 *   5. Name, and "Also use as this form's logo".
 * Save creates a Theme_Definition__c (saveCustomTheme), then emits
 * `save` { id, name, logo? } for the host to apply; `cancel` otherwise.
 */

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_MB = 5;
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const STYLES = [
    { value: 'clean', label: 'Clean', hint: 'White card, brand buttons' },
    {
        value: 'boldHeader',
        label: 'Bold header',
        hint: 'Header in your colour'
    },
    { value: 'dark', label: 'Dark', hint: 'Dark page, brand glow' }
];

// A base theme recorded with the custom theme (older screens read it).
const BASE_FOR_STYLE = {
    clean: 'nordic',
    boldHeader: 'nordic',
    dark: 'dracula'
};

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export default class FinalBrandDialog extends LightningElement {
    /** The form being edited (a logo upload is attached to it). */
    @api formId;
    /** The form's layout, so the preview shows the theme in it. */
    @api layout = 'scroll';
    @api paneFlow = '';

    color = '';
    colorText = '';
    colorError = '';
    style = 'clean';
    fontLevel = {};
    name = '';
    _nameTouched = false;
    _orgName = '';

    logoDataUrl = null;
    logoFileName = '';
    logoError = '';
    logoReading = false;
    suggestions = [];
    noSuggestions = false;
    useAsLogo = true;

    saving = false;
    saveError = '';

    connectedCallback() {
        orgName()
            .then((n) => {
                this._orgName = n || '';
                if (!this._nameTouched && !this.name) {
                    this.name = this._orgName ? `${this._orgName} brand` : '';
                }
            })
            .catch(() => {});
    }

    // ----------------------------------------------------------- recipe

    get hasColor() {
        return Boolean(this.color);
    }

    get recipe() {
        if (!this.color) {
            return null;
        }
        return buildBrandTheme({
            color: this.color,
            style: this.style,
            fonts: this.fontLevel.fonts || null,
            name: this.name
        });
    }

    get styleCards() {
        return STYLES.map((s) => ({
            ...s,
            selected: s.value === this.style,
            recipe: this.color
                ? buildBrandTheme({
                      color: this.color,
                      style: s.value,
                      fonts: this.fontLevel.fonts || null
                  })
                : null
        }));
    }

    get fontEffective() {
        return resolveFontRefs(this.fontLevel, null);
    }

    /** Light brands blend into the card: the button loses its shape. */
    get buttonWarning() {
        const recipe = this.recipe;
        if (!recipe) {
            return '';
        }
        const fill = brandContrastReport(recipe).checks.find(
            (c) => c.pair === 'button fill on card'
        );
        return fill && !fill.pass
            ? 'Your colour is close to the card colour, so the Submit button may not stand out. Try Bold header or Dark, or a deeper shade.'
            : '';
    }

    get dirty() {
        return Boolean(this.color || this.logoDataUrl);
    }

    get confirmLabel() {
        return this.saving ? 'Saving…' : 'Save theme';
    }

    get saveDisabled() {
        return this.saving || !this.color || !this.name.trim();
    }

    get showUseAsLogo() {
        return Boolean(this.logoDataUrl);
    }

    get previewLabel() {
        return this.name || 'Your brand';
    }

    // ------------------------------------------------------------- logo

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
                (s, i) => ({
                    ...s,
                    key: `${s.hex}-${i}`,
                    label: `Use ${s.hex}`,
                    style: `background:${s.hex};`
                })
            );
            this.noSuggestions = this.suggestions.length === 0;
            if (this.suggestions.length && !this.color) {
                this._setColor(this.suggestions[0].hex);
            }
        } catch {
            this.logoError = 'That image could not be read. Try another file.';
        } finally {
            this.logoReading = false;
        }
    }

    get swatches() {
        return this.suggestions.map((s) => ({
            ...s,
            checked: s.hex === this.color ? 'true' : 'false',
            cls: s.hex === this.color ? 'bd-swatch is-on' : 'bd-swatch'
        }));
    }

    handleSwatch(event) {
        this._setColor(event.currentTarget.dataset.hex);
    }

    handleUseAsLogo(event) {
        this.useAsLogo = event.target.checked;
    }

    // ------------------------------------------------------------ colour

    _setColor(hex) {
        const m = HEX.exec(String(hex || '').trim());
        if (!m) {
            return false;
        }
        const h =
            m[1].length === 3
                ? m[1]
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : m[1];
        this.color = `#${h.toLowerCase()}`;
        this.colorText = this.color;
        this.colorError = '';
        return true;
    }

    handleColorPicker(event) {
        this._setColor(event.target.value);
    }

    handleColorText(event) {
        this.colorText = event.target.value;
        if (!this._setColor(this.colorText)) {
            this.colorError = this.colorText.trim()
                ? 'Use a hex colour such as #1e3a8a.'
                : '';
        }
    }

    get pickerValue() {
        return this.color || '#1e3a8a';
    }

    // ------------------------------------------------------- style, fonts

    handleStyle(event) {
        this.style = event.currentTarget.dataset.value;
    }

    handleFontChange(event) {
        const level = JSON.parse(JSON.stringify(this.fontLevel));
        applyFontPatch(level, event.detail && event.detail.patch);
        this.fontLevel = level;
    }

    handleName(event) {
        this._nameTouched = true;
        this.name = event.target.value;
    }

    // -------------------------------------------------------------- save

    async handleConfirm() {
        if (this.saveDisabled) {
            this.saveError = !this.color
                ? 'Pick a colour first.'
                : 'Give the theme a name.';
            return;
        }
        this.saving = true;
        this.saveError = '';
        try {
            let logo = null;
            if (this.logoDataUrl && this.useAsLogo) {
                const res = await uploadImage({
                    base64Data: this.logoDataUrl,
                    fileName: this.logoFileName,
                    formId: this.formId || null
                });
                logo = { url: res.url, versionId: res.contentVersionId };
            }
            const id = await saveCustomTheme({
                themeId: null,
                name: this.name.trim(),
                baseTheme: BASE_FOR_STYLE[this.style] || 'nordic',
                themeJson: JSON.stringify(this.recipe)
            });
            this.dispatchEvent(
                new CustomEvent('save', {
                    detail: { id, name: this.name.trim(), logo }
                })
            );
        } catch (e) {
            this.saveError =
                (e && e.body && e.body.message) ||
                'The theme could not be saved. Try again.';
        } finally {
            this.saving = false;
        }
    }

    handleDismiss() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
