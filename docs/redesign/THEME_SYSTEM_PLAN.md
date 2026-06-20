# Theme System — Import 30 Themes + Theme Picker + Custom Theme Editor

Plan for three stacked asks, built on **one shared engine extension** so they
compound instead of duplicating. Decided 2026-06-21.

- **30 themes** from `theme-comparison.html` → `c/formThemes`. Fonts use the SF
  default family (skipped for v1). Background images become **Static Resources**
  (NOT external URLs).
- **Theme picker** = a dedicated screen AFTER layout selection in `formCreationGallery`.
- **Advanced custom-theme editor** in FormStudio Design mode — **Option A (per-form
  styling)**: swatch colors, border radius, header arrangement, highlight, logo.

Builds on the **decoupled Layout × Theme** model ([[project-form-themes]]) and the
existing `resolveTheme(themeId, skinId, { accent, palette, overrides })` **overrides
lane**. Related: [[project-creation-gallery-first]], [[project-gallery-themes-coherence]]
(coherence prune still parked — we ship all 30 now per owner).

---

## Phase 0 — Engine override extension (the shared foundation) ✅ DONE (2026-06-22)
`c/formThemes` (`resolveTheme` / `buildTokenString` + skin/theme schema).

**Built:** `radiusToken()` now passes through a raw CSS length (`/^-?[\d.]/`) so a
theme/editor can set radius directly; semantic enums still map. `buildTokenString`
appends a **raw override lane** at the very end of `parts` (after `_roleTokens`, so CSS
last-declaration wins): emits `--c-text`←`text`, `--c-text-weak`+`--c-text-meta`←
`textMuted`, `--c-border`←`border`, `--c-border-light`←`borderLight`, `--c-header-text`←
`headerText`, `--c-header-text-weak`←`headerTextMuted`, `--c-card-shadow`←`shadow` —
each only when present. `surface`/`pageBg`/`headerBg`/`radius` already preferred raw
earlier in `parts`. Rides the existing `opts.overrides` lane (merged via `Object.assign`).
Jest precedence (raw > palette > dark/structure) added; 40/40 pass; deployed.

The 30 themes are **raw** (explicit hex, raw px radius, raw shadows) and the custom
editor emits **raw** values too — both need `resolveTheme` to accept raw overrides
and prefer them over the derived palette / semantic structure.

- Let a skin/theme/override object carry optional RAW keys: `surface`, `pageBg`,
  `text`, `textMuted`, `border`, `borderLight`, `radius` (px), `shadow`, `headerBg`,
  `headerText`, `headerTextMuted`, `glass`.
- `buildTokenString` prefers a present raw value over the derived (`--c-text` ramp) /
  semantic (`RADII`/`SHADOWS`) default. Ride the existing `overrides` lane (overrides
  already apply after `applyPalette`).
- Jest: precedence (raw > palette > structure default).

Serves Phase 1 (raw themes) AND Phase 3 (raw editor) — do once. **~half-day.**

## Phase 1 — Import the 30 themes ✅ DONE (2026-06-22, images deferred)
`c/formThemes` (`THEMES`, `SKINS`, `THEME_OPTIONS`) + a new `StaticResource`.

**Roster decision (owner): ADD → 37 total.** Kept the 7 structural themes; appended
the 30 imports. `cloud`/`light` stays the default; existing forms unaffected; picker
shows all 37; coherence prune still parked ([[project-gallery-themes-coherence]]).

**Data-model evolution (NOT a bandaid — reused the Theme→Skin model):**
- The 30 are FLAT presets → each is one `THEMES[id]` (structure: font/radius/cardShadow/
  glass) + one `SKINS[id]` skin carrying explicit colors. `nordic.hasDark` → 2 skins.
- **One key per visual property, enum-OR-raw.** `radiusToken` + new `shadowToken` accept
  a semantic enum (`round`/`soft`) OR a raw value (`8px`/`0 4px ...`). No parallel
  `shadow`-vs-`cardShadow` keys.
