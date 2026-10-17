# Build plan: the section name shown twice (DEFERRED 37) and the Scroll headings (DEFERRED 38)

Status: PR 1 (the repeated name) is built, deployed, and measured on the Studio, Lightning and the public site (2026-10-16). PR 2 (the Scroll heading look) follows as its own PR, so it can be merged or held on its own. Both wait for the owner's test, because they change how existing published forms look.

Owner, 2026-10-11: "Why the hell are we displaying this section name 'Details' again when the tab or accordion or Stepper info show the section name? ... the same thing is happening for every layout except for one at a time." And, 2026-10-16, with a screenshot of the Side Nav form: "section name is still an issue for some layouts". Source note: `qa/OWNER_ISSUES_2026-10-11.md` items 37 and 38.

## 1. In plain words

Side rail, Tabbed pages, Wizard steps and Accordion put each page's name in the navigation ("1 Details", a tab, a step, a panel title). The one section card under it then showed a heading again: "Details", or "Contact details". Two headings for one thing.

## 2. Why an exact-match rule is not enough (measured)

My first proposal was to hide the section heading only when it is the same words as the page name. Across the 60 form versions in the dev org there are 65 pages with exactly one titled section: the title equals the page name in **1** of them and is another phrase in **64**. The creation flow itself starts every form with page "Details" and section "<Object> details", so an exact match would have fixed almost nothing.

## 3. The rule (PR 1)

In a layout that already names each page, a page with **one** section does not show that section's title as a second heading. The page name in the navigation is the heading.

Which layouts name their pages (one flag per layout in `finalLayoutRegistry`, `layoutNamesPages`):

| Layout | Names its pages | So the lone section title is |
|---|---|---|
| Side rail, Tabbed pages, Wizard steps, Accordion panels | always (nav item, tab, step, panel title) | hidden |
| Continuous scroll | only with the page-dividers option on and more than one page | hidden then, shown otherwise |
| One at a time, Split hero | never | shown, as before |

The title is **hidden visually, not removed**: the heading stays in the page for screen readers (a clipped 1px element, not `display: none`).

It is **not** hidden when that would lose something:

- the page has no real name (empty, or the "Page 2" the Studio gives a new page): the title is then the only name;
- the page has several sections: their titles tell them apart;
- the header carries a description or an icon, or the section folds, or it is a repeating section;
- the author switched the section's header ON by hand (the property panel writes an explicit `showHeader: true`);
- one question per screen (virtual pages): their section title is the context line.

How: the viewer decides, in the render model it hands to the layout (it already stamps lookup context on elements the same way), and marks the section `titleRepeatsPage`; the section renderer adds a class. Pure rule: `finalFormViewer/sectionTitleRepeat.js`. No change to a saved form, to the spec, or to Apex: the creation flow keeps its names, because the rule does not depend on them.

## 4. Tests

`finalLayoutRegistry/__tests__/pageNames.test.js` (which layouts name their pages), `finalFormViewer/__tests__/sectionTitleRepeat.test.js` (the rule, then the viewer marking the sections it hands to each layout, one-per-screen untouched), `finalSectionRenderer/__tests__/titleRepeat.test.js` (heading kept in the page, the stylesheet hides it without `display: none`).

## 5. PR 2: the Scroll heading look (DEFERRED 38)

Scroll shows each page's name as a divider and each section's title under it. Today the page name is grey with a fading line and the section title under it is black at the same size, so the hierarchy reads backwards and there are two kinds of line. Proposal (Option 1 in the chat picture): the page name is the heading (the text colour, 1.2x the section size, bold, one flat thin line); a section title under a divider is a subheading (0.8x). Only when dividers are shown; a single-page Scroll form keeps its section titles at full size, because they are then the top-level headings. Option 2 (only fix the ink and the line, both levels the same size) is the fallback if Option 1 is not liked.

## 6. Verified (PR 1; revclouddev, deployed and the site published)

One in-memory form on each host: page "Details" with the section "Contact details", page "Preferences" with two sections ("Mail", "Phone"), and "Page 3" with the section "Anything else".

| Layout | Page "Details" | Page "Preferences" | Page "Page 3" |
|---|---|---|---|
| Side rail, Tabbed pages, Wizard steps (Studio) | no repeated heading | "Mail" and "Phone" shown | "Anything else" shown (the page has no real name) |
| Side rail (Lightning, public site) | no repeated heading | "Mail" and "Phone" shown | "Anything else" shown |
| Accordion (Studio) | open panel shows only the fields | not opened in this run | not opened in this run |
| Continuous scroll with dividers (Studio, Lightning, public site) | divider "Details", no repeated heading | dividers "Preferences", "Mail" and "Phone" shown | divider "Page 3", "Anything else" shown |
| One at a time (Studio) | unchanged: "Contact details" still shown | | |

In every case the hidden heading is still in the page (a clipped 1px element, not `display: none`). 291 jest tests across the section renderer, viewer, layout registry, navigation and zone suites pass.
