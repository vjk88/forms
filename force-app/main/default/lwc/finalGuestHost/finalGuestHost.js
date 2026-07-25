import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getGuestSpec from '@salesforce/apex/FinalGuestController.getGuestSpec';
import submitGuest from '@salesforce/apex/FinalGuestController.submitGuest';

/**
 * finalGuestHost — the guest-site page component (Phase A2).
 *
 * The ONLY thing that touches the guest Apex family. It fetches the projected
 * spec from FinalGuestController and feeds it to the EXISTING
 * c-final-form-viewer via the `spec` @api — no fork of the viewer, no guest
 * code inside the viewer. The viewer renders and, on submit, emits
 * `submitrequest` (delegateSubmit); the host calls `submitGuest` and resolves
 * it back through the viewer's completeSubmit/failSubmit API.
 *
 * Placed on an LWR Experience Cloud page. `formId` comes from the Experience
 * Builder property, or a `?formId=` / `?c__formId=` URL parameter (URL wins, so
 * one host page can serve any form). A gate failure renders a standalone
 * "not available" message and the viewer never mounts.
 */
export default class FinalGuestHost extends LightningElement {
    /** Experience Builder property (fallback when no URL param is present). */
    @api formId;

    spec;
    error;
    _urlFormId;
    _loadedKey;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        if (ref && ref.state) {
            this._urlFormId = ref.state.formId || ref.state.c__formId;
        }
        this._load();
    }

    connectedCallback() {
        this._load();
    }

    // ----- iframe embed height bridge (A4) -----

    renderedCallback() {
        if (this._observing || typeof ResizeObserver === 'undefined') {
            return;
        }
        const root = this.refs.root;
        if (!root) {
            return;
        }
        this._observing = true;
        this._ro = new ResizeObserver(() => this._postHeight());
        this._ro.observe(root);
        this._postHeight();
    }

    disconnectedCallback() {
        if (this._ro) {
            this._ro.disconnect();
            this._ro = null;
        }
        this._observing = false;
    }

    /**
     * Tell the embedding page how tall the form is so it can size the iframe
     * (Typeform pattern). Outbound ONE-WAY, a number only — no inbound message
     * handling. Harmless when not framed (parent === self). The parent opts in
     * with a ~10-line listener (GUEST_SITE_SETUP embed snippet).
     */
    _postHeight() {
        const root = this.refs.root;
        if (!root) {
            return;
        }
        const height = Math.ceil(root.getBoundingClientRect().height);
        if (height && height !== this._lastHeight) {
            this._lastHeight = height;
            window.parent.postMessage(
                { type: 'finalforms:height', height },
                '*'
            );
        }
    }

    get effectiveFormId() {
        return this._urlFormId || this.formId;
    }

    async _load() {
        const formId = this.effectiveFormId;
        if (!formId || formId === this._loadedKey) {
            return;
        }
        this._loadedKey = formId;
        try {
            const raw = await getGuestSpec({ formId });
            const parsed = JSON.parse(raw);
            // Availability closed (A3): the server returns only the closed flag
            // + message, no form structure. Show the message; never mount the
            // viewer.
            if (parsed && parsed.closed) {
                this.spec = undefined;
                this.error =
                    parsed.closedMessage ||
                    'This form is no longer accepting responses.';
                return;
            }
            this.spec = parsed;
            this.error = undefined;
        } catch (e) {
            this.spec = undefined;
            this.error =
                (e && e.body && e.body.message) ||
                'This form is not available.';
        }
    }

    /** Honeypot (A3): render the bait field only when the form opts in. */
    get showHoneypot() {
        return Boolean(
            this.spec &&
            this.spec.settings &&
            this.spec.settings.spamProtection === 'honeypot'
        );
    }

    async handleSubmitRequest(event) {
        const viewer = this.refs.viewer;
        const payload = (event.detail && event.detail.payload) || {};
        // Merge the honeypot value into meta.hp — the viewer builds the payload
        // and knows nothing of the bait; the host owns it (server checks it).
        const hpField = this.refs.honeypot;
        const withHp = {
            ...payload,
            meta: { ...(payload.meta || {}), hp: hpField ? hpField.value : '' }
        };
        try {
            await submitGuest({
                formId: this.effectiveFormId,
                payloadJson: JSON.stringify(withHp)
            });
            if (viewer) {
                viewer.completeSubmit();
            }
        } catch (e) {
            const message =
                (e && e.body && e.body.message) ||
                'Your response could not be saved. Please try again.';
            if (viewer) {
                viewer.failSubmit(message);
            }
        }
    }
}
