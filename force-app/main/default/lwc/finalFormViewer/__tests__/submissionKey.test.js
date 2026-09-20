import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

/**
 * The idempotency key (FREEFORM_SPEC D15) must last exactly as long as the
 * answers it identifies — no longer.
 *
 * Too short and a retry stores a second submission. Too long and the server,
 * which matches on the key, answers a NEW form's submit with the PREVIOUS
 * form's submission: success reported, nothing stored. The second is worse,
 * because nobody finds out.
 *
 * The guest host is where this bites: it hands the viewer a `spec` and never
 * a formId or versionId, so a switch of forms is a reassignment of `spec` and
 * nothing else.
 */
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const specFor = (name) => ({
    specVersion: 1,
    form: { name, targetObject: 'Contact' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Send' },
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
});

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

/** Submit once and hand back the key the viewer put on the payload. */
async function submitAndReadKey(el, keys) {
    deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    return keys[keys.length - 1];
}

describe('c-final-form-viewer submission key lifetime', () => {
    let el;
    let keys;

    beforeEach(async () => {
        keys = [];
        el = createElement('c-final-form-viewer', { is: FinalFormViewer });
        el.spec = specFor('Form A');
        el.delegateSubmit = true;
        el.addEventListener('submitrequest', (e) =>
            keys.push(e.detail.payload.meta.submissionKey)
        );
        document.body.appendChild(el);
        await flush();
        await flush();
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('mints a key at all, and a random-looking one', async () => {
        const key = await submitAndReadKey(el, keys);
        expect(key).toMatch(/^[0-9a-f]{32}$/);
    });

    it('keeps the same key across a retry, so one answer stores once', async () => {
        const first = await submitAndReadKey(el, keys);
        el.failSubmit('The network ate it.');
        await flush();
        const retry = await submitAndReadKey(el, keys);

        expect(retry).toBe(first);
    });

    it('mints a NEW key when the host loads a different form', async () => {
        const first = await submitAndReadKey(el, keys);
        el.failSubmit('Never mind, different form now.');
        await flush();

        // the guest host switching forms: a new spec, nothing else
        el.spec = specFor('Form B');
        await flush();
        await flush();

        const second = await submitAndReadKey(el, keys);
        expect(second).toMatch(/^[0-9a-f]{32}$/);
        expect(second).not.toBe(first);
    });
});
