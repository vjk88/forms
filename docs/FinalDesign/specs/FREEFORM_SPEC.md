# Freeform — the third form type

> **Status:** design approved in conversation 2026-09-19; **no code written**. F1 is specified to
> build depth. F2's contracts are locked here so F1 cannot box them in; F2's screens get their own
> spec. Companions: [DATA_MODEL_DELTA.md](../DATA_MODEL_DELTA.md) ·
> [FORM_SPEC_SCHEMA.md](../FORM_SPEC_SCHEMA.md) · [SURVEY_OBJECT_SPEC.md](./SURVEY_OBJECT_SPEC.md) ·
> [DEFERRED.md](../DEFERRED.md).

## 1. Why Freeform exists

**One submission can feed several Salesforce objects.** That is the whole point (owner, 2026-09-19).
Everything in F1 is scaffolding for the mapping engine in F2.

| Type                | You start with                  | Answers end up in                                                                        |
| ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Salesforce Form** | An object, then its fields      | One configured Salesforce record                                                         |
| **Survey**          | Questions, or a survey template | Survey responses + answers, with survey analytics                                        |
| **Freeform**        | Any questions, or a template    | Its own submission store, **plus optional mappings to any number of Salesforce objects** |

Positioning: Form = "I know which Salesforce data I need." Survey = "I want feedback and analysis."
Freeform = "I know what I want to ask; I'll decide where it goes."

### 1.1 Rules that define the type

- No object selection to start, and no form-level primary object, ever.
- Mapping is optional. A Freeform can publish and collect submissions with no mapping at all.
- Mixed mapping is supported: some questions write to Salesforce fields, the rest stay with the
  submission.
- Adding mappings never disturbs the questions (labels, choices, rules, layout survive).
- Mappings are validated before publishing.
- **Every answer is retained with the submission whether it is mapped or not.**

## 2. Decision ledger (owner rulings)

| #   | Ruling                                                                                                                                                                                                                                                       | When       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| D1  | Freeform is a third type. Do **not** merge it into Survey; Survey responses keep their own object for analytics                                                                                                                                              | 2026-09-13 |
| D2  | Storage: **new objects, shared code** — `Form_Submission__c` + `Form_Submission_Answer__c`, with the answer-writing code shared with surveys, not copied                                                                                                     | 2026-09-19 |
| D3  | Reading answers: native record page, list view and report type, **plus a small reader component** that shows the Q&A in form order                                                                                                                           | 2026-09-19 |
| D4  | Palette: every Survey widget **plus** general inputs (email, phone, date, URL, dropdown, single choice, multiple choice), and **no analytics** (no Topics). Survey's own palette is untouched                                                                | 2026-09-19 |
| D5  | Creation: **template → layout → theme → name**, any layout, no object step                                                                                                                                                                                   | 2026-09-19 |
| D6  | F1 ships no connected object, no record links, no Autofill                                                                                                                                                                                                   | 2026-09-19 |
| D7  | Autofill **is** a Freeform feature; it ships in **F2**, when a rule can name its own source object                                                                                                                                                           | 2026-09-19 |
| D8  | The Connected object card is not reused; **Mapping sections** may replace it in F2 (TBD)                                                                                                                                                                     | 2026-09-19 |
| D9  | Spec scope: F1 in full detail **+ F2 contracts locked**; F2 screens get their own spec                                                                                                                                                                       | 2026-09-19 |
| D10 | Invitations (a unique revocable link per person, no Autofill dependency) return as **F2.5**, for all three types                                                                                                                                             | 2026-09-19 |
| D11 | Guests **may update** records the server identifies: the record their link names, records created earlier in the same submission, and **records they picked in a lookup question**. The browser never names a record. This reopens DEFERRED #28 for Freeform | 2026-09-19 |
| D12 | Publish **warns** when a question that already has answers changes type or is deleted, and lets the author continue                                                                                                                                          | 2026-09-19 |

## 3. Phase map

| Phase    | Ships                                                                                                                                                                              | Depends on |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **F1**   | The type, both objects, creation, Studio, submit, reader, reports                                                                                                                  | —          |
| **F2**   | Salesforce Mapping page: record actions, question→field mappings, fixed values, links between created records, publish validation, failure handling + retry. Multi-object Autofill | F1         |
| **F2.5** | Invitations redesign for all three types                                                                                                                                           | F2         |
| **F3**   | Partner Application template, with mapping suggestions resolved against the customer's org                                                                                         | F2         |
| **F4**   | Catalog: curated templates, reusable sections, save as an org template                                                                                                             | F3         |

