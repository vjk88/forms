import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { headerFade, paneFadeEligible, isClear } from '../headerFade';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

/**
 * The header text fade (IMPL_PLAN_HEADER_FADE): the viewer decides from the
 * resolved tokens, with the CSS painters' own scope precedence, whether a
 * wash is due, and whether the header sits straight on the One at a time page.
 */
const PLATE = 'rgba(194, 193, 194, 0.71)';
const PAGE_PLATE = 'rgba(20, 20, 20, 0.6)';

describe('isClear', () => {
    it.each([
        [undefined, true],
        ['', true],
        ['transparent', true],
        ['none', true],
        ['rgba(0, 0, 0, 0)', true],
        ['color-mix(in srgb, #fff 0%, transparent)', true],
        [PLATE, false],
        ['#ffffff', false],
        ['color-mix(in srgb, #fff 40%, transparent)', false],
        ['linear-gradient(red, blue)', false]
    ])('%s -> %s', (value, clear) => {
        expect(isClear(value)).toBe(clear);
    });
});

describe('headerFade', () => {
    it('a header with a plate gets the fade, on by default', () => {
        expect(
            headerFade({ tokens: { '--c-header-plate': PLATE }, header: {} })
        ).toEqual({ on: true, eligible: true, exposed: false });
    });

    it('only textFade: false turns it off; eligibility stays', () => {
        expect(
            headerFade({
                tokens: { '--c-header-plate': PLATE },
                header: { textFade: false }
            })
        ).toEqual({ on: false, eligible: true, exposed: false });
    });

    it('no plate, or an explicitly transparent one: nothing (old snapshots)', () => {
        expect(headerFade({ tokens: {}, header: {} }).eligible).toBe(false);
        expect(
            headerFade({
                tokens: { '--c-header-plate': 'transparent' },
                header: {}
            }).eligible
        ).toBe(false);
    });

    it('a banner reads its own plate, falling back to the base one', () => {
        const header = { bgImage: { url: '/banner.jpg' } };
        expect(
            headerFade({
                tokens: {
                    '--c-header-plate': 'transparent',
                    '--c-header-plate-banner': PLATE
                },
                header
            }).eligible
        ).toBe(true);
        expect(
            headerFade({ tokens: { '--c-header-plate': PLATE }, header })
                .eligible
        ).toBe(true);
        // an explicit transparent banner plate overrides the base one
        expect(
            headerFade({
                tokens: {
                    '--c-header-plate': PLATE,
                    '--c-header-plate-banner': 'transparent'
                },
                header
            }).eligible
        ).toBe(false);
    });

    describe('exposed: the header straight on the One at a time page', () => {
        const tokens = { '--c-header-plate': PAGE_PLATE };

        it('flush, no banner, no photo, gradient or fill: exposed', () => {
            expect(
                headerFade({ tokens, header: {}, flush: true }).exposed
            ).toBe(true);
            expect(
                headerFade({
                    tokens: {
                        ...tokens,
                        '--c-header-bg': 'transparent',
                        '--c-header-bg-gradient': 'none'
                    },
                    header: {},
                    flush: true
                }).exposed
            ).toBe(true);
        });

        it.each([
            ['a banner', {}, { bgImage: { url: '/b.jpg' } }],
            ['a theme photo', { '--c-header-bg-image': 'url("/p.jpg")' }, {}],
            [
                'a gradient',
                {
                    '--c-header-bg-gradient':
                        'linear-gradient(135deg, #111, #333)'
                },
                {}
            ],
            ['a fill', { '--c-header-bg': '#123456' }, {}],
            [
                'a translucent fill',
                {
                    '--c-header-bg': 'color-mix(in srgb, #fff 30%, transparent)'
                },
                {}
            ]
        ])('%s: the header has its own surface, not exposed', (n, t, h) => {
            const banner = h.bgImage
                ? { '--c-header-plate-banner': PAGE_PLATE }
                : {};
            expect(
                headerFade({
                    tokens: { ...tokens, ...banner, ...t },
                    header: h,
                    flush: true
                }).exposed
            ).toBe(false);
        });

        it('not flush (inside the card): never exposed', () => {
            expect(headerFade({ tokens, header: {} }).exposed).toBe(false);
        });

        it('no plate: never exposed, even switched off it keeps the room', () => {
            expect(
                headerFade({ tokens: {}, header: {}, flush: true }).exposed
            ).toBe(false);
            expect(
                headerFade({
                    tokens,
                    header: { textFade: false },
                    flush: true
                })
            ).toEqual({ on: false, eligible: true, exposed: true });
        });
    });
});

