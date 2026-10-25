import {
    resolveTokens,
    resolveFontRefs,
    fontManifest
} from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { BUNDLED_FONTS } from 'c/finalFontFamilies';
import BEFORE from './__fixtures__/fontsLegacyBeforeA1.json';
import { withoutFocus } from './focusContract';

// IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3b. The fixture is resolveTokens() for
// every legacy theme × form font combination and all 32 themes, captured on
// main BEFORE fonts A1 (origin/main 8bf61d3).

const BRAND_X = {
    key: 'Brand_X',
    family: 'Brand X',
    fallback: 'serif',
    resource: 'brand_x',
    regularPath: 'x-regular.woff2',
    boldPath: 'x-bold.woff2'
};
const BRAND_Y = {
    key: 'Brand_Y',
    family: 'Brand Y',
    fallback: 'sans-serif',
    resource: 'brand_y'
};
const SYSTEM =
    "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INTER = `'FormsBundledInter', ${SYSTEM}`;
const BEBAS = "'FormsBundledBebasNeue', Impact, 'Arial Narrow', sans-serif";

function nordicWith(patch) {
    const theme = {
        ...JSON.parse(JSON.stringify(getBuiltinTheme('nordic'))),
        ...patch
    };
    if (!('customFont' in patch)) {
        delete theme.customFont;
    }
    return theme;
}

const fontsOf = (t) => [t['--c-font-display'], t['--c-font-body']];

describe('fonts A1: legacy regime is byte-for-byte unchanged', () => {
    it.each(BEFORE.cases.map((c) => [c.name, c]))('%s', (name, c) => {
        const theme = c.base ? nordicWith(c.themePatch) : null;
        expect(withoutFocus(resolveTokens(theme, c.overrides))).toStrictEqual(
            withoutFocus(c.tokens)
        );
    });

    it.each(listBuiltinThemes().map((t) => t.key))(
        'theme %s resolves exactly as before',
        (key) => {
            expect(
                withoutFocus(resolveTokens(getBuiltinTheme(key), null))
            ).toStrictEqual(withoutFocus(BEFORE.themes[key]));
        }
    );

    it('the fixture really covers the cases the plan names', () => {
        const names = BEFORE.cases.map((c) => c.name);
        expect(names).toContain('theme customFont / form typographyGeometric');
        expect(names).toContain('theme customFont / form customFontNull');
        expect(names).toHaveLength(26);
        // the known legacy quirk the plan preserves: theme font beats form pairing
        const quirk = BEFORE.cases.find(
            (c) => c.name === 'theme customFont / form typographyGeometric'
        );
        expect(quirk.tokens['--c-font-body']).toBe("'Brand X', serif");
    });
});

describe('fonts A1: new regime (a `fonts` setting exists)', () => {
    it('form fonts.pairing → both sides bundled, under private aliases', () => {
        const t = resolveTokens(nordicWith({}), {
            fonts: { pairing: 'modern' }
        });
        expect(fontsOf(t)).toEqual([INTER, INTER]);
    });

    it('pairing with a single-weight display face sets its real weight', () => {
        const t = resolveTokens(nordicWith({}), {
            fonts: { pairing: 'poster' }
        });
        expect(fontsOf(t)).toEqual([BEBAS, INTER]);
        expect(t['--c-font-display-weight']).toBe('400');
    });

    it('a variable or installed display font emits no weight token', () => {
        const modern = resolveTokens(nordicWith({}), {
            fonts: { pairing: 'modern' }
        });
        expect('--c-font-display-weight' in modern).toBe(false);
        const legacy = resolveTokens(nordicWith({}), null);
        expect('--c-font-display-weight' in legacy).toBe(false);
    });

    it('form beats theme in the new regime (theme Brand X, form pairing)', () => {
        const t = resolveTokens(nordicWith({ customFont: BRAND_X }), {
            fonts: { pairing: 'modern' }
        });
        expect(fontsOf(t)).toEqual([INTER, INTER]);
    });

    it('per side: form display only → body falls to the theme', () => {
        const t = resolveTokens(nordicWith({ customFont: BRAND_X }), {
            fonts: { display: { source: 'bundled', key: 'bebasNeue' } }
        });
        expect(fontsOf(t)).toEqual([BEBAS, "'Brand X', serif"]);
    });

    it('explicit form customFont: null still hides the theme font', () => {
        const t = resolveTokens(nordicWith({ customFont: BRAND_X }), {
            customFont: null,
            fonts: { display: { source: 'bundled', key: 'bebasNeue' } }
        });
        expect(t['--c-font-body']).toBe(SYSTEM);
    });

    it('theme-level fonts (brand themes) and form legacy typography: form wins', () => {
        const theme = nordicWith({ fonts: { pairing: 'modern' } });
        expect(fontsOf(resolveTokens(theme, null))).toEqual([INTER, INTER]);
        const t = resolveTokens(theme, { typography: 'mono' });
        expect(t['--c-font-body']).toMatch(/^'SFMono-Regular'/);
    });

    it('a migrated one-side edit renders the untouched side exactly as before', () => {
        // before: the form's own customFont Brand Y on both sides
        const before = resolveTokens(nordicWith({}), { customFont: BRAND_Y });
        // after a heading-only pick: the body carried over as a full reference
        const after = resolveTokens(nordicWith({}), {
            fonts: {
                display: { source: 'bundled', key: 'bebasNeue' },
                body: { ...BRAND_Y, source: 'uploaded' }
            }
        });
        expect(after['--c-font-body']).toBe(before['--c-font-body']);
        // and the reciprocal: a legacy stack carried over on the display side
        const geo = resolveTokens(nordicWith({}), { typography: 'geometric' });
        const bodyOnly = resolveTokens(nordicWith({}), {
            fonts: {
                display: { source: 'stack', key: 'geometric' },
                body: { source: 'bundled', key: 'inter' }
            }
        });
        expect(bodyOnly['--c-font-display']).toBe(geo['--c-font-display']);
    });

    it('unknown or broken references are skipped, never emitted', () => {
        const t = resolveTokens(nordicWith({}), {
            fonts: {
                pairing: 'nope',
                display: { source: 'bundled', key: 'missing' },
                body: { source: 'uploaded' }
            }
        });
        expect(fontsOf(t)).toEqual([SYSTEM, SYSTEM]);
    });
});

