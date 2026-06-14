# Phase 3 Workplan — Theme/Skin/Layout system + the customization editor

> ## ▶ RESUME HERE — status & next steps (2026-06-13)
> **Spec is build-ready.** This plan turns `THEME_PROPERTIES_SPEC.md` into ordered,
> checkable tasks. Phase 3 = the appearance system (Theme→Skin→Accent), the shell
> consolidation, the creation-flow v2, and the post-selection **customization
> editor**. AI stays Phase 4; legacy delete stays Phase 6.
>
> **Decisions locked (this session):**
> - **Layouts:** 3 groups / **7 layouts** (Continuous: Stacked, Bento · Paginated:
>   Stepper, Side Nav, One-at-a-Time · Tabbed & Accordion). Shells **12 → ~7**.
> - **Appearance = 3 tiers:** **Theme** (7 design languages) → **Skin** (light/dark
>   + mood variant within a theme) → **Accent** (color). Mix any layout × any theme.
> - **Custom skin (brand kit):** four-lane palette (Primary/Secondary/Tertiary/
>   Neutral + OKLCH ramps) + fonts; **layers on a chosen theme** (colors+fonts only).
> - **Backgrounds = separate axis:** per-surface fill = color **or gradient** now;
>   custom-CSS backgrounds = **V2**.
> - **Header:** 4 arrangement variants + **highlight messages (array, sanitized)**.
> - **Wizard stepperMode:** vertical/horizontal/progress in ONE responsive shell.
> - **Creation:** Screen 1 two modes (template / scratch); Screen 2 = Layout+Theme+
>   Skin dropdowns + big preview. **Save-as-template removed** from gallery (tabled).
> - **Fonts (per-element) DEFERRED to the end.** formThemes = **keep & extend**.
>
> **Start with Stage A** (foundation — fully decided, needs none of the editor-panel
> ideas). Stage B is **blocked on the owner's editor-panel layout ideas**.
>
> **Still open (small):** ramp control (auto vs +manual); custom-skin storage
> (`Form_Skin__c` vs reuse); editor-panel arrangement (owner). Tracked §6.

> Carries over from PHASE1/PHASE2: tiers **[A]** core / **[B]** follow; global
> guardrails (**API v66.0**, USER_MODE/CRUD/FLS, **tokens only — no raw hex/px in
> component CSS**, **no archetype conditionals outside the registry**, guest parity).
> Legacy `c/formPlayer`/`c/formDesigner`/`c/propertyPanel` remain **do-not-modify**.
> New-era components (engine, shells, layout* modules, **c/formThemes**, formViewer,
> gallery) ARE in scope to refactor.

---

## 0. Grounding facts (verified against the code)

1. **`themeVars()` in `c/formThemes` is the single token producer** (DESIGN_TOKENS §1).
   Everything here funnels through it — the editor writes Theme Spec keys, never
   `--c-*`. No second producer may be introduced.
2. **The token layer already accepts gradient strings** (e.g. `pageBg:
   'linear-gradient(...)'`) and dark-flips via `theme.dark`. Gradients are a richer
   fill *value*, not new plumbing.
3. **The mosaic/bento grid lives in the FILL RULE** (`layoutModel.js` `mosaicPage()`)
   + shared `c/layoutZones`, **not** in a shell — so Bento = Stacked shell + MOSAIC
   fill, and merging shells loses nothing.
4. **Builder draft body = `Form_Version__c.Layout_Config__c` JSON**; section/element
   rows are publish-time only. A theme/skin/layout choice only needs valid body JSON.
5. **The engine stays dumb** (Phase 1 contract): no archetype branching outside
   `presets.js` REGISTRY + engine SHELL_LOADERS. Consolidation works *through* the
   registry (many archetypes → one shell module), not via conditionals in the engine.
6. **Images via `FormAssetController` / ContentVersion only** ([[project-config-image-storage]]);
   never raw URLs in the spec.

## 1. Architecture additions (this phase)

### 1.1 Appearance resolution chain (the 3 tiers)
```
THEMES[themeId]            design language: font, radius, shadow, sectionStyle,
   │                       inputStyle, texture, spacing philosophy
   ▼  + SKINS[themeId][skinId]   light/dark + mood (palette + surface variant)
   ▼  + accent / brand-kit palette (4 roles + ramps for a custom skin)
   ▼  + per-property overrides (the editor: §3–§7 of the spec)
themeVars()  ──►  --c-* tokens  ──►  shells + renderer consume
```

### 1.2 Token expansion (additive — DESIGN_TOKENS v2.1)
- New color-role tokens: `--c-secondary`, `--c-tertiary` (+ derived states).
- Ramp steps from each role base (OKLCH) → feed text/border/surface tokens (Neutral)
  and accents (Secondary/Tertiary). Existing single-`accent` skins keep working
  (Primary defaults from accent).
