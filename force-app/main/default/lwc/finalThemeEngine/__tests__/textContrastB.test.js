/**
 * IMPL_PLAN_TEXT_CONTRAST v7, PR B: the One at a time open page, sections
 * with their own background, and the D1 = A backing.
 *
 * The plan's §3.1 page columns and §3.1b backing table are reproduced exactly
 * from the engine, as whole 2% steps toward the main text.
 */
import { resolveTokens } from 'c/finalThemeEngine';
import { listThemeFamilies, getBuiltinTheme } from 'c/finalThemeCatalog';
import {
    mix,
    textScope,
    worstOn,
    openPageTextTokens,
    sectionTextStyle,
    TEXT_AIM,
    MARK_AIM,
    PAGE_TEXT_TOKENS
} from 'c/finalReadableText';
import { rangeFromToken, over } from 'c/finalFocusTreatment';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeTextContrast.json';

const GALLERY = listThemeFamilies().flatMap((f) => f.members.map((m) => m.key));
const resolve = (key, overrides = null) =>
    resolveTokens(getBuiltinTheme(key), overrides);

function colourAt(src, target, steps) {
    let t = 0;
    for (let i = 0; i < steps; i += 1) {
        t += 0.02;
    }
    return mix(target, src, t);
}

// Plan §3.1, open page: [muted, accent words, accent marks, idle stars] in
// whole 2% steps toward the main text. Looks whose page needs a backing are
// in BACKED below instead.
const PAGE_STEPS = {
    nordic: [13, 0, 0, 0],
    lavender: [0, 0, 0, 0],
    terracotta: [10, 4, 0, 0],
    editorialIvory: [6, 3, 0, 0],
    sandstone: [15, 0, 0, 0],
    dracula: [20, 0, 0, 8],
    tokyo: [15, 0, 0, 2],
    marbleSplit: [6, 17, 6, 0],
    claySplit: [9, 3, 0, 0],
    botanicalSplit: [11, 6, 0, 0],
    cyberSplit: [0, 5, 0, 0],
    auraSplit: [0, 0, 0, 0],
    terminal: [17, 0, 0, 0],
    retroStepper: [24, 0, 0, 1],
    neoBrutalism: [0, 15, 6, 0]
};

// Plan §3.1b: scope → [backing colour, opacity %, muted, words, marks, idle]
const BACKED = {
    'vintagePaper|page': ['#fffdf7', 95, 0, 0, 0, 0],
    'marbleLuxury|page': ['#ffffff', 100, 9, 0, 0, 0],
    'oceanBreeze|card': ['#ffffff', 100, 0, 47, 24, 0],
    'oceanBreeze|page': ['#ffffff', 100, 0, 47, 24, 0],
    'desertOasis|page': ['#fdfbf7', 90, 11, 25, 10, 0],
    'sunsetDunes|page': ['#ffffff', 92, 0, 25, 13, 0],
    'forestMist|page': ['#ffffff', 85, 1, 17, 0, 0],
    'silkLuxury|page': ['#ffffff', 85, 14, 20, 4, 0],
    'carbonMatrix|page': ['#0f172a', 88, 16, 14, 0, 0],
    'cosmicVortex|page': ['#0f0a1e', 88, 13, 25, 9, 0],
    'auroraBorealis|page': ['#0f1719', 85, 24, 9, 0, 0],
    'neonNights|card': ['#08060f', 87, 0, 24, 5, 0],
    'neonNights|page': ['#08060f', 87, 0, 24, 5, 0]
};

