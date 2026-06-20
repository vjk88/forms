import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPicklistOptions from '@salesforce/apex/FormViewerController.getPicklistOptions';

/**
 * Renders ONE form section live (PHASE2_WORKPLAN §2.1) — the new stack's
 * element renderer. Owns its own lightning-record-edit-form (platform rule:
 * lightning-input-field only registers inside a record-edit-form in the SAME
 * template), draws all 14 element kinds, and hosts c/formRepeater for
 * related-list sections.
 *
 * The record-edit-form is CONTEXT ONLY (labels, FLS, field types, record
 * values in edit mode) — native DML never fires; c/formViewer collects values
 * via getValues()/collectRepeaterBlocks() and submits through
 * FormSubmitController.
 *
 * Accepts the raw body-JSON section shape (id/name/elements/relatedSections)
 * or the normalized {key,title,style,elements} form — both are storage
 * realities, so both are handled here and nowhere else.
 *
 * Events (bubbles + composed — they cross the engine's shadow boundaries):
 *   'sectionregister' {sectionKey, host}   — on connect; host exposes the @api
 *                                            surface so c/formViewer can call
 *                                            into sections without querySelector
 *                                            across shadow roots (stale entries
 *                                            are pruned via host.isConnected)
 *   'sectionvalue'    {sectionKey, values: {fieldApi: value}}
 *   'sectionvalidity' {sectionKey, valid}
 */

// Only these ignore the section grid and always span every column. Content that
// can sensibly sit in a column (Image/Callout/Display-Text/Consent/File-Upload)
// sizes by colSpan like a field — so it behaves the same inside a section. (In a
// content BLOCK the section is 1 column, so those render full-width there anyway.)
const FULL_WIDTH_TYPES = ['Hero', 'Divider', 'Spacer'];

// Content blocks that are always plain — their frame is meaningless (a rule, a
// self-styled callout, a gap). Mirrors formStudio's PLAIN_ONLY_BLOCK_TYPES.
const PLAIN_ONLY_BLOCK_TYPES = ['Divider', 'Callout', 'Spacer'];

const CALLOUT_ICONS = {
  success: 'utility:success',
  warning: 'utility:warning',
  error: 'utility:error',
  info: 'utility:info'
};

const RENDER_KINDS = {
  Toggle: 'toggle',
  Slider: 'slider',
  Radio_Buttons: 'radio',
  Dropdown: 'dropdown',
  Checkbox_Group: 'checkboxgroup',
  Custom_MultiSelect: 'checkboxgroup'
};

export default class FormSectionRenderer extends LightningElement {
  @api objectApiName;
  @api recordTypeId;
  @api recordId;
  @api mode = 'live'; // live | preview
  @api density = 'cozy';
  /** Optional {fieldApi: value} — URL/record prefill from c/formViewer. */
  @api prefillValues;

  @track _values = {};
  @track _fieldErrors = {};
  @track _files = {}; // elementId -> [{ fileName, base64, contentType }] (create-mode uploads)
  _section;
  _picklistMap = {};
  _userEdited = new Set();
  _prefillApplied = new Set();
  _recordSeeded = false;

  @api
  get section() {
    return this._section;
  }
  set section(v) {
    this._section = v;
  }

  // Picklist values straight from schema for radio/dropdown/checkbox groups
  // without Custom_Options_JSON__c. Cacheable, so N sections on one object
  // share a single server trip. Guests are refused by the controller — they
  // fall back to customOptions (the publish-time snapshot), same as the old
  // player.
  @wire(getPicklistOptions, { objectApiName: '$objectApiName' })
  wiredPicklists({ data, error }) {
    if (data) {
      this._picklistMap = data;
    } else if (error) {
      this._picklistMap = {};
    }
  }

  // --- Normalized section ---

