# Catalog UI/UX Review — Proposed Resolutions (2026-07-04)

> **Status: RESOLVED 2026-07-05 — all items folded into the owning docs** (catalog / schema / ARCH /
> RUNTIME_NOTES / DEFERRED, marked "UIUX review #N"). Owner rulings: **#6 REJECTED** (Repeater stays
> in the enum/palette — drags like an element, lands as a repeatable section via the relationship
> picker; formStudio's Related List flow is the reference UX). **#20 resolved by a SIMPLER owner
> model** (not the composed-hero proposal): hero = `navSplitHero`'s brand pane EXCLUSIVELY (rich
> title/subtitle/highlight, per-block Top/Center/Bottom, rich text); every other header = lockup +
> bg image + bg color + opacity; every bg color carries opacity, engine composes rgba
> (`heroElement` retired; HEADER_HERO_DND_SPEC superseded). **#9 search** deferred to v2. This doc
> is now the historical record. Original review text below.
>
> Fresh-eyes UI/UX review of
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md) (cross-checked against
> [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md)). Each item: the problem, the
> proposed resolution, and where the edit lands. Once an item is accepted, fold it into the owning
> doc (catalog convention: "review Rec N" notes) and mark it ✅ here.
>
> **Excluded by owner instruction:** Finding #1 — *Surveys have no question-type inventory* (the
> catalog defines no survey input types: choice, rating, NPS, etc., and `fieldPalette`'s
> "filtered by bound object" is undefined when unbound). Owner is handling separately. It remains
> the largest gap; nothing below substitutes for it.

## Disposition summary

| # | Finding | Action | Effort |
|---|---|---|---|
| 2 | Override lifecycle has no UI verbs | Add reset/indicator contract to `designPanel`/`propertyPanel` | Contract addition |
| 3 | Error presentation unspecified | Add engine-owned validation-UX contract | Contract addition |
| 4 | Mobile specified for 1 of 7 primitives | Extend §2 contract: narrow behavior required per primitive | Contract addition |
| 5 | `submitBar` owns a progress toggle | Remove **Show Progress** from `submitBar` | Line edit |
| 6 | Element Type enum includes Repeater | Remove **Repeater** from the §1 enum | Line edit |
| 7 | Per-field **Field Text Size** | Remove; theme owns the type scale | Line edit |
| 8 | `multiPage` registry flag misreads | Rename to `paginates` + one-line semantics | Line edit (arch doc) |
| 9 | All capability, no restraint | Disclosure posture + control search; tab rename = owner call | Principle + IA edit |
| 10 | `themeEditor` blast radius invisible | Scope banner + affected-forms count + explicit entry | Contract addition |
| 11 | Three overlapping translucency controls | One owner per surface; delete **Page Background Opacity**; no alpha in pickers | Line edits |
| 12 | Raw numbers leak into business language | "Sliders for perception, enums for structure" rule; 4 attrs converted | Line edits |
| 13 | Keyboard advance vs multi-line inputs | Spec Enter/Ctrl+Enter split + helper-text swap | Note addition |
| 14 | No reduced-motion posture | Honor `prefers-reduced-motion` at runtime; add to a11y contract + §7 laws | Line edits |
| 15 | Forms authored-copy i18n understated | Rescope the Localization note honestly | Line edit |
| 16 | Read-only AND Disabled both exposed | Drop **Disabled**, keep **Read-only** | Line edit |
| 17 | No responses/analytics UI in "every LWC" | One-line scope disclaimer + pointer | Line edit |
| 18 | Gallery-first vs dialog "Start From" circularity | Gallery is the only fork; remove **Start From** from dialog | Line edit |
| 19 | Type legend missing 4 used types | Complete the legend | Line edit |
| 20 | Header banner vs hero element — two homes, one visual; contradicts HEADER_HERO_DND_SPEC | Header composes `heroElement`; drop Banner Image + background-hero attrs | Contract addition + OWNER CALL |
| 21 | Spec leaks `binding` to guests AND lacks render metadata — "one blob" can't render a picklist | Publish emits a runtime projection: strip `binding`, add compiled `render` block | Contract addition |
| 22 | `layout.density` bypasses the theme cascade | Form-level density → `theme.overrides.density`; delete the key | Line edit |
| 23 | Files inside repeatable sections have no entry index | v1 law: no file elements in repeaters; reserve `entryIndex` | Line edit |
| 24 | `required` has two homes (element flag + validation type) | Flag = author sugar, compiles to ONE validation entry | Line edit |
| 25 | ID-rule sentence contradicts its own parenthetical | Rewrite: duplication mints fresh ids; rename/move never does | Line edit |
| 26 | `saveMode: "update"` never says which record | Add `updateTarget`; v1 = internal-only | Contract addition |
| 27 | Rules can reference inside a repeater from outside | Forbid cross-boundary rule sources | Line edit |
| 28 | `banner.opacity` (schema) vs Header Background Opacity (catalog) disagree | Dies with #20; reconcile whichever survives | Line edit |

