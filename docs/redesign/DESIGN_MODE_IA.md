# Design-Mode Settings — proposed information architecture

> **Status: proposal / outline only. No code written.** This is the "full picture" to react to
> before we rebuild the panel. It re-homes every existing control, slots in the missing ones, and
> marks what auto-hides per layout. Evidence for every "dead/inert" claim is in the companion
> [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md). Current panel: `c/designPanel` (4 pillars, ~47
> controls).

## Why the current panel is bad

1. **Colors are scattered across all 4 tabs.** Page bg in Pillar 1, text colors in Pillar 3, accent
   in Pillar 4, header bg in Pillar 2. You can never find "where do I change a color."
2. **"Card Borders & FX" is filed under *Typography*.** It has nothing to do with type — it's card
   framing + surface effects. (And half of it is dead; see matrix Bucket C.)
3. **Theme + layout + frame + canvas-colors are mashed** into one "Canvas & Frame" pillar.
4. **No real home for field styling** — field-state colors don't exist; input/label controls are
   buried under the same overloaded pillar as the dead FX group.
5. **Nothing hides controls that don't apply to the current layout**, so a third of the panel
   silently does nothing on rail/conversational shells (matrix A5).

## Markers used below

- `[new]` — control does not exist yet (a gap to build).
- `[α]` — gets a transparency/alpha channel (background surfaces only).
- `[*condition]` — auto-hide when the layout doesn't support it (matrix A5).
- `[dead]` — currently produces a token nothing consumes; **wire-or-cut decision needed** before it
  earns a place in the panel.

---

## Proposed structure — 7 tabs, one job each

> 7 tabs won't fit a horizontal strip in a narrow panel — use a **scrollable or vertical tab list**
> (or group into the 4 "areas" shown by the `═` headers and let each expand). User is open to more
> tabs; clarity wins over tab count.

### ═ APPEARANCE

**Tab 1 · Theme** — pick a look (the starting point)
- Theme (37 presets)
- Skin — light / dark / mood variant. NOT `[new]`: `skinOptions`/`handlePickSkin` already exist in
  formStudio.js but aren't rendered; wire them in (or cut). Skin currently = each theme's `defaultSkin`.
- Quick presets (chips)
- _Note: "Switching theme resets custom colors to that theme's defaults."_

**Tab 2 · Palette** — every foreground/brand color in ONE place
- Accent (solid only — no alpha) + **live contrast badge**
- Button text + contrast badge
- Main text
- Muted text
- Header text
- _Each picker shows a contrast badge against its known background._

**Tab 3 · Backgrounds & Surfaces** — each surface's fill + image + effects together
- Page background: color `[α]` · image upload `[new]` · opacity `[new]` · size/position `[new]`
- Card / content background: color `[α]` · transparency `[new]` `[*hide on Conversational]`
- Header surface: color `[α]` `[*hide on SideNav]` · banner image (exists) `[*hide on SplitHero/SideNav]` · opacity `[new]`
- Background texture `[dead]`
- Animated mesh background (+ hues) `[dead]`
- Glassmorphism `[*hide on SplitHero/SideNav/Conversational]`
- Top accent band `[dead]`

### ═ STRUCTURE

**Tab 4 · Layout** — pure structure, zero color noise
- Layout archetype
- Max content width
- Card chrome style `[*hide on SplitHero/SideNav/Conversational]`
- Section look & style
- Section inner padding
- Sizing scale (density)
- Stepper placement `[*stepper]`
- Stepper mode `[*stepper]`
- Progress indicator
- Responsive breakpoint

**Tab 5 · Fields & Frame** — the real "fields" tab (old "Card Borders & FX", done right)
- Corner rounding
- Card shadow `[*hide on SplitHero/Conversational]`
- Border color (strong) · Border color (light) · Card border width · Card border style
  — _whole border configured here; all `[*hide on SplitHero/SideNav/Conversational]`_
- Input style
- Control scale
- Label style
- Label position
- Field states `[new]`: focus color · required-asterisk color · error color

### ═ CONTENT & FLOW

**Tab 6 · Header & Branding**
- Header style (standard / hero / minimal / none)
- Header arrangement
- Built-in logo emblem
- Logo (upload + URL)
- Form title
- Description / subtitle
- Highlight message _(single string today; array-of-blocks is a later enhancement)_
- _Cross-ref: header surface color/image lives in Tab 3._
- Brand rail `[*splitHero/sideNav]`: side · width · content · sticky