describe('paneFadeEligible: the pane picks its own scope', () => {
    it('banner, else page when immersive, else the card plate', () => {
        const tokens = {
            '--c-header-plate': PLATE,
            '--c-header-plate-page': 'transparent',
            '--c-header-plate-banner': PAGE_PLATE
        };
        expect(paneFadeEligible({ tokens, paneBanner: true })).toBe(true);
        expect(paneFadeEligible({ tokens, bleed: true })).toBe(false);
        expect(paneFadeEligible({ tokens })).toBe(true);
    });

    it('the explicit scopes do not fall back to the card plate', () => {
        const tokens = { '--c-header-plate': PLATE };
        expect(paneFadeEligible({ tokens, bleed: true })).toBe(false);
        expect(paneFadeEligible({ tokens, paneBanner: true })).toBe(false);
    });
});

// ---- the viewer wires it through ----

const SPEC = (layout, header, tokens) => ({
    specVersion: 1,
    form: { name: 'Fade' },
    layout: { type: layout, options: {} },
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
    ],
    resolved: {
        tokens,
        engineVersion: 1,
        resolvedAt: '2026-10-31T00:00:00Z'
    }
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function find(root, test) {
    for (const el of root.querySelectorAll('*')) {
        if (test(el)) {
            return el;
        }
        if (el.shadowRoot) {
            const found = find(el.shadowRoot, test);
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
    await flush();
    return cmp;
}

describe('viewer → header and Split pane', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('the header gets the fade decided from the tokens', async () => {
        const cmp = await mount(
            SPEC(
                'scroll',
                { style: 'standard', title: 'T' },
                { '--c-header-plate': PLATE }
            )
        );
        const header = find(
            cmp.shadowRoot,
            (el) => el.tagName === 'C-FINAL-FORM-HEADER'
        );
        expect(header.fade).toEqual({
            on: true,
            eligible: true,
            exposed: false
        });
    });

    it.each([
        ['borrowing the header words', {}],
        ['with its own words', { paneTitle: 'Own title' }]
    ])('Split maps the switch every time (%s)', async (name, paneOptions) => {
        const spec = SPEC(
            'splitHero',
            { style: 'standard', title: 'T', textFade: false },
            { '--c-header-plate': PLATE }
        );
        spec.layout.options = { fullBleed: false, ...paneOptions };
        const cmp = await mount(spec);
        const nav = find(
            cmp.shadowRoot,
            (el) => el.tagName === 'X-TEST' && 'options' in el
        );
        expect(nav.options.paneTextFade).toBe(false);
        expect(nav.options.paneFadeEligible).toBe(true);
    });

    it('Split with the switch untouched: on', async () => {
        const spec = SPEC(
            'splitHero',
            { style: 'standard', title: 'T' },
            { '--c-header-plate-page': PLATE }
        );
        const cmp = await mount(spec);
        const nav = find(
            cmp.shadowRoot,
            (el) => el.tagName === 'X-TEST' && 'options' in el
        );
        expect(nav.options.paneTextFade).toBe(true);
        // immersive by default: the pane reads the page plate
        expect(nav.options.paneFadeEligible).toBe(true);
    });
});
