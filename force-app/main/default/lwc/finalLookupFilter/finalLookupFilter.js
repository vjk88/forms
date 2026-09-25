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
 *
 * Two layouts. A lookup (cramped inspector) shows a summary and edits in the
 * conditions dialog. The mapping step (`filter-only`) has room, so the rule
 * editor sits on the page and every edit saves at once, with a Conditions /
 * SOQL switch when `allow-typed` is set (round 2).
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

/** A filter's content, whatever order or leftovers its keys carry. */
function filterKey(filter) {
    if (!filter) {
        return 'null';
    }
    return JSON.stringify({
        logic: filter.logic || 'all',
        customLogic: filter.customLogic || null,
        rows: (filter.rows || []).map((r) => [
            r.fieldPath || '',
            r.operator || '',
            r.value === undefined ? null : r.value,
            r.values || null
        ])
    });
}

export default class FinalLookupFilter extends LightningElement {
    /** The object this lookup searches. */
    @api targetObject;

    /**
     * Conditions only. The Freeform mapping screen reuses this editor for a
     * find-or-create search, where result display, searchable fields and
     * guest search have no meaning — and a guest-search switch that does
     * nothing is worse than no switch at all. Lookups leave it off.
     */
    @api filterOnly = false;
    /** Mapping screen: the questions a row may compare with (Task 7). */
    @api answerChoices = [];
    /** Mapping step: offer SOQL beside the built conditions (D50). */
    @api allowTyped = false;
    /** The saved typed conditions: { mode: 'soql' | 'rows', soql }. */
    @api typedValue;
    /** What the SOQL box needs: { spec, actionId, questions }. */
    @api typedContext;

    get showLookupControls() {
        return !this.filterOnly;
    }

    /** The conditions dialog's title. */
    @api dialogLabel;

    /** Current user only for signed-in searches: a guest would be the site guest. */
    get allowCurrentUserCompare() {
        return !this.allowGuest;
    }

    get dialogDescription() {
        return 'Only records that meet these conditions can be picked.';
    }

    @track fields = [];
    @track relationships = [];
    loading = false;
    loadError = '';

    _value;
    _loadedFor;

    /**
     * On the page, the editor's own copy of the conditions. A saved filter
     * can't hold everything mid-edit — a row still being set up, a trailing
     * comma in "is one of" — so the draft is kept while the saved filter is
     * the one it last saved, and rebuilt only when the filter changes from
     * elsewhere (another step, an undo).
     */
    draft = null;
    _draftFor;

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || null;
        const key = filterKey((next && next.filter) || null);
        if (key !== this._draftFor) {
            this._draftFor = key;
            const v = this.ruleValue;
            // A new search starts with one empty row, so the first click
            // isn't spent on Add condition. It isn't saved until it's used.
            this.draft =
                v && v.rules.length
                    ? v
                    : {
                          action: 'show',
                          logic: 'all',
                          customLogic: null,
                          rules: [{ source: '', operator: 'equals', value: '' }]
                      };
        }
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

    // ---- on the page (the mapping step) ----

    get onTyped() {
        return Boolean(
            this.allowTyped &&
            this.typedValue &&
            this.typedValue.mode === 'soql'
        );
    }

    get modeValue() {
        return this.onTyped ? 'soql' : 'rows';
    }

    get modeOptions() {
        return [
            { label: 'Conditions', value: 'rows' },
            { label: 'SOQL', value: 'soql' }
        ];
    }

    get typedSoql() {
        return (this.typedValue && this.typedValue.soql) || '';
    }

    get typedQuestions() {
        return (this.typedContext && this.typedContext.questions) || [];
    }

    get typedSpec() {
        return this.typedContext && this.typedContext.spec;
    }

    get typedActionId() {
        return this.typedContext && this.typedContext.actionId;
    }

    /** Only one of the two is used; the other is kept to switch back to. */
    get otherModeNote() {
        if (!this.allowTyped) {
            return '';
        }
        if (this.onTyped) {
            const n = (
                (this._value &&
                    this._value.filter &&
                    this._value.filter.rows) ||
                []
            ).length;
            return n
                ? 'Only the SOQL is used. The conditions you built are kept, in case you switch back.'
                : '';
        }
        return this.typedSoql.trim()
            ? 'Only these conditions are used. The SOQL you wrote is kept, in case you switch back.'
            : '';
    }

    handleMode(event) {
        event.stopPropagation();
        this._emit(this._value || {}, {
            mode: event.detail.value,
            soql: this.typedSoql
        });
    }

    handleSoql(event) {
        event.stopPropagation();
        this._emit(this._value || {}, {
            mode: 'soql',
            soql: event.detail.value || ''
        });
    }

    /**
     * Every edit saves. A row nobody has started isn't saved (it would only
     * make the step "Not finished"), unless custom logic counts on its
     * number.
     */
    handleInlineRule(event) {
        event.stopPropagation();
        const next = (event.detail && event.detail.value) || null;
        this.draft = next;
        const rules = (next && next.rules) || [];
        const custom = Boolean(next && next.logic === 'custom');
        const kept = custom
            ? rules
            : rules.filter(
                  (r) =>
                      r.source ||
                      (r.value !== undefined &&
                          r.value !== null &&
                          String(r.value).trim() !== '')
              );
        const filter = {
            logic: (next && next.logic) || 'all',
            customLogic: (next && next.customLogic) || null,
            rows: kept.map((rule) => this._toRow(rule))
        };
        this._draftFor = filterKey(filter);
        this._emit({ ...(this._value || {}), filter });
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
        this._emit({ ...(this._value || {}), filter }, event.detail.typed);
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

    /** `typed` rides along only from the dialog: { mode, soql }. */
    _emit(value, typed) {
        this._value = value;
        this.dispatchEvent(
            new CustomEvent('lookupconfigchange', {
                detail: typed ? { value, typed } : { value }
            })
        );
    }
}