const rgbaOf = (hex, pct) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${pct / 100})`;
};

/** The page set, as the open page sees it after the viewer's swap. */
const pageView = (t) => openPageTextTokens(t);

describe('text contrast PR B: the open page', () => {
    it('every gallery look is in exactly one of the two tables', () => {
        const paged = Object.keys(PAGE_STEPS);
        const backedPages = Object.keys(BACKED)
            .filter((k) => k.endsWith('|page'))
            .map((k) => k.split('|')[0]);
        expect([...paged, ...backedPages].sort()).toEqual([...GALLERY].sort());
    });

    it.each(Object.keys(PAGE_STEPS))(
        '%s reproduces the plan table (§3.1, open page) with no backing',
        (key) => {
            const t = resolve(key);
            const [muted, words, marks, idle] = PAGE_STEPS[key];
            const text = t['--c-text'];
            const src = t['--c-text-weak-src'];
            const accent = t['--c-accent'];
            expect(t['--c-page-backing']).toBeUndefined();
            expect(t['--c-text-weak-page']).toBe(colourAt(src, text, muted));
            expect(t['--c-accent-text-page']).toBe(
                colourAt(accent, text, words)
            );
            expect(t['--c-accent-mark-page']).toBe(
                colourAt(accent, text, marks)
            );
            expect(t['--c-mark-idle-page']).toBe(colourAt(src, text, idle));
        }
    );

    it.each(Object.keys(BACKED))(
        '%s reproduces the backing table (§3.1b)',
        (scopeKey) => {
            const [key, scope] = scopeKey.split('|');
            const [colour, pct, muted, words, marks, idle] = BACKED[scopeKey];
            const t = resolve(key);
            const text = t['--c-text'];
            const src = t['--c-text-weak-src'];
            const accent = t['--c-accent'];
            const view = scope === 'page' ? pageView(t) : t;
            expect(t[`--c-${scope}-backing`]).toBe(rgbaOf(colour, pct));
            expect(t[`--c-${scope}-backing-on`]).toBe('1');
            expect(view['--c-text-weak']).toBe(colourAt(src, text, muted));
            expect(view['--c-accent-text']).toBe(colourAt(accent, text, words));
            expect(view['--c-accent-mark']).toBe(colourAt(accent, text, marks));
            expect(view['--c-mark-idle']).toBe(colourAt(src, text, idle));
        }
    );

    it.each(GALLERY)(
        '%s: every open-page role reaches its target on what is behind it',
        (key) => {
            const v = pageView(resolve(key));
            const scope = textScope({
                container: rangeFromToken(v['--c-text-under']),
                text: v['--c-text'],
                accent: v['--c-accent'],
                sectionFill: null,
                fieldFills: [v['--c-input-bg'], v['--c-field-bg']]
            });
            expect(worstOn(v['--c-text'], scope.text)).toBeGreaterThanOrEqual(
                TEXT_AIM
            );
            // the counter ("Step 2 of 5") is muted text on the strip's backing
            expect(
                worstOn(v['--c-text-weak'], scope.text)
            ).toBeGreaterThanOrEqual(TEXT_AIM);
            expect(
                worstOn(v['--c-accent-text'], scope.words)
            ).toBeGreaterThanOrEqual(TEXT_AIM);
            expect(
                worstOn(v['--c-accent-mark'], scope.marks)
            ).toBeGreaterThanOrEqual(MARK_AIM);
            expect(
                worstOn(v['--c-mark-idle'], scope.marks)
            ).toBeGreaterThanOrEqual(MARK_AIM);
        }
    );

    it('nothing is unresolved on any look, card or page', () => {
        GALLERY.forEach((key) =>
            expect(resolve(key)['--c-text-unresolved']).toBeUndefined()
        );
    });

    it('a solid-page look draws no backing', () => {
        ['nordic', 'dracula', 'neoBrutalism'].forEach((key) => {
            const t = resolve(key);
            expect(t['--c-page-backing']).toBeUndefined();
            expect(t['--c-card-backing']).toBeUndefined();
        });
    });

    it('an old snapshot carries no backing and swaps nothing', () => {
        Object.values(BEFORE.themes).forEach((tokens) => {
            expect(tokens['--c-page-backing']).toBeUndefined();
            expect(tokens['--c-card-backing']).toBeUndefined();
            expect(openPageTextTokens(tokens)).toBe(tokens);
        });
    });
});

describe('text contrast PR B: both layouts, per look (plan §7)', () => {
    // Scroll reads the card set; One at a time reads the page set
    it('Cosmic Vortex: card untouched in Scroll, page backed at 88% in One at a time', () => {
        const t = resolve('cosmicVortex');
        expect(t['--c-card-backing']).toBeUndefined();
        expect(t['--c-page-backing']).toBe('rgba(15, 10, 30, 0.88)');
        expect(pageView(t)['--c-text-weak']).toBe(t['--c-text-weak-page']);
        expect(t['--c-text-weak']).not.toBe(t['--c-text-weak-page']);
    });

    it.each([
        ['neonNights', 'rgba(8, 6, 15, 0.87)'],
        ['oceanBreeze', 'rgba(255, 255, 255, 1)']
    ])('%s: backed in both, with the same backing', (key, backing) => {
        const t = resolve(key);
        expect(t['--c-card-backing']).toBe(backing);
        expect(t['--c-card-backing-image']).toBe('none');
        expect(t['--c-page-backing']).toBe(backing);
    });

    it('on the open page every swapped colour comes from the page scope', () => {
        GALLERY.forEach((key) => {
            const t = resolve(key);
            const v = pageView(t);
            const swapped = PAGE_TEXT_TOKENS.filter(
                (tok) => t[`${tok}-page`] !== undefined
            );
            expect(swapped.length).toBeGreaterThan(0);
            expect(swapped.map((tok) => v[tok])).toEqual(
                swapped.map((tok) => t[`${tok}-page`])
            );
        });
    });
});

describe('text contrast PR B: sections with their own background', () => {
    it('a section gets colours that read on its own background', () => {
        const t = resolve('dracula');
        const style = sectionTextStyle(t, '#44475a');
        const decl = Object.fromEntries(
            style.split('; ').map((d) => d.split(': '))
        );
        const container = over('#44475a', rangeFromToken(t['--c-text-under']));
        const scope = textScope({
            container,
            text: t['--c-text'],
            accent: t['--c-accent'],
            sectionFill: null,
            fieldFills: [t['--c-input-bg'], t['--c-field-bg']]
        });
        expect(
            worstOn(decl['--c-text-weak'], scope.text)
        ).toBeGreaterThanOrEqual(TEXT_AIM);
        expect(
            worstOn(decl['--c-accent-text'], scope.words)
        ).toBeGreaterThanOrEqual(TEXT_AIM);
    });

    it('recalculates from the original colours, never an adjusted one', () => {
        const t = resolve('dracula');
        // feeding an already-adjusted muted colour must not compound
        const once = sectionTextStyle(t, '#44475a');
        const again = sectionTextStyle(
            { ...t, '--c-text-weak': '#000000' },
            '#44475a'
        );
        expect(again).toBe(once);
    });

    it("an author's own muted colour is never recalculated in a section", () => {
        const t = resolve('dracula', { palette: { textWeak: '#999999' } });
        expect(sectionTextStyle(t, '#44475a')).not.toContain('--c-text-weak:');
    });

    it('is a no-op without the marker or without a background', () => {
        expect(sectionTextStyle(BEFORE.themes.dracula, '#44475a')).toBe('');
        expect(sectionTextStyle(resolve('dracula'), null)).toBe('');
    });
});
