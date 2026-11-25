import uploadRequest from '@salesforce/apex/FinalGuestController.uploadRequest';
import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getGuestRuntimeSpec from '@salesforce/apex/FinalGuestController.getGuestRuntimeSpecForLangs';
import getGuestAutofillContext from '@salesforce/apex/FinalGuestController.getGuestAutofillContext';
import submitGuest from '@salesforce/apex/FinalGuestController.submitGuest';
import guestTicket from '@salesforce/apex/FinalGuestController.guestTicket';
import getLookupPlan from '@salesforce/apex/FinalAutofillController.getLookupPlan';
import isGuest from '@salesforce/user/isGuest';
import { t } from 'c/finalTranslate';
import { solveTicket } from 'c/finalProofOfWork';

/** The server refuses a submit whose ticket is younger than this. The wait is
 *  measured on the monotonic clock from the moment the ticket ARRIVED, so a
 *  wrong device clock cannot shorten or stretch it (the server's own clock
 *  does the real check). */
const MIN_TICKET_AGE_MS = 2000;
const BOT_PREFIX = 'FINAL_BOT:';

function monotonicNow() {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
}

function wait(ms) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The FINAL_BOT:* code in an Apex error, or null (a network failure, or a
 *  message meant for the respondent). Never shown as text. */
