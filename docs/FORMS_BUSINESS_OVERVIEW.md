# Native Forms — Business & Feature Overview

**Product:** Native Forms & Surveys for Salesforce
**This document:** The **Forms** half of the product — what it is, every feature, how each one works (including the validations and the design thinking behind them), and what is still on the roadmap.
**Companion documents:** `SURVEYS_BUSINESS_OVERVIEW.md`, `PRODUCT_ROADMAP_IMPROVEMENTS.md`
**Status legend:** ✅ Built & deployed · 🟡 Partially built · ⛔ Not yet built (called out inline)

---

## 1. What this is, in one paragraph

A **100% native Salesforce** form builder and runtime. Admins design data-entry forms with a drag-and-drop builder, and end users fill them out in a runtime "player" that reads and writes **real Salesforce records** using the platform's own data layer. There is **no external service, no iframe, no third-party data processor**. Everything — the design, the rendering, the saving — happens inside the customer's Salesforce org, governed by their sharing rules, field-level security, and validation rules. The product is built to ship as a **managed package (2GP) on the AppExchange**.

## 2. Why this is a genuinely good product

| Differentiator | Why it matters |
|---|---|
| **No data ever leaves Salesforce** | Competing form tools (Typeform, JotForm, FormAssembly, etc.) post your data to *their* servers and then sync it back. Here, a form writes straight to the SObject via the platform's `lightning-record-edit-form`. Your data is never in a third party's hands — a major security, compliance (GDPR/HIPAA), and procurement advantage. |
| **It respects your security model automatically** | Because it renders with native components and runs Apex `WITH USER_MODE` / `as user` DML, every form inherits the running user's object permissions, field-level security, validation rules, and automation (flows, triggers) **for free**. There is no second permission model to maintain. |
| **No new field for every question** | A Form maps to fields that already exist on your object. You are not duplicating your data model into a form tool. |
| **Versioned & governed** | Forms are versioned (Draft → Published → Archived) with a hard guarantee of one live version at a time — safe to iterate without breaking what's in production. |
| **Admin-friendly, not developer-only** | Conditional logic uses the same declarative rule builder admins already know from Lightning record pages — pick a field, an operator, a value. No formula syntax required. |
| **Themeable & consistent** | A single design-token system keeps the whole app visually consistent and ready for per-form theming. |

## 3. The core idea: a Form is always bound to an object

The single most important product decision: **a Form is always built on top of a Salesforce object** (the "Primary Object"). When someone submits the form, a real record is created or updated on that object.

- *"What about a generic form that isn't tied to an object?"* — By definition, that's a **Survey** (see the Surveys document). Surveys store free-form answers in a generic answer store. Keeping this line bright removes a whole axis of confusing configuration: **storage is implied by type**, never asked. A Form always writes to its object; a Survey always writes to the answer store.

This decision is what lets the form use `lightning-record-edit-form` and inherit all native behavior. It is the source of most of the product's advantages.

---

## 4. Architecture at a glance

**Data model (relational schema):**
```
Form__c                      the form definition (name, primary object, type, status, allowed adapters)
 └─ Form_Version__c          a versioned snapshot (Draft / Published), holds the Layout_Config__c JSON
     └─ Form_Page__c         a page within a multi-page form
         └─ Form_Section__c  a section (a group of elements; can be a related-list repeater)
             └─ Form_Element__c   a single element (an object field, or a display block)
```
Plus `Element_Lookup_Mapping__c` (field-mapping escape hatch) and, for surveys, `Form_Response__c` / `Form_Response_Answer__c`.

**How the design is actually stored:** The builder serializes the entire form design to a **single JSON document** in `Form_Version__c.Layout_Config__c` (schema v2.0: `{layoutMode, header, formSettings, pages[]}`). This JSON-first approach makes the builder fast and the design atomic to save/version. The relational `Form_Section__c` / `Form_Element__c` objects (and their validation rules) exist as a **forward-looking normalized schema** for reporting/queryability, but the live runtime reads the JSON. *(Reconciling the two is a roadmap item — see the improvements doc.)*

**Apex controllers (all security-hardened):**
- `FormDesignerController` — builder operations: list objects/fields, create form, version management, save/load layout.
- `FormPlayerController` — runtime: fetch the active/specified version's layout, user context, picklist values.
- `FormAssetController` — image uploads as Salesforce Files.
- `FormVersionTriggerHandler` — enforces the single-active-version invariant.

**Front end:** ~9 Lightning Web Components — `formDesigner` (the builder shell), `designerCanvas`, `fieldPalette`, `propertyPanel`, `fieldPreview`, `completionEditor`, `visibilityEditor`, `newFormDialog`, and `formPlayer` (the runtime).

