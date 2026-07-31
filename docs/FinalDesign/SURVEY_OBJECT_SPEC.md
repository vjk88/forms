# SURVEY_OBJECT_SPEC — the optional survey object (owner ruling 2026-07-31)

> "Primary object is necessary for Form, optional for Surveys. If user wants they can map a
> question to a field on that object. The object can also be used to autopopulate certain
> fields or questions on the Survey."

## Model

- **Form**: `form.targetObject` REQUIRED (unchanged — answers ARE the record).
- **Survey**: `form.targetObject` OPTIONAL. Answers ALWAYS land in the answer store
  (Form_Response**c / Form_Response_Answer**c — that invariant never bends). The object adds
  two optional superpowers per question:
  1. **Mapping (write)** — a question may declare `mapping: { object, field }`; on submit,
     when a record context exists, the mapped field on THAT record is updated with the answer
     (in addition to the answer row, same savepoint).
  2. **Prefill (read)** — when a record context exists at render time, mapped questions
     seed their initial answers from the record's current field values.
- `binding` stays `null` for survey questions FOREVER — `mapping` is a separate, secondary
  channel so every `isSurvey`/`binding: null` invariant in the codebase holds.
- **Record context** = `recordId` (viewer `@api recordId` for record-page/embedded hosts, or
  `?c__recordId=` URL param). v1 is AUTHENTICATED contexts only — guest prefill/writeback
  waits for the signed-token program (GUEST_PREFILL_LOOKUP_SPEC Phases B/C); the guest host
  path ignores recordId entirely.

## Storage

- Creation (kind-first gallery, PR #177): optional object → `Form__c.Primary_Context_Object__c`
  - `spec.form.targetObject`.
- Question: `el.mapping = { object: 'Contact', field: 'Email__c' }` | absent.

## Builder (v1)

- Question inspector: when `spec.form.type === 'survey'` AND `spec.form.targetObject`, every
  mappable question shows **"Map to field"** (select, '' = Not mapped). Options come from
  `FinalStudioController.describeFields(targetObject)` (the palette's own describe — reused,
  not duplicated), filtered by answer-type compatibility:
  - numeric questions (nps / rating / scale / emojiScale / likert) → `number` fields
  - `yesNo` → `checkbox` fields
  - text questions (`field` w/ text-ish inputTypes) + single `imageChoice` → `text`-family
    fields (text / textarea / email / phone / url)
  - matrix / ranking / multi-imageChoice → NOT mappable in v1 (multi-row answers)
- The studio fetches the describe once per survey (only when targetObject present) and passes
  it down; the panel stays dumb.

## Runtime (v1)

- **Prefill**: `FinalSurveyObjectController.getPrefill(versionId, recordId)` → `{elementId:
value}`. Validates: active version, survey type, recordId's sobject type === targetObject.
  `WITH USER_MODE` query + `Security.stripInaccessible(READABLE)` — the runner only sees
  fields they can read. Viewer seeds `answers` before first paint; respondent edits win.
- **Writeback**: submit payload `meta.recordId` (viewer adds it when a record context exists
  and the spec has mappings). `FinalSubmitService.runSurvey`: after answer rows, build one
  sObject with mapped answer values (numeric/boolean/text coercion mirrors the answer-row
  typing), `stripInaccessible(UPDATABLE)`, `update as user`, inside the existing savepoint —
  answer rows and record update land or roll back together. No mappings / no recordId → the
  path is byte-identical to today.
- Guest submits (`delegateSubmit`): recordId never attaches — enforced by the viewer, and the
  guest Apex path never reads `meta.recordId`.

## Explicitly deferred

- Guest prefill/writeback (program Phases B/C — signed tokens only).
- Mapping matrix/ranking/multi-select; picklist option-sync; "create a record from a survey".
- Changing the survey's object in the builder UI (today: set at creation; a Studio control
  is a follow-up — DEFERRED row).
