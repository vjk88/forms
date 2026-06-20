# Element Properties — Inspector Spec

> **Status:** DRAFT for review (2026-06-17). This is the missing piece: the
> per-element-type property inventory. `THEME_PROPERTIES_SPEC.md` covers the
> **appearance** plane (theme / layout / header / actions / page). This doc covers
> the **content** plane — every type you can drag from the palette and the exact
> properties its inspector exposes.
>
> **Sources (reverse-engineered, so it matches what already works):**
> - `c/propertyPanel` — the legacy inspector. The functional reference for field +
>   content-element props. Legacy isn't a constraint ([[feedback-legacy-no-constraint]]);
>   the new `c/formStudio` inspector builds to **this** spec, not to that component.
> - `c/fieldPalette` + `c/formStudio` `ELEMENT_TYPES` / `_addContentBlock` — the roster
>   and the new content-block model.
> - `FormAssetController` (non-z) — the image-storage contract (§14).
> - `c/formSectionRenderer` + `HEADER_HERO_DND_SPEC.md` — how Hero renders (§11).
>
> **Storage:** every element is one entry in its section's `elements[]` inside
> `Form_Version__c.Layout_Config__c` body JSON (`THEME_PROPERTIES_SPEC.md` §8). The
> `serializeForm()` getter in `formStudio` is the writer; `flattenBody()` is the reader.

---

## 0. The two property planes (so we never duplicate)

```
CONTENT plane  (THIS doc)                    APPEARANCE plane (THEME_PROPERTIES_SPEC)
  what you drag in + how each behaves          theme · layout · header · actions · page
        │                                                │
  elements[]  +  the section/block wrapping them     formSettings · global defaults
```

- **Per-field appearance overrides** (label position/style, input style, help
  placement) live in `THEME_PROPERTIES_SPEC` §6.2 — they override a *global* default,
  so they belong with the theme. **Field behavior** (required, renderAs, options,
  visibility, prefill) lives **here** (§3).
- **Header** elements (logo / title / subtitle / highlight / surface) → `THEME_PROPERTIES_SPEC` §4.
- **Actions** (submit / next / back labels, placement, color) → `THEME_PROPERTIES_SPEC` §7.

---

## 1. The palette roster (everything that can be added)

| Group | `type` | Label | Plane | Inspector |
|---|---|---|---|---|
| Structure | `Section` | Section | container | ✓ (§13) |
| Content | `Hero` | Hero | content | ✓ (§11) |
| Content | `Rich_Text` (`Static_Text`) | Display Text | content | ✓ (§4) |
| Content | `Image` | Image | content | ✓ (§5) |
| Content | `Callout` | Callout | content | ✓ (§6) |
| Content | `Divider` | Divider | content | ✓ (§7 — no settings) |
| Content | `Spacer` | Spacer | content | ✓ (§8) |
| Content | `Consent` | Consent | content | ✓ (§9) |
| Content | `File_Upload` | File Upload | content | ✓ (§10 — note only) |
| Layout | `Empty_Space` | Empty space | grid cell | ✓ (§8.1) |
| Data | `Related_List` | Related List | repeater section | deferred (§12) |
| Fields | _(object field)_ | _field label_ | element | ✓ (§3) |

> **Placement model (updated 2026-06-17) — the drop target decides:**
> - A **field** always drops *into* a section's grid.
> - A **content element** (`Hero`/`Image`/`Callout`/`Rich_Text`/`Divider`/`Spacer`/
>   `Consent`/`File_Upload`) can drop **two** ways:
>   - **Inside a field-section** → a plain in-section element (no frame), like a field.
>   - **On the canvas / between sections** → its own **content block** (a section with
>     `contentBlock:true`) that carries a configurable **style** (Plain/Card/Boxed, §13.2).
> - **Empty space** is grid-only → it always lands **inside** a field-section.
> - Routing lives in `formStudio._placeContent` (in-section vs block); `_addContentToSection`
>   vs `_addContentBlock`.
>
> **Sizing (updated 2026-06-17):** only `FULL_WIDTH_TYPES = {Hero, Divider, Spacer}` always span
> every column. **Image / Callout / Display-Text / Consent / File-Upload / Empty_Space size by
> `colSpan` like a field** (default 1 cell, Width control when section cols > 1). In a content
> *block* the section is 1 column, so those render full-width there automatically.

