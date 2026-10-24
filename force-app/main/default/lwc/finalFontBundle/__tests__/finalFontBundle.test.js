import { bundledFaces, ensureFontRef, ensureFontRefs } from 'c/finalFontBundle';
import { BUNDLED_FONTS } from 'c/finalFontFamilies';

// A subscriber org's real bundle address (namespace + cache-buster).
jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1719444000000/acme__formFonts' }),
    { virtual: true }
);

const tags = () => [
    ...document.head.querySelectorAll('style[id^="final-font"]')
];

describe('finalFontBundle', () => {
    afterEach(() => tags().forEach((s) => s.remove()));

    it('bundled faces use the resource import, never a hand-built /resource path', () => {
        expect(bundledFaces('inter')).toEqual([
            {
                url: '/resource/1719444000000/acme__formFonts/inter/Inter-latin-wght.woff2',
                weight: '400 700'
            }
        ]);
        expect(bundledFaces('missing')).toEqual([]);
    });

    it('a variable family registers ONE face with its weight range, under its alias', () => {
        expect(ensureFontRef({ source: 'bundled', key: 'inter' })).toBe(true);
        const css = document.getElementById(
            'final-fontb-bundled-inter'
        ).textContent;
        expect(css).toContain("font-family: 'FormsBundledInter'");
        expect(css).toContain('font-weight: 400 700');
        expect(css.match(/@font-face/g)).toHaveLength(1);
        expect(css).not.toContain("font-family: 'Inter'");
    });

    it('a single-weight family registers its one real weight', () => {
        ensureFontRef({ source: 'bundled', key: 'bebasNeue' });
        const css = document.getElementById(
            'final-fontb-bundled-bebasneue'
        ).textContent;
        expect(css).toContain("font-family: 'FormsBundledBebasNeue'");
        expect(css).toContain('font-weight: 400;');
    });

    it('uploaded references go through the loader exactly as customFont always did', () => {
        ensureFontRef({
            source: 'uploaded',
            key: 'Brand_Q',
            family: 'Brand Q',
            resource: 'brand_q',
            regularPath: 'r.woff2'
        });
        const css = document.getElementById('final-font-brand-q').textContent;
        expect(css).toContain("url('/resource/brand_q/r.woff2')");
    });

    it('an uploaded reference cannot bring its own addresses', () => {
        ensureFontRef({
            source: 'uploaded',
            key: 'Sneaky',
            family: 'Sneaky',
            resource: 'sneaky_font',
            faces: [{ url: 'https://evil.example/x.woff2', weight: '400' }]
        });
        const css = document.getElementById('final-font-sneaky').textContent;
        expect(css).toContain("url('/resource/sneaky_font')");
        expect(css).not.toContain('evil.example');
    });

    it('installed stacks and junk load nothing', () => {
        expect(ensureFontRef({ source: 'stack', key: 'system' })).toBe(false);
        expect(ensureFontRef({ source: 'bundled', key: 'missing' })).toBe(
            false
        );
        expect(ensureFontRef(null)).toBe(false);
        expect(ensureFontRef({ source: 'bundled', key: 'constructor' })).toBe(
            false
        );
        expect(ensureFontRef({ source: 'bundled', key: 'toString' })).toBe(
            false
        );
        ensureFontRefs('nope');
        ensureFontRefs([null, 42, { source: 'stack', key: 'mono' }]);
        expect(tags()).toHaveLength(0);
    });

    it('never registers a bundled face under its ordinary name', () => {
        ensureFontRefs(
            Object.keys(BUNDLED_FONTS).map((key) => ({
                source: 'bundled',
                key
            }))
        );
        const all = tags()
            .map((t) => t.textContent)
            .join('\n');
        Object.values(BUNDLED_FONTS).forEach((f) => {
            expect(all).not.toContain(`font-family: '${f.name}'`);
        });
    });
});
