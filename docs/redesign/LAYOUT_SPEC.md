# Layout Spec — Contract v1

> Status: DRAFT v1 (2026-06-09). The single contract consumed by the layout
> engine (`c/formLayoutEngine`), the creation wizard previews, the designer
> canvas, and all Agentforce actions. Changes here ripple everywhere — treat
> edits as breaking until versioned.

---

## 1. Purpose & scope

The Layout Spec describes **where things go and how users navigate** — never
*what* the things are. Content (pages, sections, elements, validation,
visibility, autofill) stays in the existing data model
(`Form_Page__c / Form_Section__c / Form_Element__c`). The spec only references
sections by key and places them in a structural tree.

| Concern | Owner |
|---|---|
| Section/element content, validation, visibility rules | Data model (unchanged) |
| Element layout *inside* a section (column width, order) | Data model (`Column_Width__c`, order fields — unchanged) |
| Section placement, page structure, split panes, grids, nav model, chrome | **Layout Spec** |
| Colors, fonts, radius, shadows, glass, backgrounds | **Theme Spec** (existing skin JSON in `c/formThemes` — separate doc) |

A spec must render **identically** given the same spec + sections + skin. No
randomness, no AI at render time.

## 2. Storage, versioning, back-compat

- Stored in `Form_Version__c.Layout_Spec__c` (Long Text Area, 131072), JSON.
- **`null`/blank = legacy path.** formPlayer renders exactly as today (the
  5-archetype switch). Nothing existing changes behavior. This is the
  migration kill switch at the per-form level.
- Org-wide kill switch: `Form_Settings__c.Disable_Layout_Engine__c`
  (hierarchy custom setting) forces the legacy path even when a spec exists.
- `version` field inside the JSON (currently `1`). The engine rejects specs
  with a higher version than it understands and falls back to legacy + console
  warning (never a broken form for an end user).
- Specs are copied on version clone, like every other version-scoped config.

### Legacy archetype mapping (no data migration)

When the designer opens a legacy form (no spec), it materializes a preset spec
from the stored layout value — user sees their form unchanged, now editable
structurally:

| Legacy `layout` | Preset spec |
|---|---|
| `classic` | `preset:classic` |
| `split` | `preset:splitHero` |
| `immersive` | `preset:immersiveGlass` |
| `stepped` | `preset:wizardStepper` |
| `compact` | `preset:document` (compact density flag on) |

## 3. Top-level shape

```jsonc
{
  "version": 1,
  "archetype": "splitHero",        // provenance/analytics + designer gallery highlight; rendering uses the tree below
  "shell": { ... },                 // §4 — chrome, nav, brand panel, submit placement
  "pages": [ { ... } ],             // §5 — one entry per Form_Page__c, structural tree inside
  "responsive": { ... },            // §7 — collapse behavior
  "density": "comfortable"          // comfortable | compact — spacing token multiplier
}
```

## 4. `shell`

```jsonc
"shell": {
  "nav": "stepper",        // REQUIRED: scroll | stepper | tabs | sidenav | oneAtATime | accordion
  "stepperPlacement": "top", // top | rail — rail = vertical sticky stepper (mock 03); only valid with nav: stepper
  "chrome": "card",        // card | fullbleed | paper   (default: card)
  "maxWidth": "wide",      // narrow(640) | medium(820) | wide(1080) | full   (default: medium)
  "brandPanel": {           // optional — null for archetypes without one
    "side": "left",        // left | right | top
    "width": "38%",        // 25%–50%, validated
    "content": ["logo", "title", "description", "progress", "props", "quote"],  // ordered, allowlisted tokens (props/quote content authored in form settings — mock 02)
    "sticky": true
  },
  "header": "standard",    // standard | hero | minimal | none
  "progress": "auto",      // auto (per nav model) | bar | dots | fraction | none
  "submit": {
    "placement": "flow",   // flow (end of content) | stickyBottom | brandPanel
    "alignment": "right"   // left | center | right | stretch
  }
}
```

**Submit-placement principle (governs all archetype boards):** scrolling
archetypes put the primary action at the **end of content, bottom-right**
(`flow`/`right`); guided archetypes (stepper, oneAtATime, kiosk) pin it to the
**step/footer bar** (replacing "Next" on the last step); app-chrome archetypes
(console) use **stickyBottom** mirrored in the topbar. Boards reference this
rule rather than re-deciding; mobile always converges on `stickyBottom`.

