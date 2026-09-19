# Freeform — the third form type

> **Status:** design approved in conversation 2026-09-19, **revised the same day** after review round 1
> (findings 1–6 accepted in full). **No code written.** F1 is specified to build depth. F2's contracts
> are locked here so F1 cannot box them in; F2's screens get their own spec. Companions:
> [DATA_MODEL_DELTA.md](../DATA_MODEL_DELTA.md) · [FORM_SPEC_SCHEMA.md](../FORM_SPEC_SCHEMA.md) ·
> [SURVEY_OBJECT_SPEC.md](./SURVEY_OBJECT_SPEC.md) · [DEFERRED.md](../DEFERRED.md).

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

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                          | When       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1  | Freeform is a third type. Do **not** merge it into Survey; Survey responses keep their own object for analytics                                                                                                                                                                                                                                                 | 2026-09-13 |
| D2  | Storage: **new objects, shared code** — `Form_Submission__c` + `Form_Submission_Answer__c`, with the answer-writing code shared with surveys, not copied                                                                                                                                                                                                        | 2026-09-19 |
| D3  | Reading answers: native record page, list view and report type, **plus a small reader component** that shows the Q&A in form order                                                                                                                                                                                                                              | 2026-09-19 |
| D4  | Palette: every Survey widget **plus** general inputs (email, phone, date, URL, dropdown, single choice, multiple choice), and **no analytics** (no Topics). Survey's own palette is untouched                                                                                                                                                                   | 2026-09-19 |
| D5  | Creation: **template → layout → theme → name**, any layout, no object step                                                                                                                                                                                                                                                                                      | 2026-09-19 |
| D6  | F1 ships no connected object, no record links, no Autofill                                                                                                                                                                                                                                                                                                      | 2026-09-19 |
| D7  | Autofill **is** a Freeform feature; it ships in **F2**, when a rule can name its own source object                                                                                                                                                                                                                                                              | 2026-09-19 |
| D8  | The Connected object card is not reused; **Mapping sections** may replace it in F2 (TBD)                                                                                                                                                                                                                                                                        | 2026-09-19 |
| D9  | Spec scope: F1 in full detail **+ F2 contracts locked**; F2 screens get their own spec                                                                                                                                                                                                                                                                          | 2026-09-19 |
| D10 | Invitations (a unique revocable link per person, no Autofill dependency) return as **F2.5**, for all three types                                                                                                                                                                                                                                                | 2026-09-19 |
| D11 | Guests **may update** records the server identifies: the record their link names, records created earlier in the same submission, and **records they picked in a lookup question**. This reopens DEFERRED #28 for Freeform. Refined by D18                                                                                                                      | 2026-09-19 |
| D12 | Publish **warns** when a question that already has answers changes type or is deleted, and lets the author continue                                                                                                                                                                                                                                             | 2026-09-19 |
| D13 | Review round 1 accepted in full: mapping cannot rely on a savepoint (D17), guest updates need an explicit authorization policy (D18), the reader must render from the submission's own version (D19), mapping is action-owned (F2 contract 1), answer typing is deterministic (D14), and duplicate submissions + the response-limit race are F1 work (D15, D16) | 2026-09-19 |
| D14 | **`Answer_Type__c`**: a restricted picklist written at submit from the published question, naming **what the answer is**, with a documented type→column map. Ten values: Text, Email, Phone, URL, Choice, Options, Number, Boolean, Date, Date/Time. A value that cannot be converted is stored as text and flagged with `Value_Unparsed__c`                    | 2026-09-19 |
| D15 | Duplicate submissions are prevented by an **idempotency key** with a unique index; a repeat returns the existing submission                                                                                                                                                                                                                                     | 2026-09-19 |
| D16 | The response-limit race (count-then-insert) is fixed in the **shared engine, for Survey as well as Freeform**                                                                                                                                                                                                                                                   | 2026-09-19 |
| D17 | Mapping runs in a **second transaction**, never a savepoint inside the submit transaction. All-or-nothing per submission; retry is explicit and serialized                                                                                                                                                                                                      | 2026-09-19 |
| D18 | Guest updates require **both** re-validated eligibility **and** an explicit author grant (per action, per field, filter required). A client-supplied record id is never trusted on its own                                                                                                                                                                      | 2026-09-19 |
| D19 | The reader renders from the **submission's own published version** — wording, choices, types, sections and order. Current wording, if shown, is secondary                                                                                                                                                                                                       | 2026-09-19 |
| D20 | **File Upload stays in the Freeform palette.** Guest uploads are built later; publish warns when a public form contains file questions                                                                                                                                                                                                                          | 2026-09-19 |

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
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
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
| `finalFormsLibrary.js:52`                                                                                                                                 | `formType \|\| 'Form'`                             | Third label                                                                            |