---

# F1 — Freeform without mapping

Deliverable: **New → Freeform → add questions → configure visibility → preview → publish → submit →
view answers.** Publishable and useful on its own.

## 4. Type plumbing

### 4.1 Capabilities, not type checks

Today the code asks "is this a survey?" in ~40 places, and every one of them is a two-way switch
whose `else` means Form. A third type does not crash those lines; it is **quietly misfiled**. So the
list of types lives in exactly one module per language:

- `c/finalFormKind` (LWC)
- `FinalFormKind` (Apex)

Each answers capability questions. Callers ask the capability, never the type name.

| Capability                                                             | Form | Survey              | Freeform                                               |
| ---------------------------------------------------------------------- | ---- | ------------------- | ------------------------------------------------------ |
| `needsObject` — must have a target object                              | yes  | no                  | **no**                                                 |
| `usesAnswerStore` — answers stored as rows                             | no   | yes                 | **yes**                                                |
| `usesQuestions` — palette serves questions, not describe-driven fields | no   | yes                 | **yes**                                                |
| `usesAnalytics` — Topics, normalized scores, sentiment                 | no   | yes                 | **no**                                                 |
| `usesContextRecord` — connected object, record links                   | no   | yes                 | **no (F1); F2 replaces the idea with mapping actions** |
| `usesAutofill`                                                         | yes  | yes                 | **yes, from F2 (D7)**                                  |
| `layoutLocked`                                                         | no   | yes (one-at-a-time) | **no**                                                 |

**An unrecognized type throws.** No path may fall back to Form.

### 4.2 Values

- `Form__c.Form_Type__c` gains the value `Freeform`; the field's help text ("Form or Survey") is
  rewritten for three types.
- Spec: `form.type: "freeform"`, and **no** `form.targetObject`.
- `Form__c.Primary_Context_Object__c` stays **blank**. Object-less surveys are created with a fake
  `'Contact'` to satisfy a validation rule (`FinalFormCreateController.cls:383`); Freeform does not
  copy that trick, because F2's mapping page will read this area and a fake value would lie to it.
- `Form__c.Submission_Storage__c` (legacy) stays blank; nothing in the final stack writes it.

### 4.3 Existing code that must stop assuming two types

| Where                                                                                                                                                     | Today                                              | Needed                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- | ----------- |
| `FinalSubmitService.cls:210`                                                                                                                              | `type == 'survey'` → survey path, else object path | Three-way dispatch; unknown type throws                                                |
| `FinalFormActionsService.cls:22,152`                                                                                                                      | `Form_Type__c == 'Survey' ? 'survey' : 'form'`     | Kind lookup — otherwise a cloned Freeform is treated as a Form                         |
| `FinalFormActionsService.cls:84`                                                                                                                          | Import maps any non-survey to `'Form'`             | Kind lookup                                                                            |
| `FinalFormPackageService.cls:111`                                                                                                                         | Rejects types other than form/survey               | Accept `freeform`                                                                      |
| `FinalSpecTransferValidator.cls:105-127`                                                                                                                  | `FORM_TYPES` pair; object required unless survey   | Accept `freeform`; no object required                                                  |
| `FinalSpecDescribeValidator.cls:21`                                                                                                                       | `Boolean surveyContext`                            | Three-way: object required / optional / **absent**                                     |
| `FinalFormActionsSelector.cls:151`                                                                                                                        | Counts only `Form_Response__c`                     | Also count submissions — otherwise a Freeform with data reports as safe to hard-delete |
| `VR_Primary_Object_Required`                                                                                                                              | Skips only Survey                                  | Also skip Freeform                                                                     |
| `FinalAutofillService`, `FinalLinkService`, `FinalSurveyLinkInvocable`, `FinalStudioController` (`setContextObject`, `mintRecordLink`, `invalidateLinks`) | "not survey" means object-bound                    | Explicitly survey-only in F1; revisited in F2/F2.5                                     |
| `finalFormStudio.js:1796` `isSurvey`, `finalPropertyPanel`, `finalStudioSettingsPanel`, `finalAutofillPanel`, `finalDesignRegistry` `appliesTo.formTypes` | Boolean survey checks                              | Capability getters from `c/finalFormKind`                                              |
| `finalFormsLibrary.js:52`                                                                                                                                 | `formType                                          |                                                                                        | 'Form'` | Third label |

Survey's answers to every capability are identical to today's behavior, so Survey behavior does not
move. Existing Apex + jest tests are the guard.

## 5. Data model

### 5.1 `Form_Submission__c` — label **Freeform Submission**