**Chrome is never a spec node:** headers, footers, submit bars, nav rails,
stepper indicators, accordion ticks, timeline spines and document numbering
are derived by the engine from `archetype` + `shell`. They MUST NOT be modeled
as zones/stacks/sections in `Layout_Spec__c` — the validator rejects unknown
node types, and chrome staying engine-owned is what keeps AI patches unable to
corrupt navigation.

### Nav model semantics (engine behavior, not styling)

| `nav` | Behavior | Pages? | Progress default |
|---|---|---|---|
| `scroll` | All pages stacked, continuous scroll | flattened | none |
| `stepper` | One page at a time, horizontal step indicator, back/next | yes | steps |
| `tabs` | Pages (or single-page sections) as `lightning-tabset`; free navigation | yes | none |
| `sidenav` | Vertical rail of pages/sections, content right, free jump + scroll-spy | yes | checkmarks on rail |
| `oneAtATime` | One *element* per screen, keyboard-first (Enter to advance), full-height | flattened | fraction |
| `accordion` | Sections as `lightning-accordion`, one open, completion ticks | flattened | ticks |

Validation per nav model: `oneAtATime` ignores zone/column structure (linear by
definition — designer warns if combined with a grid); `scroll`+`accordion`
flatten page boundaries into section groups.

## 5. `pages[]` and the container tree

One entry per `Form_Page__c`, matched by `pageKey` (stable key field — see §9).
Inside a page, a **recursive container tree** places sections:

```jsonc
{
  "pageKey": "p_details",
  "grid": 12,                       // fixed at 12 in v1
  "zones": [
    {
      "type": "zone", "span": 8,    // grid columns this zone occupies
      "children": [
        { "type": "columns", "ratio": [1, 1],
          "tracks": [ ["sec_contact"], ["sec_address"] ] },
        { "type": "stack", "sections": ["sec_notes"] }
      ]
    },
    {
      "type": "zone", "span": 4, "sticky": true,
      "children": [ { "type": "stack", "sections": ["sec_summary"] } ]
    }
  ]
}
```

### Node types

| Node | Fields | Rules |
|---|---|---|
| `zone` | `span` (1–12), `sticky?`, `children[]` | Only at page top level. Spans in one row sum ≤ 12; overflow wraps to next row. |
| `columns` | `ratio` (2–4 ints, each 1–3), `tracks[][]` (section keys per column) | Nestable inside zones/stacks. A `columns` may NOT contain another `columns` (depth control — splits inside splits read as chaos on forms). |
| `stack` | `sections[]` | Vertical flow, the default container. |

Hard limits (validator-enforced): tree depth ≤ 4 (page → zone → columns/stack →
sections), ≤ 6 zones per page, ≤ 30 nodes per page. These caps are what make
AI output safe — an LLM cannot produce an unrenderable monster.

### Section references & the orphan rule

- Sections are referenced by `sectionKey` (stable key, §9), each **at most once**
  across the whole spec.
- **Orphan rule:** any section that exists in data but is not referenced in the
  spec is auto-appended to its page's last zone in source order. *Nothing ever
  disappears* because a spec went stale — adding a section in the designer
  works even if the spec isn't touched. Unknown keys in the spec (section
  deleted) are silently skipped. Both cases surface as designer lint warnings,
  never end-user errors.
- Repeater sections (related lists / `c/formRepeater`) are placed exactly like
  sections; their internal style (stacked/table/tile) remains section config.

