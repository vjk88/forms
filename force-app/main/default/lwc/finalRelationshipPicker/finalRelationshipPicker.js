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
    /** What the builder typed in "Search objects". */
    query = '';

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

    get allRows() {
        return (this.relationships || []).map((r) => ({
            ...r,
            key: `${r.childObject}:${r.linkingField}`,
            via: `via ${r.linkingFieldLabel || r.linkingField}`
        }));
    }

    /** Filtered by the object's label, its API name or the link field's
     *  label (IMPL_PLAN_RELATED_RECORDS §7). */
    get rows() {
        const q = this.query.trim().toLowerCase();
        if (!q) {
            return this.allRows;
        }
        return this.allRows.filter((r) =>
            [r.childObjectLabel, r.childObject, r.via].some((t) =>
                String(t || '')
                    .toLowerCase()
                    .includes(q)
            )
        );
    }

    get noMatch() {
        return !this.empty && this.rows.length === 0;
    }

    get noMatchText() {
        return `No objects match “${this.query.trim()}”.`;
    }

    connectedCallback() {
        this._focusSearch = true;
    }

    renderedCallback() {
        if (this._focusSearch) {
            const box = this.template.querySelector('.rp-search');
            if (box) {
                this._focusSearch = false;
                box.focus();
            }
        }
    }

    handleSearch(event) {
        this.query = event.target.value || '';
    }

    /** Escape clears the search first, then closes (DESIGN_SYSTEM 5.16). */
    handleKeyDown(event) {
        if (event.key !== 'Escape') {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (this.query) {
            this.query = '';
            const box = this.template.querySelector('.rp-search');
            if (box) {
                box.value = '';
            }
            return;
        }
        this.handleCancel();
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
        const relationship = this.allRows.find((r) => r.key === key);
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
