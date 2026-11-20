import { LightningElement, api } from 'lwc';
import {
    addLanguage,
    normalizeLanguage,
    removeLanguage,
    setTranslation,
    listTexts,
    translationProgress,
    translationStatus
} from 'c/finalTranslate';

/**
 * The Translate screen (translations 3B, docs/FinalDesign/mocks/
 * translate-screen-mock.html). Studio chrome: reads --c-studio-* only.
 *
 * Every rule about texts, keys, fingerprints and status lives in
 * c/finalTranslate; this component only draws it and turns edits into a NEW
 * spec (`specchange` {spec}), which the Studio applies through its normal edit
 * path (undo, redo, autosave). A translation is committed on blur or after
 * the author stops typing for COMMIT_MS, never per keystroke.
 */

const COMMIT_MS = 500;
const LONG_SOURCE = 80;
const MAX_QUERY_ROWS = 2000;

// Offered only when the org's list could not be loaded.
const FALLBACK_CODES = [
    'fr',
    'de',
    'es',
    'it',
    'pt_BR',
    'nl_NL',
    'ja',
    'zh_CN',
    'ko',
    'sv'
];

const PILL = {
    done: { label: 'Done', cls: 'tr-pill tr-pill--done' },
    missing: { label: 'Missing', cls: 'tr-pill tr-pill--missing' },
    changed: { label: 'Check', cls: 'tr-pill tr-pill--check' }
};

