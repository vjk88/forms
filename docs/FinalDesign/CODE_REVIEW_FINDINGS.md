# Code Review Findings — final* components

> **Living review log for the rebuild.** First pass 2026-07-05: deep review of `finalThemeEngine`,
> `finalThemeCatalog`, `finalSectionRenderer`, `finalNavSplitHero` against
> [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) ·
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md) · [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) ·
> [BUILD_PHASES.md](./BUILD_PHASES.md), plus collateral findings in the components they touch
> (`finalElementRenderer`, the other nav primitives, PR #37's field-surface fix).
> Update the **Status** column as findings are fixed; append new reviews below, never rewrite history.

**Overall verdict (2026-07-05):** the architecture survived contact with the code. Engine is pure,
deterministic, and exhaustively tested (45 jest, contract tripwire, old-bug reel as string diffs);
catalog hides recipes and defends its copies; sectionRenderer honors the preset carve-out and the
cascade; splitHero implements every catalog §2 row including the shared `finalStepFlow` engine.
The findings below are consumption slips at the edges — not another rotten core.

## Index

| # | Severity | Status | Component(s) | One-liner |
|---|---|---|---|---|
| F1 | HIGH | **OPEN** | 5 nav primitives + engine contract | `--c-field-border` is a shorthand consumed as a color → invisible chrome |
| F2 | HIGH | **OPEN** | finalElementRenderer | Help text unreachable for SR/keyboard users (aria-hidden-focus regression, PR #37) |
| F3 | MED | **OPEN** | finalElementRenderer | `labelPosition: 'left'` silently renders as top-stacked (regression, PR #37) |
| F4 | MED | **OPEN** | finalThemeEngine + finalThemeCatalog | Retro Terminal theme misses the dark-field heuristic → white inputs on black |
| F5 | MED | **OPEN** | finalNavSplitHero | Progress dots/track hard-coded white → invisible on light theme-dressed panes |
| F6 | MED | **OPEN** | finalSectionRenderer | Column collapse is a viewport media query, not a container query (UIUX #12) |
| F7 | MED | **OPEN** | finalElementRenderer | Checkbox `valuechange` emits `event.target.value` instead of `.checked` |
| F8 | LOW | OPEN (P3) | finalNavSplitHero + viewer | `pageValidity` / `options.navigation` (Free/Gated) accepted but never used — documented placeholder |
| F9 | LOW | **OPEN** | several | Per-file `var()` fallbacks violating §3.1 rule 5 (drift-bait) |
| F10 | LOW | OPEN | finalNavSplitHero (+ navOneAtATime) | `pages` setter resets `screenIndex` to 0 on every assignment |
| F11 | LOW | OPEN | finalNavSplitHero | `.mode-bleed { min-height: 100vh }` overshoots inside LEX chrome |
| F12 | LOW | OPEN | finalThemeCatalog | `headerBg` holds multi-part background shorthands — works, but document the constraint |
| F13 | LOW | OPEN (P5) | finalThemeCatalog | `/resource/formThemeAssets/…` URLs snapshot into published specs → Experience-site 404 risk |
| F14 | LOW | OPEN | docs | ARCH §2.2 sketch says accordion `paginates: true`; registry ships `false` (code is right) |
| F15 | LOW | OPEN | finalElementRenderer | `labelStyle` (Uppercase/Muted) unimplemented — trivial now that we own the label markup |
| F16 | INFO | phase-gated | finalSectionRenderer | Section Icon / Collapsible / Default Collapsed not rendered yet (P3 authoring scope) |
| F17 | INFO | n/a | finalThemeEngine | Minor robustness nits (null palette values, `mix()` rgba degradation, 3-digit hex veil) |
| ✅ | — | **FIXED (PR #37)** | engine + elementRenderer | Dark themes got white input boxes + faint SLDS-grey labels |

---

## F1 · `--c-field-border` type mismatch — invisible chrome in five layouts (HIGH)

The engine emits the token as a **full border shorthand** (`1px solid <color>`), and
`finalPageFrame :host` declares the same shape. But five nav primitives consume it **as a color**:

| File | Usage |
|---|---|
| `finalNavRail.css` 53, 111, 223 | `border: 1px solid var(--c-field-border)` |
| `finalNavRail.css` 137 | `background: var(--c-field-border)` |
| `finalNavStepper.css` 76, 150, 176 | `background: var(--c-field-border)` |
| `finalNavStepper.css` 113 | `border: 1px solid var(--c-field-border)` |
| `finalNavTabs.css` 63, 88, 99 | `border-bottom: 1px solid var(--c-field-border)` / `border-color:` |
| `finalNavAccordion.css` 7, 11 | `border-bottom/top: 1px solid var(--c-field-border)` |
| `finalNavOneAtATime.css` 18, 55 | `background: var(--c-field-border)` |

Substitution produces e.g. `border: 1px solid 1px solid #c9ced6` → **invalid at computed-value
time** → the property falls back to its initial value. Every one of those hairlines, dividers, and
progress tracks silently renders as `none`/`transparent`. This is the old build's name-mismatch
bug class reborn — the exact thing COVERAGE_MATRIX existed to catch.

Compounding it: PR #37 borders the actual inputs with `--slds-c-input-color-border:
var(--c-text-weak)`, so the shorthand token now has **zero valid consumers** and
`palette.fieldBorderColor` is fully inert.

**Fix direction:** decide the token's type ONCE. Recommended: keep `--c-field-border` a shorthand
for the input surface (matches `--c-content-border` precedent), point nav chrome at a
`--c-text-weak`-derived hairline (or `color-mix`), and wire the SLDS input border back through the
theme knob. Add a grep/jest tripwire: shorthand tokens (`--c-content-border`, `--c-field-border`)
may only ever appear as the ENTIRE value of a `border*` property.

## F2 · Help text unreachable for SR/keyboard users (HIGH — a11y regression, PR #37)

`finalElementRenderer.html`: the custom themeable label is `aria-hidden="true"` and
`lightning-helptext` sits **inside** it, while `nativeHelp` suppresses `field-level-help` whenever
the custom label renders. Two violations:

1. A focusable control inside an aria-hidden region — axe `aria-hidden-focus`, WCAG 4.1.2. Tab
   lands on a button assistive tech cannot perceive.
2. The help content now exists ONLY inside that hidden region — screen-reader users lost access to
   help entirely. (Pre-PR, `field-level-help` rode the native input accessibly.)

**Fix:** wrap only the label *text* in the `aria-hidden` element; render `lightning-helptext` as a
non-hidden sibling (its tooltip carries its own ARIA). Keep the native `label-hidden` +
assistive-text label as-is (that part is correct — SR announces the field once).

## F3 · `labelPosition: 'left'` regressed to top-stacked (MED — PR #37)

Old code mapped `left` → `label-inline`. The new custom label always renders above the field
(`.field` is block; label has `margin-bottom`). Catalog §1 and FORM_SPEC_SCHEMA promise
Top / Left / Hidden — `left` is now silently identical to `top`. (History rhyme: the old build's
reported bug was "if there's helptext it always top stacked." The rebuild just reintroduced
always-top-stacked for everything.)

**Fix:** flex-row layout on `.field` when `labelPosition === 'left'`, with a label width from the
spacing scale. Batch with F15.

## F4 · Retro Terminal misses the dark-field heuristic (MED)

`isLight(pal.text)` uses YIQ ≥ 150. Terminal's green `#22c55e` scores **136.5** → classified as
dark text → theme treated as *light* → **solid white inputs on a pure-black panel**. Every other
dark theme passes (dracula 246, tokyo 231, retroStepper 168). Colored-text themes are the blind
spot of a text-based darkness probe.

**Fix (either):** key the heuristic off `contentBg` when it parses as hex (that's the surface
fields actually sit on), falling back to text; OR pin `fieldBg` explicitly on the `terminal`
catalog entry. Add a jest case asserting terminal's `--c-field-bg` is not `#ffffff`.

## F5 · splitHero progress chrome hard-coded white (MED)

`finalNavSplitHero.css` ~105–135: dots are `rgba(255,255,255,.35)` / active `#fff`, track
`rgba(255,255,255,.3)`. On the **theme-dressed pane path** (no pane config → `background:
var(--c-header-bg); color: var(--c-header-text)`), pane *text* correctly rides the theme — but the
progress chrome stays white. Mix-and-match is the whole point of the decoupled design: any light
classic theme on splitHero (e.g. Editorial Ivory, `headerBg: transparent`) renders white-on-cream
progress = invisible. Same razor edge if a user picks a light veil color (no contrast net until
P2's `contrastBadge`).

**Fix:** dots/track ride `currentColor` (with opacity), so they follow whichever ink the pane is
using — hero white on config-painted panes, `--c-header-text` on theme-dressed ones.

## F6 · sectionRenderer collapse is viewport, not container (MED)

`finalSectionRenderer.css` bottom: `@media (max-width: 640px)` collapses `cols-2/3`. The CSS
comment deferred this to P1 ("container-query zones arrive with layoutZones") — P1 has shipped;
the section *field grid* still watches the viewport. Concrete failure: splitHero's form pane is
half-width, so at a 1200px viewport a 2-column section stays 2 columns inside a ~570px pane.
Contract: UIUX review #12 — container queries, never viewport, one shared threshold constant.

**Fix:** container-type on the section host (mind [[reference-container-type-flex-collapse]] —
`width: 100%` guard) or collapse driven by `finalLayoutZones`' container.

## F7 · Checkbox `valuechange` carries garbage (MED)

`finalElementRenderer.js` `handleChange` emits `event.target.value`; `checkbox` is in
`INPUT_TYPES`, and a checkbox's state is `event.target.checked`. Every checkbox change event
carries a meaningless value. Also: the custom label is not click-associated with the input (no
cross-shadow `for`), which stings most for checkboxes — clicking the text doesn't toggle.

**Fix:** `const value = event.target.type === 'checkbox' ? event.target.checked :
event.target.value;` Label click-through: forward a click on the custom label to
`input.focus()`/`click()` where it matters.

## F8 · Gating is decorative until P3 (LOW — documented placeholder)

`finalNavSplitHero` accepts `pageValidity` and documents `options.navigation` but reads neither;
`finalNavOneAtATime`'s `_go` advances unconditionally too. The viewer honestly documents the
placeholder ("no validation engine yet (P1): a page counts valid once visited"), and both flows
are linear (no free jumping), so nothing is *wrong* today — but the catalog's
`Navigation: Free / Gated` row is fiction until wired.

**Action:** put "wire gating + advance-denial into finalStepFlow consumers" on the P3
`expressionEngine` checklist so it isn't rediscovered in testing.

## F9 · Per-file `var()` fallbacks — §3.1 rule 5 violations (LOW)

Rule 5: children consume **bare** `var(--c-x)`; only `--c-section-*` carries consumer-side
fallbacks. Violations found:

- `finalNavSplitHero.css` 45: `padding: var(--c-space-6, 48px) …` — and the fallback (48px)
  **disagrees** with the `:host` neutral (32px). The exact drift the rule legislates against.
- `finalElementRenderer.css` (PR #37): `.field-req` uses
  `var(--c-field-required, var(--c-field-error, #ba0517))` — both tokens are always declared at
  `pageFrame :host`, so the chain is dead code waiting to mislead.

## F10 · `pages` setter resets `screenIndex` (LOW — latent until P3)

`finalNavSplitHero` (and pattern-sibling `finalNavOneAtATime`): every assignment to `pages`
rebuilds screens and resets `screenIndex = 0`. Harmless while the engine sets pages once; the
moment P3 visibility rules re-pass a pages array mid-fill, the user teleports back to question
one. Preserve the index (clamped) when the screen list shape survives the rebuild.

## F11 · `.mode-bleed { min-height: 100vh }` in LEX (LOW)

Inside Lightning Experience, `100vh` includes the Lightning chrome height → guaranteed extra page
scroll on app pages (P1 checklist #5 wants content-driven height). Consider `100dvh` on
Experience sites and a smaller/none minimum inside LEX, or drive it from the container.

## F12 · Catalog `headerBg` = multi-part background shorthand (LOW — document it)

Split/gradient/image themes store values like `url('…') center/cover no-repeat` in
`palette.headerBg`. Both consumers (`finalFormHeader`, `finalNavSplitHero`) use `background:`
shorthand so it works — but it stretches §3.1 rule 2 ("one token = one CSS value") and will break
the day anyone consumes `--c-header-bg` as `background-color`. Add one sentence to ARCH §3.2's
header row: *`--c-header-bg` may carry a full background shorthand; consumers MUST use
`background:`.*

## F13 · Static-resource URLs in published snapshots (LOW — P5 checkpoint)

`/resource/formThemeAssets/…` paths resolve in LEX but Experience Cloud serves static resources
under a site base path. Resolve-at-publish will freeze these URLs into `resolved.tokens` →
guest-side broken images. Decide at P2/P5: rewrite at publish per-audience, or serve assets from a
guest-safe CDN/CMS channel.

## F14 · Doc drift: accordion `paginates` (LOW)

ARCH §2.2's registry sketch says `accordion: { paginates: true }`; the shipped registry says
`false` with a sound rationale (panels expand in place; submitBar renders once). The code is
right — fix the ARCH sketch; FinalDesign docs are the source of truth and must not disagree with
the registry.

## F15 · `labelStyle` unimplemented (LOW)

`default | uppercase | muted` (catalog §1, spec §4) does nothing. Now that PR #37 gave us our own
label markup, this is a class-map + two CSS rules. Batch with F3.

## F16 · sectionRenderer phase-gated gaps (INFO)

Section Icon, Collapsible, Default Collapsed are catalog attributes not yet rendered; Visibility
(P3 expressionEngine) and Repeatable (P4 formRepeater) are correctly deferred. Icon is pure
render — cheap to add whenever.

## F17 · Engine robustness nits (INFO)

- An explicit `null` palette color survives the merge and emits e.g. `--c-page-bg: null` (invalid
  CSS, silently ignored → :host neutral wins). Harmless but sloppy; guard if editors ever write
  nulls.
- `mix(text, contentBg, w)` degrades to **full-strength text color** when `contentBg` is
  rgba/gradient (all glass themes) — border tints become loud. Fallback to `rgba(text, w)` would
  degrade gracefully.
- splitHero's `hexToRgba` only parses 6-digit hex — a `#fff` veil silently ignores its opacity.
- Cosmetic: ARCH §3.2 header says "40 semantic tokens"; the table enumerates 43 (40 emitted + 3
  reserved section tokens). The engine emits exactly 40 and the jest tripwire enforces it.

---

## ✅ Fixed during review

| Finding | Fix | Verified |
|---|---|---|
| Dark themes rendered hardcoded-white input boxes; native SLDS labels stayed faint grey on dark themes | PR #37 (2b05a8c): engine lifts `--c-field-bg` to `rgba(255,255,255,0.06)` when theme text is light; SLDS hooks carry ink/placeholder; custom themeable label with native `label-hidden` | jest 45/45, snapshot intact, render-verified dracula + sunsetDunes |

## What was checked and passed (don't re-litigate)

- **Engine:** single producer, pure/no-DOM, deterministic; 40-token contract enforced exactly by
  jest (append-only tripwire); section carve-out honored (bg/border/shadow never emitted); cascade
  `theme → override` with correct `undefined`-vs-`null` semantics; mesh/texture fixed-slot
  isolation (image-fit bug dead by construction, tested); full-catalog snapshot pinned;
  `ENGINE_VERSION` pinned.
- **Catalog:** data-only, zero CSS/component knowledge; managed-module hiding per §4.2; defensive
  copies (tested); `listBuiltinThemes` provably never leaks recipes (tested); 31 themes with
  scales quantized onto engine keys.
- **sectionRenderer:** preset roster matches spec enum exactly; explicit `surface` wins via inline
  style (correct precedence: preset fallback < theme token < explicit); `color-mix` self-adapting
  preset tints (kills white-card-on-dark) are the sanctioned §2.3 exception.
- **splitHero:** every catalog §2 attribute implemented (side/ratio/sticky/fullBleed default-ON,
  veil composition, logo-else-wordmark, rich-text blocks with per-block Top/Center/Bottom zones,
  progress default/horizontal/none, Pane Flow both modes on the shared `finalStepFlow` engine);
  Ctrl+Enter helper + touch hiding per UIUX #13; focus-to-screen on advance; reduced-motion
  honored; container-query narrow strip with the `width:100%` collapse guard; Submit only on the
  last screen; `pagechange` plain non-composed; registry exceptions (`ownsHeader`, `bleed`)
  encoded and jest-covered.
