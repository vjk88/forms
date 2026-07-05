/**
 * finalLayoutRegistry — the single place a layout is declared (ARCHITECTURE §2.2).
 *
 * Adding a layout = one new nav primitive + one row here. Nothing else changes:
 * the viewer lazy-loads via `load()` (`lwc:is`), and editor conditional-visibility
 * rules read the metadata — nobody hardcodes layout lists.
 *
 * Rows land with their primitives, one per P1 PR.
 */

export const LAYOUTS = {
    scroll: {
        label: 'Continuous scroll',
        load: () => import('c/finalNavScroll'),
        // paginates = presents pages as discrete steps. Any layout can host a
        // multi-page spec — scroll flattens pages with dividers (ARCH §2.2).
        paginates: false,
        gating: false
    },
    stepper: {
        label: 'Wizard steps',
        load: () => import('c/finalNavStepper'),
        paginates: true,
        gating: true
    },
    tabs: {
        label: 'Tabbed pages',
        load: () => import('c/finalNavTabs'),
        paginates: true,
        gating: false
    },
    accordion: {
        label: 'Accordion panels',
        load: () => import('c/finalNavAccordion'),
        // Panels expand in place — all pages stay visible territory, so the
        // submitBar renders once below (like scroll), never per panel.
        paginates: false,
        gating: false
    },
    rail: {
        label: 'Side rail',
        load: () => import('c/finalNavRail'),
        paginates: true,
        gating: false
    },
    oneAtATime: {
        label: 'One at a time',
        load: () => import('c/finalNavOneAtATime'),
        paginates: true,
        gating: true,
        // The primitive's Advance Trigger IS the navigation (catalog §2's one
        // exception): the engine renders no Next/Back, only Submit at the end.
        ownsAdvance: true
    },
    splitHero: {
        label: 'Split hero',
        load: () => import('c/finalNavSplitHero'),
        paginates: true,
        gating: true,
        // The brand pane replaces formHeader (owner 2026-07-05) — the engine
        // must not render a second header.
        ownsHeader: true
    }
};

const DEFAULT_TYPE = 'scroll';

/** Registry row for a spec `layout.type` — unknown types fall back to scroll. */
export function getLayout(type) {
    return LAYOUTS[type] || LAYOUTS[DEFAULT_TYPE];
}