---

## Tier 1 — spec gaps

### 2 · Override lifecycle — give the cascade its UI verbs
**Problem:** `blank = inherit` exists as data with no interaction: no way to re-blank a value, no
way to see that a value is overridden, no defined behavior when switching themes with overrides
present. Compounded by `historyManager` excluding design-mode changes from undo — currently the
only escape from a bad tweak is discarding ALL unsaved changes.

**Resolution — add to `designPanel` + `propertyPanel` as a shared "override lifecycle" contract:**
- **Override indicator:** every design control renders its cascade state — inherited (plain) vs
  overridden (marked: dot/accent tick, exact treatment at P1). The control never lies about where
  its value comes from.
- **Per-control reset:** every overridden control gets a **Reset to theme** affordance (clear "×"
  or context action) that sets the value back to blank (inherit). This is the escape hatch that
  makes the "no design-mode undo" decision defensible — cross-reference it in the
  `historyManager` note.
- **Panel-level summary:** `designPanel` header shows a persistent chip — "**{n} customizations** ·
  Reset all" (confirm before clearing all).
- **Theme switch with overrides present:** prompt once — **Keep my customizations** (default) /
  **Use theme as-is** (clears overrides). No prompt when zero overrides. Deltas are sparse, so
  "keep" is cheap and predictable.

**Lands in:** catalog §6 (`designPanel` note + attribute rows for the chip), §5 `propertyPanel`,
`historyManager` note; DESIGN_MODE_IA for placement.

### 3 · Error presentation — an engine-owned validation-UX contract
**Problem:** rules and messages are specced; how errors *present* is not. No timing model, no
blocked-Next behavior, no in-flight submit state, no double-submit guard.

**Resolution — engine-owned behavior, NOT configurable (add as a contract note after §2):**
- **Timing ("reward early, punish late"):** a field first validates on blur after being touched;
  once it has erred, it re-validates on every input until valid. No validation while typing a
  fresh field.
- **Errors render inline** under the field via `elementRenderer` (`--c-field-error`), message from
  the rule. **No toast is ever a validation surface.**
