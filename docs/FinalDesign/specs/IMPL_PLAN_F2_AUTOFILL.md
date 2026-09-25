# IMPL_PLAN_F2_AUTOFILL — Build is the one place: Mapping and Autofill in the left rail

**Status:** Draft for owner review, revision 2 (2026-09-25). Revision 2 folds in the first review (§11). No code until the owner says go.
**Replaces:** ruling D30 of FREEFORM_F2_MAPPING_SPEC ("Autofill moves into Data mode"). See D63 below.
**Builds on:** `archive/IMPL_PLAN_AUTOFILL_RULES.md` (today's Autofill, shipped PRs #241–#245), IMPL_PLAN_F2_SEARCH (the mapping screen, shipped PRs #332–#348).

## 1. What the owner asked for (2026-09-24/25)

1. **No Data tab.** The Studio's top bar is Build · Design again. Everything about where values come from and where they go lives in Build's left rail.
2. **Mapping is a rail icon.** The rail shows a short summary and an **Open mapping** button. The button opens today's whole mapping screen (steps and editor) **filling the window**.
3. **Autofill is a rail icon on all three form types.** The rail lists the rules. Adding or editing a rule opens it in a **large dialog**.
4. **Freeform gets Autofill**, reading from:
   - the record in the personalized link;
   - a record someone picks in a lookup question;
   - records one hop away from those, such as a Contact's Account;
   - the signed-in person.
5. **Autofill fills more question types:** text, long text, email, phone, URL, **number, date and single choice**. Checkboxes and multi-choice come later.
6. **Rollout is staged.** Freeform first, proven in the org. Then Form and Survey move to the same dialog, and the old editor is deleted.

## 2. Rulings this plan records (add to FREEFORM_F2_MAPPING_SPEC §2)

| #   | Ruling                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D63 | **No Data tab.** Mapping and Autofill are Build-rail icons that open dialogs. This replaces D30. The Studio's modes are `build` and `design`.                                                                                                                                                                  |
| D64 | **Mapping fills the window.** The rail shows a summary and **Open mapping**. The dialog hosts today's `c/finalMappingEditor` unchanged in behaviour: steps on the left, the chosen step on the right, conditions on the page.                                                                                  |
| D65 | **An Autofill rule opens in a large dialog.** The rail lists the rules and keeps the personalized-link tools. The dialog edits one rule as a draft: **Apply** saves it, **Cancel** drops it.                                                                                                                   |
| D66 | **Four sources:** `link`, `lookup`, `user` (new), plus **one hop** on `link`, `lookup` and `user` (`from: "Account.Name"`). Never two hops. `user` runs only for signed-in people.                                                                                                                             |
| D67 | **One enabled link rule per form, as today** (`AUTOFILL_MULTIPLE_LINK_RULES`). That rule may fill many answers. Other objects arrive by one hop, or by a lookup.                                                                                                                                               |
| D68 | **Destinations are answers, by answer type.** Autofill fills Text, Email, Phone, URL, Number, Date and single Choice. A value that doesn't fit (a pick-list value that isn't an option, text in a number question) is **left blank, never forced**. Every pairing that publishes today still publishes (§6.4). |

## 3. Decisions this plan makes that you haven't ruled on yet. Review these.

1. **The two dialogs are our own, not Lightning's modal.** `lightning/modal` can't do either thing you asked for:
   - its `full` size behaves like `large` on any screen wider than 480px, so nothing fills a desktop window;
   - its Escape key and ✕ close it at once, with no chance to ask first.

   So one small component, `c/finalStudioDialog`, uses SLDS's own modal markup (`section role="dialog"`, `slds-modal`, `slds-backdrop`). It is shown **full** for Mapping and **large** for Autofill, and it owns all three ways out: Cancel, Escape and ✕.

2. **Leaving with unsaved changes asks first.**
   - Mapping: edits count only on **Done**, as you approved, and Done is one undo step.
   - Cancel, Escape or ✕ ask **"Discard your changes?"** first, but only if something changed. The Autofill dialog does the same.
