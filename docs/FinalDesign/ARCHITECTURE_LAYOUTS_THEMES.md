# Architecture — Layouts & Themes (the tech spec)

> **Status: approved design for the rebuild.** Companions: [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md)
> (component inventory + attributes) · [RUNTIME_NOTES.md](./RUNTIME_NOTES.md) (security/runtime rules) ·
> [SURFACE_MODEL_SPEC.md](../redesign/SURFACE_MODEL_SPEC.md) (surface definitions) ·
> [DESIGN_MODE_IA.md](../redesign/DESIGN_MODE_IA.md) (editor tab structure). Authored 2026-07-03.

## 0 · The law

**Layouts own structure. Themes own appearance. They speak only through the token contract.**

Everything else in this document is enforcement. This is strict because every major bug class in the
old build was a violation of exactly this sentence:

| Old bug | The violation |
|---|---|
| Page background missing on 4 layouts (`chrome` enum) | Layout code deciding *whether* appearance paints |
| Image-fit broke when mesh toggled | Two features sharing one background stack — layer slots shifted |
| `--c-card-*` meant three different surfaces | Ambiguous contract → both sides guessed |
| Same fix needed 7 times across shells | Chrome duplicated per layout instead of owned once |

## 1 · The five layers

```
L1  DATA MODEL      forms → pages → sections → elements        (kept as-is)
        │  form definition + saved config
        ▼
L5  TOKEN ENGINE    one pure function: theme + overrides → tokens
        │  --c-* values (the ONLY producer)
        ▼
L3  TOKEN CONTRACT  the fixed --c-* interface (§3)              (this doc owns it)
        ▲                                          ▲
        │ consumes (read-only)                     │ resolves into
L2  LAYOUT          pageFrame + nav primitives     L4  THEME    data only — properties,
    + zones + renderers                                no code, no CSS
```

| Layer | Owns | Artifact | Changes when… |
|---|---|---|---|
| L1 Data model | Form structure | Custom objects (kept) | Never for this rebuild |
| L2 Layout | Navigation + spatial arrangement | `pageFrame`, `nav*`, `layoutZones`, renderers | New layout / structural feature |
| L3 Token contract | The `--c-*` vocabulary | §3 of this doc | New themeable property (append-only) |
| L4 Theme | Appearance values | Data: catalog module + custom-theme records | New theme / new property value |
| L5 Token engine | Property → token translation | `themeEngine` logic module | New property or cascade rule |

## 2 · Layout layer (L2)

### 2.1 `pageFrame` — chrome exists ONCE

Exactly one implementation of the page backdrop, effects layer, and content panel. Layouts compose
it; none of them re-implement any part of it. The old `chrome` enum (card/paper/fullbleed) is dead —
those become Content-panel presets (border/shadow/max-width combinations), not code paths.

```
<div class="page">        ← page bg color + USER page image (fixed 2-layer stack, always present)
  <div class="fx"></div>  ← mesh + texture ONLY (decorative; pointer-events:none; own stacking context)
  <div class="panel">     ← content surface: bg / border / shadow / radius / glass
    <slot name="header">  ← formHeader
    <slot name="nav">     ← the one nav primitive
    <slot name="body">    ← pages/sections via layoutZones
    <slot name="actions"> ← submitBar
  </div>
</div>
```

Two structural rules, each killing a whole bug class from the old build:

1. **Page background paints on `.page`, which ALWAYS exists.** Never on a variant class. (The
   chrome bug: bg painted only on `.chrome-fullbleed`, so 4 layouts silently dropped it.)
2. **The user's page image NEVER shares a background stack with effects.** Mesh/texture live on the
   dedicated `.fx` element. (The image-fit bug: mesh = 4 gradient layers, texture = 2, so
   `background-size` slots shifted and Fit landed on the wrong layer. Fixed slot counts, forever.)

### 2.2 Nav primitives — a registry, not a switch statement

Seven separate LWCs (catalog §2 contract), lazy-loaded via `lwc:is`. The engine picks from a
**layout registry** — the single place a layout is declared:

