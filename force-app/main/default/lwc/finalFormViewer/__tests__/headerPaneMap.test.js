import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// Sweep slice 3: on ownsHeader layouts the pane IS the header, so the header's
// Banner image maps into the pane surface (options.paneImage ← header.bgImage)
// independently of the lockup mapping.
const SPEC = (header) => ({
    specVersion: 1,
    form: { name: 'Map' },
    layout: { type: 'splitHero', options: {} },
    header,
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
                            id: 'el_1',
                            type: 'field',
                            label: 'A',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
});

const flush = () => new Promise((r) => setTimeout(r, 0));

/** sfdx-lwc-jest mounts dynamic (`lwc:is`) components as <x-test> — find the
 *  nav by its `options` @api rather than by tag. */
function findNav(root) {
    for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'X-TEST' && 'options' in el) {
            return el;
        }
        if (el.shadowRoot) {
            const found = findNav(el.shadowRoot);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

async function mount(spec) {
    const cmp = createElement('c-final-form-viewer', { is: FinalFormViewer });
    cmp.spec = spec;
    document.body.appendChild(cmp);
    await flush();
    await flush(); // second tick: the layout module import resolves
    return cmp;
}

describe('header → pane surface mapping (sweep slice 3)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('header.bgImage maps to options.paneImage alongside the lockup', async () => {
        const cmp = await mount(
            SPEC({
                style: 'standard',
                title: 'T',
                bgImage: { url: 'https://x/banner.png', opacity: 55 }
            })
        );
        const nav = findNav(cmp.shadowRoot);
        expect(nav).not.toBeNull();
        expect(nav.options.paneImage).toEqual({
            url: 'https://x/banner.png',
            opacity: 55
        });
        expect(nav.options.paneTitle).toBe('T');
    });

    it('no banner image → no paneImage key invented', async () => {
        const cmp = await mount(SPEC({ style: 'standard', title: 'T' }));
        const nav = findNav(cmp.shadowRoot);
        expect(nav).not.toBeNull();
        expect(nav.options.paneImage).toBeUndefined();
    });
});
