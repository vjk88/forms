# Design Explorations Audit

> Reconciles the 5 HTML mockups in `design-explorations/` against the
> archetype boards and the Layout/Theme Spec contracts. Reviewed 2026-06-10.
> Rule: mockups are the **design north star**; boards/specs absorb their
> details or explicitly record why not.

## Mapping

| Mock | Archetype | Verdict |
|---|---|---|
| 01-conversational-survey | [conversational](archetypes/conversational.md) | aligned; details absorbed (below) |
| 02-split-demo-request | [split-hero](archetypes/split-hero.md) | aligned; brand-panel content extended |
| 03-wizard-application | [wizard-stepper](archetypes/wizard-stepper.md) | **structural gap fixed**: rail stepper + live summary |
| 04-glass-event-registration | [immersive-glass](archetypes/immersive-glass.md) | aligned; default flipped to dark glass + mesh |
| 05-admin-record-edit | [console](archetypes/console.md) | **new archetype #13 (core)** |

(`design-explorations/new desings/` is currently empty — drop future mocks
there and re-run this audit.)

## Style 01 — Conversational (warm editorial)

Absorbed into the board + Theme Spec:
- **`inputStyle: "underline"`** — borderless inputs, bottom hairline, answer
  text set in the *display* font at display size. New Theme Spec key
  (`outline | underline | filled`, default `outline`).
- **`texture: "grain"`** — SVG fractal-noise paper grain overlay (multiply,
  ~.5 opacity). New Theme Spec key (`none | grain | grid`).
- **Question eyebrow** — small-caps tag + accent dot above each question,
  sourced from the section name ("About you"). Engine chrome.
- **Progress = top hairline bar + `01 / 04` tabular counter** in the header
  (board previously had bottom bar — corrected; bottom bar remains the
  mobile/kiosk variant).
- NPS 0–10 **scale chips with end labels** → element render variant
  (Phase 5, see §Cross-cutting).
- Choice cards with A/B/C key badges — already on the board; mock confirms
  hover-nudge (translateX) and `:has(:checked)` fill styling.

## Style 02 — Split / Luxe

