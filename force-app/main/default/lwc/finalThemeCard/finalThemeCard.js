import { LightningElement, api } from 'lwc';
import { getBuiltinTheme, getBrandCopy } from 'c/finalThemeCatalog';
import { resolveTokens, tokensToStyle } from 'c/finalThemeEngine';

/**
 * finalThemeCard — one theme preview card (ported from formStudio's formThemeCard).
 *
 * The preview is a lightweight CSS mock driven ENTIRELY by the theme's resolved
 * `--c-*` tokens (no live form engine per card). Unlike the old build, the mock's
 * SHAPE follows the `layout` handed in by the gallery (the step-1 choice), not the
 * theme's own affinity — EVERY layout gets its own distinct shape (owner
 * 2026-07-05: 7 layouts ≠ 3 shapes), plus splitHero's Conversational pane-flow
 * variant. Brand copy is the shared catalog personality (getBrandCopy). Logo
 * emblem + font pairing are intentionally dropped (owner).
 */

/** Final layout (+ splitHero paneFlow) → the mock shape the card draws. */
function mockShape(layout, paneFlow) {
    if (layout === 'splitHero') {
        return paneFlow === 'oneAtATime' ? 'splitOne' : 'split';
    }
    if (layout === 'stepper') return 'stepped';
    if (layout === 'tabs') return 'tabs';
    if (layout === 'accordion') return 'accordion';
    if (layout === 'rail') return 'rail';
    if (layout === 'oneAtATime') return 'single';
    return 'classic'; // scroll + unknown
}

export default class FinalThemeCard extends LightningElement {
    @api themeKey;
    @api label;
    @api description;
    /** The layout picked in step 1 — drives the mock's SHAPE. */
    @api layout = 'scroll';
    /** splitHero pane flow ('oneAtATime' → conversational shape). */
    @api paneFlow;
    @api selected = false;

    get _theme() {
        return getBuiltinTheme(this.themeKey) || {};
    }

    get _pal() {
        return this._theme.palette || {};
    }

    /** Every --c-* the mock reads, as an inline style string. */
    get tokenStyle() {
        try {
            return tokensToStyle(resolveTokens(this._theme));
        } catch {
            return '';
        }
    }

    get shape() {
        return mockShape(this.layout, this.paneFlow);
    }
    get isSplit() {
        return this.shape === 'split';
    }
    get isSplitOne() {
        return this.shape === 'splitOne';
    }
    get isStepped() {
        return this.shape === 'stepped';
    }
    get isTabs() {
        return this.shape === 'tabs';
    }
    get isAccordion() {
        return this.shape === 'accordion';
    }
    get isRail() {
        return this.shape === 'rail';
    }
    get isSingle() {
        return this.shape === 'single';
    }

    get hasBanner() {
        const h = this._pal.headerBg;
        return Boolean(h) && h !== 'transparent' && h !== 'none';
    }

    get brand() {
        return getBrandCopy(this.themeKey);
    }

    get swatches() {
        const p = this._pal;
        return [
            ['Accent', p.accent],
            ['Surface', p.contentBg],
            ['Page', p.pageBg],
            ['Text', p.text]
        ].map(([name, val], i) => ({
            key: `${name}-${i}`,
            name,
            style: `background:${val || '#cccccc'};`
        }));
    }

    get rootClass() {
        return this.selected ? 'tc is-on' : 'tc';
    }
    get pressed() {
        return this.selected ? 'true' : 'false';
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('select', { detail: { themeKey: this.themeKey } })
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
