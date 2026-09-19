# Implementation Plan — Progress & Wayfinding Pass (all layouts)

**Status: IMPLEMENTED (PR pending merge) — three build addenda below (§9).**
Owner report (2026-07-12, Neon Nights screenshot): stepper strip renders as a foreign
gray band, last step clipped at the card edge; owner suspects every progress
indicator shares the defects. Survey below confirms it's three defect CLASSES
spread across the layouts — fixed as classes, not per-symptom.

---

## 1 · Survey matrix — every wayfinding surface, audited

| Surface                                         | Band (translucent `--c-content-bg` painted over the glass card)                                                                                                                                        | Overflow / clipping                                                                                                                                                                | Muddy track/marker contrast on dark                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Stepper** strip (`finalNavStepper.css:16-28`) | **YES** — sticky strip paints content-bg + blur; on glass themes it stacks translucent-on-translucent and shows as a band even unpinned                                                                | **YES** — last step `flex: 0 0 auto` can't shrink, strip has `padding: … 0`, and the only collapse is the ≤540px container query (never fires on a wide card with many/long steps) | **YES** — connectors + track + inactive markers ride `--c-field-border`; markers also paint `--c-content-bg` (mini-band) |
| **Tabs** strip (`finalNavTabs.css:13-23`)       | **YES** — identical sticky paint pattern                                                                                                                                                               | no — tabs scroll horizontally with fade-edge masks (`:133-140`), never wrap                                                                                                        | minor — inactive tabs are `--c-text-weak` (acceptable)                                                                   |
| **Rail** (`finalNavRail.css`)                   | wide mode: no (rail sits on the page, no strip paint). **Narrow topBar chips: YES** (`:262-274` content-bg + blur). `drawer-toggle` button also paints content-bg (`:80`) — same stacking in miniature | no — vertical list, labels ellipsize                                                                                                                                               | **YES** — `.progress-track` on `--c-field-border` (`:171-176`)                                                           |
| **One-at-a-Time** (`finalNavOneAtATime.css`)    | no — inline progress, no own surface; bleed hairline sits on the page                                                                                                                                  | no                                                                                                                                                                                 | **YES** — track (`:14-20`) + bleed hairline (`:52-57`) on `--c-field-border`                                             |
| **Split Hero** pane progress                    | no — `currentColor` mixes on the pane's own paint (the doctrine the others should have followed)                                                                                                       | no — dots/bar only                                                                                                                                                                 | no                                                                                                                       |
| Accordion / Scroll                              | no progress surfaces                                                                                                                                                                                   | —                                                                                                                                                                                  | —                                                                                                                        |

Root causes, named:

