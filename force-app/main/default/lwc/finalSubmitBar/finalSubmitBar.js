import { LightningElement, api } from 'lwc';

/**
 * finalSubmitBar — THE one button implementation (catalog §1).
 *
 * Paginated nav primitives never render their own Next/Back/Submit — they host
 * this bar in a slot and receive its intents as the §2 contract events
 * (`back` / `next` / `submit`, dispatched here, composed=false bubbles=false —
 * the host listens directly on the element).
 *
 * `submitting` and `blockedMessage` are DATA, engine-set (catalog: UIUX review #3):
 * submitting disables everything + spins the primary (double-submit structurally
 * impossible); blockedMessage renders in a persistent aria-live="polite" row.
 */

const ALIGN_CLASS = {
    left: 'align-left',
    center: 'align-center',
    right: 'align-right',
    stretch: 'align-stretch'
};

export default class FinalSubmitBar extends LightningElement {
    /** Spec `submit` block: { label, alignment, placement, nextLabel, backLabel } */
    @api config;
    /** Which buttons this nav context shows. Scroll = submit only (the default). */
    @api showBack = false;
    @api showNext = false;
    @api showSubmit = false;
    /** Engine-set while a submit is in flight. */
    @api submitting = false;
    /** Engine-set while Next/Submit is blocked by invalid fields; '' when clear. */
    @api blockedMessage = '';

    get cfg() {
        return this.config || {};
    }

    get rootClass() {
        const align = ALIGN_CLASS[this.cfg.alignment] || ALIGN_CLASS.right;
        const sticky = this.cfg.placement === 'sticky' ? ' sticky' : '';
        return `bar ${align}${sticky}`;
    }

    get submitLabel() {
        return this.cfg.label || 'Submit';
    }

    get nextLabel() {
        // One-at-a-Time contexts default the advance label to "Continue" via
        // their own config; the bar's fallback stays "Next" (catalog §2).
        return this.cfg.nextLabel || 'Next';
    }

    get backLabel() {
        return this.cfg.backLabel || 'Back';
    }

    get primaryClass() {
        return this.submitting ? 'btn primary busy' : 'btn primary';
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    handleNext() {
        this.dispatchEvent(new CustomEvent('next'));
    }

    handleSubmit() {
        this.dispatchEvent(new CustomEvent('submit'));
    }
}
