# Build plan: the red "invalid" line on every other field type (follow-up to stage 2)

Status: building (2026-10-11). Stacked on stage 2 (#375). Decided by the owner on 2026-10-11 after seeing pictures of the current state and a mock: **"Do all 3"**, read as: call 1 yes (this plan), call 2 keep the halo outline (already built, nothing to change), call 3 yes (the side-label dropdown, its own small PR).

## 1. In plain words

Stage 2 made the text box, text area, dropdown, radio group and checkbox group show a red line when validation fails. Every other kind of question still shows only the small red message under it, and the control itself looks calm. This change gives them the same 1 px red line the text box has, drawn around the control, with the same spacing rules as the groups (the line never touches the label above or the message below).

## 2. Which types, and where the line goes

| Question type | Line is drawn around | Today's wrapper |
|---|---|---|
| Single checkbox, toggle | the checkbox or toggle (hugs it, not full width) | `lightning-input`, now marked by a new `field-checkbox` class on the field |
| Consent | the checkbox-and-terms row | `.block-consent` (root gets `has-errors` while invalid) |
| Chip choice, card choice, likert | the whole row or list | `.choice-row` |
| Rating, 0-10 scale, opinion scale, emoji scale | the buttons and their end labels (hugs them) | `.scale-group` |
| Yes / no | the two-button row | `.yn-row` |
| Image choice | the tile grid | `.ic-grid` |
| Slider | the readout and the track | `.slider-wrap` |
| Matrix | all statements and their cells | **new** `.mx-table` wrapper (head and rows had no common parent) |
| File upload | the drop button | `.block-file-frame` (its root gets `has-errors` while invalid) |

Not changed, on purpose: **ranking** never fails (its starting order counts as an answer, so it shows no message); the **lookup** widgets draw their own invalid state; text box, text area, dropdown, radio and checkbox groups are stage 2.

## 3. Mechanism: one rule, no per-type code

Every question container already gets `has-errors` from `fieldClass` while it has an error, and every control above is a direct child of that container. So the whole feature is **one CSS rule list keyed on `.has-errors > <wrapper>`** (outline, offset, radius), one list for the label-clearance step, one for the message step. JS changes are three tiny ones: `fieldClass` adds `field-checkbox` for a single checkbox or toggle; the consent and file roots add `has-errors` while invalid; the matrix template gets its wrapper. The stage 2 group rules join the same lists (their selectors keep the same text, so their tests still find them).

## 4. Geometry (reused from stage 2, measured there)

- Line: 1 px, `--c-field-error`, offset 4 px (reach 5 px), corner radius = the theme's input radius.
- Stacked label: the control steps down 6 px so the line clears the label by at least 3 px (the label is only 2 px above at compact density, 4 px at comfortable); the message steps down 9 px (reach 5 + the usual 4). Side label: no step. Consent has no label above it: no step above, 9 px below.
- Single checkbox and toggle hug their control (`align-self: flex-start`), everything else spans its natural width.

## 5. Files

`finalElementRenderer.css` (rules), `finalElementRenderer.html` (matrix wrapper; consent and file root classes via getters), `finalElementRenderer.js` (`fieldClass`, two small getters), tests below, this doc.

## 6. Tests (written first, watched failing)

- CSS guard: every target is in the outline list; stroke, offset and colour token; the step arithmetic (step must cover the reach plus 3 px at the tightest label gap; message step at least base plus reach); no step above the consent row; steps scoped to `:not(.label-left)`.
- DOM guard (jest, real component): for each type, with an error the container has `has-errors` and the wrapper the CSS names is a direct child of it; without an error neither is there; the single checkbox and toggle carry `field-checkbox`, a text box does not.

## 7. Verification (same protocol as stage 2)

Deploy, site publish, then the `errorsOther` page (13 required questions) on **Studio (Visualforce), Lightning, public**, light and Dracula Dark: a red line on each type, message 4 px under the line, nothing overlapping the label, all three hosts equal. Compact and comfortable density. Stage 1 matrix and the stage 2 error page re-run for regressions. Before and after pictures for the owner.

## 8. What this changes for people (flagged)

After the site publish, every already-published form shows the red line on these question types when a respondent fails validation (the message was the only cue before). It restyles forms already in the wild, so the PR stays unmerged until the owner says.
