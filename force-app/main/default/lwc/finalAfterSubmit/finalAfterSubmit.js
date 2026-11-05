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
    /** The viewer holds a submitted copy it can turn into a PDF
     *  (IMPL_PLAN_FORM_PDF §6.1). The author's switch is config.downloadCopy. */
    @api canDownload = false;
    /** The PDF is being made: the button says so and waits. */
    @api downloadBusy = false;
    /** The last attempt failed: said under the button, which stays usable. */
    @api downloadError;

    get cfg() {
        return this.config || {};
    }

    get isToast() {
        return this.cfg.mode === 'toast';
    }

    get message() {
        return this.cfg.message || DEFAULT_MESSAGE;
    }

    get title() {
        return this.cfg.title || '';
    }

    get showButton() {
        // default ON (FormBuilder parity) — explicit false hides
        return this.cfg.actionButton !== false;
    }

    get buttonLabel() {
        return this.cfg.buttonLabel || 'Continue';
    }

    get showRedirect() {
        // A screen offering the PDF copy never counts down to leave
        // (finalFormViewer/completionRules.js) — so it never says it will.
        return Boolean(this.cfg.autoRedirect) && !this.showDownload;
    }

    get showDownload() {
        return Boolean(this.cfg.downloadCopy) && this.canDownload;
    }

    get downloadLabel() {
        if (this.downloadBusy) {
            return 'Preparing your PDF…';
        }
        return this.cfg.downloadLabel || 'Download a copy (PDF)';
    }

    get downloadBusyAttr() {
        return this.downloadBusy ? 'true' : 'false';
    }

    handleDownload() {
        if (this.downloadBusy) {
            return;
        }
        this.dispatchEvent(new CustomEvent('downloadcopy'));
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
