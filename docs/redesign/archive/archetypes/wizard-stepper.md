# Wizard Stepper

## 1. Identity

| | |
|---|---|
| id | `wizardStepper` |
| tier | core |
| nav | `stepper` |
| chrome | `card` |
| density | comfortable |
| legacy mapping | `stepped` |

One page per step with a horizontal progress indicator. The workhorse for
long, structured processes.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [application, onboarding, enrollment, multi-step, intake, wizard, checkout, claim]
  fieldCount: { min: 10, max: 60 }
  pages: multi   # requires ≥ 2 pages; AI should propose page grouping if form is single-page
  audience: [guest, internal, flow]
  recommendWhen: "10+ fields with natural stages; reduces abandonment on long guest forms"
  avoidWhen: "short forms (steps feel bureaucratic) or forms users revisit non-linearly (use sideNav/tabs)"
```

## 3. Structure (desktop)

```
┌────────────────────────────────────────────┐
│  Logo · Title                              │
│  ① Contact ─── ② Address ─── ③ Review      │
│  ━━━━━━━━━━━━━━━╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍        │
│ ┌────────────────────────────────────────┐ │
│ │  ▸ Section: Contact                    │ │
│ │    [field] [field]                     │ │
│ │  ▸ Section: Address                    │ │
│ │    [field]                             │ │
│ └────────────────────────────────────────┘ │
│  [← Back]                       [Next →]   │
└────────────────────────────────────────────┘
```

Step labels = `Form_Page__c` names. Indicator style (numbered path vs bar vs
dots) follows `shell.progress`.

## 4. Preset spec

Fill rule: pages preserved 1:1 as steps; each page → span-12 zone, single
stack. AI ops may add `columns` inside any step.

```json
{
  "version": 1,
  "archetype": "wizardStepper",
  "density": "comfortable",
  "shell": {
    "nav": "stepper",
    "chrome": "card",
    "maxWidth": "medium",
    "header": "minimal",
    "progress": "auto",
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

Evolves `LAYOUT_TEMPLATES.stepped`:

```js
{ name: 'wizardStepper', label: 'Wizard', font: 'technical',
  accent: '#e6571f', surface: '#f7f6f2', pageBg: '#eceae4',
  radius: 'sharp', cardShadow: 'none', sectionDefault: 'boxed', glass: false }
```

## 6. Interaction & nav behavior

- Forward nav validates the current step (existing per-page validation flow);
  back nav never validates. Clicking a *completed* step in the indicator jumps
  back; future steps are not clickable.
- Submit replaces "Next" on the final step.
- Page-level visibility rules can skip whole steps — indicator renumbers live
  (existing formPlayer behavior, now engine-owned).
- Step state (visited/complete/error) surfaces in the indicator.

## 7. Mobile collapse

- Indicator collapses to `dots + "Step 2 of 4 — Address"` text line.
- Back/Next become a sticky bottom bar (`submit.placement` forced to
  `stickyBottom` below breakpoint) — thumb-reachable.

## 8. Repeaters & edge cases

- Repeaters: a step can be a single repeater section ("Add your dependents") —
  this is the strongest repeater pairing of all archetypes.
- Flow adapter: stepper inside Flow screens is supported but the Flow's own
  nav buttons stay; designer lint warns about double-navigation and suggests
  Classic for `Flow_Screen` adapter.
- Save-and-resume (future feature) slots naturally here — note for Phase 5.

## 9. Open questions

- Should the AI's "Start with AI" path auto-propose page grouping when the user
  picks wizardStepper on a single-page form? (leaning: yes — `setZones`/page
  ops exist; needs a `groupIntoPages` op added to LAYOUT_SPEC §10 in v1.1)

## 10. Exploration alignment — `design-explorations/03-wizard-application.html`

The mock revealed a structural gap: it is a 3-column composition
`[vertical stepper rail | form sheet | sticky live summary]`, not a top
stepper. Absorbed:

- **`shell.stepperPlacement: 'rail'`** (new shell key): sticky left rail with
  numbered circular nodes, sub-labels per step, connector line, done/active
  states. **The gallery default for this archetype is now the rail variant**
  (`maxWidth: wide`); `top` remains for narrow/embedded contexts and is the
  mobile collapse target.
- **Live Summary widget** in a sticky span-3 zone: auto key/value of
  designer-picked answered fields + progress % + meta rows (reference #,
  autosave time). Widget contract in the Phase 5 widgets spec; placement is
  already legal in spec v1 (see updated preset sketch in the audit doc).
- **Sheet meta bar**: `STEP 02/05 — <PAGE>` label + `DRAFT · autosaved 14:22`
  pill (autosave = Phase 5 drafts feature; chrome slot ships now).
- Default skin gains `texture: 'grid'` (28px grid-paper) and
  `labelStyle: 'mono-caps'`; fonts upgrade to the `industrial` pairing
  (Archivo + Space Mono) with the webfont bundle.
- Short picklists (≤ 5 options) default to `renderAs: 'segmented'` in this
  archetype (Phase 5 element variants).
