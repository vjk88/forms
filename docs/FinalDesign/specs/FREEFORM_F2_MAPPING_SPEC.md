# Freeform F2 — mapping one submission onto several records

> **Status: DESIGN APPROVED, no code written** (2026-09-20). This is the design the owner signed off
> section by section in conversation; it is not a build plan. The implementation plan comes next and
> lives in its own document.
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
linked to both, and a follow-up Task. That is the whole feature.

Everything else in this document exists to make that safe: safe for the author who configures it,
safe for the org whose data it writes, and safe for the respondent who never sees any of it.

**What F2 does not change.** Answers are stored exactly as F1 stores them, through the same
`insertFenced` path, in the same transaction, whether or not they are mapped anywhere. Mapping is a
second thing that happens afterwards. If mapping never runs, the submission is still complete and
still readable — see FREEFORM_SPEC F2 contract 2.

## 2. Decision ledger (owner rulings)

Numbering continues FREEFORM_SPEC's ledger, which ends at D28. These are the rulings from the design
session of 2026-09-20.

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                                          | Date       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D29 | **Mapping lives in a third Studio mode — Build \| Data \| Design.** Explicitly not the left rail ("it definitely shouldn't fit inside the left palette") and not the Settings drawer. Mapping is what a Freeform is for; it is not a setting on the form and it does not fit an inspector-width column                                                                          | 2026-09-20 |
| D30 | **Autofill moves into Data mode too, for all three form types, in its own slice AFTER F2.** F2 ships Data mode with the Mapping section only. This _corrects D7_, which put Freeform Autofill in F2: Freeform Autofill now arrives with the migration slice. No regression — Freeform hides the Autofill rail tab today                                                         | 2026-09-20 |
| D31 | **An action may create, update, or find-or-create by a matching field.** Record matching is in F2, not deferred to a later round                                                                                                                                                                                                                                                | 2026-09-20 |
| D32 | **On a match, what may be written is opted into per action and per field — and there is no default.** Choosing find-or-create asks the question immediately; until it is answered the action is _incomplete_ and publish is refused. The field used to match is never overwritable                                                                                              | 2026-09-20 |
| D33 | **More than one match fails the mapping.** Nothing is written, the submission records "the match was ambiguous", an admin retries after fixing the data. Never guess which of several people to overwrite                                                                                                                                                                       | 2026-09-20 |
| D34 | **The server queues the mapping; the respondent never waits and is never told a match happened.** Submit stores the answers and returns the thank-you screen. No record id, no "we found you", nothing in any error message — otherwise the form becomes a tool for testing which email addresses exist in the org                                                              | 2026-09-20 |
| D35 | **A failed mapping is retried from the submission record, by an admin, one at a time, under a row lock.** No automatic retries: almost every Salesforce mapping failure is deterministic, and retrying an unchanged failure just fails again                                                                                                                                    | 2026-09-20 |
| D36 | **Mapping writes are guarded by a second fence whose allow-list is the published version's action list.** Mapping creates Accounts and Contacts, which have no business on `insertFenced`'s list, so it is a different guard with a per-form allow-list — checked per record and per field before any DML. Named after D28's lesson: a thing called a fence must actually check | 2026-09-20 |
| D37 | **Publish returns blockers as well as warnings, and blockers refuse the publish.** `FinalPublishWarnings.forPublish` currently returns one advisory list; an action that cannot run is not advisory                                                                                                                                                                             | 2026-09-20 |

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
carry no mapping of their own.

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
        "filter": { "logic": "all", "rules": [ /* same shape as lookup filters */ ] },
        "onMatch": "reuse"
      },
      "fields": [
        { "field": "LastName",  "source": { "kind": "answer",    "elementKey": "el_c1d90b23" } },
        { "field": "Email",     "source": { "kind": "answer",    "elementKey": "el_77aa31f2" } },
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

| `ref`                 | Means                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `action:<id>`         | a record this submission created in an earlier action             |
| `link`                | the record a personalized link carries (F2.5, `FinalLinkService`) |
| `answer:<elementKey>` | a record the respondent picked in a lookup, bounded by its filter |

All three are records **the server** identified. There is deliberately no fourth form in which the
browser names a record id. This is D11/D18 expressed as a data shape rather than as a rule somebody
has to remember to enforce.

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

## 5. The authoring UI

Three columns. A full-page mockup is linked in the status header.

### 5.1 Left — the records, in order

One card per action, in run order, drag to reorder. Each card shows the object, the operation, the
field count, and its state: fine, incomplete (blocks publish), or carrying a warning. "Add a record"
opens an object picker limited to objects the author can create — publish validates the author's own
permissions anyway (§8), and filtering the list is kinder than failing at the end.

A footer states the bargain plainly: if any step fails none of the records are created, and the
answers are kept regardless.

### 5.2 Middle — the selected action

Order on screen: the match block, then the match question, then the fields. The match settings come
first because they change what the fields _mean_.

- **The match block** names the field, the answer it is compared against, and the filter. A filter is
  mandatory — "any record of this object" is already refused at publish for lookups, and matching is
  a search by another name.
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

`c/finalSurveyMapping` already owns answer-type/field-type compatibility and is genuinely imported by
both `finalPropertyPanel` and `finalFormStudio` (verified, not inferred from its header comment). F2
extends that module rather than starting a second one.

It does need a new function: today's `compatInputTypes` speaks _form_ input types, and mapping needs
to speak Salesforce describe types against `Answer_Type__c`. Same module, so the two cannot drift.

## 6. The runtime

### 6.1 Transaction 1 — unchanged

`FinalSubmitService.runFreeform` stores the submission and its answers exactly as today, through
`insertFenced`. Two additions:

1. if the published version has `mapping.actions`, the submission is born with
   `Mapping_Status__c = 'Queued'`;
2. the mapping job is enqueued as the last act of the transaction.

The respondent gets the thank-you screen immediately and learns nothing about records (D34).

### 6.2 New fields on `Form_Submission__c`

It carries seven fields today. Five more:

| Field                 | Type                 | Purpose                                       |
| --------------------- | -------------------- | --------------------------------------------- |
| `Mapping_Status__c`   | Picklist, restricted | Not needed / Queued / Running / Done / Failed |
| `Mapping_Message__c`  | Long Text Area       | why it failed, in words an admin can act on   |
| `Mapping_Attempts__c` | Number               | how many runs have been tried                 |
| `Mapping_Run_At__c`   | Date/Time            | when the last run finished                    |
| `Created_Records__c`  | Long Text Area       | JSON, action id → record id                   |

`Created_Records__c` is **audit only** (D17). The duplicate guard is `Mapping_Status__c`, checked
under a row lock.

### 6.3 Transaction 2 — `FinalMappingRunner`

```
1. SELECT … FROM Form_Submission__c WHERE Id = :id FOR UPDATE
2. refuse unless status is Queued or Failed          ← this IS the replay guard
3. status = Running, attempts++                      → DML
4. savepoint                                          ← taken AFTER the status write
5. read mapping from the submission's OWN version    ← D19, same rule as the reader
6. walk actions in order, carrying Map<actionId, Id> so recordRef resolves
7. failure → rollback(savepoint), THEN status = Failed + message
   success → status = Done, Created_Records__c = the map, Mapping_Run_At__c = now
```

**Step 4's position is not stylistic.** Take the savepoint before step 3 and a rollback erases the
attempt counter and the failure message along with the records — the submission would look like it
never tried, which destroys exactly the evidence an admin needs. This has its own acceptance test
(§9).

The savepoint is legitimate here in a way it was not in F1 (D17): everything it protects lives inside
transaction 2, and the answers were committed in transaction 1, where no failure in here can reach
them.

### 6.4 The ambiguous match (D33)

More than one match is a failure, not a choice. Rollback, status Failed, message says the match was
ambiguous and names the action. Nothing is written.

### 6.5 The transport, and the spike that decides it

The job is a Queueable. **Whether a site guest user can enqueue Apex is unverified**, and it is the
one thing that can change the shape of the runtime. The documented fallback is a platform event
published from transaction 1, with a trigger that runs the mapping as the automated process user.

This spike runs **before** any runtime code is written. Discovering it halfway through means
rewriting the slice.

## 7. Publish (D37)

`FinalPublishWarnings.forPublish(Id, String)` returns a `List<String>` today, all advisory. It grows
into two lists, and `c/finalPublishDialog` grows a blockers block above the warnings with Publish
disabled while any blocker exists.

That is a change to a component that shipped on 2026-09-20 (PR #306). Saying so here so it is not
discovered as a surprise during the build.

**Blockers — publish is refused:**

- an action whose match question is unanswered (§4.4)
- a required destination field with no source
- a field the author cannot write — this check _is_ the access control (§8), so it runs in the
  author's context against live describe data, never a cached list
- a find-or-create with no filter
- a `recordRef` naming a later action, or one that no longer exists
- an answer whose `Answer_Type__c` cannot survive the trip to the destination field type
- a Choice source whose stored values are not in the destination picklist's value set

**Warnings — publish proceeds, after the author confirms:**

- a public form with any `onMatch: "update"` action, naming the object and every overwritable field
- the existing D12 / D20 warnings, unchanged

## 8. Permissions, and the bargain

A site guest user cannot create an Account. Running the mapping in `USER_MODE` therefore kills the
feature for the form type it exists to serve. So mapping writes in system mode, and the real access
control moves to publish time:

1. **the author may only map objects and fields they themselves can write** — checked at publish, in
   the author's context (§7);
2. **the published version is immutable**, so the action list cannot change under a running form;
3. **`FinalMappingWriter` checks every record and every field against that version's action list
   before any DML** and throws on anything else (D36).

This is the same bargain as `insertFenced`: skip the permission check, replace it with an explicit
list. The difference is that the list is per-form rather than hardcoded, which makes it more powerful
and therefore more important to actually enforce — which is the whole of D28's lesson, applied on the
way in this time rather than after a review catches it.

**Permission sets.** `Freeform_Submission_Reader` gains read on the five new fields;
`Freeform_Submission_Admin` gains edit on `Mapping_Status__c` and `Mapping_Message__c` and is the
permission that gates Retry (§ below). `Form_Builder_Admin` gains access to the new Apex classes —
Apex class access is required and its absence is invisible, since nothing fails a build (FREEFORM_SPEC
§5.4).

### 8.1 Retry (D35)

`c/finalSubmissionReader` grows a Retry mapping button that appears only when `Mapping_Status__c` is
Failed, shows `Mapping_Message__c`, and is gated on `Freeform_Submission_Admin`. It re-enters
`FinalMappingRunner` under the same row lock, so a retry cannot race a run already in flight. One
submission at a time. No bulk retry, no automatic retry.

## 9. Acceptance tests

Each of these fails when its guard is removed, and each will be proven that way — by reverting the
fix and re-running — the way the F1 review round was.

| #   | Test                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- |
| 1   | a record whose object is not in the published action list is refused by `FinalMappingWriter`   |
| 2   | a field not named in the published action is refused, even on an allowed object                |
| 3   | two matches → nothing written, status Failed, message says ambiguous                           |
| 4   | a failed run still has `Mapping_Attempts__c = 1` and a message (the §6.3 savepoint-order trap) |
| 5   | running the job twice for one submission creates one set of records                            |
| 6   | `recordRef` in action 2 resolves to the record action 1 created                                |
| 7   | `onMatch: "reuse"` writes nothing to the matched record                                        |
| 8   | `onMatch: "update"` writes only the fields flagged `writeOnMatch`, and never the match field   |
| 9   | publish is refused for an action with no `onMatch`                                             |
| 10  | publish is refused for a field the author cannot write                                         |
| 11  | Retry appears only on Failed, and only with `Freeform_Submission_Admin`                        |
| 12  | a mapping failure leaves the submission and every answer intact and readable                   |

## 10. Out of scope for F2

- **Autofill** — moves into Data mode in its own slice afterwards, for all three types (D30).
- **Bulk retry** from a list view (D35).
- **Automatic retry** with backoff (D35).
- **F2.5 invitations** — how a personalized link supplies `ref: "link"` is that phase's problem.
- **Duplicate rules** — Salesforce's own matching/duplicate rules are not consulted; `match` is our
  own query, bounded by the author's filter.

## 11. Still open

- Whether a site guest user can enqueue Apex (§6.5). Spike first, before runtime code.
- Whether the derived index (§5.3) is a third column or a bottom strip. The column fits at 1440px;
  1280px is tight.
- How many actions one form may have. There is a governor limit somewhere and nobody has found it
  yet.

## 12. Build shape

A spike, then eight slices, detailed in the implementation plan that follows this spec:

| Slice | What                                                                   |
| ----- | ---------------------------------------------------------------------- |
| M0    | the guest-enqueue spike (§6.5)                                         |
| M1    | schema — five fields, the restricted picklist, permission set grants   |
| M2    | spec model + publish validation, blockers and warnings (§4, §7)        |
| M3    | Data mode shell + Mapping section + the action list (§3, §5.1)         |
| M4    | the action editor, create-only: field table and source picker (§5.2)   |
| M5    | find-or-create: match block, the match question, `writeOnMatch` (§4.4) |
| M6    | the runtime: queue, runner, writer fence, status (§6)                  |
| M7    | the reader: status, created records, retry (§8.1)                      |
| M8    | org walkthrough — **starting with a site publish**, because a metadata |
|       | deploy never reaches guests                                            |

## Glossary

Terms introduced by this document. FREEFORM_SPEC's glossary still applies.

- **Action** — one record this form creates or updates. A Freeform that feeds four objects has four
  actions.
- **Find or create** — look for an existing record matching one field; use it if found, make a new
  one if not.
- **Ambiguous match** — the search found more than one record, so there is no single right answer and
  we refuse to pick one.
- **`recordRef`** — a field's value is another record, identified by the server rather than named by
  the browser.
- **Queueable** — Salesforce's way of saying "run this shortly, in its own transaction". The
  respondent does not wait for it.
- **Row lock (`FOR UPDATE`)** — holding a record while you work on it so two runs cannot both decide
  they are the one doing the work.
- **Blocker (at publish)** — something that makes the form unable to run, so publishing is refused
  rather than warned about.
- **Describe** — asking Salesforce at runtime what an object's fields are and what types they have,
  instead of assuming.
