import { LightningElement, api } from 'lwc';
import { lintVisibility } from 'c/finalExpressionEngine';

/**
 * finalRuleEditor — the declarative visibility editor (schema §7, P3
 * slice 5). Lightning-record-page pattern (owner ruling: never raw
 * expressions): action (Show/Hide) + logic (All/Any/Custom) + rule rows of
 * source · operator · value. Renders ON the properties panel — the Logic
 * rail is only the aggregate index that jumps here.
 *
 * DUMB view: emits the FULL next config as `rulechange` {value} on every
 * edit (null when rules are removed entirely); the studio owns the spec.
 * Lint runs the SAME engine the runtime evaluates with (lintVisibility) —
 * build-time and runtime can never disagree.
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
 *  dropdown is DEFERRED (ledger #29) because a native select cannot represent
 *  a stored value that is missing from its options. */
const VALUE_KIND = {
    checkbox: 'bool',
    number: 'number',
    date: 'date',
    datetime: 'datetime'
};

const BOOL_VALUES = new Set(['true', 'false']);

/** Can the typed control for `kind` actually DISPLAY `value`? A native
 *  number/date input and a Yes/No select cannot represent values
 *  outside their domain, which would leave the visible control disagreeing
 *  with the stored rule — the same silent-divergence trap that deferred the
 *  picklist dropdown. Where we cannot show it, we clear it deliberately. */
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

export default class FinalRuleEditor extends LightningElement {
    /** The visibility config (§7) or null/undefined = always visible. */
    @api value;
    /** Pickable source elements: [{id, label}] — scoped by the studio
     *  (repeater elements never offered outside their section, §7). */
    @api sources = [];
    /** SO-3 record-field sources ([{id: 'record:Api', label}]) — non-empty
     *  only for surveys with a connected object; adds the second optgroup. */
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

    get hasRules() {
        return Boolean(
            this.value &&
            Array.isArray(this.value.rules) &&
            this.value.rules.length
        );
    }

    get emptyHint() {
        return `Always visible. Add a rule to show or hide this ${this.noun} based on another answer.`;
    }

    get actionOptions() {
        const action = (this.value && this.value.action) || 'show';
        return [
            {
                value: 'show',
                label: 'Show',
                selected: action === 'show' ? true : undefined
            },
            {
                value: 'hide',
                label: 'Hide',
                selected: action === 'hide' ? true : undefined
            }
        ];
    }

    get logicOptions() {
        const logic = (this.value && this.value.logic) || 'all';
        return [
            {
                value: 'all',
                label: 'ALL rules match',
                selected: logic === 'all' ? true : undefined
            },
            {
                value: 'any',
                label: 'ANY rule matches',
                selected: logic === 'any' ? true : undefined
            },
            {
                value: 'custom',
                label: 'Custom logic…',
                selected: logic === 'custom' ? true : undefined
            }
        ];
    }

    get isCustomLogic() {
        return Boolean(this.value && this.value.logic === 'custom');
    }

    get customLogic() {
        return (this.value && this.value.customLogic) || '';
    }

    get hasRecordSources() {
        return Boolean(this.recordSources && this.recordSources.length);
    }

    /** SO-3 no-context posture, spelled out where the author writes the
     *  rule. The hide-action variant is the trap (SO review): without a
     *  record link a hide-rule never matches — content it was supposed to
     *  suppress stays VISIBLE. */
    get recordHint() {
        const rules = (this.value && this.value.rules) || [];
        const hasRecord = rules.some(
            (r) =>
                typeof r.source === 'string' && r.source.startsWith('record:')
        );
        if (!hasRecord) {
            return '';
        }
        const action = (this.value && this.value.action) || 'show';
        return action === 'hide'
            ? 'Record rules only work when the survey opens from a record ' +
                  'link. Without one, this HIDE rule never matches — the ' +
                  'content stays visible. If it must stay private, use a ' +
                  'Show rule instead.'
            : 'Record rules only work when the survey opens from a record ' +
                  'link. Without one, this content stays hidden.';
    }

