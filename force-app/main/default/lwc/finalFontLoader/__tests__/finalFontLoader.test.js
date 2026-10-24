import { ensureFont } from 'c/finalFontLoader';

describe('finalFontLoader.ensureFont', () => {
    afterEach(() => {
        document.head
            .querySelectorAll('style[id^="final-font"]')
            .forEach((s) => s.remove());
    });

    it('injects a @font-face style tag into the global head', () => {
        const ok = ensureFont({
            key: 'My_Brand',
            family: 'My Brand',
            resource: 'brand_fonts',
            regularPath: 'fonts/Regular.woff2',
            boldPath: 'fonts/Bold.woff2'
        });
        expect(ok).toBe(true);
        const tag = document.getElementById('final-font-my-brand');
        expect(tag).not.toBeNull();
        expect(tag.textContent).toContain("font-family: 'My Brand'");
        expect(tag.textContent).toContain(
            "url('/resource/brand_fonts/fonts/Regular.woff2')"
        );
        expect(tag.textContent).toContain('font-weight: bold');
        expect(tag.textContent).toContain('font-display: swap');
    });

    it('single-file resource: the resource path IS the url; no bold face', () => {
        ensureFont({ key: 'Solo', family: 'Solo', resource: 'solo_font' });
        const tag = document.getElementById('final-font-solo');
        expect(tag.textContent).toContain("url('/resource/solo_font')");
        expect(tag.textContent).not.toContain('font-weight: bold');
    });

    it('is idempotent — one tag per font', () => {
        ensureFont({ key: 'Dup', family: 'Dup', resource: 'r' });
        ensureFont({ key: 'Dup', family: 'Dup', resource: 'r' });
        expect(document.querySelectorAll('#final-font-dup').length).toBe(1);
    });

    it('resolved faces: url used as given, one rule per face, weight ranges kept', () => {
        ensureFont({
            key: 'Faces',
            family: 'Faces',
            faces: [
                {
                    url: '/resource/123/ns__formFonts/a.woff2',
                    weight: '400 700'
                },
                { url: '/resource/123/ns__formFonts/b.woff2', weight: '700' }
            ]
        });
        const css = document.getElementById('final-fontb-faces').textContent;
        expect(css.match(/@font-face/g)).toHaveLength(2);
        expect(css).toContain("url('/resource/123/ns__formFonts/a.woff2')");
        expect(css).toContain('font-weight: 400 700');
        expect(css).toContain('font-weight: 700');
        expect(css).not.toContain('/resource/undefined');
    });

    it('resolved faces: bad weights and empty urls are dropped; nothing left → false', () => {
        expect(
            ensureFont({
                key: 'Bad',
                family: 'Bad',
                faces: [
                    { url: '', weight: '400' },
                    { url: '/x.woff2', weight: '400; color: red' }
                ]
            })
        ).toBe(false);
        expect(document.getElementById('final-fontb-bad')).toBeNull();
    });

    it('refuses a family or address that could break out of the @font-face rule', () => {
        expect(
            ensureFont({
                key: 'Evil_Family',
                family: "X'; } body { display: none } @font-face { font-family: 'Y",
                resource: 'r'
            })
        ).toBe(false);
        expect(
            ensureFont({
                key: 'Evil_Path',
                family: 'Evil Path',
                resource: 'r',
                regularPath: "a.woff2') } body { color: red } x { src: url('b"
            })
        ).toBe(false);
        expect(
            ensureFont({
                key: 'Evil_Face',
                family: 'Evil Face',
                faces: [{ url: "x.woff2');}*{display:none", weight: '400' }]
            })
        ).toBe(false);
        expect(document.getElementById('final-font-evil-family')).toBeNull();
        expect(document.getElementById('final-font-evil-path')).toBeNull();
        expect(document.getElementById('final-fontb-evil-face')).toBeNull();
    });

    it('an uploaded key can never take a resolved-face font id', () => {
        ensureFont({ key: 'bundled-inter', family: 'Upload', resource: 'u' });
        ensureFont({
            key: 'bundled-inter',
            family: 'FormsBundledInter',
            faces: [
                {
                    url: '/resource/1/formFonts/inter/i.woff2',
                    weight: '400 700'
                }
            ]
        });
        expect(
            document.getElementById('final-font-bundled-inter')
        ).not.toBeNull();
        expect(
            document.getElementById('final-fontb-bundled-inter')
        ).not.toBeNull();
    });

    it('rejects incomplete configs', () => {
        expect(ensureFont(null)).toBe(false);
        expect(ensureFont({ family: 'NoResource' })).toBe(false);
        expect(ensureFont({ resource: 'no_family' })).toBe(false);
    });
});
