# Theme Coverage Matrix — tokens / Design-mode controls × shells

> **Why this doc exists.** A Design-mode control can be fully wired and still do **nothing
> visible** on the layout you happen to be testing, because that layout's CSS never references the
> token the control drives. This doc makes every such gap explicit so you stop discovering them by
> hand. It is an audit of the *current* code (verified by grep, not guessed). Companion docs:
> **[TOKEN_REFERENCE.md](./TOKEN_REFERENCE.md) — every `--c-*` token in one table** (start here if you
> just want the full list); [DESIGN_MODE_IA.md](./DESIGN_MODE_IA.md) proposes the settings-panel restructure.

Verified against `force-app/main/default/lwc/**` on 2026-06-27 (v2 — expanded after a cross-audit
that caught the **field-renderer token family** and the **name-mismatch bugs** now in A2b; earlier
revision covered ~30 of ~79 tokens and missed `formSectionRenderer`'s own vocabulary). **Legacy
components are excluded** — both the `z*`-prefixed set (`zFormPlayer`, `zFormDesigner`, `zFormThemes`,
`zDesignerCanvas`) and the superseded `c/formPlayer` + `c/formDesigner`. The **live stack** is
`formStudio` (builder) → `c/formViewer` (runtime) → `c/formLayoutEngine` → the 7 shells +
`c/formSectionRenderer`. If a citation below points at formPlayer/formDesigner, it's wrong — tell me.

---

## A1 · What is a `--c-*` token? (read this first)

A `--c-*` is a **CSS custom property** — a named, reusable style variable. Think of it as a
**labeled paint bucket**:

- One place fills the buckets: the theme engine
  [`buildTokenString()` in formThemes.js](../../force-app/main/default/lwc/formThemes/formThemes.js)
  turns your Design-mode choices into a string like `--c-accent:#6b4eff; --c-card-bg:#fff; --c-radius:8px; …`
  and sets it on the form's root element.
- Every component's CSS then *paints with* a bucket: `background: var(--c-card-bg)` instead of a
  hardcoded color. Change the bucket once → everything that references it updates.
- `--c-` is just this project's namespace ("c" for custom). SLDS uses `--slds-*`; we add `--c-*`.

**The one rule that explains every gap in this doc:**

> A token only changes a component **if that component's CSS contains `var(--that-token)`**.
> If nobody references a bucket, filling it does nothing — the control looks broken.

There are four ways a token/control can end up:

| Status | Meaning |
|---|---|
| ✅ **Works** | Produced by the engine **and** referenced broadly → visible effect everywhere it should be |
| 🟡 **Partial** | Produced **and** referenced by *some* shells → works on those layouts, silently inert on the rest |
| 🔴 **Dead** | Produced but **no component references it** → the control does nothing, anywhere |
| ⚪ **Constant** | Referenced but **never produced** → always falls back to a literal; not actually themeable |

---

## A2 · Who fills the buckets (the live path)

**Single producer.** Every `--c-*` token on a rendered form is emitted by `buildTokenString()`
([formThemes.js ~L902-998](../../force-app/main/default/lwc/formThemes/formThemes.js)) plus its v2
helper `themeSpecV2Parts()` (~L732-866), and applied as an **inline style on the form root**.
Resolution chain (each coat overrides the last): **theme** (design language) → **skin**
(mood/variant) → **palette** (4-lane custom colors — *dormant; never fed by the live builder*) →
**accent** (single brand knob) → **overrides** (your Design-panel controls) → **dark flips** (auto,
if the skin is dark) → **explicit chrome** (pins exact override values). Of these, **palette is
unused** and the **skin switcher isn't rendered** (skin is applied as each theme's `defaultSkin`
only) — both are wire-or-cut candidates.