---

## 2. Shared element properties (every element carries these)

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Internal key | — | auto | `id` / `key` | stable id; `serializeForm` writes `id`, engine uses `key` |
| Type | — (set on drop) | — | `type` | one of §1 |
| Order | drag-reorder | append | `order` | global monotonic; `_renumber()` keeps the contract |
| Section / block | drag | — | `sectionKey` | which section/block owns it |
| **Visibility rules** | "Edit rules" modal | none (always shown) | `visibilityExpression` | JSON `{logic:'all'\|'any'\|'custom', customLogic, rules:[{field,operator,value}]}`. Declarative multi-rule, Lightning-record-page pattern ([[project-visibility-rules]]). Operators: equals/notEqual/contains/notContains/startsWith/greaterThan/lessThan/greaterOrEqual/lessOrEqual/isNull/isNotNull. Fields support `$User.`/`$Profile.`/`$Form.` scopes. |

> Content elements render full-width; **field width/span** within section columns is
> a field concern (§3) and also an appearance override (`THEME_PROPERTIES_SPEC` §6.2).

---

## 3. Field (object-bound) — `type: 'Field'`

Inspector title: **"Field Properties"**. The richest inspector; most props are
gated by the field's schema `fieldType`.

### 3.1 Core

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Label | text | field label | `name` | display label override |
| Field API name | read-only | — | `fieldApiName` | the bound SObject field |
| Schema type | read-only | — | `fieldType` | STRING / TEXTAREA / PHONE / EMAIL / URL / BOOLEAN / CURRENCY / DOUBLE / INTEGER / PERCENT / DATE / DATETIME / PICKLIST / MULTIPICKLIST / REFERENCE |
| Behavior | select | `None` | `uiBehavior` | **None** (use field perms) / **Required** / **Read_Only** / **Hidden** (prefilled, not shown). `Required` ⇒ serialized `required:true`. |
| Help text | text | — | `helpText` | inline help |
| Placeholder | text | — | `placeholder` | input placeholder |
| **Width** | select | `1` | `colSpan` | columns the field spans, `1…N` where N = section columns (N = "Full width"). **Shown only when the section has >1 column.** Renderer maps to `slds-medium-size_{span}-of-{cols}`; stacks to 1 col on a narrow box. |

### 3.2 Render As (control swap) — gated by `fieldType`

`renderAs` default `Default` (from schema). Available options depend on type:

| `fieldType` | Allowed `renderAs` |
|---|---|
| STRING, TEXTAREA | Dropdown · Radio_Buttons · Checkbox_Group |
| PICKLIST | Radio_Buttons · Dropdown |
| MULTIPICKLIST | Checkbox_Group · Custom_MultiSelect (Dropdown-multi) |
| BOOLEAN | Toggle · Default (Checkbox) |
| DOUBLE, INTEGER, CURRENCY, PERCENT | Slider |
| REFERENCE | Lookup_Typeahead · Lookup_Modal |

### 3.3 Conditional sub-panels (shown by `renderAs` / type)

| Shows when | Property | Control | Default | Key |
|---|---|---|---|---|
| renderAs ∈ {Dropdown, Radio_Buttons, Checkbox_Group, Custom_MultiSelect} **and** type ∈ {STRING, TEXTAREA, PICKLIST, MULTIPICKLIST} | **Custom values** (label/value rows; for picklists, filter/override schema values) | repeatable rows | `[]` | `customOptionsJson` (JSON array) |
| renderAs = Slider | Min / Max / Step | number | 0 / 100 / 1 | `sliderMin` · `sliderMax` · `sliderStep` |
| type = REFERENCE | _(lookup typeahead vs modal handled by `renderAs`)_ | — | — | — |