describe('fonts A1: hardening (PR 398 review)', () => {
    const X = { key: 'X', family: 'Brand X', fallback: 'serif', resource: 'x' };

    it.each([
        ['an empty fonts setting', {}],
        ['an unknown pairing', { pairing: 'nope' }],
        [
            'a broken reference',
            { display: { source: 'bundled', key: 'missing' } }
        ]
    ])(
        '%s keeps the legacy rules (theme Brand X beats form mono)',
        (label, fonts) => {
            const legacy = resolveTokens(nordicWith({ customFont: X }), {
                typography: 'mono'
            });
            const withFonts = resolveTokens(nordicWith({ customFont: X }), {
                typography: 'mono',
                fonts
            });
            expect(withFonts).toStrictEqual(legacy);
            expect(withFonts['--c-font-body']).toBe("'Brand X', serif");
        }
    );

    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
        'bundled key %s neither throws nor reaches the manifest',
        (key) => {
            const o = {
                fonts: {
                    display: { source: 'bundled', key },
                    body: { source: 'bundled', key },
                    pairing: key
                }
            };
            expect(() => resolveTokens(nordicWith({}), o)).not.toThrow();
            expect(fontsOf(resolveTokens(nordicWith({}), o))).toEqual([
                SYSTEM,
                SYSTEM
            ]);
            expect(fontManifest(nordicWith({}), o)).toEqual([]);
        }
    );

    it('a display-only face is never used for the body', () => {
        const t = resolveTokens(nordicWith({}), {
            fonts: {
                display: { source: 'bundled', key: 'bebasNeue' },
                body: { source: 'bundled', key: 'bebasNeue' }
            }
        });
        expect(t['--c-font-display']).toBe(BEBAS);
        expect(t['--c-font-body']).toBe(SYSTEM);
    });

    it('returned references are copies, never the shared pairing data', () => {
        const refs = resolveFontRefs(nordicWith({}), {
            fonts: { pairing: 'modern' }
        });
        refs.display.key = 'changed';
        const again = resolveFontRefs(nordicWith({}), {
            fonts: { pairing: 'modern' }
        });
        expect(again.display.key).toBe('inter');
    });
});

describe('fonts A1: bundled fonts never use an ordinary family name', () => {
    it.each(Object.entries(BUNDLED_FONTS))('%s', (key, font) => {
        expect(font.alias).toMatch(/^FormsBundled[A-Za-z0-9]+$/);
        expect(font.alias).not.toBe(font.name);
        const t = resolveTokens(nordicWith({}), {
            fonts: {
                display: { source: 'bundled', key },
                body: { source: 'bundled', key }
            }
        });
        expect(t['--c-font-display'].startsWith(`'${font.alias}'`)).toBe(true);
    });
});

describe('fonts A1: the manifest of fonts to load', () => {
    it('installed-font stacks need nothing; legacy forms list only their upload', () => {
        expect(fontManifest(nordicWith({}), null)).toEqual([]);
        expect(fontManifest(nordicWith({}), { customFont: BRAND_Y })).toEqual([
            { ...BRAND_Y, source: 'uploaded' }
        ]);
    });

    it('an org theme with two uploaded fonts lists both, with file info', () => {
        const theme = nordicWith({
            fonts: {
                display: { ...BRAND_X, source: 'uploaded' },
                body: { ...BRAND_Y, source: 'uploaded' }
            }
        });
        const m = fontManifest(theme, null);
        expect(m).toHaveLength(2);
        expect(m[0]).toMatchObject({
            source: 'uploaded',
            resource: 'brand_x',
            boldPath: 'x-bold.woff2'
        });
        expect(m[1]).toMatchObject({ source: 'uploaded', resource: 'brand_y' });
    });

    it('a bundled font used on both sides is listed once', () => {
        expect(
            fontManifest(nordicWith({}), { fonts: { pairing: 'modern' } })
        ).toEqual([{ source: 'bundled', key: 'inter' }]);
    });

    it('resolveFontRefs agrees with the emitted stacks', () => {
        const refs = resolveFontRefs(nordicWith({}), {
            fonts: { pairing: 'poster' }
        });
        expect(refs.display).toEqual({ source: 'bundled', key: 'bebasNeue' });
        expect(refs.body).toEqual({ source: 'bundled', key: 'inter' });
    });

    it('no theme and no overrides → nothing', () => {
        expect(fontManifest(null, null)).toEqual([]);
    });
});
