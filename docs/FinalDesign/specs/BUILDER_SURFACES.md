# Builder Surfaces — the FormStudio port checklist

> **Status: binding contract (owner 2026-07-10).** The legacy `formStudio` Build surfaces are the
> DIRECT UI + feature reference for the FINAL builder's inspectors, blueprint canvas, and content
> roster — "copy the UI and features directly from FormBuilder, it was soooo good."
> [CANVAS_RULES.md](./CANVAS_RULES.md) holds the drop rules; THIS doc holds the surfaces those
> rules live in. Source of record: `lwc/formStudio/formStudio.html` 140–740 + `formStudio.js`.
> Owner deltas from legacy are marked **Δ**.

## 0 · Ground rules (owner rulings 2026-07-10)

- A field's **binding is fixed when it's dragged** — the inspector shows the API name read-only.
  NEVER a "pick the Salesforce field" control.
- **No per-field label position / label style** — label styling is GLOBAL (Design mode → Fields).
- **Segmented button rows over dropdowns** wherever the options fit on one row ("it's 2 clicks to
  select an option"); dropdowns only for long/variable lists.
- **Checks are for people who don't code** — preset types, never raw regex in the UI.
- **Δ No Delete button** in the inspectors (the canvas × already owns delete).
- **Δ Visibility rules keep the NEW finalRuleEditor** (declarative rows + engine lint) — do not
  port the legacy visibility editor.
- **Δ Prefill controls** (Behavior "Hidden (prefilled)", URL prefill parameter) wait for the
  Autofill slice — no dead controls.
- **Images upload from the computer** (Salesforce Files via `FormAssetController.uploadImage`,
  reused) — no URL inputs.

## 1 · Content roster (palette Blocks tab)

Legacy `ELEMENT_TYPES` minus retired Hero (splitHero's brand pane owns hero features):

| Item            | Spec `type`      | Group     | Standalone?          | Notes                                          |
| --------------- | ---------------- | --------- | -------------------- | ---------------------------------------------- |
| Display text    | `richText`       | Content   | yes                  |                                                |
| Image           | `image`          | Content   | yes                  | upload-only                                    |
| Callout         | `callout`        | Content   | yes (always plain)   |                                                |
| Divider         | `divider`        | Content   | yes (always plain)   | full-width in grids                            |
| Spacer          | `spacer`         | Content   | yes (always plain)   | full-width in grids                            |
| Consent         | `consent`        | Content   | yes                  | renders checkbox + rich text                   |
| File Upload     | `file`           | Content   | yes                  | placeholder note until the upload widget slice |
| Empty space     | `emptySpace`     | Layout    | **NO — inside-only** | grid-cell filler                               |
| Repeating Group | section `repeat` | Structure | n/a (IS a section)   | CANVAS_RULES §4                                |

**Placement / property variance:**

- `emptySpace` never lands between sections or in block wrappers (click-add → into the active
  page's last section). In a 1-column section: explainer note only. Multi-column: Width control.
- **Standalone block style** (Plain / Card / Boxed, on the wrapper section): only when standalone
  AND not Divider/Callout/Spacer (`PLAIN_ONLY_BLOCK_TYPES` — their frame is meaningless).
- **Width** (1 column … Full width, segmented): fields + sizable content (image / callout /
  richText / consent / file) + emptySpace, only inside a multi-column section. Divider / Spacer
  always span every column (`FULL_WIDTH_TYPES`).

## 2 · Field inspector

Label · Field (read-only `Object.Field`) · **Behavior** segmented (Editable / Required / Read
only; Δ Hidden waits for Autofill) · **Display as** per field type (see below) · **Options**
editor (label + value rows, ＋ Add option — only when Display as is Dropdown / Radio buttons /
Checkbox group on text/picklist types) · **Slider range** (min / max / step — when Display as =
Slider) · Help text · Placeholder · Width (multi-column only) · Checks (§4) · Visibility.

**Display as** (`config.renderAs`, default = from schema):

| Field type                  | Choices                                             |
| --------------------------- | --------------------------------------------------- |
| text / textarea             | Default · Dropdown · Radio buttons · Checkbox group |
| picklist                    | Default · Radio buttons · Dropdown                  |
| multipicklist               | Default · Checkbox group · Multi-select dropdown    |
| checkbox (boolean)          | Checkbox · Toggle                                   |
| number / currency / percent | Default · Slider                                    |

## 3 · Section inspector (never for repeaters — §5)

Title · **Columns segmented 1|2|3|4** · **Header** shown/hidden toggle · **Header icon** (curated
utility-icon grid + search + Clear; only when header shown) · Description · **Collapsible**
toggle + Default state (Expanded/Collapsed; only when collapsible) · Visibility.
(Δ No per-section style preset control — section styling is global Design-mode; the STANDALONE
block wrapper style in §1 is the exception, per legacy.)

## 4 · Checks (validation presets — `finalValidationEditor`)

Preset types (compiled to schema §7 entries; `preset` key rides along for round-trip editing):

| Preset               | Compiles to                                                  |
| -------------------- | ------------------------------------------------------------ |
| Email format         | `pattern`                                                    |
| Phone format         | `pattern`                                                    |
| Web address          | `pattern`                                                    |
| Number range         | `range` (min/max)                                            |
| Text length          | `pattern` (`^.{min,max}$`, params kept as `minLen`/`maxLen`) |
| Match another answer | `custom` (compareTo · equals)                                |

Each entry: preset select · its params · error message. `required` stays the Behavior control's
entry (schema §4 sugar). No regex input anywhere.

## 5 · Per-type content inspectors

| Type            | Properties                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Display text    | Label · rich text                                                                                                                 |
| Image           | Label · **Upload** (thumb + Replace/Remove) · Alt text · Size (Small/Medium/Large/Full width/Fit)                                 |
| Callout         | Label · Tone segmented (Info/Success/Warning/Error) · rich Message                                                                |
| Spacer          | Size segmented (Small/Medium/Large)                                                                                               |
| Consent         | Label · rich Consent text · Acceptance toggle (Required/Optional → required sugar)                                                |
| Divider         | note: no settings, theme-styled                                                                                                   |
| File upload     | Label · note (upload machinery arrives with its widget slice)                                                                     |
| Empty space     | note (1-col) / Width (multi-col)                                                                                                  |
| Repeating Group | CANVAS_RULES §4.4: Child records (ro) · Display style · Add-button label · Min rows · Max rows (0 = unlimited) · child-field list |
| Page            | Name · Visibility                                                                                                                 |

## 6 · Blueprint canvas (dark, schematic — the reference screenshots)

- Page chips row (`Page 1 · name` ×, `+ Page`).
- Sections: title as a **border tag** (top-left chip), repeat chip, delete ×, description line,
  then a **REAL column grid** (`repeat(columns, 1fr)`); elements are dashed cards (label + skeleton
  bar, content-type chips) spanning per their Width; full-width types span all; "Drop fields
  here" empty state; `+ Add section`.
- Standalone blocks: compact tagged rows between sections.
- DnD per CANVAS_RULES (gatekeeper, imperative highlights, native no-drop).

## 7 · Runtime parity (one-parser rule — whatever the inspector writes, the viewer renders)

- `finalSectionRenderer`: columns 1–4 · per-element width spans · full-width types · header icon ·
  `showHeader:false` hides the header · collapsible + default state.
- `finalElementRenderer`: `renderAs` variants (radio group / checkbox group / dropdown /
  multi-select / toggle / slider with min/max/step) · custom options · callout (tone + rich text) ·
  consent (checkbox + rich text; required = validation entry, `false` fails required) ·
  emptySpace (invisible grid filler) · image sizes · file placeholder.
