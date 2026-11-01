import {
    buildBrandTheme,
    brandContrastReport,
    themeReadability,
    fixReadability,
    hasGradients,
    READABILITY_PATHS
} from 'c/finalBrandTheme';
import { readable, readsOn, ratio } from 'c/finalReadableText';

// IMPL_PLAN_THEME_CREATOR: the theme dialog's readability box and Fix for me.

// A brand recipe WITHOUT its `brand` marker: the engine's own readable-ink
// correction (on for brand recipes) would otherwise repair the colours these
// tests plant before the check could see them.
const brand = (over = {}) => {
    const r = buildBrandTheme({ color: '#1e3a8a' });
    if (!over.keepBrand) delete r.brand;
    delete over.keepBrand;
    r.palette = { ...r.palette, ...(over.palette || {}) };
    r.fieldStates = { ...r.fieldStates, ...(over.fieldStates || {}) };
    return { ...r, ...over, palette: r.palette, fieldStates: r.fieldStates };
};
const failing = (report, name) =>
    report.checks.filter((c) => c.name === name && !c.pass && !c.advisory);

describe('themeReadability', () => {
    it('a generated brand theme passes and was measured completely', () => {
        const report = themeReadability(brand({ keepBrand: true }));
        expect(report.pass).toBe(true);
        expect(report.complete).toBe(true);
        expect(report.unchecked).toEqual([]);
    });

    it('every check names one recipe path for Fix for me', () => {
        const paths = new Set(Object.values(READABILITY_PATHS));
        themeReadability(brand()).checks.forEach((c) =>
            expect(paths.has(c.path)).toBe(true)
        );
    });

    it('a page gradient whose dark stop fails text is reported, not passed on the fill under it', () => {
        const recipe = brand({
            palette: {
                pageBgGradient: {
                    type: 'linear',
                    angle: 90,
                    start: '#ffffff',
                    end: '#222222'
                }
            }
        });
        // the old brand check only sees the solid fill
        expect(brandContrastReport(recipe).pass).toBe(true);
        const report = themeReadability(recipe);
        expect(report.pass).toBe(false);
        expect(
            failing(report, 'text').some(
                (c) => c.where === 'the page gradient (100%)'
            )
        ).toBe(true);
    });

    it('a header gradient over a see-through header is checked (white title on its white end fails)', () => {
        const recipe = brand({
            palette: {
                headerBg: 'transparent',
                headerText: '#ffffff',
                headerBgGradient: {
                    type: 'linear',
                    angle: 90,
                    start: '#ffffff',
                    end: '#1e3a8a'
                }
            }
        });
        const report = themeReadability(recipe);
        const title = failing(report, 'header title');
        expect(title.some((c) => c.where === 'the header gradient (0%)')).toBe(
            true
        );
        // the navy end passes: it is judged on the gradient, not the page
        expect(
            report.checks.find(
                (c) =>
                    c.name === 'header title' &&
                    c.where === 'the header gradient (100%)'
            ).pass
        ).toBe(true);
    });

    it('the middle of a gradient is sampled: #767676 passes both ends of black → white but fails at 50%', () => {
        const recipe = brand({
            palette: {
                text: '#767676',
                pageBgGradient: {
                    type: 'linear',
                    angle: 90,
                    start: '#000000',
                    end: '#ffffff'
                }
            }
        });
        const rows = themeReadability(recipe).checks.filter(
            (c) => c.name === 'text' && c.where.startsWith('the page gradient')
        );
        const at = (pct) => rows.find((c) => c.where.endsWith(`(${pct}%)`));
        expect(rows).toHaveLength(11);
        expect(at(0).pass).toBe(true);
        expect(at(100).pass).toBe(true);
        expect(at(50).pass).toBe(false);
    });

    it('hasGradients tells a theme with any gradient from a solid one', () => {
        expect(hasGradients(brand())).toBe(false);
        expect(
            hasGradients(
                brand({
                    palette: {
                        headerBgGradient: { start: '#111111', end: '#222222' }
                    }
                })
            )
        ).toBe(true);
    });

    it('a header-title gradient is checked stop by stop', () => {
        const recipe = brand({
            palette: {
                headerTitleGradient: { start: '#111827', end: '#f3f4f6' }
            }
        });
        const titles = themeReadability(recipe).checks.filter(
            (c) => c.name === 'header title'
        );
        expect(titles.some((c) => c.pass)).toBe(true);
        expect(titles.some((c) => !c.pass)).toBe(true);
    });

    it('checks the Required marker on its own', () => {
        const report = themeReadability(
            brand({ fieldStates: { required: '#f2c4c4' } })
        );
        expect(failing(report, 'required marker').length).toBeGreaterThan(0);
        expect(
            failing(report, 'required marker').every(
                (c) => c.path === 'fieldStates.required'
            )
        ).toBe(true);
    });

    it('a header with no fill is judged on the page and the card', () => {
        const report = themeReadability(
            brand({
                palette: { headerBg: 'transparent', headerText: '#e5e7eb' }
            })
        );
        const where = failing(report, 'header title').map((c) => c.where);
        expect(where).toEqual(expect.arrayContaining(['the card']));
    });

    it('names what it cannot measure, and is then never complete', () => {
        const recipe = brand({
            pageImage: { url: 'https://example.com/a.jpg' },
            effects: { shadow: 'soft', mesh: 'aurora' },
            palette: { headerImage: 'https://example.com/h.jpg' }
        });
        const report = themeReadability(recipe);
        expect(report.unchecked.map((u) => u.surface)).toEqual(
            expect.arrayContaining([
                'page image',
                'header photo',
                'background mesh'
            ])
        );
        expect(report.complete).toBe(false);
    });
});

