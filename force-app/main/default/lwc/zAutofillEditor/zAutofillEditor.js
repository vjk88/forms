import { LightningElement, api, track } from 'lwc';
import getObjectFields from '@salesforce/apex/Z_FormDesignerController.getObjectFields';

export default class ZAutofillEditor extends LightningElement {
    @api objectFields = []; // the form's object fields (mapping targets)
    @api lookupTargets = []; // lookup fields + their target objects/fields
    @api objectOptions = []; // all org objects (for URL source)

    @track rules = [];
    _seq = 0;
    _rulesJson = '';
    @track _sourceFieldsCache = {};

    @api
    get rulesJson() {
        return this._rulesJson;
    }
    set rulesJson(value) {
        this._rulesJson = value;
        this.hydrate(value);
    }

    hydrate(value) {
        let arr = [];
        try {
            arr = value ? JSON.parse(value) : [];
        } catch (e) {
            arr = [];
        }
        this.rules = (arr || []).map((r) => ({
            id: `r${this._seq++}`,
            sourceType: r.sourceType || 'lookup',
            urlParam: r.urlParam || '',
            lookupField: r.lookupField || '',
            sourceObject: r.sourceObject || '',
            mappings: (r.mappings || []).map((m) => ({
                id: `m${this._seq++}`,
                from: m.from,
                to: m.to
            }))
        }));
        this.rules.forEach((r) => {
            if (r.sourceType === 'url' && r.sourceObject) {
                this.ensureSourceFields(r.sourceObject);
            }
        });
    }

    get sourceTypeOptions() {
        return [
            { label: 'From a Lookup on the form', value: 'lookup' },
            { label: 'From a URL parameter', value: 'url' }
        ];
    }
    get lookupOptions() {
        return (this.lookupTargets || []).map((lt) => ({
            label: `${lt.targetLabel} (${lt.lookupField})`,
            value: lt.lookupField
        }));
    }
    get targetFieldOptions() {
        return (this.objectFields || []).map((f) => ({
            label: f.label || f.apiName,
            value: f.apiName
        }));
    }
    get hasRules() {
        return this.rules.length > 0;
    }

    sourceFieldsFor(rule) {
        if (rule.sourceType === 'lookup') {
            const lt = (this.lookupTargets || []).find(
                (x) => x.lookupField === rule.lookupField
            );
            return lt
                ? (lt.fields || []).map((f) => ({
                      label: f.label || f.apiName,
                      value: f.apiName
                  }))
                : [];
        }
        return (this._sourceFieldsCache[rule.sourceObject] || []).map((f) => ({
            label: f.label || f.apiName,
            value: f.apiName
        }));
    }

    get displayRules() {
        return this.rules.map((r, i) => ({
            ...r,
            num: i + 1,
            isLookup: r.sourceType === 'lookup',
            isUrl: r.sourceType === 'url',
            sourceFieldOptions: this.sourceFieldsFor(r),
            mappingRows: (r.mappings || []).map((m) => ({ ...m, ruleId: r.id }))
        }));
    }

    ensureSourceFields(obj) {
        if (!obj || this._sourceFieldsCache[obj]) return;
        getObjectFields({ objectApiName: obj })
            .then((d) => {
                this._sourceFieldsCache = {
                    ...this._sourceFieldsCache,
                    [obj]: d || []
                };
            })
            .catch(() => {});
    }

    updateRule(id, changes) {
        this.rules = this.rules.map((r) =>
            r.id === id ? { ...r, ...changes } : r
        );
    }

    handleAddRule() {
        this.rules = [
            ...this.rules,
            {
                id: `r${this._seq++}`,
                sourceType: 'lookup',
                urlParam: '',
                lookupField: '',
                sourceObject: '',
                mappings: []
            }
        ];
    }
    handleRemoveRule(e) {
        const id = e.currentTarget.dataset.id;
        this.rules = this.rules.filter((r) => r.id !== id);
    }
    handleSourceTypeChange(e) {
        this.updateRule(e.currentTarget.dataset.id, {
            sourceType: e.detail.value,
            lookupField: '',
            sourceObject: '',
            urlParam: ''
        });
    }
    handleLookupChange(e) {
        const id = e.currentTarget.dataset.id;
        const lookupField = e.detail.value;
        const lt = (this.lookupTargets || []).find(
            (x) => x.lookupField === lookupField
        );
        this.updateRule(id, {
            lookupField,
            sourceObject: lt ? lt.targetObject : ''
        });
    }
    handleUrlParamChange(e) {
        this.updateRule(e.currentTarget.dataset.id, {
            urlParam: e.detail.value
        });
    }
    handleSourceObjectChange(e) {
        const sourceObject = e.detail.value;
        this.updateRule(e.currentTarget.dataset.id, { sourceObject });
        this.ensureSourceFields(sourceObject);
    }
    handleAddMapping(e) {
        const id = e.currentTarget.dataset.id;
        this.rules = this.rules.map((r) =>
            r.id === id
                ? {
                      ...r,
                      mappings: [
                          ...(r.mappings || []),
                          { id: `m${this._seq++}`, from: '', to: '' }
                      ]
                  }
                : r
        );
    }
    handleRemoveMapping(e) {
        const rid = e.currentTarget.dataset.rule;
        const mid = e.currentTarget.dataset.id;
        this.rules = this.rules.map((r) =>
            r.id === rid
                ? { ...r, mappings: r.mappings.filter((m) => m.id !== mid) }
                : r
        );
    }
    handleMappingChange(e) {
        const rid = e.currentTarget.dataset.rule;
        const mid = e.currentTarget.dataset.id;
        const prop = e.currentTarget.dataset.prop;
        const val = e.detail.value;
        this.rules = this.rules.map((r) =>
            r.id === rid
                ? {
                      ...r,
                      mappings: r.mappings.map((m) =>
                          m.id === mid ? { ...m, [prop]: val } : m
                      )
                  }
                : r
        );
    }

    buildJson() {
        const clean = this.rules
            .filter(
                (r) =>
                    (r.sourceType === 'lookup' ? r.lookupField : r.urlParam) &&
                    r.sourceObject
            )
            .map((r) => {
                const rule = {
                    sourceType: r.sourceType,
                    sourceObject: r.sourceObject,
                    mappings: (r.mappings || [])
                        .filter((m) => m.from && m.to)
                        .map((m) => ({ from: m.from, to: m.to }))
                };
                if (r.sourceType === 'url') rule.urlParam = r.urlParam;
                else rule.lookupField = r.lookupField;
                return rule;
                // eslint-disable-next-line @lwc/lwc/no-array-mutation
            })
            .filter((r) => r.mappings.length);
        return JSON.stringify(clean);
    }

    handleSave() {
        this.dispatchEvent(
            new CustomEvent('save', { detail: { json: this.buildJson() } })
        );
    }
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
