# IMPL_PLAN_F2_AUTOFILL — Build is the one place: Mapping and Autofill in the left rail

**Status:** Draft for owner review (2026-09-25). No code until the owner says go.
**Replaces:** ruling D30 of FREEFORM_F2_MAPPING_SPEC ("Autofill moves into Data mode"). See D63 below.
**Builds on:** `archive/IMPL_PLAN_AUTOFILL_RULES.md` (today's Autofill, shipped PRs #241–#245), IMPL_PLAN_F2_SEARCH (the mapping screen, shipped PRs #332–#348).

## 1. What the owner asked for (2026-09-24/25)

1. **No Data tab.** The Studio's top bar is Build · Design again. Everything about where values come from and where they go lives in Build's left rail.
2. **Mapping is a rail icon.** The rail shows a short summary and an **Open mapping** button. The button opens today's whole mapping screen (steps and editor) in a **full-screen modal**.
3. **Autofill is a rail icon on all three form types.** The rail lists the rules. Adding or editing a rule opens it in a **large modal**.
4. **Freeform gets Autofill**, reading from:
   - the record in the personalized link;
   - a record someone picks in a lookup question;
   - records one hop away from those, such as a Contact's Account;
   - the signed-in person.
5. **Autofill fills more question types:** text, long text, email, phone, URL, **number, date and single choice**. Checkboxes and multi-choice come later.
6. **Rollout is staged.** Freeform first, proven in the org. Then Form and Survey move to the same modal, and the old editor is deleted.

## 2. Rulings this plan records (add to FREEFORM_F2_MAPPING_SPEC §2)

| #   | Ruling                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D63 | **No Data tab.** Mapping and Autofill are Build-rail icons that open modals. This replaces D30. The mode set is `build` and `design`.                                                                                                                                    |
| D64 | **Mapping opens full screen.** The rail shows a summary and **Open mapping**. The modal hosts today's `c/finalMappingEditor` unchanged in behaviour: steps on the left, the chosen step on the right, conditions on the page.                                            |
| D65 | **An Autofill rule opens in a large modal.** The rail lists the rules and keeps the personalized-link tools. The modal edits one rule as a draft: **Apply** saves it, **Cancel** drops it.                                                                               |
| D66 | **Four sources:** `link`, `lookup`, `user` (new), plus **one hop** on any of them (`from: "Account.Name"`). Never two hops. `user` never runs for guests.                                                                                                                |
| D67 | **One link object per form, as today.** A link carries one record. Other objects arrive by one hop, or by a lookup.                                                                                                                                                      |
| D68 | **Destinations are questions or fields, by answer type.** Autofill fills Text, Email, Phone, URL, Number, Date and single Choice. A value that doesn't fit (a pick-list value that isn't one of the options, text in a number question) is **left blank, never forced**. |

## 3. Decisions this plan makes that you haven't ruled on yet. Review these.

1. **Mapping modal: Done / Cancel, and Cancel asks first.**
   - As you approved, edits made in the modal count only on **Done**, and Done is one undo step.
   - Because a whole mapping is a lot of work to lose, **Cancel, Escape and the ✕ ask "Discard your mapping changes?"** before closing, but only when something changed.
   - The alternative is to save every edit as you go, like the page did, and have Done only close. Say if you prefer that.
2. **The publish dialog's Go there opens Build, then the Mapping modal** at the step and section, instead of the Data tab.
3. **The personalized-link tools stay in the rail.** Today the Autofill panel also holds Create link, Tracked link and Stop old links. They sit under the rule list, unchanged; F2.5 redesigns invitations.
4. **The signed-in person's one hop is limited to Contact, Account and Manager.** Those are the three User lookups that mean something on a form; other User lookups aren't offered.
5. **A date-time field can fill a date question** (its date part). A date-time _question_ type doesn't exist on Freeform, so nothing more.
6. **Limits stay as today:** 20 enabled rules, 50 mappings, 50 source fields read per form. One-hop paths count as fields.
7. **Form-type Autofill keeps filling bound fields.** On a Form the destination is a field element, on Survey and Freeform a question. The modal shows whichever the form has.

## 4. Slices

Each slice: own branch → PR → uiux-flow-reviewer → deploy → org check → merge.

| Slice | What ships                                                                                                              | Why here                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **A** | Data tab removed; Mapping rail icon + full-screen modal; Go there retargeted                                            | Small, no new behaviour; clears the ground               |
| **B** | New Autofill modal + rail list; **Freeform** Autofill from link and lookup; question destinations; the new answer types | The core of the feature, on the type that has none today |
| **C** | One-hop sources and the signed-in-person source (all types that use the new modal)                                      | Adds read paths; isolated server work                    |
| **D** | Form and Survey switch to the new modal; old editor deleted                                                             | Only after B/C are proven in the org                     |

