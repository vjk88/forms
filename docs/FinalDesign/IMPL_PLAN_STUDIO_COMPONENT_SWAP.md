# Build plan: swap hand-built Studio controls to Salesforce components

**Status:** PLAN, 2026-11-01. No code changed yet.
**Order (owner, 2026-11-01):** swap first, then restyle.
- [IMPL_PLAN_STUDIO_DESIGN_SCALE.md](./IMPL_PLAN_STUDIO_DESIGN_SCALE.md) step 1 (foundations) runs first, since both plans need it.
- Then each screen gets **two PRs**: this swap (behavior), then the restyle (looks).

**Scope:** the 263 hand-built `<button>`, `<input>`, `<select>` and `<textarea>` controls in Studio `final*` templates.
- Respondent components (the published form and the preview) are out of scope.
- Controls that are already Salesforce components (223 today) aren't listed.

## What each control becomes

- **Salesforce:** the matching base component (`lightning-button`, `-button-icon`, `-input`, `-combobox`, `-slider`, `-textarea`).
- **Ours (shared):** one of our two shared components, used everywhere that job appears:
  - `finalButtonGroup`, for every segmented button group;
  - `finalPictureChoice`, for picture tiles.
- **Keep:** stays the same element, for a reason listed in its row. It's still restyled in the styling step.

## Owner rulings (2026-11-01)

