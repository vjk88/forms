# IMPL PLAN: Appearance picker for choice fields (DEFERRED 36)

Status: BUILT 2026-10-31 on `feat/appearance-picker`, deployed to the dev org and checked on the Studio host. Revision 2 (2026-10-31): the owner's second image (full inspector,
no Advanced section) + review findings on revision 1.
Bug it closes: `qa/OWNER_ISSUES_2026-10-11.md` item 36 / DEFERRED 36.

Owner rulings (chat, 2026-10-31):
- Build **exactly the image's layout**. No "Advanced" section.
- "Allow several answers" is a switch under the tiles (text fields with their own options).
- A new picklist question starts on **Default to schema**.
- **Default to schema** on a picklist = **our themed dropdown showing the field's choices and labels
  exactly as Salesforce has them**: no emoji, no renamed labels. (Not the platform's own
  `lightning-input-field`: that would ignore the theme and change every existing picklist.)

## 1. In plain words

Today a choice field has two settings that fight: **Display as** (Default / Dropdown / Radio
buttons / Checkbox group) and **Choice look** (List / Chips / Cards, shown only for radio or
checkbox). Pick Chips, then change Display as to Dropdown: the form still shows chips and the Choice
look row disappears, so the author can't undo it.

Also today, on a picklist, **Default and Dropdown draw the same thing** (`finalElementRenderer.js`
`isDropdown`: Default + picklist goes down the dropdown path, using the copied options, emoji
included). So "Default to schema" means nothing different yet.

After this change: **one picker called Appearance** (tiles, as in the image), and each tile draws
something different:

| Tile              | Picklist field draws                                        | Text field draws                  |
| ----------------- | ----------------------------------------------------------- | --------------------------------- |
| Default to schema | our dropdown, Salesforce's choices + labels, no emoji       | a plain text box (no options)     |
| Dropdown          | our dropdown, **your** labels + emoji                       | same                              |
| Radio list        | radio buttons, your labels + emoji                          | same (Checkboxes if several)      |
| Chips             | pills, your labels + emoji + sublabel                       | same, several allowed if switched |
| Cards             | cards, your labels + emoji + sublabel                       | same, several allowed if switched |

## 2. The inspector, top to bottom (as in the image)

1. **Label**.
2. **Appearance**: full-width "Default to schema" card (mini dropdown drawing, title, one-line
   description, tick when chosen), then a 2 × 2 grid: Dropdown, Radio list, Chips, Cards, each with
   its little drawing. Only on choice fields (text, text area, picklist). Description on the Default
   card: picklist "Uses this field's choices and labels from Salesforce."; text field "A plain text
   box."
3. **Allow several answers** switch, under the tiles: text / text area only, only when the look is
   not Default. Greyed on Dropdown with "A dropdown takes one answer." On Radio list, turning it on
   renames that tile **Checkboxes** and draws squares. Never on picklists (Salesforce decides).
4. **Options**: rows of ⋮⋮ handle · **Emoji** · **Label** · **Value** · ×, then **＋ Add option**.
   Sublabel line under each row on Chips and Cards (as today). "Allow 'Other…' with free text"
   switch under Add option (Radio list / Chips / Cards, as today).
   - Under **Default to schema** on a picklist the table shows **Salesforce's** choices, read-only
     and greyed (no handle, no ×, no Add option), with one line: "These are this field's choices in
     Salesforce. Pick another look to rename them or add emoji." Nothing the author typed is lost:
     their own rows come back when they pick another tile.
   - Under Default on a text field: no Options section (a text box has none).
5. **Rules**: **Required** and **Read only** switches (replace today's Behavior three-way control).
   Turning one on turns the other off. Same saved props (`required`, `readOnly`). Every field.
6. **Text & guidance** (heading): **Help text** (ⓘ), **Caption**, **Show caption as** (Caption
   line | Help bubble), **Placeholder**. Same controls and props as today, under one heading.
7. Width and Block style: unchanged, where they show today (multi-column sections / standalone
   blocks). Not in the image because the image's section has one column.
8. **Checks**: unchanged (`c-final-validation-editor`).
9. **Visibility**: unchanged ("Always shown" + Add conditions).

Field types without tiles (checkbox → Toggle, number → Slider, lookup → Search with filters) keep
today's **Display as** dropdown in the Appearance spot, and their own settings (slider range, value
display, end labels, lookup object, lookup results) stay right under it, as today. Tiles for them
are a later change.

Deleted: the "Choice look" row and its explainer text ("Display as picks the control ...").

## 3. Data

### 3a. The look: same two keys as today, always written together

