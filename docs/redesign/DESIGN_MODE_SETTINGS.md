# FormStudio — Design Mode Settings Catalog

The full surface of what a user *could* configure in Design mode — current + what the
engine already supports + net-new. Feeds the on-hold Design-mode UI redesign.

**Legend:** ✅ exposed today · 🟡 engine-ready (token/spec exists, needs a control) ·
🔵 needs new engine/runtime/Apex work.

**Storage contract (where each lands in the body JSON):**
- `studioMeta` — editor design state (layout, themeId, skinId, accent, spacing, header,
  buttons, after, customTheme). Runtime ignores it; it reloads the panels.
- `formSettings.theme` — the *resolved* token object (`resolveTheme(...) + overrides`).
- `Layout_Spec__c` — the structural spec (`shell`, `density`, pages/zones).

---

## BLUEPRINT — build to `design-settings.html` (validated 2026-06-22)
The owner's `design-settings.html` mockup implements this whole catalog as a working
**4-pillar tabbed panel** and is the agreed build blueprint for the Design-mode redesign:
- **Pillar 1 · Canvas & Frame** → groups A (layout/structure) + E (shape & depth) +
  page/card bg colors.
- **Pillar 2 · Brand & Identity** → group H (header/branding) + B (brand panel).
- **Pillar 3 · Typography & Fields** → groups F (type & inputs) + G (surface FX) +
  border colors.
- **Pillar 4 · Interaction & Flow** → accent palette (D colors) + I (buttons/nav) +
  J (completion).

**Adopt these 3 UX patterns from the mockup:**
1. **Contextual reveal** — stepper-only controls show only for Wizard; split-rail
   controls only for Split-Hero; Next/Back labels only when multi-page. Cuts overwhelm.
2. **Tabbed pillars** instead of one flat panel.
3. **Quick presets** in the preview header (one-click theme apply).

The vast majority of the panel's controls are 🟡 (engine already supports them) — that's
why the mockup "just works." See "Net-new" below for the few exceptions.

---

## A. Layout & Structure  (→ Layout_Spec__c `shell` + `density`)
| Setting | Control | What it does | Status |
|---|---|---|---|
| Layout | gallery/cards | The archetype (Stacked, Wizard, Tabbed, Accordion, One-at-a-time, Split-Hero, Side-Nav) | ✅ |
| Density | toggle | comfortable / compact spacing scale | ✅ (spacing) |
| Max width | segmented | narrow / medium / wide / full content width | 🟡 |
| Chrome | segmented | card / fullbleed / paper page frame | 🟡 |
| Section style | select | Default section look: card / subtle / plain / boxed | 🟡 |
| Section padding | slider | none / small / medium / large interior padding | 🟡 |
| Stepper placement | toggle | top vs rail (wizard) | 🟡 |
| Stepper mode | select | vertical / horizontal / progress | 🟡 |
| Progress indicator | select | auto / bar / dots / fraction / none | 🟡 |
| Responsive collapse | select | collapse breakpoint (480/768/1024) + order (source/mainFirst) | 🟡 |

## B. Brand Panel  (split-hero / side-nav layouts only → `shell.brandPanel`)
| Setting | Control | What it does | Status |
|---|---|---|---|
| Side | toggle | left / right / top | 🟡 |
| Width | slider | 25%–50% of the form | 🟡 |
| Content | multiselect | what shows in the panel: logo / title / description / progress / image / props / quote | 🟡 |
| Sticky | toggle | panel stays on scroll | 🟡 |

## C. Theme — preset selection  (→ studioMeta + formSettings.theme)
| Setting | Control | What it does | Status |
|---|---|---|---|
| Theme | card picker | One of 37 themes (7 structural + 30 presets) | ✅ |
| Skin | chips | Mood variant (light/dark/etc.) for themes with >1 | ✅ |
| Accent | swatch + picker | The single brand-color knob over any theme | ✅ |

## D. Custom Theme — Colors  (Phase 3 editor → studioMeta.customTheme, via the Phase-0 override lane — engine DONE)
| Setting | Token | Status |
|---|---|---|
| Accent | `--c-accent` | 🟡 |
| Accent text (on-accent) | `--c-on-accent` | 🟡 |
| Surface (card bg) | `--c-card-bg` | 🟡 |
| Page background (color/gradient/image) | `--c-page-bg` | 🟡 |
| Text | `--c-text` | 🟡 |
| Muted text | `--c-text-weak` / `--c-text-meta` | 🟡 |
| Border color | `--c-border` | 🟡 |
| Border light | `--c-border-light` | 🟡 |
| Header background (also the split-hero/rail bg) | `--c-header-bg` | 🟡 |
| Header text / muted | `--c-header-text` / `--c-header-text-weak` | 🟡 |

