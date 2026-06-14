import { LightningElement, api, track } from "lwc";
import { resolveSectionStyle } from "c/zFormThemes";

const TYPE_ICONS = {
  Field: "utility:text",
  Rich_Text: "utility:richtextbulletedlist",
  Static_Text: "utility:text_template",
  Image: "utility:image",
  Callout: "utility:info",
  Spacer: "utility:expand_alt",
  Consent: "utility:check",
  Divider: "utility:rules",
  File_Upload: "utility:upload",
  Lookup: "utility:record_lookup",
  Formula: "utility:formula",
  NPS_Score: "utility:rating",
  Likert_Scale: "utility:groups",
  Star_Rating: "utility:favorite",
  Long_Text_Response: "utility:textarea"
};

const FULL_WIDTH_TYPES = new Set([
  "Rich_Text",
  "Static_Text",
  "Image",
  "Callout",
  "Spacer",
  "Consent",
  "Divider"
]);

export default class ZDesignerCanvas extends LightningElement {
  @api isEditable = false;
  @api relationships = [];
  @api primaryObject = '';
  @track sections = [];
  @track selectedSectionIndex = -1;
  @track selectedElementIndex = -1;
  @track showRelatedPicker = false;

  _sectionDefaultStyle = "card";

  @api
  get sectionData() {
    return this.sections;
  }
  set sectionData(value) {
    this.sections = (value || []).map((s, idx) => this.enrichSection(s, idx));
  }

  // The template's default section style — when it changes, re-resolve every
  // section's style class (sections that aren't explicitly overridden follow it).
  @api
  get sectionDefaultStyle() {
    return this._sectionDefaultStyle;
  }
  set sectionDefaultStyle(value) {
    this._sectionDefaultStyle = value || "card";
    if (this.sections && this.sections.length) {
      this.sections = this.sections.map((s, idx) => this.enrichSection(s, idx));
    }
  }

  // Build a section card's class: base + resolved style variant + selection.
  cardClassFor(section, isSelected) {
    const styleName = resolveSectionStyle(
      null, // force global uniform style
      this._sectionDefaultStyle
    );
    return `section-card style-${styleName}${isSelected ? " selected" : ""}`;
  }

  // Clears any selected section/element highlight. Called by the designer when
  // the form header (rendered outside this component) is selected.
  @api
  clearSelection() {
    this.selectedSectionIndex = -1;
    this.selectedElementIndex = -1;
    this.sections = this.sections.map((s) => ({
      ...s,
      cardClass: this.cardClassFor(s, false)
    }));
  }

  enrichElement(el, gridColumns) {
    const isFullWidth = FULL_WIDTH_TYPES.has(el.type);
    const uiBehavior = el.uiBehavior || 'None';
    const chipClass = `element-chip${isFullWidth && gridColumns > 1 ? ' full-width' : ''}`;
    
    // Compute responsive SLDS grid item class
    let sizeClass = 'slds-size_1-of-1';
    if (!isFullWidth) {
      if (gridColumns === 2) {
        sizeClass = 'slds-size_1-of-1 slds-medium-size_1-of-2';
      } else if (gridColumns === 3) {
        sizeClass = 'slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-3';
      } else if (gridColumns === 4) {
        sizeClass = 'slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-4';
      }
    }
    const gridItemClass = `slds-col ${sizeClass} ${chipClass}`;

    return {
      ...el,
      iconName: TYPE_ICONS[el.type] || "utility:text",
      label: el.name || el.fieldApiName || el.type,
      isRequired: uiBehavior === 'Required',
      isReadOnly: uiBehavior === 'Read_Only',
      chipClass,
      gridItemClass
    };
  }

