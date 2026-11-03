# Build plan: move the Studio onto the Formwork design system

**Status:** PLAN, 2026-11-01. Direction picked, mock done, no Studio code changed yet.
**Order (owner, 2026-11-01): swap first, then style.**
1. Step 1 (foundations) runs first.
2. Then each screen gets two PRs: the component swap in [IMPL_PLAN_STUDIO_COMPONENT_SWAP.md](./IMPL_PLAN_STUDIO_COMPONENT_SWAP.md), then this plan's restyle step for that screen.
3. The restyle steps style the swapped Salesforce components through their hooks, and only hand-build CSS for the swap plan's Keep and shared controls.
**The rules this plan implements:** [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md). Every number, pattern and
state lives there. This file holds only the order of work, what each step touches, and the checks.
Archive it once step 6 is verified.
**What it should look like:** [mocks/studio-formwork-system-mock.html](./mocks/studio-formwork-system-mock.html).

**Owner rulings (2026-11-01):**
- 13px base text, no ALL CAPS, and mapping screens use the Studio look.
- Mock before any CSS.
- Direction is **Formwork**, with four changes: 32px controls with 8px corners, a neutral grey surround, and plain (unnumbered) group titles.
- **Formwork product changes:** none are in. The inspector header stays as it is today (owner, 2026-11-01). The preview editing mark and the narrow Editor/Preview switch are parked ([DEFERRED.md](./DEFERRED.md) 48, 49). The row-based structure list is dropped; the structure pane gets a styling-only pass in step 2 instead.
- **Second pass, same day:**
  - picture tiles replace dropdowns wherever the options look different;
  - these stay as they are and only get restyled (DESIGN_SYSTEM §5.0): the Appearance picker, the new-form steps, the one-page-at-a-time page switcher, and the always-visible remove (×).

## The rule for this whole plan: styling only

**Every step restyles. Nothing else changes.** Built features keep their controls, control types,
options, labels, menus, flows, steps and behavior. "Styling" means only these: token values (font
size and weight, color, borders, corner radius, shadows, spacing, heights) and sentence case.

**Approved changes beyond styling (the complete list, owner 2026-11-01):**

| Change | Step |
|---|---|
| Appearance picker moved into a shared `finalPictureChoice` component, with no visible change | 2 |
| "ADDED" → "Added", and other ALL CAPS text → sentence case (owner: no ALL CAPS) | 2–5 |
| Picture tiles instead of dropdowns for Design settings that have a look | 4 |
| New-form wording tweaks (sentence case, no em dashes or arrows in labels) | 5 |

**If a step seems to need anything that isn't on this list, stop and ask the owner first.** Bug fixes
(broken colors, a confirm that hangs) are shown to the owner before merge and never change how a
feature works.

**Proposed earlier and NOT approved (stay exactly as today):**
- the top bar: Build/Design switch, version dropdown, save-status text and Retry save, undo/redo,
  settings menu, Actions dropdown menu, Publish and its labels;
- the "‹ Fields" back button and today's swap between the field list and the inspector;
- Simple / Advanced design (a pressed-button pair, not tabs);
- the preview's Desktop / Tablet / Mobile, phone width and zoom groups (same options);
- the settings drawer (opened from the settings menu, one section at a time, no tabs);
- the library's Show filter (a select) and its version text;
- the creation overlay's focus behavior.

**Not in this work:**
- the respondent runtime and published forms;
- library search and pagination;
- keyboard-spec changes;
- legacy components.

**How each step ships:**
- Its own branch and one PR.
- Deployed to `revclouddev` and **not merged until the owner has looked** at the deployed screens.
- Steps 2–5 each move everything on their screens onto the system at once (type, color, lines, corners, spacing), so no screen is ever half-converted.

---

## Step 0: mock (done)

[mocks/studio-formwork-system-mock.html](./mocks/studio-formwork-system-mock.html) covers every Studio screen. It still shows the parked editing highlight, Editor/Preview switch and row-based structure list: ignore those parts (owner, 2026-11-01). It also has a "The system" sheet: the meaning map, type roles, space, controls in every state, feedback, and the editing mark on three themes. Checked at 1400px and 390px: no page overflow and no script errors.

## Step 1: foundations (no visible change): BUILT 2026-11-02, PR open

Branch `feat/studio-foundations`. What shipped:

- **Tokens:** every DESIGN_SYSTEM §4 token is in `finalStudioStyles.css`:
  - type roles, weights, line heights, fonts;
  - space 1–8, `control-h`, `bar-h`;
  - radius sm/md/pill, shadow-2/3;
  - z-index names, duration/ease.

  Nothing reads them yet. `--c-studio-dialog-shadow` now points at `shadow-3`, which has the same value; step 5 removes its two readers (`finalStudioDialog`, `finalStudioActionDialog`).
