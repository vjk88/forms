# Design Tokens v2.1

> Phase 0 deliverable. Extends the existing `--c-*` token system (defined on
> `formDesigner` / `formPlayer` `:host`, emitted by `themeVars()` in
> `c/formThemes`) to cover the redesign: density, the six new Theme Spec keys
> from the explorations audit, motion, and the engine's structural tokens.
> Rule of law unchanged: **components consume tokens; only `themeVars()`
> writes them; AI only ever sets Theme Spec keys, never tokens.**

---

## 1. Architecture — three layers

```
Theme Spec (JSON skin)      what designers/AI choose:  accent, font, radius,
        │                   inputStyle, texture, …  (validated, allowlisted)
        ▼
themeVars() in c/formThemes  the ONLY producer: maps spec keys → CSS custom
        │                   properties on the form root
        ▼
--c-* tokens                what every component consumes; no raw hex/px in
                            component CSS (lint-enforced, existing rule)
```

- Derived values (hover shades, soft tints, scrims) are computed in
  `themeVars()`/CSS `color-mix()` — a skin never stores them, so one accent
  drives a consistent ramp.
- The engine adds **structural tokens** (grid gap, zone padding) so archetype
  CSS is also skin-agnostic.
- Token *names* are part of the contract: renames are breaking; additions are
  not. The validator's allowlist (LAYOUT_SPEC §6) and this doc must stay in
  sync — single source: `tokens.js` exported from `c/formThemes`, from which
  the Apex allowlist is generated at build time.

## 2. Existing tokens (v1 — unchanged, for reference)

Color/chrome: `--c-accent` `--c-brand` `--c-brand-dark` `--c-submit-bg`
`--c-back-color` `--c-card-bg` `--c-card-border` `--c-card-shadow`
`--c-page-bg` `--c-section-header-bg`
Text (dark-flippable): `--c-text` `--c-text-weak` `--c-text-meta` `--c-label`
`--c-border` `--c-border-light` `--c-surface-sunken` `--c-surface-alt`
Shape/space: `--c-radius` `--c-radius-card` `--c-section-padding`
Type: `--c-font-body` `--c-font-display`
Misc: `--c-section-style` `--c-header-style`

## 2.1 v2.1 additions — Theme→Skin→Accent + four-lane palette (Phase 3 T3.1/T3.2)

