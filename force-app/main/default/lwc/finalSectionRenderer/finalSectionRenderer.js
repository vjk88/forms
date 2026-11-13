import { LightningElement, api } from 'lwc';
import { repeatLimits, isAnswerable } from 'c/finalRepeatGroups';

/**
 * finalSectionRenderer — one spec section: header, style treatment, field grid.
 *
 * Surface resolution (ARCH §3.1 rule 5 carve-out + §4.3 cascade):
 * preset class (CSS fallbacks decide) → --c-section-* tokens if the theme sets them
 * → this section's explicit `surface` values (inline style, wins over everything).
 *
 * Grid (BUILDER_SURFACES §7): columns 1–4; elements span per their `width`
 * (clamped to the column count); divider/spacer ALWAYS span every column.
 * `showHeader:false` hides the whole header; `collapsible` folds the grid
 * (initial state from `defaultCollapsed`).
 */

// The three values the Block style control writes. Theme-level Outline/Subtle
// looks arrive as --c-section-* TOKENS (engine SECTION_LOOKS), never as this
// class — the unreachable outline/subtle/flat class values were deleted
// 2026-07-18 (sweep DELETE ruling).
const KNOWN_STYLES = ['plain', 'card', 'boxed'];

/** `n:sectionId` unfolds already done. Module-level, so a section drawn
 *  again (page left and come back to) never re-opens on an old click. */
const unfoldDone = new Set();

/** Repeating-group focus: this component's own focus numbers (strings, so
 *  they can never collide with the viewer's numeric ones in the element
 *  renderer's once-only set), and the viewer's Add-button requests done. */
let repFocusSeq = 0;
const repFocusDone = new Set();

/** Elements that always span the full grid regardless of width. */
const FULL_WIDTH_TYPES = new Set(['divider', 'spacer']);

// The Padding choice is written as an INLINE style, which outranks every
// stylesheet rule, so the narrow-form cap (--c-pad-cap: 12px on a phone, unset
// everywhere else) has to sit inside the value. `none` stays 0: a cap only
// ever shrinks a padding.
const PAD_CAP = 'var(--c-pad-cap, 9999px)';
const capped = (size) => `min(${size}, ${PAD_CAP})`;

const PAD_SCALE = {
    none: '0',
    sm: capped('var(--c-space-3)'),
    md: capped('var(--c-section-pad)'),
    lg: capped('var(--c-space-6)')
};

export default class FinalSectionRenderer extends LightningElement {
    _collapsed = false;
    _collapseInitFor = null;

    _section;
    @api
    get section() {
        return this._section;
    }
    set section(value) {
        // A repeating group is seeded from what the FORM has stored (the
        // viewer's `entries`), never from this component's own memory: when
        // it is first drawn (back from another page, its group shown again)
        // and when a different section or a new preview revision arrives.
        // While it stays drawn it keeps the in-progress typing itself, so a
        // new list with the same keys never overwrites a control mid-typing
        // (IMPL_PLAN_RELATED_RECORDS §3).
        const seedKey = `${value?.id}|${value?.previewRevision ?? ''}`;
        if (
            value?.repeat &&
            (this.entryKeys === null || seedKey !== this._seededFor)
        ) {
            this._seed(value, seedKey);
        }
        this._section = value;
    }

    _seed(value, seedKey) {
        const sameGroup = this._seededFor?.split('|')[0] === value.id;
        this._seededFor = seedKey;
        let entries = value.entries;
        if (!Array.isArray(entries)) {
            // a host that predates the entries contract: `min` blank entries
            const min = repeatLimits(value.repeat).min;
            entries = Array.from({ length: min }, (x, i) => ({
                key: `en_${i}`,
                values: {}
            }));
        }
        this.entryKeys = entries.map((e) => e.key);
        this._entryValues = Object.fromEntries(
            entries.map((e) => [e.key, { ...(e.values || {}) }])
        );
        // The counter travels with the entries, so a removed key is never
        // handed out again; a preview revision of the same group never
        // lowers it.
        const seq = Number(value.nextEntrySeq);
        const given = Number.isInteger(seq) ? seq : entries.length;
        this._entrySeq = sameGroup ? Math.max(given, this._entrySeq) : given;
    }

