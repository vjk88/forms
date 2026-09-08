# IMPL_PLAN — Forms on record pages, editing the record they sit on

**Status (2026-09-08):** **Slices 1, 2 and 3 SHIPPED and org-verified end to end** (PRs #247, #248).
A form can be placed on a record page, loads that record's current values, and saves changes back to
it. **Slice 4 (the authoring toggle) is NOT built — so no author can turn this on yet**; every
edit-mode form must currently have `saveMode:"update"` written into its spec by hand. Decisions in
§4 are **resolved**, not open. **Raised:** 2026-09-07, owner:
_"forms should work internally as well … that's the whole reason for forms."_
**Mode chosen by owner:** **EDIT the record it sits on** (not prefill-only, not related-child).

Companions: [PENDING_WORK.md](./PENDING_WORK.md) §1 P4 · [DEFERRED.md](./DEFERRED.md) #14
(hosting adapters — this plan is a deliberate _slice_ of it, not its replacement) ·
[FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) · [HOSTING_ADAPTERS_SPEC.md](./HOSTING_ADAPTERS_SPEC.md)

---

## 1 · The gap, stated precisely — **as it stood on 2026-09-07, BEFORE this work**

> **Historical.** Items 1–4 below were closed by PRs #247/#248 (see §3). **Item 5 is still true**:
> no authoring UI writes `saveMode`. Kept as written because the shape of the gap explains the
> shape of the slices — do not read this section as current state.

Every claim below was checked against the code on 2026-09-07, not read off a doc.

**What already exists — more than expected:**

| Piece                                                      | State                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@api recordId` on the viewer                              | **EXISTS** — `finalFormViewer.js:284`, commented _"record-page and embedded hosts set the property"_ |
| `saveMode: 'update'` as a legal spec value                 | **EXISTS** — `FinalSpecTransferValidator` allow-lists it                                             |
| Describe validation for update mode                        | **EXISTS** — `FinalSpecDescribeValidator` switches `isCreateable()` → `isUpdateable()` on it         |
| Guests refused for update forms                            | **EXISTS** — `FinalGuestController:115` refuses a `saveMode='update'` spec outright                  |
| A renderless LDS record reader under the user's own access | **EXISTS** — `c/finalAutofillRecordSource` (getRecord, optionalFields so unreadable fields omit)     |
| `Allowed_Adapters__c` on `Form__c`                         | **EXISTS**, unread by `final*` (DEFERRED #14)                                                        |

**What is missing:**

1. **The viewer cannot be placed on a record page.** `lightning__RecordPage` is absent from
   `finalFormViewer.js-meta.xml` `<targets>`. It does not appear in App Builder for a record page.
2. **`recordId` is survey-only.** Its consumer is gated on `spec.form.type === 'survey'`
   (`finalFormViewer.js` ~line 700) — it feeds SO-3 record context. A classic Form accepts the id
   and ignores it.
3. **`saveMode` is never read at runtime.** `grep -c saveMode FinalSubmitService.cls` → **0**.
   Every internal submit builds a new SObject and inserts it. There is no update branch.
4. **Nothing loads a record's current values into a form.** No `getRecordForEdit`, no equivalent.
5. **No authoring UI writes `saveMode` at all.** `grep saveMode force-app/**/lwc` → nothing.
   `FinalFormCreateController` hardcodes `'create'`. **An author cannot produce an update-mode form
   today by any supported route.** This is the quietest and most important gap: the whole vocabulary
   exists, and nothing can emit it.

---

## 1a · What the OLD build did (owner: _"this feature was already built out in previous form iterations"_)

Read before writing Slices 2–3, per [[feedback-check-formstudio-first]]. The legacy stack solved
**half** of this, and the half it solved is worth copying:

| Legacy piece                        | What it did                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formViewer.js-meta.xml`            | Already had `lightning__RecordPage` — plus `datasource="apex://FormChoices"`, so the author **picks** a form instead of pasting an id. **Worth stealing later.** |
| `formViewer.js`                     | `@api recordId; // edit-mode context` and `existingRecordId: this.effectiveRecordId \|\| null` passed **unconditionally** on submit                              |
| `FormSubmitController.submitCore`   | `Boolean isUpdate = existingRecordId != null;` then `Database.update(parent, false, AccessLevel.USER_MODE)` vs `insert`                                          |
| `FormSubmitController.buildSObject` | Per-field, mode-aware FLS: `isUpdate ? !dfr.isUpdateable() : !dfr.isCreateable()`                                                                                |

**Two deliberate departures:**

1. **Legacy inferred edit mode from "a recordId is present"; we require an explicit
   `saveMode: 'update'`.** Legacy's rule is simpler but makes one thing impossible: a **create**
   form on a record page (a "Log a Call" form on an Account that creates a Task) would try to update
   the Account instead. The final build already carries `saveMode` through both validators, so
   honouring it costs nothing and keeps both products available. The price is Slice 4 — without an
   authoring toggle, nobody can switch it on.
2. **Legacy never loaded the edited record's current values.** There is no such code path in
   `formViewer`; authors approximated it with a URL-sourced autofill rule, so an "edit" form opened
   with **blank fields**. Slice 2 is genuinely new work, not a port.

---

## 2 · The flow being built

```
Record page (Account 001…)
  └─ c/finalFormViewer   recordId=001…  objectApiName=Account  formId=<configured>
       ├─ load spec (FinalSpecController.getSpec — unchanged)
       ├─ GUARD: spec.form.targetObject === objectApiName ? else a clear message
       ├─ if spec.form.saveMode === 'update':
       │     read the record's bound fields via LDS (reuse finalAutofillRecordSource)
       │     seed `answers` from them  ← the record is the baseline truth
       └─ submit → FinalSubmitController.submitForm(payload.meta.recordId)
             └─ FinalSubmitService.run → NEW update branch
                  buildRecord + Id → stripForUpdate(UPDATABLE) → `update as user`
```

**Security posture (unchanged where it matters).** The update DML runs `update as user`, so a caller
can only modify records their own CRUD/FLS/sharing already permits — a hand-crafted `meta.recordId`
buys nothing they did not already have. The spec remains the field allow-list: only fields the
published spec binds are ever written. Guests stay refused at `FinalGuestController:115`.

---

## 3 · Slices

### Slice 1 — Placement + object guard — **SHIPPED 2026-09-08 (PR #247)**

- `finalFormViewer.js-meta.xml` — add `<target>lightning__RecordPage</target>` and a
  `targetConfig` exposing `formId` (+ optional `versionId`), matching the App/Home config.
- `finalFormViewer.js` — add `@api objectApiName` (the platform injects it on a record page).
- New guard + message when `spec.form.targetObject !== objectApiName`: _"This form saves to
  {target}, so it can't be used on a {actual} page."_ Renders instead of the form, never a
  half-broken render.
- **Ships alone and is useful alone:** it makes today's create-mode forms placeable on record pages.

**Done:** `lightning__RecordPage` target + its `targetConfig` added; `@api objectApiName` added; the
guard sits immediately after the existing `specVersion` guard in `_apply` and reuses the existing
`.viewer-error` surface (no new template branch). 4 jest cases — the refusal, the match, and the two
inert hosts (no `objectApiName`, and a guest spec whose `targetObject` was stripped). Each positive
case asserts the page frame actually rendered, because "no error" alone would also pass for a
component that failed to mount. Jest 792/792, eslint clean, bundle deployed.

**A create-mode form on a record page still ignores the record** — that is Slices 2–3. Slice 1 only
buys placement plus an honest refusal.

### Slice 2 — Load the record into the form — **SHIPPED 2026-09-08 (PR #248)**

- Reuse `c/finalAutofillRecordSource` rather than a new LDS component
  ([[feedback-build-reusable-components]]) — it already handles the `fields`-vs-`optionalFields`
  contract that keeps one unreadable field from failing the whole read.
- Collect bound fields by walking the spec (same walk `FinalSubmitService` does server-side).
- Seed `answers` from the result **before** Autofill runs.
- **Precedence:** loaded record values are ordinary existing answers. `preserveEdits` (the default
  policy) already refuses to overwrite an answer a rule does not own, so record values survive by
  construction — **to be proven with a test, not assumed.** An `alwaysReplace` rule on an edit form
  will overwrite the record's value; that is arguably correct and must be a documented behaviour.

**Done:** `_prepareEditMode` walks the spec for bound fields and mounts one
`c/finalAutofillRecordSource` tagged `__edit__`, reusing the reader the Autofill rules already use
(runs under the respondent's own access; unreadable fields are omitted, not fatal). Seeding runs
**once** — a later LDS refresh must never undo what the respondent has typed. A field present but
**null is written as null**, so an empty field on the record beats a static `defaultValue`: on an
edit form the record is the truth.

**The exclusions are the load-bearing part.** Edit mode does not arm under `authoring`,
`preservePreview` or `delegateSubmit` — otherwise opening a form to DESIGN it would read, and on
submit overwrite, a real customer record from the Studio preview. All three are asserted.

### Slice 3 — The update branch on the server — **SHIPPED 2026-09-08 (PR #248)**

- `FinalSubmitService.run` — read `form.saveMode`. When `'update'`:
  - require `meta.recordId`; verify `recordId.getSObjectType() == parentType` (wrong-object =
    refuse, do not silently insert)
  - `buildRecord(parentType, parentBindings)` then set `Id`
  - new `stripForUpdate(...)` mirroring `stripForCreate` but `AccessType.UPDATABLE`
  - `update as user` (internal posture); GUEST posture must throw — belt to
    `FinalGuestController`'s existing braces
- `FinalSubmitController.SubmitResult.recordId` returns the edited id (unchanged shape).

**Done:** `FinalSubmitService.run` reads `saveMode` for the first time. Update mode requires
`meta.recordId`, checks `existingId.getSObjectType() == parentType` (a wrong-object id is refused,
never silently inserted), refuses a repeat section (D2), refuses GUEST posture, then
`stripForUpdate` (`AccessType.UPDATABLE` — genuinely different from CREATABLE) and `update as user`.

**Org-verified end to end 2026-09-08**, not merely unit-tested. Real Contact, real App Page host
(`Final_P0_Test`), real browser: the form loaded `BEFORE-EDIT`/`Operations` off the record, Title was
changed and saved, and SOQL afterwards showed **Title `AFTER-EDIT`, Department still `Operations`,
and the Contact count unchanged at 27** — the record was edited, not duplicated.

Apex: 4 new cases (edits-not-inserts with a count assertion, wrong-object refused, no-record refused,
repeat-section refused). 16/16 in `FinalSubmitControllerTest`.

### Slice 4 — Authoring _(small-medium — and NOTHING is author-reachable without it)_

- A Settings control: **"What this form does" → Create a new record | Edit an existing record.**
  Writes `spec.form.saveMode`. Home: the Settings drawer ([[project-studio-settings-drawer]]).
- Publish-time validation: an update form must have a target object whose describe
  `isUpdateable()` (validator already does this once `saveMode` reaches it).

---

## 4 · Decisions — RESOLVED by the owner 2026-09-08

| #      | Decision                     | **Owner's call**                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Concurrency                  | **LAST WRITE WINS.** No `LastModifiedDate` guard. I recommended the guard and the owner ruled otherwise — building it as ruled. Recorded honestly so nobody re-opens it as a bug: a form submitted against a record someone else edited in the meantime **will overwrite their change without warning**, for the fields this form binds. Only spec-bound fields are touched, so unrelated fields are untouched. Revisit if a customer hits it.      |
| **D2** | Repeat sections on edit form | **BLOCK AT PUBLISH.** An update-mode form may not contain a repeat section; the author gets a clear publish-time error rather than a section that silently does nothing.                                                                                                                                                                                                                                                                            |
| **D3** | ~~After-submit behaviour~~   | **NOT A DECISION — I was wrong to ask.** After-submit is already fully author-configured and shipped (#78): `settings.completion` exposes `mode` (**including `toast`**), `title`, `message`, `autoRedirect`, `redirectTo`, `redirectUrl`, `redirectDelay`, `actionButton`, `buttonLabel`, `buttonGoesTo`, `buttonUrl`, rendered by `c/finalAfterSubmit`. **Record-page edit changes nothing here** — admins configure it exactly as they do today. |
| **D4** | User who cannot update       | v1: the save fails with a real message (`update as user` enforces it). A pre-emptive disable needs a per-record check — follow-up, not v1.                                                                                                                                                                                                                                                                                                          |
| **D5** | `saveMode` per-form          | Per-form for v1. Noted as the seam where DEFERRED #14 eventually takes over.                                                                                                                                                                                                                                                                                                                                                                        |

### Original framing (kept for context)

| #   | Decision                                                                                                                | Recommendation                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Concurrency.** Someone else edits the record between load and submit. Last-write-wins silently discards their change. | **Send `LastModifiedDate` from the load; server refuses a stale update with a clear message.** Cheap now, and silent data loss is the worst failure mode a form builder can have. |
| D2  | **Repeat sections on an edit form.** Matching existing child rows to repeat entries is a product of its own.            | **Reject at publish**: an update-mode form may not contain a repeat section (clear authoring error), rather than a runtime surprise.                                              |
| D3  | **After-submit on a record page.** A full-page "Thank you" screen inside a record-page column is wrong.                 | **Toast + refresh the record page** (`RefreshEvent` / `getRecordNotifyChange`) when hosted on a record page; keep the existing completion screen elsewhere.                       |
| D4  | **Does the form render at all for a user who cannot update the record?**                                                | v1: render read-only-ish and let the save fail with a real message. Proper disable needs a per-record UI-API check — flag as follow-up.                                           |
| D5  | **Is `saveMode` per-form or per-placement?** DEFERRED #14's adapter model would make it per-placement.                  | **Per-form for v1** (simplest, matches the spec today). Note it as the seam where #14 will eventually take over.                                                                  |

---

## 5 · Test plan

- **Jest**: object-guard message; record values seed answers; `preserveEdits` does not clobber a
  loaded record value; `alwaysReplace` does (documented); no LDS read when `saveMode` is `create`.
- **Apex**: update branch writes only spec-bound fields; `stripForUpdate` drops a non-updateable
  field; wrong-object `meta.recordId` refused; GUEST posture on an update spec throws;
  stale-`LastModifiedDate` refused (if D1 accepted).
- **Browser (the one that actually matters — see PENDING_WORK §8 trap 1):** place the form on a real
  Account record page, confirm current values load, change one, submit, and **re-query the record**
  to prove it changed. A jest-green edit path is not evidence.

---

## 6 · Out of scope / orphan ledger

- **Related-child creation** (form on Account creates a linked Case) — a separate mode; not built here.
- **Polymorphic and dependent lookups** — still absent (PENDING_WORK §3.2).
- **Guest edit** — stays refused, permanently, by design.
- **`Allowed_Adapters__c`** — still unread. This plan does NOT close DEFERRED #14; it delivers the
  one surface the owner needs and leaves the declaration model parked.
- **Nothing is deleted by this plan** — no orphans created.

### Lifecycle correction — 2026-09-08

The original one-record load/edit/save verification did not cover record switching, pending reads, failed reads, or lookup Autofill after hydration. Those five defects are corrected in the current working tree. See [Record-edit lifecycle implementation and rollout](./IMPL_PLAN_RECORD_EDIT_LIFECYCLE_FIXES.md) for the current deployment status and verification evidence.

The runtime now uses keyed record sessions, blocks submission until hydration, hides editable controls while loading, exposes Retry after load failures, starts lookup Autofill after hydration, and reports an old record's failed save through a sticky toast without changing the new record. The server's existing type/access validation and last-write-wins policy remain unchanged. Slice 4 authoring controls remain outside this patch.
