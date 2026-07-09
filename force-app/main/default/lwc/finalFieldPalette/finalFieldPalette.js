import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import { PALETTE_FIELD_MIME, PALETTE_EL_MIME } from 'c/finalBuilderCanvas';

/** Schema §4 v1 content types — blocks repeat freely (no ADDED dedupe). */
const BLOCKS = [
    {
        type: 'richText',
        label: 'Display text',
        icon: 'utility:text',
        title: 'Rich text — headings, paragraphs, links'
    },
    {
        type: 'image',
        label: 'Image',
        icon: 'utility:image',
        title: 'An image block'
    },
    {
        type: 'divider',
        label: 'Divider',
        icon: 'utility:rules',
        title: 'A horizontal rule between content'
    },
    {
        type: 'spacer',
        label: 'Spacer',
        icon: 'utility:expand_alt',
        title: 'Vertical breathing room'
    }
];

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
    /** Labels of UNBOUND field elements on the canvas (legacy/demo specs
     *  carry no binding — the canvas is the truth the ADDED state must
     *  agree with, so those dedupe by label). Lowercased by the studio. */
    @api usedLabels = [];

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

    /** Panel header names WHOSE fields these are ("Fields — Contact"). */
    get fieldsHeading() {
        return `Fields — ${this.objectApi}`;
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

    get blocks() {
        return BLOCKS;
    }

    _isUsed(field) {
        return (
            (this.usedFields || []).includes(field.apiName) ||
            (this.usedLabels || []).includes(field.label.toLowerCase())
        );
    }

    get rows() {
        if (!this.fields) {
            return null;
        }
        const q = this.search.trim().toLowerCase();
        return this.fields
            .filter(
                (f) =>
                    !q ||
                    f.label.toLowerCase().includes(q) ||
                    f.apiName.toLowerCase().includes(q)
            )
            .map((f) => {
                const added = this._isUsed(f);
                return {
                    ...f,
                    added,
                    cls: added ? 'fp-item added' : 'fp-item',
                    title: added
                        ? `${f.label} is already on the form`
                        : `Add ${f.label}`
                };
            });
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
        if (!field || this._isUsed(field)) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('addfield', { detail: { field: { ...field } } })
        );
    }

    /** Blocks repeat freely — click-add mints one at the end of the page. */
    handleAddBlock(event) {
        this.dispatchEvent(
            new CustomEvent('addblock', {
                detail: { blockType: event.currentTarget.dataset.type }
            })
        );
    }

    handleBlockDragStart(event) {
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({
                t: 'palette-el',
                elType: event.currentTarget.dataset.type
            })
        );
        event.dataTransfer.setData(PALETTE_EL_MIME, '1');
        event.dataTransfer.effectAllowed = 'copy';
    }

    /** Drag-to-canvas. The canvas can't see this component's state mid-drag
     *  (drag DATA is protected until drop), so the drag KIND rides as a
     *  typed dataTransfer marker; the payload itself is text/plain JSON. */
    handleDragStart(event) {
        const apiName = event.currentTarget.dataset.api;
        const field = (this.fields || []).find((f) => f.apiName === apiName);
        if (!field || this._isUsed(field)) {
            event.preventDefault(); // ADDED rows don't drag
            return;
        }
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({ t: 'palette-field', field: { ...field } })
        );
        event.dataTransfer.setData(PALETTE_FIELD_MIME, '1');
        // palette items are COPIED into the form (must agree with the
        // canvas gatekeeper's dropEffect or the native badge flickers)
        event.dataTransfer.effectAllowed = 'copy';
    }
}
