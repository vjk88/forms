# FinalStudio UX improvements — implementation handoff

Date: 2026-09-29. Status: plan only; no product changes made by this document.

Approved by the owner 2026-09-29, including the dark → light structure change in Task 3. Review amendments and execution decisions are in section 8; where they conflict with a task below, section 8 wins.

Second review: corrected Jest argument forwarding, defined expansion/selection precedence and narrow-pane sizing, separated runtime styling from editor-only changes, and tightened save-before-navigation checks.

This plan turns the live UI comparison from 2026-09-23 into small tasks that a model can implement one at a time. File and function references were checked against the local code on 2026-09-29. The deployed UI must be checked again during implementation; it may have changed since the comparison.

## 1. Intended result

Keep FinalStudio as the primary authoring experience. Preserve Build/Design, Simple/Advanced, the separate structure editor, and the real form preview. Make the workspace easier to read and give the author more room when needed.

The finished experience must let an author:

1. Expand the existing preview without losing test answers.
2. Collapse and reopen the tools/properties panel without losing selection.
3. Identify the selected structure item against a calm, light background.
4. Find Advanced design settings without scrolling past several open rich-text editors.
5. See a more compact form header on a narrow device.
6. Return to the Forms library with a clear label and without losing pending edits.

## 2. Decisions already made for this plan

These choices remove design decisions from the implementing model.

| Concern | Decision |
| --- | --- |
| Workspace model | Retain tools/properties on the left, structure in the middle, real preview on the right. |
| More preview space | Add an inline **Expand preview / Collapse preview** control. Expansion fills the workspace below the existing top bar. The same labels work in editable and read-only views. It is not a modal, a new tab, or browser fullscreen. |
| Panel sizing | Add a collapsible tools panel. Do not implement draggable splitters in this pass. |
| Structure styling | Use light authoring surfaces and a darker teal selection/focus color. Keep the schematic rows and skeleton bars. |
| Advanced rich text | Put each existing rich-text editor inside a collapsed disclosure with a short text summary. Keep the full Salesforce editor and all its supported formatting. |
| Simple design | Preserve the current three sections and their defaults. |
| Mobile behavior | Use the form container width, not the browser window width. Apply the same responsive rendering in preview and actual forms. |
| Form switching | Keep the Forms library as the picker. Rename the top-bar Exit control to **Back to forms**. Do not add an in-builder form dropdown. |
| Editor mismatch | Diagnose separately. Do not copy JSON between the old and new formats or introduce a migration in a UI task. |

The lighter structure treatment is a proposed, narrowly scoped replacement for the older “dark blueprint” presentation rule in `FORM_STUDIO_IA.md`. It does not replace the structure/preview architecture. When Task 3 is implemented, update that presentation rule and its code comment together.

`DESIGN_PANEL_ORGANIZATION.md` describes the current five-section Advanced design. It takes precedence over the older nine-area presentation described in `FORM_STUDIO_IA.md`. Do not rebuild the old nine-icon rail.

## 3. Rules for the implementing model

Work on one numbered task at a time. Read its target files and nearby tests before editing. Do not rewrite a whole component to add one behavior.

- Start with `git status --short`. Preserve work that was already present. At planning time, `finalPropertyPanel.html` had an unrelated modification; this plan does not require changing that file.
- Use existing components and events. Do not add packages, new Apex endpoints, new objects, or new persisted form properties for these UX changes.
- Workspace state such as `previewExpanded` and `toolsCollapsed` belongs to the Studio component, never the form spec, undo history, Apex, or browser storage.
- Preserve the existing save, publish, read-only version, error, theme-reset, and undo/redo behavior.
- Do not create a second renderer. `finalPreviewStage` must continue rendering `finalFormViewer`.
- Never change Desktop's logical 1280px device width just to make the preview appear larger. Existing widths are Desktop 1280, Tablet 768, Mobile 390.
- Preserve test answers, selected device, and zoom across workspace changes. Restart remains the explicit reset action.
- Keep new authoring classes component-prefixed: `st-`, `ps-`, or `bc-` as appropriate. Do not add generic global classes that can collide with Salesforce styles.
- Do not reach into a Salesforce base component's private DOM or hide its internal toolbar with CSS.
- Do not flatten rich HTML into plain text for storage. A plain summary is display-only.
- Use actual browser evidence for visual acceptance. Passing Jest does not establish that a layout fits or looks correct.
- Run focused checks for the changed behavior. Do not add tests that only assert CSS strings or mirror implementation details.
- Do not change product behavior merely to make an arbitrary pixel target pass. Keep device widths, fixture content, and browser zoom fixed when comparing screenshots.

Read these existing contracts as needed:

- `docs/FinalDesign/specs/FORM_STUDIO_IA.md`
- `docs/FinalDesign/specs/DESIGN_PANEL_ORGANIZATION.md`
- `docs/FinalDesign/specs/PREVIEW_SESSION_SPEC.md`
- `docs/FinalDesign/specs/BUILDER_SURFACES.md`
- `docs/FinalDesign/specs/CANVAS_RULES.md`
- `docs/FinalDesign/specs/BUILDER_KEYBOARD_SPEC.md`
- `docs/FinalDesign/RUNTIME_NOTES.md`

