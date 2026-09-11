import { LightningElement, api, wire } from 'lwc';
import describeLookupFields from '@salesforce/apex/FinalStudioController.describeLookupFields';
import { LOOKUP_CONFIG_VERSION } from 'c/finalLookupUtils';

/**
 * Studio authoring for a lookup's results (IMPL_PLAN_DEPENDENT_LOOKUP §6).
 *
 * The author never sees a record id, an object API name in a value slot, or a
 * line of filter JSON. They see sentences: "Account / equals / an answer /
 * Account". Everything this editor offers comes from Describe via
 * FinalStudioController.describeLookupFields, whose eligibility rules are
 * FinalLookupPolicy's own — so the editor cannot offer a condition that
 * publish will later refuse.
 *
 * Type compatibility is checked here AND on the server. That duplication is
 * deliberate: this copy exists to stop an author building something broken,
 * the server's copy exists because a client cannot be trusted. Neither one
 * substitutes for the other.
 */

const OPERATOR_LABELS = {
    eq: 'equals',
    ne: 'does not equal',
    lt: 'is less than',
    lte: 'is at most',
    gt: 'is greater than',
    gte: 'is at least'
};

const ANSWER = 'answer';
const CONSTANT = 'constant';

let rowSeq = 0;
const freshCriterionId = () => `lc_${Date.now().toString(36)}${rowSeq++}`;

export default class FinalLookupConfigEditor extends LightningElement {
    /** API name of the object this lookup searches. */
    @api targetObject;
    /** Its label, for copy the author can read. */
    @api targetObjectLabel;
    /** This lookup element's own label, for the "what happens" sentence. */
    @api elementLabel = 'this lookup';
    /** [{ id, label, inputType, referenceTo }] — answers this form can offer. */
    @api answerSources = [];

    @api
    get config() {
        return this._config;
    }
    set config(value) {
        this._config = value || null;
    }

    _config = null;
    fields;
    describeError;

    @wire(describeLookupFields, { objectApi: '$targetObject' })
    wiredFields({ data, error }) {
        if (data) {
            this.fields = data;
            this.describeError = undefined;
        } else if (error) {
            this.fields = undefined;
            this.describeError = `The fields on ${this.objectLabel} could not be loaded.`;
        }
    }

    // ------------------------------------------------------------- reading

    get objectLabel() {
        return this.targetObjectLabel || this.targetObject || 'this object';
    }

    get criteria() {
        const list =
            this._config && this._config.filter && this._config.filter.criteria;
        return Array.isArray(list) ? list : [];
    }

    get mode() {
        return (this._config &&
            this._config.filter &&
            this._config.filter.mode) === 'any'
            ? 'any'
            : 'all';
    }

    get hasConditions() {
        return this.criteria.length > 0;
    }

    get showsMatchMode() {
        return this.criteria.length > 1;
    }

    get matchAll() {
        return this.mode === 'all';
    }

    get matchAny() {
        return this.mode === 'any';
    }

    get loading() {
        return !this.fields && !this.describeError;
    }

    get filterFields() {
        return (this.fields || []).filter((f) => f.filterable);
    }

    get searchFieldOptions() {
        return [{ apiName: '', label: 'Name (default)' }].concat(
            (this.fields || []).filter((f) => f.searchable)
        );
    }

    get displayFieldOptions() {
        return [{ apiName: '', label: 'Nothing extra' }].concat(
            (this.fields || []).filter((f) => f.displayable)
        );
    }

    get secondaryField() {
        const extra =
            this._config &&
            this._config.displayInfo &&
            this._config.displayInfo.additionalFields;
        return Array.isArray(extra) && extra.length ? extra[0] : '';
    }

    get searchField() {
        const primary =
            this._config &&
            this._config.matchingInfo &&
            this._config.matchingInfo.primaryField;
        const path = primary && primary.fieldPath;
        return path && path !== 'Name' ? path : '';
    }

    get secondaryOptions() {
        const chosen = this.secondaryField;
        return this.displayFieldOptions.map((f) => ({
            value: f.apiName,
            label: f.label,
            selected: f.apiName === chosen
        }));
    }

