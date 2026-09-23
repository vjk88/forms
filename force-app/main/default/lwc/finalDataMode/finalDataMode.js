import { LightningElement, api } from 'lwc';
import { actionsOf } from 'c/finalMappingModel';

/**
 * finalDataMode — the Studio's Data mode (FREEFORM_F2_MAPPING_SPEC section
 * 3): where values come from, and where they go. F2 ships the Mapping
 * section only; Autofill moves in beside it in its own slice (D30).
 */
export default class FinalDataMode extends LightningElement {
    @api spec;
    @api formId;
    @api readOnly = false;
    @api isPublic = false;

    get stepCountLabel() {
        const n = actionsOf(this.spec).length;
        return n === 1 ? '1 record' : `${n} records`;
    }

    handleSpecChange(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('specchange', {
                detail: { spec: event.detail.spec }
            })
        );
    }
}
