import { LightningElement, api } from 'lwc';

const ARTS = ['select', 'radio', 'checkbox', 'chips', 'cards'];
/** Drawings of what a record step does (Mapping), for wide tiles. */
const RECORD_ARTS = ['create', 'find', 'reuse', 'update'];
/** Drawings for an Autofill rule: where values come from, typed answers. */
const AUTOFILL_ARTS = ['link', 'lookup', 'user', 'keep', 'replace'];

/**
 * Picture tiles (DESIGN_SYSTEM 5.24): pick one option by a small drawing of
 * it. Extracted unchanged from the inspector's Appearance picker (PR 422).
 *
 * options: [{ value, label, art, desc?, wide? }]
 *   art  - which drawing: 'select' | 'radio' | 'checkbox' | 'chips' | 'cards',
 *          or, on a wide tile, what a record step does: 'create' | 'find' |
 *          'reuse' | 'update'; or an Autofill rule's 'link' | 'lookup' |
 *          'user' | 'keep' | 'replace'
 *   drawing - instead of `art`, a drawing from data (c/finalDesignArt):
 *          { viewBox, shapes: [{ key, t: 'rect'|'circle'|'path', c, ... }] }
 *   disabled - this one option can't be picked (it says why elsewhere)
 *   wide - a tile with a description, above the grid; wide tiles sit side
 *          by side when there's room
 * Fires `change` with `detail.value` on a click, and when an arrow key, Home or
 * End moves the choice (a WAI-ARIA radio group: Tab enters once, on the chosen
 * tile). After the parent re-renders with the new value, the chosen tile gets
 * focus back.
 */
/** One shape of a data drawing, ready for the template. */
function shapeVM(s, i) {
    return {
        key: s.key || `s${i}`,
        isRect: s.t === 'rect',
        isCircle: s.t === 'circle',
        isPath: s.t === 'path',
        cls: `pc-shape ${s.c || 'pa-ink'}`,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rx: s.rx,
        cx: s.cx,
        cy: s.cy,
        r: s.r,
        d: s.d,
        // a real color (a mesh blob); only ever a hex from our own data
        style: s.fill ? `fill: ${s.fill};` : null
    };
}

export default class FinalPictureChoice extends LightningElement {
    /** Read by screen readers as the group's name. */
    @api label;
    @api options = [];
    @api value;
    /** Read-only: the tiles show the choice but can't change it. */
    @api disabled = false;
    /** Grid tiles per row: 2 (default), 3 or 4. */
    @api columns;

    _focusIndex = null;

    get gridClass() {
        const n = Number(this.columns);
        return n === 3 || n === 4 ? `pc-grid pc-grid--${n}` : 'pc-grid';
    }

    get _all() {
        return (this.options || []).map((o, index) => {
            const on = o.value === this.value;
            const record = RECORD_ARTS.includes(o.art) ? o.art : '';
            const fill = AUTOFILL_ARTS.includes(o.art) ? o.art : '';
            const drawing = o.drawing && Array.isArray(o.drawing.shapes);
            const art = drawing
                ? 'drawing'
                : ARTS.includes(o.art) || record || fill
                  ? o.art
                  : 'select';
            return {
                key: `${index}-${String(o.value)}`,
                index,
                dataValue: String(o.value),
                label: o.label,
                desc: o.desc,
                wide: Boolean(o.wide),
                checked: on ? 'true' : 'false',
                tabindex: on ? '0' : '-1',
                cls: `pc-tile${o.wide ? ' pc-wide' : ''}${on ? ' on' : ''}`,
                isSelect: art === 'select',
                isRadio: art === 'radio',
                isCheckbox: art === 'checkbox',
                isChips: art === 'chips',
                isCards: art === 'cards',
                isRecord: Boolean(record),
                isCreate: record === 'create',
                isFind: record === 'find',
                isReuse: record === 'reuse',
                isUpdate: record === 'update',
                isFill: Boolean(fill),
                isLink: fill === 'link',
                isLookup: fill === 'lookup',
                isUser: fill === 'user',
                isKeep: fill === 'keep',
                isReplace: fill === 'replace',
                isDrawing: Boolean(drawing),
                viewBox: drawing ? o.drawing.viewBox : null,
                shapes: drawing ? o.drawing.shapes.map(shapeVM) : [],
                optionDisabled: Boolean(o.disabled) || this.disabled
            };
        });
    }

    get wideTiles() {
        return this._all.filter((t) => t.wide);
    }

    get gridTiles() {
        return this._all.filter((t) => !t.wide);
    }

    get ariaDisabled() {
        return this.disabled ? 'true' : null;
    }

    get hasWide() {
        return this.wideTiles.length > 0;
    }

    get hasGrid() {
        return this.gridTiles.length > 0;
    }

    handleClick(event) {
        const o = (this.options || [])[
            Number(event.currentTarget.dataset.index)
        ];
        if (this.disabled || !o || o.disabled) {
            return;
        }
        this._pick(Number(event.currentTarget.dataset.index), false);
    }

    handleKey(event) {
        const list = this.options || [];
        if (!list.length || this.disabled) {
            return;
        }
        const step = {
            ArrowRight: 1,
            ArrowDown: 1,
            ArrowLeft: -1,
            ArrowUp: -1
        }[event.key];
        const at = Math.max(
            0,
            list.findIndex((o) => o.value === this.value)
        );
        let next;
        if (step) {
            next = (at + step + list.length) % list.length;
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = list.length - 1;
        } else {
            return;
        }
        event.preventDefault();
        this._pick(next, true);
    }

    _pick(index, keepFocus) {
        const option = (this.options || [])[index];
        if (!option) {
            return;
        }
        if (keepFocus) {
            this._focusIndex = index;
        }
        this.dispatchEvent(
            new CustomEvent('change', { detail: { value: option.value } })
        );
    }

    renderedCallback() {
        if (this._focusIndex === null) {
            return;
        }
        const tile = this.template.querySelector(
            `[data-index="${this._focusIndex}"]`
        );
        if (tile && tile.getAttribute('aria-checked') === 'true') {
            this._focusIndex = null;
            tile.focus();
        }
    }
}
