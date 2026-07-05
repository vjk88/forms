import { LightningElement, api, track } from 'lwc';
import { listBuiltinThemes } from 'c/finalThemeCatalog';

/**
 * finalThemeGallery — the "Pick a theme" step (ported from formStudio's
 * formCreationGallery theme step). Filter pills + a grid of finalThemeCard.
 *
 * The `layout` picked in step 1 drives every card's preview SHAPE — so all
 * themes preview in the layout you chose (owner request), not the theme's own
 * affinity. A "Preview in" switcher lets you re-preview the roster in any
 * layout without leaving the step.
 *
 * Emits `themeselect` { themeKey }.
 */

const FILTERS = [
    { value: '', label: 'All' },
    { value: 'minimalist', label: 'Minimalist' },
    { value: 'creative', label: 'Creative' },
    { value: 'editorial', label: 'Editorial' },
    { value: 'dark', label: 'Dark' },
    { value: 'bgimage', label: 'Background image' },
    { value: 'stepped', label: 'Stepper' },
    { value: 'split', label: 'Split' }
];

const LAYOUTS = [
    { value: 'scroll', label: 'Scroll' },
    { value: 'stepper', label: 'Stepper' },
    { value: 'tabs', label: 'Tabs' },
    { value: 'accordion', label: 'Accordion' },
    { value: 'rail', label: 'Rail' },
    { value: 'oneAtATime', label: 'One at a time' },
    { value: 'splitHero', label: 'Split hero' }
];

function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default class FinalThemeGallery extends LightningElement {
    /** Layout picked in step 1 — the default preview shape. */
    @api layout = 'scroll';
    @api selectedThemeKey = '';

    @track _filter = '';
    @track _previewLayout = '';

    get previewLayout() {
        return this._previewLayout || this.layout || 'scroll';
    }

    get filterPills() {
        return FILTERS.map((f) => ({
            ...f,
            cls: this._filter === f.value ? 'pill is-on' : 'pill'
        }));
    }

    get layoutChips() {
        return LAYOUTS.map((l) => ({
            ...l,
            cls: this.previewLayout === l.value ? 'lchip is-on' : 'lchip'
        }));
    }

    get cards() {
        const sel = this.selectedThemeKey;
        return listBuiltinThemes()
            .filter((t) => !this._filter || (t.tags || []).includes(this._filter))
            .map((t) => ({
                key: t.key,
                label: t.name,
                description: (t.tags || []).map(cap).join(' · '),
                selected: t.key === sel
            }));
    }

    handleFilter(e) {
        this._filter = e.currentTarget.dataset.value || '';
    }

    handleLayout(e) {
        this._previewLayout = e.currentTarget.dataset.value;
    }

    handleSelect(e) {
        this.selectedThemeKey = e.detail.themeKey;
        this.dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: e.detail.themeKey }
            })
        );
    }
}
