# IMPL_PLAN — Survey S1: Answer-Store Submit Runtime

> **Status: FOR OWNER REVIEW — no code until approved.**
> Parent: [SURVEY_PLAN.md](./SURVEY_PLAN.md) (APPROVED 2026-07-27) §6/§9 S1 ·
> [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) §8 (submit contract) ·
> [DATA_MODEL_DELTA.md](./DATA_MODEL_DELTA.md) §2 · RUNTIME_NOTES (guest law).
> Authored 2026-07-27.

**Slice gate (from SURVEY_PLAN §9):** internal + guest survey submit render-verified;
answer rows typed correctly. Existing `field` types render unbound (no new widgets in S1 —
the scale family is S2).

**Estimate:** ≈ 3–5 days including tests + org verification.

---

## 1 · Current state (traced 2026-07-27, not assumed)

- `FinalSubmitService.run()` **throws for survey specs today**: line 54 gates on
  `form.targetObject`, which surveys don't have (`binding: null` model). The branch point is
  ABOVE that gate.
- **Zero Apex references `Form_Response_Answer__c`** (grep-verified in SURVEY_PLAN §0).
- Objects exist with typed value columns:
  - `Form_Response__c`: `Form_Version__c`, Contact/Account/Case/Lead/Opportunity/Campaign
    lookups + `Related_Record_Id__c`/`Related_Record_Type__c` generic pair, `Session_Id__c`,
    `Status__c`, `Submitted_By__c`, `Submitted_Date__c`, `IP_Address__c`,
    `Completion_Time_Seconds__c`, `Primary_Record_Id__c`.
  - `Form_Response_Answer__c`: `Form_Response__c` (parent), `Element_Key__c`,
    `Text_Value__c`, `Numeric_Value__c`, `Date_Value__c`, `DateTime_Value__c`,
    `Boolean_Value__c`, `Selected_Options_JSON__c`, `Lookup_Reference_Id__c`,
    `Form_Element__c`.
- `FinalSubmitService.Posture` (INTERNAL/GUEST) + `FinalGuestController` (Phase A) exist —
  the guest rail is live.
- Savepoint pattern + `FirstPublishLocationId` file path proven in the form flow.

## 2 · Metadata changes

**New fields on `Form_Response_Answer__c`** (SURVEY_PLAN §6 + DATA_MODEL_DELTA §2):

| Field                 | Type         | Notes                                                        |
| --------------------- | ------------ | ------------------------------------------------------------ |
| `Label_Snapshot__c`   | Text(255)    | Question text at submit — analytics stay honest on rewording |
| `Entry_Index__c`      | Number(4, 0) | Repeat-entry disambiguation; null outside repeats            |
| `Normalized_Score__c` | Number(5, 2) | 0–100 common scale, computed at submit (L1, no backfill)     |
| `Topic_Snapshot__c`   | Text(80)     | Topic tag at submit — one-object reporting                   |
| `Sentiment_Score__c`  | Number(5, 2) | EMPTY in v1 (L2 landing zone)                                |
| `Sentiment_Label__c`  | Text(40)     | EMPTY in v1                                                  |
| `Sentiment_Source__c` | Text(80)     | EMPTY in v1                                                  |

**Permission set:** `Form_Builder_Admin.permissionset-meta.xml` gains FLS for the 7 new
fields (read+edit). Guest profile: NO direct object perms — guest writes go exclusively
through the elevated `FinalGuestController` path per RUNTIME_NOTES; verify the guest
profile grants nothing new.

No new objects. No layout changes (answer rows are report fodder, not a UI).

## 3 · Apex changes

### `FinalSubmitService.cls`

1. **Branch at the top of `run()`** (before the `targetObject` gate):
   `if ((String) form.get('type') == 'survey') return runSurvey(spec, payload, mode);`
