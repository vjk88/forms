import { LightningElement, api } from 'lwc';
import { lintVisibility, validateCustomLogic } from 'c/finalExpressionEngine';
import { typeForPath } from 'c/finalFieldPicker';

/**
 * finalRuleEditor — the condition editor, laid out the way the Form
 * Designer's was (IMPL_PLAN_F2_SEARCH decision 1, D53): one row per
 * condition, labelled columns shown once, Salesforce dropdowns, the logic
 * choice on top and "Add condition" underneath. Owner ruling still stands:
 * never raw expressions — rows of source · operator · value.
 *
 * DUMB view: emits the FULL next config as `rulechange` {value} on every
 * edit (null when the last condition is removed); whoever hosts it owns the
 * value. The conditions dialog hosts it over a draft, so nothing here reaches
 * a form until the author applies.
 *
 * Problems (a row missing its field, operator or value; logic that can't
 * run) are listed by `problems` and shown under the control that needs
 * fixing — once that row has been touched, or after `reportProblems()`.
 * Lint runs the SAME engine the runtime evaluates with (lintVisibility), and
 * only warns.
 *
 * re- prefixed classes (LEX leak rule).
 */

const OPERATOR_OPTIONS = [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Does not equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'greaterThan', label: 'Greater than' },
    { value: 'lessThan', label: 'Less than' },
    { value: 'isBlank', label: 'Is blank' },
    { value: 'isNotBlank', label: 'Is not blank' }
];

const NO_VALUE = new Set(['isBlank', 'isNotBlank']);

/**
 * Lookup filters speak a wider vocabulary than visibility rules, because they
 * compile to SOQL rather than to a yes/no in the browser. A caller supplies
 * these through `extraOperators`; visibility rules never see them, so the
 * expression engine's operator set is untouched and saved rules cannot break.
 */
const OPERATOR_LABELS = new Map(
    OPERATOR_OPTIONS.map((o) => [o.value, o.label])
);

/**
 * Which operators make sense per source subtype (PENDING_WORK §9.3).
 *
 * `contains` is KEPT wherever a source can hold multiple values (owner ruling
 * 2026-09-06): multipicklist and multi-select choice answers arrive as arrays
 * and the engine's `contains` is what matches a single option inside them —
 * dropping it would silently break saved rules.
 *
 * greater/lessThan appear only where a comparison can actually coerce, which
 * is the preventive twin of lintVisibility's existing "greater/less-than needs
 * a numeric value or a date source" warning.
 *
 * A subtype absent from this map (file, unknown, and every `record:` source)
 * keeps the full list — untyped is the safe default, never a narrowed guess.
 */
const TEXTUAL = ['equals', 'notEquals', 'contains', 'isBlank', 'isNotBlank'];
const ORDERED = [
    'equals',
    'notEquals',
    'greaterThan',
    'lessThan',
    'isBlank',
    'isNotBlank'
];
const OPERATORS_BY_TYPE = {
    // A Salesforce checkbox is never null — it is true or false — so the blank
    // operators would read as choices that can never match.
    checkbox: ['equals', 'notEquals'],
    number: ORDERED,
    date: ORDERED,
    datetime: ORDERED,
    picklist: TEXTUAL,
    text: TEXTUAL,
    textarea: TEXTUAL,
    email: TEXTUAL,
    phone: TEXTUAL,
    url: TEXTUAL
};

/** Value control per subtype. Picklist deliberately stays 'text' — the option
 *  dropdown is DEFERRED (ledger #29) because a control cannot represent a
 *  stored value that is missing from its options. */
const VALUE_KIND = {
    checkbox: 'bool',
    number: 'number',
    date: 'date',
    datetime: 'datetime'
};

const BOOL_VALUES = new Set(['true', 'false']);

