/**
 * Page names, and the section title that would repeat one. No DOM, no LWC.
 * Shared by the viewer (which hides the repeat), the Studio (which explains it
 * to the author) and the Scroll layout (which draws page dividers).
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md.
 *
 * Is this a page name somebody chose, or a placeholder? The Studio names a new
 * page "Page 2" and every navigation falls back to the same words for an unnamed
 * one, so such a name says nothing about the page. A section title or a divider
 * heading that would repeat or replace it is then the only name the page has.
 *
 * Placeholder = a bare number ("2"), or a generic word with an optional number
 * ("Page 2", "Step 3", "Part 1", "Section 1", "Screen 4", "Stage 2", "Tab 2",
 * "Page", "Untitled"). "Page break" or "Step by step" are real names.
 */
const PLACEHOLDER =
    /^(?:\d+|(?:page|step|part|section|screen|stage|tab)\s*\d*|untitled(?:\s*\d+)?)$/i;

export function isRealPageName(name) {
    const text = String(name === undefined || name === null ? '' : name).trim();
    return text.length > 0 && !PLACEHOLDER.test(text);
}

/**
 * The section name shown twice (owner 2026-10-11/16, DEFERRED 37).
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
 *
 * Whether the navigation really shows the name at this width is the layout's
 * business (finalLayoutRegistry layoutNamesPages) and the stylesheet's (the
 * side rail and wizard strip drop their labels on a phone).
 *
 * `page.sections` is the sections the AUTHOR built, not the ones a rule shows
 * right now: a second section that appears after an answer must not make the
 * first one's title pop in (and the page jump) when it does.
 */
export function repeatsPageName(page) {
    const sections = (page && page.sections) || [];
    if (sections.length !== 1 || !isRealPageName(page.name)) {
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