### 3.4 Data-entry helpers

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| URL prefill param | text | — | `urlPrefillParam` | maps a URL query param → this field ([[project-guest-render-url-prefill]]) |
| Autofill | "Edit autofill" modal | none | _(autofill config)_ | fires `editautofill`; dynamic default-value rules |

---

## 4. Display Text — `type: 'Rich_Text'` (alias `Static_Text`)

Inspector title: **"Display text"**. Static formatted copy; not bound to a field.
Sizes by `colSpan` like a field (§3.1 Width) and renders with vertical padding
(`.el-text`) so it aligns with field rows inside a section.

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Text | **`lightning-input-rich-text`** | — | `content` | rich text (bold/italic/lists/links); renders via `lightning-formatted-rich-text`. Callout (§6) + Consent (§9) use the same editor. |

---

## 5. Image — `type: 'Image'`

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Image | file upload + remove | — | `imageUrl` (+ `imageVersionId`) | stored via `FormAssetController` (§14) |
| Alt text | text | — | `imageAlt` | accessibility |
| Size | select | `medium` | `imageSize` | small / medium / large / full / **fit** (`.img-fit` = fills the cell/block width, no height cap) |

---

## 6. Callout — `type: 'Callout'`

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Variant | select | `info` | `calloutVariant` | info / success / warning / error |
| Content | rich-text | — | `content` | the callout body |

---

## 7. Divider — `type: 'Divider'` *(GAP — no legacy inspector; proposed)*

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Style | segmented | `solid` | `dividerStyle` | solid / dashed / dotted |
| Thickness | select | `thin` | `dividerWeight` | thin / medium / thick |
| Color | color / "theme" | theme border | `dividerColor` | default = `--c-border` |
| Spacing | select | `medium` | `dividerSpacing` | vertical margin: small / medium / large |

> Proposal only — confirm before building. A bare divider could ship with **no**
> inspector (theme-driven hairline) if we want zero config.

---

## 8. Spacer — `type: 'Spacer'`

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Size | select | `medium` | `spacerSize` | small / medium / large (**vertical** gap, full-width) |

## 8.1 Empty space — `type: 'Empty_Space'` *(NEW 2026-06-17)*

A blank **grid cell** that occupies one or more columns to push other fields around
a multi-column section. Distinct from Spacer (which is a full-width vertical gap).
**Grid-only** — always lives inside a field-section, never a standalone block.

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Width | select | `1` | `colSpan` | `1…N` columns (N = section columns). Shown only when the section has >1 column. Same model as field width (§3.1). |

> Renders as an empty cell at ~one field's height (`.el-emptyspace`, `min-height:
> var(--c-input-height)`); invisible by design.

---

## 9. Consent — `type: 'Consent'`

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Consent text | rich-text | — | `content` | the statement (links allowed, sanitized) |
| Required | toggle | `true` | `consentRequired` | must be checked to submit |

> Submission note: a required, unchecked Consent blocks submit. The stored value is
> the boolean acceptance (where/how it persists = open item for the submission engine).

---

## 10. File Upload — `type: 'File_Upload'` *(GAP — no legacy inspector; proposed)*

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Label | text | "Attachment" | `name` | — |
| Help text | text | — | `helpText` | — |
| Required | toggle | `false` | `uiBehavior` = Required | reuse the field behavior vocab |
| Allowed types | multi-select | image+pdf+doc | `acceptedFormats` | maps to `lightning-file-upload accept` |
| Max files | number | 1 | `maxFiles` | — |
| Max size (MB) | number | 5 | `maxSizeMb` | guest uploads need a guard |

> Respondent uploads attach to the **submitted record** (not `FormAssetController` —
> that's config-only). Storage path = open item for the submission engine; flag on build.

---

## 11. Hero — `type: 'Hero'` (content block) *(NEW — no legacy inspector)*

Inline media + headline + subtext + optional CTA. **Not** a full-bleed background —
text stays legible (`HEADER_HERO_DND_SPEC.md` decision). Default on insert:
`{ headline:'Headline', subtext:'Supporting text', cta:{label:'Get started', action:'start'} }`.

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Media image | file upload + remove | — | `imageUrl` (+ `imageVersionId`) | image only in v1; via `FormAssetController` (§14) |
| Media alt | text | headline | `imageAlt` | falls back to headline, then "Hero image" |
| Headline | text | "Headline" | `headline` | — |
| Subtext | textarea | "Supporting text" | `subtext` | — |
| Show CTA | toggle | on | `cta` present | omit object to hide |
| CTA label | text | "Get started" | `cta.label` | — |
| CTA action | select | `start` | `cta.action` | `start` (scroll/begin form) / `link` (external) |
| CTA href | text (url) | `#` | `cta.href` | shown only when action = `link` |