Survey must come out of this with **unchanged observable behavior**, guarded by the existing Apex and
jest suites, which run untouched. (The shared-engine extraction changes the code, so "byte-for-byte
identical code" is not the bar; identical behavior is. The one deliberate exception is D16, the
response-limit race, which Survey also gets fixed.)

## 5. Data model

### 5.1 `Form_Submission__c` — label **Freeform Submission**

One record per submitted Freeform. Name: auto-number `FS-{00000000}`. Sharing: **Private**
(people see only records shared with them), matching `Form_Response__c`.

| Field                        | Type                                                      | Meaning                                                                                                                               |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Form__c`                    | Lookup → `Form__c`, delete **Restrict**                   | Which form. New compared to surveys: gives a Submissions related list on the Form and simple report filters                           |
| `Form_Version__c`            | Lookup → `Form_Version__c`, required, delete **Restrict** | The exact published version that was filled in. The reader renders from this version (D19)                                            |
| `Submission_Key__c`          | Text(64), External ID, **Unique**                         | Idempotency key minted by the browser per submit attempt (D15). A repeat returns the existing submission instead of creating a second |
| `Submitted_Date__c`          | Date/Time                                                 | When                                                                                                                                  |
| `Submitted_By__c`            | Lookup → User                                             | Signed-in submitter; blank for guests                                                                                                 |
| `Completion_Time_Seconds__c` | Number                                                    | Time to complete                                                                                                                      |
| `Session_Id__c`              | Text(255)                                                 | Browser session marker. **Not** an idempotency guard — it survives across submissions                                                 |

**Restrict** means the database refuses to delete a form or version that still has submissions — a
second lock behind the safe-delete fix in §4.3.

Deliberately **not** copied from `Form_Response__c`: `Status__c` (always Completed; no drafts),
`IP_Address__c` (nothing writes it), `Related_Record_Id__c` / `Related_Record_Type__c` (no linked
record in F1; F2 decides).

F2 will add mapping outcome fields (status, message, created record ids, records touched). **Not in
F1.**

### 5.2 `Form_Submission_Answer__c` — label **Freeform Answer**

One row per answered question. Name: auto-number `FSA-{00000000}`. Master-detail to the submission
(it belongs to the submission, inherits its sharing, and is deleted with it).

| Field                      | Type                          | Meaning                                                               |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `Form_Submission__c`       | Master-Detail                 | Parent                                                                |
| `Element_Key__c`           | Text(255)                     | The question's permanent id from the spec (see §5.3)                  |
| `Label_Snapshot__c`        | Text(255)                     | The question text at the moment of submitting                         |
| `Answer_Type__c`           | Restricted picklist, required | **What the answer is** (D14). See §5.2.1                              |
| `Value_Unparsed__c`        | Checkbox                      | The answer did not convert to its declared type and is stored as text |
| `Entry_Index__c`           | Number                        | Row number inside a repeating section; blank otherwise                |
| `Text_Value__c`            | Long Text(32768)              |                                                                       |
| `Numeric_Value__c`         | Number                        |                                                                       |
| `Boolean_Value__c`         | Checkbox                      |                                                                       |
| `Date_Value__c`            | Date                          |                                                                       |
| `DateTime_Value__c`        | Date/Time                     |                                                                       |
| `Selected_Options_JSON__c` | Long Text(32768)              | Multi-value answers                                                   |

**Not copied:** `Normalized_Score__c`, `Topic_Snapshot__c`, `Sentiment_*` (survey analytics) and
`Form_Element__c` (nothing writes it).

The value columns use **exactly the same API names as `Form_Response_Answer__c`**, so one shared
writer fills both objects (§7.2). `Answer_Type__c` and `Value_Unparsed__c` exist only on the Freeform
answer; Survey's object is untouched.

#### 5.2.1 `Answer_Type__c` — the storage contract (D14)

The type is decided by the **published question**, never by the shape of the JSON that arrived. The
same question therefore always stores the same way, whether the payload carried `42` or `"42"`.

| Question                                                                    | `Answer_Type__c`                                           | Value column               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| Short Text, Long Text                                                       | Text                                                       | `Text_Value__c`            |
| Email                                                                       | Email                                                      | `Text_Value__c`            |
| Phone                                                                       | Phone                                                      | `Text_Value__c`            |
| URL                                                                         | URL                                                        | `Text_Value__c`            |
| Dropdown, Single choice, Image Choice (single), Yes/No rendered as a choice | Choice                                                     | `Text_Value__c`            |
| Multiple choice, Ranking, Image Choice (multi)                              | Options                                                    | `Selected_Options_JSON__c` |
| Number, NPS, Rating, Opinion Scale, Emoji Scale, Likert, Slider             | Number                                                     | `Numeric_Value__c`         |
| Yes/No, Consent, checkbox                                                   | Boolean                                                    | `Boolean_Value__c`         |
| Date                                                                        | Date                                                       | `Date_Value__c`            |
| Date/Time                                                                   | Date/Time                                                  | `DateTime_Value__c`        |
| Matrix                                                                      | one row per statement, typed by that statement's own value | per row                    |
| File Upload                                                                 | — no answer row; files attach to the submission (§5.4)     | —                          |

**Accepted conversions:** a numeric string converts to Number; an ISO-8601 string converts to Date or
Date/Time; `true`/`false`, `"true"`/`"false"` convert to Boolean; a single value offered to an
Options question becomes a one-item list.

**Invalid values are kept, never dropped:** the raw value goes to `Text_Value__c`,
`Value_Unparsed__c` is set, and `Answer_Type__c` still names the **declared** type. So a row saying
`Number` with an empty `Numeric_Value__c` and `Value_Unparsed__c = true` is self-describing: we
expected a number, we received something else, and here is exactly what the person typed.

**Blank answers store no row at all**, with one exception that is not blank: Boolean `false`. Because
`Answer_Type__c` names the type, `Boolean` on a row means `Boolean_Value__c` is the answer; on any
other row that column is an unused default and carries no meaning.

### 5.3 Question identity (owner question, 2026-09-19)

A question's identity is a **random id minted when the question is created** —
`mintId('el')` → `el_k3f9d2ab`, 8 crypto-random characters (`finalFormStudio.js:1488`). It is stored
in the spec and never changes. `Element_Key__c` holds it. The label is stored separately, so an
answer row remains readable even if its version is somehow unavailable.

| Author action                               | Effect on existing answers                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename the label                            | None. Same id, so reporting still groups them. Each submission is read under the wording **its own version** carried (D19), so a renamed question never re-labels an old answer |
| Move the question (position, section, page) | None. Order comes from the submission's own version                                                                                                                             |
| Change type (Short Text → Number)           | Same id; new answers store under the new type. Old rows keep their own `Answer_Type__c`, so reporting can tell them apart → **publish warning** (D12)                           |
| Delete, then re-add the same question       | New id. Reports treat it as a different question → **publish warning on deletion** (D12)                                                                                        |

### 5.4 Around the objects

- **Files** attach to the submission record (`ContentVersion.FirstPublishLocationId`), as survey
  uploads attach to the response. File questions create no answer row.
- **Report type:** _Freeform Submissions with Answers_.
- **Tab + list view:** _Freeform Submissions_, with an "All" list view.
- **Permissions:**
  - `Form_Builder_Admin` gets create/read/edit/delete + View All on both objects, as for survey
    responses.
  - **Respondents need no object permissions at all** — signed-in and guest submits both write
    through the fenced server-side insert (`FinalSubmitService.cls:1026`), which can only create
    app-owned records ("you don't need a key to the post office to mail a letter"). The fence list
    grows from 3 objects to 5.
  - A **read-only permission set** ships for people who must read submissions without being builder
    admins; the reader (§8) runs under the reader's own permissions.

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
| Palette → Blocks      | Unchanged, **including File Upload** (D20). A public Freeform with file questions publishes with a warning (§6.3) until guest uploads are built                                                                                                                                                            |
| Palette → Logic       | Unchanged. Visibility rules and validation already work on questions                                                                                                                                                                                                                                       |
| Palette → Autofill    | **Hidden in F1** (D6); returns in F2 (D7)                                                                                                                                                                                                                                                                  |
| Repeating Group       | **Disabled with the reason shown**, exactly as for object-less surveys: a repeat creates related Salesforce records, which needs an object. The submit engine already stores `Entry_Index__c`, so F2 can enable it without schema change                                                                   |
| Connected object card | Hidden. Surveys only; F2 may replace the idea with Mapping sections (D8)                                                                                                                                                                                                                                   |
| Question settings     | Same inspectors as Survey **minus Topics (chart tags)** and **minus Map to field**. New general inputs use the standard field inspector (label, required, help text, placeholder, choices, Display as)                                                                                                     |
| Settings drawer       | Close at, Closed message, **Response limit** (counts submissions), Public guest access. Record-links/invitations panel hidden — it is record-scoped and needs F2.5                                                                                                                                         |
| Design panel          | Same controls a Form gets. The survey-only paging section stays survey-only in F1                                                                                                                                                                                                                          |
| Preview / publish     | No change; publish is already type-agnostic (`FinalSpecController.publishSpec`)                                                                                                                                                                                                                            |
| Library               | Type column shows _Freeform_; filters and empty-state copy learn the third word                                                                                                                                                                                                                            |

### 6.3 Publish warnings

Warnings name the affected questions and never block. Comparison is against the last published
version.

1. **Type change with answers collected** (D12) — _"Answers already collected for 'Your email' are
   stored as text. New answers will be stored as numbers, so reports will show this question in two
   places."_
2. **Deleting a question that has answers** (D12) — re-adding it later creates a different question
   for reporting.
3. **Public access + file questions** (D20) — _"'Attach your CV' can't accept files from people who
   aren't logged in. They'll see an error when they submit."_ Guest uploads are their own project
   (`IMPL_PLAN_GUEST_FILE_UPLOAD.md`).

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
- whether `Answer_Type__c` / `Value_Unparsed__c` are written (Freeform yes, Survey no);
- whether analytics apply (Survey yes, Freeform no);
- **F2:** what to hand to the mapping transaction once the submission has committed (§7.6).

Survey passes today's descriptor and must behave identically, D16 excepted.

### 7.3 Postures

- **Signed in:** the running user's own permissions.
- **Guest:** the published spec is the allow-list — the walk only ever collects questions the spec
  declares, so a crafted payload cannot name an object or a field. DML runs in the fenced system-mode
  insert limited to app-owned objects. F1 writes nothing outside the submission and its answers.
- **Guest file uploads are refused** today (`FinalSubmitService.cls:1332`) and stay refused in F1;
  §6.3's warning makes the boundary visible at publish rather than at submit.

### 7.4 Duplicate submissions (D15)

The browser mints an **idempotency key** for a submit attempt and resends the same key if it retries.
The server stores it in `Submission_Key__c`, which is unique, so:

- a retry after a lost response returns the **existing** submission and its id;
- a double-click cannot create two submissions;
- a genuinely new submission carries a new key.

A duplicate key is a normal outcome, not an error: catch the duplicate-value failure, re-query, and
return the original submission.

### 7.5 Availability and the response limit (D16)

Close date and closed message are shared and unchanged. The Response limit counts **submissions for
the form across all versions** (surveys count responses), which is what the setting's help text
already promises.

Counting and then inserting is not atomic: two submissions arriving at the last free slot can both
pass the count. When — and only when — a limit is configured, acceptance is **serialized** by locking
the form row for the duration of the count and insert. **This fix applies to Survey too** (D16), the
one deliberate behavior change in the shared extraction.

### 7.6 Where F2's mapping attaches (D17)

Mapping does **not** run inside this transaction. Apex cannot commit part-way, so a savepoint would
not protect the answers from an uncatchable failure such as a governor limit. The submission and its
answers commit; mapping runs afterwards in **its own transaction** (a queued job, or a platform
event — the invitations code already publishes one from guest context, best-effort). F1 simply leaves
the seam: the submit routine returns the committed submission id, and nothing else in F1 depends on
what happens next.

**To verify when F2 is specified, not assumed:** whether a site guest user can queue asynchronous
Apex in this org's configuration. If not, the platform-event route is the fallback.

## 8. Reading answers (D19)

New `c/finalSubmissionReader` on the `Form_Submission__c` record page (Lightning record page +
standard fields + the reader), backed by one USER_MODE Apex read.

- **Everything comes from the submission's own published version**: question wording, choices, types,
  section headings and order. A later rename, reorder or deletion cannot change what a historical
  submission appears to say.
- Questions that did not exist in that version are **not** shown as "No answer" — they were never
  asked.
- Questions that existed but were skipped render as "No answer", so a deliberate skip stays visible.
- Values are formatted from `Answer_Type__c`: Options as a list, Boolean as Yes/No, Date and Date/Time
  localized, Email/Phone/URL as their natural links, matrix grouped by statement, files as links.
- An answer flagged `Value_Unparsed__c` shows the raw text with a quiet note that it did not match the
  expected type.
- If the current version words a question differently, the current wording may be shown as secondary
  text; the submitted wording always leads.

A Studio "Responses" area is **not** in F1 (D3).

## 9. Out of scope for F1

Mapping of any kind · Autofill · connected object · record links · invitations · repeating sections ·
Studio responses area · templates beyond Blank · survey analytics · guest file uploads · converting an
existing Form or Survey into a Freeform.

## 10. Acceptance tests

**Apex**

1. Signed-in submit stores one submission + one row per answered question, each with the right
   `Answer_Type__c` and value column.
2. Guest submit stores the same and stamps no user.
3. Matrix question stores one row per statement, typed per statement.
4. Unanswered questions store no row; Boolean `false` **is** stored and reads back as false.
5. A numeric question receiving `"42"` and `42` stores identically; receiving `"abc"` stores text with
   `Value_Unparsed__c` and `Answer_Type__c = Number`.
6. Re-submitting the same idempotency key returns the first submission and creates no second row.
7. Two simultaneous submissions at the last free slot: exactly one is accepted (Survey and Freeform).
8. Response limit closes the form at the configured count across versions.
9. Safe delete refuses a Freeform that has submissions; Restrict blocks the DML even if the check is
   bypassed.
10. Clone, export and import keep the type `freeform` (today's code would silently make it a Form).
11. Publish succeeds with no object, and the describe validator never asks for one.
12. An unknown form type throws instead of taking the object path.
13. Survey and Form submit paths keep their observable behavior; existing suites pass untouched.

**Jest**

14. Creation gallery offers three kinds; the Freeform path never asks for an object.
15. Palette shows the grouped 19 items for Freeform, 12 for Survey.
16. Question settings hide Topics and Map to field for Freeform.
17. Settings drawer hides the record-link panel and shows the response limit.
18. Publish warnings fire for a type change, a deletion with answers, and public access with file
    questions.
19. Reader renders from the submission's version: a renamed question shows its **original** wording, a
    question added later does not appear, a removed question still appears, renamed choices read as
    submitted, and a question whose type changed renders both old and new rows correctly.

**Org verification** (deployed and clicked through, not just green tests): create → build with a mix
of widgets and general inputs → visibility rule → preview → publish → submit signed-in → submit as a
guest → read both submissions on the record page → rename a question, publish, and confirm the old
submission still reads as submitted → run the report type.

---

# F2 contracts — locked now (D9)

F1 must not contradict these. F2's screens and flows get their own spec.

### 1. Mapping is action-owned and lives at the top of the spec

`spec.mapping.actions`, never inside question definitions. It publishes with the version, so a
submission is mapped by the configuration that existed when it was filled in. Each action owns its
field assignments, and each assignment names its own source:

```jsonc
{
  "id": "createContact",
  "object": "Contact",
  "operation": "create",
  "fields": [
    {
      "field": "Email",
      "source": { "kind": "answer", "elementId": "el_email" }
    },
    { "field": "LeadSource", "source": { "kind": "literal", "value": "Web" } },
    {
      "field": "AccountId",
      "source": { "kind": "recordRef", "actionId": "createAccount" }
    }
  ]
}
```

`kind` is one of `answer` | `literal` | `recordRef`. Two actions may read the same answer. Questions
carry no mapping of their own, so deleting a question surfaces as a validation error on the action
rather than a silent break, and the Studio's "this question maps to…" display is a derived index.

### 2. Every answer is stored, mapped or not

Mapping never decides what is kept.

### 3. The submission commits before mapping runs (D17)

Apex has no mid-transaction commit, so "keep the answers whatever happens to mapping" requires two
transactions, not a savepoint. Transaction 1 stores the submission and answers. Transaction 2 runs
the mapping actions.

### 4. Mapping is all-or-nothing per submission, and retry is serialized (D17)

Within transaction 2, all actions share one savepoint: a failed Contact action leaves no orphan
Account behind. The submission records the outcome (status + message) and the ids of records created.
Those ids are an audit trail, **not** the duplicate guard: retry is allowed only from a failed state,
under a lock on the submission row, so two retries cannot run at once.

### 5. Guest writes need eligibility **and** an author grant (D18)

Create is allowed. Update is allowed only for records the server identifies:

- the record a personalized link names (holding the signed link is the authority);
- records created earlier in the same submission;
- records the guest picked in a lookup question.

For the lookup case, and for any guest update, **the record id from the browser is never trusted on
its own**. The server re-compiles the author's filter, re-checks that the chosen record still
qualifies, and requires an **explicit author grant**: opt-in per action and per field, a filter is
required ("any record of this object" is refused at publish), no reaching through relationships, and
the author sees a plain warning that this is a public write surface. Publish records the disclosure;
the submission records which records were touched.

Note: an anonymous guest has no identity to verify, so "verified authority to update this record"
cannot exist for them — the author's grant is the only honest mechanism. Eligibility to _see_ a
record in a lookup is not authority to change it.

### 6. Autofill rules name their own source object

There is no form-level primary object.

### 7. "Map later" means future submissions

Applying new mappings to already-collected submissions is a separate, explicit action, never a side
effect.

### 8. Mappings are validated at publish

Field types, picklist values, required destination fields, and the author's own permissions.
`Answer_Type__c` gives the type check a reliable input: an Email answer mapped to a numeric field is a
publish error, not a runtime surprise.

## Open for the F2 spec

- The Mapping page's screens, and whether Mapping sections replace the Connected object card (D8).
- Record matching / de-duplication ("find or create a Contact by email") — duplicate rules make this
  its own design round.
- Whether a site guest user can queue asynchronous Apex here; platform events are the fallback (§7.6).
- What the respondent sees while mapping is still pending, and on the thank-you screen.
- Where a failed mapping is retried from, and who may retry it.
- How F2.5 invitations supply the record a personalized link carries.

## Glossary

- **Answer store** — answers kept as rows in our own table, one row per question, instead of columns
  on a Salesforce record.
- **`__c`** — Salesforce's marker for something custom, made by us rather than shipped by Salesforce.
  `Text_Value__c` is our field; `Email` on a Contact is Salesforce's.
- **Savepoint** — a marker in a database transaction you can roll back to. It only helps for failures
  the code catches, which is why mapping gets its own transaction.
- **Idempotency key** — a one-per-attempt marker that lets the server recognise a repeat of the same
  submission instead of storing it twice.
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
