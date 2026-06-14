import { LightningElement, api, track } from 'lwc';

const OPERATORS = [
    { label: 'equals', value: 'equals' },
    { label: 'does not equal', value: 'notEqual' },
    { label: 'contains', value: 'contains' },
    { label: 'does not contain', value: 'notContains' },
    { label: 'starts with', value: 'startsWith' },
    { label: 'greater than', value: 'greaterThan' },
    { label: 'less than', value: 'lessThan' },
    { label: 'greater or equal', value: 'greaterOrEqual' },
    { label: 'less or equal', value: 'lessOrEqual' },
    { label: 'is null', value: 'isNull' },
    { label: 'is not null', value: 'isNotNull' }
];

const NO_VALUE_OPS = new Set(['isNull', 'isNotNull']);

const TEXT_OPS = [
    'equals', 'notEqual', 'contains', 'notContains', 'startsWith',
    'isNull', 'isNotNull'
];
const NUMERIC_OPS = [
    'equals', 'notEqual', 'greaterThan', 'lessThan', 'greaterOrEqual',
    'lessOrEqual', 'isNull', 'isNotNull'
];
const BOOLEAN_OPS = ['equals', 'notEqual', 'isNull', 'isNotNull'];
const NUMERIC_TYPES = new Set([
    'DOUBLE', 'INTEGER', 'CURRENCY', 'PERCENT', 'DATE', 'DATETIME'
]);

const PROFILE_FIELDS = [{ label: 'Profile Name', value: '$Profile.Name' }];

const BOOLEAN_VALUE_OPTIONS = [
    { label: 'True', value: 'true' },
    { label: 'False', value: 'false' }
];
const FORM_VALUE_OPTIONS = {
    '$Form.layoutMode': [
        { label: 'Single Page', value: 'Single_Page' },
        { label: 'Multi Page — Top Nav', value: 'Multi_Page_Wizard' },
        { label: 'Multi Page — Side Nav', value: 'Vertical_Navigation' }
    ],
    '$Form.type': [
        { label: 'Form', value: 'Form' },
        { label: 'Survey', value: 'Survey' }
    ]
};
const FORM_FIELDS = [
    { label: 'Layout Mode', value: '$Form.layoutMode' },
    { label: 'Type', value: '$Form.type' },
    { label: 'Allowed Adapters', value: '$Form.allowedAdapters' }
];

function sourceOf(token) {
    if (!token) return 'record';
    if (token.indexOf('$User.') === 0) return 'user';
    if (token.indexOf('$Profile.') === 0) return 'profile';
    if (token.indexOf('$Form.') === 0) return 'form';
    return 'record';
}

export default class ZVisibilityEditor extends LightningElement {
    @api contextLabel = 'component';
    @api fields = [];
    @api objectLabel = '';
    @api userFields = [];
    @api picklistValues = {};
    @api lookupTargets = [];

    @track logic = 'all';
    @track customLogic = '';
    @track conditions = [];
    @track customLogicError = '';
    _seq = 0;
    _rulesJson = '';

    @api
    get rulesJson() {
        return this._rulesJson;
    }
    set rulesJson(value) {
        this._rulesJson = value;
        this.hydrate(value);
    }

    hydrate(value) {
        let cfg = {};
        try {
            cfg = value ? JSON.parse(value) : {};
        } catch (e) {
            cfg = {};
        }
        this.logic = cfg.logic || 'all';
        this.customLogic = cfg.customLogic || '';
        this.conditions = (cfg.rules || []).map((r) => ({
            id: `c${this._seq++}`,
            source: sourceOf(r.field),
            field: r.field || '',
            operator: r.operator || 'equals',
            value: r.value || ''
        }));
    }

    get title() {
        return `Set Visibility — ${this.contextLabel}`;
    }
    get sourceOptions() {
        return [
            { label: this.objectLabel || 'Current Record', value: 'record' },
            { label: 'Current User', value: 'user' },
            { label: 'User Profile', value: 'profile' },
            { label: 'Form Settings', value: 'form' }
        ];
    }
    get operatorOptions() {
        return OPERATORS;
    }
    get logicOptions() {
        return [
            { label: 'All conditions are met (AND)', value: 'all' },
            { label: 'Any condition is met (OR)', value: 'any' },
            { label: 'Custom logic', value: 'custom' }
        ];
    }
    get isCustom() {
        return this.logic === 'custom';
    }
    get hasConditions() {
        return this.conditions.length > 0;
    }

