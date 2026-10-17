# Build plan: the section name shown twice (DEFERRED 37) and the Scroll headings (DEFERRED 38)

Status: PR 1 (the repeated name) is built, reviewed by the UX reviewer (2026-10-16, findings 1, 3, 4 and 6 fixed, see section 7), deployed, and measured on the Studio, Lightning and the public site. PR 2 (the Scroll heading look) is its own PR so it can be merged or held on its own; its review fixes (findings 2, 5, 7) are in section 5. Both wait for the owner's test, because they change how existing published forms look.

Owner, 2026-10-11: "Why the hell are we displaying this section name 'Details' again when the tab or accordion or Stepper info show the section name? ... the same thing is happening for every layout except for one at a time." And, 2026-10-16, with a screenshot of the Side Nav form: "section name is still an issue for some layouts". Source note: `qa/OWNER_ISSUES_2026-10-11.md` items 37 and 38.

## 1. In plain words

Side rail, Tabbed pages, Wizard steps and Accordion put each page's name in the navigation ("1 Details", a tab, a step, a panel title). The one section card under it then showed a heading again: "Details", or "Contact details". Two headings for one thing.

## 2. Why an exact-match rule is not enough (measured)

My first proposal was to hide the section heading only when it is the same words as the page name. Across the 60 form versions in the dev org there are 65 pages with exactly one titled section: the title equals the page name in **1** of them and is another phrase in **64**. The creation flow itself starts every form with page "Details" and section "<Object> details", so an exact match would have fixed almost nothing.

## 3. The rule (PR 1)

In a layout that already names each page, a page with **one** section does not show that section's title as a second heading, **while the page name is really on screen**. The page name in the navigation is the heading.

"Really on screen" is the part the first version got wrong: on a phone the Side rail shows only numbered chips and Wizard steps shows only dots, so the page has no name at all and the section title is the only one left. One answer per layout and setting, `layoutNamesPages(type, options, pageCount)` in `finalLayoutRegistry`:

| Layout | Page name on screen | So the lone section title is |
|---|---|---|
| Tabbed pages, Accordion panels | always, at every width | hidden at every width |
| Side rail, set to "Collapse into a menu" | always (the Pages button names the page) | hidden at every width |
| Side rail (labels), Wizard steps (numbered) | only while the navigation has room: a form wider than 540px, and for the strip also while its steps fit (see section 7); a narrow form shows chips or dots | hidden while wide, **shown on a phone** (and when the strip has collapsed) |
| Wizard steps set to Dots or Progress bar | never | shown, as before |
| Continuous scroll | only with the page-dividers option on and more than one page | hidden then, shown otherwise |
| One at a time, Split hero | never | shown, as before |

The title is **hidden visually, not removed**: the heading stays in the page for screen readers (a clipped 1px element, not `display: none`). The "while wide" cases switch on a CSS container query, so the title comes back the moment the navigation drops its labels, with no script: the Side rail and the Wizard strip both name their container `pagenav` next to their own name and drop their labels at the same 540px that the section stylesheet listens for.

It is **not** hidden when that would lose something:

- the page has no real name (empty, or a placeholder such as "Page 2", "Step 3", "Part 1", "Section 1", or a bare "2": the title is then the only name);
- the page has several sections: their titles tell them apart;
- the header carries a description or an icon, or the section folds, or it is a repeating section;
- the author switched the section's header ON by hand (the property panel writes an explicit `showHeader: true`);
- one question per screen (virtual pages): their section title is the context line.

How: the viewer decides, in the render model it hands to the layout (it already stamps lookup context on elements the same way), and marks the section `titleRepeatsPage: 'always' | 'wide'`; the section renderer adds a class. It decides from the sections the **author built**, not the ones a visibility rule shows right now: a second section that appears after an answer must not make the first one's title pop in and push the question down. The rule and the placeholder test live in a small shared bundle, `c/finalPageName` (`isRealPageName`, `repeatsPageName`), because three places read them: the viewer, the Studio and the Scroll layout. No change to a saved form, to the spec, or to Apex.

### 3.1 The Studio says what is happening

Without this, a section whose heading the layout tucks away still read "Header shown", and typing a new Title changed nothing in the preview. Now the property panel, for exactly the sections the viewer tucks away, shows the Header button as off ("Header hidden") and a line under it, for example: *The side rail already names this page "Details", so this heading would say it twice. Screen readers still read it. On a narrow screen, where those labels shrink to numbers or dots, it comes back. Switch the header on to show it anyway.* The first click writes an explicit `showHeader: true`, which is the author's "show it anyway" and which the rule respects. The Studio asks the viewer's own three questions of the authored spec (`isOnePerScreen`, `layoutNamesPages`, `repeatsPageName`), so the two cannot disagree. What to call the thing that shows the name (side rail, step bar, tab, panel title, page divider) is one field per layout row, `pageNameBy`.