2. **New `runSurvey(spec, payload, mode)`** — same shape as the form path:
   - Walk pages→sections→elements ONCE (reuse the existing walk idiom): collect
     answerable elements (id, label, type, config, analytics block), repeat sections keep
     their element lists (Entry_Index source).
   - Build ONE `Form_Response__c`: `Form_Version__c` = payload.formVersionId,
     `Session_Id__c`, `Submitted_Date__c` = now, `Completion_Time_Seconds__c` from
     `meta.startedAt→submittedAt` (clamp ≥0; null if meta absent), `Status__c` =
     'Submitted'. `Submitted_By__c`/`IP_Address__c`: skipped when
     `settings.anonymous === true` (honor the flag in S1 if authored; full anonymous UX is
     S5).
   - **Typed answer writer** — one row per answered element, column by element type
     (SURVEY_PLAN §2.1 storage column table): numeric types → `Numeric_Value__c`,
     date/datetime → their columns, yesNo/consent → `Boolean_Value__c`, multi-select /
     ordered lists → `Selected_Options_JSON__c`, everything else → `Text_Value__c`
     (truncate defensively at field length). Every row: `Element_Key__c` = element id,
     `Label_Snapshot__c` = label (truncate 255), `Topic_Snapshot__c` +
     `Normalized_Score__c` from the element's `analytics` block (linear map
     scaleMin→scaleMax onto 0–100; skip when role ≠ score or value non-numeric).
   - **Repeats:** answers inside repeatable sections write one row per entry per element
     with `Entry_Index__c` (0-based, §8 contract).
   - **One savepoint** around response + bulk answer insert + files
     (`FirstPublishLocationId` = response id — same proven pattern).
   - **Validation identical to forms:** run the existing spec §7 server-side validation
     walk (required/pattern/range) against answers before any DML. (Build step: confirm
     where the form path invokes it and share that code path — the validator must not
     assume a binding.)
   - Return `SubmitOutcome` with `recordId` = response id, `childCount` = answer rows.
3. **Posture rules unchanged:** INTERNAL = `USER_MODE` DML; GUEST = the existing
   elevated-context discipline (allow-list by construction — answers key by element id;
   only spec-declared elements are ever written; a client-named field/column is
   impossible).

### `FinalSubmitController.cls` / `FinalGuestController.cls`

- No new endpoints. Both already load+gate the published spec and pass parsed blobs to the
  service; the survey branch rides the same call. Verify the guest controller's spec
  gating (published + shareMode) needs zero survey-specific carve-outs.

## 4 · LWC changes (expected ≈ zero, verify)

- `finalFormViewer` already renders `binding: null` elements and posts the §8 payload
  keyed by element id. Build step: confirm no client-side `targetObject` assumption blocks
  submit for `form.type === 'survey'`; fix is a gate tweak if found, not a new path.

## 5 · Tests (`FinalSubmitServiceTest` additions)

1. Survey happy path: every typed column lands typed (text/number/date/datetime/boolean/
   options-JSON) + label snapshot + response fields.
2. Normalized score: 4-on-1–5 → 75.00; 8-on-0–10 → 80.00; non-score role → null.
3. Repeat answers carry Entry_Index; two entries distinguishable.
4. Anonymous flag: Submitted_By/IP blank; response still inserts.
5. Rollback: force one bad answer row → NOTHING persists (response included).
6. Guest posture: runs as guest-context test user through FinalGuestController.
7. Bulk: 200-answer survey submits in one transaction within limits.
8. Form regression: existing form-path tests stay green (branch must be additive).

## 6 · Deploy & verify (the gate — deploy-and-verify law)

1. Deploy fields + perm set + Apex to the org.
2. Author a survey (existing field types, one repeat section), publish.
3. Internal submit → SOQL the response + answer rows; screenshot.
4. Guest link submit (Phase A rails) → same verification; screenshot.
5. Only then: "S1 done."

## 7 · Decision for the owner (one)

**Fold DEFERRED #20 (availability enforcement) into S1's guest path?** Surveys go guest
immediately, and `settings.availability` (closed/opensAt/closesAt/responseCap +
closedMessage) is authored-but-unenforced today. Recommendation: **yes, minimally** — a
single gate in the spec-load path (both controllers) that returns the closed message
before any render/submit; the spam honeypot/time-trap half can stay with the broader
guest hardening. ≈ +0.5–1 day. Say yes/no; either way the ledger stays honest.

## 8 · Orphan ledger

- None expected. Sentiment\_\* fields ship EMPTY by design (L2 landing zone — documented
  in SURVEY_PLAN §6, not an orphan).
- `Lookup_Reference_Id__c` (existing) stays unused by S1 (context links are S5/Phase B) —
  already true today; noted so nobody "cleans it up."

## 9 · Out of scope (S2+ per SURVEY_PLAN §9)

New widgets (scale family S2, choices S3, likert S4, ranking/matrix per their promotions),
rendering packs + captions (ride the widget slices), context links + anonymous UX +
gallery templates (S5), report type + dashboard (S6), Question Bank (L3).
