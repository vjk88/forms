import { LightningElement, api } from 'lwc';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import orgName from '@salesforce/apex/FinalThemeController.orgName';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';
import { buildBrandTheme, brandContrastReport } from 'c/finalBrandTheme';
import {
    suggestColors,
    readImagePixels,
    logoForUpload
} from 'c/finalBrandColors';
import { resolveFontRefs } from 'c/finalThemeEngine';
import { previewSettings } from 'c/finalLayoutRegistry';
import { applyFontPatch } from 'c/finalFontChoices';

/**
 * finalBrandDialog — "Create from your brand"
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §B.1). One screen, live preview on the
 * right: logo (optional, suggests colours), colours, style (Clean / Bold
 * header / Dark drawn from the real recipes), fonts (optional), name, and
 * whether the logo also goes on this form.
 *
 * Colours (§B.4): Main (required) paints the button, Bold header and page
 * tint; the optional Second paints the highlights. Logo swatches: the first
 * tap is Main, the next is Second; tapping a chosen one unpicks it, and
 * unpicking Main promotes Second. A logo auto-picks Main only.
 *
 * Save: upload the logo once (a retry reuses it), save a Theme_Definition__c,
 * emit `save` { id, name, logo? }. While saving the dialog is busy (no way
 * out). Cancel after an upload that was never saved removes that file.
 * Emits `cancel` otherwise.
 */

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_MB = 5;
const FULL_HEX = /^#?([0-9a-f]{6})$/i;
const ANY_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

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

// A failed request in words a person can act on.
function friendly(error, stage) {
    const raw = (error && error.body && error.body.message) || '';
    const transport =
        !raw || /disconnect|cancel|network|timed? ?out/i.test(raw);
    if (stage === 'upload') {
        return transport
            ? 'Your logo couldn’t be uploaded (we couldn’t reach Salesforce), so nothing was saved. Try again, or untick the logo option.'
            : 'Your logo couldn’t be uploaded, so nothing was saved. Try again, or untick the logo option.';
    }
    if (transport) {
        return 'We couldn’t reach Salesforce. Check your connection and try again.';
    }
    return `The theme couldn’t be saved: ${raw.replace(/^Error[^:]*:\s*/, '')}`;
}

export default class FinalBrandDialog extends LightningElement {
    /** The form being edited (a logo upload is attached to it). */
    @api formId;
    /** The form's layout, so the preview shows the theme in it. */
    @api layout = 'scroll';
    @api paneFlow = '';
    /** The form's layout block: the preview draws its full-bleed and width. */
    @api formLayout = null;

    get _previewSettings() {
        return previewSettings(
            this.formLayout || { type: this.layout, options: {} },
            this.layout,
            this.paneFlow
        );
    }
    get previewFullBleed() {
        return (this._previewSettings.options || {}).fullBleed;
    }
    get previewMaxWidth() {
        return this._previewSettings.maxWidth;
    }
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
    fontLevel = {};
    name = '';
    nameError = '';
    _nameTouched = false;

    logoDataUrl = null;
    logoFileName = '';
    logoError = '';
    logoReading = false;
    suggestions = [];
    noSuggestions = false;
    _useAsLogo = null; // null = the default for this form

    saving = false;
    saveError = '';
    _uploaded = null; // { dataUrl, url, versionId } — reused on a retry
    _saved = false;
    _memo = { key: '', cards: null, recipe: null, passing: [] };

    connectedCallback() {
        orgName()
            .then((n) => {
                if (!this._nameTouched && !this.name && n) {
                    this.name = `${n} brand`;
                }
            })
            .catch(() => {});
    }

    disconnectedCallback() {
        // an uploaded logo whose theme was never saved: remove the file
        if (this._uploaded && !this._saved) {
            this._discardUpload();
        }
    }

    // ----------------------------------------------------------- recipe

    /** For boolean child properties (bare attributes do not set true). */
    get yes() {
        return true;
    }

    get hasColor() {
        return Boolean(this.color);
    }

    // One build per colours/style/fonts, not per render (name typing reuses).
    _recipes() {
        const fonts = this.fontLevel.fonts || null;
        const key = `${this.color}|${this.second}|${this.style}|${JSON.stringify(fonts)}`;
        if (this._memo.key !== key) {
            const cards = STYLES.map((s) => ({
                ...s,
                recipe: this.color
                    ? buildBrandTheme({
                          color: this.color,
                          secondColor: this.second || null,
                          style: s.value,
                          fonts
                      })
                    : null
            }));
            const chosen = cards.find((c) => c.value === this.style);
            this._memo = {
                key,
                cards,
                recipe: chosen ? chosen.recipe : null,
                passing: cards
                    .filter((c) => c.recipe && this._buttonStandsOut(c.recipe))
                    .map((c) => c.label)
            };
        }
        return this._memo;
    }

    _buttonStandsOut(recipe) {
        const fill = brandContrastReport(recipe).checks.find(
            (c) => c.pair === 'button fill on card'
        );
        return !fill || fill.pass;
    }

    get recipe() {
        const r = this._recipes().recipe;
        return r ? { ...r, name: this.name || r.name } : null;
    }

