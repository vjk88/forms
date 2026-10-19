import { LightningElement, api, track } from 'lwc';
import { listGalleryThemes } from 'c/finalThemeCatalog';

/**
 * finalThemeGallery — the "Pick a theme" step (ported from formStudio's
 * formCreationGallery theme step). A grid of finalThemeCard for the gallery
 * themes; the category filter pills went with the catalog cut (nine cards fit
 * on one screen, IMPL_PLAN_THEME_CATALOG_CUT P2).
 *
 * The `layout` picked in step 1 drives every card's preview SHAPE — so all
 * themes preview in the layout you chose (owner request), not the theme's own
 * affinity. A "Preview in" switcher lets you re-preview the roster in any
 * layout without leaving the step.
 *
 * Emits `themeselect` { themeKey }.
 */

// "Preview in" chips — the 8 step-1 choices (7 layouts + splitHero's
// Conversational pane-flow variant, keyed `layout:paneFlow`).
const LAYOUTS = [
    { value: 'scroll', label: 'Scroll' },
    { value: 'stepper', label: 'Stepper' },
    { value: 'tabs', label: 'Tabs' },
    { value: 'accordion', label: 'Accordion' },
    { value: 'rail', label: 'Rail' },
    { value: 'oneAtATime', label: 'One at a time' },
    { value: 'splitHero', label: 'Split hero' },
    { value: 'splitHero:oneAtATime', label: 'Split · One at a time' }
];

function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default class FinalThemeGallery extends LightningElement {
    /** Layout picked in step 1 — the default preview shape. */
    @api layout = 'scroll';
    /** splitHero pane flow picked in step 1 ('oneAtATime' → conversational). */
    @api paneFlow = '';
    @api selectedThemeKey = '';

    @track _previewKey = '';
    /** Local pick (an @api prop must not be reassigned); wins over the prop. */
    @track _pickedThemeKey = '';

    get previewKey() {
        if (this._previewKey) {
            return this._previewKey;
        }
        const base = this.layout || 'scroll';
        return this.paneFlow ? `${base}:${this.paneFlow}` : base;
    }
    get previewLayout() {
        return this.previewKey.split(':')[0];
    }
    get previewPaneFlow() {
        return this.previewKey.split(':')[1] || '';
    }

    get layoutChips() {
        return LAYOUTS.map((l) => ({
            ...l,
            cls: this.previewKey === l.value ? 'lchip is-on' : 'lchip'
        }));
    }

    get cards() {
        const sel = this._pickedThemeKey || this.selectedThemeKey;
        return listGalleryThemes().map((t) => ({
            key: t.key,
            label: t.name,
            description: (t.tags || []).map(cap).join(' · '),
            selected: t.key === sel
        }));
    }

    handleLayout(e) {
        this._previewKey = e.currentTarget.dataset.value;
    }

    handleSelect(e) {
        this._pickedThemeKey = e.detail.themeKey;
        this.dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: e.detail.themeKey }
            })
        );
    }
}
