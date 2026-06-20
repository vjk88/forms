# Kiosk

## 1. Identity

| | |
|---|---|
| id | `kiosk` |
| tier | **fast-follow** (board final; engine work deferred — reuses Conversational's oneAtATime machinery + a scale token) |
| nav | `oneAtATime` |
| chrome | `fullbleed` |
| density | comfortable (scaled up) |
| legacy mapping | — (new) |

Oversized type and touch targets, one question (or compact section) per
screen, card-carousel transitions. Built for tablets at front desks, events,
and field check-ins.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [kiosk, check-in, event, tablet, front desk, registration desk, walk-in, visitor, clinic]
  fieldCount: { min: 2, max: 12 }
  pages: flattened
  audience: [guest]   # often a shared device with a guest-session form
  recommendWhen: "shared-device / tablet capture; standing users; short attention windows"
  avoidWhen: "desktop users, long forms, anything with lookups or complex inputs"
```

## 3. Structure (tablet, landscape-first)

```
┌──────────────────────────────────────────────────┐
│  ◉ Logo                              ● ● ○ ○     │
│                                                  │
│           Welcome! What's your name?             │
│                                                  │
│        ┌──────────────────────────────┐          │
│        │  (xl input, 64px tall)       │          │
│        └──────────────────────────────┘          │
│                                                  │
│   [◀ Back]                  [ Continue ▶ ] (xl)  │
│                                                  │
└──────────────────────────────────────────────────┘
```

Carousel slide transition between screens (horizontal, 300ms); idle-reset
banner after timeout.

## 4. Preset spec

Fill rule: identical to Conversational (linear, structure preserved-but-
ignored); differences are shell + skin scale.

```json
{
  "version": 1,
  "archetype": "kiosk",
  "density": "comfortable",
  "shell": {
    "nav": "oneAtATime",
    "chrome": "fullbleed",
    "maxWidth": "wide",
    "header": "minimal",
    "progress": "dots",
    "submit": { "placement": "stickyBottom", "alignment": "stretch" }
  },
  "pages": [
    { "pageKey": "p_main", "grid": 12, "zones": [
      { "type": "zone", "span": 12, "children": [
        { "type": "stack", "sections": ["sec_contact", "sec_consent"] }
      ]}
    ]}
  ],
  "responsive": { "collapseBelow": "480px", "collapseOrder": "source" }
}
```

## 5. Default skin

New `LAYOUT_TEMPLATES.kiosk`:

```js
{ name: 'kiosk', label: 'Kiosk', font: 'geometric',
  accent: '#d4380d', surface: '#ffffff', pageBg: '#111827',
  radius: 'pill', cardShadow: 'strong', sectionDefault: 'plain',
  glass: false, dark: false, controlScale: 1.5 }
```

New Theme Spec key: `controlScale` (1–1.5) multiplying control-height, font
and tap-target tokens — usable by any archetype, defaulted here.

## 6. Interaction & nav behavior

- Touch-first: no keyboard hints (unlike Conversational); choice fields render
  as large tappable cards, not radios.
- **Idle reset:** configurable timeout (default 60s) → "Still there?" → resets
  to screen 1 and clears state. Privacy-critical on shared devices: ensure no
  answer persistence client-side after reset.
- Thank-you screen auto-returns to start after 5s (next visitor).
- Back allowed; progress as large dots.

## 7. Mobile collapse

Phones work (it degrades to Conversational-with-big-buttons) but tablets are
the target; gallery copy and AI metadata say so.

## 8. Repeaters & edge cases

- Repeaters: lint-discouraged (add/remove row management contradicts the
  walk-up model); if present, one screen with stacked style, like
  Conversational.
- Lookups/multi-selects: lint-warned (typing-heavy on glass keyboards).
- Guest session hygiene: idle reset + no autofill from prior visitor + double
  submit-guard — security checklist items for the guest controller
  (FormGuestController) when this ships.
- Signature element (Phase 5 non-field element) is a likely pairing — note in
  that spec.

## 9. Open questions

- Idle-reset configurable where — form Settings tab or shell key? (leaning:
  form Settings; it's behavior, not layout)
- Multi-language toggle on screen 1 for walk-up audiences? (defer; depends on
  translation story, post-GA)