> Render reference (`formSectionRenderer`): `heroImageAlt`, `heroHeadline`,
> `heroSubtext`, `heroHasCta`, `heroCtaLabel`, `heroCtaIsLink`, `heroCtaHref`.

---

## 12. Related List — **built 2026-06-18** (standalone repeater section)

A **standalone section** (`contextType:'Related_Child'`) bound to a child
relationship of the form's primary object; its records repeat in the runtime via
`c/formRepeater`. Added from the **Related List palette item → child-relationship
picker** (`getChildRelationships(primaryObject)` → `{relationshipName, childObject,
childObjectLabel, linkingField}`). Child fields come from the **child** object and
are added via the related section's **inspector field picker** (the left panel shows
the inspector, not the Fields list, while a section is selected).

| Property | Control | Default | Key | Notes |
|---|---|---|---|---|
| Child object | read-only | — | `childObjectApiName` | from the chosen relationship |
| Relationship | (set on add) | — | `relationshipName`, `linkingField` | child lookup back to parent |
| Display style | select | `stacked` | `displayStyle` | stacked / table / tile |
| Add-button label | text | — | `addLabel` | e.g. "Add line item" |
| Min rows | number | 0 | `minRows` | — |
| Max rows | number | 0 (∞) | `maxRows` | 0 = unlimited |
| Child fields | inspector picker | — | child-field `elements[]` | dedup per related section |

> **Storage:** `serializeForm` emits a standalone related section as a wrapper body
> section (`{id}__rlw`, `showHeader:false`, `elements:[]`) carrying one
> `relatedSections[]` entry (runtime reads `parentSObjectApi` AS the child object) with
> the child-field elements; `flattenBody` un-nests it back to a flat `Related_Child`
> section. Parent fields can't be dropped into a related section (guarded). Submit:
> `FormSubmitController` (atomic parent + children via `linkingField`). Caveat: publish
> schema-snapshot describes primary-object fields only (child fields skipped).

> Plus all standard section props (§13) and child-object fields (§3) within it.

---

## 13. Section & Content Block (containers)

### 13.1 Field-section — `type: 'section'`

A **plain container** (decision 2026-06-17): a field-section has **no border/frame
of its own** and **no style picker** — it's a titled group of fields on the page.
Framing belongs to standalone content blocks (§13.2), not sections.

| Property | Control | Default | Key | Built |
|---|---|---|---|---|
| Name | text | "New section" | `name` | ✓ |
| Columns | segmented 1–4 | 1 | `gridColumns` | ✓ |
| Show header | toggle | true | `showHeader` | ✓ |
| Header icon | icon picker (utility:* ; ~60 curated) | none | `icon` | ✓ (shown when header on) |
| **Description** | textarea | — | `description` | ✓ (renders `.sec-desc` under the title) |
| **Collapsible** | toggle | false | `collapsible` | ✓ (header toggles; body hides, stays mounted; **auto-expands on validation error**) |
| **Collapsed by default** | toggle | false | `collapsedByDefault` | ✓ (shown when collapsible) |
| ~~Section style~~ | — | — | — | **removed — now plain; framing is per content-block** |
| ~~Padding~~ | — | — | — | **moved to a GLOBAL "Spacing" control** (Design → Theme) — spacing is a theme/rhythm concern, applied to every section via `--c-section-padding` + density, not per-section. |