3. **The publish dialog's Go there opens Build, then the Mapping dialog** at the step and section, instead of the Data tab.
4. **The personalized-link tools stay in the rail.** Today the Autofill panel also holds Create link, Tracked link and Stop old links. They sit under the rule list, unchanged; F2.5 redesigns invitations.
5. **The signed-in person's one hop is limited to Contact, Account and Manager.** Those are the three User lookups that mean something on a form.
6. **A date-time field can fill a date question** (its date part).
7. **Limits stay as today:** 20 enabled rules, 50 mappings, 50 source fields read per form. A one-hop path counts as one field.
8. **Form-type Autofill keeps filling bound fields.**
   - On a Form the destinations are the form's bound fields.
   - On a Survey or Freeform they are its unbound questions.
   - Both are `type: 'field'` elements, told apart by whether they have a `binding.field`.

## 4. Slices

Each slice: own branch → PR → uiux-flow-reviewer → deploy → org check → merge.

| Slice | What ships                                                                                               | Why here                                                 |
| ----- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **A** | Data tab removed; Mapping rail icon + window-filling dialog; Go there retargeted                         | Small, no new behaviour; clears the ground               |
| **B** | Autofill dialog + rail list; **Autofill turned on for Freeform** (link and lookup); the new answer types | The core of the feature, on the type that has none today |
| **C** | One-hop sources and the signed-in-person source                                                          | Adds read paths; isolated server work                    |
| **D** | Form and Survey switch to the new dialog; old editor deleted                                             | Only after B/C are proven in the org                     |

## 5. Slice A — no Data tab; Mapping in the rail

### 5.1 New `lwc/finalStudioDialog`

- **What it is:** SLDS modal blueprint markup, rendered inside the Studio's own template (5.2). It renders under no transformed ancestor, so `position: fixed` fills the window.
- **API:**
  - `@api size`: `'full'` (inset 1rem, fills the window) or `'large'` (the SLDS large width);
  - `@api label`;
  - `@api dirty` (Boolean);
  - named slots `body` and `footer-start`;
  - Cancel and a brand `@api confirmLabel` button, provided by the dialog.
- **Events:**
  - `confirm` (the brand button);
  - `dismiss` (Cancel, Escape or ✕), fired only after a `LightningConfirm` "Discard your changes?" passes when `dirty`.
- **Accessibility:**
  - `aria-modal="true"` and `aria-labelledby`;
  - focus moves into the dialog on open and returns to the opener on close;
  - Tab and Shift+Tab stay inside;
  - Escape is handled on the dialog (`stopPropagation`), so a combobox's own Escape still closes the combobox first.
- Classes `sd-`.
- **Acceptance gate (org, VF-hosted Studio):**
  - `full` fills the window at 1280 and 1920 px wide;
  - all three ways out (Cancel, Escape and ✕) ask when dirty and don't when clean;
  - focus returns to **Open mapping**.

### 5.2 `lwc/finalFormStudio`

- **Delete** (all Data-tab only):
  - `finalFormStudio.html` lines 89–99 (the **Data** mode button);
  - `finalFormStudio.html` lines 299–309 (the `isData` branch with `c-final-data-mode`);
  - in `finalFormStudio.js`: `get isData`, `get showDataMode`, `get dataClass`, `get isDataPressed`, `handleModeData`;
  - `.st-stagearea--data` in `finalFormStudio.css`.
- **The Studio owns the Mapping dialog:**
  - new state `mappingOpen`, `mappingDraft`, `mappingFocus`;
  - `handleOpenMapping(event)`, from the palette's `openmapping { target }`, copies the spec into `mappingDraft`, sets `mappingFocus` from the target, and sets `mappingOpen`;
  - the template renders `c-final-studio-dialog size="full" label="Mapping"`, holding `c-final-mapping-editor spec={mappingDraft} focus-action={mappingFocus}` and `dirty={mappingDirty}`;
  - `confirm`: commits `mappingDraft` through `handleSpecChange` (one undo entry) and closes;
  - `dismiss`: closes.
