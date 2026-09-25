import { LightningElement, api } from 'lwc';

const MAX_RESULTS = 50;

/**
 * finalTypeahead — pick one item by typing part of its name. Moved out of
 * finalObjectPicker (same look, same matching, same keys: arrows move,
 * Enter picks, Escape closes) so the conditions' field picker can share it
 * (IMPL_PLAN_F2_SEARCH decision 20). A lightning-combobox can't search, and
 * an object's fields plus its related records are far too many to scroll.
 *
 * Items: [{ value, label, meta?, searchText?, kind? }]
 *   meta       — the small grey second line (an API name or path)
 *   searchText — extra words that match (e.g. a relationship name)
 *   kind       — 'group' opens a level ("Account ›"); 'back' returns
 *   searchOnly — listed only while the author is typing
 *
 * Emits `pick` {value, label} for an item, `opengroup` {value} for a group,
 * `back` for the back row (also Left Arrow in an empty box), `close` when
 * the list closes. The owner keeps the value and the items.
 *
 * Also speaks the lightning-* error API — setCustomValidity, reportValidity,
 * focus — so the condition editor treats it like any other control.
 * ta- prefixed classes (LEX leak rule).
 */
export default class FinalTypeahead extends LightningElement {
    _items = [];

    @api
    get items() {
        return this._items;
    }
    set items(next) {
        this._items = next || [];
        if (!this.open) {
            this.query = this._labelFor(this._value);
        }
    }

    @api label = '';
    /** 'label-hidden' keeps the label for screen readers only. */
    @api variant;
    @api placeholder = 'Search';
    @api disabled = false;
    /** Shown when nothing matches. */
    @api emptyText = 'Nothing matches';
    /** A line under the results, e.g. how to reach more. */
    @api hint = '';
    _valueLabel = '';

    /** Text to show for a value that isn't among the items (yet). It often
     *  arrives after the value (a related field's label loads later). */
    @api
    get valueLabel() {
        return this._valueLabel;
    }
    set valueLabel(next) {
        this._valueLabel = next || '';
        if (!this.open) {
            this.query = this._labelFor(this._value);
        }
    }

