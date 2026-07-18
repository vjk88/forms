import { LightningElement, api } from 'lwc';

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

/** Elements that always span the full grid regardless of width. */
const FULL_WIDTH_TYPES = new Set(['divider', 'spacer']);

const PAD_SCALE = {
    none: '0',
    sm: 'var(--c-space-3)',
    md: 'var(--c-section-pad)',
    lg: 'var(--c-space-6)'
};

export default class FinalSectionRenderer extends LightningElement {
    _collapsed = false;
    _collapseInitFor = null;

    @api section;

    get sec() {
        return this.section || {};
    }

    get sectionClass() {
        const style = (this.sec.style || 'card').toLowerCase();
        return `section style-${KNOWN_STYLES.includes(style) ? style : 'card'}`;
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

    /** Entry keys are LOCAL state (reactive); values live off-render. The
     *  consolidated answer rides the ordinary valuechange chain as
     *  elementId `repeat:{sectionId}` → the §8 entries array — no new
     *  event plumbing through the seven navs. */
    entryKeys = null;
    _entrySeq = 0;
    _entryValues = {};

    get isRepeat() {
        return Boolean(this.sec.repeat);
    }

    get repeatCfg() {
        return this.sec.repeat || {};
    }

    get minEntries() {
        return Math.max(Number(this.repeatCfg.min) || 1, 1);
    }

    _currentKeys() {
        if (!this.entryKeys) {
            const keys = [];
            for (let i = 0; i < this.minEntries; i++) {
                keys.push(`en_${i}`);
            }
            this._entrySeq = this.minEntries;
            return keys;
        }
        return this.entryKeys;
    }

    get repeatEntries() {
        const keys = this._currentKeys();
        const template = this.repeatCfg.entryLabel || 'Entry {index}';
        const canRemove = keys.length > this.minEntries;
        return keys.map((key, i) => ({
            key,
            label: template.replace('{index}', String(i + 1)),
            canRemove,
            elements: this._gridFor(this.sec.elements, key)
        }));
    }

    get showAdd() {
        const max = Number(this.repeatCfg.max);
        return !(max > 0 && this._currentKeys().length >= max);
    }

    get addLabel() {
        return this.repeatCfg.addLabel || 'Add another';
    }

    get removeTitle() {
        return this.repeatCfg.removeLabel || 'Remove';
    }

    handleAddEntry() {
        this.entryKeys = [...this._currentKeys(), `en_${this._entrySeq++}`];
        this._dispatchRepeat();
    }

    handleRemoveEntry(event) {
        const key = event.currentTarget.dataset.key;
        this.entryKeys = this._currentKeys().filter((k) => k !== key);
        delete this._entryValues[key];
        this._dispatchRepeat();
    }

    _dispatchRepeat() {
        const entries = this._currentKeys().map(
            (key) => this._entryValues[key] || {}
        );
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: `repeat:${this.sec.id}`, value: entries }
            })
        );
    }

    get hasHeader() {
        return (
            this.sec.showHeader !== false &&
            Boolean(this.sec.title || this.sec.description || this.sec.icon)
        );
    }

    get headerIcon() {
        return this.sec.icon || null;
    }

    // ---- collapsible (legacy parity — initial state from the spec) ----

    get isCollapsible() {
        return Boolean(this.sec.collapsible) && this.hasHeader;
    }

    /** Re-init when a DIFFERENT section arrives (id change), never on
     *  re-renders of the same one — the visitor's fold state survives. */
    get collapsed() {
        if (this._collapseInitFor !== this.sec.id) {
            this._collapseInitFor = this.sec.id;
            this._collapsed = Boolean(
                this.sec.collapsible && this.sec.defaultCollapsed
            );
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
                this._dispatchRepeat();
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
