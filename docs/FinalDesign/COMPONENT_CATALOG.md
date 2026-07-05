# Component Catalog — every LWC, its job, and its configurable attributes

> **Status: spec / design reference. This `.md` is the single source of truth** — any `.csv` export is
> secondary and may drift; edit here. The full component inventory for the rebuilt app, each with a
> plain-English description and **all** configurable attributes in **business language** (no `--c-*`
> token names — those are the internal wiring; this is what a user/admin actually sets). Attributes
> are *what the component can be configured with*, not its raw technical `@api` surface.
>
> **How to read the layers:** the **render** components (§1–§3) OWN the attributes; the **Design/Build**
> editors (§6–§7) are just UIs that EDIT those same attributes. To stay DRY, each attribute is listed
> once on the component that owns it. Companion: [SURFACE_MODEL_SPEC.md](../redesign/SURFACE_MODEL_SPEC.md) ·
> [DESIGN_MODE_IA.md](../redesign/DESIGN_MODE_IA.md). Authored 2026-07-03.
>
> **Value precedence — ONE cascade, stated once:** `theme default → form-level theme override →
> per-component explicit value`. Where an attribute appears at more than one level (Corner Rounding,
> surface colors, Density), it is the **same property at different cascade levels — not duplicate
> ownership**. Explicit always wins; blank means "inherit up". This rule is what keeps the old
> `--c-card-*` double-ownership disease from coming back.

**Type legend:** `text` · `richtext` (sanitized rich text) · `number` · `toggle` (on/off) · `enum`
(fixed choices) · `color` · `image` · `list` · `rule` (declarative condition) · `binding`
(object/field reference) · `data` (engine/runtime-supplied, not user-set) · `events` (dispatched
intents) · `multi` (multi-select enum) · `color+enum` (composite: color plus style choices).

