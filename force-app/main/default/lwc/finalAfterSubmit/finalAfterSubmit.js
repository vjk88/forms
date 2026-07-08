import { LightningElement, api } from 'lwc';

/**
 * finalAfterSubmit — the post-submit render (owner FormBuilder port, 2026-07-09).
 *
 * Two variants off `spec.afterSubmit.mode`:
 * - screen: thank-you card — rich-text message, optional action button,
 *   optional auto-redirect countdown pill.
 * - toast:  success bar + "redirecting…" line, no screen.
 *
 * DISPLAY ONLY: the countdown never ticks and nothing navigates here — the
 * P3 submit engine executes redirects and handles the `continue` intent.
 * Until then the same render doubles as the Design-mode preview.
 */

const DEFAULT_MESSAGE = '<p>Thank you! Your response has been recorded.</p>';

const DEST_LABELS = {
    record: 'the new / updated record',
    url: 'the custom URL'
};

export default class FinalAfterSubmit extends LightningElement {
    @api config;
    /** Bleed layouts dropped the panel surface — paint our own card. */
    @api bleed = false;

    get cfg() {
        return this.config || {};
    }

    get isToast() {
        return this.cfg.mode === 'toast';
    }

    get message() {
        return this.cfg.message || DEFAULT_MESSAGE;
    }

    get showButton() {
        // default ON (FormBuilder parity) — explicit false hides
        return this.cfg.actionButton !== false;
    }

    get buttonLabel() {
        return this.cfg.buttonLabel || 'Continue';
    }

    get showRedirect() {
        return Boolean(this.cfg.autoRedirect);
    }

    get redirectDest() {
        return DEST_LABELS[this.cfg.redirectTo] || DEST_LABELS.record;
    }

    get redirectDelay() {
        const n = Number(this.cfg.redirectDelay);
        return Number.isFinite(n) && n >= 0 ? n : 5;
    }

    get redirectPill() {
        return `Redirecting to ${this.redirectDest} in ${this.redirectDelay} seconds…`;
    }

    get toastRedirectLine() {
        return `Redirecting respondent to ${this.redirectDest}…`;
    }

    get wrapClass() {
        return this.bleed ? 'wrap wrap--card' : 'wrap';
    }

    handleContinue() {
        // Navigation intent for the P3 engine; inert in Design preview.
        this.dispatchEvent(
            new CustomEvent('continue', {
                detail: {
                    goesTo: this.cfg.buttonGoesTo || 'record',
                    url: this.cfg.buttonUrl || null
                }
            })
        );
    }
}
