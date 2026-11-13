# Design system (Formwork): read this before you build or change any UI

**Who this is for:** every agent and developer touching a `final*` LWC's template or CSS.
**Status:** v2, **adopted 2026-11-01**. The owner picked the **Formwork** direction with four changes
(32/8 controls, neutral grey around the preview, a two-tone editing mark, no numbered groups).
Later rulings the same day: the preview editing mark and the narrow Editor/Preview switch are **parked**
([DEFERRED.md](./DEFERRED.md) 48, 49) and the row-based structure list is dropped; options that
look different are shown as **picture tiles** wherever possible; the Appearance picker, the new-form
steps, the page switcher and the always-visible remove (×) **stay as they are** and are only restyled.
Everything below is binding, and every Studio screen follows it (the move-over plan is done and archived:
[archive/IMPL_PLAN_STUDIO_DESIGN_SCALE.md](./archive/IMPL_PLAN_STUDIO_DESIGN_SCALE.md)).
**See it:** [mocks/studio-formwork-system-mock.html](./mocks/studio-formwork-system-mock.html) shows every
rule on every Studio screen (Build, Design, Mapping, library, new form, settings, publish, narrow width)
plus a sheet of every control in every state. Its CSS uses the real token names below.
**Scope:** `final*` components only. Legacy (non-`final`) components are out of scope.
**Supersedes:** v1 of this file (it baked in an unpicked direction), `archive/DESIGN_SYSTEM_ASSESSMENT_AND_DIRECTION.md`
and `mocks/STUDIO_FORMWORK_DIRECTION.md` (the proposal this adopts).

---

## 0. The rules on one page

1. **Two systems, one wall.** Forms people fill in use `--c-*` theme tokens. The Studio uses
   `--c-studio-*`. A component reads one family, never both (§1).
2. **Every look means one thing** (§2). Tabs mean "where you are", a segmented control means "pick a
   value", solid teal means "do the main thing". Never borrow a look for a different job.
3. **Every screen is built the same way** (§3): top bar → rail → pane header → groups → rows.
4. **Never type a raw value** for font size, weight, color, radius, shadow, z-index, transition or font
   family in Studio CSS. Use a token (§4). Spacing comes from the scale, chosen by relationship.
5. **Use a pattern before you invent one** (§5). If the one you need is missing, add it here in the
   same PR, then build it.
6. **The form is the colorful thing.** Studio chrome stays neutral grey and white. Teal marks only the
   main action, the current selection and focus.
7. **13px is normal Studio text; nothing is smaller than 11px. Sentence case everywhere**, never
   `text-transform: uppercase`.
8. **Every interactive thing has all its states** (§6), and loading, empty and failed never look alike.
9. **Say what really happened** (§7): Saved, Applied, Published and Live are different words.
10. **Show, don't list.** When options differ in how something looks, show a small picture of each
    (picture tiles, 5.24) instead of a dropdown.
11. **Restyle, never redesign, what's already built.** Existing features keep their controls, control
    types, options, labels, menus, flows and behavior (§5.0). The meaning map (§2) decides **new** controls;
    it is never a reason to swap an existing one. Only the plan's approved-changes list and the component swap
    ([IMPL_PLAN_STUDIO_COMPONENT_SWAP.md](./archive/IMPL_PLAN_STUDIO_COMPONENT_SWAP.md)) may go further.
12. **Salesforce components first** (owner 2026-11-01). Buttons, icon buttons, text, number, search,
    checkbox and toggle inputs, dropdowns, sliders and text areas are `lightning-*` base
    components, styled only through their `--slds-c-*` hooks. Button groups are always our `finalButtonGroup`
    and picture tiles our `finalPictureChoice`. Hand-build a control only for what's on the swap plan's
    Keep list (cards and tiles, list rows, drag and drop, custom search lists, specimens, the top bar,
    color pickers with live recolor, the rule date & time box, grouped font dropdowns, the SOQL box, dashed add places).
13. **Done means deployed and looked at** on `/apex/FinalStudio` and the LEX tab, with a respondent
    theme switched to prove the wall held (§10).

## 1. Two systems, one wall

| | Respondent (published forms, the preview) | Studio (the builder and admin screens) |
|---|---|---|
| Tokens | `--c-*` (about 70), made only by `finalThemeEngine`, applied only at `finalPageFrame` | `--c-studio-*`, declared only in `finalStudioStyles.css` |
| Who decides the look | The form's theme | This document |
| Type sizes | `--c-fs-*` roles in `finalPageFrame.css` | `--c-studio-fs-*` roles (§4.2) |
| Full contract | [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) §3 | This document |
| Guard test | `finalPageFrame/__tests__/typeScale.test.js` | `finalStudioStyles/__tests__/studioScale.test.js` (§10) |
| Components | `finalPageFrame`, `finalFormViewer`, `finalFormHeader`, `finalSubmitBar`, `finalLayoutZones`, `finalSectionRenderer`, `finalElementRenderer`, `finalAfterSubmit`, `finalGuestHost`, `finalLookup`, `finalFormHighlight`, `finalNav*` | Everything else under `final*` |

