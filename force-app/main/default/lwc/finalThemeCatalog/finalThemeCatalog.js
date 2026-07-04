/**
 * finalThemeCatalog — L4 built-in theme data (ARCHITECTURE_LAYOUTS_THEMES §4).
 *
 * Data only: theme-property objects (§4.1 shape). Zero CSS, zero component knowledge —
 * the engine owns translation to tokens. Lives in MANAGED code so built-in recipes are
 * not browsable in a subscriber org (§4.2, decision closed 2026-07-03). Loaded by
 * BUILDER components only — the published/guest runtime uses the spec's `resolved`
 * token snapshot and never imports this module (resolve-at-publish).
 *
 * P0 carries ONE theme; the full roster lands in P2.
 */

const THEMES = {
    editorialIvory: {
        name: 'Editorial Ivory',
        tags: ['light', 'editorial'],
        palette: {
            accent: '#0f766e',
            pageBg: '#f6f4ee',
            contentBg: '#fffdf8',
            text: '#232019',
            textWeak: '#6f6a5e',
            headerBg: 'transparent',
            headerText: '#232019'
        },
        typography: 'editorial',
        radius: 'soft',
        border: 'hairline',
        density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null },
        fieldStates: { focus: '#0f766e', error: '#b42318', required: '#b42318' }
    }
};

/** Catalog key → theme-property object (a defensive copy), or null when unknown. */
export function getBuiltinTheme(key) {
    const theme = THEMES[key];
    return theme ? JSON.parse(JSON.stringify(theme)) : null;
}

/** Gallery listing: [{ key, name, tags }] — never the recipes themselves. */
export function listBuiltinThemes() {
    return Object.entries(THEMES).map(([key, t]) => ({
        key,
        name: t.name,
        tags: [...t.tags]
    }));
}