> Renderer: a non-`contentBlock` section always renders `sec-style-plain`
> (`formSectionRenderer.secStyleClass`), regardless of any stored `style`.

### 13.2 Content block (standalone content element)

A `Section` with `contentBlock:true, showHeader:false` holding **one** content
element (Hero/Image/Callout/Rich_Text/…). Created when a content item is dropped on
the canvas rather than inside a section. **Selecting the element shows its own props
PLUS a Block style picker** that writes the wrapping section's `style`:

| Property | Control | Default | Key | Renderer CSS |
|---|---|---|---|---|
| Block style | select | `plain` | wrapping section `style` | `.sec-style-plain` (no frame) / `.sec-style-card` (border+bg+shadow) / `.sec-style-boxed` (2px frame) |

> The same content element **inside** a field-section gets **no** Block style picker —
> it renders plain, as a regular section element (`formStudio.isSelStandaloneBlock`
> gates the picker on `_isContentBlockSection`).
>
> **Always-plain types**: Divider / Callout / Spacer never offer a Block style and
> always render `sec-style-plain`, even as a standalone block — their frame is
> meaningless. Enforced both ways: `PLAIN_ONLY_BLOCK_TYPES` excludes them from
> `isSelStandaloneBlock` (no picker) and `formSectionRenderer.secStyleClass` forces
> plain when the block's element is one of them.

---

## 14. Image storage contract — `FormAssetController` (the canonical pattern)

**Every config image** — Image element, Hero media, Header logo, Header/Page
background — uses the same controller. Confirmed source of truth
([[project-config-image-storage]]):

### 14.1 How it stores

1. LWC reads the file → base64 data-URL (`FileReader`), calls
   `uploadImage({ base64Data, fileName, formId })`.
2. Apex validates: MIME ∈ {png, jpeg, jpg, gif, webp}, size ≤ **5 MB**.
3. Stored as a **Salesforce File** — `ContentVersion`, then a `ContentDocumentLink`
   to the **parent Form** (`ShareType:'V'`, `Visibility:'AllUsers'`) so the image
   travels with the form and can be cleaned up.
4. **Public exposure is derived, not chosen:** if the Form's `Allowed_Adapters__c`
   contains `Public_Guest`, mint a `ContentDistribution` and return its
   `ContentDownloadUrl` (guest-renderable). Otherwise return the authenticated
   `/sfc/servlet.shepherd/version/download/{cvId}` (stays private).
5. Returns `{ url, contentVersionId, isPublic }`.

### 14.2 What lands in the layout JSON

Only the **URL** + the **ContentVersion Id** — **never base64**. Two keys per image
slot: a `*Url` (what renders) and a `*VersionId` (lifecycle handle).

| Slot | URL key | Version key |
|---|---|---|
| Image element | `imageUrl` | `imageVersionId` |
| Hero media | `imageUrl` | `imageVersionId` |
| Header logo | `logoUrl` | `logoVersionId` |
| Header / page background | `backgroundImage` | `backgroundVersionId` |

### 14.3 Lifecycle

- **Replace:** upload new → store new url+id → `deleteImage(prevVersionId)` (best-effort).
- **Remove:** clear both keys → `deleteImage(versionId)`.
- `deleteImage` deletes the `ContentDocument` (cascades version + any distribution);
  non-fatal — orphan cleanup never blocks the user's edit.

> LWC helper pattern (legacy `propertyPanel.uploadAndStore(file, urlProp, versionProp)`)
> is the reference; the new inspector reuses it verbatim.
>
> **Hardening TODO (carried):** record-link, cleanup on form delete, public-only-when-needed,
> validation ([[project-config-image-storage]]).

---

## 15. Serialized shape (what a section + elements looks like in `Layout_Config__c`)