  enrichSection(section, idx) {
    const cols = section.gridColumns || 1;
    const elements = (section.elements || []).map((el) => this.enrichElement(el, cols));

    const relatedSections = (section.relatedSections || []).map((rs, ri) => {
      const relElements = (rs.elements || []).map((el) => this.enrichElement(el, rs.gridColumns || 1));
      return {
        ...rs,
        id: rs.id || `rel-${idx}-${ri}`,
        elements: relElements,
        hasElements: relElements.length > 0,
        repeaterInfo: rs.linkingField ? `via ${rs.linkingField}` : '',
        gridClass: `section-grid columns-${rs.gridColumns || 1}`
      };
    });

    const isSelected = idx === this.selectedSectionIndex;
    const showHeader = section.showHeader !== false;
    const headerBg = section.headerBackgroundColor || '#f3f3f3';
    const padding = section.padding || 'medium';
    const isParent = section.contextType !== 'Related_Child';

    return {
      ...section,
      id: section.id || `section-${idx}`,
      elements,
      relatedSections,
      hasElements: elements.length > 0,
      hasRelatedSections: relatedSections.length > 0,
      canAddRelated: isParent && this.isEditable,
      showHeader,
      headerStyle: '', // Ignore individual background color overrides to ensure uniformity
      gridClass: `section-grid columns-${cols}`,
      bodyClass: `section-body padding-${padding}`,
      cardClass: this.cardClassFor(section, isSelected)
    };
  }

  get hasSections() {
    return this.sections && this.sections.length > 0;
  }

  get relationshipOptions() {
    return (this.relationships || []).map(r => ({
      label: `${r.childObjectLabel} (via ${r.fieldName})`,
      value: JSON.stringify({
        name: r.name,
        childObject: r.childObject,
        childObjectLabel: r.childObjectLabel,
        fieldName: r.fieldName
      })
    }));
  }

  // --- Section events ---

  handleAddSection() {
    this.showRelatedPicker = false;
    this.dispatchEvent(new CustomEvent("addsection"));
  }

  handleToggleRelatedPicker() {
    this.showRelatedPicker = !this.showRelatedPicker;
  }

  handleRelatedSectionSelect(event) {
    const data = JSON.parse(event.detail.value);
    this.showRelatedPicker = false;
    this.dispatchEvent(new CustomEvent("addrelatedsection", {
      detail: data
    }));
  }

  handleSectionClick(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.selectedSectionIndex = idx;
    this.selectedElementIndex = -1;
    this.sections = this.sections.map((s, i) => ({
      ...s,
      cardClass: this.cardClassFor(s, i === idx)
    }));

    this.dispatchEvent(
      new CustomEvent("selectsection", {
        detail: { index: idx, section: this.sections[idx] }
      })
    );
  }

  handleSectionSettings(event) {
    event.stopPropagation();
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.dispatchEvent(
      new CustomEvent("editsection", {
        detail: { index: idx }
      })
    );
  }

  handleDeleteSection(event) {
    event.stopPropagation();
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.dispatchEvent(
      new CustomEvent("deletesection", {
        detail: { index: idx }
      })
    );
  }

  // --- Element events ---

  handleElementClick(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const eIdx = parseInt(event.currentTarget.dataset.elementIndex, 10);
    this.selectedSectionIndex = sIdx;
    this.selectedElementIndex = eIdx;

    this.dispatchEvent(
      new CustomEvent("selectelement", {
        detail: {
          sectionIndex: sIdx,
          elementIndex: eIdx,
          element: this.sections[sIdx].elements[eIdx]
        }
      })
    );
  }

  handleRemoveElement(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const eIdx = parseInt(event.currentTarget.dataset.elementIndex, 10);
    this.dispatchEvent(
      new CustomEvent("removeelement", {
        detail: { sectionIndex: sIdx, elementIndex: eIdx }
      })
    );
  }

  // --- Drag & Drop ---

  // --- Section drag/reorder ---

  handleSectionDragStart(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    const data = { dragType: "reorder-section", sourceIndex: idx };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }

  handleSectionDragOver(event) {
    event.preventDefault();
  }

  handleSectionDrop(event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.dragType !== "reorder-section") return;