| Question | Ruling |
|---|---|
| Big-effort areas such as drag and drop | **Don't touch.** The structure pane (`finalBuilderCanvas`), the palette's drag rows and the option drag grip stay as they are |
| Top bar | **Styling only.** Nothing in it is swapped |
| Segmented button groups (about 25) | **Keep ours,** moved onto one shared `finalButtonGroup`. Every new button group in this app must use it, never a hand-made one or `lightning-radio-group` buttons |
| Color pickers (6) and their hex boxes (2) | **Keep** (step 0: Salesforce's picker sends nothing while dragging, so live recolor would be lost) |
| Rule date & time (1) | **Keep** (step 0: Salesforce's box showed a saved 9:30 as 7:30 AM and saves a different format) |
| SOQL box (1) | **Keep** (monospace code font) |
| Button group look (2026-11-02) | **Joined, solid teal**: the look of the Build/Design switch and the preview toolbar |
| Choice option boxes (4), Page margin dropdown (1), invitation link box (1) (2026-11-02) | **Keep**: each would lose a screen-reader link or a fallback |
| Font picker dropdowns (3: Font pairing, Heading font, Body font) | **Keep** (native `<select>` with `<optgroup>` headings; `lightning-combobox` has no option groups) |

## Rules for the swap PRs

1. **Same behavior.** The swap changes the element, not what it does. The expected differences are in the next section; anything else is a bug.
2. **Same words.** Labels, titles and help text stay identical. For example, "‹ Fields" stays "‹ Fields".
3. **Saving moments don't change:**
   - A text or number box with a native `onchange` today saves when you leave the box or press Enter. It becomes `oncommit` on `lightning-input`, which fires at those same moments.
   - Using `onchange` on `lightning-input` would save on every keystroke. A native `oninput` (live) becomes `onchange` on `lightning-input`.
4. **Reading values: each component has its own event contract.** Follow this table, never one rule for all. About 105 handlers change, and each must be checked against its component's row:

   | Component | Event | Read the new value from | Measured in step 0 (2026-11-01, same on VF and LEX) |
   |---|---|---|---|
   | `lightning-input`: text, number, search | `change` | `event.target.value` | Fires on **every keystroke**. `event.detail.value` carries the same value |
   | `lightning-input`: text, number, search | `commit` | `event.target.value` | Fires on Tab out and on Enter, **with no `detail`**. Use it wherever the native box saves on `onchange` today |
   | `lightning-input`: checkbox, toggle | `change` | `event.target.checked` | `event.detail.checked` carries the same value. A `commit` also fires (just before `change`): **never listen to both**, or the handler runs twice |
   | `lightning-input`: color (not used: kept) | `change` | `event.target.value` | Fires when the hex is typed, and **only after "Done"** in the picker panel (twice, plus a `commit`). **Nothing fires while dragging** in the panel. Cancel fires nothing. Handlers must tolerate the same value arriving twice |
   | `lightning-input`: datetime (not used: kept) | `change` | `event.target.value` | Never `commit`: it fires, but carries the **old** value. Value is an ISO UTC string (`2026-11-05T18:45:00.000Z`) |
   | `lightning-combobox` | `change` | `event.detail.value` | `event.target.value` also holds it. Arrow keys + Enter pick. Type-to-jump not confirmed |
   | `lightning-slider` | `change` | `event.detail.value` | Fires **continuously while dragging** (live, like today). `event.target.value` also holds it |
   | `lightning-textarea` | `change` | `event.target.value` | Every keystroke. **No `commit`** on Tab out: if a box must save on leave, use `onblur` |
   | `lightning-button`, `lightning-button-icon` | `click` | no value; `data-*` from `event.currentTarget.dataset` | `aria-expanded` passes through to the inner button |
   | `finalButtonGroup`, `finalPictureChoice` (ours) | `change` | `event.detail.value` | We define this contract |

   Also measured: `variant="label-hidden"` keeps the label as screen-reader text (`slds-assistive-text`).

5. **Labels:**
   - When the visible label stays where it is, use `variant="label-hidden"` with the same text as `label`, so screen readers still hear it.
   - Otherwise move the text into `label`.
6. **No double errors.** Don't add `required`, `pattern`, `min` or `max` to `lightning-input` where our own message already handles it, or the field shows two messages.
7. **Tests:** business expectations stay. That means what gets saved, what's shown, what's called, and when. Inside that rule, tests may change:
   - **how they find controls.** At least 67 queries in 22 test files look for native elements; more find them by `data-id`;
   - **how they fire events.** Fixtures fire the real Lightning contract from the table above. For `lightning-input`, set `value`/`checked` on the element, then fire `change` or `commit`; for `lightning-combobox`, fire `change` with `detail: { value }`;
   - **new conversion tests.** Each swapped handler gets a test that the new event shape reaches the same saved value. Typing alone (`change`) must not save where today saving waits for `commit`.
8. **Checks per PR:**
   - full Jest suite;
   - deploy to `revclouddev`;
   - every swapped control used once on `/apex/FinalStudio` and once on the LEX tab: click, type, keyboard, disabled, error;
   - before/after screenshots.

## Differences you'll see (expected, accepted by swapping)

| Control | Difference |
|---|---|
| `<select>` → `lightning-combobox` | Opens a Salesforce popup list instead of the browser's list; typing a letter to jump works differently |
| Range → `lightning-slider` | Salesforce slider look. **Check:** it updates while dragging, as today |
| On/off pressed buttons (Header, Collapsible, Starts collapsed) → `lightning-input type="toggle"` | Shown as a switch instead of a pressed button |
| "+ Add option" style buttons → `lightning-button variant="base"` | The "+" becomes the Salesforce add icon; the words stay |

## Step 0: real-component check (before any swap PR)

Jest uses stand-ins for Lightning components, so it can't prove how the real ones behave.

**Branch:** `spike/lightning-event-contracts`. It deploys a throwaway check component, `finalSwapProbe` (deleted once the check is done), to `revclouddev`.

**Open it on** `/apex/FinalStudio` and the LEX tab, and record:

1. The event name and where the value lives (`target` or `detail`) for each component in the table above; commit timing (leave the box, Enter).
2. **Color:** does `lightning-input type="color"` fire `change` while dragging in its picker, so the preview could recolor live? Does its own hex box replace ours?
3. **Slider:** does `lightning-slider` fire `change` while dragging, or only on release?
4. **Date & time:** take a value saved today, load it into `lightning-input type="datetime"`, save without changing it, and compare: same string, same moment? Also confirm `change` fires once per finished pick, so it saves at the same moments as today.
5. **Combobox:** keyboard (open, arrows, type-to-jump) and long option labels.
6. **Buttons:** `lightning-button` passes `aria-expanded`; `variant="label-hidden"` still gives screen readers the label.

**Done 2026-11-01** (probe run on both hosts; results are in the event table above). Two results hit the stop rule; **the owner kept both as they are**:
- **Color:** the panel sends nothing while dragging, only on "Done", so the preview can't recolor live.
- **Date & time:** a saved `2026-11-05T09:30` displays as 7:30 AM (read in one time zone, shown in another), and saving writes `2026-11-05T18:45:00.000Z`, a different format from what saved rules hold. This matches the warning comment on the native box in `finalRuleEditor.html`.

**Exit:** the results are written into the event table here.
- If color or the slider can't update live, or date-time values shift, **stop and ask the owner** before swapping those controls (the fallback is Keep).
- Then delete `finalSwapProbe` from the org.

## Progress

- **Build swap: built 2026-11-02 on `feat/swap-build`** (PR open, deployed to `revclouddev`, checked on both hosts).
  - It adds `finalButtonGroup` and `finalPictureChoice`.
  - It also keeps the topic box native: its suggestions are a `<datalist>`.
- **Mapping swap: built 2026-11-02 on `feat/mapping-swap-restyle`** (shipped together with the Mapping restyle).
  - "Add a record", "Change", the relationship picker's Cancel and the submission file link are now `lightning-button`.

## Order of work (one swap PR per screen, then its restyle PR)

| Screen | Components |
|---|---|
| Build | `finalPropertyPanel`, `finalFieldPalette`, `finalValidationEditor`, `finalFormStudio` (outside the top bar), `finalPreviewStage`, `finalAutofillPanel`, `finalAutofillRuleEditor`, `finalRuleEditor`, `finalRecordLinkPanel` |
| Mapping | `finalMappingEditor`, `finalMappingAction`, `finalRelationshipPicker`, `finalSubmissionReader` |
| Design | `finalDesignPanel`, `finalBrandInputs`, `finalColorControl`, `finalGradientControl`, `finalFontPicker` (its "Customize" button only), `finalImageUploader`, `finalThemeEditor`, `finalThemeGallery` |
| Around it | `finalCreationGallery`, `finalFormsLibrary`, `finalStudioActionDialog` |

`finalButtonGroup` and `finalPictureChoice` are built in the first swap PR (Build), because Build has the most button groups and the Appearance tiles. Later screens reuse them.

## Summary

| | Controls |
|---|---|
| **Swap to a Salesforce component** | **137** |
| **Move to our shared component** (button group, picture tiles) | **35** |
| **Keep as is** (restyle only, reason given) | **91** |
| Total hand-built controls today | 263 |


## Every control, by component

Line numbers are in each component's `.html` as of 2026-11-01. "Keep" never means "leave unstyled": it is restyled with the shared tokens in the styling step.


### `finalAutofillPanel` (9 salesforce)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 12 | button "[icon:] / Add rule" | Salesforce | `lightning-button` |
| 64 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:(same icon)) |
| 76 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:(same icon)) |
| 125 | button "Add rule" | Salesforce | `lightning-button variant="brand"` |
| 181 | button "{createLinkLabel}" | Salesforce | `lightning-button variant="brand"` |
| 189 | button "{stopLinksLabel}" | Salesforce | `lightning-button` (keeps `aria-expanded`) |
| 217 | button "Cancel" | Salesforce | `lightning-button` |
| 224 | button "Stop links" | Salesforce | `lightning-button variant="destructive-text"` |
| 251 | button "{copiedLinkText}" | Salesforce | `lightning-button` |

