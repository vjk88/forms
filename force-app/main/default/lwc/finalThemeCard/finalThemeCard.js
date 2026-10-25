import { LightningElement, api } from 'lwc';
import { getBuiltinTheme, getBrandCopy } from 'c/finalThemeCatalog';
import { resolveTokens, tokensToStyle, fontManifest } from 'c/finalThemeEngine';
import { localizeAssetUrls } from 'c/finalThemeAssets';
import { ensureFontRefs } from 'c/finalFontBundle';

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
    /**
     * A custom theme's own recipe (Theme_Definition__c JSON, parsed). When
     * set it wins over the built-in lookup, so a brand theme previews as
     * itself, not as its base theme.
     */
    @api themeProps;
    @api label;
    @api description;
    /** The layout picked in step 1 — drives the mock's SHAPE. */
    @api layout = 'scroll';
    /** splitHero pane flow ('oneAtATime' → conversational shape). */
    @api paneFlow;
    @api selected = false;

    get _theme() {
        if (this.themeProps && typeof this.themeProps === 'object') {
            return this.themeProps;
        }
        return getBuiltinTheme(this.themeKey) || {};
    }

    renderedCallback() {
        // a theme on bundled or uploaded fonts previews in them (DEFERRED 42);
        // registration is idempotent and loads only what the theme uses
        try {
            ensureFontRefs(fontManifest(this._theme, null));
        } catch {
            // a broken recipe still renders the card in fallback fonts
        }
    }

    get _pal() {
        return this._theme.palette || {};
    }

    /** Every --c-* the mock reads, as an inline style string. */
    get tokenStyle() {
        try {
            return tokensToStyle(localizeAssetUrls(resolveTokens(this._theme)));
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
