# Classic

## 1. Identity

| | |
|---|---|
| id | `classic` |
| tier | core |
| nav | `scroll` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | `classic` (current default) |

The safe default: a single centered column card on a quiet page background.
Every feature must work flawlessly here first — Classic is the reference
implementation for the engine.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [contact, request, feedback, simple, general, lead, inquiry]
  fieldCount: { min: 1, max: 20 }
  pages: single-or-multi
  audience: [guest, internal, flow, embedded]
  recommendWhen: "default when no strong signal; short-to-medium forms"
  avoidWhen: "30+ fields (use sideNav/wizardStepper) or brand-forward marketing forms (use splitHero/immersiveGlass)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│                (page background)           │
│        ┌──────────────────────────┐        │
│        │  Logo · Title            │        │
│        │  Description             │        │
│        ├──────────────────────────┤        │
│        │  ▸ Section: Contact      │        │
│        │    [field] [field]       │        │
│        │  ▸ Section: Address      │        │
│        │    [field] [field]       │        │
│        │  ▸ Section: Details      │        │
│        ├──────────────────────────┤        │
│        │                 [Submit] │        │
│        └──────────────────────────┘        │
└────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule: all pages flattened (scroll nav); each page → one span-12 zone with
a single stack of its sections in source order.

```json
{
  "version": 1,
  "archetype": "classic",
  "density": "comfortable",
  "shell": {
    "nav": "scroll",
    "chrome": "card",
    "maxWidth": "medium",
    "header": "standard",
    "progress": "none",
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
  "responsive": { "collapseBelow": "768px", "collapseOrder": "source" }
}
```

## 5. Default skin

Unchanged from today's `LAYOUT_TEMPLATES.classic`:

```js
{ name: 'classic', label: 'Classic', font: 'enterprise',
  accent: '#0176d3', surface: '#ffffff', pageBg: '#f4f6f9',
  radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card', glass: false }
```

## 6. Interaction & nav behavior

- Continuous scroll; page boundaries render as extra section spacing + optional
  page-title dividers (`shell.header` controls form header only).
- Submit sits at the end of content (`flow`).
- Section styles resolve via the existing cascade (`inherit` → skin
  `sectionDefault`).

## 7. Mobile collapse

Already single-column; card gutters shrink (token-driven), `maxWidth` ignored.
No structural change — this archetype is the mobile baseline others collapse to.

## 8. Repeaters & edge cases

- Repeater sections: all 3 styles (stacked/table/tile) supported inline;
  table style scroll-wraps on mobile (existing formRepeater behavior).
- Guest: fully supported, no special handling.
- Visibility: hidden sections collapse with no ghost spacing (engine rule §11).

## 9. Open questions

None — reference archetype.
