import { contrastRatio } from 'c/finalThemeEngine';

describe('contrastRatio (WCAG 2.x)', () => {
    it('black on white is 21:1', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    });

    it('is symmetric', () => {
        expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(
            contrastRatio('#000000', '#ffffff'),
            5
        );
    });

    it('same color is 1:1', () => {
        expect(contrastRatio('#0d9488', '#0d9488')).toBeCloseTo(1, 5);
    });

    it('teal accent on white lands in the large-text-only band (the Nordic finding)', () => {
        const r = contrastRatio('#0d9488', '#ffffff');
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThan(4.5);
    });

    it('supports 3-digit hex', () => {
        expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    });

    it('returns null for unparseable input, never a fake pass', () => {
        expect(contrastRatio('rgba(0,0,0,0.5)', '#ffffff')).toBeNull();
        expect(contrastRatio('#ffffff', 'transparent')).toBeNull();
        expect(contrastRatio(null, '#ffffff')).toBeNull();
    });
});
