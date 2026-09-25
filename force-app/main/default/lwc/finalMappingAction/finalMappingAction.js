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
    setWriteOnMatch,
    setFilterMode,
    foldMatch,
    searchAnswerIds
} from 'c/finalMappingModel';

/** "a Contact", "an Account". */
function withArticle(label) {
    return `${/^[aeiou]/i.test(label || '') ? 'an' : 'a'} ${label}`;
}

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
                // Why "Another record" isn't offered — only while nothing
                // is picked (decision 13).
                why:
                    entry.source || isLookup
                        ? ''
                        : `Another record: ${f.label} isn’t a lookup field.`,
                showTick: this.showOverwrite,
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

    /** The search as it now reads: older steps' Where/Matches folded in. */
    get match() {
        return foldMatch((this.action && this.action.match) || {}) || {};
    }

    get onMatch() {
        return this.match.onMatch || null;
    }

    get matchUnanswered() {
        return this.isFindOrCreate && !this.onMatch;
    }

    get matchSummary() {
        if (this.onMatch !== 'update') {
            return 'It’s used as-is. Nothing is written to it.';
        }
        const ticked = ((this.action && this.action.fields) || []).some(
            (f) => f.writeOnMatch === true
        );
        return ticked
            ? 'It’s updated with the fields ticked under “Also update when found”.'
            : 'It’s updated with the fields ticked under “Also update when found”. None are ticked yet, so nothing changes.';
    }

    /**
     * What stops this search being published, said on the step itself —
     * so "Not finished" always has its reason beside it.
     */
    get searchNotes() {
        if (!this.isFindOrCreate) {
            return [];
        }
        const m = this.match;
        const hasConditions =
            m.filterMode === 'soql'
                ? Boolean((m.soql || '').trim())
                : Boolean(m.filter && (m.filter.rows || []).length);
        // A question that can be skipped is said under its own row (or the
        // SOQL box), right where it's used.
        return hasConditions && !searchAnswerIds(m).length
            ? [
                  {
                      key: 'no-answer',
                      text: 'At least one condition must compare with an answer, like Email equals the answer to “Your email”.'
                  }
              ]
            : [];
    }

    get hasSearchNotes() {
        return this.searchNotes.length > 0;
    }

    /** The create list's heading: the branch it is, on a find-or-create step. */
    get createHeading() {
        return this.isFindOrCreate
            ? `If none is found, create ${withArticle(this.objectLabel)} with`
            : `Create ${withArticle(this.objectLabel)} with`;
    }

    get showOverwrite() {
        return this.isFindOrCreate && this.onMatch === 'update';
    }

    /**
     * The questions a filter row may compare with (IMPL_PLAN_F2_SEARCH Task 7).
     * Every question is listed so a saved one can say why it no longer fits;
     * one that holds several values fits nothing (decision 9).
     */
    get filterAnswerChoices() {
        return (this.questions || []).map((q) => ({
            key: q.elementKey,
            label: q.label,
            // "Can be skipped" — publishing refuses it in a search.
            skippable: Boolean(q.skippable),
            fits:
                q.mappable && q.answerType !== 'Options'
                    ? (this.compatibility[q.answerType] || []).map((t) =>
                          String(t).toLowerCase()
                      )
                    : []
        }));
    }

    /** finalLookupFilter speaks whole lookup configs; hand it one holding our filter. */
    get filterConfig() {
        return { filter: this.match.filter || { logic: 'all', rows: [] } };
    }

    /** The saved typed conditions, and which of the two is in use. */
    get typedFilter() {
        return {
            mode: this.match.filterMode === 'soql' ? 'soql' : 'rows',
            soql: this.match.soql || ''
        };
    }

    /** What the SOQL box needs: the form, the step, the questions. */
    get typedContext() {
        return {
            spec: this.spec,
            actionId: this.actionId,
            questions: this.questions || []
        };
    }

    /** One editor per step: its half-set-up rows belong to that step. */
    get filterKeys() {
        return [{ key: this.actionId }];
    }

    handleFilter(event) {
        event.stopPropagation();
        const typed = event.detail.typed;
        if (typed) {
            // The Conditions / SOQL switch, or typing in the SOQL box.
            this._emit(
                setFilterMode(this.spec, this.actionId, typed.mode, typed.soql)
            );
            return;
        }
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
