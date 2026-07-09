import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// Preview-click selection sync (P3): in authoring mode a click anywhere in a
// rendered element resolves — via composedPath against the data-el-id the
// section renderer stamps — to `elementselect` {elementId}. Published/guest
// renders (no `authoring`) never emit it.
const SPEC = {
    specVersion: 1,
    form: { name: 'Sync' },
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
                            id: 'el_click',
                            type: 'field',
                            label: 'Click me',
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

async function mount(props = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    Object.assign(el, { spec: SPEC }, props);
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

describe('c-final-form-viewer authoring click → elementselect', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('authoring: a composed click inside an element resolves to its id', async () => {
        const el = await mount({ authoring: true });
        const selects = [];
        el.addEventListener('elementselect', (e) => selects.push(e.detail));

        const host = deepQuery(el.shadowRoot, '[data-el-id="el_click"]');
        expect(host).not.toBeNull();
        host.dispatchEvent(
            new CustomEvent('click', { bubbles: true, composed: true })
        );
        expect(selects).toEqual([{ elementId: 'el_click' }]);
    });

    it('published render (no authoring flag) stays inert', async () => {
        const el = await mount();
        const selects = [];
        el.addEventListener('elementselect', (e) => selects.push(e.detail));
        const host = deepQuery(el.shadowRoot, '[data-el-id="el_click"]');
        host.dispatchEvent(
            new CustomEvent('click', { bubbles: true, composed: true })
        );
        expect(selects).toEqual([]);
    });
});