  get sec() {
    const s = this._section || {};
    const title = s.title !== undefined ? s.title : s.name;
    return {
      key: s.key || s.id || 'section',
      title,
      style: s.style || 'card',
      icon: s.icon,
      description: s.description || '',
      collapsible: !!s.collapsible,
      collapsedByDefault: !!s.collapsedByDefault,
      // A header still shows for a collapsible section even without a title (so
      // there's something to click); otherwise it needs a title.
      showHeader: s.showHeader !== false && (!!title || !!s.collapsible),
      gridColumns: s.gridColumns || 1,
      elements: s.elements || [],
      repeaters: s.relatedSections || s.repeaters || []
    };
  }

  // Collapse state — defaults to collapsedByDefault, then user toggles override it.
  @track _collapsedOverride = null;
  get isCollapsed() {
    if (!this.sec.collapsible) return false;
    return this._collapsedOverride != null ? this._collapsedOverride : this.sec.collapsedByDefault;
  }
  get collapseChevron() {
    return this.isCollapsed ? 'utility:chevronright' : 'utility:chevrondown';
  }
  get headerClass() {
    return this.sec.collapsible ? 'sec-header sec-header_toggle' : 'sec-header';
  }
  get bodyClass() {
    return this.isCollapsed ? 'sec-content is-collapsed' : 'sec-content';
  }
  toggleCollapse() {
    if (this.sec.collapsible) this._collapsedOverride = !this.isCollapsed;
  }

  connectedCallback() {
    this.dispatchEvent(
      new CustomEvent('sectionregister', {
        bubbles: true,
        composed: true,
        detail: { sectionKey: this.sec.key, host: this.template.host }
      })
    );
  }

  // Section hidden by a parent-evaluated visibility rule. Same contract as
  // element-level: stays mounted (CSS hide) and never blocks submit.
  get isSectionHidden() {
    return !!this._section && this._section.visible === false;
  }

  // Section framing: a regular field-section is a PLAIN container (no border) — the
  // style picker moved to standalone content blocks. Only a content block (one
  // content element on its own) carries a configurable style (card/plain/boxed).
  get secStyleClass() {
    const s = this._section || {};
    // Divider/Callout/Spacer content blocks are always plain — their frame is
    // meaningless (a rule, a self-styled callout, a gap).
    if (s.contentBlock) {
      const first = (s.elements || [])[0];
      if (first && PLAIN_ONLY_BLOCK_TYPES.includes(first.type)) return 'sec-style-plain';
    }
    // Field-sections AND content blocks honor their RESOLVED style. The engine
    // derives it from the global "Section look" (skin.sectionDefault) with a
    // per-section override as the escape hatch; defaults to plain when unset.
    return `sec-style-${s.style || 'plain'}`;
  }

  get hostClass() {
    return `sec ${this.secStyleClass} den-${this.density || 'cozy'}${
      this.isSectionHidden ? ' is-hidden' : ''
    }`;
  }

  get hasRecordId() {
    return !!this.recordId;
  }

  // --- Element view models (behavior parity with the old player's
  // enrichElement — the 14-kind matrix lives in PHASE2_WORKPLAN §0) ---

  get vmElements() {
    const cols = this.sec.gridColumns;
    return this.sec.elements.map((el) => this.enrich(el, cols));
  }