/** Can the typed control for `kind` actually DISPLAY `value`? A number/date
 *  input and a Yes/No choice cannot represent values outside their domain,
 *  which would leave the visible control disagreeing with the stored rule —
 *  the same silent-divergence trap that deferred the picklist dropdown. Where
 *  we cannot show it, we clear it deliberately. */
function canDisplay(kind, value) {
    if (value === '' || value === null || value === undefined) {
        return true;
    }
    const s = String(value);
    if (kind === 'bool') {
        return BOOL_VALUES.has(s);
    }
    if (['number', 'date', 'datetime'].includes(kind)) {
        // Use the browser's input-value sanitizer, not Number/Date.parse:
        // those accept values such as hex numbers, date-only datetimes and
        // zoned timestamps that the corresponding native control blanks out.
        // This detached input is used only when the author changes a source.
        const input = document.createElement('input');
        input.type = kind === 'datetime' ? 'datetime-local' : kind;
        input.value = s;
        return input.value !== '';
    }
    return true;
}

/** Which Source a saved row belongs to. `record:` is the linked record;
 *  anything else set is an answer. An unset row keeps the kind its author
 *  chose (tracked beside the rows, since an empty source says nothing). */
function kindOf(source, chosen) {
    if (typeof source === 'string' && source.startsWith('record:')) {
        return 'record';
    }
    if (typeof source === 'string' && source.startsWith('user:')) {
        return 'user';
    }
    if (typeof source === 'string' && source !== '') {
        return 'answer';
    }
    return chosen || 'answer';
}

const isBlankValue = (v) => v === '' || v === null || v === undefined;

/**
 * Current user (D55): any User field, plus the two an admin reaches for
 * first. Profile.Name and UserRole.Name are paths the picker must not treat
 * as relationships to open.
 */
export const USER_EXTRAS = [
    { value: 'user:Profile.Name', label: 'Profile name', type: 'string' },
    { value: 'user:UserRole.Name', label: 'Role name', type: 'string' }
];

/** The same two, as a lookup filter's compare-with value (read server-side). */
export const USER_VALUE_EXTRAS = USER_EXTRAS.map((x) => ({
    ...x,
    value: `$User.${x.value.slice(5)}`
}));

/** Salesforce display types → this editor's subtypes (operators, value controls). */
const DISPLAY_TO_SUBTYPE = {
    string: 'text',
    textarea: 'textarea',
    email: 'email',
    phone: 'phone',
    url: 'url',
    picklist: 'picklist',
    boolean: 'checkbox',
    double: 'number',
    currency: 'number',
    percent: 'number',
    integer: 'number',
    long: 'number',
    date: 'date',
    datetime: 'datetime'
};

/**
 * What a saved-but-gone source is called. A question's id means nothing to
 * an author, so it's "Removed question"; a field path does, so it stays.
 */
export function removedLabel(source, isVisibility) {
    if (source.startsWith('record:')) {
        return `Removed field (${source.slice(7)})`;
    }
    if (source.startsWith('user:')) {
        return `Current user › ${source.slice(5)}`;
    }
    return isVisibility ? 'Removed question' : `${source} (not available)`;
}

const COLUMN_SETS = {
    visibility: ['Source', 'Question or field', 'Operator', 'Value'],
    lookup: ['Field', 'Operator', 'Value'],
    // The Compare with column arrives with answers in mapping rows (Task 7);
    // until then the mapping search reads exactly like a lookup filter.
    mapping: ['Field', 'Operator', 'Value']
};

export default class FinalRuleEditor extends LightningElement {
    /** The visibility config (§7) or null/undefined = always visible. */
    @api value;

    /**
     * Extra `{value, label}` operators this editor should offer, appended to
     * the built-in list. Lookup filters use it for the comparisons SOQL has
     * and a browser rule does not (at-most, at-least, in, includes, excludes).
     */
    @api extraOperators;