For keyboard behavior, the dated opening correction in `BUILDER_KEYBOARD_SPEC.md` is the current rule: drag/drop and Alt+Up/Down remain; do not resurrect the removed action bar or context menu from older paragraphs.

## 4. Code map

All paths in this document are relative to the repository root.

| Responsibility | Existing files and anchors |
| --- | --- |
| Workspace layout, routing, save orchestration | `force-app/main/default/lwc/finalFormStudio/finalFormStudio.{html,js,css}`; `.st-body`, `.st-left--build`, `.st-blueprint`, `.st-buildpreview`, `capturePreviewSession`, `handleModeBuild`, `handleModeDesign`, `handleExit`, `_save` |
| Preview device, zoom, session, restart | `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.{html,js,css}`; `.ps-bar`, `.ps-viewport`, `getSession`, `handleRefresh`, `_apply` |
| Shared authoring colors | `force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.css`; `--c-studio-canvas-*` |
| Structure presentation and interactions | `force-app/main/default/lwc/finalBuilderCanvas/finalBuilderCanvas.{html,js,css}`; `.bc`, `.bc-row`, `.bc-row.selected`, `.bc-skeleton` |
| Design settings | `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.{html,js,css}`; `advancedSections`, `controlsVM`, `handleRichText`, `c.isRichText` |
| Canonical setting definitions | `force-app/main/default/lwc/finalDesignRegistry/finalDesignRegistry.js`; `DESIGN_SECTIONS` and control keys such as `title`, `description`, `brandName` |
| Respondent header | `force-app/main/default/lwc/finalFormHeader/finalFormHeader.{html,js,css}`; `.hdr`, `.hdr-title`, `.brand-logo`, `.lockup-text` |
| Respondent outer/card spacing | `force-app/main/default/lwc/finalPageFrame/finalPageFrame.{html,js,css}`; `.page`, `.panel`, `.page--bleed`, `.panel--bleed` |
| Current library and Studio URLs | `finalFormsLibrary`, `finalStudioLink`, and `force-app/main/default/pages/FinalStudio.page` |

Existing component tests live under each bundle's `__tests__` directory. Reuse their mount helpers, spec fixtures, and Apex mocks.

## 5. Execution order and dependencies

| Task | Deliverable | Depends on |
| --- | --- | --- |
| 0 | Baseline screenshots and mismatch diagnosis note | Nothing |
| 1 | Expanded preview with session preservation | Baseline |
| 2 | Collapsible tools panel and stable desktop widths | Task 1 |
| 3 | Light structure styling | Baseline; execute after Task 2 for review consistency |
| 4 | Compact Advanced rich-text controls | Baseline |
| 5A | Narrow-device outer/card spacing | Baseline |
| 5B | Narrow-device header spacing and wrapping | Task 5A |
| 6 | Clear, save-aware return to Forms | Baseline |
| 7 | Combined browser review and handoff | Tasks 1–6 |

An unresolved old/new format diagnosis does not prevent independent UI work. It does prevent claiming that the two editors are interchangeable or that data compatibility has been fixed.

**Delivery boundary:** Tasks 1–4 and 6 change authoring. Tasks 5A–5B change the shared respondent renderer and will also affect already-published forms when that code is deployed, without republishing a form. Keep mobile changes in a separate reviewable change set, check actual hosted forms as well as Studio, and document their effect in the release notes. Authoring improvements can be delivered independently if mobile verification is unavailable.

Track each task as `not started`, `implemented — local checks passed`, or `verified`. Check its completion box only at `verified`. An unavailable org/browser check leaves that evidence pending; it does not require undoing valid local work or prevent independent tasks within the requested scope. Never label a check against old deployed code as verification of a local change.

## Task 0 — Establish a baseline and isolate the mismatch

**Product files to edit:** none.

**Evidence files to create during implementation:** `docs/FinalDesign/qa/studio-ux-baseline.md` and, after implementation, `docs/FinalDesign/qa/studio-ux-results.md`. Store screenshots in the same QA folder or link their actual artifact locations.

1. Record the current commit, existing local modifications, host, browser size, and form/version used for each screenshot.
2. Recheck the survey originally reviewed: form `a05hk000001RX8zAAG`, titled `Autofill Test: Satisfaction Survey (Personalized Link)`. The old review compared v5 Draft. If that version no longer exists, record the actual version used; do not recreate or overwrite it.
3. Capture FinalStudio Build, selected-field properties, Design Simple, Design Advanced, and Mobile preview. Use a 1280×800 desktop browser viewport for the main baseline.
4. Capture the matching version in FormBuilder Pro if it is still available. Compare actual version IDs as well as displayed version numbers.
5. Confirm the component/controller serving the legacy URL before assigning a fix. Local candidates include `formDesigner`/`FormDesignerController`, `zFormDesigner`/`Z_FormDesignerController`, and `formStudio`/`FormStudioController`; similar product labels do not prove which route is mounted.
6. Record the storage contract. Current local `FinalStudioController.loadStudio` reads `Form_Version__c.Spec_JSON__c`. `FormDesignerController.getFormLayout` and `FormStudioController.getFormLayout` read `Layout_Config__c`. The Z controller reads `Z_Form_Version__c.Z_Form_Definition_JSON__c`.
7. If authorized org read access is available, record whether the corresponding payload fields are populated and how many pages/sections/questions they represent. Otherwise mark live payload verification unavailable. Do not dump private form data into the report.
8. Classify the result as confirmed differing formats, a version-selection issue, a loading/rendering defect, or still unverified. State the evidence and a separate next action. Do not implement conversion or synchronize save paths.

