# Survey Plan — the Surveys half of the product, on the final\* stack

> **Status: APPROVED (owner, 2026-07-27) — all §10 questions ruled; build proceeds per §9 S-slices.**
> This is the program-level plan for Surveys (the second leg of SHIP: Phase A → **Surveys** → package).
> Companions: [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) (spec shapes this extends) ·
> [DATA_MODEL_DELTA.md](./DATA_MODEL_DELTA.md) (answer-store objects) ·
> [GUEST_PREFILL_LOOKUP_SPEC.md](./GUEST_PREFILL_LOOKUP_SPEC.md) (guest + context-link plumbing surveys ride on) ·
> `docs/SURVEYS_BUSINESS_OVERVIEW.md` (OLD-BUILD business doc — model carried forward, statuses stale).
> Authored 2026-07-26.

---

## 0 · TL;DR

A **Survey** is a form whose answers don't become fields on a business object — they land in a
generic **answer store** (`Form_Response__c` + `Form_Response_Answer__c`), always linked to a CRM
record for context. The model is locked ([[project-form-vs-survey-model]]); the schema exists; the
builder can author survey-typed forms. **What doesn't exist yet: survey question widgets, the
answer-store submit runtime, and analytics.** That's this plan.

The UI centerpiece is §2: a **question-type catalog** of 13 v1 types (+2 reserved), each specified
down to its config options, storage column, styling, and narrow-screen behavior.

**Honest status (traced 2026-07-26, not assumed):**

