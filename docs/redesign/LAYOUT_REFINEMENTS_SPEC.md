# Layout Refinements Spec — OneAtATime Bleed + Shared Button Arrangement

> **Status:** owner review 2026-07-05 (this session), decisions LOCKED. The *structural* parts
> are buildable now, theme-independent. The *skin* (fonts, colours, field styling) rides on the
> theme layer (P2), which is **TABLED** by owner. Companion source-of-truth:
> [ARCHITECTURE_LAYOUTS_THEMES.md](../FinalDesign/ARCHITECTURE_LAYOUTS_THEMES.md),
> [COMPONENT_CATALOG.md](../FinalDesign/COMPONENT_CATALOG.md).

Owner walked two target mockups (screenshots, not saved to disk):
`design-explorations/final-layouts/oneAtATime.html` + `.../stepper.html` were referenced but the
folder saved empty — screenshots are the source of record.

---

## 1 · OneAtATime — full-bleed conversational layout (STRUCTURAL, active)

The target is structurally a **full-bleed OneAtATime** — the 2nd consumer of the pageFrame `bleed`
mechanism (splitHero was the 1st). Three zones:

1. **Page chrome (top):** brand lockup left ("Experience Survey" = the form brand/logo), step
   counter right ("1 / 3"), then a **full-width hairline progress bar** under them — painted on the
   page, *outside* any card.
2. **A floating, centered question card** — narrower, vertically centred in the viewport.
3. **Full-bleed dark canvas** (ambient glow is theme decoration).

**Per-screen anatomy inside the card:**
- **Eyebrow:** accent dot + zero-padded index + **section label** — e.g. `● 01 · MEMORY`. Index is
  the question/section number (auto). Label = the section's label/title.
- **Headline:** the section title, large **display** font (`--c-font-display`).
- **Help:** section description, muted.
- **Body:** the section's element(s) via `layoutZones`.
- **Action row:** see §3.

**Locked decisions:**
- **Bleed = YES.** OneAtATime gets `bleed: true` in the registry + its own `mode-bleed` treatment
  (page chrome + floating centred card). Assume **default ON** (it *is* the conversational look),
  revertable toggle like splitHero (`fullBleed:false` → carded render). ⚠ owner said "yes to bleed"
  but did not explicitly pick default-on-toggle vs always — confirm before build if it matters.
- **Advance = "Continue" + plain muted "or press Return", NO key-chip.** Owner KEPT the
  signature-distance ruling; the mockup's `OK ↵` chip is **not** adopted. (Current shipped behaviour
  already correct — [finalNavOneAtATime.css:115](../../force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.css#L115).)
- **Eyebrow label = section label**; index auto (owner confirmed).

**Theme dependency (TABLED):** serif display headline, underline-only fields, dark surfaces, crimson
accent are all **appearance tokens** (`--c-font-display`, `--c-field-border`, `--c-content-bg`,
`--c-accent`). The exact mockup skin lands with a future "conversational dark" theme. The LAYOUT must
*expose* these via tokens and hardcode none (ARCHITECTURE §0). So: build the bones now, the pixels
match once themes exist.

---

## 2 · Stepper (top, gated) — three-state reskin — PARKED (styling only)

Target: green "done" / blue "active" / gray "upcoming" numbered steps, colour-coded connectors,
divider, then the page heading.

**Structure already shipped.** [finalNavStepper.js:63-84](../../force-app/main/default/lwc/finalNavStepper/finalNavStepper.js#L63)
emits `.done` / `.active` / bare (upcoming) on each step button, with `.step-marker` (number) +
`.step-label` inline. The mockup is a **CSS/theme reskin on existing hooks — not a rebuild.** Owner:
"just styling, change it later."

**Flag for skin time:** mockup uses **two hues** (green done + blue active); contract has one
`--c-accent`. Either add a "completed" colour token, or go monochrome (done = solid accent,
active = accent + ring, upcoming = gray `--c-text-weak`/`--c-field-border`). Theme-layer call —
parks with themes.

---

## 3 · Shared button arrangement (ALL paginated layouts) — BUILDABLE NOW

**Root problem (owner-reported "Submit shows at a different position than Continue"):** two renderers
draw the action row and disagree, so it *jumps* on the last screen —
- intermediate screens: OneAtATime's own row, `justify-content: space-between` → Back far-left,
  Continue far-right, Back = quiet text link
  ([finalNavOneAtATime.css:55](../../force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.css#L55));
- last screen: shared `submitBar` → Back + Submit *grouped*, aligned (default **right**), Back =
  bordered button ([finalSubmitBar.js:40](../../force-app/main/default/lwc/finalSubmitBar/finalSubmitBar.js#L40)).

So on the final step Back teleports left→right, restyles link→button, and the primary swaps
Continue→Submit. Three things move.

**Fix:** ONE action-row arrangement, identical on every screen. Only the primary's **label**
(Continue→Submit) and **intent** change. Back is one consistent **quiet text-link** style throughout.
Continue and Submit are visual twins (both plain — **drop the `↵` chip from Submit** too).

**New setting** on the submit config — `buttonArrangement` (name TBD):
- `together-left` — Back + action grouped bottom-left (owner's pick; least mouse travel)
- `together-right` — grouped bottom-right (classic primary corner)
- `split` — Back one end, action the other (today's behaviour)

**Scope = shared across ALL paginated layouts** (stepper/tabs/rail/splitHero/oneAtATime) via the
shared submitBar + each layout's advance row (owner pick). **Per-layout defaults:**
- OneAtATime → `together-left` (owner pick)
- wizard-style stepper → `split` (convention)
- others → sensible default TBD (likely `together-right`)

**Implementation notes:**
- `submitBar` already has `alignment` (left/center/right/stretch); extend to the arrangement model,
  adding `split` (Back one end, primary the other). Keep `stretch` for narrow.
- OneAtATime's intra-page advance is layout-owned (`ownsAdvance`) — it must mirror the same
  arrangement value + Back style so intermediate and final screens match. Extract shared arrangement
  classes / a tiny shared helper so there's one source of truth.
- This is the reusable-component-first path (favours the shared submitBar; kills the duplicate row).

---

## 4 · Housekeeping

- **Antigravity P2 theme code = TO BE DELETED** (owner: "I want to delete all of that code anyway").
  Uncommitted working tree: modified `finalThemeEngine` (+ tests/snapshot) & `finalThemeCatalog`;
  untracked `FinalThemeController(+Test)`, `finalThemeGallery/`, `finalThemeCard/`, `finalThemeEditor/`,
  `objects/Theme_Definition__c/`, `scratch/convertThemes.js`. **Do NOT build on it.** Deletion is
  destructive → confirm timing before removing. Also note the catalog referenced a non-existent
  `/resource/finalThemeAssets/` (real resource is `formThemeAssets`) — moot once deleted.
- Themes (P2) redone properly later must honour ARCHITECTURE §7 law 9 (opaque pickers + per-surface
  opacity → engine rgba) and §3.3 two-tier (scale keys, not raw px/shadow).

Related: [[project-multipage-shells]] · [[project-rebuild-finaldesign]] · [[reference-header-arrangement]].
