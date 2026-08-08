# IMPL_PLAN — SO-4 record-aware share links (guest tokens)

Owner go 2026-08-02: "do that encrypted URL like you suggested." Builds **Tier 1**
(stateless encrypted links). **Tier 2** (tracked invitations) is FORKED on the
platform-event question below — not built until that ruling lands.

Design source: `SURVEY_OBJECT_SPEC.md` §SO-4 (owner-approved). This doc is the
file-level build sheet + the Tier-2 decision.

---

## What Tier 1 delivers

An internal user mints a link for a specific record → sends it to an external
contact → the guest opens the survey and sees record-driven visibility rules +
author-opted prefill, **with the record Id never appearing in (or decoding out
of) the URL.** No database rows per link. Revocable in one click per survey.

Security invariants (unchanged from spec): opaque encrypted token, verdicts-not-
values for rules, guest sees only author-opted prefill, guests never update
records (submit stamps the record ref server-side from the TOKEN for the
customer's own Flow to act on).

---

## Tier 1 — file-level plan (build on go)

### New metadata

- **`Form__c.Links_Invalidated_On__c`** (DateTime) — the mass kill-switch
  timestamp (renamed from `Links_Invalid_Before__c` 2026-08-02: the old name read
  backwards). The "Invalidate all links" button stamps `NOW`; resolve then
  rejects any token whose `issuedAt` predates it — one click kills every
  outstanding link, new mints still work. NOTE this is distinct from per-link
  **expiry** (default 30 days), which lives INSIDE each token — that's the
  "stops working after date X" control; this field is the "kill everything
  already sent" control.
- **`FinalLinkSecret__c`** (List Custom Setting, **Visibility = Protected**) —
  two Text(255) fields `Enc_Key__c`, `Mac_Key__c` (base64 AES-256 + HMAC keys).
  Protected = invisible to the subscriber org at package time; our `without
sharing` Apex still reads it. Keys minted once, lazily, on first mint.
- Reuse (no new field): **`Form_Response__c.Related_Record_Id__c`** (Text 18) +
  **`Related_Record_Type__c`** (Text 80) — the token-sourced record stamp.

### New Apex

- **`FinalSurveyTokenService.cls`** — the crypto leaf. `mintToken(formId,
recordId, sobjectType)` → URL-safe base64; `resolve(token)` → `Claims
{formId, recordId, sobjectType, issuedAt, expiry}` or null. **Encrypt-then-
  MAC**: `Crypto.encryptWithManagedIV(AES256, encKey, plaintext)` → then
  `Crypto.generateMac(hmacSHA256, ciphertext, macKey)`; token = base64url(mac ‖
  ciphertext). Resolve = constant-time MAC check → decrypt → parse. Keys via
  `getOrProvisionKeys()` (reads the protected setting; mints + inserts if empty).
- **`FinalGuestController` additions** (the ONLY guest-granted class — token
  work MUST live here, `without sharing`):
  - `getGuestRecordContext(Id formId, String token)` → `{ruleFacts, prefill}`.
    Resolve token → verify formId match + expiry + `Links_Invalidated_On__c`
    cutoff + `recordId.sObjectType == targetObject` → call the shared
    rule/prefill engine (below) in **guest mode**: rule verdicts for ALL record
    rows, prefill values ONLY for mappings flagged `guestPrefill:true`. Any
    failure → empty context (survey still renders; rules read "no match").
  - `submitGuest` gains an optional `token` param: on a valid token, stamp
    `Related_Record_Id__c` + `Related_Record_Type__c` on the `Form_Response__c`
    **from the resolved claims, never the client payload**. Guests still never
    update the business record (invariant 5). No token → today's path byte-for-
    byte.
- **`FinalSurveyObjectController` refactor** — extract the SO-3 engine
  (`recordRuleRows`, `rowMatches`, the field query + `ruleFacts`, and the
  guest-opted subset of `prefillValues`) into a shared static
  `computeRecordContext(spec, targetObject, recordId, boolean guestMode)` so the
  authenticated path (`getRecordContext`) and the guest path call ONE engine.
  Guest mode: SYSTEM_MODE fact query (same as internal — author's logic), and
  prefill filtered to `mapping.guestPrefill === true`. No behavior change for
  the internal path (regression-guarded by existing FinalSurveyObjectTest).
- **Mint surfaces:**
  - `FinalStudioController.mintRecordLink(Id formId, Id recordId)` — **USER_MODE
    read of the record first** (you can't issue a link for data you can't see) +
    survey/targetObject match → returns the full guest URL. Studio-only
    (`with sharing`).
  - `FinalSurveyLinkInvocable.cls` — `@InvocableMethod` "Create survey links"
    (`List<Request{formId, recordId}>` → `List<Result{link}>`) for
    Flow/campaign/email-template minting. Same USER_MODE read gate per record.

### LWC

- **`finalGuestHost.js`** — read `?c__rt=` token from the page ref; when present,
  call `getGuestRecordContext` and pass the result to the viewer via a new
  `@api recordContext`; thread the token into the `submitGuest` call.
- **`finalFormViewer.js`** — accept `@api recordContext = {ruleFacts, prefill}`.
  When injected (guest host owns the fetch), seed `_ruleFacts` + merge prefill
  into `answers` — the SAME merge the authenticated `getRecordContext` path
  already does, just fed from a property instead of a self-made Apex call. The
  viewer still never imports guest Apex.
- **`finalFormStudio`** — share surface gains **"Record link…"** (record picker →
  `mintRecordLink` → copy) and **"Invalidate all links"** (confirm → stamp
  cutoff), sitting beside today's Public-link toggle. Surfaces only when the
  survey has a connected object.
- **`finalPropertyPanel`** — `mapping.guestPrefill` toggle ("Prefill in guest
  links", default OFF), shown only when the question is mapped. Shipping a value
  into a guest input IS disclosure, so it's per-field opt-in.

### Tests

- Apex: `FinalSurveyTokenServiceTest` (round-trip, tamper→null, expiry, cutoff,
  wrong-form, wrong-sobjecttype); `FinalGuestControllerTest` additions (guest
  context returns verdicts + only-opted prefill; submit stamps ref from token
  not payload; no-token path unchanged; guest never updates record);
  `FinalSurveyObjectTest` regression (internal path identical post-refactor).
- Jest: `finalGuestHost` (token → context fetch → viewer injection → submit
  carries token); `finalFormViewer` injected-recordContext merge; panel
  guestPrefill toggle.
- Org QA: mint a link for a `QA Record Rules` record, open it as guest
  (frontdoor-free, real public URL), confirm rules fire + only opted prefill
  shows + raw Id absent from URL + submit stamps the ref; then "Invalidate all
  links" → the same link 404s the context (survey still renders, rules go "no
  match").

---

## Tier 2 — FORKED on the platform-event question (owner asked 2026-08-02)

Owner: _"can we give users option to use a platform event? customers can either
create the record in SF or use external storage to record those invitations…
add-on option to store data outside the platform."_

### The verdict (why this is a fork, not a swap)

Tier 2's whole reason to exist is **per-recipient revocation + single-use
enforcement**. Both require the server to **read invitation state at guest
resolve/submit time**. A platform event is fire-and-forget — you can't query it.
So the two things the owner named are actually two DIFFERENT jobs:

1. **Enforcement store** (revoke / single-use / responded) — MUST be locally
   queryable in the guest transaction. If it lived only in an external DB, every
   guest survey load would make an outbound callout to check "is this link
   dead?" → latency, a reliability dependency, and a Security-Review red flag
   (guest site phoning external infra). That breaks the "loads are cheap
   idempotent reads" + scanner-resilience laws. → **Keep this in SF
   (`Survey_Invitation__c`).** It's what makes revoke/single-use work at all.

2. **Telemetry / notification exhaust** (invitation sent / opened / responded) —
   fire-and-forget by nature, and a _perfect_ fit for a Platform Event. This is
   exactly where the owner's instinct is right.

### Recommendation (the "yes, and here's the safe shape")

- **Authoritative invitation state stays in SF.** Non-negotiable for the
  revoke/single-use guarantee without guest callouts.
- **Add an optional Platform Event** (`Survey_Invitation_Event__e` / a response
  event) emitted on mint + on respond. Customers who want external tracking
  subscribe (Flow, Apex trigger, or the Pub/Sub API to their own Lambda/S3) and
  own the destination. **We ship the event; they own the store.** That IS the
  "external storage add-on" — done natively, and it keeps _us_ off the data-
  residency hook (an AppExchange package silently shipping respondent PII to
  third-party infra is a Security-Review liability — same ruling as the spec's
  telemetry-offload line).
- **Optional third mode, only if there's real demand:** "event-only, no SF row"
  for pure high-volume fire-and-forget blasts where the customer wants the
  analytics exhaust and explicitly accepts **no revocation / no single-use.**
  Honest tradeoff, clearly labeled — not the default.

Net: the platform event is an **emission seam alongside** the SF row, not a
**replacement for** it. External storage = the customer's subscriber, an add-on
we enable rather than infra we run.

### Decision — RESOLVED 2026-08-02: option (B)

Owner chose **SF row + optional emitted Platform Event.** Tier 2 (a later pass)
will: keep `Survey_Invitation__c` as the authoritative, locally-queryable
enforcement store (revoke / single-use), AND emit an optional
`Survey_Invitation_Event__e` on mint + respond so customers route tracking to
their own external store (Flow / trigger / Pub/Sub → their Lambda/S3). We ship
the event; the customer owns the destination — the "external storage add-on"
seam, native and Security-Review-clean. No event-only/no-enforcement mode unless
a real customer asks.

Tier 1 does not depend on this — it ships first.

---

## Tier 2 — BUILD PLAN (owner picked "finish Tier 2" 2026-08-08)

Turns the stateless Tier 1 link into a **tracked, per-recipient invitation**:
revocable, optionally single-use, with sent/responded tracking — plus the
optional Platform Event add-on seam. Tier 1 links keep working untouched
(stateless is still the default; Tier 2 is opt-in per mint).

### New metadata

- **`Survey_Invitation__c`** (new object) — the authoritative, locally-queryable
  enforcement store. Fields:
  - `Form__c` (Lookup → Form\_\_c) — which survey.
  - `Record_Id__c` (Text 18) + `Record_Type__c` (Text 80) — the bound record,
    written SERVER-side at mint (never client).
  - `Recipient__c` (Text 255, optional) — who it was sent to (author-supplied
    label for tracking; free text, no PII obligation).
  - `Expires_On__c` (DateTime) — per-invitation expiry (mirrors the token's).
  - `Revoked__c` (Checkbox) — per-recipient kill switch.
  - `Single_Use__c` (Checkbox) — burn on first submit.
  - `Responded_On__c` (DateTime) — stamped at SUBMIT (single-use burn + tracking).
  - `Sent_On__c` (DateTime, optional) — mint timestamp / tracking.
  - Name = auto-number (`INV-{0000}`).
  - List view "All invitations" ships so admins revoke via standard record UI
    (edit `Revoked__c`) — no bespoke manager in v1 (see decision Q2).
- **`Survey_Invitation_Event__e`** (new Platform Event, if Q1 = now) — fields:
  `Form_Id__c`, `Invitation_Id__c`, `Record_Id__c`, `Event_Type__c`
  ('minted' | 'responded'), `Occurred_On__c`. Published on mint + respond;
  customers subscribe (Flow/trigger/Pub-Sub) and own the destination.

### Token — carry the invitation nonce

- Payload gains a 6th pipe field: `invitationId` (empty for Tier 1). `resolve`
  accepts **5 OR 6 parts** (5 = legacy/stateless Tier 1, no invitation; 6 = has
  the slot) so already-minted Tier 1 tokens keep resolving. `Claims` gains
  `Id invitationId` (null when absent/empty). No change to the crypto.

### Mint (Tier 2 opt-in)

- `FinalStudioController.mintRecordLink` + `FinalSurveyLinkInvocable` gain a
  `tracked` flag (+ optional `recipient`, `singleUse`, `ttlDays`). When tracked:
  `insert as user` a `Survey_Invitation__c` (Record_Id/Type from the mint, not
  the client; Expires_On from ttl; Sent_On = now), then mint a token carrying
  its Id. Emit the `minted` event (best-effort). Untracked = today's stateless
  Tier 1, byte-identical.

### Guest resolve (Tier 2 enforcement — LOADS NEVER MUTATE)

- `FinalGuestController.validClaims`: when `claims.invitationId` present, load the
  invitation **system-mode/without-sharing** and reject if `Revoked__c`, past
  `Expires_On__c`, or (`Single_Use__c` AND `Responded_On__c != null`). Defense:
  the invitation's `Form__c` must == formId and `Record_Id__c` == the token's
  recordId. Tier 1 (no invitationId) → the existing stateless checks. Loads are
  idempotent reads — the scanner law holds (no burn on GET).

### Guest submit (Tier 2 burn — the ONLY mutation)

- On submit with a Tier 2 token: re-validate (a link revoked mid-session can't
  submit), then after the response saves, if `Single_Use__c` stamp
  `Responded_On__c` (burn) — inside/after the submit txn, never at load. Emit the
  `responded` event (best-effort). The record-ref stamp already added in Tier 1
  still applies.

### LWC (studio card)

- The "Create link" flow gains a **"Track & control invitations"** toggle
  (opt-in) and, when on, an optional **Recipient** field + **Single-use** toggle.
  Off = stateless Tier 1 (unchanged). Revocation in v1 = the standard
  `Survey_Invitation__c` list view (Q2), so no bespoke list here yet.

### Tests

- Apex: invitation mint creates the row + token carries the nonce; revoked /
  expired / used → empty context; single-use burns at SUBMIT not load (scanner
  proof); mid-session revoke blocks submit; legacy 5-part Tier 1 token still
  resolves; event published (Test.getEventBus().deliver()). Jest: card tracked
  toggle + recipient/single-use fields emit the right mint intent.
- Org QA: mint a tracked single-use invitation, open twice (both load — not
  burned), submit once (burns), submit again → refused; revoke a live invitation
  → next load empty.

### Two decisions needed before building (see chat)

- **Q1 — Platform Event in THIS build, or a follow-up?** (Recommend: now — it's
  the point of option B and it's small; emission is best-effort so it can't
  break a mint/submit.)
- **Q2 — Invitation management UI: standard record list view (edit Revoked\_\_c),
  or a bespoke studio invitations list with revoke buttons?** (Recommend:
  standard list view for v1 — ships the capability at a fraction of the surface;
  bespoke manager is a later polish.)
- **Not a decision (deferred to packaging):** Tier 2 as the paid-tier boundary —
  build the plumbing now, gate at packaging time per the spec.