    get searchOptions() {
        const chosen = this.searchField;
        return this.searchFieldOptions.map((f) => ({
            value: f.apiName,
            label: f.label,
            selected: f.apiName === chosen
        }));
    }

    _field(apiName) {
        return (this.fields || []).find((f) => f.apiName === apiName);
    }

    /** Answers whose type could stand in for this field. Mirrors
     *  FinalLookupPolicy.sourceFits — see the class comment. */
    _compatibleSources(field) {
        const all = this.answerSources || [];
        if (!field) {
            return all;
        }
        if (field.kind === 'reference') {
            return all.filter(
                (s) =>
                    (s.inputType === 'reference' || s.inputType === 'lookup') &&
                    s.referenceTo === field.referenceTo
            );
        }
        if (field.kind === 'boolean') {
            return all.filter(
                (s) => s.inputType === 'checkbox' || s.inputType === 'boolean'
            );
        }
        if (field.kind === 'number') {
            return all.filter((s) =>
                ['number', 'currency', 'percent'].includes(s.inputType)
            );
        }
        return all.filter(
            (s) => s.inputType !== 'reference' && s.inputType !== 'lookup'
        );
    }

    // --------------------------------------------------------------- rows

    get rows() {
        return this.criteria.map((c, index) => {
            const field = this._field(c.fieldPath);
            const isAnswer = c.value && c.value.kind === ANSWER;
            const sources = this._compatibleSources(field);
            const sourceId = isAnswer ? c.value.elementId : '';
            const constant =
                c.value && c.value.kind === CONSTANT ? c.value.value : '';

            return {
                key: c.id || `row_${index}`,
                index: String(index),
                fieldOptions: this.filterFields.map((f) => ({
                    value: f.apiName,
                    label: f.label,
                    selected: f.apiName === c.fieldPath
                })),
                operatorOptions: ((field && field.operators) || ['eq']).map(
                    (op) => ({
                        value: op,
                        label: OPERATOR_LABELS[op] || op,
                        selected: op === c.operator
                    })
                ),
                kindOptions: [
                    {
                        value: ANSWER,
                        label: 'an answer',
                        selected: isAnswer
                    },
                    {
                        value: CONSTANT,
                        label: 'a fixed value',
                        selected: !isAnswer
                    }
                ],
                isAnswer,
                sourceOptions: sources.map((s) => ({
                    value: s.id,
                    label: s.label,
                    selected: s.id === sourceId
                })),
                noCompatibleSources: isAnswer && sources.length === 0,
                isPicklist: !isAnswer && field && field.kind === 'picklist',
                isBoolean: !isAnswer && field && field.kind === 'boolean',
                isNumber: !isAnswer && field && field.kind === 'number',
                isText:
                    !isAnswer &&
                    field &&
                    !['picklist', 'boolean', 'number'].includes(field.kind),
                picklistOptions: ((field && field.options) || []).map((o) => ({
                    value: o.value,
                    label: o.label,
                    selected: o.value === constant
                })),
                booleanChecked: constant === true,
                constant: constant === null ? '' : constant,
                error: this._rowError(c, field, sources)
            };
        });
    }

    _rowError(c, field, sources) {
        if (!c.fieldPath) {
            return 'Pick a field to filter on.';
        }
        if (!field) {
            return `${c.fieldPath} is not a field that can be filtered on ${this.objectLabel}.`;
        }
        if (c.value && c.value.kind === ANSWER) {
            if (!c.value.elementId) {
                return 'Pick which answer this reads.';
            }
            if (!sources.some((s) => s.id === c.value.elementId)) {
                return 'That answer is gone, or no longer suits this field.';
            }
        }
        return '';
    }

    /** "Changing Account clears the selected Contact." */
    get dependencyNote() {
        const labels = [];
        for (const c of this.criteria) {
            if (!c.value || c.value.kind !== ANSWER || !c.value.elementId) {
                continue;
            }
            const source = (this.answerSources || []).find(
                (s) => s.id === c.value.elementId
            );
            if (source && !labels.includes(source.label)) {
                labels.push(source.label);
            }
        }
        if (!labels.length) {
            return '';
        }
        const joined =
            labels.length === 1
                ? labels[0]
                : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
        return `Changing ${joined} clears the selected ${this.elementLabel}.`;
    }