**Scope:** results & analytics UI is **out of catalog v1 scope** — tracked in the Form-vs-Survey
analytics phases ([[project-form-vs-survey-model]]). (UIUX review #17)

**Translucency rule (owner 2026-07-05 + UIUX review #11):** color pickers always emit **opaque**
colors; every *background* color (page image veil, header, form panel, section) pairs with its own
**Opacity** slider, and the **engine composes color + opacity into the token's rgba**. Opacity
always means "the color veil over whatever sits beneath it." Glassmorphism is blur only — it never
writes opacity.

**Naming:** this catalog uses *logical* names (`pageFrame`, `navScroll`). Implementation names carry
the **`final` prefix** (`finalPageFrame` → `<c-final-page-frame>`, Apex `FinalXxx`) — owner decision,
BUILD_PHASES rule 6. Data model keeps natural names.

---

## §1 · Rendering core (shared by builder preview + live runtime)

### `formLayoutEngine` — the orchestrator
Picks the layout, lazy-loads the frame + the one nav primitive it needs, and feeds them the form data. No user UI; driven by the form's saved config.

| Attribute | Type | Notes |
|---|---|---|
| Form Definition | data | The authored spec (pages → sections → elements) |
| Form Type | enum | **Form** (object-bound → saves a record) / **Survey** (unbound → answer-store). Drives binding, submit path, and i18n needs |
| Selected Layout | enum | Which archetype (Stacked, Wizard, Tabbed, …) → chooses the nav primitive |
| Selected Theme | enum | Built-in or custom theme name |
| Theme Overrides | data | The form's per-form custom values (deltas) |
| Density | enum | Comfortable / Compact |
| Render Mode | enum | Builder Preview / Live / Guest |
| Preview Device | enum | Desktop / Mobile (preview only) |

### `pageFrame` — the shared canvas & surfaces
Owns everything identical across layouts: the page backdrop, the form panel surface, spacing, and slots for header / nav / submit. **This is the single home for page + content surfaces.**

| Attribute | Type | Notes |
|---|---|---|
| Page Background Color | color | The backdrop behind the whole form — bottom-most layer, so no opacity of its own (UIUX review #11) |
| Page Background Image | image | Uploaded backdrop photo |
| Page Image Fit | enum | Cover / Contain / Tile |
| Page Image Dim | number | Darkening scrim over the image for legibility (0–70%) |
| Background Texture | enum | None / Paper Grain / Grid |
| Texture Intensity | number | 0.25×–2.5× |
| Background Effect | enum | None / Soft Color Blobs |
| Blob Colors | list(color) | Up to 4, when effect is on |
| Glassmorphism | toggle | Frosted-glass **blur only** (`--c-glass-blur`) — never writes opacity; helper text: "Lower Form Panel Opacity to see the effect" (UIUX review #11) |
| Form Panel Background | color | The form's own surface fill (was "card") |
| Form Panel Opacity | number | Lower it to let the backdrop show through |
| Form Panel Border | color+enum | Color · width · style (solid/dashed/none) |
| Form Panel Shadow | enum | None / Soft / Strong |
| Corner Rounding | enum | Shared roundness (panel + sections + fields) — same Sharp→Pill scale as `themeEditor`; enum only, raw px never crosses the wire (UIUX review #12) |
| Max Content Width | enum | Narrow / Medium / Wide / Full |
| Content Padding | enum | Inherits density scale |
| Vertical Alignment | enum | Top / Center (how the panel sits on the page) |

### `formHeader` — the header lockup
Logo (or brand-name wordmark), title, description, highlight banner, and arrangement at the top of the form.

| Attribute | Type | Notes |
|---|---|---|
| Header Style | enum | Standard / Minimal / None — "Hero (banner)" style RETIRED (owner 2026-07-05); background image is available on every style instead |
| Header Arrangement | enum | Stacked / Logo Beside / Text Only / Inline / Centered |
| Logo Image | image | Uploaded or URL — wins over Brand Name when both are set |
| Brand Name | text | No logo → rendered as a typeset text wordmark in the theme's display typography (`--c-font-display`). Built-in emblem icons RETIRED (owner 2026-07-04) |
| Form Title | text | |
| Description / Subtitle | text | |
| Highlight | — | Composes `formHighlight` (§3), which owns the message / variant / icon — not re-owned here |
| Header Background Image | image | Painted at the bottom of the header surface (was "Banner") |
| Header Background Color | color | The veil layered **over** the background image (or the page) |
| Header Background Opacity | number | Opacity of that color veil (0–100) — the engine composes color + opacity into `--c-header-bg` as rgba; this doubles as the image-legibility control (resolves UIUX review #28) |
| Header Text Color | color | |

> **Owner header model (2026-07-05, resolves UIUX review #20):** the header everywhere is the
> lockup + the background trio above — nothing more. **Hero features are EXCLUSIVE to
> `navSplitHero`'s brand pane (§2)**; there is no generic draggable hero element and no second
> "big image at top" implementation to drift from this one.
> [HEADER_HERO_DND_SPEC](../redesign/HEADER_HERO_DND_SPEC.md) is **superseded** by this note.
> The header zone renders ONCE per form, on every page/step (never re-rendered per page —
> BUILD_PHASES checklist item 2).

### `submitBar` — the actions row
Submit / Next / Back buttons, alignment, and sticky behavior.

| Attribute | Type | Notes |
|---|---|---|
| Submit Button Label | text | |
| Button Alignment | enum | Left / Center / Right / Full-width |
| Submit Placement | enum | Inline / Sticky Footer (pins on long forms) |
| Next Button Label | text | Multi-page only |
| Back Button Label | text | Multi-page only |
| Submitting | data | Engine-set on submit dispatch, cleared on resolve/reject: all buttons disabled + spinner on the primary — double-submit structurally impossible (UIUX review #3) |
| Blocked Message | data | While Next/Submit is blocked by invalid fields: compact `aria-live="polite"` text — "Fix {n} field(s) to continue"; clears when the page validates (UIUX review #3) |
| Show Save Draft | toggle | "Save & Finish Later" — shown only when Save & Resume is enabled (`draftManager`, §4) — **v2, deferred with Save & Resume** |
| Save Draft Label | text | v2 |

> **One button implementation, everywhere.** Paginated nav primitives do NOT render their own
> Next/Back/Submit buttons — they **host this `submitBar` in a slot** and forward its intents as the
> §2 contract events (`next` / `back` / `submit`). One place owns button markup, labels, and alignment;
> primitives own only nav chrome (steps, tabs, panels). Sole exception: `navOneAtATime`'s **Advance
> Trigger** is the primitive's own control — in conversational mode the advance action *is* the
> navigation.

### `layoutZones` — section arrangement within a page
Arranges a page's sections into columns / grid.

| Attribute | Type | Notes |
|---|---|---|
| Zone Arrangement | enum | Single Column / Two Column / Grid / Bento (mosaic) |
| Column Gap | enum | From spacing scale |
| Collapse | enum | Early / Standard / Late — the width at which columns collapse to one; container-width constants in the engine, **container query, never viewport** (UIUX review #12; raw px never crosses the wire) |
| Collapse Order | enum | Source order / Priority |

### `sectionRenderer` — one section + its fields
Section header (icon/title/description), the field grid, style treatment, collapse.

| Attribute | Type | Notes |
|---|---|---|
| Section Title | text | |
| Section Description | text | |
| Section Icon | enum | Optional leading icon |
| Section Style | enum | Plain / Card / Boxed / Outline / Subtle / Flat (quick-start presets) |
| Section Background | color | Explicit fill — **wins over the preset** |
| Section Background Opacity | number | Opacity of that fill over the form panel (composed to rgba — header translucency rule) |
| Section Border | color+enum | Color · width · style |
| Section Corner Rounding | number | (shared roundness by default) |
| Section Inner Padding | enum | None / Small / Medium / Large |
| Field Columns | enum | 1 / 2 / 3 across |
| Collapsible | toggle | |
| Default Collapsed | toggle | When collapsible |
| Visibility Rule | rule | Show/hide this section conditionally |
| Repeatable | toggle | When on, the section composes `c-form-repeater` (§3) to wrap its field grid — one shared repeat engine, not a second implementation (review Rec 3) |
| Repeat Binding | binding | Child Object + Relationship — each entry saves ONE related record on submit; elements inside bind to the child object's fields |

### `elementRenderer` — one element (field / content block)
Renders a single element with label, help, and input. Type-driven.

| Attribute | Type | Notes |
|---|---|---|
| Element Type | enum | Field / Image / Rich Text / Divider / Spacer **+ the §3 widget types** (Lookup, File Upload, Repeater, Signature, Map, Video). **Repeater stays in this enum by owner ruling (2026-07-05):** it drags from the palette like any element but **lands as a repeatable section** — the drop opens the child-relationship picker ("Work Orders · via AccountId") and mints the section with its dedicated inspector; `formStudio`'s Related List flow is the reference UX. (Hero removed — splitHero-exclusive, see `formHeader` note) |
| Field Binding | binding | Object.Field this maps to (**Forms**). **Surveys are unbound** — the answer stores to the answer-store, no binding |
| Field Label | text | |
| Label Position | enum | Top / Left / Hidden |
| Label Style | enum | Default / Uppercase / Muted |
| Help Text | text | Tooltip/hint |
| Placeholder | text | |
| Required | toggle | |
| Default Value | text/binding | Static or from source record |
| Input Style | enum | Outline / Filled / Underline |
| Field Width | enum | Columns to span |
| Read-only | toggle | Visible, not editable; the value still binds and submits. (**Disabled** dropped — admins confuse the two and its submit semantics are muddy; **Field Text Size** dropped — the theme owns the type scale, per-field sizes are how forms become ransom notes. UIUX review #16/#7) |
| Validation Rules | list(rule) | Required / Pattern / Range / Custom + message |
| Visibility Rule | rule | Conditional show/hide |

> **Field-state colors are theme-level, not per-field** (review Rec 1). Focus / error / required-asterisk
> colors live in the **theme** (`themeEditor`, §6), emitted as tokens and consumed by `elementRenderer`'s
> CSS — NOT stored on every field record (that's metadata bloat + "update 40 fields to change one
> color"). Per-field override is intentionally deferred (rare need).
>
> **Widget registry — how §3 plugs in.** `elementRenderer` resolves Element Type → widget component
> through a single **type→component registry** (lazy `lwc:is`, same pattern as the nav primitives).
> §3 defines the widget types; `fieldPalette` (§5) offers exactly what the registry declares. Adding
> an element type = registering a widget — never editing the renderer's internals.

---

## §2 · Navigation primitives (lazy-loaded — one per form)

> **Shared contract — every primitive implements it (review Rec 2).** This is what lets
> `formLayoutEngine` lazy-swap any primitive. The primitive is **dumb**: it never owns validation or
> submission logic — it renders navigation state and *dispatches intent*; the engine owns the truth.
> - **Inputs:** `pages` (page-config array) · `currentPageIndex` · `pageValidity` (per-page valid
>   flags, so it can render gating) · `progress` style.
> - **Events:** `pagechange` (user clicked a tab / step / panel) · `next` · `back` · `submit`.
> - **Buttons come from `submitBar`, not the primitive:** primitives host the shared `submitBar` (§1)
>   in a slot — no primitive renders its own button markup (see the submitBar note; `navOneAtATime`'s
>   Advance Trigger is the one exception). **Event path (schema review C):** because `submitBar` is
>   slotted from the ENGINE's template, it stays in the engine's tree — its `next`/`back`/`submit`
>   events never cross the primitive's shadow boundary, so "forwarding" is automatic. Plain
>   non-composed `CustomEvent`s, handlers on the tag; **no `bubbles: true, composed: true`** (leaky
>   LWC anti-pattern) and no forwarding plumbing in primitives.
> - **Accessibility is part of the contract:** each primitive owns its keyboard + ARIA semantics —
>   `navTabs` = tablist/tab/tabpanel · `navStepper`/`navRail` = nav list with `aria-current="step"` ·
>   `navAccordion` = trigger buttons with `aria-expanded` · `navOneAtATime` = focus moves to the new
>   screen on advance. A primitive isn't done until its keyboard path works.
> - **Reduced motion is part of the contract (UIUX review #14):** ALL motion — screen transitions,
>   mesh/blob drift, scroll-to-error — honors `prefers-reduced-motion` (instant or plain crossfade;
>   decorative animation stops; scrolling jumps). The sanctioned exception to "renders as designed."
> - **Narrow-container behavior is part of the contract (UIUX review #4):** each primitive declares
>   its narrow render (see its **Narrow behavior** row) and isn't done until it works — driven by
>   **container queries on the pageFrame panel** (never viewport), one shared threshold constant in
>   the engine.
> - **`pageValidity` semantics (UIUX review #3):** it is the result of the **last validation run**,
>   computed by the engine — primitives render gating from it, never compute it.
>
> The per-primitive attributes below are its *presentation* options, layered on that contract.
>
> **Validation presentation — engine-owned, NOT configurable (UIUX review #3):**
> - Timing ("reward early, punish late"): a field first validates on blur after being touched; once
>   it has erred, it re-validates on every input until valid. Never while typing a fresh field.
> - Errors render **inline under the field** via `elementRenderer` (`--c-field-error`), message from
>   the rule. **No toast is ever a validation surface.**
> - Next/Submit with invalid fields: block, validate the full current page, mark all invalid fields,
>   move focus to the first invalid field and scroll it into view (respecting reduced motion).
>   `submitBar` shows the blocked message near the action (its Blocked Message row, §1) — inline at
>   field + summary near the action is the kept legacy `formDesigner` pattern.
> - `navOneAtATime`: error inline under the single input; advance denied; focus stays put; no shake.

### `navScroll` — continuous flow
All pages/sections in one scroll; no pagination.

| Attribute | Type | Notes |
|---|---|---|
| Show Page Dividers | toggle | Page labels become dividers when > 1 page |
| Section Spacing | enum | Gap between sections |
| Narrow behavior | — | No structural change (declared per contract, UIUX review #4) |

### `navStepper` — wizard steps
One page per step with a progress control; forward can be gated.

| Attribute | Type | Notes |
|---|---|---|
| Stepper Placement | enum | Top / Left Rail |
| Stepper Mode | enum | Numbered / Dots / Progress Bar |
| Navigation | enum | Free / Gated (must complete to advance) |
| Show Step Count | toggle | "Step 2 of 5" |
| Rail Width | enum | Narrow / Standard / Wide — when placed on the left (UIUX review #12) |
| Narrow behavior | — | Left Rail collapses to a compact top bar of numbered chips (UIUX review #4) |

### `navTabs` — tabbed pages
One page per tab; free navigation.

| Attribute | Type | Notes |
|---|---|---|
| Tab Alignment | enum | Left / Center / Full-width |
| Tab Style | enum | Underline / Pills / Enclosed |
| Show Tab Icons | toggle | |
| Narrow behavior | — | Horizontal scroll with fade edges — tabs never wrap (UIUX review #4) |

### `navAccordion` — expandable panels
Pages/sections as accordion panels.

| Attribute | Type | Notes |
|---|---|---|
| Allow Multiple Open | toggle | |
| First Panel Open | toggle | Default-expand the first |
| Icon Position | enum | Leading / Trailing chevron |
| Narrow behavior | — | No structural change (declared per contract, UIUX review #4) |

### `navRail` — persistent side nav
A list of pages/sections beside the content pane.

| Attribute | Type | Notes |
|---|---|---|
| Rail Side | enum | Left / Right |
| Rail Width | enum | Narrow / Standard / Wide (UIUX review #12) |
| Rail Content | enum | Page List / Progress / Both |
| Sticky Rail | toggle | |
| Narrow behavior | enum | Collapse to Top Bar / Drawer (was "Mobile Behavior" — container-driven, UIUX review #4) |

### `navSplitHero` — brand panel + form
Immersive brand panel on one side, form on the other.

| Attribute | Type | Notes |
|---|---|---|
| Brand Panel Side | enum | Left / Right |
| Brand Panel Width | enum | Ratio (⅓ / ½) |
| Sticky Brand Panel | toggle | |
| Pane Background Image | image | The hero visual filling the brand pane |
| Pane Background Color | color | Veil over the pane image — with Opacity per the translucency rule |
| Pane Background Opacity | number | |
| Pane Logo / Brand | — | Logo image, else Brand Name wordmark (same rule as `formHeader`) |
| Pane Title | richtext | Rich-text editable, not plain text (owner 2026-07-05) |
| Pane Subtitle | richtext | Rich-text editable |
| Pane Highlight | — | Composes `formHighlight` (§3) |
| Block Placement | enum | **Per block** (title / subtitle / highlight): Top / Center / Bottom vertical alignment inside the pane (owner 2026-07-05) |
| Progress Style | enum | Default / Horizontal / None — renders in the brand pane |
| Navigation | enum | Free / Gated (per preset) |
| Pane Flow | enum | Pages / One at a Time (owner request 2026-07-04) — how the FORM pane advances |
| Narrow behavior | — | Brand pane becomes a compact top brand strip; form full-width; sticky off (UIUX review #4) |

> **The brand pane IS the product's hero (owner 2026-07-05).** Hero features — full-pane imagery,
> richly placed title/subtitle/highlight — live HERE exclusively. When this layout is chosen, "the
> entire half of the form is the header": the pane replaces `formHeader` (no second header renders).
> There is no generic draggable hero element (§3 `heroElement` retired) and
> [HEADER_HERO_DND_SPEC](../redesign/HEADER_HERO_DND_SPEC.md) is superseded.

> **Pane Flow = One at a Time** runs the form pane on the **same step-flow engine as
> `navOneAtATime`** — one shared logic module extracted in P1, never a second implementation
> (same rule as `formRepeater`/`sectionRenderer`). In that mode the Advance Trigger exception
> applies inside the pane, Progress Style renders in the brand panel, and Navigation gating
> applies per screen. This is a presentation option on the primitive, NOT a new registry row —
> the layout is still `splitHero`.

### `navOneAtATime` — one screen at a time (conversational)
One section (or element) per screen, advance-driven.

| Attribute | Type | Notes |
|---|---|---|
| Advance Trigger | enum | Button only / Button + Keyboard advance |
| Advance Button Label | text | Default **"Continue"** (owner 2026-07-04) — deliberately not a vendor-signature "OK"/"Next" |
| Show Progress Bar | toggle | |
| Back Link Style | enum | Text link / Arrow |
| Narrow behavior | — | No structural change (declared per contract, UIUX review #4) |

> **Keyboard advance vs input types (UIUX review #13, binds at P1):** single-line inputs — Enter
> advances when Keyboard advance is on. Textarea / rich text — Enter is a newline; **Ctrl/Cmd+Enter
> advances**, and the muted helper text swaps accordingly ("or press Ctrl+Enter") — still plain
> text, never a key-chip. On **touch devices** the helper text hides entirely (no modifier keys
> exist) and advance is button-only. Choice inputs: selecting **never auto-advances** — advance
> stays explicit (a11y + signature distance).

> **Pattern provenance & IP posture (owner question 2026-07-04):** one-question-at-a-time is an
> industry-generic interaction pattern (Typeform popularized it; Jotform "Cards", Tally, Youform,
> Fillout, SurveyMonkey one-question mode all ship it). We implement it from scratch — our own
> code, DOM, motion, microcopy, and theme-system visuals; no third-party code, assets, or service
> is used, so no ToS/agreement applies. Guardrails that keep it that way: product naming stays
> generic ("One at a Time" / "Conversational" — never a vendor's name in UI, docs, or listings),
> no pixel-cloning of any vendor's screens or signature microcopy, and our motion/visual design
> comes from our own tokens. Interaction paradigms aren't copyrightable; these guardrails cover
> the trademark/trade-dress residue.
>
> **Signature-distance rules (owner 2026-07-04 — bind at P1 build):**
> - The feature is called **Keyboard advance** everywhere (settings, docs, code) — never
>   "Press Enter". Its on-screen affordance is plain muted helper text under the Continue button
>   in our own words (e.g. "or press Return"), **never a styled key-chip** ("press Enter ↵" is
>   Typeform's signature microcopy treatment).
> - Advance button label defaults to **Continue**.
> - Screen transition is our own motion (defined at P1 from our tokens — a short fade/rise, not
>   a full-viewport vertical card carousel).

---

## §3 · Element widgets (beyond native fields)

### `formLookup` — custom record picker
Filtered, multi-field lookup with recently-viewed, ＋New, and dependent/cascading behavior.

| Attribute | Type | Notes |
|---|---|---|
| Lookup Object | binding | |
| Display Fields | list | Primary + secondary fields shown per result |
| Filter Criteria | rule/text | Declarative filters + optional SOQL |
| Allow Create New | toggle | ＋New inline |
| Dependent On | binding | Parent field that filters this |
| Show Recently Viewed | toggle | |
| Placeholder | text | |
| Required | toggle | |

### `fileUpload` — file field
Files persisted on submit (internal + guest).

| Attribute | Type | Notes |
|---|---|---|
| Upload Label | text | |
| Instructions | text | |
| Allowed File Types | list | |
| Max File Size | number | |
| Max Number of Files | number | |
| Allow Multiple | toggle | |
| Required | toggle | |
| Link to Record | toggle | Relate uploaded files to the saved record |

### `formRepeater` — repeatable entries (the reusable repeat container)
The single home for repeat logic: adds multiple entries of a section's field grid. `sectionRenderer` **composes** this when its **Repeatable** toggle is on (review Rec 3) — not a separate feature, one shared engine.

| Attribute | Type | Notes |
|---|---|---|
| Repeat Style | enum | Stacked / Table / Tile + Modal |
| Minimum Entries | number | |
| Maximum Entries | number | |
| Add Button Label | text | |
| Remove Button Label | text | |
| Entry Label Template | text | e.g. "Contact {index}" |

> **Repeat lives at SECTION level only (owner decision).** No page-level repeater species, no
> element-level nesting, and **never a repeater inside a repeater** (grandchild records = deferred
> multi-object territory). A "repeater outside sections" is a *visual* ask, not a structural one:
> a repeatable section with `Plain` style renders as a bare repeating group — the palette sells
> exactly that as its **Repeating Group** item (`fieldPalette`, §5). The `repeats` payload keys by
> container id, so an element-level repeater could compose this same engine later without
> reshaping anything.

### `formHighlight` — announcement banner
Highlight message shown in the header.

| Attribute | Type | Notes |
|---|---|---|
| Message Text | text | |
| Variant | enum | Badge / Banner / Inline |
| Icon | enum | Optional |
| Dismissible | toggle | |

### `heroElement` — **RETIRED** (owner 2026-07-05)
The generic draggable hero content block is cut: **hero features are exclusive to `navSplitHero`'s
brand pane (§2)** — one hero implementation, zero drift (resolves UIUX review #20). No registry
row, no palette item. The `hero` element-type key stays reserved (ignore-unknown-keys makes a
future body-hero purely additive if ever wanted).

### `formSignature` — signature pad (review §2 gap)
Canvas-based signing field for agreements, sign-offs, applications.

| Attribute | Type | Notes |
|---|---|---|
| Pen Color | color | |
| Line Thickness | number | |
| Placeholder Text | text | "Sign here" |
| Output Type | enum | Base64 PNG / ContentVersion relationship |
| Required | toggle | |

### `formMap` — location / map (review §2 gap) — **DEFERRED to v2** ([DEFERRED.md](./DEFERRED.md) #1)
Show an address on a map or let the user pin coordinates. Spec kept; not built in v1.

| Attribute | Type | Notes |
|---|---|---|
| Map Provider | enum | Native `lightning-map` (**default** — no key, no CSP setup) / Google / Leaflet. External providers need CSP Trusted Sites ([RUNTIME_NOTES](./RUNTIME_NOTES.md)); "Salesforce Maps" the SKU is paid — never required |
| Address Binding | binding | Address field to plot |
| Default Zoom | number | |
| Pin Coordinate | data | Captured lat/long |
| Allow Pin Drop | toggle | Let respondents set the point |

### `formVideo` — embedded video (review §2 gap)
Instructional / marketing video block inside a section.

| Attribute | Type | Notes |
|---|---|---|
| Video Source | enum | YouTube / Vimeo / Salesforce CMS — external providers need CSP Trusted Sites on Experience Cloud ([RUNTIME_NOTES](./RUNTIME_NOTES.md)) |
| Video URL / Id | text | |
| Autoplay | toggle | |
| Loop | toggle | |
| Muted | toggle | |

---

## §4 · Runtime

### `formViewer` — the published form container
Loads the spec, manages field state, prefill/autofill, and submission. Internal + guest.

| Attribute | Type | Notes |
|---|---|---|
| Form Reference | binding | Published form to render |
| Prefill Source | enum | URL Parameters / Source Record / None |
| Autofill Rules | list(rule) | Form-level prefill from a source record |
| Audience | enum | Internal / Guest |
| Read-only | toggle | Preview without submit |
| Submit Target | binding | Object the record saves to (**Forms**; Surveys submit to the answer-store — split path per Form Type) |
| Availability | enum | Active / Closed — a closed form renders the Closed Message, never the fields |
| Closed Message | text | Shown when closed, outside the window, or over the response cap |
| Open/Close Window | data | Optional scheduled open + close date-times |
| Response Cap | number | Optional max responses; auto-closes when reached |
| Spam Protection | enum | None / Honeypot (**default for guest**) / CAPTCHA — guardrails in [RUNTIME_NOTES](./RUNTIME_NOTES.md) |

### `formCompletion` — post-submit screen
Thank-you or redirect after submit.

| Attribute | Type | Notes |
|---|---|---|
| Completion Outcome | enum | Show Message / Redirect |
| Thank-You Message | text | Rich text |
| Redirect URL | text | When redirecting |
| Show Response Summary | toggle | Recap of submitted values |
| Allow Another Response | toggle | "Submit another" |

### `draftManager` — save & resume (review §2 gap) — **DEFERRED to v2** ([DEFERRED.md](./DEFERRED.md) #2)
Lets respondents (especially guests on long multi-page forms) save progress and continue later.
Spec + security rules kept; nothing built in v1 (no `Form_Draft__c`, no Save-Draft button).

| Attribute | Type | Notes |
|---|---|---|
| Enable Save & Resume | toggle | |
| Draft Storage | enum | Draft record (custom object) / Browser local storage |
| Resume Key | data | Unique token per in-progress response — **cryptographically unguessable**, never a record Id |
| Resume Delivery | enum | Emailed link / Copyable link |
| Draft Expiry | number | Days a draft is retained (expiry purge is mandatory — drafts hold PII) |

> **UI homes:** the save action renders as `submitBar`'s **Save & Finish Later** button (§1); the
> resume link re-opens `formViewer` with the resume key — no separate resume screen. **Guest drafts
> are elevated-context** (same class as guest file upload, review B): token-gated read of ONLY the
> matching draft, no draft querying. Guardrails in [RUNTIME_NOTES](./RUNTIME_NOTES.md).

---

## §5 · Builder shell + Build mode

### `formStudio` — the builder app frame
The app shell: Build|Design toggle, top bar, save/publish/discard, form name + version, preview device.

| Attribute | Type | Notes |
|---|---|---|
| Form Name | text | |
| Version State | enum | Draft / Published |
| Active Mode | enum | Build / Design |
| Preview Device | enum | Desktop / Mobile |
| Save State | enum | Saved / Unsaved changes |

### `builderCanvas` — the structural editor
Drag/drop pages, sections, elements; the live blueprint with the form preview.

| Attribute | Type | Notes |
|---|---|---|
| Selected Node | data | Page/section/element in focus |
| Show Guides | toggle | Grid/alignment guides |
| Drag Rules | data | What can drop where (gatekeeper) |

### `historyManager` — undo / redo (review §2 gap)
Builder-shell service managing the undo/redo stack for **structural** form edits.

| Attribute | Type | Notes |
|---|---|---|
| Tracked Scope | enum | **Build-mode structural edits only** (add/move/delete pages · sections · elements) |
| Undo / Redo | events | Wired to toolbar + keyboard shortcuts. (Stack limit = internal engine constant, not admin surface — UIUX review #12) |
| Coalescing | toggle | Collapse a continuous input (drag / typing) to ONE step on release |

> **Design-mode changes are NOT on this stack** (review C). Live theme tweaks (color sliders, etc.)
> apply as instant CSS preview and revert via the form-level **Save / Discard** — not per-tweak undo.
> Keeps the stack clean without making "undo my color change" feel broken. The decision is
> defensible because the **override lifecycle** (below, UIUX review #2) gives every design control
> its own escape hatch.
>
> **Override lifecycle — shared contract for `designPanel` + `propertyPanel` (UIUX review #2):**
> - Every design control shows its cascade state: inherited (plain) vs **overridden** (marked —
>   exact treatment at P1). The control never lies about where its value comes from.
> - Every overridden control gets a **Reset to theme** affordance that re-blanks it (inherit).
> - `designPanel`'s header shows a persistent chip: "**{n} customizations** · Reset all" (confirm).
> - Theme switch with overrides present prompts ONCE: **Keep my {n} customizations** (default,
>   count named so the user knows what to hunt if the new theme looks off) / **Use theme as-is**
>   (clears them). No prompt at zero overrides.

### `fieldPalette` — the element palette
Draggable element/field types.

| Attribute | Type | Notes |
|---|---|---|
| Categories | enum | Fields / Layout / Content / Advanced |
| Available Types | list | Filtered by bound object |
| Search | text | |

> Includes a first-class **"Repeater"** item (a.k.a. Repeating Group): dropping it opens the
> child-relationship picker and creates a repeatable, chromeless (`Plain`-style) section (§1
> sectionRenderer / §3 formRepeater) — `formStudio`'s Related List flow is the reference UX (owner
> 2026-07-05). Users think "repeater"; the tree keeps ONE container species.

### `propertyPanel` — the element editor
Edits the selected element's attributes (see `elementRenderer` §1 — it edits all of those). Contextual to selection.

| Attribute | Type | Notes |
|---|---|---|
| Target | data | The selected element/section/page |
| *(edits)* | — | All `elementRenderer` / `sectionRenderer` attributes |

### `pageManager` — pages
Add / reorder / rename / delete pages.

| Attribute | Type | Notes |
|---|---|---|
| Page Name | text | |
| Page Order | number | |
| Page Visibility Rule | rule | |

### `bindingPicker` — object/field binding
Bind form / section / field to Salesforce data.

| Attribute | Type | Notes |
|---|---|---|
| Target Object | binding | |
| Target Field | binding | |
| Relationship Path | binding | For related-object fields |
| Save Mode | enum | Create / Update |

### `visibilityRules` — conditional visibility
Declarative multi-rule editor (Lightning record-page pattern).

| Attribute | Type | Notes |
|---|---|---|
| Rules | list(rule) | Each: field · operator · value |
| Combine Logic | enum | All (AND) / Any (OR) / Custom |
| Action | enum | Show / Hide |

> **Repeater scoping law (UIUX review #27):** elements inside a repeatable section are NOT valid
> rule sources outside that section — the source picker simply doesn't offer them, and
> `expressionEngine` treats such a reference as a **build-time spec error**, never a runtime guess.

### `validationEditor` — validation rules
| Attribute | Type | Notes |
|---|---|---|
| Rule Type | enum | Required / Pattern / Range / Custom — **Required is authored via the element's toggle**; the serializer compiles it into a validation entry, and the runtime evaluates validation entries ONLY (one evaluator, one truth — UIUX review #24) |
| Condition | rule | When it applies |
| Error Message | text | |

> Both `visibilityRules` and `validationEditor` evaluate through a shared **`expressionEngine`** logic
> module (review §2 gap) — parses/runs declarative conditions (e.g. `Age >= 18`, `Email == ConfirmEmail`)
> **client-side, no Apex.** One evaluator, reused at build (validate the rule) and runtime (apply it).

---

## §6 · Design mode

### `designPanel` — design controls container
Organized tabs that write theme overrides. It **edits** the `pageFrame` / `formHeader` / `sectionRenderer` / `elementRenderer` attributes — it doesn't own new styling attributes itself.

| Attribute | Type | Notes |
|---|---|---|
| Active Tab | enum | Theme / Palette / Backgrounds / Layout / Fields / Header / Actions |
| Layout-conditional visibility | data | Hides controls that don't apply to the current layout |
| Customizations chip | data | "{n} customizations · Reset all" (override lifecycle, §5 `historyManager` note) |

> **Disclosure posture (UIUX review #9):** each tab shows a small set of primary controls
> (target ≤ 6); everything else sits behind a per-tab **Advanced** expander. **One home per
> control** — tabs are *surfaces*, not property types; no control appears twice.
> [DESIGN_MODE_IA](../redesign/DESIGN_MODE_IA.md) owns the per-control primary/advanced mapping and
> any tab renames. A control-finder **Search** is DEFERRED to v2 ([DEFERRED.md](./DEFERRED.md)).

### `themeGallery` — theme picker
Browse and pick a theme (built-in + custom) from a visual gallery.

| Attribute | Type | Notes |
|---|---|---|
| Filter Tags | enum | Light / Dark / Creative / Minimal / Editorial |
| Selected Theme | enum | |
| Show Custom Themes | toggle | Include the user's saved themes |

### `themeCard` — a theme tile
| Attribute | Type | Notes |
|---|---|---|
| Theme Name | text | |
| Preview Swatch | data | Mini render of the theme |
| Tags | list | |
| Is Custom | toggle | User-made vs built-in |

### `themeEditor` — create/edit a custom theme
Edits theme **properties** (which resolve to tokens) and saves a named custom theme.

| Attribute | Type | Notes |
|---|---|---|
| Theme Name | text | |
| Start From | enum | Base theme to fork |
| Affected Forms | data | Count of forms using this theme — renders a persistent scope banner: "Editing theme '{name}' — used by {n} forms" (UIUX review #10) |
| Accent / Brand Color | color | + live contrast badge |
| Main Text Color | color | |
| Muted Text Color | color | |
| Surface Colors | color | Page / Panel / Section |
| Field-State Colors | color | Focus / Error / Required-asterisk / Field border — **global here** (review Rec 1), not per-field |
| Font Pairing | enum | Editorial / Geometric / Enterprise / Technical / … |
| Corner Rounding | enum | Sharp → Pill |
| Border Style | enum | None / Hairline / Bold |
| Density | enum | Comfortable / Compact |
| Effects | multi | Shadow / Glass / Texture / Mesh |
| Save Mode | enum | Save / Save As New |

> **Storage split:** built-in themes ship as **hidden data in managed code** (hiding depth —
> managed-code-only vs server-side token resolution — is an open tech-spec decision). **Custom themes
> are user-created → stored as records** (they can't hide, and they must be saveable / shareable /
> listable in `themeGallery`). The editor writes the SAME theme-property shape either way — storage
> differs, the pipeline doesn't.
>
> **Blast-radius rules (UIUX review #10):** `themeEditor` opens ONLY via an explicit "Edit theme…"
> action — never inline from `designPanel` controls (styles vs direct formatting must FEEL
> different). Saving a theme used by more than one form confirms with the count; **Save As New**
> stays the frictionless path.

### `colorControl` — color input + contrast badge
Reusable color picker with live WCAG feedback.

| Attribute | Type | Notes |
|---|---|---|
| Label | text | |
| Color Value | color | Always **opaque** — no alpha in the picker; translucency is each background surface's dedicated Opacity slider, composed to rgba by the engine (translucency rule / UIUX review #11) |
| Contrast Reference | color | What it's checked against |
| Contrast Result | data | AA / AAA pass-fail badge |

### `imageUploader` — reusable image upload
Logo / background / hero images → Salesforce Files.

| Attribute | Type | Notes |
|---|---|---|
| Label | text | |
| Image Value | image | |
| Accepted Types | list | |
| Max Size | number | |
| Show Thumbnail | toggle | |
| Allow Remove | toggle | |

### `contrastBadge` — WCAG indicator
| Attribute | Type | Notes |
|---|---|---|
| Foreground Color | color | |
| Background Color | color | |
| Target Level | enum | AA / AAA |
| Result | data | Ratio + pass/fail |

---

## §7 · Creation (gallery-first)

### `formGallery` — curated template gallery
The starting point for a new form (pre-bound themed templates).

| Attribute | Type | Notes |
|---|---|---|
| Category | enum | By object / use case |
| Selected Template | data | |
| Search | text | |
| Blank tile | — | **"Start blank" is a tile in this gallery, first position** — the gallery is the ONLY fork (UIUX review #18) |

### `templateCard` — a template tile
| Attribute | Type | Notes |
|---|---|---|
| Template Name | text | |
| Preview | data | |
| Bound Object | binding | |
| Description | text | |

### `newFormDialog` — create flow
| Attribute | Type | Notes |
|---|---|---|
| Form Name | text | |
| Form Type | enum | **Form** (object-bound) / **Survey** (unbound answer-store) — the first fork in creation |
| Chosen Template | data | Summary chip of the gallery pick (change = back to gallery). **"Start From" enum removed** — the gallery owns that fork, Blank included (UIUX review #18) |
| Target Object | binding | Forms only — Surveys skip binding |

---

## Notes for the tech spec
- **Attribute ownership is single-source:** render components (§1–§3) own the attributes; the
  Design/Build editors (§5–§6) are UIs over them. This is what keeps styling out of the shells.
- **One cascade** (header note): theme default → form-level override → per-component explicit. The
  tech spec formalizes which properties exist at which levels.
- **One button implementation:** primitives slot `submitBar`; they never own button markup (§1/§2).
- **Widget registry:** element types resolve type→component via one registry (§1 note); §3 = the
  registered widgets.
- **Everything themeable is a theme property** that resolves to a token — the `themeEditor` writing a
  property and the engine emitting the `--c-*` are the same pipeline (see the layout×theme contract).
- **Navigation primitives share one interface** (§2 intro) so the engine can lazy-swap them.
- **Field-state colors are theme-level, not per-field** (review Rec 1) — they live in `themeEditor`.

### Localization (review Rec 4 — driven by Surveys; scope honesty per UIUX review #15)
Forms are object-bound, so **bound field labels auto-translate** via the platform (per user/guest
language) — that part comes free. But authored copy exists on **both form types** — section titles,
help text, placeholders, button labels, validation messages, thank-you copy on Forms too; on
Surveys, *everything* is authored (questions, options, help, static content). The Translation Map
covers authored copy for **both**; only bound labels are free. Design:
- A **`translationService`** logic module + a **Translation Map** on the form spec.
- Every authored label / placeholder / help / option / error carries a **translation key**; the map
  holds per-language values; the engine resolves keys against the current user/guest `language` param
  at render time.
- Lives at the runtime layer (`formLayoutEngine` config). **Deferred to a later phase** — not core P1.

### Logic modules (non-UI, ~7)
`layoutModel` · `themeEngine` (token producer) · `presets` · `navState` · `expressionEngine`
(visibility/validation) · `translationService` (survey/authored i18n) · `serialize/spec` utils.

### Counts (post-review)
**44 UI components + ~7 logic modules** (exact table count as of this revision) — the review added:
`formSignature` / `formMap` / `formVideo`, `historyManager`, `draftManager`, `expressionEngine`,
`translationService`.

> **Nav primitives stay SEPARATE — do NOT merge into one `formNav`** (review A). Merging would bundle
> all nav logic (stepper / accordion / conversational) into a component every form downloads, defeating
> the lazy-load win. Kept separate + `lwc:is` dynamic-imported, a guest opening a simple scroll form
> pulls only `navScroll` — critical for guest-site LCP. (Reverses the earlier "could merge" note.)
