# Tabbed Card

## 1. Identity

| | |
|---|---|
| id | `tabbedCard` |
| tier | core |
| nav | `tabs` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | — (new) |

Pages (or section groups) as horizontal tabs inside a single card. The compact
cousin of Side-Nav: non-linear navigation without the rail's footprint.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [edit, record, categories, settings, profile, tabs, update, embedded]
  fieldCount: { min: 8, max: 50 }
  pages: multi   # 2–6 tabs sweet spot; single-page forms group sections into tabs
  audience: [internal, embedded, flow]
  recommendWhen: "embedded/record-page contexts with limited width; 2–6 natural categories"
  avoidWhen: "guest marketing forms; > 6 pages (tab bar overflows — use sideNav)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│        ┌──────────────────────────┐        │
│        │  Logo · Title            │        │
│        │ ┌────────┬─────────┬───┐ │        │
│        │ │Contact✓│ Address●│...│ │        │
│        │ ├────────┴─────────┴───┤ │        │
│        │ │ ▸ Section: Address   │ │        │
│        │ │   [field] [field]    │ │        │
│        │ │   [field]            │ │        │
│        │ │                      │ │        │
│        │ └──────────────────────┘ │        │
│        │  2 of 3 done    [Submit] │        │
│        └──────────────────────────┘        │
└────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule: one tab per page; tab labels = page names; inside each tab, span-12
stack (zones/columns fully supported inside a tab — AI can mosaic within tabs).

```json
{
  "version": 1,
  "archetype": "tabbedCard",
  "density": "comfortable",
  "shell": {
    "nav": "tabs",
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

New `LAYOUT_TEMPLATES.tabbedCard`:

```js
{ name: 'tabbedCard', label: 'Tabbed', font: 'system',
  accent: '#0d9488', surface: '#ffffff', pageBg: '#f0f4f4',
  radius: 'rounded', cardShadow: 'soft', sectionDefault: 'plain', glass: false }
```

## 6. Interaction & nav behavior

- Base component: `lightning-tabset` (native-SLDS preference); tab end-icons
  carry state (✓ / ⚠), accent underline from `--c-accent`.
- Free navigation, soft validation (like Side-Nav): leaving a tab with errors
  badges it ⚠, never blocks.
- Submit visible in the card footer on every tab; click jumps to first
  invalid tab + field.
- Footer fraction (`2 of 3 done`) mirrors tab states.

## 7. Mobile collapse

- Tab bar becomes horizontally scrollable with edge-fade (native tabset
  behavior, styled), or — if > 4 tabs — collapses to the Side-Nav mobile
  dropdown pattern (shared component).
- Card padding shrinks; content as Classic mobile.

## 8. Repeaters & edge cases

- Repeaters: a tab that *is* a repeater ("Line items") works well — table
  style gets the full card width.
- Flow adapter: best multi-page option inside Flow (no nav-button collision —
  tabs are free navigation, Flow's buttons advance the Flow).
- Visibility: a hidden page removes its tab; fraction renumbers. A tab with
  *all sections hidden* is also removed (engine rule, test fixture).
- Keyboard: arrow-key tab traversal comes free with lightning-tabset; verify
  focus order into panel content (a11y checklist).

## 9. Open questions

- Single-page forms choosing tabbedCard: auto-group sections one-per-tab, or
  prompt the user to define groups? (leaning: auto-group, AI/designer can
  regroup after — zero-friction default)
