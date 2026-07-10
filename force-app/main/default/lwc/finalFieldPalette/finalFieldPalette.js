import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import {
    PALETTE_FIELD_MIME,
    PALETTE_EL_MIME,
    PALETTE_REP_MIME,
    PALETTE_CELL_MIME
} from 'c/finalBuilderCanvas';

/** The FormStudio content roster (BUILDER_SURFACES §1, minus retired Hero) —
 *  blocks repeat freely (no ADDED dedupe). */
const BLOCKS = [
    {
        type: 'richText',
        label: 'Display text',
        icon: 'utility:richtextbulletedlist',
        title: 'Rich text — headings, paragraphs, links'
    },
    {
        type: 'image',
        label: 'Image',
        icon: 'utility:image',
        title: 'An uploaded image'
    },
    {
        type: 'callout',
        label: 'Callout',
        icon: 'utility:info',
        title: 'A highlighted info / success / warning / error message'
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
    },
    {
        type: 'consent',
        label: 'Consent',
        icon: 'utility:check',
        title: 'Terms text with an agree checkbox'
    },
    {
        type: 'file',
        label: 'File Upload',
        icon: 'utility:upload',
        title: 'Respondents attach files when they submit'
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
    /** The Logic rail's aggregate index (owner ruling: rules render ON the
     *  properties; this tab lists every rule and jumps to its owner):
     *  [{key, kind, id, label, summary}]. */
    @api logicIndex = [];

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

    get isLogic() {
        return this.tab === 'logic';
    }

    get logicEmpty() {
        return !(this.logicIndex || []).length;
    }

    get isStub() {
        return this.tab === 'autofill';
    }

    get stubLabel() {
        return 'Autofill — prefill mapping arrives with a later slice.';
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

    /** §4.5: a Repeating Group needs a primary context object — without
     *  one the item is disabled and says why (inform-and-abort, no toast). */
    get repeaterDisabled() {
        return !this.objectApi;
    }

    get repeaterTitle() {
        return this.objectApi
            ? 'A group of fields the visitor can repeat — each entry becomes a related record'
            : 'Set the form’s target object first — a Repeating Group creates records related to it';
    }

    get repeaterCls() {
        return this.repeaterDisabled ? 'fp-item added' : 'fp-item';
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

    /** Empty space is INSIDE-only (BUILDER_SURFACES §1): its own typed
     *  marker gives it field-like validity — sections yes, gaps/blocks no. */
    handleCellDragStart(event) {
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({ t: 'palette-el', elType: 'emptySpace' })
        );
        event.dataTransfer.setData(PALETTE_CELL_MIME, '1');
        event.dataTransfer.effectAllowed = 'copy';
    }

    /** The Repeating Group is a first-class palette item (§4.1): the drop
     *  position is chosen now, the child object in the picker that follows. */
    handleAddRepeater() {
        if (this.repeaterDisabled) {
            return;
        }
        this.dispatchEvent(new CustomEvent('addrepeater'));
    }

    /** Logic index row → jump to the owner (select + open its properties). */
    handleLogicJump(event) {
        const { kind, id } = event.currentTarget.dataset;
        this.dispatchEvent(
            new CustomEvent('logicjump', { detail: { kind, id } })
        );
    }

    handleRepeaterDragStart(event) {
        if (this.repeaterDisabled) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({ t: 'palette-rep' })
        );
        event.dataTransfer.setData(PALETTE_REP_MIME, '1');
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
