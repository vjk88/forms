---
name: project-designer-redesign
description: "Form Designer UX redesign — converged architecture: blueprint editor + live formViewer preview, Build/Design two-mode workspace. SPEC/mockup stage, no code yet."
metadata: 
  node_type: memory
  type: project
  originSessionId: 416ca5d1-83fe-4b41-ac47-8c31e7fd0159
---

**Form Designer redesign — architecture CONVERGED (owner, 2026-06-15). SPEC
COMPLETE, NO code yet.** Build-ready brief: **docs/redesign/DESIGNER_UX_SPEC.md**
(the single source of truth — read it first). Interactive mockup:
docs/redesign/designer-ux-blueprint-mockup.html (visual reference; earlier WYSIWYG
variant designer-ux-mockup.html). Phased plan: P1 Hero element → P2 blueprint shell
(c/formStudio, fresh) → P3 design-mode panels + header zone → P4 polish.

**Core decision — decoupled editor (owner's insight):** the editor edits the
MODEL; `formLayoutEngine`/shells/themes render it. So:
- **Blueprint** (center) = a clean, high-contrast STRUCTURAL editor (sections,
  fields, hero, related lists, pages, columns, order, drag handles). Theme-agnostic,
  STABLE — never changes when layouts/themes are added.
- **Live preview** (right) = the real `formViewer`/`formPlayer`. Device toggle
  (desktop/mobile), persistent, on by default. ALL presentation lives here.
- **Payoff:** add layouts/themes forever → only touch the render path. Editor built
  ONCE. Works because `materialize()` already derives layout from the model.

**Two-mode workspace (persistent `Build | Design` toggle, top bar):**
- **Build** = blueprint + left dock {Fields, Insert(=Elements)} + selection shows
  element properties in the LEFT panel (unified inspector lives left now). Preview right.
- **Design** = blueprint AUTO-HIDES, preview expands full; left dock swaps to
  appearance categories {Layout, Theme & Color, Header, Buttons, After-submit}.
  Chosen over a buried 'Back' button / hiding the Fields icon — mode is always
  legible, Design's many categories get a home (à la Zoho 'Form Customization' /
  Webflow Designer-Editor). Mechanic = one `mode` flag swaps dock + hides blueprint.

**Confirmed sub-decisions:**
- Docks: icon dock, panel STAYS OPEN (pin/auto-close toggle).
- Pages: NOT a drag block — managed on a tab strip above the blueprint (add/reorder).
- Sections: draggable from dock + '+ Add section' on canvas.
- Related List: draggable, drops OUTSIDE sections; pick child object once → LOCKS;
  selecting it switches the left Fields panel to the related object's fields.
- Hero: draggable content block (body or header zone). See [[project-header-hero-dnd]].
- Blueprint has a 'Hide editor' collapse (separate from Design mode) so preview can
  take more space within Build mode too.
- Icons: mockups use hand-drawn SVG (throwaway, no license); SHIP with SLDS
  `lightning-icon utility:*` (consistent + license-safe for 2GP). Owner OK with the
  modern look for the DESIGNER chrome; NOT for in-form content icons (tabled).

**c/formStudio — DEPLOYED & functional, iterating (2026-06-16, revcloud@dev.com).**
All 4 files exist (js/html/css/meta v66.0, isExposed, AppPage/HomePage/Tab). Chrome =
dark rails/blueprint + LIGHT preview. Owner reqs MET: preview `flex:0 0 60%` (→`1 1 100%`
in design/collapsed); Fields list shows inline `• required` legend.
- **Owner already wired the Apex/data layer:** `FormStudioController` (getAllForms,
  getFormVersions, getObjectFields, getFormLayout). Top bar de-hardcoded
  (formTitleLabel/versionPillLabel), Forms/Surveys tabs, real form+version dropdown
  menus, describe-driven Fields list, `loadLayout`→`bodyToEngineParts(c/formTemplates)`
  feeds the live `c-form-layout-engine`. `_parts` is the working model (defaults SAMPLE).