The `themeVars()` producer now takes **two call signatures** (dispatch by the
first arg's type) — additive, the legacy object path is byte-identical:

```js
themeVars(themeId, skinId, { accent, palette, overrides }, density)  // v2
themeVars(skinObject, density)                                       // legacy
```

Resolution chain (the only producer rule is intact):
`THEMES[themeId].structure → SKINS[themeId][skinId] → { accent, palette, overrides }`
merge into one flat skin object → the same token producer.

- **`THEMES`** (7) carry *structural* keys (font/radius/shadow/section/input/
  label/texture/scale). **`SKINS[themeId][skinId]`** carry the *mood* (color/
  surface/dark/mesh). Helpers: `THEME_OPTIONS`, `skinsForTheme(id)`,
  `resolveTheme(themeId, skinId, opts)`.
- **Four-lane palette** (custom skin / brand kit, §12.1) — new role tokens,
  emitted only when a `palette` is supplied (preset skins unaffected):
  - Secondary: `--c-secondary` `--c-secondary-weak` `--c-secondary-faint`
  - Tertiary: `--c-tertiary` `--c-tertiary-weak` `--c-tertiary-faint`
  - Primary seeds `--c-accent`/`--c-submit-bg`/`--c-back-color` + `--c-brand-dark`.
  - Neutral seeds `--c-text*`/`--c-label`/`--c-border*`/`--c-surface*` + the
    DEFAULT `--c-page-bg`/`--c-card-bg` (any §3.2 surface override still wins).
- **Color engine** (self-contained, no deps): `colorRamp(hex)` → 10-step OKLCH
  ramp; `contrastRatio(a,b)`; `validatePalette(palette)` → WCAG warn-and-suggest.
  Ramps walk OKLCH lightness, easing chroma at the extremes to stay in gamut.

Dark flip: `theme.dark: true` swaps the text/border/surface group (already in
`themeVars()`); v2 keeps this mechanism and routes all new text-adjacent
tokens through it.

**v2 is a strict superset of v1.** Every v1 token keeps its name and meaning;
v2 only *adds* tokens (plus one derivation change: `--c-section-padding` now
derives from the spacing scale, with the old key kept as an alias for one
release). During the incremental rollout, legacy components and the new
engine read from the same `:host` token set — nothing renders unstyled
because there is only one vocabulary.

## 3. New tokens (v2)

### 3.1 Density & scale

| Token | Source spec key | Values |
|---|---|---|
| `--c-space-1…5` | `density` | comfortable: 4/8/12/16/24px · compact: 2/6/8/12/16px |
| `--c-control-h` | `density` × `controlScale` | base 40px (compact 32px) × scale 1–1.5 |
| `--c-control-font` | `controlScale` | 1rem × scale |
| `--c-tap-min` | `controlScale` | 44px × scale (a11y floor never below 24px pointer / 44px touch) |
| `--c-q-scale` | archetype (conversational/kiosk) | display-type multiplier, default 1, conversational 1.6 |

`--c-section-padding` becomes derived from `--c-space-*` (back-compat alias
kept one release).

### 3.2 Inputs & labels

| Token | Source | Notes |
|---|---|---|
| `--c-input-border` | `inputStyle` | outline: 1.5px solid border · underline: 0 0 1.5px bottom · filled: 0 |
| `--c-input-bg` | `inputStyle` | outline: surface · underline: transparent · filled: `--c-surface-sunken` |
| `--c-input-radius` | `inputStyle` | underline forces 0; else `--c-radius` |
| `--c-input-font` | `inputStyle` | underline may map to `--c-font-display` (mock 01) via skin flag `inputDisplayFont` |
| `--c-label-transform` / `--c-label-font` / `--c-label-size` | `labelStyle` | default · `mono-caps` (mock 03) · `muted-sm` (mock 05) |
| `--c-label-col` | `labelPosition: left` | label column width, default 160px |

### 3.3 Surfaces & effects

| Token | Source | Notes |
|---|---|---|
| `--c-texture` | `texture` | `none` · grain/grid as data-URI `background-image` layers (fixed assets, not skin-supplied — AI can pick, not inject) |
| `--c-bg-scrim` | glass/fullbleed | overlay between page bg and card, default `rgba(0,0,0,.18)` on `dark` |
| `--c-glass-blur` | glass | 26px desktop, 12px below breakpoint (perf) |
| `--c-panel-decor-color` | `panelDecor: frame` | hairline frame tint, defaults `color-mix(accent 28%, transparent)` |
| `--c-title-fill` | `titleStyle` | solid: `--c-text` · gradient: accent-stop gradient (clip-text with solid fallback) |
| `--c-mesh-1…4` | `bgEffect: mesh` + `meshHues` | blob hues; animation params are **fixed constants**, not tokens (AI can't set motion) |

### 3.4 Engine structural tokens (archetype CSS consumes these)

| Token | Default | Notes |
|---|---|---|
| `--c-grid-gap` | `--c-space-4` | zone/column gutters |
| `--c-zone-pad` | `--c-space-3` | inner zone padding |
| `--c-rail-w` | 240px | sidenav / wizard rail width |
| `--c-summary-w` | 280px | sticky summary zone min width |
| `--c-maxw` | per `shell.maxWidth` | 640/820/1080px/none |
| `--c-stickybar-h` | 64px | sticky submit/save bar |

### 3.5 Motion & focus

| Token | Default | Notes |
|---|---|---|
| `--c-ease` | `cubic-bezier(.2,.8,.2,1)` | the explorations' shared easing |
| `--c-dur-1/2/3` | 150/250/600ms | micro / transition / entrance |
| `--c-focus-ring` | `0 0 0 3px color-mix(in srgb, var(--c-accent) 25%, transparent)` | all interactive elements; never removed, only re-colored |

All motion wrapped in `@media (prefers-reduced-motion: reduce)` kill switch at
the engine root (durations → 0, mesh → static gradient).

## 4. Guardrails

- **WCAG floor:** validator checks `--c-text`/`--c-card-bg`,
  `--c-label`/input bg, submit text/`--c-submit-bg` ≥ 4.5:1 (3:1 for display
  titles ≥ 24px). Auto-correct-with-note behavior per COPILOT_PANEL §6.
- **No skin-supplied URLs/images in tokens** — textures and mesh are
  app-shipped assets selected by enum; logo/bg images flow through
  FormAssetController only.
- **No motion authority for AI** — durations/easings are constants.
- Lint (existing + extended): component CSS may not contain hex colors, px
  spacing in the spacing scale's domain, or `transition:` without a token.

## 5. Webfont pairings (static resources)

New `FONT_PAIRINGS` entries shipped as static resources (OFL verification on
the Phase 1 checklist), keeping the current system-stack entries as fallbacks:

| Pairing | Display / Body | Source mock |
|---|---|---|
| `editorial-warm` | Fraunces / Hanken Grotesk | 01 |
| `luxe-serif` | DM Serif Display / Hanken Grotesk | 02 |
| `industrial` | Archivo / + Space Mono label face | 03 |
| `neon` | Unbounded / Manrope | 04 |
| `plex` | IBM Plex Sans / + Plex Mono label face | 05 |

Adds an optional third slot to a pairing: `label` face (mono micro-labels in
03/05) → feeds `--c-label-font`. Guest surfaces load fonts via the same
static-resource URLs (verify guest-profile access in Phase 6).

## 6. Migration notes

- v1 skins (color-only or 5-layout themes) hit `themeVars()` exactly as
  today — every new key defaults to current behavior (`inputStyle: outline`,
  `texture: none`, etc.). Zero visual change without opt-in.
- `propertyPanel`'s theme controls migrate to read/write Theme Spec keys via
  the shared `c/skinPicker` (CREATION_WIZARD §10) in Phase 3.
