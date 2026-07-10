import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// F8 gating: pageValidity is the engine's truth, Next/Submit deny on invalid
// pages, and denial REVEALS the failures inline (before that, quiet).
const SPEC = {
    specVersion: 1,
    form: { name: 'Gated' },
    layout: { type: 'stepper', options: { navigation: 'gated' } },
    header: { style: 'none' },
    theme: null,
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
                            id: 'el_email',
                            type: 'field',
                            label: 'Email',
                            required: true,
                            render: { inputType: 'text' },
                            validation: [
                                {
                                    type: 'required',
                                    message: 'Email is required.'
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            id: 'pg_2',
            name: 'Two',
            sections: [
                {
                    id: 'sec_2',
                    title: 'T',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_notes',
                            type: 'field',
                            label: 'Notes',
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

async function mount(spec = SPEC) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

const type = (el, value) => {
    const input = deepQuery(el.shadowRoot, 'lightning-input');
    input.value = value;
    input.type = 'text';
    input.dispatchEvent(new CustomEvent('change'));
};

describe('c-final-form-viewer gating (F8)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('Next denies on an invalid page, reveals the failure, and advances once fixed', async () => {
        const el = await mount();
        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');

        // quiet before any attempt — no premature red
        expect(deepQuery(el.shadowRoot, '.field-error')).toBeNull();

        bar.dispatchEvent(new CustomEvent('next'));
        await flush();
        // still on page 1 (its field is still rendered), failure now inline
        expect(deepQuery(el.shadowRoot, '.field-error').textContent).toBe(
            'Email is required.'
        );

        type(el, 'a@b.co');
        await flush();
        // errors live-update once revealed
        expect(deepQuery(el.shadowRoot, '.field-error')).toBeNull();

        const bar2 = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar2.dispatchEvent(new CustomEvent('next'));
        await flush();
        // page 2's field renders now
        expect(
            deepQuery(el.shadowRoot, 'c-final-element-renderer').element.label
        ).toBe('Notes');
    });

    it('Submit validates every page: jumps to the first invalid one instead of completing', async () => {
        const el = await mount();
        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar.dispatchEvent(new CustomEvent('submit'));
        await flush();

        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).toBeNull();
        expect(deepQuery(el.shadowRoot, '.field-error')).not.toBeNull();

        type(el, 'a@b.co');
        await flush();
        const bar2 = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar2.dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });

    it('gated stepper locks steps past the first invalid page (real pageValidity)', async () => {
        const el = await mount();
        const step2 = deepQuery(el.shadowRoot, '.step-btn[disabled]');
        expect(step2).not.toBeNull();
        expect(step2.textContent).toContain('Two');

        type(el, 'a@b.co');
        await flush();
        expect(deepQuery(el.shadowRoot, '.step-btn[disabled]')).toBeNull();
    });

    it('specs without validation stay all-valid (no gating, no errors possible)', async () => {
        const plain = JSON.parse(JSON.stringify(SPEC));
        plain.pages[0].sections[0].elements[0].validation = [];
        plain.pages[0].sections[0].elements[0].required = false;
        const el = await mount(plain);
        const bar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        bar.dispatchEvent(new CustomEvent('next'));
        await flush();
        expect(
            deepQuery(el.shadowRoot, 'c-final-element-renderer').element.label
        ).toBe('Notes');
    });
});
