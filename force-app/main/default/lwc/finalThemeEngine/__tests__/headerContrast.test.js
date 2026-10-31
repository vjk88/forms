/**
 * Readable header text (IMPL_PLAN_TEXT_CONTRAST follow-up, owner 2026-10-27).
 * The title and description read at 4.5 : 1 on the header's own surface: in
 * the card, on the One at a time open page (the page itself), and over a
 * form's own banner photo. Where they can't, a text plate goes behind them.
 */
import { resolveTokens } from 'c/finalThemeEngine';
import { listThemeFamilies, getBuiltinTheme } from 'c/finalThemeCatalog';
import { worstOn, openPageTextTokens } from 'c/finalReadableText';
import { over, parseColor, rangeFromToken } from 'c/finalFocusTreatment';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeTextContrast.json';

const GALLERY = listThemeFamilies().flatMap((f) => f.members.map((m) => m.key));
const resolve = (key, overrides = null) =>
    resolveTokens(getBuiltinTheme(key), overrides);
const FULL = ['#000000', '#ffffff'];

/** The header's surface, rebuilt independently from the recipe. */
function headerSurface(key, base) {
    const pal = getBuiltinTheme(key).palette;
    const at = (c) => {
        const x = parseColor(c);
        const n = Number(pal.headerBgOpacity);
        const a = x.a * (Number.isFinite(n) && n < 100 ? n / 100 : 1);
        return `rgba(${x.r}, ${x.g}, ${x.b}, ${a})`;
    };
    let r = base;
    const fill = parseColor(pal.headerBg || '');
    if (fill && fill.a > 0) {
        r = over(at(pal.headerBg), r);
    }
    const g = pal.headerBgGradient;
    if (g && g.start && g.end) {
        const ends = [...over(at(g.start), r), ...over(at(g.end), r)].map(
            parseColor
        );
        const hex = (f) =>
            `#${['r', 'g', 'b']
                .map((k) =>
                    Math.round(f(...ends.map((c) => c[k])))
                        .toString(16)
                        .padStart(2, '0')
                )
                .join('')}`;
        r = [hex(Math.min), hex(Math.max)];
    }
    if (pal.headerImage) {
        r = over(`rgba(0, 0, 0, ${Number(pal.headerImageVeil) || 0})`, FULL);
    }
    return r;
}

/** The title's colours: its gradient stops, else its one colour. */
function titleColours(key, t, suffix) {
    const tg = getBuiltinTheme(key).palette.headerTitleGradient;
    return tg && tg.stops
        ? tg.stops.map((s) => String(s).trim().split(/\s+/)[0])
        : [t[`--c-header-text${suffix}`] || t['--c-header-text']];
}

const plateOver = (plate, surface) => (plate ? over(plate, surface) : surface);

describe('header text reads everywhere', () => {
    it.each(GALLERY)('%s: in the card', (key) => {
        const t = resolve(key);
        const card = headerSurface(key, rangeFromToken(t['--c-text-under']));
        const under = plateOver(t['--c-header-plate'], card);
        titleColours(key, t, '').forEach((c) =>
            expect(worstOn(c, [under])).toBeGreaterThanOrEqual(4.6)
        );
        expect(
            worstOn(t['--c-header-text-weak'], [under])
        ).toBeGreaterThanOrEqual(4.6);
    });

    it.each(GALLERY)('%s: on the One at a time open page', (key) => {
        const t = resolve(key);
        const v = openPageTextTokens(t);
        // the header sits on the page itself (not on the column's backing)
        const page = headerSurface(
            key,
            rangeFromToken(t['--c-focus-page-under'])
        );
        const plate = v['--c-header-plate'];
        const under =
            plate && plate !== 'transparent' ? over(plate, page) : page;
        titleColours(key, v, '').forEach((c) =>
            expect(worstOn(c, [under])).toBeGreaterThanOrEqual(4.6)
        );
        expect(
            worstOn(v['--c-header-text-weak'], [under])
        ).toBeGreaterThanOrEqual(4.6);
    });

    it.each(GALLERY)("%s: over a form's own banner photo", (key) => {
        const t = resolve(key);
        const under = over(t['--c-header-plate-banner'], FULL);
        titleColours(key, t, '-banner').forEach((c) =>
            expect(worstOn(c, [under])).toBeGreaterThanOrEqual(4.6)
        );
        expect(
            worstOn(
                t['--c-header-text-weak-banner'] || t['--c-header-text-weak'],
                [under]
            )
        ).toBeGreaterThanOrEqual(4.6);
    });

    it('nothing is unresolved', () => {
        GALLERY.forEach((key) =>
            expect(resolve(key)['--c-text-unresolved']).toBeUndefined()
        );
    });
});

