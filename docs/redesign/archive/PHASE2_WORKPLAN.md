# Phase 2 Workplan — c/formViewer (new player) + Creation Wizard

> ## ▶ RESUME HERE — status & next steps (2026-06-13)
> Session paused for a Claude Code **restart** (to load the Edge Claude browser
> extension + the impeccable `ui-design-reviewer` plugin — both only register on
> startup). Edge has the Claude extension installed (Brave is unsupported —
> `/chrome` shows "Not detected"). After reload: run `/chrome`, then resume.
>
> **DONE & deployed (gallery-first creation + live viewer):**
> - c/formViewer (T2.3), c/formSectionRenderer (T2.1), engine live mode (T2.2);
>   FormViewerController/FormViewerGuest, FormSubmitController split,
>   FormCreateController, FormTemplateController.
> - Gallery-first creation `c/formCreationGallery` — My templates / Built-in /
>   Layouts; `c/formTemplates` catalog; createFromTemplate.
> - Custom templates: `Form_Template__c` (Definition JSON blob) + save/list/
>   delete; save-as-template dialog + custom-CSS box (CSS STORED, not applied).
> - Skins come from formThemes `LAYOUT_TEMPLATES` (same as harness); a layout
>   defaults to its archetype skin; new "Lightning" archetype `c/shellSf` +
>   faithful "Salesforce" skin (Salesforce Sans / #f3f3f3 / 4px / #dddbda).
> - ALL 12 shells render a header (logo + title + subtitle); engine `@api
>   formLogo` → model.header.logo; demo `SAMPLE_LOGO` + `SAMPLE_HEADER`.
> - Section icons in BOTH live renderer + preview stub; layout previews use a
>   3-page `sampleLayoutParts()` so wizard/sidenav/tabs show real structure.
> - themeVars header tokens `--c-header-bg` + auto-contrast `--c-header-text`
>   (`readableOn`). 106 Jest green; all deployed.
>
> **IMPECCABLE AUDIT done 2026-06-13 — 13/20 (Acceptable→Good).** Mostly NOT
> AI-slop; issues clustered in gallery chrome + perf + one contrast bug.
> **ALL audit fixes now done & deployed:**
> - ✅ Split Hero panel = real header hero (logo chip + centered title/subtitle,
>   readable via --c-header-text/--c-header-bg) — fixes the P1 contrast bug.
> - ✅ Removed shellSf "Form" eyebrow (AI tell + unfaithful to SLDS).
> - ✅ Gallery focus-visible on chips/buttons (keyboard a11y).
> - ✅ **[P1] Gallery preview perf** — lazy-render: only the first `INITIAL_BATCH`
>   (6) cards mount a live engine eagerly; the rest lazy-mount via
>   IntersectionObserver (rootMargin 300px) on scroll, with a shimmer skeleton
>   placeholder. Category switch resets the budget (frees prior engines).
> - ✅ **[P2] Touch targets** — `.cat-chip`/`.d-back`/`.link-btn` min-height 36px;
>   icon-only `.g-close`/`.dev-btn` 40×40 (new `--g-tap`/`--g-tap-icon` tokens).
> - ✅ **[P2] Gallery chrome raw hex → tokens** — gallery-local palette on :host
>   (`--g-ink/-muted/-faint/-line/-line-soft/-accent/-accent-ink/-danger/-bg`).
>   NOTE: deliberately NOT the form `--c-*` skin tokens — those belong to the
>   themed preview engine inside the cards; the chrome is its own neutral system.
> - ✅ **[P3] Gradient-text skin** — removed the dormant `--c-title-fill`
>   gradient branch (was emitted by immersiveGlass `titleStyle:'gradient'` but
>   consumed by ZERO shells); title fill is now always solid. Test updated.
>
> **NEXT — once Edge browser is bridged (`/chrome` reconnect):**
> - VISUAL VERIFICATION PASS: drive browser → harness → "Create gallery";
>   screenshot the gallery + all 12 shells; verify Salesforce/Lightning look,
>   header logo/subtitle/icons, multi-page layout previews vs a real record page.
> - Optionally run further impeccable commands (`/impeccable optimize`,
>   `adapt`, `polish`). NOTE: impeccable wants a one-time `init` (PRODUCT.md) for
>   its automated flow — skipped so far; ran audit off its rubric directly.
>
> **DEFERRED FEATURE — image uploads + per-surface opacity** (theme editor):
> Owner requirement — users upload images for (a) overall page background,
> (b) header logo, (c) header background; and set OPACITY for page bg, header
> bg, content bg, page-nav bg. Storage = ContentVersion via FormAssetController
> ([[project-config-image-storage]]). Needs new skin keys + themeVars tokens
> (pageBgImage, headerBg/headerBgImage, navBg, contentBg + *-opacity) + shells
> applying them. GATED on the formThemes decision below.
>
> **UPSTREAM DECISION (OPEN) — c/formThemes keep-vs-replace.** Owner flagged it
> "not working as expected." It gates the manual theme editor, AI theming
> (Phase 4), AND the image/opacity system above. Settle before deeper theming.
>
> **THEN:** T2.6 (template polish + gallery a11y), T2.7 (wire gallery as the
> "New Form" entry on a NEW-ERA home — NOT legacy c/formDesigner). ALL AI =
> Phase 4 (MASTER_PLAN §5). Detailed per-task notes in the T2.x cards below.

> OWNER DECISION 2026-06-12 (supersedes the kickoff "evolve in place" rule):
> **full clean break.** The new stack reuses NO legacy components — build a
> brand-new **c/formViewer** on the Phase 1 engine, with new Apex for data
> load. The legacy app (c/formPlayer, c/formDesigner, c/propertyPanel,
> c/fieldPreview, FormPlayerController, FormGuestController, …) keeps running
> in parallel, untouched, and is deleted in Phase 6.
>
> "Legacy" vs "new-era" line: anything built FOR the redesign counts as new
> and is kept — the engine + 11 shells + layout* modules, c/formThemes (the
> token engine), FormLayoutSpecValidator/FormKeyUtil/applySpecPatch, the
> atomic FormSubmitController, and c/formRepeater (related-list work).
> The DATA MODEL (Form__c…Form_Element__c + triggers) is shared by both
> stacks and unchanged.
>
> Same rules as PHASE1_WORKPLAN: tiers ([A]/[B]), frozen contracts §2,
> gates §4. Global guardrails carry over (API v66.0, USER_MODE/CRUD/FLS,
> tokens only, no archetype conditionals outside the registry). c/formPlayer,
> c/formDesigner, c/propertyPanel remain do-not-modify.

## 0. Grounding facts (verified against the code 2026-06-12)

Platform constraints that shape the design (these are NOT legacy concerns —
they apply equally to a fresh build):

1. `lightning-input-field` only works inside `lightning-record-edit-form`
   **within the same template** — it does not register across nested
   component boundaries. ⇒ whichever component renders the input-fields must
   own the record-edit-form.
2. Submission must stay custom Apex (`FormSubmitController.submitForm`,
   atomic + repeater-aware) — record-edit-form is context-only, native DML
   never fires. Same pattern the old player proved out.
3. Values/validity cannot be collected with querySelector across shadow
   boundaries ⇒ they flow UP via `bubbles: true, composed: true` events.

Behavior reference: the old player's element-type list (14 branches:
fieldDefault, customField, toggle, radio, dropdown, checkboxGroup, slider,
consent, fileUpload, displayText, image, divider, spacer, callout — see
formPlayer.html:211–434) + c/formRepeater for related lists. Feature parity
checklist for the viewer lives in gate 2.