- **Next/Submit with invalid fields:** block, run full current-page validation, mark all invalid
  fields, move focus to the first invalid field and scroll it into view (respecting reduced
  motion, #14). `pageValidity` in the §2 contract = the result of the last validation run;
  primitives render gating from it, never compute it.
- **Blocked feedback at the action:** `submitBar` renders a compact `aria-live="polite"` message —
  "Fix {n} field(s) to continue" — while blocked. Clears when the page validates.
- **In-flight state:** `submitBar` gains a **Submitting** state — all buttons disabled + spinner on
  the primary; set by the engine on submit dispatch, cleared on resolve/reject. Double-submit is
  structurally impossible.
- **`navOneAtATime`:** error renders inline under the single input; advance is denied; focus stays
  in the input. No shake motion.

**Lands in:** catalog §1 (`submitBar` states), §2 contract (pageValidity semantics), a new
"Validation presentation" note; RUNTIME_NOTES for the engine timing rules.

### 4 · Mobile behavior — required from every primitive, like keyboard/ARIA
**Problem:** only `navRail` declares narrow-container behavior. SplitHero's brand panel, the
stepper's left rail, and tab overflow at 400px are all undefined — the exact class of gap that
produced the old responsiveness bugs.

**Resolution — extend the §2 contract:** *"Each primitive declares its narrow-container behavior;
a primitive isn't done until its narrow render works."* Driven by **container queries on the
pageFrame panel** (never viewport), one shared threshold constant in the engine. Defaults:

| Primitive | Narrow behavior |
|---|---|
| `navStepper` (Left Rail) | Collapses to compact top bar (numbered chips) |
| `navTabs` | Horizontal scroll with fade edges — never wrap |
| `navRail` | As already specced (Top Bar / Drawer) |
| `navSplitHero` | Brand panel becomes a compact top brand strip; form full-width; sticky off |
| `navScroll` / `navAccordion` / `navOneAtATime` | No structural change (declare it explicitly) |

**Lands in:** catalog §2 intro (contract bullet) + one "Narrow behavior" row per primitive table.

---

## Tier 2 — self-contradictions

### 5 · Remove **Show Progress** from `submitBar`
Progress is nav chrome; the catalog's own rule says primitives own nav chrome. `navStepper`,
`navOneAtATime`, and `navSplitHero` already own their progress options. Delete the **Show
Progress** row (keep the deferred Save-Draft rows — those are actions, correctly placed).
**Lands in:** catalog §1 `submitBar` table.

### 6 · Remove **Repeater** from the Element Type enum
Owner decision: repeat lives at SECTION level only. The §1 enum listing Repeater as an element
widget contradicts it. Enum becomes: Field / Hero / Image / Rich Text / Divider / Spacer +
Lookup, File Upload, Signature, Map, Video. The §3 `formRepeater` engine and the palette's
"Repeating Group" item (creates a repeatable section) already cover the need; the "compose later
without reshaping" note already keeps the door open.
**Lands in:** catalog §1 `elementRenderer` Element Type row.

### 7 · Remove per-field **Field Text Size**
Same argument the catalog itself makes for field-state colors (Rec 1): per-field styling is
metadata bloat and a consistency trap — a raw number per field is how forms become ransom notes.
The type scale is owned by the theme (Font Pairing + Density → engine's internal ramps). If a
real need ever emerges, it returns as an enum of scale steps (Default / Small / Large), never px.
**Lands in:** catalog §1 `elementRenderer` table (delete row; optional one-line deferral note).

### 8 · Rename registry flag `multiPage` → `paginates`
`navScroll` is `multiPage: false` yet renders multi-page specs as dividers — so the flag means
"presents pages as discrete steps," not "can host multi-page forms." The obvious misreading would
wrongly block multi-page forms from choosing scroll. Rename + add one line: *"`paginates`: whether
the primitive presents pages as discrete steps. Any primitive can host a multi-page spec; scroll
flattens with dividers."*
**Lands in:** ARCHITECTURE_LAYOUTS_THEMES §2.2 registry snippet.

---

## Tier 3 — design-surface posture

### 9 · Disclosure posture + control findability
**Problem:** the full knob farm (texture intensity, blob colors, glass…) is specced with no
primary-vs-advanced posture, and Theme / Palette / Backgrounds are three plausible answers to
"where do I change the background color?"

**Resolution:**
- **Disclosure principle (add to catalog §6 + Notes-for-tech-spec):** each `designPanel` tab shows
  a small set of primary controls (target ≤ 6); everything else sits behind a per-tab **Advanced**
  expander. DESIGN_MODE_IA owns the per-control primary/advanced mapping. Rough cut: primary =
  theme, accent, page bg color/image, panel bg, rounding, width; advanced = opacity, dim, texture
  + intensity, blobs, glass, vertical alignment.
- **One home per control, tabs are surfaces not property types:** every control lives in exactly
  one tab; the tab is the surface it affects. No control appears twice.
- **Control search:** add a **Search** attribute to `designPanel` — a control finder (the VS Code
  settings pattern). This is the durable fix for findability; tab taxonomy debates become
  low-stakes.
- **Tab rename (OWNER CALL):** recommend **Palette → Colors** and Backgrounds owning everything
  behind the panel (color + image + effects). Decide in DESIGN_MODE_IA, not here.

**Lands in:** catalog §6 `designPanel` (+ Search row, disclosure note); DESIGN_MODE_IA mapping.

### 10 · Make `themeEditor`'s blast radius visible
**Problem:** `designPanel` (this form) and `themeEditor` (every form using the theme) present the
same controls with no experiential difference — the classic style-vs-direct-formatting confusion.

**Resolution:**
- `themeEditor` opens only via an explicit **"Edit theme…"** action — never inline from designPanel
  controls.
- Add an **Affected Forms** (data) attribute; the editor renders a persistent scope banner:
  *"Editing theme '{name}' — used by {n} forms."*
- Saving a theme used by more than one form confirms with the count. **Save As New** stays the
  frictionless path.

**Lands in:** catalog §6 `themeEditor` (attribute row + note).

### 11 · One owner per translucency decision
**Problem:** panel translucency is reachable three ways (alpha in the color picker, the Opacity
slider, Glassmorphism), and **Page Background Opacity** is opacity of the bottom-most layer over
nothing definable.

**Resolution:**
- **Delete Page Background Opacity** from `pageFrame`. Legibility-over-image is already the Image
  Dim scrim's job.
- **Remove Allow Alpha from `colorControl`** — pickers emit opaque colors everywhere. Where
  translucency is offered it is a dedicated Opacity slider; the **engine** composes color +
  opacity into the token's rgba (`--c-content-bg` "supports alpha" is engine output, not picker
  input).
- **Glassmorphism = blur only** (`--c-glass-blur`). It never writes opacity. Helper text under the
  toggle: "Lower Form Panel Opacity to see the effect."

**Lands in:** catalog §1 `pageFrame`, §6 `colorControl`; token note in ARCHITECTURE §3.2.

### 12 · Altitude rule: sliders for perception, enums for structure
**Problem:** a business-language doc leaks raw numbers where admins shouldn't type them.

**Resolution — adopt the rule:** continuous *perceptual* sliders (opacity, dim, texture intensity)
stay numeric; *structural* values (widths, breakpoints, sizes) are enums the engine resolves to
constants (two-tier rule: raw px never crosses the wire). Conversions:
- `layoutZones` **Responsive Breakpoint** (px) → **Collapse: Early / Standard / Late**
  (container-width constants in the engine).
- **Rail Width** (`navStepper`, `navRail`) → **Narrow / Standard / Wide**.
- `pageFrame` **Corner Rounding** "enum/number" → enum only, same Sharp→Pill scale as
  `themeEditor`.
- `historyManager` **Stack Limit** → internal engine constant; remove from the attribute table
  (the catalog is user/admin-settable surface).

**Lands in:** catalog §1, §2, §5 rows; rule sentence in Notes-for-tech-spec.

### 13 · Keyboard advance vs multi-line inputs
**Problem:** "Button + Keyboard advance" is unspecified for textareas — the classic conflict.

**Resolution (bind at P1 with the signature-distance rules):**
- Single-line inputs: **Enter advances** when Keyboard advance is on.
- Textarea / rich text: **Enter = newline; Ctrl/Cmd+Enter advances**; the muted helper text swaps
  accordingly ("or press Ctrl+Enter") — still plain text, never a key-chip.
- Choice inputs: selecting **never auto-advances** — advance stays explicit (a11y + keeps distance
  from vendor-signature behavior).

**Lands in:** catalog §2 `navOneAtATime` notes.

### 14 · Reduced motion — a11y, not art direction
**Problem:** the (correct) "renders as designed" dark-mode stance must not swallow
`prefers-reduced-motion`, which is an accessibility requirement, not brand adaptation.

**Resolution:** all motion — one-at-a-time transitions, blob/mesh drift, scroll-to-error, any P1
motion — honors `prefers-reduced-motion`: transitions become instant or plain crossfade,
decorative animation stops, scrolling jumps. Add one bullet to the §2 a11y contract and one law to
ARCHITECTURE §7. Explicitly note it as the sanctioned exception to "renders as designed."

**Lands in:** catalog §2 intro; ARCHITECTURE §7.

---

## Tier 4 — honesty checks

### 15 · Forms have authored copy too (i18n note rescope)
Bound field labels auto-translate — but section titles, help text, placeholders, button labels,
validation messages, and thank-you copy are authored on **Forms** as well as Surveys. Amend the
Localization note: the Translation Map covers authored copy for **both** form types; only bound
labels come free. Still deferred — but the deferred bucket is stated honestly.
**Lands in:** catalog Localization section.

### 16 · Drop **Disabled**, keep **Read-only**
Admins reliably confuse the two, and "disabled" carries muddy submit semantics. Read-only (visible,
not editable, value still binds/submits) covers the real use cases — prefilled locked fields,
reference values. If a "render but never submit" need appears, that's a distinct future feature.
**Lands in:** catalog §1 `elementRenderer` table.

### 17 · Analytics/responses UI — declare the scope
A catalog titled "every LWC" contains no responses/results surface. Add one line to the header or
Notes: *results & analytics UI is out of catalog v1 scope — tracked in the Form-vs-Survey
analytics phases.* Silence reads as an oversight; a scope line reads as a decision.
**Lands in:** catalog header note.

### 18 · Gallery-first means the gallery is the only fork
`newFormDialog`'s **Start From: Template / Blank** competes with the gallery as an entry point.
Resolution: **Blank** becomes a tile in `formGallery` (first position); the dialog drops the
**Start From** enum entirely and shows the chosen template as a summary chip (change = back to
gallery). Dialog = Name + Form Type + Target Object (Forms only). One door, one fork.
**Lands in:** catalog §7 `newFormDialog` + `formGallery`.

### 19 · Complete the type legend
The tables use four types the legend doesn't define. Add: **`data`** (engine/runtime-supplied, not
user-set) · **`events`** (dispatched intents) · **`multi`** (multi-select enum) · **`color+enum`**
(composite: color plus style choices). Cheap fix; the source-of-truth doc should parse by its own
contract.
**Lands in:** catalog Type legend line.

