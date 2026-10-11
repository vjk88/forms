/**
 * --c-icon: the ink for the platform's small icons (help, calendar, dropdown
 * arrow). Cross-host audit stage 1, docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md.
 *
 * It is emitted ONLY on dark surfaces. The same icons also sit in the platform's
 * fixed-white popups (date picker arrows, the dropdown list's check mark), so on
 * a dark theme the colour must clear 3 : 1 on the dark field AND on white; one
 * mid grey does. On a light surface the platform's own icon colours already pass,
 * so nothing is emitted and the CSS hooks that read this token fall back to them.
 */
import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

const ICON = '--c-icon';

describe('--c-icon (icon ink on dark surfaces)', () => {
    it('is emitted on a dark theme and not on a light one', () => {
        expect(resolveTokens(getBuiltinTheme('dracula'), null)[ICON]).toBe(
            '#8d8d8d'
        );
        expect(
            resolveTokens(getBuiltinTheme('editorialIvory'), null)[ICON]
        ).toBeUndefined();
    });

    it('follows the surface, not the theme: a dark panel override gets it', () => {
        const t = resolveTokens(getBuiltinTheme('editorialIvory'), {
            palette: { contentBg: '#10131a', text: '#f2f2f2' }
        });
        expect(t[ICON]).toBe('#8d8d8d');
    });

    it('follows the surface, not the theme: a light panel override loses it', () => {
        const t = resolveTokens(getBuiltinTheme('dracula'), {
            palette: { contentBg: '#ffffff', text: '#111111' }
        });
        expect(t[ICON]).toBeUndefined();
    });

    it('translucent glass panels are judged by their text ink', () => {
        expect(resolveTokens(getBuiltinTheme('carbonMatrix'), null)[ICON]).toBe(
            '#8d8d8d'
        );
        expect(
            resolveTokens(getBuiltinTheme('sunsetDunes'), null)[ICON]
        ).toBeUndefined();
    });

    it('the ink clears 3 : 1 on white, where the platform popups sit', () => {
        expect(contrastRatio('#8d8d8d', '#ffffff')).toBeGreaterThanOrEqual(3);
    });
});
