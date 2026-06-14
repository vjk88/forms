# Creation Wizard — UX Spec & Wireframes

> Phase 0 deliverable. Replaces `c/newFormDialog` as the form-creation entry
> point. Goal: a user picks **Primary Object + Layout + Theme** and sees a
> live, honest preview the whole time — or describes the form in natural
> language and lets AI propose all three.

---

## 1. Principles

1. **The preview never lies.** The right pane is the real `c/formLayoutEngine`
   rendering a real (seeded) spec at reduced scale — not illustrations. What
   you see on Create is what opens in the builder.
2. **Three decisions, nothing else.** Name/object → layout → theme. Everything
   else (adapters, pages, visibility, autofill) belongs in the builder;
   the wizard offers them only behind "Advanced".
3. **AI is an accelerator on the side, never a gate.** Every step is fully
   usable with zero AI licenses; AI affordances are feature-detected and
   disappear cleanly.
4. **Escape hatches everywhere.** Back never loses state; Create is allowed
   from step 2 onward (theme defaults to the archetype's skin).

## 2. Entry points & shell

- "New Form" / "New Survey" buttons (forms home in `formDesigner`) → opens the
  wizard **full-screen** (SLDS modal `slds-modal_full` pattern; the old small
  dialog can't host a live preview).
- New LWC: `c/formCreationWizard`. `newFormDialog` is retired when this ships
  (Phase 2); its create payload contract is extended, not broken.

```
┌──────────────────────────────────────────────────────────────────────┐
│  New Form                                       ① Basics ② Layout ③ Theme   ✕ │
├──────────────────────────────────────┬───────────────────────────────┤
│                                      │   LIVE PREVIEW                │
│         (step content)               │  ┌─────────────────────────┐  │
│                                      │  │                         │  │
│                                      │  │   real formLayoutEngine │  │
│                                      │  │   scale .45 · inert     │  │
│                                      │  │                         │  │
│                                      │  └─────────────────────────┘  │
│                                      │   [🖥 Desktop] [📱 Mobile]     │
├──────────────────────────────────────┴───────────────────────────────┤
│  [← Back]                                  [Create form]  [Next →]   │
└──────────────────────────────────────────────────────────────────────┘
```

- Preview pane: fixed right, ~42% width, `formLayoutEngine` with
  `preview-scale=0.45`, `inert` (no focus/validation), device toggle
  re-renders at mobile width (shows each archetype's collapse behavior —
  this sells the engine).
- Step indicator doubles as navigation for *completed* steps.
- Footer: `Create` enabled from step 2 (uses current selections + default
  skin); `Next` advances; `Esc`/`✕` confirms discard if dirty.

## 3. Step 1 — Basics

```
┌─ STEP 1 · BASICS ────────────────────────────┐
│  What are you building?                      │
│  ┌──────────────┐  ┌──────────────┐          │
│  │ ● Form       │  │ ○ Survey     │          │
│  │ reads/writes │  │ collects     │          │
│  │ a record     │  │ responses    │          │
│  └──────────────┘  └──────────────┘          │
│                                              │
│  Name          [ Contact Request          ]  │
│  Primary Object[ 🔍 Contact            ▾  ]  │
│   ↳ New records are created or updated on    │
│     this object.                             │
│                                              │
│  ✦ Start with AI                             │
│  ┌────────────────────────────────────────┐  │
│  │ Describe your form… "A clinic intake   │  │
│  │ form for new patients with insurance   │  │
│  │ details and consent"                   │  │
│  └────────────────────────────────────────┘  │
│                       [✦ Generate draft]     │
│                                              │
│  ▸ Advanced (surfaces / adapters)            │
└──────────────────────────────────────────────┘
```

- Form/Survey cards keep `newFormDialog`'s type-aware behavior (object
  required for Form; "Related To (optional)" for Survey).
- **Object picker** = searchable combobox (orgs have hundreds of objects);
  reuses the existing `objectOptions` source from FormDesignerController.
- On object selection → `getSeedFields` (§7) fires → **preview immediately
  renders Classic + default skin with real field labels.** First "wow" moment;
  before object selection the preview shows a neutral skeleton form.
- "Advanced" collapsible = the adapter checkboxes from `newFormDialog`,
  defaulted `Internal_Record_Page` (+`Public_Guest` for Surveys). Adapter
  choice feeds layout recommendations in step 2.
- **Start with AI** (feature-detected): see §6. When Einstein GenAI is not
  provisioned, the ✦ block is **omitted entirely — never rendered disabled or
  locked**. The wizard reads as complete, not as a teaser for a missing
  license (same rule in step 3 and the copilot button; see §9).

## 4. Step 2 — Layout

```
┌─ STEP 2 · LAYOUT ────────────────────────────────────┐
│  Pick a structure. You can change it anytime.        │
│  Filter: [All] [Guest-friendly] [Internal] [Surveys] │
│                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │
│  │▦ mini  │ │▦ mini  │ │▦ mini  │ │▦ mini  │         │
│  │preview │ │preview │ │preview │ │preview │         │
│  │Classic │ │Split   │ │Wizard★ │ │SideNav │         │
│  └────────┘ └─Hero───┘ └────────┘ └────────┘         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │
│  │Convers.│ │Glass   │ │Mosaic  │ │Document│         │
│  └────────┘ └────────┘ └────────┘ └────────┘         │
│  ┌────────┐ ┌────────┐ ┌────────┐                    │
│  │Accord. │ │Tabbed  │ │Console │                    │
│  └────────┘ └────────┘ └────────┘                    │
│   ★ Recommended for your object & audience           │
└──────────────────────────────────────────────────────┘
```

- **11 core archetype cards, grouped into labeled bands** so structurally
  similar options don't read as duplicates at thumbnail scale:
  - *Simple & scrolling*: Classic · Document
  - *Guided, step by step*: Wizard Stepper · Conversational · Accordion
  - *Organized panes*: Side-Nav · Tabbed Card · Mosaic Grid · Console
  - *Brand showcase*: Split Hero · Immersive Glass
- Each card carries three differentiators beyond the thumbnail: a **nav
  glyph** (rail bars / tab row / step dots / chevron stack — the structural
  signature), a **one-line caption** from the board's `recommendWhen`
  metadata, and the audience tag. The caption is what disambiguates Side-Nav
  vs Tabbed vs Accordion ("jump around long forms" / "categories in one card"
  / "complete in passes").
- Card thumbnails are the engine itself at `preview-scale=0.18`, rendered
  once with the seed sections and the archetype's default skin, then
  snapshot-frozen (render → `inert`, no ongoing cost; 11 tiny engine
  instances at once is the perf test for the harness). Thumbnails always show
  **desktop** structure — the device toggle affects only the main preview
  (mobile thumbnails would all collapse to the same column and erase the
  differences).
- Click card → main preview animates to that archetype **with the seed
  fields re-materialized** through the archetype's fill rule (multi-zone for
  Mosaic, rail for Wizard, etc.).