    /** Pickable source elements: [{id, label}] — scoped by the studio
     *  (repeater elements never offered outside their section, §7). */
    @api sources = [];
    /** SO-3 record-field sources ([{id: 'record:Api', label}]) — non-empty
     *  only when the form has a linked record; adds "The linked record". */
    @api recordSources = [];
    /** Map(id → {type, inputType, repeatSectionId}). `type` is the engine's
     *  lint key (collapsed, matching the runtime's own index); `inputType` is
     *  the granular subtype this editor types operators and value controls
     *  on. Absent or unknown `inputType` = stay fully untyped. */
    @api sourceIndex;
    /** The repeat section this node lives inside, or null (lint scoping). */
    @api hostRepeatSectionId;
    /** What the rules govern, for copy: "field" | "section" | "page". */
    @api noun = 'field';

    /**
     * Which screen this is: 'visibility' (the default — Show/Hide a part of
     * the form), 'lookup' (which records a lookup offers) or 'mapping' (which
     * records a find-or-create step searches). Picks the column set and the
     * wording (IMPL_PLAN_F2_SEARCH decision 2).
     */
    @api columns = 'visibility';

    /**
     * The object whose fields the Field column searches (lookup and mapping
     * screens), and the linked record's object (visibility). With one, the
     * column is the searchable field picker with related fields (D54);
     * without, it's a plain list of `sources` / `recordSources`.
     */
    @api fieldObject;
    @api recordObject;

    /** The Source each unset row was given, index-aligned with the rules. */
    _kinds = [];
    /** Controls the author has used, as "row:control"; their problems show. */
    _touched = new Set();
    /** A selector to focus after the next render (add / remove). */
    _focusNext = null;
    _logicTouched = false;
    /** After reportProblems(): every problem shows. */
    _showAll = false;

    get isVisibility() {
        return !this.columns || this.columns === 'visibility';
    }

    /**
     * Lookup filters may compare with the signed-in person's own details
     * (D55) — not when the lookup allows anonymous search, where "current
     * user" would be the site guest. The server reads the value itself.
     */
    @api allowCurrentUser = false;

    get userValueExtras() {
        return USER_VALUE_EXTRAS;
    }

    /** What a record screen's value can be compared with. */
    get compareOptions() {
        const out = [{ value: 'fixed', label: 'A fixed value' }];
        if (this.columns === 'lookup' && this.allowCurrentUser) {
            out.push({ value: 'user', label: 'Current user' });
        }
        return out;
    }

    /** One choice is no choice: the column only shows with two or more. */
    get showCompare() {
        return !this.isVisibility && this.compareOptions.length > 1;
    }

    /** Where a row's value comes from; an unset row keeps its chosen kind. */
    _compareOf(rule, i) {
        if (typeof rule.value === 'string' && rule.value.startsWith('$User.')) {
            return 'user';
        }
        return isBlankValue(rule.value) && this._compare[i]
            ? this._compare[i]
            : 'fixed';
    }

    /** Compare-with choice per unset row, index-aligned with the rules. */
    _compare = [];

    get headers() {
        let labels = COLUMN_SETS[this.columns] || COLUMN_SETS.visibility;
        if (this.showCompare) {
            labels = ['Field', 'Operator', 'Compare with', 'Value'];
        }
        return labels.map((label) => ({ key: label, label }));
    }

    /** The field column's heading, repeated above each field when stacked. */
    get fieldHeader() {
        return this.isVisibility ? 'Question or field' : 'Field';
    }

    get gridClass() {
        return this.isVisibility || this.showCompare
            ? 're-grid re-grid--4'
            : 're-grid re-grid--3';
    }

    get rules() {
        return (
            (this.value &&
                Array.isArray(this.value.rules) &&
                this.value.rules) ||
            []
        );
    }

    get hasRules() {
        return this.rules.length > 0;
    }

    get emptyHint() {
        if (!this.isVisibility) {
            return 'No conditions yet. Add one to narrow which records are searched.';
        }
        return `No conditions yet — this ${this.noun} is always shown. Add a condition to make it conditional.`;
    }

    get action() {
        return (this.value && this.value.action) || 'show';
    }

