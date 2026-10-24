/**
 * finalFontBundle — registers the fonts a form needs, from font references
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3).
 *
 * Fonts load ONLY from explicit references: a published snapshot's
 * `resolved.fonts` manifest, or the engine's fontManifest() for a draft.
 * Nothing is ever guessed from a family name in the tokens.
 *
 * Bundled fonts take their address from the resource import, so it is right
 * in a subscriber org (namespaced bundle) and on the public site — the same
 * reason as c/finalThemeAssets.
 */
import FONTS_URL from '@salesforce/resourceUrl/formFonts';
import { BUNDLED_FONTS } from 'c/finalFontFamilies';
import { ensureFont } from 'c/finalFontLoader';

/** A bundled family's faces with this org's real addresses, or []. */
export function bundledFaces(key) {
    const font = BUNDLED_FONTS[key];
    if (!font || !FONTS_URL) {
        return [];
    }
    return font.faces.map((f) => ({
        url: `${FONTS_URL}/${f.file}`,
        weight: f.weight
    }));
}

/**
 * Registers one font reference. Bundled → its alias + resolved faces;
 * uploaded → the Form_Font__mdt shape the loader has always taken;
 * stack (installed fonts) → nothing to load.
 * @returns {boolean} true when the font is registered after the call
 */
export function ensureFontRef(ref) {
    if (!ref || typeof ref !== 'object') {
        return false;
    }
    if (ref.source === 'bundled') {
        const font = BUNDLED_FONTS[ref.key];
        if (!font) {
            return false;
        }
        return ensureFont({
            key: `bundled-${ref.key}`,
            family: font.alias,
            faces: bundledFaces(ref.key)
        });
    }
    if (ref.source === 'uploaded') {
        return ensureFont(ref);
    }
    return false;
}

/** Registers every reference in a manifest; ignores junk entries. */
export function ensureFontRefs(refs) {
    if (!Array.isArray(refs)) {
        return;
    }
    refs.forEach((ref) => ensureFontRef(ref));
}