- **Guard:** `finalStudioStyles/__tests__/studioScale.test.js` plus `studioScaleAllowlist.json`, which lists today's 962 violations in 40 stylesheets by selector. The list can only shrink. Undefined `--c-studio-*` references and self-referencing variables are never allowed. The test also pins the token values.
- **Bugs found in the audit:**
  - `finalTypeahead.css`: the five self-referencing `--ta-*` fallbacks now use the SLDS values the file's own comment promises. Measured first: both Studio hosts define the SLDS globals, so the picker worked and looks exactly the same. The bug would only have shown on a host without them.
  - `finalDesignSearch.css`: the results list's shadow now uses `--c-studio-shadow-2`. It used to name the undefined `--c-studio-shadow`, so its fallback `#0002` was what drew.
  - `finalFieldPalette.css`: the group label color now uses `--c-studio-text-weak`. It used to name the undefined `--dt-muted`, so its fallback `#5c6b7a` drew. The new value `#526071` is a hair darker.
- **Root font size:** measured 16px on `/apex/FinalStudio` and on the LEX tab.
- **Moved to step 2, because they change how things look:**
  - the shared recipe classes (button, control, segmented, tabs, toggle, badge, group title);
  - the base-component hook settings (`--slds-c-button-*`, `--slds-c-input-*`, radius 8);
  - the reduced-motion rule.

  Each of these restyles every screen at once, which doesn't belong in a no-visible-change PR.
- **Not done:** moving `IMPL_PLAN_DESIGN_RAIL.md` and `IMPL_PLAN_THEME_CREATOR.md` to `archive/`. They are the owner's uncommitted files.

## Step 2: Build look: BUILT 2026-11-02, PR open

Branch `feat/restyle-build`. It follows the Build swap (PR 430).

**What shipped:**
- **Shared bundle:**
  - Salesforce styling hooks for Studio controls: 8px corners, Studio edges and focus, and teal checked state for checkboxes and switches. Scoped by element, so the form preview never picks them up.
  - The reduced-motion rule.
  - Two selected-state tokens, `selected-ring` and `selected-bar`.
- **Not added:** the shared recipe classes. Nothing uses them yet, so each later restyle adds the ones its screen needs.
- **Restyled onto tokens:** the shell and top bar (looks only), rail (12px labels), field list, inspector, preview toolbar, picture tiles, and the structure pane.
  - The structure pane keeps its own cards and drag and drop. Its private `--c-studio-canvas*` colors were swapped for the shared tokens, and its ALL CAPS is gone.
- **Guard:** the allowlist went from 909 to 723. The Build components keep 5 entries: four drag-and-drop indicator lines, plus the preview's `z-index: -1` margin bands.
Components: `finalFormStudio` (shell, top bar, save status), `finalStudioRail`, `finalFieldPalette`, `finalPropertyPanel`, `finalPreviewStage` (header only).

- **Top bar: styling only.** Same contents, same controls, same order, same behavior:
  - back button, form name;
  - version dropdown (or version chip);
  - the Build/Design switch: same joined buttons, with the current mode still filled teal;
  - save status text and Retry save;
  - undo/redo;
  - the settings icon menu (Connected object, Availability, Access & invitations);
  - the Actions dropdown (Clone, Export, Import, Delete form);
  - Publish, with its labels and progress or error lines.

  Only token values change: 11.5px and 12.5px text becomes 12px or 13px, 700 weight becomes 600, plus the radius, border and height tokens.
- **Tools pane: styling only.** Picking a question still swaps the field list for its inspector, and "‹ Fields" still goes back. Rail labels go from 9.5px to 12px; the rail may widen to fit them.
- **Inspector header** (`finalPropertyPanel` `pp-head`): styling only. Same title, same contents.
- **Groups** (`Text & guidance`, `Options`, `Checks`, `Visibility`, `Rules`) use the group pattern.
- **Appearance picker:** untouched apart from tokens. Move its markup and key handling into a shared `finalPictureChoice` component (DESIGN_SYSTEM 5.24) with no visual change, and keep the property panel's Jest tests green unchanged. Steps 4 and 5 reuse it.
- **Structure pane (`finalBuilderCanvas`): styling only.** Same dashed cards, grey bars, page chips, × buttons, drag and drop, placement rules and keyboard paths. Only:
  - swap its 55 private `--c-studio-canvas*` colors for the shared Studio tokens, then delete those tokens from the bundle;
  - section titles become sentence case (`text-transform: uppercase` at `finalBuilderCanvas.css:148` and `:238` goes);
  - restyle the × buttons and page chips (color, size, hover), and nothing else.