| Piece                                                                                            | Status                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `Form__c.Form_Type__c = 'Survey'`, spec `form.type: "survey"`                                    | ✅ exists (schema + spec §2)                                                |
| `Form_Response__c` + record-link lookups (Contact/Account/Case/Lead/Opp/Campaign + generic pair) | ✅ schema built                                                             |
| `Form_Response_Answer__c` typed columns (Text/Numeric/Date/DateTime/Boolean/Options-JSON)        | ✅ schema built                                                             |
| `Label_Snapshot__c` / `Entry_Index__c` on the answer object                                      | 📐 approved in DATA_MODEL_DELTA §2, not yet deployed                        |
| Survey question widgets (NPS, rating, scale, …)                                                  | ⛔ none on the final\* stack                                                |
| Answer-store submit runtime                                                                      | ⛔ **zero Apex references `Form_Response_Answer__c` today** (grep-verified) |
| Guest render / embed                                                                             | ✅ program Phase A (LWR host + iframe bridge, PRs #132–#139)                |
| Record-context links (`?token=` → response lookups)                                              | ⛔ rides program Phases B/C (signed tokens)                                 |
| Analytics L1/L2/L3                                                                               | ⛔ designed in the old build's overview; carried forward here (§8)          |

---

## 1 · The locked model (recap, one screen)

- **The bright line:** answers need to live as fields on a business object → **Form**. Answers are
  opinions/ratings that vary survey-to-survey → **Survey**. Storage is implied by type — the UI
  never asks. (`Submission_Storage__c` retired, DATA_MODEL_DELTA §2.)
- **Answer store** = EAV-style (_entity–attribute–value: one row per answer, instead of one column
  per question_). Typed value columns keep it queryable — a number stored as a number can be
  averaged; text-blob storage can't.
- **Every response links to CRM context** — concrete lookups for the common objects (native
  reporting: "average CSAT by Account" works out of the box), generic `Related_Record_Id/Type__c`
  pair for anything else.
- **Same builder, same spec, same theme engine.** A survey is a `Form_Version__c` whose
  `Spec_JSON__c` says `"type": "survey"`; elements have `binding: null`; answers key by element id.
  Spec §8 already defines the survey submit contract — this plan builds the machine behind it.
- **Hosting matrix:** Survey ≠ Record Page (locked, HOSTING_ADAPTERS_SPEC). Guest link, embed,
  internal app/tab, Flow screen are all fair game.

---

## 2 · Question-Type Catalog (the UI centerpiece)

### 2.0 Design principles (apply to every type)

1. **Additive registry keys.** Each new type is a widget-registry key (spec §4). Ignore-unknown
   discipline means old runtimes render a placeholder, never crash — v2 types cost nothing to
   reserve.
2. **Reuse before invent.** Choice questions are the existing `field` machinery (`renderAs`:
   Radio / Checkbox_Group / Dropdown / Custom_MultiSelect / Toggle / Slider) plus one new
   presentation enum — not new widgets. Only genuinely new interactions get new keys.
3. **Theme-token styled, zero private colors.** Widgets consume `--c-accent`, the field-surface
   tokens, the shared radius scale, and the focus ring. Result: all 30 built-in themes + custom
   themes + Neon Nights style survey widgets automatically, light and dark, with no per-widget CSS
   forks.
4. **Typed storage is part of the type.** Every type declares which `Form_Response_Answer__c`
   column it writes. That's the substrate for analytics (§8) — never store a rating as text.
5. **Presets, not free numerics.** Scale sizes are segmented choices (5 / 7 / 10), never a "max"
   spinner ([[feedback-copy-formstudio-surfaces]]).
6. **Touch-first + accessible.** ≥44px targets, `radiogroup`/`radio` semantics with arrow-key
   navigation, visible focus, `prefers-reduced-motion` respected, declared narrow behavior per
   type (the UIUX-review #4 contract discipline).

### 2.1 The v1 roster at a glance

| #   | Type                                                                    | Registry key                          | What it captures           | Storage column                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| 1   | **NPS** (_Net Promoter Score — the 0–10 "would you recommend us?" row_) | `nps`                                 | Loyalty, 0–10              | `Numeric_Value__c`                                                |
| 2   | **Rating** (stars/hearts/thumbs)                                        | `rating`                              | Quick quality rating       | `Numeric_Value__c`                                                |
| 3   | **Opinion Scale** (numbered buttons)                                    | `scale`                               | Intensity on 1–5/7/10      | `Numeric_Value__c`                                                |
| 4   | **Emoji Scale** (smiley faces)                                          | `emojiScale`                          | Sentiment at a glance      | `Numeric_Value__c`                                                |
| 5   | **Likert** (_the agree↔disagree scale_)                                 | `likert`                              | Attitude statements        | `Numeric_Value__c` + label in `Text_Value__c`                     |
| 6   | **Yes / No** (two big buttons)                                          | `yesNo`                               | Binary                     | `Boolean_Value__c`                                                |
| 7   | **Single Choice** (list / chips / cards)                                | `field` + renderAs                    | Pick one                   | `Text_Value__c` (option value)                                    |
| 8   | **Multiple Choice** (list / chips / cards)                              | `field` + renderAs                    | Pick many                  | `Selected_Options_JSON__c`                                        |
| 9   | **Dropdown**                                                            | `field` + renderAs                    | Pick one, long lists       | `Text_Value__c`                                                   |
| 10  | **Image Choice** (picture tiles)                                        | `imageChoice`                         | Pick by picture            | `Text_Value__c` / `Selected_Options_JSON__c`                      |
| 11  | **Short / Long Text**                                                   | `field`                               | Open-ended words           | `Text_Value__c`                                                   |
| 12  | **Number / Date / Email / Phone**                                       | `field` (inputType)                   | Typed facts                | `Numeric_Value__c` / `Date_Value__c` / `Text_Value__c`            |
| 13  | **Slider**                                                              | `field` renderAs Slider               | Continuous value           | `Numeric_Value__c`                                                |
| 14  | **Ranking** (drag to order)                                             | `ranking` — **v1 (owner 2026-07-27)** | Preference order           | `Selected_Options_JSON__c` (ordered)                              |
| 15  | **Matrix** (Likert grid: rows × shared scale)                           | `matrix` — **v1 (owner 2026-07-27)**  | Many statements, one scale | one answer row per matrix row                                     |
| 16  | **Address** (compound: street / city / state / zip / country)           | `address` — **v1 (owner 2026-07-27)** | Where they are             | `Text_Value__c` (formatted) + parts in `Selected_Options_JSON__c` |

File upload and signature (existing widgets) remain available in surveys — files attach to the
_response_ record via the proven `FirstPublishLocationId` savepoint pattern.

### 2.2 Per-type spec

#### `nps` — Net Promoter Score

Eleven tappable chips, 0–10, in one row.

- **Config:** `leftLabel` (default "Not at all likely") · `rightLabel` ("Extremely likely") ·
  `showFollowUp` sugar (see below).
- **Styling:** neutral chips on the field surface; selected chip fills `--c-accent` with the
  engine's on-accent text pair. **Theme-pure by default** — the classic detractor/passive/promoter
  red-amber-green coloring fights the theme engine, so it's an _open question_ (§10 Q2), not a
  default.
- **Narrow:** chips compress to equal-width cells first, then wrap 6-over-5. Declared, not
  accidental.
- **Follow-up sugar:** a builder checkbox "Ask why" that inserts a Long Text element with a
  visibility rule (`show if nps ≤ 6`, editable) — it compiles to ordinary spec, no new runtime.
- **Analytics:** role Score, scale 0–10 preset (locked).

#### `rating` — icon rating

- **Config:** `max`: **5 / 10** (segmented; default 5 — 7 cut by owner ruling 2026-07-27; the research-style 1–7 need lives on `scale`) · `icon`: Star / Heart / Thumb ·
  `leftLabel`/`rightLabel` (optional, e.g. "Poor" → "Excellent"). **No half-steps** (v1 law —
  half-star input is fiddly on touch and doubles the storage semantics for near-zero value).
- **Styling:** unselected icons = outline in the muted text token; hover/selected = filled
  `--c-accent`; fill animates left-to-right (~120ms, skipped under reduced motion).
- **Interaction:** tap or arrow keys; announced as "3 of 5 stars".
- **Narrow:** icons scale down one size step before wrapping (wrap only at 10).

#### `scale` — opinion scale

Numbered buttons in a row — the NPS interaction, configurable range.

- **Config:** `min`: 0/1 · `max`: 5 / 7 / 10 (segmented) · `leftLabel` / `rightLabel` ·
  `showNumbers` toggle (labels-only mode for semantic scales).
- **Styling/narrow:** same chip treatment as `nps`.

#### `emojiScale` — sentiment faces

- **Config:** `points`: 3 / 5 (segmented; default 5 — 😠 🙁 😐 🙂 😍 as SLDS-consistent SVG faces,
  _not_ raw OS emoji, so they render identically across platforms and can take theme color).
- **Styling:** faces tint muted → full `--c-accent` ring + slight scale-up when selected
  (reduced-motion: no scale, ring only).
- **Storage:** position 1–N in `Numeric_Value__c` — comparable to any other scale after
  normalization (§8).

#### `likert` — agree/disagree row

One statement, one row of labeled options (_Likert = the "Strongly disagree → Strongly agree"
survey scale_).

- **Config:** `points`: 5 / 7 · `labelPreset`: Agreement / Satisfaction / Frequency /
  Importance / Custom (custom = editable label list, preset-seeded — never blank) · `showNA`
  toggle ("Not applicable" opt-out that stores no numeric value).
- **Styling:** option pills with the label under each; selected = accent fill. This is the chip
  row again — one shared CSS contract across `nps`/`scale`/`likert`.
- **Narrow:** pills stack vertically (full-width rows) — labeled options must never truncate.
- **Storage:** numeric position AND the chosen label text (`Text_Value__c`) — reports read
  "Agree", math reads 4.

#### `yesNo` — binary buttons

- **Config:** `yesLabel` / `noLabel` · `icons`: Check–Cross / Thumbs / None.
- **Styling:** two half-width buttons on the field surface; selected fills accent. Not a toggle
  switch — a toggle reads as a _setting_, side-by-side buttons read as a _question_.
- **Storage:** `Boolean_Value__c`.

#### Choice family — `field` + one new enum (no new widgets)

Existing `renderAs` machinery (Radio / Checkbox_Group / Dropdown / Custom_MultiSelect) with custom
`{label, value}` options — surveys just author options directly (no describe call to seed from).
**One addition:** `optionStyle`: **List / Chips / Cards** —

- **List** — classic radios/checkboxes (dense, familiar).
- **Chips** — compact pills in a wrapping row (short options, ≤ ~6).
- **Cards** — full-width tappable tiles with optional per-option **description line** and
  optional leading **icon**; the survey look. Selected card = accent border + subtle accent tint;
  multi-select cards show a check indicator.
- `allowOther` toggle: appends an "Other" option with an inline text input (stores as
  `{"other": "…"}` inside the options JSON / text value).

#### `imageChoice` — picture tiles (see §3)

- **Config:** `multiple` toggle · `columns`: 2 / 3 / 4 · `options`:
  `[{ value, label, image: { src, versionId, alt } }]` · `showLabels` toggle (labels under tiles;
  **alt text is mandatory per option regardless** — the builder inspector treats a missing alt as
  a publish-blocking error) · `tileRatio`: Square / Landscape.
- **Styling:** image tiles with the shared corner rounding; selected = 2px accent border + accent
  check badge; hover lift honors reduced motion. Images `object-fit: cover`.
- **Narrow:** columns collapse 4 → 2 (container query, never viewport).
- **Storage:** the option **value string(s)** — the image is presentation, not the answer (§3).

#### Text / typed facts / slider — `field`, already specced

Short text, long text (auto-growing textarea, optional `maxLength` + live counter), number, date,
email, phone (validation presets already exist), slider (`{min, max, step}` exists). Surveys use
them unbound. Nothing new to build beyond survey-mode inspector polish (§5).

### 2.3 Storage contract (every answer row)

Each answer writes: the typed value column per the table in §2.1 + `Element_Key__c` (element id) +
`Label_Snapshot__c` (question text at submit — analytics stay honest after rewording) +
`Entry_Index__c` (which repeat entry, when inside a repeatable section) + analytics fields (§8).
Multi-value answers store JSON arrays of option _values_ (stable), never labels (editable).

---

## 3 · "Do answers have images?" — yes, three ways

1. **Image Choice questions (§2.2)** — respondents _answer by picking a picture_ (product
   packaging tests, "which layout do you prefer", menu choices). The images are authored content;
   the stored answer is the option's value string.
2. **Question media** — any question can carry an image or video _above it_ today via the existing
   `image` / `video` content blocks (show a screenshot, then ask about it). v1 ships this as
   composition — no per-question `media` config bag unless authoring friction proves real (§10 Q5).
3. **Icon/emoji scales** — `rating` and `emojiScale` are image-flavored _inputs_ (SVG, theme-tinted).

**Where images live:** the established config-image pipeline — uploaded to Salesforce Files
(`ContentVersion`), served via the asset controller, `versionId` in the spec
([[project-config-image-storage]]); external URLs allowed. Publish snapshots the URLs into the
spec blob so the guest runtime never queries for assets.

**What is never stored as an answer: the image itself.** Respondent-_uploaded_ pictures are the
existing File Upload element (base64-on-submit → `ContentVersion` linked to the response record) —
that's an attachment, not an answer value.

---

## 4 · Styling & theming

- **One token contract.** Every widget uses: field-surface tokens (chip/tile/card backgrounds and
  borders), `--c-accent` + its on-accent text pair (selected states), shared corner-rounding scale,
  the focus-ring token, `--c-font-*`. **No survey-widget-private color variables** — this is what
  makes 30+ themes × new widgets a non-event instead of a QA matrix.
- **Selected-state grammar (uniform across all types):** accent fill (single-select) or accent
  border + check indicator (multi-select). A respondent learns it once.
- **Dark themes:** chips/tiles derive from the field surface via the established `color-mix`
  pattern — no hardcoded lights.
- **Density** (Comfortable/Compact) applies: chip padding, tile gaps, icon sizes ride the spacing
  scale.
- **Micro-interactions:** ~120ms fill/scale transitions, all gated on `prefers-reduced-motion`.
- **Layouts:** surveys use the same seven layout primitives. **`oneAtATime` is the natural survey
  archetype** (full-bleed, floating card, one _section_ per screen — the locked 2026-07-11 ruling
  stands). Survey **gallery templates ship pre-structured one-question-per-section**, so
  "conversational, Typeform-style" falls out of existing machinery with zero new layout code
  (auto-split convenience = §10 Q4). `scroll` and `stepper` are equally valid for longer
  questionnaires. Record Page hosting stays off the menu (locked).
- **A11y:** chip rows are `radiogroup`s with arrow-key navigation and proper labels; card grids are
  labeled groups; every target ≥44px; image options require alt text (publish-gated).
- **Rendering packs (owner direction 2026-07-26 — needs a spec pass):** styling is more than
  tokens. The owner wants selectable _presentations_ of the same question — e.g. NPS as keycap
  tiles with emoji end-labels and a fun-fact callout; Likert as full-width emoji option cards
  (real Unicode emoji, not tinted SVG); the final long-text step with a word-count chip and
  starter-prompt chips; a chat-thread rendering where questions arrive as bubbles and answers
  collapse into replies. Direction demonstrated in
  `docs/FinalDesign/survey_renderings_ux.html` (Card Deck + Chat Thread over one identical
  survey definition). Proposed shape: a per-form **`renderingPack` key in the spec** (additive —
  ignore-unknown keeps old runtimes safe); widgets read pack + tokens; the answer-store contract
  is untouched. Interacts with §10 Q4 (Card Deck ≈ one-question-per-screen) — see §10 Q9.

---

## 5 · Builder UX (Survey mode)

- **Palette:** Survey mode leads with a **Questions** group — NPS, Rating, Opinion Scale, Emoji
  Scale, Likert, Yes/No, Single Choice, Multiple Choice, Dropdown, Image Choice, Short Text,
  Long Text, Date, Slider — then the standard content blocks. Same DnD engine, zero new canvas
  mechanics.
- **No binding UI anywhere.** Surveys are unbound; the binding pane simply doesn't render
  (`appliesTo`-gated, so Form mode is untouched). The prompt becomes "Question", not "Field Label".
- **Inspectors:** one pane per type following the locked inspector idioms — segmented controls over
  dropdowns, preset scales, live preview via the _same runtime widget_ (builder preview = runtime
  component, the final\* discipline — no drift between canvas and reality).
- **Creation is gallery-first** ([[project-creation-gallery-first]]): survey templates — CSAT
  (_customer-satisfaction pulse_), NPS, Event Feedback, Post-Case Survey, Research Questionnaire —
  pre-themed, pre-structured for `oneAtATime`.
- **Question Bank** (analytics L3): v2. The palette reserves nothing; adding a "from bank" source
  later is additive.

---

## 6 · Spec & data-model delta (survey increment)

**Spec (`FORM_SPEC_SCHEMA` extensions):**

- New registry keys: `nps` · `rating` · `scale` · `emojiScale` · `likert` · `yesNo` ·
  `imageChoice` (+ reserved: `ranking`, `matrix`). Config bags per §2.2.
- `field` config gains `optionStyle` (List/Chips/Cards) + `allowOther` + per-option
  `description`/`icon` (Cards).
- Element-level `analytics` block: `{ role: score|sentimentText|category|none, topic,
scaleMin, scaleMax }` — scale bounds auto-locked for preset-scale types.

**`Form_Response_Answer__c` additions (beyond the already-approved `Label_Snapshot__c` +
`Entry_Index__c`):**

| Field                                                               | Type                 | Why                                                                                               |
| ------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `Normalized_Score__c`                                               | Number(5,2)          | The 0–100 common scale (§8 L1) — computed at submit; a 4/5 CSAT and an 8/10 NPS become comparable |
| `Topic_Snapshot__c`                                                 | Text(80)             | Question's topic tag at submit — one-object reporting, no joins                                   |
| `Sentiment_Score__c` / `Sentiment_Label__c` / `Sentiment_Source__c` | Number / Text / Text | **Left empty in v1** — the L2 landing zone, so Agentforce scoring later needs no schema change    |

**Runtime:** `FinalSubmitService` branches on `spec.form.type === 'survey'` → insert
`Form_Response__c` (links, session, completion time) + bulk-insert answer rows, one savepoint,
files via `FirstPublishLocationId`. Internal = `USER_MODE`; guest = the named `FinalGuestController`
path under RUNTIME_NOTES law. Validation identical to forms (spec §7 — required/pattern/range run
server-side regardless of storage).

**Context linking:** internal surveys read the context record from the hosting surface; guest
surveys get record context **exclusively via program Phase B signed tokens** (RUNTIME_NOTES: raw
record ids never ride guest URLs). The response writer maps token payload → the matching concrete
lookup, generic pair as fallback.

---

## 7 · Distribution & response capture

- **Internal:** app/tab hosting (exists), Flow screen (adapter phase).
- **Guest:** Phase A LWR host + A4 embed bridge — a survey is just a published version on those
  rails. Anonymous toggle (§10 Q6): when on, skip `Submitted_By__c`/IP; when off, capture what the
  channel knows.
- **Context links:** "Survey about Case X" = Phase B/C tokenized URL → `Case__c` populated →
  native "CSAT by Case owner" reporting.
- **QR codes:** a QR is just a URL rendering — builder-side nicety, DEFERRED row when it comes up.

---

## 8 · Analytics (the differentiator — sequenced, not v1-blocking)

- **L1 — Normalized measures (S6):** submit computes `Normalized_Score__c` from the element's
  analytics block (trivial linear math, _stored from day one_ — §6 fields ship with S1 so there is
  never a backfill). S6 adds the custom report type over Response→Answer + a starter dashboard
  ("score by topic across all surveys").
- **L2 — Free-text sentiment (deferred):** Agentforce prompt-template scorer, pluggable (an
  AppExchange listing can't assume AI entitlements). Landing-zone fields already in place (§6).
- **L3 — Question Bank (deferred):** shared `Survey_Question__c` entity + "push to bank" authoring
  flow — cross-survey comparability by construction.

---

## 9 · Phasing (each slice = end-to-end vertical, render-verified gate)

| Slice                           | Ships                                                                                                                             | Gate                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **S1 — Answer-store runtime**   | Survey submit path in `FinalSubmitService` (+ guest branch), answer-object field adds (§6), existing `field` types render unbound | Internal + guest survey submit render-verified; answer rows typed correctly |
| **S2 — Scale family**           | `nps`, `rating`, `scale`, `emojiScale` — builder palette + inspectors + runtime                                                   | All four author→publish→answer round-trip                                   |
| **S3 — Choice upgrades**        | `optionStyle` List/Chips/Cards, `allowOther`, `yesNo`, `imageChoice`                                                              | Image options upload→publish→guest-render (snapshot URLs)                   |
| **S4 — Likert + polish**        | `likert`, NPS follow-up sugar, narrow-behavior + a11y sweep across all widgets                                                    | uiux-flow-reviewer pass on the full catalog                                 |
| **S5 — Distribution & context** | Context-link writing (rides Phase B/C), anonymous toggle, survey gallery templates                                                | Tokenized case-survey link populates `Case__c`                              |
| **S6 — Analytics L1**           | Report type + starter dashboard over normalized scores                                                                            | "Score by topic" chart from two different surveys                           |

Dependency note: S1–S4 need only Phase A (done). S5's context links wait on program Phases B/C —
sequencing between the prefill program and survey slices stays owner-controlled.

---

## 10 · Open questions for the owner (numbered — answer any, in any order)

1. **Rating `max`:** ship 5/7/10 segmented (planned) or lock to 5-only for v1?
2. **NPS semantic coloring:** theme-pure accent (planned default) — or offer the classic
   red/amber/green detractor coloring as an opt-in toggle?
3. **`emojiScale` in v1?** It's low-cost sugar on the chip row, but it's still an inspector + SVG
   set. In S2 (planned) or push to v2?
4. **One-question-per-screen convenience:** templates pre-structure it (planned). Also want a
   builder affordance that auto-splits a survey's questions into sections? (Touches the locked
   "one SECTION at a time" ruling — talk first.)
5. **Per-question media config** (image attached _to_ the question) vs. composing existing
   image/video blocks (planned v1)?
6. **Anonymous toggle in v1 (S5)** or defer with a DEFERRED row?
7. **`imageChoice.multiple` in v1?** Planned yes (it's the same tile grid) — veto if you want
   single-select-only first.
8. **Signature in surveys:** leave available (planned — it's just an element) or hide in Survey
   mode?
9. **Rendering packs (§4):** is the Card Deck presentation (emoji option cards, keycap scales,
   step bar) the **default survey rendering in v1**, with the plain catalog widgets as the
   fallback pack? And is the Chat Thread rendering a v2 pack or in scope now? (This partly
   answers Q4 — Card Deck _is_ one-question-per-screen.)

### §10 rulings (owner, 2026-07-27)

| Q   | Ruling                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Rating `max` = **5 / 10** segmented. 7 cut from `rating` (nobody gives 7 stars); `scale` keeps 5/7/10 — the research-style 1–7 lives there                                                             |
| 2   | **Both** — theme-accent default, classic red/amber/green as an opt-in toggle                                                                                                                           |
| 3   | `emojiScale` **in v1** (S2)                                                                                                                                                                            |
| 4   | **YES (2026-07-27)** — ship the "One question per screen" Survey-settings toggle; render-time auto-split riding the existing section-paging machinery (the locked one-SECTION-at-a-time ruling stands) |
| 5   | Whole-question media = composition via existing image/video blocks (no `media` config bag). **Per-option images are first-class** — config-image pipeline + publish snapshot (§5, confirmed)           |
| 6   | Anonymous toggle **in v1** (S5)                                                                                                                                                                        |
| 7   | `imageChoice.multiple` **in v1**                                                                                                                                                                       |
| 8   | Signature stays available in surveys                                                                                                                                                                   |
| 9   | **RULED (2026-07-27)** — **Card Deck is the DEFAULT survey pack**; plain catalog widgets = the fallback pack (one click away); Chat Thread not promoted → stays v2                                     |

**Roster change:** Ranking + Matrix **promoted to v1** (owner 2026-07-27) — roster #14/#15. Adds
≈ +1–1.5 wk (ranking: touch + keyboard-accessible reordering) and ≈ +2–3 wk (matrix: stacked
mobile rendering + one-answer-row-per-matrix-row storage) to the S-slice estimates.

**Question Bank (L3):** owner interested; sized ≈ 2–3 wk post-v1 (bank object + push-to-bank +
"from bank" palette source + answer→bank-question lookup; edit semantics = freeze published
usages so trend lines never silently reword). Stays deferred until v1 survey slices ship.

**Companion mockup:** [survey_builder_mode_mockup.html](./survey_builder_mode_mockup.html) —
builder mode with every ruling visualized (owner request, 2026-07-27). **Build may not start
until Q4 + Q9 land.**

### Addendum rulings (owner, 2026-07-27, round 2)

- **Address promoted to v1** (roster #16, ≈ +1 wk): compound widget, inspector toggles for which
  subfields show; v1 = free-text subfields, **no country/state picklists** (localization rabbit
  hole — a DEFERRED row when someone asks). One answer row: formatted string in `Text_Value__c`,
  structured parts JSON in `Selected_Options_JSON__c`.
- **Name / Email palette presets** (v1, ≈ hours): quick-add rows in the palette that drop
  pre-labeled Short Text / Email questions — presets over new types, per principle 2.0.5. Email
  and Date already exist as roster #12 inputTypes; no new machinery.
- **Anonymous × identity warning** (v1, rides S5): when the anonymous toggle is ON and the canvas
  contains identity-shaped questions (name/email/phone/address presets or inputTypes), the builder
  shows a non-blocking warning chip — anonymous surveys asking "who are you" is a self-own the
  builder should catch, never silently allow.

### Addendum rulings (owner, 2026-07-27, round 3)

- **Typed-input flavors → v1** (roster #12 extension, ≈ hours each): **URL** (validated),
  **Time**, **Currency**, **Percent**. Same `field` machinery, new inputTypes.
- **Preset roster grows:** Name / Email / Phone (identity) + **CSAT** (= `scale` preset: 1–5,
  "Very dissatisfied → Very satisfied", analytics role Score, topic Satisfaction) + **CES**
  (= `scale` preset: 1–7, "Very difficult → Very easy", topic Effort). **Presets are NOT new
  types** — owner confirmed understanding: CSAT literally _is_ the Opinion Scale wearing a
  pre-filled config; that is the whole point (principle 2.0.5 by another door).
- **Hidden field → v1** (new registry key `hidden`, ≈ 2–3 days): no widget, never rendered to
  respondents; captures **allow-listed URL params** (utm_source, campaign, …) into
  `Text_Value__c` at submit. Allow-list is authored in the builder — never "grab every param"
  (open redirect-style data-smuggling guard). Rides the same URL-param plumbing as prefill;
  align param handling with program Phase B/C token work.
- **Photo capture → v1** (≈ 1 day): a `capture` flavor on the existing file element — opens the
  phone camera directly. Same storage path (ContentVersion via savepoint), same size cap.
- **Explicit NO shelf (owner ratified):** Constant Sum, Semantic Differential, MaxDiff,
  video/audio responses, location/map pin — do not re-litigate without a customer name attached.
- **Render-consistency clarification (owner check, verified by grep):** the survey demo HTMLs
  use ZERO product `--c-*` tokens — they are illustrations, not product paint. The build contract
  stays principle 2.0.3: survey widgets consume the same theme tokens as form fields, render in
  the same viewer/layouts/themes. **Plain-pack surveys look identical to forms**; Card Deck is
  deliberately different and its default-ness is exactly open question Q9. Mockup §7 documents
  this.

### Addendum — builder surfaces correction (owner catch, 2026-07-27)

The owner compared the mockup against the LIVE Studio build page and caught rev 1 showing a
generic WYSIWYG canvas + permanent right inspector. **Wrong on three counts** vs FORM_STUDIO_IA
§4, which is the law surveys ride too:

1. **Center = BLUEPRINT, deliberately schematic** ("structure only; the preview is the truth") —
   survey questions appear as skeleton chips (NPS · 0–10, RATING · ★ max 5, HIDDEN · utm_source
   as a ghost chip), never as rendered widgets.
2. **Right = live preview, the truth** — the ONLY place widgets render, through the one-parser
   rule + theme tokens. Hidden fields never render there (that's their point).
3. **Properties = palette-column swap** ("‹ Questions" back row); no permanent inspector; the
   preview never moves.

Survey mode's only surface deltas: the palette's first rail tab reads **Questions** (roster
§2.1 + presets; no describe-driven Fields — `binding: null`), and new chip types exist for the
new registry keys. **Survey authoring does NOT invent a second builder.** Mockup rev 2 (same
file) now mirrors the real anatomy.

### Addendum rulings (owner, 2026-07-27, round 4 — §10 CLOSED)

- **Q4 = YES:** "One question per screen" toggle in Survey settings. Render-time auto-split
  only — the spec keeps authored sections; the locked one-SECTION-at-a-time ruling is untouched.
- **Q9 = Card Deck default.** Plain catalog widgets remain the fallback pack (one click away);
  Chat Thread stays v2 (owner did not promote it).
- **NEW requirement — per-question caption (owner, round 4):** every question config gains
  `description` (plain text, v1) + `descriptionDisplay`: **`caption`** (always-visible muted
  line under the label — under the big title in Card Deck) | **`help`** (behind an ⓘ info
  bubble beside the label). Authored in question properties ("Caption" text + display
  segmented). Applies across packs. Empty description renders nothing — never an empty ⓘ.

**§10 is closed; the plan is APPROVED. Build order stays §9: S1 (answer-store submit runtime)
first.**
