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

## Explicitly deferred (v1)

- Guest prefill/writeback (program Phases B/C — signed tokens only).
- Mapping matrix/ranking/multi-select; picklist option-sync; "create a record from a survey".
- Changing the survey's object in the builder UI (today: set at creation; a Studio control
  is a follow-up — DEFERRED row).

---

# V2 — the object grows doors (owner picks 2026-08-02: ALL FOUR + guest-safe rules)

> Owner: "there's no way to add them to the survey or link them to any Visibility rules or
> autofill rules … For record field visibility rules, we need them to run even for guests …
> think about how we can safely do that. Get back to me with a solution that doesn't trigger
> security concerns."

## SO-1 — Settings: Connected object card (approved)

- Home: the Build-mode left pane's ROOT view (nothing selected) for surveys — a "Connected
  object" card above the palette. No new IA mode needed (Settings-mode IA is still unbuilt).
- Shows: object icon + label, mapped-question count ("3 questions mapped"), or an empty state
  ("No object connected — mapping, prefill and record rules unlock when you connect one").
- Actions: **Connect** (object picker — same search the creation gallery uses), **Change**
  (confirm dialog LISTS the mappings that will be cleared: any mapped field not present /
  type-compatible on the new object), **Disconnect** (confirm; clears every `el.mapping` and
  record-sourced rule rows — the dialog says exactly what dies).
- Writes `spec.form.targetObject` + `Form__c.Primary_Context_Object__c` together on save.

## SO-2 — Mapping direction control (approved)

- `el.mapping.mode`: `'both'` (default, today's behavior) | `'prefill'` | `'write'`.
- Inspector: a small segmented under "Map to field" — "Prefill + write back / Prefill only /
  Write back only" (visible only when mapped).
- Runtime: `getPrefill` skips `mode='write'` mappings; `applyMappedWriteback` skips
  `mode='prefill'`. Absent mode reads as `'both'` (v1 specs unchanged).

## SO-3 — Record-field visibility rules, internal contexts first (approved)

- **Rule model:** a rule row's source may be `record:<FieldApiName>` (stored as
  `{ source: 'record:Status__c', operator, value }` — string-prefixed so every existing
  answer-sourced row parses unchanged). Same operators; no new engine grammar.
- **Server truth, verdicts not values:** the record half of rules is STATIC for a session, so
  the server evaluates it ONCE and ships booleans. `getRecordContext(versionId, formId,
recordId|token)` returns `{ prefill: {...}, ruleFacts: { '<elementId|sectionId>#<rowIndex>':
true|false } }`. The client rule engine substitutes facts for record rows and combines them
  with live answer rows via the normal all/any/custom logic. **Record field VALUES never
  reach the browser for rules — internal or guest.**
- **Mixed rules (record rows + answer rows) never re-fetch**: rows are independent — the
  server freezes each RECORD row to a boolean once at load; the client engine computes
  ANSWER rows live and combines both through the normal all/any/custom logic. Real-time
  reactivity is entirely answer-side; one server call per session (same snapshot semantics
  as prefill).
- **Rule evaluation runs SYSTEM MODE — every posture (owner ruling 2026-08-02).** Rules are
  the AUTHOR's logic, not the runner's data view: an FLS gap must never silently rewire the
  survey's flow per-runner. Platform precedent: validation rules, formula fields and
  system-context Flows all evaluate over fields the runner can't read. Disclosure stays one
  inferred bit — verdicts ship, values never do. Two guards remain (they are NOT FLS):
  1. internal raw-`recordId` links require the runner to have ROW-level read access to the
     record (`UserRecordAccess`) — otherwise any employee could probe arbitrary Ids through
     survey links (the same oracle the guest token kills);
  2. the system-mode query reads ONLY the spec-declared rule fields (server walks the
     published spec; client input never names a field).
- Prefill is DISPLAY, not logic — it keeps FLS internally (values a runner can't read stay
  out of their inputs); guest prefill stays author-opt-in per SO-4.
- **No record context** (plain link, guest without token): record rows read "no match" —
  show-gated elements stay hidden, hide-gated stay shown. Builder lint hints when a survey
  has record rules ("this survey behaves differently without a record link").
- Builder: rule editor's source select grows a "Record fields" optgroup (surveys with
  targetObject only), field roster from the same describe the mapping select uses.

## SO-4 — Guest-safe record context (tokens + verdicts) — AWAITING OWNER GO

The Phase C law extends to surveys unchanged: **a raw record Id in a guest URL is a data
oracle — guests only ever get an opaque signed token.**

**Two-tier tokens (owner-forwarded review, folded in 2026-08-02).** A row per minted link
taxes customer data storage (~2 KB × campaign size — real money at org storage rates) for
a capability most links never use. State is created when the author ASKS for control, not
by default:

- **Tier 1 — stateless token (the default):** payload `formId|recordId|expiry|issuedAt`,
  **encrypt-then-MAC** — `Crypto.encryptWithManagedIV` (AES-256) THEN
  `Crypto.generateMac(HMAC-SHA256)` over the ciphertext, org-secret keys in a protected
  Custom Setting (minted once, post-install/first-use). Encryption is REQUIRED, not
  optional: a signed-but-cleartext payload would expose the recordId to anyone who
  base64-decodes the link — opacity is invariant 1. URL-safe base64 → `?c__rt=<token>`.
  Resolve = decrypt + verify in memory: ZERO database rows per link.
  - Stateless revocation = `Form__c.Links_Invalid_Before__c` (one datetime): "Invalidate
    all links" in the studio stamps NOW; resolve rejects tokens with `issuedAt` older.
    Kills every outstanding stateless link for that survey in one click — per-recipient
    revocation is exactly what Tier 2 is for.
  - Response→record linking survives statelessness: the token carries the recordId, the
    response row stores it at submit — "who answered" needs no invitation row.
