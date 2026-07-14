import { LightningElement, api } from 'lwc';

/**
 * finalElementRenderer — one spec element.
 *
 * Types (schema §4 / BUILDER_SURFACES §1): `field` with Display-as variants
 * (renderAs: dropdown / radio / checkbox group / multi-select / toggle /
 * slider), plus the content roster — richText, image, callout, divider,
 * spacer, consent, emptySpace, file. Unknown types render the forward-compat
 * placeholder, never crash the form.
 *
 * Emits plain non-composed `valuechange` events — no bubbles/composed
 * (catalog §2). Consent is a boolean answer; its "acceptance required" is an
 * ordinary required validation entry (false fails required — engine §7).
 */

const INPUT_TYPES = {
    text: 'text',
    email: 'email',
    phone: 'tel',
    number: 'number',
    date: 'date',
    url: 'url',
    checkbox: 'checkbox'
};

const SPACER_HEIGHTS = { small: 12, medium: 28, large: 56 };

const IMAGE_SIZE_WIDTHS = {
    small: '160px',
    medium: '320px',
    large: '520px',
    full: '100%',
    fit: 'auto'
};

const CALLOUT_ICONS = {
    info: 'utility:info',
    success: 'utility:success',
    warning: 'utility:warning',
    error: 'utility:error'
};

export default class FinalElementRenderer extends LightningElement {
    @api element;

    get el() {
        return this.element || {};
    }

    get cfg() {
        return this.el.config || {};
    }

    get isField() {
        return this.el.type === 'field';
    }

    /** Validation failures annotated by the viewer after a blocked advance
     *  or submit (`el.errors`) — rendered inline, themeable, live-updating. */
    get errors() {
        return this.el.errors || [];
    }

    get hasErrors() {
        return this.errors.length > 0;
    }

    // ---- Display-as variants (BUILDER_SURFACES §2: config.renderAs) ----

    get renderAs() {
        return this.cfg.renderAs || 'Default';
    }

    /** Options: custom rows win; else the describe options (picklists). */
    get options() {
        return (this.cfg.options || []).map((o) => ({
            label: o.label || o.value,
            value: o.value
        }));
    }

    get hasOptions() {
        return this.options.length > 0;
    }

    get isRadioGroup() {
        return (
            this.isField && this.renderAs === 'Radio_Buttons' && this.hasOptions
        );
    }

    get isCheckboxGroup() {
        return (
            this.isField &&
            (this.renderAs === 'Checkbox_Group' ||
                this.renderAs === 'Custom_MultiSelect') &&
            this.hasOptions
        );
    }

    get isDropdown() {
        return (
            this.isField &&
            this.hasOptions &&
            (this.renderAs === 'Dropdown' ||
                // picklists render as a dropdown by default — a text input
                // for a constrained field is a data-quality bug
                (this.renderAs === 'Default' &&
                    this.cfg.inputType === 'picklist'))
        );
    }

    get isToggle() {
        return (
            this.isField &&
            this.renderAs === 'Toggle' &&
            this.cfg.inputType === 'checkbox'
        );
    }

    get isSlider() {
        return this.isField && this.renderAs === 'Slider';
    }

    get slider() {
        const s = this.cfg.slider || {};
        return {
            min: s.min != null ? s.min : 0,
            max: s.max != null ? s.max : 100,
            step: s.step != null ? s.step : 1
        };
    }

    get isTextarea() {
        return (
            this.isField &&
            this.cfg.inputType === 'textarea' &&
            !this.isRadioGroup &&
            !this.isCheckboxGroup &&
            !this.isDropdown
        );
    }

    get isInput() {
        return (
            this.isField &&
            !this.isTextarea &&
            !this.isRadioGroup &&
            !this.isCheckboxGroup &&
            !this.isDropdown &&
            !this.isToggle &&
            !this.isSlider
        );
    }

    get inputType() {
        return INPUT_TYPES[this.cfg.inputType] || 'text';
    }

    // ---- content blocks (schema §4: binding null always) ----

    get isRichText() {
        return this.el.type === 'richText';
    }

    get isImage() {
        return this.el.type === 'image';
    }