- **One explicit-override layer** at the end of `buildTokenString` (last-wins): `text`,
  `textMuted`→weak+meta, `accentText`→`--c-on-accent`, `borderColor`→`--c-border`
  (+`borderLight`→`--c-border-light`, defaulting to borderColor), `cardBorder`,
  `headerText`, `headerTextMuted`. Replaced the old gated `if(borderColor && !dark)`
  block (output preserved for the 7; regression test green). `surface`/`pageBg`/`headerBg`
  already enum-or-raw upstream.
- **Fonts** flattened to `salesforce` (SF default) per owner — loses mono/serif character
  (terminal/vintage/marble); fast-follow candidate.
- 45/45 jest green; deployed.

### Deferred bg-image asset manifest (Phase 1.5 — wire to Static Resource)
`bgimage` themes currently use a **palette gradient/solid** for pageBg/headerBg. To
restore the photos: bundle these (license-checked) into StaticResource `formThemeAssets`
and re-point the noted skin key to `url('/resource/formThemeAssets/<file>')`. 11 unique
images (Unsplash photo IDs):

| image (photo id) | used by → key |
|---|---|
| 1533090161767-e6ffed986c88 (marble) | marbleSplit→headerBg, marbleLuxury→pageBg |
| 1504639725590-34d0984388bd (tech/network) | cyberSplit→headerBg, carbonMatrix→pageBg |
| 1509316975850-ff9c5deb0cd9 (desert/clay) | claySplit→headerBg, desertOasis→pageBg |
| 1448375240586-882707db888b (forest mist) | botanicalSplit→headerBg, forestMist→pageBg |
| 1618005182384-a83a8bd57fbe (sunset liquid) | sunsetDunes→pageBg |
| 1600585154340-be6161a56a0c (wood) | marbleLuxury→headerBg |
| 1507525428034-b723cf961d3e (ocean) | oceanBreeze→pageBg |
| 1464802686167-b939a6910659 (nebula) | cosmicVortex→pageBg |
| 1586075010923-2dd4570fb338 (paper) | vintagePaper→pageBg |
| 1483168527879-c66136b56105 (aurora) | auroraBorealis→pageBg |
| 1518531933037-91b2f5f229cc (silk pink) | silkLuxury→pageBg |

### Original (untouched) Phase 1 spec
`c/formThemes` (`THEMES`, `SKINS`, `THEME_OPTIONS`) + a new `StaticResource`.

- **Static Resource `formThemeAssets`** (ZIP) holding the ~12–16 unique theme images
  (the Unsplash sources, downloaded + license-checked). Themes reference them as
  `url('/resource/formThemeAssets/<file>.jpg')` — guest-safe, packageable, no external
  site. (Enumerate the exact image set from `theme-comparison.html` during build.)
- **Transcribe all 30** → one `THEMES[id]` entry each + a default `SKINS[id]` skin
  using the Phase-0 raw keys (colors/radius/shadow/glass/headerBg). `hasDark:true`
  (Nordic) gets a second dark skin. **Fonts → the default SF family** for every theme.
- **Drop the baked layout** (their `mintStepper`/`marbleSplit` couple a layout): we
  import the *visual theme only*; layout is chosen separately. Theme applies on ANY
  layout — colors/radius always carry; `headerBg` images only render on layouts with a
  brand panel/rail (SplitHero, SideNav).
- `THEME_OPTIONS` lists all 30 for the picker.
- Verify each renders in the gallery preview (light + the dark variant). **~1 day.**

> ⛔ **UI GATE (owner, 2026-06-22):** the *current* **FormStudio Design-panel** theme
> UI/UX (theme/skin chips + accent) is considered trash and will be **redesigned** —
> discussion pending. This gates **Phase 3 ONLY** (the in-Studio custom editor).
> **Phase 2 (the creation-gallery theme step) is APPROVED and proceeding** — it's a
> different surface. The engine (Phase 0/1) is UI-agnostic, so any redesign only
> changes *how* `themeId/skinId/accent/customTheme` get chosen, not the save contract.

