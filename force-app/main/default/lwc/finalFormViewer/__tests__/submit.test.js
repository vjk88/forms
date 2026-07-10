import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'Submit', targetObject: 'Contact' },
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
                            id: 'el_ln',
                            type: 'field',
                            label: 'Last name',
                            render: { inputType: 'text' }
                        }
                    ]
                },
                {
                    id: 'sec_rep',
                    title: 'Team',
                    style: 'plain',
                    columns: 1,
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
                            required: true,
                            validation: [
                                { type: 'required', message: 'Need it.' }
                            ],
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
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

describe('c-final-form-viewer submit engine (P3 gate)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('published path: answers + consolidated repeats reach the Apex payload; success renders After Submit', async () => {
        getSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitForm.mockResolvedValue({ recordId: '003X', childCount: 1 });
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.versionId = 'a0Vx';
        document.body.appendChild(el);
        await flush();
        await flush();

        // answer the parent field + one repeat entry
        const input = deepQuery(el.shadowRoot, 'lightning-input');
        input.value = 'Riley';
        input.type = 'text';
        input.dispatchEvent(new CustomEvent('change'));
        const entryInput = deepQuery(el.shadowRoot, '.rep-entry')
            .querySelector('c-final-element-renderer')
            .shadowRoot.querySelector('lightning-input');
        entryInput.value = 'Hello';
        entryInput.type = 'text';
        entryInput.dispatchEvent(new CustomEvent('change'));

        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar.dispatchEvent(new CustomEvent('submit'));
        await flush();
        await flush();

        expect(submitForm).toHaveBeenCalledTimes(1);
        const args = submitForm.mock.calls[0][0];
        expect(args.versionId).toBe('a0Vx');
        const payload = JSON.parse(args.payloadJson);
        expect(payload.answers).toEqual({ el_ln: 'Riley' });
        expect(payload.repeats.sec_rep[0].el_subj).toBe('Hello');
        expect(payload.meta.submittedAt).toBeTruthy();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });

    it('a failed submit shows the banner, keeps the form, and allows retry', async () => {
        getSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitForm.mockRejectedValue({
            body: { message: 'Nope from the server.' }
        });
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.versionId = 'a0Vx';
        document.body.appendChild(el);
        await flush();
        await flush();

        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar.dispatchEvent(new CustomEvent('submit'));
        await flush();
        await flush();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).toBeNull();
        expect(
            deepQuery(el.shadowRoot, '.viewer-submit-error').textContent
        ).toContain('Nope from the server.');

        submitForm.mockResolvedValue({ recordId: '003X' });
        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });

    it('authoring/inline previews SIMULATE — no record is ever created', async () => {
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.spec = JSON.parse(JSON.stringify(SPEC));
        el.authoring = true;
        document.body.appendChild(el);
        await flush();

        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar.dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });

    it('the After-Submit continue intent navigates to a custom URL', async () => {
        getSpec.mockResolvedValue(JSON.stringify(SPEC));
        submitForm.mockResolvedValue({ recordId: '003X' });
        const assign = jest.fn();
        delete window.location;
        window.location = { assign };

        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.versionId = 'a0Vx';
        document.body.appendChild(el);
        await flush();
        await flush();
        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();

        const after = deepQuery(el.shadowRoot, 'c-final-after-submit');
        after.dispatchEvent(
            new CustomEvent('continue', {
                detail: { goesTo: 'url', url: 'https://example.com/thanks' }
            })
        );
        expect(assign).toHaveBeenCalledWith('https://example.com/thanks');
    });
});