    get sec() {
        return this.section || {};
    }

    get sectionClass() {
        const style = (this.sec.style || 'card').toLowerCase();
        const base = `section style-${KNOWN_STYLES.includes(style) ? style : 'card'}`;
        // conversational scale — stamped by the viewer's one-per-screen split
        return this.sec.convo ? `${base} sec-convo` : base;
    }

    get surfaceStyle() {
        const surface = this.sec.surface || {};
        const parts = [];
        if (surface.bg) {
            parts.push(`background: ${surface.bg}`);
        }
        if (surface.border) {
            parts.push(`border: ${surface.border}`);
        }
        if (surface.shadow) {
            parts.push(`box-shadow: ${surface.shadow}`);
        }
        if (surface.padding && PAD_SCALE[surface.padding]) {
            parts.push(`padding: ${PAD_SCALE[surface.padding]}`);
        }
        // its own focus treatment, computed by the viewer from this
        // background (IMPL_PLAN_FOCUS_CONTRAST v5 §6)
        if (this.sec.focusStyle) {
            parts.push(this.sec.focusStyle);
        }
        // and its own readable text colours (IMPL_PLAN_TEXT_CONTRAST §4.2)
        if (this.sec.textStyle) {
            parts.push(this.sec.textStyle);
        }
        return parts.join('; ');
    }

    get columns() {
        return [1, 2, 3, 4].includes(this.sec.columns) ? this.sec.columns : 1;
    }

    get gridClass() {
        return `grid cols-${this.columns}`;
    }

    _gridFor(elements, idSuffix) {
        const cols = this.columns;
        return (elements || []).map((el) => {
            let span = 1;
            if (FULL_WIDTH_TYPES.has(el.type)) {
                span = cols;
            } else {
                span = Math.min(Math.max(Number(el.width) || 1, 1), cols);
            }
            return {
                el: idSuffix ? { ...el, id: `${el.id}::${idSuffix}` } : el,
                spanStyle: cols > 1 ? `grid-column: span ${span}` : ''
            };
        });
    }

    /** Each element with its grid-column span resolved (width clamped to
     *  the column count; full-width types take the whole row). */
    get gridElements() {
        return this._gridFor(this.sec.elements, null);
    }

    // ---- repeatable sections (schema §4.1 — defined once, instantiated
    // at runtime; entries answer as ONE consolidated value) ----

    /** Entry keys are LOCAL state (reactive), seeded from the viewer's
     *  `entries`; values live off-render. The consolidated answer rides the
     *  ordinary valuechange chain as elementId `repeat:{sectionId}` → the §8
     *  entries array, plus `keys`, `nextEntrySeq` and `change`
     *  (IMPL_PLAN_RELATED_RECORDS §3) — no new event plumbing through the
     *  seven navs, which forward `detail` whole. */
    entryKeys = null;
    _entrySeq = 0;
    _entryValues = {};
    _seededFor = null;
    /** Focus to place after this render: { key } (new entry) or 'add'. */
    _pendingFocus = null;

    get isRepeat() {
        return Boolean(this.sec.repeat);
    }

    get repeatCfg() {
        return this.sec.repeat || {};
    }

    /** The limits the viewer checked ({ min, max }, max never above 50). */
    get limits() {
        return this.sec.repeatLimits || repeatLimits(this.repeatCfg);
    }

    get minEntries() {
        return this.limits.min;
    }

    _currentKeys() {
        return this.entryKeys || [];
    }

    _entryTitle(index) {
        return (this.repeatCfg.entryLabel || 'Entry {index}')
            .split('{index}')
            .join(String(index + 1));
    }

    /** "Remove Case 2". A title without {index} ("Case") would give every
     *  × the same name, so the number is added for screen readers. */
    _removeName(index, title) {
        const numbered = (
            this.repeatCfg.entryLabel || 'Entry {index}'
        ).includes('{index}');
        return `${this.removeTitle} ${title}${numbered ? '' : ` ${index + 1}`}`;
    }

