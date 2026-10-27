/**
 * IMPL_PLAN_TEXT_CONTRAST v7, PR A: readable muted text, accent words, accent
 * marks, idle stars, derived labels and the toast's ink on the CARD scope.
 *
 * The plan's §3.1 card columns are reproduced exactly from the engine: the
 * expected move for each look is a whole number of 2% steps toward the main
 * text, computed here with the shared helper's own loop.
 */
import { resolveTokens } from 'c/finalThemeEngine';
import {
    listThemeFamilies,
    listBuiltinThemes,
    getBuiltinTheme
} from 'c/finalThemeCatalog';
import { buildBrandTheme } from 'c/finalBrandTheme';
import {
    mix,
    textScope,
    worstOn,
    TEXT_AIM,
    MARK_AIM
} from 'c/finalReadableText';
import { rangeFromToken } from 'c/finalFocusTreatment';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeTextContrast.json';
import BEFORE_PART_B from '../../finalFocusTreatment/__tests__/__fixtures__/publishedBeforePartB.json';
import {
    TEXT_TREATMENT_TOKENS,
    withoutTextTreatment
} from './textContrastContract';

const GALLERY = listThemeFamilies().flatMap((f) => f.members.map((m) => m.key));
const HIDDEN = listBuiltinThemes()
    .filter((t) => t.hidden)
    .map((t) => t.key);

/** The colour after `steps` whole 2% steps toward `target` (the helper's loop). */
function colourAt(src, target, steps) {
    let t = 0;
    for (let i = 0; i < steps; i += 1) {
        t += 0.02;
    }
    return mix(target, src, t);
}

// Plan §3.1, card scope: [muted, accent words, accent marks, idle stars] as
// whole 2% steps toward the main text (0 = unchanged). null = unresolved.
const CARD_STEPS = {
    nordic: [10, 0, 0, 0],
    lavender: [0, 0, 0, 0],
    terracotta: [8, 1, 0, 0],
    editorialIvory: [3, 0, 0, 0],
    sandstone: [6, 0, 0, 0],
    vintagePaper: [0, 0, 0, 0],
    dracula: [25, 9, 0, 12],
    tokyo: [20, 0, 0, 7],
    marbleSplit: [5, 16, 4, 0],
    claySplit: [8, 1, 0, 0],
    botanicalSplit: [8, 3, 0, 0],
    cyberSplit: [0, 13, 0, 0],
    marbleLuxury: [9, 0, 0, 0],
    oceanBreeze: null,
    desertOasis: [17, 29, 14, 0],
    sunsetDunes: [9, 34, 23, 0],
    forestMist: [1, 17, 0, 0],
    silkLuxury: [14, 20, 4, 0],
    carbonMatrix: [16, 14, 0, 0],
    cosmicVortex: [29, 36, 19, 5],
    auroraBorealis: [24, 9, 0, 0],
    auraSplit: [3, 0, 0, 0],
    terminal: [17, 0, 0, 0],
    retroStepper: [30, 0, 0, 6],
    neonNights: null,
    neoBrutalism: [0, 12, 2, 0]
};

const resolve = (key, overrides = null) =>
    resolveTokens(getBuiltinTheme(key), overrides);

/** The card scope rebuilt independently from the resolved tokens. */
function cardScope(t) {
    return textScope({
        container: rangeFromToken(t['--c-focus-under']),
        text: t['--c-text'],
        accent: t['--c-accent'],
        sectionFill: null,
        fieldFills: [t['--c-input-bg'], t['--c-field-bg']]
    });
}

