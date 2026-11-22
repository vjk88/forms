import { LightningElement, api, wire } from 'lwc';
import status from '@salesforce/apex/FinalAddressController.status';
import suggest from '@salesforce/apex/FinalAddressController.suggest';
import details from '@salesforce/apex/FinalAddressController.details';
import { t } from 'c/finalTranslate';

const DEBOUNCE_MS = 300;
const MIN_TERM = 3;
const MAX_OPTIONS = 5;

/** A v4 UUID: the provider's billing session (Google bills one session per
 *  address when the same id rides on every suggest and on the details call). */
function newSessionToken() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') {
        return c.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10).join('')
    ].join('-');
}

/**
 * c/finalAddressSearch - the address search box above an Address question's
 * five fields: an ARIA combobox over the server's address search.
 *
 * Keyboard handling and listbox markup follow c/finalLookup. The two are not
 * shared: that one searches records, this one searches a provider through
 * FinalAddressController and fills five fields rather than holding a record.
 *
 * Never blocks the form. Any failure hides the box and leaves one quiet line
 * saying to type the address below.
 *
 * Outward contract: `addresspick` with the server's Result as `detail`
 * (street, city, province, provinceCode, postalCode, country, countryCode,
 * latitude, longitude). Non-bubbling; the renderer listens on the element.
 */
export default class FinalAddressSearch extends LightningElement {
    @api formId;
    @api elementId;
    /** The box's accessible name; defaults to the placeholder words. */
    @api label;
    @api disabled = false;

    _status = null;
    _statusFailed = false;
    _down = false;

    term = '';
    results = [];
    open = false;
    loading = false;
    activeIndex = -1;
    searched = false;
    filled = false;

    _token = null;
    _debounce;
    _generation = 0;
    _pendingActive = false;

    @wire(status)
    wiredStatus({ data, error }) {
        if (data) {
            this._status = data;
            this._statusFailed = false;
        } else if (error) {
            this._status = null;
            this._statusFailed = true;
        }
    }

    disconnectedCallback() {
        clearTimeout(this._debounce);
    }

    // ------------------------------------------------------------- rendering

    get configured() {
        return Boolean(this._status && this._status.configured);
    }

    get showNote() {
        return this._down || (this._statusFailed && !this._status);
    }

    get showBox() {
        return !this.showNote && this.configured;
    }

    get noteText() {
        return t('Final_Run_AddressSearchDown');
    }

    get placeholder() {
        return t('Final_Run_AddressSearch');
    }

    get accessibleName() {
        return this.label || t('Final_Run_AddressSearch');
    }

    get attribution() {
        return (this._status && this._status.attribution) || '';
    }

    get hasResults() {
        return this.results.length > 0;
    }

    get showEmpty() {
        return (
            !this.hasResults &&
            !this.loading &&
            this.searched &&
            this.term.trim().length >= MIN_TERM
        );
    }

    get emptyMessage() {
        return t('Final_Run_AddressNoMatches');
    }

    get ariaExpanded() {
        return this.open ? 'true' : 'false';
    }

    get hintText() {
        return t('Final_Run_AddressSearchHint');
    }

    get groupMoreText() {
        return t('Final_Run_AddressGroupMore');
    }

    get statusText() {
        if (this.loading) {
            return t('Final_Run_AddressSearching');
        }
        if (this.filled) {
            return t('Final_Run_AddressFilled');
        }
        if (!this.open || this.loading || !this.searched) {
            return '';
        }
        const n = this.results.length;
        if (n === 0) {
            return t('Final_Run_AddressNoMatches');
        }
        return n === 1
            ? t('Final_Run_ResultOne')
            : t('Final_Run_ResultsMany', n);
    }