---

## 5. Feature-by-feature

### 5.1 Form creation experience ✅

When an admin creates a new form they get a focused dialog that **only asks what's necessary, when it's necessary** (progressive disclosure).

**How it works & the design thinking:**
- **Title + locked type.** The form name, plus a read-only "Form Type" chip with a lock icon. The type (Form vs Survey) is determined by which tab you launched from, so it's shown for confidence but not editable here — one less decision.
- **Data section (type-aware).** Because storage is implied by type, there is no "where should this save?" question. A Form simply asks for its **Primary Object** ("New records are created or updated on this Salesforce object").
- **Experience section.** Two cards with icons and plain-language descriptions: **Single Page (Scrolling)** vs **Multi Page (Paginated)** — no opaque "layout mode" dropdown. Surveys get a "Recommended for surveys" badge on Multi Page.
- **Advanced — Allowed Adapters.** A checkbox grid (Internal, Public/Guest, Flow, Embedded) with a one-line description **per option** so an admin knows what each surface does. Today only "Public/Guest" changes behavior (it makes uploaded images publicly viewable); the others are a forward-looking access list.

**Validations / guard rails:**
- The **Create** button is disabled until the form has a name, and (for a Form) a Primary Object is selected.
- The Apex `createForm` re-validates server-side: *"A primary object is required for a Form,"* and confirms the object actually exists in the org before inserting. All inserts run inside a savepoint with rollback on any failure.
- The form always keeps at least the **Internal** adapter, so it can never be saved in a state where it can't render anywhere.

### 5.2 Versioning & governance ✅

Every form has versions. A version is **Draft** (editable) or **Published** (live, read-only). Statuses on the form are Draft / Published / Archived.

**How it works & the design thinking:**
- You edit a **Draft**. When ready, **Publish** flips it to active. To change a live form, you **Create Draft from Active** — it clones the published layout into a new draft so production keeps serving the old version untouched while you work.
- **Hard invariant: exactly one active version per form.** This is enforced in Apex by `FormVersionTriggerHandler` — when a version is activated, the trigger deactivates any other active version of that form, running `WITH SYSTEM_MODE` so the rule holds even if the publishing admin didn't author the older version. If the deactivation fails, it `addError`s loudly rather than silently leaving two live versions.
- Published versions are **read-only**: `saveFormLayout` refuses to write to an active version (*"Published versions are read-only. Create a new draft to edit."*).
- The version dropdown shows version numbers and status badges (Draft = warning color, Published = success color).

**Why it's good:** This is real change management — you can safely iterate a form that's already collecting data in production, with zero risk of a half-finished edit going live.

### 5.3 The builder — a three-column workspace ✅

A clean App-Builder-style layout: **left** = component/field palette, **center** = the live canvas, **right** = the property panel for whatever is selected. A top app bar carries the Forms/Surveys toggle, the form & version dropdowns, and the Save / Publish / Preview / History / Settings actions. A status strip shows the object · version · layout mode and the live save state.

### 5.4 Field palette ✅

The left panel has tabs: **Fields**, **Components**, and **Settings**.

- **Fields tab** lists the Primary Object's fields, each draggable onto the canvas, with **type-aware icons**, a **search box**, and an **"Added" tag** so you can see what's already on the form. Related-object fields appear under an expandable "Related" group when a related-list section is in play.
- **System fields are filtered out at the source.** `getObjectFields` excludes the purely-internal fields (`IsDeleted`, `SystemModstamp`) so they never appear anywhere — palette, visibility picker, or autofill — while keeping meaningful audit fields (CreatedDate, LastModifiedDate, LastActivityDate). This was a deliberate "remove the noise, keep what's useful" decision.
- **Components tab** lists display blocks (below) and, in Survey mode, the survey question types.
- **Settings tab** holds form-level settings — currently the **Navigation Style** picker for multi-page forms.

### 5.5 The canvas & sections ✅

The center is a live, editable preview of the form.

- **Form header sits at the top of the canvas** (form-level), then the page tabs, then the page's sections — matching the runtime's visual hierarchy exactly. (An earlier version had the header awkwardly *inside* the canvas while page tabs were *outside*; this was restructured so the stage reads top-to-bottom like the real form.)
- **Sections** group elements. Each section supports **1–4 column grids**, **padding** control, a **header background color**, and a **header icon** (see 5.8). Drag fields in; drop zones guide you.
- **Drag-and-drop everywhere:** add fields/components, **reorder elements within a section**, and **reorder sections**. (A subtle bug was fixed here — the HTML5 `dropEffect` has to match the `effectAllowed` or the drop is silently blocked.)
- **Nested related-list repeaters:** a section can be a "Related Child" repeater bound to a child relationship (e.g., Opportunity → Line Items), and the canvas shows *through which field* the child links to the parent. The schema supports min/max repetitions.
- **Element chips** show a compact preview (via the `fieldPreview` component) with the delete control right next to the field name and minimal padding — the result of explicit "reduce the clutter" feedback.