**Done when:** the report distinguishes the earlier live observation, current local code evidence, and any newly verified live facts. It includes repeatable visual fixtures.

Use test-owned/disposable drafts for later edits. The original comparison form is a read-only reference unless the implementation request authorizes editing it.

## Task 1 — Expand the existing preview

**Edit:** `finalPreviewStage.{html,js,css}`, `finalFormStudio.{html,js,css}`, and their existing test files.

**User behavior:** the preview toolbar has `Expand preview`. Activating it gives the same preview the entire workspace below the Studio header. The button becomes `Collapse preview` and restores the prior workspace arrangement, including a read-only view when that was the starting context.

Implement in this order:

1. Add `previewExpanded = false` to Studio as transient state. Add a getter for the workspace's expanded class and a handler for the preview's expansion intent.
2. Add `@api expandable = false` and `@api expanded = false` to the stage. Default availability to false so any other stage consumers retain their current UI. Studio binds `expandable` and `expanded={previewExpanded}` on its stage instances.
3. Add a native button to `.ps-tools` only when `expandable` is true. It has visible text, an accessible name, and `aria-expanded`. The stage emits `previewexpand` with `{ expanded: !this.expanded }`; Studio handles the event directly. The stage does not change its own public property or own Studio layout.
4. Wire the event and inputs on the existing Build, Design, and read-only preview-stage instances in Studio.
5. In expanded mode hide the editing/notice panes using layout classes or the HTML `hidden` state. Explicitly ensure hidden flex/grid panes compute to `display: none`. Override Build's existing `.st-buildpreview { width: 50%; min-width: 340px; flex: none; }` with a full-remaining-width rule; hiding neighboring panes alone will leave it half-width. Use `box-sizing: border-box` on `.st-scroll` so its padding fits inside its 100% height. Do not conditionally remove the stage, move it into a different template branch, change its key, or mount a duplicate viewer.
6. Let the existing ResizeObserver recalculate Fit scale after layout changes. Do not modify the device list or `_apply` scale formula.
7. Keep the Studio top bar and preview toolbar reachable. This is an inline layout change: do not add a focus trap or claim it is a modal.
8. Retain keyboard focus on the expansion button. The same button reverses the action with Enter/Space. Do not install a document-wide Escape handler that competes with field menus, rich-text controls, or dialogs.
9. Switching Build/Design or successfully entering/leaving version history exits expanded mode. A failed version load must leave the current preview usable. Use the existing preview-session handoff for existing mode/version transitions. Loading a different form resets expanded state.
10. In expanded Build preview, clicks still update the existing selection and allow normal test input; they do not automatically collapse the preview or show the hidden editing panes. Task 2 defines tools restoration. Read-only expansion never enables authoring selection.

**Behavior tests:**

- Expansion emits the correct intent and changes the host's layout state.
- The preview-stage and viewer instances remain the same when expanding/collapsing within a mode.
- Enter an answer, select Tablet and 100% zoom, expand and return: the answer, device, and zoom remain unchanged.
- No `saveDraft`, publish call, form-spec mutation, or undo entry occurs solely from expansion.
- Existing Restart and read-only isolation tests still pass.
- Read-only expansion uses `Collapse preview`, retains the visible read-only badge, and returns to the same version.

**Visual acceptance:** at a 1280px-wide browser viewport in the full-screen VF host, expanded Desktop Fit reports at least 90% scale and the preview occupies the full workspace width apart from normal padding. At narrower widths the scale may be lower; controls must still fit and remain reachable. `100%` may legitimately scroll horizontally inside the preview.

## Task 2 — Collapse tools without losing editing context

**Edit:** `finalFormStudio.{html,js,css}` and `finalFormStudio.test.js`. Change `finalPreviewStage.css` only if its existing toolbar needs wrapping adjustments.

**User behavior:** the author can collapse the left tools/properties panel into a narrow strip, keep the structure visible, and use the released width for preview. Reopening restores the current palette or selected item's properties.

