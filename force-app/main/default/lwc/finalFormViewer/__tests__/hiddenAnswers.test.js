import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const WHEN_YES = {
    action: 'show',
    logic: 'all',
    rules: [{ source: 'el_driver', operator: 'equals', value: 'Yes' }]
};

const SPEC = {
    specVersion: 1,
    form: { name: 'Hidden', targetObject: 'Contact' },
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
                    title: 'S',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_driver',
                            type: 'field',
                            label: 'Driver',
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_secret',
                            type: 'field',
                            label: 'Secret',
                            visibility: WHEN_YES,
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_cv',
                            type: 'file',
                            label: 'CV',
                            visibility: WHEN_YES
                        }
                    ]
                },
                {
                    id: 'sec_rep',
                    title: 'Team',
                    style: 'plain',
                    columns: 1,
                    visibility: WHEN_YES,
                    repeat: {
                        childObject: 'Case',
                        relationshipField: 'ContactId',
                        min: 1
                    },
                    elements: [
                        {
                            id: 'el_subj',
                            type: 'field',
                            label: 'Subject',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQueryAll(root, selector, acc = []) {
    acc.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            deepQueryAll(el.shadowRoot, selector, acc);
        }
    }
    return acc;
}
const deepQuery = (root, selector) => deepQueryAll(root, selector)[0] || null;

/** Type into the lightning-input carrying `label`, driving the real relay
 *  chain (renderer → section → zones → viewer) rather than poking answers. */
function typeInto(el, label, value) {
    const input = deepQueryAll(el.shadowRoot, 'lightning-input').find(
        (i) => i.label === label
    );
    if (!input) {
        throw new Error(`no input labelled "${label}" is on screen`);
    }
    input.value = value;
    input.type = 'text';
    input.dispatchEvent(new CustomEvent('change'));
}

/** Mount on the DELEGATED submit path (the guest host's): it hands over the
 *  very same `_payload()` but leaves the form on screen, so one instance can
 *  be submitted, re-answered and submitted again. After Submit would replace
 *  the form and there would be nothing left to type into. */
async function mount(spec) {
    getSpec.mockResolvedValue(JSON.stringify(spec || SPEC));
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    el.delegateSubmit = true;
    el.payloads = [];
    el.addEventListener('submitrequest', (e) =>
        el.payloads.push(e.detail.payload)
    );
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

async function submit(el) {
    deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    await flush();
    el.failSubmit('release the guard'); // frees the one-click lock for a retry
    await flush();
}

describe('c-final-form-viewer — rule-hidden answers never reach the server', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('a hidden element keeps its answer in memory but is dropped from the payload; showing it again restores the value', async () => {
        const el = await mount();

        // reveal the conditional question and answer it
        typeInto(el, 'Driver', 'Yes');
        await flush();
        typeInto(el, 'Secret', 'classified');
        await flush();

        // hide it again — the answer stays in the store, out of the payload
        typeInto(el, 'Driver', 'No');
        await flush();
        await submit(el);
        expect(el.payloads[0].answers).toEqual({ el_driver: 'No' });

        // flip the rule back: the typing survived, and now it ships
        typeInto(el, 'Driver', 'Yes');
        await flush();
        await submit(el);
        expect(el.payloads[1].answers.el_secret).toBe('classified');
    });

    it('a hidden REQUIRED element does not block submit', async () => {
        const spec = JSON.parse(JSON.stringify(SPEC));
        const secret = spec.pages[0].sections[0].elements[1];
        secret.required = true;
        secret.validation = [{ type: 'required', message: 'Need it.' }];
        const el = await mount(spec);
        typeInto(el, 'Driver', 'No'); // el_secret is required, and hidden
        await flush();
        await submit(el);
        expect(el.payloads).toHaveLength(1);
        expect('el_secret' in el.payloads[0].answers).toBe(false);
    });

    it('a hidden repeat section drops its consolidated entry', async () => {
        const el = await mount();
        typeInto(el, 'Driver', 'Yes');
        await flush();
        const entry = deepQuery(el.shadowRoot, '.rep-entry')
            .querySelector('c-final-element-renderer')
            .shadowRoot.querySelector('lightning-input');
        entry.value = 'Hello';
        entry.type = 'text';
        entry.dispatchEvent(new CustomEvent('change'));
        await flush();
        await submit(el);
        expect(el.payloads[0].repeats.sec_rep[0].el_subj).toBe('Hello');

        typeInto(el, 'Driver', 'No');
        await flush();
        await submit(el);
        expect(el.payloads[1].repeats).toEqual({});
    });

    it('a hidden file element drops its uploads out of the files array', async () => {
        const el = await mount();
        typeInto(el, 'Driver', 'Yes');
        await flush();
        const fileInput = deepQuery(el.shadowRoot, 'input[type="file"]');
        Object.defineProperty(fileInput, 'files', {
            value: [new File(['hello'], 'cv.pdf', { type: 'application/pdf' })],
            configurable: true
        });
        fileInput.dispatchEvent(new CustomEvent('change'));
        await flush();
        await flush();
        await submit(el);
        expect(el.payloads[0].files).toHaveLength(1);

        typeInto(el, 'Driver', 'No');
        await flush();
        await submit(el);
        expect('files' in el.payloads[1]).toBe(false);
    });

    it('a spec with no rules at all skips the filtering pass entirely', async () => {
        const plain = JSON.parse(JSON.stringify(SPEC));
        delete plain.pages[0].sections[0].elements[1].visibility;
        delete plain.pages[0].sections[0].elements[2].visibility;
        delete plain.pages[0].sections[1].visibility;
        const el = await mount(plain);
        typeInto(el, 'Driver', 'anything');
        typeInto(el, 'Secret', 'kept');
        await flush();
        await submit(el);
        expect(el.payloads[0].answers.el_secret).toBe('kept');
    });
});
