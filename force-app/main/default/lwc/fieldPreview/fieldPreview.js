import { LightningElement, api } from 'lwc';

export default class FieldPreview extends LightningElement {
    @api config = {};

    get renderMode() {
        const renderAs = this.config.renderAs || 'Default';
        const fieldType = this.config.fieldType || '';
        const type = this.config.type || 'Field';

        if (type === 'Rich_Text' || type === 'Static_Text') return 'richtext';
        if (type === 'Divider') return 'divider';
        if (type === 'File_Upload') return 'fileupload';

        // Survey question types
        if (type === 'NPS_Score') return 'nps';
        if (type === 'Likert_Scale') return 'likert';
        if (type === 'Star_Rating') return 'stars';
        if (type === 'Long_Text_Response') return 'textarea';

        if (renderAs === 'Radio_Buttons') return 'radio';
        if (renderAs === 'Checkbox_Group') return 'checkboxgroup';
        if (renderAs === 'Toggle') return 'toggle';
        if (renderAs === 'Slider') return 'slider';
        if (renderAs === 'Dropdown' || renderAs === 'Custom_MultiSelect') return 'dropdown';
        if (renderAs === 'Lookup_Typeahead' || renderAs === 'Lookup_Modal') return 'lookup';

        if (fieldType === 'BOOLEAN') return 'checkbox';
        if (fieldType === 'PICKLIST') return 'dropdown';
        if (fieldType === 'MULTIPICKLIST') return 'dropdown';
        if (fieldType === 'REFERENCE') return 'lookup';
        if (fieldType === 'DATE' || fieldType === 'DATETIME') return 'date';
        if (fieldType === 'TEXTAREA') return 'textarea';
        if (['STRING', 'PHONE', 'EMAIL', 'URL', 'DOUBLE', 'INTEGER', 'CURRENCY', 'PERCENT'].includes(fieldType)) return 'text';

        if (type === 'Field') return 'text';
        return 'fallback';
    }

    get isTextField() { return this.renderMode === 'text'; }
    get isTextArea() { return this.renderMode === 'textarea'; }
    get isDropdown() { return this.renderMode === 'dropdown'; }
    get isRadio() { return this.renderMode === 'radio'; }
    get isCheckboxGroup() { return this.renderMode === 'checkboxgroup'; }
    get isCheckbox() { return this.renderMode === 'checkbox'; }
    get isToggle() { return this.renderMode === 'toggle'; }
    get isDate() { return this.renderMode === 'date'; }
    get isLookup() { return this.renderMode === 'lookup'; }
    get isSlider() { return this.renderMode === 'slider'; }
    get isRichText() { return this.renderMode === 'richtext'; }
    get isDivider() { return this.renderMode === 'divider'; }
    get isFileUpload() { return this.renderMode === 'fileupload'; }
    get isNps() { return this.renderMode === 'nps'; }
    get isLikert() { return this.renderMode === 'likert'; }
    get isStars() { return this.renderMode === 'stars'; }
    get isFallback() { return this.renderMode === 'fallback'; }

    get npsScale() {
        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
            value: n, key: `nps-${n}`
        }));
    }

    get likertScale() {
        return [
            { value: 1, label: 'Strongly Disagree', key: 'lk-1' },
            { value: 2, label: 'Disagree', key: 'lk-2' },
            { value: 3, label: 'Neutral', key: 'lk-3' },
            { value: 4, label: 'Agree', key: 'lk-4' },
            { value: 5, label: 'Strongly Agree', key: 'lk-5' }
        ];
    }

    get starsScale() {
        return [1, 2, 3, 4, 5].map(n => ({ value: n, key: `star-${n}` }));
    }

    get hasRichContent() {
        return !!(this.config && this.config.content);
    }

    get isRequired() {
        return this.config.uiBehavior === 'Required';
    }

    get isReadOnly() {
        return this.config.uiBehavior === 'Read_Only';
    }

    get wrapperClass() {
        return `preview-field${this.isReadOnly ? ' read-only' : ''}`;
    }

    get placeholderText() {
        return this.config.placeholder || this.config.name || '';
    }

    get dropdownPlaceholder() {
        if (this.previewOptions.length > 0) {
            return this.previewOptions[0].label;
        }
        return 'Select an option...';
    }

    get datePlaceholder() {
        return this.config.fieldType === 'DATETIME' ? 'MM/DD/YYYY HH:MM' : 'MM/DD/YYYY';
    }

    get previewOptions() {
        try {
            const json = this.config.customOptionsJson;
            if (json) {
                const parsed = JSON.parse(json);
                if (parsed.length > 0) return parsed;
            }
        } catch { /* ignore */ }

        return [
            { label: 'Option 1', value: 'opt1' },
            { label: 'Option 2', value: 'opt2' },
            { label: 'Option 3', value: 'opt3' }
        ];
    }
}