  enrich(el, cols) {
    const type = el.type || 'Field';
    const uiBehavior = el.uiBehavior || 'None';
    const isFullWidth = FULL_WIDTH_TYPES.includes(type);
    const renderKind =
      type === 'Field' ? RENDER_KINDS[el.renderAs] || 'default' : 'none';
    const isCustomField = type === 'Field' && renderKind !== 'default';
    // Hidden two ways: authored UI behavior, or a visibility rule the parent
    // (formViewer) evaluated to false. Both keep the control MOUNTED (CSS
    // hide) so entered values survive a rule flicker — and a hidden field
    // must never block submit by being required.
    const isHidden = uiBehavior === 'Hidden' || el.visible === false;

    let customOptions = [];
    try {
      if (el.customOptionsJson) {
        const parsed = JSON.parse(el.customOptionsJson);
        if (Array.isArray(parsed)) customOptions = parsed;
      }
    } catch {
      /* malformed option JSON renders as empty options */
    }

    const out = {
      key: el.key || el.id,
      type,
      fieldApiName: el.fieldApiName,
      label: el.name || el.label,
      content: el.content,
      helpText: el.helpText,
      isFieldDefault: type === 'Field' && !isCustomField,
      isCustomField,
      isToggle: renderKind === 'toggle',
      isSlider: renderKind === 'slider',
      isRadio: renderKind === 'radio',
      isDropdown: renderKind === 'dropdown',
      isCheckboxGroup: renderKind === 'checkboxgroup',
      isMulti: renderKind === 'checkboxgroup',
      sliderMin: el.sliderMin != null ? el.sliderMin : 0,
      sliderMax: el.sliderMax != null ? el.sliderMax : 100,
      sliderStep: el.sliderStep != null ? el.sliderStep : 1,
      isDisplayText: type === 'Rich_Text' || type === 'Static_Text',
      isDivider: type === 'Divider',
      isImage: type === 'Image',
      hasImage: !!el.imageUrl,
      imageUrl: el.imageUrl,
      imageAlt: el.imageAlt || el.name || 'Image',
      imageClass: `el-image img-${el.imageSize || 'medium'}`,
      isCallout: type === 'Callout',
      calloutClass: `el-callout callout-${el.calloutVariant || 'info'}`,
      calloutIcon: CALLOUT_ICONS[el.calloutVariant] || CALLOUT_ICONS.info,
      // Hero (HEADER_HERO_DND_SPEC): inline image + headline + subtext +
      // optional CTA (action 'link' → anchor, 'start' → jump-to-form button).
      isHero: type === 'Hero',
      heroHasImage: !!el.imageUrl,
      heroImageUrl: el.imageUrl,
      heroImageAlt: el.imageAlt || el.headline || 'Hero image',
      heroHeadline: el.headline,
      heroSubtext: el.subtext,
      heroHasCta: !!(el.cta && el.cta.label),
      heroCtaLabel: el.cta && el.cta.label,
      heroCtaIsLink: !!(el.cta && el.cta.action === 'link'),
      heroCtaHref: (el.cta && el.cta.href) || '#',
      isSpacer: type === 'Spacer',
      spacerClass: `el-spacer spacer-${el.spacerSize || 'medium'}`,
      // Empty space — a blank grid cell (NOT full width) that occupies one or
      // more columns to push other fields around the grid.
      isEmptySpace: type === 'Empty_Space',
      isConsent: type === 'Consent',
      consentContent: el.content || 'I agree to the terms and conditions.',
      consentRequired: el.consentRequired !== false && !isHidden,
      isFileUpload: type === 'File_Upload',
      fileMultiple: el.allowMultiple !== false,
      fileAccept: el.accept || '',
      fileElId: el.key || el.id || el.label,
      fileNames: (this._files[el.key || el.id || el.label] || []).map((f, i) => ({
        key: `f-${i}`,
        idx: i,
        name: f.fileName
      })),
      readOnly: uiBehavior === 'Read_Only',
      effectiveRequired: uiBehavior === 'Required' && !isHidden
    };

    if (isCustomField) {
      const raw = this._values[el.fieldApiName];
      out.value = out.isMulti
        ? Array.isArray(raw)
          ? raw
          : []
        : raw === undefined
          ? out.isToggle
            ? false
            : ''
          : raw;
      out.options =
        customOptions.length
          ? customOptions
          : this._picklistMap[el.fieldApiName] || [];
      out.errorMessage = this._fieldErrors[el.fieldApiName] || '';
      out.hasError = !!out.errorMessage;
    }

    // Per-element width: a field (or Empty space) spans `colSpan` of the section's
    // columns (1 = one cell, cols = full width). Content blocks (image/callout/…)
    // stay full-width. Stacks to one column on a narrow box (the @container rule in
    // layoutSectionHost.css). SLDS fractions (1-of-2 … 3-of-4) all exist for cols ≤ 4.
    let sizeClass = 'slds-size_1-of-1';
    if (!isFullWidth && cols > 1) {
      const span = Math.min(Math.max(parseInt(el.colSpan, 10) || 1, 1), cols);
      sizeClass =
        span >= cols
          ? 'slds-size_1-of-1'
          : `slds-size_1-of-1 slds-medium-size_${span}-of-${cols}`;
    }
    out.gridItemClass = `slds-col ${sizeClass} el${isHidden ? ' is-hidden' : ''}`;
    return out;
  }