- **★ Recommended** badges (max 2): rule-based from the boards' `ai` metadata
  — needs no AI license. Inputs: type (Survey → Conversational/Accordion),
  adapters (guest → guest-friendly set; internal-only → Console/SideNav/
  Mosaic), seed field count. With AI present, the badge copy gets a one-line
  generated rationale; without, a static line from the board.
- Filter chips map to the boards' `audience` metadata. No search — 11 items.
- Selecting Wizard/Tabbed on what will be a single-page form: preview shows
  the auto-grouping (sections → steps/tabs) per the tabbed-card board's
  zero-friction default.

## 5. Step 3 — Theme

```
┌─ STEP 3 · THEME ─────────────────────────────┐
│  Skins                                       │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐     │
│  │●Warm│ │Slate│ │Luxe │ │Neon │ │Paper│ …   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘     │
│                                              │
│  Brand color   [■ #c2502e]  (picker)         │
│  Font pairing  [ Editorial Warm        ▾ ]   │
│  Logo          [ Upload… ]  (optional)       │
│                                              │
│  ✦ Describe your brand                       │
│  ┌────────────────────────────────────────┐  │
│  │ "Warm, editorial, terracotta — like a  │  │
│  │  boutique studio, not a bank"          │  │
│  └────────────────────────────────────────┘  │
│            [✦ Generate theme]  [↺ Try again] │
└──────────────────────────────────────────────┘
```

- Skin chips: the selected archetype's **default skin first + 5–7 curated
  cross-archetype skins** (each chip = accent dot + font initial + bg
  swatch). Selecting re-themes the live preview instantly (pure CSS token
  swap — zero re-render cost, `themeVars` already works this way).
- Brand color: sets `accent`/`submitColor`; derived hover/soft tones come
  from existing token math. Contrast guard runs live — failing combos show
  an inline warning and auto-suggest the nearest passing shade.
- Logo upload: optional here (reuses FormAssetController); fully editable
  later in the builder. Uploading offers "Match my colors" (client-side
  canvas palette extraction — the no-AI fallback from MASTER_PLAN Tier 3).
- **Describe your brand** (feature-detected): Tier-1 prompt template returns
  a full Theme Spec patch → validator → preview. `Try again` regenerates with
  the same prompt; every result is undoable (local history in the wizard).

## 6. "Start with AI" path (from Step 1)

> PHASE 4 (owner 2026-06-13: all AI consolidated to Phase 4 — see
> MASTER_PLAN §5). Also note creation pivoted to gallery-first (PHASE2_WORKPLAN),
> so this lands in the gallery/preview, not the wizard. AI output = a validated
> Theme/Layout token patch, never raw CSS. Deferred until Phase 4; gallery is
> fully usable without it.

One-shot generation; lands the user in the normal wizard with everything
pre-selected — never a separate flow they can't steer.

