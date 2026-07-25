import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';

// Phase A2: with delegateSubmit, a validated submit emits `submitrequest` and
// NEVER calls internal Apex or simulates — even though the guest host feeds an
// inline spec (which would otherwise trip the preview-simulate branch).
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'Guest', targetObject: 'Contact' },
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

function mount() {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(SPEC));
    el.delegateSubmit = true;
    document.body.appendChild(el);
    return el;
}

describe('c-final-form-viewer delegated submit (guest host, A2)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('emits submitrequest with the payload and never calls internal Apex', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('submitrequest', handler);
        await flush();
        await flush();

        const input = deepQuery(el.shadowRoot, 'lightning-input');
        input.value = 'Riley';
        input.type = 'text';
        input.dispatchEvent(new CustomEvent('change'));

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.payload.answers).toEqual({
            el_ln: 'Riley'
        });
        expect(submitForm).not.toHaveBeenCalled();
        // nothing completes until the host resolves it
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).toBeNull();
    });

    it('failSubmit() shows the error + allows retry; completeSubmit() shows After Submit', async () => {
        const el = mount();
        await flush();
        await flush();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();

        el.failSubmit('Server said no.');
        await flush();
        expect(
            deepQuery(el.shadowRoot, '.viewer-submit-error').textContent
        ).toContain('Server said no.');
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).toBeNull();

        // retry — the submit guard was released by failSubmit
        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        el.completeSubmit();
        await flush();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });
});
