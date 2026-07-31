# IMPL_PLAN — Survey feedback round 1 (owner, 2026-07-31)

Owner batch: 5 rulings, all approved ("yes to all"): matrix = radio dots, one-per-page toggle
lives in Design → Paging, emoji sentiment wording = mine. One PR per item, in this order
(1 → 2 → 3 → 5 → 4 — item 4 reuses item 1's gate machinery).

---

## Item 1 — Surveys: label position always Top

**Problem.** Design → Fields → Labels → "Label position" (Top/Left) is meaningless for surveys
(owner: always top). Hiding the control is not enough — a THEME can carry
`labelPosition: 'left'`, and published specs ship precompiled `spec.resolved.tokens`, so the
clamp must land on the token bag, not the theme props.

**Changes.**

| File                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalDesignRegistry.js` (~:1047)        | `labelPosition` control gains `appliesTo: { notFormTypes: ['survey'] }`                                                                                                                                                                                                                                                                                                                                                   |
| `finalDesignPanel.js` `_applies` (~:147) | Refactor: evaluate ALL present gate keys AND-combined (today it returns on the first key found — single-key gates behave identically). New keys: `formTypes` / `notFormTypes` matched against `spec.form.type \|\| 'form'`.                                                                                                                                                                                               |
| `finalFormViewer.js` (~:214)             | After `this.tokens` is assigned (covers both the resolved-bag and live-resolve paths): if `spec.form.type === 'survey'`, spread-patch the 5 label-flow tokens to the TOP shape: `--c-label-flow: column`, `--c-label-basis: none`, `--c-label-mb: var(--c-space-1)`, `--c-label-gap: 0px`, `--c-label-align: stretch`. (`--c-space-1` = `density.space[0]`, same value LABEL_FLOWS.top uses — density-safe by reference.) |

**Orphans.** Theme JSONs keep their `labelPosition` — inert for surveys by clamp, still live for
forms. Per-element `labelPosition: 'hidden'` (renderer-level) is untouched.

---

## Item 2 — Emoji scale: no end labels, sentiment aria instead

**Problem.** "End labels" inputs show for the whole scale family incl. emojiScale; rendered end
labels duplicate what the faces already say. Screen-reader story is worse: chips announce
"2 of 5" — positional, meaningless.

**Changes.**

| File                              | Change                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalPropertyPanel.js`           | New getter `showEndLabels` = `isScaleFamilyQuestion && !isEmojiScaleQuestion`                                                                                                                                                                       |
| `finalPropertyPanel.html` (~:293) | End-labels block switches from `isScaleFamilyQuestion` to `showEndLabels`                                                                                                                                                                           |
| `finalElementRenderer.js`         | `hasEndLabels` returns `false` for emojiScale; new `EMOJI_SENTIMENTS = ['Very unhappy', 'Unhappy', 'Neutral', 'Happy', 'Very happy']` (matches 😠😕😐🙂😍); emoji chip `ariaLabel` becomes `"Very unhappy, 1 of 5"` etc. Ratings keep `"n of max"`. |

**Orphans.** Authored `leftLabel`/`rightLabel` on existing emojiScale configs stay in the spec,
never rendered (harmless; same posture as other hidden-control values, IA §6).

---

## Item 3 — Matrix: desktop cells become radio dots

**Problem.** Desktop matrix cells are full-width 44px buttons styled like text inputs with the
point label hidden — rows of empty text-box lookalikes; selection floods the cell solid accent.
Owner: "what the hell is this". Ruling: radio dots (the industry-standard matrix rendering).

**Changes — `finalElementRenderer.css` only** (markup/JS untouched; `.mx-dot` button stays the
full-cell hit target, ≥44px):

- Desktop `.mx-dot`: strip border/background; center an 18px circle drawn by `::before`
  (1.5px `--c-field-border` ring on `--c-input-bg`). Hover → ring turns `--c-accent`.
  Selected → circle fills `--c-accent`. Focus-visible → `--c-focus-ring` on the circle.
- Narrow container query (≤560px, stacked cards): `::before` hidden; the chip look moves INTO
  the query (border/`--c-input-bg`/radius + accent flood when selected) — mobile rendering is
  unchanged by design.

**Orphans.** None.

---

## Item 4 — Surveys: "One question per page" toggle + render-time auto-split

**History.** Ruled YES 2026-07-27 (SURVEY_PLAN §10 Q4) but never assigned to an S-slice — no
code, no DEFERRED row. This closes the IOU. No Settings mode exists; owner approved
Design → Paging as the home.

**Toggle.**

| File                                 | Change                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalDesignRegistry.js` paging area | New group `survey` / "Survey", `appliesTo: { formTypes: ['survey'], paginated: true }` (AND — needs item 1's `_applies` refactor). One control: key `onePerScreen`, type toggle, label "One question per page", `path: 'settings.onePerScreen'`, fallback `false`, hint: "Shows each question on its own screen when someone fills this out. Your sections in Build stay exactly as they are." |

**Auto-split (`finalFormViewer.js`, in the spec-ingest path before the rules walk + model
build).** Active only when `spec.form.type === 'survey'` && `spec.settings.onePerScreen` &&
`layout.paginates`:

- Each non-repeat section explodes: one virtual page per element —
  `{ ...page, id: 'page~elId', sections: [{ ...section, id: 'sec~elId', elements: [el], showHeader: <original> only for the section's FIRST question, false for the rest }] }`.
  (First writer for the renderer's existing `showHeader !== false` escape hatch.)
- Repeat sections stay ATOMIC — one virtual page carrying the whole repeater.
- Virtual sections inherit `title`/`visibility`/style — OneAtATime's eyebrow and section
  theming keep working; page `visibility` inherited from the parent page.
- `visiblePages` (split mode only): drop virtual pages whose section lost its only element to
  visibility rules — a hidden question must not leave a blank screen in the flow.
- Everything else rides untouched: `pageValidity`, F8 advance-denial, reveal, stepper/progress
  counts, and submit (`_payload()` is a pure answers map — pagination-proof).

**Non-goals / accepted v1 posture.** Virtual pages inherit the parent page title (steppers may
repeat a label — narrowMode dots exist); tabs with many questions is the author's own choice;
Card Deck pack remains NOT built (separate IOU).

**Orphans.** None new. `settings.onePerScreen` = new schema key, design-registry-written.

---

## Item 5 — Design → Sections: hide section headers

**Ruling.** Global Show/Hide toggle; per-section control stays "leave the title empty" (already
true today: header renders only when title/description/icon exist — `finalSectionRenderer.js:178`).

**Changes.**

| File                                            | Change                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalDesignRegistry.js` sections group (~:911) | First control: key `sectionHeaders`, label "Section headers", type select, `themePath: 'sectionHeaders'`, `emptyAsNull: true`, options `''` = Show / `'hidden'` = Hide, hint: "Hides the title row on every section. Want to hide just one? Leave that section's title empty in Build." |
| `finalThemeEngine.js`                           | New prop default `sectionHeaders: null`; when `'hidden'`, emit `--c-sec-head-display: none` (conditional-token pattern, like `pageRadius`)                                                                                                                                              |
| `finalSectionRenderer.css` (:57)                | `.sec-head { display: var(--c-sec-head-display, block); }`                                                                                                                                                                                                                              |

**Accepted consequence.** Hidden headers also hide the collapse chevron (it lives in the
header) — a collapsible section with hidden headers just renders expanded. Nav chrome (stepper
labels, OneAtATime eyebrow, tabs, rail) derives from titles independently and is untouched.
`display: none` also removes headers from the accessibility tree — screen readers skip them
too, which is the point of "hidden".

**Orphans.** None.

---

## Verification (every PR)

Jest for the touched components + deploy to the dev org + render-verify (Playwright/frontdoor
screenshots for the visual items: matrix dots, emoji, one-per-page flow). uiux-flow-reviewer
gate runs over the deployed batch before the final merge. DESIGN_CONTROL_AUDIT.md gains rows
for the two new controls (`sectionHeaders`, `onePerScreen`) and the survey gate on
`labelPosition`.