    query = '';
    open = false;
    activeIndex = 0;
    errorMessage = '';
    _pendingError = '';
    _value = '';
    _blurTimer;

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || '';
        this.query = this._labelFor(this._value);
    }

    // ---- the lightning-* control contract ----

    @api
    setCustomValidity(message) {
        this._pendingError = message || '';
    }

    @api
    reportValidity() {
        this.errorMessage = this._pendingError;
        return !this.errorMessage;
    }

    @api
    focus() {
        const box = this.template.querySelector('.ta-input');
        if (box) {
            box.focus();
        }
    }

    // ---- view ----

    get labelClass() {
        return this.variant === 'label-hidden'
            ? 'ta-label slds-assistive-text'
            : 'ta-label';
    }

    get inputClass() {
        return this.errorMessage ? 'ta-input ta-input--error' : 'ta-input';
    }

    get invalid() {
        return this.errorMessage ? 'true' : 'false';
    }

    _labelFor(value) {
        if (!value) {
            return '';
        }
        const hit = (this._items || []).find(
            (o) => o.value === value && o.kind !== 'group'
        );
        return hit ? hit.label : this._valueLabel || value;
    }

    get matches() {
        return this._found.slice(0, MAX_RESULTS);
    }

    /** Everything that matches, before the list is cut to MAX_RESULTS. */
    get _found() {
        const q = (this.query || '').toLowerCase().trim();
        const chosenLabel = this._labelFor(this._value).toLowerCase();
        // Showing the chosen label in the box must not narrow the list to it.
        const filtering = q && q !== chosenLabel;
        const items = this._items || [];
        const found = items.filter((o) => {
            if (o.kind === 'back') {
                return true;
            }
            if (!filtering) {
                // search-only items (fields of an opened relationship) join
                // a search without lengthening the plain list
                return !o.searchOnly;
            }
            return (
                o.label.toLowerCase().includes(q) ||
                String(o.value).toLowerCase().includes(q) ||
                (o.searchText || '').toLowerCase().includes(q)
            );
        });
        if (filtering) {
            // Names that START with what was typed come first: "cont" puts
            // Contact above Account Contact Role. The back row stays first.
            const rank = (o) => {
                if (o.kind === 'back') return -1;
                return o.label.toLowerCase().startsWith(q) ? 0 : 1;
            };
            found.sort((x, y) => rank(x) - rank(y));
        }
        return found;
    }

    /** Said when the list is cut short, so nothing is silently out of reach. */
    get overflowText() {
        const total = this._found.length;
        return total > MAX_RESULTS
            ? `Showing ${MAX_RESULTS} of ${total}. Type to narrow.`
            : '';
    }

    get options() {
        return this.matches.map((o, i) => {
            const on = o.value === this._value && !o.kind;
            return {
                ...o,
                key: `${o.kind || 'item'}:${o.value}`,
                id: `ta-${i}`,
                isGroup: o.kind === 'group',
                isBack: o.kind === 'back',
                selected: on ? 'true' : 'false',
                cls:
                    'ta-item' +
                    (o.kind ? ` ta-item--${o.kind}` : '') +
                    (i === this.activeIndex ? ' ta-item--active' : '') +
                    (on ? ' ta-item--on' : '')
            };
        });
    }

    get hasOptions() {
        return this.matches.length > 0;
    }

    get expanded() {
        return String(this.open);
    }

    get activeId() {
        return this.open && this.hasOptions ? `ta-${this.activeIndex}` : null;
    }

    // ---- intents ----

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
            this.query = this._labelFor(this._value);
            this._close();
        }, 150);
    }

    _close() {
        if (this.open) {
            this.open = false;
            this.dispatchEvent(new CustomEvent('close'));
        }
    }

    renderedCallback() {
        if (this.open) {
            this._place();
            this._watchPlacement(true);
        } else {
            this._watchPlacement(false);
        }
        // Arrowing past the bottom of the box keeps the active row in view.
        const active = this.open
            ? this.template.querySelector('.ta-item--active')
            : null;
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * The list floats over whatever holds the box — a dialog's scrolling
     * body would otherwise cut it off after two rows. It is fixed to the
     * screen, under the box (or over it, when there is more room above),
     * and as tall as the room allows.
     *
     * A dialog frame can move where "fixed" measures from (it has a
     * transform), so the list is placed, measured, and nudged by the
     * difference: it lands where the box is whatever holds it.
     */
    _place() {
        const box = this.template.querySelector('.ta-box');
        const pop = this.template.querySelector('.ta-pop');
        if (!box || !pop || typeof box.getBoundingClientRect !== 'function') {
            return;
        }
        const r = box.getBoundingClientRect();
        const viewH = window.innerHeight || 0;
        if (!viewH || !r.width) {
            return; // not laid out (tests, hidden)
        }
        const gap = 2;
        const margin = 8;
        const below = viewH - r.bottom - gap - margin;
        const above = r.top - gap - margin;
        const up = below < 200 && above > below;
        const room = Math.min(320, Math.max(0, up ? above : below));
        pop.style.width = `${r.width}px`;
        pop.style.maxHeight = `${room}px`;
        pop.style.left = '0px';
        pop.style.top = '0px';
        // Where (0, 0) actually landed tells us where "fixed" measures from.
        const origin = pop.getBoundingClientRect();
        const height = origin.height;
        const wantTop = up ? r.top - gap - height : r.bottom + gap;
        pop.style.left = `${r.left - origin.left}px`;
        pop.style.top = `${wantTop - origin.top}px`;
    }

    _placeHandler = (event) => {
        if (!this.open) {
            return;
        }
        const pop = this.template.querySelector('.ta-pop');
        const inside =
            event &&
            event.type === 'scroll' &&
            pop &&
            event.composedPath &&
            event.composedPath().includes(pop);
        if (event && event.type === 'scroll' && !inside) {
            // Scrolling the page or the dialog moves the box away: close,
            // as native dropdowns do, rather than float over the header.
            this.query = this._labelFor(this._value);
            this._close();
            return;
        }
        if (this._frame) {
            return;
        }
        // At most once per frame.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._frame = requestAnimationFrame(() => {
            this._frame = null;
            this._place();
        });
    };

    _watching = false;

    /** While open, follow the box when the page or the dialog scrolls. */
    _watchPlacement(on) {
        if (on === this._watching) {
            return;
        }
        this._watching = on;
        if (on) {
            window.addEventListener('scroll', this._placeHandler, true);
            window.addEventListener('resize', this._placeHandler);
        } else {
            window.removeEventListener('scroll', this._placeHandler, true);
            window.removeEventListener('resize', this._placeHandler);
        }
    }

    handleKeydown(event) {
        const count = this.matches.length;
        const active = this.matches[this.activeIndex];
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.open = true;
            this.activeIndex = count ? (this.activeIndex + 1) % count : 0;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.activeIndex = count
                ? (this.activeIndex - 1 + count) % count
                : 0;
        } else if (
            event.key === 'ArrowRight' &&
            active &&
            active.kind === 'group'
        ) {
            event.preventDefault();
            this._act(active);
        } else if (
            event.key === 'ArrowLeft' &&
            !this.query &&
            this.open &&
            this.matches.some((o) => o.kind === 'back')
        ) {
            event.preventDefault();
            this._act(this.matches.find((o) => o.kind === 'back'));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.open && active) {
                this._act(active);
            }
        } else if (event.key === 'Escape' && this.open) {
            // Closing the list must not also close a dialog around it (and
            // lose its unapplied edits). A closed list lets Escape through.
            event.preventDefault();
            event.stopPropagation();
            this.query = this._labelFor(this._value);
            this._close();
        }
    }

    handlePick(event) {
        // Keep focus in the box: a click on "Account ›" opens its fields in
        // place instead of blurring the box and closing the list.
        event.preventDefault();
        const { value, kind } = event.currentTarget.dataset;
        const hit = (this._items || []).find(
            (o) => String(o.value) === value && (o.kind || '') === (kind || '')
        );
        if (hit) {
            this._act(hit);
        }
    }

    _act(item) {
        if (item.kind === 'group') {
            this.query = '';
            this.activeIndex = 0;
            this.dispatchEvent(
                new CustomEvent('opengroup', { detail: { value: item.value } })
            );
            return;
        }
        if (item.kind === 'back') {
            this.query = '';
            this.activeIndex = 0;
            this.dispatchEvent(new CustomEvent('back'));
            return;
        }
        this._value = item.value;
        this.query = item.label;
        this._close();
        this.dispatchEvent(
            new CustomEvent('pick', {
                detail: { value: item.value, label: item.label }
            })
        );
    }

    disconnectedCallback() {
        clearTimeout(this._blurTimer);
        this._watchPlacement(false);
    }
}