    get styleCards() {
        return this._recipes().cards.map((c) => ({
            ...c,
            selected: c.value === this.style
        }));
    }

    get fontEffective() {
        return resolveFontRefs(this.fontLevel, null);
    }

    /** Light brands blend into the card: name only the styles that fix it. */
    get buttonWarning() {
        const memo = this._recipes();
        if (!memo.recipe || this._buttonStandsOut(memo.recipe)) {
            return '';
        }
        const current = STYLES.find((s) => s.value === this.style).label;
        const others = memo.passing.filter((label) => label !== current);
        const tryThis = others.length
            ? `Try ${others.join(' or ')}, or a deeper shade.`
            : 'Try a deeper shade.';
        return `Your main colour is close to the card colour, so the Submit button may not stand out. ${tryThis}`;
    }

    get checkedNote() {
        return this.buttonWarning
            ? 'Text and focus outlines are checked to stay readable on every background.'
            : 'Text, buttons and focus outlines are checked to stay readable on every background.';
    }

    /** What each colour paints, with the colour actually used. */
    get colorRoles() {
        const r = this._recipes().recipe;
        if (!r) {
            return [];
        }
        const accent = r.palette.accent;
        let secondNote = ' (made from your main colour)';
        if (this.second) {
            secondNote =
                accent === this.second
                    ? ''
                    : ' (a shade adjusted so it stays readable)';
        }
        return [
            {
                key: 'main',
                name: 'Main',
                does:
                    this.style === 'boldHeader'
                        ? 'Submit button, header and page tint'
                        : 'Submit button and page tint',
                style: `background:${r.palette.submitBg};`
            },
            {
                key: 'second',
                name: this.second ? 'Second' : 'Highlights',
                does: `Selected answers, progress, step numbers and focus outlines${secondNote}`,
                style: `background:${accent};`
            }
        ];
    }

    get dirty() {
        return Boolean(
            this.color ||
            this.second ||
            this.logoDataUrl ||
            this._nameTouched ||
            this.fontLevel.fonts
        );
    }

    get confirmLabel() {
        return this.saving ? 'Saving…' : 'Save theme';
    }

    get previewLabel() {
        return this.name || 'Your brand';
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

    get nameInvalid() {
        return this.nameError ? 'true' : 'false';
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
            this._replaceLogo(dataUrl, file.name);
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

    _replaceLogo(dataUrl, fileName) {
        if (this._uploaded && !this._saved) {
            this._discardUpload();
        }
        this.logoDataUrl = dataUrl;
        this.logoFileName = fileName;
    }

    handleLogoRemove() {
        this._replaceLogo(null, '');
        this.suggestions = [];
        this.noSuggestions = false;
        this.logoError = '';
    }

    _discardUpload() {
        const up = this._uploaded;
        this._uploaded = null;
        if (up && up.versionId) {
            deleteImage({
                contentVersionId: up.versionId,
                formId: this.formId || null
            }).catch(() => {});
        }
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
        this.nameError = '';
    }

    // -------------------------------------------------------------- save

    async handleConfirm() {
        if (this.saving) {
            return;
        }
        this.saveError = '';
        if (!this.color) {
            this.colorError = 'Pick a main colour first.';
            this.template.querySelector('.bd-hex').focus();
            return;
        }
        if (this.colorError) {
            this.template.querySelector('.bd-hex').focus();
            return;
        }
        if (this.secondError) {
            this.template.querySelector('.bd-hex2').focus();
            return;
        }
        if (!this.name.trim()) {
            this.nameError = 'Give the theme a name.';
            this.template.querySelector('.bd-name').focus();
            return;
        }
        this.saving = true;
        let stage = 'upload';
        try {
            let logo = null;
            if (this.logoDataUrl && this.useAsLogo) {
                if (
                    !this._uploaded ||
                    this._uploaded.dataUrl !== this.logoDataUrl
                ) {
                    const body = await logoForUpload(this.logoDataUrl);
                    const res = await uploadImage({
                        base64Data: body,
                        fileName:
                            this.logoFileName.replace(/\.[^.]+$/, '') + '.png',
                        formId: this.formId || null
                    });
                    this._uploaded = {
                        dataUrl: this.logoDataUrl,
                        url: res.url,
                        versionId: res.contentVersionId
                    };
                }
                logo = {
                    url: this._uploaded.url,
                    versionId: this._uploaded.versionId
                };
            }
            stage = 'save';
            const id = await saveCustomTheme({
                themeId: null,
                name: this.name.trim(),
                baseTheme: BASE_FOR_STYLE[this.style] || 'nordic',
                themeJson: JSON.stringify(this.recipe)
            });
            this._saved = true;
            this.dispatchEvent(
                new CustomEvent('save', {
                    detail: { id, name: this.name.trim(), logo }
                })
            );
        } catch (e) {
            this.saveError = friendly(e, stage);
        } finally {
            this.saving = false;
        }
    }

    handleDismiss() {
        if (this._uploaded && !this._saved) {
            this._discardUpload();
        }
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