The live wiring: `formStudio` renders
[`c-form-viewer`](../../force-app/main/default/lwc/formStudio/formStudio.html) (L774) →
`formLayoutEngine` sets `rootStyle = themeVars(skin, density)` on its host →
the shells + `formSectionRenderer` inherit. Your Design-mode controls feed the *overrides* lane via
[`formStudio._composedCustomTheme` / `skin`](../../force-app/main/default/lwc/formStudio/formStudio.js)
(L575-598). (formStudio's own `:host` defines `--bg/--panel/--pv-*` — that's the **builder chrome**,
not the form's theme tokens.)

**There is no static default layer in the live path.** Unlike the legacy components, the live tree
does **not** define a neutral `:host` palette. So every `--c-*` resolves in exactly one of two ways:

1. **Engine-emitted** — `buildTokenString` set it. Most theme tokens; a few only in dark/palette
   mode (e.g. `--c-surface-sunken`, `--c-text-meta`).
2. **Inline fallback** — the engine didn't emit it, so each component's own `var(--c-x, <literal>)`
   fallback applies. This is how Bucket D "constants" behave, and also how neutral names like
   `--c-surface` / `--c-bg` resolve when they aren't themed.

> The neutral palette you may have seen (`--c-bg, --c-surface, --c-success*`, …) is hardcoded only
> in the **legacy** `formPlayer.css` / `formDesigner.css` — dead code, not the live runtime.

**SLDS hook bridge.** `themeSpecV2Parts()` (L790-813) also emits ~16 `--slds-c-*` hooks that map the
theme onto **native Lightning fields** — e.g. `--slds-c-input-color-background: var(--c-input-bg)`,
`--slds-c-input-sizing-height: var(--c-control-h)`, `--slds-s-label-color: var(--c-label)`. This is
the mechanism that carries the theme across the SLDS shadow boundary into real `lightning-input`
fields; without it, live fields render bare-SLDS. Treat them as Bucket A (shared-renderer).

---

## A2b · Token-name mismatches — the silent bugs (highest value)

Distinct from the shell-coverage gaps below: here a Design-mode control sets **one** token name, but
the field renderer reads a **different** name for the same thing. The engine's value never arrives;
the consumer falls back to a hardcoded literal. The control looks wired (it may change *some* places)
but **doesn't reach the fields**. All in
[formSectionRenderer.css](../../force-app/main/default/lwc/formSectionRenderer/formSectionRenderer.css):

| Design control | Engine emits | Renderer reads | Result |
|---|---|---|---|
| **Muted text** color | `--c-text-weak` / `--c-text-meta` | `--c-text-muted` (L114, L122) | field help text + icons stay the fallback `#64748b` |
| (field **error** styling) | *nothing* — engine emits neither | `--c-error` (L143) **and** `--c-danger` (L284) | error color isn't themeable at all; the renderer even uses two different unproduced names |
| **Control scale / density** | `--c-control-h` (+ `--slds-c-input-sizing-height`) | `--c-input-height` (L80) | native SLDS fields resize, but the custom control wrapper keeps `2.5rem` |
| (alerts/callouts) | — (nothing) | `--c-callout-{info,success,warning,error}-bg` (L194-206) | callouts are permanently the hardcoded pastels |
| (sunken surface) | `--c-surface-sunken` (dark/palette only) | `--c-surface-2` (L261) | sunken field blocks stay `#f9fafb` |

> ✅ **RESOLVED 2026-06-27 (Phase 1) — the table above is the PRE-FIX snapshot.** The engine now
> emits all of these: aliases `--c-text-muted: var(--c-text-weak)`, `--c-danger: var(--c-error)`,
> `--c-input-height: var(--c-control-h)`, `--c-surface-2: var(--c-surface-sunken)`, plus pinned
> `--c-error: #ba0517` / `--c-error-bg` and the four `--c-callout-*-bg`
> ([formThemes.js:1071-1082](../../force-app/main/default/lwc/formThemes/formThemes.js#L1071)),
> all grep-confirmed consumed. ⚠️ code-path wired, not render-verified. *(Credit: surfaced by a cross-audit; verified
against source — no `:host` or producer bridges any of these names.)*

---

## A3 · Token × Shell coverage matrix

Columns are the 7 shells: **ST** Stack · **WZ** Wizard · **SH** SplitHero · **SN** SideNav ·
**CV** Conversational · **TB** Tabbed · **AC** Accordion. The **Shared** column = consumed by a
cross-shell layer (`formSectionRenderer`, `layoutSectionHost`, `formNav`) so it works on *all*
shells regardless of the per-shell cells.

### Bucket A — works everywhere (✅)
These are produced and referenced broadly (directly by shells and/or the shared renderer).

| Token | ST | WZ | SH | SN | CV | TB | AC | Shared | Drives |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `--c-accent` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | brand/accent everywhere |
| `--c-page-bg` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | page background |
| `--c-submit-bg` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | submit button fill |
| `--c-text` / `--c-text-weak` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | body / muted text |
| `--c-radius` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | button/input corners |
| `--c-control-h` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | control height (density) |
| `--c-space-1..5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | spacing scale |
| `--c-font-display` / `--c-font-body` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | heading / body font |
| `--c-focus-ring` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | input focus ring |
| `--c-border-light` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | hairlines/dividers |

### Bucket A (shared-renderer) — work on all shells via the field/section layer (✅)
Consumed by `formSectionRenderer` / `layoutSectionHost`, which render inside every shell — so these
are layout-independent even though no shell's own CSS references them.

| Token group | Consumer | Drives (Design-mode control) |
|---|---|---|
| `--c-section-style`, `--c-section-header-bg`, `--c-section-padding` | formSectionRenderer, layoutSectionHost | "Section look & style", "Section inner padding" |
| `--c-input-bg/-border/-border-bottom/-radius/-font` + `--slds-c-input-*` hooks | formSectionRenderer (+ native fields) | "Input style" |
| `--c-label-transform/-font/-size/-tracking/-col` | formSectionRenderer, layoutSectionHost | "Label style", "Label position" |

### Bucket A — motion & structural (✅)
Produced and consumed, but not user-facing colour controls — transitions and layout plumbing.

| Token | Consumed by | Drives |
|---|---|---|
| `--c-dur-1`, `--c-dur-2`, `--c-ease` | WZ, SH, SN, CV, AC + formNav, layoutZones | transitions / animations (ST, TB have little motion) |
| `--c-grid-gap` | layoutZones | zone / column gutters (note: `--c-zone-pad` was NOT consumed → cut 2026-06-28) |
| `--c-rail-w` | WZ, SN | rail width (240px) |
| `--c-input-font-size` | formSectionRenderer | input text size (Control scale). (`--c-control-font`/`--c-input-font`/`--c-input-border-bottom` are NOT consumed; border-bottom cut 2026-06-28) |

> Engine also emits **aliases**: `--c-brand` / `--c-brand-dark` (= accent, used by formNav/engine),
> `--c-back-color` (legacy-only consumer), `--c-header-style` / `--c-section-style` (read by JS/template
> logic, not painted in CSS). Not separately themeable; listed for completeness.

### Bucket B — partial: works on some layouts, silently inert on others (🟡)
**This is the heart of the problem.** Same control, opposite outcome depending on which shell is
rendering. "Visibly works on" = shells whose CSS references the token; "Silently does nothing on" =
shells that don't.

| Token | Visibly works on | Silently does nothing on | Design-mode control that feels broken |
|---|---|---|---|
| `--c-card-border` | ST, WZ, TB, AC (+ section cards) | **SH, SN, CV** | Border color (strong/light), Card border width, Card border style |
| `--c-card-shadow` | ST, WZ, TB, AC, **SN** (+ section cards) | SH, CV | Card shadow |
| `--c-glass-blur` | ST, WZ, TB, AC | SH, SN, CV | Glassmorphism |
| `--c-card-bg` | ST, WZ, TB, AC, SH, SN (+ sections) | **CV** | Card background |
| `--c-header-bg` | ST, WZ, TB, AC, SH, CV | **SN** | Header background color |
| `--c-radius-card` | ST, WZ, TB, AC, CV | SH, SN | (card corner rounding on the form frame) |
| `--c-on-accent` | ST, WZ, SH, **TB, AC** (via layoutSectionHost L109) + formNav | SN, CV | Button text color |
| `--c-header-text-weak` | **SH only** | all others | (secondary header text) |
| `--c-tap-min` | SN, CV, AC | ST, WZ, SH, TB | (mobile touch-target sizing) |

*(`--c-error` was previously listed here — it's actually a never-produced **Bucket D** constant used by
many live components; see below.)*

> **Worked example.** Set a thick **dashed** card border. On **Stack** it appears. Switch the same
> form to **SideNav** or **Conversational** and it vanishes — those shells never reference
> `--c-card-border`. The control isn't broken; the layout ignores the bucket.

### Bucket C — DEAD: produced but no component consumes it (🔴)
The engine writes these tokens; **nothing anywhere paints with them.** Verified: the strings
`texture`, `mesh`, `panelDecor` appear only in the producer, its test, and `designPanel`. These map
to **three visible controls that do nothing on any layout:**

| Token | Design-mode control (all in "Card Borders & FX") | Status |
|---|---|---|
| `--c-texture` | **Background texture** | ✅ CONSUMED 2026-06-27 (all 7 shells' page-bg) |
| `--c-mesh-bg` (was `--c-mesh-1..4`) | **Mesh background** | ✅ CONSUMED 2026-06-27 (all 7 shells) |
| `--c-panel-decor-color` | **Top accent band** | 🔴 DEFERRED — needs per-layout target |
| `--c-title-fill` | (internal, no control) | ✅ CUT 2026-06-28 |
| `--c-bg-scrim` | (internal; dark skins only) | 🔴 produced, no consumer |
| `--c-dur-3` | (internal; 600ms entrance) | ✅ CUT 2026-06-28 |
| `--c-stickybar-h` | (internal; 64px) | ✅ WIRED 2026-06-27 (sticky footer min-height, 3 shells) |
| `--c-summary-w` | (internal; 280px summary zone) | ✅ CUT 2026-06-28 |
| `--c-zone-pad` | (internal; zone padding) | ✅ CUT 2026-06-28 (zones use `--c-grid-gap`) |
| `--c-input-border-bottom` | Input style = Underline | ✅ CUT 2026-06-28 (underline via `--slds-c-input-shadow`) |

### Bucket D — CONSTANT: referenced but never produced (⚪)
Shells reference these with a literal fallback; the engine never sets them, so they're effectively
fixed values, not themeable.

| Token | Referenced by | Always resolves to |
|---|---|---|
| `--c-space-6` | ST, WZ, TB, AC, CV | `32px` |
| `--c-space-7` | formSectionRenderer (L223) | `3rem` |
| `--c-space-8` | formViewer (L54) | `3rem` |
| `--c-radius-sm` | CV, formSectionRenderer | `6px` |

> ✅ **RESOLVED 2026-06-27 (Phase 1) — no longer Bucket D.** `--c-input-height`, `--c-text-muted`,
> `--c-danger`, `--c-surface-2`, `--c-error`, `--c-error-bg`, and the four `--c-callout-*-bg` were the
> A2b name-mismatch / never-produced bugs; the engine now **produces all of them**
> ([formThemes.js:1071-1082](../../force-app/main/default/lwc/formThemes/formThemes.js#L1071)), wired
> end-to-end. ⚠️ code-path, not render-verified.
| `--c-surface-alt` | formLayoutEngine (skeleton), layoutSectionHost (input-bg fallback), formRepeater | engine emits it **only in dark / palette** mode; light themes fall back to `#f3f3f3`/`#f7f9fb` |
| `--c-shell-min-h`, `--c-shell-rail-h` | all rail/scroll shells | engine-set to `auto` in preview only ([formLayoutEngine L142](../../force-app/main/default/lwc/formLayoutEngine/formLayoutEngine.js), [formViewer L423](../../force-app/main/default/lwc/formViewer/formViewer.js)); else `100%`/`100vh`. Structural plumbing, not a design knob. |

### Out of scope — not form-theme tokens (excluded by design)
- **Builder-chrome tokens** — `--c-bg, --c-surface, --c-brand-bg, --c-brand-light, --c-border-cool,
  --c-navy, --c-success{,-bg}, --c-warning{,-bg}`. Used only by the legacy/builder panels
  (formDesigner, designerCanvas, fieldPalette, propertyPanel, newFormDialog, fieldPreview), not the
  rendered form. *(Correction: `--c-surface-alt`, `--c-error`, `--c-error-bg` were listed here by
  mistake in v2 — they ARE consumed by the live render; moved to Bucket D above.)*
- **Palette-lane tokens** — `--c-secondary{,-weak,-faint}`, `--c-tertiary{,-weak,-faint}`. Emitted by
  `applyPalette()` only when a 4-lane palette is passed (it never is). Dormant → would be Bucket C if
  activated.

---

## A4 · "Card Borders & FX" decoded + the Fields-tab verdict

The **"Card borders & FX"** divider lives in
[designPanel.html L303-342](../../force-app/main/default/lwc/designPanel/designPanel.html) inside
Pillar 3 ("Typography & Fields"). Plain English: it's **the form card's outline plus decorative
surface effects.** Here is every control in it and what actually happens:

| Control | Writes key | Token | Reality |
|---|---|---|---|
| Border (strong) | `border` | `--c-card-border`¹ | 🟡 inert on SH/SN/CV |
| Border (light) | `borderLight` | `--c-border-light` | ✅ (also folded into border¹) |
| Card border width | `borderWidth` | `--c-card-border`¹ | 🟡 inert on SH/SN/CV |
| Card border style | `borderStyle` | `--c-card-border`¹ | 🟡 inert on SH/SN/CV |
| Background texture | `texture` | `--c-texture` | 🔴 **dead — no consumer** |
| Animated mesh background | `bgEffect` | `--c-mesh-*` | 🔴 **dead — no consumer** |
| Top accent band | `panelDecor` | `--c-panel-decor-color` | 🔴 **dead — no consumer** |

¹ width + style + strong-color are folded into one `cardBorder` shorthand by
[`formStudio._composedCustomTheme`](../../force-app/main/default/lwc/formStudio/formStudio.js) (L575-586),
then mapped to `--c-card-border` in the engine's OVERRIDES table. They **are wired** — they're just
only honored by the 4 card shells.

**Verdict on "most of the Fields tab doesn't work":** of the 7 "Card Borders & FX" controls, **3
are dead** and **4 are inert on 3 of 7 layouts**. So on a SplitHero/SideNav/Conversational form,
*every* control in this section appears to do nothing — exactly the experience you hit. The fix is
two-fold: (a) hide the inert ones per layout (A5), and (b) either wire up texture/mesh/accent-band
or remove them.

The rest of Pillar 3 (text colors, input style, label style/position, control scale) **does work**
— it's consumed by the shared field renderer.

---

## A5 · Layout-conditional visibility — current vs. proposed

**Current** gating (only three getters, in
[designPanel.js](../../force-app/main/default/lwc/designPanel/designPanel.js)):

| Getter | Hides/shows | Controls affected |
|---|---|---|
| `isStepper` | stepper layout only | Stepper placement, Stepper mode |
| `hasBrandPanel` | splitHero / sideNav only | Brand rail (side/width/content/sticky) |
| `isMultiPage` | multi-page only | Next/Back labels |

**Proposed** additional hide rules (derived from the Bucket-B/C data above — a control should not
appear on a layout that ignores its token):

| Control | Hide on | Reason (token not consumed) |
|---|---|---|
| Card border width / style / Border (strong) | SplitHero, SideNav, Conversational | `--c-card-border` |
| Card shadow | SplitHero, Conversational | `--c-card-shadow` |
| Glassmorphism | SplitHero, SideNav, Conversational | `--c-glass-blur` |
| Card background | Conversational | `--c-card-bg` |
| Card chrome style | SplitHero, SideNav, Conversational | shells own their frame |
| Header background color | SideNav | `--c-header-bg` (SideNav uses a rail header) |
| Header banner image / Header style "Hero" | SplitHero, SideNav | SH uses a side panel; SN uses a rail header |
| Background texture / Animated mesh / Top accent band | **everywhere** | dead until wired (Bucket C) |

**Per-shell header model** (for the rules above):

| Shell | Header form |
|---|---|
| Stack, Tabbed, Accordion | arrangement + optional hero banner |
| Wizard | hero variant + step meta bar |
| SplitHero | brand **side panel** (logo/title/desc), uses `--c-header-text-weak` |
| SideNav | **rail header** (logo + title + highlight) — no hero banner |
| Conversational | brand header (flex column, eyebrow) — no card |

---

## A6 · Confirmed gaps the user flagged (located + recommendation)

| Gap | Status in code | Recommendation |
|---|---|---|
| **Page background image upload** | ✅ **DONE 2026-06-27.** "Page background image" upload (ContentVersion) → `pageBgImage`/`pageBgImageVersionId` → `--c-page-bg-image` layered in all 7 shells, + **Image fit** (cover/contain/tile) + **Image dim** scrim. See TOKEN_REFERENCE fix-log "later 5/6". | — (image-opacity not added; scrim covers legibility) |
| **Content background transparency** | ✅ **DONE 2026-06-27.** "Content background opacity" slider → `surfaceAlpha` → `withAlpha()` bakes #RRGGBBAA into `--c-card-bg`; page bg/image shows through. (Label also renamed "Card"→"Content".) | — |
| **Alpha on color pickers** | ✅ **DONE 2026-06-27 (bg surfaces only).** Opacity sliders on page / content / header bg (`pageBgAlpha`/`surfaceAlpha`/`headerBgAlpha` → `withAlpha`). Text/border/accent stay solid (a11y), as intended. | — |
| Skin switcher | `skinId` IS applied (each theme's `defaultSkin`); `skinOptions`/`handlePickSkin` exist in formStudio.js but aren't rendered in formStudio.html → can't switch skins. | Wire the skin chips into the template, or cut them. |
| Custom palette (4-lane) | `applyPalette()` exists but the live builder never passes a `palette`. | Build a brand-kit feature that feeds it, or remove. |
| Field-state colors | None (no focus/required/error pickers). | Add a "Field states" group; needs new `--c-field-focus/--c-required/--c-error` consumers. |
| Highlight message | Single string; spec wants an array of blocks. | Lower priority. |

---

## A7 · Summary of action items (feeds the IA + later build)

1. ~~Fix the token-name mismatches (A2b)~~ ✅ **DONE 2026-06-27 (Phase 1)** — `--c-text-muted`,
   `--c-input-height`, `--c-surface-2`, `--c-danger` aliased; `--c-error`/`--c-error-bg` pinned; four
   `--c-callout-*-bg` produced ([formThemes.js:1071-1082](../../force-app/main/default/lwc/formThemes/formThemes.js#L1071)).
   ⚠️ code-path wired, not render-verified. (Cosmetic follow-up: unify the red fallback literal — engine
   `#ba0517` vs static `#ba1a1a`/`#ea001e` in some `:host` defaults.)
2. **Hide inert controls per layout** (A5) — cheapest fix; removes most "it does nothing" confusion.
3. ~~Decide texture / mesh / dead structural tokens~~ — mostly DONE: texture/mesh **consumed**,
   `--c-stickybar-h` **wired**, and `--c-title-fill`/`--c-dur-3`/`--c-summary-w`/`--c-zone-pad`/
   `--c-input-border-bottom` **cut 2026-06-28**. Remaining 🔴: top accent band (deferred), `--c-bg-scrim`.
4. **Add background image + alpha** on page/card/header surfaces (A6).
5. **Restructure the panel** so colors aren't scattered and the dead/inert controls aren't filed
   under "Typography" — see [DESIGN_MODE_IA.md](./DESIGN_MODE_IA.md).
6. (Optional) promote Bucket-D constants (`--c-space-6/7/8`, `--c-radius-sm`) into the producer if
   they should be themeable.
