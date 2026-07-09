import { LightningElement, api } from 'lwc';

/**
 * finalElementRenderer — one spec element (P0: `field` type only).
 *
 * Type resolution will move to the widget registry as widgets land (P4);
 * unknown types render the forward-compat placeholder, never crash the form.
 * Emits plain non-composed `valuechange` events — no bubbles/composed (catalog §2).
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

    get richTextHtml() {
        return this.cfg.html || '<p>Add your text…</p>';
    }

    get hasImageSrc() {
        return Boolean(this.cfg.src);
    }

    get imageAlt() {
        return this.cfg.alt || '';
    }

    get spacerStyle() {
        const h = Number(this.cfg.height);
        return `height: ${h > 0 ? h : 24}px`;
    }

    get isTextarea() {
        return this.isField && this.cfg.inputType === 'textarea';
    }

    get isInput() {
        return this.isField && !this.isTextarea;
    }

    get inputType() {
        return INPUT_TYPES[this.cfg.inputType] || 'text';
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
            'lightning-input, lightning-textarea'
        );
        if (!target) {
            return;
        }
        target.focus();
        if (this.inputType === 'checkbox' && !this.isTextarea) {
            target.checked = !target.checked;
            this.dispatchValue(target.checked);
        }
    }

    handleChange(event) {
        // A checkbox's state lives in `checked`; `value` is a constant string.
        const t = event.target;
        this.dispatchValue(t.type === 'checkbox' ? t.checked : t.value);
    }

    dispatchValue(value) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.el.id, value }
            })
        );
    }
}
