# Component Catalog — every LWC, its job, and its configurable attributes

> **Status: spec / design reference.** The full component inventory for the rebuilt app, each with a
> plain-English description and **all** configurable attributes in **business language** (no `--c-*`
> token names — those are the internal wiring; this is what a user/admin actually sets). Attributes
> are *what the component can be configured with*, not its raw technical `@api` surface.
>
> **How to read the layers:** the **render** components (§1–§3) OWN the attributes; the **Design/Build**
> editors (§6–§7) are just UIs that EDIT those same attributes. To stay DRY, each attribute is listed
> once on the component that owns it. Companion: [SURFACE_MODEL_SPEC.md](../redesign/SURFACE_MODEL_SPEC.md) ·
> [DESIGN_MODE_IA.md](../redesign/DESIGN_MODE_IA.md). Authored 2026-07-03.

**Type legend:** `text` · `number` · `toggle` (on/off) · `enum` (fixed choices) · `color` · `image`
· `list` · `rule` (declarative condition) · `binding` (object/field reference).

---

## §1 · Rendering core (shared by builder preview + live runtime)

### `formLayoutEngine` — the orchestrator
Picks the layout, lazy-loads the frame + the one nav primitive it needs, and feeds them the form data. No user UI; driven by the form's saved config.

| Attribute | Type | Notes |
|---|---|---|
| Form Definition | data | The authored spec (pages → sections → elements) |
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
| Page Background Color | color | The backdrop behind the whole form |
| Page Background Opacity | number | 0–100% |
| Page Background Image | image | Uploaded backdrop photo |
| Page Image Fit | enum | Cover / Contain / Tile |
| Page Image Dim | number | Darkening scrim over the image for legibility (0–70%) |
| Background Texture | enum | None / Paper Grain / Grid |
| Texture Intensity | number | 0.25×–2.5× |
| Background Effect | enum | None / Soft Color Blobs |
| Blob Colors | list(color) | Up to 4, when effect is on |
| Glassmorphism | toggle | Frosted-glass blur on the form panel |
| Form Panel Background | color | The form's own surface fill (was "card") |
| Form Panel Opacity | number | Lower it to let the backdrop show through |
| Form Panel Border | color+enum | Color · width · style (solid/dashed/none) |
| Form Panel Shadow | enum | None / Soft / Strong |
| Corner Rounding | enum/number | Shared roundness (panel + sections + fields) |
| Max Content Width | enum | Narrow / Medium / Wide / Full |
| Content Padding | enum | Inherits density scale |
| Vertical Alignment | enum | Top / Center (how the panel sits on the page) |

### `formHeader` — the header lockup
Logo, title, description, highlight banner, and arrangement at the top of the form.

| Attribute | Type | Notes |
|---|---|---|
| Header Style | enum | Standard / Hero (banner) / Minimal / None |
| Header Arrangement | enum | Stacked / Logo Beside / Text Only / Inline / Centered |
| Logo Image | image | Uploaded or URL |
| Built-in Emblem | enum | Decorative logo shape when no image (shield, leaf, aperture, …) |
| Form Title | text | |
| Description / Subtitle | text | |
| Highlight Message | text | Announcement badge/banner (e.g. "Closes Friday!") |
| Header Background Color | color | Header surface fill |
| Header Banner Image | image | Hero background image |
| Header Background Opacity | number | |
| Header Text Color | color | |

### `submitBar` — the actions row
Submit / Next / Back buttons, alignment, and sticky behavior.

| Attribute | Type | Notes |
|---|---|---|
| Submit Button Label | text | |
| Button Alignment | enum | Left / Center / Right / Full-width |
| Submit Placement | enum | Inline / Sticky Footer (pins on long forms) |
| Next Button Label | text | Multi-page only |
| Back Button Label | text | Multi-page only |
| Show Progress | toggle | Pair the bar with a progress indicator |

### `layoutZones` — section arrangement within a page
Arranges a page's sections into columns / grid.

| Attribute | Type | Notes |
|---|---|---|
| Zone Arrangement | enum | Single Column / Two Column / Grid / Bento (mosaic) |
| Column Gap | enum | From spacing scale |
| Responsive Breakpoint | number | Width at which columns collapse to one |
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
| Section Border | color+enum | Color · width · style |
| Section Corner Rounding | number | (shared roundness by default) |
| Section Inner Padding | enum | None / Small / Medium / Large |
| Field Columns | enum | 1 / 2 / 3 across |
| Collapsible | toggle | |
| Default Collapsed | toggle | When collapsible |
| Visibility Rule | rule | Show/hide this section conditionally |
| Repeatable | toggle | When on, the section composes `c-form-repeater` (§3) to wrap its field grid — one shared repeat engine, not a second implementation (review Rec 3) |

### `elementRenderer` — one element (field / content block)
Renders a single element with label, help, and input. Type-driven.