    get repeatEntries() {
        const keys = this._currentKeys();
        const byKey = new Map((this.sec.entries || []).map((e) => [e.key, e]));
        const canRemove = keys.length > this.minEntries;
        const pending = this._pendingFocus;
        return keys.map((key, i) => {
            const info = byKey.get(key) || {};
            const hidden = new Set(info.hidden || []);
            const errors = info.errors || {};
            const values = this._entryValues[key] || {};
            const label = this._entryTitle(i);
            // The new entry's first question takes the cursor after Add.
            const addFocus =
                pending && pending.key === key
                    ? (this.sec.elements || []).find(
                          (el) => !hidden.has(el.id) && isAnswerable(el)
                      )
                    : null;
            const elements = (this.sec.elements || [])
                .filter((el) => !hidden.has(el.id))
                .map((el) => {
                    // every question is handed the answer the form holds,
                    // so what shows is what will be sent
                    let e = { ...el, value: values[el.id] };
                    if (errors[el.id] && errors[el.id].length) {
                        e = { ...e, errors: errors[el.id] };
                    }
                    if (info.focus && info.focus.elementId === el.id) {
                        e = { ...e, focusRequest: info.focus.n };
                    } else if (addFocus && addFocus.id === el.id) {
                        e = { ...e, focusRequest: pending.n };
                    }
                    return e;
                });
            return {
                key,
                label,
                canRemove,
                removeLabel: this._removeName(i, label),
                elements: this._gridFor(elements, key)
            };
        });
    }

    get showAdd() {
        return this._currentKeys().length < this.limits.max;
    }

    get addLabel() {
        return this.repeatCfg.addLabel || 'Add another';
    }

    get removeTitle() {
        return this.repeatCfg.removeLabel || 'Remove';
    }

    get minMessage() {
        return this.sec.minMessage || '';
    }

    handleAddEntry() {
        if (!this.showAdd) {
            return;
        }
        const key = `en_${this._entrySeq}`;
        this._entrySeq += 1;
        this.entryKeys = [...this._currentKeys(), key];
        repFocusSeq += 1;
        this._pendingFocus = { key, n: `rep:${repFocusSeq}` };
        this._dispatchRepeat({ kind: 'add', key });
    }

    handleRemoveEntry(event) {
        const key = event.currentTarget.dataset.key;
        this.entryKeys = this._currentKeys().filter((k) => k !== key);
        delete this._entryValues[key];
        this._pendingFocus = 'add';
        this._dispatchRepeat({ kind: 'remove', key });
    }

