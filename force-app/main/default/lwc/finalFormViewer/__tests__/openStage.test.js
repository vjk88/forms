import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// One at a time (owner 2026-10-03, design-explorations/01): the viewer tells the
// nav how the screen's section drops its box, and tells the header to run flush
// with the progress strip that follows it. Both apply only to One at a time.
const SPEC = ({ layout, tokens } = {}) => ({
    specVersion: 1,
    form: { name: 'T', type: 'survey' },
    layout,
    header: { style: 'standard', title: 'Pulse', description: 'Two minutes' },
    theme: null,
    submit: { label: 'Send' },
    settings: {},
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'S',
                    style: 'card',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_a',
                            type: 'field',
                            label: 'A',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ],
    ...(tokens
        ? {
              resolved: {
                  tokens,
                  engineVersion: 1,
                  resolvedAt: '2026-10-03T00:00:00Z'
              }
          }
        : {})
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(spec) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = spec;
    document.body.appendChild(el);
    await flush();
    await flush();
    const frame = el.shadowRoot.querySelector('c-final-page-frame');
    return {
        nav: frame.querySelector('x-test'),
        header: el.shadowRoot.querySelector('c-final-form-header')
    };
}

describe('One at a time open page', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('Immersive on (default): sections open onto the page, header runs flush', async () => {
        const { nav, header } = await mount(
            SPEC({ layout: { type: 'oneAtATime' } })
        );
        expect(nav.options.openSections).toBe(true);
        expect(header.flush).toBe(true);
    });

    it('Immersive off: the box goes inside the card panel too, header keeps its normal spacing', async () => {
        const { nav, header } = await mount(
            SPEC({
                layout: { type: 'oneAtATime', options: { fullBleed: false } }
            })
        );
        expect(nav.options.openSections).toBe(true);
        expect(header.flush).toBe(false);
    });

    it.each([
        ['--c-section-bg'],
        ['--c-section-border'],
        ['--c-section-shadow']
    ])(
        'a deliberate global Section style (%s) keeps its boxes',
        async (token) => {
            const { nav } = await mount(
                SPEC({
                    layout: { type: 'oneAtATime' },
                    tokens: { [token]: 'none' }
                })
            );
            expect(nav.options.openSections).toBe(false);
        }
    );

    it.each(['scroll', 'stepper', 'tabs', 'rail', 'accordion'])(
        '%s is untouched',
        async (type) => {
            const { nav, header } = await mount(SPEC({ layout: { type } }));
            expect(nav.options.openSections).toBeUndefined();
            expect(header.flush).toBe(false);
        }
    );
});