describe('text contrast PR A: the card scope', () => {
    it('covers exactly the 26 gallery looks', () => {
        expect(Object.keys(CARD_STEPS).sort()).toEqual([...GALLERY].sort());
    });

    it.each(GALLERY)('%s carries the marker', (key) => {
        // Neon Nights' labels use the Caps look, which takes the muted colour
        expect(resolve(key)['--c-text-treatment']).toBe(
            key === 'neonNights' ? 'muted accent label' : 'muted accent'
        );
    });

    it.each(GALLERY.filter((k) => CARD_STEPS[k]))(
        '%s reproduces the plan table (§3.1, card)',
        (key) => {
            const t = resolve(key);
            const [muted, words, marks, idle] = CARD_STEPS[key];
            const text = t['--c-text'];
            const src = t['--c-text-weak-src'];
            const accent = t['--c-accent'];
            expect(t['--c-text-weak']).toBe(colourAt(src, text, muted));
            expect(t['--c-accent-text']).toBe(colourAt(accent, text, words));
            expect(t['--c-accent-mark']).toBe(colourAt(accent, text, marks));
            expect(t['--c-mark-idle']).toBe(colourAt(src, text, idle));
            expect(t['--c-mark-idle-opacity']).toBe('1');
        }
    );

    it.each(GALLERY.filter((k) => CARD_STEPS[k]))(
        '%s: every role reaches its target on every card surface',
        (key) => {
            const t = resolve(key);
            const scope = cardScope(t);
            expect(worstOn(t['--c-text'], scope.text)).toBeGreaterThanOrEqual(
                TEXT_AIM
            );
            expect(
                worstOn(t['--c-text-weak'], scope.text)
            ).toBeGreaterThanOrEqual(TEXT_AIM);
            expect(
                worstOn(t['--c-accent-text'], scope.words)
            ).toBeGreaterThanOrEqual(TEXT_AIM);
            expect(
                worstOn(t['--c-accent-mark'], scope.marks)
            ).toBeGreaterThanOrEqual(MARK_AIM);
            expect(
                worstOn(t['--c-mark-idle'], scope.marks)
            ).toBeGreaterThanOrEqual(MARK_AIM);
        }
    );

    it('exactly Neon Nights and Ocean Breeze stay unresolved on the card, and change nothing there', () => {
        const unresolved = GALLERY.filter(
            (k) => resolve(k)['--c-text-unresolved']
        ).sort();
        expect(unresolved).toEqual(['neonNights', 'oceanBreeze']);
        unresolved.forEach((key) => {
            const t = resolve(key);
            ['--c-accent-text', '--c-accent-mark', '--c-mark-idle'].forEach(
                (tok) => expect(t[tok]).toBeUndefined()
            );
            expect(t['--c-text-weak']).toBe(
                BEFORE.themes[key]['--c-text-weak']
            );
        });
    });

    it.each(GALLERY)(
        '%s: every other token is byte-identical to before',
        (key) => {
            expect(withoutTextTreatment(resolve(key))).toEqual(
                BEFORE.themes[key]
            );
        }
    );

    it.each(HIDDEN)(
        'hidden theme %s gets no marker and is byte-identical',
        (key) => {
            const t = resolve(key);
            expect(t['--c-text-treatment']).toBeUndefined();
            expect(t).toEqual(BEFORE.themes[key]);
        }
    );

    it('a frozen snapshot from before carries none of the new tokens', () => {
        // two old snapshots: one published before PR 405 (focus Part B), and
        // today's tokens captured just before this change. Without the marker
        // or the new tokens, every CSS reader falls back to today's value
        // (textContrastCss.test.js), so they paint exactly as before.
        TEXT_TREATMENT_TOKENS.forEach((tok) =>
            expect(BEFORE_PART_B.tokens[tok]).toBeUndefined()
        );
        Object.values(BEFORE.themes).forEach((tokens) =>
            TEXT_TREATMENT_TOKENS.forEach((tok) =>
                expect(tokens[tok]).toBeUndefined()
            )
        );
    });

    it('the header keeps the original muted colour (plan §T1 line 1287)', () => {
        GALLERY.forEach((key) =>
            expect(resolve(key)['--c-header-text-weak']).toBe(
                BEFORE.themes[key]['--c-header-text-weak']
            )
        );
    });
});