---

## Addendum — owner-caught, 2026-07-04

### 20 · Header banner image vs hero element — two homes for one visual, and a reversed decision
**Problem (four layers, worst first):**
1. **The catalog contradicts an owner-approved spec.**
   [HEADER_HERO_DND_SPEC.md](../redesign/HEADER_HERO_DND_SPEC.md) (finalized 2026-06-14) decided
   the Hero shape is **inline media + text + optional CTA — explicitly NOT a full-bleed background**
   ("keeps text legible"), and that the in-header hero is **the SAME element rendered in the header
   slot — one component, two homes**. The catalog reverses both without saying so: `formHeader`
   grows a **Header Banner Image** ("Hero background image") + a **Hero (banner)** style — a
   background hero by another name — and `heroElement`'s **Overlay Dim** ("scrim over the image")
   only makes sense for text-over-image, i.e. the rejected background shape.
2. **Two components own one visual.** A big image with heading at the top is reachable via Header
   Style = Hero *and* via dropping a `heroElement` — with divergent attribute sets (element has
   Dim/Height/Alignment/CTA; header banner has none) and no guidance on which to use. This is the
   `--c-card-*` disease pattern applied to headers: same concept, two implementations that will
   drift (image-fit bug provenance).
3. **The banner image has no plumbing.** No fit/focal-point control, no scrim, and the token
   contract's header group is only `--c-header-bg/text/text-weak` — so `formHeader` would either
   paint the image outside the engine (breaks one-producer) or the 40-token contract silently
   grows ~4 tokens. Neither is specced.