- **`_goTo`**, for a mapping target: switch to Build, then call `handleOpenMapping` with `{ actionId, section }`. The old `mode: 'data'` shape is kept as the dialog's target name (the publish dialog is unchanged).

### 5.3 `lwc/finalFieldPalette`

- **Rail tabs (≈ line 344):**
  - Freeform: `['fields', 'blocks', 'logic', 'mapping']`. Autofill joins it in slice B.
  - Form and Survey: unchanged, `['fields', 'blocks', 'logic', 'autofill']`.
  - Icon `mapping: 'utility:upload'`.
- **New `isMapping` branch** renders `c-final-mapping-summary`, and relays its `openmapping` event to the Studio.

### 5.4 New `lwc/finalMappingSummary` (rail panel)

- **Props:** `spec`, `readOnly`.
- **Shows:**
  - the step count, and how many are _Not finished_, using `actionState` from `c/finalMappingModel`, the same one the editor uses;
  - one line per step: its number, object and operation;
  - the brand button **Open mapping**.
- **Empty state:** "Send answers to Salesforce records. Add a record, then choose which answer fills each of its fields." Button: **Set up mapping**.
- **Emits** `openmapping { target: null }`.
- Classes `msu-`.

### 5.5 Delete

- `lwc/finalDataMode/` (the whole bundle, including `__tests__`).

### 5.6 Tests

- **Jest:**
  - `finalStudioDialog`: size classes, focus-in and return, Tab trap, all three ways out when clean and when dirty (with `LightningConfirm` mocked);
  - `finalMappingSummary`: counts, empty state, the event;
  - `finalFieldPalette`: the tab lists per type;
  - `finalFormStudio`: no Data button; Open mapping shows the dialog; Done commits one undo entry; Cancel commits nothing; Go there opens the dialog at the step.
- **Org:** the §5.1 acceptance gate, plus Go there from a real publish refusal.

## 6. Slice B — the Autofill dialog, and Autofill on Freeform

### 6.1 Rail: `lwc/finalAutofillPanel` becomes the list

- **Keeps:**
  - the rule list (name, source, how many answers it fills, on/off, a problem line);
  - the personalized-link tools (Create link, Tracked link, Stop old links) exactly as today.
- **In slice B, only Freeform opens the new dialog** (`c/finalAutofillRuleEditor` inside `c/finalStudioDialog size="large"`). Form and Survey keep the in-rail editor until slice D. The panel branches on `formType`.
- **Rule edits are drafts.** On Apply the panel writes the rule into `settings.prefill.autofillRules` and emits `specchange`.
- **`isSurvey` is replaced by `formType`,** which the palette already passes.
- **`finalFieldPalette`:** the Freeform tabs become `['fields', 'blocks', 'logic', 'autofill', 'mapping']`. Remove the F1 comment that hid Autofill.

### 6.2 New `lwc/finalAutofillRuleEditor` (the dialog's body)

- **Takes:** `rule` (a draft copy, or new), `spec`, `formType`, `isPublic`, `hasOtherLinkRule`.
- **Emits:** `rulechange { rule }` on every edit, and `@api problems` for Apply.

**What the dialog contains, top to bottom:**

1. **Name** (optional), and **On** (toggle).
2. **Fill from:** a segmented control.
   - **The record in the link:** choose its object. It's disabled with "This form already has a link rule. A link carries one record." when another enabled link rule exists (D67).
   - **A record picked in a lookup:** choose the lookup question, or the field on a Form.
     - For a polymorphic lookup, the **existing object selector** (`polymorphicTargetOptions`, `source.keyPrefix`) comes across unchanged.
   - **The signed-in person:** slice C.
3. **Rows**, one per filled answer: **Salesforce field** → **Question** (or **Field** on a Form) → **Show to people who aren't signed in** (link only).
   - **Salesforce field** is `c-final-field-picker` over the source object, using the contract in 6.3.
   - **Question** lists the destinations whose answer type fits the picked field (6.4). A saved row whose destination no longer fits keeps it and says why.