- **"ADDED" badges** become "Added" (`finalFieldPalette.html:101`, `finalPropertyPanel.html:1387`).
- **The preview stage header: styling only.** Desktop / Tablet / Mobile, phone widths and zoom keep their options and behavior and are drawn with the segmented recipe.

## Step 3: Mapping: BUILT 2026-11-02, PR open

Branch `feat/mapping-swap-restyle`. The Mapping swap and this restyle ship in one PR because the swap is only 4 buttons.

- Built: 9 Mapping style files moved onto Studio tokens; ALL CAPS removed; the picker box now matches Studio inputs (32px tall, 8px corners).
- `finalFieldPicker` and `finalObjectPicker` had nothing to restyle: they draw through `finalTypeahead`.
- Salesforce radio and checkbox groups now get the teal hooks too (on LEX, a Mapping radio was still Salesforce blue).
- Guard allowlist 723 → 576. Left on purpose: 4 focus and error ring shadows (`finalTypeahead`, `finalMappingSoql`, `finalConnectedObjectCard`).
Components: `finalMappingEditor`, `finalMappingAction`, `finalMappingSoql`, `finalMappingSummary`, `finalTypeahead`, `finalFieldPicker`, `finalObjectPicker`, `finalLookupFilter`, `finalRelationshipPicker`, `finalConnectedObjectCard`, `finalSubmissionReader`.

- **Colors:** Salesforce blue and greys become Studio tokens.
- **Styling only:** same layout, same steps, same pickers and same behavior. Table headers, rows, selected states, API-name text and spacing are restyled with the tokens.
- **Test:** put a long question label beside a long field API name, and regression-check every typeahead consumer.

## Step 4: Design

Branch `feat/studio-design-consistency`.
Components: `finalDesignPanel`, `finalDesignSearch`, `finalColorControl`, `finalGradientControl`, `finalImageUploader`, `finalFontPicker` (chrome only), `finalBrandInputs`, `finalThemeEditor`, `finalThemeGallery`, `finalGalleryPicker`, `finalThemeCard` and `finalLayoutCard` (frame, name and selection only).

- **Simple / Advanced design: styling only.** It stays a pressed-button pair, drawn with the segmented recipe.
- **Picture tiles:** Design registry `select` settings that have a look get one drawing per option, rendered by `finalPictureChoice`:
  - image fit, corner rounding, mesh, texture, density;
  - pane side, pane width;
  - progress indicator (stepper and brand pane), small-screen progress;
  - tab style, tab alignment, rail side, button position.

  Intensities, glass blur, max width, step access and flow stay as they are. The stored values don't change.
- **Theme and layout cards:** restyled frame, name and selection only.
- **Confirm dialog:** test the `LightningConfirm` call at `finalDesignPanel.js:1414` in the VF Studio. If Cancel hangs, show the owner before switching it to the inline confirm.

## Step 5: around it

Branch `feat/studio-surround-consistency`.
Components: `finalFormsLibrary`, `finalCreationGallery`, `finalStudioDialog`, `finalStudioActionDialog`, `finalStudioSettingsPanel`, `finalPublishDialog`, `finalConditionsModal`, `finalConditionsSummary`, `finalRuleEditor`, `finalValidationEditor`, `finalAutofillPanel`, `finalAutofillRuleEditor`, `finalRecordLinkPanel`.

- **Dialogs: styling only** (header, body and footer spacing, title size, buttons). Focus and close behavior stay as they are today.
- **New form keeps today's steps:** kind → layout or template → theme → details → Create form, where picking a card moves you on. Changes are limited to:
  - wording: sentence case, and no em dashes or "→" in labels;
  - Back and Close restyled where they already are;
  - kind, layout and theme cards restyled (frame, type, selection).
- **Settings drawer: styling only.** It's still opened from the settings menu, one section at a time.
- **Library:**
  - styling only: page title size, the Show select, and the table's header, rows and badges;
  - same columns, filter, text and actions.
- **Cleanup:**
  - test the `LightningConfirm` call at `finalFormStudio.js:3020`. If Cancel hangs, show the owner before fixing it;
  - remove the 23 dead `var(--c-studio-x, #hex)` fallbacks;
  - drop the `--c-studio-dialog-shadow` alias.

## Step 6: lock it

1. Empty the guard's allowlist so the rules become absolute.
2. Fill in the DESIGN_SYSTEM change log.
3. Archive this plan and `mocks/STUDIO_FORMWORK_DIRECTION.md`.

## Checks for every PR

1. The full Jest suite passes. List in the PR any tests that checked old text ("ADDED") or old classes.
2. Deploy to `revclouddev` and take before/after screenshots of every screen in the step:
   - on `/apex/FinalStudio` and the LEX tab;
   - wide and under 700px;
   - with long names, and in the empty, error and busy states.
