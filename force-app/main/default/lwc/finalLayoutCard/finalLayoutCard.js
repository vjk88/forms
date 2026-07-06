import { LightningElement, api } from 'lwc';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import { resolveTokens, tokensToStyle } from 'c/finalThemeEngine';

/**
 * finalLayoutCard — one layout choice in the creation flow's step 1.
 *
 * The preview is a layoutThumb-style structural mini-mockup (ported from the
 * old build's c/layoutThumb — the picker treatment FormStudio's gallery uses),
 * tinted by a representative builtin theme's `--c-*` tokens so the grid reads
 * as a varied gallery, not eight gray-bar clones (owner 2026-07-05). The REAL
 * theme choice is still step 2 — the tint here is just presentation.
 *
 * `paneFlow="oneAtATime"` renders splitHero's conversational variant card —
 * a presentation option on the same primitive (catalog §2), NOT a new layout.
 * Emits `select` { layout, paneFlow } on click/keyboard.
 */

const META = {
    scroll: { label: 'Continuous scroll', hint: 'Every section on one page.' },
    stepper: { label: 'Wizard steps', hint: 'Guided, step by step.' },
    tabs: { label: 'Tabbed pages', hint: 'Pages shown as tabs.' },
    accordion: { label: 'Accordion', hint: 'Collapsible panels.' },
    rail: { label: 'Side rail', hint: 'Navigation down the side.' },
    oneAtATime: { label: 'One at a time', hint: 'One question per screen.' },
    splitHero: { label: 'Split hero', hint: 'Brand panel beside the form.' }
};
const SPLIT_ONE_META = {
    label: 'Split hero · Conversational',
    hint: 'Brand panel, one question at a time.'
};

export default class FinalLayoutCard extends LightningElement {
    @api layout;
    /** 'oneAtATime' → the splitHero conversational variant card. */
    @api paneFlow;
    /** Representative builtin theme tinting THIS card's mockup. */
    @api themeKey;
    /** Display copy overrides — the gallery's grouped roster owns the words. */
    @api label;
    @api description;
    @api selected = false;

    get isSplitOne() {
        return this.layout === 'splitHero' && this.paneFlow === 'oneAtATime';
    }
    get meta() {
        const fallback = this.isSplitOne
            ? SPLIT_ONE_META
            : META[this.layout] || { label: this.layout, hint: '' };
        return {
            label: this.label || fallback.label,
            hint: this.description || fallback.hint
        };
    }
    get rootClass() {
        return this.selected ? 'lc is-on' : 'lc';
    }
    get pressed() {
        return this.selected ? 'true' : 'false';
    }

    /** The mockup rides the representative theme's full token contract. */
    get tokenStyle() {
        try {
            return tokensToStyle(resolveTokens(getBuiltinTheme(this.themeKey)));
        } catch {
            return '';
        }
    }

    get isScroll() {
        return this.layout === 'scroll';
    }
    get isStepper() {
        return this.layout === 'stepper';
    }
    get isTabs() {
        return this.layout === 'tabs';
    }
    get isAccordion() {
        return this.layout === 'accordion';
    }
    get isRail() {
        return this.layout === 'rail';
    }
    get isOneAtATime() {
        return this.layout === 'oneAtATime';
    }
    get isSplit() {
        return this.layout === 'splitHero' && !this.isSplitOne;
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('select', {
                detail: { layout: this.layout, paneFlow: this.paneFlow }
            })
        );
    }
    handleClick() {
        this._emit();
    }
    handleKey(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._emit();
        }
    }
}
