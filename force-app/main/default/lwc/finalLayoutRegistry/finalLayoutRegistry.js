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
        gating: false,
        // Names each page with a divider heading, but only when the design
        // option is on and there is more than one page (layoutNamesPages).
        pageNames: 'dividers',
        pageNameBy: 'page divider',
        // Default action-row arrangement (LAYOUT_REFINEMENTS_SPEC §3): submit
        // only → sit it in the conventional primary corner (right).
        buttonArrangement: 'together-right'
    },
    stepper: {
        label: 'Wizard steps',
        load: () => import('c/finalNavStepper'),
        paginates: true,
        gating: true,
        // The step labels give way to dots or a bar on a narrow form, or when
        // the strip is set to dots or a bar (layoutNamesPages).
        pageNames: 'wide',
        pageNameBy: 'step bar',
        // Wizard convention: Back one end, Next the other.
        buttonArrangement: 'split'
    },
    tabs: {
        label: 'Tabbed pages',
        load: () => import('c/finalNavTabs'),
        paginates: true,
        gating: false,
        // A tab strip that scrolls but never drops its labels.
        pageNames: 'always',
        pageNameBy: 'tab',
        buttonArrangement: 'split'
    },
    accordion: {
        label: 'Accordion panels',
        load: () => import('c/finalNavAccordion'),
        // Panels expand in place — all pages stay visible territory, so the
        // submitBar renders once below (like scroll), never per panel.
        paginates: false,
        gating: false,
        // Every panel title is on screen at every width.
        pageNames: 'always',
        pageNameBy: 'panel title',
        buttonArrangement: 'together-right'
    },
    rail: {
        label: 'Side rail',
        load: () => import('c/finalNavRail'),
        paginates: true,
        gating: false,
        // The rail's labels give way to numbered chips on a narrow form, unless
        // the narrow behaviour is the Pages menu (layoutNamesPages).
        pageNames: 'wide',
        pageNameBy: 'side rail',
        buttonArrangement: 'split'
    },
    oneAtATime: {
        label: 'One at a time',
        load: () => import('c/finalNavOneAtATime'),
        paginates: true,
        gating: true,
        // The primitive's Advance Trigger IS the navigation (catalog §2's one
        // exception): the engine renders no Next/Back, only Submit at the end.
        ownsAdvance: true,
        // Grouped bottom-left (owner 2026-07-05): least mouse travel, the
        // conversational feel — Continue and Submit share one spot, no jump.
        buttonArrangement: 'together-left',
        // Full-bleed is the conversational look (2nd bleed consumer after
        // splitHero, default ON): page chrome + a floating question card.
        bleed: true
    },
    splitHero: {
        label: 'Split hero',
        load: () => import('c/finalNavSplitHero'),
        paginates: true,
        gating: true,
        // The brand pane replaces formHeader (owner 2026-07-05) — the engine
        // must not render a second header.
        ownsHeader: true,
        // May run full-bleed (Immersive toggle, default ON): pageFrame drops
        // the panel surface and the primitive owns the canvas edge-to-edge.
        bleed: true,
        buttonArrangement: 'split'
    }
};

const DEFAULT_TYPE = 'scroll';

/** Registry row for a spec `layout.type` — unknown types fall back to scroll. */
export function getLayout(type) {
    return LAYOUTS[type] || LAYOUTS[DEFAULT_TYPE];
}

/**
 * One question per screen (Design → Paging, surveys only): the split rides
 * paginating layouts, scroll has no paging machinery to ride. The viewer splits
 * the pages on this; the Studio asks it too, so both agree on what a "page" is.
 */
export function isOnePerScreen(spec) {
    const form = (spec && spec.form) || {};
    const settings = (spec && spec.settings) || {};
    return Boolean(
        form.type === 'survey' &&
        settings.onePerScreen &&
        getLayout(spec && spec.layout ? spec.layout.type : undefined).paginates
    );
}

/**
 * Does this layout put each page's NAME on screen, and when? Answers
 *   'always'  at every width: Tabbed pages, Accordion panels, Continuous scroll
 *             with its page dividers (option on, more than one page), and the side
 *             rail set to collapse into a Pages menu (the button names the page)
 *   'wide'    only while the navigation has room: the side rail's labels become
 *             numbered chips, and the wizard strip's labels become dots or a bar,
 *             on a narrow form (a container 540px wide or narrower)
 *   false     never: One at a time, Split hero, a wizard strip set to dots or a
 *             progress bar, Scroll without dividers
 * A section title that would repeat a page name is hidden only where that name
 * is on screen (c/finalPageName repeatsPageName; `pageNameBy` on the rows above
 * says what to call the thing that shows it).
 */
export function layoutNamesPages(type, options, pageCount) {
    const names = getLayout(type).pageNames;
    const opts = options || {};
    if (names === 'always') {
        return 'always';
    }
    if (names === 'dividers') {
        return opts.showDividers && pageCount > 1 ? 'always' : false;
    }
    if (names === 'wide') {
        if (type === 'rail' && opts.narrowBehavior === 'drawer') {
            return 'always';
        }
        if (
            type === 'stepper' &&
            (opts.mode === 'dots' || opts.mode === 'progressBar')
        ) {
            return false;
        }
        return 'wide';
    }
    return false;
}