3. Run a keyboard pass on every tab bar, dialog and picker you touched.
4. Run the theme-switch leak test (DESIGN_SYSTEM §10 step 4).
5. Compare against the mock. Any difference either gets fixed or gets written into DESIGN_SYSTEM in the same PR.

## Inventory: raw values today (40 Studio stylesheets, 2026-11-01)

Counted from source with comments removed and `var(...)` excluded. `finalThemeCard` and
`finalLayoutCard` aren't counted (their chrome selectors get classified in step 4, Design).

| Component | Imports bundle | Sizes | Weights | Radius | z-index | Raw colors | Dead fallbacks | Font stack | CAPS | Motion | Spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `finalPropertyPanel` | y | 32 | 16 | 26 | 0 | 0 | 0 | 1 | 0 | 0 | 78 |
| `finalCreationGallery` | y | 29 | 15 | 19 | 1 | 3 | 0 | 2 | 2 | 3 | 81 |
| `finalAutofillPanel` | y | 20 | 10 | 8 | 0 | 19 | 18 | 0 | 0 | 1 | 49 |
| `finalFormStudio` | y | 25 | 14 | 10 | 2 | 2 | 0 | 1 | 2 | 0 | 57 |
| `finalDesignPanel` | y | 21 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 72 |
| `finalMappingEditor` | no | 9 | 3 | 4 | 0 | 18 | 0 | 0 | 1 | 0 | 20 |
| `finalMappingAction` | no | 11 | 5 | 3 | 0 | 16 | 0 | 0 | 2 | 0 | 24 |
| `finalBuilderCanvas` | y | 14 | 3 | 11 | 0 | 0 | 0 | 1 | 2 | 0 | 45 |
| `finalFormsLibrary` | y | 12 | 6 | 9 | 1 | 1 | 0 | 1 | 1 | 0 | 35 |
| `finalThemeEditor` | y | 12 | 8 | 9 | 0 | 1 | 0 | 0 | 1 | 0 | 40 |
| `finalStudioActionDialog` | y | 10 | 2 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 32 |
| `finalBrandInputs` | no | 7 | 3 | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 16 |
| `finalFieldPalette` | y | 10 | 4 | 3 | 0 | 0 | 0 | 1 | 1 | 0 | 20 |
| `finalConnectedObjectCard` | y | 8 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 13 |
| `finalPreviewStage` | y | 6 | 1 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 15 |
| `finalRelationshipPicker` | y | 6 | 3 | 3 | 1 | 1 | 0 | 1 | 0 | 0 | 19 |
| `finalRuleEditor` | y | 7 | 3 | 3 | 0 | 0 | 0 | 0 | 2 | 0 | 13 |
| `finalSubmissionReader` | no | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 15 |
| `finalGalleryPicker` | y | 6 | 3 | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 17 |
| `finalGradientControl` | y | 4 | 1 | 4 | 0 | 1 | 0 | 1 | 0 | 0 | 16 |
| `finalTypeahead` | no | 6 | 1 | 2 | 1 | 1 | 0 | 0 | 0 | 0 | 9 |
| `finalAutofillRuleEditor` | y | 5 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 0 | 8 |
| `finalThemeGallery` | y | 6 | 3 | 2 | 0 | 0 | 0 | 1 | 1 | 1 | 13 |
| `finalValidationEditor` | y | 5 | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| `finalColorControl` | y | 5 | 1 | 2 | 0 | 0 | 0 | 1 | 0 | 1 | 9 |
| `finalDesignSearch` | y | 4 | 0 | 3 | 1 | 0 | 1 | 0 | 0 | 0 | 11 |
| `finalPublishDialog` | no | 6 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| `finalRecordLinkPanel` | y | 4 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 21 |
| `finalFontPicker` | no (inherits) | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| `finalLookupFilter` | no | 2 | 0 | 1 | 0 | 3 | 0 | 0 | 0 | 0 | 4 |
| `finalMappingSoql` | no | 6 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 9 |
| `finalImageUploader` | y | 3 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| `finalStudioSettingsPanel` | y | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| `finalConditionsSummary` | y | 3 | 2 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 6 |
| `finalMappingSummary` | y | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| `finalStudioDialog` | y | 3 | 2 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 11 |
| `finalConditionsModal` | y | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `finalStudioRail` | y | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| `finalFieldPicker` | no (wraps typeahead) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `finalObjectPicker` | no (wraps typeahead) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total (40)** | | **329** | **137** | **170** | **13** | **70** | **23** | **12** | **18** | **6** | **849** |

Also: **189 hand-built `<button>`s, 58 `<input>`s, 15 `<select>`s** sit beside 61 `lightning-input`,
36 `lightning-button` and 14 `lightning-combobox` in Studio templates. Each slice decides, per
control, whether it moves to a base component or keeps native markup styled by the shared recipe.