  get vmRepeaters() {
    return this.sec.repeaters.map((rs) => {
      const fields = (rs.elements || [])
        .filter((e) => (e.type || 'Field') === 'Field' && e.fieldApiName)
        .map((e) => {
          const ui = e.uiBehavior || 'None';
          return {
            fieldApiName: e.fieldApiName,
            label: e.name || e.label || e.fieldApiName,
            required: ui === 'Required',
            readOnly: ui === 'Read_Only',
            isHidden: ui === 'Hidden'
          };
        });
      const title = rs.name || rs.title || 'Records';
      const singular = title.endsWith('s') ? title.slice(0, -1) : title;
      return {
        id: rs.id || rs.key,
        title,
        // Stored-model naming: parentSObjectApi IS the child object;
        // linkingField is the child lookup back to the parent.
        childObjectApiName: rs.childObjectApiName || rs.parentSObjectApi,
        linkingField: rs.linkingField,
        displayStyle: rs.displayStyle || 'stacked',
        addLabel: rs.addLabel || `Add ${singular}`,
        minRows: rs.minRows != null ? Number(rs.minRows) : 0,
        maxRows: rs.maxRows != null ? Number(rs.maxRows) : 0,
        fields
      };
    });
  }

  get hasRepeaters() {
    return this.sec.repeaters.length > 0;
  }

  // --- Prefill (imperative — binding value={undefined} over an input-field
  // in edit mode would wipe the record value, so prefill is pushed, never
  // bound) ---

  renderedCallback() {
    const pf = this.prefillValues;
    if (!pf) return;
    Object.keys(pf).forEach((field) => {
      if (this._prefillApplied.has(field) || this._userEdited.has(field)) {
        return;
      }
      const native = this.template.querySelector(
        `lightning-input-field[data-field="${field}"]:not(.carrier)`
      );
      if (native) {
        native.value = pf[field];
        this._prefillApplied.add(field);
        this._values = { ...this._values, [field]: pf[field] };
        return;
      }
      // Custom-rendered fields take prefill through the live value map.
      // Multi-selects round-trip as ';'-joined strings (getValues output fed
      // back on page remount) — split back into the array the control needs.
      if (this.isCustomFieldApi(field)) {
        let v = pf[field];
        if (this.isMultiFieldApi(field) && typeof v === 'string') {
          v = v ? v.split(';') : [];
        }
        this._values = { ...this._values, [field]: v };
        this._prefillApplied.add(field);
      }
    });
  }

  isCustomFieldApi(field) {
    return this.sec.elements.some(
      (el) =>
        el.fieldApiName === field &&
        (el.type || 'Field') === 'Field' &&
        !!RENDER_KINDS[el.renderAs]
    );
  }

  isMultiFieldApi(field) {
    return this.sec.elements.some(
      (el) =>
        el.fieldApiName === field && RENDER_KINDS[el.renderAs] === 'checkboxgroup'
    );
  }

