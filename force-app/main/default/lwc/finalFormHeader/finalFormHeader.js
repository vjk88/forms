import { LightningElement, api } from 'lwc';

/**
 * finalFormHeader — the header lockup (catalog §1, owner header model 2026-07-05).
 *
 * Lockup = branding (logo image, else Brand Name typeset as a wordmark in
 * --c-font-display) + title + description + highlight (composed finalFormHighlight).
 * Surface = the background trio: `header.bgImage` painted at the BOTTOM, with the
 * theme's --c-header-bg as the color veil layered OVER it (the engine composes
 * headerBg + headerBgOpacity into that token's rgba — no opacity keys here).
 *
 * Renders ONCE per form, on every page/step (BUILD_PHASES checklist item 2).
 * Hero features live exclusively in navSplitHero's brand pane — not here.
 */

const ARRANGEMENTS = new Set([
    'stacked',
    'logoBeside',
    'textOnly',
    'inline',
    'centered'
]);

const ARRANGEMENT_CLASS = {
    stacked: 'arr-stacked',
    logoBeside: 'arr-logo-beside',
    textOnly: 'arr-text-only',
    inline: 'arr-inline',
    centered: 'arr-centered'
};

export default class FinalFormHeader extends LightningElement {
    /** Spec `header` block (FORM_SPEC_SCHEMA §3). `style: "none"` is the host's job to not render. */
    @api header;

    get hdr() {
        return this.header || {};
    }

    get arrangement() {
        return ARRANGEMENTS.has(this.hdr.arrangement)
            ? this.hdr.arrangement
            : 'stacked';
    }

    get rootClass() {
        const style = this.hdr.style === 'minimal' ? 'minimal' : 'standard';
        return `hdr style-${style} ${ARRANGEMENT_CLASS[this.arrangement]}`;
    }

    /**
     * Minimal style drops the surface (no fill, no image); standard paints the
     * veil over the image: first background layer (topmost) is a flat gradient
     * of --c-header-bg, the image sits beneath it.
     */
    get surfaceStyle() {
        const img = this.hdr.bgImage && this.hdr.bgImage.url;
        if (this.hdr.style === 'minimal' || !img) {
            return '';
        }
        const url = String(img).replace(/"/g, '%22');
        return (
            'background-image: linear-gradient(var(--c-header-bg), var(--c-header-bg)),' +
            ` url("${url}"); background-size: cover; background-position: center;`
        );
    }

    get showBranding() {
        return this.arrangement !== 'textOnly';
    }

    get logoUrl() {
        return (this.hdr.logo && this.hdr.logo.url) || null;
    }

    /** Logo wins over Brand Name when both are set (owner 2026-07-04). */
    get showLogo() {
        return this.showBranding && Boolean(this.logoUrl);
    }

    get showWordmark() {
        return this.showBranding && !this.logoUrl && Boolean(this.hdr.brandName);
    }

    get logoAlt() {
        return this.hdr.brandName || 'Logo';
    }

    get highlight() {
        return this.hdr.highlight;
    }
}