### `finalAutofillRuleEditor` (3 our shared component)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 25 | button "The record in the link" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 34 | button "A record picked in a lookup" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 42 | button "The signed-in person" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |

### `finalBrandInputs` (5 salesforce, 1 our shared component, 5 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 11 | button "Upload logo…" | Salesforce | `lightning-button` |
| 21 | button "Remove" | Salesforce | `lightning-button variant="base"` |
| 29 | input (file) | Keep | Hidden file input opened by a visible button; nothing to see or style |
| 49 | button "{s.role}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 80 | input (checkbox) | Salesforce | `lightning-input type="checkbox"` |
| 96 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |
| 105 | input (text) | Keep | Hex box beside the native color picker (kept with it). Restyle only |
| 121 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |
| 134 | input (text) | Keep | Hex box beside the native color picker (kept with it). Restyle only |
| 146 | button "Clear" | Salesforce | `lightning-button variant="base"` |
| 166 | button "Swap main and second" | Salesforce | `lightning-button variant="base"` |

### `finalBuilderCanvas` (10 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 19 | button "{p.label}" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 40 | button "×" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 53 | button "+ Page" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 82 | button "{s.blockLabel}" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 95 | button "×" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 124 | button "{s.title}" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 143 | button "×" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 175 | button "* / {el.label} / {el.typeLabel}" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 202 | button "×" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |
| 236 | button "+ Section" | Keep | Structure pane: drag and drop lives here (owner: don't touch). Restyle only |

### `finalColorControl` (2 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 8 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |
| 26 | icon button (.{dyn}) | Keep | Color swatches: no Salesforce component for this. Restyle only |

### `finalConnectedObjectCard` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 60 | button "{option.label} / {option.value}" | Keep | Object option in a result list: no Salesforce component for this. Restyle only |

### `finalCreationGallery` (24 salesforce, 5 our shared component, 7 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 12 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 26 | button "[icon:] / Form / Collects structured" | Keep | Kind card (Form / Survey / Freeform): no Salesforce component for this. Restyle only |
| 44 | button "[icon:] / Survey / Asks questions an" | Keep | Kind card: no Salesforce component for this. Restyle only |
| 63 | button "[icon:] / Freeform / Ask anything yo" | Keep | Kind card: no Salesforce component for this. Restyle only |
| 89 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 107 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 130 | button "[icon:] / Form templates" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 143 | button "[icon:] / Blank form · pick a layout" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 207 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 215 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 237 | button "{t.name} / {t.blurb}" | Keep | Template card: no Salesforce component for this. Restyle only |
| 262 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 274 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 305 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 317 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 335 | input (text) | Salesforce | `lightning-input` |
| 348 | input (text) | Salesforce | `lightning-input` |
| 384 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 402 | button "{chosenThemeLabel} / [icon:] / Change" | Keep | Chosen-theme chip with "Change": no Salesforce component for this. Restyle only |
| 428 | button "Creating… / Create form" | Salesforce | `lightning-button variant="brand"` |
| 450 | icon button (.{dyn}) | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 486 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 498 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 518 | input (text) | Salesforce | `lightning-input` |
| 532 | input (text) | Salesforce | `lightning-input` |
| 572 | button "{chosenThemeLabel} / [icon:] / Change" | Keep | Chosen-theme chip: no Salesforce component for this. Restyle only |
| 598 | button "Creating… / Create survey" | Salesforce | `lightning-button variant="brand"` |
| 620 | icon button (.{dyn}) | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 656 | button "[icon:] / Back" | Salesforce | `lightning-button variant="base"` with a back icon |
| 668 | button "[icon:]" | Salesforce | `lightning-button-icon` (utility:close) |
| 688 | input (text) | Salesforce | `lightning-input` |
| 706 | button "{chosenThemeLabel} / [icon:] / Change" | Keep | Chosen-theme chip: no Salesforce component for this. Restyle only |
| 732 | button "Creating… / Create freeform" | Salesforce | `lightning-button variant="brand"` |
| 754 | icon button (.{dyn}) | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 800 | button "Create another" | Salesforce | `lightning-button` |
| 807 | button "Done" | Salesforce | `lightning-button` |

### `finalDesignPanel` (20 salesforce, 2 our shared component, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 12 | button "Simple" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 20 | button "Advanced design" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 32 | button "Reset all" | Salesforce | `lightning-button variant="base"` |
| 58 | button "Keep my customizations" | Salesforce | `lightning-button variant="brand"` |
| 65 | button "Use theme as-is" | Salesforce | `lightning-button` |
| 72 | button "Cancel" | Salesforce | `lightning-button` |
| 95 | button "Change…" | Salesforce | `lightning-button variant="base"` |
| 104 | button "Edit theme…" | Salesforce | `lightning-button variant="base"` |
| 117 | button "Change…" | Salesforce | `lightning-button variant="base"` |
| 197 | button "Reset to theme" | Salesforce | `lightning-button variant="base"` |
| 245 | button "Reset to theme" | Salesforce | `lightning-button variant="base"` |
| 363 | button "{t.label} / {t.hint}" | Keep | After-submit tiles: no Salesforce component for this. Restyle only |
| 423 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 467 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 512 | input (checkbox) | Salesforce | `lightning-input type="checkbox"` |
| 546 | input (range) | Salesforce | `lightning-slider`. Check it updates while dragging, as today |
| 572 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 613 | button "Change…" | Salesforce | `lightning-button variant="base"` |
| 623 | button "Edit theme…" | Salesforce | `lightning-button variant="base"` |
| 639 | button "Change…" | Salesforce | `lightning-button variant="base"` |
| 724 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 737 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 764 | button "Open after-submit settings" | Salesforce | `lightning-button variant="base"` |

### `finalDesignSearch` (3 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 10 | input (search) | Keep | Design search box (arrow keys into results) |
| 24 | button "×" | Keep | Clear (×) inside the Design search box |
| 45 | button "{result.label} / {result.path} / {resul" | Keep | Design search result row |

### `finalFieldPalette` (1 salesforce, 6 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 25 | button "{q.label}" | Keep | Question row in the palette: no Salesforce component for this. Restyle only |
| 61 | input (search) | Salesforce | `lightning-input type="search"` |
| 78 | button "* / {f.label} / {f.inputType} / ADDE" | Keep | Drag and drop source (owner: don't touch) |
| 126 | button "{b.label}" | Keep | Drag and drop source (owner: don't touch) |
| 153 | button "[icon:] / Empty space" | Keep | Drag and drop source (owner: don't touch) |
| 178 | button "[icon:] / Repeating Group" | Keep | Drag and drop source (owner: don't touch) |
| 213 | button "{r.label} / {r.summary}" | Keep | Rule row in the palette: no Salesforce component for this. Restyle only |

### `finalFontPicker` (1 salesforce, 3 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 9 | select | Keep | Grouped font list (`<optgroup>` headings); `lightning-combobox` has no groups (owner: keep). Restyle only |
| 39 | button "{customizeLabel}" | Salesforce | `lightning-button variant="base"` |
| 52 | select | Keep | Grouped font list (`<optgroup>` headings); `lightning-combobox` has no groups (owner: keep). Restyle only |
| 75 | select | Keep | Grouped font list (`<optgroup>` headings); `lightning-combobox` has no groups (owner: keep). Restyle only |

### `finalFormStudio` (6 salesforce, 15 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 17 | button "Go to Forms" | Salesforce | `lightning-button variant="brand"` |
| 34 | button "Go to Forms" | Salesforce | `lightning-button` |
| 37 | button "Restore form" | Salesforce | `lightning-button variant="brand"` |
| 53 | button "← Back to forms" | Keep | Top bar: styling only (owner) |
| 63 | select | Keep | Top bar: styling only (owner) |
| 80 | button "Build" | Keep | Top bar: styling only (owner) |
| 89 | button "Design" | Keep | Top bar: styling only (owner) |
| 109 | button "Retry save" | Keep | Top bar: styling only (owner) |
| 122 | button "{backToEditableLabel}" | Keep | Top bar: styling only (owner) |
| 131 | button "↶" | Keep | Top bar: styling only (owner) |
| 140 | button "↷" | Keep | Top bar: styling only (owner) |
| 168 | button "Connected object / {connectionStatus}" | Keep | Top bar: styling only (owner) |
| 181 | button "Availability / {availabilityStatus}" | Keep | Top bar: styling only (owner) |
| 193 | button "Access & invitations / {accessStatu" | Keep | Top bar: styling only (owner) |
| 236 | button "{publishLabel}" | Keep | Top bar: styling only (owner) |
| 249 | button "{publishRetryLabel}" | Keep | Top bar: styling only (owner) |
| 272 | button "{backToEditableLabel}" | Salesforce | `lightning-button variant="brand"` |
| 318 | button "{toolsGlyph} / Collapse tools" | Keep | Tools collapse handle (custom glyph handle). Restyle only |
| 343 | button "‹ Fields" | Salesforce | `lightning-button variant="base"` |
| 469 | icon button (.st-drawer-backdrop) | Keep | Click-outside backdrop, not a visible control |
| 530 | button "Retry save" | Salesforce | `lightning-button` |

### `finalFormsLibrary` (6 salesforce)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 12 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 21 | button "Refresh" | Salesforce | `lightning-button` |
| 28 | button "+ New form" | Salesforce | `lightning-button variant="brand"` |
| 83 | button "View" | Salesforce | `lightning-button` |
| 91 | button "{row.restoreLabel}" | Salesforce | `lightning-button` |
| 103 | button "Open in Studio" | Salesforce | `lightning-button` |

### `finalGalleryPicker` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 25 | button "Create from your brand / Upload your log" | Keep | "Create from your brand" card: no Salesforce component for this. Restyle only |

### `finalGradientControl` (2 salesforce, 2 our shared component, 4 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 8 | button "Solid" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 17 | button "Gradient" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 33 | icon button (.preset) | Keep | Gradient presets: no Salesforce component for this. Restyle only |
| 49 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 68 | input (range) | Salesforce | `lightning-slider`. Check it updates while dragging, as today |
| 82 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |
| 90 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |
| 103 | input (color) | Keep | Live recolor while dragging (owner: keep after step 0). Restyle only |

### `finalImageUploader` (2 salesforce, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 15 | button "Remove" | Salesforce | `lightning-button variant="base"` |
| 24 | button "{buttonLabel}" | Salesforce | `lightning-button` |
| 32 | input (file) | Keep | Hidden file input opened by a visible button; nothing to see or style |

### `finalMappingAction` (1 salesforce, 2 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 76 | button "Use it, leave it alone / No duplicate i" | Keep | Choice card: no Salesforce component for this. Restyle only |
| 91 | button "Update it with these answers / You then" | Keep | Choice card: no Salesforce component for this. Restyle only |
| 112 | button "Change / what happens when one is found" | Salesforce | `lightning-button variant="base"` |

### `finalMappingEditor` (1 salesforce, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 18 | button "{card.title} / {card.detail} / {card.s" | Keep | Record card in the mapping list: no Salesforce component for this. Restyle only |
| 87 | button "[icon:] / Add a record" | Salesforce | `lightning-button variant="neutral"` |

### `finalMappingSoql` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 22 | textarea | Keep | SOQL code box stays monospace (owner) |

### `finalPreviewStage` (2 salesforce, 3 our shared component, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 6 | button "{d.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 21 | button "{p.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 38 | select | Keep | Page margin: its spoken description ("Preview only, nothing on your form changes") can't cross `lightning-combobox`'s shadow root (owner: keep, 2026-11-02). Restyle only |
| 55 | button "{z.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 71 | button "⟳" | Salesforce | `lightning-button-icon` (utility:refresh) |
| 81 | button "{expandLabel}" | Salesforce | `lightning-button` (keeps `aria-expanded`) |

### `finalPropertyPanel` (31 salesforce, 17 our shared component, 10 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 51 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 69 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 85 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 104 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 123 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 141 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 148 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 179 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 193 | input (file) | Keep | Hidden file input opened by a visible button; nothing to see or style |
| 201 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 215 | button "+ Add picture option" | Salesforce | `lightning-button variant="base"` |
| 230 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 239 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 250 | button "+ Add item" | Salesforce | `lightning-button variant="base"` |
| 265 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 273 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 284 | button "+ Add statement" | Salesforce | `lightning-button variant="base"` |
| 310 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 339 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 374 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 382 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 402 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 415 | input (text) | Keep | Topic box: its "type to pick" suggestions are a native `<datalist>`, which `lightning-input` can't use. Restyle only |
| 460 | button "{defaultTile.title} / {defaultTile.desc}" | Ours (shared) | `finalPictureChoice` (Appearance tiles, extracted unchanged) |
| 499 | button "{t.label}" | Ours (shared) | `finalPictureChoice` (Appearance tiles, extracted unchanged) |
| 655 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 758 | icon button (.pp-grip) | Keep | Drag and drop source (owner: don't touch) |
| 806 | input (text) | Keep | Choice option row box: its problem line is linked by `aria-describedby` and it turns red; `lightning-input` would cut the link and add its own message (owner: keep, 2026-11-02). Restyle only |
| 818 | input (text) | Keep | Choice option row box: its problem line is linked by `aria-describedby` and it turns red; `lightning-input` would cut the link and add its own message (owner: keep, 2026-11-02). Restyle only |
| 831 | input (text) | Keep | Choice option row box: its problem line is linked by `aria-describedby` and it turns red; `lightning-input` would cut the link and add its own message (owner: keep, 2026-11-02). Restyle only |
| 845 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 865 | input (text) | Keep | Choice option row box: its problem line is linked by `aria-describedby` and it turns red; `lightning-input` would cut the link and add its own message (owner: keep, 2026-11-02). Restyle only |
| 877 | button "+ Add option" | Salesforce | `lightning-button variant="base"` |
| 916 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 925 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 934 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 948 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 957 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 975 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 983 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 1058 | button "{b.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1125 | input (file) | Keep | Hidden file input opened by a visible button; nothing to see or style |
| 1134 | button "Remove" | Salesforce | `lightning-button variant="base"` |
| 1158 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1186 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1215 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1250 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1315 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1370 | button "* / {f.label} / {f.inputType} / ADDE" | Keep | Child-field row with "Added" badge: no Salesforce component for this. Restyle only |
| 1410 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1425 | button "{headerToggleLabel}" | Salesforce | `lightning-input type="toggle"` (Header on/off). Looks like a switch instead of a pressed button |
| 1443 | input (text) | Salesforce | `lightning-input` |
| 1451 | button "Clear" | Salesforce | `lightning-button variant="base"` |
| 1463 | icon button (.{dyn}) | Keep | Icon grid: no Salesforce component for this. Restyle only |
| 1500 | button "{collapsibleLabel}" | Salesforce | `lightning-input type="toggle"` (Collapsible on/off). Looks like a switch instead of a pressed button |
| 1511 | button "{collapsedDefaultLabel}" | Salesforce | `lightning-input type="toggle"` (Starts collapsed on/off). Looks like a switch instead of a pressed button |
| 1549 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 1571 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |

### `finalRecordLinkPanel` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 81 | input (text) | Keep | Invitation link box: when copying is blocked it selects its text; `lightning-input` can't (owner: keep, 2026-11-02). Restyle only |

### `finalRelationshipPicker` (1 salesforce, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 32 | button "{r.childObjectLabel} / {r.via}" | Keep | Relationship option in a result list: no Salesforce component for this. Restyle only |
| 49 | button "Cancel" | Salesforce | `lightning-button` |

### `finalRuleEditor` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 218 | input (datetime-local) | Keep | Saved rule format and time zone (owner: keep after step 0). Restyle only |

### `finalStudioActionDialog` (1 salesforce, 2 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 3 | icon button (.action-backdrop) | Keep | Click-outside backdrop, not a visible control |
| 86 | button "Download didn't start? Copy the package" | Salesforce | `lightning-button variant="base"` |
| 101 | input (file) | Keep | Hidden file input opened by a visible button; nothing to see or style |

### `finalStudioRail` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 8 | button "{t.label} / , customized" | Keep | Already our shared rail component |

### `finalSubmissionReader` (1 salesforce)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 139 | button "{file.title}" | Salesforce | `lightning-button variant="base"` |

### `finalThemeCard` (8 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 41 | button "Submit" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 71 | button "Continue" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 118 | button "Continue" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 150 | button "Next" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 191 | button "Submit" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 224 | button "Next" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 254 | button "Continue" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |
| 293 | button "Submit" | Keep | Specimen: a sample of the respondent button inside a theme card (not clickable) |

### `finalThemeEditor` (14 salesforce, 1 our shared component, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 17 | input (text) | Salesforce | `lightning-input` |
| 40 | button "{o.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 61 | button "Recalculate" | Salesforce | `lightning-button` |
| 68 | button "Keep as saved" | Salesforce | `lightning-button` |
| 90 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 146 | button "Make see-through" | Salesforce | `lightning-button variant="base"` |
| 157 | button "{c.flagText} / {c.flagWhere}. Go to Fix f" | Keep | Readability warning row that jumps to its fix: no Salesforce component for this. Restyle only |
| 175 | button "Use calculated" | Salesforce | `lightning-button variant="base"` |
| 252 | button "{c.solidVerb}" | Salesforce | `lightning-button` |
| 261 | button "Add a gradient" | Salesforce | `lightning-button` |
| 306 | button "Use calculated" | Salesforce | `lightning-button variant="base"` |
| 323 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 345 | button "Use calculated" | Salesforce | `lightning-button variant="base"` |
| 358 | input (checkbox) | Salesforce | `lightning-input type="checkbox"` |
| 400 | button "Fix for me" | Salesforce | `lightning-button` |
| 461 | button "Save as new" | Salesforce | `lightning-button` |

### `finalThemeGallery` (1 our shared component, 1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 7 | button "{l.label}" | Ours (shared) | `finalButtonGroup` (our segmented group; owner: every button group uses it) |
| 48 | icon button (.{dyn}) | Keep | Theme cards (radio): no Salesforce component for this. Restyle only |

### `finalTypeahead` (1 keep)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 5 | input (text) | Keep | The picker's own search box (custom combobox: arrow keys, active option) |

### `finalValidationEditor` (9 salesforce)

| Line | Today | Becomes | Notes |
|---|---|---|---|
| 13 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 29 | button "×" | Salesforce | `lightning-button-icon` (utility:close) |
| 42 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 52 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 66 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 76 | input (number) | Salesforce | `lightning-input type="number"` with `oncommit` (saves on blur/Enter, as today) |
| 89 | select | Salesforce | `lightning-combobox` (options become a list in JS; opens a popup instead of the browser list) |
| 109 | input (text) | Salesforce | `lightning-input` with `oncommit` (saves on blur/Enter, as today) |
| 122 | button "+ Add check" | Salesforce | `lightning-button variant="base"` |
