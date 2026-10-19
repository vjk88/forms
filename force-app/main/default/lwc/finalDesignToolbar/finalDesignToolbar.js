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

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/** Presentational shortcuts only. finalDesignPanel owns values and mutations. */
export default class FinalDesignToolbar extends LightningElement {
    @api state;
    @api disabled = false;
    query = '';
    searchOpen = false;
    colorsOpen = false;
    _focusResult = false;

    get fontOptions() {
        return this.state?.font?.options || [];
    }

    get fontDisabled() {
        return this.disabled || !this.fontOptions.length;
    }

    get colorGroups() {
        return this.state?.colorGroups || [];
    }

    get hasQuery() {
        return Boolean(this.query);
    }

    get matches() {
        const query = normalize(this.query);
        if (!query) return [];
        const words = query.split(' ');
        return (this.state?.searchEntries || [])
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
        return this.matches.slice(0, 12);
    }

    get hasResults() {
        return this.results.length > 0;
    }

    get showResults() {
        return this.searchOpen && Boolean(normalize(this.query));
    }

    get resultSummary() {
        const count = this.matches.length;
        return count > 12
            ? `Showing 12 of ${count} settings. Refine your search for more.`
            : `${count} matching setting${count === 1 ? '' : 's'}.`;
    }

    renderedCallback() {
        if (this._focusResult) {
            this._focusResult = false;
            this.template.querySelector('.dt-result')?.focus();
        }
    }

    emitChange(detail) {
        if (this.disabled) return;
        this.dispatchEvent(new CustomEvent('controlchange', { detail }));
    }

    handleFont(event) {
        this.emitChange({
            key: 'typography',
            kind: 'font',
            value: event.target.value
        });
    }

    handleColor(event) {
        this.emitChange({
            key: event.target.dataset.key,
            kind: 'color',
            value: event.detail.value
        });
    }

    handleGradient(event) {
        this.emitChange({
            key: event.target.dataset.key,
            kind: 'gradient',
            ...event.detail
        });
    }

    handleMesh(event) {
        this.emitChange({
            key: 'meshColors',
            kind: 'mesh',
            idx: event.target.dataset.idx,
            value: event.detail.value
        });
    }

    handleReset(event) {
        this.emitChange({
            key: event.currentTarget.dataset.key,
            kind: 'reset'
        });
    }

    handleColors() {
        if (this.disabled) return;
        this.colorsOpen = !this.colorsOpen;
        this.searchOpen = false;
    }

    closeColors() {
        this.colorsOpen = false;
        this.template.querySelector('.dt-colors-trigger')?.focus();
    }

    handleQuery(event) {
        this.query = event.target.value;
        this.searchOpen = true;
        this.colorsOpen = false;
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
        this.template.querySelector('.dt-search-input')?.focus();
    }

    selectResult(key) {
        if (this.disabled) return;
        const entry = (this.state?.searchEntries || []).find(
            (item) => item.key === key
        );
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
            const first = this.template.querySelector('.dt-result');
            if (first) first.focus();
            else this._focusResult = true;
        } else if (event.key === 'Enter' && this.results.length) {
            event.preventDefault();
            this.selectResult(this.results[0].key);
        }
    }

    handleResultKeydown(event) {
        const buttons = [...this.template.querySelectorAll('.dt-result')];
        const index = buttons.indexOf(event.currentTarget);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = index + (event.key === 'ArrowDown' ? 1 : -1);
            if (next < 0)
                this.template.querySelector('.dt-search-input')?.focus();
            else buttons[Math.min(next, buttons.length - 1)]?.focus();
        }
    }

    handleKeydown(event) {
        if (event.key !== 'Escape') return;
        if (this.colorsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.closeColors();
        } else if (this.searchOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.template.querySelector('.dt-search-input')?.focus();
            this.searchOpen = false;
        }
    }
}
