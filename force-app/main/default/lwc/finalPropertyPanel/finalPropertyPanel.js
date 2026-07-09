import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

/**
 * finalPropertyPanel — the selected node's editor (CANVAS_RULES §5, P3
 * slice 4). Inspectors are PER-TYPE: Field / Display text / Image / Divider /
 * Spacer / Section / Page / Repeating Group each expose only their own
 * properties — no universal property grid. A repeater section's inspector is
 * DEDICATED (§5): repeat presentation + the child-object field list; it
 * never shows plain section props.
 *
 * DUMB view: the studio owns the spec. This panel renders the selected node
 * and emits intents — `propchange` {patch} (top-level keys) · `configchange`
 * {patch} (config bag) · `repeatchange` {patch} (repeat bag) ·
 * `bindingchange` {field} · `addchildfield` {field}. `required` is authoring
 * sugar — the STUDIO compiles it into the validation entry (schema §4).
 *
 * pp- prefixed classes (LEX leak rule).
 */

const UNBOUND = '__unbound__';

export default class FinalPropertyPanel extends LightningElement {
    /** 'element' | 'section' | 'page' (block wrapper sections arrive as
     *  their inner element — the studio resolves that before passing). */
    @api kind;
    /** The object a FIELD element binds against: the primary object, or the
     *  repeater's child object when the element lives inside one. */
    @api bindingObjectApi;
    /** Bound field APIs already used in the SAME binding scope (the studio
     *  computes scope) — those rows are taken in the binding picker. */
    @api usedFields = [];

    _node;
    _childObject;

    @api
    get node() {
        return this._node;
    }
    set node(value) {
        this._node = value;
        // undefined (not null) keeps the wire idle when there is no repeater
        this._childObject =
            (value && value.repeat && value.repeat.childObject) || undefined;
    }

    bindingFields;
    bindingError;
    childFields;
    childError;

    @wire(describeFields, { objectApi: '$bindingObjectApi' })
    wiredBinding({ data, error }) {
        if (data) {
            this.bindingFields = data;
            this.bindingError = undefined;
        } else if (error) {
            this.bindingError = 'Fields could not be loaded for binding.';
        }
    }

    @wire(describeFields, { objectApi: '$_childObject' })
    wiredChild({ data, error }) {
        if (data) {
            this.childFields = data;
            this.childError = undefined;
        } else if (error) {
            this.childError = 'The child object’s fields could not be loaded.';
        }
    }

    get n() {
        return this._node || {};
    }

    get cfg() {
        return this.n.config || {};
    }

    // ---- type resolution (§5: one inspector per type) ----

    get isElement() {
        return this.kind === 'element';
    }

    get isField() {
        return this.isElement && this.n.type === 'field';
    }

    get isRichText() {
        return this.isElement && this.n.type === 'richText';
    }

    get isImage() {
        return this.isElement && this.n.type === 'image';
    }

    get isDivider() {
        return this.isElement && this.n.type === 'divider';
    }

    get isSpacer() {
        return this.isElement && this.n.type === 'spacer';
    }

    get isOtherElement() {
        return (
            this.isElement &&
            !this.isField &&
            !this.isRichText &&
            !this.isImage &&
            !this.isDivider &&
            !this.isSpacer
        );
    }

    get isRepeater() {
        return this.kind === 'section' && Boolean(this.n.repeat);
    }

    get isSection() {
        return this.kind === 'section' && !this.n.repeat;
    }

    get isPage() {
        return this.kind === 'page';
    }

    // ---- header ----

    get title() {
        if (this.isPage) {
            return this.n.name || 'Page';
        }
        if (this.kind === 'section') {
            return (
                this.n.title ||
                (this.isRepeater ? 'Repeating group' : 'Section')
            );
        }
        return this.n.label || this.n.type || 'Element';
    }

    get subtitle() {
        if (this.isField) {
            const bound = this.n.binding && this.n.binding.field;
            return bound
                ? `Field · ${this.bindingObjectApi}.${bound}`
                : 'Field · not bound yet';
        }
        if (this.isRichText) {
            return 'Display text block';
        }
        if (this.isImage) {
            return 'Image block';
        }
        if (this.isDivider) {
            return 'Divider block';
        }
        if (this.isSpacer) {
            return 'Spacer block';
        }
        if (this.isRepeater) {
            return `Repeating group · ${this.n.repeat.childObject}`;
        }
        if (this.isSection) {
            return 'Section';
        }
        if (this.isPage) {
            return 'Page';
        }
        return 'Element';
    }

    // ---- field inspector ----

    get bindingValue() {
        return (this.n.binding && this.n.binding.field) || UNBOUND;
    }

    get isUnbound() {
        return this.bindingValue === UNBOUND;
    }

    get bindingOptions() {
        const own = this.n.binding && this.n.binding.field;
        const taken = (this.usedFields || []).filter((f) => f !== own);
        // boolean attrs: `false` still RENDERS the attribute ("false" is
        // truthy markup) — only undefined omits it
        return (this.bindingFields || []).map((f) => ({
            value: f.apiName,
            label: taken.includes(f.apiName)
                ? `${f.label} — already on the form`
                : f.label,
            disabled: taken.includes(f.apiName) ? true : undefined,
            selected: f.apiName === own ? true : undefined
        }));
    }