- **Build-mode AUTHORING done (this session, Opus):** click a Field row → adds it to the
  target section; Insert palette renders (`insertGroups`), click → adds element (Hero gets
  default headline/subtext/cta; Section adds a section); `+ Add section` works; unified
  **property inspector** takes over the left panel on selection — Section (title/columns
  1·2/style card·plain·flat), Field (label + Required toggle), Hero (headline/subtext/
  CTA label/action start·link/href), generic content (label); **Delete** button. All edits
  mutate `_parts` immutably (`_patchSection`/`_patchElement`, spread+reassign) → preview +
  blueprint update live. Text inputs commit on blur (onchange) to avoid cursor-jump;
  toggles/segments/selects update instantly. `<select>` uses option-level `selected=`
  bindings (LWC: `value` invalid on select). `_ensureSection` skips hero (style==='plain').
- **MODEL FIX + full FIELD inspector (2026-06-16, Opus, deployed):** CRITICAL — load
  path was lossy: `c/formTemplates.bodyToEngineParts` strips all field props (keeps only
  label/type/required). Replaced with a local non-lossy `flattenBody(body)` in formStudio.js
  that spreads every authoring prop onto elements/sections. KEY INSIGHT: the new engine
  (`formSectionRenderer.enrich`) ALREADY honors uiBehavior/renderAs/helpText/placeholder/
  customOptionsJson/slider*/visible — so once the model carries them, live preview reflects
  them for free. Field inspector now ports the full zPropertyPanel set: Label, Field API
  (read-only chip), Behavior (None/Required/Read_Only/Hidden), Display-as (type-aware
  renderAs), Custom options rows (when render needs them), Slider min/max/step, Help text,
  Placeholder, URL prefill param. **Visibility rules REUSE `c/zVisibilityEditor`** in a
  modal (props fields/objectLabel/rulesJson; events save/cancel) + readable summary on the
  panel — works for field AND section. Added fields now carry fieldType+uiBehavior.
