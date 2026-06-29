# Surface Model Spec — Page · Content · Section · Field

> **Status: spec / design-locked, no code yet.** Captures the decision to split the form's styling
> surfaces into a clear, named hierarchy and retire the overloaded `--c-card-*` tokens. Companion
> docs: [TOKEN_REFERENCE.md](./TOKEN_REFERENCE.md), [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md),
> [DESIGN_MODE_IA.md](./DESIGN_MODE_IA.md). Authored 2026-06-29.

## 1. The problem this fixes

One token set drives **two different surfaces at once**:

- The **content panel** (`.surface` / `<article>`) uses `--c-card-bg`, `--c-card-border`,
  `--c-radius-card`, `--c-card-shadow` (e.g. `shellStack.css:32-35`).
- Each **section** (`.sec`) uses the **same** tokens — `--c-card-bg`, `--c-card-border`,
  `--c-radius-card` (`formSectionRenderer.css:25-27`).

So "Content background" paints the outer panel **and** every section the identical color
simultaneously — the two levels collapse into one indistinguishable blob. You can't tell what you're
configuring, and you can't make them differ. On top of that, the surface has **three conflicting
names**: token `--c-card-*`, panel label "Content", DOM `.sec`/section. The system isn't rotten —
it's *unknowable*, because nothing agrees on what the thing is called.

## 2. The model — four named surfaces

```
┌─ PAGE  (bg color · image · texture · mesh · scrim) ──────┐
│  ┌─ CONTENT panel  (bg · border · shadow · radius) ────┐ │
│  │  ┌─ SECTION  (bg · border · radius) ──────────────┐ │ │
│  │  │   FIELD  (input style · radius · focus)         │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  │  ┌─ SECTION  (bg · border · radius) ──────────────┐ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

The DOM already nests this way (`<article>` wraps the sections, which wrap the fields). The work is
to give each level its **own tokens** — not to rebuild structure.

## 3. Locked design decisions

1. **Vocabulary.** Outer = **Content**, inner = **Section**. The word **"card" is deleted** —
   tokens, panel labels, comments. (DOM class renames `.surface`/`.sec` are optional/low-priority.)
2. **Per-property treatment** — add controls only where *contrast between levels* is the goal;
   share or restrain everywhere else:

   | Property | Treatment | Why |
   |---|---|---|
   | Background | **Split** → `--c-content-bg`, `--c-section-bg` | want contrast between levels |
   | Border | **Split** → `--c-content-border`, `--c-section-border` | want contrast between levels |
   | Shadow | **Content only** → `--c-content-shadow`; sections via preset; fields never | elevation lives on ONE level — stacking = muddy |
   | Radius | **Shared** → one `--c-radius` (content + sections + fields) | roundness is a single brand trait |
   | Glass (blur) | **Content only** → `--c-glass-blur` on the content panel | it's a panel-frame effect |

3. **Section background is a real color picker** (`--c-section-bg`). Default **transparent** so
   sections sit cleanly inside the content panel (no double-box). On card-less layouts it's the
   primary surface control.
4. **Presets are quick-starts, not overrides.** The section-style presets (plain / outline / subtle
   / card / boxed) **pre-fill** the bg/border controls; an explicit Section background/border color
   then **wins**. This kills the old bug where a "plain" section silently ate your chosen color.
5. **Radius retires `--c-radius-card`** — folded into the single `--c-radius`. (One fewer knob.)

## 4. Token map

| Old (overloaded) | New | Applies to |
|---|---|---|
| `--c-card-bg` | `--c-content-bg` | content panel (the `<article>`/`.surface`/`.card`/`.pane` per shell) |
| `--c-card-bg` | `--c-section-bg` | each section (`.sec` in `formSectionRenderer`) |
| `--c-card-border` | `--c-content-border` | content panel |
| `--c-card-border` | `--c-section-border` | each section |
| `--c-card-shadow` | `--c-content-shadow` | content panel only |
| `--c-radius-card` | **retire** → use `--c-radius` | content + sections + fields |
| `--c-glass-blur` | `--c-glass-blur` (unchanged) | content panel only |

**Producer:** `formThemes.js` emits the new tokens from new config keys (`contentBg`, `contentBorder`,
`contentShadow`, `sectionBg`, `sectionBorder`; `radius` and `sectionPadding` already exist). A short
compat shim may alias old saved keys (`surface`→`contentBg`, `border`/`shadow`/`radius`) during
migration so existing forms don't break.

## 5. Per-shell content-panel element (grep-verified 2026-06-29)

| Shell | Content panel → `--c-content-*` | Section → `--c-section-*` |
|---|---|---|
| Stack | `.surface` | `.sec` (shared renderer) |
| Tabbed | `.card` | `.sec` |
| Accordion | `.card` | `.sec` |
| Wizard | step card (`shellWizard.css:152`) | `.sec` |
| SideNav | content pane (`shellSideNav.css:34`) | `.sec` |
| SplitHero | `.pane` (`shellSplitHero.css:71`) | `.sec` |
| **Conversational (One at a Time)** | **none** — sections render directly in `.conv` | `.sec` **is the surface** |

**Conversational has no content panel** — by design it's a minimal, full-bleed, one-section-per-screen
layout. So the **Content** controls auto-hide there (`[*hide on One-at-a-Time]`), and the **Section**
controls are what give it shape. This is the resolution to the original "I can't configure the
surface on One at a Time" complaint.

## 6. Backward-compat / default rendering

To keep existing forms looking ~the same after the split:

- `--c-content-bg` default = today's surface fill (e.g. `#fff`) → the form still reads as a panel.
- `--c-content-border` default = today's light border. `--c-content-shadow` default = `none`
  (per-shell soft defaults preserved, e.g. paper/wizard).
