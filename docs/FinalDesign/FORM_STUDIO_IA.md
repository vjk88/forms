# FORM STUDIO — Information Architecture (locked)

**Status:** LOCKED (owner, 2026-07-06). This is the IA contract for the FinalDesign app + studio.
It supersedes `docs/redesign/DESIGN_MODE_IA.md` (old build; reference only — do not extend it).

**Interactive baselines** (the mockups ARE the spec where prose is ambiguous):

| File | What it locks |
|---|---|
| `design_panel_ia_modes.html` | The studio: Build mode, Design mode, Simple/Advanced lens, top bar |
| `app_home_proposal.html` | The app: 6-tab structure, Home, Forms library, LEX chrome behavior |

`design_panel_ia_proposal.html` (5-area) and `design_panel_ia_expanded.html` (9-area standalone)
are superseded exploration — kept untracked, do not build from them.

---

## 1. The app — six tabs, one job each

| Tab | Its one job | Never on it |
|---|---|---|
| **Home** | Start or flag work: greeting, pulse stat tiles, Continue editing, Needs attention, Recently edited (3 cards) → "View all forms" | Search, the full library, charts |
| **Forms** | The library. Search + type toggle + status chips + count in ONE row directly above the grid | Analytics, greetings |
| **Responses** | Cross-form submission explorer, survey answers, export | — |
| **Analytics** | Funnels, drop-off by page, trends (survey analytics P1–P3) | — |
| **Templates** | The creation gallery as a browsable destination; org templates | — |
| **Settings** | App-level defaults only: brand kit, spam, hosting adapters (future) | Per-form settings |

**The coherence rule that produced this:** search belongs to the library; the library is not the
home page. Home carries zero search — everything on it is already curated. Analytics appears on
Home only as sentences with buttons (Needs attention), never as charts.

**In LEX these six tabs are the app's real nav items** — one flexipage each, a `FormStudio`
Lightning app. The custom in-page tab strip renders only outside LEX (`body.lex .apptabs { display:none }`
in the mockup). One IA, two chromes, zero duplication.

**Creation is gallery-first** — "+ New form" opens the curated themed-template gallery
(`finalCreationGallery`), never a blank builder or a 3-step wizard.

## 2. Hosting & routing

- **Library / app tabs**: normal LWC on flexipages inside LEX.
- **Studio**: escapes LEX chrome — VF page `showHeader="false" standardStylesheets="false"` +
  Lightning Out. ⚠️ Lightning Out is Beta: re-verify viability at packaging (2GP); the fallback is
  a LEX app page in console-style full width, same components.
