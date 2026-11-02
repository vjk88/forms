import { LightningElement, api } from 'lwc';

const ARTS = ['select', 'radio', 'checkbox', 'chips', 'cards'];

/**
 * Picture tiles (DESIGN_SYSTEM 5.24): pick one option by a small drawing of
 * it. Extracted unchanged from the inspector's Appearance picker (PR 422).
 *
 * options: [{ value, label, art, desc?, wide? }]
 *   art  - which drawing: 'select' | 'radio' | 'checkbox' | 'chips' | 'cards'
 *   wide - a full-width tile with a description, above the grid
 * Fires `change` with `detail.value` on a click, and when an arrow key, Home or
 * End moves the choice (a WAI-ARIA radio group: Tab enters once, on the chosen
 * tile). After the parent re-renders with the new value, the chosen tile gets
 * focus back.
 */
export default class FinalPictureChoice extends LightningElement {
    /** Read by screen readers as the group's name. */
    @api label;
    @api options = [];
    @api value;

    _focusIndex = null;

    get _all() {
        return (this.options || []).map((o, index) => {
            const on = o.value === this.value;
            const art = ARTS.includes(o.art) ? o.art : 'select';
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
                isCards: art === 'cards'
            };
        });
    }

    get wideTiles() {
        return this._all.filter((t) => t.wide);
    }

    get gridTiles() {
        return this._all.filter((t) => !t.wide);
    }

    get hasGrid() {
        return this.gridTiles.length > 0;
    }

    handleClick(event) {
        this._pick(Number(event.currentTarget.dataset.index), false);
    }

    handleKey(event) {
        const list = this.options || [];
        if (!list.length) {
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
