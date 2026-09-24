# Freeform F2 — mapping one submission onto several records

> **Status: DESIGN APPROVED; F2 shipped 2026-09-23 (PRs #318–#322) except the Retry slice (M7,
> deferred); the D49–D57 search redesign is being built.** Approved section by section on
> 2026-09-20 (D29–D37); a review round on 2026-09-21 found seven real problems and the owner ruled on
> each (D38–D48). On 2026-09-23 the owner redesigned the search screen and the condition editor
> (D49–D57; build plan [IMPL_PLAN_F2_SEARCH.md](./IMPL_PLAN_F2_SEARCH.md)). This document is the
> design as it now stands. It is not a build plan — the
> implementation plan comes next and lives in its own document.
>
> F2 is the reason Freeform exists — [FREEFORM_SPEC.md §1](./FREEFORM_SPEC.md). F1 shipped the
> scaffolding: a Freeform can be created, built, filled in, stored and read back, and every answer
> carries a semantic `Answer_Type__c`. Nothing in F1 writes to a Salesforce record. F2 does.
>
> The F2 contracts locked during F1 (FREEFORM_SPEC, "F2 contracts — locked now") are inputs to this
> document, not up for renegotiation here. Where this spec goes further than a contract, it says so.
>
> Companions: [FREEFORM_SPEC.md](./FREEFORM_SPEC.md) ·
> [SURVEY_OBJECT_SPEC.md](./SURVEY_OBJECT_SPEC.md) ·
> [GUEST_PREFILL_LOOKUP_SPEC.md](./GUEST_PREFILL_LOOKUP_SPEC.md) ·
> [FORM_STUDIO_IA.md](./FORM_STUDIO_IA.md) · [DEFERRED.md](../DEFERRED.md).
>
> A full-page mockup of the Mapping screen exists as a private Artifact:
> <https://claude.ai/artifact/7KgvXHE7ePZrJDjTEKgLWA> (owner-only until shared).

## 1. What F2 is

One person fills in one form. The org gets an Account, a Contact linked to it, a Partner Application
linked to both. That is the whole feature.

Everything else in this document exists to make that safe: safe for the author who configures it,
safe for the org whose data it writes, and safe for the respondent who never sees any of it.

**What F2 does not change.** Answers are stored exactly as F1 stores them, through the same
`insertFenced` path, in the same transaction, whether or not they are mapped anywhere.
`FinalSubmitService.runFreeform` is not touched at all. Mapping is a second thing that happens
afterwards. If mapping never runs, the submission is still complete and still readable — see
FREEFORM_SPEC F2 contract 2.

## 2. Decision ledger (owner rulings)