```js
// layoutRegistry (logic module)
export const LAYOUTS = {
  scroll:        { load: () => import('c/navScroll'),        paginates: false, gating: false },
  stepper:       { load: () => import('c/navStepper'),       paginates: true,  gating: true  },
  tabs:          { load: () => import('c/navTabs'),          paginates: true,  gating: false },
  accordion:     { load: () => import('c/navAccordion'),     paginates: false, gating: false }, // panels expand in place; submitBar renders once
  rail:          { load: () => import('c/navRail'),          paginates: true,  gating: false },
  splitHero:     { load: () => import('c/navSplitHero'),     paginates: true,  gating: true  },
  oneAtATime:    { load: () => import('c/navOneAtATime'),    paginates: true,  gating: true  },
};
```

- **`paginates`** = whether the primitive presents pages as **discrete steps**. Any primitive can
  host a multi-page spec — scroll flattens pages with dividers. (Renamed from `multiPage`, whose
  obvious misreading would wrongly block multi-page forms from choosing scroll — UIUX review #8.)
- **Adding a layout = one new primitive + one registry row.** Nothing else changes.
- `designPanel`'s Layout tab and its conditional-visibility rules read the registry metadata —
  editors never hardcode layout lists.
- A guest opening a scroll form downloads `navScroll` only (LCP — review A).
- Primitives slot the shared `submitBar` and forward intents (catalog §1/§2) — no primitive owns
  button markup.

### 2.3 What layout code may NOT do

- Define any color / shadow / font / spacing value. The only sanctioned exceptions: the **neutral
  base block** at `pageFrame :host` (§3.1 rule 5) and `sectionRenderer`'s preset-default fallbacks.
- Neutral means grayscale (`#f4f7f5`, `#e6e8ec`, `transparent`) — never brand-flavored.
  A form with zero theme applied renders plain but *correct*.
- Read theme data, import the catalog, or branch on theme/skin names. If a layout needs to "know"
  something visual, that's a missing token — extend the contract (§6), don't peek.
- Paint page/panel background anywhere outside `pageFrame`.

## 3 · Token contract (L3) — the interface

### 3.1 Contract rules

1. **One producer.** Only the token engine writes `--c-*` values. Layouts are read-only consumers.
2. **One token = one CSS value.** Never a multi-layer bundle (the mesh lesson). A token that feeds a
   `background-image` slot resolves to exactly one layer.
3. **Append-only.** New tokens may be added; existing tokens are never renamed or removed (alias +
   deprecate if truly needed). Consumers must be able to trust the vocabulary.
4. **Naming:** `--c-<surface>-<property>` for surfaces, `--c-<role>` for roles.
5. **Fallback discipline — centralized (review round 2):** neutral base values are declared ONCE at
   `pageFrame`'s `:host` (plain declarations — `--c-page-bg: #f4f7f5;`); the engine's inline style on
   the same element overrides them. Children consume **bare `var(--c-x)`** — no per-file fallbacks to
   drift apart. **Carve-out:** preset-dependent tokens (`--c-section-*`) keep consumer-side fallbacks,
   because *unset = the section preset decides* — centralizing them would break that contract.
   (Do NOT use the reviewer's `--c-x: var(--c-x, …)` pattern — a self-referential custom property is
   invalid CSS and silently kills the token.)

### 3.2 Contract v1 (70-token vocabulary — the engine's jest suite enforces the list exactly; the 3 `--c-section-*` surface tokens below are RESERVED consumer-side, never emitted. Contract event 2026-07-07 appended the `--c-input-*` shell set and `--c-label-*` defaults for fieldStyle/labelPosition/labelStyle; `--c-input-radius` and `--c-label-font` are emitted only when a non-default style needs them — their CSS fallbacks carry the default look; backdrop-composition event same day appended `--c-page-veil` (image-opacity veil slot) and the three `--c-*-bg-gradient` layers — the page stack is now the fixed 4-slot scrim/veil/image/gradient. Immersive event 2026-07-08 (Neon Nights) appended `--c-fx-mesh-4`, the mesh presentation pair `--c-mesh-anim`/`--c-mesh-blend`, the CTA pair `--c-submit-bg-gradient`/`--c-submit-glow`, and the CONDITIONAL title-ink pair `--c-header-title-gradient`/`--c-header-title-fill` — emitted together or not at all, since `background-clip:text` needs a transparent fill only when a gradient exists. Leak/softness event 2026-07-08b appended `--c-mesh-filter`+`--c-mesh-bleed` (one `meshBlur` prop drives both — blurred layers oversize so softened edges stay outside the clipped `.fx`) and CONDITIONAL `--c-page-radius` (embedded-canvas rounding; guest/full-bleed never rounds))

Deliberately smaller than the old sprawl ([TOKEN_REFERENCE.md](../redesign/TOKEN_REFERENCE.md)
documents that mess). Grouped by surface per [SURFACE_MODEL_SPEC.md](../redesign/SURFACE_MODEL_SPEC.md):

**Page** (consumed by `pageFrame .page` / `.fx`)
| Token | Styles |
|---|---|
| `--c-page-bg` | Backdrop fill |
| `--c-page-bg-image` | User's uploaded backdrop (one `url()`) |
| `--c-page-bg-size` / `--c-page-bg-position` / `--c-page-bg-repeat` | Fit + placement + tiling for that image only |
| `--c-page-scrim` | Legibility dim over the image — always a single gradient |
| `--c-fx-texture` / `--c-fx-mesh-1..4` | Decorative layers — the `.fx` element tree ONLY, never `.page`. Each token = ONE layer (rule 2); texture paints on `.fx` itself, each mesh token owns one fixed CHILD element (`.fx-m1..4`), so layers can never shift and can drift/blend independently |
| `--c-mesh-anim` / `--c-mesh-blend` | Mesh presentation: `running\|paused` drives the drift keyframes' play-state (reduced-motion forces off); `screen\|normal` is the blob blend (screen = luminous, dark pages only — `.page` is `isolation: isolate` so blends never leak into host chrome) |
| `--c-mesh-filter` / `--c-mesh-bleed` | Blob softness (one `effects.meshBlur` prop drives both): a real `blur()` filter + the oversize inset that keeps softened edges outside the clipped `.fx` (which is `overflow: hidden` — drifting layers can never paint past the page) |
| `--c-page-radius` | CONDITIONAL (`pageRadius` KEY): rounds the page canvas in EMBEDDED contexts only — guest/full-bleed surfaces own the viewport and stay square |

**Content panel** (consumed by `pageFrame .panel`)
| Token | Styles |
|---|---|
| `--c-content-bg` | Panel fill (supports alpha) |
| `--c-content-border` | Full border shorthand (width varies by theme) — consumers MUST use it as the ENTIRE value of a `border*` property, never as a color |
| `--c-content-shadow` | Panel shadow |
| `--c-glass-blur` | Frosted-glass blur radius |

**Section** (consumed by `sectionRenderer`)
| Token | Styles |
|---|---|
| `--c-section-bg` / `--c-section-border` / `--c-section-shadow` | Section surface (unset = preset default) |
| `--c-section-pad` | Inner padding |

**Field** (consumed by `elementRenderer` + widgets)
| Token | Styles |
|---|---|
| `--c-field-bg` / `--c-field-border` | Input surface fill + border COLOR. `--c-field-border` is a color (width is always consumer-owned: `1px solid var(--c-field-border)`); nav chrome may also use it for hairlines/dividers/tracks |
| `--c-field-focus` / `--c-field-error` / `--c-field-required` | Field-state colors (theme-level — review Rec 1) |
| `--c-control-h` | Input height (density-driven) |

**Text & brand** (consumed everywhere)
| Token | Styles |
|---|---|
| `--c-text` / `--c-text-weak` | Body + muted text |
| `--c-accent` / `--c-on-accent` | Brand color + text on it |
| `--c-focus-ring` | Focus outline shadow |

**Header** (consumed by `formHeader`)
| Token | Styles |
|---|---|
| `--c-header-bg` / `--c-header-text` / `--c-header-text-weak` | Header surface + text. `--c-header-bg` may carry a full multi-part background shorthand (split/gradient/image themes) — consumers MUST use `background:`, never `background-color:` |
| `--c-header-title-gradient` / `--c-header-title-fill` | CONDITIONAL pair (`palette.headerTitleGradient`): gradient display ink for the title via `background-clip:text` — fill goes `transparent` only when the gradient exists; absent = solid `--c-header-text` |

**Actions** (consumed by `submitBar`)
| Token | Styles |
|---|---|
| `--c-submit-bg` / `--c-submit-text` | Submit button |
| `--c-submit-bg-gradient` / `--c-submit-glow` | CTA dressing (`palette.submitBgGradient` / `submitGlow`): gradient paints ABOVE the solid (same layering rule as surface fills); glow shadow derives from the gradient start, else the solid. Both default `none` |

**Shape · space · type** (consumed everywhere)
| Token | Styles |
|---|---|
| `--c-radius` | **The one shared roundness** — panel, sections, fields, buttons |
| `--c-space-1` … `--c-space-6` | Spacing scale (density resolves INTO these — no density token) |
| `--c-font-body` / `--c-font-display` | Font pairing |

### 3.3 Two tiers — primitives stay inside the engine

Raw scales (spacing steps, radius sizes, type ramps) are **JS constants inside the engine**, never
emitted as CSS variables. Only semantic tokens cross the wire. Theme properties select from scales
(`radius: 'soft'`); the engine translates to pixel values. One tier on the wire = nothing to
desynchronize.

## 4 · Theme layer (L4) — data, not code

### 4.1 A theme is properties, not tokens

```js
{
  name: 'Editorial Ivory',
  tags: ['light', 'editorial'],
  palette: { accent, pageBg, contentBg, text, textWeak, headerBg, headerText },
  typography: 'editorial',                    // font-pairing key
  radius: 'soft',                             // sharp | soft | round | pill
  border: 'hairline',                         // none | hairline | bold
  density: 'comfortable',
  effects: { shadow: 'soft', glass: false, texture: null, mesh: null },
  fieldStates: { focus, error, required },    // review Rec 1 — global, never per-field
  pageImage: { url, fit, position, scrim },   // page backdrop image — usually set per-form via overrides (Design tab), rarely by the theme itself
}
```

Theme authors think in these business-level properties (same vocabulary as `themeEditor`, catalog
§6). The engine owns the translation to tokens. **A theme contains zero CSS and zero component
knowledge** — that's what makes 37 themes × 7 layouts not be 259 test cases.

### 4.2 Storage & hiding — DECISION CLOSED 2026-07-03

- **Built-in themes: a data module inside the MANAGED package** (`themeCatalog`). Subscribers
  cannot browse managed source in Setup — the catalog, recipes, and mixing logic are hidden.
  NOT Custom Metadata / records (browsable = design handed to clients).
- **Custom themes: records** (custom object, JSON property blob — exact shape of §4.1). User-created
  work can't hide, must be listable in `themeGallery` and shareable. Same property shape either way —
  storage differs, pipeline doesn't.
- **Accepted residual exposure:** JS loaded by the *builder* reaches the browser; a determined dev
  can dig recipes out of a minified bundle. Accepted because the active theme's resolved tokens are
  DOM-inspectable no matter where resolution happens — the goal is "not obvious," not "unbreakable."
  Server-side resolution was rejected: it buys little beyond this and costs an Apex round-trip per
  Design-mode tweak (laggy live preview).
- **Resolve-at-publish (the hardening that makes this moot for guests):** publishing a form
  **snapshots the resolved token output into the published spec**. The live/guest runtime never
  loads `themeCatalog` at all:
  - recipes never ship to the public site (public surface fully hidden),
  - smaller guest bundle → better LCP,
  - published rendering can't drift when the catalog updates — **re-publish refreshes the snapshot**.
  Only builder components (internal, licensed users) carry the catalog.

### 4.3 Overrides & the cascade

Form-level overrides are the **same property shape, sparse** (deltas only). One cascade, stated in
the catalog header and implemented in exactly one place (the engine):

```
theme default  →  form-level override  →  per-component explicit value
```

Blank = inherit up. Explicit wins. No other precedence logic anywhere.

### 4.4 Dark mode posture — DECISION CLOSED 2026-07-03 (review round 2)

- **A published form renders AS DESIGNED — always.** No auto-inversion from the visitor's OS
  (`prefers-color-scheme`), no end-user toggle. Forms are art-directed; the theme surface is brand.
  (Typeform/Jotform behave the same way.)
- **Dark is a theme decision, not a runtime mode.** Dark *themes* exist in the catalog like any
  other; a theme MAY ship a *designed* dark variant that the **designer** picks. Never an
  auto-generated inversion — the old dark-scrim bug is the provenance for why.
- **v1 builds NOTHING for visitor-adaptive dark mode.** If it's ever wanted: a per-form opt-in,
  offered only when the theme has a designed dark variant, implemented by **appending
  `resolved.darkTokens`** at publish. The spec's ignore-unknown-keys rule makes that additive — no
  `specVersion` bump, no guest engine, no breakage. The door is open by construction; we walk
  through it only on demand.
- Reviewer's alternative ("snapshot properties + ship a lightweight engine to guests") **REJECTED**:
  it reintroduces resolution logic into the guest bundle (what resolve-at-publish exists to prevent)
  and breaks `engineVersion` pinning — an engine update would silently re-style published forms.

## 5 · Token engine (L5) — the single producer

```js
// themeEngine (logic module) — pure function, no DOM, no wire
resolveTokens(themeProps, formOverrides)
  → { '--c-accent': '#0d9488', '--c-radius': '10px', … }
// No "mode" param — dark is a theme/variant choice resolved into themeProps
// upstream (§4.4), never a runtime input.
```

- **Applied at ONE point:** the `pageFrame` root, as a style attribute. No other component ever
  writes a `--c-*` value.
- **Neutral base values live once** at `pageFrame`'s `:host` as plain declarations — the "no theme"
  render. The engine's inline style on the same element wins over them; children consume bare
  `var(--c-x)` (§3.1 rule 5, incl. the section-preset carve-out).
- **Exhaustively jest-tested:** every theme property × expected token output, cascade order, sparse
  overrides, dark mode. The old build had zero engine tests and infinite regressions; this module is
  where correctness is cheapest to buy.
- Deterministic: same inputs → same string. Snapshot tests on full built-in catalog output.

## 6 · Extensibility recipes

**Add a layout** — zero theme work:
1. Build the primitive to the catalog §2 contract (inputs/events/a11y/submitBar slot).
2. Add one `layoutRegistry` row with metadata.
3. Done — designPanel, engine, and editors pick it up from the registry.

**Add a theme** — zero layout work:
- Built-in: one entry in `themeCatalog`. Custom: user saves a record via `themeEditor`.

**Add a themeable property** — the ONLY change that crosses layers, so it has a checklist:
1. Append token(s) to §3.2 (append-only — update this doc in the same PR).
2. Teach the engine to emit it (+ jest cases).
3. Consume in layout CSS with a neutral fallback.
4. Add the editor control (designPanel/themeEditor per [DESIGN_MODE_IA.md](../redesign/DESIGN_MODE_IA.md)).
5. Deploy + render-verify on at least 2 layouts before merge.

**Add an element widget** — one widget-registry row (catalog §1 note); palette updates itself.

## 7 · Anti-regression laws (paid for in blood)

1. Page background paints on an **always-present** element — never a variant class.
2. Effects live on the dedicated `.fx` layer — the user's image **never shares a background stack**.
3. **One** radius token. One. `--c-radius`.
4. One producer (the engine); one application point (`pageFrame` root).
5. Neutral fallbacks only — a fallback is not a place to hide a design decision.
6. Any background / stacking / `z-index` / `::before` CSS change: **deploy + render-verify before
   merge.** No exceptions; jest-green is not rendered-correct.
7. The engine is pure and exhaustively unit-tested — visual bugs get caught as string diffs, not
   screenshots.
8. **All motion honors `prefers-reduced-motion`** — transitions become instant or plain crossfade,
   decorative animation (mesh/blob drift) stops, scroll-to-error jumps. This is accessibility, not
   art direction: the ONE sanctioned exception to "renders as designed" (UIUX review #14).
9. **Translucency has one owner per surface (owner 2026-07-05 + UIUX review #11):** pickers emit
   opaque colors; each background surface pairs with its own Opacity property; the ENGINE composes
   color + opacity into the existing token's rgba — token count unchanged, no alpha pickers,
   glass = blur only.

## 8 · What this unblocks

- **FORM_SPEC_SCHEMA.md** — needs the override shape (§4.3 ✓) and the resolve-at-publish snapshot
  field (§4.2 ✓).
- **DATA_MODEL_DELTA.md** — needs the custom-theme record (§4.2 ✓) + drafts/answer-store (catalog §4).
- **BUILD_PHASES.md** — P0 walking skeleton = `formLayoutEngine` + `pageFrame` + `navScroll` +
  `themeEngine` with one theme, rendered end-to-end behind the §7 gate.