## 6. JSON Schema (normative)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FormLayoutSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "archetype", "shell", "pages"],
  "properties": {
    "version": { "const": 1 },
    "archetype": { "type": "string", "maxLength": 40 },
    "density": { "enum": ["comfortable", "compact"] },
    "shell": {
      "type": "object",
      "additionalProperties": false,
      "required": ["nav"],
      "properties": {
        "nav": { "enum": ["scroll", "stepper", "tabs", "sidenav", "oneAtATime", "accordion"] },
        "stepperPlacement": { "enum": ["top", "rail"] },
        "chrome": { "enum": ["card", "fullbleed", "paper"] },
        "maxWidth": { "enum": ["narrow", "medium", "wide", "full"] },
        "header": { "enum": ["standard", "hero", "minimal", "none"] },
        "progress": { "enum": ["auto", "bar", "dots", "fraction", "none"] },
        "brandPanel": {
          "type": ["object", "null"],
          "additionalProperties": false,
          "required": ["side"],
          "properties": {
            "side": { "enum": ["left", "right", "top"] },
            "width": { "type": "string", "pattern": "^(2[5-9]|3[0-9]|4[0-9]|50)%$" },
            "content": { "type": "array", "maxItems": 7,
              "items": { "enum": ["logo", "title", "description", "progress", "image", "props", "quote"] } },
            "sticky": { "type": "boolean" }
          }
        },
        "submit": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "placement": { "enum": ["flow", "stickyBottom", "brandPanel"] },
            "alignment": { "enum": ["left", "center", "right", "stretch"] }
          }
        }
      }
    },
    "pages": {
      "type": "array", "minItems": 1, "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["pageKey", "zones"],
        "properties": {
          "pageKey": { "type": "string", "maxLength": 80 },
          "grid": { "const": 12 },
          "zones": {
            "type": "array", "minItems": 1, "maxItems": 6,
            "items": { "$ref": "#/definitions/zone" }
          }
        }
      }
    },
    "responsive": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "collapseBelow": { "enum": ["480px", "768px", "1024px"] },
        "collapseOrder": { "enum": ["source", "mainFirst"] }
      }
    }
  },
  "definitions": {
    "zone": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "span", "children"],
      "properties": {
        "type": { "const": "zone" },
        "span": { "type": "integer", "minimum": 1, "maximum": 12 },
        "sticky": { "type": "boolean" },
        "children": { "type": "array", "minItems": 1, "maxItems": 8,
          "items": { "oneOf": [ { "$ref": "#/definitions/columns" }, { "$ref": "#/definitions/stack" } ] } }
      }
    },
    "columns": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "ratio", "tracks"],
      "properties": {
        "type": { "const": "columns" },
        "ratio": { "type": "array", "minItems": 2, "maxItems": 4,
          "items": { "type": "integer", "minimum": 1, "maximum": 3 } },
        "tracks": { "type": "array", "minItems": 2, "maxItems": 4,
          "items": { "type": "array", "maxItems": 10, "items": { "type": "string", "maxLength": 80 } } }
      }
    },
    "stack": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "sections"],
      "properties": {
        "type": { "const": "stack" },
        "sections": { "type": "array", "maxItems": 15, "items": { "type": "string", "maxLength": 80 } }
      }
    }
  }
}
```

Semantic checks beyond the schema (Apex `FormLayoutSpecValidator`):
1. `ratio.length === tracks.length` on every `columns` node.
2. No `sectionKey` referenced more than once spec-wide.
3. `pageKey`s unique; warn (don't fail) on keys missing from data (orphan rule §5).
4. Spec byte size ≤ 32KB.
5. Nav-model compatibility warnings (`oneAtATime` + zones, etc.).

The validator is shared: designer save, AI patch application, and import all
funnel through the same Apex method. **Nothing writes `Layout_Spec__c` except
the validator.**

## 7. Responsive collapse (every archetype must obey)

`responsive.collapseBelow` defaults to `768px`, but **multi-pane archetypes
override it in their preset specs** — `sideNav`, `mosaicGrid` and `console`
default to `1024px` (rails/grids need tablet room). Implementers must read the
breakpoint from the spec, never hardcode 768. Below the effective breakpoint:
- All zones stack full-width in `collapseOrder` (`source` = spec order,
  `mainFirst` = widest zone first). `sticky` is disabled.
- `columns` collapse to a single column (track order preserved).
- `brandPanel` `left|right` becomes `top` (compact: logo + title + progress only).
- `sidenav` becomes a top dropdown/breadcrumb; `tabs` become a scrollable tab bar;
  `stepper` keeps steps as dots; `oneAtATime` and `accordion` are natively mobile.

Element-level responsiveness inside sections is unchanged (existing
`Column_Width__c` behavior).

**Mechanism (T1 spike finding, binding):** `:host-context` is rejected by the
platform LWC compiler, so collapse is JS-driven — `c/formLayoutEngine` measures
its root with a ResizeObserver against `spec.responsive.collapseBelow` and
exposes `model.collapsed`; every shell passes it through:
`<c-layout-zones ... collapsed={model.collapsed}>`. Shell-chrome media queries
in shell CSS are still fine for the shell's own chrome.

## 8. Archetype presets (the 13 gallery entries)

> Roster source of truth: [archetypes/README.md](archetypes/README.md).

Each preset = `archetype` + a spec template + a default skin (extends
`LAYOUT_TEMPLATES` in `c/formThemes`). Spec templates are parameterized by the
actual pages/sections at apply time (the wizard's seed sections, or the form's
existing sections when switching archetypes). Switching archetypes **re-places
content, never deletes it** (orphan rule guarantees this).

| Preset | shell.nav | chrome | Distinctive structure |
|---|---|---|---|
| `classic` | scroll | card | single zone span 12, stacks |
| `splitHero` | stepper or scroll | fullbleed | brandPanel left 38%, content zone right |
| `wizardStepper` | stepper | card | one page per step, span-12 zones |
| `sideNav` | sidenav | card | rail + content; sections grouped per page |
| `conversational` | oneAtATime | fullbleed | linear; zones ignored |
| `immersiveGlass` | scroll | fullbleed | glass card, single zone (skin: glass+dark) |
| `mosaicGrid` | scroll | card | multi-zone 12-col grid (e.g. 8+4, 6+6 rows), sticky summary zone |
| `document` | scroll | paper | span-12, density compact, label-left element style |
| `accordion` | accordion | card | section accordions, completion ticks |
| `tabbedCard` | tabs | card | pages/section-groups as tabs in one card |
| `console` | scroll | card | app topbar + label-left rows + sticky meta zone + savebar (internal record edit) |
| `timeline` | scroll | card | span-12 with timeline spine rendered in zone gutter |
| `kiosk` | oneAtATime | fullbleed | density comfortable+, oversized controls (skin scale token) |

Full per-archetype boards (wireframe, mobile behavior, default skin, when-to-
recommend metadata for the AI) live in `docs/redesign/archetypes/` — one file
each (Phase 0 deliverable).

## 9. Stable keys (`pageKey` / `sectionKey`)

Specs must survive renames and clones, so they reference keys, not record Ids
or labels: new field `Key__c` (text 80, unique-per-version, auto-generated
slug on insert by the existing trigger handlers) on `Form_Page__c` and
`Form_Section__c`. Keys are copied verbatim on version clone — Ids change,
keys don't, so the cloned spec stays valid with zero rewriting.

## 10. AI patch protocol (what Agentforce actions emit)

AI never emits a whole spec for an existing form — it emits **semantic ops**,
applied in order, validated, then shown as a preview diff. Smaller surface =
better LLM accuracy and a human-readable change log ("Moved *Address* beside
*Contact Info*").

```jsonc
{ "ops": [
  { "op": "setArchetype", "archetype": "mosaicGrid" },              // re-place via preset template
  { "op": "setShell", "patch": { "nav": "sidenav" } },              // shallow-merge, schema-checked
  { "op": "moveSection", "sectionKey": "sec_address",
    "target": { "pageKey": "p1", "zoneIndex": 0, "childIndex": 1, "trackIndex": 1 } },
  { "op": "splitColumns", "pageKey": "p1", "zoneIndex": 0, "childIndex": 0,
    "ratio": [2, 1], "distribute": ["sec_contact", "sec_consent"] },
  { "op": "mergeToStack", "pageKey": "p1", "zoneIndex": 0, "childIndex": 0 },
  { "op": "setZones", "pageKey": "p1", "spans": [8, 4], "stickyLast": true },
  { "op": "setDensity", "density": "compact" },
  { "op": "setTheme", "patch": { "accent": "#0b5d3b", "font": "luxe" } }  // routes to Theme Spec
] }
```

Rules: ≤ 15 ops per turn; unknown op or invalid target ⇒ whole patch rejected
with a machine-readable reason (fed back to the agent for self-correction);
result must pass the full §6 validator; every applied patch pushes the prior
spec onto the working draft's undo stack (`Spec_History__c` JSON ring buffer,
last 20, draft-only).

## 11. Engine consumption notes (Phase 1 reference)

### Component architecture: thin orchestrator + shell-per-archetype

`c/formLayoutEngine` is a **small orchestrator**, the only component
formPlayer/formDesigner/wizard ever touch. Per-archetype chrome lives in
**one shell LWC per archetype** (`c/shellClassic`, `c/shellMosaic`, …),
selected via a registry (`archetype id → module`) and mounted with
`lwc:is` + dynamic `import()` — so a runtime form loads exactly one shell
(guest perf), and **adding an archetype = new shell + registry entry +
validator allowlist entry, zero edits to engine/player/designer/other
shells**.

Shells own only their board's chrome (rail/spine/topbar/glass/etc.) + scoped
CSS. Everything structural is shared, composed by every shell, implemented
once:
- `c/layoutZones` — the recursive zone/columns/stack renderer (CSS grid,
  tokens). Shells never reimplement containers.
- `c/layoutSectionHost` — bridge to existing section/element rendering.
- `c/layoutStepper` (top + rail), `c/layoutProgress` — nav chrome shared
  across shells.
- JS modules (no DOM): `c/layoutModel` (materialize presets, orphan rule,
  `applyOps`/rebase) and `c/layoutNavState` (page state machine, validation
  gates).

**Phase 1 week-1 spike:** verify dynamic `import()` of `c/` components under
LWS, as guest user, and in a 2GP namespace. Fallback if blocked: static
imports in the registry feeding `lwc:is` (loses lazy loading, keeps the
decomposition).

### Behavioral notes

- The engine receives `{ spec, pages, sections, elements, skin }`
  fully resolved — it performs **no Apex calls** (this is what makes wizard
  previews with fake seed data free).
- Zones/columns render via CSS grid using `--c-*` tokens only; archetype-
  specific chrome (timeline spine, brand panel, kiosk scale) is keyed off
  `archetype` + shell, never hardcoded colors.
- Preview mode: `scale` attribute (0.4–1) + `inert` flag for the wizard
  gallery (no focus/validation in previews).
- Existing visibility rules evaluate before placement: a hidden section leaves
  its container; empty containers collapse (no ghost gaps).

## 12. Open items

| Item | Leaning | Status |
|---|---|---|
| `Key__c` backfill for existing org data | trigger backfill script in Phase 1 | open — decide Phase 1 start |
| `oneAtATime` + repeater sections UX | — | **DECIDED:** repeater = one screen, never per-row ([conversational board](archetypes/conversational.md) §8) |
| Per-zone background/skin overrides | defer to spec v2 (keep v1 lean) | open — after Phase 2 |
| Timeline/kiosk: ship in first 10 or fast-follow | — | **DECIDED:** 10 core in Phase 1; Timeline + Kiosk fast-follow ([archetypes/README](archetypes/README.md)) |

## 13. Contract additions surfaced by archetype boards (v1 amendments)

Reviewed 2026-06-10 against the 12 boards in `docs/redesign/archetypes/`:

1. **Theme Spec keys (skin, not layout — usable by any archetype):**
   - `labelPosition: "top" | "left"` (default `top`) — introduced by
     [document](archetypes/document.md); flips to `top` below the breakpoint.
   - `controlScale: 1–1.5` (default 1) — introduced by
     [kiosk](archetypes/kiosk.md); multiplies control-height/tap-target tokens.
2. **Chrome is engine-owned, keyed off `archetype`:** stepper indicator,
   side-nav rail, accordion ticks, timeline spine, document numbering are NOT
   spec nodes — boards define them, the engine renders them. Specs stay small
   and AI cannot corrupt navigation chrome.
3. **Structure preservation rule:** `oneAtATime`/`accordion` archetypes keep
   the canonical zone tree in the spec even though rendering ignores it, so
   switching archetypes is lossless both directions.
4. **Container-width responsiveness:** embedded/sideNav/mosaic respond to host
   width via ResizeObserver, not viewport media queries alone.
5. **AI op backlog for v1.1:** `groupIntoPages` (wizard-stepper board §9 —
   needed when AI converts a single-page form to a stepper).
6. **Per-archetype breakpoint override:** `sideNav` and `mosaicGrid` default
   `collapseBelow: 1024px` (rail/grid need room) — already legal in §6 schema.
7. **Design-explorations reconciliation (2026-06-10,
   [DESIGN_EXPLORATIONS_AUDIT.md](DESIGN_EXPLORATIONS_AUDIT.md)):** 13th
   archetype `console` (core); shell key `stepperPlacement: top|rail`;
   brandPanel tokens `props`/`quote`; Theme Spec keys `inputStyle`, `texture`,
   `bgEffect`, `titleStyle`, `panelDecor`, `labelStyle`; immersiveGlass default
   skin flipped to dark glass; **widgets** (Live Summary, meta rows) confirmed
   as widget-backed pseudo-sections placeable in zones (contract in Phase 5
   widgets spec); element `renderAs` variants confirmed as a Phase 5 pillar.
   Webfont pairings from the mocks ship as static resources (LWS/CSP — no
   external font CDNs).