**How the wall holds** (verified in-org 2026-09-06, PENDING_WORK §9.5): the name sets don't overlap,
and `finalPageFrame`'s wrapper resets `color` and `font-family` to theme tokens.

- A respondent component never imports `c/finalStudioStyles` or reads `--c-studio-*`.
- A Studio component never reads `--c-*` theme tokens, except inside a specimen (§8).
- The preview is the real respondent renderer. Never restyle it from Studio CSS.
- A new themeable form property follows ARCHITECTURE §6, never this document.

## 2. The meaning map (the heart of the system)

Each visual treatment means exactly one thing, everywhere. Someone who learns a look once can read
every screen.

| Treatment | Means | Rule |
|---|---|---|
| **Underlined tab** | Where you are | Use when choosing it **replaces what's below** with a different set of controls or content: new screens only; no built control uses it today. |
| **Picture tiles** | Pick a look | Use when the options **differ in how something looks** (appearance, button position, layout, progress style, tab style, density). A small drawing of each option plus a short name; a tick on the chosen one. Today's Appearance picker is the reference. |
| **Segmented control** (joined buttons, chosen one solid teal) | Pick a value | Use when choosing it **changes a value** and the content stays the same kind: preview device, Simple / Advanced design. 2–4 short options; more → a select. |
| **Solid teal button** (alone) | Do the main thing | At most **one per area** (top bar, dialog footer, page header). Everything else is secondary or quiet. |
| **Teal edge inside the item** | Selected | Rows get a 3px leading bar plus an accent-surface fill; cards get a 1px inset teal ring plus a check badge. Never shown by bold text alone. |
| **Ring outside the item** | Keyboard focus | 2px `focus` outline, 2px outside (−2px inside a scrolling bar such as tabs). Shows on top of selection; the two never replace each other. |
| **Strong grey edge** (`border-strong`) | You can type or choose here | Every input, select, textarea and secondary button. 3:1 against white. |
| **Soft line** (`border`) | Layout separator | Between panes, under headers, after group titles. Never around a control. |
| **Faint line** (`border-subtle`) | Rows inside one list | Table rows, column lanes. |
| **Dashed outline** | A place to add or drop | "Add a section", "Add a record", upload targets, drop gaps. |
| **Shadow** | It floats over the page | Menus and popovers: `shadow-2`. Dialogs and drawers: `shadow-3`. Panes and cards sit flat. |
| **Neutral grey surround** (`workspace`) | Behind the form | People judge their form's colors against it, so it is never tinted. |

**Existing controls keep their type** (owner 2026-11-01). The top bar's Build/Design switch stays a
joined pair with the current mode filled teal; it's the one solid-teal control that isn't an action.
Simple / Advanced design stays a pressed-button pair, the library's Show filter stays a select, and the
settings drawer keeps one section at a time. For a **new** control, when the case is unclear, ask: "does the content below get replaced?" Yes → tab. No → is there a look worth
drawing? Yes → picture tiles. No → segmented (2–4 short options) or a select (more, or text only).
Settings that are only strengths (Subtle / Medium / Strong) stay segmented.

## 3. Hierarchy: every screen is built the same way

```
Top bar (56px)      back · form name · [version ▾] · [Build|Design] · save status ··· undo redo · settings ▾ · [Actions ▾] · [Publish]
                    (today's top bar, unchanged except styling)
Rail (72px)         icon + 12px label per tool; selected = leading teal bar
Pane header (56px)  Title (14 strong) / optional meta line (12 weak) ········ [icon actions]
  Sub-bar (44px)    optional, for pane-level switches (e.g. Simple | Advanced design)
  Body (16px pad)   Group title (13 strong) ───────── hairline ──── [quiet action]
                      Label (13) / control (32px) / help or error (12)   ← 4px apart
                      next row                                           ← 16px apart
                    next group                                           ← 24px apart
```