Numbering continues FREEFORM_SPEC's ledger, which ends at D28. D29–D37 come from the design session of
2026-09-20; D38–D48 from the review round of 2026-09-21; D49–D57 from the search redesign of
2026-09-23 (D53–D57 also govern visibility rules and lookup filters). Where a later ruling revises an earlier one,
both rows stay and the earlier row says so.

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Date       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --- | --- | --------------------------------------------------------------------------------------------- | ---------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D29 | **Mapping lives in a third Studio mode — Build \| Data \| Design.** Explicitly not the left rail ("it definitely shouldn't fit inside the left palette") and not the Settings drawer. Mapping is what a Freeform is for; it is not a setting on the form and it does not fit an inspector-width column                                                                                                                                                                                                                                                             | 2026-09-20 |
| D30 | **Autofill moves into Data mode too, for all three form types, in its own slice AFTER F2.** F2 ships Data mode with the Mapping section only. This _corrects D7_, which put Freeform Autofill in F2: Freeform Autofill now arrives with the migration slice. No regression — Freeform hides the Autofill rail tab today                                                                                                                                                                                                                                            | 2026-09-20 |
| D31 | **An action may create, update, or find-or-create by a matching field.** Record matching is in F2, not deferred to a later round. _Revised by D39: standalone update is cut._                                                                                                                                                                                                                                                                                                                                                                                      | 2026-09-20 |
| D32 | **On a match, what may be written is opted into per action and per field — and there is no default.** Choosing find-or-create asks the question immediately; until it is answered the action is _incomplete_ and publish is refused. The field used to match is never overwritable                                                                                                                                                                                                                                                                                 | 2026-09-20 |
| D33 | **More than one match fails the mapping.** Nothing is written, the submission records "the match was ambiguous", an admin retries after fixing the data. Never guess which of several people to overwrite                                                                                                                                                                                                                                                                                                                                                          | 2026-09-20 |
| D34 | **The server queues the mapping; the respondent never waits and is never told a match happened.** Submit stores the answers and returns the thank-you screen. No record id, no "we found you", nothing in any error message — otherwise the form becomes a tool for testing which email addresses exist in the org                                                                                                                                                                                                                                                 | 2026-09-20 |
| D35 | **A failed mapping is retried from the submission record, by an admin, one at a time, under a row lock.** No automatic retries: almost every Salesforce mapping failure is deterministic, and retrying an unchanged failure just fails again. _Revised by D42: a bulk path via a status value is added._                                                                                                                                                                                                                                                           | 2026-09-20 |
| D36 | **Mapping writes are guarded by a second fence whose allow-list is the published version's action list.** Mapping creates Accounts and Contacts, which have no business on `insertFenced`'s list, so it is a different guard with a per-form allow-list — checked per record and per field before any DML. Named after D28's lesson: a thing called a fence must actually check                                                                                                                                                                                    | 2026-09-20 |
| D37 | **Publish returns blockers as well as warnings, and blockers refuse the publish.** `FinalPublishWarnings.forPublish` currently returns one advisory list; an action that cannot run is not advisory. _Revised by D38: the refusal lives in the Apex publish itself, not in the dialog._                                                                                                                                                                                                                                                                            | 2026-09-20 |
| D38 | **Mapping validation runs inside the real publish.** `FinalSpecController.publishSpec` validates the exact spec string it is about to store, as the person publishing, before anything is saved — the same place and the same way `FinalAutofillValidator.validateForPublish` already runs today. A blocker refuses the publish; so does a check that cannot finish. The dialog shows the same results, but the dialog is not the gate: an `@AuraEnabled` method can be called without it                                                                          | 2026-09-21 |
| D39 | **Standalone update is cut from F2.** Actions are create or find-or-create. Updating a record the server already holds (a personalized link's record, a record picked in a lookup) had one real use in F2 and it was the riskiest write in the feature. It returns when personalized links come to Freeform — DEFERRED #32                                                                                                                                                                                                                                         | 2026-09-21 |
| D40 | **Two submissions with the same match value at the same moment may both create a record — and preventing that is not ours to do.** The org's duplicate rules run on our inserts whether we ask or not; they are the admin's tool for this. We never save past them (no `allowSave`), and a duplicate-rule refusal lands as a Failed mapping with a readable message                                                                                                                                                                                                | 2026-09-21 |
| D41 | **A trigger on `Form_Submission__c` starts every mapping run.** On insert of a submission whose version has mapping steps, and on a status change to Ready for Retry. The trigger only queues — one background job per submission; mapping is not bulkified. More than 50 in one transaction and the trigger refuses the whole batch, asking for 50 or fewer. Background jobs only; platform events are not used. _Revised by D46: capacity is measured, not assumed to be 50._                                                                                    | 2026-09-21 |
| D42 | **Retry is a button and a status value.** The Retry button on the submission calls the mapping service directly and runs it on the spot. Setting the status to Ready for Retry — on one submission or up to 50 at a time — queues a run through the trigger. Only Failed and Ready for Retry are ever retried; Queued never is. No automatic retries. _Revised by D46: the bulk limit is the save's remaining capacity, not a fixed 50._                                                                                                                           | 2026-09-21 |
| D43 | **Caught failures are recorded; uncaught failures are not handled.** A caught failure sets the status to Failed with a message. An uncaught one rolls everything back, so the status stays where it was and the reason lives in Setup → Apex Jobs, not on the submission. An admin moves a stuck submission to Ready for Retry                                                                                                                                                                                                                                     | 2026-09-21 |
| D44 | **A skipped answer never writes to its field.** The assignment is left out, so nothing is ever blanked by a question someone didn't answer. A skipped or blank **match** value fails that step — we never search for a blank value, which would match every record that lacks one                                                                                                                                                                                                                                                                                  | 2026-09-21 |
| D45 | **Keeping the match answer and the saved field value in step is the author's job, for now.** Nothing stops an author searching on one question and saving another into the same field. Tabled — DEFERRED #33                                                                                                                                                                                                                                                                                                                                                       | 2026-09-21 |
| D46 | **Background-job capacity is measured, not assumed.** The trigger computes `Limits.getLimitQueueableJobs() - Limits.getQueueableJobs()` at the moment it queues, and every refusal states that real number — never a fixed 50. Other automation in the same transaction may already have used capacity, so even a single guest submission can find none left. **New submissions are never refused:** any that do not fit are saved as Failed, so the answers survive and Retry picks them up — refusing would roll back the respondent's answers (owner confirmed) | 2026-09-21 |
| D47 | **A form may have at most 10 mapping steps.** Every step's writes, plus whatever triggers, flows and validation rules the org runs on those objects, share one set of limits inside a single job; ten leaves room for the org's own automation. An eleventh step is a publish blocker                                                                                                                                                                                                                                                                              | 2026-09-21 |
| D48 | **Lookup fields that can point at more than one kind of record are not supported as mapping destinations.** A Task's "Name" and "Related To", or the Owner on a Case or Lead, can each point at several kinds of record, and there is no single target to offer the author. The objects themselves are fine — a form can still create a Task — but those fields are left out of the field list and refused at publish. (First ruled as "no Task or Event"; narrowed to the fields the same day.)                                                                   | 2026-09-22 |
| D49 | **A search filter row compares against a fixed value or an answer.** Columns: Field · Operator · Compare with · Value. Only single-value answers whose type fits the row's field are offered, and the author always picks one — nothing is chosen for them.                                                                                                                                                                                                                                                                                                        | 2026-09-23 |     | D50 | **An author may type the WHERE clause instead of building rows**, in an **Advanced (SOQL)** tab of the conditions dialog. Either-or per step; both drafts are kept while exploring and the replacement is confirmed once, on Apply. Mapping search only. A deliberate exception to "never raw expressions" (visibility rules). | 2026-09-23 |     | D51 | **Answers go into a typed clause through an Insert answer button** as a readable `{Your email}`, stored as `{!<elementId>}`, and always run as bound values — never pasted into query text. **Check conditions** runs the publish check on demand. | 2026-09-23 |     | D52 | **The searched field is pre-filled in the create list, and stays editable.** Choosing "Email matches Your email" adds `Email ← Your email` when Email isn't there yet; deleting that row sticks until the search field changes. Softens D45. | 2026-09-23 |     | D53 | **One condition editor, Form Designer style, in a dialog**, for visibility rules, lookup filters and the mapping search. Each screen spells the conditions out and offers **Edit conditions**; the dialog's button is **Apply conditions**, and problems show beside the control that needs fixing. | 2026-09-23 |     | D54 | **Related fields sit in the Field list, one level deep** — "Account › Type" — found by a searchable picker that loads each relationship on demand. No cap. | 2026-09-23 |     | D55 | **Current user is a condition source**: any User field, plus Profile name and Role name. Visibility rules and lookup filters only; the mapping search keeps refusing `$User` (it runs as whoever submitted — usually the site guest). | 2026-09-23 |     | D56 | **The linked record works for Forms too**: the record a Form is editing (`existingRecordId`). | 2026-09-23 |     | D57 | **Custom logic accepts NOT**; every query we build writes it as `(NOT (…))`. A condition whose record or user details aren't available is _unknown_, combined three-valued, and unknown counts as not met — so no published rule changes and NOT can't reveal a question in create mode. | 2026-09-23 |

## 3. Where it lives — Data mode (D29)

The Studio top bar gains one button. Everything else about the shell — back, form name, version
select, save status, undo/redo, the settings gear, Preview, Publish — is untouched.

| Mode       | What the author is doing       |
| ---------- | ------------------------------ |
| **Build**  | making the form                |
| **Data**   | where values come from, and go |
| **Design** | how it looks                   |

Data mode has two sections, presented as a sub-header inside the mode:

- **Autofill** — Salesforce records → answers, before the form is filled in. Ships in the migration
  slice (D30), not in F2.
- **Mapping** — answers → Salesforce records, after the form is submitted. Ships in F2.

They are two directions of one idea, which is why they share a mode rather than a tab strip. They
also share machinery: both pick an object, both match a field to a value, and both need the
answer-type/field-type compatibility rule that `c/finalSurveyMapping` already owns.

**Type gating.** Data mode is shown for Freeform in F2. Form and Survey gain it when Autofill
migrates. The left rail already varies by form type (`finalFieldPalette.tabs`), so type-gated Studio
chrome is an established pattern here, not a new one.

**The Connected object card stays where it is** (answers the D8 open question). It is a Survey
concept and a form-level setting; it does not become a Mapping section.

## 4. The spec shape

Mapping is action-owned and lives at the top of the spec (FREEFORM_SPEC F2 contract 1). Questions
carry no mapping of their own. An action's `operation` is `create` or `findOrCreate` (D39).

```jsonc
"mapping": {
  "actions": [
    {
      "id": "act_9f3c21a8",
      "object": "Account",
      "operation": "create",
      "fields": [
        { "field": "Name", "source": { "kind": "answer",  "elementKey": "el_1a2b3c4d" } },
        { "field": "Type", "source": { "kind": "literal", "value": "Prospect" } }
      ]
    },
    {
      "id": "act_44b7e0d1",
      "object": "Contact",
      "operation": "findOrCreate",
      "match": {
        "field":  "Email",
        "source": { "kind": "answer", "elementKey": "el_77aa31f2" },
        "filter": { "logic": "all", "rows": [ /* the lookup filter's own shape, compiled by FinalLookupService.compile;
                                                 a row value "$field.<elementKey>" compares with an answer (D49) */ ] },
        // or, instead of rows (D50):  "filterMode": "soql", "soql": "Title = {!el_5d1e0c9a} AND CreatedDate = LAST_N_DAYS:30"
        "onMatch": "reuse"
        // "prefillDeclined": true  — set when the author deletes the pre-filled search row (D52)
      },
      "fields": [
        { "field": "LastName",  "source": { "kind": "answer",    "elementKey": "el_c1d90b23" } },
        { "field": "Email",     "source": { "kind": "answer",    "elementKey": "el_77aa31f2" }, "prefilled": true },
        { "field": "AccountId", "source": { "kind": "recordRef", "ref": "action:act_9f3c21a8" } }
      ]
    }
  ]
}
```

### 4.1 Array order is execution order

There is no sequence field. "Account first" means "Account is index 0". A separate ordering key would
be a second source of truth that can drift from the array it describes.

### 4.2 `elementKey` is the question's identity

The crypto-random `el_xxxxxxxx` id already stored in `Element_Key__c` and already used by the reader
and by the D12 publish warnings. Renaming, re-wording or moving a question leaves the mapping intact.
Deleting and re-adding it breaks the mapping loudly, which is correct: that is a different question
(D12).

### 4.3 `recordRef` has exactly three legal forms

A `recordRef` fills a lookup field — "this Contact's Account is the one from step 1". It never names a
record to write to; with standalone update cut (D39), the only records F2 writes are ones it creates
or finds itself.

| `ref`                 | Means                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| `action:<id>`         | the record an earlier step **created or found**                                  |
| `link`                | the record a personalized link carries (`FinalLinkService`)                      |
| `answer:<elementKey>` | the record the respondent picked in a lookup, bounded by the lookup's own filter |

All three are records **the server** identified. There is deliberately no fourth form in which the
browser names a record id. This is D11/D18 expressed as a data shape rather than as a rule somebody
has to remember to enforce.

In F2 `link` is a publish blocker: a Freeform submission stores no link record, so there is nothing to resolve it against. The shape stays reserved.

A `ref` of `action:<id>` must name an **earlier** action. Forward references and references to
deleted actions are publish blockers (§7).

### 4.4 `onMatch` — and why it has no default (D32)

`onMatch` is absent from a newly created find-or-create action. Choosing the operation asks the
question in plain words: _when we find one: use it as-is, or update it with these answers?_

| Value    | On a match                                                                               |
| -------- | ---------------------------------------------------------------------------------------- |
| `reuse`  | the found record's id is used for relationships; nothing is written to the record itself |
| `update` | the mapped fields marked `writeOnMatch` are written to the found record                  |

`update` makes a per-field `writeOnMatch` flag meaningful; every field starts `false`. The field
named in `match.field` may never carry `writeOnMatch: true` — you do not get to overwrite the value
you matched on.

An action with `operation: "findOrCreate"` and no `onMatch` is **incomplete**, not risky. Publish is
refused, not warned. Unfinished and dangerous are different states and should not get the same
treatment.

This is update-**on-match**, part of find-or-create. It is not the standalone update D39 cut.

### 4.5 Skipped and blank answers (D44)

| The answer…                                     | What happens                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| was skipped, hidden by a rule, or is blank      | that field assignment is left out — the field is not touched     |
| feeding `match.source` was skipped or is blank  | that step fails with a message; no search is run                 |
| is stored unparsed and won't fit the field type | that step fails with a message naming the question and the field |

"Skipped" is not an edge case in a Freeform. Rule-hidden answers are dropped from the payload before
they reach the server (PR #269), so a mapping must expect missing answers routinely.

The blank-match rule matters most. `WHERE Email = null` doesn't fail — it matches every Contact that
has no email, which is either a false "ambiguous" or, worse, a single unrelated record treated as the
respondent.

A consequence worth warning about: a **required** destination field fed by an **optional** question
fails its step whenever that question is skipped. Publish warns about it (§7).

### 4.6 The typed clause — Advanced (SOQL) (D50, D51)

`match.filterMode: "soql"` replaces the filter rows with `match.soql`: the part of a SOQL query after
`WHERE`, on the step's own object. It still runs as
`SELECT Id FROM <object> WHERE <match field> = :value AND (<clause>) LIMIT 2`.

- **Answers** are stored as `{!<elementId>}` and shown to the author as `{<question label>}`. Each
  must sit right after a field and a comparison (`Email = {Your email}`); the runtime converts the
  answer against that field (label or stored value, F2 decision 7) and binds it — never pastes it.
  After `LIKE`, `%`, `_` and `\` in the answer are escaped, so it matches as typed.
- **Refused, outside quoted text:** `;`, `$`, a `:` that starts a bind (`LAST_N_DAYS:30` is fine),
  and the words `SELECT FROM LIMIT OFFSET ORDER GROUP HAVING FOR WITH USING UPDATE TYPEOF ALL` — so
  no sub-queries. At most 4,000 characters. NOT must be bracketed after another condition:
  `A AND (NOT B)` (Salesforce refuses `A AND NOT B`).
- Checked at publish, and on demand by **Check conditions**, by test-running
  `SELECT Id … WHERE <clause> LIMIT 0` **as the author** (`USER_MODE`). Run in the background in
  system mode, like rows.
- `filterMode` absent = rows, so every mapping published before D50 is unchanged.

## 5. The authoring UI

Three columns. A full-page mockup is linked in the status header.

### 5.1 Left — the records, in order

One card per action, in run order, drag to reorder. Each card shows the object, the operation, the
field count, and its state: fine, incomplete (blocks publish), or carrying a warning. "Add a record"
opens an object picker limited to objects the author can create — both operations may create, and
filtering the list is kinder than failing at publish.

A footer states the bargain plainly: if any step fails none of the records are created, and the
answers are kept regardless.

### 5.2 Middle — the selected action

Order on screen: the match block, then the match question, then the fields. The match settings come
first because they change what the fields _mean_. _Revised 2026-09-23 (D52–D53):_ the step is laid
out as its branches —

```
FIND AN EXISTING CONTACT
  Where [Email ▾] matches the answer to [Your email ▾]
  Only records where:  1  Title equals "Manager"   [Edit conditions]
IF ONE IS FOUND
  Use it as-is. Nothing is written to it.   Change
IF NONE IS FOUND — CREATE A CONTACT WITH
  Field on Contact | Gets its value from | Also update when found (update only) | ×
```

An Always create step shows only "Create a Contact with". The searched field is pre-filled in the
create list (D52).

- **The match block** names the field, the answer it is compared against, and the filter. A filter is
  mandatory — "any record of this object" is already refused at publish for lookups, and matching is
  a search by another name. The filter is edited in the shared conditions dialog (D53): rows with
  Compare with a fixed value or an answer (D49), or the Advanced (SOQL) tab (D50).
- **The match question** (§4.4) is amber and unmissable, and on a public form it says why in one
  sentence: _anyone who guesses a real email address reaches whatever you allow here, without signing
  in._ Answering `reuse` collapses it to a quiet line. Answering `update` reveals the per-field
  ticks, all off.
- **The field table** is `Field on <Object>` against `Gets its value from`. Required fields are
  marked. The match field shows a lock and the reason: _used to match — never overwritten_.

**The source picker offers only what fits.** Choosing a source for a Phone field offers "an answer"
(with a count of the questions whose `Answer_Type__c` can survive the trip) and "a fixed value".
"Another record" is shown but dead, with the reason visible — _Phone is not a lookup field_. That is
the palette's existing inform-and-abort grammar (the Repeating Group with no target object), not a
toast and not a silent omission.

### 5.3 Right — the derived index

Every question, and where its answer lands. Answers that reach no record read **Stored only** — a
fact, not a scolding, because FREEFORM_SPEC F2 contract 2 guarantees they are stored and readable
either way. A filter narrows the list to just those.

**This panel is read-only, everywhere it appears.** The same index appears in Build mode's property
panel when a question is selected ("goes to Contact · Phone", with a link into Data mode). Mapping is
edited in exactly one place. One writer, one truth.

### 5.4 One compatibility rule, not two

The compatibility rule lives once, in Apex (`FinalMappingRules.COMPATIBLE`). The Studio fetches it,
so the rule publish enforces and the rule the source picker shows are the same rule. One conversion
(`FinalMappingRules.answerValue`) turns an answer into the destination field's vocabulary for every
path — writing a field, searching for the record, and a filter condition — each against the field
that value actually meets.

| Answer type | May go into                               |
| ----------- | ----------------------------------------- |
| Text        | Text, Text Area                           |
| Email       | Email, Text, Text Area                    |
| Phone       | Phone, Text, Text Area                    |
| URL         | URL, Text, Text Area                      |
| Choice      | Picklist (value), Text, Text Area (label) |
| Options     | Multi-select picklist                     |
| Number      | Number, Currency, Percent                 |
| Boolean     | Checkbox                                  |
| Date        | Date                                      |
| DateTime    | Date/Time                                 |

## 6. The runtime

### 6.1 Submit — untouched

`FinalSubmitService.runFreeform` stores the submission and its answers exactly as today, through
`insertFenced`, and does nothing about mapping. The respondent gets the thank-you screen immediately
and learns nothing about records (D34). Everything below is started by the trigger.

### 6.2 New fields on `Form_Submission__c`

It carries seven fields today. Five more:

| Field                 | Type                 | Purpose                                               |
| --------------------- | -------------------- | ----------------------------------------------------- |
| `Mapping_Status__c`   | Picklist, restricted | Not needed / Queued / Done / Failed / Ready for Retry |
| `Mapping_Message__c`  | Long Text Area       | why it failed, in words an admin can act on           |
| `Mapping_Attempts__c` | Number               | how many runs have been tried                         |
| `Mapping_Run_At__c`   | Date/Time            | when the last run finished                            |
| `Created_Records__c`  | Long Text Area       | JSON, action id → record id                           |

There is **no Running value.** The status change and the work happen inside one transaction, so a
"Running" status could never be seen by anyone — it would be committed and replaced in the same
breath, or rolled back with everything else.

`Created_Records__c` is **audit only** (D17). The duplicate guard is `Mapping_Status__c`, checked
under a row lock.

### 6.3 The trigger (D41)

One trigger on `Form_Submission__c`, one job: decide which submissions need a run, and queue them.

- **Before insert** — read each submission's version (one query for the whole batch, in system mode,
  because a guest cannot read `Form_Version__c`) and set `Mapping_Status__c` to Queued when the
  version has mapping steps, Not needed when it has none.
- **After insert** — queue a background job for each Queued submission.
- **After update** — queue a job for each submission whose status just **changed to** Ready for
  Retry. Nothing else on update does anything; the job's own status writes must not re-trigger it.

**Capacity is measured, never assumed, and never exceeded (D46).** Salesforce caps how many
background jobs one transaction may queue, and going over is one of the errors Apex cannot catch — it
kills the whole transaction, including a guest's submission. So the trigger computes what is actually
left at the moment it queues:

```apex
Integer capacity = Limits.getLimitQueueableJobs() - Limits.getQueueableJobs();
```

Not a fixed 50. Other automation in the same transaction — another trigger, a flow, a managed package
— may already have queued jobs, so capacity can be anything down to zero, **even when the trigger is
looking at a single guest submission.**

Capacity is read at the moment of queueing, in the after-insert and after-update steps — not earlier,
because other triggers on this object can run in between and use some.

When the trigger needs more than `capacity`:

- **A bulk retry (status changed to Ready for Retry)** — the whole batch is refused, and the message
  states the real number: _Only 12 more background jobs can be started in this save — retry 12 or
  fewer submissions at a time._ At zero it says that, rather than asking for "0 or fewer": _No
  background jobs can be started in this save — other automation has already used them. Retry in a
  separate save._
- **New submissions (insert)** — never refused. Refusing would roll back the respondent's answers,
  which nothing in mapping is allowed to do. The trigger queues as many as capacity allows; any that
  don't fit are set to **Failed**, by an update in the same transaction, with _The mapping could not
  be started: no background-job capacity was left when this submission was saved. Retry it._ The
  answers commit either way, and the Retry button picks them up.

**If queueing throws a catchable error**, the submission is set to Failed with that message, so it is
visible and retryable. The answers are never lost to it.

**Mapping is not bulkified.** Each submission has its own version, its own steps, its own searches. A
four-step form processed 200 at a time is 800 separate writes against a limit of 150. One job per
submission is correct, not a compromise.

### 6.4 The mapping service

`FinalMappingService.run(Id submissionId)` — called by the background job and, directly, by the
Retry button. The same code on both paths.

```
1. lock the submission (SELECT … FOR UPDATE)
2. refuse unless status is Queued, Failed or Ready for Retry     ← this IS the replay guard
3. attempts++                                                    → DML
4. savepoint                                                     ← after the attempts write
5. read the mapping from the submission's OWN version            ← D19, same rule as the reader
6. run the steps in order, carrying Map<actionId, Id> so recordRef resolves
7. caught failure → rollback(savepoint), THEN status Failed + message
   success       → status Done, Created_Records__c, Mapping_Run_At__c
```

**Why the savepoint sits after step 3:** a rollback to it keeps the attempt count. The failure message
is written after the rollback, so it survives wherever the savepoint sits — the placement is about the
counter, not the message.

**After a rollback, never reuse the in-memory records.** Salesforce undoes the rows but leaves the Ids
on the sObjects in memory, so they point at records that no longer exist. Step 7 writes status only.

**It runs as whoever queued it.** For a new submission that is the guest user. Our writes are
explicitly system mode so they go through; anything in the job that isn't explicitly system mode runs
with a guest's record access. System mode is a setting on individual database calls, not a mode the
job runs in.

The savepoint is legitimate here in a way it was not in F1 (D17): everything it protects lives inside
this transaction, and the answers were committed by the submit, where nothing in here can reach them.

### 6.5 The ambiguous match (D33)

More than one match is a failure, not a choice. Rollback, status Failed, message says the match was
ambiguous and names the step. Nothing is written.

### 6.6 The org's duplicate rules (D40)

Our match is our own query, but it does not replace the org's duplicate rules — those run on every
insert we make, whether we ask or not.

- If a duplicate rule blocks a create, that step fails, the mapping is Failed, and the message says so
  in words: _Salesforce's duplicate rules blocked creating this Contact_ — not a raw error code.
- We never set `DuplicateRuleHeader.allowSave`. The org's rules outrank our form.
- Two submissions with the same email in the same second can both find nothing and both create a
  Contact. That is exactly what duplicate rules exist for, and configuring them is the admin's call.

### 6.7 Failures we don't handle (D43)

An uncaught exception — a limit exceeded inside a destination trigger or flow, typically — rolls back
the whole run, including the attempt count and any status change. The submission stays on whatever
status it had, and **the reason is not on the submission**; Setup → Apex Jobs lists the failed job and
its error. An admin moves the submission to Ready for Retry once the cause is fixed.

## 7. Publish (D38)

**The gate is `FinalSpecController.publishSpec`.** It gains a `FinalMappingValidator.validateForPublish`
call beside the `FinalAutofillValidator.validateForPublish` call it already makes: same method, before
anything is saved, on the same spec string that gets stored, running as the person publishing. Any
blocker throws and the publish is refused. A check that cannot finish throws too — "couldn't check" is
a refusal, never a pass.

It must be one call, not "validate" followed by "publish": `publishSpec` already stores exactly the
string it was handed, so what was checked is what gets saved.

**The dialog shows the same results.** `FinalPublishWarnings.forPublish` runs the same validator
without throwing and returns blockers beside the warnings; `c/finalPublishDialog` shows blockers above
warnings and disables Publish while any exist. That is a change to a component that shipped on
2026-09-20 (PR #306). But the dialog is display only — an `@AuraEnabled` method can be called without
it, which is why the refusal lives in `publishSpec`.

**Blockers — publish is refused:**

- a find-or-create whose match question is unanswered (§4.4)
- a required destination field with no source at all
- a field the publisher cannot write — this check _is_ the access control (§8), so it runs against live
  describe data as the publisher, never a cached list
- a find-or-create with no filter
- a `recordRef` naming a later action, or one that no longer exists
- an answer whose `Answer_Type__c` cannot survive the trip to the destination field type
- a Choice source whose stored values are not in the destination picklist's value set
- a current-user value (`$User.`) in a match filter — the job runs as whoever queued it, often a
  site guest
- a `recordRef` of `link` (see 4.3)
- a matrix, ranking or file question used as a source — its answer is not one value for one field
- a lookup field that can point at more than one kind of record (D48)
- an action on a setup object (User, Group, permission assignments and the like) — Salesforce refuses
  to write those in the same transaction as ordinary records
- more than 10 steps (D47)
- a filter row or typed-clause answer that is gone, is a multi-value question (matrix, ranking, file,
  several choices), doesn't fit the field it's compared with, or is used with a list comparison or
  with LIKE on a non-text field (D49, D51)
- an Advanced (SOQL) clause that the parser refuses (§4.6), or that doesn't run when tested as the
  publisher — Salesforce's own message is shown

**Warnings — publish proceeds, after the author confirms:**

- a public form with any `onMatch: "update"` action, naming the object and every overwritable field
- a required field, or a match, fed by an optional question — skipping it fails that step (§4.5)
- a filter row or typed clause that compares with an optional question — skipping it fails that step
- the existing D12 / D20 warnings, unchanged

## 8. Permissions, and the bargain

A site guest user cannot create an Account. Running the mapping in `USER_MODE` therefore kills the
feature for the form type it exists to serve. So mapping writes in system mode, and the real access
control moves to publish time:

1. **the publisher may only map objects and fields they themselves can write** — checked inside
   `publishSpec`, as the publisher (§7);
2. **nothing edits a published version today** — publishing creates a new `Form_Version__c` and
   deactivates the old one. That is how the code behaves, not a guard the database enforces; the
   runtime reads whichever version the submission points at;
3. **`FinalMappingWriter` checks every record and every field against that version's action list
   before any DML** and throws on anything else (D36).

**Guests never see the mapping.** `FinalGuestController`'s projection removes `mapping` along with every other piece of binding vocabulary, so a public form does not ship its target objects, field names or search filter to the browser.

This is the same bargain as `insertFenced`: skip the permission check, replace it with an explicit
list. The difference is that the list is per-form rather than hardcoded, which makes it more powerful
and therefore more important to actually enforce — D28's lesson, applied on the way in this time.

**Permission sets.**

- `Freeform_Submission_Reader` — read on the five new fields.
- `Freeform_Submission_Admin` — edit on `Mapping_Status__c` (that is the bulk-retry permission: it lets
  an admin set Ready for Retry), the custom permission `Freeform_Retry_Mapping` (the Retry button's
  permission), and class access to the retry controller.
- `Form_Builder_Admin` — class access to the new publish-side classes. Apex class access is required
  and its absence is invisible, since nothing fails a build (FREEFORM_SPEC §5.4).

### 8.1 Retry (D42)

**The button.** `c/finalSubmissionReader` shows Retry mapping when the status is Failed or Ready for
Retry, with `Mapping_Message__c` beside it. It calls an `@AuraEnabled` method that checks, **on the
server**: the caller holds `Freeform_Retry_Mapping`, the caller can see this submission (queried in
user mode), and the status is Failed or Ready for Retry. Then it calls `FinalMappingService.run`
directly — the run happens now, in the admin's transaction, and the reader shows the result. Hiding the
button protects nothing on its own; the checks are in the method.

**The status value.** Setting `Mapping_Status__c` to Ready for Retry — one record, or as many as the
save's remaining background-job capacity allows (50 when nothing else has used any), from a list view
or a data load — queues a run for each through the trigger (§6.3).

Both paths end in the same service under the same row lock, so a button press and a queued run cannot
both succeed on one submission: whichever gets the lock second finds Done and stops.

Queued is never retried by either path. A submission stuck on Queued after an uncaught failure is
recovered by setting it to Ready for Retry.

## 9. Acceptance tests

Each of these fails when its guard is removed, and each will be proven that way — by reverting the
fix and re-running — the way the F1 review round was.

| #   | Test                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | a record whose object is not in the published action list is refused by `FinalMappingWriter`                                                                                                                           |
| 2   | a field not named in the published action is refused, even on an allowed object                                                                                                                                        |
| 3   | two matches → nothing written, status Failed, message says ambiguous                                                                                                                                                   |
| 4   | a failed run keeps `Mapping_Attempts__c = 1` and carries a message                                                                                                                                                     |
| 5   | running the service twice for one submission creates one set of records                                                                                                                                                |
| 6   | `recordRef` in step 2 resolves to the record step 1 created, and to the record it found                                                                                                                                |
| 7   | `onMatch: "reuse"` writes nothing to the matched record                                                                                                                                                                |
| 8   | `onMatch: "update"` writes only the fields flagged `writeOnMatch`, and never the match field                                                                                                                           |
| 9   | `publishSpec`, called directly with no dialog, refuses a find-or-create whose match question is unanswered                                                                                                             |
| 10  | `publishSpec` refuses a field the publisher cannot write                                                                                                                                                               |
| 11  | the Retry method refuses a caller without `Freeform_Retry_Mapping`, and refuses Queued and Done submissions                                                                                                            |
| 12  | setting Ready for Retry queues a run; a bulk retry larger than the remaining capacity is refused, and the message states the real remaining number — tested with capacity already partly used, so the number is not 50 |
| 13  | a skipped answer leaves its destination field untouched on an update-on-match                                                                                                                                          |
| 14  | a blank match value fails the step and runs no search                                                                                                                                                                  |
| 15  | a mapping failure leaves the submission and every answer intact and readable                                                                                                                                           |
| 16  | a new submission saved after other code has used up all capacity still commits with its answers, and lands as Failed with the capacity message                                                                         |
| 17  | `publishSpec` refuses a mapping with 11 steps                                                                                                                                                                          |

Tests 12 and 16 use up capacity deliberately — the test queues dummy jobs first — so they prove the
trigger reads what is left rather than assuming 50.

**Checked in the org walkthrough, not in Apex tests:** a duplicate rule blocking a create lands as
Failed with a readable message. Apex tests cannot create duplicate rules, so this one can only be
proven against a real org configuration.

## 10. Out of scope for F2

- **Autofill** — moves into Data mode in its own slice afterwards, for all three types (D30).
- **Updating a record the server already holds** — cut (D39), DEFERRED #32.
- ~~**Keeping the match answer and the saved value in step** — the author's job for now (D45),~~ — softened by D52 (the searched field is pre-filled),
  DEFERRED #33.
- **Preventing duplicates across submissions** — the org's duplicate rules do that (D40).
- **Lookup fields that can point at more than one kind of record** — a Task's Related To, a Case's Owner (D48).
- **Automatic retry** of any kind (D42).
- **Recording uncaught failures on the submission** — they are left to Setup → Apex Jobs (D43).
- **Platform events** — background jobs only (D41).
- **Stopping Done → Ready for Retry.** Nothing prevents an admin setting a successful submission
  to Ready for Retry, which would create every record a second time. Not guarded — it is a
  deliberate admin act (owner, 2026-09-21: don't worry about it).
- **A separate proof that a guest's submission can queue a background job.** The runtime slice
  and the org walkthrough exercise it directly (owner, 2026-09-21).

## 11. Still open

- **Whether the derived index (§5.3) is a third column or a bottom strip.** The column fits at 1440px;
  1280px is tight.

## 12. Build shape

Eight slices, detailed in the implementation plan that follows this spec:

| Slice | What                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------- |
| M1    | schema — five fields, the status picklist, the custom permission, permission set grants            |
| M2    | spec model + `FinalMappingValidator` inside `publishSpec` + blockers in the dialog (§7)            |
| M3    | Data mode shell + Mapping section + the action list (§3, §5.1)                                     |
| M4    | the action editor, create: field table and source picker (§5.2)                                    |
| M5    | find-or-create: match block, the match question, `writeOnMatch`, skipped answers (§4.4–4.5)        |
| M6    | the runtime: trigger, background job, `FinalMappingService`, `FinalMappingWriter` (§6)             |
| M7    | the reader: status, message, created records, the Retry button and its method (§8.1)               |
| M8    | org walkthrough — **starting with a site publish**, because a metadata deploy never reaches guests |

## Glossary

Terms introduced by this document. FREEFORM_SPEC's glossary still applies.

- **Action / step** — one record this form creates or finds. A Freeform that feeds four objects has
  four.
- **Find or create** — look for an existing record matching one field; use it if found, make a new
  one if not.
- **Ambiguous match** — the search found more than one record, so there is no single right answer and
  we refuse to pick one.
- **`recordRef`** — a lookup field's value is another record, identified by the server rather than
  named by the browser.
- **Background job (Queueable)** — Salesforce's way of saying "run this shortly, in its own
  transaction". The respondent does not wait for it.
- **Trigger** — code Salesforce runs automatically whenever a record of an object is inserted or
  updated, however it got there: a form, a list view, a data load.
- **Row lock (`FOR UPDATE`)** — holding a record while you work on it so two runs cannot both decide
  they are the one doing the work.
- **Blocker (at publish)** — something that makes the form unable to run, so publishing is refused
  rather than warned about.
- **Describe** — asking Salesforce at runtime what an object's fields are and what types they have,
  instead of assuming.
- **Duplicate rule** — an org's own setting that blocks or flags a new record resembling an existing
  one. It applies to our inserts like anyone else's.
- **Custom permission** — a named switch an admin grants through a permission set, which Apex can
  check directly. Used here so the Retry method can ask "is this person allowed?" itself.