1. Add `toolsCollapsed = false` to Studio. Do not store it in the spec or local storage.
2. Add a small native `Collapse tools` button at the top of the Build tools panel. When collapsed, show a 44px-wide strip with a `Show tools` button. Give icon-only presentation an accessible label and title.
3. Keep the current palette-or-properties subtree mounted while collapsed, but remove it from display and keyboard navigation. Preserve the existing palette/properties conditional swap; do not mount both permanently. Keep one toggle button mounted outside the hidden inner panel so focus stays on that button when it changes between collapse/show. The outer strip remains present.
4. Add `aria-expanded` and `aria-controls` referencing the actual panel container. Store the control state as a string if needed by the existing LWC conventions.
5. Reuse `handleSelect`, `handlePreviewSelect`, and `handleLogicJump`. In normal, non-expanded Build, selecting an item while tools are collapsed reopens tools and shows that item's properties. In expanded preview, update selection/`propsOpen` but leave `toolsCollapsed` unchanged and keep the preview expanded. Do not add a second selection model.
6. Expansion from Task 1 temporarily hides the strip as well. Returning from expansion restores the previous collapsed/expanded preference and retains the latest selection. A form reload resets tools to open. Build/Design changes retain this preference for the same form.
7. Add a stable `.st-workspace-container` wrapper around `.st-body` only, with `container: studio-workspace / inline-size`, `display: block`, `width: 100%`, and `min-width: 0`. Keep settings drawers and dialogs outside this wrapper; do not add containment to the entire Studio host. The existing `.st-body` selector and inert handling must still work. Add a Build-only body class so new sizing rules do not affect Design or history.
8. At workspace widths of at least 960px, set tools and structure to `flex: 0 0 clamp(240px, 25%, 320px)`; collapsed tools use a 44px basis. Set preview to `flex: 1 1 0`, `width: auto`, and `min-width: 50%`. Explicitly replace the old fixed width/min-width rules. Include borders in widths with `box-sizing: border-box` and add no horizontal gaps outside the width budget. Structure keeps its normal width when tools collapse; preview receives the freed width.
9. Below 960px, use the `studio-workspace` container query to stack **Build** panes. Set the non-expanded body to `height: auto; min-height: 0` and vertical flow; reset pane width/min-width/flex-basis to full-width/zero-minimum/auto. Give open tools a 320px height with its own vertical scroll, collapsed tools a 44px-high full-width row, and structure a 360px height so the canvas's existing `height: 100%` remains meaningful. Let preview grow in document flow: `.st-scroll` there uses `height: auto; overflow: visible`, while the stage retains its internal horizontal scroll at 100%. This avoids leaving three `height: 100%` panes inside a fixed-height column. Expanded mode overrides these stacked sizes and uses the whole normal workspace with the existing preview scroll region.
10. Preserve the current Design panel width unless needed for control fit. Task 1 already supplies its larger-preview option.

**State precedence:** expansion controls which panes are displayed; collapse controls the tools preference; selection controls which properties are shown. Neither expansion nor collapse may erase selection. A click in an expanded preview changes selection only; a click in the normal preview can additionally reopen tools.

**Behavior tests:** tools toggle without changing spec or selection; normal preview selection reopens the panel; expanded preview selection keeps the preview expanded and the collapse preference unchanged; expanding preview and returning restores the collapsed state; toggle focus remains visible; no autosave is triggered by panel controls.

**Visual acceptance:** at 1024×768, 1280×800, and 1440×900, Build controls and structure rows remain usable, preview is at least half the workspace, and the page has no horizontal overflow in Fit mode. At 1280px, collapsing tools increases Desktop Fit scale by at least 15 percentage points. At a 768px-wide authoring viewport, the stacked layout keeps every pane reachable.

Do not add draggable splitters, per-item move buttons, or another permanently visible action bar.

## Task 3 — Make the structure panel visually consistent

**Edit:** `finalStudioStyles.css`, `finalBuilderCanvas.css`, and the dark-presentation wording in `FORM_STUDIO_IA.md`. Do not change canvas JavaScript or its drag/drop contracts.

Use these authoring-token values as the initial implementation:

| Existing token suffix after `--c-studio-` | Value |
| --- | --- |
| `canvas` | `#f1f5f9` |
| `canvas-surface` | `#f8fafc` |
| `canvas-card` | `#ffffff` |
| `canvas-text` | `#1f2937` |
| `canvas-text-weak` | `#526071` |
| `canvas-border` | `#7c8999` |
| `canvas-divider` | `#dce2e9` |
| `canvas-accent` | `#0f766e` |
| `canvas-accent-text` | `#115e59` |
| `canvas-error` | `#b42318` |
| `canvas-drop` | `rgb(15 118 110 / 8%)` |
| `canvas-drop-gap` | `rgb(15 118 110 / 35%)` |

1. Search all uses of these tokens before changing them; record which authoring components inherit the change.
2. Update token values rather than scattering new hex colors through components.
3. Retain schematic rows, skeleton bars, drop indicators, section/page labels, and existing selection classes.
4. Selected rows need both a clear teal border/ring and the existing `--c-studio-accent-surface` tinted surface. Hover must be visibly weaker than selection. Keyboard focus must remain distinct and visible on selected and unselected items.
5. Check all error/remove/required indicators against the light surfaces. Do not reuse the previous pale-red color on white.
6. Replace comments/spec wording that says dark styling is required. Keep the distinction between structural editing and respondent appearance.
7. Do not change respondent theme tokens such as `--c-accent` or `--c-header-bg`.