- New surface keys already specced: `--c-*-bg-image`, `--c-*-bg-opacity`,
  `--c-header-bg` (+ auto-contrast text), `--c-nav-bg`, `--c-bg-scrim`.

### 1.3 Shell consolidation map (12 → 7 components) ✅ DONE (T3.3)
8 canonical layouts (owner: **Split Hero stays its own layout**) → 7 shells.
| Shell | Layout(s) it serves | Mechanism |
|---|---|---|
| `c/shellStack` (parameterized) | `stacked`, `bento` (+ ex-classic/sfRecordPage/glass/document/console as theme+options) | chrome/header/maxWidth/submit from preset; `bento` via MOSAIC **fill** |
| `c/shellWizard` | `stepper` | **stepperMode** (T3.4) + stepper-controller |
| `c/shellSplitHero` | `splitHero` | KEPT — left panel = header panel + N brand/highlight messages |
| `c/shellSideNav` | `sideNav` | unchanged |
| `c/shellConversational` | `oneAtATime` | unchanged |
| `c/shellTabbed` | `tabbed` | unchanged |
| `c/shellAccordion` | `accordion` | unchanged |

Deleted: `shellClassic`, `shellMosaic`, `shellGlass`, `shellDocument`,
`shellSf`, `shellConsole` (folded into `c/shellStack`; looks → themes). Old
archetype ids resolve via `presets.js` `ARCHETYPE_ALIAS` (back-compat).

## 2. Frozen contracts (change requires sign-off)

### 2.1 `themeVars()` resolution
```js
// themeVars(themeId, skinId, { accent, palette, overrides }, density) -> tokenMap
// resolution order: THEMES[themeId] -> SKINS[themeId][skinId] -> palette/accent -> overrides
// back-compat: themeVars(legacySkinObject) still works one release (alias path)
```

### 2.2 `Layout_Config__c.formSettings` design block
Canonical shape = `THEME_PROPERTIES_SPEC.md §8` (`layout`, `theme{id,skin,accent,
overrides}`, `header`, `font`, `surfaces`, `spacing`, `shape`, `sections[]`,
`fields`, `actions`). Additive; unknown keys ignored; every key defaults to current
behavior.

### 2.3 Registry many-to-one
`presets.js` PRESETS maps each of the 7 layouts to a shell module; multiple layouts
may share one module. Engine SHELL_LOADERS unchanged in shape. **No engine edits
beyond the loader map.**

---

## 3. Task cards

### STAGE A — Foundation ✅ DONE & deployed (T3.1–T3.5, 128 jest green)
> Split Hero kept as its own layout (owner). Option 2 rename done: 8 canonical
> layouts / 7 shells. Creation flow v2 shipped (two modes + Layout/Theme/Skin/
> Accent). Templates carry `themeId`/`skinId`. NEXT = Stage B (blocked on owner's
> editor-panel ideas) or Stage D visual pass once the browser bridge is up.