    renderedCallback() {
        if (!this._pendingActive) {
            return;
        }
        this._pendingActive = false;
        const input = this.template.querySelector('.fas-input');
        if (!input) {
            return;
        }
        const active = this.template.querySelector('.fas-opt-active');
        if (active) {
            // LWC rewrites ids, so read the rendered one back rather than
            // guessing it: a stale idref silently breaks the announcement.
            input.setAttribute('aria-activedescendant', active.id);
            if (active.scrollIntoView) {
                active.scrollIntoView({ block: 'nearest' });
            }
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    // ----------------------------------------------------------- interaction

    handleFocus() {
        if (!this._token) {
            this._token = newSessionToken();
        }
        if (this.hasResults) {
            this.open = true;
        }
    }

    handleBlur() {
        // mousedown on an option fires before blur, so a click has already
        // been handled by the time we get here.
        this._close();
    }

    handleInput(event) {
        this.term = event.target.value || '';
        this.filled = false;
        this.activeIndex = -1;
        this.searched = false;
        clearTimeout(this._debounce);
        // a keystroke retires whatever search is still in the air
        this._generation += 1;
        if (this.term.trim().length < MIN_TERM) {
            this.results = [];
            this.loading = false;
            this.open = false;
            return;
        }
        this.loading = true;
        this.open = true;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._debounce = setTimeout(() => this._run(null), DEBOUNCE_MS);
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
                    // Only swallow Enter when it is choosing an option, so it
                    // still submits the form otherwise.
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
        this._choose(this.results[Number(event.currentTarget.dataset.index)]);
    }

    handleOptionHover(event) {
        this._setActive(Number(event.currentTarget.dataset.index));
    }

    // --------------------------------------------------------------- private

    async _run(container) {
        const generation = ++this._generation;
        if (!this._token) {
            this._token = newSessionToken();
        }
        this.loading = true;
        try {
            const rows = await suggest({
                formId: this.formId || null,
                elementId: this.elementId,
                text: this.term.trim(),
                sessionToken: this._token,
                container: container || null
            });
            if (generation !== this._generation) {
                return; // a later keystroke or pick already owns the box
            }
            this.results = (rows || [])
                .slice(0, MAX_OPTIONS)
                .map((r, i) => this._decorate(r, i, -1));
            this.activeIndex = -1;
            this.open = true;
            this.loading = false;
            this.searched = true;
            this._pendingActive = true;
        } catch {
            if (generation === this._generation) {
                this._fail();
            }
        }
    }

    _decorate(row, index, activeIndex) {
        const active = index === activeIndex;
        return {
            key: `opt-${index}`,
            index,
            id: row.id,
            title: row.title,
            subtitle: row.subtitle,
            isGroup: row.isGroup === true,
            selected: active ? 'true' : 'false',
            optionClass: active ? 'fas-opt fas-opt-active' : 'fas-opt'
        };
    }

    _move(delta) {
        if (!this.open) {
            if (this.hasResults) {
                this.open = true;
            }
            return;
        }
        if (!this.hasResults) {
            return;
        }
        const n = this.results.length;
        const from = this.activeIndex;
        // Wraps, because a list that silently stops moving feels broken.
        const next =
            from < 0 ? (delta > 0 ? 0 : n - 1) : (from + delta + n) % n;
        this._setActive(next);
    }

    _setActive(index) {
        if (index < 0 || index >= this.results.length) {
            return;
        }
        this.activeIndex = index;
        this.results = this.results.map((r, i) => this._decorate(r, i, index));
        this._pendingActive = true;
    }

    async _choose(row) {
        if (!row) {
            return;
        }
        if (row.isGroup) {
            // open the group's own list instead of filling anything
            clearTimeout(this._debounce);
            await this._run(row.id);
            return;
        }
        // retire any search still in the air, then fetch the full address
        const generation = ++this._generation;
        clearTimeout(this._debounce);
        this.loading = true;
        try {
            const result = await details({
                formId: this.formId || null,
                elementId: this.elementId,
                placeId: row.id,
                sessionToken: this._token
            });
            if (generation !== this._generation) {
                return;
            }
            // the session is spent: the next address starts a new one
            this._token = null;
            this.term = '';
            this.results = [];
            this.loading = false;
            this.searched = false;
            this.filled = Boolean(result);
            this._close();
            if (result) {
                this.dispatchEvent(
                    new CustomEvent('addresspick', { detail: result })
                );
            }
        } catch {
            if (generation === this._generation) {
                this._fail();
            }
        }
    }

    _fail() {
        clearTimeout(this._debounce);
        this._generation += 1;
        // Tell the renderer first, while the box is still there to read: it
        // moves the cursor to Street and carries the typed text across, so the
        // person is not left with focus on something that is about to vanish.
        this.dispatchEvent(
            new CustomEvent('searchdown', { detail: { term: this.term } })
        );
        this._down = true;
        this.loading = false;
        this.results = [];
        this.open = false;
        this.term = '';
        this.filled = false;
    }

    _close() {
        this.open = false;
        this.activeIndex = -1;
        this._pendingActive = true;
    }
}