    get actionOptions() {
        return [
            { value: 'show', label: 'Show' },
            { value: 'hide', label: 'Hide' }
        ];
    }

    get logic() {
        return (this.value && this.value.logic) || 'all';
    }

    get logicLabel() {
        if (!this.isVisibility) {
            return 'Search records where';
        }
        return this.action === 'hide' ? 'Hide when' : 'Show when';
    }

    get logicOptions() {
        return [
            { value: 'all', label: 'All conditions are met (AND)' },
            { value: 'any', label: 'Any condition is met (OR)' },
            { value: 'custom', label: 'Custom logic' }
        ];
    }

    get isCustomLogic() {
        return this.logic === 'custom';
    }

    get customLogic() {
        return (this.value && this.value.customLogic) || '';
    }

    get sourceKindOptions() {
        return [
            { value: 'answer', label: 'An answer' },
            { value: 'record', label: 'Linked record' },
            { value: 'user', label: 'Current user' }
        ];
    }

    _kindOptions(kind) {
        return this.sourceKindOptions.filter(
            (o) =>
                o.value !== 'record' ||
                this.hasRecordSources ||
                kind === 'record'
        );
    }

    /** Whether the form is public — user conditions say what that means. */
    @api isPublic = false;

    /** Current user's field types, as this editor's subtypes, by source. */
    _userTypes = {};

    get userHint() {
        const hasUser = this.rules.some(
            (r) => typeof r.source === 'string' && r.source.startsWith('user:')
        );
        if (!hasUser) {
            return '';
        }
        const guests = this.isPublic
            ? 'People who aren’t signed in have no user details, so this ' +
              'condition never counts as met for them. '
            : '';
        return (
            guests +
            'This tidies what people see; anyone determined can still find ' +
            'hidden questions in the page, so don’t rely on it to keep ' +
            'things private.'
        );
    }

    /** The linked record is offered when there's one to read: its fields
     *  listed (Surveys) or its object known (any form with a record, D56). */
    get hasRecordSources() {
        return Boolean(
            (this.recordSources && this.recordSources.length) ||
            this.recordObject
        );
    }

    /** SO-3 no-context posture, spelled out where the author writes the
     *  rule. The hide-action variant is the trap (SO review): without a
     *  record link a hide-rule never matches — content it was supposed to
     *  suppress stays VISIBLE. */
    get recordHint() {
        const hasRecord = this.rules.some(
            (r) =>
                typeof r.source === 'string' && r.source.startsWith('record:')
        );
        if (!hasRecord) {
            return '';
        }
        return this.action === 'hide'
            ? 'Conditions on the linked record only work when the form opens ' +
                  'with a record. Without one, this Hide never happens — the ' +
                  'content stays visible. If it must stay private, use Show ' +
                  'instead.'
            : 'Conditions on the linked record only work when the form opens ' +
                  'with a record. Without one, this stays hidden.';
    }

    /** The source's granular subtype, or null when it has none we can type on
     *  (a `record:` row, or an element the index doesn't carry). */
    _subtype(source) {
        if (typeof source === 'string' && source.startsWith('user:')) {
            return this._userTypes[source] || null;
        }
        const meta =
            this.sourceIndex && this.sourceIndex.get
                ? this.sourceIndex.get(source)
                : null;
        return (meta && meta.inputType) || null;
    }

    _valueKind(source) {
        return VALUE_KIND[this._subtype(source)] || 'text';
    }

    _extra() {
        return Array.isArray(this.extraOperators) ? this.extraOperators : [];
    }

    _operatorLabel(v) {
        const found = this._extra().find((o) => o.value === v);
        return found ? found.label : OPERATOR_LABELS.get(v);
    }

