import {
    buildBrandTheme,
    brandContrastReport,
    inkFor,
    BRAND_STYLES
} from 'c/finalBrandTheme';
import { contrastRatio, resolveTokens, fontManifest } from 'c/finalThemeEngine';

// Plan §7: about 50 brand colours × 3 styles. Every text pair reaches 4.5:1
// and every mark 3:1 on EVERY surface, judged on the resolved tokens with
// see-through values composited.

function hsl(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

const NAMED = {
    yellow: '#fbbf24',
    lime: '#84cc16',
    nearWhite: '#fafafa',
    white: '#ffffff',
    nearBlack: '#0a0a0a',
    black: '#000000',
    navy: '#1e3a8a',
    pureGrey: '#808080',
    cyan: '#06b6d4',
    rose: '#e11d48'
};
// 12 hues × 3 lightnesses, plus the mid-tone grey band where neither the
// soft ink nor white reaches 4.5:1
const GRID = [];
for (let h = 0; h < 360; h += 30) {
    [0.3, 0.55, 0.75].forEach((l) => GRID.push(hsl(h, 0.75, l)));
}
const MID_BAND = [];
for (let v = 0x70; v <= 0x8a; v += 6) {
    const x = v.toString(16);
    MID_BAND.push(`#${x}${x}${x}`);
}
const COLORS = [...Object.values(NAMED), ...GRID, ...MID_BAND];

describe('finalBrandTheme: the contrast matrix', () => {
    it('covers at least 50 colours', () => {
        expect(new Set(COLORS).size).toBeGreaterThanOrEqual(50);
    });

    const cases = COLORS.flatMap((c) => BRAND_STYLES.map((s) => [c, s]));
    it.each(cases)(
        '%s · %s: every pair passes on every surface',
        (color, style) => {
            const recipe = buildBrandTheme({ color, style });
            const report = brandContrastReport(recipe);
            const failing = report.checks.filter((c) => !c.pass);
            expect(failing).toEqual([]);
            // and the report really checked the surfaces it claims
            expect(report.checks.length).toBeGreaterThan(40);
        }
    );
});

describe('finalBrandTheme: the three roles of the brand colour', () => {
    it('the button is exactly the brand colour', () => {
        BRAND_STYLES.forEach((style) => {
            const r = buildBrandTheme({ color: '#FBBF24', style });
            expect(resolveTokens(r, null)['--c-submit-bg']).toBe('#fbbf24');
        });
    });

    it('a brand that already reads as text is used unchanged as the accent', () => {
        expect(buildBrandTheme({ color: '#1e3a8a' }).palette.accent).toBe(
            '#1e3a8a'
        );
        expect(
            buildBrandTheme({ color: '#fbbf24', style: 'dark' }).palette.accent
        ).toBe('#fbbf24');
    });

    it('a light brand is darkened for text, a dark brand lightened on Dark, hue kept', () => {
        const light = buildBrandTheme({ color: '#fbbf24' }).palette.accent;
        expect(light).not.toBe('#fbbf24');
        expect(contrastRatio(light, '#ffffff')).toBeGreaterThanOrEqual(4.5);
        const dark = buildBrandTheme({ color: '#1e3a8a', style: 'dark' })
            .palette.accent;
        expect(dark).not.toBe('#1e3a8a');
        // yellow stays warm: red channel still above blue
        const [r, , b] = [1, 3, 5].map((i) =>
            parseInt(light.slice(i, i + 2), 16)
        );
        expect(r).toBeGreaterThan(b);
    });

    it('body text never takes the brand colour', () => {
        const r = buildBrandTheme({ color: '#e11d48' });
        expect(r.palette.text).toBe('#1f2937');
        expect(r.palette.labelColor).toBe('#1f2937');
    });

    it('Bold header: the header is the brand, its text picked by contrast', () => {
        const r = buildBrandTheme({ color: '#7c3aed', style: 'boldHeader' });
        expect(r.palette.headerBg).toBe('#7c3aed');
        expect(r.palette.headerText).toBe('#ffffff');
        const y = buildBrandTheme({ color: '#fbbf24', style: 'boldHeader' });
        expect(y.palette.headerText).toBe('#111827');
    });

    it('the focus ring as painted (55%) reaches 3:1', () => {
        const r = buildBrandTheme({ color: '#06b6d4' });
        const report = brandContrastReport(r);
        const focus = report.checks.filter((c) =>
            c.pair.startsWith('focus ring')
        );
        expect(focus.length).toBeGreaterThan(3);
        focus.forEach((c) => expect(c.ratio).toBeGreaterThanOrEqual(3));
    });
});

describe('inkFor: explicit inks', () => {
    it('uses the soft pair when it passes', () => {
        expect(inkFor('#1e3a8a')).toBe('#ffffff');
        expect(inkFor('#fbbf24')).toBe('#111827');
    });

    it.each(['#808080', '#777777', '#7a7a7a'])(
        'mid-tone %s: falls back to pure black or white and reaches 4.5:1',
        (fill) => {
            const ink = inkFor(fill);
            expect(['#000000', '#ffffff']).toContain(ink);
            expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
        }
    );

    it('#808080 is exactly the case the plan names', () => {
        expect(contrastRatio('#111827', '#808080')).toBeLessThan(4.5);
        expect(inkFor('#808080')).toBe('#000000');
    });
});

describe('finalBrandTheme: the recipe', () => {
    it('is an ordinary theme recipe the engine resolves', () => {
        const r = buildBrandTheme({
            color: '#e11d48',
            style: 'clean',
            name: 'Acme brand'
        });
        expect(r.name).toBe('Acme brand');
        expect(r.brand).toEqual({ color: '#e11d48', style: 'clean' });
        expect(r.typography).toBe('system');
        const t = resolveTokens(r, null);
        expect(t['--c-accent']).toBe(r.palette.accent);
        expect(t['--c-on-accent']).toBe(r.palette.onAccent);
    });

    it('carries a font setting into the recipe and the publish manifest', () => {
        const r = buildBrandTheme({
            color: '#e11d48',
            fonts: { pairing: 'editorialSerif' }
        });
        expect(r.fonts).toEqual({ pairing: 'editorialSerif' });
        expect('typography' in r).toBe(false);
        expect(fontManifest(r, null)).toEqual([
            { source: 'bundled', key: 'playfairDisplay' },
            { source: 'bundled', key: 'lora' }
        ]);
    });

    it('is deterministic, and an unknown style falls back to Clean', () => {
        expect(buildBrandTheme({ color: '#e11d48' })).toEqual(
            buildBrandTheme({ color: '#E11D48' })
        );
        expect(
            buildBrandTheme({ color: '#e11d48', style: 'nope' }).palette
        ).toEqual(
            buildBrandTheme({ color: '#e11d48', style: 'clean' }).palette
        );
    });

    it.each(['', 'red', '#12', '#12345g', null, undefined, 42])(
        'refuses a colour that is not hex (%p)',
        (color) => {
            expect(buildBrandTheme({ color })).toBeNull();
        }
    );

    it('accepts shorthand hex', () => {
        expect(buildBrandTheme({ color: '#f00' }).palette.submitBg).toBe(
            '#ff0000'
        );
    });
});
