import { LightningElement, api } from 'lwc';
import FinalConditionsModal from 'c/finalConditionsModal';
import { removedLabel, USER_EXTRAS } from 'c/finalRuleEditor';
import { labelForPath } from 'c/finalFieldPicker';

/**
 * What a screen shows of its conditions (IMPL_PLAN_F2_SEARCH decision 19):
 * each condition spelled out in words, numbered so the logic line means
 * something, and Edit conditions — which opens the dialog. The old Form
 * Builder panel (propertyPanel.visibilityDisplay) did this with API names;
 * this uses the labels the author picked from.
 *
 * Emits `conditionschange` {value} only when the dialog is applied.
 * cs- prefixed classes (LEX leak rule).
 */

const OPERATOR_WORDS = {
    equals: 'equals',
    notEquals: 'does not equal',
    contains: 'contains',
    greaterThan: 'is greater than',
    lessThan: 'is less than',
    isBlank: 'is blank',
    isNotBlank: 'is not blank',
    lte: 'is at most',
    gte: 'is at least',
    in: 'is one of',
    nin: 'is not one of',
    includes: 'includes any of',
    excludes: 'excludes all of'
};

const NO_VALUE = new Set(['isBlank', 'isNotBlank']);
const LIST_OPERATORS = new Set(['in', 'nin', 'includes', 'excludes']);
const MAX_SHOWN = 5;

/**
 * One condition as a sentence. `labels` maps a source id or field path to
 * the label the author saw; `types` (optional) maps it to its subtype so a
 * checkbox reads Yes / No. A source that is gone reads "Removed question"
 * (or its field path on a record screen) — never an element id, never blank.
 */
export function describeCondition(
    rule,
    labels = new Map(),
    types = new Map(),
    isVisibility = true
) {
    const source = (rule && rule.source) || '';
    let subject = labels.get(source) || '';
    if (subject && source.startsWith('record:')) {
        subject = `Linked record › ${subject}`;
    }
    if (!subject) {
        // Gone from the form: never a raw element id, never blank.
        subject = source
            ? removedLabel(source, isVisibility)
            : '(no field chosen)';
    }
    const op = OPERATOR_WORDS[rule.operator] || rule.operator || '';
    if (NO_VALUE.has(rule.operator)) {
        return `${subject} ${op}`;
    }
    const raw = rule.value;
    let shown;
    if (
        types.get(source) === 'checkbox' &&
        (raw === 'true' || raw === 'false')
    ) {
        shown = raw === 'true' ? 'Yes' : 'No';
    } else if (typeof raw === 'string' && raw.startsWith('$User.')) {
        shown = labels.get(raw) || `Current user › ${raw.slice(6)}`;
    } else if (LIST_OPERATORS.has(rule.operator)) {
        const items = Array.isArray(raw)
            ? raw
            : String(raw == null ? '' : raw)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
        shown = items.map((v) => `“${v}”`).join(', ');
    } else {
        shown = `“${raw == null ? '' : raw}”`;
    }
    return `${subject} ${op} ${shown}`;
}

export default class FinalConditionsSummary extends LightningElement {
    /** The conditions, in the rule editor's shape ({action, logic, customLogic, rules}). */
    @api value;
    /** 'visibility' | 'lookup' | 'mapping' — see c/finalRuleEditor. */
    @api columns = 'visibility';
    @api sources = [];
    @api recordSources = [];
    @api sourceIndex;
    @api hostRepeatSectionId;
    @api noun = 'field';
    @api extraOperators;
    /** The objects the field picker searches — see c/finalRuleEditor. */
    @api fieldObject;
    /** Whether the form is public — user conditions say what that means. */
    @api isPublic = false;
    /** Lookup filters: may compare with the signed-in person (D55). */
    @api allowCurrentUser = false;
    @api recordObject;
    /** The dialog's title and sentence. */
    @api label;
    @api description;
    /** Off while the fields it would offer are still loading. */
    @api disabled = false;

    _opening = false;

