import { LightningElement, api } from 'lwc';
import { fontRefStack } from 'c/finalThemeEngine';
import { headingWeight } from 'c/finalFontFamilies';
import { ensureFontRef } from 'c/finalFontBundle';
import {
    pairingOptions,
    familyOptions,
    currentChoice,
    pairingPatch,
    sidePatch,
    refValue,
    refFromValue
} from 'c/finalFontChoices';

/**
 * finalFontPicker — the one font control (IMPL_PLAN_FONTS_AND_BRAND_THEME
 * §A.4): a pairing select, a live sample in the real fonts, and Customize
 * (separate Heading and Body selects). Used by the Design panel (form level,
 * with "From theme") and the theme editor (theme level).
 *
 * Native selects only (plan M4): an option cannot reliably draw in its own
 * font, so the sample line shows the current pick instead — and only the
 * fonts actually chosen are ever downloaded.
 *
 * Emits `fontchange` { patch } (see c/finalFontChoices); the host applies it.
 */
export default class FinalFontPicker extends LightningElement {
    /** The level being edited: { fonts, typography, customFont }. */
    @api level;
    /** resolveFontRefs() for this level as it stands: { display, body }. */
    @api effective;
    /** Form_Font__mdt rows from FinalFontController.listFonts. */
    @api uploadedFonts = [];
    /** 'form' (Design panel: offers "From theme") or 'theme' (theme editor). */
    @api mode = 'theme';
    /** Shows the panel's "Customized" dot. */
    @api edited = false;
    /** The theme's own fonts, for the "From theme" option. */
    @api inheritLabel = '';
    @api label = 'Font pairing';
    @api disabled = false;

    _open = false;

    get allowInherit() {
        return this.mode === 'form';
    }

    get pairing() {
        return pairingOptions({
            level: this.level,
            uploadedFonts: this.uploadedFonts || [],
            allowInherit: this.allowInherit,
            inheritLabel: this.inheritLabel
        });
    }

    get pairingGroups() {
        return this.pairing.groups;
    }

    get isCustom() {
        return (
            currentChoice(this.level, { allowInherit: this.allowInherit }) ===
            'custom'
        );
    }

    get customizeOpen() {
        return this._open || this.isCustom;
    }

    get customizeLabel() {
        return this.customizeOpen
            ? 'Hide heading and body'
            : 'Customize heading and body';
    }

    get displayGroups() {
        return familyOptions('display', {
            uploadedFonts: this.uploadedFonts || [],
            selected: refValue(this.effective && this.effective.display)
        });
    }

    get bodyGroups() {
        return familyOptions('body', {
            uploadedFonts: this.uploadedFonts || [],
            selected: refValue(this.effective && this.effective.body)
        });
    }

    get headingSampleStyle() {
        const ref = this.effective && this.effective.display;
        const stack = fontRefStack(ref, 'display') || 'inherit';
        const weight =
            (ref && ref.source === 'bundled' && headingWeight(ref.key)) || 700;
        return `font-family: ${stack}; font-weight: ${weight};`;
    }

    get bodySampleStyle() {
        const stack =
            fontRefStack(this.effective && this.effective.body, 'body') ||
            'inherit';
        return `font-family: ${stack};`;
    }

    renderedCallback() {
        // the sample paints in the real fonts; registration is idempotent
        if (this.effective) {
            ensureFontRef(this.effective.display);
            ensureFontRef(this.effective.body);
        }
        // A native select can keep a stale choice when its options re-render
        // (the uploaded-font list arrives later), whatever the `selected`
        // flags say: set each value outright so it always shows the truth.
        this._sync('[data-role="pairing"]', this.pairing.current);
        this._sync(
            '[data-side="display"]',
            refValue(this.effective && this.effective.display)
        );
        this._sync(
            '[data-side="body"]',
            refValue(this.effective && this.effective.body)
        );
    }

    _sync(selector, value) {
        const select = this.template.querySelector(selector);
        if (select && value && select.value !== value) {
            select.value = value;
        }
    }

    _emit(patch) {
        if (!patch || this.disabled) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('fontchange', { detail: { patch } })
        );
    }

    handlePairing(event) {
        this._emit(
            pairingPatch(event.target.value, {
                uploadedFonts: this.uploadedFonts || []
            })
        );
    }

    handleSide(event) {
        const side = event.target.dataset.side;
        const ref = refFromValue(event.target.value, this.uploadedFonts || []);
        this._emit(sidePatch(this.level, side, ref, this.effective));
    }

    toggleCustomize() {
        this._open = !this.customizeOpen;
    }

    /** The panel's "reveal this setting" lands on the pairing select. */
    @api
    focus() {
        const select = this.template.querySelector('[data-role="pairing"]');
        if (select) {
            select.focus();
        }
    }
}