- **Every pane header is 56px**, the same as the top bar, so the lines under all panes line up.
- **The inspector header stays as it is today** (the question's label as the title), restyled only.
- **Tools pane works as today:** picking a question swaps the field list (with its rail) for the
  question's inspector; "‹ Fields" goes back.
- **Group titles are plain words with a hairline**, never numbered: groups aren't steps.
- **Dialogs follow the same order:** header (16px title + meta + close), optional tab bar, body
  (24px padding), footer (help on the left, buttons on the right, primary last).
- **Pages** (library) use a 20px title with the page's one primary action on the right.

## 4. Foundations: Studio tokens

All values live in `force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.css`. Every Studio
stylesheet with native controls starts with `@import 'c/finalStudioStyles';`. Wrappers with no native
controls (for example `finalFieldPicker` around `finalTypeahead`) don't need it. Sizes are px.

### 4.1 Color (these exist today; add one only with a reason written here)

| Job | Tokens |
|---|---|
| Surfaces | `--c-studio-surface` #fff (panes, dialogs), `-surface-subtle` #f8fafc (rail, structure, table headers, dialog footers), `-workspace` #f1f5f9 (behind the preview and around the app), `-hover` #eef2f6 |
| Text | `--c-studio-text` #1f2937, `-text-weak` #526071 (help, meta; passes 4.5:1 on every Studio surface) |
| Lines | `-border-strong` #7c8999 = control edge; `-border` #dce2e9 = layout separator; `-border-subtle` #e8edf2 = rows in a list (§2) |
| Accent | `-accent` #0f766e, `-accent-hover`, `-accent-text` #115e59, `-accent-surface` #e8f5f2 (selected fill), `-on-accent` |
| Focus | `-focus`, `-focus-halo` |
| Feedback | `-error`, `-error-text`, `-error-surface`, `-error-border`; `-warning-text/-surface/-border`; `-success-text/-surface`; `-info-text/-surface` |
| Overlay | `-overlay` (modal scrim) |
| Structure | `-canvas*` tokens retire in the Build slice: the structure list uses the normal tokens above |

Pick a color by meaning, never by matching a hex.

### 4.2 Type (owner rulings: 13px base, sentence case)

| Token | Size | Role |
|---|---|---|
| `--c-studio-fs-caption` | 11px | Badges, counts. The floor. |
| `--c-studio-fs-small` | 12px | Help, meta lines, rail labels, table headers. Never an input value or a primary label. |
| `--c-studio-fs-body` | 13px | **Default.** Labels, input values, buttons, rows, menus, group titles (strong). |
| `--c-studio-fs-subhead` | 14px | Pane titles |
| `--c-studio-fs-title` | 16px | Dialog and drawer titles, empty-state headings in large areas |
| `--c-studio-fs-display` | 20px | Page titles (library, full-window creation) |

- **Weights:** `--c-studio-fw-regular` 400, `--c-studio-fw-strong` 600. Buttons and tabs are always
  strong, so selecting one never changes its width.
- **Line height:** `--c-studio-lh-tight` 1.25 (titles, one-line controls), `--c-studio-lh-body` 1.45.
- **Fonts:** `--c-studio-font` (system stack) and `--c-studio-font-mono` (API names, SOQL).
- Pick by role, never by nearest number. If navigation doesn't fit at 12px, fix the layout.

### 4.3 Space: 4px grid, chosen by relationship

`--c-studio-space-1` … `-8` = **2, 4, 8, 12, 16, 24, 32, 48** px. `--c-studio-space-lg` (24) stays as
an alias. 2 is for optical fixes and tight insets only.

| Relationship | Space |
|---|---|
| Label to its control; control to its help or error; title to its meta line | 4 |
| Icon to its label; buttons side by side; related inline controls | 8 |
| Group title to its first row | 12 |
| Between settings rows; pane padding; gaps between cards | 16 |
| Between groups; dialog padding; library page padding | 24 |
| Page gutters, empty-state breathing room | 32–48 |

### 4.4 Size, shape, depth, layers, motion

| Token | Value | Use |
|---|---|---|
| `--c-studio-control-h` | 32px | Every input, select, button, segmented track, selectable row. A minimum, never a clipping box. 44px on coarse pointers. |
| `--c-studio-bar-h` | 56px | Top bar and every pane header |
| `--c-studio-radius-sm` | 4px | Badges, small swatches, thumbnail art |
| `--c-studio-radius-md` | 8px | Controls, buttons, rows, cards, menus. Inside a padded track: `calc(md − gap)` |
| `--c-studio-radius-lg` | 12px | Dialogs, drawers, the app frame |
| `--c-studio-radius-pill` | 999px | Toggles, round markers. Never buttons. |
| `--c-studio-shadow-2` | `0 10px 24px rgb(15 23 42 / 12%)` | Menus, popovers, dropdowns |
| `--c-studio-selected-ring` / `--c-studio-selected-bar` | `0 0 0 1px` accent / `inset 3px 0 0` accent | Selected: the ring around a card, the leading bar on a row or rail tab (§2) |
| `--c-studio-shadow-3` | `0 20px 48px rgb(0 0 0 / 28%)` | Dialogs, drawers (the old `--c-studio-dialog-shadow` alias is gone) |
| `--c-studio-z-raised` / `-dropdown` / `-menu` / `-drawer` / `-action-dialog` / `-backdrop` / `-modal` / `-popover` | 2 / 20 / 30 / 1000 / 1100 / 9000 / 9001 / 9500 | Today's numbers, named. Check the real stacking context before trusting one. |
| `--c-studio-duration` / `--c-studio-ease` | 150ms / `ease` | State changes only (hover, toggle knob, width). Never focus or errors. |
| `--c-studio-drop-before` / `-drop-after` / `-drop-target` | 2px accent line above / below; 1px accent ring + 8% accent tint | Drag and drop: where an item will land, and the box it lands in. |
| `--c-studio-ring-focus` / `-ring-error` | `0 0 0 1px` focus / error | A hand-built field's edge when focused or wrong (5.3), beside its edge color. |
| `--c-studio-z-behind` | -1 | Decoration painted behind its own box (the preview stage's hatching). |
| `--c-studio-duration-long` | 1600ms | A tint that fades after a jump (the setting a Design search lands on). Nothing else. |
| `--c-studio-swatch-edge` / `--c-studio-swatch-ring` | `inset 0 0 0 1px rgb(15 23 42 / 22%)` / `0 0 0 2px` surface, `0 0 0 4px` accent | Color chips (5.27): a see-through edge that shows on any color, and the chosen chip's ring. |

Every component that animates honors `prefers-reduced-motion: reduce` (instant). The bundle carries
one shared rule; shadow DOM means it only reaches components that import the bundle.

## 5. Patterns: one recipe each

### 5.0 Kept as they are (restyle only)

These already work the way the owner wants. Migration changes their tokens (type, color, lines, corners)
and ALL CAPS text, never their controls, options, layout, flow or behavior. **Anything built that isn't in
this table follows the same rule.**

| Surface | Stays | May change |
|---|---|---|
| **Top bar** (`finalFormStudio` `st-bar`) | Everything: back, form name, version dropdown or chip, the Build/Design joined switch (current mode filled teal), save status text and Retry save, undo/redo, settings icon menu, Actions dropdown (Clone, Export, Import, Delete form), Publish with its labels, progress and error lines | Font sizes (11.5/12.5 → 12/13), weight 700 → 600, radius, borders, heights |
| **Tools pane** (`finalFieldPalette` ↔ `finalPropertyPanel`) | The swap between field list and inspector, "‹ Fields" back, the rail inside the field list, every inspector setting | Rail labels 9.5 → 12px; restyle only |
| **Preview stage toolbar** | Desktop / Tablet / Mobile, phone widths, zoom, expand | Drawn with the segmented recipe |
| **Design panel** | Simple / Advanced design pressed pair, every setting and its values | Restyle; picture tiles for settings with a look (approved, 5.24) |
| **Settings drawer** | Opened from the settings menu, one section at a time | Restyle |
| **Forms library** | Columns, Show select, text, actions | Restyle |
| **Mapping and dialogs** | Layout, steps, pickers, focus and close behavior | Restyle |
| **Appearance picker** (`finalPropertyPanel` `pp-looks`, PR 422) | Every tile, the wide default tile, grid, radiogroup keys, what each tile writes | Colors, type sizes, corner radius; it becomes the shared picture-tiles recipe (5.24) |
| **New form flow** (`finalCreationGallery`) | The steps and how each moves on: kind → layout (or template) → theme → details → Create form; cards that advance on click; the live preview on the last step | Wording (sentence case, no em dashes or arrows in labels) and restyled cards, headers, Back and Close |
| **Page switcher** (`finalBuilderCanvas` page chips) | One page shown at a time; drag a question onto a page; remove a page; add a page; the only page can't be removed | Restyled chips and × (color, size, hover) |
| **Remove (×)** on pages, sections and questions | Always visible, one click, no confirm, Undo restores, focus moves per the keyboard spec | Drawn as a quiet 24px icon button: weak grey, turns error red on hover |
| **Drag and drop, placement rules, keyboard paths** | Exactly as today ([BUILDER_KEYBOARD_SPEC.md](./specs/BUILDER_KEYBOARD_SPEC.md)) | Nothing |


Shared styling lives in the bundle as classes plus base-component hooks. Add a new LWC only when
markup **and** behavior repeat. New components stay in the `final*` family.

| # | Pattern | Contract | Used by |
|---|---|---|---|
| 5.1 | **Button** | 32px, 12px side padding, radius-md, strong 13px. **Primary**: solid accent, one per area. **Secondary**: surface + `border-strong`. **Quiet**: no edge, `accent-text`, accent-surface on hover. **Destructive**: secondary with error text and edge; solid error only inside a confirm. Icon 16px, 8px gap. Busy: spinner + label kept + that button disabled. `lightning-button` gets the same look through `--slds-c-button-*` hooks. | All |
| 5.2 | **Icon button** | 32×32 (44 on touch), no edge, weak icon, hover surface. Always an `aria-label`. | Top bar, pane headers, dialogs |
| 5.3 | **Control** | Input, select, textarea, combobox: 32px, 12px padding, `border-strong`, radius-md, body text. Invalid: error edge + error surface + message below. Disabled: subtle surface, readable text. `lightning-input` / `-combobox` / `-textarea` via `--slds-c-input-*` hooks (their native 32px already matches). | Everywhere |
| 5.4 | **Settings row** | Label above control, 4px; help or error below, 4px; rows 16px apart. A binary setting is a **toggle row**: label left, switch right. | Inspector, Design, settings drawer, theme creator |
| 5.5 | **Group** | Title (13 strong) + hairline to the right edge + optional quiet action at the end. 12px to the first row, 24px between groups. **No numbers, no boxes.** | Inspector, Design, drawers |
| 5.6 | **Tabs** | Underline 2px accent on the selected tab, `accent-text`; others weak; all strong weight. `role=tablist`, one tab stop, arrow keys move. | New screens |
| 5.7 | **Segmented (button group)** | **Always `finalButtonGroup`** (owner 2026-11-01): never hand-made, never `lightning-radio-group` buttons. **Joined buttons in one box, the chosen one filled solid teal** with white text (owner 2026-11-02: the look of the Build/Design switch and the preview toolbar). `stretch` fills the row (inspector rows). Fires `change` with `detail.value`; Tab moves between buttons. `aria-pressed`, 2–4 options, fits on one line. An option that isn't built yet is a **disabled segment plus a help line naming it** ("Table and Tiles are coming soon."), never a hidden or silently ignored choice. | Preview device, phone width, zoom, Simple / Advanced design |
| 5.8 | **Toggle** | 32×18 switch, accent when on. Label is the setting's name; no "On/Off" text unless the label is ambiguous. | Settings |
| 5.9 | **Rail** | `finalStudioRail` only. 72px wide, 20px icon over a 12px label, never smaller. Selected: accent surface + 3px leading bar, `aria-current`. | Build, Design |
| 5.10 | **Selectable row** | 32px row, icon + label, radius-md. Selected = accent surface + 3px leading bar + accent icon. | Palette, structure, mapping records, menus |
| 5.11 | **Selectable card** | Surface, `border`, radius-md; hover → `border-strong`; selected = accent edge + 1px inset accent ring + check badge top-right. Art inside is a specimen (§8). | Themes, layouts, templates, "What are you creating?" |
| 5.12 | **Add place** | Dashed `border-strong`, accent-text label with a plus. Hand-built (a `lightning-button` can't be dashed), so it is on the Keep list. Drop targets use the same outline while dragging. | Structure, mapping, uploads |
| 5.13 | **Structure pane** | Today's structure pane, restyled only (§5.0): dashed question cards with their grey bar, page chips, section headers, always-visible ×, drag and drop. Reads the shared Studio tokens (the private `--c-studio-canvas*` set is retired); section titles in sentence case. Its dashed cards are a kept exception to "dashed = add or drop". | Build |
| 5.14 | **Preview stage** | Pane header with title, device segmented, expand icon. Body on `workspace` grey, 24px padding, form sheet centered. "Test answers stay in the preview." | Build, Design |
| 5.16 | **Picker** | `finalTypeahead` is the one searchable select. Visible label; keyboard-active option looks different from the chosen one; loading, empty and error states; Escape closes the list before the dialog. | Object, field, font pickers, mapping |
| 5.17 | **Dialog / drawer** | For **new** dialogs (existing ones keep their behavior, §5.0). `finalStudioDialog` is the one shell (§3 order). Initial focus on the first field (or primary button), focus kept inside, returned to the trigger on close, Escape closes, busy state, dirty dismiss confirmed **inline** ("Discard your changes?"). Never `lightning/confirm` (it hangs in the VF Studio). Variants: standard 560, wide 1000, full window, drawer 420 from the right. | Every overlay, including creation |
| 5.18 | **Menu** | Surface, `border`, radius-md, `shadow-2`, 32px items, `role=menu`. | Settings menu, Actions |
| 5.19 | **Feedback** | **Field error**: under the control, keeps the typed value, says how to fix it. **Notice**: success (no edge), warning and failure (with edge), with an action when there is one. **Page error**: top of the area, with Retry. Toast only for things that happened off-screen. Applies to new messages; existing messages keep their wording. | All |
| 5.20 | **Loading / empty / failed** | Loading: spinner + "Loading Contact fields…" + skeleton lines. Empty: heading + one line + the action that fills it ("No conditions yet / Add a condition"). Failed: what went wrong + Retry. Three different messages, always. | Every list and panel that loads |
| 5.21 | **Data table** | Header: subtle surface, 12px strong weak text, sentence case. Rows: body, `border-subtle` between. Technical names in mono 12px weak under the friendly name. Row actions right-aligned, quiet. Long text wraps, never clips; the table scrolls sideways inside its own frame. | Library, mapping, submission reader |
| 5.22 | **Badge** | 20px tall, 4px corners, 11px. Neutral (workspace grey), on (accent surface + accent text), warning (warning surface + text: "Not finished") or success (success surface + text: "Ready"), the last two for a thing's status only (owner 2026-11-02). Sentence case ("Added", "2 columns", "Live: version 2"). | Palette, structure, library |
| 5.24 | **Picture tiles** | Shared component `finalPictureChoice` (extracted from the Appearance picker, no visual change). `role=radiogroup`, one tab stop, arrow keys move. Each tile: drawing (64×32, weak lines, accent for the part that changes) over a 13px strong name; optional 12px description; selected = accent edge + accent surface + tick badge. Grid of 2 (inspector), 3 (short sets) or auto-fill cards (large pickers like layouts and themes). Wide tiles (drawing beside a name and a description) sit side by side when each gets 240px; they also carry choices about **what something does** when a drawing explains it, like Mapping's Always create / Find or create and Use it / Update it (owner 2026-11-02). Falls back to a select above about 6 options or when an option has no look to draw (Corner rounding's 8 shapes are the exception: 4 to a row). **Design's tiles** are drawn from data (`c/finalDesignArt`: a 56×36 drawing per option; grey parts take the tile's ink, accent marks stay accent) and sit 2, 3 or 4 to a row by how many options there are. Strengths (Subtle / Medium / Strong) stay a segmented switch (`finalButtonGroup`), never pictures. | Appearance, Design dropdowns with a look (5.24 list), layouts, themes |
| 5.25 | **Plain summary** | One sentence that says what the selected thing will do, written from its current settings and rewritten as they change ("Looks for an Account that matches… If not, it creates a new one."). Box: `surface-subtle` fill, `border-subtle` edge, radius-md, 12px 16px padding, 16px weak lines icon, body text with a strong lead-in ("In plain words:"). First thing in the pane body, 24px above the first group. Neutral only: it describes, never warns (warnings are notices, 5.19). | Mapping record |
| 5.26 | **How it works** | `finalHowItWorks`: an info icon right after a dialog's title (the dialog's `heading-end` slot). Hover, keyboard focus or a click opens a small floating panel (surface, `border`, radius-md, `shadow-2`, 22rem) with up to 3 steps: 40px drawing (weak lines, accent for the part that matters) + 13px strong title over a 12px weak line. Moving away, Tab out or Escape closes it; Escape never closes the dialog. Never a strip that can be dismissed for good (owner 2026-11-04). Only for screens whose idea isn't obvious; never a substitute for clear labels. | Mapping, Autofill rule |
| 5.27 | **Color with presets** | `finalColorControl` with `presets`: label, then one grid of 28px color chips (36px targets), 8 to a row; the chosen one gets a 2px surface gap and a 2px accent ring. A preset too pale for this theme (under 3:1 on the card) stays in the grid, faded to 35% with no slash; a click or focus says why (owner 2026-11-04). Then the color box and its hex together, and how readable it is as a badge in plain words ("✓ Button labels: easy to read", "…: hard to read"); the contrast numbers are on hover, never on the badge. | Accent (Simple, Brand) |
| 5.28 | **Change status** | One line under a pane's mode switch: a neutral badge with the count ("1 change"), weak 12px words for where they are ("from the theme · 1 in Advanced design"), and the action at the end ("Reset all"). Replaces counters in tinted boxes and banners. | Design |
| 5.29 | **Group title** | A collapsible group inside a pane: chevron, 13px strong name, a hairline filling the rest of the row, and the group's own quiet "Reset" at the far end when it differs (its full name for screen readers). A titled section that doesn't collapse uses the same name + hairline. | Design (Advanced groups, Theme and layout, Accent color) |

