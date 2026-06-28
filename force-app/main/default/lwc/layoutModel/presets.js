/**
 * Layout preset definitions — the structural choices behind the gallery.
 *
 * Phase 3 (T3.3): the catalog is now the **8 canonical layouts in 3 groups**
 * (THEME_PROPERTIES_SPEC §1.1 + the owner's "Split Hero is its own layout"
 * decision). The old per-look archetypes (classic/glass/document/console/
 * sfRecordPage/mosaic/…) collapsed into these — their *looks* are now THEMES
 * (c/formThemes), not shells. `ARCHETYPE_ALIAS` keeps any pre-rename stored
 * spec resolving.
 *
 * Each preset's `shell` config drives the (now parameterized) shell component;
 * `fill` names the fill rule used by materialize() (see layoutModel.js).
 */

export const FILL_RULES = {
    STACK_PER_PAGE: 'stackPerPage',
    MOSAIC: 'mosaic'
};

export const PRESETS = {
    // ---- Group 1: Continuous flow (one page, scroll) --------------------
    stacked: {
        tier: 'core',
        group: 'continuous',
        label: 'Stacked',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'scroll',
            chrome: 'card',
            maxWidth: 'medium',
            header: 'standard',
            progress: 'none',
            submit: { placement: 'auto', alignment: 'right' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    },
    bento: {
        tier: 'core',
        group: 'continuous',
        label: 'Bento Grid',
        fill: FILL_RULES.MOSAIC,
        density: 'comfortable',
        shell: {
            nav: 'scroll',
            chrome: 'card',
            maxWidth: 'wide',
            header: 'standard',
            progress: 'none',
            submit: { placement: 'auto', alignment: 'right' }
        },
        responsive: { collapseBelow: '1024px', collapseOrder: 'mainFirst' }
    },

    // ---- Group 2: Paginated / Nav-driven --------------------------------
    stepper: {
        tier: 'core',
        group: 'paginated',
        label: 'Stepper',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'stepper',
            stepperMode: 'vertical',
            chrome: 'card',
            maxWidth: 'wide',
            header: 'minimal',
            progress: 'auto',
            submit: { placement: 'flow', alignment: 'right' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    },
    // Split Hero stays its OWN layout (owner): the whole left panel IS the
    // header panel and holds any number of brand/highlight messages.
    splitHero: {
        tier: 'core',
        group: 'paginated',
        label: 'Split Hero',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'stepper',
            chrome: 'fullbleed',
            maxWidth: 'full',
            header: 'none',
            progress: 'auto',
            brandPanel: {
                side: 'left',
                width: '38%',
                sticky: true,
                content: ['logo', 'title', 'description', 'props', 'quote']
            },
            submit: { placement: 'flow', alignment: 'right' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    },
    sideNav: {
        tier: 'core',
        group: 'paginated',
        label: 'Side Nav',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'sidenav',
            chrome: 'card',
            maxWidth: 'wide',
            header: 'minimal',
            progress: 'auto',
            submit: { placement: 'flow', alignment: 'right' }
        },
        responsive: { collapseBelow: '1024px', collapseOrder: 'source' }
    },
    oneAtATime: {
        tier: 'core',
        group: 'paginated',
        label: 'One at a Time',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'oneAtATime',
            chrome: 'fullbleed',
            maxWidth: 'narrow',
            header: 'minimal',
            progress: 'bar',
            submit: { placement: 'flow', alignment: 'left' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    },

    // ---- Group 3: Tabbed & Accordion ------------------------------------
    tabbed: {
        tier: 'core',
        group: 'tabbed',
        label: 'Tabbed',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'tabs',
            chrome: 'card',
            maxWidth: 'medium',
            header: 'standard',
            progress: 'fraction',
            submit: { placement: 'auto', alignment: 'right' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    },
    accordion: {
        tier: 'core',
        group: 'tabbed',
        label: 'Accordion',
        fill: FILL_RULES.STACK_PER_PAGE,
        density: 'comfortable',
        shell: {
            nav: 'accordion',
            chrome: 'card',
            maxWidth: 'medium',
            header: 'standard',
            progress: 'fraction',
            submit: { placement: 'auto', alignment: 'right' }
        },
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    }
};

/**
 * The 3 user-facing groups (THEME_PROPERTIES_SPEC §1.1). Drives the creation
 * flow's "Start from scratch" layout picker.
 */
export const LAYOUT_GROUPS = [
    {
        id: 'continuous',
        label: 'Continuous flow',
        hint: 'One page, scrolls top to bottom',
        layouts: ['stacked', 'bento']
    },
    {
        id: 'paginated',
        label: 'Paginated / Nav-driven',
        hint: 'Steps, side panels, one question at a time',
        layouts: ['stepper', 'splitHero', 'sideNav', 'oneAtATime']
    },
    {
        id: 'tabbed',
        label: 'Tabbed & Accordion',
        hint: 'Content grouped into panels',
        layouts: ['tabbed', 'accordion']
    }
];

export const LAYOUT_LABELS = Object.keys(PRESETS).reduce((m, k) => {
    m[k] = PRESETS[k].label;
    return m;
}, {});

/**
 * Back-compat: pre-Phase-3 archetype id → its new canonical layout. Lets old
 * stored specs / templates resolve through materialize() + the shell loader.
 */
export const ARCHETYPE_ALIAS = {
    classic: 'stacked',
    sfRecordPage: 'stacked',
    immersiveGlass: 'stacked',
    document: 'stacked',
    console: 'stacked',
    timeline: 'stacked',
    mosaicGrid: 'bento',
    wizardStepper: 'stepper',
    conversational: 'oneAtATime',
    kiosk: 'oneAtATime',
    tabbedCard: 'tabbed'
    // splitHero, sideNav, accordion keep their ids (pass through)
};

/** Resolve any archetype id (old or new) to a canonical PRESETS key. */
export function resolveArchetype(id) {
    if (PRESETS[id]) return id;
    return ARCHETYPE_ALIAS[id] || id;
}

/**
 * Canonical layout id → shell component module. MANY-TO-ONE: stacked + bento
 * share c/shellStack (bento via the MOSAIC fill rule). The engine lazy-loads
 * from the matching SHELL_LOADERS map (LAYOUT_SPEC §11). 8 layouts → 7 shells.
 */
export const REGISTRY = {
    stacked: 'c/shellStack',
    bento: 'c/shellStack',
    stepper: 'c/shellWizard',
    splitHero: 'c/shellSplitHero',
    sideNav: 'c/shellSideNav',
    oneAtATime: 'c/shellConversational',
    tabbed: 'c/shellTabbed',
    accordion: 'c/shellAccordion'
};

export const CORE_ARCHETYPES = Object.keys(PRESETS).filter(
    (k) => PRESETS[k].tier === 'core'
);
