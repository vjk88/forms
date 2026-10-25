import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { ACCENT_PRESETS } from 'c/finalDesignRegistry';
import {
    over,
    passes,
    contrast,
    rangeFromToken,
    FOCUS_DARK,
    FOCUS_LIGHT
} from 'c/finalFocusTreatment';
import { FOCUS_TOKENS, withoutFocus } from './focusContract';

// IMPL_PLAN_FOCUS_CONTRAST v5 §11: every theme × accent preset × field style
// × section look, card and open-page placements. On every background the
// engine can compute or bound, the indicator passes, or the engine has
// switched to the fallback: never a silently failing colour.

const THEMES = listBuiltinThemes().map((t) => t.key);
const STYLES = ['outline', 'underline', 'filled'];
const LOOKS = ['plain', 'card', 'boxed', 'outline', 'subtle'];
const TINTS = [0, 0.03, 0.04, 0.07];
const BEFORE_PART_B = {
    // focus colours that already passed: kept byte-identical
    nordic: '#1e3a8a',
    terminal: '#22c55e',
    slate: '#0f172a',
    dracula: '#ff79c6',
    editorialIvory: '#0f766e'
};

const rgbaOf = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function judge(t, focus, partner, underToken) {
    const fallback = focus === FOCUS_DARK && partner === FOCUS_LIGHT;
    const under = rangeFromToken(underToken);
    if (!under) {
        return fallback ? null : 'no range but not the fallback';
    }
    if (fallback) {
        return null;
    }
    const surfaces = [
        under,
        ...TINTS.map((p) => over(rgbaOf(t['--c-text'], p), under)),
        over(t['--c-field-bg'], under),
        over(t['--c-input-bg'], under)
    ];
    const bad = surfaces.filter((r) => !passes(focus, r));
    return bad.length
        ? `fails on ${bad.map((r) => r.join('…')).join(', ')}`
        : null;
}

describe('focus matrix: every theme, preset, field style and section look', () => {
    it.each(THEMES)('%s', (key) => {
        const failures = [];
        const accents = [null, ...ACCENT_PRESETS.map((p) => p.value)];
        accents.forEach((accent) =>
            STYLES.forEach((fieldStyle) =>
                LOOKS.forEach((sectionStyle) => {
                    const overrides = {
                        fieldStyle,
                        sectionStyle,
                        ...(accent ? { palette: { accent } } : {})
                    };
                    const t = resolveTokens(getBuiltinTheme(key), overrides);
                    const card = judge(
                        t,
                        t['--c-field-focus'],
                        t['--c-focus-partner'],
                        t['--c-focus-under']
                    );
                    const page = judge(
                        t,
                        t['--c-focus-page-field'],
                        t['--c-focus-page-partner'],
                        t['--c-focus-page-under']
                    );
                    if (card || page) {
                        failures.push(
                            `${accent || 'theme'}/${fieldStyle}/${sectionStyle}: ${card || ''} ${page || ''}`
                        );
                    }
                    // the two rings are told apart (3:1, the floor for a visible boundary)
                    expect(
                        contrast(t['--c-field-focus'], t['--c-focus-partner'])
                    ).toBeGreaterThanOrEqual(3);
                })
            )
        );
        expect(failures).toEqual([]);
    });
});

describe('focus: kept, adjusted, fallback (§5 table)', () => {
    it.each(Object.entries(BEFORE_PART_B))(
        '%s keeps its focus colour exactly',
        (key, colour) => {
            const t = resolveTokens(getBuiltinTheme(key), null);
            expect(t['--c-field-focus']).toBe(colour);
            expect(t['--c-focus-base']).toBe(colour);
        }
    );

    it.each([
        ['oceanBreeze', '#b8b8b8 #ffffff'],
        ['desertOasis', '#d7d5d2 #fdfcf8']
    ])('%s: its card range is %s and a darker colour passes', (key, range) => {
        const t = resolveTokens(getBuiltinTheme(key), null);
        expect(t['--c-focus-under']).toBe(range);
        expect(t['--c-field-focus']).not.toBe(t['--c-focus-base']);
        expect(passes(t['--c-field-focus'], rangeFromToken(range))).toBe(true);
    });

    it('Neon Nights (8% glass over glow layers): the black-and-white ring', () => {
        const t = resolveTokens(getBuiltinTheme('neonNights'), null);
        expect(t['--c-field-focus']).toBe(FOCUS_DARK);
        expect(t['--c-focus-partner']).toBe(FOCUS_LIGHT);
    });

    it('Bioluminescent Split keeps its colour: glass, but over a solid page', () => {
        const t = resolveTokens(getBuiltinTheme('auraSplit'), null);
        expect(t['--c-field-focus']).toBe('#2dd4bf');
    });

    it('nothing depends on the image: any photo, glow or blur gives the same range', () => {
        const glass = { palette: { contentBgOpacity: 80 } };
        const a = resolveTokens(getBuiltinTheme('nordic'), {
            ...glass,
            pageImage: { url: '/a.jpg' }
        });
        const b = resolveTokens(getBuiltinTheme('nordic'), {
            ...glass,
            pageImage: { url: '/b.jpg', scrim: 0 },
            effects: { mesh: 'custom', meshColors: ['#ff0000'], meshBlur: 40 }
        });
        expect(a['--c-focus-under']).toBe(b['--c-focus-under']);
        expect(a['--c-focus-under']).not.toBe('fallback');
    });

    it('a card gradient: the fallback', () => {
        const t = resolveTokens(getBuiltinTheme('nordic'), {
            palette: {
                contentBgGradient: { start: '#ffffff', end: '#000000' }
            }
        });
        expect(t['--c-field-focus']).toBe(FOCUS_DARK);
        expect(t['--c-focus-under']).toBe('fallback');
    });

    it('the new engine switches the gated outline controls to a transparent outline', () => {
        const t = resolveTokens(getBuiltinTheme('nordic'), null);
        expect(t['--c-focus-outline']).toBe('transparent');
        expect(t['--c-focus-shadow']).toBe(t['--c-focus-ring']);
    });

    it('only focus tokens differ from a theme with a different focus colour', () => {
        const a = resolveTokens(getBuiltinTheme('nordic'), null);
        const b = resolveTokens(getBuiltinTheme('nordic'), {
            fieldStates: { focus: '#06b6d4' }
        });
        expect(withoutFocus(a)).toEqual(withoutFocus(b));
        expect(FOCUS_TOKENS.some((k) => a[k] !== b[k])).toBe(true);
    });
});