- **PAGES + DRAG-AND-DROP DONE (2026-06-16, Opus, deployed 0Afhk000000ESinCAG).** Native
  HTML5 DnD, same dataTransfer-JSON `t:` mechanism as `designerCanvas` (NO libs). Reference =
  non-z `formDesigner`/`designerCanvas` ([[feedback-no-z-components]]). Added to formStudio:
  page **tab strip** (add/inline-rename via dblclick/delete/**drag-reorder tabs**), shown only
  when `isMultiPageLayout` (`currentLayoutMode` = `_layoutMode` || version/form `Layout_Mode__c`
  || 'Single_Page'). Blueprint renders by family: **stepped** = active page's sections only;
  **flowing (Single_Page) = flatten, all sections page-ordered top-to-bottom** (owner choice).
  DnD: reorder sections within page, reorder elements within section, **move element across
  sections**, **move section across pages** (drop on page tab OR onto a section in another page),
  **reorder pages**. Palette fields/insert items are now **draggable** too (still click-to-add).
  **Context guard** (owner constraint): `_sectionContextSig` blocks moving a field between
  sections of different data context (Related-list↔Parent) with a toast. `_renumber()` keeps
  global monotonic order (flattenBody contract) by regrouping sections-by-page, elements-by-
  section. Full-width blocks render edge-to-edge (`is-full`→`grid-column:1/-1`).
- **CONTENT BLOCKS / hero-outside-sections (2026-06-16, Opus, deployed 0Afhk000000EWmPCAW).**
  Owner REVERSED the earlier "hero inside sections" call → "why's hero only within sections, can
  we add it outside?". Engine reality (layoutModel.materialize) is SECTION-BASED: pages→zones→
  stacks→section KEYS; elements live in sections, there is NO sectionless/page-level element. So
  "hero outside a section" = its **own chromeless page-level section** (a *block*), sibling of
  field-sections, never nested. Model: content block = section with explicit `contentBlock:true`
  (NOT style==='plain' — 'plain' is also a legit field-section inspector style) holding ONE
  full-width element. Helper `_isContentBlockSection` (contentBlock || key==='hero'). **Insert
  palette now = page-level blocks**: Section→field-section; Hero/Image/Callout/Divider/Rich_Text/
  Related_List→content block. **Fields panel = into sections** only. Routing `_insertBlock`/
  `_addContentBlock`/`_addSection`/`_spliceSection`; drop palette item ON a section inserts a
  sibling block BEFORE it, on canvas appends to active page. Guards: field dropped on a content
  block → redirect to `_ensureSection`; moving an element INTO a content block → blocked (toast);
  deleting a content block's last element removes the block. Three fixes shipped together:
  (a) hero/full-width = page-level blocks; (b) **drag-drop no longer opens the inspector** (drag
  paths select=false; only click-add selects); (c) **no section-within-a-section** (palette
  'Section' always a sibling field-section). Hero = image+headline+subtext+CTA (image-only v1,
  [[project-header-hero-dnd]]); IMAGE UPLOAD still TODO in the properties pass.
- **DnD FUNCTIONAL GAPS CLOSED (2026-06-16, Opus, deployed 0Afhk000000EY9tCAG).** (a) **Insertion
  line** — `_dropElKey` + `.bp-el.drop-before::after` cyan bar shows where a dragged field/element
  lands; per-target dragover (`handleSecDragOver` sets `_dropKey`, `handleElDragOver` stopProps +
  sets `_dropElKey`) so element line and section highlight don't fight; `_dragKind` tracked at each
  dragstart. (b) **Auto-scroll** — capturing `dragover` listener on `.bpscroll` (bound in
  renderedCallback to `_boundScrollEl`) scrolls when near top/bottom edge; capture phase survives
  element stopPropagation. (c) **Cross-page element move** — drop a field/element/palette item on
  another page's TAB → `_moveElementToPage`/`_ensureSectionOnPage` (last field-section on that page
  or create one). (d) **Per-element delete** — × button top-right of every `.bp-el`
  (`handleDeleteEl`→`_deleteElement`, shared with handleDeleteNode; removes empty content blocks).
  **UNDO/REDO is explicitly the VERY LAST task of the whole project** (owner) — top-bar buttons
  stay inert until then; port formDesigner's debounced snapshot stack at the end.
  Remaining DnD polish (deferred, low value): keyboard a11y, drag-to-remove, custom drag ghost,
  dragleave highlight flicker.
- **DESIGN-MODE PANELS — ALL 5 BUILT (2026-06-16, Opus, deployed 0Afhk000000EYbJCAW).** Owner:
  "pause the build-side properties pass, do all five Design panels in sequence." Built in
  formStudio (js/html/css), reusing existing infra — NO new engine work. New @track design state:
  `_layout`('stacked'), `_themeId`('cloud'), `_skinId`('light'), `_accent`(''), `_header`,
  `_buttons`, `_after`. Wiring: **preview `spec` getter now `materialize(this.currentLayout,…)`**
  (was hardcoded 'stacked') + overrides `shell.submit.alignment` from `_buttons`; **`skin` getter
  now `resolveTheme(_themeId,_skinId,{accent})`** (was hardcoded cloud/light); engine in html now
  fed `form-title`/`form-description`/`form-logo`/`labels` from `preview*` getters. **Layout family
  now derives from the chosen layout** — replaced `currentLayoutMode`/`_layoutMode`(deleted) with
  `currentLayout` + `isMultiPageLayout = !CONTINUOUS_LAYOUTS.has(currentLayout)` (CONTINUOUS =
  stacked|bento). So picking stepper/sideNav/etc. flips the page strip on automatically. Panels:
  **Layout** = 3 groups (LAYOUT_GROUPS) × 8 presets as theme-tinted `c-layout-thumb` cards (live).
  **Theme & Color** = theme chips (THEME_OPTIONS) → skin chips (skinsForTheme, re-anchors to
  defaultSkin on theme change) → accent swatches + native `<input type=color>` + reset (live).
  **Header** = arrangement select (stacked/inline/logoBeside/textOnly) + title/description/logo
  URL + highlight message. **Buttons** = submit label + next/back labels (multi-page only) +
  alignment seg (left/center/right). **After submit** = message vs redirect + textarea/URL.
  **LIVE in preview:** layout, theme/skin/accent, header title/desc/logo, button labels, submit
  alignment. **CONFIG-ONLY (stored, not yet rendered — need shell/runtime support):** header
  ARRANGEMENT + HIGHLIGHT message (engine header VM only carries title/desc/logo today), and ALL
  after-submit (fires at submit time, not in builder preview). Header logo + hero image still want
  the deferred Files/ContentVersion upload. None of this persists yet (Save/Publish still inert).
- **PREVIEW SHELL BUGS FIXED (2026-06-17, Opus, deployed 0Afhk000000EZPJCA4).** Switching layouts
  in the new Design panel exposed 3 shell bugs in the builder preview. (1) **Next/Back did nothing**
  — engine `_navState` is a PLAIN (non-@track) field built lazily in `get model()`; reassigning it
  in handleNavRequest/goToPage never re-rendered, so the shell's `nav` prop was stale. Live mode hid
  it (formViewer re-renders on pagechange); the preview has no such driver. FIX: added `@track
  _navTick`, bump it on every nav, and `void this._navTick` in `get navView()` to force recompute.
  (Couldn't just @track _navState — it's assigned inside a render getter → loop risk.) (2)+(3)
  **Buttons off-screen on sideNav / "Next too low" on many layouts** — shells fill their host for
  LIVE full-page (`min-height:100%`, rails `height:100vh`), but the builder preview pane is taller
  than the content, so flex-pinned/centered actions (wizard `.sheet-footer`, sideNav `.rail-footer`
  submit, conversational centered `.screen-wrap`, splitHero form pane) drift to the bottom / past
  100vh. FIX: engine emits `--c-shell-min-h:auto; --c-shell-rail-h:auto` on its root ONLY in preview
  mode; shells now read `min-height:var(--c-shell-min-h,100%)` and rails `height:var(--c-shell-rail-h,
  100vh)` + `align-self:flex-start` (shellStack/Wizard/SideNav/Conversational/SplitHero; tabbed/
  accordion don't use the pattern). Live unchanged (vars unset → 100%/100vh). NOTE: **sideNav has NO
  Next/Back by design** — it navigates by rail-step click + a Submit button (now visible). The 100vh
  rail is also a latent LIVE bug for non-full-height embeds; the var fix only addresses preview.
- **PREVIEW = REAL RUNTIME (c/formViewer), in-memory injection (2026-06-17, Opus, deployed
  0Afhk000000EuaDCAS + 0Afhk000000EtROCA0).** Owner (frustrated): "the preview should be equivalent
  of formPlayer." Root problem: formStudio was mounting the BARE `c/formLayoutEngine` and
  re-deriving chrome/nav/labels itself — can never equal the respondent view, because respondents
  run **c/formViewer** (owns visibility eval, validation, submit, thank-you/redirect, error banner,
  captcha/honeypot, header/settings). formViewer normally loads its definition from APEX by
  formId/versionId; the builder model is in-memory & unsaved. **Decision (owner picked B):
  in-memory injection.** Added to **formViewer**: `@api previewDefinition` setter (mirrors the
  FormViewerController payload `{formName, primaryObject, formType, hasActiveVersion, bodyJson,
  layoutSpecJson}`) that bypasses Apex and calls `applyDefinition(v, isLiveReapply=true)`;
  connectedCallback skips load() when previewDefinition present; `applyDefinition` now resets
  loadError/noActiveVersion, reads SETTINGS_DEFAULTS floor, and **preserves _currentPageKey** across
  live re-applies; new **`mode='preview'`** = validate + show thank-you inline, NO DML (handleSubmit
  + navigateTo early-return like 'test'); `@api previewWidth` passthrough to engine; `viewerStyle`
  getter emits `--c-shell-min-h:auto;--c-shell-rail-h:auto` on `.viewer` when preview (shells
  size-to-content). **Engine**: rootStyle now applies preview sizing/width when `mode==='preview'
  OR previewWidth set` (formViewer embeds engine in mode="live" but drives the device toggle via
  previewWidth). nav-reactivity `_navTick` now read as `this._navTick >= 0` (no-void lint).
  **formStudio**: new **`serializeForm()`** = `_parts`+design → body JSON (pages→sections(id,name,
  sectionStyle,style,gridColumns,elements(id,name,type,fieldApiName,uiBehavior,…)) + header{visible,
  title,subtitle} + formSettings{theme=resolveTheme(...), submitLabel, labels{next,back},
  thankYouMessage, afterSubmitMode, redirectUrl} + layoutMode) — **the exact inverse of formViewer's
  flattenBody, so it's ALSO the Save/Publish serializer.** `get previewDefinition` wraps it
  (bodyJson + layoutSpecJson=JSON.stringify(this.spec)); preview pane swapped from
  `c-form-layout-engine` to `<c-form-viewer preview-definition mode="preview" preview-width>`;
  removed previewTitle/Description/Logo/Labels (dead). spec/skin getters kept (feed the serializer).
  **SAMPLE REMOVED (2026-06-17, deployed 0Afhk000000EpVlCAK):** owner "wth is no form sample?" — the
  hardcoded dummy `SAMPLE` form (fake hero + Contact-info fields with NO fieldApiName) rendered broken
  through the real runtime. Deleted it → `EMPTY_PARTS={pages:[],sections:[],elements:[]}`; `get parts`
  falls back to EMPTY_PARTS; preview pane now shows a clean `.pv-empty` state (`showLivePreview` =
  `parts.sections.length>0`; `previewEmptyText` = "Select a form…" / "This form is empty…"). Editing
  re-feeds a new spec → engine
  nav resets to page 1 (acceptable; clicking Next inside the preview does NOT reset since formStudio
  doesn't re-render on it). NEEDS OWNER VISUAL VERIFY.
- **ELEMENT PROPERTIES SPEC written (2026-06-17, Opus):** owner — "where did you document
  all the customizable properties per element type?" Answer: nowhere complete (THEME_PROPERTIES
  =appearance plane; DESIGNER_UX only listed the TYPES). Wrote **docs/redesign/ELEMENT_PROPERTIES_SPEC.md**
  = the **content-plane contract** the new formStudio inspector builds against. One table per
  palette type (Field+renderAs matrix, Display Text, Image, Callout, Divider[GAP], Spacer, Consent,
  File Upload[GAP], Hero[NEW], Related List, Section/Content-block) with control/default/storage-key,
  + §14 the canonical **image-storage contract** (FormAssetController: ContentVersion linked to Form,
  public via ContentDistribution iff Allowed_Adapters has Public_Guest, else shepherd URL; stores
  url+versionId never base64; *Url/*VersionId key pairs for image/hero/logo/background; replace/remove
  → deleteImage). Reverse-engineered from legacy `c/propertyPanel` (functional ref, non-z). Gaps
  flagged: Divider + File Upload have no legacy inspector; Hero is new. UPDATE THE SPEC FIRST when a
  content prop changes — single source.
- **STILL TODO (next increments):** (1) **Element/section properties** (build to
  ELEMENT_PROPERTIES_SPEC) — owner deferred to
  AFTER dnd+pages: **HERO IMAGE UPLOAD still missing** (owner flagged); **Section full props**
  (icon picker, collapsible, padding, sectionStyle vocab, description, columns 1–4) + **content
  elements** (Image/Callout/Spacer/Consent/Rich_Text) inspectors. **SWAP the visibility modal
  off `c/zVisibilityEditor` to the non-z editor formDesigner uses** ([[feedback-no-z-components]]).
  (2) **Themes/Layout** Design-mode panels (incl. a real layout-mode toggle that sets
  `_layoutMode`) — owner: "come back to themes" after dnd. (3) **Autofill** wire like visibility.
  (4) **Persistence** — Save/Publish/undo-redo inert; serialize `_parts`→Layout_Config body JSON
  (inverse of flattenBody) + DML. (5) field-dup prevention on add/drop (formDesigner dedupes;
  formStudio doesn't yet). (6) jest spec. (7) page-strip only reflects record Layout_Mode until
  the Layout panel exists.

Appearance/theme surface = [[project-form-themes]] + docs/redesign/THEME_PROPERTIES_SPEC.md
(Design mode = its own focused surface, §10.6). Next: consolidated DESIGNER_UX brief,
then phased build (P1 Hero element first — see [[project-header-hero-dnd]]).
