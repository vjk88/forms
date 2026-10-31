import { resolveTokens } from 'c/finalThemeEngine';
import { listThemeFamilies, getBuiltinTheme } from 'c/finalThemeCatalog';
import MAIN from './__fixtures__/headerInkMain.json';

/**
 * IMPL_PLAN_HEADER_FADE v6: the header plate (now the colour of the text
 * fade) tries the card's colour first, so light looks get a white wash. It
 * must never change the header's own ink: a white wash on a dark photo pane
 * flipped white titles to black (review 2026-10-31). Every gallery look's
 * header text colours, in every scope, are exactly what main drew
 * (__fixtures__/headerInkMain.json, generated from main's engine).
 */
const GALLERY = listThemeFamilies().flatMap((f) => f.members.map((m) => m.key));

describe('header fade: the header ink never changes', () => {
    it('the fixture covers the whole gallery', () => {
        expect(Object.keys(MAIN).sort()).toEqual([...GALLERY].sort());
    });

    // titles are exactly main's; descriptions may move a hair closer to
    // their own colour on a white wash, never across from dark to light
    const lightness = (hex) => {
        const n = parseInt(String(hex).slice(1), 16);
        return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    it.each(GALLERY)('%s keeps main header ink', (key) => {
        const t = resolveTokens(getBuiltinTheme(key), null);
        Object.entries(MAIN[key]).forEach(([token, was]) => {
            const now = t[token] === undefined ? null : t[token];
            if (!token.includes('-weak') || was === null || now === null) {
                expect([token, now]).toEqual([token, was]);
            } else {
                expect([token, lightness(now) > 382]).toEqual([
                    token,
                    lightness(was) > 382
                ]);
                expect(Math.abs(lightness(now) - lightness(was))).toBeLessThan(
                    24
                );
            }
        });
    });

    it('marble still gets the white wash the owner picked', () => {
        expect(
            resolveTokens(getBuiltinTheme('marbleSplit'), null)[
                '--c-header-plate'
            ]
        ).toBe('rgba(255, 255, 255, 0.54)');
    });
});
