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

export default class FinalRuleEditor extends LightningElement {
    /** The visibility config (§7) or null/undefined = always visible. */
    @api value;
    /** Pickable source elements: [{id, label}] — scoped by the studio
     *  (repeater elements never offered outside their section, §7). */
    @api sources = [];
    /** Map(id → {type, repeatSectionId}) for the engine's lint. */
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

    get rows() {
        const rules = (this.value && this.value.rules) || [];
        return rules.map((rule, i) => ({
            key: `rule_${i}`,
            index: i,
            number: i + 1,
            needsValue: !NO_VALUE.has(rule.operator),
            value: rule.value,
            sourceOptions: (this.sources || []).map((s) => ({
                value: s.id,
                label: s.label,
                selected: s.id === rule.source ? true : undefined
            })),
            operatorOptions: OPERATOR_OPTIONS.map((o) => ({
                ...o,
                selected: o.value === rule.operator ? true : undefined
            }))
        }));
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
        this._emit(next);
    }
}