    _operatorOptions(rule) {
        const allowed = OPERATORS_BY_TYPE[this._subtype(rule.source)];
        let options = (allowed || OPERATOR_OPTIONS.map((o) => o.value))
            .concat(this._extra().map((o) => o.value))
            .map((v) => ({ value: v, label: this._operatorLabel(v) }));
        // A saved rule may hold an operator this subtype no longer offers
        // (authored before typing, or the source was repointed). Show it
        // rather than let the control resolve to nothing and rewrite the rule
        // on the next unrelated edit.
        if (rule.operator && !options.some((o) => o.value === rule.operator)) {
            options = [
                ...options,
                {
                    value: rule.operator,
                    label: `${
                        this._operatorLabel(rule.operator) || rule.operator
                    } (not valid here)`
                }
            ];
        }
        return options;
    }

    _fieldOptions(rule, kind) {
        const list =
            kind === 'record' ? this.recordSources || [] : this.sources || [];
        const options = list.map((s) => ({ value: s.id, label: s.label }));
        // A saved source that is no longer offered stays visible and selected,
        // so opening the editor never changes a rule by itself.
        if (rule.source && !options.some((o) => o.value === rule.source)) {
            options.push({
                value: rule.source,
                label: removedLabel(rule.source, this.isVisibility)
            });
        }
        return options;
    }

    _boolOptions(value) {
        return [
            // Preserve an invalid saved value visibly, just as we do for saved
            // operators; opening the editor must not alter it.
            ...(!canDisplay('bool', value)
                ? [{ value: String(value), label: `${value} (not valid here)` }]
                : []),
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' }
        ];
    }

    /**
     * Every problem that stops these conditions being applied, whether or not
     * it is showing yet: [{ rowIndex, control, message }]. `control` is
     * 'field' | 'operator' | 'value' | 'logic' (rowIndex null for logic).
     */
    @api
    get problems() {
        const out = [];
        this.rules.forEach((rule, i) => {
            if (!rule.source) {
                out.push({
                    rowIndex: i,
                    control: 'field',
                    message: this.isVisibility
                        ? 'Choose a question or field.'
                        : 'Choose a field.'
                });
            }
            if (!rule.operator) {
                out.push({
                    rowIndex: i,
                    control: 'operator',
                    message: 'Choose an operator.'
                });
            } else if (
                !NO_VALUE.has(rule.operator) &&
                isBlankValue(rule.value)
            ) {
                out.push({
                    rowIndex: i,
                    control: 'value',
                    message:
                        this._valueKind(rule.source) === 'bool'
                            ? 'Choose Yes or No.'
                            : this._compareOf(rule, i) === 'user'
                              ? 'Choose a user field.'
                              : 'Enter a value, or use “Is blank”.'
                });
            } else if (
                this.columns === 'lookup' &&
                !this.allowCurrentUser &&
                this._compareOf(rule, i) === 'user'
            ) {
                // Anonymous search was switched on after this was set up.
                out.push({
                    rowIndex: i,
                    control: 'value',
                    message:
                        'Current user can’t be used while people who aren’t ' +
                        'signed in can search this lookup.'
                });
            }
        });
        if (this.isCustomLogic && this.hasRules) {
            const message = validateCustomLogic(
                this.customLogic,
                this.rules.length
            );
            if (message) {
                out.push({ rowIndex: null, control: 'logic', message });
            }
        }
        return out;
    }

    /** Show every problem, and return the first (or null when there are none). */
    @api
    reportProblems() {
        this._showAll = true;
        const all = this.problems;
        return all.length ? all[0] : null;
    }

    /** Forget what has been touched — for Clear all, which starts over. */
    @api
    reset() {
        this._kinds = [];
        this._touched = new Set();
        this._logicTouched = false;
        this._showAll = false;
    }

    /**
     * Indexes of rows the author added and never used: no field, no value,
     * nothing touched. Apply drops them rather than refusing over them.
     */
    @api
    untouchedBlankRows() {
        const out = [];
        this.rules.forEach((rule, i) => {
            const touched = [...this._touched].some((k) =>
                k.startsWith(`${i}:`)
            );
            if (!touched && !rule.source && isBlankValue(rule.value)) {
                out.push(i);
            }
        });
        return out;
    }

