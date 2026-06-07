import { LightningElement, api, track } from 'lwc';

/**
 * Reusable related-list "repeater": renders a child-bound section once per
 * child record in one of three display styles, with add/remove. Each row's
 * fields are native lightning-input-fields (FLS, type inference, validation)
 * inside a child-object lightning-record-edit-form whose DML we never fire —
 * the parent player collects the values via collectRows() and hands them to
 * the atomic FormSubmitController.
 *
 * Public API (called by the player):
 *   collectRows()           -> { childObjectApiName, linkingField, rows[] }
 *   applyRowErrors(errors)  -> paint server RowErrors inline on the right row/field
 *   clearErrors()
 *   reportValidity()        -> client-side required check (boolean)
 */
export default class FormRepeater extends LightningElement {
  @api childObjectApiName;
  @api linkingField;
  @api title = 'Records';
  @api addLabel = 'Add';
  @api displayStyle = 'stacked'; // stacked | table | tile
  @api disabled = false;

  _fields = [];
  _minRows = 0;
  _maxRows = 0; // 0 = unlimited
  @track _rows = []; // [{ key, values:{api:val}, errors:{api|__row__:msg} }]
  _seq = 0;

  // Tile-style modal state
  @track _modalOpen = false;
  _editingKey = null;
  @track _working = {};

  // --- Public config ---
  @api
  get fields() {
    return this._fields;
  }
  set fields(val) {
    // Hidden fields aren't entered by the user; drop them from the row UI.
    this._fields = (val || []).filter((f) => f && f.fieldApiName && !f.isHidden);
  }

  @api
  get minRows() {
    return this._minRows;
  }
  set minRows(v) {
    this._minRows = Number(v) || 0;
    this.ensureMinRows();
  }

  @api
  get maxRows() {
    return this._maxRows;
  }
  set maxRows(v) {
    this._maxRows = Number(v) || 0;
  }

  connectedCallback() {
    this.ensureMinRows();
  }

  ensureMinRows() {
    // Inline styles start with at least one editable row (or the configured
    // minimum) so the user sees where to type. Tile starts from its minimum
    // only (rows are added via the modal).
    const floor = this.isTile ? this._minRows : Math.max(this._minRows, 1);
    while (this._rows.length < floor) {
      this._rows.push(this.blankRow());
    }
  }

  blankRow() {
    return { key: `r-${this._seq++}`, values: {}, errors: {} };
  }

  // --- Style flags ---
  get isStacked() {
    return this.displayStyle === 'stacked';
  }
  get isTable() {
    return this.displayStyle === 'table';
  }
  get isTile() {
    return this.displayStyle === 'tile';
  }
  get rootClass() {
    return `repeater repeater--${this.displayStyle}`;
  }

  get count() {
    return this._rows.length;
  }
  get hasRows() {
    return this._rows.length > 0;
  }
  get isEmpty() {
    return this._rows.length === 0;
  }

  get addDisabled() {
    return (
      this.disabled || (this._maxRows > 0 && this._rows.length >= this._maxRows)
    );
  }

  // Same grid template on the header row and every data row keeps the
  // "table" columns aligned without a real <table> (which can't host a
  // record-edit-form between <tr> and <td>).
  get tableGridStyle() {
    return `grid-template-columns: repeat(${this._fields.length}, minmax(8rem, 1fr)) 2.75rem;`;
  }

  get columns() {
    return this._fields.map((f) => ({
      key: f.fieldApiName,
      label: f.label || f.fieldApiName,
      required: !!f.required
    }));
  }

  // Rows for the inline (stacked / table) styles.
  get rowsView() {
    return this._rows.map((r, i) => ({
      key: r.key,
      displayIndex: i + 1,
      heading: `${this.singularTitle} ${i + 1}`,
      hasRowError: !!r.errors.__row__,
      rowError: r.errors.__row__ || '',
      gridStyle: this.tableGridStyle,
      cells: this._fields.map((f) => ({
        key: `${r.key}-${f.fieldApiName}`,
        fieldApiName: f.fieldApiName,
        required: !!f.required,
        disabled: this.disabled || !!f.readOnly,
        variant: this.isTable ? 'label-hidden' : 'standard',
        hasError: !!r.errors[f.fieldApiName],
        errorMessage: r.errors[f.fieldApiName] || ''
      }))
    }));
  }

  get singularTitle() {
    const t = this.title || 'Record';
    // naive singularisation for the row heading ("Contacts" -> "Contact")
    return t.endsWith('s') ? t.slice(0, -1) : t;
  }