Ruling: the reviewer suggested a three-way Header control (Automatic / Show / Hide). I kept the existing on/off button and made it tell the truth, because the rest of the section inspector is that button style and a third state is a bigger change to a panel the owner did not complain about. The cost: once an author has switched the header on they cannot return to "automatic" (only Show or Hide). On a desktop form Automatic and Hide look the same, so that is a small loss.

## 4. Tests

`finalPageName/__tests__` (the placeholder test and the rule, one page at a time), `finalLayoutRegistry/__tests__/pageNames.test.js` (which layouts name their pages and when, what to call each, `isOnePerScreen`, and that Scroll really draws a divider exactly when the registry says so), `finalFormViewer/__tests__/sectionTitleRepeat.test.js` (what the viewer hands to each layout, one-per-screen untouched, a rule-hidden second section keeps the first title steady), `finalSectionRenderer/__tests__/titleRepeat.test.js` (heading kept in the page, hidden without `display: none`, "wide" only inside the `pagenav` container while it is wider than 540px, the rail and the wizard strip declare the container), `finalFormStudio/__tests__` (the panel is told the page name, what shows it and whether it is there at every width) and `finalPropertyPanel/__tests__` (the Header button and the line under it).

## 5. PR 2: the Scroll heading look (DEFERRED 38)

Scroll shows each page's name as a divider and each section's title under it. Today the page name is grey with a fading line and the section title under it is black at the same size, so the hierarchy reads backwards and there are two kinds of line. Proposal (Option 1 in the chat picture): the page name is the heading (the text colour, bold, one flat thin line); a section title under a divider is a subheading. Only when dividers are shown; a single-page Scroll form keeps its section titles at full size, because they are then the top-level headings. Option 2 (only fix the ink and the line, both levels the same size) is the fallback if Option 1 is not liked.

UX review fixes (2026-10-16):

- **Finding 2, the subheading must not look like a question.** First version: 0.8x, which is 16px semibold on desktop (the same as a question label, which is why "Mail" read like a question that lost its input box) and 14.4px on a phone (smaller than the questions under it). Now 0.9x on desktop and 1x on a narrow form (container 540px or narrower), so a section title is never below 18px.
- **Finding 5, the page heading must not outgrow the form title.** First version: 1.2x the section size, which on a phone (21.6px) is bigger than the form title (20px). Now `min(1.2 x section, the title size)`: desktop 28 / 24 / 18 / 16 and phone 20 / 20 / 18 / 16 (title / page / section / question).
- **Finding 7, a placeholder name must not become the loudest heading.** A page still called "Page 3" showed a big bold "Page 3" over a shrunken real title. Now a divider with a placeholder name draws the rule line without the words, and the section titles under it keep their full size (uses `isRealPageName`).

## 6. Verified (revclouddev, deployed and the site published)

See the verification notes added to the PR descriptions (pictures at desktop and phone widths on the Studio, Lightning and the public site).

## 7. UX review of PR 1 and PR 2 (2026-10-16, uiux-flow-reviewer)

| # | Finding | Result |
|---|---|---|
| 1 | Phones lose the page name (rail chips, wizard dots, wizard set to dots/bar) | **Fixed** (section 3, `'always' / 'wide' / false`, the `pagenav` container) |
| 2 | Scroll subheading is the size of a question | **Fixed** in PR 2 (section 5) |
| 3 | Studio does not say what is happening | **Fixed** (section 3.1); three-way control not built, ruling there |
| 4 | Page jumps as people answer (conditional second section) | **Fixed** (decided from the authored sections) |
| 5 | Page heading bigger than the form title | **Fixed** in PR 2 (section 5) |
| 6 | Placeholder check too narrow ("Step 2", "Part 3", "2") | **Fixed** (`isRealPageName`) |
| 7 | Placeholder-named divider becomes the loudest heading | **Fixed** in PR 2 (section 5) |
| 8 | Accessibility, already there before: the Tabbed pages content panel is not linked to its tab; in Accordion the hidden section heading is at the same level as the panel heading | **Not done here**, parked as DEFERRED 39 (it is a pre-existing gap, and touching the tab and accordion markup is a separate change) |

Found while fixing finding 1, and fixed with it: the wizard strip can also drop its labels at a **wide** width. Its measured fit ladder (`computeFitTier`) shows every label when `steps x 120px` fits, numbers plus the active label when `steps x 44px + 140px` fits (the name is still on screen), and otherwise collapses to dots at any width: ten steps need 580px, so a 560px form of ten steps showed dots and no name, with the title hidden by the rule above. The strip now hands the current page's sections back without the "tucked away" mark when its tier is `collapse` (`finalNavStepper`, `__tests__/titleRepeat.test.js`); the 540px query covers the narrow case and this covers the wide one. Accepted: for a moment on first load of such a form (before the strip has measured itself) the title is hidden, then it appears.
