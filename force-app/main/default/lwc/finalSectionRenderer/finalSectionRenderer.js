import { LightningElement, api } from 'lwc';

/**
 * finalSectionRenderer — one spec section: header, style treatment, field grid.
 *
 * Surface resolution (ARCH §3.1 rule 5 carve-out + §4.3 cascade):
 * preset class (CSS fallbacks decide) → --c-section-* tokens if the theme sets them
 * → this section's explicit `surface` values (inline style, wins over everything).
 */

const KNOWN_STYLES = ['plain', 'card', 'boxed', 'outline', 'subtle', 'flat'];

const PAD_SCALE = {
    none: '0',
    sm: 'var(--c-space-3)',
    md: 'var(--c-section-pad)',
    lg: 'var(--c-space-6)'
};

export default class FinalSectionRenderer extends LightningElement {
    @api section;

    get sec() {
        return this.section || {};
    }

    get sectionClass() {
        const style = (this.sec.style || 'card').toLowerCase();
        return `section style-${KNOWN_STYLES.includes(style) ? style : 'card'}`;
    }

    get surfaceStyle() {
        const surface = this.sec.surface || {};
        const parts = [];
        if (surface.bg) {
            parts.push(`background: ${surface.bg}`);
        }
        if (surface.border) {
            parts.push(`border: ${surface.border}`);
        }
        if (surface.shadow) {
            parts.push(`box-shadow: ${surface.shadow}`);
        }
        if (surface.padding && PAD_SCALE[surface.padding]) {
            parts.push(`padding: ${PAD_SCALE[surface.padding]}`);
        }
        return parts.join('; ');
    }

    get gridClass() {
        const cols = [1, 2, 3].includes(this.sec.columns)
            ? this.sec.columns
            : 1;
        return `grid cols-${cols}`;
    }

    get elements() {
        return this.sec.elements || [];
    }

    get hasHeader() {
        return Boolean(this.sec.title || this.sec.description);
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
