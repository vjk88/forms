import { LightningElement, api } from 'lwc';

/**
 * Bridge between the layout engine and section/element rendering — the
 * single seam (PHASE2_WORKPLAN §2.2).
 *   mode="live"          → c/formSectionRenderer (real record-edit-form)
 *   mode="preview/canvas" → honest stubs (label + typed control placeholder)
 * Record context arrives stamped on the section VM by the engine and is also
 * exposed as pass-through @apis per the frozen contract.
 */
export default class LayoutSectionHost extends LightningElement {
    @api section; // { key, title, style?, elements[], density?, relatedSections?, … }
    @api mode = 'preview'; // live | preview | canvas
    @api objectApiName;
    @api recordTypeId;
    @api recordId;

    get isLive() {
        return this.mode === 'live';
    }
    get density() {
        return (this.section && this.section.density) || 'cozy';
    }
    get prefillValues() {
        return this.section && this.section.prefillValues;
    }
    get hostClass() {
        const style = (this.section && this.section.style) || 'card';
        return `sec sec-${style}`;
    }
    get elements() {
        return ((this.section && this.section.elements) || []).map((el) => ({
            ...el,
            cls: `field type-${el.type || 'text'}${el.colSpan === 2 ? ' span2' : ''}`
        }));
    }
}