**Acceptance:** verify normal, hover, selected, focused, dragging, valid-drop, required, empty, and read-only states. Normal text must meet a 4.5:1 contrast target; meaningful control/focus boundaries must meet a 3:1 target. Confirm at least one light and one dark respondent theme remains visually unchanged. Use screenshots/contrast measurement; no new CSS-string unit tests are needed.

## Task 4 — Compact rich-text editing in Advanced design

**Edit:** `finalDesignPanel.{html,js,css}`, its existing test file, and `DESIGN_PANEL_ORGANIZATION.md`.

**User behavior:** Advanced's rich-text controls initially show the field label, a short summary, and an expand affordance. Opening one reveals the existing editor. The surrounding section list becomes easier to scan.

1. Work in the existing Advanced `c.isRichText` template branch. Do not restructure `DESIGN_SECTIONS` or duplicate registry controls.
2. First wrap only the Title editor in a native `<details>` disclosure with `<summary>` and verify it in the actual org. It must initialize correctly while closed, show a usable toolbar when first opened, and keep typed content/caret stable after a normal spec echo. Then apply the same wrapper to the other Advanced rich-text controls. Default these disclosures to closed. Do not make a custom modal or toolbar.
3. Summary content: control label; up to 80 plain-text characters of the current value; ellipsis when longer; `Not set` when empty. If the value contains an image but no text, show `Contains an image` instead of calling it empty. Compute summary strings in the existing view-model getter; LWC templates cannot call helpers with `c.value` as an argument. Reuse the component's existing DOMParser approach for display text. Never write the extracted text back to the form.
4. Keep `lightning-input-rich-text`, `data-key`, `value`, `placeholder`, `variant="bottom-toolbar"`, and `onchange={handleRichText}` intact. Do not restrict its `formats` list.
5. Keep the editor mounted inside its rich-text disclosure; do not add conditional mounting just to open/close that control. Preserve stable `c.key` values. The existing outer Advanced section and Simple/Advanced branches may still mount/unmount as they already do. Native disclosure hiding handles focusability.
6. Disclosure toggle events must change only UI state. They must not call `_apply`, `_emit`, or add an undo entry. Routine spec echoes after typing must not forcibly close a disclosure that the author opened.
7. Opening/closing must work with keyboard and touch. Do not rely on hover or focus-only behavior to reveal essential editing controls.
8. Keep Simple's three sections and editor behavior unchanged. Keep Advanced's five sections, their reset behavior, and edited indicators.

**Behavior tests:** opening/closing causes no `specchange`; formatting-bearing HTML survives opening, closing, and Simple/Advanced switching unchanged; a deliberate editor change updates the same canonical path; registry coverage/uniqueness and theme-reset tests remain green.

**Visual acceptance:** at 1280×800 with Advanced open to Brand & header, the Title, Description, and Brand name summaries are visible in the panel without three full formatting toolbars. Each can be expanded and edited without clipping its controls.

This implements the earlier “show formatting when needed” recommendation using supported disclosures rather than private Salesforce toolbar manipulation.

## Task 5A — Reduce wasted mobile outer spacing

**Edit:** `finalPageFrame.css` only, plus relevant layout documentation after verification.

This affects real forms, including already-published forms, as well as preview. Keep it in a separate change from authoring chrome. Task 5A owns the named container required by 5B; release and roll back those mobile changes together.

1. Add an inline-size container named `final-form-viewport` to the page-frame host, with explicit `display: block`, `width: 100%`, `min-width: 0`, and suitable box sizing so containment cannot collapse a flex/grid child.
2. Inside that container at widths of 540px or less, change `.page:not(.page--bleed)` padding to `16px 12px 24px`.
3. In the same query, cap `.panel:not(.panel--bleed)` padding at `min(var(--c-space-6), 16px)`.
4. Preserve zero padding and the current background/surface behavior for bleed layouts.
5. Do not change frame min-height, the synthetic preview height/offset, max-width options, theme backgrounds, or fixed image/effect layers.
6. Do not use a browser `@media (max-width: ...)` rule for respondent sizing: Mobile preview lives inside a wide desktop browser.
7. Verify the shared named container and its cross-component query in a small browser proof before changing all spacing. If either supported Salesforce host does not apply it correctly, record the failure and leave Tasks 5A–5B unverified. Do not silently substitute window-width checks, JS device sniffing, preview-only CSS, or a new persisted responsive setting.

**Acceptance:** Mobile preview and a real 390px-wide hosted form use matching compact spacing. Test below, at, and above the cutoff (539/540/541px). Desktop/tablet device canvases above 540px keep their previous spacing even when scaled down to fit a narrow Studio pane. No horizontal overflow or zero-width container appears. Split Hero/other bleed rendering is unchanged.

## Task 5B — Compact the default mobile header

**Edit:** `finalFormHeader.css`. Extend markup only if an actual sizing problem cannot be solved within the existing host/header structure; explain any such extension.

