# Build plan: the 0-10 (NPS) question, centered, balanced, with its labels at the ends

Status: building (2026-10-11). Stacked on #377. The owner sent a reference picture (a 0 to 10 question with the buttons centered in two balanced rows, "Not at all likely" above the 0 and "Extremely likely" below the 10) and said "NPS should be like this ... centered and having messages displayed at 0 and 10 ... do that next".

## 1. In plain words

Today the 0-10 row is left-aligned, wraps greedily (at the default comfortable density it ends with a lone "10" on its own line, and "Not likely" then sits under that lone 10), and the two end labels share one line under the buttons. After this change:

1. The block of buttons is **centered** in the answer column (the question text stays left, as in the picture).
2. When the buttons do not fit on one line they wrap into **balanced, centered rows**: 6 + 5, then 4 + 4 + 3, then 3 + 3 + 3 + 2. Never 10 + 1.
3. The **left label sits above the 0** (at the left edge of the block) and the **right label below the 10** (at the right edge), exactly as in the picture. This holds on one row too (diagonal: above-left, below-right).

Not changed: the look of the buttons (the picture's round pastel buttons are the reference's theme, not part of the ask), the other scale types (rating, opinion scale, emoji), the answers, keyboard navigation (the DOM order is untouched).

## 2. Scope

Only the 0-10 question (`nps`). It shares its markup with rating, opinion scale and emoji scale, so the change is keyed on a new `nps-group` class that only the 0-10 question gets. Opinion scale can follow with one more selector if wanted.

## 3. Mechanism (CSS only, no JavaScript)

- `scaleGroupClass` (new getter) gives the 0-10 group `scale-group nps-group`; everything else keeps `scale-group`.
- The group becomes a three-row grid (`left`, `row`, `right`). The end-label container is `display: contents`, so its two spans become grid items: first span in `left`, second in `right`. No markup change, so the existing structure tests stay valid.
- The row is capped to **N buttons wide** and centered, so the browser wraps it after exactly N buttons: `max-width: N * button + (N - 1) * gap`. The group shrinks to that width, so the labels land on the block's real ends.
- N comes from a ladder keyed on the section's width (`@container section`, the named container the matrix already uses): 11 (one row) from 564 px, 6 from 304 px, 4 from 200 px, 3 below. The thresholds are the widths that N buttons need at the **comfortable** density (44 px buttons, 8 px gap, which is every theme's default), so a row can never be asked to hold more than fits. Compact buttons are smaller, so they fit with room to spare; the only visible effect is that a compact form switches from one row to 6 + 5 below 564 px instead of 456 px.

- **Conversational sections (found while reviewing, fixed before the PR).** The conversational look (`.sec-convo`, one question on the stage) makes the buttons 6 px bigger (`--c-q-control-h` = control height + 6 px = 50 px). A ladder sized for 44 px buttons would ask a conversational row to hold more than fits: measured on the public site at a phone width, the row came out 5 + 5 + 1, the lone "10" this change exists to remove. The conversational section's container therefore carries a **second name**, `convo` (`container-name: section convo`, one line in `finalSectionRenderer.css`), and the renderer has a second ladder under `@container convo`, sized for 50 px buttons (11 need 630, 6 need 340, 4 need 224). It comes after the standard ladder, so inside a conversational section it wins. After the fix the same phone width gives 4 + 4 + 3.

## 4. Files

`finalElementRenderer.css` (the block and both ladders), `finalSectionRenderer.css` (one line: the second container name), `finalElementRenderer.html` (`class={scaleGroupClass}`), `finalElementRenderer.js` (one getter), a new test file, this doc.

## 5. Tests (written first, watched failing)

- DOM: only the 0-10 group is `nps-group`; rating, opinion scale and emoji scale are not.
- CSS: centered, grid areas, labels in `left` and `right`, the row cap formula and its centering.
- The ladder as arithmetic: each threshold equals the width the next larger N needs (at 44 px and 8 px), minus 0.02 px; the default is 11; the wrapping a cap of N produces is balanced (rows differ by at most one) for every N in the ladder.
- A drift guard: the comfortable density in the theme engine really is 44 px buttons and an 8 px gap, because the ladder is derived from them.
- The conversational ladder: the section container answers to `convo` and its buttons are control height + 6 px (a drift guard across the two stylesheets); the ladder has the same 6, 4, 3 steps sized for 50 px buttons; it comes after the standard ladder.

## 6. Verification

Deploy, site publish, then on **Studio preview (Visualforce), Lightning and the public site**: the 0-10 question measured at several widths (public at 1280, 768, 390, 360 and 320; the Studio's Desktop and Mobile frames; Lightning's page), both densities, light and Dracula Dark. Per case: how many buttons per row, that the block is centered (equal space left and right), that the left label is above the first row at the left edge and the right label below the last row at the right edge, and no lone "10". Rating, opinion scale and emoji are measured too, to prove they did not move. Before and after pictures for the owner.

## 7. What this changes for people (flagged)

After the site publish, every already-published form with a 0-10 question gets the new layout (centered, balanced, labels at the ends). It restyles forms already in the wild, so the PR stays unmerged until the owner says.