## 1. Architecture (frozen)

```
c/formViewer  (NEW — loads data, owns state, submits)
  └── c/formLayoutEngine (mode="live")           ← Phase 1, unchanged contract
        └── shell → c/layoutZones → c/layoutSectionHost
              └── c/formSectionRenderer (NEW)    ← one lightning-record-edit-form
                                                    per section + element branches
```

- **c/formSectionRenderer** owns the per-section record-edit-form + all
  element types + repeater hosting. Written fresh; the old player's branches
  are the behavior reference, not code to be moved.
- **The engine stays dumb** (Phase 1 contract §2.2 unchanged): no Apex, no
  aggregation. Section events bubble composed through the engine; formViewer
  listens at its root.
- **formViewer owns**: Apex data load via NEW `FormViewerController` (clean
  break — see T2.0; USER_MODE + guest guards per the salesforce skill,
  mirroring the guest patterns the old controllers proved), spec resolution
  (Layout_Spec__c, else legacy-layout → preset map), visibility rules
  evaluation (pass filtered pages/sections to the engine), nav validation
  hook, value/validity aggregation, submit via FormSubmitController
  (new-era, kept), thank-you/redirect, URL prefill (guest).
- Per-section record-edit-form = N UI-API describes per form. Accepted; if
  perf gate flags it, fallback = one form per page. Do not pre-optimize.