describe('fixReadability', () => {
    it('fixable: a pale muted text is moved until it passes, and only what moved is reported fixed', () => {
        const recipe = brand({ palette: { textWeak: '#c4c8ce' } });
        expect(themeReadability(recipe).pass).toBe(false);
        const out = fixReadability(recipe);
        expect(out.report.pass).toBe(true);
        expect(out.unfixed).toEqual([]);
        expect(out.fixed).toContain('palette.textWeak');
        expect(out.fixed).not.toContain('palette.accent');
        expect(out.recipe.palette.textWeak).not.toBe('#c4c8ce');
        // the input is never mutated
        expect(recipe.palette.textWeak).toBe('#c4c8ce');
    });

    it('unfixable: a #595959 page with a white card keeps Text as it was and says the best it found', () => {
        const recipe = brand({
            palette: { pageBg: '#595959', contentBg: '#ffffff' }
        });
        const before = recipe.palette.text;
        const out = fixReadability(recipe);
        const text = out.unfixed.find((u) => u.path === 'palette.text');
        expect(text).toBeTruthy();
        expect(text.best).toBeLessThan(4.5);
        expect(text.min).toBe(4.5);
        expect(out.fixed).not.toContain('palette.text');
        expect(out.recipe.palette.text).toBe(before);
        expect(out.report.pass).toBe(false);
    });

    it('middle gray: between a black page and a white card the stepped walk finds a border that passes both', () => {
        const recipe = brand({
            palette: {
                pageBg: '#000000',
                contentBg: '#ffffff',
                fieldBorderColor: '#111111'
            }
        });
        const out = fixReadability(recipe);
        expect(out.fixed).toContain('palette.fieldBorderColor');
        const border = out.recipe.palette.fieldBorderColor;
        expect(ratio(border, '#000000')).toBeGreaterThanOrEqual(3);
        expect(ratio(border, '#ffffff')).toBeGreaterThanOrEqual(3);
        // readable() gives up at the endpoint for the same job
        const ranges = [
            ['#000000', '#000000'],
            ['#ffffff', '#ffffff']
        ];
        expect(readable('#111111', '#ffffff', ranges, 3).ok).toBe(false);
        expect(readsOn(border, ranges, 3)).toBe(true);
    });

    it('interacting: fixing Text re-checks everything, so a colour it breaks is caught in the next round', () => {
        // pale text: its section tints barely darken the card, so muted text
        // passes; darkening the text darkens the tints under muted text
        const recipe = brand({
            palette: { text: '#b8bec7', textWeak: '#68707c' }
        });
        const first = themeReadability(recipe);
        expect(failing(first, 'text').length).toBeGreaterThan(0);
        const out = fixReadability(recipe);
        expect(out.fixed).toContain('palette.text');
        // nothing fails at the end that the fix didn't list as unfixable
        const left = out.report.checks
            .filter((c) => !c.pass && !c.advisory && !c.unmeasurable)
            .map((c) => c.path);
        left.forEach((path) =>
            expect(out.unfixed.map((u) => u.path)).toContain(path)
        );
        expect(out.report.pass).toBe(out.unfixed.length === 0);
    });
});