1. Reuse Task 5A's named container with `@container final-form-viewport (max-width: 540px)` in the header stylesheet. The breakpoint refers to the whole rendered form viewport, not the narrower card or header content width. Keep the header host block-sized with width 100% and min-width 0. Verify the named query reaches the header in both supported Salesforce hosts before proceeding.
2. Inside that query, cap `.hdr` padding at 16px, gap at 12px, and bottom margin at 16px using `min(existing-token, cap)` so smaller authored density values stay smaller.
3. Set the default `.hdr-title` size to 1.25rem with line-height 1.3 in that narrow rule. Preserve user-authored inline rich-text sizes/colors; do not strip or forcibly override them.
4. Add `min-width: 0` and safe wrapping to `.lockup-text`/title/description. Long words or links must wrap rather than enlarge the card. Do not truncate respondent-facing text.
5. Cap narrow-device logo dimensions at 40px high and `min(160px, 100%)` wide while preserving aspect ratio.
6. For `logoBeside`, stack branding above text only inside the same narrow-form query; preserve the other arrangements and their alignments. Do not modify Split Hero's separate brand pane in this task.

**Browser fixtures:** a short title; the original long survey title; a logo and description; a long unbroken word; rich text with an explicitly large inline title size; no header; and a bleed layout. Check 320, 390, and 540px form-container widths, plus 768 and 1280px device widths. Include a narrow card on a 1280px device to prove the breakpoint follows the form viewport, not the card width.

**Acceptance:** all text remains available and wraps; no horizontal overflow; default mobile type is readable; the original long-title fixture's first input starts within the first 650px of the 390×844 form viewport with no extra content above it. Record that fixture's theme, layout, header content, and first section so the result is reproducible. This is a fixture-specific target, not a promise for arbitrarily long descriptions or explicitly oversized authored text. Do not shorten the title, remove branding, or reset formatting to achieve it. Desktop rendering and explicit inline formatting remain intact.

CSS-only changes need browser evidence, not invented Jest pixel assertions. Run the existing header/viewer regressions; add behavior tests only if behavior or markup actually changes.

## Task 6 — Make returning to Forms clear and preserve pending edits

**Edit:** `finalFormStudio.html`, `finalFormStudio.js`, its existing tests, and CSS only if the longer button label needs room.

1. Change only the normal editor top-bar text from `← Exit` to `← Back to forms`.
2. Keep the library route and host-specific destination behavior. VF uses the existing `exitUrl`; LEX uses `FORMS_TAB`. Do not hard-code the development org hostname.
3. Give the editor navigation button a dedicated async handler. Do not indiscriminately change `handleExit`, which is also used after destructive lifecycle actions and in not-found/archived flows.
4. Add a transient `exiting` flag. Ignore repeated clicks and prevent this new flow from starting during publish or another already-running lifecycle action. Reset the flag on a fresh `_load` and in the same-session failure/finalization path; LEX can cache component instances.
5. For editable content, capture the current `_saveSession`, set `exiting`, and await the existing `_save()` even when the display says saved. Its clean drain makes no Apex request; awaiting it also joins a save already in flight. Do not call `saveDraft` directly or create another save queue.
6. While waiting, disable the Back to forms button and conflicting mode/version/settings/actions/publish controls. Extend the existing `editorLocked`/button disabled getters and `.st-body` inert path to account for `exiting`, rather than setting `publishing = true`. The `_save()` path must remain allowed while exiting. Preserve existing publish/cleanup behavior outside this new flow.
7. Immediately before navigation, require all three conditions: `_save()` returned true; the captured session is still `this._saveSession`; and `session.revision === session.savedRevision`. The revision check protects against a late asynchronous edit after a drain appeared finished. If a newer revision exists, stay in Studio with the normal save state and let the existing queue complete; do not navigate on a stale success.
8. Navigate through `handleExit()` only when those conditions hold. On failure, stay in Studio, retain the draft, use the existing save error/retry presentation, clear the lock, and restore a usable Back to forms control. Do not rely on `disconnectedCallback()` to finish a save after VF `window.location.assign`, because navigation can unload the page before a request completes.
9. Read-only, not-found, and archived return paths retain their existing behavior and do not call `_save()`. No discard dialog, second picker, or fresh form query is required. This task covers the explicit Back to forms control, not browser-close/back interception or uploads still pending inside a child component.

**Behavior tests:** clean return makes no Apex save request; immediate return during the 900ms debounce window; return while a save is in flight; failed save stays in Studio and unlocks controls; retry then return; repeated click does not duplicate navigation; a session change or late unsaved revision prevents stale navigation; read-only return does not save; cached-instance reload clears the exit lock. Verify both host-specific destinations using existing navigation mocks. Keep existing publish and cleanup recovery tests passing.

**Acceptance:** an author can edit a label and immediately choose Back to forms, reopen the draft from the library, and see the edit retained. A simulated save failure cannot navigate away or report success.

## Task 7 — Combined verification and handoff

Use the actual supported UI/browser tooling in the execution environment. Do not treat an inaccessible org or an unavailable host as a passed check.

