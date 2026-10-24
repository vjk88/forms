import { LightningElement, api } from 'lwc';
import { bannerLayerStyle } from 'c/finalThemeEngine';

/**
 * finalFormHeader — the header lockup (catalog §1, owner header model 2026-07-05).
 *
 * Lockup = branding (logo image, else Brand Name typeset as a wordmark in
 * --c-font-display) + title + description + highlight (composed finalFormHighlight).
 * Surface = the fill (--c-header-bg + --c-header-bg-gradient, each already at
 * Fill opacity from the engine) on the box, with `header.bgImage` on its own
 * layer above the fill and behind the content, at real CSS opacity.
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

    /**
     * Flush mode (One at a time, open page): a progress strip follows the lockup
     * directly, so the lockup gives up its bottom margin and lines its text up on
     * the strip's side inset instead of stacking two paddings (about 60px of dead
     * air between the description and the bar before this).
     */
    @api flush = false;

    get hdr() {
        return this.header || {};
    }

    get arrangement() {
        return ARRANGEMENTS.has(this.hdr.arrangement)
            ? this.hdr.arrangement
            : 'stacked';
    }

    get rootClass() {
        // 'minimal' deleted 2026-07-18 (owner ruling — its background:none
        // silently ate the Fill); legacy specs render standard.
        const flush = this.flush ? ' hdr--flush' : '';
        return `hdr style-standard ${ARRANGEMENT_CLASS[this.arrangement]}${flush}`;
    }

    /**
     * Surface composition (owner ruling 2026-07-07, fixed 2026-10-18): the FILL
     * paints on the box (CSS), the banner on its own layer over it with real
     * opacity — so fading the image reveals the fill. See bannerLayerStyle.
     */
    get bannerStyle() {
        return bannerLayerStyle(this.hdr.bgImage);
    }

    /**
     * A form's own banner REPLACES the theme's header photo (PR 396 review):
     * a faded banner over the photo would read as a double exposure.
     */
    get rootStyle() {
        return this.bannerStyle ? '--c-header-bg-image: none;' : null;
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
        return (
            this.showBranding && !this.logoUrl && Boolean(this.hdr.brandName)
        );
    }

    /** Brand name is rich text; alt text must be plain. */
    get logoAlt() {
        const plain = String(this.hdr.brandName || '')
            .replace(/<[^>]+>/g, '')
            .trim();
        return plain || 'Logo';
    }

    get highlight() {
        return this.hdr.highlight;
    }
}
