# Mosaic Grid

## 1. Identity

| | |
|---|---|
| id | `mosaicGrid` |
| tier | core |
| nav | `scroll` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | — (new) |

The 12-column multi-zone grid — sections occupy zones of different spans, with
an optional sticky side zone. **This is the complex-multi-layout workhorse**
and the archetype that exercises the full container tree (zones + nested
columns). Most AI restructuring ops land here.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [dashboard, detail, complex, dense, order, quote, configuration, intake, console]
  fieldCount: { min: 12, max: 80 }
  pages: single-or-multi
  audience: [internal, embedded]
  recommendWhen: "rich internal data entry on wide screens; forms with a natural 'summary/help' sidebar"
  avoidWhen: "guest mobile-majority audiences; < 3 sections (grid needs material)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────────┐
│  Logo · Title                                  │
│ ┌─────────────────────────────┐ ┌────────────┐ │
│ │ ▸ Contact        ▸ Address  │ │ ▸ Summary  │ │
│ │   [field]          [field]  │ │  (sticky)  │ │
│ │   [field]          [field]  │ │  [field]   │ │
│ ├─────────────────────────────┤ │            │ │
│ │ ▸ Details (full width)      │ │            │ │
│ │   [field] [field] [field]   │ │            │ │
│ ├──────────────┬──────────────┤ │            │ │
│ │ ▸ Terms      │ ▸ Files      │ │  [Submit]  │ │
│ └──────────────┴──────────────┘ └────────────┘ │
│        span 8                       span 4     │
└────────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule (heuristic, AI refines after): last section → sticky span-4 zone;
first two sections → 1:1 columns in the span-8 zone; remainder stacked below.

```json
{
  "version": 1,
  "archetype": "mosaicGrid",
  "density": "comfortable",
  "shell": {
    "nav": "scroll",
    "chrome": "card",
    "maxWidth": "wide",
    "header": "standard",
    "progress": "none",
    "submit": { "placement": "flow", "alignment": "right" }
  },
  "pages": [
    { "pageKey": "p_main", "grid": 12, "zones": [
      { "type": "zone", "span": 8, "children": [
        { "type": "columns", "ratio": [1, 1],
          "tracks": [ ["sec_contact"], ["sec_address"] ] },
        { "type": "stack", "sections": ["sec_details"] }
      ]},
      { "type": "zone", "span": 4, "sticky": true, "children": [
        { "type": "stack", "sections": ["sec_consent"] }
      ]}
    ]}
  ],
  "responsive": { "collapseBelow": "1024px", "collapseOrder": "mainFirst" }
}
```

Multi-page: each page gets its own grid (stepper or scroll nav both valid).

## 5. Default skin

New `LAYOUT_TEMPLATES.mosaicGrid`:

```js
{ name: 'mosaicGrid', label: 'Mosaic', font: 'system',
  accent: '#4f46e5', surface: '#ffffff', pageBg: '#eef0f6',
  radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card', glass: false }
```

`card` sections — in a grid, each section needs its own visual boundary.

## 6. Interaction & nav behavior

- Sticky zone pins below the header while the main zone scrolls; submit in the
  sticky zone footer is the natural variant (`submit.placement` stays `flow`
  by default; designer toggle).
- Zone rows wrap: spans summing > 12 flow to the next row (LAYOUT_SPEC §5) —
  this is how AI builds 6+6 / 8+4 / 4+4+4 mosaics without new node types.
- Designer canvas shows live grid guides when dragging sections between zones
  (Phase 3 requirement originates here).

## 7. Mobile collapse (< 1024px)

- `mainFirst` order: span-8 content first, sticky summary zone last (sticky
  off). Columns collapse to single column, track order preserved.
- Net result: indistinguishable from Classic on a phone — by design.

## 8. Repeaters & edge cases

- Repeaters: table style shines in a span-8/12 zone; lint suggests stacked in
  zones ≤ span 5.
- Sticky zone + short viewport: sticky disables below 640px *height* too.
- Visibility: if every section in a zone is hidden, the zone collapses and the
  row re-flows (no empty grid holes) — engine rule, test fixture required.
- Embedded adapter: grid responds to host width via ResizeObserver (same
  mechanism as Side-Nav).

## 9. Open questions

- Heuristic fill rule quality — validate against 5 real objects (Contact,
  Lead, Case, Opportunity, custom) during Phase 1 harness QA; tune before
  wizard ships.