**Where picture tiles replace dropdowns** (Design registry `type: 'select'` settings with a visible look):
image fit, corner rounding, mesh, texture, density, pane side, pane width, progress indicator (stepper and
brand pane), small-screen progress, tab style, tab alignment, rail side, button position. Stay as selects or
segmented: intensities (Subtle / Medium / Strong), glass blur, max content width, step access, flow.

## 6. States

| State | Look and behavior |
|---|---|
| Hover | Quiet surface change (`hover`, or `border-strong` on cards). Nothing moves or resizes. |
| Focus | Always visible on every surface, including selected, warning and error ones (§2). |
| Selected | Leading bar or inset ring + accent surface. Looks different from focus. |
| Disabled | Can't be used; label stays readable; say why when it isn't obvious. |
| Invalid | Error edge + error surface + message under the control that says how to fix it. Typed value kept. |
| Busy | Say what's happening; disable only that action, never the whole screen. |
| Loading / empty / failed | Three different messages and actions (5.20). |

## 7. Words

- **Sentence case** for every label, heading, button, tab, badge and menu item, in templates and JS.
- **Persistence words:** _Saved_ (draft stored), _Applied_ (dialog edits copied into the draft),
  _Published_ (a version made for respondents), _Live_ (people can reach it, as in "Live: version 3").
  Use them in new copy; never a generic "Success". Existing status text stays as it is.
