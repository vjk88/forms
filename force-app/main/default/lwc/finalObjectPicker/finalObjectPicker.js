import { LightningElement, api } from 'lwc';

const MAX_RESULTS = 50;

/**
 * finalObjectPicker — choose one Salesforce object by typing part of its
 * name. An org has hundreds of objects; a plain dropdown of all of them is
 * a scroll, not a choice. Same look and matching as the creation
 * gallery's picker (label or API name, first 50 matches), with keyboard
 * support: arrows move, Enter picks, Escape closes.
 *
 * Emits `pick` with { value, label }. The owner keeps the value.
 */
export default class FinalObjectPicker extends LightningElement {
    _objects = [];

    /** [{ label, value }] — value is the API name. May arrive after the
     *  value does (it is loaded), so the box re-reads the name then. */
    @api
    get objects() {
        return this._objects;
    }
    set objects(next) {
        this._objects = next || [];
        const hit = this._objects.find((o) => o.value === this._value);
        if (hit && !this.open) {
            this.query = hit.label;
        }
    }
    @api label = 'Object';
    @api placeholder = 'Search objects';
    @api disabled = false;

    query = '';
    open = false;
    activeIndex = 0;
    _value = '';
    _blurTimer;

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || '';
        const hit = (this.objects || []).find((o) => o.value === this._value);
        this.query = hit ? hit.label : '';
    }

    get matches() {
        const q = (this.query || '').toLowerCase().trim();
        const chosen = (this.objects || []).find(
            (o) => o.value === this._value
        );
        // Showing the chosen label in the box must not narrow the list to it.
        const filtering = q && !(chosen && chosen.label.toLowerCase() === q);
        const found = (this.objects || []).filter(
            (o) =>
                !filtering ||
                o.label.toLowerCase().includes(q) ||
                o.value.toLowerCase().includes(q)
        );
        if (filtering) {
            // Names that START with what was typed come first: "cont" should
            // put Contact above Account Contact Role. Sort is stable, so the
            // list stays alphabetical within each group.
            const rank = (o) => (o.label.toLowerCase().startsWith(q) ? 0 : 1);
            found.sort((x, y) => rank(x) - rank(y));
        }
        return found.slice(0, MAX_RESULTS);
    }

    get options() {
        return this.matches.map((o, i) => ({
            ...o,
            id: `op-${i}`,
            selected: o.value === this._value ? 'true' : 'false',
            cls:
                'op-item' +
                (i === this.activeIndex ? ' op-item--active' : '') +
                (o.value === this._value ? ' op-item--on' : '')
        }));
    }

    get hasOptions() {
        return this.matches.length > 0;
    }

    get expanded() {
        return String(this.open);
    }

    get activeId() {
        return this.open && this.hasOptions ? `op-${this.activeIndex}` : null;
    }

    handleInput(event) {
        this.query = event.target.value;
        this.open = true;
        this.activeIndex = 0;
    }

    handleFocus() {
        clearTimeout(this._blurTimer);
        this.open = true;
    }

    handleBlur() {
        // Let a mousedown pick land before the list closes.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._blurTimer = setTimeout(() => {
            this.open = false;
            const hit = (this.objects || []).find(
                (o) => o.value === this._value
            );
            this.query = hit ? hit.label : '';
        }, 150);
    }

    handleKeydown(event) {
        const count = this.matches.length;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.open = true;
            this.activeIndex = count ? (this.activeIndex + 1) % count : 0;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.activeIndex = count
                ? (this.activeIndex - 1 + count) % count
                : 0;
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const hit = this.matches[this.activeIndex];
            if (this.open && hit) {
                this._choose(hit);
            }
        } else if (event.key === 'Escape') {
            this.open = false;
        }
    }

    handlePick(event) {
        const value = event.currentTarget.dataset.value;
        const hit = (this.objects || []).find((o) => o.value === value);
        if (hit) {
            this._choose(hit);
        }
    }

    _choose(hit) {
        this._value = hit.value;
        this.query = hit.label;
        this.open = false;
        this.dispatchEvent(
            new CustomEvent('pick', {
                detail: { value: hit.value, label: hit.label }
            })
        );
    }

    disconnectedCallback() {
        clearTimeout(this._blurTimer);
    }
}