**Validations (relational schema):** A library of validation rules backs the normalized model — e.g., a Related-Child section *must* declare a relationship, a Parent section *cannot*, grid columns must be 1–4, min ≤ max for lengths/values/repetitions, a collapsed section must be collapsible, field elements must have a valid API name, static-text elements must have content. *(These guard the relational objects; the live builder additionally validates in the LWC layer.)*

### 5.6 Form header configuration ✅

The header is fully styleable from the property panel: **logo** (uploaded as a Salesforce File, with size control Small→XL), **title** and **subtitle** text, **title font size** and **color**, **subtitle color**, **overall font family** (8 web-safe choices), **alignment** (left/center/right), and **background color or background image**. With a background image the header overlays a scrim and switches text to white for legibility. The chosen font cascades across the whole form stage. The logo is sized so it never overflows the header (a real bug that was fixed with dedicated size classes).

### 5.7 Page layouts & navigation ✅

A form is **Single Page** or **Multi Page**. Multi-page forms choose a **Navigation Style** — **Top Navigation** (a horizontal step/progress bar) or **Side Navigation** (a vertical menu). The key design decision here: **navigation is based on Pages, not sections.** (An earlier build incorrectly drove a vertical nav from *sections*; that was removed — pages are the unit of navigation.)

- The nav-style choice lives in the builder's **Settings tab**, not buried in the creation dialog, so you can change it live and see the effect.
- **Single Page** forms are genuinely single: the lone tab is fixed as "Single Page", the add-page (+) button is hidden, and page-rename/headers are suppressed. No misleading controls.
- **Per-page button labels:** each non-last page can rename its **Next** button; the **last page** can rename its **Submit** button. Back and Next are grouped together (right-aligned) in the runtime, like a proper wizard.
- The nav style persists both into the layout JSON and onto the version record (`saveFormLayout` syncs `Layout_Mode__c`), so the builder, the record, and the player all agree.

### 5.8 Section header icons ✅