- **Buttons say the outcome:** "Apply mapping", "Publish", "Create form", "Discard changes". A finished
  action is named with the same verb ("Publish" → "Published").
- **Errors say how to fix it:** "Pick a date after Nov 3, 2026", not "Invalid date". No apologies.
- **Empty states invite the next step:** "No conditions yet. This question is shown to everyone."
- Plain words over jargon; explain a technical term the first time it appears.

## 8. Specimens and other deliberate exceptions

Listed by selector, never by whole file, so the chrome around them still follows the rules.

| Exception | Where | Rule |
|---|---|---|
| Miniature form art | Thumbnails inside `finalThemeCard`, `finalLayoutCard` | Reads respondent `--c-*` on purpose. Frame, name, focus and selection follow Studio rules. |
| Font samples | Sample text in `finalFontPicker` | Uses the font it shows; caption and frame are Studio. |
| The preview | The form inside `finalPreviewStage` | Respondent system. The stage header and grey surround are Studio. |
| Submission reader answers | `finalSubmissionReader` | May use a larger reading size for answers; chrome is Studio. |
| Salesforce object icons | `finalObjectIcon` | Shows the object's own Salesforce icon and color (`getObjectInfo` `themeInfo`), or its first letter on that color when it has no tab. The color is the object's identity, so it never stands alone: a name always sits beside it (owner 2026-11-02). |

