# Side-Nav

## 1. Identity

| | |
|---|---|
| id | `sideNav` |
| tier | core |
| nav | `sidenav` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | — (new) |

A vertical rail of pages/sections beside the content — the Lightning record
page pattern applied to forms. Built for long forms users navigate
*non-linearly*.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [profile, settings, account, internal, long, review, case, update, edit]
  fieldCount: { min: 15, max: 100 }
  pages: single-or-multi
  audience: [internal, embedded]
  recommendWhen: "long internal forms; record-edit experiences; users who jump around"
  avoidWhen: "guest marketing forms (rail feels like an app, not an invitation); < 3 sections"
```

## 3. Structure (desktop)

```
┌──────────────┬─────────────────────────────┐
│ Title        │  (scrolls, scroll-spy)      │
│              │                             │
│ ✓ Contact    │  ▸ Section: Contact         │
│ ● Address  ◄─│    [field] [field]          │
│ ○ Details    │  ▸ Section: Address         │
│ ○ Consent    │    [field] [field]          │
│              │  ▸ Section: Details         │
│ [Submit]     │    ...                      │
│   240px      │            flex             │
└──────────────┴─────────────────────────────┘
```

Rail entries: pages (multi-page) or sections (single-page). States: ✓ complete
(all required fields valid), ● current (scroll-spy), ○ untouched, ⚠ error.

## 4. Preset spec

Fill rule: pages preserved; rail derives from page/section data — it is **not**
in the spec (engine-owned chrome, like the stepper indicator). Content zones
span 12 inside the content area.

```json
{
  "version": 1,
  "archetype": "sideNav",
  "density": "comfortable",
  "shell": {
    "nav": "sidenav",
    "chrome": "card",
    "maxWidth": "wide",
    "header": "minimal",
    "progress": "auto",
    "submit": { "placement": "flow", "alignment": "right" }
  },
  "pages": [
    { "pageKey": "p_main", "grid": 12, "zones": [
      { "type": "zone", "span": 12, "children": [
        { "type": "stack", "sections": ["sec_contact", "sec_address"] }
      ]}
    ]},
    { "pageKey": "p_extra", "grid": 12, "zones": [
      { "type": "zone", "span": 12, "children": [
        { "type": "stack", "sections": ["sec_details", "sec_consent"] }
      ]}
    ]}
  ],
  "responsive": { "collapseBelow": "1024px", "collapseOrder": "source" }
}
```

Note the wider breakpoint (1024px) — the rail needs room.

## 5. Default skin

New `LAYOUT_TEMPLATES.sideNav`:

```js
{ name: 'sideNav', label: 'Side Nav', font: 'enterprise',
  accent: '#2563eb', surface: '#ffffff', pageBg: '#f6f7fa',
  radius: 'rounded', cardShadow: 'soft', sectionDefault: 'subtle', glass: false }
```

`subtle` section default — the rail already provides structure; double-framing
with cards looks heavy.

## 6. Interaction & nav behavior

- Multi-page: rail entry per page; clicking swaps content (validating the
  leaving page softly — errors badge the rail, never block navigation).
- Single-page: rail entry per section; clicking smooth-scrolls; scroll-spy
  highlights. This is the key difference from tabs/stepper: **free movement**.
- Submit lives in the rail footer (always visible) *and* at content end;
  disabled-with-tooltip until required sections are ✓.
- Section completion state = all required elements valid; recomputed on blur.

## 7. Mobile collapse (< 1024px)

- Rail becomes a sticky top bar with a section dropdown
  (`Contact ▾  · 2 of 4 complete`) + thin progress bar.
- Content behaves like Classic mobile. Rail submit moves to `stickyBottom`.

## 8. Repeaters & edge cases

- Repeaters: rail completion for a repeater section = "≥ min rows valid".
- Embedded adapter: works well (rail respects container width; collapses to
  the top-bar variant when the container, not viewport, is narrow — engine
  uses ResizeObserver on host, not media queries alone).
- Guest: allowed but not recommended (AI metadata steers away).

## 9. Open questions

- Rail completion ticks for *optional* sections — show nothing, or hollow tick
  when touched? (leaning: nothing; ticks mean "required satisfied")
