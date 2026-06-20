# Document

## 1. Identity

| | |
|---|---|
| id | `document` |
| tier | core |
| nav | `scroll` |
| chrome | `paper` |
| density | compact |
| legacy mapping | `compact` |

A dense, print-like application form: paper sheet, label-left rows, editorial
typography. For forms that *feel official* — applications, declarations,
compliance.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [application, legal, compliance, declaration, government, tax, official, agreement, hr]
  fieldCount: { min: 10, max: 60 }
  pages: single-or-multi
  audience: [guest, internal]
  recommendWhen: "official/serious tone; users may print or expect a document metaphor; dense field sets"
  avoidWhen: "casual marketing forms; mobile-majority audiences (label-left is desktop-biased)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│         (neutral page background)          │
│   ┌────────────────────────────────────┐   │
│   │  FORM A-12        Application for… │   │
│   │  ──────────────────────────────────│   │
│   │  1. CONTACT                        │   │
│   │  Full name      [______________]   │   │
│   │  Email          [______________]   │   │
│   │  Phone          [______________]   │   │
│   │  2. ADDRESS                        │   │
│   │  Street         [______________]   │   │
│   │  City / State   [______] [____]    │   │
│   │  ──────────────────────────────────│   │
│   │              [ Submit application ]│   │
│   └────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

Numbered section headers, hairline rules, label column ~200px.

## 4. Preset spec

Fill rule: like Classic (span-12 stacks per page) — Document's identity is
density + `paper` chrome + the **label-left element style**, which is a
*density/skin concern*, not a tree concern.

```json
{
  "version": 1,
  "archetype": "document",
  "density": "compact",
  "shell": {
    "nav": "scroll",
    "chrome": "paper",
    "maxWidth": "medium",
    "header": "minimal",
    "progress": "none",
    "submit": { "placement": "flow", "alignment": "center" }
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

New skin key introduced by this archetype: `labelPosition: "left"`
(`top | left`) — added to the Theme Spec, defaulting `top` everywhere else.
(Theme Spec change, not Layout Spec — any archetype may opt into label-left.)

## 5. Default skin

Evolves `LAYOUT_TEMPLATES.compact`:

```js
{ name: 'document', label: 'Document', font: 'editorial',
  accent: '#1f2937', surface: '#fffdf8', pageBg: '#e9e7e1',
  radius: 'sharp', cardShadow: 'medium', sectionDefault: 'plain',
  glass: false, labelPosition: 'left' }
```

`paper` chrome adds the sheet affordances: top accent rule, generous sheet
margins, slight warm white.

## 6. Interaction & nav behavior

- Sections auto-number (`1. CONTACT`) — engine chrome keyed off archetype;
  toggleable in shell later if requested.
- Compact density: tighter `--c-section-padding`, smaller control height
  token, hairline section separators instead of card gaps.
- Multi-page: scroll with page dividers ("— Page 2 —") by default; stepper a
  valid designer switch.
- Print stylesheet: this archetype is the one that must print acceptably
  (Phase 6 checklist item).

## 7. Mobile collapse

- `labelPosition` flips to `top` below breakpoint (label-left is unreadable on
  phones). Density stays compact; sheet margins shrink to 12px.

## 8. Repeaters & edge cases

- Repeaters: table style is the natural fit (rows in a document grid);
  stacked as fallback.
- Long rich-text disclosures render full-width across the label boundary.
- Checkbox elements in label-left mode: control left, label right (standard
  document convention) — fieldPreview/element renderer must special-case.

## 9. Open questions

- Auto-numbering on by default or off? (leaning: on — it sells the metaphor;
  verify in wizard preview testing)