function botCode(error) {
    const message = error && error.body && error.body.message;
    return typeof message === 'string' && message.startsWith(BOT_PREFIX)
        ? message
        : null;
}

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
    _langParam;
    _loadedKey;
    _loadGen = 0;
    _reloadedForVersion = false;
    /** The guest bot-check ticket and its puzzle: { ticket, receivedAt (the
     *  monotonic clock), controller, promise }. See _startTicket. */
    _entry;
    /** The one submit sequence in flight, or null. */
    _activeSend = null;

    /** The live ticket string, handed to the viewer so address search can
     *  prove the page is real. `_entry` is a class field, so reassigning it
     *  (a refreshed ticket) re-renders and the viewer sees the new text. */
    get uploadContextVersion() {
        return this._loadGen;
    }

    get currentTicket() {
        return this._entry?.ticket || null;
    }

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        if (ref && ref.state) {
            this._urlFormId = ref.state.formId || ref.state.c__formId;
            // SO-4 record link token (opaque, encrypted; server resolves it).
            this._token = ref.state.c__rt || ref.state.rt || null;
            this._langParam = ref.state.c__lang || ref.state.lang || null;
        }
        this._load();
    }

    async handleUploadRequest(event) {
        const { operation, resolve, reject } = event.detail;
        const generation = this._loadGen;
        try {
            const request = { ...operation };
            if (request.action === 'create' && isGuest) {
                const entry = this._entry;
                if (!entry) throw new Error(t('Final_Run_UploadUnavailable'));
                request.ticket = entry.ticket;
                request.nonce = await this._nonceFor(entry);
                await this._waitForTicketAge(entry);
            }
            if (generation !== this._loadGen)
                throw new Error(t('Final_Run_UploadUnavailable'));
            const result = await uploadRequest({
                requestJson: JSON.stringify(request)
            });
            if (generation !== this._loadGen)
                throw new Error(t('Final_Run_UploadUnavailable'));
            resolve(result);
        } catch (error) {
            reject(error);
        }
    }

    connectedCallback() {
        this._load();
        // A page the platform kept alive across a tab switch comes back with
        // its puzzle cancelled; start it again (same ticket, same age).
        if (this._entry && this._entry.controller.signal.aborted) {
            this._solveEntry(this._entry);
        }
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
        if (this._entry) {
            this._entry.controller.abort();
        }
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

    get loadingText() {
        return t('Final_Run_LoadingForm');
    }

    /** The visitor's languages in order of preference: the link's `lang`,
     *  then the browser's. Only the closed message is chosen from them on the
     *  server; the viewer picks its own language for the form itself. */
    _languageCandidates() {
        const browser =
            typeof navigator === 'undefined'
                ? []
                : navigator.languages || [navigator.language];
        return [this._langParam, ...browser].filter(Boolean);
    }

    get effectiveFormId() {
        return this._urlFormId || this.formId;
    }

    async _load() {
        const formId = this.effectiveFormId;
        const token = this._token;
        // the link language is part of the key: the page reference can land
        // after the first load, and the closed message depends on it
        const loadKey = `${formId}:${token || ''}:${this._langParam || ''}`;
        if (!formId || loadKey === this._loadedKey) {
            return;
        }
        this._loadedKey = loadKey;
        const currentGen = ++this._loadGen;
        // Anything started for the previous form / respondent is dead: its
        // puzzle stops and its submit sequence (if any) is released.
        this._dropTicket();
        this._activeSend = null;

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
            const runtimeRes = await getGuestRuntimeSpec({
                formId,
                langs: this._languageCandidates()
            });
            if (this._loadGen !== currentGen) {
                return;
            }
            if (runtimeRes && runtimeRes.closed) {
                this.spec = undefined;
                this.error =
                    runtimeRes.closedMessage || t('Final_Run_FormClosed');
                return;
            }
            this.versionId = runtimeRes.versionId;
            // Guest bot check: keep the ticket that rode with the spec and
            // start its puzzle right away, while the person fills the form in.
            this._startTicket(runtimeRes.ticket);
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
                t('Final_Run_FormUnavailable');
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

    // ----- guest bot check: ticket, puzzle, minimum age -----

    /** Forget the current ticket and stop its puzzle. */
    _dropTicket() {
        if (this._entry) {
            this._entry.controller.abort();
        }
        this._entry = undefined;
    }

    /** Adopt a ticket (null/empty = none) and start solving it. The monotonic
     *  clock is read at receipt for the 2 s minimum age. */
    _startTicket(ticket) {
        this._dropTicket();
        if (!ticket) {
            return undefined;
        }
        const entry = { ticket, receivedAt: monotonicNow() };
        this._entry = entry;
        this._solveEntry(entry);
        return entry;
    }

    /** (Re)start the puzzle for an entry; its promise resolves with the nonce.
     *  A rejection nobody awaits yet (a cancel, or an unreadable ticket) is
     *  swallowed here and surfaces to whoever awaits entry.promise later. */
    _solveEntry(entry) {
        entry.controller = new AbortController();
        entry.promise = solveTicket(entry.ticket, {
            signal: entry.controller.signal
        });
        entry.promise.catch(() => {});
        return entry.promise;
    }

    /** The puzzle's nonce for an entry, restarting it if it was cancelled
     *  (a disconnect) or had failed. */
    _nonceFor(entry) {
        if (!entry.promise || entry.controller.signal.aborted) {
            this._solveEntry(entry);
        }
        return entry.promise;
    }

    /** Wait out whatever is left of the 2 s minimum ticket age. */
    async _waitForTicketAge(entry) {
        const left = MIN_TICKET_AGE_MS - (monotonicNow() - entry.receivedAt);
        if (left > 0) {
            await wait(left);
        }
    }

    /** Fetch a brand-new ticket (expiry, or a server that sent none) and start
     *  its puzzle. */
    async _refreshTicket(formId, gen) {
        const ticket = await guestTicket({ formId });
        if (this._loadGen !== gen) {
            return null;
        }
        return this._startTicket(ticket);
    }

    // ----- submit -----

    /**
     * One submit sequence at a time: solve (usually long done), wait out the
     * minimum ticket age, send with meta.tk / meta.pow. An EXPIRED ticket is
     * refreshed and the SAME payload (same submissionKey, version, link)
     * is sent once more. Nothing is resent after a network failure, and
     * the load generation is rechecked after every await so a late result can
     * never touch another respondent's viewer.
     */
    async handleSubmitRequest(event) {
        if (this._activeSend) {
            return; // the viewer already holds the one-click guard; belt and braces
        }
        const send = {};
        this._activeSend = send;
        const gen = this._loadGen;
        const viewer = this.refs.viewer;
        const formId = this.effectiveFormId;
        const payload = (event.detail && event.detail.payload) || {};
        // Merge the honeypot value into meta.hp — the viewer builds the payload
        // and knows nothing of the bait; the host owns it (server checks it).
        const hpField = this.refs.honeypot;
        const baseMeta = {
            ...(payload.meta || {}),
            hp: hpField ? hpField.value : '',
            ...(this.versionId ? { specVersionId: this.versionId } : {}),
            // SO-4: the link token rides meta.rt (same channel as hp); the
            // server re-validates it and stamps the record ref from the
            // TOKEN, never a raw client recordId.
            ...(this._token ? { rt: this._token } : {})
        };
        const live = () => this._loadGen === gen && this._activeSend === send;
        const fail = (message, options) => {
            if (live() && viewer) {
                if (options) {
                    viewer.failSubmit(message, options);
                } else {
                    viewer.failSubmit(message);
                }
            }
        };

        try {
            let refreshed = false;
            for (;;) {
                let entry = this._entry;
                if (!entry) {
                    // no ticket (an older server, or a refresh that never
                    // landed): ask for one once, then carry on as normal
                    // eslint-disable-next-line no-await-in-loop
                    entry = await this._refreshTicket(formId, gen);
                    if (!live()) {
                        return;
                    }
                    if (!entry) {
                        // never leave Submit spinning: no ticket, no send
                        fail(t('Final_Run_SaveFailed'));
                        return;
                    }
                }
                // eslint-disable-next-line no-await-in-loop
                const nonce = await this._nonceFor(entry);
                if (!live()) {
                    return;
                }
                // eslint-disable-next-line no-await-in-loop
                await this._waitForTicketAge(entry);
                if (!live()) {
                    return;
                }
                let result;
                try {
                    // eslint-disable-next-line no-await-in-loop
                    result = await submitGuest({
                        formId,
                        payloadJson: JSON.stringify({
                            ...payload,
                            meta: { ...baseMeta, tk: entry.ticket, pow: nonce }
                        })
                    });
                } catch (e) {
                    if (!live()) {
                        return;
                    }
                    const code = botCode(e);
                    if (code === BOT_PREFIX + 'EXPIRED' && !refreshed) {
                        refreshed = true;
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await this._refreshTicket(formId, gen);
                        } catch (refreshError) {
                            // a form that closed or filled up meanwhile says
                            // so (the server's own message), not "try again"
                            fail(
                                ...this._failureFor(
                                    refreshError,
                                    botCode(refreshError)
                                )
                            );
                            return;
                        }
                        if (!live()) {
                            return;
                        }
                        continue; // resend ONCE with a fresh ticket
                    }
                    fail(...this._failureFor(e, code));
                    return;
                }
                if (live() && viewer) {
                    if (result && result.success === false) {
                        // The server refused (nothing saved, ticket unspent):
                        // never the thank-you. Answers stay, the list by
                        // Submit names what to fix (DEFERRED #68).
                        viewer.failSubmit(null, {
                            errors: result.errors || []
                        });
                    } else {
                        viewer.completeSubmit();
                    }
                }
                return;
            }
        } catch {
            // the puzzle itself failed (never a give-up timer: only a real
            // error or a cancel lands here); answers stay on screen
            fail(t('Final_Run_SaveFailed'));
        } finally {
            if (this._activeSend === send) {
                this._activeSend = null;
            }
        }
    }

    /** [message, options] for the viewer after a refused/failed submit. A bot
     *  code is NEVER shown raw: each maps to respondent wording. */
    _failureFor(error, code) {
        switch (code) {
            case BOT_PREFIX + 'TOO_FAST':
                return [t('Final_Run_TooFast')];
            case BOT_PREFIX + 'USED':
                // this page's response is already in; answers stay on screen
                // but Submit is off for the rest of the visit
                return [t('Final_Run_AlreadySent'), { locked: true }];
            case null:
                return [
                    (error && error.body && error.body.message) ||
                        t('Final_Run_SaveFailed')
                ];
            default:
                // INVALID, PROOF, a second EXPIRED, or a code from a newer server
                return [t('Final_Run_SaveFailed')];
        }
    }
}