4. **When someone has already typed an answer:** "Keep what they typed" (default) or "Always replace".
5. **Test with a record:** pick a record you can see, and each row shows the value it would fill.
   - This uses `getTestRecordValues`.
   - It replaces the rail's "Test in preview", which the dialog would cover.

**Apply** refuses these, under the control, with a count in the footer (the conditions dialog's pattern):

- a row missing its field or destination;
- a type that doesn't fit;
- a second link rule.

Classes `am-`.

### 6.3 Field picker contract (`lwc/finalFieldPicker`)

Three new `@api` properties. Their defaults keep today's behaviour, which lookup filters and mapping conditions rely on.

- **`maxDepth`** (default: unchanged).
  - `0` shows only the object's own fields: no "related" drill-in.
  - `1` allows one hop.
  - The Autofill editor passes `0` in slice B and `1` in slice C.
- **`allowedRelationships`** (default: empty, meaning all). When set, only these relationship names can be drilled into. A `user` rule passes `['Contact', 'Account', 'Manager']`.
- **`allowedTypes`** (default: empty, meaning all). A list of the lowercase describe types the picker offers (its data already carries `type` from `FinalLookupController.describeLookupFields`). Relationship entries stay visible while `maxDepth` allows them.
- **The fits table is one table, in Apex** (`FinalAutofillRules`). The browser gets it from a new cacheable `FinalAutofillController.fitsTable()` that returns `{ describeType: [answerTypes] }`.
  - The editor passes `allowedTypes` = every describe type that fits at least one destination on the form.
  - Once a field is picked, the editor uses `typeForPath` (already exported by the picker) and the table to list the destinations it fits.

### 6.4 What fits where

A destination's answer type comes from `FinalSubmitService.answerTypeOf(element)`.

| Salesforce field type                          | Fills                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| STRING, TEXTAREA (not rich), EMAIL, PHONE, URL | Text, Email, Phone, URL (**exactly today's matrix**: any of the five fills any text-like destination) |
| DOUBLE, INTEGER, LONG, CURRENCY, PERCENT       | Number, Text                                                                                          |
| DATE                                           | Date                                                                                                  |
| DATETIME                                       | Date (date part)                                                                                      |
| PICKLIST                                       | Choice (single), Text                                                                                 |

- **Compatibility policy:**
  - Today's validator accepts any of the five text-like source types into any of the five text-like destinations. The table keeps all of those pairings, so **every rule that publishes today still publishes**. New rows only add.
  - `FinalAutofillRulesTest` carries **legacy fixtures**: every pairing today's `isSupportedSourceType` × `isCompatibleDestination` accepts, asserted still accepted.
- **Not offered:** BOOLEAN, MULTIPICKLIST, REFERENCE/ID, rich text, encrypted, compound.
- **The source-type allow-lists that change** (both read the table now):
  - `FinalStudioController.describeSourceFields` (≈ line 357; the five-type check at ≈ 391);
  - `FinalAutofillValidator.isSupportedSourceType` (≈ line 708).

### 6.5 Spec shape (additive, `rulesVersion` stays 1)

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

### 6.6 Server

- **New `classes/FinalAutofillRules.cls`** (+ `FinalAutofillRulesTest`):
  - `fits(Schema.DisplayType, String answerType)`;
  - `fitsTable()`;
  - `destinationOf(spec, elementId)` returns `{ answerType, label, options, bound }`.
    - An eligible destination is a `type: 'field'` element that isn't in a repeating section and isn't read-only.
    - `bound` is whether it has `binding.field`. Bound fields are the Form's destinations; unbound ones are Survey and Freeform questions (decision 8).
- **`FinalAutofillValidator.cls`:**
  - `isCompatibleDestination` (≈ 716) and `isSupportedSourceType` (≈ 708) are replaced by `FinalAutofillRules`;
  - a Freeform lookup rule's `elementId` must be a lookup question (`config.referenceTo` set);
  - the one-link-rule check stays as it is (D67);
  - messages name the rule and the part of it, with no code words.
- **`FinalAutofillController`:**
  - new `fitsTable()`;
  - `getLookupPlan` (≈ 94) and its `inspectLookups` accept Freeform lookup questions beside bound reference fields.
- **`FinalAutofillService.resolveLinkSourceFromSpec`:** unchanged. A non-Survey form already takes its object from the rule, and the first enabled link rule wins, which D67 keeps true.
- **Links on Freeform:** `FinalStudioController.mintRecordLink`, `mintTrackedLink` and `invalidateLinks` already accept any non-Survey form with an eligible link rule. `invalidateLinks` checks through `resolveLinkSource` (see its "R11" note). The org check covers all three on a Freeform.

### 6.7 Runtime (browser)

- **`lwc/finalFormViewer/autofillEngine.js`:** a new pure `fitValue(value, destination)` turns the value into the answer:
  - Number: a number, or skipped if it isn't numeric;
  - Date: `YYYY-MM-DD`, with a date-time cut to its date;
  - Choice: the option whose value or label equals it, else skipped;
  - text types: a string.
  - Skipped means _left blank and not owned_.
- **`finalFormViewer.js`** gives the engine each destination's `{ answerType, options }` from the spec. Answers are keyed by element id already, for bound fields and questions alike.
- **Guest responses stay keyed by destination element id,** as today. The guest spec keeps stripping source field names.

### 6.8 Tests

- **Jest:**
  - `autofillEngine`: `fitValue` for each type, including the skipped cases;
  - `finalAutofillRuleEditor`: sources, the second-link refusal, polymorphic object choice, rows filtered by fit, Apply problems;
  - `finalAutofillPanel`: Freeform opens the dialog, Form keeps the in-rail editor;
  - `finalFieldPicker`: `maxDepth: 0` hides related fields; `allowedTypes` filters; the defaults are unchanged.
- **Apex:**
  - `FinalAutofillRulesTest`: the table, the legacy fixtures, `destinationOf` (bound versus unbound);
  - `FinalAutofillValidatorTest`: Freeform question destinations, a lookup-question source, the second link rule, a type that doesn't fit, a number/date/pick-list source now accepted;
  - `FinalAutofillControllerTest`: `fitsTable`, and the lookup plan with a lookup question.
- **Org:**
  1. A Freeform with a Contact link rule filling a text, a number, a date and a choice question. A pick-list value that isn't an option stays blank.
  2. Mint a link, publish the site, and open the link as a guest. Only the ticked fields arrive. Stop old links, and the link stops working.
  3. Signed in: a lookup question on Account fills Phone and Website.

## 7. Slice C — one hop, and the signed-in person

### 7.1 Paths (`from: "Rel.Field"`)

- **What's allowed:** `Rel` is a non-polymorphic lookup's relationship name on the source object, with one dot at most. It's resolved with `FinalMappingRules.fieldAt(objectApi, path)`, the resolver mapping search uses.
- **Permission to read a path is three checks:**
  1. the lookup field on the source object is readable;
  2. the related object is readable;
  3. the terminal field is readable.
- **Every place that reads or checks source fields changes:**

| Where                                                                                                       | Today                                          | Change                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinalAutofillValidator` (source field checks, ≈ 489)                                                       | direct field on the source object              | resolve the path; apply the three checks for the author                                                                                                                                         |
| `FinalAutofillService.disclosedFieldsByObject` / `canDiscloseFields` / `assertCanDiscloseFields` (≈ 43–130) | direct fields only, so `Account.Name` fails    | path-aware, with the three checks for the person minting. **This covers Studio minting (`mintRecordLink`, `mintTrackedLink`) and Flow minting (`FinalSurveyLinkInvocable`), which all call it** |
| `FinalAutofillService.extractGuestDisclosures` / `hasGuestDisclosureChanged` (≈ 144–200)                    | keyed `object.field`                           | key the path (`contact.account.name`), so adding a related field counts as a disclosure change                                                                                                  |
| `FinalGuestContextService` (guest link read, ≈ 190–210)                                                     | selects direct fields                          | puts `Account.Name` in the same single SOQL, reads it through `getSObject('Account')`, and **returns it under the destination `to` id, as today**                                               |
| `FinalAutofillController.extractAccessibleMappings` (≈ 415)                                                 | `fieldMap.get(from)`, so it drops dotted paths | path-aware, with the three checks for the respondent                                                                                                                                            |
| `FinalAutofillController.getTestRecordValues` (≈ 29)                                                        | direct fields                                  | reads paths the same way                                                                                                                                                                        |
| `lwc/finalAutofillRecordSource` (LDS `getRecord`)                                                           | `optionalFields` of direct fields              | `Object.Rel.Field` in `optionalFields`; read the value through `fields.Rel.value.fields.Field.value`                                                                                            |

- **A missing relationship versus an unreadable field:**
  - When the lookup is empty (no Account), the value is **present and null**, so the answer is cleared under "Always replace" and left alone under "Keep what they typed".
  - When the person can't read the field, the value is **left out**, which is today's rule for direct fields.
- Tests cover both cases at each row of the table above.

### 7.2 The signed-in person (`source.type: "user"`)

- **Server: new `FinalAutofillController.getUserValues(Id formId, Id versionId)`.**
  - Refused when `UserInfo.getUserType() == 'Guest'`.
  - Reads the published version's enabled `user` rules and selects their `from` fields (direct, or one hop through Contact, Account or Manager) from `User WHERE Id = :UserInfo.getUserId()` in USER_MODE.
  - Returns `{ ruleId: { elementId: value } }`, keyed by destination like every other source.
- **Validator:**
  - refuses `guestAllowed: true` on a `user` rule;
  - refuses a hop other than Contact, Account or Manager.
  - The dialog hides the guest column.
- **Who calls it:** `finalFormViewer`, when `@salesforce/user/isGuest` is false. That covers the internal hosts, and signed-in people on the site (`finalGuestHost` renders the same viewer).
  - A guest never calls it. That's decided by who is signed in, not by which host is showing the form.
  - In the Studio preview, the author is the signed-in person, so the preview fills with the author's own values.
- **How results enter Autofill:** the same path lookup results take.
  - The viewer calls the engine's `onSourceChanged` once per `user` rule after the published version is known, with `sourceKey` = the user id.
  - It uses the returned `requestIdentity` (`ruleId`, `generation`, `sessionId`).
  - It applies the reply only if that identity is still current.
- **Stale replies:** a spec change (the rules fingerprint) or a new session bumps the generation, and older replies are dropped. This is today's rule for lookups (`_startAutofillRequest` ≈ 2576).
- **Loading:** no spinner. Answers appear when they arrive, as lookup Autofill does today.
- **Failure:** the rule's answers stay blank, and the form stays usable, with a console log only. This matches today's `_handleAutofillTimeout`.
- **Reset:** a new session re-runs it. Nothing about the person is stored in the spec or the submission.

### 7.3 Tests

- **Apex:**
  - paths through the validator, the disclosure check (Studio mint and the Flow invocable), `extractGuestDisclosures`, the guest context, `extractAccessibleMappings` and `getTestRecordValues`, each with an empty lookup and an unreadable field;
  - `getUserValues`: refused to a guest; a hop outside the three refused.
- **Jest:**
  - `finalAutofillRecordSource`: a path in `optionalFields` and its value read;
  - `finalFormViewer`: a `user` rule's stale reply is dropped; no call when `isGuest`.
- **Org:**
  - a link rule filling `Account.Name` for a guest (site published first);
  - a signed-in site user and an internal user each get their own name and email;
  - a guest on the same form gets nothing from the `user` rule.

## 8. Slice D — Form and Survey move to the new dialog

- **`finalAutofillPanel`:** remove the Freeform branch and the whole in-rail editor. Every type opens the dialog.
- **Survey:** the link source's object is fixed to the connected object, shown but not choosable, as today.
- **Form:** destinations are bound field elements. The fits table applies through their `config.inputType`, so Form gains number, date and pick-list destinations too.
- **Saved rules:** a rule saved before this opens, validates and publishes unchanged. That's the compatibility policy in 6.4 and its legacy fixtures.
- **Org:** re-run today's Autofill acceptance (PRs #241–#245) on a Form and a Survey: link as a guest, lookup signed in, keep-what-they-typed and always-replace, and a polymorphic lookup rule.

## 9. Deletions ledger (each named at the slice that removes it)

| Slice | Removed                                                                                                                                                           | What it is                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A     | `lwc/finalDataMode/` (`finalDataMode.js`, `.html`, `.css`, `.js-meta.xml`, `__tests__/finalDataMode.test.js`)                                                     | The Data tab's page                                  |
| A     | `finalFormStudio`: `isData`, `showDataMode`, `dataClass`, `isDataPressed`, `handleModeData`, `.st-stagearea--data`, the Data button, the `isData` template branch | Data tab wiring                                      |
| B     | `finalAutofillPanel`: the `isSurvey` prop (replaced by `formType`)                                                                                                | Type flag                                            |
| B     | `FinalAutofillValidator`: `isSupportedSourceType`, `isCompatibleDestination`                                                                                      | Replaced by `FinalAutofillRules`                     |
| B     | `FinalStudioController.describeSourceFields`: the five-type check                                                                                                 | Replaced by `FinalAutofillRules`                     |
| D     | `finalAutofillPanel`: the in-rail rule editor (draft rule state, source switch, mapping rows, test-in-preview) and its template                                   | Replaced by the dialog                               |
| D     | `finalFormStudio`: `handleTestPreview`, `handleClearTestPreview`, `testRecordContext`, and `ontestpreview` / `oncleartestpreview` on the palette                  | Rail test-preview, replaced by the dialog's own test |

Legacy `autofillEditor`, `formAutofill` and `zAutofillEditor` aren't part of the live build and aren't touched.

## 10. Out of scope

- Checkbox and multi-choice destinations, and repeating sections as destinations.
- Two-hop paths.
- A second link rule, or a second link object, per form.
- The invitations redesign (F2.5).
- The app-wide typography pass (PENDING_WORK §4.0).

## 11. Review 1 (2026-09-25): what changed

| #   | Finding                                                                                | Now                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Guest values would come back under `from`, which the viewer discards                   | Destination-keyed as today; paths resolved server-side (7.1 table)                                                                  |
| 2   | One-hop links fail the disclosure check                                                | Path-aware disclosure with three checks, covering Studio and Flow minting (7.1)                                                     |
| 3   | Three direct-field-only readers were missed                                            | `extractAccessibleMappings`, `getTestRecordValues`, `finalAutofillRecordSource` are named, with empty-versus-unreadable tests (7.1) |
| 4   | The field picker and the fits data were disconnected; the allow-lists weren't expanded | Picker contract `maxDepth` / `allowedTypes` / `allowedRelationships` plus `fitsTable()`; both allow-lists replaced (6.3, 6.4)       |
| 5   | The `user` source had no caller, and "guest host" is the wrong gate                    | Called by the viewer when `isGuest` is false; loading, stale, failure and reset spelled out (7.2)                                   |
| 6   | `full` is `large` on desktop, and Escape/✕ can't be stopped                            | Own SLDS dialog `c/finalStudioDialog` with an org acceptance gate (5.1)                                                             |
| 7   | The stricter fits table would break saved rules; the polymorphic selector was missing  | The table keeps today's text matrix; legacy fixtures; the polymorphic selector carried into the dialog (6.2, 6.4)                   |
| 8   | One link _object_ versus one link _rule_                                               | One enabled link rule, as today (D67)                                                                                               |
| —   | Freeform questions are `type: 'field'`                                                 | Destinations are `type: 'field'`, bound or unbound (6.6)                                                                            |
| —   | Freeform's Autofill tab belongs to B                                                   | Moved to 6.1                                                                                                                        |
| —   | `invalidateLinks` isn't Survey-only                                                    | Corrected (6.6)                                                                                                                     |
