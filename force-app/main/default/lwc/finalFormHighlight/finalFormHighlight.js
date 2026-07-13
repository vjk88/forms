import { LightningElement, api } from 'lwc';

/**
 * finalFormHighlight — the announcement banner (catalog §3).
 *
 * Owns message / variant / icon / dismissible; composed by finalFormHeader
 * and finalNavSplitHero's brand pane, never re-owned by its hosts.
 * NOTE: only `text` (and `placement`, splitHero) have Design-panel writers;
 * variant/icon/dismissible are DORMANT vocabulary — renderer-only until a
 * control exists. Default render = the 'badge' pill.
 */
export default class FinalFormHighlight extends LightningElement {
    /** Spec `header.highlight`: { text, variant, icon, dismissible } */
    @api highlight;

    dismissed = false;

    get show() {
        return Boolean(
            this.highlight && this.highlight.text && !this.dismissed
        );
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

    get dismissible() {
        return Boolean(this.highlight && this.highlight.dismissible);
    }

    handleDismiss() {
        this.dismissed = true;
    }
}
