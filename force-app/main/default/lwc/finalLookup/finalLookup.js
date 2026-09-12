import { LightningElement, api } from 'lwc';
import search from '@salesforce/apex/FinalLookupController.search';

const DEBOUNCE_MS = 300;
const MIN_TERM = 2;

/**
 * c/finalLookup — a record type-ahead built as an ARIA combobox.
 *
 * It does NOT wrap `lightning-record-picker`. Owning the control is what buys
 * the operators, the relationship traversal, the guest path and — the one that
 * matters most — knowing when our own filter changed. The native control never
 * re-checks the value it is holding, which is the bug the old build existed to
 * paper over.
 *
 * Outward contract is frozen and unchanged: `valuechange` with
 * `{ elementId, value }`, bubbling and composed.
 *
 * The server is the only thing that knows the filter. This component sends a
 * term and the current answers, and gets back rows. It cannot widen its own
 * search even if someone rewrites its properties in a console.
 */
export default class FinalLookup extends LightningElement {
    @api elementId;
    @api label;
    @api placeholder = 'Search...';
    @api required = false;
    @api disabled = false;
    @api readOnly = false;

    /** Identifies the published config the server should compile. */
    @api formId;
    @api versionId;

    /** Answers the server resolves `$field.<id>` tokens against. */
    @api answers;

    /** Parent-supplied message when the held record no longer qualifies. */
    @api validationError;

    _value = null;
    _displayLabel = '';

    term = '';
    results = [];
    open = false;
    loading = false;
    activeIndex = -1;
    searched = false;

    _debounce;
    _generation = 0;
    _pendingActive = false;

