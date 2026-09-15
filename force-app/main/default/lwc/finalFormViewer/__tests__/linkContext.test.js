import { createElement } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import FinalFormViewer from 'c/finalFormViewer';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getLinkContext from '@salesforce/apex/FinalAutofillController.getLinkContext';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAutofillController.getLinkContext',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/** Owner 2026-09-15: a personalized link (?c__rt=) works for everyone. Inside
 *  Salesforce there is no guest host, so the viewer itself reads the token,
 *  fills the form from it, and sends it with the submit. */
const SPEC = {
    specVersion: 1,
    form: { name: 'Support', targetObject: 'Case' },
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
                    id: 'af_link',
                    name: 'Contact link',
                    enabled: true,
                    policy: 'preserveEdits',
                    source: { type: 'link', objectApiName: 'Contact' },
                    mappings: [
                        { from: 'Email', to: 'el_email', guestAllowed: true }
                    ]
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
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

const CONTEXT = {
    status: 'applied',
    autofill: [{ ruleId: 'af_link', values: { el_email: 'ada@example.com' } }]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQuery(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) {
        return direct;
    }
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

async function open(state) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    document.body.appendChild(el);
    CurrentPageReference.emit({ state });
    // spec load → apply → link context → autofill patch
    await flush();
    await flush();
    await flush();
    await flush();
    await flush();
    return el;
}

describe('c-final-form-viewer personalized link inside Salesforce', () => {
    beforeEach(() => {
        getSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitForm.mockResolvedValue({ recordId: '500000000000001AAA' });
        getLinkContext.mockResolvedValue(CONTEXT);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('fills the form from the link token in the URL', async () => {
        const el = await open({
            c__formId: 'a05000000000001AAA',
            c__rt: 'tok'
        });

        expect(getLinkContext).toHaveBeenCalledTimes(1);
        expect(getLinkContext).toHaveBeenCalledWith({
            formId: 'a05000000000001AAA',
            token: 'tok'
        });
        expect(el.answers.el_email).toBe('ada@example.com');
    });

    it('sends the token with the submit so the server can check and burn it', async () => {
        const el = await open({
            c__formId: 'a05000000000001AAA',
            c__rt: 'tok'
        });

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();

        expect(submitForm).toHaveBeenCalledTimes(1);
        const meta = JSON.parse(submitForm.mock.calls[0][0].payloadJson).meta;
        expect(meta.rt).toBe('tok');
    });

    it('without a token it asks for nothing and sends nothing', async () => {
        const el = await open({ c__formId: 'a05000000000001AAA' });

        expect(getLinkContext).not.toHaveBeenCalled();
        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();
        const meta = JSON.parse(submitForm.mock.calls[0][0].payloadJson).meta;
        expect(meta.rt).toBeUndefined();
    });

    it('a dead link still renders the form, just unfilled', async () => {
        getLinkContext.mockResolvedValue({
            status: 'unavailable',
            autofill: []
        });
        const el = await open({
            c__formId: 'a05000000000001AAA',
            c__rt: 'old'
        });

        expect(deepQuery(el.shadowRoot, 'c-final-submit-bar')).not.toBeNull();
        expect(el.answers.el_email).toBeUndefined();
    });
});
