import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// Respondent type scale: the viewer picks the size set by layout and hands it
// to the page frame (spec section 6). Single question = surveys set to "One
// question per page" on a paginating layout.
const SPEC = ({
    layout = { type: 'scroll' },
    formType = 'form',
    onePerScreen = false,
    tokens
} = {}) => ({
    specVersion: 1,
    form: { name: 'T', type: formType },
    layout,
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Send' },
    settings: { onePerScreen },
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

async function frameFor(spec) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = spec;
    document.body.appendChild(el);
    await flush();
    await flush();
    return el.shadowRoot.querySelector('c-final-page-frame');
}

function clearBody() {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
}

describe('viewer picks the text-size set', () => {
    afterEach(clearBody);

    it.each([
        ['scroll', { type: 'scroll' }],
        ['stepper', { type: 'stepper' }],
        ['tabs', { type: 'tabs' }],
        ['accordion', { type: 'accordion' }],
        ['rail', { type: 'rail' }],
        ['split hero, all fields together', { type: 'splitHero', options: {} }]
    ])('%s uses the Standard set', async (label, layout) => {
        const frame = await frameFor(SPEC({ layout }));
        expect(frame.sizeSet).toBe('standard');
        expect(frame.single).toBe(false);
    });

    it.each([
        ['One at a time', { type: 'oneAtATime' }],
        [
            'split hero, one section at a time',
            { type: 'splitHero', options: { paneFlow: 'oneAtATime' } }
        ]
    ])('%s uses the Section at a time set', async (label, layout) => {
        const frame = await frameFor(SPEC({ layout }));
        expect(frame.sizeSet).toBe('section');
    });

    it('a survey set to One question per page is flagged single', async () => {
        const frame = await frameFor(
            SPEC({
                layout: { type: 'stepper' },
                formType: 'survey',
                onePerScreen: true
            })
        );
        expect(frame.single).toBe(true);
        expect(frame.sizeSet).toBe('standard');
    });

    it('One question per page inside One at a time keeps the larger set underneath', async () => {
        const frame = await frameFor(
            SPEC({
                layout: { type: 'oneAtATime' },
                formType: 'survey',
                onePerScreen: true
            })
        );
        expect(frame.single).toBe(true);
        expect(frame.sizeSet).toBe('section');
    });

    it.each([
        [
            'the toggle is off',
            { layout: { type: 'stepper' }, formType: 'survey' }
        ],
        [
            'the form is not a survey',
            {
                layout: { type: 'stepper' },
                formType: 'form',
                onePerScreen: true
            }
        ],
        [
            'the layout does not page',
            {
                layout: { type: 'scroll' },
                formType: 'survey',
                onePerScreen: true
            }
        ]
    ])('not single when %s', async (label, options) => {
        const frame = await frameFor(SPEC(options));
        expect(frame.single).toBe(false);
    });
});

describe('label look ratio reaches old published snapshots', () => {
    afterEach(clearBody);

    it('an uppercase look published before the ratio existed sits at 0.875', async () => {
        const frame = await frameFor(
            SPEC({
                tokens: {
                    '--c-label-transform': 'uppercase',
                    '--c-label-size': '0.6875rem'
                }
            })
        );
        expect(frame.style.getPropertyValue('--c-label-scale')).toBe('0.875');
    });

    it('any other look published before the ratio existed sits at 1', async () => {
        const frame = await frameFor(
            SPEC({ tokens: { '--c-label-transform': 'none' } })
        );
        expect(frame.style.getPropertyValue('--c-label-scale')).toBe('1');
    });

    it('a snapshot that already carries the ratio keeps it', async () => {
        const frame = await frameFor(
            SPEC({
                tokens: {
                    '--c-label-transform': 'none',
                    '--c-label-scale': '0.875'
                }
            })
        );
        expect(frame.style.getPropertyValue('--c-label-scale')).toBe('0.875');
    });
});