- `--c-section-bg` default = **`transparent`** — **this is the one visual change**: sections that
  were filled-white-inside-a-white-panel become flush (you'll see section *dividers* instead of
  nested boxes). Carded/boxed section presets still show fills. ⚠️ **render-verify this** on a
  multi-section form before/after.
- `--c-section-border` default = light divider (or none); presets drive the rest.
- `--c-radius` unchanged (now also governs former `--c-radius-card` consumers).

## 7. Design-panel control grouping

Replaces the mislabeled single "Content/Card" group with two honest groups (slots into
[DESIGN_MODE_IA.md](./DESIGN_MODE_IA.md) Tab 5 "Fields & Frame" / a "Surfaces" area):

- **Content panel** — Background · Border (color/width/style) · Shadow (none/soft/strong) · Glass
  `[*hide on One-at-a-Time]`
- **Section** — Background · Border (color/width/style) · Style preset (quick-start) · Inner padding
- **Shared** — Corner rounding (one slider → content + sections + fields)

## 8. Phasing

1. **P1 — Engine split.** `formThemes.js`: emit `--c-content-*` + `--c-section-*` + retire
   `--c-radius-card`; add new config keys + compat aliases. Update `formThemes.test.js`.
2. **P2 — Wire consumers.** Shells' content-panel element → `--c-content-*`; `formSectionRenderer`
   `.sec` → `--c-section-*`; resolve preset-vs-color so explicit color wins.
3. **P3 — Panel UI.** Split controls into Content / Section groups, relabel, **delete "card"** from
   all labels; add Section background/border pickers; auto-hide Content controls on One-at-a-Time.
4. **P4 — Verify per layout.** Render-check all 7 shells (esp. the section-transparent default and
   One-at-a-Time). Update TOKEN_REFERENCE + COVERAGE_MATRIX.

## 9. Open items / risks

- **Section-transparent default (§6)** is the one behavior change to existing forms — needs an
  eyeball, not just jest.
- **One-at-a-Time = Section is the surface** (§5): confirm we're NOT adding a content-panel wrapper
  there (keeps it minimal by design). ← needs sign-off.
- `isolation`/stacking interactions from the in-flight background-layer fix
  ([TOKEN_REFERENCE "later 11"](./TOKEN_REFERENCE.md)) — verify sticky submit + SplitHero panel still pin.
- DOM class renames (`.surface`/`.sec`) deferred — internal only, not load-bearing for users.
