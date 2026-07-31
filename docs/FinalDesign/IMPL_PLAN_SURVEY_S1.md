# IMPL_PLAN — Survey S1: Answer-Store Submit Runtime

> **Status: rev 4 — ALL DECISIONS RULED (owner, 2026-07-27): availability gate IN (7-1
> yes), respondent access = fenced SYSTEM MODE (7-2 b), topics = managed multi-tags
> (7-3, replaces single free-text topic; Question Bank skipped). Awaiting only the
> owner's "go" to start code.**
> Parent: [SURVEY_PLAN.md](./SURVEY_PLAN.md) (APPROVED 2026-07-27) §6/§9 S1 ·
> [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) §8 (submit contract) ·
> [DATA_MODEL_DELTA.md](./DATA_MODEL_DELTA.md) §2 · RUNTIME_NOTES (guest law).
> Authored 2026-07-27.

**Slice gate (from SURVEY_PLAN §9):** internal + guest survey submit render-verified;
answer rows typed correctly. Existing `field` types render unbound (no new widgets in S1 —
the scale family is S2).

**Estimate:** ≈ 5–7 days including the availability gate (7-1) and the topics storage
model (7-3), tests + org verification.

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

| Field (API name)      | Display label       | Type         | Plain meaning                                                                                    |
| --------------------- | ------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `Label_Snapshot__c`   | Question (as asked) | Text(255)    | Photocopy of the question wording at submit — reword the question later, old answers stay honest |
| `Entry_Index__c`      | Entry #             | Number(4, 0) | Repeating sections only: which entry (1st, 2nd…) this answer came from; empty otherwise          |
| `Normalized_Score__c` | Score (0–100)       | Number(5, 2) | Every rating converted to one 0–100 scale so different question types chart together (4/5 = 75)  |
| `Topic_Snapshot__c`   | Topics (display)    | Text(255)    | Display-only joined tag names ("Support; Pricing") for eyeballing rows — charts use the junction |
| `Sentiment_Score__c`  | Sentiment Score     | Number(5, 2) | EMPTY in v1 — parking spot for future AI mood-scoring of text answers (L2)                       |
| `Sentiment_Label__c`  | Sentiment           | Text(40)     | EMPTY in v1 — the word ("Positive"/"Negative"), same parking lot                                 |
| `Sentiment_Source__c` | Sentiment Source    | Text(80)     | EMPTY in v1 — which AI/model did the scoring                                                     |

Display labels are the owner-facing rule (2026-07-27): **API names stay technical, visible
labels read like English** — they're what admins see in reports.

**New objects for the topics-as-tags model (owner ruling 7-3):**

- **`Survey_Topic__c`** — the managed tag vocabulary. Fields: standard Name +
  `Active__c` (checkbox, default true; deactivate hides from the picker, never deletes
  history). `Form_Builder_Admin` gets CRUD.
- **`Form_Answer_Topic__c`** — junction (one row per answer × topic): master-detail to
  `Form_Response_Answer__c` + lookup to `Survey_Topic__c`. This is what makes "average
  score by topic" a real report when questions carry multiple tags. Tags are LIVE —
  renaming a topic updates every chart (the photocopy rule applies to question WORDING,
  not tags).

S1 ships the objects + junction writer (hand-authored specs test multi-topic); the chips
picker, inline "new topic", and manage UI land in S2 with the question inspectors.

**Access model (rev-2 fix — this was a hole):** `Form_Builder_Admin` gains FLS for the 7
new fields (read+edit) for builders/analysts. But internal submits run `USER_MODE`, so
**internal respondents ALSO need Create on `Form_Response__c`/`Form_Response_Answer__c` +
FLS on every written field — which ordinary users don't have**. Rev 1 missed this: every
internal survey submit would have failed at insert. Resolution = owner decision §7-2:
(a) packaged **`Form_Respondent` permission set** (create-only + FLS, no read of others'
responses) assigned to survey audiences, or (b) the answer-store insert runs **elevated**
(app-owned telemetry-style objects, documented for Security Review) while everything else
stays USER_MODE. Guest path unchanged either way: NO direct object perms; writes go
exclusively through the elevated `FinalGuestController` per RUNTIME_NOTES; verify the
guest profile grants nothing new.

No new objects. No layout changes (answer rows are report fodder, not a UI).

## 3 · Apex changes

### `FinalSubmitService.cls`

1. **Branch at the top of `run()`** (before the `targetObject` gate), null-safe (rev-2
   fix — `form` may legitimately be null at this point and rev 1's snippet NPE'd):
   `if (form != null && 'survey'.equals(form.get('type'))) return runSurvey(spec, payload, versionId, mode);`
