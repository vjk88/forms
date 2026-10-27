import {
    getBuiltinTheme,
    listBuiltinThemes,
    listGalleryThemes,
    listThemeFamilies,
    resolveSpecForPublish
} from 'c/finalThemeCatalog';
import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';
import BEFORE from './__fixtures__/tokensBeforeCatalogCut.json';
import {
    withoutLater,
    withoutTextTreatment
} from '../../finalThemeEngine/__tests__/textContrastContract';
import {
    RESTORED,
    familiesAllowed,
    withoutFamiliesChanges
} from './familiesContract';

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

function changedTokens(nowAll, beforeAll, key) {
    const now = withoutFamiliesChanges(key, withoutLater(nowAll));
    const before = withoutFamiliesChanges(key, withoutLater(beforeAll));
    return Object.keys({ ...before, ...now }).filter(
        (t) => JSON.stringify(now[t]) !== JSON.stringify(before[t])
    );
}

describe('catalog cut: gallery vs hidden themes', () => {
    it('the nine kept themes are still offered (now as family heads or variants)', () => {
        const offered = listGalleryThemes().map((t) => t.key);
        GALLERY.forEach((k) => expect(offered).toContain(k));
    });

    it('every theme is still listed for lookups; after the families build 6 are hidden', () => {
        const all = listBuiltinThemes();
        expect(all).toHaveLength(32);
        expect(
            all
                .filter((t) => t.hidden)
                .map((t) => t.key)
                .sort()
        ).toEqual(
            [
                'execNav',
                'forest',
                'mintStepper',
                'slate',
                'snowStepper',
                'startupNav'
            ].sort()
        );
    });

    it.each(HIDDEN.filter((k) => !HEADER_FIXED.includes(k)))(
        'theme %s (hidden at the cut) resolves to the same tokens, except the families allowlist',
        (key) => {
            expect(
                withoutFamiliesChanges(
                    key,
                    withoutLater(resolveTokens(getBuiltinTheme(key), null))
                )
            ).toEqual(
                withoutFamiliesChanges(key, withoutLater(BEFORE.hidden[key]))
            );
        }
    );

    it.each(HEADER_FIXED)(
        'hidden theme %s changes only its header tokens (header fix)',
        (key) => {
            const changed = changedTokens(
                resolveTokens(getBuiltinTheme(key), null),
                BEFORE.hidden[key],
                key
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
        expect(
            withoutLater(resolveSpecForPublish(spec).resolved.tokens)
        ).toEqual(withoutLater(BEFORE.hidden.mintStepper));
    });

    it.each(GALLERY)(
        'kept theme %s changes only the tokens the plan names',
        (key) => {
            const now = withoutLater(resolveTokens(getBuiltinTheme(key), null));
            const before = withoutLater(BEFORE.kept[key]);
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

// IMPL_PLAN_THEME_FAMILIES (agreed 2026-10-25): 9 families, 26 themes.
describe('theme families', () => {
    const families = listThemeFamilies();
    const members = families.flatMap((f) => f.members.map((m) => m.key));

    it('nine families, 26 themes, no theme in two families', () => {
        expect(families.map((f) => f.key)).toEqual([
            'clean',
            'editorial',
            'dark',
            'photoHeader',
            'scenic',
            'darkGlass',
            'terminal',
            'neonNights',
            'neoBrutalism'
        ]);
        expect(members).toHaveLength(26);
        expect(new Set(members).size).toBe(26);
    });

    it('the gallery is exactly the family members, and every member resolves', () => {
        expect(
            listGalleryThemes()
                .map((t) => t.key)
                .sort()
        ).toEqual([...members].sort());
        members.forEach((k) => expect(getBuiltinTheme(k)).not.toBeNull());
    });

    it('the 10 renamed themes keep their keys', () => {
        const name = (k) => listBuiltinThemes().find((t) => t.key === k).name;
        expect(name('desertOasis')).toBe('Misty Pines');
        expect(name('auroraBorealis')).toBe('Palm Dusk');
        expect(name('silkLuxury')).toBe('Rose & Leaf');
        expect(name('marbleSplit')).toBe('Quiet Studio');
        expect(name('marbleLuxury')).toBe('Modern Home');
        expect(name('claySplit')).toBe('Pine Header');
        expect(name('retroStepper')).toBe('Amber Terminal');
        expect(name('cyberSplit')).toBe('Cyber Midnight');
        expect(name('botanicalSplit')).toBe('Botanical');
        expect(name('auraSplit')).toBe('Bioluminescent');
    });

    it.each(members)(
        '%s: Submit text and selected-answer text reach 4.5:1',
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

    it.each(RESTORED)(
        '%s changes nothing outside the families allowlist',
        (key) => {
            // focus tokens moved with the focus fix (PR 405); header tokens
            // with the header fix (PR 396); the rest must be on the list
            const before = withoutLater(BEFORE.hidden[key]);
            const now = withoutLater(resolveTokens(getBuiltinTheme(key), null));
            const changed = Object.keys({ ...before, ...now })
                .filter(
                    (t) => JSON.stringify(now[t]) !== JSON.stringify(before[t])
                )
                .filter(
                    (t) =>
                        !(
                            HEADER_FIXED.includes(key) &&
                            HEADER_TOKENS.includes(t)
                        )
                );
            changed.forEach((t) => expect(familiesAllowed(key)).toContain(t));
        }
    );
});

// PR 406 review: compare each restored theme WITH and WITHOUT its families
// edit, so every token (focus tokens included) is held to the allowlist, and
// exactly the expected themes change.
describe('theme families: the recipe edits, token by token', () => {
    const undo = (key) => {
        const r = JSON.parse(JSON.stringify(getBuiltinTheme(key)));
        delete r.palette.inkMode;
        if (key === 'cosmicVortex') {
            r.palette.accent = '#a855f7';
        }
        return r;
    };
    const diff = (key) => {
        // without inkMode a theme gets no text treatment either
        // (IMPL_PLAN_TEXT_CONTRAST); compare the families edit alone
        const before = withoutTextTreatment(resolveTokens(undo(key), null));
        const now = withoutTextTreatment(
            resolveTokens(getBuiltinTheme(key), null)
        );
        return Object.keys({ ...before, ...now }).filter(
            (t) => JSON.stringify(now[t]) !== JSON.stringify(before[t])
        );
    };

    it.each(RESTORED)('%s: every changed token is on the allowlist', (key) => {
        diff(key).forEach((t) => expect(familiesAllowed(key)).toContain(t));
    });

    it('exactly these themes change ink, and Cosmic Vortex its accent', () => {
        const changed = RESTORED.filter((k) => diff(k).length).sort();
        expect(changed).toEqual(
            [
                'carbonMatrix',
                'cosmicVortex',
                'cyberSplit',
                'marbleSplit',
                'retroStepper',
                'sunsetDunes',
                'tokyo'
            ].sort()
        );
    });
});
