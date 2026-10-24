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

// Uploaded fonts keep their ids (final-font-<key>); resolved-face fonts get
// their own prefix, so an uploaded key such as Bundled_Inter can never take
// a bundled font's id and stop it registering.
function styleId(key, prefix = 'final-font-') {
    return `${prefix}${String(key)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`;
}

// Text that ends up inside the global @font-face block. A quote, bracket,
// semicolon, backslash or line break could close the rule and add CSS of its
// own to every page, so such a family or address is refused outright.
const UNSAFE = /['"\\(){};<>\r\n]/;

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

// A face's weight: one weight ('400', 'bold') or a variable file's range
// ('400 700'). Anything else would break the @font-face block.
const WEIGHT = /^(normal|bold|\d{1,3}( \d{1,3})?)$/;

/**
 * Registers a font once per document. Two call shapes:
 * - uploaded font (Form_Font__mdt): { key, family, resource, regularPath, boldPath }
 *   — the address is built from the static resource name, as it always was;
 * - resolved faces (bundled fonts): { key, family, faces: [{ url, weight }] }
 *   — `url` is already this org's address, `weight` may be a range.
 * @returns {boolean} true when a style tag is present after the call
 */
export function ensureFont(font) {
    const faces =
        font && Array.isArray(font.faces)
            ? font.faces.filter(
                  (f) => f && f.url && WEIGHT.test(String(f.weight))
              )
            : null;
    if (!font || !font.family || (faces ? !faces.length : !font.resource)) {
        return false;
    }
    const id = faces
        ? styleId(font.key || font.family, 'final-fontb-')
        : styleId(font.key || font.family);
    // The global head IS this module's job: @font-face only registers there.
    // eslint-disable-next-line @lwc/lwc/no-document-query
    if (loadedIds.has(id) || document.getElementById(id)) {
        loadedIds.add(id);
        return true;
    }
    let list;
    if (faces) {
        list = faces.map((f) => [f.url, f.weight]);
    } else {
        const base = `/resource/${font.resource}`;
        list = [
            [
                font.regularPath
                    ? `${base}/${font.regularPath.replace(/^\//, '')}`
                    : base,
                'normal'
            ]
        ];
        if (font.boldPath) {
            list.push([`${base}/${font.boldPath.replace(/^\//, '')}`, 'bold']);
        }
    }
    if (UNSAFE.test(font.family) || list.some(([url]) => UNSAFE.test(url))) {
        return false;
    }
    const rules = list.map(([url, weight]) =>
        faceRule(font.family, url, weight)
    );
    const style = document.createElement('style');
    style.id = id;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    loadedIds.add(id);
    return true;
}
