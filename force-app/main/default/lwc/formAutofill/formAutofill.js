import { LightningElement, api, track } from 'lwc';
import getLookupTargets from '@salesforce/apex/FormStudioController.getLookupTargets';
import listObjects from '@salesforce/apex/FormStudioController.listObjects';
import getObjectFields from '@salesforce/apex/FormStudioController.getObjectFields';

/**
 * Single-rule Autofill editor — opens as a modal from the Autofill rail tab
 * (mirrors c/visibilityEditor: the parent owns the rule LIST + persistence; this
 * edits ONE rule and emits `save {rule}` / `cancel`).
 *
 * Rule shape (the runtime contract c/formViewer reads):
 *   { sourceType:'lookup'|'url', sourceObject, lookupField?|urlParam?,
 *     mappings:[{ from, to }] }      // from = source field, to = form field
 */
export default class FormAutofill extends LightningElement {
    _objectApiName;
    @track _targetFields = [];
    @track _draft = freshDraft();
    _seq = 0;
    _isNew = true;

    @track _lookupTargets = [];
    @track _objectOptions = [];
    @track _fieldsByObject = {}; // objLower -> [{label,value}]

    @api
    get objectApiName() {
        return this._objectApiName;
    }
    set objectApiName(v) {
        this._objectApiName = v;
        this.loadLookupTargets();
    }

    // The form's own fields — the mapping targets ("to").
    @api
    get targetFields() {
        return this._targetFields;
    }
    set targetFields(v) {
        this._targetFields = v || [];
    }

    // The rule being edited; null/undefined = create a new one.
    @api
    get rule() {
        return this._draft;
    }
    set rule(v) {
        this._isNew = !v;
        this.hydrate(v);
    }

    connectedCallback() {
        if (!this._objectOptions.length) this.loadObjects();
    }

    hydrate(v) {
        const r = v || {};
        const mappings = (r.mappings || []).map((m) => ({
            id: `m${this._seq++}`,
            from: m.from || '',
            to: m.to || ''
        }));
        if (!mappings.length) mappings.push({ id: `m${this._seq++}`, from: '', to: '' });
        this._draft = {
            sourceType: r.sourceType || 'lookup',
            lookupField: r.lookupField || '',
            urlParam: r.urlParam || '',
            sourceObject: r.sourceObject || '',
            mappings
        };
        if (this._draft.sourceObject) this.ensureFields(this._draft.sourceObject);
    }

    patch(changes) {
        this._draft = { ...this._draft, ...changes };
    }

    // ---- data loads ----
    loadLookupTargets() {
        if (!this._objectApiName) {
            this._lookupTargets = [];
            return;
        }
        getLookupTargets({ objectApiName: this._objectApiName })
            .then((d) => {
                this._lookupTargets = d || [];
            })
            .catch(() => {
                this._lookupTargets = [];
            });
    }
    loadObjects() {
        listObjects()
            .then((d) => {
                this._objectOptions = d || [];
            })
            .catch(() => {
                this._objectOptions = [];
            });
    }
    ensureFields(obj) {
        if (!obj) return;
        const key = obj.toLowerCase();
        if (this._fieldsByObject[key]) return;
        getObjectFields({ objectApiName: obj })
            .then((d) => {
                this._fieldsByObject = {
                    ...this._fieldsByObject,
                    [key]: (d || []).map((f) => ({ label: f.label || f.apiName, value: f.apiName }))
                };
            })
            .catch(() => {
                /* leave unloaded — picker stays empty */
            });
    }

    // ---- display / options ----
    get sel() {
        return this._draft;
    }
    get title() {
        return this._isNew ? 'New autofill rule' : 'Edit autofill rule';
    }
    get isLookup() {
        return this._draft.sourceType === 'lookup';
    }
    get isUrl() {
        return this._draft.sourceType === 'url';
    }
    get sourceTypeOptions() {
        return [
            { label: 'From a lookup on the form', value: 'lookup' },
            { label: 'From a URL parameter', value: 'url' }
        ];
    }
    get lookupOptions() {
        return (this._lookupTargets || []).map((lt) => ({
            label: `${lt.targetLabel} (${lt.targetObject})`,
            value: lt.lookupField
        }));
    }
    get objectOptions() {
        return this._objectOptions;
    }
    get targetFieldOptions() {
        return (this._targetFields || []).map((f) => ({ label: f.label || f.apiName, value: f.apiName }));
    }
    get sourceFieldOptions() {
        const o = this._draft.sourceObject;
        return (o && this._fieldsByObject[o.toLowerCase()]) || [];
    }
    get mappingRows() {
        return this._draft.mappings;
    }
    get hasNoLookups() {
        return (this._lookupTargets || []).length === 0;
    }
    get saveDisabled() {
        const d = this._draft;
        if (!d.sourceObject) return true;
        if (d.sourceType === 'lookup' && !d.lookupField) return true;
        if (d.sourceType === 'url' && !d.urlParam) return true;
        return !d.mappings.some((m) => m.from && m.to);
    }

    // ---- mutations ----
    handleSourceTypeChange(e) {
        this.patch({
            sourceType: e.detail.value,
            lookupField: '',
            urlParam: '',
            sourceObject: '',
            mappings: [{ id: `m${this._seq++}`, from: '', to: '' }]
        });
    }
    handleLookupChange(e) {
        const lookupField = e.detail.value;
        const lt = (this._lookupTargets || []).find((x) => x.lookupField === lookupField);
        const sourceObject = lt ? lt.targetObject : '';
        this.patch({ lookupField, sourceObject });
        if (sourceObject) this.ensureFields(sourceObject);
    }
    handleUrlParamChange(e) {
        this.patch({ urlParam: e.detail.value });
    }
    handleSourceObjectChange(e) {
        const sourceObject = e.detail.value;
        this.patch({ sourceObject });
        this.ensureFields(sourceObject);
    }
    handleAddMapping() {
        this.patch({
            mappings: [...this._draft.mappings, { id: `m${this._seq++}`, from: '', to: '' }]
        });
    }
    handleRemoveMapping(e) {
        const mid = e.currentTarget.dataset.id;
        this.patch({ mappings: this._draft.mappings.filter((m) => m.id !== mid) });
    }
    handleMappingChange(e) {
        const mid = e.currentTarget.dataset.id;
        const prop = e.currentTarget.dataset.prop;
        const val = e.detail.value;
        this.patch({
            mappings: this._draft.mappings.map((m) => {
                if (m.id !== mid) return m;
                return { ...m, [prop]: val };
            })
        });
    }

    // ---- emit (cleaned, id-free — the persisted/runtime shape) ----
    handleSave() {
        const d = this._draft;
        const out = {
            sourceType: d.sourceType,
            sourceObject: d.sourceObject,
            mappings: d.mappings.filter((m) => m.from && m.to).map((m) => ({ from: m.from, to: m.to }))
        };
        if (d.sourceType === 'url') out.urlParam = d.urlParam;
        else out.lookupField = d.lookupField;
        this.dispatchEvent(new CustomEvent('save', { detail: { rule: out } }));
    }
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}

function freshDraft() {
    return {
        sourceType: 'lookup',
        lookupField: '',
        urlParam: '',
        sourceObject: '',
        mappings: [{ id: 'm0', from: '', to: '' }]
    };
}