2. **New `runSurvey(spec, payload, versionId, mode)`** — same shape as the form path:
   - Walk pages→sections→elements ONCE (reuse the existing walk idiom): collect
     answerable elements (id, label, type, config, analytics block), repeat sections keep
     their element lists (Entry_Index source).
   - Build ONE `Form_Response__c`: `Form_Version__c` = **the version Id the CONTROLLER
     loaded and gated — passed into the service, never read from the client payload**
     (rev-2 fix: `payload.formVersionId` is client-claimed; trusting it violates
     RUNTIME_NOTES. Both controllers already know the Id they served; the service
     signature gains a `versionId` param. Payload value used only as a mismatch
     cross-check → reject). `Session_Id__c`, `Submitted_Date__c` = now,
     `Completion_Time_Seconds__c` from `meta.startedAt→submittedAt` (client-claimed
     timing — analytics-grade, never trust-grade; clamp ≥0), `Status__c` = 'Submitted'
     (build step: verify the picklist value exists; add if not).
     `Submitted_By__c`/`IP_Address__c`: skipped when `settings.anonymous` is true (honor
     the flag in S1 if authored; full anonymous UX is S5).
   - **Typed answer writer** — one row per answered element, column by element type
     (SURVEY_PLAN §2.1 storage column table): numeric types → `Numeric_Value__c`,
     date/datetime → their columns, yesNo/consent → `Boolean_Value__c`, multi-select /
     ordered lists → `Selected_Options_JSON__c`, everything else → `Text_Value__c`
     (truncate defensively at field length). Every row: `Element_Key__c` = element id,
     `Label_Snapshot__c` = label (truncate 255), `Normalized_Score__c` from the element's
     `analytics` block (linear map scaleMin→scaleMax onto 0–100; skip when role ≠ score
     or value non-numeric). **Topics (7-3):** for each entry in `analytics.topics`, one
     `Form_Answer_Topic__c` junction row (inserted after the answers, same savepoint);
     `Topic_Snapshot__c` = joined names for display. Unknown/deleted topic ids at submit:
     skip the junction row, keep the name in the display string (never fail a submit
     over a tag).
   - **Repeats:** answers inside repeatable sections write one row per entry per element
     with `Entry_Index__c` — **0-based, matching the §8 payload's array order (this plan's
     decision; §8 doesn't specify a base — rev-2 honesty fix)**. NOTE the authoring gap:
     the builder's repeat config is form-shaped (`childObject`/`relationshipField`
     required), so a survey repeat (answer-store, no child object) is likely NOT
     authorable in the builder today. S1 ships the runtime machinery + server tests via
     hand-authored spec; builder survey-repeat authoring is verified at build and, if
     blocked, becomes its own follow-up row rather than silently claimed.
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
- **Completion gate (rev-2 add):** `settings.completion.redirectTo = "record"` is
  meaningless-to-leaky for surveys (respondents — especially guests — must never be
  pointed at the response record). S1 adds the cheap server/viewer guard: survey type →
  treat `record` as thank-you fallback; the inspector hides the option for surveys in a
  later slice.

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
9. Multi-topic (7-3): question with 2 tags → 2 junction rows + "A; B" display string;
   unknown topic id → junction skipped, submit still succeeds; topic rename reflected in
   junction-based grouping without touching stored answers.

## 6 · Deploy & verify (the gate — deploy-and-verify law)

1. Deploy fields + perm set + Apex to the org.
2. Author a survey (existing field types), publish. Repeat-section case: hand-authored
   spec if builder authoring is blocked (see §3 repeats note).
3. Internal submit → SOQL the response + answer rows; screenshot.
4. Guest link submit (Phase A rails) → same verification; screenshot.
5. Only then: "S1 done."

## 7 · Decisions — RULED (owner, 2026-07-27)

**7-1 — Availability enforcement: YES, in S1 scope.** One gate in the spec-load path (both
controllers), evaluated server-side before any render/submit: `closed` flag, `opensAt` /
`closesAt` window, `responseCap` (count of submitted responses for the version's form) →
return `closedMessage` (or the default). Closes the render half of DEFERRED #20; the spam
honeypot/time-trap half stays with broader guest hardening (ledger row stands, narrowed).
Tests: closed flag blocks; date window blocks/allows at boundaries; cap blocks at N;
closedMessage surfaces. Estimate is now **≈ 4–6 days** total.

**7-2 — Internal respondent access: (b) SYSTEM MODE, fenced.** Owner's words: "use system
mode for storing responses." The response + answer insert runs in system context for the
two app-owned objects only. The four fences are CONTRACT, not commentary:

1. Scope: `Form_Response__c` + `Form_Response_Answer__c` + `Form_Answer_Topic__c`
   inserts only (the third rides the same fence per ruling 7-3).
2. Create-only — the system-mode path never updates or deletes.
3. Server decides every written field; client input can never name a field or column
   (answers key by element id against the server-loaded spec).
4. Reads stay permission-checked everywhere — system mode covers the drop-in-the-box
   moment only.

Consequences: NO `Form_Respondent` permission set is created; `Form_Builder_Admin` keeps
read FLS for analysts; Security Review false-positive doc gets a standing entry (write
alongside the code, not at package time). Internal guardrail: submitting user must still
pass the spec-load gate (active published version) — system mode never widens WHICH
surveys can be answered, only WHO can persist answers.

## 8 · Orphan ledger

- None expected. Sentiment\_\* fields ship EMPTY by design (L2 landing zone — documented
  in SURVEY_PLAN §6, not an orphan).
- `Lookup_Reference_Id__c` (existing) stays unused by S1 (context links are S5/Phase B) —
  already true today; noted so nobody "cleans it up."
- `Form_Element__c` (existing lookup on the answer object) also stays unused by S1
  (answers key by `Element_Key__c` string; a bank-question link is the L3 story) — same
  "don't clean it up" note.

## 9 · Out of scope (S2+ per SURVEY_PLAN §9)

New widgets (scale family S2, choices S3, likert S4, ranking/matrix per their promotions),
rendering packs + captions (ride the widget slices), context links + anonymous UX +
gallery templates (S5), report type + dashboard (S6). **Question Bank: SKIPPED by owner
2026-07-27 (round 6)** — replaced by the managed topics-as-tags model (ruling 7-3;
storage in S1, picker/manage UI in S2). The `Form_Element__c` lookup stays parked.
