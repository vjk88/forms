import { createElement } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import FinalFormViewer from 'c/finalFormViewer';
import getSpecEnvelope from '@salesforce/apex/FinalSpecController.getSpecEnvelope';
import getUserValues from '@salesforce/apex/FinalAutofillController.getUserValues';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpecEnvelope',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAutofillController.getUserValues',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/** IMPL_PLAN_F2_AUTOFILL 7.2: the signed-in person fills from their own
 *  User record, asked once per session, and a replaced request never leaves
 *  a "could not fill" message behind. */
const SPEC = {
    specVersion: 1,
    form: { name: 'About you', type: 'freeform' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Send' },
    settings: {
        completion: { mode: 'screen' },
        prefill: {
            rulesVersion: 1,
            autofillRules: [
                {
                    id: 'af_me',
                    enabled: true,
                    policy: 'preserveEdits',
                    source: { type: 'user' },
                    mappings: [{ from: 'Email', to: 'el_email' }]
                },
                {
                    id: 'af_link',
                    enabled: true,
                    policy: 'preserveEdits',
                    source: { type: 'link', objectApiName: 'Contact' },
                    mappings: [{ from: 'Phone', to: 'el_phone' }]
                }
            ]
        }
    },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_email',
                            type: 'field',
                            label: 'Email',
                            render: { inputType: 'email' }
                        },
                        {
                            id: 'el_phone',
                            type: 'field',
                            label: 'Phone',
                            render: { inputType: 'phone' }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
};

async function open() {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    document.body.appendChild(el);
    CurrentPageReference.emit({ state: { c__formId: 'a0Fform' } });
    await flush();
    await flush();
    return el;
}

describe('c-final-form-viewer signed-in person', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        getSpecEnvelope.mockResolvedValue({
            versionId: 'a0Vserved',
            formId: 'a0Fform',
            spec: JSON.stringify(SPEC)
        });
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('fills from the published version, asking once', async () => {
        getUserValues.mockResolvedValue({
            af_me: { el_email: 'me@example.com' }
        });
        const el = await open();
        await flush();
        expect(getUserValues).toHaveBeenCalledTimes(1);
        expect(getUserValues).toHaveBeenCalledWith({
            formId: 'a0Fform',
            versionId: 'a0Vserved'
        });
        expect(el.answers.el_email).toBe('me@example.com');
    });

    it('a plan arriving mid-request asks again, and the replaced request never raises an error', async () => {
        let first;
        getUserValues
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        first = resolve;
                    })
            )
            .mockResolvedValue({ af_me: { el_email: 'me@example.com' } });
        const el = await open();
        expect(getUserValues).toHaveBeenCalledTimes(1);

        // the host's plan upgrades the link rule: the rules contract moves
        el.autofillPlan = {
            versionId: 'a0Vserved',
            rules: [
                {
                    ruleId: 'af_link',
                    objectApiName: 'Contact',
                    mappings: [{ from: 'MobilePhone', to: 'el_phone' }]
                }
            ]
        };
        await flush();
        expect(getUserValues).toHaveBeenCalledTimes(2);
        expect(el.answers.el_email).toBe('me@example.com');

        // the first reply lands late and is ignored
        first({ af_me: { el_email: 'stale@example.com' } });
        await flush();
        expect(el.answers.el_email).toBe('me@example.com');

        jest.advanceTimersByTime(11000);
        await flush();
        expect(el.submitError).toBeFalsy();
    });

    it('a request that never answers says so once, after 10 seconds', async () => {
        getUserValues.mockImplementation(() => new Promise(() => {}));
        const el = await open();
        jest.advanceTimersByTime(11000);
        await flush();
        expect(el.submitError).toMatch(/Could not fill/);
    });
});