### Automated checks

Run related tests for each task before moving on. From the repository root, use **two standalone `--` separators**: npm consumes the first; `sfdx-lwc-jest` consumes the second and forwards the remaining flags to Jest. For example:

```powershell
npm run test:unit -- -- --runInBand --runTestsByPath force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js force-app/main/default/lwc/finalPreviewStage/__tests__/finalPreviewStage.test.js
```

For Task 4, run `finalDesignPanel.test.js`. For Task 3, run existing `finalBuilderCanvas.test.js` if its markup or behavior changed. For mobile rendering, run the existing `finalFormHeader.test.js` and relevant viewer/header-mapping suites after confirming their current names.

Run ESLint on changed JavaScript and Prettier check on changed files only. Use the installed project tools; do not run the repository-wide formatting command. At the end, run the union of affected suites once. Record any baseline failures separately; do not suppress them.

### Browser acceptance matrix

| Scenario | Pass condition |
| --- | --- |
| Full-screen VF Studio | All new controls work and the top bar remains visible/reachable. |
| LEX Studio host | New classes do not pick up unrelated platform styling; navigation and previews work. |
| 1024×768, 1280×800, 1440×900 | No unintended page-level horizontal overflow; labels and controls fit. |
| 768px authoring viewport in Build | Stacked panes have usable heights and all editing/preview panes remain accessible. |
| Build: field selected → collapse tools → expand preview → return | Selection and properties survive; tools restore their prior state. |
| Expanded Build preview: click a different field | Selection updates; expanded layout and collapsed-tools preference stay unchanged. |
| Preview with entered text and a choice | Answers survive both workspace toggles and existing Build/Design changes. |
| Tablet + 100% zoom | Device and zoom survive toggles; horizontal scrolling stays inside preview. |
| Restart | Answers reset as before; selected device remains. |
| Advanced rich text | Disclosures work by keyboard; existing bold/link/list formatting remains stored. |
| Structure drag/drop and Alt+Up/Down | Reordering, selection, undo, and save still work. |
| Read-only published version | No editing or save is enabled by the new controls. |
| Settings and action dialogs after adding workspace containment | Their existing overlay, position, keyboard focus, and close behavior still work in VF and LEX. |
| Mobile preview vs real narrow hosted form | Compact spacing matches; content is not clipped. |
| Light and dark respondent themes | Task 3 changes only editor colors. Mobile spacing changes in Tasks 5A–5B are documented separately; theme colors and authored rich text remain intact. |
| Pending save + Back to forms | Edit is saved before navigation; failure keeps the editor open. |
| Repeated toggles | No extra viewer instances, duplicate listeners, resize loop, or new console errors. |

Also check visible keyboard focus on every new control and that hidden panels are absent from tab order. This is focused accessibility verification, not a claim of complete accessibility certification.

### Release and completion

The implementation handoff must list:

1. Completed task IDs and files changed.
2. Automated commands and their results.
3. Before/after screenshots for Build, expanded preview, Advanced design, and Mobile.
4. Exact hosts/viewport sizes checked and any unavailable checks.
5. The mismatch diagnosis status, explicitly separate from UX completion.
6. Any remaining failure and its next concrete action.

Deployment is a separate execution step when included in the implementation request. Deploy only affected bundles to the designated development org and repeat browser checks there. Include the shared `finalStudioStyles` bundle when its tokens change. Deploy 5A and 5B together, and keep their source diff separate so both mobile bundles can be restored together if runtime checks fail. Deploying code does not require publishing or changing access to a user form. Do not publish forms just to verify these changes. If no authorized development deployment or representative local host is available, report browser acceptance as pending; inspecting the unchanged deployed UI cannot verify a local implementation.

## 6. Task checklist