## 2. Code-unit contracts (FROZEN — change requires human sign-off)

### 2.1 `c/formSectionRenderer`

```html
<c-form-section-renderer
  section={sec}            <!-- {key, title, style, elements[]} -->
  object-api-name={obj} record-type-id={rt} record-id={recId}
  mode="live|preview" density={density}>
```
```js
// Events (bubbles: true, composed: true):
//   'sectionvalue'    {sectionKey, values: {fieldApi: value}}
//   'sectionvalidity' {sectionKey, valid}
// @api getValues() / collectRepeaterBlocks() / reportValidity()
// @api clearServerErrors() / applyFieldErrors({fieldApi: msg})
```

### 2.2 `c/layoutSectionHost` (engine, amended)

`mode="live"` renders `<c-form-section-renderer>`; other modes keep stubs.
New pass-through `@api`s: objectApiName, recordTypeId, recordId.

### 2.3 `c/formViewer`

```html
<c-form-viewer form-id={id} record-id={prefillId} mode="published|test">
<!-- targets: lightning__AppPage, lightning__RecordPage, lightning__HomePage,
     lightningCommunity__Page (guest) — same surface set as old player -->
```
Legacy layout → archetype map (on-the-fly materialize, never persisted):
classic→classic, split→splitHero, immersive→immersiveGlass ("Glass Light"
skin), stepped→wizardStepper, compact→document.

## 3. Task cards