| Attribute | Type | Notes |
|---|---|---|
| Element Type | enum | Field / Hero / Image / Rich Text / Divider / Spacer |
| Field Binding | binding | Object.Field this maps to (**Forms**). **Surveys are unbound** — the answer stores to the answer-store, no binding |
| Field Label | text | |
| Label Position | enum | Top / Left / Hidden |
| Label Style | enum | Default / Uppercase / Muted |
| Help Text | text | Tooltip/hint |
| Placeholder | text | |
| Required | toggle | |
| Default Value | text/binding | Static or from source record |
| Input Style | enum | Outline / Filled / Underline |
| Field Text Size | number | Control scale |
| Field Width | enum | Columns to span |
| Read-only | toggle | |
| Disabled | toggle | |
| Validation Rules | list(rule) | Required / Pattern / Range / Custom + message |
| Visibility Rule | rule | Conditional show/hide |

> **Field-state colors are theme-level, not per-field** (review Rec 1). Focus / error / required-asterisk
> colors live in the **theme** (`themeEditor`, §6), emitted as tokens and consumed by `elementRenderer`'s
> CSS — NOT stored on every field record (that's metadata bloat + "update 40 fields to change one
> color"). Per-field override is intentionally deferred (rare need).

---

## §2 · Navigation primitives (lazy-loaded — one per form)

> **Shared contract — every primitive implements it (review Rec 2).** This is what lets
> `formLayoutEngine` lazy-swap any primitive. The primitive is **dumb**: it never owns validation or
> submission logic — it renders navigation state and *dispatches intent*; the engine owns the truth.
> - **Inputs:** `pages` (page-config array) · `currentPageIndex` · `pageValidity` (per-page valid
>   flags, so it can render gating) · `progress` style.
> - **Events:** `pagechange` (user clicked a tab / step / panel) · `next` · `back` · `submit`.
>
> The per-primitive attributes below are its *presentation* options, layered on that contract.

### `navScroll` — continuous flow
All pages/sections in one scroll; no pagination.

| Attribute | Type | Notes |
|---|---|---|
| Show Page Dividers | toggle | Page labels become dividers when > 1 page |
| Section Spacing | enum | Gap between sections |

### `navStepper` — wizard steps
One page per step with a progress control; forward can be gated.

| Attribute | Type | Notes |
|---|---|---|
| Stepper Placement | enum | Top / Left Rail |
| Stepper Mode | enum | Numbered / Dots / Progress Bar |
| Navigation | enum | Free / Gated (must complete to advance) |
| Show Step Count | toggle | "Step 2 of 5" |
| Rail Width | number | When placed on the left |

### `navTabs` — tabbed pages
One page per tab; free navigation.

| Attribute | Type | Notes |
|---|---|---|
| Tab Alignment | enum | Left / Center / Full-width |
| Tab Style | enum | Underline / Pills / Enclosed |
| Show Tab Icons | toggle | |

### `navAccordion` — expandable panels
Pages/sections as accordion panels.

| Attribute | Type | Notes |
|---|---|---|
| Allow Multiple Open | toggle | |
| First Panel Open | toggle | Default-expand the first |
| Icon Position | enum | Leading / Trailing chevron |

### `navRail` — persistent side nav
A list of pages/sections beside the content pane.

| Attribute | Type | Notes |
|---|---|---|
| Rail Side | enum | Left / Right |
| Rail Width | number | |
| Rail Content | enum | Page List / Progress / Both |
| Sticky Rail | toggle | |
| Mobile Behavior | enum | Collapse to Top Bar / Drawer |

### `navSplitHero` — brand panel + form
Immersive brand panel on one side, form on the other.

| Attribute | Type | Notes |
|---|---|---|
| Brand Panel Side | enum | Left / Right |
| Brand Panel Width | enum | Ratio (⅓ / ½) |
| Brand Panel Content | enum | Logo / Image / Text / Progress |
| Sticky Brand Panel | toggle | |
| Progress Style | enum | Default / Horizontal / None |
| Navigation | enum | Free / Gated (per preset) |

### `navOneAtATime` — one screen at a time (conversational)
One section (or element) per screen, advance-driven.

| Attribute | Type | Notes |
|---|---|---|
| Advance Trigger | enum | Button / Enter key |
| Show Progress Bar | toggle | |
| Back Link Style | enum | Text link / Arrow |

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

### `formHighlight` — announcement banner
Highlight message shown in the header.

| Attribute | Type | Notes |
|---|---|---|
| Message Text | text | |
| Variant | enum | Badge / Banner / Inline |
| Icon | enum | Optional |
| Dismissible | toggle | |

### `heroElement` — hero content block
Draggable hero (image + heading + subtext + CTA).

| Attribute | Type | Notes |
|---|---|---|
| Hero Image | image | |
| Heading | text | |
| Subtext | text | |
| CTA Label | text | |
| CTA Action | enum | Scroll to form / URL / None |
| Alignment | enum | Left / Center |
| Height | enum | Compact / Standard / Tall |
| Overlay Dim | number | Scrim over the image |

### `formSignature` — signature pad (review §2 gap)
Canvas-based signing field for agreements, sign-offs, applications.

| Attribute | Type | Notes |
|---|---|---|
| Pen Color | color | |
| Line Thickness | number | |
| Placeholder Text | text | "Sign here" |
| Output Type | enum | Base64 PNG / ContentVersion relationship |
| Required | toggle | |

### `formMap` — location / map (review §2 gap)
Show an address on a map or let the user pin coordinates.

| Attribute | Type | Notes |
|---|---|---|
| Map Provider | enum | Salesforce Maps / Google / Leaflet |
| Address Binding | binding | Address field to plot |
| Default Zoom | number | |
| Pin Coordinate | data | Captured lat/long |
| Allow Pin Drop | toggle | Let respondents set the point |

### `formVideo` — embedded video (review §2 gap)
Instructional / marketing video block inside a section.

| Attribute | Type | Notes |
|---|---|---|
| Video Source | enum | YouTube / Vimeo / Salesforce CMS |
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
| Submit Target | binding | Object the record saves to |

### `formCompletion` — post-submit screen
Thank-you or redirect after submit.

| Attribute | Type | Notes |
|---|---|---|
| Completion Outcome | enum | Show Message / Redirect |
| Thank-You Message | text | Rich text |
| Redirect URL | text | When redirecting |
| Show Response Summary | toggle | Recap of submitted values |
| Allow Another Response | toggle | "Submit another" |

### `draftManager` — save & resume (review §2 gap)
Lets respondents (especially guests on long multi-page forms) save progress and continue later.

| Attribute | Type | Notes |
|---|---|---|
| Enable Save & Resume | toggle | |
| Draft Storage | enum | Draft record (custom object) / Browser local storage |
| Resume Key | data | Unique token per in-progress response |
| Resume Delivery | enum | Emailed link / Copyable link |
| Draft Expiry | number | Days a draft is retained |

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
Builder-shell service managing the undo/redo stack for all form edits.

| Attribute | Type | Notes |
|---|---|---|
| Stack Limit | number | Max steps retained |
| Undo / Redo | events | Wired to toolbar + keyboard shortcuts |
| Coalescing | toggle | Merge rapid edits (e.g. typing) into one step |

### `fieldPalette` — the element palette
Draggable element/field types.

| Attribute | Type | Notes |
|---|---|---|
| Categories | enum | Fields / Layout / Content / Advanced |
| Available Types | list | Filtered by bound object |
| Search | text | |

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

### `validationEditor` — validation rules
| Attribute | Type | Notes |
|---|---|---|
| Rule Type | enum | Required / Pattern / Range / Custom |
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

### `colorControl` — color input + contrast badge
Reusable color picker with live WCAG feedback.

| Attribute | Type | Notes |
|---|---|---|
| Label | text | |
| Color Value | color | |
| Allow Alpha | toggle | Transparency (backgrounds only) |
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
| Start From | enum | Template / Blank |
| Target Object | binding | |

---

## Notes for the tech spec
- **Attribute ownership is single-source:** render components (§1–§3) own the attributes; the
  Design/Build editors (§5–§6) are UIs over them. This is what keeps styling out of the shells.
- **Everything themeable is a theme property** that resolves to a token — the `themeEditor` writing a
  property and the engine emitting the `--c-*` are the same pipeline (see the layout×theme contract).
- **Navigation primitives share one interface** (§2 intro) so the engine can lazy-swap them.
- **Field-state colors are theme-level, not per-field** (review Rec 1) — they live in `themeEditor`.

### Localization (review Rec 4 — driven by Surveys)
Forms are object-bound, so **bound field labels auto-translate** via the platform (per user/guest
language) — nothing to build there. But **Surveys are unbound** ([[project-form-vs-survey-model]]) and
all their copy is *authored* (questions, options, help, static content) with no field metadata to
translate from — so they need real i18n. Design:
- A **`translationService`** logic module + a **Translation Map** on the form spec.
- Every authored label / placeholder / help / option / error carries a **translation key**; the map
  holds per-language values; the engine resolves keys against the current user/guest `language` param
  at render time.
- Lives at the runtime layer (`formLayoutEngine` config). **Deferred to a later phase** — not core P1.

### Logic modules (non-UI, ~7)
`layoutModel` · `themeEngine` (token producer) · `presets` · `navState` · `expressionEngine`
(visibility/validation) · `translationService` (survey/authored i18n) · `serialize/spec` utils.

### Counts (post-review)
**~46 UI components + ~7 logic modules** — the review added: `formSignature` / `formMap` / `formVideo`,
`historyManager`, `draftManager`, `expressionEngine`, `translationService`. Nav primitives could still
merge into one `formNav` with a `mode` attribute (drops ~5).