- **Tier 2 — tracked invitation (author opt-in per mint: "Track & control invitations"):**
  mints a `Survey_Invitation__c` row (Form**c, Record_Id**c, Expires_On**c, Revoked**c,
  Single_Use**c, Responded_On**c); the row Id rides the token payload as the nonce. Buys:
  **per-recipient revocation**, **single-use enforcement**, sent-vs-answered tracking,
  editable expiry. (Packaging note: Tier 2 is the natural paid-tier/add-on boundary —
  a business decision for packaging time, not plumbing built now.)
- **Scanner-resilient state transitions (folded in, real bug avoided):** Outlook Safe
  Links / Proofpoint prefetch every emailed URL — consuming a link on GET would burn it
  before a human ever opens it. Law: **loads are idempotent reads; only explicit
  interaction mutates state.** Single-use consumption + `Responded_On__c` stamp happen in
  the SUBMIT transaction, never at render. Expiry/revocation/cutoff are checked on BOTH
  load and submit (a link revoked mid-session still can't submit).
- **Resolve (guest family, fenced):** decrypt + verify signature → Tier 2: load invitation,
  reject revoked/expired/used; Tier 1: check expiry + `Links_Invalid_Before__c` → reject
  form mismatch / record sobjectType ≠ targetObject. Only then load the record
  **system-mode**, walk the PUBLISHED spec for (a) record-rule rows → return verdict
  booleans, (b) mappings flagged `guestPrefill: true` → return those values only. The client
  never names a field; unlisted fields are unreadable no matter what the request says.
- **Telemetry (opens / drop-offs / scan pings): OUT of SO-4.** It belongs to the analytics
  program (form-vs-survey model, phases 1–3). When built: native-first (Platform Event →
  scheduled aggregate rows), and any EXTERNAL offload (Lambda/S3) is a customer-configured
  option, never a package default — an AppExchange package silently phoning respondent
  telemetry to third-party infra is a Security Review and privacy liability we do not ship.
- **Guest prefill is author opt-in per mapping** (`mapping.guestPrefill`, default OFF, shown
  as a "Prefill in guest links" toggle only when mapped): shipping a value into an input IS
  disclosure, so the author explicitly chooses which fields a link-holder may see.
- **Guest writeback: REMOVED (owner ruling 2026-08-02 — supersedes the same-day in-scope
  ruling).** Guest surveys NEVER update Salesforce records. Guests are strictly read-only
  with respect to the record: rule verdicts + author-opted prefill values, nothing else.
  Mapped writeback stays exactly what it is today — authenticated runners only.
  - **The escape hatch is the customer's own automation:** guest submits with a verified
    token stamp the record reference onto the `Form_Response__c` row SERVER-side (from the
    TOKEN, never client payload) — so an org admin who wants guest-driven record updates
    writes a Flow trigger on the Survey Response object, under their org's own governance,
    permissions, and audit. Our package ships the linked data, not the write.
  - Simplifications this buys: no `guestWrite` flag, no writeback-forces-Tier-2 rule, no
    single-use-by-default coupling — and the guest posture stays a one-liner for Security
    Review: "guests never perform DML against existing records, full stop."
- **Mint surfaces (internal only):** the minter must be able to READ the record (USER_MODE
  check at mint — you can't issue links for data you can't see). v2 mints: (a) studio share
  surface "Record link…" (record search → copy link), (b) invocable Apex "Create survey
  links" (records[] → links[]) for Flow/campaigns/email templates.
- **Residual disclosure, named honestly:** a link-holder can infer the record half of a rule
  from which questions appear (that IS the feature — same class of signal as a mail-merged
  email), and sees exactly the author-opted prefill values. Links travel — mitigated by
  default expiry (30 days), revocation, optional single-use, and no raw Ids anywhere.

## Security invariants (v2, all phases)

1. Raw record Ids never appear in guest URLs — and never DECODE out of them either:
   stateless payloads are encrypted (encrypt-then-MAC), not merely signed. Tokens are
   unguessable, expiring, and revocable (per-survey cutoff stateless, per-recipient Tier 2).
2. Record values never ship to the browser for RULES — verdict booleans only, every posture.
3. Guests see only author-opted prefill values; the server walks the published spec — client
   requests can never name fields.
4. Guest record reads run only behind a verified signature (proof an internal user minted
   context for exactly this form + record); minting requires USER_MODE read of the record.
   Internal raw-`recordId` links require the runner's ROW-level read access — no Id probing
   from either side of the firewall. Rule evaluation itself is system-mode over
   spec-declared fields (author's logic, verdicts only — owner ruling 2026-08-02).
5. Guests NEVER update Salesforce records — surveys or forms (Phase A1's
   guests-never-update rule now covers both). Mapped writeback is authenticated-only. The
   guest path never reads a client-supplied `meta.recordId`; the only record reference a
   guest submit produces is the server-stamped link on its own `Form_Response__c` row,
   sourced from the verified token. Customer-side Flow triggers on the response object are
   the sanctioned route to guest-driven record automation.

## Build order

SO-1 → SO-2 → SO-3 (approved, shipping) → SO-4 (starts on owner GO of this design).
