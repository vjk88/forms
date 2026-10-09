# Published-form text sizes: recommendations

**Status:** APPROVED by the owner on 2026-10-03 ("lets update the code using this one"). Built on branch `feat/respondent-type-scale` (PR 370, not merged yet), deployed to the dev org (`revclouddev`), and the guest site was published on 2026-10-03 (the owner said site publishes no longer need asking). The public site was then checked as a signed-out visitor. File-by-file trace: `docs/FinalDesign/IMPL_PLAN_RESPONDENT_TYPE_SCALE.md`. No form data, spec or Apex changed.

**Scope:** the text a respondent sees on a published form (header, questions, answers, help text, buttons, navigation, thank-you screen) and the Studio preview of it. Studio's own screens are out of scope; they stay in the separate app-wide typography pass (`PENDING_WORK.md` section 4.0).

**Where the facts come from:** real forms measured in the dev org on 2026-09-29 and 2026-10-02 (public site, the Salesforce viewer tab, and the Studio preview). Sources are in section 13.

---

## 1. Summary

- **Question text is the smallest main text on a form today (13px).** It becomes 16px (18px in One at a time).
- **A reading floor:** nothing a respondent has to read is under 14px, and text they type or choose is at least 16px (below 16px an iPhone zooms into the box).
- **One shared list of sizes** replaces 30 different sizes scattered through the stylesheets.
- **The form looks the same wherever it is hosted.** Today typed answers are 16px on the public site but 13px inside Salesforce, so the Studio preview does not match what respondents get.
- **Layouts that show less at a time get bigger text.** One at a time gets +2px on desktop and tablet. Surveys set to "One question per page" get large question text (32px on desktop, 24px on phones) in fixed sizes that no longer scale smoothly with the card (your tuning, 2026-10-03).
- **Authors get no size controls.** Themes keep their personality (typeface, case, weight, colour) but not their own pixel sizes.

### Changes at a glance (desktop)

| Text | Today | Standard layouts | One at a time |
|---|---|---|---|
| Question text | 13 | 16 (+23%) | 18 (+38%) |
| Typed answers and choices | 16 public site / 13 inside Salesforce | 16 | 18 |
| Section title | 16.8 | 20 (+19%) | 26 (+55%) |
| Form title | 25.6 | 28 (+9%) | 28 (+9%) |
| Help text under a question | 13.1 | 14 | 14 |
| Error messages | about 12.8 public / about 10.4 Salesforce | 16 | 16 |
| Small print (progress, scale ends, matrix headings) | 11.5 to 13 | 14 | 14 |
| Buttons | 15 | 16 | 16 |

---

## 2. Decisions needed from you

| # | Decision | My recommendation |
|---|---|---|
| 1 | "One question per page" surveys use fixed sizes instead of today's smooth scaling. Phone values are yours from the mock-up (question 24, help 14, typed text 16, card padding 26). Desktop and tablet use the numbers from your earlier table: question 32, answers and typed text 18, help 14. Today these are 32.55, 21 and 17.85. | **Yes.** It matches your phone choices and makes every size set work the same way. The desktop numbers have not been tried yet (the mock-up only shows phone widths). |
| 2 | Tablets use the same sizes as desktop. The only step is at 540px wide. | **Yes.** There is no evidence for a tablet-specific step. |
| 3 | The device class (mobile, tablet, desktop) is judged by the width of the whole form, not the card. | **Yes.** One at a time's card is locked at 540px, so a card test would call every desktop "mobile". |
| 4 | In One at a time the form title stays 28px, the same as other layouts (not smaller). | **Yes.** A smaller title would be outranked by the 26px section heading under it. |
| 5 | Label looks become style only (the size follows the layout). The two uppercase looks become 0.875 times the question-text size. | **Yes.** See section 10. |
| 6 | Page-name headings (the dividers in Continuous scroll) match section titles (20px). | **Yes.** |

---

## 3. How to read this document

- **Pixels (px).** All sizes are shown in px, assuming the browser's normal 16px base. In the code they are written in `rem` (a unit meaning "relative to the browser's base size", so 1rem = 16px). That makes text follow the visitor's own text-size setting and zoom.
- **Today** means what a respondent sees now on the **public site**. Where **inside Salesforce** (the Studio preview, record pages) differs, both numbers are shown.
- **Device class** is decided by the width of the whole form (section 5): Mobile, Tablet, Desktop.
- **Size set** is one of three presets chosen automatically by layout (section 6): **Standard**, **Section at a time**, **Single question**. Authors do not choose.
- **Weights and typefaces** (bold question text, serif titles and so on) are unchanged by this proposal. Only sizes change.

