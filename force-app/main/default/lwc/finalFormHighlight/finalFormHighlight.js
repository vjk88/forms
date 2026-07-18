import { LightningElement, api } from 'lwc';

/**
 * finalFormHighlight — the announcement banner (catalog §3).
 *
 * Owns message / variant / icon; composed by finalFormHeader and
 * finalNavSplitHero's brand pane, never re-owned by its hosts.
 * NOTE: only `text` (and `placement`, splitHero) have Design-panel writers;
 * variant/icon are DORMANT vocabulary — renderer-only until a control exists
 * (kept as the future "highlight tone" candidate, sweep KEEP ruling).
 * `dismissible` was deleted 2026-07-18 (sweep DELETE ruling: guest-side
 * dismiss state with no persistence story). Default render = the 'badge' pill.
 */
export default class FinalFormHighlight extends LightningElement {
    /** Spec `header.highlight`: { text, variant, icon } */
    @api highlight;

    get show() {
        return Boolean(this.highlight && this.highlight.text);
    }

    get rootClass() {
        const variant = ['badge', 'banner', 'inline'].includes(
            (this.highlight && this.highlight.variant) || ''
        )
            ? this.highlight.variant
            : 'badge';
        return `hl hl-${variant}`;
    }

    get iconName() {
        return this.highlight && this.highlight.icon
            ? `utility:${this.highlight.icon}`
            : null;
    }
}