describe('header plates: only where needed, as faint as they can be', () => {
    // in the card: the photo headers and the one gradient that can't pass.
    // The card's colour is tried first since IMPL_PLAN_HEADER_FADE (owner
    // 2026-10-31: the plate feeds a soft wash, white on light looks), but
    // only where the title keeps its ink; the dark photo panes with white
    // type keep their header-colour plates (headerFadeInk.test.js).
    const CARD_PLATES = {
        marbleSplit: 'rgba(255, 255, 255, 0.54)',
        botanicalSplit: 'rgba(41, 39, 42, 0.23)',
        cyberSplit: 'rgba(24, 24, 27, 0.2)',
        marbleLuxury: 'rgba(42, 44, 45, 0.13)',
        auraSplit: 'rgba(109, 40, 217, 0.26)'
    };
    it('the card plates are exactly these', () => {
        const plated = Object.fromEntries(
            GALLERY.filter((k) => resolve(k)['--c-header-plate']).map((k) => [
                k,
                resolve(k)['--c-header-plate']
            ])
        );
        expect(plated).toEqual(CARD_PLATES);
    });

    it('on the open page, a plain header over a photo or glow gets one too', () => {
        expect(resolve('vintagePaper')['--c-header-plate-page']).toBe(
            'rgba(255, 253, 247, 0.72)'
        );
        expect(resolve('neonNights')['--c-header-plate-page']).toBe(
            'rgba(8, 6, 15, 0.7)'
        );
        // a solid page: none
        expect(resolve('nordic')['--c-header-plate-page']).toBe('transparent');
    });
});

describe('header: colours, authors and old forms', () => {
    it("Dracula's description gets the readable muted colour", () => {
        const t = resolve('dracula');
        expect(BEFORE.themes.dracula['--c-header-text-weak']).toBe('#6272a4');
        // a plain header uses the same readable muted colour as the body
        expect(t['--c-header-text-weak']).toBe(t['--c-text-weak']);
        expect(t['--c-header-text-weak']).toBe('#adb5cb');
    });

    it("an author's own header colours are never moved", () => {
        const t = resolve('dracula', {
            palette: { headerText: '#123456', headerTextWeak: '#234567' }
        });
        expect(t['--c-header-text']).toBe('#123456');
        expect(t['--c-header-text-weak']).toBe('#234567');
        expect(t['--c-header-text-weak-page']).toBeUndefined();
        expect(t['--c-header-text-weak-banner']).toBeUndefined();
    });

    it("an author's own muted colour flows into a plain header's description", () => {
        const t = resolve('dracula', { palette: { textWeak: '#999999' } });
        expect(t['--c-header-text-weak']).toBe('#999999');
    });

    it('an old snapshot carries no header treatment', () => {
        Object.values(BEFORE.themes).forEach((tokens) => {
            expect(tokens['--c-header-plate']).toBeUndefined();
            expect(tokens['--c-header-plate-banner']).toBeUndefined();
            expect(openPageTextTokens(tokens)).toBe(tokens);
        });
    });
});
