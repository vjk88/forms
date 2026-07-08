import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

/**
 * finalFieldPalette — the builder's left rail (FORM_STUDIO_IA §4).
 *
 * Rail: Fields / Blocks / Logic / Autofill — Fields is live (describe-driven,
 * FLS-respecting); the rest are honest stubs until their slices. Fields
 * already on the form render dimmed + ADDED (never removed from the list —
 * the palette is the inventory, the canvas is the truth).
 *
 * Click-add emits `addfield`; the same rows are draggable (the DnD port
 * arrives in slice 3b and reuses these payloads).
 */
export default class FinalFieldPalette extends LightningElement {
    /** The form's primary context object API name. */
    @api objectApi;
    /** Bound field API names already on the canvas (dedupe → ADDED chip). */
    @api usedFields = [];

    tab = 'fields';
    search = '';
    fields;
    error;

    @wire(describeFields, { objectApi: '$objectApi' })
    wired({ data, error }) {
        if (data) {
            this.fields = data;
            this.error = undefined;
        } else if (error) {
            this.error = 'Fields could not be loaded for this object.';
        }
    }

    get isFields() {
        return this.tab === 'fields';
    }

    get noObject() {
        return !this.objectApi;
    }

    get isBlocks() {
        return this.tab === 'blocks';
    }

    get isStub() {
        return this.tab === 'logic' || this.tab === 'autofill';
    }

    get stubLabel() {
        return this.tab === 'logic'
            ? 'Logic — visibility & validation editors arrive with the rules slice.'
            : 'Autofill — prefill mapping arrives with a later slice.';
    }

    get tabs() {
        // vertical icon rail (owner 2026-07-08: same grammar as the Design
        // panel's area rail — icons + tiny labels, never horizontal text tabs)
        const icons = {
            fields: 'utility:list',
            blocks: 'utility:apps',
            logic: 'utility:strategy',
            autofill: 'utility:magicwand'
        };
        return ['fields', 'blocks', 'logic', 'autofill'].map((t) => ({
            key: t,
            label: t[0].toUpperCase() + t.slice(1),
            icon: icons[t],
            cls: t === this.tab ? 'fp-tab on' : 'fp-tab'
        }));
    }

    get rows() {
        if (!this.fields) {
            return null;
        }
        const used = new Set(this.usedFields || []);
        const q = this.search.trim().toLowerCase();
        return this.fields
            .filter(
                (f) =>
                    !q ||
                    f.label.toLowerCase().includes(q) ||
                    f.apiName.toLowerCase().includes(q)
            )
            .map((f) => ({
                ...f,
                added: used.has(f.apiName),
                cls: used.has(f.apiName) ? 'fp-item added' : 'fp-item',
                title: used.has(f.apiName)
                    ? `${f.label} is already on the form`
                    : `Add ${f.label}`
            }));
    }

    get empty() {
        return this.rows && this.rows.length === 0;
    }

    handleTab(event) {
        this.tab = event.currentTarget.dataset.tab;
    }

    handleSearch(event) {
        this.search = event.target.value;
    }

    handleAdd(event) {
        const apiName = event.currentTarget.dataset.api;
        const field = (this.fields || []).find((f) => f.apiName === apiName);
        if (!field || (this.usedFields || []).includes(apiName)) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('addfield', { detail: { field: { ...field } } })
        );
    }
}
