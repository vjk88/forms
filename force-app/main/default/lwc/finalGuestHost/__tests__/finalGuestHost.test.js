import { createElement } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import FinalGuestHost from 'c/finalGuestHost';
import getGuestRuntimeSpec from '@salesforce/apex/FinalGuestController.getGuestRuntimeSpecForLangs';
import getGuestAutofillContext from '@salesforce/apex/FinalGuestController.getGuestAutofillContext';
import submitGuest from '@salesforce/apex/FinalGuestController.submitGuest';
import guestTicket from '@salesforce/apex/FinalGuestController.guestTicket';
import { solveTicket } from 'c/finalProofOfWork';
import { t, setLabelOverrides, clearLabelOverrides } from 'c/finalTranslate';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalGuestController.getGuestRuntimeSpecForLangs',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalGuestController.getGuestAutofillContext',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalGuestController.submitGuest',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalGuestController.guestTicket',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
// the puzzle itself is covered by finalProofOfWork's own tests; here it is a
// controllable promise so the host's ordering and cancelling can be proven
jest.mock('c/finalProofOfWork', () => ({ solveTicket: jest.fn() }));

const SPEC = {
    specVersion: 1,
    form: { name: 'Guest' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Send' },
    pages: [
        {
            id: 'pg_1',
            sections: [
                {
                    id: 'sec_1',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_ln',
                            type: 'field',
                            label: 'Last name',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(formId) {
    const el = createElement('c-final-guest-host', { is: FinalGuestHost });
    el.formId = formId;
    document.body.appendChild(el);
    return el;
}

describe('c-final-guest-host (guest site host, A2)', () => {
    beforeEach(() => {
        // reset the page-ref wire so a token emitted by one test never bleeds
        // into the next (the adapter retains its last value)
        CurrentPageReference.emit(undefined);
    });
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.restoreAllMocks();
        delete global.ResizeObserver;
    });

    it('gate pass: fetches the projected spec and feeds it to the viewer', async () => {
        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        const el = mount('a0Xguest');
        await flush();
        await flush();

        expect(getGuestRuntimeSpec).toHaveBeenCalledWith({
            formId: 'a0Xguest',
            langs: expect.any(Array)
        });
        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        expect(viewer).not.toBeNull();
        expect(viewer.spec.form.name).toBe('Guest');
        expect(viewer.delegateSubmit).toBe(true);
        // lookup search and signed-in Autofill ask which published version
        expect(viewer.formId).toBe('a0Xguest');
        expect(viewer.versionId).toBe('v1');
        expect(el.shadowRoot.querySelector('.guest-unavailable')).toBeNull();
    });

    it('sends the link language first, then the browser languages', async () => {
        jest.spyOn(navigator, 'languages', 'get').mockReturnValue([
            'de-DE',
            'en'
        ]);
        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        mount('a0Xlang');
        CurrentPageReference.emit({ state: { lang: 'fr' } });
        await flush();
        await flush();

        expect(getGuestRuntimeSpec).toHaveBeenLastCalledWith({
            formId: 'a0Xlang',
            langs: ['fr', 'de-DE', 'en']
        });
    });

    it('shows the translated closed message the server returns', async () => {
        getGuestRuntimeSpec.mockResolvedValue({
            closed: true,
            closedMessage: 'Termine.'
        });
        const el = mount('a0Xclosed');
        await flush();
        await flush();

        expect(el.shadowRoot.querySelector('c-final-form-viewer')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.guest-unavailable').textContent
        ).toContain('Termine.');
    });

    it('gate fail: shows the generic unavailable message, no viewer', async () => {
        getGuestRuntimeSpec.mockRejectedValue({
            body: { message: 'This form is not available.' }
        });
        const el = mount('a0Xblocked');
        await flush();
        await flush();

        expect(el.shadowRoot.querySelector('c-final-form-viewer')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.guest-unavailable').textContent
        ).toContain('not available');
    });

    it('closed form: shows the closed message, no viewer', async () => {
        getGuestRuntimeSpec.mockResolvedValue({
            closed: true,
            closedMessage: 'Closed for now.'
        });
        const el = mount('a0Xclosed');
        await flush();
        await flush();

        expect(el.shadowRoot.querySelector('c-final-form-viewer')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.guest-unavailable').textContent
        ).toContain('Closed for now.');
    });

    it('embed bridge: posts the form height to the parent window (A4)', async () => {
        const observed = [];
        global.ResizeObserver = class {
            constructor(cb) {
                this.cb = cb;
            }
            observe(el) {
                observed.push(el);
            }
            disconnect() {}
        };
        jest.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect'
        ).mockReturnValue({
            height: 320,
            width: 600,
            top: 0,
            left: 0,
            bottom: 320,
            right: 600
        });
        const postSpy = jest.spyOn(window, 'postMessage');

        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        mount('a0Xembed');
        await flush();
        await flush();

        expect(observed.length).toBeGreaterThan(0);
        const msg = postSpy.mock.calls.find(
            (c) => c[0] && c[0].type === 'finalforms:height'
        );
        expect(msg).toBeTruthy();
        expect(msg[0].height).toBe(320);
    });

    it('no honeypot field when spamProtection is off', async () => {
        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        const el = mount('a0Xnohp');
        await flush();
        await flush();
        expect(el.shadowRoot.querySelector('.hp-field')).toBeNull();
    });

    it('SO-4: a ?c__rt= token fetches the record context and injects it into the viewer', async () => {
        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        getGuestAutofillContext.mockResolvedValue({
            versionId: 'v1',
            status: 'applied',
            prefill: { el_ln: 'Ada' },
            ruleFacts: { 'record:Plan__c|equals|Pro': true }
        });
        const el = createElement('c-final-guest-host', { is: FinalGuestHost });
        document.body.appendChild(el);
        CurrentPageReference.emit({
            state: { c__formId: 'a0Xtok', c__rt: 'TOKEN123' }
        });
        await flush();
        await flush();
        await flush();

        expect(getGuestAutofillContext).toHaveBeenCalledWith({
            formId: 'a0Xtok',
            versionId: 'v1',
            token: 'TOKEN123'
        });
        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        expect(viewer.recordContext).toEqual({
            versionId: 'v1',
            status: 'applied',
            prefill: { el_ln: 'Ada' },
            ruleFacts: { 'record:Plan__c|equals|Pro': true }
        });
    });

    it('SO-4: no token → getGuestAutofillContext is never called', async () => {
        getGuestRuntimeSpec.mockResolvedValue({ versionId: 'v1', spec: SPEC });
        mount('a0Xplain');
        await flush();
        await flush();
        expect(getGuestAutofillContext).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Invisible bot checks (IMPL_PLAN_GUEST_BOT_CHECKS): ticket, puzzle, 2 s wait
// ---------------------------------------------------------------------------

function ticketText(tag) {
    return `ticket-${tag}`;
}

function deferred() {
    const d = {};
    d.promise = new Promise((resolve, reject) => {
        d.resolve = resolve;
        d.reject = reject;
    });
    return d;
}

describe('c-final-guest-host bot checks and submit', () => {
    // fake timers drive the 2 s ticket age and the puzzle's yields; the
    // monotonic clock (performance.now) is faked along with them
    const advance = (ms = 0) => jest.advanceTimersByTimeAsync(ms);

    async function mountReady(runtime = {}, formId = 'a0Xguest') {
        getGuestRuntimeSpec.mockResolvedValue({
            versionId: 'v1',
            spec: SPEC,
            ticket: ticketText('one'),
            ...runtime
        });
        const el = mount(formId);
        await advance();
        await advance();
        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        return {
            el,
            viewer,
            failSpy: jest.spyOn(viewer, 'failSubmit'),
            doneSpy: jest.spyOn(viewer, 'completeSubmit')
        };
    }

    function request(viewer, payload) {
        viewer.dispatchEvent(
            new CustomEvent('submitrequest', {
                detail: {
                    payload: payload || {
                        answers: { el_ln: 'Riley' },
                        meta: { submissionKey: 'key-1' }
                    }
                }
            })
        );
    }

    const sentMeta = (call = 0) =>
        JSON.parse(submitGuest.mock.calls[call][0].payloadJson).meta;
    const botError = (code) => ({ body: { message: `FINAL_BOT:${code}` } });

    beforeEach(() => {
        jest.useFakeTimers();
        CurrentPageReference.emit(undefined);
        clearLabelOverrides();
        solveTicket.mockReset();
        solveTicket.mockImplementation(() => Promise.resolve('7'));
        submitGuest.mockReset();
        submitGuest.mockResolvedValue({ success: true, childCount: 0 });
        guestTicket.mockReset();
        guestTicket.mockResolvedValue(ticketText('two'));
    });
    afterEach(() => {
        jest.useRealTimers();
        clearLabelOverrides();
    });

    it('starts the puzzle as soon as the ticket arrives, before any submit', async () => {
        await mountReady();
        expect(solveTicket).toHaveBeenCalledTimes(1);
        expect(solveTicket.mock.calls[0][0]).toBe(ticketText('one'));
        expect(solveTicket.mock.calls[0][1].signal.aborted).toBe(false);
        expect(submitGuest).not.toHaveBeenCalled();
    });

    it('hands the current ticket to the viewer for address search', async () => {
        const { viewer } = await mountReady();
        expect(viewer.guestTicket).toBe(ticketText('one'));
    });

    it('hands the viewer no ticket when the server sent none', async () => {
        const { viewer } = await mountReady({ ticket: undefined });
        expect(viewer.guestTicket).toBeNull();
    });

    it('the viewer sees the refreshed ticket after an expiry', async () => {
        submitGuest
            .mockRejectedValueOnce(botError('EXPIRED'))
            .mockResolvedValueOnce({ success: true });
        const { viewer } = await mountReady();
        request(viewer);
        await advance(2000);
        expect(viewer.guestTicket).toBe(ticketText('two'));
    });

    it('delegated submit: sends meta.tk, meta.pow, the other meta and the answers, then completes the viewer', async () => {
        const { viewer, doneSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(submitGuest).toHaveBeenCalledTimes(1);
        const args = submitGuest.mock.calls[0][0];
        expect(args.formId).toBe('a0Xguest');
        const body = JSON.parse(args.payloadJson);
        expect(body.answers).toEqual({ el_ln: 'Riley' });
        expect(body.meta).toEqual({
            submissionKey: 'key-1',
            hp: '',
            specVersionId: 'v1',
            tk: ticketText('one'),
            pow: '7'
        });
        expect(doneSpy).toHaveBeenCalledTimes(1);
    });

    it('waits until two seconds have passed since the ticket arrived', async () => {
        const { viewer } = await mountReady();
        request(viewer);
        await advance(1900);
        expect(submitGuest).not.toHaveBeenCalled();
        await advance(100);
        expect(submitGuest).toHaveBeenCalledTimes(1);
    });

    it('counts the wait from receipt, so a late submit goes straight out', async () => {
        const { viewer } = await mountReady();
        await advance(30000); // the person took a while to fill it in
        request(viewer);
        await advance(0);
        expect(submitGuest).toHaveBeenCalledTimes(1);
    });

    it('holds the send until the puzzle is solved', async () => {
        const puzzle = deferred();
        solveTicket.mockReturnValue(puzzle.promise);
        const { viewer } = await mountReady();
        request(viewer);
        await advance(10000);
        expect(submitGuest).not.toHaveBeenCalled();

        puzzle.resolve('4242');
        await advance(0);
        expect(submitGuest).toHaveBeenCalledTimes(1);
        expect(sentMeta().pow).toBe('4242');
    });

    it('honeypot: renders the bait field and merges its value into meta.hp', async () => {
        const { el, viewer } = await mountReady({
            spec: {
                ...SPEC,
                settings: { ...SPEC.settings, spamProtection: 'honeypot' }
            }
        });
        const hp = el.shadowRoot.querySelector('.hp-field');
        expect(hp).not.toBeNull();
        hp.value = 'http://bot.example';
        request(viewer, { answers: { el_ln: 'X' }, meta: {} });
        await advance(2000);

        expect(sentMeta().hp).toBe('http://bot.example');
        expect(sentMeta().tk).toBe(ticketText('one'));
    });

    it('SO-4: a token-carrying submit sends it as meta.rt (server re-validates)', async () => {
        getGuestRuntimeSpec.mockResolvedValue({
            versionId: 'v1',
            spec: SPEC,
            ticket: ticketText('one')
        });
        getGuestAutofillContext.mockResolvedValue({
            versionId: 'v1',
            status: 'applied',
            prefill: {},
            ruleFacts: {}
        });
        const el = createElement('c-final-guest-host', { is: FinalGuestHost });
        document.body.appendChild(el);
        CurrentPageReference.emit({
            state: { c__formId: 'a0Xtok', c__rt: 'TOKEN123' }
        });
        await advance();
        await advance();
        await advance();

        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        request(viewer, { answers: { el_ln: 'X' }, meta: {} });
        await advance(2000);

        expect(sentMeta().rt).toBe('TOKEN123');
        expect(sentMeta().specVersionId).toBe('v1');
        expect(sentMeta().tk).toBe(ticketText('one'));
    });

    it('delegated submit failure: passes a respondent message to the viewer', async () => {
        submitGuest.mockRejectedValue({ body: { message: 'Closed.' } });
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(failSpy).toHaveBeenCalledWith('Closed.');
    });

    it('a refused submit (success:false + errors) never completes the viewer: the errors go to it', async () => {
        const errors = [{ message: 'Last name is required.', fields: [] }];
        submitGuest.mockResolvedValue({ success: false, errors });
        const { viewer, doneSpy, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(doneSpy).not.toHaveBeenCalled();
        expect(failSpy).toHaveBeenCalledWith(null, { errors });
    });

    it('EXPIRED: fetches a fresh ticket, waits its two seconds and resends ONCE with the same payload', async () => {
        submitGuest
            .mockRejectedValueOnce(botError('EXPIRED'))
            .mockResolvedValueOnce({ success: true });
        const { viewer, doneSpy, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(guestTicket).toHaveBeenCalledTimes(1);
        expect(guestTicket).toHaveBeenCalledWith({ formId: 'a0Xguest' });
        expect(solveTicket).toHaveBeenCalledTimes(2);
        expect(solveTicket.mock.calls[1][0]).toBe(ticketText('two'));
        // the fresh ticket is too young to send yet
        expect(submitGuest).toHaveBeenCalledTimes(1);
        await advance(1900);
        expect(submitGuest).toHaveBeenCalledTimes(1);
        await advance(100);

        expect(submitGuest).toHaveBeenCalledTimes(2);
        const first = JSON.parse(submitGuest.mock.calls[0][0].payloadJson);
        const second = JSON.parse(submitGuest.mock.calls[1][0].payloadJson);
        expect(second.answers).toEqual(first.answers);
        expect(second.meta.submissionKey).toBe(first.meta.submissionKey);
        expect(second.meta.specVersionId).toBe(first.meta.specVersionId);
        expect(second.meta.tk).toBe(ticketText('two'));
        expect(doneSpy).toHaveBeenCalledTimes(1);
        expect(failSpy).not.toHaveBeenCalled();
    });

    it('EXPIRED twice: one refresh only, then the ordinary "could not save"', async () => {
        submitGuest.mockRejectedValue(botError('EXPIRED'));
        const { viewer, failSpy, doneSpy } = await mountReady();
        request(viewer);
        await advance(2000);
        await advance(2000);
        await advance(2000);

        expect(guestTicket).toHaveBeenCalledTimes(1);
        expect(submitGuest).toHaveBeenCalledTimes(2);
        expect(failSpy).toHaveBeenCalledTimes(1);
        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
        expect(doneSpy).not.toHaveBeenCalled();
    });

    it('EXPIRED but the form closed meanwhile: the server says so, not "try again"', async () => {
        submitGuest.mockRejectedValue(botError('EXPIRED'));
        guestTicket.mockRejectedValue({
            body: { message: 'This form is closed.' }
        });
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(submitGuest).toHaveBeenCalledTimes(1);
        expect(failSpy).toHaveBeenCalledWith('This form is closed.');
    });

    it('EXPIRED and the refresh fails with no message: "could not save"', async () => {
        submitGuest.mockRejectedValue(botError('EXPIRED'));
        guestTicket.mockRejectedValue(new Error('network'));
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
    });

    it('no ticket and the fetch returns none: Submit is released, never left spinning', async () => {
        guestTicket.mockResolvedValue('');
        const { viewer, failSpy } = await mountReady({ ticket: undefined });
        request(viewer);
        await advance(2000);

        expect(submitGuest).not.toHaveBeenCalled();
        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
    });

    it('USED: tells the respondent, keeps their answers and locks Submit for the visit', async () => {
        submitGuest.mockRejectedValue(botError('USED'));
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(failSpy).toHaveBeenCalledTimes(1);
        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_AlreadySent'), {
            locked: true
        });
        expect(t('Final_Run_AlreadySent')).toContain('already received');
        expect(guestTicket).not.toHaveBeenCalled();
    });

    it('TOO_FAST: shows the retry message; the next Submit reuses the same ticket', async () => {
        submitGuest
            .mockRejectedValueOnce(botError('TOO_FAST'))
            .mockResolvedValueOnce({ success: true });
        const { viewer, failSpy, doneSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_TooFast'));
        expect(failSpy.mock.calls[0][1]).toBeUndefined(); // not locked
        expect(t('Final_Run_TooFast')).toContain('submit again');

        request(viewer);
        await advance(0);
        expect(submitGuest).toHaveBeenCalledTimes(2);
        expect(sentMeta(1).tk).toBe(ticketText('one'));
        expect(guestTicket).not.toHaveBeenCalled();
        expect(doneSpy).toHaveBeenCalledTimes(1);
    });

    it.each(['INVALID', 'PROOF', 'SOMETHING_NEW'])(
        '%s: "could not save", no refresh, never the raw code',
        async (code) => {
            submitGuest.mockRejectedValue(botError(code));
            const { viewer, failSpy } = await mountReady();
            request(viewer);
            await advance(2000);

            expect(guestTicket).not.toHaveBeenCalled();
            expect(submitGuest).toHaveBeenCalledTimes(1);
            expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
            expect(JSON.stringify(failSpy.mock.calls)).not.toContain(
                'FINAL_BOT'
            );
        }
    );

    it('a lost connection is never resent automatically', async () => {
        submitGuest.mockRejectedValue(new Error('Failed to fetch'));
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);
        await advance(30000);

        expect(submitGuest).toHaveBeenCalledTimes(1);
        expect(guestTicket).not.toHaveBeenCalled();
        expect(failSpy).toHaveBeenCalledTimes(1);
        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
    });

    it("new messages follow the respondent's active language", async () => {
        setLabelOverrides({
            Final_Run_TooFast: 'Trop rapide !',
            Final_Run_AlreadySent: 'Deja envoye.'
        });
        submitGuest
            .mockRejectedValueOnce(botError('TOO_FAST'))
            .mockRejectedValueOnce(botError('USED'));
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);
        request(viewer);
        await advance(0);

        expect(failSpy.mock.calls[0][0]).toBe('Trop rapide !');
        expect(failSpy.mock.calls[1][0]).toBe('Deja envoye.');
    });

    it('a puzzle that errors out stops the busy state and keeps the answers', async () => {
        solveTicket.mockReturnValue(Promise.reject(new Error('boom')));
        const { viewer, failSpy } = await mountReady();
        request(viewer);
        await advance(2000);

        expect(submitGuest).not.toHaveBeenCalled();
        expect(failSpy).toHaveBeenCalledWith(t('Final_Run_SaveFailed'));
    });

    it('two quick requests make one send (one sequence in flight)', async () => {
        const { viewer } = await mountReady();
        request(viewer);
        request(viewer);
        request(viewer);
        await advance(2000);

        expect(submitGuest).toHaveBeenCalledTimes(1);
    });

    it('a server that sent no ticket: one is fetched when Submit is pressed', async () => {
        const { viewer, doneSpy } = await mountReady({ ticket: undefined });
        expect(solveTicket).not.toHaveBeenCalled();
        request(viewer);
        await advance(0);
        expect(guestTicket).toHaveBeenCalledTimes(1);
        await advance(2000);

        expect(sentMeta().tk).toBe(ticketText('two'));
        expect(doneSpy).toHaveBeenCalled();
    });

    it('a reload cancels the old puzzle and an unfinished send never fires', async () => {
        const { viewer, failSpy, doneSpy } = await mountReady();
        const oldSignal = solveTicket.mock.calls[0][1].signal;
        request(viewer);
        await advance(500); // still inside the two second wait

        getGuestRuntimeSpec.mockResolvedValue({
            versionId: 'v2',
            spec: SPEC,
            ticket: ticketText('other')
        });
        CurrentPageReference.emit({ state: { formId: 'a0Xother' } });
        await advance(0);
        await advance(0);
        await advance(5000);

        expect(oldSignal.aborted).toBe(true);
        expect(solveTicket.mock.calls[1][0]).toBe(ticketText('other'));
        expect(submitGuest).not.toHaveBeenCalled();
        expect(failSpy).not.toHaveBeenCalled();
        expect(doneSpy).not.toHaveBeenCalled();
    });

    it('a late reply for the old respondent cannot touch the new viewer', async () => {
        const reply = deferred();
        submitGuest.mockReturnValue(reply.promise);
        const { viewer, doneSpy: oldDone } = await mountReady();
        request(viewer);
        await advance(2000);
        expect(submitGuest).toHaveBeenCalledTimes(1);

        getGuestRuntimeSpec.mockResolvedValue({
            versionId: 'v2',
            spec: SPEC,
            ticket: ticketText('other')
        });
        CurrentPageReference.emit({ state: { formId: 'a0Xother' } });
        await advance(0);
        await advance(0);
        const el = document.body.querySelector('c-final-guest-host');
        const newViewer = el.shadowRoot.querySelector('c-final-form-viewer');
        const newDone = jest.spyOn(newViewer, 'completeSubmit');
        const newFail = jest.spyOn(newViewer, 'failSubmit');

        reply.resolve({ success: true });
        await advance(0);

        expect(oldDone).not.toHaveBeenCalled();
        expect(newDone).not.toHaveBeenCalled();
        expect(newFail).not.toHaveBeenCalled();
    });

    it('leaving the page cancels the puzzle', async () => {
        const { el } = await mountReady();
        const signal = solveTicket.mock.calls[0][1].signal;
        document.body.removeChild(el);
        expect(signal.aborted).toBe(true);
    });
});