Adding an exception = one row here + a comment on the selector naming this section + the selector rule in the guard's `SPECIMENS` map (`studioScale.test.js`), which skips exactly those selectors and nothing around them.

## 9. Accessibility floor

- Text 4.5:1; control edges, large text and focus indicators 3:1, measured against the real background.
- Every action reachable by keyboard; tablists and lists use one tab stop + arrows; dialogs trap and
  return focus.
- Coarse pointers: 44px targets.
- 200% zoom and long names (form names, question labels, API names) never hide an action.
- Reduced motion honored everywhere.
- State never rides on color alone: selection has a bar or check, errors have text and an icon.

## 10. Enforcement and done

**Guard** (built in the foundations PR): `finalStudioStyles/__tests__/studioScale.test.js` scans every
`final*` stylesheet not on the respondent list and fails on: a raw font size, weight, color, radius,
shadow, z-index, font family or transition time; `text-transform: uppercase`; a `var(--c-studio-*)` the
bundle doesn't define; a self-referencing variable; a respondent token read outside a §8 selector;
bundle values that don't match §4. There is no allowlist (emptied and removed 2026-11-11): every Studio
stylesheet passes every rule. Art that draws the respondent form is a §8 specimen, skipped by selector in
the guard's `SPECIMENS` map.

**Before you merge any UI change:**
1. Full Jest suite green.
2. Deploy to `revclouddev`; look at it on `/apex/FinalStudio` **and** the LEX tab, wide and under 700px.
3. Check every state you touched (§6) and the keyboard path.
4. Switch the respondent theme in Design: the form repaints, the Studio doesn't.
5. If you added a pattern or exception, this file changed in the same PR.

