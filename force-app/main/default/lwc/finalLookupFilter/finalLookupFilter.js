import { LightningElement, api, track } from 'lwc';
import describeLookupFields from '@salesforce/apex/FinalLookupController.describeLookupFields';

/**
 * finalLookupFilter — the authoring surface for a lookup's results.
 *
 * It does not reinvent a condition builder. `c/finalRuleEditor` already has
 * All / Any / Custom logic with the expression box, rule rows, type-driven
 * operator lists and typed value inputs, so this points that editor at object
 * fields instead of form answers and translates at the boundary.
 *
 * Two vocabularies meet here. The rule editor speaks the browser's language
 * (`equals`, `contains`) because visibility rules are evaluated; a lookup
 * filter is compiled into SOQL, so the spec stores the query's language
 * (`eq`, `like`). Translating in one place keeps saved visibility rules and
 * the expression engine completely untouched.
 *
 * Emits the whole next config as `lookupconfigchange` {value}; the studio owns
 * the spec.
 */

/** Rule-editor operator → the operator the spec stores. */
const TO_SPEC = {
    equals: 'eq',
    notEquals: 'ne',
    contains: 'like',
    greaterThan: 'gt',
    lessThan: 'lt',
    isBlank: 'isBlank',
    isNotBlank: 'isNotBlank'
};
const TO_EDITOR = Object.keys(TO_SPEC).reduce((acc, k) => {
    acc[TO_SPEC[k]] = k;
    return acc;
}, {});

/** What SOQL can do that a browser rule cannot. */
const EXTRA_OPERATORS = [
    { value: 'lte', label: 'At most' },
    { value: 'gte', label: 'At least' },
    { value: 'in', label: 'Is one of' },
    { value: 'nin', label: 'Is not one of' },
    { value: 'includes', label: 'Includes any of' },
    { value: 'excludes', label: 'Excludes all of' }
];
const MULTI_VALUE = new Set(['in', 'nin', 'includes', 'excludes']);

export default class FinalLookupFilter extends LightningElement {
    /** The object this lookup searches. */
    @api targetObject;

    @track fields = [];
    @track relationships = [];
    loading = false;
    loadError = '';

    _value;
    _loadedFor;

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || null;
    }

    get extraOperators() {
        return EXTRA_OPERATORS;
    }

    renderedCallback() {
        // Describe once per object, not once per render.
        if (this.targetObject && this._loadedFor !== this.targetObject) {
            this._loadedFor = this.targetObject;
            this._load();
        }
    }

    async _load() {
        this.loading = true;
        this.loadError = '';
        try {
            const out = await describeLookupFields({
                objectApiName: this.targetObject,
                relationshipName: null
            });
            this.fields = out.fields || [];
            this.relationships = out.relationships || [];
        } catch {
            this.fields = [];
            this.relationships = [];
            this.loadError =
                'Those fields could not be read. Check the object name.';
        } finally {
            this.loading = false;
        }
    }

    /** Field paths, offered to the rule editor as its row sources. */
    get sources() {
        return this.fields.map((f) => ({
            id: f.path,
            label: f.label,
            // the editor keys its typed value inputs off this
            type: f.type
        }));
    }

    /** The filter, translated into the shape the rule editor expects. */
    get ruleValue() {
        const filter = (this._value && this._value.filter) || null;
        if (!filter) {
            return null;
        }
        return {
            action: 'show', // unused here; the editor wants the key present
            logic: filter.logic || 'all',
            customLogic: filter.customLogic || null,
            rules: (filter.rows || []).map((row) => ({
                source: row.fieldPath,
                operator: TO_EDITOR[row.operator] || row.operator,
                value: MULTI_VALUE.has(row.operator)
                    ? (row.values || []).join(', ')
                    : row.value
            }))
        };
    }

    handleRuleChange(event) {
        const next = (event.detail && event.detail.value) || null;
        const filter = next
            ? {
                  logic: next.logic || 'all',
                  customLogic: next.customLogic || null,
                  rows: (next.rules || []).map((rule) => this._toRow(rule))
              }
            : null;
        this._emit({ ...(this._value || {}), filter });
    }

    _toRow(rule) {
        const operator = TO_SPEC[rule.operator] || rule.operator;
        const row = { fieldPath: rule.source, operator };
        if (MULTI_VALUE.has(operator)) {
            // One box, comma separated. Blank entries are dropped so a
            // trailing comma does not become an empty condition.
            row.values = String(rule.value || '')
                .split(',')
                .map((v) => v.trim())
                .filter((v) => v.length > 0);
        } else if (operator !== 'isBlank' && operator !== 'isNotBlank') {
            row.value = rule.value;
        }
        return row;
    }

    handleDisplayFields(event) {
        this._emit({
            ...(this._value || {}),
            displayFields: this._paths(event.target.value)
        });
    }

    handleSearchFields(event) {
        this._emit({
            ...(this._value || {}),
            searchFields: this._paths(event.target.value)
        });
    }

    handleGuestToggle(event) {
        this._emit({
            ...(this._value || {}),
            allowGuest: event.target.checked
        });
    }

    _paths(raw) {
        return String(raw || '')
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }

    get displayFieldsValue() {
        return ((this._value && this._value.displayFields) || []).join(', ');
    }

    get searchFieldsValue() {
        return ((this._value && this._value.searchFields) || []).join(', ');
    }

    get allowGuest() {
        return Boolean(this._value && this._value.allowGuest);
    }

    get fieldHint() {
        if (!this.fields.length) {
            return '';
        }
        // Show a couple of real paths rather than describing the syntax.
        const sample = this.fields.slice(0, 2).map((f) => f.path);
        if (this.relationships.length) {
            sample.push(this.relationships[0].name + '.Name');
        }
        return 'For example: ' + sample.join(', ');
    }

    _emit(value) {
        this._value = value;
        this.dispatchEvent(
            new CustomEvent('lookupconfigchange', {
                detail: { value }
            })
        );
    }
}
