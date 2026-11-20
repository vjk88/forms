import { LightningElement, api } from 'lwc';
import { t } from 'c/finalTranslate';

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

function defaultMessage() {
    const text = t('Final_Run_ThankYou')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<p>${text}</p>`;
}

const DEST_LABEL_NAMES = {
    record: 'Final_Run_DestRecord',
    url: 'Final_Run_DestUrl'
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
        return this.cfg.message || defaultMessage();
    }

    get title() {
        return this.cfg.title || '';
    }

    get showButton() {
        // default ON (FormBuilder parity) — explicit false hides
        return this.cfg.actionButton !== false;
    }

    get buttonLabel() {
        return this.cfg.buttonLabel || t('Final_Run_Continue');
    }

    get showRedirect() {
        return Boolean(this.cfg.autoRedirect);
    }

    get redirectDest() {
        return t(
            DEST_LABEL_NAMES[this.cfg.redirectTo] || DEST_LABEL_NAMES.record
        );
    }

    get redirectDelay() {
        const n = Number(this.cfg.redirectDelay);
        return Number.isFinite(n) && n >= 0 ? n : 5;
    }

    get redirectPill() {
        return t('Final_Run_RedirectIn', this.redirectDest, this.redirectDelay);
    }

    get toastText() {
        return t('Final_Run_Success');
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
