import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import describeFillSources from '@salesforce/apex/FinalStudioController.describeFillSources';
import { isLookup } from 'c/finalRepeatGroups';

const NUMBER_TYPES = new Set(['DOUBLE', 'CURRENCY', 'PERCENT']);
const WHOLE_TYPES = new Set(['INTEGER', 'LONG']);
const INPUT_TYPE = {
    DATE: 'date',
    DATETIME: 'datetime',
    EMAIL: 'email',
    PHONE: 'tel',
    URL: 'url'
};

/**
 * The small dialog behind "Fill on new records" (P2.6, owner pick "B, list
 * + dialog"): which child field, and its value, either fixed or copied from
 * the main record. It edits a draft; Apply closes with the fill, Cancel
 * with nothing. Only main-record fields that hold the same kind of value are
 * offered (FinalRepeatFill.compatible on the server). A lookup can only
 * come from the main record. rfm- prefixed classes (LEX leak rule).
 */
export default class FinalRepeatFillModal extends LightningModal {
    @api label;
    @api description;
    @api childObject;
    @api parentObject;
    /** The child fields this fill may set (describeFields rows). */
    @api fields = [];

    field = '';
    mode = 'fixed';
    value = '';
    from = '';
    fromLabel = '';
    sources = null;
    sourcesError = '';
    /** Shown after an Apply with something missing. */
    problem = '';
    _sourcesFor = null;

    @api
    get fill() {
        return this._fill;
    }
    set fill(f) {
        this._fill = f || null;
        if (f) {
            this.field = f.field || '';
            this.mode = f.from ? 'from' : 'fixed';
            this.value = f.from ? '' : f.value;
            this.from = f.from || '';
            this.fromLabel = f.fromLabel || '';
        }
    }

    connectedCallback() {
        if (this.field) {
            this._loadSources();
        }
    }

    get current() {
        return (
            (this.fields || []).find((f) => f.apiName === this.field) || null
        );
    }

    get type() {
        return String(
            (this.current && this.current.displayType) || ''
        ).toUpperCase();
    }

    get fieldLabel() {
        return `${this.childObject} field`;
    }

    get fieldOptions() {
        return (this.fields || []).map((f) => ({
            label: f.label,
            value: f.apiName
        }));
    }

    get hasField() {
        return Boolean(this.current);
    }

    get lookupOnly() {
        return isLookup(this.current);
    }

    get modeOptions() {
        return [
            {
                label: 'Fixed value',
                value: 'fixed',
                disabled: this.lookupOnly
            },
            { label: `From ${this.parentObject}`, value: 'from' }
        ];
    }

    get isFixed() {
        return this.mode === 'fixed';
    }

    get isFrom() {
        return this.mode === 'from';
    }

    // ---- the fixed value's box follows the field's type ----

    get isChoice() {
        return this.type === 'PICKLIST' || this.type === 'COMBOBOX';
    }

    get isMulti() {
        return this.type === 'MULTIPICKLIST';
    }

    get isCheckbox() {
        return this.type === 'BOOLEAN';
    }

    get isLongText() {
        return this.type === 'TEXTAREA';
    }

    get isPlain() {
        return (
            !this.isChoice &&
            !this.isMulti &&
            !this.isCheckbox &&
            !this.isLongText
        );
    }

    get choiceOptions() {
        return (this.current && this.current.options) || [];
    }

    get multiValue() {
        return this.value ? String(this.value).split(';') : [];
    }

    get checked() {
        return this.value === true || this.value === 'true';
    }

    get inputType() {
        if (NUMBER_TYPES.has(this.type) || WHOLE_TYPES.has(this.type)) {
            return 'number';
        }
        return INPUT_TYPE[this.type] || 'text';
    }

    get step() {
        return WHOLE_TYPES.has(this.type) ? '1' : 'any';
    }

    // ---- from the main record ----

    get sourceLabel() {
        return `${this.parentObject} field`;
    }

    get sourceOptions() {
        return (this.sources || []).map((s) => ({
            label: s.label,
            value: s.apiName
        }));
    }

    get sourcesLoading() {
        return this.isFrom && this.sources === null && !this.sourcesError;
    }

    get noSources() {
        return (
            this.isFrom && Array.isArray(this.sources) && !this.sources.length
        );
    }

