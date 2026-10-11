# Build plan: stage 3, forms on phones (narrow forms)

Status: building (2026-10-11). Stages 1 and 2 and the 0-10 layout are merged (#374 to #378). The owner said **"Go"** to the plan below, which takes my recommended answer on each open decision of the audit (section 9 of `qa/CROSS_HOST_RENDER_AUDIT_2026-10-10.md`):

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

## 5. Not in this stage

The layout-cleanliness proposal S1 (sections open by default) stays its own decision; the Studio's 320 px device frame (stage 5, optional); drawing radios, checkboxes or the dropdown ourselves (parked).