  // In edit mode, seed custom controls with the record's current values (the
  // carrier input-field loads them via the record-edit-form).
  handleFormLoad(event) {
    if (this._recordSeeded || !this.recordId) return;
    this._recordSeeded = true;
    const records = event.detail && event.detail.records;
    const rec = records && records[this.recordId];
    const fields = rec && rec.fields;
    if (!fields) return;
    let changed = false;
    const next = { ...this._values };
    this.sec.elements.forEach((el) => {
      const kind = RENDER_KINDS[el.renderAs];
      if (!kind || !el.fieldApiName || next[el.fieldApiName] !== undefined) {
        return;
      }
      const f = fields[el.fieldApiName];
      if (!f || f.value === null || f.value === undefined) return;
      next[el.fieldApiName] =
        kind === 'checkboxgroup' && typeof f.value === 'string'
          ? f.value.split(';')
          : f.value;
      changed = true;
    });
    if (changed) {
      this._values = next;
      this.emitValue();
    }
  }

  // --- Change handling ---

  handleFieldChange(event) {
    const fieldName = event.target && event.target.fieldName;
    if (!fieldName) return;
    this._userEdited.add(fieldName);
    const v = event.detail ? event.detail.value : event.target.value;
    this._values = { ...this._values, [fieldName]: v };
    this.emitValue();
  }

  handleCustomChange(event) {
    const field = event.target.dataset.field;
    if (!field) return;
    this._userEdited.add(field);
    const v =
      event.target.dataset.toggle === 'true'
        ? event.target.checked
        : event.detail.value;
    this._values = { ...this._values, [field]: v };
    if (this._fieldErrors[field]) {
      const errs = { ...this._fieldErrors };
      delete errs[field];
      this._fieldErrors = errs;
    }
    this.emitValue();
  }

