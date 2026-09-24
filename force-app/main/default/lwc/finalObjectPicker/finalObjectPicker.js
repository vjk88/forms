import { LightningElement, api } from 'lwc';

/**
 * finalObjectPicker — choose one Salesforce object by typing part of its
 * name. An org has hundreds of objects; a plain dropdown of all of them is
 * a scroll, not a choice. The typing, matching and keys live in
 * c/finalTypeahead (shared with the conditions' field picker); this keeps
 * the object picker's own contract.
 *
 * Emits `pick` with { value, label }. The owner keeps the value.
 */
export default class FinalObjectPicker extends LightningElement {
    /** [{ label, value }] — value is the API name. May arrive after the
     *  value does (it is loaded). */
    @api objects = [];
    @api label = 'Object';
    @api placeholder = 'Search objects';
    @api disabled = false;
    @api value = '';

    get items() {
        return (this.objects || []).map((o) => ({
            value: o.value,
            label: o.label,
            meta: o.value
        }));
    }

    handlePick(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('pick', {
                detail: { value: event.detail.value, label: event.detail.label }
            })
        );
    }
}