## 11. Platform gotchas that bite UI work here

- **LEX leaks global CSS** for generic class names (`.stage`, `.left`). Prefix chrome classes (`st-`, `pp-`, `fp-`).
- **Parent CSS can't reach a child LWC's insides.** Use its `--slds-c-*` hooks or a custom property it reads.
- **`lightning/confirm` never settles in the VF Studio.** Use the inline confirm in `finalStudioDialog`.
- **`container-type: inline-size` on a flex or grid item collapses it.** Give it `width: 100%`.
- **`lightning-formatted-rich-text` overrides `overflow-wrap` on its host.** Set `anywhere` on the host.
- **Synthetic shadow retargets events.** Preview clicks are announced by `finalSectionRenderer`'s composed
  `elementclick`; a way back down would need a new `@api` (DEFERRED 48).
- **The public site serves a published snapshot.** A deploy doesn't reach guests until it's republished.

## 12. Where truth lives

| Subject | Authority |
|---|---|
| Studio look, patterns, states, words | **This file** (+ the mock for how it looks) |
| Respondent layouts, themes, token contract | [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) |
| Respondent type sizes | [specs/RESPONDENT_TYPE_SCALE_RECOMMENDATIONS.md](./specs/RESPONDENT_TYPE_SCALE_RECOMMENDATIONS.md) + its guard |
| Where features live | [specs/FORM_STUDIO_IA.md](./specs/FORM_STUDIO_IA.md), [specs/DESIGN_PANEL_ORGANIZATION.md](./specs/DESIGN_PANEL_ORGANIZATION.md) |
| Keyboard | [specs/BUILDER_KEYBOARD_SPEC.md](./specs/BUILDER_KEYBOARD_SPEC.md) |
| What's built / deployed | The `final*` source; dated QA evidence in [qa/](./qa/) |
| Delivery steps | `IMPL_PLAN_*.md`, archived once shipped |

A feature plan never invents a button, panel or dialog treatment. It names a pattern from §5, or adds
the missing one here first.

## Change log

