import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';

// Fonts A1 (IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3 step 6): a published form
// registers its fonts from `resolved.fonts` alone — the theme recipe is never
// fetched on that path, so a font living only inside an org theme must ride
// in the snapshot.

jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1719444000000/acme__formFonts' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

const BRAND_X = {
    key: 'Brand_X',
    family: 'Brand X',
    fallback: 'serif',
    resource: 'brand_x',
    regularPath: 'r.woff2',
    boldPath: 'b.woff2'
};
const BRAND_Y = {
    key: 'Brand_Y',
    family: 'Brand Y',
    fallback: 'sans-serif',
    resource: 'brand_y'
};

const published = (extra) => ({
    specVersion: 1,
    layout: { type: 'scroll' },
    theme: {
        source: 'custom',
        name: 'a0X000000000001',
        ...(extra.theme || {})
    },
    header: { style: 'standard', title: 'T' },
    submit: {},
    pages: [{ key: 'p1', sections: [] }],
    resolved: {
        tokens: {
            '--c-font-display': "'Brand X', serif",
            '--c-font-body': "'Brand Y', sans-serif"
        },
        engineVersion: 1,
        resolvedAt: '2026-10-24T00:00:00Z',
        ...(extra.resolved || {})
    }
});

async function mount(spec) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = spec;
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

const fontTags = () => [
    ...document.head.querySelectorAll('style[id^="final-font-"]')
];

describe('published form fonts come from the snapshot manifest', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        fontTags().forEach((t) => t.remove());
    });

    it('an org theme with two uploaded fonts: both register, no Apex call', async () => {
        await mount(
            published({
                resolved: {
                    fonts: [
                        { ...BRAND_X, source: 'uploaded' },
                        { ...BRAND_Y, source: 'uploaded' }
                    ]
                }
            })
        );
        expect(getCustomTheme).not.toHaveBeenCalled();
        const x = document.getElementById('final-font-brand-x');
        const y = document.getElementById('final-font-brand-y');
        expect(x.textContent).toContain("url('/resource/brand_x/b.woff2')");
        expect(y.textContent).toContain("url('/resource/brand_y')");
    });

    it('bundled fonts in the manifest register under their aliases at this org’s address', async () => {
        await mount(
            published({
                resolved: { fonts: [{ source: 'bundled', key: 'inter' }] }
            })
        );
        const css = document.getElementById(
            'final-font-bundled-inter'
        ).textContent;
        expect(css).toContain("'FormsBundledInter'");
        expect(css).toContain('/resource/1719444000000/acme__formFonts/inter/');
    });

    it('a snapshot from before the manifest keeps today’s path: the form’s own customFont', async () => {
        // (a font the loader has not seen in this file: it remembers
        // registrations for the life of the page)
        const BRAND_Z = {
            key: 'Brand_Z',
            family: 'Brand Z',
            resource: 'brand_z'
        };
        await mount(
            published({
                theme: { overrides: { customFont: BRAND_Z } }
            })
        );
        expect(document.getElementById('final-font-brand-z')).not.toBeNull();
        expect(fontTags()).toHaveLength(1);
        expect(getCustomTheme).not.toHaveBeenCalled();
    });

    it('a family name in the tokens alone never loads anything', async () => {
        const spec = published({});
        spec.resolved.tokens['--c-font-body'] =
            "'FormsBundledInter', sans-serif";
        await mount(spec);
        expect(fontTags()).toHaveLength(0);
    });
});