- **Class A — sticky paint**: the strip needs a surface ONLY while pinned (so scrolled
  content can't show through), but it paints that surface permanently. Solid themes
  hide the crime; glass themes expose it.
- **Class B — no measured fit** (stepper only): collapse keyed to a 540px container
  width instead of "do the steps actually fit?".
- **Class C — wrong ink for tracks**: `--c-field-border` is an input-chrome token;
  on dark themes it's near-invisible. Split Hero's `currentColor` mix is the proven
  pattern (PR #70-era doctrine: never hard-coded, always relative to the local ink).

---

## 2 · Fix A — paint-when-pinned (stepper strip, tabs strip, rail topBar chips)

**New shared module `c/finalStuck`** (~20 lines, no template): exports
`observeStuck(sentinelEl, onChange)` — drops an IntersectionObserver on a 1px
sentinel rendered just above the sticky element; when the sentinel scrolls out,
the element is pinned → `onChange(true)`. Returns a disconnect function.
(Plain words: a tripwire that tells us the exact moment the strip starts hugging
the top of the screen.)

Per consumer (stepper, tabs, rail-narrow):

- template: `<div class="stuck-sentinel"></div>` immediately before the strip;
  strip gains `class={stripClass}` with `is-stuck` toggled from the callback.
- CSS change (exact):
  - REMOVE from the base strip rule: `background: var(--c-content-bg);` and both
    `backdrop-filter` lines.
  - ADD: `.steps.is-stuck { background: var(--c-content-bg); -webkit-backdrop-filter: blur(var(--c-glass-blur)); backdrop-filter: blur(var(--c-glass-blur)); }`
    (same shape for `.tab-strip.is-stuck` and the rail chip row).
- LEX embeds: `--c-nav-sticky: static` → never pins → sentinel never fires →
  strip stays transparent. Correct for free.
- `drawer-toggle` (rail narrow): not sticky — just loses its `content-bg` paint for
  `background: transparent` (border already outlines it).

Result: unpinned strips sit directly on the card (band gone everywhere); pinned
strips still mask scrolled content exactly as today.

## 3 · Fix B — stepper measured fit ladder

- `.steps` gains horizontal padding: `padding: var(--c-space-2) var(--c-space-2);`
- `.step-item:last-child` becomes shrinkable: `flex: 0 1 auto; min-width: 0;`
  (ellipsis now reachable — no more guillotined labels at any width).
- **Measured collapse** (ResizeObserver on the strip, JS): compares container width
  against `stepCount × MIN_LABELED_STEP` (tune live, start 120px):
  - fits → full labels (today's render)
  - doesn't fit → **active-label-only tier**: all markers numbered, only the active
    step shows its label (class `fit-compact`; CSS hides `.step-btn:not(.active) .step-label`)
  - still doesn't fit at `stepCount × 40px` → the existing Small-screens choice
    (dots / progress bar) exactly as the 540px query does today (class reuses those rules).
- The 540px container query stays as the floor for genuinely narrow hosts.
- No new settings: the ladder is automatic; the owner-facing "Small screens"
  option keeps choosing the final tier's look.

## 4 · Fix C — track/marker ink (exact rule list)

| File                   | Rule                                                 | From                                                                       | To                                                                                              |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| finalNavStepper.css    | `.step-item::after`                                  | `background: var(--c-field-border)`                                        | `background: color-mix(in srgb, var(--c-text) 18%, transparent)`                                |
| finalNavStepper.css    | `.step-marker`                                       | `border: 1px solid var(--c-field-border); background: var(--c-content-bg)` | `border: 1px solid color-mix(in srgb, var(--c-text) 30%, transparent); background: transparent` |
| finalNavStepper.css    | `.mode-dots .step-marker` + narrow-dots twin         | `background: var(--c-field-border)`                                        | `background: color-mix(in srgb, var(--c-text) 22%, transparent)`                                |
| finalNavStepper.css    | `.progress-track`                                    | `background: var(--c-field-border)`                                        | `background: color-mix(in srgb, var(--c-text) 15%, transparent)`                                |
| finalNavRail.css       | `.progress-track` (:171)                             | same                                                                       | same mix                                                                                        |
| finalNavOneAtATime.css | `.progress-track` (:14) + `.progress-hairline` (:52) | same                                                                       | same mix                                                                                        |

`--c-field-border` keeps its day job (inputs). Split Hero untouched — it already
does this. Done/active states keep `--c-accent` everywhere.

## 5 · Settings / engine / orphan impact

- **Zero registry changes, zero engine changes, zero new/removed `--c-*` tokens.**
- One NEW LWC module `c/finalStuck` (JS-only, shared by 3 consumers).
- Nothing gains or loses a writer/reader — the orphan ledger is unchanged from
  IMPL_PLAN_HEADER_RICHTEXT_PANE.md §2.

## 6 · Visual changes to existing forms (deliberate)

- Every stepper/tabs form: the strip stops showing a surface band while unpinned
  (all themes — subtle on solid themes, the whole point on glass ones).
- All progress tracks get slightly stronger contrast on dark themes, slightly
  softer on light ones (relative ink instead of input-border gray).
- Steppers with many/long pages collapse to active-label-only instead of clipping.

## 7 · Line-items for YOUR eye

1. **Active-label-only stays an overflow tier, not the default.** When everything
   fits, you still get all labels (recommended). Say so if you want it as the
   default look for 4+ steps regardless of fit.
2. **Tier thresholds** (120px / 40px per step) are starting values — tuned during
   live verification, recorded in the PR.
3. Rail `drawer-toggle` transparent-button change rides along (same stacking bug,
   4 lines) — cut it if you consider it out of scope.
4. **RULED (owner 2026-07-12): keep the track (groove), recolored per §4** —
   "I will remove it the moment I don't like it." Removal recipe below so that
   revert is clean, not archaeology.

## 7a · Groove removal recipe (if the owner later rules it out)

Removing the track everywhere = delete/flip these and ONLY these (state after
this PR):

| File                   | Rule                                                                                | Action to remove the groove                                               |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| finalNavStepper.css    | `.progress-track { background: … }`                                                 | set `background: transparent` (keep the element — the fill needs its box) |
| finalNavRail.css       | `.progress-track { background: … }`                                                 | same                                                                      |
| finalNavOneAtATime.css | `.progress-track { background: … }` + `.progress-hairline { background: … }`        | same                                                                      |
| finalNavSplitHero.css  | `.progress-track { background: color-mix(in srgb, currentColor 30%, transparent) }` | same — include it or Split Hero stays the odd one out                     |

Do NOT delete the `.progress-track` elements or their `overflow: hidden` /
radius — the fill clips against them. The "Step X of Y" texts already exist on
every bar and carry the context once the groove is gone.

## 8 · Test & verification

Jest: stepper tier classes from mocked widths; strip has no bg class unpinned /
gains it on the observer callback; existing suites stay green.

Live (throwaway forms, Neon Nights + Editorial Ivory, idempotent):

1. Stepper 6 pages, long labels, wide desktop: no clipping; compact tier engages;
   computed background of unpinned strip = transparent on BOTH themes.
2. Scroll down: strip pins → gains content-bg + blur (computed style flips).
3. Tabs + rail narrow topBar: same unpinned/pinned assertions.
4. Track contrast: computed track color on Neon vs before (screenshot pair).
5. LEX embed smoke: strips static + transparent.

Ship: one branch/PR; delete throwaways; then owner review of §7 outcomes.

## 9 · Implementation addenda (found during build)

1. **The tripwire compares against the STRIP, not the viewport.** The plan's
   sentinel-exits-viewport-top design fails inside nested scroll containers
   (the studio stage scrolls in its own box ~120px below the viewport top).
   Shipped signal: pinned == the strip stopped following its sentinel (a >4px
   gap opens between them). Works in window scroll AND nested scrollers.
2. **Discovery: NO current host ever pins.** LEX pages force
   `--c-nav-sticky: static` (pageFrame, by design), and the studio preview
   stage's device frame clips sticky so it never engages there either. The
   2026-07-11 "sticky wayfinding" ruling is therefore only realized on a
   future full-viewport host (guest site / VF viewer). Until then,
   paint-when-pinned simply means "never paint" — the band is gone everywhere
   users currently look. Pinned-repaint path covered by finalStuck unit tests.
3. **Compact tier: the active item grows (`flex: 3 1 auto` via an item-active
   class).** Equal flex shares crushed the one visible label to a single
   letter ("G…") — hiding the other labels doesn't redistribute space by
   itself. Live-verified: active label 132px at 10 steps.