    event.stopPropagation();
    const targetIndex = parseInt(event.currentTarget.dataset.index, 10);
    if (data.sourceIndex === targetIndex) return;
    this.dispatchEvent(
      new CustomEvent("reordersection", {
        detail: { fromIndex: data.sourceIndex, toIndex: targetIndex }
      })
    );
  }

  // --- Element drag/reorder ---

  handleElementDragOver(event) {
    // Just allow the drop — don't force a dropEffect, which can mismatch the
    // drag's effectAllowed (palette = copy, reorder = move) and block the drop.
    event.preventDefault();
  }

  handleElementReorderStart(event) {
    event.stopPropagation(); // don't trigger section drag
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const eIdx = parseInt(event.currentTarget.dataset.elementIndex, 10);
    const data = {
      dragType: "reorder-element",
      sourceSectionIndex: sIdx,
      sourceElementIndex: eIdx
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }

  // Drop onto a specific element chip → reorder within the section
  handleElementChipDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const targetSection = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const targetElement = parseInt(event.currentTarget.dataset.elementIndex, 10);

    if (data.dragType === "reorder-element") {
      if (data.sourceSectionIndex !== targetSection) return; // same-section only
      if (data.sourceElementIndex === targetElement) return;
      this.dispatchEvent(
        new CustomEvent("reorderelement", {
          detail: {
            sectionIndex: targetSection,
            fromIndex: data.sourceElementIndex,
            toIndex: targetElement
          }
        })
      );
    } else if (data.dragType === "field") {
      this.dispatchEvent(
        new CustomEvent("dropfield", {
          detail: { ...data, sectionIndex: targetSection }
        })
      );
    } else if (data.dragType === "component") {
      this.dispatchEvent(
        new CustomEvent("dropcomponent", {
          detail: { ...data, sectionIndex: targetSection }
        })
      );
    }
  }

  // Drop onto the section body (empty area) → add field/component or move to end
  handleElementDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const sectionIndex = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.dragType === "field") {
      this.dispatchEvent(
        new CustomEvent("dropfield", { detail: { ...data, sectionIndex } })
      );
    } else if (data.dragType === "component") {
      this.dispatchEvent(
        new CustomEvent("dropcomponent", { detail: { ...data, sectionIndex } })
      );
    } else if (data.dragType === "reorder-element") {
      if (data.sourceSectionIndex !== sectionIndex) return;
      this.dispatchEvent(
        new CustomEvent("reorderelement", {
          detail: {
            sectionIndex,
            fromIndex: data.sourceElementIndex,
            toIndex: -1 // move to end
          }
        })
      );
    }
  }

  // --- Related section events (nested repeaters) ---

  handleToggleRelatedPickerForSection(event) {
    event.stopPropagation();
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.sections = this.sections.map((s, i) => ({
      ...s,
      showRelatedPicker: i === idx ? !s.showRelatedPicker : false
    }));
  }

  handlePickRelationshipForSection(event) {
    event.stopPropagation();
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    const data = JSON.parse(event.detail.value);

    this.sections = this.sections.map((s) => ({
      ...s,
      showRelatedPicker: false
    }));

    this.dispatchEvent(new CustomEvent("addrelatedtosection", {
      detail: { sectionIndex: idx, ...data }
    }));
  }

  handleRelatedSectionClick(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    const relSection = this.sections[sIdx].relatedSections[rIdx];
    this.dispatchEvent(new CustomEvent("selectrelatedsection", {
      detail: { sectionIndex: sIdx, relatedIndex: rIdx, relatedSection: relSection }
    }));
  }

  handleRelatedSectionSettings(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    this.dispatchEvent(new CustomEvent("editrelatedsection", {
      detail: { sectionIndex: sIdx, relatedIndex: rIdx }
    }));
  }

  handleDeleteRelatedSection(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    this.dispatchEvent(new CustomEvent("deleterelatedsection", {
      detail: { sectionIndex: sIdx, relatedIndex: rIdx }
    }));
  }

  handleRelatedElementClick(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    const eIdx = parseInt(event.currentTarget.dataset.elementIndex, 10);
    const el = this.sections[sIdx].relatedSections[rIdx].elements[eIdx];
    this.dispatchEvent(new CustomEvent("selectrelatedelement", {
      detail: { sectionIndex: sIdx, relatedIndex: rIdx, elementIndex: eIdx, element: el }
    }));
  }

  handleRemoveRelatedElement(event) {
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    const eIdx = parseInt(event.currentTarget.dataset.elementIndex, 10);
    this.dispatchEvent(new CustomEvent("removerelatedelement", {
      detail: { sectionIndex: sIdx, relatedIndex: rIdx, elementIndex: eIdx }
    }));
  }

  handleRelatedElementDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const sIdx = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const rIdx = parseInt(event.currentTarget.dataset.relatedIndex, 10);
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.dragType === "field") {
        this.dispatchEvent(new CustomEvent("droprelatefield", {
          detail: { ...data, sectionIndex: sIdx, relatedIndex: rIdx }
        }));
      }
    } catch {
      // ignore
    }
  }
}