- [x] Task 0: baseline and format diagnosis recorded (`docs/FinalDesign/qa/studio-ux-baseline.md`)
- [x] Task 1: preview expansion (PR #363; verified in the VF host, 27 checks; LEX host pending in Task 7)
- [x] Task 2: tools collapse and workspace widths (verified in the VF host at 1024, 1280, 1440 and 768, 21 checks; LEX host pending in Task 7)
- [ ] Task 3: light structure styling (PR #365, implemented and deployed; the state-by-state pass and the light/dark respondent theme check are in Task 7)
- [x] Task 4: compact Advanced rich-text controls (the plan's spike passed on the real editor in the VF host, on a scratch clone; LEX host pending in Task 7)
- [ ] Task 5A: mobile outer/card spacing
- [ ] Task 5B: mobile header
- [x] Task 6: save-aware Back to forms (verified in the VF host on a scratch clone: the edit typed just before Back was in the saved draft, and a forced save failure stayed in the Studio with Retry; LEX host pending in Task 7)
- [ ] Task 7: combined verification and evidence

## 7. Copyable prompt for each implementation session

Replace `TASK_ID` with one unfinished task from the checklist.

```text
Implement Task TASK_ID from docs/FinalDesign/specs/IMPL_PLAN_STUDIO_UX_SIMPLIFICATION.md.

Read the plan's decisions, implementation rules, and that task's dependencies.
Inspect git status and preserve unrelated changes. Read the target components and
their existing tests before editing. Implement only this task; do not rewrite
neighboring features or expand the data model.

Reuse the existing spec, preview-session, selection, autosave, and navigation paths.
Run the focused checks specified for this task. For visual changes, use the actual
browser and record the viewport and evidence. If a check is unavailable, say so.

Update this task's checkbox only when its acceptance checks pass. Report files
changed, checks passed/failed/unavailable, and any remaining issue. Do not start
the next task, deploy, or publish a form unless the current request includes it.
```

## 8. Review amendments and execution decisions (2026-09-29)

Made during the pre-implementation review against the code and approved by the owner. Where they conflict with a task above, this section wins.

**Owner decisions**

- The dark → light structure panel (Task 3) is approved.
- Order: 0, 1, 2, 3, 4, 6, then 5A + 5B together (they change every published form, so they go last and stay in their own change set), then 7. One branch and PR per task.
- Deploying the affected bundles to the dev org `revclouddev` for browser checks is approved.
- Publishing the Experience site to check a real guest-hosted form is **not** approved. Ask again, with specifics, when Task 5 needs it. Until then verify mobile in the VF and LEX hosts and mark the guest-site check pending.
- The editor-mismatch diagnosis is included (Task 0, done).
- Faster mode (owner, later on 2026-09-29): skip the per-task UX-reviewer pass and batch the full browser verification into Task 7. Each task is still deployed to `revclouddev` as it lands so the owner can test in parallel. Targeted browser proofs stay where the plan needs them (the Task 4 rich-text spike and the Task 5A container proof), and CSS-heavy tasks get a quick load-and-measure smoke run.

**Task refinements**

- **Task 1:** "fills the workspace" is measured against `.st-body`. In the VF host 65px of the window below `.st-body` is unused today; that predates this plan and is not part of it.
- **Task 2:**
  - At a 1024px window the tools column becomes 256px (320px today). Checked in the org: the property panel fits at that width with no wrapping or clipping, so the `clamp(240px, 25%, 320px)` stays. (A higher floor would also break the "preview is at least half" rule below roughly 1120px.)
  - Verified in Chromium 149 that a `container-type: inline-size` wrapper does not re-anchor `position: fixed` overlays: after the change the settings drawer and the theme-gallery scrim still cover the whole 1280×800 window. Firefox and Safari are not verified.
  - Measured in the org at 1280×800: collapsing tools takes Desktop Fit from 47% to 69% (+22 points); the panes are 320/320/640 open and 44/320/916 collapsed. At 1024 they are 256/256/512, at 1440 320/320/800, and at 768 they stack (tools 320px, structure 360px, preview in normal flow).
- **Task 3:**
  - With the token table exactly as written, unselected section cards nearly vanish: `canvas-divider` `#dce2e9` on `canvas` `#f1f5f9` is 1.19:1 and `canvas-surface` on `canvas` is 1.05:1. Point `.bc-section` borders at the existing `--c-studio-canvas-border` (3.56:1 on white) and keep `canvas-divider` for skeleton bars and hairlines. No new hex values.
  - Also update `BUILDER_SURFACES.md` section 6 ("dark, schematic"), together with `FORM_STUDIO_IA.md` section 4 and the canvas CSS comment.
  - Measured contrast of the proposed tokens: row border 3.56:1, weak text 6.14:1, error 6.57:1, teal ring 5.00:1 (on canvas) and 4.89:1 (on the selected tint).
- **Task 4:**
  - Spike result (VF host, real `lightning-input-rich-text`, scratch clone): the editor initialises fine inside a closed `<details>`, shows its full toolbar (219px, as before) on first open, keeps the caret at the end across the autosave spec echo (two typing bursts came out in order in the live preview), and bold reaches the preview. All three summaries now sit inside the 800px window (bottoms at y=446/522/579; Brand name used to start at y=927).
  - The native disclosure marker is not shown in the Studio hosts, so the chevron is drawn explicitly (`.rt-summary::before`, rotated when open), and the summary line hides while the editor is open because the editor already shows the text.
- **Task 5B:** the baseline first input is already at 558px (`studio-ux-baseline.md`), so the "within 650px" ceiling cannot show progress. Success is a relative reduction from 558px as well as staying under the ceiling.
- **Task 6:**
  - Keep `exiting` out of `editorLocked`. That getter also gates `_mutate` and `handleSpecChange`, so folding it in would silently drop an edit that arrives during the exit save, and the revision check in step 7 cannot see a dropped edit. Give the buttons their own disabled getter and extend the inert toggle explicitly.
  - Reset `exiting` right after the LEX navigation call (LEX may reuse the instance for the same form, and `routed()` reloads only when the form id changes). For the VF host, also reset it on `pageshow` when the page is restored from the back/forward cache.
  - Update the existing hosted-mode exit test (`finalFormStudio.test.js`, the `.st-exit` click) to await the save, and update the `← Exit` mention in `FORM_STUDIO_IA.md` section 3.