    _dispatchRepeat(change) {
        const keys = [...this._currentKeys()];
        const entries = keys.map((key) => ({ ...this._entryValues[key] }));
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: {
                    elementId: `repeat:${this.sec.id}`,
                    value: entries,
                    keys,
                    nextEntrySeq: this._entrySeq,
                    change
                }
            })
        );
    }

    /** Puts the cursor where the last Add / × / blocked click asked. */
    _placeRepeatFocus() {
        const pending = this._pendingFocus;
        if (pending === 'add') {
            this._pendingFocus = null;
            this._focusAdd();
        } else if (pending && pending.key) {
            // the element renderer takes `focusRequest` itself; with no
            // question to take it, the Add button does
            const entry = this.repeatEntries.find((e) => e.key === pending.key);
            this._pendingFocus = null;
            if (!entry || !entry.elements.some((g) => g.el.focusRequest)) {
                this._focusAdd();
            }
        }
        // The viewer's fallback for a minimum it can't point inside an
        // entry: the Add button, else the heading scrolled into view.
        const n = this.sec.focusAdd;
        const key = `${n}:${this.sec.id}`;
        if (n && !repFocusDone.has(key)) {
            repFocusDone.add(key);
            this._focusAdd();
        }
    }

    _focusAdd() {
        const add = this.template.querySelector('.rep-add');
        if (add) {
            add.focus();
            return;
        }
        const head = this.template.querySelector('.sec-head, .rep-entries');
        if (head && typeof head.scrollIntoView === 'function') {
            head.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
    }

    get hasHeader() {
        return (
            this.sec.showHeader !== false &&
            Boolean(this.sec.title || this.sec.description || this.sec.icon)
        );
    }

    /** The viewer marks a lone section whose title would repeat the page name the
     *  layout already shows (finalFormViewer/sectionTitleRepeat.js): 'always' when
     *  the name is on screen at every width, 'wide' while the navigation has room
     *  (the rail and the wizard strip drop their labels on a phone). The heading
     *  stays in the page for screen readers and is taken out of sight by CSS. */
    get headClass() {
        const mode = this.sec.titleRepeatsPage;
        return mode === 'always' || mode === 'wide'
            ? `sec-head sec-head-repeat-${mode}`
            : 'sec-head';
    }

    get headerIcon() {
        return this.sec.icon || null;
    }

    // ---- collapsible (legacy parity — initial state from the spec) ----

    /** Design-level "Section headers: Hide" (--c-sec-head-display: none).
     *  Read from computed style — the token rides the theme bag, so no prop
     *  carries it here. Reactive field + equality guard = one extra render
     *  at most, never a loop. */
    headersHidden = false;

    renderedCallback() {
        if (this.isRepeat) {
            this._placeRepeatFocus();
        }
        const hidden =
            getComputedStyle(this.template.host)
                .getPropertyValue('--c-sec-head-display')
                .trim() === 'none';
        if (hidden !== this.headersHidden) {
            this.headersHidden = hidden;
        }
    }

    get isCollapsible() {
        // headersHidden kills collapsibility outright (reviewer blocker B1,
        // 2026-07-31): the ONLY expander lives inside the display:none
        // header, so a defaultCollapsed section became a permanently
        // unreachable grey bar — required questions and all. Hidden headers
        // render their body expanded, exactly what the IMPL_PLAN promised.
        return (
            Boolean(this.sec.collapsible) &&
            this.hasHeader &&
            !this.headersHidden
        );
    }

    /** Re-init when a DIFFERENT section arrives (id change), never on
     *  re-renders of the same one — the visitor's fold state survives.
     *  One exception: a blocked click that found a red question in here
     *  (`unfoldRequest`) opens it, once per click, so every question the
     *  count by the button names can be seen. */
    get collapsed() {
        if (this._collapseInitFor !== this.sec.id) {
            this._collapseInitFor = this.sec.id;
            this._collapsed = Boolean(
                this.sec.collapsible && this.sec.defaultCollapsed
            );
        }
        const n = this.sec.unfoldRequest;
        const key = `${n}:${this.sec.id}`;
        if (n && !unfoldDone.has(key)) {
            unfoldDone.add(key);
            this._collapsed = false;
        }
        return this._collapsed;
    }

    get showBody() {
        return !this.isCollapsible || !this.collapsed;
    }

    get chevronIcon() {
        return this.collapsed ? 'utility:chevronright' : 'utility:chevrondown';
    }

    get toggleExpanded() {
        return String(!this.collapsed);
    }

    handleToggleCollapse() {
        // touch the getter first so init has run for this section
        const now = this.collapsed;
        this._collapsed = !now;
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately).
     *  Repeat entries fold their instanced answers into the section's ONE
     *  consolidated value instead. */
    handleValueChange(event) {
        if (this.isRepeat) {
            const { elementId, value } = event.detail;
            const at = elementId.lastIndexOf('::');
            if (at > 0) {
                const elId = elementId.slice(0, at);
                const key = elementId.slice(at + 2);
                const values = this._entryValues[key] || {};
                values[elId] = value;
                this._entryValues[key] = values;
                this._dispatchRepeat({ kind: 'answer', key, elementId: elId });
                return;
            }
        }
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }

    /**
     * Preview-click sync (P3): announce which element was clicked. COMPOSED
     * deliberately — this is the one hop-free event, because synthetic
     * shadow RETARGETS composedPath, so the viewer can never resolve the
     * clicked element from its own listener; only this component sees it.
     * Inert unless an authoring viewer upstream chooses to listen.
     */
    handleElementClick(event) {
        this.dispatchEvent(
            new CustomEvent('elementclick', {
                bubbles: true,
                composed: true,
                detail: { elementId: event.currentTarget.dataset.elId }
            })
        );
    }
}