#### T3.1 [A] Theme/Skin/Accent model in `c/formThemes`
Rename `LAYOUT_TEMPLATES → THEMES` (keep alias 1 release). Author the **7 themes**
as *structure-first* design languages; add **`SKINS`** = per-theme light/dark+mood
variants (map today's skins in). Implement the §2.1 resolution chain in `themeVars()`.
**Done when:** `themeVars(themeId, skinId, …)` emits correct tokens; legacy theme
literals still render byte-compatible; jest covers resolution order + back-compat.

#### T3.2 [A] Four-lane color roles + ramps
Add Primary/Secondary/Tertiary/Neutral model + OKLCH **ramp generator**; new
`--c-secondary`/`--c-tertiary` (+ ramp→token mapping per spec §12.1). Wire WCAG
contrast checks. **Done when:** a 4-role kit yields a consistent token set; Primary
drives accent/buttons, Neutral drives text/border/surface; DESIGN_TOKENS.md bumped
to v2.1; jest for ramp + contrast.

#### T3.3 [A] Shell consolidation 12 → ~7
Build `c/shellStack` (parameterized by chrome/header/maxWidth/submit/fill). Fold
Glass/Document/Console/Lightning/Mosaic into it via options + fill. Extract the
**stepper-controller** (shared util) used by Wizard (+ SplitHero-as-option). Update
`presets.js` (PRESETS + REGISTRY many-to-one, the 3 groups/7 layouts) + labels.
Delete/ repoint retired shells. **Done when:** all 7 layouts render through the
consolidated set; engine + formViewer untouched; jest green; (visual pass in D).

#### T3.4 [A] Wizard `stepperMode` + responsiveness
shellWizard renders `vertical`/`horizontal`/`progress`; **container query** collapses
text-heavy modes → `progress` below ~520px (spec §5.1). Apply §9.8 container-responsive
adaptations to all layouts. **Done when:** all 3 modes render; fallback verified at
narrow container widths; no layout overflows/clips at any width.

#### T3.5 [A] Creation flow v2 (`c/formCreationGallery`)
Screen 1 → **two entry modes** (template / scratch). Screen 2 → **Layout + Theme +
Skin** dropdowns + big live preview; wire to the new model; **remove "Save as my
template."** Keep the lazy-preview perf. **Done when:** both modes work; dropdowns
re-theme the preview live; created form carries layout+theme+skin in Layout_Config;
gallery jest updated.

### STAGE B — Customization editor (BLOCKED on owner's panel-layout ideas)

#### T3.6 [A] Editor host + panel framework
The separate-panels surface (owner has arrangement ideas — see §6). Reads/writes the
§8 design block; live-previews via the engine. **Done when:** panels mount, edits
round-trip to Layout_Config and re-render the preview.

#### T3.7 [B] Header panel editor
Variants (inline/stacked/logoBeside/textOnly) + logo/title/subtitle + **highlight
messages** (array; sanitized-HTML mini editor; tone/icon/placement/dismissible).
Spec §4.

#### T3.8 [B] Surfaces panel
Per-surface **fill** = color **or gradient builder**; **image upload**
(FormAssetController) + fit/position; per-surface **opacity**; auto-scrim/contrast.
Spec §3.2.

#### T3.9 [B] Spacing/Padding + Shape panel
Density; header/section/field/content **padding**; gaps; max-width; radius/shadow/
section-style/input-style/texture. Spec §3.4–§3.5.

#### T3.10 [B] Section & field overrides
Per-section icon/header-bg/padding/columns/collapsible; per-field label position/
style/input style/span/help. Spec §6.

#### T3.11 [B] Actions panel
Submit label/placement/alignment/color; back/cancel labels. Spec §7.

### STAGE C — Custom skin / Brand kit

#### T3.12 [B] Brand-kit editor (the "Versatile Form Architect")
Four-lane palette + editable ramps + 3 font roles + button style + **live FORM-control
preview**. Produces a custom skin (layers on the chosen theme). Spec §12.

#### T3.13 [A] Custom-skin storage + Skin-dropdown integration
`Form_Skin__c` (Definition blob) **or** reuse the template store [OPEN §6]; "＋ New
custom skin…" + saved skins in the Skin dropdown; reusable across forms.

### STAGE D — Deferred / last

- **T3.14 [B] Per-role typography** (fonts) — spec §3.3. Owner-deferred to the end.
- **T3.15 [B] V2 custom-CSS backgrounds** — raw CSS background *value* → `--c-*-bg`
  token, sanitized. Spec §3.2 🔭.
- **T3.16 [B] Custom templates** (design presets) — un-table §11; form-level "save as
  template" action (NOT in the gallery).
- **T3.17 [A] Visual-verification pass** — once Edge/`/chrome` bridged: screenshot the
  7 layouts × representative themes/skins + the editor; re-run impeccable audit.

---

## 4. Gates (per task, before "done")
- **Lint** clean (eslint; no raw hex/px in component CSS).
- **Jest** green (resolution chain, ramps, contrast, gallery, stepper).
- **Deploy** to `revcloud@dev.com` succeeds (0 component errors).
- **Contrast** WCAG 4.5:1 / 3:1 large on every color/surface combo touched.
- **Responsive** no overflow/clip at any container width (§9.8).
- **Guest parity** every property renders identically on the public surface.
- **Back-compat** existing forms (legacy theme literals) render unchanged.

## 5. Dependencies
- B, C depend on **A** (the model + consolidated shells).
- **B is blocked** on the owner's editor-panel arrangement ideas (T3.6).
- D is last; T3.17 also gated on the Edge browser bridge.
- Apex tests: owner-deferred policy continues (tracked, not a gate here).

## 6. Open decisions tracker
| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | Editor-panel arrangement (separate panels — owner's ideas) | owner | Stage B start |
| 2 | Ramps: auto-only vs auto + per-step manual | owner | T3.2 / T3.12 |
| 3 | Custom-skin storage: `Form_Skin__c` vs reuse template store | owner | T3.13 |
| 4 | formThemes keep & extend — assumed yes; confirm | owner | T3.1 (assumed) |
| 5 | Fuller brand-kit color model (next-iteration detail) | owner | T3.12 polish |