- **Brand panel content tokens extended**: `props` (tick'd value-prop list)
  and `quote` (testimonial: text, attribution, avatar initials). Content is
  authored in form settings (like logo/description); panel renders tokens in
  order. LAYOUT_SPEC §4 allowlist updated.
- **`panelDecor: "frame"`** — inset hairline frame (gold, 18px inset) on the
  brand panel. New Theme Spec key (`none | frame`).
- `inputStyle: "underline"` again (luxe variant) — same key as Style 01.
- Mobile: mock hides the panel < 880px; board keeps the compact top-band
  (brand presence + progress survive). Deliberate divergence — recorded.

## Style 03 — Industrial Wizard  ⚠ structural gap (fixed)

The mock is a 3-column structure my original board didn't cover:
`[vertical stepper rail | form sheet | sticky live summary]`.

- **`shell.stepperPlacement: "top" | "rail"`** (new shell key). `rail` =
  sticky left rail, numbered circular nodes with sub-labels, connector line,
  done/active states. Top remains the default; the gallery shows the rail
  variant for this preset.
- **Live Summary widget** — sticky right panel auto-summarizing answered key
  fields (designer picks which), progress %, plus meta rows (reference #,
  opened date, autosave time). This is a **non-field element** placed in a
  sticky span-3/4 zone — spec'd in Phase 5 (widgets), placement already legal
  in Layout Spec v1. Used by both Style 03 and Style 05.
- **Sheet meta bar** — `STEP 02/05 — BUSINESS` label + `DRAFT · autosaved
  14:22` pill. Autosave itself = Phase 5 feature spec (drafts); the chrome
  slot ships with the archetype.
- **Segmented control** for short picklists (≤ 5 options) → element render
  variant (Phase 5).
- `texture: "grid"` — 28px grid-paper background lines (same Theme Spec key
  as grain).
- Skin confirmed: `LAYOUT_TEMPLATES.stepped` (amber `#e6571f`, mono labels,
  `#eceae4`) descends from this mock — board skin unchanged, label styling
  tightened (small-caps mono micro-labels = skin `labelStyle: "mono-caps"`,
  new optional key).

Updated preset spec sketch for the gallery default:

```jsonc
{
  "archetype": "wizardStepper",
  "shell": { "nav": "stepper", "stepperPlacement": "rail", "chrome": "card", "maxWidth": "wide" },
  "pages": [{ "pageKey": "p_business", "grid": 12, "zones": [
    { "type": "zone", "span": 9, "children": [ { "type": "stack", "sections": ["sec_business"] } ] },
    { "type": "zone", "span": 3, "sticky": true, "children": [ { "type": "stack", "sections": ["w_summary"] } ] }
  ]}]
}
```

(`w_summary` = a widget-backed pseudo-section; widget placement contract
finalized in the Phase 5 widgets spec.)

## Style 04 — Glass / Immersive

- **Default skin flips to dark glass** per mock: `surface:
  rgba(255,255,255,.08)`, `dark: true` (text-token flip already exists in
  formThemes), neon multi-stop accent. Light glass (old default) stays as a
  second preset skin ("Glass Light").
- **`bgEffect: "mesh"`** — animated blurred gradient blobs (4 hues,
  screen-blend, 18s float) + grain. New Theme Spec key (`none | mesh`);
  disabled under `prefers-reduced-motion` and on `collapseBelow` widths
  (perf). AI may select hues; motion params are fixed tokens.
- **Gradient display title** — `titleStyle: "gradient"` (new optional Theme
  Spec key; clip-text with accent stops, falls back to solid).
- Ticket-type **price cards** (radio-as-cards w/ title+subtitle) and
  **quantity stepper** (− n +) → element render variants (Phase 5).
- "312 spots left" live chip → capacity/live-data widget; **deferred post-GA**
  (needs a data source contract; recorded in Phase 5 backlog, not promised).

## Style 05 — Back-office Record Edit → NEW archetype: Console

Nothing in the original 12 covered this composition; added as
[console](archetypes/console.md), **core tier** (it's the internal record-edit
experience and Forms are object-bound — high usage):

- App-chrome topbar: breadcrumb (object icon / list / record), Cancel + Save
  actions; sticky.
- Record title row with status + reference badges.
- Label-left compact rows (`labelPosition: "left"`, 160px label col,
  hairline row separators) — reuses the Document board's Theme Spec key.
- Main column + 250px side **System/meta card** (Live Summary widget again,
  meta-rows variant).
- **Inline related-list table with add-row + totals footer** — formRepeater
  table style + new `totals` option (Phase 5 repeater spec addition).
- Sticky bottom savebar (gradient fade) — submit `placement:
  "stickyBottom"` already in spec.

## Cross-cutting outcomes

1. **Theme Spec keys added** (all optional, token-driven, any archetype):
   `inputStyle`, `texture`, `bgEffect`, `titleStyle`, `panelDecor`,
   `labelStyle` — plus previously added `labelPosition`, `controlScale`.
2. **Shell key added:** `stepperPlacement` (LAYOUT_SPEC §4/§6 schema).
3. **Brand panel tokens extended:** `props`, `quote`.
4. **Element render variants are now a confirmed Phase 5 pillar** (the user's
   "option to rerender each element"): segmented control, choice cards w/ key
   badges, price cards, NPS scale, quantity stepper — each = a `renderAs`
   variant on Form_Element__c with type-compatibility rules.
5. **Widgets (non-field elements) pillar confirmed:** Live Summary (03, 05),
   meta rows, capacity chip (deferred). Placed as widget-backed
   pseudo-sections in zones.
6. **Webfonts:** all five mocks use Google Fonts (Fraunces, Hanken Grotesk,
   DM Serif, Archivo, Space Mono, Unbounded, Manrope, IBM Plex). LWS/CSP
   requires **static resources** — Phase 1 task: bundle the chosen pairings
   as static resources and extend `FONT_PAIRINGS` (mock fonts → new pairings:
   `editorial-warm`, `luxe-serif`, `industrial`, `neon`, `plex`). License
   check required before bundling (all listed are OFL — verify).
7. **Archetype count: 13** (11 core + Timeline/Kiosk fast-follow).
