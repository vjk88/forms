import {
    getBuiltinTheme,
    listBuiltinThemes,
    listGalleryThemes,
    resolveSpecForPublish
} from 'c/finalThemeCatalog';
import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';
import BEFORE from './__fixtures__/tokensBeforeCatalogCut.json';

// IMPL_PLAN_THEME_CATALOG_CUT. The fixture is resolveTokens() for every theme,
// captured on main BEFORE the cut (P1 / tests §4).

const GALLERY = [
    'editorialIvory',
    'nordic',
    'neoBrutalism',
    'dracula',
    'sandstone',
    'terminal',
    'oceanBreeze',
    'desertOasis',
    'neonNights'
];

// The only tokens the plan lets change on a kept theme (P4 table + P6).
const ALLOWED_CHANGES = {
    nordic: [],
    editorialIvory: [],
    sandstone: [],
    dracula: [],
    terminal: ['--c-submit-text'],
    neonNights: ['--c-on-accent'],
    neoBrutalism: ['--c-on-accent', '--c-submit-text'],
    oceanBreeze: [
        '--c-on-accent',
        '--c-submit-text',
        '--c-header-bg',
        '--c-header-bg-gradient',
        '--c-header-text-weak'
    ],
    desertOasis: [
        '--c-on-accent',
        '--c-submit-text',
        '--c-header-bg',
        '--c-header-bg-gradient',
        '--c-header-text-weak'
    ]
};

const HIDDEN = Object.keys(BEFORE.hidden);

// Header fix (owner 2026-10-24, "do #1"): these hidden themes had a photo or
// gradient in the headerBg COLOR slot, which the header drops, so titles
// vanished. They may change their header tokens, and nothing else.
const HEADER_TOKENS = [
    '--c-header-bg',
    '--c-header-bg-gradient',
    '--c-header-bg-image',
    '--c-header-bg-position',
    '--c-header-text-weak'
];
const HEADER_FIXED = [
    'marbleSplit',
    'cyberSplit',
    'claySplit',
    'botanicalSplit',
    'marbleLuxury',
    'auraSplit',
    'sunsetDunes',
    'forestMist',
    'carbonMatrix',
    'cosmicVortex',
    'auroraBorealis',
    'silkLuxury'
];

function changedTokens(now, before) {
    return Object.keys({ ...before, ...now }).filter(
        (t) => JSON.stringify(now[t]) !== JSON.stringify(before[t])
    );
}

describe('catalog cut: gallery vs hidden themes', () => {
    it('the gallery offers exactly the nine kept themes', () => {
        expect(listGalleryThemes().map((t) => t.key)).toEqual(GALLERY);
    });

    it('every theme is still listed for lookups, 23 of them hidden', () => {
        const all = listBuiltinThemes();
        expect(all).toHaveLength(32);
        expect(all.filter((t) => t.hidden).map((t) => t.key)).toEqual(
            expect.arrayContaining(HIDDEN)
        );
        expect(all.filter((t) => t.hidden)).toHaveLength(23);
    });

    it.each(HIDDEN.filter((k) => !HEADER_FIXED.includes(k)))(
        'hidden theme %s resolves to exactly the same tokens as before',
        (key) => {
            expect(resolveTokens(getBuiltinTheme(key), null)).toEqual(
                BEFORE.hidden[key]
            );
        }
    );

    it.each(HEADER_FIXED)(
        'hidden theme %s changes only its header tokens (header fix)',
        (key) => {
            const changed = changedTokens(
                resolveTokens(getBuiltinTheme(key), null),
                BEFORE.hidden[key]
            );
            expect(changed.length).toBeGreaterThan(0);
            changed.forEach((t) => expect(HEADER_TOKENS).toContain(t));
        }
    );

    it('a hidden theme still publishes with the same snapshot', () => {
        const spec = {
            specVersion: 1,
            theme: { source: 'builtin', name: 'mintStepper' }
        };
        expect(resolveSpecForPublish(spec).resolved.tokens).toEqual(
            BEFORE.hidden.mintStepper
        );
    });

    it.each(GALLERY)(
        'kept theme %s changes only the tokens the plan names',
        (key) => {
            const now = resolveTokens(getBuiltinTheme(key), null);
            const before = BEFORE.kept[key];
            const changed = Object.keys({ ...before, ...now }).filter(
                (t) => JSON.stringify(now[t]) !== JSON.stringify(before[t])
            );
            expect(changed.sort()).toEqual([...ALLOWED_CHANGES[key]].sort());
        }
    );
});

describe('catalog cut: readable ink on the kept themes (P4)', () => {
    it.each(GALLERY)(
        '%s: button label and text-on-accent reach 4.5:1',
        (key) => {
            const t = resolveTokens(getBuiltinTheme(key), null);
            expect(
                contrastRatio(t['--c-submit-text'], t['--c-submit-bg'])
            ).toBeGreaterThanOrEqual(4.5);
            expect(
                contrastRatio(t['--c-on-accent'], t['--c-accent'])
            ).toBeGreaterThanOrEqual(4.5);
        }
    );

    it('theme inks that already pass are kept', () => {
        const neon = resolveTokens(getBuiltinTheme('neonNights'), null);
        expect(neon['--c-submit-text']).toBe('#0a0612');
        const term = resolveTokens(getBuiltinTheme('terminal'), null);
        expect(term['--c-on-accent']).toBe('#000000');
    });
});

describe('catalog cut: titles on Ocean Breeze and Desert Oasis (P6)', () => {
    it.each(['oceanBreeze', 'desertOasis'])(
        '%s: title and description reach 4.5:1 on every stop and the fallback',
        (key) => {
            const pal = getBuiltinTheme(key).palette;
            const backgrounds = [
                pal.headerBg,
                pal.headerBgGradient.start,
                pal.headerBgGradient.end
            ];
            for (const bg of backgrounds) {
                expect(
                    contrastRatio(pal.headerText, bg)
                ).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrastRatio(pal.headerTextWeak, bg)
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    );

    it.each(['oceanBreeze', 'desertOasis'])(
        '%s: the header colour is a real colour, not a gradient string',
        (key) => {
            const t = resolveTokens(getBuiltinTheme(key), null);
            expect(t['--c-header-bg']).toMatch(/^#[0-9a-f]{6}$/i);
            expect(t['--c-header-bg-gradient']).toMatch(/^linear-gradient\(/);
        }
    );
});
