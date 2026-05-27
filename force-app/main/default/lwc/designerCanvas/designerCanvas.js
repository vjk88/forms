import { LightningElement, api, track } from "lwc";

const TYPE_ICONS = {
  Field: "utility:text",
  Static_Text: "utility:text_template",
  Divider: "utility:rules",
  File_Upload: "utility:upload",
  Signature: "utility:signature",
  Lookup: "utility:record_lookup",
  Formula: "utility:formula"
};

export default class DesignerCanvas extends LightningElement {
  @api isEditable = false;
  @track sections = [];
  @track selectedSectionIndex = -1;
  @track selectedElementIndex = -1;

  @api
  get sectionData() {
    return this.sections;
  }
  set sectionData(value) {
    this.sections = (value || []).map((s, idx) => this.enrichSection(s, idx));
  }

  enrichSection(section, idx) {
    const elements = (section.elements || []).map((el) => ({
      ...el,
      iconName: TYPE_ICONS[el.type] || "utility:text",
      label: el.name || el.fieldApiName || el.type,
      required: el.isRequired || false
    }));

    const isSelected = idx === this.selectedSectionIndex;
    return {
      ...section,
      id: section.id || `section-${idx}`,
      elements,
      hasElements: elements.length > 0,
      gridClass: `section-grid columns-${section.gridColumns || 1}`,
      cardClass: `section-card${isSelected ? " selected" : ""}`
    };
  }

  get hasSections() {
    return this.sections && this.sections.length > 0;
  }

  // --- Section events ---

  handleAddSection() {
    this.dispatchEvent(new CustomEvent("addsection"));
  }

  handleSectionClick(event) {
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    this.selectedSectionIndex = idx;
    this.selectedElementIndex = -1;
    this.sections = this.sections.map((s, i) => ({
      ...s,
      cardClass: `section-card${i === idx ? " selected" : ""}`
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

  handleSectionDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  handleSectionDrop(event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.dragType === "relationship") {
        this.dispatchEvent(
          new CustomEvent("droprelationship", {
            detail: data
          })
        );
      }
    } catch (e) {
      // ignore non-JSON
    }
  }

  handleElementDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  handleElementDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const sectionIndex = parseInt(event.currentTarget.dataset.sectionIndex, 10);
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.dragType === "field") {
        this.dispatchEvent(
          new CustomEvent("dropfield", {
            detail: { ...data, sectionIndex }
          })
        );
      } else if (data.dragType === "component") {
        this.dispatchEvent(
          new CustomEvent("dropcomponent", {
            detail: { ...data, sectionIndex }
          })
        );
      }
    } catch (e) {
      // ignore
    }
  }

  handleElementReorderStart(event) {
    const sIdx = event.currentTarget.dataset.sectionIndex;
    const eIdx = event.currentTarget.dataset.elementIndex;
    const data = {
      dragType: "reorder",
      sourceSectionIndex: parseInt(sIdx, 10),
      sourceElementIndex: parseInt(eIdx, 10)
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }
}