## E. Custom Theme — Shape & Depth
| Setting | Token | Status |
|---|---|---|
| Corner radius (enum or raw px) | `--c-radius` / `--c-radius-card` | 🟡 |
| Card shadow / elevation (enum or raw) | `--c-card-shadow` | 🟡 |
| Card border (width + style) | `--c-card-border` | 🟡 |
| Glass / frosted cards | `--c-glass-blur` (`glass`) | 🟡 |

## F. Custom Theme — Type & Inputs  (spec v2 tokens)
| Setting | Token | Status |
|---|---|---|
| Font pairing | `--c-font-body` / `--c-font-display` | 🔵 (flattened to SF default per owner; expose later) |
| Input style | `--c-input-*` (outline / underline / filled) | 🟡 |
| Label style | `--c-label-*` (default / mono-caps / muted-sm) | 🟡 |
| Label position | `--c-label-col` (top / left) | 🟡 |
| Control scale (touch sizing) | `--c-control-h` (1–1.5) | 🟡 |

## G. Custom Theme — Surface FX
| Setting | Token | Status |
|---|---|---|
| Texture | `--c-texture` (none / grain / grid) | 🟡 |
| Background effect | `--c-mesh-*` (animated mesh + hues) | 🟡 |
| Panel decor | `--c-panel-decor-color` (frame) | 🟡 |

## H. Header & Branding  (→ studioMeta.header)
| Setting | Control | What it does | Status |
|---|---|---|---|
| Title | text | Form title | ✅ |
| Description | text | Subtitle | ✅ |
| Logo (upload) | file → ContentVersion | Brand logo image | ✅ |
| Logo emblem (built-in) | picker | Pick a generated emblem (triangle/shield/globe/leaf/…); generator already exists in c/formThemeCard | 🟡 |
| Arrangement | segmented | stacked / inline / logoBeside / textOnly | ✅ |
| Highlight banner | text | Accent-tinted callout ("Closes Friday!") | ✅ |
| Header style | select | standard / hero / minimal / none | 🟡 |

## I. Buttons & Navigation  (→ studioMeta.buttons + shell.submit)
| Setting | Control | Status |
|---|---|---|
| Submit label | text | ✅ |
| Next / Back labels | text | ✅ |
| Button alignment | segmented (left/center/right/stretch) | ✅ |
| Submit placement | select (flow / stickyBottom / brandPanel) | 🟡 |

## J. Completion / After-submit  (→ studioMeta.after + formSettings)
| Setting | Control | Status |
|---|---|---|
| After action | toggle (message / redirect) | ✅ |
| Thank-you message | text | ✅ |
| Redirect URL | text | ✅ |
| Completion preview (whole-form review + thank-you-on-submit) | — | 🔵 (see project-completion-preview-phase2) |

---

## Net-new — the only things NOT already engine-supported
Everything else in the mockup is 🟡 (token/spec exists). These four need real work:
| Item | Status | Notes |
|---|---|---|
| **Font pairing picker** | 🔵 | Reverses the "SF-default fonts for v1" call. Pairings already exist in `FONT_PAIRINGS`; needs the owner's go-ahead to expose + reintroduce per-theme fonts. |
| **Card border style** (solid/dashed/dotted/double/none) | 🔵 | We modeled `cardBorder` as width+color+solid only; needs the style enum folded into the `--c-card-border` shorthand. |
| **Live contrast checker** (AA pass/fail badge) | 🔵 (half) | `formThemes` already exports `contrastRatio()` + `validatePalette()`; needs the badge UI + live recompute on accent/text/bg change. |
| **Quick presets** in preview + **contextual reveal** + **tabbed pillars** | 🔵 | UX structure, not engine — part of the Design-mode panel rebuild. |

## Boundary — lives in BUILD mode, not Design
Fields & sections, field properties, **visibility rules**, **autofill rules**, related
lists/repeaters, page structure, object binding. Design mode = *presentation*; Build mode
= *structure & data*.

## Notes
- Everything marked 🟡 is buildable now — the token/spec plumbing exists; it only needs a
  control wired to `studioMeta.customTheme` (Phase-0 override lane) or to a `setShell`/
  `setDensity` spec op.
- The custom-theme editor (D–G) is **Phase 3**, gated on the Design-mode UX redesign.
- Per-form only in v1; saved reusable named themes = Option B (deferred).
