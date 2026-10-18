# Build plan: stage 3, forms on phones (narrow forms)

Status: building (2026-10-11). Stages 1 and 2 and the 0-10 layout are merged (#374 to #378). **S0 (probe) is done**, **S1 (padding budget) and S2 (our own controls) are built, deployed and measured**; S3 waits for the owner's decision 6; S4 is next. See "What was built" at the end for where the build differs from the plan as first written. **All four slices are merged** (PRs 380, 381, 382; S3 was decided as "no change"). The owner said **"Go"** to the plan below, which takes my recommended answer on each open decision of the audit (section 9 of `qa/CROSS_HOST_RENDER_AUDIT_2026-10-10.md`):

- **Decision 3 (width): yes.** The answer column must be at least 236 px on a 320 px public-site screen, in both densities, with sections as cards and with sections open. Starting budget per side on a narrow form: page padding 4, the form's card 1 + 8, a section's card 1 + 12.
- **Decision 4 (authored section padding): cap it.** On a narrow form an authored section padding can never exceed the budget (it can still be smaller).
- **Decision 5 (0-10 scale): keep what #378 built** (the owner's picture replaced the audit's "legend above the buttons"), and on phones only tighten the gaps to 4 px with 44 px buttons. Five-point and emoji scales sit on one row on phones (emoji buttons 60 to 44 px wide).
- **Decision 6 (platform controls that cannot be enlarged):** decided only after the probe, if it fails.

## 1. In plain words

A "narrow form" is a form 540 px wide or narrower (a phone, a narrow Lightning region, a side panel; the existing `final-form-viewport` rule). On a 320 px phone today the answer column is only about 190 px (comfortable density), because the page, the form's card and each section's card all add side padding on top of the site's own margin. Five 44 px buttons need 236 px, so scales end with a lonely button. Our own buttons are 36 px at the compact density, the ranking arrows 34 px, and the platform's controls are 16 to 32 px.

## 2. Slices (each its own PR, stacked; nothing merges without the owner's word, because every slice changes how existing forms look on phones)

**S0. Probe (read-only, first).** For each platform control (text box, text area, dropdown, radio and checkbox options, single checkbox, toggle, help button, calendar button) find out whether its clickable area can be enlarged from outside: a styling hook that works on all three platform stylesheets (found the way the choice-text hooks were: scan the stylesheet, set candidates, see what moves), or our own wrapper that forwards the tap. Output: a report in `qa/`, and the recommendation for decision 6. No product change.

**S1. The padding budget.** Only inside the narrow-form container query.
- Page side padding 12 to 4 (`finalPageFrame.css`).
- The form's card padding `min(var(--c-space-6), 16px)` to `min(var(--c-space-6), 8px)`.
- A section's card: a new token `--c-pad-cap` (12 px on a narrow form, unset otherwise) applied as `min(<padding>, var(--c-pad-cap, 9999px))` to the three section styles, to every authored padding choice (`PAD_SCALE`: the Studio writes it as an inline style, so the cap has to live inside the value), and to the One at a time strip that must line up with the sections (`finalNavOneAtATime.css`).
- Result per side: ours 26 px in total (public answer column 238 / 278 / 308 px at 320 / 360 / 390; Lightning 252 / 282 at 360 / 390). Forms wider than 540 px are untouched (checked by computed style, not by eye). Bleed layouts own their canvas and are excluded, as today.

**S2. Our own controls.** Only inside the narrow-form container query.
- At least 44 px on both sides: scale buttons and stars, emoji buttons (and 44 px wide, from 60), matrix cells, chips and Likert rows, ranking arrows (34 to 44), Next, Back and Submit. Cards and yes/no are already 46.
- A new token `--c-scale-gap` (4 px on a narrow form, the density's gap otherwise) used by the scale rows and by the 0-10 row's cap formula, so the capped row and its content stay the same width.
- Five-point and emoji scales fit on one row (five buttons need 236 px at 44 px and 4 px).
- The 0-10 ladder gets a narrow-form variant for the 4 px gap (6 + 5 from 284 px, 4 + 4 + 3 from 188 px), and its conversational twin.

**S3. The platform's controls.** As the probe allows; decision 6 if it does not.

**S4. A standing phone-width test (audit test C).** The harness moves into `scripts/` with a short README: 320, 360 and 390 px on the public site, both densities, sections as cards and open, the scales, the targets. Plus jest guards for the numbers that matter.

## 3. Acceptance for the stage

Answer column at least 236 px at 320 px; no lone button in any scale at any width; every target at least 44 x 44 px (or an explained exception); no sideways scroll; forms wider than 540 px byte-for-byte unchanged in computed style; the same on Studio (Visualforce), Lightning and the public site.

## 4. Risks and how they are checked

- Every layout has its own padding story (scroll, wizard, tabs, accordion, rail, split hero, One at a time): S1 is measured on each, not only on the scroll layout.
- Conversational sections have 6 px bigger buttons and their own width ladder (#378): S2 keeps both ladders honest.
- Header and progress strips line up with the sections by design; S1 checks the alignment, it does not assume it.
- Lightning is 26 px narrower than the public site (its own page margin): the budget is a target on the public site, a measured result in Lightning.

## 5. What was built (and where it differs from the plan above)

**S0, the probe** (`qa/STAGE3_PLATFORM_CONTROLS_PROBE_2026-10-11.md`): no styling hook enlarges the platform's controls the same way on all three hosts. Text box, dropdown and date box grow on the public site (`--dxp-s-form-element-spacing-block-*`) and Studio (`--lwc-heightInput`) but not in Lightning; radio and checkbox rows, the single checkbox have no height hook anywhere; help and calendar buttons have hooks on two hosts. So decision 6 is the owner's (leave as is, recommended; grow where a host allows; draw the choice controls ourselves; cards on phones).

**S1, the padding budget** (branch `feat/stage3-narrow-padding`, PR 380): as planned, plus the split hero. Measured on the deployed code: the answer column of the public site went from 190 to **238** px at 320 (both densities), 260 to 308 at 390; Lightning 234 to 282 at 390; the section padding at the compact density is now 12 (was 14). The layout sweep (every layout in the Lightning viewer at 390 px) found one layout the page frame's rule does not reach, the split hero (a bleed layout that owns its padding), at 194 px; it got its own narrow rule and is now 282 like the scroll, wizard, tabs and rail layouts (the accordion is 266, One at a time 294).

**S2, our own controls** (branch `feat/stage3-own-controls`, stacked on S1). It changed three times against the plan as first written, the last two because the owner looked at it ("5 star rating, emoji scale they all should be centered like nps if the screen is narrow" and "why are you taking nps to 6-5 in desktop when there's space to display all options in 1 row"):
1. *The 44 px floor is one line in the page frame, not a `max()` on every control.* On a narrow form `.page` sets `--c-control-h: 44px` and `--c-scale-gap: 4px`. A self-referencing `max(var(--c-control-h), 44px)` is a cycle in CSS, so the alternative was ten edits across five stylesheets; instead a jest guard asserts that no density is taller than 44 px (there are two: 36 and 44), so the line can only ever lift. Every control that reads the density height (scale chips and stars, chips, cards, yes/no, matrix cells, Next, Back, Submit, the One at a time button) follows with no further edit. Controls with a size of their own get narrow-form rules in `finalElementRenderer.css`: ranking arrows 34 to 44, the slider's touch target 30 to 44, the emoji faces (font 2x to 1.75x answer size, no side padding) so a face is 44 wide, not 60.
2. *A scale wraps by what is measured, not by a ladder of widths.* The first build (and the 0-10 question's earlier one) picked buttons per row from container-width steps written for one button size (44 px, 8 px gap). Any other size broke early: compact density, the phone's 4 px gap, the conversational look's 50 px buttons all showed 6 + 5 where all eleven fitted. All ladders are deleted (`--nps-n`, `--scale-per-row`, the `scale-n-N` classes, every container step, the second container name `convo`). The new `finalScaleLayout` module measures the real width of every button, the real gap and the real width of the column (computed style, so hover transforms and the Studio preview's scale cannot distort it) after every render and whenever the column resizes, and writes a plan on the row, from the least change to the most: (a) everything fits at the density's gap: nothing, one row; (b) it fits with the gaps squeezed (never below 6 px, never wider than the density's; `--scale-row-gap`): in a One at a time column of 560 px eleven comfortable buttons need 564 px, so this alone fixes the common desktop case; (c) in the conversational look, the buttons shrink back to the standard size (the row points its own `--c-q-control-h` at the density's control height): *tried, then measured, and kept only if the buttons really got smaller and then fit* (the rating's stars ignore that size; the first version assumed they shrink and a sweep caught a lone star); (d) otherwise the row is capped (`--scale-row-max` becomes `max-width`, with no fallback so unset means none) to wrap into the fewest, evenly filled rows (11 as 6 + 5, 7 as 4 + 3, 5 as 3 + 2, never a lone button where one can be avoided).
3. *On a narrow form every scale looks like the 0-10 question.* The block is centered, its rows are centered and balanced, the left label sits above the first button at the left edge and the right label below the last at the right edge (the same declarations as the 0-10 rules, kept identical by a jest test). On wide forms rating, opinion scale and emoji stay left-aligned with their labels under the row.

**How S2 was verified.** A width sweep over 14 viewport widths (1280 down to 320) for every scale family (rating 5 and 10, opinion scale 5, 7 and 10, emoji, 0-10), standard and conversational, both densities, on the public site, and the same on Lightning and the Studio preview (desktop and mobile frames), asserting two rules at every width: *one row whenever the buttons fit* and *no lone last button*. It found two defects the numbers of the first builds had hidden (the 0-10 four pixels short in a 560 px column; the lone star), both fixed; the final run has zero problems.

**Slice 2c, found after the merge by running the standing check over every layout** (branch `feat/stage3-nav-targets`): the other layouts' own navigation was never measured, and the check found three controls under 44 px on a phone (the wizard's step dots 12 x 12 px and tappable, tab headers 42 px tall, side-rail links 38 px tall, and the Pages toggle of the rail drawer) plus one layout under the width budget (the accordion kept 222 px of a 320 px screen: its panel body adds 8 px a side of its own). Fixes, each inside that layout's own narrow container query so wide forms keep exactly what they have: tabs and rail links `min-height: 44px`; stepper buttons 44 px tall with a negative margin that gives the room back (a 28 px numbered marker gets 8 px, a 12 px dot 16 px and 44 px of width), so the strip's height and spacing do not change and the dots look the same; the accordion body drops its side padding so the section card inside keeps its own 12 px (238 px, like every other layout). The check now takes `--layouts` and measures targets in all seven. Merged to main 2026-10-18 (PR 383).

**S3, the platform's controls: decided by the owner (2026-10-11), no code.** Of the four options in the probe report, the owner chose to **leave them as the platform draws them, on every host** (text box, dropdown and date box 32 px, radio and checkbox rows 21 px, help and calendar buttons 16 px): the hosts stay identical, the controls meet WCAG 2.2 level AA target size through its spacing exception, and they are listed (never failed) by the standing check. Drawing the choice controls ourselves stays a possible later stage of its own.

**Wide screens (owner, 2026-10-11):** rating, opinion scale and emoji stay left-aligned on wide forms; only a narrow form centers them like the 0-10 question.

**S4, the standing phone-width check** (`scripts/qa/phone-check.cjs`, with `phone-check.md`): the harness's essentials as a committed script: a published public form on the guest site at 320 / 360 / 390 px, both densities, its spec replaced in memory by a kitchen sink (nothing is saved or clicked), asserting no sideways scroll, an answer column of at least 236 px, every scale on one row when it fits / no lone button / centered, and every control of ours at least 44 x 44 px; the platform's controls are listed with their sizes and never fail. `--self-test` (no browser, no org) feeds it nine deliberately bad results and fails unless each is caught. The jest guards for the numbers that matter are the ones that came with S1 and S2 (`narrowBudget`, `phoneControls`, `finalScaleLayout`, `scaleWrap`).

## 6. Not in this stage

The layout-cleanliness proposal S1 (sections open by default) stays its own decision; the Studio's 320 px device frame (stage 5, optional); drawing radios, checkboxes or the dropdown ourselves (parked).