Sections can carry an SLDS icon before their title. The property panel offers a **searchable grid of ~140 curated, validated SLDS utility icons** (people, info, files, money, status, etc.). The icon name (e.g., `utility:cart`) is stored in the layout JSON — tiny, theme-aware, no assets. It renders in both the builder canvas and the published form. *(The validated icon list was built by checking candidate names against the real SLDS sprite, after discovering some guessed names like `utility:dashboard` don't exist and render blank.)* A future option to source icons from a static resource is noted in the roadmap.

### 5.9 Field elements & "Render As" controls 🟡

Every object field placed on the form has properties: an internal **label**, **UI Behavior** (None / Required / Read-Only), **help text**, **placeholder**, and a **"Render As"** override.

**Render As** lets an admin change how a field is presented without changing the field itself:
- **Picklist** → Radio Buttons or Dropdown
- **Multipicklist** → Checkbox Group or multi-select
- **Checkbox** → Toggle
- **Number/Currency/Percent** → Slider
- **Text** → Dropdown / Radio / Checkbox group (with admin-defined custom values)
- **Lookup** → Typeahead or Modal

The available "Render As" choices are **filtered by the field's data type**, and a **Custom Values editor** lets admins define or override the option set. **The builder and the live preview fully honor Render As today (✅).** ⛔ **The runtime player does not yet render the alternate controls** — it currently falls back to the native field. (The supporting Apex `getPicklistOptions` is already in place; wiring the player is the remaining work — see roadmap.)

### 5.10 Content / display blocks ✅ (builder) / 🟡 (runtime)

Beyond fields, the palette offers display blocks:

| Block | What it does | Notes |
|---|---|---|
| **Display Text** | Rich-text content shown on the form | Renders real formatted content, not a placeholder. (Earlier feedback: *"Rich Text is supposed to be display text"* — fixed.) |
| **Image** | An image shown inline | **Uploaded as a Salesforce File** (ContentVersion), made publicly viewable only when the form allows guests — no URL whitelisting, no CSP juggling. Old file auto-cleaned on replace. |
| **Callout** | A colored notice box (Info / Success / Warning / Error) with an icon | Kept as a distinct component; it becomes truly powerful once paired with conditional visibility (e.g., show a warning only when a value crosses a threshold). |
| **Spacer** | Vertical whitespace (S/M/L) | — |
| **Divider** | A horizontal rule | — |
| **File Upload** | Native file upload (in edit context) | On *create*, shows a note that upload is available after the record exists. |

These render live in the **builder canvas** today. ⛔ **Image/Callout/Spacer are not yet rendered in the runtime player** (parked with the same player pass as Render-As). Display Text, Divider, and File Upload do render at runtime.

**Tip on icons in text:** Emoji work everywhere today (header, section names, display text) with zero setup. True SLDS icons inside rich text aren't possible (the sanitizer strips them) — that's why the section-header icon picker exists.

### 5.11 Conditional visibility rules ✅ — the flagship logic feature

Sections and elements can be shown/hidden based on rules, modeled **exactly like Lightning record page component visibility** — a deliberate choice so admins use a pattern they already know, with **no formula syntax**.

**The rule builder (`visibilityEditor`):** "Show this [section/element] when [All / Any / Custom logic] of these conditions are met," with a list of condition rows. Each row is **Source → Field → Operator → Value**.

**Sources (this is richer than a basic form tool):**
| Source | What you can filter on | How it's resolved at runtime |
|---|---|---|
| **Current Record** (shows the object name, e.g. "Case") | The form's own fields | Live, from what the user has typed so far |
| **Current User** | The **entire User object** (Name, Department, Title, ManagerId, custom fields…) | Queried from the running user's record — only the referenced fields, FLS-enforced |
| **User Profile** | Profile Name | From the running user's profile |
| **Form Settings** | Layout Mode, Type, Allowed Adapters | From the form definition |

**Operators are filtered by field type** — text fields offer equals / contains / starts with…; numbers and dates add `>`, `<`, `≥`, `≤`; checkboxes get equals / not-equals. Change the field and an incompatible operator resets automatically.

**The Value control is type-aware** — a **picklist field shows a dropdown of its actual values**, a checkbox shows True/False, numbers get a number input, dates get a date picker, and Form-Settings fields show their known value sets (e.g., Single Page / Multi Page). Picklist values are fetched by **reusing** the shared `getPicklistOptions` Apex rather than duplicating logic.

**Validation — this is thorough:**
- **Every condition requires a field and a value** (when the operator needs one), with native inline errors ("Select a field", "Enter a value"). Save is blocked until complete — no more silently dropping half-filled conditions.
- **Custom logic is fully validated** as you type: only condition numbers / `AND` / `OR` / `NOT` / parentheses are allowed; every number must reference an existing condition; parentheses must balance; the expression must parse. Errors show inline and disable Save. It also requires every condition to be complete, because custom logic references **row numbers** — so the numbering the builder shows always matches what the runtime evaluates (this closed a latent bug where filtering an incomplete row would renumber the rest).

**The runtime engine (`formPlayer`):**
- Captures **live field values** via each field's `onchange`, plus seeds `$User.*`, `$Profile.*`, and `$Form.*` context at load.
- `renderedPages` re-evaluates every page/section/element's rules **reactively** on every change, hiding non-matching ones.
- **Hidden fields are automatically made non-required** so a hidden required field can never block submission.
- The **same safe parser** validates custom logic in the builder and evaluates it in the player — what validates is exactly what runs.

⛔ **Not yet:** one-level **relationship traversal** (e.g., `Account.Type` — a field on a record the form links to). This was scoped, deferred, and tied to the shared `getRecordFields` engine (it needs to fetch the related record when a lookup changes). Page-level visibility is evaluated by the engine but has **no "Edit Rules" button on pages yet** (only sections and elements).

### 5.12 Completion experience ✅

What happens after a successful submit is fully configurable in a dedicated **Completion** tab (the last tab by default).

**Two modes:**
1. **Show a completion screen** — a thank-you message (rich text), with optional **auto-redirect** (after a delay) and an optional **action button**.
2. **Toast & go** — show a "Record created/updated" toast and navigate immediately, no screen.

Both auto-redirect and the action button use a shared **destination picker**: go to **the new/updated record** or a **custom URL**. Custom URLs support `{recordId}` / `{objectApiName}` tokens resolved at runtime. Navigation uses Salesforce's `NavigationMixin`, so it resolves correctly whether the form runs in Lightning Experience or Experience Cloud. The submit button label is configurable per the last page (5.7).

### 5.13 Save, autosave & dirty tracking ✅

The builder has a **manual Save** plus a **dirty indicator**, and it **auto-saves on navigation** (switching forms, versions, or tabs) so work is never lost. The design deliberately avoids DML-on-every-keystroke — changes accumulate in the in-memory layout and persist as one atomic JSON write, which is fast and avoids governor-limit churn.

### 5.14 Preview ✅

A **Preview** action renders the in-progress draft through the real `formPlayer` (in preview mode — it simulates submit and never writes data), so what you preview is exactly what users will see.

### 5.15 The Form Player (runtime) ✅

The runtime component renders the published form for end users:
- Wraps everything in a single **`lightning-record-edit-form`**, so fields render natively, prefill from a record (edit context), enforce FLS/validation rules, and submit via the platform's own DML — no custom save code, no custom validation.
- Renders the configured **header, pages (with the chosen nav style), sections, and fields**.
- Runs the **conditional-visibility engine** (5.11) and the **completion behaviors** (5.12).
- Accepts a **record Id** for edit/prefill context and can be embedded on record pages or app pages.

### 5.16 Image storage ✅

All form images (logo, background, Image blocks) are stored as **Salesforce Files (ContentVersion)**, not base64 in the layout (which once caused a `STRING_TOO_LONG` error — the layout JSON has a 131 KB limit). When the form allows guests, a **public `ContentDistribution`** is created so unauthenticated users can see the image; otherwise it stays authenticated. MIME type and a 5 MB cap are validated on upload, and old files are deleted when replaced. *(Cleanup when an Image element is deleted from the canvas is a known follow-up.)*

### 5.17 The design-token system ✅

The entire app is styled through one set of CSS custom properties (`--c-brand`, `--c-border`, `--c-text`, etc.) defined on the root components and inherited by every child. This replaced ~200 hardcoded hex values (the brand blue alone had appeared as six different values). It makes the app visually consistent, theme-aware, and is the foundation for the planned per-form theming.

### 5.18 Security model ✅

Per a strict internal security standard applied across all Apex:
- **All SOQL runs `WITH USER_MODE`**; DML runs `as user` (or `as system` only where an invariant requires it, like the single-active-version rule).
- **Guest guards** on player endpoints (`assertAuthenticated`) — guest/public rendering is intentionally deferred to a separate, explicitly-elevated controller rather than loosening the internal one.
- **Every DML is wrapped** in try/catch with savepoint/rollback.
- Dynamic SOQL (e.g., fetching user fields for visibility) **validates field names against the object describe** and enforces FLS, preventing injection.
- A `Form_Builder_Admin` permission set grants access to every object, field, and Apex class the app creates.

---

## 6. What's NOT built yet (Forms) — honest status

| Capability | Status | Notes |
|---|---|---|
| **Render-As at runtime** | ⛔ | Builder + preview done; player still renders the native control. Supporting Apex exists. |
| **Image/Callout/Spacer at runtime** | ⛔ | Render live in the builder; parked for the same player pass. |
| **Autofill rules** (cross-object prefill; URL-param **and** lookup-element sources; "hide a lookup, use its record to fill other fields") | ⛔ | Designed in detail; scaffolding objects exist (`Element_Lookup_Mapping__c`, prefill fields). Needs the shared `getRecordFields` engine. |
| **One-level relationship visibility** (`Account.Type`) | ⛔ | Deferred to next version; rides the same `getRecordFields` engine as autofill. |
| **Formula / calculated fields** | ⛔ | Read-only display + optional client-side approximation specified, not built. |
| **Lookup field rendering for guests / create-on-the-fly** | ⛔ | Native lookup works for internal users; restricted guest lookup is specified. |
| **Guest / public adapter** | ⛔ | A separate without-sharing controller with URL prefill, behind the Public/Guest adapter flag. |
| **Page-level visibility UI** | ⛔ | Engine supports it; no "Edit Rules" button on pages yet. |
| **Form themes** (preset + full custom styling) | ⛔ | Token system is the foundation; themes = named token sets. |
| **Per-element image cleanup; edit-mode visibility seeding** | ⛔ | Known small gaps. |
| **Apex test classes** | ⛔ | Deliberately deferred until the feature set settles (required before AppExchange). |
| **Relational persistence of the design** | 🟡 | The design lives in JSON today; the normalized objects exist but aren't populated by the live builder. |

---

## 7. The bottom line for Forms

This is a form builder that a Salesforce admin can use to stand up a governed, secure, native data-entry experience in minutes — one that writes straight to their objects, honors their security and automation, supports real conditional logic with a familiar rule builder, and never sends a byte of data outside their org. The foundation (builder, versioning, native runtime, visibility engine, security) is built and deployed; the remaining work is primarily about lighting up advanced runtime rendering (Render-As, content blocks) and the cross-object data layer (autofill + relationship traversal) that several features share.
