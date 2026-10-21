/**
 * finalThemeAssets — the real address of the theme photo bundle, for painting.
 *
 * Theme data (finalThemeCatalog) and every published form's frozen
 * `resolved.tokens` name photos by the PORTABLE address
 * `/resource/formThemeAssets/<file>.jpg`. That text is right in this org but
 * wrong in a subscriber org (the managed namespace renames the bundle to
 * `<ns>__formThemeAssets`) and on a site with a path prefix. Salesforce fills
 * the import below with the correct address for whatever org and host serves
 * this file, so the painters swap it in just before the browser sees it.
 *
 * Stored data never changes: catalog, engine and published snapshots keep the
 * portable text (and stay org-neutral), and already-published forms are fixed
 * without a republish. Painters: finalFormViewer, finalThemeCard,
 * finalLayoutCard, and the Design panel's image thumbnail.
 */
import THEME_PHOTOS from '@salesforce/resourceUrl/formThemeAssets';

// Only where an address STARTS: string start, or right after `(`, a quote,
// whitespace or a comma (url(...) lists). Never mid-URL.
const PORTABLE = /(^|[("'\s,])\/resource\/formThemeAssets\//g;

/** One value: the portable photo prefix → this org's real one. Non-strings
 *  and values without the prefix pass through untouched. */
export function localizeAssetUrl(value) {
    if (typeof value !== 'string' || !THEME_PHOTOS) {
        return value;
    }
    return value.replace(PORTABLE, (match, lead) => `${lead}${THEME_PHOTOS}/`);
}

/** A whole `--c-*` token bag. Returns the SAME object when nothing changed. */
export function localizeAssetUrls(tokens) {
    if (!tokens || typeof tokens !== 'object') {
        return tokens;
    }
    let out = null;
    for (const [key, value] of Object.entries(tokens)) {
        const next = localizeAssetUrl(value);
        if (next !== value) {
            out = out || { ...tokens };
            out[key] = next;
        }
    }
    return out || tokens;
}
