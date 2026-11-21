# Forms on Flow screens + a plain Public switch (replaces DEFERRED #14 "hosting adapters")

Status: **Part 2 (Public switch) BUILT and verified live** (2026-11-21). **Part 1 (Flow) PARKED** as DEFERRED #14, Very nice to have (owner: "fuck flows then, move it to nice to have. lets do part 2 alone").
Supersedes [specs/HOSTING_ADAPTERS_SPEC.md](./specs/HOSTING_ADAPTERS_SPEC.md) (kept for history).

## Rulings (owner, 2026-11-21)

1. **No "adapters".** Any form can sit on a record page, a Lightning page (app / home / tab) or a
   Flow screen, and works the same everywhere. The only per-form placement setting is **whether
   it can be public**.
2. The public switch moves to a **new checkbox** `Form__c.Is_Public__c`.
3. On a Flow screen, Submit saves and **shows the form's thank-you**; the person then presses the
   Flow's own Next to continue.
4. Record inputs stay **two**, same as pages: `Existing Record Id` (Forms: edit that record; blank =
   create) and `Survey Context Record Id` (Surveys: prefill, show/hide rules, write-back).

## What is already true (checked 2026-11-21)

- `finalFormViewer` is exposed on record pages, app / home pages, tabs and Experience pages.
- Internally nothing enforces placement: `Allowed_Adapters__c` is read by final* code ONLY for its
  `Public_Guest` value (guest gate, Studio Public toggle, asset links, Autofill and publish
  checks). `Internal_Record_Page` / `Flow_Screen` / `Embedded` are written as defaults and never
  read. No "Survey never on a record page" rule exists in code.
- Record context today: the page properties `existingRecordId` / `surveyContextRecordId` (a record
  page can use `{!recordId}`), or the URL `?c__existingRecordId=` / `?c__surveyContextRecordId=`;
  personal links use `?c__rt=`.

## Part 1: Flow screen (PARKED, DEFERRED #14)

- Add target `lightning__FlowScreen` to `finalFormViewer` with inputs:
  - `formId` (required), `versionId` (optional)
  - `existingRecordId`, `surveyContextRecordId` (as on pages; Flow passes `{!recordId}` or any
    variable)
- **Outputs** (read by later Flow elements): `submittedRecordId` (the saved record for a Form, the
  Response for a Survey, the Submission for a Freeform) and `submitted` (true once saved).
- **Submit** saves exactly as on a page and shows the thank-you screen (ruling 3). The form's own
  "Continue"/after-submit buttons stay as configured.
- **Flow's Next before Submit**: blocked via the screen component `validate()` with the message
  "Submit the form before you continue." (otherwise answers are silently lost). Previous / Pause /
  Finish behave as Flow normally does.
- Signed-in users only, the same as record and app pages. A Flow run by a public-site guest is out
  of scope (guests use the public form page).
- Same rendering, themes, rules, Autofill, translations and bot checks everywhere; no Flow-only
  behaviour beyond the above.

## Part 2: Public switch

- New field `Form__c.Is_Public__c` (Checkbox, default false) + permission sets.
- One-time backfill: `Is_Public__c = true` where `Allowed_Adapters__c` includes `Public_Guest`
  (anonymous Apex in the dev org; the package ships the field fresh).
- Every final* reader / writer switches to `Is_Public__c`: `FinalGuestController` (gate),
  `FinalStudioController` (Public toggle), `FinalAssetController`, `FinalAutofillController`,
  `FinalAutofillValidator`, `FinalPublishWarnings`, `FinalMappingValidator`,
  `FinalFormActionsService` (duplicate keeps it off), `FinalFormLifecycleService` (unpublish /
  archive turn it off), `FinalFormActionsSelector`.
- `Allowed_Adapters__c` stops being read or written by final* code. It is **not deleted now**:
  legacy (non-final) classes still reference it; it goes with the legacy purge (DEFERRED #52).
  That deletion will be named field by field when #52 runs.

## Tests

- Apex: every class above keeps its current guest / public tests, rewired to `Is_Public__c`;
  backfill script checked by query before and after.
- Jest: Flow target inputs reach the viewer; `validate()` blocks before Submit and passes after;
  outputs set on save (Form, Survey, Freeform).
- Live: a screen Flow in the dev org with the viewer (one Form edit with `{!recordId}`, one Survey),
  Next blocked before Submit, thank-you shown, Next continues, the saved Id visible in a later
  screen; the public form page still serves a public form and refuses a non-public one.

## Docs

- DEFERRED #14 rewritten to this plan; HOSTING_ADAPTERS_SPEC marked superseded.
- DATA_MODEL_DELTA: `Is_Public__c` added, `Allowed_Adapters__c` marked "legacy only, delete in #52".
