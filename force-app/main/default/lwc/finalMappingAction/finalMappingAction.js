import { LightningElement, api } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import {
    actionsOf,
    setOperation,
    setFieldSource,
    removeField,
    removeAction,
    setMatch,
    setOnMatch,
    setWriteOnMatch
} from 'c/finalMappingModel';

/**
 * finalMappingAction — one step of a mapping (FREEFORM_F2_MAPPING_SPEC
 * 5.2). The source picker offers only what fits: answers whose type the
 * Apex compatibility table accepts for this field, a fixed value, and —
 * for lookups only — records the server can identify. What it can't offer
 * it says, rather than hiding.
 */
export default class FinalMappingAction extends LightningElement {
    @api spec;
    @api actionId;
    @api objects = [];
    @api questions = [];
    @api compatibility = {};
    @api readOnly = false;
    @api isPublic = false;

    fields = [];
    addingField = '';

    get action() {
        return actionsOf(this.spec).find((a) => a.id === this.actionId) || null;
    }

    get index() {
        return actionsOf(this.spec).findIndex((a) => a.id === this.actionId);
    }

    get objectApi() {
        return this.action && this.action.object;
    }

    _fieldsFor;

    /**
     * Imperative, not @wire, for the same reason as the editor: the Studio
     * already mocks describeFields as a plain function in its tests.
     */
    renderedCallback() {
        const objectApi = this.objectApi; // not `api`: that name is the lwc decorator
        if (!objectApi || objectApi === this._fieldsFor) {
            return;
        }
        this._fieldsFor = objectApi;
        // Nothing from the last object survives the switch, and a reply that
        // arrives after the author has moved on is dropped: two describes can
        // finish in either order, and the slower one would otherwise paint
        // Contact's fields onto a Case step.
        this.fields = [];
        describeFields({ objectApi })
            .then((data) => {
                if (this.objectApi === objectApi) {
                    this.fields = data || [];
                }
            })
            .catch(() => {
                if (this.objectApi === objectApi) {
                    this.fields = [];
                }
            });
    }

    get objectLabel() {
        const hit = (this.objects || []).find(
            (o) => o.value === this.objectApi
        );
        return hit ? hit.label : this.objectApi;
    }

    get stepText() {
        return `step ${this.index + 1} of ${actionsOf(this.spec).length}`;
    }

    get operationOptions() {
        return [
            { label: 'Always create', value: 'create' },
            { label: 'Find or create', value: 'findOrCreate' }
        ];
    }

    get operation() {
        return this.action ? this.action.operation : 'create';
    }

    get isFindOrCreate() {
        return this.operation === 'findOrCreate';
    }

    get earlierSteps() {
        const all = actionsOf(this.spec);
        return all.slice(0, Math.max(this.index, 0));
    }

    get rows() {
        const byApi = new Map(this.fields.map((f) => [f.apiName, f]));
        return ((this.action && this.action.fields) || []).map((entry) => {
            const f = byApi.get(entry.field) || {
                apiName: entry.field,
                label: entry.field
            };
            const isLookup = f.displayType === 'REFERENCE';
            return {
                key: entry.field,
                label: f.label,
                required: Boolean(f.required),
                options: this._sourceOptions(f),
                value: this._sourceValue(entry.source),
                isLiteral: entry.source && entry.source.kind === 'literal',
                literal:
                    entry.source && entry.source.kind === 'literal'
                        ? entry.source.value
                        : '',
                why: isLookup
                    ? ''
                    : `Another record: ${f.label} isn’t a lookup field.`,
                isMatchField:
                    this.isFindOrCreate && entry.field === this.match.field,
                showTick:
                    this.showOverwrite && entry.field !== this.match.field,
                overwrite: entry.writeOnMatch === true
            };
        });
    }

    _sourceOptions(f) {
        const out = [];
        const fits = (q) =>
            q.mappable &&
            (this.compatibility[q.answerType] || []).includes(f.displayType);
        (this.questions || []).filter(fits).forEach((q) => {
            out.push({
                label: `Answer: ${q.label}`,
                value: `answer:${q.elementKey}`
            });
        });
        if (f.displayType !== 'REFERENCE') {
            out.push({ label: 'A fixed value', value: 'literal' });
        } else {
            this.earlierSteps
                .filter((s) => s.object === f.referenceTo)
                .forEach((s) => {
                    const n = actionsOf(this.spec).indexOf(s) + 1;
                    out.push({
                        label: `The ${this.objectLabelFor(s.object)} from step ${n}`,
                        value: `action:${s.id}`
                    });
                });
            (this.questions || [])
                .filter((q) => q.referenceTo && q.referenceTo === f.referenceTo)
                .forEach((q) => {
                    out.push({
                        label: `The record picked in "${q.label}"`,
                        value: `pick:${q.elementKey}`
                    });
                });
        }
        return out;
    }

    objectLabelFor(objectApi) {
        const hit = (this.objects || []).find((o) => o.value === objectApi);
        return hit ? hit.label : objectApi;
    }