    fieldOptionsFor(source) {
        switch (source) {
            case 'user':
                return (this.userFields || []).map((f) => ({
                    label: f.label || f.apiName,
                    value: `$User.${f.apiName}`
                }));
            case 'profile':
                return PROFILE_FIELDS;
            case 'form':
                return FORM_FIELDS;
            default: {
                const base = (this.fields || []).map((f) => ({
                    label: f.label || f.apiName,
                    value: f.apiName
                }));
                const traversal = [];
                (this.lookupTargets || []).forEach((lt) => {
                    (lt.fields || []).forEach((f) => {
                        traversal.push({
                            label: `${lt.targetLabel} › ${f.label}`,
                            value: `${lt.relationshipName}.${f.apiName}`
                        });
                    });
                });
                return base.concat(traversal);
            }
        }
    }

    traversalLookup(token) {
        if (!token || token.indexOf('.') < 0) return null;
        const rel = token.split('.')[0];
        const fieldApi = token.split('.').slice(1).join('.');
        const lt = (this.lookupTargets || []).find(
            (x) => x.relationshipName === rel
        );
        if (!lt) return null;
        const f = (lt.fields || []).find((x) => x.apiName === fieldApi);
        return {
            lookupField: lt.lookupField,
            targetObject: lt.targetObject,
            type: f ? f.type : ''
        };
    }

    fieldTypeForCond(c) {
        if (c.source === 'user') {
            const apiName = (c.field || '').replace('$User.', '');
            const f = (this.userFields || []).find((x) => x.apiName === apiName);
            return f ? f.type : '';
        }
        if (c.source === 'record') {
            if (c.field && c.field.indexOf('.') > 0) {
                const t = this.traversalLookup(c.field);
                return t ? t.type : '';
            }
            const f = (this.fields || []).find((x) => x.apiName === c.field);
            return f ? f.type : '';
        }
        return 'STRING';
    }

    operatorsForType(type) {
        const t = (type || '').toUpperCase();
        let allowed = TEXT_OPS;
        if (NUMERIC_TYPES.has(t)) allowed = NUMERIC_OPS;
        else if (t === 'BOOLEAN') allowed = BOOLEAN_OPS;
        return OPERATORS.filter((o) => allowed.includes(o.value));
    }

    valueKindFor(c, type) {
        const t = (type || '').toUpperCase();
        if (c.source === 'form') {
            return FORM_VALUE_OPTIONS[c.field] ? 'select' : 'text';
        }
        if (t === 'BOOLEAN') return 'select';
        if (t === 'PICKLIST' || t === 'MULTIPICKLIST') {
            return c.source === 'record' && this.picklistValues[c.field]
                ? 'select'
                : 'text';
        }
        if (t === 'DATE') return 'date';
        if (t === 'DATETIME') return 'datetime';
        if (['DOUBLE', 'INTEGER', 'CURRENCY', 'PERCENT'].includes(t)) {
            return 'number';
        }
        return 'text';
    }

    valueOptionsFor(c, type, kind) {
        if (kind !== 'select') return [];
        const t = (type || '').toUpperCase();
        if (c.source === 'form') return FORM_VALUE_OPTIONS[c.field] || [];
        if (t === 'BOOLEAN') return BOOLEAN_VALUE_OPTIONS;
        return this.picklistValues[c.field] || [];
    }

    get rows() {
        return this.conditions.map((c, i) => {
            const type = this.fieldTypeForCond(c);
            const kind = this.valueKindFor(c, type);
            return {
                ...c,
                num: i + 1,
                fieldOptions: this.fieldOptionsFor(c.source),
                operatorOptions: this.operatorsForType(type),
                showValue: !NO_VALUE_OPS.has(c.operator),
                valueOptions: this.valueOptionsFor(c, type, kind),
                isSelectValue: kind === 'select',
                isDateValue: kind === 'date',
                isDateTimeValue: kind === 'datetime',
                isNumberValue: kind === 'number',
                isTextValue: kind === 'text'
            };
        });
    }

    get saveDisabled() {
        return this.isCustom && !!this.customLogicError;
    }

    handleLogicChange(e) {
        this.logic = e.detail.value;
        this.revalidate();
    }
    handleCustomLogicChange(e) {
        this.customLogic = e.detail.value;
        this.validateCustomLogic();
    }
    handleAddCondition() {
        this.conditions = [
            ...this.conditions,
            {
                id: `c${this._seq++}`,
                source: 'record',
                field: '',
                operator: 'equals',
                value: ''
            }
        ];
        this.revalidate();
    }
    handleRemove(e) {
        const id = e.currentTarget.dataset.id;
        this.conditions = this.conditions.filter((c) => c.id !== id);
        this.revalidate();
    }
    handleSourceChange(e) {
        const id = e.currentTarget.dataset.id;
        const source = e.detail.value;
        this.conditions = this.conditions.map((c) =>
            c.id === id ? { ...c, source, field: '' } : c
        );
        this.revalidate();
    }
    handleRowChange(e) {
        const id = e.currentTarget.dataset.id;
        const prop = e.currentTarget.dataset.prop;
        const val = e.detail.value;
        this.conditions = this.conditions.map((c) => {
            if (c.id !== id) return c;
            const updated = { ...c, [prop]: val };
            if (prop === 'field') {
                const allowed = this.operatorsForType(
                    this.fieldTypeForCond(updated)
                ).map((o) => o.value);
                if (!allowed.includes(updated.operator)) {
                    updated.operator = 'equals';
                }
            }
            return updated;
        });
        this.revalidate();
    }

