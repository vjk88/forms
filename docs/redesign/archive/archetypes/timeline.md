# Timeline

## 1. Identity

| | |
|---|---|
| id | `timeline` |
| tier | **fast-follow** (board final; engine work deferred — shares ~90% of the Classic scroll path, spine is chrome) |
| nav | `scroll` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | — (new) |

A vertical milestone spine in the left gutter; each section is a "stop" with a
status node. The narrative/journey framing — progress you can *see* while
scrolling.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [journey, onboarding, story, milestones, steps, process, progress, program]
  fieldCount: { min: 8, max: 40 }
  pages: flattened   # spine replaces page boundaries
  audience: [guest, internal]
  recommendWhen: "sequential narrative forms where momentum/encouragement matters (onboarding, program enrollment)"
  avoidWhen: "non-linear editing; dense grids; > 8 sections (spine gets noisy)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│        Logo · Title                        │
│   ✓────┬──────────────────────────┐        │
│   │    │ ▸ Contact (done)         │        │
│   │    │   [field] [field]        │        │
│   ●────┼──────────────────────────┤        │
│   │    │ ▸ Address (current)      │        │
│   │    │   [field] [field]        │        │
│   ┊    │                          │        │
│   ○────┼──────────────────────────┤        │
│   ┊    │ ▸ Details                │        │
│   ○────┼──────────────────────────┤        │
│   spine│ ▸ Consent      [Submit]  │        │
│        └──────────────────────────┘        │
└────────────────────────────────────────────┘
```

Spine nodes: ✓ complete, ● current (scroll-spy), ○ upcoming; connector fills
with accent as sections complete.

## 4. Preset spec

Fill rule: flattened scroll like Classic; the spine is **engine chrome keyed
off `archetype`** (like Document's numbering and the stepper indicator) — not
a tree node. Sections stack span-12; nested columns allowed within a stop.

```json
{
  "version": 1,
  "archetype": "timeline",
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

(`progress: none` — the spine *is* the progress indicator.)

## 5. Default skin

New `LAYOUT_TEMPLATES.timeline`:

```js
{ name: 'timeline', label: 'Timeline', font: 'geometric',
  accent: '#7c3aed', surface: '#ffffff', pageBg: '#f7f5fb',
  radius: 'round', cardShadow: 'soft', sectionDefault: 'subtle', glass: false }
```

## 6. Interaction & nav behavior

- Scroll-spy drives the ● current node; completion (required fields valid)
  flips nodes to ✓ and fills the connector (200ms ease, respect
  `prefers-reduced-motion`).
- Clicking a node smooth-scrolls to its section (free navigation).
- Section header sits beside its node (stop title = section name).
- Pages flatten; page names render as spine **era labels** (small caps above
  the first node of each page's group) for multi-page forms.

## 7. Mobile collapse

- Spine narrows to a 20px rail, nodes shrink, era labels hide; content gets
  remaining width. Below 480px, spine hides entirely and a thin top progress
  bar substitutes (Conversational's bar component, reused).

## 8. Repeaters & edge cases

- Repeaters: a stop that is a repeater shows row-count in the node tooltip
  ("3 added"); stacked/tile styles preferred at this width.
- Visibility: hidden sections remove their node; connector re-joins
  seamlessly (no orphan stubs) — test fixture.
- Spine gutter consumes ~64px of `maxWidth: medium` — element `Column_Width__c`
  layouts are otherwise unaffected.

## 9. Open questions

- Era labels for single-page forms with many sections — group by nothing, or
  allow designer-defined groups? (defer to v1.1 with the fast-follow build)