- **2026-11-13 v2.15.** 5.7: an option that isn't built yet is a disabled segment plus a help line naming it (the repeating group's Display style: "Table and Tiles are coming soon."). The relationship picker gets a "Search objects" box with its empty state (5.20) and Escape order (5.16).
- **2026-11-12 v2.14.** The last two `lightning/confirm` calls are gone: Reset all (Design) and turning on Public guest access (settings drawer) ask inline (5.17): `role=alertdialog` under the trigger, focus on Cancel, Escape or Cancel returns focus. No Studio screen uses `lightning/confirm` now. The access row's toggle no longer gets cut off at the drawer edge.
- **2026-11-11 v2.13.** Locked (plan step 6): the guard has no allowlist, so a raw value or ALL CAPS anywhere in Studio CSS fails the build; `studioScaleAllowlist.json` is deleted. The move-over plan and the component swap plan are archived. All six steps are done.
- **2026-11-11 v2.12.** The screens around the Studio moved onto the system (plan step 5): forms library (data table 5.21, kind badge 5.22, Salesforce buttons and Show filter), New form (Close and Back are Salesforce buttons, How to start and Preview width are `finalButtonGroup`, the name, object and layout boxes are Salesforce controls, kind and template cards follow 5.11; no em dashes or arrows in its labels), the Studio dialogs, settings drawer, Publish (now on the Studio teal), conditions, rule, validation, Autofill and record-link panels. New tokens: `drop-before`, `drop-after`, `drop-target`, `ring-focus`, `ring-error`, `z-behind`. The `dialog-shadow` alias and the last dead `var(--c-studio-x, #hex)` fallbacks are gone. The guard's allowlist is empty. Salesforce icon buttons and button menus take the Studio focus ring and text colors too (the Actions menu and dialog Close were Salesforce blue), and sliders take the accent (VF reads `--slds-c-slider-thumb-color-foreground`).
- **2026-11-11 v2.11.** Design screen moved onto the system (plan step 4): the Design pane, theme dialog, brand inputs, gradient, image, font and color controls, galleries and cards. Hand-built buttons, dropdowns, toggles, sliders and text boxes became Salesforce ones; Simple / Advanced design, Solid / Gradient, Start from and Preview in became `finalButtonGroup`; Salesforce controls in a settings row take their label above (5.4). Theme and layout cards follow 5.11 (no lift on hover). New tokens: `duration-long`, `swatch-edge`, `swatch-ring`. The guard skips the §8 specimens by selector. Kept hand-built: the logo color swatches (color chips with a role, not a button group), color pickers, presets, font selects (groups), Design search, after-submit tiles.
- **2026-11-04 v2.10.** Owner OK on the Design pane mock: one change status line (5.28), Theme and layout as compact pictures of the form's own theme and layout, Accent as a clean 8-to-a-row grid with plain readability words (5.27), Design dropdowns with a look as drawn tiles (5.24), group titles with a hairline and their own Reset (5.29). Too-pale accent presets stay, faded, without the slash (owner ruling).
- **2026-11-04 v2.9.** Owner: How it works (5.26) is an info icon by the dialog title, not a strip that hides for good. The Autofill rule's plain summary (5.25) is one short line in the footer.
- **2026-11-02 v2.8.** Owner, for the Mapping redesign: object icons wear their Salesforce color (8); wide picture tiles also carry what-it-does choices (5.24); badges gain warning and success for status (5.22); "Add a record" stays a dashed add place (5.12).
- **2026-11-02 v2.7.** Owner: two new patterns from the Mapping mock: plain summary (5.25) and how it works strip (5.26).
- **2026-11-02 v2.6.** Owner: button groups are joined with the chosen one solid teal (5.7). A lone solid teal button is the main action; teal inside a joined group is the chosen value.
- **2026-11-01 v2.5.** Owner: swap hand-built controls to Salesforce components first, then restyle
  ([IMPL_PLAN_STUDIO_COMPONENT_SWAP.md](./archive/IMPL_PLAN_STUDIO_COMPONENT_SWAP.md)). Rule 12: Salesforce components
  first; every button group uses `finalButtonGroup`.
- **2026-11-01 v2.4.** Owner: the inspector header keeps today's contents (no type mark, no meta line).
- **2026-11-01 v2.3.** Owner: editing mark and narrow Editor/Preview switch parked (DEFERRED 48, 49);
  row-based structure list dropped, the structure pane gets a styling-only pass (5.13). Patterns 5.15 and
  5.23 and the §8 editing-mark exception removed.
- **2026-11-01 v2.2.** Owner: **styling only for everything already built.** The top bar, tools-pane swap,
  preview toolbar, Simple/Advanced design, settings drawer, library and dialogs keep their controls and
  behavior (§5.0). The meaning map governs new controls only.
- **2026-11-01 v2.1.** Owner: subtle editing mark with no label; picture tiles wherever options look
  different (new 5.24, Appearance picker is the reference); §5.0 lists surfaces kept as they are (Appearance
  picker, new-form steps, page switcher, always-visible ×).
- **2026-11-01 v2.** Adopted Formwork with the owner's four changes; added the meaning map, hierarchy,
  structure list, editing mark and narrow workspace patterns. Spacing scale dropped 6px and gained 48px.
- **2026-11-01 v1.** First merge of the scale plan and the design-system assessment (withdrawn: it
  prejudged the direction).