### T2.0 [A] `FormViewerController` (Apex)
DONE 2026-06-12. `FormViewerController` (with sharing, USER_MODE):
`getViewerForm(formId)` / `getViewerFormByVersion(versionId)` →
ViewerForm {meta, bodyJson = Layout_Config__c, layoutSpecJson =
Layout_Spec__c} + cacheable `getPicklistOptions` (isAccessible-filtered,
authenticated only — guests use Custom_Options_JSON__c). Guest path =
separate `FormViewerGuest` (without sharing, hard-gated Published +
Public_Guest, mirrors the proven publish-snapshot pattern; reads the active
version's Layout_Spec__c only AFTER gates pass). Zero legacy imports.
Apex tests still owed (owner-deferred, tracked §5).
MANUAL STEP at viewer go-live: grant the Experience Cloud guest profile
access to FormViewerController (class access), same as FormPlayerController
has today.

### T2.1 [A] `c/formSectionRenderer`
DONE 2026-06-12 (deployed). Built fresh per §2.1: one record-edit-form per
section (context only, never submits), all 14 element kinds, hidden-carrier
input-field behind each custom control (FLS + record-value load), picklists
via its own cacheable `getPicklistOptions` wire (guests fall back to
customOptions — no engine-contract widening), c/formRepeater hosting.
Contract EXTENSIONS (additive, not changes): optional `@api prefillValues`
(imperative push, never bound — binding undefined wipes record values in
edit mode) and `@api applyRepeaterRowErrors(repeaterId, errors)` (collect
blocks are tagged with repeaterId for error routing).
Hidden elements (uiBehavior Hidden OR parent-evaluated `visible:false`) stay
MOUNTED (CSS hide) and drop their required flag.
Verification = gate 1 (element parity matrix) via the harness LIVE seeds.

### T2.2 [A] Engine live mode  (deps: T2.1)
DONE 2026-06-12 (deployed). Record context (objectApiName/recordTypeId/
recordId/prefillValues) rides as new engine @apis, stamped onto each section
VM — shells stay chrome-only, zero shell edits. layoutZones feeds the host's
§2.2 pass-through @apis from the section VM. layoutSectionHost renders
c/formSectionRenderer when mode="live", stubs otherwise. Harness: "Live"
checkbox + two LIVE seeds in c/layoutFixtures (contactLive: statics +
toggle/radio/dropdown/multiselect/consent/file; accountLive: slider +
contacts repeater — 14 kinds covered between them) + a sectionvalue event
readout line. (Closes Phase 1 gate-4 P3.)
VERIFIED in-org 2026-06-12 (harness, classic archetype, both LIVE seeds):
real schema labels/requiredness via input-field; LeadSource radio + Rating
radio show real picklist values (wire works); Salutation/Industry dropdowns;
custom-options checkbox group; toggle; slider 0–500; read-only Description;
rich text/callout/divider/image/spacer/consent/file-note statics; Contacts
repeater (add/remove rows) inside the section. sectionvalue event crossed
all shadow boundaries to the harness: `sec_name: {"FirstName":null,
"LastName":"Tester","LeadSource":"Web"}`. Preview mode still renders stubs.

### T2.3 [A] `c/formViewer`  (deps: T2.2)
DONE 2026-06-12 (deployed, 73 Jest green, lint clean). Built per §1/§2.3.
Pieces:
- **c/formViewer** (NEW, exposed; RecordPage/AppPage/HomePage/Community).
  Loads via FormViewerController.getViewerForm / getViewerFormByVersion;
  parses Layout_Config__c → flat pages/sections/elements for the engine;
  resolves the spec (stored Layout_Spec__c else legacy map); drives the
  engine in mode="live". Does NOT import c/formThemes (owner call) — the
  stored theme JSON passes through to the engine `skin` api as opaque data.
- **c/formVisibility** (NEW pure module) — ports the legacy declarative
  rule evaluator (logic all/any/custom, 11 operators). Page visibility is
  evaluated once at load (stable nav set); section/element visibility is
  reactive (engineSections/engineElements stamp `visible`, renderer already
  honors it — hidden stays mounted, drops required).
- **Aggregation without querySelector-across-shadow**: each renderer fires
  `sectionregister` (composed) on connect handing up its host element;
  formViewer keeps a sectionKey→host map (pruned by isConnected). Values
  cache from every `sectionvalue`; the cache is fed back as the engine's
  prefillValues so wizard page remounts restore typed values.
- **Page-nav validation**: engine gained `@api validatePage` (gates only
  where the nav model gates — stepper/oneAtATime) + `@api goToPage` (jump to
  first error page). formViewer.runPageValidation calls each mounted
  section's reportValidity.
- **Submit**: new `FormViewerController.submitViewerForm(formId, …)` resolves
  the primary object SERVER-SIDE (client never picks the object) → internal
  via FormSubmitController.submitCore (USER_MODE, atomic, repeater-aware) /
  guest via FormViewerGuest.submitGuestForm (hard-gated Published +
  Public_Guest, INSERT ONLY, child blocks allow-listed against the published
  body snapshot). FormSubmitController split: submitForm (asserts auth) now
  delegates to reusable submitCore.
- **Errors** routed back: parent field errors → owning section's
  applyFieldErrors (parked + replayed on register if its page is unmounted);
  child errors → originating repeater via applyRepeaterRowErrors; jumps to
  first error page.
- **Endings**: thank-you / ToastAndGo / auto-redirect countdown / "fill again"
  return; URL prefill (?param→urlPrefillParam) + honeypot + guest captcha.
- **Legacy map widened (T2.4 preview)**: §2.3 froze the VISUAL axis
  (theme.layout). Added the matching NAV axis (layoutMode): Multi_Page_Wizard
  →wizardStepper, Vertical_Navigation→sideNav, Top_Navigation→tabbedCard,
  applied only when >1 page; else the visual map. Without this a 9-page
  legacy wizard collapsed to one classic scroll.
- **Renderer additions**: `sectionregister` event; section-level `visible:false`
  → mounted+hidden+non-blocking (isSectionHidden); multi-select prefill
  round-trips ';'-joined strings back to arrays.
VERIFIED against real org body JSON (FLyer/MultiPage/New Single): element
shapes match (Field+fieldApiName/uiBehavior, Callout, Image+imageUrl,
Spacer+spacerSize); section keys match (id/name/showHeader/gridColumns/…).
Browser e2e (fill→nav→submit→thank-you, guest) = gate 2 — pending (Chrome
MCP was disconnected this session; harness wired with a "Viewer formId" box).
KNOWN GAPS for T2.4: legacy `isRepeatable` sections (old repeatable-section
model) render flat — the new repeater path keys off `relatedSections`;
$User.*/$Profile.* advanced-visibility context not fetched (only $User.Type
+ $Form.* seeded) — add if a mapped form needs it.
Accept: end-to-end fill → page-nav validation → submit → thank-you on an
internal page AND an Experience Cloud guest page; URL prefill works;
validation-rule errors land on the right fields; repeater atomic submit.

### T2.4 [B] Legacy mapping QA  (deps: T2.3)
The §2.3 map renders old forms in formViewer for preview/wizard purposes.
Side-by-side vs old player; document accepted deltas. No auto-migration —
existing published forms stay on c/formPlayer until switched by a human.

### CREATION REDESIGN — PARADIGM CHANGE 2026-06-12 (OWNER)
> The 3-step wizard in CREATION_WIZARD.md is REJECTED. Owner: a bigger modal
> that re-asks name/object/layout/theme is just `newFormDialog` cloned — not a
> redesign. New paradigm = **GALLERY-FIRST**: a catalog of real, themed example
> forms; pick the closest → it becomes yours to edit. Within gallery-first the
> owner picked **option 1: curated catalog pre-bound to standard objects**
> (NOT the object-remap variant) — every template targets a standard object
> every org has, so picking one just works (no object step, no empty-org
> problem). Only the **Blank** template asks for an object.
> CREATION_WIZARD.md §1–6,9 (wizard steps / Start-with-AI flow) are superseded;
> §7 seed-describe is unused for now (templates carry their own fields); §8
> create-action and the LAYOUT_SPEC §6 single-writer invariant still hold.

### T2.5 [A] Gallery-first creation  (deps: T2.2)  — DONE 2026-06-12 (deployed)
Replaces the wizard tasks. Built:
- **c/formTemplates** (NEW pure data module, c/layoutFixtures pattern — no
  imports). `FORM_TEMPLATES` = 7 curated, themed examples (Contact intake,
  Lead capture, Support request [multi-page wizard], Event signup, Account
  onboarding [side-nav], Satisfaction survey [conversational], Blank), each
  pre-bound to a standard object (Contact/Lead/Case/Account) with a plain
  theme literal (NO c/formThemes — opaque skin). Helpers: `toEngineParts`
  (engine preview parts), `toBodyJson` (Layout_Config__c body in the verified
  org shape), `templateById`, `TEMPLATE_CATEGORIES`. Multi-page layout modes
  put each authored section on its own page.
- **c/formCreationGallery** (NEW, exposed App/Home). Gallery view = category
  chips + cards, each a LIVE engine mini-preview at 0.18 (real layout+theme,
  not illustrations). Detail view = bigger live preview (0.42, desktop/mobile
  toggle) + name field + read-only bound-object tag (Blank shows an object
  picker). "Use this template" → create → done screen. Emits `formcreated`
  {formId, versionId} + `close`.
- **FormCreateController** (NEW Apex, with sharing, USER_MODE):
  `createFromTemplate(name, object, type, layoutMode, adapters, bodyJson,
  layoutSpecJson)` → inserts Form + draft Version (Layout_Config__c body +
  validated Layout_Spec__c) + Page 1, returns {formId, versionId}. Spec is
  run through FormLayoutSpecValidator.validate BEFORE any DML (single-writer
  invariant). `getCreateObjects()` cacheable (Blank picker). Legacy
  FormDesignerController untouched.
KEY FACT (verified): builder draft body = Form_Version__c.Layout_Config__c
JSON; Form_Section__c/Form_Element__c rows are PUBLISH-time artifacts. So a
template just needs the right body JSON → opens in the existing builder AND
renders in c/formViewer. No section/element rows written at create.
Harness: "Create gallery" checkbox renders c/formCreationGallery; formcreated
echoes "created form <id> (version <id>)".
PENDING: browser click-through (Chrome MCP down this session); Jest for the
template helpers + gallery state; "Start with AI" (Phase 4).

### T2.5b [A] Custom (saved) templates  (deps: T2.5)  — FOUNDATION DONE 2026-06-13
Owner ask: users save their own reusable templates AND start from a bare
layout; creation offers My templates / Built-in / Layouts. Chose BOTH save
surfaces + theme-and-raw-CSS styling.
DONE this slice (deployed, lint clean, 105 Jest, Apex round-trip verified):
- **Form_Template__c** custom object — ONE `Definition__c` JSON blob (+ Name,
  Category__c, Is_Active__c) so new template props never need a schema change.
  Added to Form_Builder_Admin permission set (object + 3 fields).
- **FormTemplateController** (with sharing, USER_MODE): listTemplates
  (cacheable), saveTemplate (upsert; embedded specJson validated via
  FormLayoutSpecValidator), deleteTemplate (soft delete Is_Active__c=false).
- **c/formTemplates** helpers: customRecordToTemplate, bareLayoutTemplate +
  LAYOUT_LABELS/LAYOUT_OPTIONS (start-from-layout), bodyToEngineParts (preview
  a stored body). All still import-free.
- **c/formCreationGallery** reworked: unified catalog = custom + built-in +
  layouts; source-aware chips (My templates / categories / Layouts);
  engineFor()/buildPayload() branch by source; "Save as my template" dialog
  (name + category + custom-CSS box; captures body+spec+theme into a record);
  delete on custom. refreshApex on the listTemplates wire.
STAGED (next increments, NOT done):
1. **Styling EDITOR** — live MANUAL theme controls (accent/font/bg/corners/
   density) in the detail/save flow. Blocked on the c/formThemes keep-vs-replace
   decision (see T2.6); today Save captures the template's EXISTING theme only.
   NOTE: AI-driven theming (describe-your-brand, brand-from-URL → token patch)
   is NOT here — all AI is Phase 4 (MASTER_PLAN §5). This editor is the manual,
   no-license path that AI later feeds token patches into.
2. **Raw-CSS APPLICATION** — Custom_CSS is STORED but not yet applied. CSS can't
   cross the viewer→engine→shell shadow boundaries, so applying it needs either
   token overrides or `::part` hooks exposed on shells. Design carefully; do not
   inject unscoped <style>.
3. **Save-from-an-existing-form** surface — the second save path. Needs a
   non-legacy host (new-era home / quick action on Form__c) since c/formDesigner
   is do-not-modify. The Apex (saveTemplate) is ready to receive it.

### T2.5c — Harness feedback round 1  (DONE 2026-06-13, deployed)
From owner testing the gallery in the harness:
- **Skin picker in detail view** — every template/layout can be re-skinned
  before create. CORRECTION (round 2, owner: "use the harness skin options"):
  skins come from **formThemes LAYOUT_TEMPLATES** — the SAME designed skins the
  harness skin dropdown uses (a lightning-combobox, not bespoke chips). The
  first invented SKINS catalog (Slate/Warm/Forest/Midnight/Mint) was scrapped.
  Chosen skin re-themes the live preview + is written into the created form's
  body theme + the saved-template definition.
- **Layout default skin = its archetype's own skin** (owner: layouts must NOT
  default to a generic Salesforce/classic). `defaultSkinFor(layout)` =
  LAYOUT_TEMPLATES[archetype] (each archetype already has a designed default
  skin keyed by name in LAYOUT_TEMPLATES). Built-in templates keep their
  authored theme; custom keep their saved theme; combobox "Default (layout
  style)" resolves to these.