**Tab 7 · Actions & Completion**
- Submit label
- Button alignment
- Submit placement _(moved here from Layout — it's about the button)_
- Next / Back labels `[*multipage]`
- Completion outcome (Message / Redirect)
- Redirect URL `[*redirect]`
- Thank-you message `[*message]`

---

## Before → after mapping (every current control)

| Current pillar | Control | → New tab |
|---|---|---|
| Canvas & Frame | Theme | Theme |
| Canvas & Frame | Layout archetype | Layout |
| Canvas & Frame | Max content width | Layout |
| Canvas & Frame | Card chrome style | Layout |
| Canvas & Frame | Section look & style | Layout |
| Canvas & Frame | Section inner padding | Layout |
| Canvas & Frame | Sizing scale (density) | Layout |
| Canvas & Frame | Stepper placement / mode | Layout |
| Canvas & Frame | Progress indicator | Layout |
| Canvas & Frame | Responsive breakpoint | Layout |
| Canvas & Frame | Corner rounding | Fields & Frame |
| Canvas & Frame | Card shadow | Fields & Frame |
| Canvas & Frame | Glassmorphism | Backgrounds & Surfaces |
| Canvas & Frame | Page background | Backgrounds & Surfaces |
| Canvas & Frame | Card background | Backgrounds & Surfaces |
| Brand & Identity | Header style | Header & Branding |
| Brand & Identity | Header arrangement | Header & Branding |
| Brand & Identity | Built-in logo emblem | Header & Branding |
| Brand & Identity | Logo upload | Header & Branding |
| Brand & Identity | Header banner image | Backgrounds & Surfaces (header surface) |
| Brand & Identity | Header background color | Backgrounds & Surfaces (header surface) |
| Brand & Identity | Form title / Description / Highlight | Header & Branding |
| Brand & Identity | Brand rail (side/width/content/sticky) | Header & Branding |
| Typography & Fields | Main / Muted / Header text colors | Palette |
| Typography & Fields | Input style | Fields & Frame |
| Typography & Fields | Label style / position | Fields & Frame |
| Typography & Fields | Control scale | Fields & Frame |
| Typography & Fields | Border (strong) / (light) | Fields & Frame |
| Typography & Fields | Card border width / style | Fields & Frame |
| Typography & Fields | Background texture | Backgrounds & Surfaces `[dead]` |
| Typography & Fields | Animated mesh background | Backgrounds & Surfaces `[dead]` |
| Typography & Fields | Top accent band | Backgrounds & Surfaces `[dead]` |
| Interaction & Flow | Accent / Button text | Palette |
| Interaction & Flow | Quick presets | Theme |
| Interaction & Flow | Submit label / alignment / placement | Actions & Completion |
| Interaction & Flow | Next / Back labels | Actions & Completion |
| Interaction & Flow | Completion outcome / Redirect / Thank-you | Actions & Completion |

## New controls to build (the `[new]` list)

- Skin switcher — wire the existing `skinOptions`/`handlePickSkin` into the template (exists in JS, not rendered)
- Page background image upload + opacity + size/position (Backgrounds)
- Alpha channel on page / card / header bg pickers (Backgrounds)
- Content-background transparency toggle/slider (Backgrounds)
- Header surface opacity (Backgrounds)
- Field-state colors: focus / required / error (Fields & Frame) — **also needs new token
  consumers**, these don't render today

## Wire-or-cut decisions (the `[dead]` list)

Before these earn panel space, decide per item — **wire a consumer or remove the control:**
- Background texture → `--c-texture`
- Animated mesh background → `--c-mesh-1..4`
- Top accent band → `--c-panel-decor-color`

## Cross-cutting

- **Conditional visibility** is now a first-class concern: each control carries a `[*…]` rule
  (see matrix A5). Implement as getters on the panel keyed to the selected shell, the way
  `isStepper` / `hasBrandPanel` already work.
- **Tab chrome**: 7 tabs need a scrollable/vertical tab list, or collapse to the 3 `═` area groups
  with expandable sections.
- **Sequencing for the eventual build** (matches matrix A7): (1) conditional hiding, (2) texture/
  mesh/accent-band wire-or-cut, (3) bg image + alpha, (4) this re-tabbing, (5) field-state colors.