    revalidate() {
        if (this.isCustom) this.validateCustomLogic();
        else this.customLogicError = '';
    }

    validateCustomLogic() {
        this.customLogicError = '';
        if (!this.isCustom) return true;

        const incompleteIdx = this.conditions.findIndex((c) => !c.field);
        if (incompleteIdx !== -1) {
            this.customLogicError = `Condition ${incompleteIdx + 1} has no field. Complete every condition to use custom logic.`;
            return false;
        }

        const raw = (this.customLogic || '').trim();
        const n = this.conditions.length;
        if (!raw) {
            this.customLogicError =
                'Enter logic using condition numbers, e.g. 1 AND (2 OR 3).';
            return false;
        }

        const upper = raw.toUpperCase();
        const tokens = upper.match(/\d+|AND|OR|NOT|\(|\)/g) || [];
        if (tokens.join('') !== upper.replace(/\s+/g, '')) {
            this.customLogicError =
                'Only condition numbers, AND, OR, NOT and parentheses are allowed.';
            return false;
        }

        for (const t of tokens) {
            if (/^\d+$/.test(t)) {
                const num = parseInt(t, 10);
                if (num < 1 || num > n) {
                    this.customLogicError = `Condition ${num} doesn't exist — you have ${n} condition${n === 1 ? '' : 's'}.`;
                    return false;
                }
            }
        }

        const syntaxErr = this.checkSyntax(tokens);
        if (syntaxErr) {
            this.customLogicError = syntaxErr;
            return false;
        }
        return true;
    }

    checkSyntax(tokens) {
        let i = 0;
        const expr = () => {
            term();
            while (tokens[i] === 'OR') {
                i++;
                term();
            }
        };
        const term = () => {
            factor();
            while (tokens[i] === 'AND') {
                i++;
                factor();
            }
        };
        const factor = () => {
            if (tokens[i] === 'NOT') {
                i++;
                factor();
                return;
            }
            if (tokens[i] === '(') {
                i++;
                expr();
                if (tokens[i] !== ')') throw new Error('Unbalanced parentheses.');
                i++;
                return;
            }
            if (tokens[i] !== undefined && /^\d+$/.test(tokens[i])) {
                i++;
                return;
            }
            throw new Error('Incomplete logic — check your operators and values.');
        };
        try {
            expr();
            if (i < tokens.length) {
                return `Unexpected "${tokens[i]}" in the logic.`;
            }
            return null;
        } catch (e) {
            return e.message || 'Invalid logic.';
        }
    }

    buildJson() {
        const rules = this.conditions
            .filter((c) => c.field && c.operator)
            .map((c) => {
                const rule = {
                    field: c.field,
                    operator: c.operator,
                    value: NO_VALUE_OPS.has(c.operator) ? '' : c.value
                };
                if (c.source === 'record' && c.field.indexOf('.') > 0) {
                    const t = this.traversalLookup(c.field);
                    if (t) {
                        rule.lookupField = t.lookupField;
                        rule.targetObject = t.targetObject;
                    }
                }
                return rule;
            });
        if (!rules.length) return '';
        return JSON.stringify({
            logic: this.logic,
            customLogic: this.isCustom ? this.customLogic : '',
            rules
        });
    }

    validateInputs() {
        let ok = true;
        this.template
            .querySelectorAll('lightning-combobox, lightning-input')
            .forEach((inp) => {
                if (
                    typeof inp.reportValidity === 'function' &&
                    !inp.reportValidity()
                ) {
                    ok = false;
                }
            });
        return ok;
    }

    handleSave() {
        const inputsOk = this.validateInputs();
        const customOk = this.isCustom ? this.validateCustomLogic() : true;
        if (!inputsOk || !customOk) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('save', { detail: { json: this.buildJson() } })
        );
    }
    handleClear() {
        this.conditions = [];
        this.dispatchEvent(new CustomEvent('save', { detail: { json: '' } }));
    }
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
