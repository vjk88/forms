# Accordion

## 1. Identity

| | |
|---|---|
| id | `accordion` |
| tier | core |
| nav | `accordion` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | — (new) |

Collapsible sections, one open at a time, with completion ticks. Long forms
that stay *visually short* — users always see the whole map.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [checklist, sections, progressive, long, optional, modular, assessment]
  fieldCount: { min: 10, max: 50 }
  pages: flattened   # pages become section groups with subtle group headers
  audience: [internal, guest, embedded]
  recommendWhen: "many sections of which several are optional; users complete in passes"
  avoidWhen: "< 3 sections; flows where users must compare fields across sections"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│        ┌──────────────────────────┐        │
│        │  Logo · Title    2/4 ✓   │        │
│        ├──────────────────────────┤        │
│        │ ✓ Contact            ▸   │        │
│        │ ✓ Address            ▸   │        │
│        │ ● Details            ▾   │        │
│        │ ┌──────────────────────┐ │        │
│        │ │  [field] [field]     │ │        │
│        │ │  [field]             │ │        │
│        │ │        [Continue ↓]  │ │        │
│        │ └──────────────────────┘ │        │
│        │ ○ Consent            ▸   │        │
│        ├──────────────────────────┤        │
│        │                 [Submit] │        │
│        └──────────────────────────┘        │
└────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule: flattened; each section = one accordion panel; pages become group
labels above their panels (rendered only for multi-page forms).

```json
{
  "version": 1,
  "archetype": "accordion",
  "density": "comfortable",
  "shell": {
    "nav": "accordion",
    "chrome": "card",
    "maxWidth": "medium",
    "header": "standard",
    "progress": "fraction",
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

New `LAYOUT_TEMPLATES.accordion`:

```js
{ name: 'accordion', label: 'Accordion', font: 'enterprise',
  accent: '#047857', surface: '#ffffff', pageBg: '#f2f6f4',
  radius: 'rounded', cardShadow: 'soft', sectionDefault: 'subtle', glass: false }
```

## 6. Interaction & nav behavior

- Base component: `lightning-accordion` (single-open) per the native-SLDS
  preference — custom header slot for tick/status chrome.
- Panel header states: ✓ complete, ● open, ⚠ has errors, ○ untouched;
  optional sections get no tick (matches Side-Nav decision).
- Each panel footer has **Continue ↓**: validates the panel softly, closes it,
  opens the next incomplete one. Header click = free navigation (no
  validation gate — accordion is non-linear like Side-Nav).
- Submit always visible at card bottom; on click, first invalid panel opens
  and scrolls to first error.
- Designer toggle (shell v1.1 candidate): allow-multiple-open.

## 7. Mobile collapse

Structure unchanged (accordions are natively mobile). Panel headers grow to
48px touch targets; Continue button full-width.

## 8. Repeaters & edge cases

- Repeaters: panel = the repeater; completion = "≥ min rows valid". Stacked
  and tile styles fit; table allowed but lint-suggested against (nested
  horizontal scroll inside a panel).
- Visibility: a section hidden by rules removes its panel and renumbers the
  fraction (`2/3 ✓`) live.
- One open at a time means anchored field-to-field comparisons are impossible
  — AI metadata `avoidWhen` covers this; designer lint when a visibility rule
  references a field in another section (the user can't see both at once).

## 9. Open questions

- Auto-open first incomplete panel on load, or always panel 1? (leaning:
  first incomplete — supports resume behavior later)
