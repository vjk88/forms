/**
 * finalLayoutCards — the 8 layout choices as gallery cards, in the old
 * gallery's 3 groups. One list for both rosters that show them: the creation
 * flow's layout step (finalCreationGallery) and the Design panel's layout
 * picker (finalGalleryPicker). Old-style short names (owner picked).
 *
 * `themeKey` only tints each card's mockup, one DISTINCT gallery theme per
 * card; it never sets a new form's theme. Tints use gallery themes only, so a
 * card never previews a theme the user can't pick (IMPL_PLAN_THEME_CATALOG_CUT
 * P3). The Conversational card = splitHero + layout.options.paneFlow
 * (catalog §2). `description` is creation-flow copy; the picker ignores it.
 */
export const LAYOUT_GROUPS = [
    {
        id: 'continuous',
        title: 'Continuous flow',
        hint: 'One page, scrolls top to bottom',
        cards: [
            { layout: 'scroll', themeKey: 'editorialIvory', name: 'Scroll' }
        ]
    },
    {
        id: 'paginated',
        title: 'Paginated / Nav-driven',
        hint: 'Steps, side panels, one section at a time',
        cards: [
            { layout: 'stepper', themeKey: 'dracula', name: 'Stepper' },
            {
                layout: 'splitHero',
                themeKey: 'desertOasis',
                name: 'Split Hero'
            },
            {
                layout: 'splitHero',
                paneFlow: 'oneAtATime',
                themeKey: 'neonNights',
                name: 'Split Hero · Conversational',
                description:
                    'Start from the Split Hero layout, one section at a time.'
            },
            { layout: 'rail', themeKey: 'nordic', name: 'Side Nav' },
            {
                layout: 'oneAtATime',
                themeKey: 'sandstone',
                name: 'One at a Time'
            }
        ]
    },
    {
        id: 'tabbedAcc',
        title: 'Tabbed & Accordion',
        hint: 'Content grouped into panels',
        cards: [
            { layout: 'tabs', themeKey: 'oceanBreeze', name: 'Tabbed' },
            {
                layout: 'accordion',
                themeKey: 'neoBrutalism',
                name: 'Accordion'
            }
        ]
    }
];