---

## 4. What is wrong today (measured)

| Text | Public site | Inside Salesforce | Problem |
|---|---|---|---|
| Question text | 13 bold | 13 bold | Small for something that is often a full sentence |
| Typed answers, scale buttons, ranking rows | 16 | 13 | The same form differs by host. The Studio preview shows answers 3px smaller than respondents get. |
| Section title | 16.8 | 16.8 | Almost the same size as the answers, so there is little hierarchy |
| Form title | 25.6 (20 on forms 540px or narrower) | same | Fine, but small beside the other changes |
| Help text under a question | 13.1 | 13.1 | Under the reading floor |
| Error messages | about 12.8 | about 10.4 | Size is "0.8 of whatever is around it", so it changes with the host. In one-question surveys the text around it is bigger, so it is about 15 to 17. This is arithmetic from the code; an error screen was not rendered (the mock-up in section 14 draws the 0.8 rule). |
| Scale end labels | 12 | 12 | Under the floor |
| Matrix column headings, ranking numbers | 11.5 | 11.5 | Under the floor |
| Buttons | 15 | 15 | |
| Page and panel names | 17.6 (Scroll), 16 (Accordion), 15 (Tabs), 14 (Stepper, Side rail) | same | The same job styled five different ways |
| Search-as-you-type fields | 11 to 13 | 11 to 13 | Under the floor |

The stylesheets contain 30 distinct size rules (values or formulas). Only the "One question per page" survey look has a real scale of its own.

---

## 5. Device classes

The class is decided by the **width of the whole form** (the area the form fills), measured on the form itself. A form placed in a narrow Salesforce column therefore counts as Mobile even on a big monitor.

| Device class | Form width | Studio preview frame | Notes |
|---|---|---|---|
| Mobile | 540px or less | 390px | Compact margins and header already ship at this width |
| Tablet | 541 to 959px | 768px | Uses the Desktop sizes (decision 2) |
| Desktop | 960px or more | 1280px | |

Why the whole form and not the card: One at a time's floating card is locked at 540px by default (the author can set 480 to 680px). A card-width test would treat it as "mobile" on every desktop.

### Typical form content width, from the layout rules (approximate, not measured on every layout)

| Layout | Mobile (390) | Tablet (768) | Desktop (1280) |
|---|---|---|---|
| Standard layouts, default "medium" width (760px panel) | about 334 | about 672 | about 696 |
| Standard layouts, "narrow" width (560px panel) | about 334 | about 496 | about 496 |
| One at a time (card, default 540px) | page width minus margins | 540 | 540 |
| Split hero | stacked, full width | form side is about half the page (about 384) | form side is about half the page (about 640) |

---

## 6. Which size set each layout uses

| Layout | Normal forms and surveys | Survey set to "One question per page" |
|---|---|---|
| Continuous scroll | Standard | not available (this layout does not page) |
| Wizard steps | Standard | Single question |
| Tabbed pages | Standard | Single question |
| Accordion panels | Standard | not available (this layout does not page) |
| Side rail | Standard | Single question |
| One at a time | Section at a time | Single question |
| Split hero | Standard when its Flow is "All fields together"; Section at a time when its Flow is "One section at a time" | Single question |

---

## 7. The three size sets

Roles are in plain words; the code names are in Appendix A.

### 7.1 Standard

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Form title (stacked, logo beside, centred, text-only headers) | 25.6 (20 on mobile) | 28 | 28 | 20 |
| Form title (inline one-row header) | 20.8 | 20 | 20 | 20 |
| Brand name | 18 | 18 | 18 | 18 |
| Page and section titles | 17.6 / 16.8 | 20 | 20 | 18 |
| Descriptions, instructions, rich text, notices | 14 to 15 | 16 | 16 | 16 |
| Question text (bold) | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 in Salesforce | 16 | 16 | 16 |
| Help text under a question | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary: progress, counters, scale ends, matrix headings, ranking numbers, file sizes, keyboard hints | 11.5 to 13 | 14 | 14 | 14 |
| Buttons | 15 | 16 | 16 | 16 |
| Tab and accordion headers | 15 / 16 | 16 | 16 | 16 |
| Step names and side-rail links | 14 | 14 | 14 | 14 |

