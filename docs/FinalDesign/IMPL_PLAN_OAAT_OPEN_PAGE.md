# Build plan: One at a time open page

**Status:** BUILT, deployed to the dev org (`revclouddev`). Owner go: 2026-10-03 ("ok, do it"), after "My one at a time should be like this ... what you build is so shitty!! ... paddings and cleanliness". Delete or fold into the catalog after ship (owner's call).

**Target:** `design-explorations/01-conversational-survey.html` (an open page: a thin strip on top, one centered column, no card and no box around the question).

**Branch:** `feat/oaat-clean-layout`, stacked on `feat/respondent-type-scale` (PR 370) because it reads that PR's `--c-fs-*` sizes.

## What was wrong (measured against the mock)

| | Before | Mock |
|---|---|---|
| Boxes around a question | 2 (white card + tinted section box) | 0 |
| Text starts from the card edge | 54px (48px on a phone) | n/a |
| Text column | 238px on a phone, 432px on desktop | 326px, 720px |
| Question to answers | about 10px | 8px, help line, 32px |
| Left edges | header text, bar, text and button all differed | strip shares one, column shares one |
| Header description to progress bar | about 60px (24 padding + 24 margin + row) | about 26px |
| Bar to question | about 150px (window-height minimum, centered) | about 50px |

## Rules built

1. **No card, no inner box.** The Immersive full-bleed switch is the card switch: On = open page (default), Off = the normal card panel (also cleaned: one inset for progress, text, answers and buttons). A deliberate global Section style (the engine only emits those tokens when picked) keeps its boxes; so do an authored non-default section style and an authored section padding.
2. **One left edge** inside the column (eyebrow, question, help, answers, buttons), and the header text and progress bar share the strip inset (`--c-strip-inset`, 20 to 35px, declared once on the page frame).
3. **The mock's rhythm** for conversational screens: eyebrow to question 17.6, question to help 8, to answers 24, answers 11 apart in rows capped at 560, answers to buttons 38.4, buttons 50px tall. Left-aligned in One at a time; the other layouts keep the centered Card Deck stage.
4. **Fixed offsets, never window-height:** the column starts 40px under the bar (32px on phones). Default column width 640 (between Medium 560 and Wide 680 in the Max content width setting; the mock's 720 would have sat above "Wide").
5. Scale chips and their end labels travel as one block in every layout, so "Not likely / Extremely likely" sit under the ends of the row.

## File by file

| File | Change |
|---|---|
| `finalNavOneAtATime` html / css / js | open-page column (class `oaat-column`, NOT `stage`: LEX has a global `.stage` rule), strip with side inset, action row with the keyboard hint beside the primary, card `.question-card` and the 26px phone padding removed, section opening (`openSection`, cached), `mode-panel` inset. Key hint hidden on forms 540px wide or narrower. |
| `finalFormHeader` | `flush` prop: no bottom margin or padding, side inset = strip inset. |
| `finalFormViewer` | derives `options.openSections` (true unless a global Section style token is present) and `model.headerFlush` for One at a time on the open page. |
| `finalPageFrame.css` | `--c-strip-inset`. |
| `finalSectionRenderer.css` | `.sec-convo`: rhythm tokens, `--c-stage-*` hooks (align, justify, measure), eyebrow style for the section title (tracked caps, accent dot). |
| `finalElementRenderer` css + html | rhythm hooks (`--c-q-*`), caption pull-up, row cap, `.scale-group` wrapper. |
| `finalDesignRegistry` | Immersive full-bleed hint reworded. |

## Orphan ledger

| Setting | Writer | Reader |
|---|---|---|
| `layout.options.fullBleed` | Design > Page & form > Immersive full-bleed | viewer (`bleed`, `headerFlush`), nav |
| `options.openSections` (derived, never saved) | viewer | nav `currentSections` |
| `--c-strip-inset` | page frame | header (flush), nav strip and column |
| `--c-stage-align / -justify / -measure / -margin` | nav root | `.sec-convo` |
| Form appearance fill / border / shadow / glass | Design panel | the thank-you card and the Immersive-off panel (no longer the question card; there is none) |

## Checks

Jest 114 suites / 1,391 tests, eslint, prettier. Measured read-only in the Salesforce viewer tab and the Studio preview: one left edge (320 / 320 / 320 / 320 on desktop, 48 on a 334px form), no section box, gaps 17.6 / 24 / 38.4, button 50px, header description to bar 25.5px, bar to column 49.5px; Immersive off verified by patching the spec response in memory only (progress, text and button all on one edge). Other layouts rendered for regressions (wizard with One question per page, scroll survey, scroll form): unchanged apart from the scale end labels.

**Not covered:** themes with a busy page image or mesh now put text straight on the page in One at a time (switch Immersive off for a card); the wizard, tabs, rail and Split hero with One question per page keep their inner boxes (not asked); no card and no thank-you redesign.
