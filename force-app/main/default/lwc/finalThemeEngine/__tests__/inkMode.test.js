import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';
import { getBuiltinTheme, listGalleryThemes } from 'c/finalThemeCatalog';
import { ACCENT_PRESETS } from 'c/finalDesignRegistry';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeCatalogCut.json';
import { withoutFocus } from './focusContract';

// palette.inkMode 'contrast' (IMPL_PLAN_THEME_CATALOG_CUT P4).

const ink = (t) => ({
    submit: contrastRatio(t['--c-submit-text'], t['--c-submit-bg']),
    onAccent: contrastRatio(t['--c-on-accent'], t['--c-accent'])
});

describe('inkMode off: today exactly', () => {
    it('a hidden theme with no flag keeps its YIQ-picked inks', () => {
        // Neo-Mint Stepper: white on emerald today (2.54:1), unchanged
        const t = resolveTokens(getBuiltinTheme('mintStepper'), null);
        expect(t['--c-submit-text']).toBe('#ffffff');
        expect(withoutFocus(t)).toEqual(
            withoutFocus(BEFORE.hidden.mintStepper)
        );
    });
});

describe('inkMode on', () => {
    it('picks the higher-contrast ink when the theme ink fails', () => {
        const t = resolveTokens(getBuiltinTheme('oceanBreeze'), null);
        expect(t['--c-submit-text']).toBe('#111827');
        expect(t['--c-on-accent']).toBe('#111827');
    });

    it('an ink the user set always wins, even when it fails', () => {
        const t = resolveTokens(getBuiltinTheme('oceanBreeze'), {
            palette: { onAccent: '#ffffff', submitText: '#ffffff' }
        });
        expect(t['--c-on-accent']).toBe('#ffffff');
        expect(t['--c-submit-text']).toBe('#ffffff');
    });

    it('a user-set button fill gets a readable label', () => {
        const t = resolveTokens(getBuiltinTheme('nordic'), {
            palette: { submitBg: '#fbbf24' }
        });
        expect(t['--c-submit-bg']).toBe('#fbbf24');
        expect(t['--c-submit-text']).toBe('#111827');
    });

    it('Nordic + Blue: text on accent turns dark (white was 3.68:1)', () => {
        const t = resolveTokens(getBuiltinTheme('nordic'), {
            palette: { accent: '#3b82f6' }
        });
        expect(t['--c-on-accent']).toBe('#111827');
        expect(ink(t).onAccent).toBeGreaterThanOrEqual(4.5);
    });
});

describe('every preset on every gallery theme stays readable (P5)', () => {
    const cases = [];
    for (const theme of listGalleryThemes()) {
        for (const p of ACCENT_PRESETS) {
            cases.push([theme.key, p.name, p.value]);
        }
    }
    it.each(cases)('%s + %s', (key, name, value) => {
        const t = resolveTokens(getBuiltinTheme(key), {
            palette: { accent: value }
        });
        const r = ink(t);
        expect(r.submit).toBeGreaterThanOrEqual(4.5);
        expect(r.onAccent).toBeGreaterThanOrEqual(4.5);
    });
});

describe('hidden theme: preset, then reset', () => {
    it('a preset with its inkMode override makes labels readable', () => {
        const t = resolveTokens(getBuiltinTheme('mintStepper'), {
            palette: { accent: '#6ee7b7', inkMode: 'contrast' }
        });
        expect(ink(t).submit).toBeGreaterThanOrEqual(4.5);
    });

    it('removing both overrides restores the exact starting tokens', () => {
        expect(
            withoutFocus(resolveTokens(getBuiltinTheme('mintStepper'), {}))
        ).toEqual(withoutFocus(BEFORE.hidden.mintStepper));
    });
});
