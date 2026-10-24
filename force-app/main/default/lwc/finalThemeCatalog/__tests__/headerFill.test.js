import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';

// Every theme's header must actually paint and its text must read
// (header fix, owner 2026-10-24). The header paints palette.headerBg as a
// background COLOR, so a url() or gradient there is silently dropped.

const ALL = listBuiltinThemes().map((t) => t.key);

describe('theme header fill', () => {
    it.each(ALL)(
        '%s: headerBg is a colour, never a photo or gradient',
        (key) => {
            const bg = getBuiltinTheme(key).palette.headerBg;
            expect(bg).not.toMatch(/url\(|gradient\(/i);
        }
    );

    it.each(ALL.filter((k) => getBuiltinTheme(k).palette.headerBgGradient))(
        '%s: title and description reach 4.5:1 on every gradient stop',
        (key) => {
            const p = getBuiltinTheme(key).palette;
            const stops = [
                p.headerBg,
                p.headerBgGradient.start,
                p.headerBgGradient.end
            ];
            for (const bg of stops) {
                expect(contrastRatio(p.headerText, bg)).toBeGreaterThanOrEqual(
                    4.5
                );
                expect(
                    contrastRatio(p.headerTextWeak, bg)
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    );

    it.each(ALL.filter((k) => getBuiltinTheme(k).palette.headerImage))(
        '%s: header photo paints as a layer, fallback colour keeps text readable',
        (key) => {
            const p = getBuiltinTheme(key).palette;
            const t = resolveTokens(getBuiltinTheme(key), null);
            expect(t['--c-header-bg-image']).toContain(
                `url("${p.headerImage}")`
            );
            expect(p.headerImage).toMatch(
                /^\/resource\/formThemeAssets\/[a-z]+\.jpg$/
            );
            expect(
                contrastRatio(p.headerText, p.headerBg)
            ).toBeGreaterThanOrEqual(4.5);
            expect(
                contrastRatio(p.headerTextWeak, p.headerBg)
            ).toBeGreaterThanOrEqual(4.5);
        }
    );

    it('a veil adds a dark wash above the photo; no photo means no token', () => {
        const clay = resolveTokens(getBuiltinTheme('claySplit'), null);
        expect(clay['--c-header-bg-image']).toBe(
            'linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url("/resource/formThemeAssets/desert.jpg")'
        );
        const marble = resolveTokens(getBuiltinTheme('marbleSplit'), null);
        expect(marble['--c-header-bg-image']).toBe(
            'url("/resource/formThemeAssets/marble.jpg")'
        );
        const nordic = resolveTokens(getBuiltinTheme('nordic'), null);
        expect('--c-header-bg-image' in nordic).toBe(false);
    });

    it('a photo can set its crop; no crop (or no photo) means no token', () => {
        const clay = resolveTokens(getBuiltinTheme('claySplit'), null);
        expect(clay['--c-header-bg-position']).toBe('center 70%');
        const marble = resolveTokens(getBuiltinTheme('marbleSplit'), null);
        expect('--c-header-bg-position' in marble).toBe(false);
        const nordic = resolveTokens(getBuiltinTheme('nordic'), null);
        expect('--c-header-bg-position' in nordic).toBe(false);
    });
});
