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

    get labelVariant() {
        if (this.el.labelPosition === 'hidden') {
            return 'label-hidden';
        }
        if (this.el.labelPosition === 'left') {
            return 'label-inline';
        }
        return 'standard';
    }

    handleChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.el.id, value: event.target.value }
            })
        );
    }
}