describe('text contrast PR A: derived labels (§4.6)', () => {
    it('Muted small and Caps labels follow the readable muted colour', () => {
        ['mutedSm', 'caps'].forEach((labelStyle) => {
            const t = resolve('dracula', { labelStyle });
            expect(t['--c-text-treatment']).toBe('muted accent label');
            expect(t['--c-label-color']).toBe(t['--c-text-weak']);
            // today Dracula's Muted small labels are 3.03 : 1 on the card
            expect(
                worstOn(t['--c-label-color'], cardScope(t).text)
            ).toBeGreaterThanOrEqual(TEXT_AIM);
        });
    });

    it("an author's own label colour is never recalculated", () => {
        const t = resolve('dracula', {
            labelStyle: 'mutedSm',
            palette: { labelColor: '#123456' }
        });
        expect(t['--c-label-color']).toBe('#123456');
        expect(t['--c-text-treatment']).toBe('muted accent');
    });

    it.each(['mutedSm', 'caps'])(
        "an author's own muted colour flows into %s labels, untouched",
        (labelStyle) => {
            const t = resolve('dracula', {
                labelStyle,
                palette: { textWeak: '#999999' }
            });
            expect(t['--c-text-treatment']).toBe('accent');
            expect(t['--c-text-weak']).toBe('#999999');
            expect(t['--c-label-color']).toBe('#999999');
        }
    );

    it('Default and Bold labels keep the main text colour', () => {
        const t = resolve('dracula', { labelStyle: 'default' });
        expect(t['--c-label-color']).toBe(t['--c-text']);
    });
});

describe('text contrast PR A: the toast ink (§4.8)', () => {
    it.each([
        ['auraSplit', '#111827'],
        ['neonNights', '#111827'],
        ['oceanBreeze', '#ffffff']
    ])('%s gets a readable ink (today 1.00-3.58)', (key, ink) => {
        expect(resolve(key)['--c-toast-ink']).toBe(ink);
    });

    it('a look whose card colour already reads keeps it', () => {
        expect(resolve('nordic')['--c-toast-ink']).toBe('#ffffff');
        expect(resolve('dracula')['--c-toast-ink']).toBe('#282a36');
    });

    it('a custom mid-grey main colour gets pure black (#111827 and white both fail)', () => {
        const t = resolve('nordic', {
            palette: { text: '#777777', contentBg: '#888888' }
        });
        expect(t['--c-toast-ink']).toBe('#000000');
    });
});

describe('text contrast PR A: brand themes', () => {
    it.each(Object.keys(BEFORE.brand))(
        'brand %s: the recipe is byte-identical, and so is every token but the treatment',
        (key) => {
            const { recipe, tokens } = BEFORE.brand[key];
            const input = recipe.brand.secondColor
                ? {
                      color: recipe.brand.color,
                      secondColor: recipe.brand.secondColor,
                      style: recipe.brand.style
                  }
                : { color: recipe.brand.color, style: recipe.brand.style };
            const now = buildBrandTheme(input);
            expect(now).toEqual(recipe);
            const t = resolveTokens(now, null);
            expect(t['--c-text-treatment']).toBe('muted accent');
            expect(t['--c-mark-idle-opacity']).toBe('1');
            expect(withoutTextTreatment(t)).toEqual(tokens);
        }
    );

    it('brand text colours are kept as built (they already read everywhere)', () => {
        Object.values(BEFORE.brand).forEach(({ recipe }) => {
            const t = resolveTokens(recipe, null);
            expect(t['--c-text-weak']).toBe(recipe.palette.textWeak);
            expect(t['--c-accent-text']).toBe(recipe.palette.accent);
        });
    });
});

describe('text contrast PR A: engine copy guard', () => {
    // After the muted colour is adjusted, nothing else may still carry the
    // ORIGINAL value: a copy like the Muted small label one would fail here.
    const ALLOWED = {
        '--c-text-weak-src': 'the original, carried for recalculation',
        '--c-header-text-weak': 'header text is out of scope (plan §8)',
        '--c-mark-idle': 'a mark, judged at 3 : 1 on its own'
    };
    it.each(GALLERY.filter((k) => CARD_STEPS[k] && CARD_STEPS[k][0] > 0))(
        '%s: no token copies the original muted colour',
        (key) => {
            ['default', 'mutedSm', 'caps'].forEach((labelStyle) => {
                const t = resolve(key, { labelStyle });
                const src = t['--c-text-weak-src'];
                const copies = Object.keys(t).filter(
                    (k) => t[k] === src && !(k in ALLOWED)
                );
                expect(copies).toEqual([]);
            });
        }
    );
});
