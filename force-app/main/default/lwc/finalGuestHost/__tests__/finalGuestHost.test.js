import { createElement } from 'lwc';
import FinalGuestHost from 'c/finalGuestHost';
import getGuestSpec from '@salesforce/apex/FinalGuestController.getGuestSpec';
import submitGuest from '@salesforce/apex/FinalGuestController.submitGuest';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalGuestController.getGuestSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalGuestController.submitGuest',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

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
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('gate pass: fetches the projected spec and feeds it to the viewer', async () => {
        getGuestSpec.mockResolvedValue(JSON.stringify(SPEC));
        const el = mount('a0Xguest');
        await flush();
        await flush();

        expect(getGuestSpec).toHaveBeenCalledWith({ formId: 'a0Xguest' });
        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        expect(viewer).not.toBeNull();
        expect(viewer.spec.form.name).toBe('Guest');
        expect(viewer.delegateSubmit).toBe(true);
        expect(el.shadowRoot.querySelector('.guest-unavailable')).toBeNull();
    });

    it('gate fail: shows the generic unavailable message, no viewer', async () => {
        getGuestSpec.mockRejectedValue({
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

    it('delegated submit: calls submitGuest with the payload and completes the viewer', async () => {
        getGuestSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitGuest.mockResolvedValue({ success: true, childCount: 0 });
        const el = mount('a0Xguest');
        await flush();
        await flush();

        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        const completeSpy = jest.spyOn(viewer, 'completeSubmit');
        viewer.dispatchEvent(
            new CustomEvent('submitrequest', {
                detail: { payload: { answers: { el_ln: 'Riley' } } }
            })
        );
        await flush();

        expect(submitGuest).toHaveBeenCalledTimes(1);
        const args = submitGuest.mock.calls[0][0];
        expect(args.formId).toBe('a0Xguest');
        expect(JSON.parse(args.payloadJson).answers).toEqual({
            el_ln: 'Riley'
        });
        expect(completeSpy).toHaveBeenCalled();
    });

    it('delegated submit failure: passes the message to the viewer', async () => {
        getGuestSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitGuest.mockRejectedValue({ body: { message: 'Closed.' } });
        const el = mount('a0Xguest');
        await flush();
        await flush();

        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        const failSpy = jest.spyOn(viewer, 'failSubmit');
        viewer.dispatchEvent(
            new CustomEvent('submitrequest', {
                detail: { payload: { answers: {} } }
            })
        );
        await flush();

        expect(failSpy).toHaveBeenCalledWith('Closed.');
    });
});