    /** Put the cursor on a problem's control. */
    @api
    focusProblem(problem) {
        if (!problem) {
            return;
        }
        const selector =
            problem.control === 'logic'
                ? '[data-control="logic"]'
                : `[data-index="${problem.rowIndex}"][data-control="${problem.control}"]`;
        const target = this.template.querySelector(selector);
        if (target && typeof target.focus === 'function') {
            target.focus();
        }
    }

    _visible(problem) {
        if (this._showAll) {
            return true;
        }
        // Per control, not per row: picking a field must not turn the value
        // red before the author has even reached it.
        return problem.control === 'logic'
            ? this._logicTouched
            : this._touched.has(`${problem.rowIndex}:${problem.control}`);
    }

    /** The shown message for one control, or ''. */
    _shownMessage(rowIndex, control) {
        const p = this.problems.find(
            (x) =>
                x.rowIndex === rowIndex &&
                x.control === control &&
                this._visible(x)
        );
        return p ? p.message : '';
    }

    /**
     * Problems go on the controls themselves (setCustomValidity), so the
     * control turns red, is marked invalid and says its message to a screen
     * reader. Only the native datetime input needs the text line instead.
     */
    /** Saved user conditions learn their field types from User's describe. */
    _resolveUserTypes() {
        const missing = this.rules
            .map((r) => r.source)
            .filter(
                (s) =>
                    typeof s === 'string' &&
                    s.startsWith('user:') &&
                    !(s in this._userTypes) &&
                    !(this._askedTypes || new Set()).has(s)
            );
        if (!missing.length) {
            return;
        }
        this._askedTypes = new Set([...(this._askedTypes || []), ...missing]);
        missing.forEach((source) => {
            const extra = USER_EXTRAS.find((x) => x.value === source);
            const pending = extra
                ? Promise.resolve(extra.type)
                : typeForPath('User', source.slice(5));
            pending.then((type) => {
                this._userTypes = {
                    ...this._userTypes,
                    [source]: DISPLAY_TO_SUBTYPE[type] || null
                };
            });
        });
    }

    renderedCallback() {
        this._resolveUserTypes();
        this.template.querySelectorAll('[data-control]').forEach((node) => {
            if (
                typeof node.setCustomValidity !== 'function' ||
                node.tagName === 'INPUT' ||
                node.dataset.control === 'kind'
            ) {
                return;
            }
            const message =
                node.dataset.control === 'logic'
                    ? this.logicProblem
                    : this._shownMessage(
                          Number(node.dataset.index),
                          node.dataset.control
                      );
            const wasShown = node.dataset.reported === '1';
            if (!message && !wasShown) {
                return;
            }
            node.setCustomValidity(message);
            node.reportValidity();
            node.dataset.reported = message ? '1' : '';
        });
        if (this._focusNext) {
            const target = this.template.querySelector(this._focusNext);
            this._focusNext = null;
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        }
    }

    get logicProblem() {
        const p = this.problems.find(
            (x) => x.control === 'logic' && this._visible(x)
        );
        return p ? p.message : '';
    }

