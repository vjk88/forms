/**
 * finalFontFamilies — the fonts bundled in the `formFonts` static resource,
 * and the named pairings built from them (IMPL_PLAN_FONTS_AND_BRAND_THEME).
 *
 * Pure data: no resource import, so the theme engine can read it anywhere.
 * c/finalFontBundle turns a family's `faces` into real addresses at paint time.
 *
 * Every family is registered under a private `alias` (FormsBundled<Name>),
 * never its ordinary name: today's `system` stack lists `Roboto` as a
 * fallback, so a face registered as plain "Roboto" would quietly change every
 * legacy form on the page. An uploaded brand font could also share a name.
 *
 * `kind` picks the fallback stack the engine appends. `bodySafe: false` keeps
 * display-only faces (condensed, all-caps, script) out of the Body list.
 * A family with ONE face of ONE weight is single-weight: headings use that
 * weight instead of a browser-thickened fake bold.
 *
 * Keys and aliases are SAVED: keys in font references and published
 * manifests, aliases inside published `--c-font-*` tokens. Never rename one
 * (finalFontFamilies.test.js pins them). All data here is frozen.
 *
 * A1 ships two families (one variable, one single-weight); A2 adds the rest.
 */
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

export const BUNDLED_FONTS = deepFreeze({
    inter: {
        name: 'Inter',
        alias: 'FormsBundledInter',
        kind: 'sans',
        group: 'everyday',
        bodySafe: true,
        faces: [{ file: 'inter/Inter-latin-wght.woff2', weight: '400 700' }]
    },
    bebasNeue: {
        name: 'Bebas Neue',
        alias: 'FormsBundledBebasNeue',
        kind: 'condensed',
        group: 'bold',
        bodySafe: false,
        faces: [{ file: 'bebasneue/BebasNeue-latin-400.woff2', weight: '400' }]
    }
});

/**
 * Named pairings: a font reference per side. `system` is "Device default",
 * today's installed-font stack (no download).
 */
export const FONT_PAIRINGS = deepFreeze({
    system: {
        display: { source: 'stack', key: 'system' },
        body: { source: 'stack', key: 'system' }
    },
    modern: {
        display: { source: 'bundled', key: 'inter' },
        body: { source: 'bundled', key: 'inter' }
    },
    poster: {
        display: { source: 'bundled', key: 'bebasNeue' },
        body: { source: 'bundled', key: 'inter' }
    }
});

/** Own keys only: 'constructor' or 'toString' must never find a family. */
export function bundledFont(key) {
    return typeof key === 'string' &&
        Object.prototype.hasOwnProperty.call(BUNDLED_FONTS, key)
        ? BUNDLED_FONTS[key]
        : undefined;
}

/**
 * The weight headings should use for a family that has no bold: its heaviest
 * real weight (Bebas Neue → '400'; a variable file covering '100 400' →
 * '400'). Null when the family reaches 700, so headings keep their own weight.
 */
export function headingWeight(key) {
    const font = bundledFont(key);
    if (!font) {
        return null;
    }
    const tops = font.faces.map((f) =>
        Math.max(...String(f.weight).split(' ').map(Number))
    );
    const heaviest = Math.max(...tops);
    return Number.isFinite(heaviest) && heaviest < 700
        ? String(heaviest)
        : null;
}