- **URL contract (locked):** the builder takes its form from the URL, nothing else.
  - LEX: `c__formId` state param (custom params require the `c__` prefix), read via the
    `CurrentPageReference` wire; app-home Edit buttons navigate with that state.
  - VF full-screen: plain `?formId=` query param passed into Lightning Out.
  - **No formId → redirect to the Forms tab.** The library IS the picker; there is no in-builder
    form dropdown.
  - **Bad / deleted / no-access Id → friendly not-found state** with a link back. Never a spinner,
    never a raw Apex error.
  - Rejected alternatives, for the record: `@api recordId` (only populates on record pages),
    sessionStorage handoff (dies on new-tab/bookmark/refresh), LMS (doesn't survive navigation).

## 3. Studio top bar (App Builder grammar)

`← Exit` far left (back to Forms tab) · form name + version chip (`v2 · Draft`) · saved-state text
(`✓ All changes saved` / `Unsaved changes`) · **Build | Design** mode toggle · undo/redo · **Publish**.

The Build|Design toggle is persistent and always legible — mode is never hidden behind a back button.

## 4. Build mode — blueprint + live preview

Forced by the math: 7 layouts × 30 themes makes a WYSIWYG canvas untenable (every theme/layout
change would re-flow the editing surface). So structure and presentation are split:

- **Blueprint (center, dark, deliberately schematic):** page chips (`Page 1 · Details`, `+ Page`),
  sections with grips, field rows with skeleton value bars, drop zones. Structure only — it never
  changes when layouts/themes are added. Bar copy: "BLUEPRINT — structure only; the preview is the truth."
- **Live preview (right):** the real published render, same parser (one-parser rule — preview IS
  the runtime). Desktop/Mobile device toggle.
- **Left column = palette ⇄ properties swap.** Rail: Fields / Blocks / Logic / Autofill. Selecting
  a blueprint element swaps the palette column for that element's properties (`‹ Fields` back row);
  the preview never moves. Properties drive blueprint AND preview — one model, two projections.
- **Palette rules:** required createable fields seeded at creation render dimmed + `ADDED`;
  everything drags; rejection = native no-drop, never a toast (see `reference-formstudio-dnd`).
- **Preview-click selection sync is a P3 requirement** — clicking a field in the preview selects it
  in the blueprint (the bridge that makes the split feel like one tool).
- **Refused:** preview as a drop target; layout rendered as a page chip.
- **Empty state:** numbered steps (1. pick fields → 2. arrange → 3. design), not a blank void.

## 5. Design mode — Simple / Advanced lens

Design hides the blueprint; the settings panel + expanded preview remain. At the top of the panel:
the **Theme** and **Layout** entry cards (name + swatches), then the lens toggle.

### The lens is a lens, never a fork (locked rules)

- Simple and Advanced drive the **same values** — shared controls are mirrored live in both directions.
- Switching modes **never changes settings**. Copy says so in-panel.
- When Advanced-only controls deviate from theme defaults, Simple shows the
  **advanced-overrides chip**: "N advanced customization(s) active on this form · View" → jumps to Advanced.
- One **control registry** drives everything: canonical 9 areas, each control tagged
  `simple: true/false`. Simple is a projection, Advanced is the full render. No control exists
  outside the registry.

### Simple (~10 decisions)

LOOK (Rounder/Sharper/Airy/Dense chips) · BRAND (brand color + contrast badge, logo) ·
WORDS (title, subtitle) · FINISH (submit label, thank-you message). Footer copy points to Advanced.

### Advanced = the canonical 9 areas (locked 2026-07-06 — NOT the folded 5)

Icon rail, hairline-clustered:

| Cluster | Area | Groups (baseline) |
|---|---|---|
| Identity | **Theme** | Palette (accent, button text + badge, text, muted) |
| | **Type** | Fonts (pairing) · Scale (title size, base size) |
| | **Backdrop** | Page background (fill, image, scrim) · Atmosphere (mesh, texture, glass) |
| Structure | **Layout** | Frame (max width, density; NO breakpoint control — collapse is container-driven, locked) |
| | **Paging** | Progress (indicator, stepper placement, free vs gated navigation) |
| Surfaces | **Header** | Branding & words (style, logo, title, subtitle, highlight) · Surface (fill, banner) |
| | **Body** | Content panel (fill, shadow, rounding) · Sections (style preset, inner padding) |
| | **Fields** | Inputs (fill, focus color, error color) · Labels (position, style) |
| Finish | **Actions** | Buttons (submit label, arrangement, next/back labels) · Completion (outcome, thank-you/redirect, review page) |

Vocabulary: user-facing label is **"Backdrop"** on the rail but plain words inside
("Page background", "Atmosphere") — never token names. Surface-model vocabulary
(Page/Content/Section/Field) per `SURFACE_MODEL_SPEC.md`.

## 6. Safety semantics (apply to every group)

- **Edited state:** teal dot + "· edited" suffix on the group header the moment a control deviates
  from the theme default.
- **Reset to theme** chip per group (visible only when edited); resets that group, nothing else.
- **Theme-switch confirm gate:** switching themes with edits present shows an inline confirm —
  "Switching to *X* resets *N* edited control(s) to the new theme's defaults" — Switch / Keep my edits.
  Clean forms switch silently.
- **Hidden keeps values:** when a layout owns a concern (e.g. Split Hero owns pagination), the
  controls are **parked with a narration**, values kept — never destroyed, never silently dropped.
  Baseline narrations: Split Hero parks Paging ("progress renders in the brand pane"); Header
  surface "paints the brand pane"; Glass off ("the pane paints its own surface").

## 7. Contrast badge (corrected semantics — one truth, rendered in both lenses)

Keyed to the consumer, computed live from the actual pair (accent × button text):

| Ratio | Badge | Fix hint |
|---|---|---|
| ≥ 4.5:1 | `4.6:1 · AA ✓` (pass, green) | — |
| ≥ 3:1 | `3.7:1 · large text only` (warn, amber) | "button labels need 4.5:1. Darken the color." |
| < 3:1 | `2.1:1 · fails AA ✗` (fail, red) | "unreadable. Pick a darker color." |

Never a binary pass/fail at 3:1 — that miscalibration (from the reference mockup) marked failing
button text as "AA Pass". WCAG: 4.5:1 normal text, 3:1 only for large text (≥18px / bold ≥14px).

## 8. Home page data (dataviz contract)

Pulse stat tiles follow the stat-tile contract: label / value / optional delta / 12-point sparkline
(history in de-emphasis gray, current segment in accent, ≥8px surface-ringed end dot). Text never
wears the data color.

## 9. Open items (owner decisions pending)

1. Archived forms: greyed-in-place vs filter-only. (Mockup ships filter-chip behavior.)
2. Card sparklines vs count-only on Forms-tab cards. (Mockup ships sparklines.)
3. Gallery Theme/Skin roster coherence pass (tracked separately).
4. Lightning Out Beta re-verify at packaging (§2).

## 10. Build order hooks

- Registry + Simple/Advanced lens + 9-area panels = the P2 designPanel work.
- Preview-click selection sync = P3.
- Responses/Analytics/Templates/Settings tabs ship as stubs first ("What lives here"), filled by
  their own workstreams.
