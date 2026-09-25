import { LightningElement, api } from 'lwc';
import listCreatableObjects from '@salesforce/apex/FinalMappingController.listCreatableObjects';
import compatibility from '@salesforce/apex/FinalMappingController.compatibility';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import {
    MAX_STEPS,
    actionsOf,
    addAction,
    moveAction,
    answerIndex,
    actionState
} from 'c/finalMappingModel';

const STATE_TEXT = {
    incomplete: 'Not finished',
    broken: 'Points at a missing step'
};

/** What this answer does on that record, in the author's words — the
 *  field's label, never its API name. */
function describeUse(use, fieldLabel) {
    if (use.use === 'filter') return 'used to find the record';
    if (use.use === 'link') return `linked as ${fieldLabel}`;
    return fieldLabel;
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * finalMappingEditor — the Mapping page (FREEFORM_F2_MAPPING_SPEC section
 * 5): the steps in run order, the selected step, and where every answer
 * lands. It owns selection; the spec belongs to the Studio.
 */
export default class FinalMappingEditor extends LightningElement {
    @api readOnly = false;
    @api isPublic = false;

    objects = [];
    compat = {};
    questions = [];
    selectedId;
    adding = false;
    newObject = '';
    newOperation = 'create';
    _spec;
    _questionsFor;
    _dragFrom = null;
    /** objectApi -> { apiName: label }, for the answers index. */
    fieldLabels = {};
    _labelsLoading = new Set();

    @api
    get spec() {
        return this._spec;
    }
    set spec(value) {
        this._spec = value;
        this._loadQuestions();
        this._loadFieldLabels();
    }

    /** One describe per object the mapping uses, remembered. */
    _loadFieldLabels() {
        const needed = new Set(actionsOf(this._spec).map((a) => a.object));
        needed.forEach((objectApi) => {
            if (
                !objectApi ||
                this.fieldLabels[objectApi] ||
                this._labelsLoading.has(objectApi)
            ) {
                return;
            }
            this._labelsLoading.add(objectApi);
            Promise.resolve()
                .then(() => describeFields({ objectApi }))
                .then((rows) => {
                    const labels = {};
                    (rows || []).forEach((r) => {
                        labels[r.apiName] = r.label;
                    });
                    this.fieldLabels = {
                        ...this.fieldLabels,
                        [objectApi]: labels
                    };
                })
                .catch(() => {
                    // Falls back to the API name; nothing else depends on it.
                })
                .finally(() => {
                    this._labelsLoading.delete(objectApi);
                });
        });
    }

    /**
     * Imperative, not @wire: the Studio's tests mock Apex as plain
     * functions, and both methods are cacheable either way.
     */
    connectedCallback() {
        listCreatableObjects()
            .then((data) => {
                this.objects = data || [];
            })
            .catch(() => {
                this.objects = [];
            });
        compatibility()
            .then((data) => {
                this.compat = data || {};
            })
            .catch(() => {
                this.compat = {};
            });
    }

    /** Question types come from Apex so they match what publish checks. */
    async _loadQuestions() {
        const pagesJson = JSON.stringify(
            (this._spec && this._spec.pages) || []
        );
        if (pagesJson === this._questionsFor) return;
        this._questionsFor = pagesJson;
        try {
            this.questions = await describeQuestions({
                specJson: JSON.stringify(this._spec || {})
            });
        } catch {
            // Without question types the pickers offer nothing; publish still
            // checks everything, so an empty list is safe rather than wrong.
            this.questions = [];
        }
    }

    get actions() {
        return actionsOf(this._spec);
    }

    get hasActions() {
        return this.actions.length > 0;
    }

    get atCap() {
        return this.actions.length >= MAX_STEPS;
    }

    get cards() {
        const labels = new Map(this.objects.map((o) => [o.value, o.label]));
        const all = this.actions;
        const skippable = new Set(
            (this.questions || [])
                .filter((q) => q.skippable)
                .map((q) => q.elementKey)
        );
        return all.map((a, i) => {
            const state = actionState(all, i, skippable);
            const selected = a.id === this.selectedIdOrFirst;
            return {
                id: a.id,
                index: i,
                title: `${i + 1}  ${labels.get(a.object) || a.object}`,
                detail: `${a.operation === 'findOrCreate' ? 'Find or create' : 'Create'} · ${plural((a.fields || []).length, 'field')}`,
                stateText: STATE_TEXT[state] || '',
                cls: `me-card${selected ? ' me-card--on' : ''}${state !== 'ok' ? ' me-card--warn' : ''}`,
                ariaCurrent: selected ? 'true' : 'false',
                draggable: this.readOnly ? 'false' : 'true',
                upDisabled: i === 0 || this.readOnly,
                downDisabled: i === all.length - 1 || this.readOnly
            };
        });
    }

    get selectedIdOrFirst() {
        const all = this.actions;
        if (all.some((a) => a.id === this.selectedId)) return this.selectedId;
        return all.length ? all[0].id : null;
    }

    get objectOptions() {
        return this.objects;
    }

    get operationOptions() {
        return [
            { label: 'Always create', value: 'create' },
            { label: 'Find or create', value: 'findOrCreate' }
        ];
    }

    get addDisabled() {
        return !this.newObject || this.readOnly;
    }

    get indexRows() {
        const index = answerIndex(this._spec);
        const labels = new Map(this.objects.map((o) => [o.value, o.label]));
        return this.questions.map((q) => {
            const uses = index.get(q.elementKey) || [];
            return {
                key: q.elementKey,
                label: q.label,
                where: uses.length
                    ? uses
                          .map(
                              (u) =>
                                  `${labels.get(u.object) || u.object} · ${describeUse(
                                      u,
                                      (this.fieldLabels[u.object] || {})[
                                          u.field
                                      ] || u.field
                                  )}`
                          )
                          .join(', ')
                    : 'Stored only',
                cls: uses.length
                    ? 'me-index-where me-index-where--mapped'
                    : 'me-index-where'
            };
        });
    }

    handleSelect(event) {
        this.selectedId = event.currentTarget.dataset.id;
    }

    handleStartAdd() {
        this.adding = true;
    }

    handleObjectPick(event) {
        this.newObject = event.detail.value;
    }

    handleOperationPick(event) {
        this.newOperation = event.detail.value;
    }

    handleCancelAdd() {
        this.adding = false;
        this.newObject = '';
    }

    handleAdd() {
        const { spec, actionId } = addAction(
            this._spec,
            this.newObject,
            this.newOperation
        );
        if (!actionId) return;
        this.adding = false;
        this.newObject = '';
        this.newOperation = 'create';
        this.selectedId = actionId;
        this._emit(spec);
    }

    handleMoveUp(event) {
        const i = Number(event.currentTarget.dataset.index);
        this._emit(moveAction(this._spec, i, i - 1));
    }

    handleMoveDown(event) {
        const i = Number(event.currentTarget.dataset.index);
        this._emit(moveAction(this._spec, i, i + 1));
    }

    handleDragStart(event) {
        this._dragFrom = Number(event.currentTarget.dataset.index);
        event.dataTransfer.effectAllowed = 'move';
    }

    handleDragOver(event) {
        if (this._dragFrom !== null) event.preventDefault();
    }

    handleDrop(event) {
        event.preventDefault();
        const to = Number(event.currentTarget.dataset.index);
        if (this._dragFrom !== null && to !== this._dragFrom) {
            this._emit(moveAction(this._spec, this._dragFrom, to));
        }
        this._dragFrom = null;
    }

    handleActionChange(event) {
        event.stopPropagation();
        this._emit(event.detail.spec);
    }

    handleActionRemoved(event) {
        event.stopPropagation();
        this.selectedId = null;
        this._emit(event.detail.spec);
    }

    _emit(spec) {
        this.dispatchEvent(new CustomEvent('specchange', { detail: { spec } }));
    }
}
