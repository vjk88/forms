import { LightningElement, api } from 'lwc';
import { bannerLayerStyle } from 'c/finalThemeEngine';
import { watchTextFade } from 'c/finalTextFade';

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

    /**
     * The header text fade (IMPL_PLAN_HEADER_FADE), decided by the viewer from
     * the resolved tokens: `{ on, eligible, exposed }`. Eligible = the theme
     * engine works out a text plate for this surface; on = paint the wash
     * (fitted to the words by c/finalTextFade); exposed = the header sits
     * straight on the One at a time page, so its top and bottom edges soften
     * too (that room is kept with the switch Off). Absent: nothing new.
     */
    @api fade;

    _fadeWatch = null;

    renderedCallback() {
        if (!this.showFade) {
            // switched off (or no plate): nothing to fit, stop watching
            this.disconnectedCallback();
            return;
        }
        if (!this._fadeWatch) {
            this._fadeWatch = watchTextFade({
                surface: () => this.template.querySelector('header.hdr'),
                layer: () => this.template.querySelector('.hdr-fade'),
                blocks: () => this._fadeBlocks()
            });
        }
        this._fadeWatch.measure();
    }

    disconnectedCallback() {
        if (this._fadeWatch) {
            this._fadeWatch.disconnect();
            this._fadeWatch = null;
        }
    }

    /** What the wash protects: the brand name, title and description by
     *  their glyphs, a badge or inline highlight by its box. A banner bar
     *  paints its own fill and is left out. */
    _fadeBlocks() {
        const q = (s) => this.template.querySelector(s);
        const blocks = [
            { el: q('.brand-wordmark'), text: true },
            { el: q('.hdr-title'), text: true },
            { el: q('.hdr-desc'), text: true }
        ];
        const hl = q('.hdr-highlight');
        if (hl && !hl.classList.contains('hdr-highlight--bar')) {
            blocks.push({ el: hl, text: false });
        }
        return blocks.filter((b) => b.el);
    }

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
        // a form's own banner photo: the text reads its banner plate and
        // colours (IMPL_PLAN_TEXT_CONTRAST, header)
        const banner = this.bannerStyle ? ' has-banner' : '';
        const f = this.fade || {};
        const fade = f.eligible && f.exposed ? ' hdr--exposed' : '';
        return `hdr style-standard ${ARRANGEMENT_CLASS[this.arrangement]}${flush}${banner}${fade}`;
    }

    /** The wash itself: only where a plate is due and the switch is on. */
    get showFade() {
        const f = this.fade || {};
        return Boolean(f.eligible && f.on);
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

    /** A banner bar paints its own fill, so the wash leaves it out. */
    get highlightClass() {
        const h = this.highlight;
        return h && h.variant === 'banner'
            ? 'hdr-highlight hdr-highlight--bar'
            : 'hdr-highlight';
    }
}
