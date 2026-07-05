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

    /** Help rides with the custom label when we render one; else on the field. */
    get nativeHelp() {
        return this.showCustomLabel ? undefined : this.el.help;
    }

    handleChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.el.id, value: event.target.value }
            })
        );
    }
}
