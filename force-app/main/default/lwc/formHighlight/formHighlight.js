import { LightningElement, api } from 'lwc';

/**
 * c/formHighlight — the form-header highlight banner (e.g. "Closes Friday —
 * submit early!"). Shared across every layout shell so the banner is identical
 * everywhere; each shell only decides WHERE to place it. Renders nothing when
 * there's no message. Token-styled (no raw hex) so it restyles per theme/skin.
 */
export default class FormHighlight extends LightningElement {
    @api message;
    // 'banner' → white-translucent chip for use inside a dark hero header/rail;
    // default (accent) chip for a normal light header.
    @api variant;

    get hasMessage() {
        return !!(this.message && String(this.message).trim());
    }
    get badgeClass() {
        return this.variant === 'banner' ? 'fh-badge fh-on-banner' : 'fh-badge';
    }
}