    /** The source's granular subtype, or null when it has none we can type on
     *  (a `record:` row, or an element the index doesn't carry). */
    _subtype(source) {
        const meta =
            this.sourceIndex && this.sourceIndex.get
                ? this.sourceIndex.get(source)
                : null;
        return (meta && meta.inputType) || null;
    }

    _valueKind(source) {
        return VALUE_KIND[this._subtype(source)] || 'text';
    }

    get rows() {
        const rules = (this.value && this.value.rules) || [];
        return rules.map((rule, i) => {
            const allowed = OPERATORS_BY_TYPE[this._subtype(rule.source)];
            let operatorOptions = (
                allowed || OPERATOR_OPTIONS.map((o) => o.value)
            ).map((v) => ({
                value: v,
                label: OPERATOR_LABELS.get(v),
                selected: v === rule.operator ? true : undefined
            }));
            // A saved rule may hold an operator this subtype no longer offers
            // (authored before typing, or the source was repointed). Show it
            // rather than let the select silently resolve to its first option
            // and rewrite the rule on the next unrelated edit.
            if (rule.operator && !operatorOptions.some((o) => o.selected)) {
                operatorOptions = [
                    ...operatorOptions,
                    {
                        value: rule.operator,
                        label: `${
                            OPERATOR_LABELS.get(rule.operator) || rule.operator
                        } (not valid here)`,
                        selected: true
                    }
                ];
            }
            const kind = this._valueKind(rule.source);
            return {
                key: `rule_${i}`,
                index: i,
                number: i + 1,
                needsValue: !NO_VALUE.has(rule.operator),
                // raw <input> stamps literal "undefined" for a missing value —
                // ''-guard (0/false stay: they're real comparison values)
                value: rule.value == null ? '' : rule.value,
                isBool: kind === 'bool',
                isNumber: kind === 'number',
                isDate: kind === 'date',
                isDateTime: kind === 'datetime',
                boolOptions: [
                    {
                        value: '',
                        label: 'Choose Yes or No'
                    },
                    // Preserve an invalid saved value visibly, just as we do
                    // for saved operators; opening the editor must not alter it.
                    ...(!canDisplay('bool', rule.value)
                        ? [
                              {
                                  value: String(rule.value),
                                  label: `${rule.value} (not valid here)`
                              }
                          ]
                        : []),
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' }
                ].map((o) => ({
                    ...o,
                    selected:
                        o.value === String(rule.value ?? '') ? true : undefined
                })),
                sourceOptions: (this.sources || []).map((s) => ({
                    value: s.id,
                    label: s.label,
                    selected: s.id === rule.source ? true : undefined
                })),
                recordOptions: (this.recordSources || []).map((s) => ({
                    value: s.id,
                    label: s.label,
                    selected: s.id === rule.source ? true : undefined
                })),
                operatorOptions
            };
        });
    }

    get problems() {
        if (!this.hasRules || !this.sourceIndex) {
            return [];
        }
        return lintVisibility(
            this.value,
            this.sourceIndex,
            this.hostRepeatSectionId || null
        );
    }

    get hasProblems() {
        return this.problems.length > 0;
    }

    // ---- intents (full-config emission; the studio owns the spec) ----

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

    handleAddRule() {
        const next = this._next();
        const first = (this.sources || [])[0];
        next.rules.push({
            source: first ? first.id : '',
            operator: 'equals',
            value: ''
        });
        this._emit(next);
    }

    handleRemoveRule(event) {
        const i = Number(event.currentTarget.dataset.index);
        const next = this._next();
        next.rules.splice(i, 1);
        this._emit(next.rules.length ? next : null);
    }

    handleAction(event) {
        const next = this._next();
        next.action = event.target.value;
        this._emit(next);
    }

    handleLogic(event) {
        const next = this._next();
        next.logic = event.target.value;
        if (next.logic !== 'custom') {
            next.customLogic = null;
        }
        this._emit(next);
    }

    handleCustomLogic(event) {
        const next = this._next();
        next.customLogic = event.target.value;
        this._emit(next);
    }

    handleRuleField(event) {
        const { index, prop } = event.currentTarget.dataset;
        const next = this._next();
        const rule = next.rules[Number(index)];
        if (!rule) {
            return;
        }
        rule[prop] = event.target.value;
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