    // ------------------------------------------------------------ writing

    _emit(next) {
        // Nothing configured means no lookupConfig at all, which is the
        // unfiltered behaviour every existing form already has.
        const empty =
            !next ||
            (!(next.filter && next.filter.criteria.length) &&
                !next.displayInfo &&
                !next.matchingInfo);
        this.dispatchEvent(
            new CustomEvent('lookupconfigchange', {
                detail: { lookupConfig: empty ? null : next }
            })
        );
    }

    _draft() {
        const base = this._config || {};
        return {
            version: LOOKUP_CONFIG_VERSION,
            filter: {
                mode: this.mode,
                criteria: this.criteria.map((c) => ({
                    ...c,
                    value: { ...c.value }
                }))
            },
            displayInfo: base.displayInfo ? { ...base.displayInfo } : undefined,
            matchingInfo: base.matchingInfo
                ? {
                      primaryField: { ...base.matchingInfo.primaryField }
                  }
                : undefined
        };
    }

    handleAddCondition() {
        // Seed with something an author might plausibly mean. The record's own
        // Id sorts first out of Describe and is a filter nobody wants by
        // default, even though it is a legal one to build deliberately.
        const fields = this.filterFields;
        const seed = fields.find((f) => f.apiName !== 'Id') || fields[0];
        const next = this._draft();
        next.filter.criteria.push({
            id: freshCriterionId(),
            fieldPath: seed ? seed.apiName : '',
            operator: 'eq',
            value: { kind: ANSWER, elementId: '' }
        });
        this._emit(next);
    }

    handleRemoveCondition(event) {
        const index = Number(event.currentTarget.dataset.index);
        const next = this._draft();
        next.filter.criteria.splice(index, 1);
        this._emit(next);
    }

    handleFieldChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const apiName = event.target.value;
        const field = this._field(apiName);
        const next = this._draft();
        const row = next.filter.criteria[index];
        row.fieldPath = apiName;
        // The old comparison and the old value belonged to the old field.
        // Carrying either across silently produces a condition the author
        // never wrote and publish will refuse.
        const ops = (field && field.operators) || ['eq'];
        row.operator = ops.includes(row.operator) ? row.operator : ops[0];
        row.value =
            row.value.kind === ANSWER
                ? { kind: ANSWER, elementId: '' }
                : { kind: CONSTANT, value: '' };
        this._emit(next);
    }

    handleOperatorChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const next = this._draft();
        next.filter.criteria[index].operator = event.target.value;
        this._emit(next);
    }

    handleKindChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const kind = event.target.value;
        const next = this._draft();
        next.filter.criteria[index].value =
            kind === ANSWER
                ? { kind: ANSWER, elementId: '' }
                : { kind: CONSTANT, value: '' };
        this._emit(next);
    }

    handleSourceChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const next = this._draft();
        next.filter.criteria[index].value = {
            kind: ANSWER,
            elementId: event.target.value
        };
        this._emit(next);
    }

    handleConstantChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const el = event.target;
        const raw =
            el.type === 'checkbox'
                ? el.checked
                : el.type === 'number'
                  ? el.value === ''
                      ? ''
                      : Number(el.value)
                  : el.value;
        const next = this._draft();
        next.filter.criteria[index].value = { kind: CONSTANT, value: raw };
        this._emit(next);
    }

    handleModeChange(event) {
        const next = this._draft();
        next.filter.mode = event.currentTarget.dataset.value;
        this._emit(next);
    }

    handleSecondaryChange(event) {
        const apiName = event.target.value;
        const next = this._draft();
        next.displayInfo = apiName
            ? { primaryField: 'Name', additionalFields: [apiName] }
            : undefined;
        this._emit(next);
    }

    handleSearchChange(event) {
        const apiName = event.target.value;
        const next = this._draft();
        next.matchingInfo = apiName
            ? {
                  primaryField: { fieldPath: apiName, mode: 'startsWith' }
              }
            : undefined;
        this._emit(next);
    }
}
