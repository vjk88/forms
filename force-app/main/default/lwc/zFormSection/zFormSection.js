import { LightningElement, api, track } from 'lwc';

export default class ZFormSection extends LightningElement {
    @api section = {}; // Normal section { sectionId, title, description, gridColumns, elements: [] }
    @api relatedListConfig = {}; // Related list { relationshipName, childSObject, displayMode, fields: [] }
    @api values = {}; // Parent form's global values map
    @api schema = {}; // Global schema snapshot
    @api errors = {}; // Global field errors map

    @track repeaterRows = []; // [{ rowId: 'row-1', values: { c_fname: '', ... } }]
    rowIdCounter = 0;

    connectedCallback() {
        if (this.isRelatedList) {
            this.handleAddRow();
        }
    }

    get isRelatedList() {
        return !!this.relatedListConfig && !!this.relatedListConfig.relationshipName;
    }

    get sectionClass() {
        return `form-section-card`;
    }

    get gridClass() {
        const cols = this.section.gridColumns || 1;
        return `grid-container columns-${cols}`;
    }

    get isTableMode() {
        return this.relatedListConfig && this.relatedListConfig.displayMode === 'table';
    }

    get isTileMode() {
        return this.relatedListConfig && this.relatedListConfig.displayMode === 'tile-menu';
    }

    get isSubSectionMode() {
        return this.relatedListConfig && this.relatedListConfig.displayMode === 'sub-section';
    }

    get computedElements() {
        if (!this.section || !this.section.elements) return [];
        return this.section.elements.map(el => {
            return {
                ...el,
                value: this.values[el.key] || '',
                schemaField: this.getSchemaFieldMetadata(el),
                errorMessage: this.errors[el.key] || ''
            };
        });
    }

    get computedRepeaterRows() {
        if (!this.repeaterRows || !this.relatedListConfig || !this.relatedListConfig.fields) return [];
        return this.repeaterRows.map((row, index) => {
            const computedFields = this.relatedListConfig.fields.map(fld => {
                return {
                    ...fld,
                    value: row.values[fld.key] || '',
                    schemaField: this.getChildSchemaFieldMetadata(fld)
                };
            });
            return {
                rowId: row.rowId,
                index: index + 1,
                fields: computedFields
            };
        });
    }

    getSchemaFieldMetadata(element) {
        if (!this.schema || !this.schema.objects || !element) return null;
        const primaryObj = Object.keys(this.schema.objects)[0];
        if (!primaryObj) return null;
        const fieldMeta = this.schema.objects[primaryObj].fields[element.fieldApiName];
        return fieldMeta || null;
    }

    getChildSchemaFieldMetadata(element) {
        if (!this.schema || !this.schema.objects || !this.relatedListConfig || !element) return null;
        const childObj = this.relatedListConfig.childSObject;
        if (!childObj || !this.schema.objects[childObj]) return null;
        const fieldMeta = this.schema.objects[childObj].fields[element.fieldApiName];
        return fieldMeta || null;
    }

    handleValueChange(event) {
        this.dispatchEvent(new CustomEvent('elementvaluechange', {
            detail: event.detail
        }));
    }

    handleAddRow() {
        this.rowIdCounter++;
        const newRow = {
            rowId: `row-${this.rowIdCounter}`,
            values: {}
        };
        if (this.relatedListConfig && this.relatedListConfig.fields) {
            this.relatedListConfig.fields.forEach(fld => {
                newRow.values[fld.key] = '';
            });
        }
        this.repeaterRows = [...this.repeaterRows, newRow];
        this.notifyRepeaterChange();
    }

    handleDeleteRow(event) {
        const rowId = event.target.dataset.rowId;
        this.repeaterRows = this.repeaterRows.filter(row => row.rowId !== rowId);
        this.notifyRepeaterChange();
    }

    handleRowValueChange(event) {
        const rowId = event.target.dataset.rowId;
        const { key, value } = event.detail;
        
        this.repeaterRows = this.repeaterRows.map(row => {
            if (row.rowId === rowId) {
                const newValues = { ...row.values, [key]: value };
                return { ...row, values: newValues };
            }
            return row;
        });
        this.notifyRepeaterChange();
    }

    notifyRepeaterChange() {
        if (!this.relatedListConfig) return;
        const relationshipName = this.relatedListConfig.relationshipName;
        const payload = this.repeaterRows.map(row => row.values);
        this.dispatchEvent(new CustomEvent('repeaterchange', {
            detail: {
                relationshipName: relationshipName,
                records: payload
            }
        }));
    }
}