  // Hero CTA with action 'start' = jump to the form. Scroll the first field
  // here into view if present; otherwise bubble so c/formViewer can advance
  // (the hero often sits in its own section with no fields of its own).
  handleHeroStart() {
    const field = this.template.querySelector(
      'lightning-input-field:not(.carrier), lightning-input, lightning-combobox'
    );
    if (field && typeof field.scrollIntoView === 'function') {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof field.focus === 'function') field.focus();
      return;
    }
    this.dispatchEvent(
      new CustomEvent('herostart', { bubbles: true, composed: true })
    );
  }

  emitValue() {
    this.dispatchEvent(
      new CustomEvent('sectionvalue', {
        bubbles: true,
        composed: true,
        detail: { sectionKey: this.sec.key, values: this.getValues() }
      })
    );
  }

  emitValidity(valid) {
    this.dispatchEvent(
      new CustomEvent('sectionvalidity', {
        bubbles: true,
        composed: true,
        detail: { sectionKey: this.sec.key, valid }
      })
    );
  }

  // --- Public API (called by c/formViewer per the §2.1 contract) ---

  /** {fieldApi: value} for this section — native fields + custom controls. */
  @api
  getValues() {
    const values = {};
    this.template.querySelectorAll('lightning-input-field').forEach((f) => {
      if (!f.fieldName) return;
      if (f.classList && f.classList.contains('carrier')) return;
      values[f.fieldName] = f.value;
    });
    this.sec.elements.forEach((el) => {
      if (!RENDER_KINDS[el.renderAs] || !el.fieldApiName) return;
      const v = this._values[el.fieldApiName];
      if (v === undefined) return;
      values[el.fieldApiName] =
        RENDER_KINDS[el.renderAs] === 'checkboxgroup'
          ? Array.isArray(v)
            ? v.join(';')
            : v
          : v;
    });
    return values;
  }

  // --- File upload (create mode: capture to base64, attach on submit) ---
  // ~4.3 MB ceiling per file, matching FormSubmitController's server cap.
  handleFilePick(event) {
    const elId = event.target.dataset.elId;
    const list = Array.from((event.target.files) || []);
    if (!elId || !list.length) return;
    Promise.all(list.map((file) => this.readFile(file))).then((read) => {
        const valid = read.filter((f) => f && f.base64);
        if (!valid.length) return;
        const existing = this._files[elId] || [];
        this._files = { ...this._files, [elId]: [...existing, ...valid] };
    });
  }
  readFile(file) {
    return new Promise((resolve) => {
        if (file.size > 4500000) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'File too large',
                    message: `"${file.name}" exceeds the 4 MB limit and was skipped.`,
                    variant: 'error'
                })
            );
            resolve(null);
            return;
        }
        const reader = new FileReader();
        reader.onload = () =>
            resolve({ fileName: file.name, contentType: file.type, base64: reader.result });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
  }
  handleFileRemove(event) {
    const elId = event.currentTarget.dataset.elId;
    const idx = parseInt(event.currentTarget.dataset.idx, 10);
    const arr = (this._files[elId] || []).filter((_, i) => i !== idx);
    this._files = { ...this._files, [elId]: arr };
  }

  /** Respondent uploads across this section → [{fileName, base64, contentType}]. */
  @api
  collectFiles() {
    const out = [];
    Object.keys(this._files).forEach((elId) => {
        (this._files[elId] || []).forEach((f) => {
            if (f && f.base64) out.push({ fileName: f.fileName, base64: f.base64, contentType: f.contentType });
        });
    });
    return out;
  }

  /** Related-list rows, one block per repeater, tagged for error routing. */
  @api
  collectRepeaterBlocks() {
    const blocks = [];
    this.template.querySelectorAll('c-form-repeater').forEach((rep) => {
      const block = rep.collectRows ? rep.collectRows() : null;
      if (block) {
        blocks.push({ ...block, repeaterId: rep.dataset.rep });
      }
    });
    return blocks;
  }

  /** Client-side required/format check; paints errors; emits validity. */
  @api
  reportValidity() {
    // A rule-hidden section never blocks submit — even schema-required
    // native fields inside it (the server is the final arbiter there).
    if (this.isSectionHidden) {
      this.emitValidity(true);
      return true;
    }
    let valid = true;
    this.template.querySelectorAll('lightning-input-field').forEach((f) => {
      if (f.classList && f.classList.contains('carrier')) return;
      if (typeof f.reportValidity === 'function' && !f.reportValidity()) {
        valid = false;
      }
    });
    this.template
      .querySelectorAll('[data-custom="true"]')
      .forEach((c) => {
        if (typeof c.reportValidity === 'function' && !c.reportValidity()) {
          valid = false;
        }
      });
    this.template.querySelectorAll('c-form-repeater').forEach((rep) => {
      if (rep.reportValidity && !rep.reportValidity()) valid = false;
    });
    // SF-standard: a collapsed section auto-expands when it has an error, so the
    // respondent can see and fix the offending field.
    if (!valid && this.isCollapsed) this._collapsedOverride = false;
    this.emitValidity(valid);
    return valid;
  }

  /** Wipe stale server errors so a resubmit re-validates from scratch. */
  @api
  clearServerErrors() {
    this.template.querySelectorAll('lightning-input-field').forEach((f) => {
      if (typeof f.setCustomValidity === 'function') f.setCustomValidity('');
    });
    this._fieldErrors = {};
    this.template.querySelectorAll('c-form-repeater').forEach((rep) => {
      if (rep.clearErrors) rep.clearErrors();
    });
  }

  /** Route server (validation-rule) errors inline: {fieldApi: message}. */
  @api
  applyFieldErrors(errorsByField) {
    if (!errorsByField) return;
    const customErrs = { ...this._fieldErrors };
    Object.keys(errorsByField).forEach((field) => {
      const native = this.template.querySelector(
        `lightning-input-field[data-field="${field}"]:not(.carrier)`
      );
      if (native && typeof native.setCustomValidity === 'function') {
        native.setCustomValidity(errorsByField[field]);
        native.reportValidity();
      } else {
        customErrs[field] = errorsByField[field];
      }
    });
    this._fieldErrors = customErrs;
  }

  /** Paint child-row errors on the right repeater (id from collect blocks). */
  @api
  applyRepeaterRowErrors(repeaterId, errors) {
    const reps = this.template.querySelectorAll('c-form-repeater');
    for (const rep of reps) {
      if (rep.dataset.rep === String(repeaterId) && rep.applyRowErrors) {
        rep.applyRowErrors(errors);
        return;
      }
    }
  }
}