    get hasSources() {
        return (
            this.isFrom &&
            Array.isArray(this.sources) &&
            this.sources.length > 0
        );
    }

    get sourceHint() {
        return `Only ${this.parentObject} fields that hold the same kind of value are offered.`;
    }

    get noSourcesText() {
        if (this.sourcesError) {
            return this.sourcesError;
        }
        const label = this.current ? this.current.label : 'this field';
        const tail = this.lookupOnly
            ? ` Choose a different ${this.childObject} field.`
            : ' Use a fixed value instead.';
        return `No ${this.parentObject} field holds the same kind of value as ${label}.${tail}`;
    }

    async _loadSources() {
        const want = this.field;
        if (!want || this._sourcesFor === want) {
            return;
        }
        this._sourcesFor = want;
        this.sources = null;
        this.sourcesError = '';
        try {
            const rows = await describeFillSources({
                parentObject: this.parentObject,
                childObject: this.childObject,
                childField: want
            });
            if (this.field === want) {
                this.sources = [...(rows || [])].sort((a, b) =>
                    a.label.localeCompare(b.label)
                );
            }
        } catch {
            if (this.field === want) {
                this.sources = [];
                this.sourcesError = `The ${this.parentObject} fields could not be loaded.`;
            }
        }
    }

    // ---- handlers ----

    handleField(event) {
        this.field = event.detail.value;
        this.value = this.type === 'BOOLEAN' ? false : '';
        this.from = '';
        this.fromLabel = '';
        this.problem = '';
        if (this.lookupOnly) {
            this.mode = 'from';
        }
        this._loadSources();
    }

    handleMode(event) {
        this.mode = event.detail.value;
        this.problem = '';
    }

    handleValue(event) {
        this.value =
            event.detail && event.detail.value !== undefined
                ? event.detail.value
                : event.target.value;
        this.problem = '';
    }

    handleMultiValue(event) {
        this.value = (event.detail.value || []).join(';');
        this.problem = '';
    }

    handleChecked(event) {
        this.value = event.target.checked;
    }

    handleSource(event) {
        this.from = event.detail.value;
        const hit = (this.sources || []).find((s) => s.apiName === this.from);
        this.fromLabel = hit ? hit.label : this.from;
        this.problem = '';
    }

    handleCancel() {
        this.close();
    }

    handleApply() {
        const problem = this._check();
        if (problem) {
            this.problem = problem;
            this._focusProblem();
            return;
        }
        if (this.isFrom) {
            this.close({
                field: this.field,
                from: this.from,
                fromLabel: this.fromLabel
            });
            return;
        }
        let value = this.value;
        if (this.isCheckbox) {
            value = this.checked;
        } else if (this.inputType === 'number') {
            value = Number(value);
        } else {
            value = String(value).trim();
        }
        this.close({ field: this.field, value });
    }

    _check() {
        if (!this.hasField) {
            return `Choose a ${this.childObject} field.`;
        }
        if (this.isFrom) {
            return this.from ? '' : `Choose a ${this.parentObject} field.`;
        }
        if (this.isCheckbox) {
            return '';
        }
        const v =
            this.value === null || this.value === undefined
                ? ''
                : String(this.value).trim();
        if (!v) {
            if (this.isMulti) {
                return `Choose at least one value for ${this.current.label}.`;
            }
            return this.isChoice
                ? `Choose a value for ${this.current.label}.`
                : `Enter a value for ${this.current.label}.`;
        }
        if (this.inputType === 'number') {
            const n = Number(v);
            if (Number.isNaN(n)) {
                return `${this.current.label} needs a number.`;
            }
            if (WHOLE_TYPES.has(this.type) && !Number.isInteger(n)) {
                return `${this.current.label} needs a whole number.`;
            }
        }
        const box = this.template.querySelector('.rfm-value');
        if (
            box &&
            typeof box.reportValidity === 'function' &&
            box.reportValidity() === false
        ) {
            return `Check the value for ${this.current.label}.`;
        }
        return '';
    }

    /** The cursor goes to the box that needs fixing. */
    _focusProblem() {
        let selector = '.rfm-value';
        if (!this.hasField) {
            selector = '.rfm-field';
        } else if (this.isFrom) {
            selector = '.rfm-source';
        }
        const box = this.template.querySelector(selector);
        if (box && typeof box.focus === 'function') {
            box.focus();
        }
    }
}