One record per submitted Freeform. Name: auto-number `FS-{00000000}`. Sharing: **Private**
(people see only records shared with them), matching `Form_Response__c`.

| Field                        | Type                                                      | Meaning                                                                                                     |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Form__c`                    | Lookup → `Form__c`, delete **Restrict**                   | Which form. New compared to surveys: gives a Submissions related list on the Form and simple report filters |
| `Form_Version__c`            | Lookup → `Form_Version__c`, required, delete **Restrict** | The exact published version that was filled in                                                              |
| `Submitted_Date__c`          | Date/Time                                                 | When                                                                                                        |
| `Submitted_By__c`            | Lookup → User                                             | Signed-in submitter; blank for guests                                                                       |
| `Completion_Time_Seconds__c` | Number                                                    | Time to complete                                                                                            |
| `Session_Id__c`              | Text(255)                                                 | Browser session marker (the shared submit code already captures it)                                         |

**Restrict** means the database refuses to delete a form or version that still has submissions — a
second lock behind the safe-delete fix in §4.3.

Deliberately **not** copied from `Form_Response__c`: `Status__c` (always Completed; no drafts),
`IP_Address__c` (nothing writes it), `Related_Record_Id__c` / `Related_Record_Type__c` (no linked
record in F1; F2 decides).

F2 will add mapping outcome fields (status, message, created record ids). **Not in F1.**

### 5.2 `Form_Submission_Answer__c` — label **Freeform Answer**

One row per answered question. Name: auto-number `FSA-{00000000}`. Master-detail to the submission
(it belongs to the submission, inherits its sharing, and is deleted with it).

| Field                      | Type             | Meaning                                                |
| -------------------------- | ---------------- | ------------------------------------------------------ |
| `Form_Submission__c`       | Master-Detail    | Parent                                                 |
| `Element_Key__c`           | Text(255)        | The question's permanent id from the spec (see §5.3)   |
| `Label_Snapshot__c`        | Text(255)        | The question text at the moment of submitting          |
| `Entry_Index__c`           | Number           | Row number inside a repeating section; blank otherwise |
| `Text_Value__c`            | Long Text(32768) |                                                        |
| `Numeric_Value__c`         | Number           |                                                        |
| `Boolean_Value__c`         | Checkbox         |                                                        |
| `Date_Value__c`            | Date             |                                                        |
| `DateTime_Value__c`        | Date/Time        |                                                        |
| `Selected_Options_JSON__c` | Long Text(32768) | Multi-select answers                                   |

Exactly one value column is filled per row, chosen by the answer's own type first and the question's
declared kind second (the survey rule; unparseable values fall back to text, never a lost answer).

**Not copied:** `Normalized_Score__c`, `Topic_Snapshot__c`, `Sentiment_*` (survey analytics) and
`Form_Element__c` (nothing writes it).

The value columns use **exactly the same API names as `Form_Response_Answer__c`**, so one shared
writer fills both objects (§7.2).

### 5.3 Question identity (owner question, 2026-09-19)

A question's identity is a **random id minted when the question is created** —
`mintId('el')` → `el_k3f9d2ab`, 8 crypto-random characters (`finalFormStudio.js:1488`). It is stored
in the spec and never changes. `Element_Key__c` holds it. The label is stored separately, only so old
answers stay readable.

| Author action                               | Effect on existing answers                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename the label                            | None. Same id, so reporting still groups them. Old rows keep the label they were submitted under; the reader shows the current label         |
| Move the question (position, section, page) | None. Reading order comes from the spec at display time                                                                                      |
| Change type (Short Text → Number)           | Same id, but new answers land in a different value column. Reporting sees one question with values in two places → **publish warning** (D12) |
| Delete, then re-add the same question       | New id. Reports treat it as a different question → **publish warning on deletion** (D12)                                                     |

### 5.4 Around the objects

- **Files** attach to the submission record (`ContentVersion.FirstPublishLocationId`), as survey
  uploads attach to the response.
- **Report type:** _Freeform Submissions with Answers_.
- **Tab + list view:** _Freeform Submissions_, with an "All" list view.
- **Permissions:** `Form_Builder_Admin` gets create/read/edit/delete + View All on both objects, the
  same as for survey responses.
- **Guests get no object permissions.** Their writes run through the fenced server-side insert that
  can only create app-owned records ("you don't need a key to the post office to mail a letter").
  The fence list grows from 3 objects to 5.

## 6. Creation and Studio

### 6.1 Creation (`finalCreationGallery`)

A third card joins Form and Survey on the kind screen:

> **Freeform** — I know what I want to ask; I'll decide where the answers go later.
> _Pick a template, layout & theme →_

Path: **template → layout → theme → name**. No object step anywhere. F1's template shelf holds one
entry, **Blank freeform**; F3 fills it.

On create: `Form_Type__c = 'Freeform'`, `Primary_Context_Object__c` blank, spec `form.type =
'freeform'` with no `targetObject`, chosen layout + theme, then land in Build (same as today).

Apex: the existing survey creator gains a kind parameter rather than being copied. Survey's behavior
is unchanged.

### 6.2 Studio surfaces

| Surface               | Freeform                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette → Questions   | The 12 survey widgets **plus** Email, Phone, Date, URL, Dropdown, Single choice, Multiple choice. Two headings so 19 items do not read as one wall. The renderer already supports these input types for unbound questions; only palette entries + mint defaults are new. Survey's roster is untouched (D4) |
| Palette → Blocks      | Unchanged (display text, image, callout, divider, spacer, consent, file upload)                                                                                                                                                                                                                            |
| Palette → Logic       | Unchanged. Visibility rules and validation already work on questions                                                                                                                                                                                                                                       |
| Palette → Autofill    | **Hidden in F1** (D6); returns in F2 (D7)                                                                                                                                                                                                                                                                  |
| Repeating Group       | **Disabled with the reason shown**, exactly as for object-less surveys: a repeat creates related Salesforce records, which needs an object. The submit engine already stores `Entry_Index__c`, so F2 can enable it without schema change                                                                   |
| Connected object card | Hidden. Surveys only; F2 may replace the idea with Mapping sections (D8)                                                                                                                                                                                                                                   |
| Question settings     | Same inspectors as Survey **minus Topics (chart tags)** and **minus Map to field**. New general inputs use the standard field inspector (label, required, help text, placeholder, choices, Display as)                                                                                                     |
| Settings drawer       | Close at, Closed message, **Response limit** (counts submissions), Public guest access. Record-links/invitations panel hidden — it is record-scoped and needs F2.5                                                                                                                                         |
| Design panel          | Same controls a Form gets. The survey-only paging section stays survey-only in F1                                                                                                                                                                                                                          |
| Preview / publish     | No change; publish is already type-agnostic (`FinalSpecController.publishSpec`)                                                                                                                                                                                                                            |
| Library               | Type column shows _Freeform_; filters and empty-state copy learn the third word                                                                                                                                                                                                                            |

### 6.3 Publish warnings (D12)

At publish, if the form already has submissions, compare the draft against the last published
version and warn (never block), naming each affected question:

- a question's answer storage kind changed (e.g. text → number);
- a question that has answers was deleted.

Copy states the consequence in plain words: _"Answers already collected for 'Your email' are stored
as text. New answers will be stored as numbers, so reports will show this question in two places."_

## 7. Submitting

### 7.1 Dispatch

`FinalSubmitService.run` becomes a three-way switch on the kind: Form → object path, Survey →
`runSurvey`, Freeform → `runFreeform`, unknown → error.

### 7.2 One engine, two answer stores

`runSurvey`'s shared behavior (walk the spec, one typed row per answer, one row per matrix statement,
repeat entries with `Entry_Index__c`, files, everything inside one savepoint) moves into a shared
routine taking a small descriptor:

- the parent object to create (`Form_Response__c` vs `Form_Submission__c`) and how to stamp it;
- the answer object + its parent field;
- whether analytics apply (Survey yes, Freeform no);
- **F2:** whether mapping actions run after the answers are stored.

Survey passes today's descriptor and must behave identically.

### 7.3 Postures

- **Signed in:** the running user's own permissions.
- **Guest:** the published spec is the allow-list — the walk only ever collects questions the spec
  declares, so a crafted payload cannot name an object or a field. DML runs in the fenced system-mode
  insert limited to app-owned objects. F1 writes nothing outside the submission and its answers.

### 7.4 Limits and availability

`responseCapReached` counts survey responses per version. Freeform counts **submissions for the same
form across all versions**, which is what the Response limit help text already promises. Close date
and closed message are shared and unchanged.

## 8. Reading answers

New `c/finalSubmissionReader` on the `Form_Submission__c` record page (Lightning record page +
standard fields + the reader), backed by one USER_MODE Apex read.

- Questions appear **in form order**, with section headings.
- Values are formatted: choices as a list, checkbox as Yes/No, dates localized, matrix grouped by
  statement, files as links.
- Unanswered questions render as "No answer" rather than disappearing, so a skipped question is
  visible.
- A question deleted in a later version still renders, using `Label_Snapshot__c`.

A Studio "Responses" area is **not** in F1 (D3).

## 9. Out of scope for F1

Mapping of any kind · Autofill · connected object · record links · invitations · repeating sections ·
Studio responses area · templates beyond Blank · survey analytics · converting an existing Form or
Survey into a Freeform.

## 10. Acceptance tests

**Apex**

1. Signed-in submit stores one submission + one row per answered question, with the right value
   column per type.
2. Guest submit stores the same and stamps no user.
3. Matrix question stores one row per statement.
4. Unanswered questions store no row; `false` is stored, blank text is not.
5. Response limit closes the form at the configured count across versions.
6. Safe delete refuses a Freeform that has submissions; Restrict blocks the DML even if the check is
   bypassed.
7. Clone, export and import keep the type `freeform` (regression: today's code would silently make it
   a Form).
8. Publish succeeds with no object, and the describe validator never asks for one.
9. An unknown form type throws instead of taking the object path.
10. Survey and Form submit paths are byte-for-byte unchanged (existing suites must pass untouched).

**Jest**

11. Creation gallery offers three kinds; the Freeform path never asks for an object.
12. Palette shows the grouped 19 items for Freeform, 12 for Survey.
13. Question settings hide Topics and Map to field for Freeform.
14. Settings drawer hides the record-link panel and shows the response limit.
15. Reader renders questions in order, with "No answer" for skipped ones and the snapshot label for
    removed ones.

**Org verification** (deployed and clicked through, not just green tests): create → build with a mix
of widgets and general inputs → visibility rule → preview → publish → submit signed-in → submit as a
guest → read both submissions on the record page → run the report type.

---

# F2 contracts — locked now (D9)

F1 must not contradict these. F2's screens and flows get their own spec.

1. **Mapping lives at the top of the spec**, in `spec.mapping.actions`, never inside question
   definitions. It publishes with the version, so a submission is mapped by the configuration that
   existed when it was filled in.
2. **A question points at an action, not an object:** `mapping: [{ actionId, field }]`. A list,
   because one answer may feed two records (an email on both the Contact and the application).
   Survey's single-object `mapping: {object, field}` is **not** reused for Freeform.
3. **Every answer is stored, mapped or not.** Mapping never decides what is kept.
4. **The submission is saved first and always kept.** Mapping runs after it, in its own savepoint, so
   a rejected Salesforce write can never discard someone's answers.
5. **A mapping failure is recorded on the submission** (status + message) and is retryable. Created
   record ids are recorded so a retry resumes instead of duplicating.
6. **Guest writes (D11):** create is allowed; update is allowed **only** for records the server
   identifies —
   (a) the record the personalized link names, (b) records created earlier in the same submission,
   (c) records the guest picked in a lookup question, bounded by the author's filter, which is
   already re-compiled and re-checked server-side at submit. Per-mapping opt-in; only fields the
   published spec lists. **The browser never names a record.** This reopens DEFERRED #28 for
   Freeform; the Security Review story is written when F2 is specified.
7. **Autofill rules name their own source object.** There is no form-level primary object.
8. **"Map later" means future submissions.** Applying new mappings to already-collected submissions
   is a separate, explicit action, never a side effect.
9. **Mappings are validated at publish:** field types, picklist values, required destination fields,
   and the author's own permissions.

## Open for the F2 spec

- The Mapping page's screens, and whether Mapping sections replace the Connected object card (D8).
- Record matching / de-duplication ("find or create a Contact by email") — duplicate rules make this
  its own design round.
- Mapping synchronously in the submit request vs a queued job, and what the respondent sees either
  way.
- Where a failed mapping is retried from, and who is allowed to retry it.
- How F2.5 invitations supply the record a personalized link carries.

## Glossary

- **Answer store** — answers kept as rows in our own table, one row per question, instead of columns
  on a Salesforce record.
- **Savepoint** — a marker in a database transaction you can roll back to, so a later failure undoes
  earlier writes.
- **Master-detail** — a strict parent-child link: the child inherits the parent's sharing and is
  deleted with it.
- **Restrict (delete constraint)** — the database refuses to delete a record that still has children
  pointing at it.
- **USER_MODE / `as user`** — the database call runs under the running person's own permissions, not
  the app's.
- **Fenced system-mode insert** — server code that may create only a fixed list of app-owned records,
  used so a public guest can submit without being given object permissions.
- **Allow-list** — the published spec is the only source of truth for what may be written; anything
  the browser sends that the spec did not declare is ignored.
