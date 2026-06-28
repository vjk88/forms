import { LightningElement, api } from 'lwc';

// Types that always span the full row (mirror c/formSectionRenderer).
const FULL_WIDTH_TYPES = [
    'textarea', 'richtext', 'Rich_Text', 'Static_Text',
    'Divider', 'Image', 'Callout', 'Spacer', 'Consent', 'File_Upload', 'Hero'
];

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
    get labelPosition() {
        return (this.section && this.section.labelPosition) || 'top';
    }
    get labelStyle() {
        return (this.section && this.section.labelStyle) || 'default';
    }
    get prefillValues() {
        return this.section && this.section.prefillValues;
    }
    // Record context is stamped on the section VM by the engine; the explicit
    // @api props (set by c/layoutZones) win when present, otherwise fall back to
    // the VM. This lets shells that mount the host directly (Conversational,
    // Accordion) render live fields without re-threading the context.
    get effObjectApiName() {
        return this.objectApiName || (this.section && this.section.objectApiName);
    }
    get effRecordTypeId() {
        return this.recordTypeId || (this.section && this.section.recordTypeId);
    }
    get effRecordId() {
        return this.recordId || (this.section && this.section.recordId);
    }
    get hostClass() {
        const style = (this.section && this.section.style) || 'card';
        return `sec sec-${style}`;
    }
    get elements() {
        // SLDS grid sizing (mirrors c/formSectionRenderer) so preview == live.
        // The viewport-based SLDS classes are reinforced by an @container rule
        // (layoutSectionHost.css) that stacks when the SECTION's box is narrow.
        const cols = (this.section && this.section.gridColumns) || 1;
        return ((this.section && this.section.elements) || []).map((el) => {
            const type = el.type || 'text';
            const fullWidth =
                el.colSpan === 2 || FULL_WIDTH_TYPES.includes(type);
            let size = 'slds-size_1-of-1';
            if (!fullWidth) {
                if (cols === 2) {
                    size = 'slds-size_1-of-1 slds-medium-size_1-of-2';
                } else if (cols === 3) {
                    size = 'slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-3';
                } else if (cols >= 4) {
                    size = 'slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-4';
                }
            }
            return {
                ...el,
                cls: `slds-col ${size} field type-${type}`,
                isHero: type === 'Hero',
                heroHasImage: !!el.imageUrl,
                heroHeadline: el.headline,
                heroSubtext: el.subtext,
                heroHasCta: !!(el.cta && el.cta.label),
                heroCtaLabel: el.cta && el.cta.label
            };
        });
    }
}
