# Immersive Glass

## 1. Identity

| | |
|---|---|
| id | `immersiveGlass` |
| tier | core |
| nav | `scroll` |
| chrome | `fullbleed` |
| density | comfortable |
| legacy mapping | `immersive` |

Full-bleed background (gradient or image) with a floating translucent glass
card. Maximum visual impact for short, brand-led forms.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [launch, waitlist, rsvp, premium, modern, bold, newsletter, beta, invite]
  fieldCount: { min: 1, max: 12 }
  pages: single   # multi-page allowed but lint-warned
  audience: [guest]
  recommendWhen: "short, high-impact guest forms; strong brand imagery available"
  avoidWhen: "long forms (glass legibility fatigues); dense data entry; accessibility-critical contexts without contrast check"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│ ███ full-bleed gradient / image ███████████│
│ ██████  ╔══════════════════════╗  █████████│
│ ██████  ║ ◉  Join the waitlist ║  █████████│
│ ██████  ║  (frosted glass)     ║  █████████│
│ ██████  ║  [field]             ║  █████████│
│ ██████  ║  [field] [field]     ║  █████████│
│ ██████  ║        [ Submit ]    ║  █████████│
│ ██████  ╚══════════════════════╝  █████████│
│ ████████████████████████████████████████████│
└────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule: flatten to single glass card; all sections in one stack, `plain`
style (no cards-within-glass).

```json
{
  "version": 1,
  "archetype": "immersiveGlass",
  "density": "comfortable",
  "shell": {
    "nav": "scroll",
    "chrome": "fullbleed",
    "maxWidth": "narrow",
    "header": "hero",
    "progress": "none",
    "submit": { "placement": "flow", "alignment": "stretch" }
  },
  "pages": [
    { "pageKey": "p_main", "grid": 12, "zones": [
      { "type": "zone", "span": 12, "children": [
        { "type": "stack", "sections": ["sec_contact", "sec_address", "sec_details", "sec_consent"] }
      ]}
    ]}
  ],
  "responsive": { "collapseBelow": "768px", "collapseOrder": "source" }
}
```

## 5. Default skin

**Default = dark glass** per `design-explorations/04-glass-event-registration.html`
(the dark text-token flip already exists in `themeVars`):

```js
{ name: 'immersiveGlass', label: 'Immersive', font: 'geometric',
  accent: '#16e0c4', surface: 'rgba(255,255,255,0.08)',
  pageBg: '#08060f', bgEffect: 'mesh',
  meshHues: ['#7a5cff', '#ff2e93', '#16e0c4', '#ffb13d'],
  radius: 'round', cardShadow: 'strong', sectionDefault: 'plain',
  glass: true, dark: true, titleStyle: 'gradient', texture: 'grain' }
```

Today's light-glass `LAYOUT_TEMPLATES.immersive` survives as a second preset
skin (**"Glass Light"**) — existing forms keep their look via the legacy
mapping.

## 6. Interaction & nav behavior

- Card floats centered, vertical padding scales with viewport height.
- Hero header inside the card (logo + display title).
- Background image (FormAssetController) gets a fixed subtle overlay scrim
  token (`--c-bg-scrim`) to guarantee card separation on busy images.
- Multi-page allowed (renders like Classic scroll inside glass) but the AI and
  gallery copy steer short.

## 7. Mobile collapse

- Glass card goes near-full-width with safe-area margins; background fixed
  (no parallax — perf).
- Blur radius reduced via token below breakpoint (`backdrop-filter` cost on
  low-end phones).

## 8. Repeaters & edge cases

- Repeaters: tile/stacked only; table style lint-blocked on glass (contrast
  + width).
- **Contrast is the #1 risk:** the WCAG contrast validator (LAYOUT_SPEC §6 /
  theme validator) is *mandatory* for AI-generated skins on this archetype —
  text tokens vs effective glass surface. The non-AI preset is pre-verified.
- Guest images: same public-file hardening dependency as Split Hero.
- `prefers-reduced-transparency`: falls back to solid `surface` at 0.95 alpha.

## 9. Open questions

- Offer a "video background" slot later? (leaning: no — perf + packaging risk;
  revisit post-GA)

## 10. Exploration alignment — `design-explorations/04-glass-event-registration.html`

- **`bgEffect: 'mesh'`** (new Theme Spec key): 4 blurred gradient blobs,
  screen-blend, slow float animation. Hues AI-selectable (`meshHues`); motion
  parameters are fixed tokens. Disabled under `prefers-reduced-motion` and
  below the breakpoint (perf); falls back to a static gradient built from the
  same hues.
- **`titleStyle: 'gradient'`** — clip-text display title with accent stops;
  solid-color fallback.
- Fonts upgrade to the `neon` pairing (Unbounded + Manrope) with the webfont
  bundle.
- Ticket **price cards** (radio-as-cards with title + price subtitle) and the
  **quantity stepper** (− n +) → `renderAs` element variants (Phase 5).
- "312 spots left" live capacity chip → **deferred post-GA** (needs a
  data-source contract; in the Phase 5 backlog, not promised).
- Legacy-mapping note: forms on the old `immersive` layout map to the
  **Glass Light** skin preset, not the new dark default.