    // ------------------------------------------------------------- value i/o

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        const v = next || null;
        if (v !== this._value) {
            this._value = v;
            if (!v) {
                this._displayLabel = '';
            }
        }
    }

    /** Caller-resolved name for a value it restored from a saved record. */
    @api
    get displayLabel() {
        return this._displayLabel;
    }
    set displayLabel(next) {
        this._displayLabel = next || '';
    }

    @api
    focus() {
        const input = this.template.querySelector('.fl-input');
        if (input) {
            input.focus();
        }
    }

    @api
    clearSelection() {
        // Imperative clears do NOT emit. Events mean the user did something;
        // a synthetic one here would loop straight back through the parent.
        this._value = null;
        this._displayLabel = '';
        this.term = '';
        this._close();
    }

    disconnectedCallback() {
        clearTimeout(this._debounce);
    }

    // ------------------------------------------------------------- rendering

    get hasSelection() {
        return Boolean(this._value);
    }

    get showPill() {
        return (this.readOnly || this.disabled) && this.hasSelection;
    }

    get pillText() {
        return this._displayLabel || this._value || '';
    }

    get clearTitle() {
        return this.label ? `Clear ${this.label}` : 'Clear selection';
    }

    get hasResults() {
        return this.results.length > 0;
    }

    get ariaExpanded() {
        return this.open ? 'true' : 'false';
    }

    get ariaInvalid() {
        return this.errorMessage ? 'true' : 'false';
    }

    get invalidAttr() {
        return this.errorMessage ? 'true' : 'false';
    }

    get listboxLabel() {
        return this.label ? `${this.label} results` : 'Search results';
    }

    get errorMessage() {
        return this.validationError || '';
    }

    get emptyMessage() {
        if (this.loading) {
            return 'Searching…';
        }
        return this.term.length < MIN_TERM
            ? `Type ${MIN_TERM} or more characters`
            : 'No matches';
    }

    /** What a screen reader is told after each search settles. */
    get statusText() {
        if (!this.open || this.loading) {
            return '';
        }
        if (!this.searched) {
            return '';
        }
        const n = this.results.length;
        if (n === 0) {
            return 'No matches';
        }
        return n === 1 ? '1 result' : `${n} results`;
    }

    renderedCallback() {
        if (!this._pendingActive) {
            return;
        }
        this._pendingActive = false;
        const input = this.template.querySelector('.fl-input');
        if (!input) {
            return;
        }
        const active = this.template.querySelector('.fl-opt-active');
        if (active) {
            // LWC rewrites ids, so read the rendered one back rather than
            // guessing it — a stale idref silently breaks the announcement.
            input.setAttribute('aria-activedescendant', active.id);
            if (active.scrollIntoView) {
                active.scrollIntoView({ block: 'nearest' });
            }
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    // ----------------------------------------------------------- interaction

    handleInput(event) {
        this.term = event.target.value || '';
        this.activeIndex = -1;
        this.searched = false;
        clearTimeout(this._debounce);
        if (this.term.length < MIN_TERM) {
            this.results = [];
            this.loading = false;
            this.open = true;
            return;
        }
        this.loading = true;
        this.open = true;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._debounce = setTimeout(() => this._run(), DEBOUNCE_MS);
    }

    handleFocus() {
        if (this.term.length >= MIN_TERM || this.results.length) {
            this.open = true;
        }
    }

    handleBlur() {
        // mousedown on an option fires before blur, so a click has already
        // been handled by the time we get here.
        this._close();
    }

    handleKeydown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this._move(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this._move(-1);
                break;
            case 'Home':
                if (this.open && this.hasResults) {
                    event.preventDefault();
                    this._setActive(0);
                }
                break;
            case 'End':
                if (this.open && this.hasResults) {
                    event.preventDefault();
                    this._setActive(this.results.length - 1);
                }
                break;
            case 'Enter':
                if (this.open && this.activeIndex >= 0) {
                    // Only swallow Enter when it is actually choosing an
                    // option, so it still submits the form otherwise.
                    event.preventDefault();
                    event.stopPropagation();
                    this._choose(this.results[this.activeIndex]);
                }
                break;
            case 'Escape':
                if (this.open) {
                    event.stopPropagation();
                    this._close();
                }
                break;
            default:
                break;
        }
    }

    handleOptionMouseDown(event) {
        // mousedown, not click: blur would close the list first and the click
        // would land on nothing.
        event.preventDefault();
        const id = event.currentTarget.dataset.id;
        this._choose(this.results.find((r) => r.id === id));
    }

    handleOptionHover(event) {
        const id = event.currentTarget.dataset.id;
        this._setActive(this.results.findIndex((r) => r.id === id));
    }

    handleClear() {
        this._value = null;
        this._displayLabel = '';
        this.term = '';
        this.results = [];
        this._emit(null, '');
        // Put the caret back where the user expects to keep typing.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => this.focus(), 0);
    }

    // --------------------------------------------------------------- private

    async _run() {
        const generation = ++this._generation;
        const term = this.term;
        try {
            const rows = await search({
                formId: this.formId || null,
                versionId: this.versionId || null,
                elementId: this.elementId,
                term,
                answersJson: JSON.stringify(this.answers || {})
            });
            if (generation !== this._generation) {
                return; // a later keystroke already owns the field
            }
            this.results = (rows || []).map((r, i) => this._decorate(r, i, -1));
            this.activeIndex = -1;
        } catch (e) {
            if (generation !== this._generation) {
                return;
            }
            // A failed search shows nothing rather than stale rows. Offering
            // results we can no longer stand behind is worse than none.
            this.results = [];
        } finally {
            if (generation === this._generation) {
                this.loading = false;
                this.searched = true;
                this._pendingActive = true;
            }
        }
    }

    _decorate(row, index, activeIndex) {
        const active = index === activeIndex;
        return {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            selected: active ? 'true' : 'false',
            optionClass: active ? 'fl-opt fl-opt-active' : 'fl-opt'
        };
    }

    _move(delta) {
        if (!this.open) {
            this.open = true;
            return;
        }
        if (!this.hasResults) {
            return;
        }
        const n = this.results.length;
        const from = this.activeIndex;
        // Wraps, because a list that silently stops moving feels broken.
        const next = from < 0 ? (delta > 0 ? 0 : n - 1) : (from + delta + n) % n;
        this._setActive(next);
    }

    _setActive(index) {
        if (index < 0 || index >= this.results.length) {
            return;
        }
        this.activeIndex = index;
        this.results = this.results.map((r, i) =>
            this._decorate(r, i, index)
        );
        this._pendingActive = true;
    }

    _choose(row) {
        if (!row) {
            return;
        }
        this._value = row.id;
        this._displayLabel = row.title;
        this.term = '';
        this.results = [];
        this._close();
        this._emit(row.id, row.title);
    }

    _close() {
        this.open = false;
        this.activeIndex = -1;
        this._pendingActive = true;
    }

    _emit(value, label) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.elementId, value, label },
                bubbles: true,
                composed: true
            })
        );
    }
}