4. **Header Background Opacity** has undefined semantics (over the banner? over the content
   panel?) — same disease as #11's Page Background Opacity.

**Resolution — adopt the DnD-spec decisions into the catalog, using its own composition idiom**
(exactly how the Highlight row composes `formHighlight` and Repeatable composes `formRepeater`):
- `formHeader` **drops Header Banner Image and the Hero (banner) style**. An in-header hero =
  **composed `heroElement`** — one component, two homes, per the approved spec. Header Style
  simplifies to Standard / Minimal / None.
- `heroElement` **reshapes to the approved inline form**: image band above headline + subtext,
  optional CTA. **Overlay Dim is cut** (no text sits on the image, so no scrim); Height stays
  (band height); CTA Action becomes **Start form / Open link** (spec's `start | link` — "Scroll to
  form" is the wrong verb on paginated layouts, where start = advance to the first page).
- **Delete Header Background Opacity** (per the #11 one-owner rule). Header keeps the lockup
  (logo/brand/title/description/highlight) + Header Background Color + Header Text Color.
- **No token changes needed** — the hero image is element *content* (config-driven, like the Image
  element), not theme chrome. The contract stays at 40 and one-producer holds.
- **State the persistence rule once:** the header zone (including a composed hero) renders on
  every page/step; a body `heroElement` is page-bound. That's the real difference between the two
  homes — currently stated nowhere.
- **OWNER CALL — arrangement model:** the DnD spec's header data shape is an *ordered blocks list*
  (logo/title/subtitle/hero + zone align); the catalog carries the old build's **Header
  Arrangement** enum instead, and FORM_SPEC_SCHEMA is being authored right now. Recommend: store
  **blocks** as the data shape (spec-approved, and the ignore-unknown-keys rule makes the P3
  drag-reorder editor purely additive), while the v1 editor surface stays the simple Arrangement
  enum that writes canonical block orders. Decide before the schema freezes.

**Lands in:** catalog §1 `formHeader` + §3 `heroElement`; FORM_SPEC_SCHEMA header shape;
supersession note in HEADER_HERO_DND_SPEC pointing at the catalog.

---

## Schema pass — FORM_SPEC_SCHEMA.md (2026-07-04)

> Second-pass findings on [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md). Items 21–28 are NEW schema
> defects; carry-throughs of items 5/12/16/20 are listed at the end so the schema and catalog get
> fixed together. Credit where due: the schema's widget table already omits `repeater` (it agrees
> with #6 — the catalog enum is the outlier), the survey label-snapshot + `Entry_Index__c` design
> is right, and compile-on-publish is the correct philosophy. #21 is where that philosophy isn't
> followed all the way through.

### 21 · The served spec leaks bindings AND can't render a bound field — one projection fixes both
**Problem (an internal contradiction):** §8 promises *"the client never names Salesforce fields —
server-side mapping"*, but §4's element carries `binding: { object, field }` inside the very blob
the guest downloads. One of those is false. Worse, the blob is *also* missing what the client
actually needs: nothing in the spec says a bound element renders as a picklist (with which
options), a date, an email, or a 3-decimal number. Guests can't call describe, and §0 rule 2
promises "one blob — no N-query guest loads." As written, the runtime can render nothing more
specific than a text box.

**Resolution — finish the compile-on-publish thought:**
- Publish emits a **runtime projection** of the spec: **strip `binding`** from every element (the
  full spec with bindings stays on the version record, server-side, for answer mapping — answers
  are already keyed by element id, so the client needs no field names).
- Publish **compiles a `render` block per element** from field describe: `{ inputType, options[],
  maxLength, scale, precision, currencyCode, … }`. Same snapshot honesty as the survey label
  snapshot and the token snapshot — re-publish refreshes describe drift (picklist value changes,
  etc.).
- Surveys get the same `render.inputType` written directly by the builder — which is also the
  schema hook for excluded finding #1 (question types) when the owner resolves it.
- FLS posture unchanged: render metadata is display-only; the server still enforces CRUD/FLS at
  submit (RUNTIME_NOTES).

**Lands in:** schema §3/§4 (element shape + `render` block), §8 note; RUNTIME_NOTES (what the
guest endpoint serves); DATA_MODEL_DELTA (version record stores full spec + projection or
projects on serve).

### 22 · `layout.density` bypasses the one cascade
ARCH §4.1 defines density as a **theme property**; ARCH §5's engine signature is
`resolveTokens(themeProps, formOverrides)` — it never sees `layout`. So a form-level density under
`layout.density` either does nothing or requires a second plumbing path — the exact double-channel
disease the cascade rule exists to kill. The schema even demonstrates the correct mechanism two
keys up (`theme.overrides.radius`).
**Resolution:** delete `layout.density`; form-level density lives in `theme.overrides.density`.
(`layout.maxWidth` correctly stays — max width is structural and is NOT in the ARCH §4.1 theme
shape. That contrast is the rule of thumb: in the theme shape → override it via `theme.overrides`;
not in it → it may live under `layout`.)
**Lands in:** schema §3 `layout` block.

### 23 · Files inside repeatable sections can't reach the right child record
`repeats` answers carry `Entry_Index__c` (correctly reasoned in §8!) — but `files` is a flat
top-level array keyed by `elementId` only. A file element inside a repeatable section with two
entries produces two files with the same `elementId` and no way to attach each to its child
record. The design solved this for answers and forgot files.
**Resolution (v1):** **law — file elements are not allowed inside repeatable sections**; the
builder blocks the drop. This is also payload safety: the ~4.3 MB base64 cap × N entries is a heap
bomb waiting to happen. Reserve `entryIndex` on the files entry shape (ignore-unknown makes it
additive) for when it's genuinely wanted.
**Lands in:** schema §4.1 + §8; `builderCanvas` drag rules; RUNTIME_NOTES payload cap.

### 24 · `required` exists twice
The element has `"required": true` AND the validation array has `type: "required"` — two sources
of truth for one rule, with no stated winner (an element with `required: false` plus a required
validation entry is currently undefined).
**Resolution:** the element flag is the **only authoring surface**; the serializer **compiles it
into a validation entry** at save/publish, and the runtime evaluates validation entries only. One
evaluator, one truth; the flag is sugar.
**Lands in:** schema §4 element shape + §7 note; catalog `validationEditor` (Required leaves its
Rule Type enum — it's authored via the element toggle).

### 25 · The ID rule contradicts its own parenthetical
§6: *"NEVER regenerated — not on rename, move, **copy-paste of the form** (a **duplicated form
gets fresh ids**; a moved element keeps its id)."* The clause and the parenthetical say opposite
things, and element/section duplication *within* a form — which MUST mint fresh ids or collide —
is unstated.
**Resolution — rewrite:** *ids survive rename and move within a form. ANY duplication — element,
section, page, or whole form — mints fresh ids for every copy (answers/rules/drafts belong to the
original).* Two sentences, zero ambiguity.
**Lands in:** schema §6.

### 26 · `saveMode: "update"` never says which record to update
Update mode needs a record identity: from where (URL parameter? prefill source record?), validated
how, and it is a completely different risk class for guests (a guessable Id in a URL = write
access to arbitrary records). The schema is silent; RUNTIME_NOTES can't guard a mechanism that
isn't defined.
**Resolution:** add `updateTarget: { source: "sourceRecord" | "urlParam", param }` to the `form`
block, defined only when `saveMode: "update"`. **v1 posture: update mode is internal-audience
only** — guest + update is deferred until RUNTIME_NOTES specs the token-gated pattern (same class
as draft resume keys, never a raw record Id).
**Lands in:** schema §3 `form` block; RUNTIME_NOTES.

### 27 · Rules can reference elements inside a repeater from outside it
§4.1 correctly scopes rules *inside* a repeatable section to the same entry. But nothing stops a
page-level or outside-section rule from naming an element id that lives inside a repeater — which
entry's value would it read? Undefined behavior in the expression engine.
**Resolution — law:** elements inside a repeatable section are **not valid rule sources outside
that section**; `visibilityRules`' source picker simply doesn't offer them, and `expressionEngine`
treats such a reference as a spec error at build time (not a runtime guess).
**Lands in:** schema §7; catalog `visibilityRules` note.

### 28 · Schema and catalog disagree on what header opacity applies to
Catalog: **Header Background Opacity** (its own attribute, reads as the color fill). Schema:
`banner: { …, "opacity": 100 }` — opacity as a property *of the banner image*. Two documents, two
different owners for one knob. Moot if #20 is accepted (both keys are deleted with the banner);
if #20 is rejected, pick ONE semantic and name it what it does (an image-legibility dim is a
*scrim*, and pageFrame already has that pattern as Image Dim).
**Lands in:** schema §3 `header`; catalog §1 `formHeader`.

### Carry-throughs — schema keys touched by earlier items
- **#5:** delete `submit.showProgress`. The §3 example currently double-progresses — stepper
  `mode: "numbered"` *and* `showProgress: true` in the same JSON.
- **#12:** `zonesDefault.breakpoint: 768` → the Collapse enum (`early|standard|late`), resolved to
  container-width constants in the engine (and it must be a *container* threshold, not viewport).
- **#16:** delete element `disabled` (keep `readOnly`).
- **#20:** `header.style: "hero"`, `header.banner`, and hero `config.overlayDim` all change with
  the composed-hero resolution; `cta` gains `action: "start" | "link"` per the DnD spec.

### Schema nits (one-liners, fix opportunistically)
- `theme.name` holds a catalog key OR a record Id — two value domains in one field; and behavior
  when a custom theme record is deleted post-publish is unstated (guests are safe via `resolved`;
  define the builder fallback: revert to base theme + warn).
- §7 operators have no typing rules — `greaterThan` on a string? Define coercion (number/date
  comparisons) in the `expressionEngine` spec before P1.
- `repeat.style` values are never enumerated in the schema — mirror the catalog enum
  (`stacked | table | tileModal`).
- `settings.prefill.source` vs per-element `defaultValue.fromSource` precedence is unstated — one
  line: element `defaultValue` wins over form-level prefill.
- Published snapshots embed asset URLs (`logo.url`, page image) — publish should snapshot **stable
  public URLs** (the config-image-storage hardening list), or re-publish becomes the fix for every
  rotated file link.