## 5. Slice A — no Data tab; Mapping in the rail

### 5.1 `lwc/finalFormStudio`

- `finalFormStudio.html` lines 89–99 (the **Data** mode button): delete.
- `finalFormStudio.html` lines 299–309 (the `isData` branch with `c-final-data-mode`): delete.
- `finalFormStudio.js`: delete these, all Data-tab only:
  - `get isData`, `get showDataMode`, `get dataClass`, `get isDataPressed`;
  - `handleModeData`;
  - `mappingFocus` and its clearing in `handleModeBuild` / `handleModeDesign`.
- `_goTo(goTo)` for `mode: 'data'`:
  - switch to Build;
  - open the rail on `mapping`;
  - call the palette's `openMapping({ actionId, section })` (5.2).
- `finalFormStudio.css`: delete `.st-stagearea--data`.

### 5.2 `lwc/finalFieldPalette`

- **Rail tabs**, in `tabs` (≈ line 344):
  - Freeform: `['fields', 'blocks', 'logic', 'autofill', 'mapping']`;
  - Form and Survey: `['fields', 'blocks', 'logic', 'autofill']`.
  - Icon `mapping: 'utility:upload'` (the icon the Data tab's Mapping header used).
  - Remove the F1 comment that hid Autofill on Freeform.
- **New `isMapping` branch** in `finalFieldPalette.html` renders `c-final-mapping-summary` (new, 5.3).
- **New `@api openMapping(target)`:** sets the tab to `mapping` and calls the summary's `open(target)`.

### 5.3 New `lwc/finalMappingSummary` (rail panel)

- Props: `spec`, `formId`, `readOnly`, `isPublic`.
- **Shows:**
  - the step count, and how many are _Not finished_ (same `actionState` as the editor: `c/finalMappingModel`);
  - one line per step: its number, object and operation;
  - the **Open mapping** button (brand).
- **Empty state:** "Send answers to Salesforce records. Add a record, then choose which answer fills each of its fields." Button: **Set up mapping**.
- **`open(target)`** opens `c/finalMappingModal` (5.4), and:
  - on Done, emits `specchange { spec }`;
  - on a target, passes `focusAction = { actionId, section, n }`.
- Classes `msu-` (LEX leak rule).

### 5.4 New `lwc/finalMappingModal` (extends `LightningModal`)

- Opened with `size: 'full'`. **First task of the slice:** open it in the org and screenshot it. If `full` doesn't fill the Studio's VF page properly, use `large` and say so in the PR.
- Header: "Mapping — {form name}". Body: `c-final-mapping-editor` over a **draft copy** of the spec (`JSON.parse(JSON.stringify(spec))`). `onspecchange` replaces the draft.
- Footer: **Cancel** and **Done** (brand).
  - Done → `close({ spec: draft })`.
  - Cancel, Escape and ✕ → if the draft differs from the original, `LightningConfirm` "Discard your mapping changes?"; then `close(undefined)`.
- `focusAction` is passed through to the editor (reveal already exists, PR #348).
- Classes `mm-`.

### 5.5 Delete

- `lwc/finalDataMode/` (whole bundle, including `__tests__`). Its only host is the Studio branch removed in 5.1.

### 5.6 Tests (Jest)

- `finalFormStudio.test.js`:
  - replace the Data-tab tests (≈ line 2470 on) with: "Freeform shows no Data button"; "the rail offers Mapping on Freeform only";
  - Go there now opens Build with the rail on Mapping.
- `finalFieldPalette.test.js`: tab lists per type.
- `finalMappingSummary.test.js`: counts, empty state, Done emits `specchange`, Cancel emits nothing.
- `finalMappingModal.test.js`:
  - Done returns the draft;
  - Cancel with no change closes without asking;
  - Cancel with a change asks, and a No keeps it open.

## 6. Slice B — the Autofill modal, and Autofill on Freeform

### 6.1 Rail: `lwc/finalAutofillPanel` becomes the list

- **Keeps:**
  - the rule list (name, source, how many answers it fills, on/off, a problem line);
  - the personalized-link tools (Create link, Tracked link, Stop old links) exactly as today.
- **Loses:** the in-rail rule editor. `handleCreateRule` and edit open `c/finalAutofillRuleModal` instead, and on Apply the panel writes the rule into `settings.prefill.autofillRules` and emits `specchange`.
- **In slice B, only Freeform uses the modal.** Form and Survey keep the in-rail editor until slice D. The panel branches on `formType === 'freeform'`.
- **The `isSurvey` prop is replaced by `formType`.** The palette already passes it.

### 6.2 New `lwc/finalAutofillRuleModal` (extends `LightningModal`, `size: 'large'`)

- Takes `rule` (a draft copy, or new), `spec`, `formType`, `isPublic`.
- Returns `{ rule }` on Apply and `undefined` on Cancel.

**What the modal contains, top to bottom:**

1. **Name** (optional), and **On** (toggle).
2. **Fill from:** a segmented control (the _Choose_ segmented style from the mapping step):
   - **The record in the link:** choose its object (all types, since D67 allows only one link object per form; the second link rule is refused with a sentence);
   - **A record picked in a lookup:** choose the lookup question or field;
   - **The signed-in person:** slice C.
3. **Rows**, one per filled answer, in three columns: **Salesforce field → Question** (or **Field** on a Form) → **Show to people who aren't signed in** (link only).
   - The Salesforce field column is `c-final-field-picker` over the source object.
   - Slice C adds one-hop related fields here: the picker's related-fields mode, capped at one hop.
   - The question column lists only questions the field fits (6.4). A saved row whose question no longer fits keeps it and shows why, as in the conditions editor.
4. **When someone has already typed an answer:** "Keep what they typed" (default) or "Always replace".
5. **Test with a record:** pick a record you can see, and each row shows the value it would fill.
   - This replaces the rail's "Test in preview", which a modal would cover.
   - It uses the existing `getTestRecordValues`.

**Apply** checks the rows the same way publish will (6.5, client half):

- a row missing its field or question;
- a type that doesn't fit;
- a second link rule on a different object.
  Problems show under the control and count in the footer, as the conditions dialog does. Classes `am-`.

### 6.3 Spec shape (additive, `rulesVersion` stays 1)

```json
{
  "id": "af_x",
  "name": "",
  "enabled": true,
  "policy": "preserveEdits",
  "source": { "type": "link", "objectApiName": "Contact" },
  "mappings": [
    { "id": "afm_1", "from": "Email", "to": "el_email", "guestAllowed": true }
  ]
}
```

- **Freeform lookup rules:** `source: { "type": "lookup", "elementId": "<lookup question id>" }`. The object comes from the question's `config.referenceTo`, never from the rule.
- **Slice C:**
  - `source: { "type": "user" }`;
  - `from` may be `"Relationship.Field"`, one dot at most.

### 6.4 What fits where (answer type of the destination, via `FinalSubmitService.answerTypeOf`)

| Salesforce field type                     | Fills                 |
| ----------------------------------------- | --------------------- |
| STRING, TEXTAREA (not rich), formula text | Text                  |
| EMAIL                                     | Email, Text           |
| PHONE                                     | Phone, Text           |
| URL                                       | URL, Text             |
| DOUBLE, INTEGER, LONG, CURRENCY, PERCENT  | Number, Text          |
| DATE                                      | Date                  |
| DATETIME                                  | Date (date part)      |
| PICKLIST                                  | Choice (single), Text |

- **Not offered:** BOOLEAN, MULTIPICKLIST, REFERENCE/ID, rich text, encrypted, compound.
- **One table in Apex:** `FinalAutofillRules.fits(DisplayType, answerType)`. The modal reads it through `describeSourceFields`, which returns `fits: [...]` per field, so the browser keeps no copy of the table.
- **Form (slice D):** a field destination's answer type comes from its `config.inputType`, by the same `answerTypeOf` rules.

### 6.5 Server

- **New `classes/FinalAutofillRules.cls`:**
  - `fits(DisplayType, String answerType)`;
  - `destinationOf(spec, elementId)`, which returns `{answerType, label, options}` for a question or a field.
  - Test class `FinalAutofillRulesTest`.
- **`FinalAutofillValidator.cls`:**
  - `isCompatibleDestination` (≈ line 718) is replaced by `FinalAutofillRules`. Destinations can be questions (`type` not `field`) as well as fields.
  - A Freeform lookup rule's `elementId` must be a lookup question.
  - Only one link object per form (D67).
  - Messages follow the round-2 style: no step jargon, the rule's name, and where it's fixed.
- **`FinalAutofillController`:**
  - `describeSourceFields` gains `fits`;
  - `getLookupPlan` (≈ line 94) accepts Freeform lookup _questions_ (`config.referenceTo`) beside bound reference fields (`inspectLookups`).
- **`FinalAutofillService.resolveLinkSourceFromSpec`:** unchanged, because Freeform already takes its object from the rule (the `!isSurvey` branch).
- **`FinalStudioController.mintRecordLink`:** already works on non-Survey forms with a link rule. The org check covers Freeform. `invalidateLinks` stays Survey-only (F2.5).
- **`FinalGuestContextService`:** unchanged in B (direct fields only).

### 6.6 Runtime (browser)

- **`lwc/finalFormViewer/autofillEngine.js`:** a new pure `fitValue(value, destination)` turns the server value into the answer:
  - Number → a number, or skipped if it isn't numeric;
  - Date → `YYYY-MM-DD` (a date-time is cut to its date);
  - Choice → the option whose value or label equals it, else skipped;
  - text types → a string.
  - Skipped means _left blank and not owned_, so a later edit isn't blocked.
- **`finalFormViewer.js`** passes each destination's `{answerType, options}` from the spec. Questions and fields are both keyed by element id, which is how answers are already stored.

### 6.7 Tests

- **Jest:**
  - `autofillEngine.test.js`: `fitValue` for each type, including the "left blank" cases;
  - `finalAutofillRuleModal.test.js`: sources, rows, fits, Apply problems, Cancel;
  - `finalAutofillPanel.test.js`: Freeform opens the modal and Form keeps the in-rail editor;
  - `finalFieldPalette.test.js`: Autofill tab on Freeform.
- **Apex:**
  - `FinalAutofillRulesTest`;
  - `FinalAutofillValidatorTest`: Freeform question destinations, a lookup question source, the second-link-object refusal, a type that doesn't fit;
  - `FinalAutofillControllerTest`: the lookup plan with a lookup question, and `fits` in describe.
- **Org check:**
  1. A Freeform with a Contact link rule filling a text, a number, a date and a choice question.
  2. Mint a link and open it as a guest (publish the site first). Only the ticked fields arrive.
  3. Signed in: a lookup question on Account fills Phone and Website.

## 7. Slice C — one hop, and the signed-in person

- **Paths:**
  - `from` may be `Rel.Field`, where `Rel` is a non-polymorphic lookup on the source object, and at most one dot.
  - Checked with the same resolver mapping search uses: `FinalMappingRules.fieldAt(objectApi, path)`.
  - Author and runtime both read in USER_MODE. The guest link path reads in the fenced system mode that `FinalGuestContextService` uses today, limited to the published, `guestAllowed` fields, and the path counts as one field.
- **`FinalGuestContextService`:** the read plan accepts `Rel.Field` entries and puts them in the same single SOQL (`SELECT Email, Account.Name FROM Contact WHERE Id = :id`). Values come back under the same `from` key.
- **`user` source:**
  - **New `FinalAutofillController.getUserValues(formId, versionId)`:** refused to guests; reads the published rule's `from` fields from `User WHERE Id = :UserInfo.getUserId()` in USER_MODE.
  - One hop limited to `Contact.`, `Account.` and `Manager.`, as ruled in decision 4.
  - The validator refuses `guestAllowed: true` on a `user` rule, and the modal hides that column.
- **`finalGuestHost`:** never asks for `user` values. On a public form, a signed-in person on the internal page still gets them.
- **Tests:** a path through the validator, the guest context and the controller; `user` refused to guests; a path the person can't read is left out, not blanked, which is today's rule.

## 8. Slice D — Form and Survey move to the new modal

- `finalAutofillPanel`: remove the Freeform branch and the whole in-rail editor. Every type opens `c/finalAutofillRuleModal`.
- **Survey:** the link source's object is fixed to the connected object, shown and not choosable, as today.
- **Form:** destinations are bound field elements. The fits table applies through their `config.inputType`, so Form gains number, date and pick-list destinations too.
- **Saved rules:** a Form or Survey rule saved before this opens and saves unchanged. The shape is the same (6.3).
- **Org check:** re-run today's Autofill acceptance (PRs #241–#245) on a Form and a Survey. Link as guest, lookup signed in, keep-what-they-typed and always-replace.

## 9. Deletions ledger (each named at the slice that removes it)

| Slice | Removed                                                                                                                                                                           | What it is                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A     | `lwc/finalDataMode/` (`finalDataMode.js`, `.html`, `.css`, `.js-meta.xml`, `__tests__/finalDataMode.test.js`)                                                                     | The Data tab's page                                 |
| A     | `finalFormStudio`: `isData`, `showDataMode`, `dataClass`, `isDataPressed`, `handleModeData`, `mappingFocus`, `.st-stagearea--data`, the Data button, the `isData` template branch | Data tab wiring                                     |
| B     | `finalAutofillPanel`: `isSurvey` prop (replaced by `formType`)                                                                                                                    | Type flag                                           |
| D     | `finalAutofillPanel`: the in-rail rule editor (draft rule state, source switch, mapping rows, test-in-preview) and its template                                                   | Replaced by the modal                               |
| D     | `finalFormStudio`: `handleTestPreview`, `handleClearTestPreview`, `testRecordContext` and `ontestpreview` / `oncleartestpreview` on the palette                                   | Rail test-preview, replaced by the modal's own test |

Legacy `autofillEditor`, `formAutofill`, `zAutofillEditor` are not part of the live build and are not touched.

## 10. Out of scope

- Checkbox and multi-choice destinations, and repeating sections as destinations.
- Two-hop paths.
- A second link object per form.
- Invitations redesign (F2.5).
- `invalidateLinks` for non-Survey forms (F2.5).
- The app-wide typography pass (PENDING_WORK §4.0).
