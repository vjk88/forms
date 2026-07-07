/**
 * finalFontLoader — global @font-face injection (CUSTOM_FONTS.md §3).
 *
 * font-family is inherited, but @font-face inside shadow DOM does not
 * register — so the face must be declared in the GLOBAL document head; the
 * family name then cascades into every shadow tree via the --c-font-* tokens.
 *
 * Runtime path for builder AND guest: tiny, dependency-free, idempotent.
 */

const loadedIds = new Set();

function styleId(key) {
    return `final-font-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function faceRule(family, url, weight) {
    return (
        `@font-face {` +
        ` font-family: '${family}';` +
        ` src: url('${url}') format('woff2');` +
        ` font-weight: ${weight};` +
        ` font-style: normal;` +
        ` font-display: swap; }`
    );
}

/**
 * Registers a custom font once per document.
 * @param {object} font { key, family, resource, regularPath, boldPath }
 * @returns {boolean} true when a style tag is present after the call
 */
export function ensureFont(font) {
    if (!font || !font.family || !font.resource) {
        return false;
    }
    const id = styleId(font.key || font.family);
    if (loadedIds.has(id) || document.getElementById(id)) {
        loadedIds.add(id);
        return true;
    }
    const base = `/resource/${font.resource}`;
    const regularUrl = font.regularPath
        ? `${base}/${font.regularPath.replace(/^\//, '')}`
        : base;
    const rules = [faceRule(font.family, regularUrl, 'normal')];
    if (font.boldPath) {
        rules.push(
            faceRule(font.family, `${base}/${font.boldPath.replace(/^\//, '')}`, 'bold')
        );
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    loadedIds.add(id);
    return true;
}
