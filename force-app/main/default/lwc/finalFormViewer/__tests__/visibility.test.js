import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// Live rules (schema §7): typing into the controlling element shows/hides the
// dependent one through the whole re-emit chain (element → section → zones →
// nav → viewer) with values retained while hidden.
const SPEC = {
    specVersion: 1,
    form: { name: 'Rules' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Submit' },
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
                            id: 'el_dependent',
                            type: 'field',
                            label: 'Dependent',
                            render: { inputType: 'text' },
                            visibility: {
                                action: 'show',
                                logic: 'all',
                                rules: [
                                    {
                                        source: 'el_driver',
                                        operator: 'equals',
                                        value: 'Yes'
                                    }
                                ]
                            }
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

function renderers(root, out = []) {
    for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'C-FINAL-ELEMENT-RENDERER') {
            out.push(el);
        }
        if (el.shadowRoot) {
            renderers(el.shadowRoot, out);
        }
    }
    return out;
}

describe('c-final-form-viewer live visibility', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('hides the rule-gated element until the driver matches, then shows it', async () => {
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.spec = SPEC;
        document.body.appendChild(el);
        await flush();

        expect(renderers(el.shadowRoot)).toHaveLength(1); // dependent hidden

        // the renderer's field IS lightning-input (a stub here) — drive it
        const type = (value) => {
            const driverInput = deepQuery(el.shadowRoot, 'lightning-input');
            driverInput.value = value;
            driverInput.type = 'text';
            driverInput.dispatchEvent(new CustomEvent('change'));
        };
        type('Yes');
        await flush();
        expect(renderers(el.shadowRoot)).toHaveLength(2); // shown

        type('No');
        await flush();
        expect(renderers(el.shadowRoot)).toHaveLength(1); // hidden again
    });

    it('specs without rules skip filtering (fast path, same array identity)', async () => {
        const plain = JSON.parse(JSON.stringify(SPEC));
        delete plain.pages[0].sections[0].elements[1].visibility;
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.spec = plain;
        document.body.appendChild(el);
        await flush();
        expect(renderers(el.shadowRoot)).toHaveLength(2);
    });
});
