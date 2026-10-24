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
 * A1 ships two families (one variable, one single-weight); A2 adds the rest.
 */
export const BUNDLED_FONTS = {
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
};

/**
 * Named pairings: a font reference per side. `system` is "Device default",
 * today's installed-font stack (no download).
 */
export const FONT_PAIRINGS = {
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
};

/** The one weight a single-weight family has, else null. */
export function singleWeight(key) {
    const font = BUNDLED_FONTS[key];
    if (!font || font.faces.length !== 1) {
        return null;
    }
    const w = String(font.faces[0].weight);
    return /^\d{1,3}$/.test(w) ? w : null;
}
