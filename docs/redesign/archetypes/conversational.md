# Conversational

## 1. Identity

| | |
|---|---|
| id | `conversational` |
| tier | core |
| nav | `oneAtATime` |
| chrome | `fullbleed` |
| density | comfortable |
| legacy mapping | — (new) |

One question per screen, full-height, keyboard-first. The Typeform-style
experience — the survey killer feature.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [survey, feedback, quiz, nps, poll, csat, research, vibe, engaging]
  fieldCount: { min: 3, max: 25 }
  pages: flattened   # zones/pages ignored; linear by definition
  audience: [guest]
  recommendWhen: "surveys and feedback where completion rate > data density; Survey type forms"
  avoidWhen: "record data entry, address blocks, anything users need to see at once; internal users"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│ ◉ Logo                          3 → of 12  │
│                                            │
│                                            │
│        3 →  How satisfied are you          │
│             with our service? *            │
│                                            │
│        ○ Very  ○ Somewhat  ○ Not at all    │
│                                            │
│             [OK ✓]   press Enter ↵         │
│                                            │
│ ━━━━━━━━━━━╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍  25%         │
└────────────────────────────────────────────┘
```

One **element** per screen. Large display type (skin `display` font), generous
whitespace, bottom progress bar.

## 4. Preset spec

Fill rule: pages and zones are flattened into a single linear sequence (engine
derives it from section/element order). The spec keeps the canonical zone
structure anyway so switching *away* from conversational restores structure
losslessly — `oneAtATime` simply ignores it at render (LAYOUT_SPEC §4).

```json
{
  "version": 1,
  "archetype": "conversational",
  "density": "comfortable",
  "shell": {
    "nav": "oneAtATime",
    "chrome": "fullbleed",
    "maxWidth": "narrow",
    "header": "minimal",
    "progress": "bar",
    "submit": { "placement": "flow", "alignment": "left" }
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

New `LAYOUT_TEMPLATES.conversational`:

```js
{ name: 'conversational', label: 'Conversational', font: 'editorial',
  accent: '#e8590c', surface: 'transparent', pageBg: '#faf7f2',
  radius: 'round', cardShadow: 'none', sectionDefault: 'plain', glass: false }
```

No card — the page *is* the surface. Type scale token bumps display size
(`--c-q-scale: 1.6`).

## 6. Interaction & nav behavior

- **Keyboard-first:** Enter/`OK` advances; Shift+Enter goes back; choice fields
  accept letter shortcuts (A/B/C badges); autofocus on every screen.
- Validation runs on advance; errors shown inline, never modal.
- Section titles render as **interstitial screens** ("Next: About you") only
  when a section has a description — otherwise sections are invisible seams.
- Transition: 250ms vertical slide (respect `prefers-reduced-motion`).
- Last screen = review-less submit by default; pairs with completion-preview
  Phase 2 work for a review screen option.

## 7. Mobile collapse

Natively mobile — same experience. Bottom progress bar sits above the keyboard
safe-area; `OK` button enlarges to thumb size.

## 8. Repeaters & edge cases

- **Repeaters (settles LAYOUT_SPEC §12):** a repeater section = **one screen**
  showing the stacked-card style with add/remove — never one-screen-per-row
  (unbounded screen count breaks the progress fraction).
- Multi-element rows (`Column_Width__c`) are decomposed to one element per
  screen — designer lint informs the builder.
- Composite fields the engine keeps together on one screen: address-style
  groups explicitly marked in section config (future flag), checkbox consent +
  its rich-text disclosure.
- Guest: primary audience. Internal record pages: lint-warned.

## 9. Open questions

- Letter-shortcut badges on picklists with > 8 options — cap shortcuts at 8 or
  fall back to dropdown? (leaning: fall back to dropdown ≥ 8)

## 10. Exploration alignment — `design-explorations/01-conversational-survey.html`

This mock is the visual north star for the archetype. Deltas absorbed:

- **Progress** = top hairline bar + `01 / 04` tabular-nums counter in the
  header (corrects §3/§6 which placed the bar at the bottom; bottom bar is
  now the mobile/kiosk variant only).
- **Question eyebrow**: small-caps tag + accent dot above each question,
  sourced from the section name — engine chrome.
- **Default skin gains** `inputStyle: 'underline'` (borderless inputs, answer
  text in the *display* serif at large size) and `texture: 'grain'` (paper
  noise overlay). Skin fonts upgrade to the `editorial-warm` static-resource
  pairing (Fraunces + Hanken Grotesk) when the webfont bundle ships.
- Choice-card styling confirmed: hover nudge, key badge fill on selection.
- NPS 0–10 **scale chips with end labels** → `renderAs: 'scale'` element
  variant (Phase 5).