    get rows() {
        const messageFor = (i, control) => this._shownMessage(i, control);
        return this.rules.map((rule, i) => {
            const kind = kindOf(rule.source, this._kinds[i]);
            const valueKind = this._valueKind(rule.source);
            let pickerObject = this.fieldObject;
            if (this.isVisibility) {
                pickerObject =
                    kind === 'record'
                        ? this.recordObject
                        : kind === 'user'
                          ? 'User'
                          : null;
            }
            return {
                usePicker: Boolean(pickerObject),
                pickerObject,
                pickerPrefix:
                    kind === 'record'
                        ? 'record:'
                        : kind === 'user'
                          ? 'user:'
                          : '',
                pickerExtras: kind === 'user' ? USER_EXTRAS : [],
                showCompare: this.showCompare,
                compareKind: this._compareOf(rule, i),
                compareOptions: this.compareOptions,
                compareLabel: `Condition ${i + 1}: compare with`,
                valueIsUser: this._compareOf(rule, i) === 'user',
                key: `rule_${i}`,
                index: i,
                number: i + 1,
                kind,
                source: rule.source || '',
                operator: rule.operator || '',
                // lightning inputs stamp "undefined" for a missing value —
                // ''-guard (0/false stay: they're real comparison values)
                value: rule.value == null ? '' : String(rule.value),
                needsValue: !NO_VALUE.has(rule.operator),
                isBool: valueKind === 'bool',
                isNumber: valueKind === 'number',
                isDate: valueKind === 'date',
                isDateTime: valueKind === 'datetime',
                isText: valueKind === 'text',
                boolOptions: this._boolOptions(rule.value),
                sourceKindOptions: this._kindOptions(kind),
                fieldOptions: this._fieldOptions(rule, kind),
                operatorOptions: this._operatorOptions(rule),
                fieldProblem: messageFor(i, 'field'),
                operatorProblem: messageFor(i, 'operator'),
                valueProblem: messageFor(i, 'value'),
                // Every row's controls say which condition they belong to;
                // "Field" four times over tells a screen reader nothing.
                kindLabel: `Condition ${i + 1}: source`,
                fieldLabel: `Condition ${i + 1}: ${
                    this.isVisibility ? 'question or field' : 'field'
                }`,
                operatorLabel: `Condition ${i + 1}: operator`,
                valueLabel: `Condition ${i + 1}: value`,
                removeLabel: `Remove condition ${i + 1}`,
                valueInvalid: messageFor(i, 'value') ? 'true' : undefined
            };
        });
    }

    /**
     * The runtime engine's lint, minus what `problems` already says beside
     * the control: an empty row isn't "not found", it's unfinished, and
     * logic that can't run is explained under the logic box.
     */
    get lintWarnings() {
        if (!this.hasRules || !this.sourceIndex) {
            return [];
        }
        const hasLogicProblem = this.problems.some(
            (p) => p.control === 'logic'
        );
        return lintVisibility(
            this.value,
            this.sourceIndex,
            this.hostRepeatSectionId || null
        )
            .filter((message) => {
                if (message.startsWith('The custom logic')) {
                    return !hasLogicProblem;
                }
                const n = /^Rule (\d+):/.exec(message);
                const rule = n ? this.rules[Number(n[1]) - 1] : null;
                if (!rule) {
                    return true;
                }
                if (message.includes('source element not found')) {
                    return Boolean(rule.source);
                }
                if (message.includes('needs a numeric value')) {
                    return !isBlankValue(rule.value);
                }
                return true;
            })
            .map((message) => message.replace(/^Rule (\d+)/, 'Condition $1'));
    }

    get hasLintWarnings() {
        return this.lintWarnings.length > 0;
    }

    // ---- intents (full-config emission; the host owns the value) ----

    _emit(next) {
        this.dispatchEvent(
            new CustomEvent('rulechange', { detail: { value: next } })
        );
    }

    _next() {
        return this.value
            ? JSON.parse(JSON.stringify(this.value))
            : { action: 'show', logic: 'all', customLogic: null, rules: [] };
    }

    /** The value a change event carries: lightning-* in detail, native in target. */
    _eventValue(event) {
        return event.detail && event.detail.value !== undefined
            ? event.detail.value
            : event.target.value;
    }

    handleAddRule() {
        const next = this._next();
        next.rules = next.rules || [];
        // Nothing is chosen for the author: an empty row asks for its field.
        next.rules.push({ source: '', operator: 'equals', value: '' });
        const added = next.rules.length - 1;
        this._kinds[added] = 'answer';
        // Straight to the new row's first choice.
        this._focusNext = `[data-index="${added}"][data-control="${
            this.isVisibility ? 'kind' : 'field'
        }"]`;
        this._emit(next);
    }