- **"classic" skin was a misnomer** (owner: "isn't that the default SF theme?").
  It was Salesforce-*flavored* but used IBM Plex/system font + 8px radius, not
  faithful SLDS. RESOLUTION: added an additive **`sfRecordPage` skin to
  LAYOUT_TEMPLATES** labeled "Salesforce" (faithful SLDS: Salesforce Sans,
  #f3f3f3, 2px radius) — it is the sfRecordPage archetype's default skin AND the
  honest "Salesforce" option in the picker. Did NOT mutate the legacy
  LAYOUT_TEMPLATES.classic entry (would restyle existing forms) — open if owner
  wants that too.
- **Round 3 (owner: "are you sure CSS/fonts match SLDS?" — they didn't):** the
  layout was renamed **"Lightning"** (LAYOUT_LABELS; internal id stays
  sfRecordPage). Skin made SLDS-faithful: new `slds` radius (4px) in RADIUS_MAP,
  new `borderColor` skin hook in themeVars (→ --c-border-light/--c-border), and
  the Salesforce skin set to radius 'slds' + cardShadow 'none' + borderColor
  '#dddbda' + pageBg #f3f3f3 + Salesforce Sans. Section cards + chrome inherit
  these (shell is token-driven), and the input fields are native
  lightning-input-field (true SLDS already). FONT CAVEAT (platform, unfixable
  without bundling a licensed font): 'Salesforce Sans' only resolves INSIDE
  Lightning Experience; on a guest/community page it falls back to Arial/system.
- **New archetype `sfRecordPage`** ("SF Record Page" layout) = a Salesforce
  Lightning record page look: `c/shellSf` (highlights header + wide scrolling
  stack of SLDS section cards). PROOF of the extensibility guarantee: adding it
  touched only presets.js (preset + REGISTRY), engine SHELL_LOADERS, the new
  shell, and LAYOUT_LABELS — ZERO changes to formViewer/formVisibility.
- **Layout previews no longer look empty** — bare layouts preview with
  SAMPLE_SECTIONS (headers + sample fields) via sampleLayoutTemplate; this is
  PREVIEW-ONLY (dummy fieldApiNames), create still produces the empty form.

### T2.5d — Preview richness round  (DONE 2026-06-13, deployed)
Owner feedback comparing gallery previews to the harness seed previews:
- **Layout previews were single-page** (wizard showed 1 step). Fixed: bare
  "Layouts" now preview a rich **3-page** sample (`sampleLayoutParts()` in
  c/formTemplates — pages/sections/elements engine-contract shape), so wizard
  shows steps, side-nav shows nav items, tabs show tabs, etc. PREVIEW-ONLY;
  creating from a bare layout still yields an empty form.
- **Header logo + subtitle**: engine gained `@api formLogo` → model.header.logo;
  the 8 header-bearing shells render a guarded `<img>` (classic, sf, glass,
  document, tabbed, mosaic, accordion, sideNav). A generic **SAMPLE_LOGO**
  (inline SVG data URI "AcmeForms" badge) + **SAMPLE_HEADER** (title/subtitle/
  logo) in c/formTemplates demo it on layout previews. (Subtitle already mapped
  to header.description.)
- **Section header icons**: the live renderer already showed section icons; the
  PREVIEW stub (c/layoutSectionHost) now renders `section.icon` + title too.
  Sample sections carry SLDS utility icons. Built-in templates can add per-
  section icons later (same `icon` key).

### T2.6 [B] Template polish + theming decision  (deps: T2.5)
Was "gallery + theme steps". Now: more/better curated templates; per-template
theme review (OWNER FLAGGED c/formThemes as "not working as expected" — decide
keep-and-fix vs replace before leaning on it); empty-states/a11y on the
gallery (roving tabindex on cards, reduced-motion). NO separate theme wizard
step — theming lives in the builder.

### T2.7 [A] Make the gallery the create path  (deps: T2.5, T2.6)
Wire c/formCreationGallery as the "New Form/Survey" entry on a NEW-ERA home
(legacy c/formDesigner is do-not-modify — do NOT bolt it on there). On
`formcreated` → navigate to the builder. Old newFormDialog stays on the legacy
designer until Phase 6.

## 4. Review gates

1. After T2.1: element parity matrix — every type × required × FLS ×
   validation error, harness live mode vs old player behavior.
2. After T2.3: formViewer e2e — guest, FLS, prefill, repeaters, error
   mapping, all 11 archetypes spot-checked live.
3. After T2.6: uiux-flow-reviewer pass on the GALLERY (cards, detail, preview)
   before T2.7.

## 6. Extensibility guarantees (verified 2026-06-13)

**Adding a new shell/archetype** touches exactly THREE places — never the
viewer or visibility layers:
1. new `c/shellX` LWC,
2. `lwc/layoutModel/presets.js` (PRESETS + REGISTRY entry),
3. engine `SHELL_LOADERS` literal-import map.
`c/formViewer` and `c/formVisibility` need ZERO changes: the viewer hands the
spec to the engine and is otherwise archetype-blind (it only names archetypes
in the LEGACY fallback map, which is optional — touch it only if you want OLD
spec-less forms to adopt the new layout); visibility is pure rule evaluation
with no layout knowledge.

**All shell copy is form-configurable** via `model.labels` (engine builds it:
DEFAULT_LABELS → per-archetype default [ARCHETYPE_LABEL_DEFAULTS, e.g.
console→Save, document→Submit application] → form override). Keys today:
submit, next, back, continue, ok, cancel, draftBadge, stepWord, breadcrumbRoot.
formViewer sources overrides from formSettings.submitLabel + formSettings.labels.
RULE for new shells: render every visible string from `{model.labels.*}` — NEVER
hardcode text (arrows/checks stay as aria-hidden decoration). Add a new key to
DEFAULT_LABELS when a shell needs new copy.

**Styling** is skin/token driven (`var(--c-*)` with fallbacks in each shell's
CSS). Configurable via the form's theme (opaque skin passthrough). The
keep-vs-replace decision on c/formThemes (owner flagged it) is T2.6 — don't
deepen the styling-config surface until that's settled.

## 5. Carried backlog (not Phase 2 scope)
- Delete c/formPlayer + switch its page placements to formViewer → Phase 6.
- T19 webfonts; timeline + kiosk shells; Phase 1 Apex tests owed; harness
  P3s; single-page sideNav scroll-spy.
- Conversational "press Enter" micro-hint + any remaining decorative strings
  → fold into model.labels if full localization is needed.
