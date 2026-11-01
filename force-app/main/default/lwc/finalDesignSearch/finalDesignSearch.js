import { LightningElement, api } from 'lwc';

const ALIASES = {
    typography: 'font fonts typeface family custom brand',
    pageBg: 'background page canvas',
    contentBg: 'background form panel',
    headerBg: 'background header banner',
    sectionBg: 'background section',
    radius: 'rounded corners rounding',
    pageRadius: 'rounded corners embedded',
    pageScrim: 'image darken darkening overlay',
    mesh: 'background gradient blobs',
    labelColor: 'font text color labels',
    headerText: 'font title heading color',
    headerTextWeak: 'font subtitle description color',
    text: 'font body answer color',
    textWeak: 'font placeholder muted color',
    submitText: 'font button text color',
    required: 'required asterisk color',
    glass: 'blur frosted transparency'
};

const LIMIT = 12;

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/**
 * finalDesignSearch — "Find a design setting" at the top of the Design pane
 * (IMPL_PLAN_DESIGN_RAIL; moved unchanged from the old toolbar strip).
 * Navigation only: picking an available result emits `settingselect`
 * { key }; finalDesignPanel opens that control's tab and focuses it.
 *
 *   entries  [{ key, label, path, hint?, choices?, available, reason? }]
 */
export default class FinalDesignSearch extends LightningElement {
    @api entries = [];
    @api disabled = false;
    /** In Simple: a pick switches to Advanced design, so the list says so. */
    @api opensAdvanced = false;
    query = '';
    searchOpen = false;
    _focusResult = false;

    get hasQuery() {
        return Boolean(this.query);
    }

    get matches() {
        const query = normalize(this.query);
        if (!query) return [];
        const words = query.split(' ');
        return (this.entries || [])
            .map((entry, index) => {
                const label = normalize(entry.label);
                const aliases = `${ALIASES[entry.key] || ''} ${entry.key.toLowerCase().includes('opacity') ? 'opacity transparency transparent' : ''}`;
                const searchable = normalize(
                    `${entry.label} ${entry.path} ${entry.hint} ${entry.choices} ${aliases}`
                );
                if (!words.every((word) => searchable.includes(word)))
                    return null;
                const score =
                    label === query
                        ? 0
                        : label.startsWith(query)
                          ? 1
                          : label.includes(query)
                            ? 2
                            : 3;
                return {
                    ...entry,
                    score,
                    index,
                    unavailable: !entry.available
                };
            })
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.score - b.score ||
                    Number(a.unavailable) - Number(b.unavailable) ||
                    a.index - b.index
            );
    }

    get results() {
        return this.matches.slice(0, LIMIT);
    }

    get hasResults() {
        return this.results.length > 0;
    }

    get showResults() {
        return this.searchOpen && Boolean(normalize(this.query));
    }

    get resultSummary() {
        const count = this.matches.length;
        const found =
            count > LIMIT
                ? `Showing ${LIMIT} of ${count} settings. Refine your search for more.`
                : `${count} matching setting${count === 1 ? '' : 's'}.`;
        return this.opensAdvanced && count
            ? `${found} Picking one opens Advanced design.`
            : found;
    }

    renderedCallback() {
        if (this._focusResult) {
            this._focusResult = false;
            this.template.querySelector('.ds-result')?.focus();
        }
    }

    handleQuery(event) {
        this.query = event.target.value;
        this.searchOpen = true;
    }

    handleSearchFocus() {
        this.searchOpen = true;
    }

    /** Tab-away or a click elsewhere closes the list; moving between the
     *  input, Clear and the results keeps it open. */
    handleSearchFocusOut(event) {
        if (!event.currentTarget.contains(event.relatedTarget))
            this.searchOpen = false;
    }

    /** Safari never focuses a clicked button, so without this a click on a
     *  result reads as focus leaving and closes the list before it lands. */
    keepSearchFocus(event) {
        event.preventDefault();
    }

    clearSearch() {
        this.query = '';
        this.searchOpen = false;
        this.template.querySelector('.ds-input')?.focus();
    }

    selectResult(key) {
        if (this.disabled) return;
        const entry = (this.entries || []).find((item) => item.key === key);
        if (!entry?.available) return;
        this.searchOpen = false;
        this.dispatchEvent(
            new CustomEvent('settingselect', { detail: { key } })
        );
    }

    handleResult(event) {
        this.selectResult(event.currentTarget.dataset.key);
    }

    handleSearchKeydown(event) {
        if (event.key === 'ArrowDown' && this.results.length) {
            event.preventDefault();
            this.searchOpen = true;
            const first = this.template.querySelector('.ds-result');
            if (first) first.focus();
            else this._focusResult = true;
        } else if (event.key === 'Enter' && this.results.length) {
            event.preventDefault();
            this.selectResult(this.results[0].key);
        }
    }

    handleResultKeydown(event) {
        const buttons = [...this.template.querySelectorAll('.ds-result')];
        const index = buttons.indexOf(event.currentTarget);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = index + (event.key === 'ArrowDown' ? 1 : -1);
            if (next < 0) this.template.querySelector('.ds-input')?.focus();
            else buttons[Math.min(next, buttons.length - 1)]?.focus();
        }
    }

    handleKeydown(event) {
        if (event.key !== 'Escape' || !this.searchOpen) return;
        event.preventDefault();
        event.stopPropagation();
        this.template.querySelector('.ds-input')?.focus();
        this.searchOpen = false;
    }
}