```jsonc
{
  "id": "p1_s2",
  "name": "Your details",          // section title
  "sectionStyle": "card",
  "gridColumns": 2,
  "showHeader": true,
  "icon": "utility:user",
  "elements": [
    {
      "id": "e1", "type": "Field",
      "name": "Email", "fieldApiName": "Email", "fieldType": "EMAIL",
      "uiBehavior": "Required", "renderAs": "Default",
      "helpText": "We'll only use this to follow up.",
      "visibilityExpression": "{\"logic\":\"all\",\"rules\":[...]}"
    },
    {
      "id": "e2", "type": "Image",
      "imageUrl": "https://.../download/068...", "imageVersionId": "068...",
      "imageAlt": "Logo", "imageSize": "medium"
    },
    {
      "id": "e3", "type": "Consent",
      "content": "I agree to the <a href=\"...\">terms</a>.",
      "consentRequired": true
    }
  ]
}
```

A **content block** is the same shape with `"contentBlock": true, "sectionStyle":
"plain", "showHeader": false` and a single full-width element.

---

## 15b. Form-level: Autofill (prefill from a source record)

**Form-level**, not per-element. Authored in **Build → Autofill** (new rail tab) via
the all-new `c/formAutofill` (no reuse of legacy `c/autofillEditor`). Copies fields
off a *source record* into form fields. Two source types:

| Source | Trigger | Source record from |
|---|---|---|
| `lookup` | a lookup on the form is filled in | the value of that lookup field |
| `url` | page load | a record Id in a URL parameter (`?accountId=001…`) |

**Stored** on `formSettings.autofillRules` (the runtime contract) **and** mirrored in
`studioMeta.autofill` (editor reload). Rule shape:

```jsonc
{ "sourceType": "lookup",        // | "url"
  "sourceObject": "Account",     // object the source record belongs to
  "lookupField": "AccountId",    // lookup source (sourceType=lookup)
  "urlParam": "accountId",       // URL source (sourceType=url)
  "mappings": [ { "from": "Phone", "to": "Phone__c" } ] }   // source field → form field
```

**Editor Apex** (`FormStudioController`): `getLookupTargets(object)` (non-polymorphic
Reference fields → their target object), `listObjects()` (URL source-object picker).
**Runtime** (`c/formViewer`): `runAllAutofill()` on load + `runAutofillFor(values)` on
section change → `FormViewerController.getAutofillRecord(formId, object, recordId,
fields)`. Internal = `WITH USER_MODE`; **guests** delegate to
`FormViewerGuest.getGuestAutofillRecord` — hard-gated (Published + Public_Guest) and
**allow-listed**: only the object + fields the *published* rules declare are ever read
([[project-guest-render-url-prefill]]). Anti-loop: each rule remembers the last
source recordId it applied.

---

## 16. Build status & gaps (the honest list)

| # | Item | Status |
|---|---|---|
| 1 | Field inspector (§3) | legacy-complete; port to `formStudio` inspector |
| 2 | Display Text / Image / Callout / Spacer / Consent (§4–§9) | legacy-complete; port |
| 3 | Image storage (§14) | controller live; reuse pattern |
| 4 | **Divider inspector (§7)** | **GAP — confirm props or ship config-less** |
| 5 | **File Upload inspector (§10)** | **GAP — confirm + needs submission-engine storage path** |
| 6 | **Hero inspector (§11)** | **NEW — no legacy; build from this table** |
| 7 | Related List inspector (§12) | legacy-complete; port |
| 8 | Section inspector (§13) | legacy-complete; port |
| 9 | Visibility modal | swap off `z*` editor → non-z editor ([[feedback-no-z-components]]) |
| 10 | Field-dup prevention | done |
| 11 | **Autofill (§15b)** | **DONE — new `c/formAutofill` tab + guest-safe runtime apply** |

> This doc is the contract the new `formStudio` inspector builds against. Update it
> here first when a property is added/changed — single source for the content plane.
