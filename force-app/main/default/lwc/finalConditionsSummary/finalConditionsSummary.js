import { LightningElement, api } from 'lwc';
import FinalConditionsModal from 'c/finalConditionsModal';
import { removedLabel, USER_EXTRAS } from 'c/finalRuleEditor';
import { labelForPath, typeForPath } from 'c/finalFieldPicker';
import { displayNames, toDisplay } from 'c/finalMappingSoql';

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
    isVisibility = true,
    answersOn = false
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
        shown = raw === 'true' ? 'True' : 'False';
    } else if (
        answersOn &&
        typeof raw === 'string' &&
        raw.startsWith('$field.')
    ) {
        // On the mapping screen a $field. value is a question's answer.
        shown = labels.has(raw)
            ? `the answer to “${labels.get(raw)}”`
            : 'the answer to a removed question';
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
    /** Mapping screen: the questions a row may compare with (Task 7). */
    @api answerChoices = [];
    @api recordObject;
    /** The dialog's title and sentence. */
    @api label;
    @api description;
    /** Mapping search: the Advanced (SOQL) tab (D50) — see c/finalConditionsModal. */
    @api allowTyped = false;
    @api typedValue;
    @api typedContext;
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

    get isTyped() {
        return Boolean(
            this.allowTyped &&
            this.typedValue &&
            this.typedValue.mode === 'soql' &&
            (this.typedValue.soql || '').trim()
        );
    }

    /** The typed conditions as the author wrote them: {Your email}, not ids. */
    get typedText() {
        if (!this.isTyped) {
            return '';
        }
        const questions =
            (this.typedContext && this.typedContext.questions) || [];
        const stored = this.typedValue.soql;
        return toDisplay(stored, displayNames(questions, stored));
    }

    get hasRules() {
        return this.rules.length > 0;
    }

    get showRules() {
        return this.hasRules && !this.isTyped;
    }

    get showEmpty() {
        return !this.hasRules && !this.isTyped;
    }

    get emptyText() {
        if (this.isMapping) {
            return 'No conditions yet. Add at least one that compares with an answer, like Email equals the answer to “Your email”.';
        }
        return this.isVisibility ? 'Always shown' : 'No conditions';
    }

    get isMapping() {
        return this.columns === 'mapping';
    }

    get heading() {
        if (this.isMapping) {
            // The step already says "Find an existing Contact where" — only
            // how several conditions combine is left to say.
            if (this.rules.length === 1) {
                return '';
            }
            const how = (this.value && this.value.logic) || 'all';
            if (how === 'any') {
                return 'Any of these:';
            }
            return how === 'custom'
                ? 'These, combined by the logic below:'
                : 'All of these:';
        }
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
        (this.answerChoices || []).forEach((a) =>
            map.set(`$field.${a.key}`, a.label)
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
        this._loadRecordTypes();
        const wanted = this.rules
            .flatMap((r) => [
                r.source || '',
                typeof r.value === 'string' && r.value.startsWith('$User.')
                    ? `user:${r.value.slice(6)}`
                    : ''
            ])
            .filter(
                (s) =>
                    s.includes('.') ||
                    s.startsWith('user:') ||
                    // a Form's linked record has no pre-loaded field list
                    (s.startsWith('record:') &&
                        !(this.recordSources || []).some((r) => r.id === s))
            );
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

    /** Record screens: which conditions are on checkbox fields (True/False). */
    _checkboxPaths = {};
    _typedFor = '';

    _loadRecordTypes() {
        if (this.isVisibility || !this.fieldObject) {
            return;
        }
        const paths = this.rules
            .map((r) => r.source)
            .filter((s) => s && !s.startsWith('user:'));
        const key = `${this.fieldObject}|${paths.join('|')}`;
        if (!paths.length || key === this._typedFor) {
            return;
        }
        this._typedFor = key;
        Promise.all(
            paths.map((p) =>
                typeForPath(this.fieldObject, p).then((t) => [p, t])
            )
        ).then((pairs) => {
            if (key !== this._typedFor) {
                return; // an older request, answered late
            }
            const out = {};
            pairs.forEach(([p, t]) => {
                if (t === 'boolean') {
                    out[p] = true;
                }
            });
            this._checkboxPaths = out;
        });
    }

    get _types() {
        const map = new Map();
        Object.keys(this._checkboxPaths).forEach((p) => map.set(p, 'checkbox'));
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
            text: describeCondition(
                rule,
                labels,
                types,
                this.isVisibility,
                this.columns === 'mapping'
            )
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
        return this.hasRules || this.isTyped
            ? 'Edit conditions'
            : 'Add conditions';
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
                answerChoices: this.answerChoices,
                recordObject: this.recordObject,
                allowTyped: this.allowTyped,
                typedValue: this.typedValue,
                typedContext: this.typedContext,
                startWithRow: !this.hasRules && !this.isTyped
            });
        } finally {
            this._opening = false;
        }
        if (result) {
            this.dispatchEvent(
                new CustomEvent('conditionschange', {
                    detail: { value: result.value, typed: result.typed }
                })
            );
        }
    }
}