  // --- Tile view ---
  get tilesView() {
    const preview = this._fields.slice(0, 3);
    return this._rows.map((r, i) => ({
      key: r.key,
      index: i,
      title: `${this.singularTitle} ${i + 1}`,
      hasError: Object.keys(r.errors).length > 0,
      errorMessage: r.errors.__row__ || Object.values(r.errors)[0] || '',
      lines: preview.map((f) => ({
        key: f.fieldApiName,
        label: f.label || f.fieldApiName,
        value: this.displayValue(r.values[f.fieldApiName])
      }))
    }));
  }

  displayValue(v) {
    return v === undefined || v === null || v === '' ? '—' : String(v);
  }

  get modalOpen() {
    return this._modalOpen;
  }
  get modalTitle() {
    return `${this._editingKey ? 'Edit' : 'Add'} ${this.singularTitle}`;
  }
  get modalCells() {
    return this._fields.map((f) => ({
      key: f.fieldApiName,
      fieldApiName: f.fieldApiName,
      required: !!f.required,
      disabled: this.disabled || !!f.readOnly,
      value: this._working[f.fieldApiName]
    }));
  }

  // --- Inline row value sync (stacked / table) ---
  // Mutating values WITHOUT reassigning _rows avoids a re-render that would
  // reset the native input (the prefill-overwrite bug we hit on the parent).
  handleCellChange(event) {
    const { rowkey, field } = event.currentTarget.dataset;
    const row = this._rows.find((r) => r.key === rowkey);
    if (row) {
      row.values[field] = event.detail.value;
      if (row.errors[field] || row.errors.__row__) {
        // clearing the error needs a render, so reassign
        delete row.errors[field];
        delete row.errors.__row__;
        this._rows = [...this._rows];
      }
    }
  }

  // --- Add / remove ---
  handleAddRow() {
    if (this.addDisabled) return;
    this._rows = [...this._rows, this.blankRow()];
    this.fireChange();
  }

  handleRemoveRow(event) {
    const { rowkey } = event.currentTarget.dataset;
    this._rows = this._rows.filter((r) => r.key !== rowkey);
    this.ensureMinRows();
    this.fireChange();
  }

  // --- Tile modal ---
  handleOpenAdd() {
    if (this.addDisabled) return;
    this._editingKey = null;
    this._working = {};
    this._modalOpen = true;
  }

  handleEditTile(event) {
    const { rowkey } = event.currentTarget.dataset;
    const row = this._rows.find((r) => r.key === rowkey);
    if (!row) return;
    this._editingKey = rowkey;
    this._working = { ...row.values };
    this._modalOpen = true;
  }

  handleModalCellChange(event) {
    this._working[event.currentTarget.dataset.field] = event.detail.value;
  }

  handleModalSave() {
    if (this._editingKey) {
      const row = this._rows.find((r) => r.key === this._editingKey);
      if (row) {
        row.values = { ...this._working };
        row.errors = {};
      }
    } else {
      this._rows.push({ key: `r-${this._seq++}`, values: { ...this._working }, errors: {} });
    }
    this._rows = [...this._rows];
    this._modalOpen = false;
    this.fireChange();
  }

  handleModalCancel() {
    this._modalOpen = false;
  }

  fireChange() {
    this.dispatchEvent(new CustomEvent('rowschange', { detail: { count: this._rows.length } }));
  }

  // --- Public API for the player ---

  @api
  collectRows() {
    return {
      childObjectApiName: this.childObjectApiName,
      linkingField: this.linkingField,
      rows: this._rows.map((r) => ({ ...r.values }))
    };
  }

  @api
  applyRowErrors(errors) {
    const byKey = this._rows.map((r) => ({ ...r, errors: {} }));
    (errors || []).forEach((e) => {
      const row = byKey[e.rowIndex];
      if (!row) return;
      const targets = e.fields && e.fields.length ? e.fields : ['__row__'];
      targets.forEach((f) => {
        row.errors[f] = e.message;
      });
    });
    this._rows = byKey;
  }

  @api
  clearErrors() {
    this._rows = this._rows.map((r) => ({ ...r, errors: {} }));
  }

  @api
  reportValidity() {
    // For inline styles, ask the native fields. For tile, check stored values
    // against the required config (fields aren't mounted outside the modal).
    if (this.isTile) {
      let ok = true;
      const updated = this._rows.map((r) => {
        const errors = {};
        this._fields.forEach((f) => {
          if (f.required && !r.values[f.fieldApiName]) {
            errors[f.fieldApiName] = 'Complete this field.';
            ok = false;
          }
        });
        return { ...r, errors };
      });
      this._rows = updated;
      return ok;
    }
    let valid = true;
    this.template.querySelectorAll('lightning-input-field').forEach((inp) => {
      if (inp.reportValidity && !inp.reportValidity()) valid = false;
    });
    return valid;
  }
}