/** The words of an HTML string, tags and common entities removed. */
function plainText(html) {
    return String(html === undefined || html === null ? '' : html)
        .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function displayName(code) {
    try {
        const names = new Intl.DisplayNames(['en'], { type: 'language' });
        return names.of(String(code).replace('_', '-')) || code;
    } catch {
        return code;
    }
}

export default class FinalTranslatePane extends LightningElement {
    /** The form spec being edited (read only; edits go out as `specchange`). */
    @api
    get spec() {
        return this._spec;
    }
    set spec(value) {
        this._spec = value || null;
    }

    /** The org's active languages: [{ code, label }]. */
    @api
    get languages() {
        return this._languages;
    }
    set languages(value) {
        this._languages = Array.isArray(value) ? value : [];
    }

    /** The language to show, kept by the Studio across the preview. */
    @api
    get selectedLanguage() {
        return this._selected;
    }
    set selectedLanguage(value) {
        this._selected = normalizeLanguage(value);
    }

    _spec = null;
    _languages = [];
    _selected = null;
    _announced = undefined;

    /** null = pick for me (Needs work when there is any, else All). */
    _filter = null;
    query = '';
    adding = false;
    confirmingRemove = false;

    _pending = new Map();
    _timer = null;
    _pinned = new Set();
    _pinRev = 0;
    _focusNext = null;
    // plain object: its properties change during render without re-rendering
    _cache = { key: null, vm: null };

    disconnectedCallback() {
        this._flush();
    }

    renderedCallback() {
        const current = this.activeCode;
        if (current !== this._announced) {
            this._announced = current;
            this.dispatchEvent(
                new CustomEvent('languagechange', {
                    detail: {
                        code: current,
                        label: current ? this._nameOf(current) : ''
                    }
                })
            );
        }
        if (this._focusNext) {
            const el = this.template.querySelector(this._focusNext);
            this._focusNext = null;
            if (el) {
                el.focus();
            }
        }
    }

    // ----- languages -----

    get defaultCode() {
        return normalizeLanguage(this._spec?.languages?.default) || 'en_US';
    }

    get otherCodes() {
        const def = this.defaultCode;
        const seen = new Set();
        const out = [];
        const available = this._spec?.languages?.available;
        (Array.isArray(available) ? available : []).forEach((raw) => {
            const code = normalizeLanguage(raw);
            if (code && code !== def && !seen.has(code)) {
                seen.add(code);
                out.push(code);
            }
        });
        return out;
    }

    /** The shown language: the picked one while it is still offered, else the
     *  first one, else none. */
    get activeCode() {
        const others = this.otherCodes;
        return others.includes(this._selected)
            ? this._selected
            : others[0] || null;
    }

    _nameOf(code) {
        const hit = this._languages.find(
            (l) => normalizeLanguage(l.code) === code || l.code === code
        );
        return (hit && hit.label) || displayName(code);
    }

    get addOptions() {
        const taken = new Set([this.defaultCode, ...this.otherCodes]);
        const source = this._languages.length
            ? this._languages.map((l) => ({
                  code: normalizeLanguage(l.code),
                  label: l.label
              }))
            : FALLBACK_CODES.map((code) => ({
                  code,
                  label: displayName(code)
              }));
        return source
            .filter((l) => l.code && !taken.has(l.code))
            .map((l) => ({ label: l.label, value: l.code }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    // ----- the view model, rebuilt only when its inputs change -----

    get _vm() {
        const key = [
            this._spec,
            this.activeCode,
            this._filter,
            this.query,
            this._pinRev,
            this._languages
        ];
        const cache = this._cache;
        if (cache.key && cache.key.every((k, i) => k === key[i])) {
            return cache.vm;
        }
        const vm = this._build();
        cache.key = key;
        cache.vm = vm;
        return vm;
    }

    _build() {
        const spec = this._spec;
        const code = this.activeCode;
        const cards = this.otherCodes.map((c) => {
            const p = translationProgress(spec, c);
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return {
                code: c,
                name: this._nameOf(c),
                count: `${p.done} / ${p.total}`,
                barStyle: `width: ${pct}%`,
                hasBar: p.total > 0,
                missingText: p.missing ? `${p.missing} missing` : '',
                changedText: p.changed ? `${p.changed} changed in English` : '',
                hasMissing: p.missing > 0,
                hasChanged: p.changed > 0,
                separator: p.missing > 0 && p.changed > 0,
                allDone: p.total > 0 && p.missing === 0 && p.changed === 0,
                cls: c === code ? 'tr-lang tr-lang--on' : 'tr-lang',
                current: c === code ? 'true' : 'false'
            };
        });
        const vm = {
            defaultCount: `${listTexts(spec || {}).length} texts`,
            cards,
            counts: null,
            groups: [],
            filter: null,
            emptyText: ''
        };
        if (!code || !spec) {
            return vm;
        }
        const all = translationStatus(spec, code);
        const counts = {
            all: all.length,
            needs: all.filter((r) => r.status !== 'done').length,
            done: all.filter((r) => r.status === 'done').length
        };
        const filter = this._filter || (counts.needs > 0 ? 'needs' : 'all');
        const q = this.query.trim().toLowerCase();
        const name = this._nameOf(code);
        const groups = [];
        const byOrder = new Map();
        let shown = 0;
        all.forEach((row) => {
            const sourcePlain = row.rich ? plainText(row.source) : row.source;
            const valuePlain = row.rich
                ? plainText(row.translation)
                : row.translation;
            const passes =
                filter === 'all' ||
                this._pinned.has(row.key) ||
                (filter === 'needs'
                    ? row.status !== 'done'
                    : row.status === 'done');
            if (!passes) {
                return;
            }
            if (
                q &&
                !sourcePlain.toLowerCase().includes(q) &&
                !valuePlain.toLowerCase().includes(q)
            ) {
                return;
            }
            if (shown >= MAX_QUERY_ROWS) {
                return;
            }
            shown += 1;
            let group = byOrder.get(row.group.order);
            if (!group) {
                group = {
                    id: `g${row.group.order}`,
                    title: row.group.title,
                    rows: []
                };
                byOrder.set(row.group.order, group);
                groups.push(group);
            }
            const pill = PILL[row.status];
            const long = !row.rich && row.source.length > LONG_SOURCE;
            group.rows.push({
                key: row.key,
                kind: row.kind,
                source: sourcePlain,
                isRich: row.rich,
                isLong: long,
                isPlain: !row.rich && !long,
                value: row.translation,
                inputLabel: `${name}: ${row.kind}`,
                placeholder: 'Shows the English until translated',
                pillLabel: pill.label,
                pillClass: pill.cls,
                isChanged: row.status === 'changed'
            });
        });
        vm.counts = counts;
        vm.filter = filter;
        vm.groups = groups;
        vm.name = name;
        vm.hasRows = groups.length > 0;
        vm.emptyText = q
            ? `No texts match “${this.query.trim()}”.`
            : this._emptyFor(filter, name, counts);
        vm.options = [
            { label: `All ${counts.all}`, value: 'all' },
            { label: `Needs work ${counts.needs}`, value: 'needs' },
            { label: `Done ${counts.done}`, value: 'done' }
        ];
        return vm;
    }

    _emptyFor(filter, name, counts) {
        if (counts.all === 0) {
            return 'This form has no text to translate yet. Add questions in Build.';
        }
        if (filter === 'needs') {
            return `Nothing needs work in ${name}.`;
        }
        return `Nothing is done in ${name} yet.`;
    }

    // ----- template getters -----

    get cards() {
        return this._vm.cards;
    }
    get defaultName() {
        return this._nameOf(this.defaultCode);
    }
    get defaultCount() {
        return this._vm.defaultCount;
    }
    get introText() {
        return `Respondents see their own language when the form offers it; everything untranslated shows in ${this.defaultName}.`;
    }
    get hasLanguage() {
        return Boolean(this.activeCode);
    }
    get noLanguage() {
        return !this.activeCode;
    }
    get heading() {
        return this._vm.name;
    }
    get removeLabel() {
        return `Remove ${this._vm.name}`;
    }
    get removeQuestion() {
        const p = translationProgress(this._spec, this.activeCode);
        const n = p.done + p.changed;
        return `Remove ${this._vm.name} and its ${n} ${n === 1 ? 'translation' : 'translations'}?`;
    }
    get filterOptions() {
        return this._vm.options;
    }
    get filterValue() {
        return this._vm.filter;
    }
    get groups() {
        return this._vm.groups;
    }
    get hasRows() {
        return this._vm.hasRows;
    }
    get noRows() {
        return !this._vm.hasRows;
    }
    get emptyText() {
        return this._vm.emptyText;
    }
    get englishHeader() {
        return this.defaultName;
    }
    get notAdding() {
        return !this.adding;
    }
    get canAdd() {
        return this.addOptions.length > 0;
    }
    get addPlaceholder() {
        return 'Pick a language';
    }

    // ----- the form's language menu -----

    /** On unless the author turned it off (absent = on). */
    get showSwitcher() {
        return this._spec?.languages?.showSwitcher !== false;
    }
    get switcherHint() {
        const names = [this.defaultCode, ...this.otherCodes].map((c) =>
            this._nameOf(c)
        );
        return `Respondents can switch between ${names.join(', ')}.`;
    }
    handleSwitcher(event) {
        if (!this._spec) {
            return;
        }
        this._flush();
        const checked = Boolean(event.detail && event.detail.checked);
        this._emit({
            ...this._spec,
            languages: { ...this._spec.languages, showSwitcher: checked }
        });
    }

    // ----- picking, adding, removing -----

    handleSelect(event) {
        const code = event.currentTarget.dataset.code;
        if (code === this.activeCode) {
            return;
        }
        this._flush();
        this._selected = code;
        this._resetView();
    }

    _resetView() {
        this._filter = null;
        this.query = '';
        this._pinned = new Set();
        this._pinRev += 1;
        this.confirmingRemove = false;
    }

    handleAddStart() {
        this._flush();
        this.adding = true;
        this._focusNext = '.tr-add-combo';
    }

    handleAddCancel() {
        this.adding = false;
        this._focusNext = '.tr-add';
    }

    handleAddPick(event) {
        const code = normalizeLanguage(event.detail.value);
        if (!code || !this._spec) {
            return;
        }
        this.adding = false;
        this._selected = code;
        this._resetView();
        this._emit(addLanguage(this._spec, code));
    }

    handleRemoveStart() {
        this._flush();
        this.confirmingRemove = true;
        this._focusNext = '.tr-ask-cancel';
    }

    handleRemoveCancel() {
        this.confirmingRemove = false;
        this._focusNext = '.tr-remove';
    }

    handleRemoveKeydown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleRemoveCancel();
        }
    }

    handleRemoveConfirm() {
        const code = this.activeCode;
        this.confirmingRemove = false;
        if (!code) {
            return;
        }
        this._selected = null;
        this._resetView();
        this._emit(removeLanguage(this._spec, code));
        this._focusNext = '.tr-add';
    }

    // ----- tools -----

    handleFilter(event) {
        this._filter = event.detail.value;
        this._pinned = new Set();
        this._pinRev += 1;
    }

    handleSearch(event) {
        this.query = event.detail.value || '';
        this._pinned = new Set();
        this._pinRev += 1;
    }

    // ----- editing -----

    handleEdit(event) {
        const key = event.target.dataset.key;
        const rich = event.target.dataset.rich === 'true';
        let value = event.detail.value;
        value = value === undefined || value === null ? '' : String(value);
        if (rich && plainText(value) === '') {
            value = '';
        }
        this._pending.set(key, { lang: this.activeCode, value });
        clearTimeout(this._timer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._timer = setTimeout(() => this._flush(), COMMIT_MS);
    }

    handleBlur() {
        this._flush();
    }

    /** Mark a "Check" translation as still right: re-stamps its fingerprint. */
    handleStillCorrect(event) {
        const key = event.currentTarget.dataset.key;
        const lang = this.activeCode;
        const row = translationStatus(this._spec, lang).find(
            (r) => r.key === key
        );
        if (row) {
            this._pinned.add(key);
            this._pinRev += 1;
            this._emit(setTranslation(this._spec, lang, key, row.translation));
        }
    }

    _flush() {
        clearTimeout(this._timer);
        this._timer = null;
        if (!this._pending.size || !this._spec) {
            this._pending.clear();
            return;
        }
        const pending = [...this._pending.entries()];
        this._pending.clear();
        let next = this._spec;
        let changed = false;
        pending.forEach(([key, { lang, value }]) => {
            const current =
                (this._spec.translations &&
                    this._spec.translations[lang] &&
                    this._spec.translations[lang][key]) ||
                '';
            if (current === value) {
                return;
            }
            this._pinned.add(key);
            next = setTranslation(next, lang, key, value);
            changed = true;
        });
        if (changed) {
            this._pinRev += 1;
            // keep the flushed edit in the base for a change made right after
            this._spec = next;
            this._emit(next);
        }
    }

    _emit(spec) {
        this.dispatchEvent(new CustomEvent('specchange', { detail: { spec } }));
    }
}