    get isDivider() {
        return this.el.type === 'divider';
    }

    get isSpacer() {
        return this.el.type === 'spacer';
    }

    get isCallout() {
        return this.el.type === 'callout';
    }

    get isConsent() {
        return this.el.type === 'consent';
    }

    get isEmptySpace() {
        return this.el.type === 'emptySpace';
    }

    get isFile() {
        return this.el.type === 'file';
    }

    get hasRichText() {
        return Boolean(this.cfg.html);
    }

    get richTextHtml() {
        return this.cfg.html || '';
    }

    get hasImageSrc() {
        return Boolean(this.cfg.src);
    }

    get imageAlt() {
        return this.cfg.alt || '';
    }

    get imageStyle() {
        const w = IMAGE_SIZE_WIDTHS[this.cfg.size] || IMAGE_SIZE_WIDTHS.full;
        return w === 'auto' ? '' : `width: ${w}`;
    }

    get spacerStyle() {
        // legacy sizes (small/medium/large); a raw number keeps working
        const h =
            SPACER_HEIGHTS[this.cfg.size] ||
            (Number(this.cfg.height) > 0 ? Number(this.cfg.height) : 28);
        return `height: ${h}px`;
    }

    get calloutClass() {
        const tone = CALLOUT_ICONS[this.cfg.variant]
            ? this.cfg.variant
            : 'info';
        return `block-callout tone-${tone}`;
    }

    get calloutIcon() {
        return CALLOUT_ICONS[this.cfg.variant] || CALLOUT_ICONS.info;
    }

    get calloutHtml() {
        return this.cfg.html || '<p>Callout message…</p>';
    }

    get consentHtml() {
        return this.cfg.html || '<p>I agree to the terms.</p>';
    }

    /**
     * We render our OWN label (themeable) and keep the native field
     * `label-hidden` — a shadow-DOM native label can't take --c-* colours, so
     * on dark themes it renders faint. (Technique from formStudio's
     * formSectionRenderer; the native keeps its assistive-text label for SR.)
     */
    get showCustomLabel() {
        return (
            this.isField &&
            this.el.labelPosition !== 'hidden' &&
            Boolean(this.el.label)
        );
    }

    /** Help rides the visible helptext next to our label; else on the field. */
    get nativeHelp() {
        return this.showCustomLabel ? undefined : this.el.help;
    }

    /** `left` lays the field out as a row: label column + control (spec §4). */
    get fieldClass() {
        let cls = 'field';
        if (this.el.labelPosition === 'left') {
            cls += ' label-left';
        }
        if (this.isTextarea) {
            cls += ' field-textarea';
        }
        if (this.hasErrors) {
            cls += ' has-errors';
        }
        return cls;
    }

    /** labelStyle: default | uppercase | muted (catalog §1). */
    get labelClass() {
        const style = this.el.labelStyle;
        if (style === 'uppercase' || style === 'muted') {
            return `field-label label-${style}`;
        }
        return 'field-label';
    }

    /**
     * The custom label can't reach the native input across shadow roots with
     * `for` — forward the click instead (checkboxes toggle, everything else
     * just focuses).
     */
    handleLabelClick() {
        const target = this.template.querySelector(
            'lightning-input, lightning-textarea, lightning-combobox, lightning-radio-group, lightning-checkbox-group, lightning-slider'
        );
        if (!target) {
            return;
        }
        target.focus();
        if (this.inputType === 'checkbox' && this.isInput) {
            target.checked = !target.checked;
            this.dispatchValue(target.checked);
        }
    }

    handleChange(event) {
        // A checkbox's state lives in `checked`; `value` is a constant string.
        const t = event.target;
        this.dispatchValue(t.type === 'checkbox' ? t.checked : t.value);
    }

    /** Toggles + consent checkboxes answer with the boolean. */
    handleCheckedChange(event) {
        this.dispatchValue(event.target.checked);
    }

    /** lightning-slider / groups put the answer on detail.value. */
    handleDetailChange(event) {
        this.dispatchValue(event.detail.value);
    }

    dispatchValue(value) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.el.id, value }
            })
        );
    }
}
