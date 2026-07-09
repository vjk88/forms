import { LightningElement, api, wire } from 'lwc';
import describeChildRelationships from '@salesforce/apex/FinalStudioController.describeChildRelationships';

/**
 * finalRelationshipPicker — the repeater flow's step 2 (CANVAS_RULES §4).
 *
 * Dropping (or click-adding) a Repeating Group opens this modal: the primary
 * object's child relationships listed as "{Child Object Label} · via
 * {linking field}". Picking one mints the repeatable section at the drop
 * position; Cancel abandons the drop entirely (nothing was minted yet).
 *
 * Emits `pick` {relationship} · `cancel`. rp- prefixed classes (LEX leak).
 */
export default class FinalRelationshipPicker extends LightningElement {
    /** The form's primary context object API name. */
    @api objectApi;

    relationships;
    error;

    @wire(describeChildRelationships, { objectApi: '$objectApi' })
    wired({ data, error }) {
        if (data) {
            this.relationships = data;
            this.error = undefined;
        } else if (error) {
            this.error =
                'Child objects could not be loaded for this form’s object.';
        }
    }

    get rows() {
        return (this.relationships || []).map((r) => ({
            ...r,
            key: `${r.childObject}:${r.linkingField}`,
            via: `via ${r.linkingFieldLabel || r.linkingField}`
        }));
    }

    get loading() {
        return !this.relationships && !this.error;
    }

    get empty() {
        return this.relationships && this.relationships.length === 0;
    }

    get emptyText() {
        return `${this.objectApi} has no child objects you can create records for, so a Repeating Group can’t be added here.`;
    }

    handlePick(event) {
        const key = event.currentTarget.dataset.key;
        const relationship = this.rows.find((r) => r.key === key);
        if (!relationship) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('pick', { detail: { relationship } })
        );
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    /** Overlay click closes; clicks inside the dialog don't. */
    handleOverlayClick(event) {
        if (event.target === event.currentTarget) {
            this.handleCancel();
        }
    }
}
