import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getGuestRuntimeSpec from '@salesforce/apex/FinalGuestController.getGuestRuntimeSpec';
import getGuestAutofillContext from '@salesforce/apex/FinalGuestController.getGuestAutofillContext';
import submitGuest from '@salesforce/apex/FinalGuestController.submitGuest';
import getLookupPlan from '@salesforce/apex/FinalAutofillController.getLookupPlan';
import isGuest from '@salesforce/user/isGuest';

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
    /** SO-4: record-context verdicts + author-opted prefill (from the ?c__rt=
     *  link token, resolved server-side) fed into the viewer. */
    recordContext;
    versionId;
    /** R4: authenticated Autofill plan (source object/field names), fetched
     *  only for a logged-in respondent — never for an anonymous one. */
    autofillPlan;
    _urlFormId;
    _token;
    _loadedKey;
    _loadGen = 0;
    _reloadedForVersion = false;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        if (ref && ref.state) {
            this._urlFormId = ref.state.formId || ref.state.c__formId;
            // SO-4 record link token (opaque, encrypted; server resolves it).
            this._token = ref.state.c__rt || ref.state.rt || null;
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
        const token = this._token;
        const loadKey = `${formId}:${token || ''}`;
        if (!formId || loadKey === this._loadedKey) {
            return;
        }
        this._loadedKey = loadKey;
        const currentGen = ++this._loadGen;

        // R7 — tear the previous respondent's session down BEFORE awaiting
        // anything. The generation guard alone only discards late RESULTS; the
        // old spec and recordContext stayed bound to the viewer for the whole
        // round trip, so token B could seed its session from token A's values,
        // and that stale viewer remained submittable during the gap. Clearing
        // the spec also drops the form until the new one arrives, which is what
        // makes submission unavailable across the transition. An empty or
        // unavailable new context therefore cannot leave A's values behind:
        // there is nothing left to retain.
        this.spec = undefined;
        this.recordContext = undefined;
        this.versionId = undefined;
        this.autofillPlan = undefined;
        this.error = undefined;

        try {
            const runtimeRes = await getGuestRuntimeSpec({ formId });
            if (this._loadGen !== currentGen) {
                return;
            }
            if (runtimeRes && runtimeRes.closed) {
                this.spec = undefined;
                this.error =
                    runtimeRes.closedMessage ||
                    'This form is no longer accepting responses.';
                return;
            }
            this.versionId = runtimeRes.versionId;
            this.spec =
                typeof runtimeRes.spec === 'string'
                    ? JSON.parse(runtimeRes.spec)
                    : runtimeRes.spec;
            this.error = undefined;

            // R4 — a LOGGED-IN respondent can be sitting on this public host,
            // and they read source records through LDS with their own access.
            // The projected spec deliberately withholds source object/field API
            // names from anonymous clients, so without this the customer's
            // lookup rules had destination ids only and never executed.
            // `isGuest` only ROUTES; the endpoint re-checks identity server-side
            // and refuses an anonymous caller regardless of this flag.
            if (!isGuest) {
                try {
                    const plan = await getLookupPlan({
                        formId,
                        versionId: this.versionId
                    });
                    if (this._loadGen !== currentGen) {
                        return;
                    }
                    this.autofillPlan = plan || undefined;
                } catch {
                    // A missing plan must not block the form: every destination
                    // stays manually editable and normal validation still runs.
                    if (this._loadGen === currentGen) {
                        this.autofillPlan = undefined;
                    }
                }
            }

            if (token) {
                try {
                    const ctx = await getGuestAutofillContext({
                        formId,
                        versionId: this.versionId,
                        token
                    });
                    if (this._loadGen !== currentGen) {
                        return;
                    }
                    if (
                        ctx &&
                        ctx.status === 'versionChanged' &&
                        !this._reloadedForVersion
                    ) {
                        this._reloadedForVersion = true;
                        this._loadedKey = null;
                        this._load();
                        return;
                    }
                    this.recordContext = ctx || undefined;
                } catch {
                    if (this._loadGen === currentGen) {
                        this.recordContext = undefined;
                    }
                }
            } else {
                this.recordContext = undefined;
            }
        } catch (e) {
            if (this._loadGen !== currentGen) {
                return;
            }
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
        const withMeta = {
            ...payload,
            meta: {
                ...(payload.meta || {}),
                hp: hpField ? hpField.value : '',
                ...(this.versionId ? { specVersionId: this.versionId } : {}),
                // SO-4: the link token rides meta.rt (same channel as hp); the
                // server re-validates it and stamps the record ref from the
                // TOKEN, never a raw client recordId.
                ...(this._token ? { rt: this._token } : {})
            }
        };
        try {
            await submitGuest({
                formId: this.effectiveFormId,
                payloadJson: JSON.stringify(withMeta)
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