    _sourceValue(source) {
        if (!source) return '';
        if (source.kind === 'answer') return `answer:${source.elementKey}`;
        if (source.kind === 'literal') return 'literal';
        if (source.kind === 'recordRef') {
            if (source.ref.startsWith('action:')) return source.ref;
            if (source.ref.startsWith('answer:'))
                return `pick:${source.ref.slice(7)}`;
        }
        return '';
    }

    get unusedFieldOptions() {
        const used = new Set(
            ((this.action && this.action.fields) || []).map((f) => f.field)
        );
        // A lookup that can point at more than one kind of record is not
        // offered at all (D48); publish refuses it too.
        return this.fields
            .filter((f) => !f.polymorphic && !used.has(f.apiName))
            .map((f) => ({ label: f.label, value: f.apiName }));
    }

    handleOperation(event) {
        this._emit(setOperation(this.spec, this.actionId, event.detail.value));
    }

    handleSource(event) {
        const field = event.target.dataset.field;
        const v = event.detail.value;
        let source = null;
        if (v.startsWith('answer:'))
            source = { kind: 'answer', elementKey: v.slice(7) };
        else if (v === 'literal') source = { kind: 'literal', value: '' };
        else if (v.startsWith('action:'))
            source = { kind: 'recordRef', ref: v };
        else if (v.startsWith('pick:'))
            source = { kind: 'recordRef', ref: `answer:${v.slice(5)}` };
        this._emit(setFieldSource(this.spec, this.actionId, field, source));
    }

    handleLiteral(event) {
        const field = event.target.dataset.field;
        this._emit(
            setFieldSource(this.spec, this.actionId, field, {
                kind: 'literal',
                value: event.detail.value
            })
        );
    }

    handleRemoveField(event) {
        this._emit(
            removeField(
                this.spec,
                this.actionId,
                event.currentTarget.dataset.field
            )
        );
    }

    handleAddField(event) {
        this._emit(
            setFieldSource(this.spec, this.actionId, event.detail.value, null)
        );
    }

    get match() {
        return (this.action && this.action.match) || {};
    }

    get onMatch() {
        return this.match.onMatch || null;
    }

    get matchUnanswered() {
        return this.isFindOrCreate && !this.onMatch;
    }

    get matchSummary() {
        return this.onMatch === 'update'
            ? 'When one is found, the fields ticked below are overwritten.'
            : 'When one is found, it’s used as-is and nothing is written to it.';
    }

    get showOverwrite() {
        return this.isFindOrCreate && this.onMatch === 'update';
    }

    /** Text-like fields: what you can meaningfully search by in v1. */
    get matchFieldOptions() {
        const searchable = new Set(['STRING', 'EMAIL', 'PHONE', 'URL']);
        return this.fields
            .filter((f) => searchable.has(f.displayType))
            .map((f) => ({ label: f.label, value: f.apiName }));
    }

    get matchSourceOptions() {
        const f = this.fields.find((x) => x.apiName === this.match.field);
        if (!f) return [];
        return (this.questions || [])
            .filter(
                (q) =>
                    q.mappable &&
                    (this.compatibility[q.answerType] || []).includes(
                        f.displayType
                    )
            )
            .map((q) => ({ label: q.label, value: q.elementKey }));
    }

    get matchSourceValue() {
        return this.match.source && this.match.source.elementKey;
    }

    get filterDialogLabel() {
        return `Find an existing ${this.objectLabel}`;
    }

    /** finalLookupFilter speaks whole lookup configs; hand it one holding our filter. */
    get filterConfig() {
        return { filter: this.match.filter || { logic: 'all', rows: [] } };
    }

    handleMatchField(event) {
        this._emit(
            setMatch(this.spec, this.actionId, { field: event.detail.value })
        );
    }

    handleMatchSource(event) {
        this._emit(
            setMatch(this.spec, this.actionId, {
                source: { kind: 'answer', elementKey: event.detail.value }
            })
        );
    }

    handleFilter(event) {
        event.stopPropagation();
        const next = event.detail.value || {};
        this._emit(
            setMatch(this.spec, this.actionId, {
                filter: next.filter || { logic: 'all', rows: [] }
            })
        );
    }

    handleOnMatch(event) {
        this._emit(
            setOnMatch(
                this.spec,
                this.actionId,
                event.currentTarget.dataset.onMatch
            )
        );
    }

    handleChangeOnMatch() {
        const next = JSON.parse(JSON.stringify(this.spec));
        const a = actionsOf(next).find((x) => x.id === this.actionId);
        delete a.match.onMatch;
        a.fields.forEach((f) => delete f.writeOnMatch);
        this._emit(next);
    }

    handleOverwrite(event) {
        this._emit(
            setWriteOnMatch(
                this.spec,
                this.actionId,
                event.target.dataset.field,
                event.target.checked
            )
        );
    }

    handleRemoveStep() {
        this.dispatchEvent(
            new CustomEvent('actionremoved', {
                detail: { spec: removeAction(this.spec, this.actionId) }
            })
        );
    }

    _emit(spec) {
        this.dispatchEvent(new CustomEvent('specchange', { detail: { spec } }));
    }
}
