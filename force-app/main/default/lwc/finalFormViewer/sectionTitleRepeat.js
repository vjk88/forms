/**
 * The section name shown twice (owner 2026-10-11/16, DEFERRED 37;
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md). No DOM, no LWC.
 *
 * Side rail, Tabbed pages, Wizard steps and Accordion name every page in the
 * navigation ("1 Details"), and the one section card under it then said
 * "Details" (or "Contact details") again. The navigation is the heading, so a
 * page with ONE section does not repeat that section's title. Not by comparing
 * words: in the dev org a page has exactly one titled section in 65 cases, the
 * title equals the page name in 1 and is another phrase in 64 (the starter form
 * is page "Details" + section "<Object> details"), so an exact match would fix
 * almost nothing. The title is kept (hidden visually, still announced) and
 * comes back whenever hiding it would lose something.
 */

// The Studio names a new page "Page N" and the navigation falls back to the
// same words for an unnamed one: that is no name to rely on.
const PLACEHOLDER_PAGE_NAME = /^page\s*\d+$/i;

/**
 * Should the lone section of this page keep its title out of sight?
 * `page.sections` is the VISIBLE sections (rules already applied). The caller
 * decides whether the layout names its pages (finalLayoutRegistry
 * layoutNamesPages) and whether the form is split one question per screen.
 */
export function repeatsPageName(page) {
    const sections = (page && page.sections) || [];
    if (sections.length !== 1) {
        return false;
    }
    const name = String(page.name || '').trim();
    if (!name || PLACEHOLDER_PAGE_NAME.test(name)) {
        return false;
    }
    const section = sections[0];
    return (
        Boolean(String(section.title || '').trim()) &&
        // an author who hid it has nothing left to hide; one who switched the
        // header ON by hand (the property panel writes an explicit true) means it
        section.showHeader === undefined &&
        !section.description &&
        !section.icon &&
        !section.collapsible &&
        !section.repeat
    );
}