    get isVisibility() {
        return !this.columns || this.columns === 'visibility';
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

    get emptyText() {
        return this.isVisibility ? 'Always shown' : 'No conditions';
    }

    get heading() {
        const lead = this.isVisibility
            ? this.value && this.value.action === 'hide'
                ? 'Hide when'
                : 'Show when'
            : 'Only records where';
        if (this.rules.length === 1) {
            return `${lead}:`;
        }
        const logic = (this.value && this.value.logic) || 'all';
        if (logic === 'any') {
            return `${lead} any is met:`;
        }
        if (logic === 'custom') {
            return `${lead} custom logic is met:`;
        }
        return `${lead} all are met:`;
    }

    get _labels() {
        const map = new Map(Object.entries(this._pathLabels));
        [...(this.sources || []), ...(this.recordSources || [])].forEach((s) =>
            map.set(s.id, s.label)
        );
        return map;
    }

    /**
     * Labels for related fields ("Account › Industry"), which aren't in
     * `sources`: looked up through the field picker's session cache.
     */
    _pathLabels = {};
    _labelledFor = '';

    renderedCallback() {
        const wanted = this.rules
            .flatMap((r) => [
                r.source || '',
                typeof r.value === 'string' && r.value.startsWith('$User.')
                    ? `user:${r.value.slice(6)}`
                    : ''
            ])
            .filter((s) => s.includes('.') || s.startsWith('user:'));
        const key = wanted.join('|');
        if (!wanted.length || key === this._labelledFor) {
            return;
        }
        this._labelledFor = key;
        Promise.all(
            wanted.map((source) => {
                if (source.startsWith('user:')) {
                    const extra = USER_EXTRAS.find((x) => x.value === source);
                    const named = extra
                        ? Promise.resolve(extra.label)
                        : labelForPath('User', source.slice(5));
                    // one label, keyed both ways: a user: source and a $User. value
                    return named.then((label) => [
                        source,
                        `Current user › ${label}`
                    ]);
                }
                const isRecord = source.startsWith('record:');
                const objectApi = isRecord
                    ? this.recordObject
                    : this.fieldObject;
                const path = isRecord ? source.slice(7) : source;
                return labelForPath(objectApi, path).then((label) => [
                    source,
                    label
                ]);
            })
        ).then((pairs) => {
            const labels = Object.fromEntries(pairs);
            Object.keys(labels)
                .filter((k) => k.startsWith('user:'))
                .forEach((k) => {
                    labels[`$User.${k.slice(5)}`] = labels[k];
                });
            this._pathLabels = labels;
        });
    }

    get _types() {
        const map = new Map();
        if (
            this.sourceIndex &&
            typeof this.sourceIndex.forEach === 'function'
        ) {
            this.sourceIndex.forEach((meta, id) =>
                map.set(id, meta && meta.inputType)
            );
        }
        return map;
    }

    get items() {
        const labels = this._labels;
        const types = this._types;
        return this.rules.slice(0, MAX_SHOWN).map((rule, i) => ({
            key: `c${i}`,
            number: i + 1,
            text: describeCondition(rule, labels, types, this.isVisibility)
        }));
    }

    get moreText() {
        const more = this.rules.length - MAX_SHOWN;
        return more > 0 ? `+ ${more} more` : '';
    }

    get logicText() {
        return this.value &&
            this.value.logic === 'custom' &&
            this.value.customLogic
            ? `Logic: ${this.value.customLogic}`
            : '';
    }

    get buttonLabel() {
        return this.hasRules ? 'Edit conditions' : 'Add conditions';
    }

    async handleEdit() {
        // One dialog per click, however fast the clicks.
        if (this._opening) {
            return;
        }
        this._opening = true;
        let result;
        try {
            result = await FinalConditionsModal.open({
                size: 'medium',
                label: this.label,
                description: this.description,
                columns: this.columns,
                value: this.value,
                sources: this.sources,
                recordSources: this.recordSources,
                sourceIndex: this.sourceIndex,
                hostRepeatSectionId: this.hostRepeatSectionId,
                noun: this.noun,
                extraOperators: this.extraOperators,
                fieldObject: this.fieldObject,
                isPublic: this.isPublic,
                allowCurrentUser: this.allowCurrentUser,
                recordObject: this.recordObject,
                startWithRow: !this.hasRules
            });
        } finally {
            this._opening = false;
        }
        if (result) {
            this.dispatchEvent(
                new CustomEvent('conditionschange', {
                    detail: { value: result.value }
                })
            );
        }
    }
}
