# Split Hero

## 1. Identity

| | |
|---|---|
| id | `splitHero` |
| tier | core |
| nav | `scroll` (single page) or `stepper` (multi-page) |
| chrome | `fullbleed` |
| density | comfortable |
| legacy mapping | `split` |

A fixed brand panel (image/gradient, logo, title, progress) beside a scrolling
form pane. The brand-forward marketing/registration layout.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [event, registration, signup, marketing, brand, campaign, webinar, application]
  fieldCount: { min: 4, max: 30 }
  pages: single-or-multi
  audience: [guest, internal]
  recommendWhen: "public-facing forms where brand presence matters; has logo/bg image"
  avoidWhen: "embedded/flow surfaces (no room for the panel) or dense internal data entry"
```

## 3. Structure (desktop)

```
┌──────────────────┬─────────────────────────────┐
│   BRAND PANEL    │   (scrolls)                 │
│   (sticky)       │   ▸ Section: Contact        │
│                  │     [field] [field]         │
│   ◉ Logo         │   ▸ Section: Address        │
│   Title          │     [field] [field]         │
│   Description    │   ▸ Section: Details        │
│                  │     [field]                 │
│   ●●○○ progress  │                             │
│                  │                  [Submit]   │
│      38%         │            62%              │
└──────────────────┴─────────────────────────────┘
```

Panel background = skin `pageBg` (gradient or uploaded image via
FormAssetController); form pane = skin `surface`.

## 4. Preset spec

Fill rule: pages preserved; each page → one span-12 zone, single stack. The
split itself is **shell-level** (`brandPanel`), not a zone — content zones
describe only the form pane. Multi-page forms get `nav: "stepper"` with the
step indicator rendered inside the brand panel (`progress` in panel content).

```json
{
  "version": 1,
  "archetype": "splitHero",
  "density": "comfortable",
  "shell": {
    "nav": "stepper",
    "chrome": "fullbleed",
    "maxWidth": "full",
    "header": "none",
    "progress": "auto",
    "brandPanel": {
      "side": "left", "width": "38%", "sticky": true,
      "content": ["logo", "title", "description", "progress"]
    },
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

Note: zones inside the form pane still work — an AI op can split the pane into
columns (`columns` node) since the pane is just a narrower grid context.

## 5. Default skin

Evolves `LAYOUT_TEMPLATES.split`:

```js
{ name: 'splitHero', label: 'Split Hero', font: 'luxe',
  accent: '#c9a24b', surface: '#ffffff',
  pageBg: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)',
  radius: 'sharp', cardShadow: 'none', sectionDefault: 'plain', glass: false }
```

## 6. Interaction & nav behavior

- Brand panel is sticky/fixed; form pane scrolls independently.
- `header: none` — the panel *is* the header (logo/title/description live there).
- Stepper mode: back/next at pane bottom; step list or dots in the panel.
- `submit.placement: "brandPanel"` is a valid variant (CTA in the panel) —
  offered as a designer toggle, not the default.

## 7. Mobile collapse

- Panel becomes a compact **top band**: logo + title + progress only
  (description hidden). Band is ~96px, not sticky.
- Form pane goes full-width below; otherwise behaves like Classic mobile.
- Panel background image gets a height-capped crop (no full-screen bg on phones
  — data cost + readability).

## 8. Repeaters & edge cases

- Repeaters fine in the pane; table style limited to pane width — designer
  lint suggests stacked/tile styles when pane < 700px effective.
- Guest: primary audience. Panel image must respect the public-files hardening
  TODOs (see config-image-storage memory) before GA.
- If no logo/image uploaded, panel renders gradient + title only (never an
  empty image slot).

## 9. Open questions

- Panel `side: right` variant in gallery as a one-click flip, or property-panel
  only? (leaning: property-panel only, keep the gallery to one card per archetype)

## 10. Exploration alignment — `design-explorations/02-split-demo-request.html`

- **Brand panel content extended** with `props` (tick'd value-prop list) and
  `quote` (testimonial text + attribution + avatar initials) tokens —
  authored in form settings, rendered in `content` order. The luxe gallery
  default uses `["logo", "title", "description", "props", "quote"]`.
- **`panelDecor: 'frame'`** — inset gold hairline frame on the panel (new
  Theme Spec key).
- Default skin gains `inputStyle: 'underline'`; fonts upgrade to the
  `luxe-serif` pairing (DM Serif Display + Hanken Grotesk) with the webfont
  bundle.
- **Deliberate divergence:** mock hides the panel < 880px; the board keeps
  the compact top band (brand + progress survive on mobile). Revisit only if
  preview testing disagrees.
