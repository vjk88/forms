import { LightningElement, api } from 'lwc';

/**
 * finalGalleryPicker — the Design panel's "Change…" popup: ONE fixed-overlay
 * shell for both galleries (owner 2026-07-08: theme and layout open the same
 * gallery pages the creation flow uses). `mode` picks the roster:
 *   theme  → c/finalThemeGallery (built-ins, previewed in the CURRENT layout)
 *            plus the org's custom themes as base-theme-tinted cards.
 *   layout → the creation flow's grouped layout roster as c/finalLayoutCard
 *            tiles (card copy falls back to the cards' own META hints —
 *            "start from scratch" wording would lie here).
 *
 * Picking never mutates a spec: emits `themepick` { value } ('key' |
 * 'custom:<id>' — the panel's composite form) or `layoutpick` { layout,
 * paneFlow }; the PANEL owns the switch (override confirm gate, layout-option
 * reconciliation). `close` on scrim / X / Escape.
 */

// The 8 gallery choices in the creation flow's 3 groups (finalCreationGallery
// keeps its LAYOUT_GROUPS module-private — keep the rosters in step when a
// layout lands). Conversational = splitHero + layout.options.paneFlow.
const LAYOUT_GROUPS = [
    {
        id: 'continuous',
        title: 'Continuous flow',
        hint: 'One page, scrolls top to bottom',
        cards: [{ layout: 'scroll', themeKey: 'terracotta', name: 'Scroll' }]
    },
    {
        id: 'paginated',
        title: 'Paginated / Nav-driven',
        hint: 'Steps, side panels, one question at a time',
        cards: [
            { layout: 'stepper', themeKey: 'mintStepper', name: 'Stepper' },
            {
                layout: 'splitHero',
                themeKey: 'marbleSplit',
                name: 'Split Hero'
            },
            {
                layout: 'splitHero',
                paneFlow: 'oneAtATime',
                themeKey: 'auraSplit',
                name: 'Split Hero · Conversational'
            },
            { layout: 'rail', themeKey: 'execNav', name: 'Side Nav' },
            {
                layout: 'oneAtATime',
                themeKey: 'lavender',
                name: 'One at a Time'
            }
        ]
    },
    {
        id: 'tabbedAcc',
        title: 'Tabbed & Accordion',
        hint: 'Content grouped into panels',
        cards: [
            { layout: 'tabs', themeKey: 'nordic', name: 'Tabbed' },
            { layout: 'accordion', themeKey: 'sandstone', name: 'Accordion' }
        ]
    }
];

export default class FinalGalleryPicker extends LightningElement {
    /** 'theme' | 'layout' — which roster the shell shows. */
    @api mode = 'theme';
    /** Current layout — selection state (layout mode) + preview shape (theme mode). */
    @api layout = 'scroll';
    /** Current splitHero pane flow ('oneAtATime' | ''). */
    @api paneFlow = '';
    /** Current theme, composite form: builtin key | 'custom:<id>'. */
    @api themeValue = '';
    /** FinalThemeController.listCustomThemes rows: { id, name, baseTheme }. */
    @api customThemes = [];

    _focused = false;

    connectedCallback() {
        // the picker only exists while open, so document-level Esc is safe
        this._onKey = (e) => {
            if (e.key === 'Escape') {
                this._close();
            }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
    }

    renderedCallback() {
        if (!this._focused) {
            this._focused = true;
            const x = this.template.querySelector('lightning-button-icon');
            if (x) {
                x.focus();
            }
        }
    }

    get isTheme() {
        return this.mode === 'theme';
    }

    get isLayout() {
        return this.mode === 'layout';
    }

    get title() {
        return this.isTheme ? 'Pick a theme' : 'Pick a layout';
    }

    get subtitle() {
        return this.isTheme
            ? 'Each preview uses your current layout. Your content stays put.'
            : 'How readers move through your form. Your content stays put.';
    }

    /** Builtin gallery selection — a custom current theme matches no builtin. */
    get builtinSelectedKey() {
        return this.themeValue.startsWith('custom:') ? '' : this.themeValue;
    }

    get customCards() {
        return (this.customThemes || []).map((t) => ({
            id: t.id,
            name: t.name,
            baseTheme: t.baseTheme,
            selected: `custom:${t.id}` === this.themeValue
        }));
    }

    get hasCustomThemes() {
        return this.customCards.length > 0;
    }

    get layoutGroups() {
        const flow = this.paneFlow || '';
        return LAYOUT_GROUPS.map((g) => ({
            id: g.id,
            title: g.title,
            hint: g.hint,
            cards: g.cards.map((c) => ({
                key: c.paneFlow ? `${c.layout}:${c.paneFlow}` : c.layout,
                layout: c.layout,
                paneFlow: c.paneFlow || '',
                themeKey: c.themeKey,
                name: c.name,
                selected:
                    c.layout === this.layout && (c.paneFlow || '') === flow
            }))
        }));
    }

    // ---------------------------------------------------------------- events

    _close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleClose() {
        this._close();
    }

    handleBuiltinTheme(event) {
        this.dispatchEvent(
            new CustomEvent('themepick', {
                detail: { value: event.detail.themeKey }
            })
        );
    }

    /** finalThemeCard reports its (base) themeKey — the record id rides data-id. */
    handleCustomTheme(event) {
        this.dispatchEvent(
            new CustomEvent('themepick', {
                detail: { value: `custom:${event.currentTarget.dataset.id}` }
            })
        );
    }

    handleLayout(event) {
        this.dispatchEvent(
            new CustomEvent('layoutpick', {
                detail: {
                    layout: event.detail.layout,
                    paneFlow: event.detail.paneFlow || ''
                }
            })
        );
    }
}