| Tile + switch           | `renderAs`       | `optionStyle` |
| ----------------------- | ---------------- | ------------- |
| Default to schema       | `Default`        | removed       |
| Dropdown                | `Dropdown`       | removed       |
| Radio list              | `Radio_Buttons`  | removed       |
| Checkboxes (switch on)  | `Checkbox_Group` | removed       |
| Chips                   | `Radio_Buttons`  | `chips`       |
| Chips, several          | `Checkbox_Group` | `chips`       |
| Cards                   | `Radio_Buttons`  | `cards`       |
| Cards, several          | `Checkbox_Group` | `cards`       |

Apex decides "one answer or several" from `renderAs` (`FinalSubmitService.cls:1301`,
`FinalPublishWarnings.cls:459`), as do Autofill (`finalAutofillFit.js:35`) and the preview session
(`previewSession.js:24`). Same keys = no Apex, submit or Autofill change.

### 3b. Salesforce's choices: one new key, `config.schemaOptions`

`[{ value, label }]`, the field's active picklist values from describe. Kept apart from
`config.options` (the author's rows), so switching tiles never overwrites anybody's work.

- **Written** when a picklist is dropped on the canvas (`finalFormStudio.js` ~1898 already copies
  `field.options`; it now also writes `schemaOptions` and `renderAs: 'Default'`), and again, fresh
  from describe, whenever the author clicks the Default tile.
- **Read** by the renderer for a picklist whose look is Default: `schemaOptions` labels, no emoji,
  no sublabel. Old forms without `schemaOptions`: fall back to `options` with emoji and sublabel
  dropped. (Under Default the table was hidden until now, so those rows are almost always the
  untouched describe copy.)
- Dropdown / Radio list / Chips / Cards keep reading `options`.
- Apex doesn't read it. Submit stores values, and both lists hold the same Salesforce values.

Known limit, same as today: a value added in Salesforce after the field was dropped shows up only
after the author clicks Default again (or re-adds the field).

### 3c. New picklists start on Default, explicitly

`renderAs: 'Default'` is saved at drop time (3b), so a form-level default (below) can never quietly
turn a new picklist into something else.

## 4. One shared rule, including the form-level default

New pure module **`c/finalChoiceLook`** (no DOM):

- `lookOf(cfg, formDefault)` → `{ look, multi }`. The effective `renderAs` is resolved exactly as
  the renderer does: the field's own `renderAs`, else the form's default for that field type
  (`spec.settings.fieldDefaults[inputType]`, what the viewer stamps as `renderDefault`), else
  `Default`. Then: chips/cards when `optionStyle` is chips|cards **and** there are options (today's
  `isChipChoice`); otherwise from the effective `renderAs`. `multi` = `Checkbox_Group` |
  `Custom_MultiSelect`.
- `configFor(look, multi)` → the `{ renderAs, optionStyle }` patch from 3a (`multi` forced off for
  Dropdown and Default).
- `optionsFor(cfg, look)` → `schemaOptions` (or the fallback) for a Default picklist, else `options`.

Used by:
- `finalElementRenderer`: `isChipChoice`, `isCardStyle`, `isDropdown` and the options getter go
  through it, passing `el.renderDefault`.
- `finalPropertyPanel`: which tile is on (gets the form default as a new `@api fieldDefaults` from
  `finalFormStudio`, which reads `spec.settings.fieldDefaults`), what a click writes, what the table
  shows.

Note: nothing in today's code *writes* `settings.fieldDefaults` (only the viewer reads it), but specs
in the org may carry it, so the resolver honours it.

The panel shows **what respondents see**, never just the last click. A stuck form (`Dropdown` +
`chips`) opens with **Chips** on, because that's what it draws; one click on Dropdown really makes it
a dropdown. `Custom_MultiSelect` (old) reads as Checkboxes.

## 5. Visible changes on existing published forms

Only one, and it's the point of the owner's ruling: a **picklist left on Default** that has emoji or
renamed labels in its copied options will now show Salesforce's plain labels. Every other form looks
the same until its author picks a tile. Before merging I list the affected forms in the dev org
(query: picklist fields with `renderAs` Default/blank whose `options` differ from their
`schemaOptions`/describe or carry emoji) and name them in the PR.

## 6. Reordering options (the ⋮⋮ handle)

The handle in the image means "grab this to move the option up or down". **Today options can't be
reordered at all**, so this is new:

- **Mouse**: drag a row by its handle, drop between rows. A line shows where it will land.
  Same pattern as the Studio's own drag and drop (capture-phase gatekeeper; no toasts).
- **Keyboard**: the handle is a button ("Move Electrical"). With it focused, ↑ / ↓ moves the row one
  place; a screen-reader message says "Electrical, position 2 of 4".
- The whole option moves: label, value, emoji and sublabel together (one object in
  `config.options`), via one `_config({ options })` write, so undo works as for any other edit.
- The order is the order respondents see. Values don't change, so saved answers and Autofill are
  unaffected.
- No handle on the read-only Salesforce list under Default (Salesforce owns that order).

## 7. Keyboard and screen readers

- Tiles: one `role="radiogroup"` labelled "Appearance", each tile `role="radio"` + `aria-checked`,
  arrow keys move and pick, Tab enters once (roving tabindex). Listeners in the template
  (`onkeydown`), never in the constructor (LWS gotcha).
- Selected tile = 2px border + tint + tick; the border passes 3:1 against the panel.
- Rules and the several-answers switch: `lightning-input type="toggle"`.
- Read-only Salesforce list: plain text in a list, not disabled inputs.

## 8. Files

| File                                                     | Change                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lwc/finalChoiceLook/` (new)                             | `lookOf`, `configFor`, `optionsFor`                                                                         |
| `lwc/finalPropertyPanel/*`                               | Appearance tiles, switch, options table (read-only Default list, reorder), Rules switches, Text & guidance heading; delete Choice look |
| `lwc/finalElementRenderer/finalElementRenderer.js`       | look + options through `finalChoiceLook`; Default picklist shows Salesforce labels                         |
| `lwc/finalFormStudio/finalFormStudio.js`                 | drop writes `schemaOptions` + `renderAs: 'Default'`; Default click refreshes `schemaOptions`; passes `fieldDefaults` to the panel |
| `docs/FinalDesign/specs/BUILDER_SURFACES.md` §2          | describe the new inspector                                                                                  |
| `docs/FinalDesign/DEFERRED.md` row 36                    | mark done with the PR                                                                                       |

No Apex, objects, fields or permissions.

## 9. Tests and checks

Jest:
- `finalChoiceLook`: every row of 3a both ways; the form default is honoured (field blank + form
  default Radio_Buttons → Radio list on); field's own Default beats a form default; stuck spec
  (`Dropdown` + `chips`) reads Chips; `Custom_MultiSelect` reads Checkboxes; `optionsFor` returns
  `schemaOptions`, then the emoji-stripped fallback, for a Default picklist and `options` otherwise.
- Renderer: **Default vs Dropdown on the same picklist with emoji + renamed labels**: Default shows
  "Electrical" from `schemaOptions`, Dropdown shows "⚡ Power"; Default text field = text box;
  existing chips/cards/radio/checkbox tests pass unchanged (one left untouched on purpose).
- Panel: tiles only on text/textarea/picklist; a click writes both keys; **bug 36 regression**
  (Chips → Dropdown leaves no `optionStyle`); switch hidden on picklist and on Default, greyed on
  Dropdown; Radio list → Checkboxes; Default picklist shows the read-only Salesforce list and keeps
  the author's rows for later; Required on turns Read only off and back; Text & guidance holds help,
  caption, show-caption-as, placeholder; no "Advanced" anywhere.
- Reorder: drag and ↑/↓ both move label + value + emoji + sublabel together; first row can't go up,
  last can't go down; announcement text; no handle on the read-only list.
- Studio drop: a new picklist gets `renderAs: 'Default'` + `schemaOptions`.

Real org (deploy, measure, per the house rules):
- Studio host `/apex/FinalStudio`: every tile on a picklist and a text field; switch; reorder by
  mouse and keyboard; undo the stuck state on a copy of a stuck form; panel at its narrowest and at
  390px.
- LEX record page + public site (after the pre-authorized site publish): an untouched chips form
  looks as before; a Default picklist shows Salesforce labels.
- Owner gets the numbered click-by-click test sheet with screenshots.

## 10. Not in this change

- Tiles for Toggle / Slider / lookup (they keep the Display as dropdown).
- Multi-select picklist fields (they have no Display as today; unchanged).
- Locking the Value boxes on picklists (editable as in the image and as today).
- Refreshing `schemaOptions` automatically when Salesforce's values change.
- The caption under the image's preview ("Default to schema · Salesforce picklist"): the Studio
  canvas shows the whole form, not one field.

## 11. Order of work

1. `finalChoiceLook` + tests.
2. Renderer through it; Default picklist on Salesforce labels; tests.
3. Studio drop writes `schemaOptions` + `renderAs`; panel gets `fieldDefaults`.
4. Panel: Appearance, switch, options table (read-only Default list, reorder), Rules, Text &
   guidance; tests.
5. List affected forms (section 5), deploy, measure on three hosts, site publish, test sheet.
6. One PR on its own branch; `uiux-flow-reviewer` before merge.
