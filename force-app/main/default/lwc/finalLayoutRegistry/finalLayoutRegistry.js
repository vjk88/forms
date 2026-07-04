/**
 * finalLayoutRegistry — the single place a layout is declared (ARCHITECTURE §2.2).
 *
 * Adding a layout = one new nav primitive + one row here. Nothing else changes:
 * the viewer lazy-loads via `load()` (`lwc:is`), and editor conditional-visibility
 * rules read the metadata — nobody hardcodes layout lists.
 *
 * P0 registers `scroll` only; the remaining six rows land with their primitives in P1.
 */

export const LAYOUTS = {
    scroll: {
        label: 'Continuous scroll',
        load: () => import('c/finalNavScroll'),
        multiPage: false,
        gating: false
    }
};

const DEFAULT_TYPE = 'scroll';

/** Registry row for a spec `layout.type` — unknown types fall back to scroll. */
export function getLayout(type) {
    return LAYOUTS[type] || LAYOUTS[DEFAULT_TYPE];
}
