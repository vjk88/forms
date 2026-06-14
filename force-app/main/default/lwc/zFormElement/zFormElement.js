import { LightningElement, api, track } from 'lwc';

export default class ZFormElement extends LightningElement {
    @api element = {}; // { key, type, label, fieldApiName, required, renderAs, placeholder, minLength, ... }
    @api value;
    @api schemaField = {}; // describe info from schema snapshot: { type, picklistValues: [] }
    @api errorMessage = '';

    @track lookupSearchTerm = '';

    get elementClass() {
        const span = this.element.columnSpan || 1;
        return `form-element-container col-span-${span}`;
    }

    get isField() {
        return this.element.type === 'field';
    }

    get isStaticText() {
        return this.element.type === 'static_text';
    }

    get isDivider() {
        return this.element.type === 'divider';
    }

    get isTextarea() {
        return this.element.renderAs === 'textarea' || (this.isField && this.schemaField && this.schemaField.type === 'textarea');
    }

    get isToggle() {
        return this.element.renderAs === 'toggle';
    }

    get isSlider() {
        return this.element.renderAs === 'slider';
    }

    get isPicklist() {
        return this.element.renderAs === 'dropdown' || (this.isField && this.schemaField && (this.schemaField.type === 'picklist' || this.schemaField.type === 'multipicklist'));
    }

    get isLookup() {
        return this.element.renderAs === 'lookup' || (this.isField && this.schemaField && this.schemaField.type === 'reference');
    }

    get isStandardInput() {
        return !this.isTextarea && !this.isToggle && !this.isSlider && !this.isPicklist && !this.isLookup;
    }

    get inputType() {
        const render = this.element.renderAs || 'text';
        if (render === 'number' || (this.isField && this.schemaField && (this.schemaField.type === 'int' || this.schemaField.type === 'double' || this.schemaField.type === 'currency'))) {
            return 'number';
        }
        if (this.isField && this.schemaField && this.schemaField.type === 'date') {
            return 'date';
        }
        if (this.isField && this.schemaField && this.schemaField.type === 'datetime') {
            return 'datetime-local';
        }
        if (this.isField && this.schemaField && this.schemaField.type === 'email') {
            return 'email';
        }
        if (this.isField && this.schemaField && this.schemaField.type === 'phone') {
            return 'tel';
        }
        return 'text';
    }

    get picklistOptions() {
        if (!this.schemaField || !this.schemaField.picklistValues) return [];
        return this.schemaField.picklistValues.map(opt => ({
            label: opt.label,
            value: opt.value,
            selected: String(opt.value) === String(this.value)
        }));
    }

    handleInputChange(event) {
        const val = event.target.value;
        this.dispatchEvent(new CustomEvent('valuechange', {
            detail: {
                key: this.element.key,
                value: val
            }
        }));
    }

    handleCheckboxChange(event) {
        const val = event.target.checked;
        this.dispatchEvent(new CustomEvent('valuechange', {
            detail: {
                key: this.element.key,
                value: val
            }
        }));
    }

    handleLookupSearch(event) {
        this.lookupSearchTerm = event.target.value;
    }
}