1. User types a description (object may be picked or blank).
2. Tier-1 prompt template (grounded with: org object list the user can
   access, archetype `ai` metadata, skin catalog) returns a **proposal JSON**:
   `{ objectApiName?, formName, archetype, themePatch, sectionPlan[] }` —
   `sectionPlan` = named sections with field API names (validated against
   describe; unknown fields dropped, never invented in the preview).
3. Validator pass → wizard jumps to **step 3 with steps 1–2 filled**, preview
   showing the full proposal. A dismissible banner reads: *"AI draft — review
   the object and layout before creating."* Object/AI-chosen values are
   editable like any manual selection.
4. Reject path: "Discard draft" restores whatever the user had entered.

Guardrails: proposal must pass the same Layout/Theme validators as everything
else; if the model suggests an object the user lacks access to, the proposal
downgrades to "no object" and step 1 asks for it. No record data is ever sent
— only describe metadata (field labels/types) and the user's prompt.

## 7. Seed fields (Apex)

`FormObjectDescribeController.getSeedFields(objectApiName)`
(`@AuraEnabled(cacheable=true)`, USER_MODE):

- Pick order: Name/auto-name compound → required+createable customs →
  required+createable standards → top createable standards; **cap 6, min 3**
  (pad with common createable fields when the object has < 3 required).
- Excludes: system/audit fields, non-createable, compound children when the
  compound parent is included, Owner/RecordType (builder concerns).
- Returns `{ apiName, label, type, required, picklistSample[3] }` — enough
  for `fieldPreview`-style rendering with honest control types.
- Errors (no access, bad object): preview falls back to the neutral skeleton
  + inline notice; wizard remains usable (layout/theme still selectable).

## 8. Create action

Extends `FormDesignerController.createForm` (additive params — old callers
unaffected until retired):

```
createForm(formName, objectApiName, formType, layoutMode,   // existing
           allowedAdapters,                                  // existing
           layoutSpecJson,   // materialized preset, validator-checked
           themeJson,        // selected/AI skin
           seedFields[])     // → real Form_Page__c/Section__c/Element__c rows
```

- `layoutSpecJson` and `themeJson` pass through `FormLayoutSpecValidator` /
  the theme validator **server-side before persistence** — the wizard has no
  bypass path (LAYOUT_SPEC §6 single-writer invariant applies to all
  producers: wizard, copilot, manual edits).
- **Seeds become real elements** (one "Details" section, or the AI
  `sectionPlan`) — the builder opens showing exactly what the preview showed.
  Deleting them is one click; an empty builder after a rich preview would be
  a bait-and-switch.
- All writes USER_MODE inside the existing trigger-handler key generation
  (`Key__c` slugs) so the spec's `pageKey`/`sectionKey` references resolve.
- On success → route to the builder, first-run hint anchored on the (new)
  copilot button.

## 9. States, a11y, edge cases

| Case | Behavior |
|---|---|
| No Einstein GenAI license | Both ✦ blocks absent (not disabled — absent); recommendation badges use static board copy |
| Describe callout slow | Preview keeps prior render + shimmer; seed call is cacheable and pre-warmed on object hover |
| Object with 0 createable required fields | Pad rule (§7); never an empty preview |
| Guest adapter + internal-only archetype (Console) | Card shows "internal only" tag and is de-emphasized, not hidden |
| Very long object names/labels | Truncate with title tooltip in preview |
| Keyboard | Full traversal: cards are radio-group semantics (`roving tabindex`), step indicator is `aria-current`, preview pane `aria-hidden` (decorative duplicate of choices) |
| Reduced motion | Archetype-switch animation replaced by crossfade; mesh effect off in preview |
| Dirty close | Confirm discard; "Start with AI" drafts count as dirty |

## 10. Build notes (Phase 2)

- New: `c/formCreationWizard` (shell + steps), `c/archetypeGallery`
  (step 2 cards — reused later by the builder's "change layout" flow),
  `FormObjectDescribeController`.
- Reused: `c/formLayoutEngine` (preview), `c/formThemes` (skins/tokens),
  FormAssetController (logo), createForm (extended).
- The skin-chip strip and brand controls are shared with the builder's theme
  panel — build once as `c/skinPicker`.
- Jest: wizard state machine, seed-field fallback, recommendation rules.
  Apex: describe pick-order matrix across Contact/Lead/Case/custom-heavy
  objects (same fixtures as the mosaic fill-rule QA).

## 11. Open questions

- Survey without object: preview seeds from a generic question set (NPS,
  rating, comment) instead of describe — confirm the canned set.
- Should step 2 remember the last-used archetype per user (`saved
  preference`) and pre-select it? (leaning: no pre-select; show ★ only —
  creation intent varies per form)
- Template gallery (existing `templateGallery` full-form templates) — fold in
  as a 4th entry tab ("Start from template") or keep separate? (leaning:
  fold in at Phase 2, as step-1 alternative alongside Start with AI)
