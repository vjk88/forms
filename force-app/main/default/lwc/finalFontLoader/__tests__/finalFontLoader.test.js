import { ensureFont } from 'c/finalFontLoader';

describe('finalFontLoader.ensureFont', () => {
    afterEach(() => {
        document.head
            .querySelectorAll('style[id^="final-font-"]')
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
        expect(
            document.querySelectorAll('#final-font-dup').length
        ).toBe(1);
    });

    it('rejects incomplete configs', () => {
        expect(ensureFont(null)).toBe(false);
        expect(ensureFont({ family: 'NoResource' })).toBe(false);
        expect(ensureFont({ resource: 'no_family' })).toBe(false);
    });
});