### 7.2 Section at a time

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Form title | 25.6 (20 on mobile) | 28 | 28 | 20 |
| Section title (the screen's headline) | 16.8 | 26 | 26 | 20 |
| Descriptions, instructions, rich text | 14 to 15 | 16 | 16 | 16 |
| Question text (bold) | 13 | 18 | 18 | 16 |
| Typed answers and choices | 16 / 13 in Salesforce | 18 | 18 | 16 |
| Help text under a question | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 13 | 14 | 14 | 14 |
| Buttons | 15 | 16 | 16 | 16 |

### 7.3 Single question (surveys set to "One question per page")

Fixed sizes, like the other sets (decision 1). Phone values are the ones you chose in the mock-up (question 24, help 14, typed text 16, plus spacing in 7.4). Desktop and tablet use the numbers from your earlier table. Today's smooth scaling is retired for this look; it stays described in section 13 and Appendix A as the record of today's behaviour.

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Form title | 25.6 (20 on mobile) | 24 | 24 | 20 |
| Section title (shrinks to a small context line above the question) | 16.8 | 14 | 14 | 14 |
| Question text | 24.8 to 32.55, scales with the card | 32 | 32 | **24** (your tuning) |
| Answers, scale buttons, stars, emoji | 16 to 21, scales with the card | 18 | 18 | 16 |
| Typed text | 16 public / 21 Salesforce | 18 | 18 | **16** (your tuning) |
| Help text under the question | 13.6 to 17.85, scales with the card | 14 | 14 | **14** (your tuning) |
| Descriptions | 14 to 15 | 16 | 16 | 16 |
| Error messages | about 15 to 17 (0.8 of the section's text) | 16 | 16 | 16 |
| Secondary | 11.5 to 13 | 14 | 14 | 14 |
| Buttons | 15 | 16 | 16 | 16 |

Stars are 1.7 times the answer size and emoji buttons 2 times (about 30.6px and 36px on desktop and tablet, 27.2px and 32px on phones).

The answer size for choices and rating digits (18 desktop, 16 phone) was not tried in the mock-up; it follows your typed-text choice and your earlier table.

### 7.4 Spacing (from your tuning)

Chosen in the mock-up in the One question per page look at a 360px phone. Only the card padding changed.

| Spacing | Today | Recommended (One question per page, phone) |
|---|---|---|
| Card padding | 32 | **26** |
| Page margin | 15 | 15 |
| Section padding | 20 | 20 |
| Question to help text | 4 | 4 |
| Help text to answers | 12 | 12 |
| Gap between choices | 8 | 8 |
| Answer box height | 50 | 50 |
| Space above the error | 8 | 8 |
| Button height | 44 | 44 |
| Button side padding | 22 | 22 |

Not tried: the other looks and layouts, tablet and desktop. Whether the 26px card padding should also apply to One at a time on phones is open.

**Update 2026-10-03:** One at a time no longer has a card (it is an open page now, like design-explorations/01), so the 26px card padding no longer exists there. The text column is the form's width minus a 20 to 35px side margin on each side (294px in a 334px-wide form, 350px on a full 390px phone). The other layouts' Single question screens are unchanged. See `docs/FinalDesign/IMPL_PLAN_OAAT_OPEN_PAGE.md`.

---

## 8. Layout by layout

Each table shows what is on screen in that layout, today versus recommended, per device. Rows that repeat across layouts are repeated on purpose so each table stands alone.

### 8.0 Header (every layout except Split hero)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Title (stacked, logo beside text, centred, text only) | 25.6 (20 on mobile) | 28 | 28 | 20 |
| Title (inline one-row arrangement) | 20.8 | 20 | 20 | 20 |
| Brand name | 18 | 18 | 18 | 18 |
| Description | 15 | 16 | 16 | 16 |
| Highlight badge or banner (for example "Closes Friday!") | 13 to 14 | 14 | 14 | 14 |

### 8.1 Continuous scroll (Standard)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header | see 8.0 | | | |
| Page-name divider heading | 17.6 | 20 | 20 | 18 |
| Section title | 16.8 | 20 | 20 | 18 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 | 16 | 16 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary (scale ends, matrix headings, ranking numbers, file sizes) | 11.5 to 12.8 | 14 | 14 | 14 |
| Submit button | 15 | 16 | 16 | 16 |

### 8.2 Wizard steps (Standard)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header | see 8.0 | | | |
| Step names under the step bar | 14 | 14 | 14 | 14 |
| Step numbers and "Step 2 of 5" | 13 | 14 | 14 | 14 |
| Section title | 16.8 | 20 | 20 | 18 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 | 16 | 16 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 12.8 | 14 | 14 | 14 |
| Next, Back and Submit buttons | 15 / 14 | 16 | 16 | 16 |

### 8.3 Tabbed pages (Standard)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header | see 8.0 | | | |
| Tab names | 15 | 16 | 16 | 16 |
| Section title | 16.8 | 20 | 20 | 18 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 | 16 | 16 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 12.8 | 14 | 14 | 14 |
| Next, Back and Submit buttons | 15 / 14 | 16 | 16 | 16 |

### 8.4 Accordion panels (Standard)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header | see 8.0 | | | |
| Panel headers | 16 | 16 | 16 | 16 |
| Section title | 16.8 | 20 | 20 | 18 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 | 16 | 16 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 12.8 | 14 | 14 | 14 |
| Submit button | 15 | 16 | 16 | 16 |

### 8.5 Side rail (Standard)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header | see 8.0 | | | |
| Rail link names | 14 | 14 | 14 | 14 |
| Rail numbers | 12 | 14 | 14 | 14 |
| Progress text | 13 | 14 | 14 | 14 |
| Menu button (narrow screens) | 14 | 14 | 14 | 14 |
| Section title | 16.8 | 20 | 20 | 18 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 16 | 16 | 16 |
| Typed answers and choices | 16 / 13 | 16 | 16 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 12.8 | 14 | 14 | 14 |
| Next, Back and Submit buttons | 15 / 14 | 16 | 16 | 16 |

### 8.6 One at a time (Section at a time)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Header, when shown (title) | 25.6 (20 on mobile) | 28 | 28 | 20 |
| Section title (the screen's headline) | 16.8 | 26 | 26 | 20 |
| Section description | 14 | 16 | 16 | 16 |
| Question text | 13 | 18 | 18 | 16 |
| Typed answers and choices | 16 / 13 | 18 | 18 | 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary (scale ends, matrix headings, ranking numbers) | 11.5 to 12.8 | 14 | 14 | 14 |
| Progress counter ("1 / 4") and progress text | 13 | 14 | 14 | 14 |
| Keyboard hint ("Press Enter") | 13 | 14 | 14 | 14 |
| Back link | 14 | 16 | 16 | 16 |
| Continue and Submit buttons | 15 | 16 | 16 | 16 |

### 8.7 Split hero

The brand side and the form side are sized separately. In the form-side rows, a cell like "16 / 18" means **All fields together / One section at a time** (the layout's Flow setting).

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Hero title (brand side) | 25.6 to 38.4, scales with the page width; 18.4 when stacked | 38.4 | about 30.7 (4% of the page width at 768) | 18.4 (stacked) |
| Brand name | 18 | 18 | 18 | 18 |
| Hero subtitle | 16 | 16 | 16 | 16 |
| Progress text ("Step 1 of 2") | 13 | 14 | 14 | 14 |
| Title in the form-side header (when set) | 24 | 28 | 28 | 20 |
| Description in the form-side header | 15 | 16 | 16 | 16 |
| Section title | 16.8 | 20 / 26 | 20 / 26 | 18 / 20 |
| Question text | 13 | 16 / 18 | 16 / 18 | 16 / 16 |
| Typed answers and choices | 16 / 13 | 16 / 18 | 16 / 18 | 16 / 16 |
| Help text | 13.1 | 14 | 14 | 14 |
| Error messages | about 12.8 / 10.4 | 16 | 16 | 16 |
| Secondary | 11.5 to 13 | 14 | 14 | 14 |
| Keyboard hint | 13 | 14 | 14 | 14 |
| Back link | 14 | 16 | 16 | 16 |
| Next and Submit buttons | 15 | 16 | 16 | 16 |

Open check: at tablet width the form side is about half the page, so lines wrap sooner. Verify in the browser (section 11).

### 8.8 Surveys set to "One question per page" (any paging layout)

See tables 7.3 (text sizes) and 7.4 (spacing). The progress counter, Continue button and Back link follow the layout's own table (8.2, 8.3, 8.5, 8.6 or 8.7).

### 8.9 After submit (thank-you screen, all layouts)

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Thank-you title | 22 | 28 | 28 | 20 |
| Thank-you message | 17 | 16 | 16 | 16 |
| Action button | 15 | 16 | 16 | 16 |
| "Redirecting..." line | 14 | 14 | 14 | 14 |
| Countdown pill | 13 | 14 | 14 | 14 |

### 8.10 Search-as-you-type fields (lookups), every layout

Corrected during the build. The first version of this table was measured on the Studio's own field picker, not on the lookup a respondent sees. These rows are the respondent lookup.

| Text | Today | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Field name (the question text above the box) | 13 | 16 | 16 | 16 |
| Typed text | follows the surrounding size: 13 inside Salesforce, 16 on the public site | 16 | 16 | 16 |
| Result name | same as typed text | 16 | 16 | 16 |
| Result detail line (the grey second line) | 12 | 14 | 14 | 14 |
| Error | 12 | 16 | 16 | 16 |

(In One at a time, typed text and result names follow the larger answer size: 18 on desktop and tablet. In "One question per page" they follow that look's answer size: 18 on desktop and tablet, 16 on phones.)

---

## 9. Sizes that scale smoothly

Two sizes stay smooth rather than fixed. They grow with the width of a box, behave exactly as they do today, and are only being moved into the shared set of sizes.

| Size | The rule in plain words | The box it follows | Smallest to biggest | Desktop / Tablet / Mobile |
|---|---|---|---|---|
| Hero title (Split hero) | 4% of the whole Split hero page width, never below 25.6px and never above 38.4px; fixed at 18.4px when the page is 540px or narrower | The whole Split hero page | 25.6 to 38.4 | 38.4 / about 30.7 / 18.4 |
| Slider value readout | 7% of the card's inside width, never below 20px and never above 2.2 times the answer size (35.2px in the Standard set) | The card holding the slider | 20 to 35.2 | 35.2 / 35.2 / about 20 |

**Retired by decision 1:** today's smooth scaling of question text, answers and help text in "One question per page" surveys (a master size of 13.8px plus 1.9% of the card's inside width, kept between 16 and 21px). Those sizes are now fixed numbers (table 7.3). Today's formula, and the measured proof that it matches today's screens, stay in section 13 and Appendix A as the record of today's behaviour.

---

## 10. Rules

1. **Units.** Sizes are written in `rem` only. A second unit, `em` (relative to the text's own size), is used only for things that should grow with their own text: button padding about 0.75em top and bottom and 1.25em left and right, inline icons 1em, icon-to-text gaps about 0.5em. Buttons keep a minimum height of 44px.
2. **Line heights** have no unit: 1.3 for titles and question text, 1.5 for descriptions, answers and supporting text.
3. **Reading floor.** At least 14px for anything a respondent must read; at least 16px for typed or chosen text.
4. **The form declares its own base size.** Text with no size of its own stops borrowing the host page's size. This is what fixes "13px inside Salesforce, 16px on the public site".
5. **Typed text has two mechanisms.** Inside Salesforce it follows the surrounding size automatically. On the public site it is set by a platform setting, which the form will also set.
6. **Label looks** become style only. The size comes from the layout.

   | Look | Today | Recommended |
   |---|---|---|
   | Default | 13, bold | the layout's question-text size, bold |
   | Muted small | 12, medium weight, grey | the layout's question-text size, medium weight, grey |
   | Uppercase small (Neon Nights) | 11.84, uppercase, wide spacing | 0.875 times the question-text size (14px in Standard), uppercase, wide spacing |
   | Uppercase mono | 11, uppercase, mono face | 0.875 times the question-text size, uppercase, mono face |
   | Per-field "uppercase" | 11 | 0.875 times the question-text size |

   In "One question per page" surveys the headline look (bold, no uppercase, slightly tight spacing) still replaces any theme look, as today.
7. **Themes** carry no pixel sizes. They keep typeface, weight, case, spacing and colour.
8. **No author controls.** If a real need appears later (for example a large-print request), the right shape is one form-wide "Text size: Standard / Large" step that moves every size together. It is not part of this work.
9. **A test fails** if a respondent stylesheet hard-codes a font size instead of using a named role.

---

## 11. Not verified, and risks

**Checked after the build (Salesforce viewer tab, Studio preview and, after the publish, the public site as a signed-out visitor; Chromium):** every role in tables 7.1 to 7.3 at 334px, 736px and 1248px forms, the Split hero title (38.4 / 29.4 on a 736px form), stars and emoji (30.6 and 36 on desktop, 27.2 and 32 on phones), and the 26px / 32px card padding. The Studio preview now agrees with the viewer tab (typed text is the same size as the question text in One at a time, where it used to be 3px smaller).

- **Radio buttons, checkboxes, dropdowns, date pickers and record pickers on the public site.** None of the six forms visible to signed-out visitors contain them. Checking needs a disposable public clone (creating one needs your OK first). Typed text in plain text boxes is verified on the public site (16, 18).
- **Firefox, Safari and a real iPhone.** Only Chromium was tested. Check the iPhone zoom behaviour and 200% browser zoom.
- **Customer sites that change the page's base text size** (some shrink it to 10px). Every `rem` size would scale with it. All three hosts measured here use 16px.
- **Split hero at tablet width** (form side about half the page).
- **Two-column sections and left-aligned labels.** Left labels sit in a fixed 160px column, so 16px bold labels wrap more.
- **Matrix headings at 14px on phones.**
- **Error text.** Still not rendered: the test forms have no validation rules, and a required field does not show our error line. The size (16) is read from the stylesheet, not measured.
- **The slider value readout.** No test form has a slider; its size comes from the code.
- **Desktop and tablet sizes for "One question per page"** (question 32, answers and typed text 18, help 14) come from your earlier table and have not been tried; the mock-up only shows phone widths. The phone answer size for choices and rating digits (16) was not tried either.
- **The 26px card padding** was tried only in One question per page at a 360px phone, with a text box answer.
- **The Studio's Mobile preview** is a 390px-wide form, not a real phone.

---

## 12. Rollout and checks

1. Add the shared sizes, the form's own base size and the guard test. No visible change except the base.
2. Move each component over to the shared sizes, in small separate changes, deploying each to the dev org.
3. Move the label looks to the ratio rules (section 10).
4. Browser check: 7 layouts by 3 devices, on the public site (disposable public clone) and inside Salesforce, plus 200% zoom.
5. Publishing the Experience site is needed for guests to see any change. Done on 2026-10-03; the owner has said site publishes no longer need asking.
6. Rollback is reverting the stylesheets. Nothing in form data, specs or Apex changes.

**Status, 2026-10-03.** Steps 1 to 3 are built and deployed to the dev org in one go (the guard test needs every stylesheet moved, so there was no useful halfway state). Step 4 is partly done: sizes were measured, read-only, inside the Salesforce viewer tab on 9 forms at 3 widths (6 of the 7 layouts: Continuous scroll, Wizard steps, Tabbed pages, One at a time, Split hero, plus One question per page on Wizard steps and on One at a time) and in the Studio preview. Every measured size matched the tables above. Side rail and Accordion panels have no test form in the dev org, so they are covered by the guard test only. After the site publish, the public site was measured the same way as a signed-out visitor on 4 public forms at 3 widths (Continuous scroll, One at a time, a survey with scale, rating, matrix, ranking and emoji questions, and a text form): the sizes are identical to the Salesforce numbers, and typed text in plain boxes follows the answer size on the public site too (16 in Standard, 18 in One at a time on desktop and tablet, 16 on phones). Before this change the public One at a time survey typed at the platform default of 16 on every device.

---

## 13. Evidence and references

### Measured today

| Text | Public site | Inside Salesforce |
|---|---|---|
| Page base size (root / body) | 16 / 16 | root 16; body 13 in the viewer tab, 16 in the Studio page (form text is still 13 there) |
| Question text | 13 bold | 13 bold |
| Typed text, scale buttons, ranking rows | 16 | 13 |
| Section title | 16.8 | 16.8 |
| Form title | 25.6 (20 at 390px) | 25.6 |
| Description | 15 | 15 |
| Scale end labels | 12 | 12 |
| Matrix headings, ranking numbers | 11.5 | 11.5 |
| Buttons | 15 | 15 |

Method: headless Chromium 149, signed-out public site, the Salesforce viewer tab and the Studio preview, on the dev org's test forms. Nothing was typed, saved or submitted.

### Today's smooth sizes: measured equals formula (One question per page, inside Salesforce)

Kept as the record of today's behaviour. Decision 1 retires this scaling for question text, answers and help text.

| Window | Card inside width | Area around the card | Question text measured | Formula (card) | Section's own text measured | Formula (area around card) |
|---|---|---|---|---|---|---|
| 320 | 156 | 198 | 25.92 | 25.92 | 17.522 | 17.522 |
| 390 | 226 | 268 | 27.98 | 27.98 | 18.852 | 18.852 |
| 540 | 376 | 418 | 32.40 | 32.40 | 21 | 21 |
| 1280 | 432 | 474 | 32.55 | 32.55 | 21 | 21 |

Stars matched 1.7 times the master size at all four widths. The Split hero title at page widths 484, 584, 736, 992 and 1248px measured 18.4, 25.6, 29.44, 38.4 and 38.4px, matching its formula.

### References (paraphrased; nothing copied)

- iOS Safari zooms into inputs at 15px or smaller and not at 16px or larger: [CSS-Tricks](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)
- WCAG 2.2 rule 1.4.4 (AA): text must be resizable to 200%; no minimum pixel size is set: [W3C](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- GOV.UK type scale: body 19px, small body 16px, headings 24 to 48px on desktop: [type scale](https://design-system.service.gov.uk/styles/type-scale)
- GOV.UK sets 16px as its minimum and cites feedback that 14px and below is bad for accessibility: [design notes](https://designnotes.blog.gov.uk/2022/12/12/making-the-gov-uk-frontend-typography-scale-more-accessible)
- Material 3 type scale (body 16/14/12, label 14/12/11, headline 24/28/32, title large 22): [Material components](https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md)
- Carbon text input (label 12, typed value 14, helper text 12): [Carbon v10](https://v10.carbondesignsystem.com/components/text-input/style/)
- Modular scales (choose the ratio and base on purpose): [A List Apart](https://alistapart.com/article/more-meaningful-typography/)

How the proposed numbers were chosen: they are judgement, anchored on two hard facts (the public site already types at 16px, and iOS zooms below 16px) and on the sizes the stylesheets already use most (13, 14, 15). They follow roughly a 1.2 to 1.4 step ladder, like the hand-tuned Material and GOV.UK scales; they are not a strict formula. The phone values for "One question per page" (question 24, help 14, typed text 16, card padding 26) were chosen by you in the mock-up on 2026-10-03.

---

## 14. Try it: mobile mock-up

A published, private mock-up draws one question at phone width twice, with today's sizes and the recommended Mobile sizes, for both looks (One at a time and One question per page): https://claude.ai/artifact/3MiiFLCfvZ9kuiun6hY7tt

It has a tuning panel: every text size and ten spacing values can be changed with − and + or typed, and "Copy my values" gives a text block to paste back. The Recommended phone shows the fixed one-question sizes chosen on 2026-10-03.

It is a test aid, not the product: the widgets are simplified and only the text sizes and spacing are meant to be exact. Today's one-question phone uses the real smooth-scaling formula, and today's error text is drawn as "0.8 of the text around it", which is how the code sizes it.

---

## Appendix A. Technical names and exact formulas (for the build)

Each name below is a **token**: a named setting that every part of the form reads, so no component picks its own number. Names are proposals.

| Plain role | Proposed token | Meaning |
|---|---|---|
| Form title | `--c-fs-title` | |
| Page and section titles | `--c-fs-section` | |
| Hero title (Split hero) | `--c-fs-hero`, `--c-fs-hero-compact` | compact = the stacked 18.4px |
| Question text | `--c-fs-label` | |
| Answers and choices | `--c-fs-answer` | |
| Descriptions, instructions | `--c-fs-desc` | |
| Help text under a question | `--c-fs-help` | |
| Error messages | `--c-fs-error` | |
| Secondary text | `--c-fs-secondary` | |
| Buttons | `--c-fs-button` | |
| Tab and accordion headers | `--c-fs-nav` | |
| Brand name | `--c-fs-brand` | |
| Compact title (one-row header, phone title) | `--c-fs-title-compact` | added in the build: 20 |
| Thank-you headline | `--c-fs-thanks` | added in the build: 28 / 20 in every layout, so it does not step down to 24 with the form title in One question per page |
| Slider readout floor | `--c-fs-readout-min` | added in the build: 20 |
| Label look ratio | `--c-label-scale` | added in the build: 1, or 0.875 for the two uppercase looks. Published forms from before get it from their label case when shown. The old `--c-label-size` is still written (contract v1) but nothing reads it |

### Smooth sizes: exact formulas

`cqi` and `cqw` are units meaning "1% of the inside width of the nearest measuring box" (a CSS "container"). The boxes are `section` (the card holding the question), `zones` (the area around it) and `split` (the whole Split hero page).

**Kept (hero title and slider readout):**

| Token | Exact formula | Box that measures | Replaces today's name |
|---|---|---|---|
| `--c-fs-hero` | `clamp(1.6rem, 4cqw, 2.4rem)` | `split` | `.pane-title` size |
| `--c-fs-hero-compact` | `1.15rem` when `split` is 540px or less | `split` | `.pane-title` stacked rule |
| Slider readout | `clamp(1.25rem, 7cqi, calc(var(--c-fs-answer) * 2.2))` | `section` | `.slider-val` size |

**Retired by decision 1 (today's One question per page scaling, kept for the record):**

| Today's name | Exact formula | Box that measured |
|---|---|---|
| `--convo-base` (a recipe, not a number) | `clamp(1rem, 0.86rem + 1.9cqi, 1.3125rem)` | `section` |
| `--c-q-title-size` | `calc(var(--convo-base) * 1.55)` | `section` |
| `--c-q-caption-size` | `calc(var(--convo-base) * 0.85)` | `section` |
| `--c-q-answer-size` and the section's own `font-size` | `var(--convo-base)` | `section` for buttons, stars and emoji; `zones` for the section's own text |

In the shared set, the One question per page values are plain stepped numbers (table 7.3), selected the same way as the other sets.

Rules for the build:

1. A token holding `cqi` or `cqw` is a **recipe**: it resolves where it is used, not where it is declared. Measured: today `--convo-base` is declared on the section, yet labels measure against the `section` box. For the kept sizes, moving the recipe to the shared stylesheet therefore changes no pixel, as long as the text using it stays inside the section (or inside `split` for the hero).
2. **Derive multiples where they are used**, never in the token layer (stars 1.7 times, emoji 2 times, slider cap 2.2 times). A custom property substitutes where it is declared, so a derived token would freeze its parent's value and ignore later overrides such as the 540px step.
3. The One question per page label look (bold 700, no uppercase, tracking -0.01em), the +6px answer-box height and the centred layout stay with the one-question look as today.
4. Device step: the Mobile values apply when the whole-form box (`final-form-viewport`) is 540px or less. That box cannot restyle itself, so the Mobile values are set on a descendant of it. Tablet has no step of its own. One question per page now uses this same step.
5. Typed text on the public site: set the platform setting `--dxp-s-form-element-text-font-size` to the answer size (the typed-text size of the current set). Inside Salesforce the base size is inherited. With fixed sizes, both hosts show the same number.

---

## Appendix B. Where today's sizes go

| Today's size | Used for | New role |
|---|---|---|
| 11 to 12px (0.6875 to 0.75rem) | Uppercase label looks, scale ends, ranking numbers, file sizes, lookup result details, lookup errors | Secondary (14), label looks (0.875 times question text), Errors (16) |
| 11.5px (0.72rem) | Matrix points, ranking numbers | Secondary (14) |
| 12.8px (0.8rem) | Choice descriptions | Help text (14) |
| 13px (0.8125rem), 18 uses | Question text, progress, counters, hints, lookup inputs | Question text (16), Secondary (14), Typed text (16) |
| 13.1px (0.82rem) | Help text | Help text (14) |
| 13.6px (0.85rem) | Image-choice captions | Answers and choices |
| 14px (0.875rem), 16 uses | Descriptions, back links, rail links, error lines | Descriptions (16), Back link (16), Step and rail names (14) |
| 14.4px (0.9rem) | Matrix statements | Answers and choices |
| 15px (0.9375rem), 10 uses | Buttons, header description, tabs, rich text | Buttons (16), Descriptions (16), Tab names (16) |
| 16px (1rem) | Accordion headers, hero subtitle | Unchanged |
| 16.8px (1.05rem) | Section title | Section title (20 / 26) |
| 17.6px (1.1rem) | Scroll page divider | Page and section titles (20) |
| 18px (1.125rem) | Brand name | Unchanged |
| 18.4px (1.15rem) | Stacked hero title | Unchanged |
| 20 to 20.8px (1.25 to 1.3rem) | Mobile and inline header titles, slider floor | Form title (inline header 20), slider floor stays 20 |
| 22px (1.375rem) | Thank-you title | Form title (28 / 20) |
| 24px (1.5rem) | Form-side header title in Split hero | Form title (28 / 20) |
| 25.6 to 38.4px | Form title (25.6), hero title | Form title (28), hero title unchanged |
| `0.8em` | Error text | Errors (16) |
| `1.6em` | Choice emoji badge | A multiple of the answer size, at the use site |
| `calc(answer * 1.7 / 2 / 2.2)` | Stars, emoji buttons, slider cap | Unchanged multiples of the answer size |