## Phase 2 — Theme picker screen (after layout)  ✅ DONE (2026-06-22)
`c/formCreationGallery` (+ html/css), `c/formThemes` exports.

**Built:** new **theme step** in the creation flow — scratch path is now
**layout → theme → details** (template path unchanged: keeps its bound theme,
straight to details). The step is a grid of **all 37** cards rendered by a new
**`c/formThemeCard`** component — each renders a polished MOCK FORM (header/banner,
labeled inputs, checkbox, submit, swatches) styled by the **real engine token
string** (`themeVars(themeId, skinId, {accent})` set inline; mock reads `var(--c-*)`),
modeled on the elegant `theme-comparison.html` cards. Pure CSS, so no live form engine
per card (no lazy-mount needed). **Filter pills** (All / Minimalist / Creative /
Editorial / Stepped / Split / Dark / Image) from theme `tags`. Picking a card emits
`select{themeId}` → sets `chosenThemeId` + its `defaultSkin` → details. On the details screen the
old Theme **dropdown** became a **"{theme} · Change"** chip that reopens the step; Skin
combobox now shows only when the theme has >1 skin; Back from details returns to the
step (scratch) or gallery (template). New engine exports: `THEME_CATALOG` (id/label/
tags/defaultSkin) + `THEME_FILTERS`; tagged the 7 structural themes. Selection still
flows to create via `studioMetaFor` + `formSettings.theme` (unchanged contract).
Deployed; formThemes 45/45 jest green (gallery has no suite).

### Original (untouched) Phase 2 spec

- Restructure the "Start from scratch" path into **layout → theme → details**.
- New theme step = a grid of 30 cards. Reuse the gallery's existing **lazy-mount
  live-preview** machinery (IntersectionObserver) so each card previews the theme on
  the chosen layout. Optional filter pills (minimalist / creative / editorial / stepped
  / split / bg-image) from the themes' `tags`.
- Selection → `chosenThemeId`/`chosenSkinId` → already flows to create via
  `studioMeta` + `serializeForm`. Template path keeps its template-bound theme.
  **~1 day.**

## Phase 3 — Advanced custom-theme editor (Design mode, per-form / Option A)
`c/formStudio` (Design panel + state + `skin` getter) — no Apex.

- New **"Advanced / Customize"** section in Design mode:
  - **Swatch color pickers**: accent, surface, pageBg, text, textMuted, border.
  - **Border radius** control (slider/number).
  - **Group the existing controls**: Header Arrangement, Highlight Message, Logo
    (upload exists; optional built-in emblem picker is a small add-on).
- **State**: `studioMeta.customTheme = { accent, surface, pageBg, text, textMuted,
  border, radius }` (per-form). Overrides LAYER on the selected theme/skin — editing a
  swatch overrides that one token, the rest of the theme stays.
- **Wire**: `formStudio.skin` getter passes `customTheme` as `overrides` to
  `resolveTheme` (Phase-0 lane) → `serializeForm` already emits `formSettings.theme =
  this.skin` → runtime + preview pick it up. `_restoreStudioMeta` restores
  `customTheme` (reset-then-overlay, like the rest).
- v1 = per-form only. **Saving a reusable named theme = Option B, deferred.**
  **~1–1.5 days.**

## Phase 4 — Tests + polish
- Jest: `resolveTheme` override precedence; the custom-editor wiring.
- Static-resource guest URL check (Experience/community path prefix).

---

## Watch-outs
- **Static-resource images**: confirm guest/Experience URL prefix resolves; verify
  image licenses before bundling.
- **Theme × any layout**: `headerBg` images only show on brand-panel/rail layouts; on
  Stacked etc. a "split" theme is just its palette (fine, by design).
- **30 themes amplifies coherence** — shipping all per owner; prune later
  ([[project-gallery-themes-coherence]]).
- **Per-form custom overrides** live in `studioMeta.customTheme`; not reusable across
  forms in v1.

## Sequence
Phase 0 → 1 → 2 → 3 → 4. Phase 0 is the keystone (both 1 and 3 ride it). ~3.5–4 days total.