    handleRemoveRule(event) {
        const i = Number(event.currentTarget.dataset.index);
        const next = this._next();
        next.rules.splice(i, 1);
        this._kinds.splice(i, 1);
        this._compare.splice(i, 1);
        const shifted = new Set();
        this._touched.forEach((key) => {
            const [row, control] = key.split(':');
            const n = Number(row);
            if (n !== i) {
                shifted.add(`${n > i ? n - 1 : n}:${control}`);
            }
        });
        this._touched = shifted;
        // The button that was clicked is gone; land somewhere that still is.
        this._focusNext = next.rules.length
            ? `.re-del[data-index="${Math.min(i, next.rules.length - 1)}"]`
            : '.re-add';
        this._emit(next.rules.length ? next : null);
    }

    handleAction(event) {
        const next = this._next();
        next.action = this._eventValue(event);
        this._emit(next);
    }

    handleLogic(event) {
        const next = this._next();
        next.logic = this._eventValue(event);
        if (next.logic !== 'custom') {
            next.customLogic = null;
        }
        this._emit(next);
    }

    handleCustomLogic(event) {
        const next = this._next();
        next.customLogic = this._eventValue(event);
        this._emit(next);
    }

    /** Logic is judged when the author leaves the box, not mid-word. */
    handleLogicBlur() {
        this._logicTouched = true;
    }

    /** Switching a row between an answer and the linked record starts it over. */
    /** Switching what the value comes from empties it: nothing is guessed. */
    handleCompareKind(event) {
        const i = Number(event.currentTarget.dataset.index);
        const kind = this._eventValue(event);
        const next = this._next();
        const rule = next.rules[i];
        if (!rule || this._compareOf(rule, i) === kind) {
            return;
        }
        this._compare[i] = kind;
        rule.value = '';
        this._focusNext = `[data-index="${i}"][data-control="value"]`;
        this._emit(next);
    }

    handleSourceKind(event) {
        const i = Number(event.currentTarget.dataset.index);
        const kind = this._eventValue(event);
        const next = this._next();
        const rule = next.rules[i];
        if (!rule || kindOf(rule.source, this._kinds[i]) === kind) {
            return;
        }
        this._kinds[i] = kind;
        rule.source = '';
        rule.operator = 'equals';
        rule.value = '';
        this._emit(next);
    }

    handleRuleField(event) {
        const { index, control } = event.currentTarget.dataset;
        const i = Number(index);
        const next = this._next();
        const rule = next.rules[i];
        if (!rule) {
            return;
        }
        this._touched.add(`${i}:${control}`);
        const prop = control === 'field' ? 'source' : control;
        rule[prop] = this._eventValue(event);
        // A user field's type arrives with the pick; record it before the
        // operator and value are checked against it below.
        if (
            prop === 'source' &&
            typeof rule.source === 'string' &&
            rule.source.startsWith('user:') &&
            event.detail &&
            event.detail.type
        ) {
            this._userTypes = {
                ...this._userTypes,
                [rule.source]: DISPLAY_TO_SUBTYPE[event.detail.type] || null
            };
        }
        if (prop === 'operator' && NO_VALUE.has(rule.operator)) {
            rule.value = null;
        }
        if (prop === 'source') {
            // Repointing a rule can strand both halves against the new
            // subtype. Fix them HERE, where the author can see it happen,
            // rather than leaving a control that displays blank while the
            // stored rule still says something else.
            const allowed = OPERATORS_BY_TYPE[this._subtype(rule.source)];
            if (allowed && !allowed.includes(rule.operator)) {
                rule.operator = 'equals';
            }
            if (NO_VALUE.has(rule.operator)) {
                rule.value = null;
            } else if (!canDisplay(this._valueKind(rule.source), rule.value)) {
                rule.value = '';
            }
        }
        this._emit(next);
    }
}