    get labelPositionOptions() {
        return this._opts(
            ['top', 'left', 'hidden'],
            {
                top: 'Above the field',
                left: 'Beside the field',
                hidden: 'Hidden'
            },
            this.n.labelPosition || 'top'
        );
    }

    get labelStyleOptions() {
        return this._opts(
            ['default', 'uppercase', 'muted'],
            { default: 'Default', uppercase: 'Uppercase', muted: 'Muted' },
            this.n.labelStyle || 'default'
        );
    }

    _opts(keys, labels, current) {
        return keys.map((k) => ({
            value: k,
            label: labels[k],
            selected: k === current ? true : undefined
        }));
    }

    // ---- section inspector ----

    get columnsOptions() {
        return this._opts(
            ['1', '2', '3'],
            { 1: '1 column', 2: '2 columns', 3: '3 columns' },
            String(this.n.columns || 1)
        );
    }

    get styleOptions() {
        return this._opts(
            ['plain', 'card', 'boxed', 'outline', 'subtle', 'flat'],
            {
                plain: 'Plain',
                card: 'Card',
                boxed: 'Boxed',
                outline: 'Outline',
                subtle: 'Subtle',
                flat: 'Flat'
            },
            this.n.style || 'plain'
        );
    }

    // ---- repeater inspector (§4.4 — DEDICATED) ----

    get repeat() {
        return this.n.repeat || {};
    }

    get repeatStyleOptions() {
        return this._opts(
            ['stacked', 'table', 'tileModal'],
            {
                stacked: 'Stacked cards',
                table: 'Table',
                tileModal: 'Tiles + modal'
            },
            this.repeat.style || 'stacked'
        );
    }

    get childHeading() {
        return `Fields — ${this.repeat.childObject}`;
    }

    /** Child list dedupes against fields already in THIS section (§4.4). */
    get childRows() {
        const used = new Set(
            (this.n.elements || [])
                .map((el) => el.binding && el.binding.field)
                .filter(Boolean)
        );
        return (this.childFields || []).map((f) => {
            const added = used.has(f.apiName);
            return {
                ...f,
                added,
                cls: added ? 'pp-childfield added' : 'pp-childfield',
                title: added
                    ? `${f.label} is already in this group`
                    : `Add ${f.label} to the group`
            };
        });
    }

    get childLoading() {
        return this.isRepeater && !this.childFields && !this.childError;
    }

    get spacerHeight() {
        const h = Number(this.cfg.height);
        return h > 0 ? h : 24;
    }

    // ---- intents ----

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    _prop(patch) {
        this._emit('propchange', { patch });
    }

    handleLabel(event) {
        this._prop({ label: event.target.value });
    }

    handleRequired(event) {
        this._prop({ required: event.target.checked });
    }

    handlePlaceholder(event) {
        this._prop({ placeholder: event.target.value });
    }

    handleHelp(event) {
        this._prop({ help: event.target.value });
    }

    handleReadOnly(event) {
        this._prop({ readOnly: event.target.checked });
    }

    handleLabelPosition(event) {
        this._prop({ labelPosition: event.target.value });
    }

    handleLabelStyle(event) {
        this._prop({ labelStyle: event.target.value });
    }

    handleBinding(event) {
        const apiName = event.target.value;
        const field = (this.bindingFields || []).find(
            (f) => f.apiName === apiName
        );
        if (field) {
            this._emit('bindingchange', { field: { ...field } });
        }
    }

    handleRichText(event) {
        this._emit('configchange', { patch: { html: event.target.value } });
    }

    handleImageSrc(event) {
        this._emit('configchange', { patch: { src: event.target.value } });
    }

    handleImageAlt(event) {
        this._emit('configchange', { patch: { alt: event.target.value } });
    }

    handleSpacerHeight(event) {
        const height = Number(event.target.value);
        if (height > 0) {
            this._emit('configchange', { patch: { height } });
        }
    }

    handleTitle(event) {
        this._prop({ title: event.target.value });
    }

    handleDescription(event) {
        this._prop({ description: event.target.value });
    }

    handleColumns(event) {
        this._prop({ columns: Number(event.target.value) });
    }

    handleStyle(event) {
        this._prop({ style: event.target.value });
    }

    handlePageName(event) {
        this._prop({ name: event.target.value });
    }

    _repeatPatch(key, value) {
        this._emit('repeatchange', { patch: { [key]: value } });
    }

    handleRepeatStyle(event) {
        this._repeatPatch('style', event.target.value);
    }

    handleAddLabel(event) {
        this._repeatPatch('addLabel', event.target.value);
    }

    handleEntryLabel(event) {
        this._repeatPatch('entryLabel', event.target.value);
    }

    handleMin(event) {
        const v = event.target.value;
        this._repeatPatch('min', v === '' ? null : Math.max(0, Number(v)));
    }

    handleMax(event) {
        const v = event.target.value;
        this._repeatPatch('max', v === '' ? null : Math.max(1, Number(v)));
    }

    handleAddChildField(event) {
        const apiName = event.currentTarget.dataset.api;
        const field = (this.childFields || []).find(
            (f) => f.apiName === apiName
        );
        if (!field) {
            return;
        }
        const used = (this.n.elements || []).some(
            (el) => el.binding && el.binding.field === apiName
        );
        if (used) {
            return;
        }
        this._emit('addchildfield', { field: { ...field } });
    }
}
