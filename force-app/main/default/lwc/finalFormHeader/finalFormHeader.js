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
     * Surface composition (owner ruling 2026-07-07): the FILL paints UNDER the
     * banner image (background-color, always the bottom layer) and the image
     * carries its own opacity — emulated by a fill-tinted color-mix veil OVER
     * the image, so fading the image blends it into the fill. The old render
     * painted an opaque --c-header-bg veil on top, wiping the image out.
     * Minimal drops the surface entirely (no fill, no image).
     */
    get surfaceStyle() {
        const img = this.hdr.bgImage && this.hdr.bgImage.url;
        if (this.hdr.style === 'minimal' || !img) {
            return '';
        }
        const url = String(img).replace(/"/g, '%22');
        const raw = Number(this.hdr.bgImage.opacity);
        const opacity = Number.isFinite(raw)
            ? Math.min(Math.max(raw, 0), 100)
            : 100;
        const veil = `color-mix(in srgb, var(--c-header-bg) ${100 - opacity}%, transparent)`;
        return (
            `background-image: linear-gradient(${veil}, ${veil}), url("${url}");` +
            ' background-size: auto, cover;' +
            ' background-position: center, center;'
        );
    }

    get showBranding() {
        // minimal = the compact lockup (legacy formDesigner port): title +
        // description + highlight only — no brand row, no surface.
        return this.arrangement !== 'textOnly' && this.hdr.style !== 'minimal';
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
