# Archetype Boards — Index

> Phase 0 deliverable. One board per layout archetype. Each board is the
> single source of truth for that archetype's structure, preset spec, default
> skin, mobile behavior, and AI recommendation metadata. The preset specs here
> are what `c/formLayoutEngine` ships as templates and what the wizard gallery
> renders.

## Roster

| # | Archetype | File | Tier | Nav | One-liner |
|---|-----------|------|------|-----|-----------|
| 1 | Classic | [classic.md](classic.md) | core | scroll | Single centered column card — the safe default |
| 2 | Split Hero | [split-hero.md](split-hero.md) | core | scroll/stepper | Fixed brand panel + scrolling form pane |
| 3 | Wizard Stepper | [wizard-stepper.md](wizard-stepper.md) | core | stepper | One page per step, horizontal progress |
| 4 | Side-Nav | [side-nav.md](side-nav.md) | core | sidenav | Vertical section rail + content, jump navigation |
| 5 | Conversational | [conversational.md](conversational.md) | core | oneAtATime | One question per screen, keyboard-first |
| 6 | Immersive Glass | [immersive-glass.md](immersive-glass.md) | core | scroll | Full-bleed background, floating glass card |
| 7 | Mosaic Grid | [mosaic-grid.md](mosaic-grid.md) | core | scroll | 12-col multi-zone grid with sticky summary |
| 8 | Document | [document.md](document.md) | core | scroll | Dense paper/application-form look |
| 9 | Accordion | [accordion.md](accordion.md) | core | accordion | Collapsible sections, one open, completion ticks |
| 10 | Tabbed Card | [tabbed-card.md](tabbed-card.md) | core | tabs | Pages as tabs inside one card |
| 11 | Console | [console.md](console.md) | core | scroll | Back-office record edit: topbar, label-left, side meta, repeater tables |
| 12 | Timeline | [timeline.md](timeline.md) | fast-follow | scroll | Vertical milestone spine, sections as stops |
| 13 | Kiosk | [kiosk.md](kiosk.md) | fast-follow | oneAtATime | Oversized touch targets for front-desk/events |

**Tier decision (settles LAYOUT_SPEC §12):** ship the 11 *core* archetypes in
Phase 1; Timeline and Kiosk are fast-follows (their boards are final, the
engine work is deferred). Rationale: Timeline shares 90% of its engine path
with Classic (spine is chrome), Kiosk shares the oneAtATime machinery with
Conversational — both are cheap later, and 11 strong launch options beat 13
rushed ones.

**Design sources:** the five mockups in `design-explorations/` are the visual
north star for conversational, splitHero, wizardStepper, immersiveGlass and
console — see [DESIGN_EXPLORATIONS_AUDIT.md](../DESIGN_EXPLORATIONS_AUDIT.md)
for the mock-by-mock reconciliation and the Theme Spec keys they introduced
(`inputStyle`, `texture`, `bgEffect`, `titleStyle`, `panelDecor`, `labelStyle`).

## Board template

Every board has these sections, in order:

1. **Identity** — id, tier, nav, chrome, density
2. **When to use / AI metadata** — machine-usable hints for Agentforce
   recommendations (keywords, field-count sweet spot, audience, page count)
3. **Structure (desktop)** — ASCII wireframe
4. **Preset spec** — the parameterized Layout Spec template (JSON)
5. **Default skin** — `LAYOUT_TEMPLATES` entry (Theme Spec)
6. **Interaction & nav behavior** — what the engine does
7. **Mobile collapse** — exact behavior below the breakpoint
8. **Repeaters & edge cases** — related-list sections, visibility, guest notes
9. **Open questions** — if any

## Shared conventions

- **Seed example form** used in every board's spec example: *Contact Request*
  — pages `p_main`, `p_extra`; sections `sec_contact`, `sec_address`,
  `sec_details`, `sec_consent`. Wizard previews seed equivalent stubs from the
  selected object's required fields.
- **Parameterization:** preset specs are templates. At apply time the engine's
  `materialize(preset, pages, sections)` distributes the *actual* sections
  using each board's **fill rule** (documented per board). Switching archetypes
  re-materializes; the orphan rule guarantees nothing is lost.
- **Skins are defaults, not bindings.** Any skin works with any archetype; the
  board's skin is just the gallery default. Skins live in `c/formThemes`
  `LAYOUT_TEMPLATES` and use only `--c-*` tokens.
- **Breakpoint:** all boards assume `collapseBelow: 768px` unless stated.
- **AI metadata block** is YAML frontmatter-style and will be embedded in the
  Agentforce topic instructions / prompt template grounding, e.g.:

```yaml
ai:
  keywords: [registration, application, onboarding]
  fieldCount: { min: 8, max: 40 }
  pages: multi
  audience: [guest, internal]
  avoidWhen: "under 5 fields — overhead outweighs benefit"
```
