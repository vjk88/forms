# Invisible guest bot checks (DEFERRED #20, remaining half)

Status: **APPROVED, slim version, building** (2026-11-21).
Revised after code review: replay limits, mode-specific retries, key provisioning, rollout, and
device performance are explicit below. Proposed implementation decisions are not new owner rulings.
Second revision (2026-11-21, owner chose "doc only"): a used ticket shows the thank-you, no
proof-of-work give-up timer, keys created on Publish, no staged rollout, tests limited to what can
actually run. The false-success bug found in review is DEFERRED #68, outside this PR.
Third revision (2026-11-21, owner: "fold them in"): "already saved" shows the thank-you only when
the answers match what was sent; an expired ticket always refreshes on Submit; rejected-submit
recovery is scoped to #68. Fourth: the host keeps every unknown-outcome answer set (never
overwrites), and the thank-you needs exactly one matching set. **Fifth (owner, building):** slim
version; all of the lost-reply handling is parked as DEFERRED #69, a used ticket gets one honest
message instead.

## What and why

Guests (public-site respondents) can only be stopped today by the honeypot, a hidden bait field. This
adds four checks intended to discourage generic automated spam without an interactive challenge.
Proof-of-work costs computing per solved ticket; the cache provides best-effort replay detection,
not a guarantee of one puzzle per accepted submission. CAPTCHA stays a separate, later opt-in
(DEFERRED #10).

**Scope:** every submit through `FinalGuestController.submitGuest` (the only guest submit path; the
public LWR host `finalGuestHost` is its only caller). Always on, no author setting: the checks are
non-interactive but consume device CPU and can add submit latency. Signed-in submits through the
Studio or a record page are untouched. Signed-in visitors using the public host follow its checks.

## Rulings (owner, 2026-11-21)

1. A too-fast submit gets a **retry message**, never a silent drop (a false alarm must not cost a
   real answer).
2. Apex cannot see a guest's IP, so there is **no per-visitor rate limit**. Bulk spam is slowed by
   **proof-of-work** instead. No per-form cap (a big email blast would trip it and turn real people
   away).
3. About **3 MB of Platform Cache** is available.
4. **No data model:** no new objects, no new fields, no records written per check.

## The checks

### 1. Load ticket (proof a server challenge was obtained)

- `getGuestRuntimeSpecForLangs` (already non-cacheable, called once per page load) returns a
  `ticket` beside the spec. New `@AuraEnabled guestTicket(formId)` returns a fresh one for the
  host's automatic refresh (below). Both issuance paths apply the same public-form and availability
  gates. A bot can call either endpoint directly: possession does not prove the page was rendered.
- Ticket = `base64url(payload) + '.' + base64url(HMAC-SHA256(key, payload))`, payload =
  `v1|formId|issuedAtMs|random128bit|difficulty`. Signed, not encrypted: nothing secret in it.
- **Key:** derived from the existing protected `FinalLinkSecret__c.Mac_Key__c`
  (`HMAC(macKey, 'guest-ticket-v1')`), so a personalized-link token can never pass as a ticket and
  no new secret is stored. Key loading moves out of `FinalSurveyTokenService` into a small shared
  accessor both classes use. Specify the derivation unambiguously as HMAC-SHA256 with the decoded
  MAC key as key and UTF-8 `guest-ticket-v1` as message; use constant-time signature comparison.
- **Provisioning prerequisite:** the existing secret is currently created only when a personalized
  link is minted (`FinalSurveyTokenService.loadKeys(true)`). Create it on **Publish** too: every
  form a guest can load has been published by a signed-in author, so Publish is the one natural,
  authenticated moment. It reuses `loadKeys(true)` (creates only when missing, never rotates, so
  existing links keep working). For forms published before this ships, the dev org already has keys;
  the package gets the same call from its install script. Guest issuance and verification only read
  keys and never create them. Missing keys give guests the normal "unavailable" message, never an
  unsigned ticket.
- **Lifetime 2 hours.** This bounds replay-marker retention. An expired ticket can be refreshed
  automatically only under the retry rules below; retaining answers does not require reloading.
- Refused: missing, forged, other form, expired, unknown version (`v1`), malformed claims, invalid
  difficulty, or future issuance time. Bound ticket/nonce sizes before decoding or hashing. Use
  canonical base64url encoding so alternate encodings cannot create different replay identities.

### 2. Time trap (too fast to be human)

- Server-side only, server clock only: `now - issuedAt < 2000 ms` → error code `TOO_FAST`.
- The host waits at least 2 s from receipt of a ticket using a monotonic elapsed-time clock, avoiding
  dependency on the device's wall clock. Puzzle time counts toward that wait. This is a minimum
  ticket age, not proof of human activity: bots can prefetch tickets and wait concurrently.
  Normal clients should avoid the error, but server timing failures remain recoverable. The label is
  `Final_Run_TooFast`: "That was quick! Please check your answers and submit again."

### 3. Best-effort replay detection

- After a **successful committed** submit, `Cache.Org` stores `used` plus the lowercase hexadecimal
  SHA-256 digest of the canonical ticket, with TTL bounded by its remaining lifetime. Use only
  alphanumeric characters in the key: `used:<hash>` is invalid. Use an explicitly resolved `FinalGuest`
  partition belonging to the invoking package namespace; test both unpackaged and subscriber orgs.
  Do not assume `local` means the package namespace in an installed managed package.
- A ticket already marked used is refused (`FINAL_BOT:USED`), distinct from expiry. Write the marker
  after `FinalSubmitService.run` and link finalization succeed, inside the same Apex transaction;
  Platform Cache mutations commit only when that request succeeds. Honeypot fake success does not
  represent a saved answer and must not be treated as a durable retry receipt.
- **"Success" means saved:** `FinalSubmitService.run` returns rejected answers as
  `SubmitOutcome.errors` instead of throwing, and today's `submitGuest` ignores them (DEFERRED #68).
  The marker is written only when `errors` is empty and a record was saved.
- Marked after success only: a submit that fails validation keeps its ticket so the person can fix
  and resend. Freeform's durable `submissionKey` lookup precedes the checks. That lookup does not
  cover Classic or Survey; their retry handling is specified separately below.
- New metadata: one Platform Cache partition, `FinalGuest` (Org cache; size set from the ~3 MB).
- **Fails open:** no partition, no capacity or any cache error → the check is skipped and the submit
  proceeds. Signature, proof-of-work, and age checks still apply. Cache entries can be evicted before
  expiry; there is no guaranteed entry count or flood threshold derived from 3 MB. Validate actual
  allocation and retention in the target org, and expose cache configuration failures to admins
  through existing diagnostics without adding per-check records or exposing secrets.
- **Concurrency limit:** checking then marking is not an atomic claim. Concurrent requests can all
  pass before a marker commits, even if the marker is written earlier in the transaction. Different
  submission keys bypass Freeform's same-key deduplication. When cache is absent or entries are
  evicted, a solved ticket can also be reused sequentially until expiry. This design accepts those
  limits under the no-new-data-model ruling; strict single-use/per-submit work requires a separate
  design with atomic durable enforcement. Do not describe this feature as a rate limiter.

### 4. Proof-of-work (bulk spam costs computing)

- The ticket carries a `difficulty` D. The browser must find a `nonce` where
  `SHA-256(ticket + ':' + nonce)` starts with D zero bits (about 2^D tries). Apex checks it with one
  `Crypto.generateDigest` call.
- **Browser:** new reusable module `c/finalProofOfWork`, plain-JS SHA-256 (the browser's built-in
  hashing is asynchronous per call, far too slow for many small hashes), run in small chunks that
  yield to the page. Use bounded elapsed-time chunks and measure input responsiveness, rather than
  assuming a fixed iteration count works on every device. Starts when the ticket arrives; if not
  solved by Submit, show the existing "Sending…" state while solving.
- **Difficulty:** an Apex constant, measured during the build so a mid-range phone solves in about
  0.5 to 1 s on average. **Chosen: D = 16** (measured 2026-11-21, real solver in headless Chromium,
  25 runs each: 16 bits = median 0.45 s at 4x throttle, 0.66 s at 6x, p90 2.1 s, max 3.8 s; 17
  bits = 1.1 s / 2.0 s, p90 4.7 s, max 7.1 s). Throttled Chrome is an approximation; the owner's
  phone is the real check. Measure solve times (median and
  slowest of many runs) in Chrome with CPU throttling at 4x and 6x (a phone-sized viewport alone does
  not slow the CPU), then the owner tries it once on a real phone. Choose D from those numbers; the
  signed difficulty allows later server retuning.
- Cancel stale work on disconnect, form/token/language change, or ticket replacement; use the
  host's load-generation guard so late solver/refresh results cannot affect another respondent.
  Pause work while hidden and recheck expiry on resume.
- **No give-up timer.** A time limit would lock a slow phone out on every attempt, losing a real
  respondent to a bot check. Instead, D is chosen so a slow phone still finishes in a few seconds,
  and the solver keeps going while the page is open. After about 5 s of waiting at Submit, the
  sending state adds "Still sending…" (new label `Final_Run_StillSending`). Only an actual solver
  error (an exception) stops the busy state, keeps the answers and shows the existing "could not
  save" message. Proof-of-work is never skipped.
- **Honest limit:** native/GPU solvers and parallel clients can outperform the browser; no fixed
  speed ratio is established. Headless browsers can run the same page code and succeed. This adds
  friction, not human verification or reliable protection against a determined attacker. CAPTCHA
  is a separate future defense and is not a guarantee against targeted abuse either.

## Retry contract (slim version, owner 2026-11-21)

The owner chose the slim version: the full "lost reply" handling (remembering which answers were
sent, comparing them on a resend, a `replayed` flag for Freeform) is parked as DEFERRED #69.

- **Freeform:** unchanged. Its durable `submissionKey` lookup answers a resend of an attempt that
  already saved, before any ticket check, so it keeps showing the normal thank-you (today's
  behaviour, including after ticket expiry or cache eviction).
- **A used ticket (all modes): one honest message.** On `FINAL_BOT:USED` the host shows
  `Final_Run_AlreadySent`: "This page already sent a response. If you changed answers after that,
  those changes weren't saved." Answers stay on screen, Submit turns off for this visit, nothing
  new saves. No comparing of answers.
- **Side benefit for Classic and Survey:** today, a lost confirmation followed by a manual resubmit
  saves a second copy. With tickets, that resubmit carries the same ticket and gets the message
  above instead, as long as the cache keeps the marker. Best effort: if the marker was evicted, the
  duplicate saves as it does today.
- Codes: `FINAL_BOT:INVALID`, `FINAL_BOT:EXPIRED`, `FINAL_BOT:PROOF`, `FINAL_BOT:USED`,
  `FINAL_BOT:TOO_FAST`. A correctly signed but expired ticket is `EXPIRED`; bad signatures or
  shapes are `INVALID`. Each is a refusal of the current request before anything is written.
- **Expired:** on `EXPIRED` the host fetches a fresh ticket and resends once (the person pressed
  Submit, so this is their own retry). Same answers, form/version/link context and submission key.
  Known cost: for Classic and Survey, if an earlier unconfirmed attempt did save, this saves a second
  copy, exactly what a resubmit does today.
- **Invalid / proof failures** stop with the existing "could not save" message, answers kept; no
  repeated refreshes.
- **No automatic resend** after a timeout or lost connection for any form type: the existing "could
  not save" message, answers kept, the person may press Submit again (same ticket).
- **Limitation:** no exactly-once delivery across reloads, new tabs, cache loss or hostile clients.

## Order inside `submitGuest`

1. Existing: public-form gate, active version/spec load, payload parse, then the Freeform
   `submissionKey` retry answer. Preserve these existing guards; the retry lookup is before
   availability and bot checks, not before all controller work.
2. **New:** ticket (signature, form, format version, expiry) → proof-of-work → time trap → replay
   marker. Failures use the distinct stable codes above; no submission data is written.
3. Existing: availability, version, honeypot, link token, `FinalSubmitService.run`.
4. Existing link finalization, then **new:** mark the ticket used (actual save success only: no
   `errors` on the outcome, see DEFERRED #68).

## Host behaviour (`finalGuestHost`)

- Keeps the ticket from the spec load, solves the puzzle in the background, adds `meta.tk` and
  `meta.pow` beside `meta.hp`.
- Implement the mode-specific retry contract above. An eligible expired-ticket refresh fetches
  `guestTicket`, solves, waits out the 2 s, and resends **once**, behind "Sending…". Refresh failure
  or a second rejection stops the busy state and retains answers. No automatic page reload.
- Allow only one in-flight submit/refresh sequence per viewer. Capture its form/version/link and
  load generation; recheck after each await before submitting or completing/failing a viewer.
- On `FINAL_BOT:USED`, show `Final_Run_AlreadySent`, keep the answers, turn Submit off for this visit.
- On `FINAL_BOT:TOO_FAST`, show `Final_Run_TooFast` and retain answers. Use the respondent's active
  runtime language for all new messages; verify
  language switching, rather than assuming a bare `t()` call selects the viewer's current language.

## Tests

- **Apex `FinalGuestTicketTest`:** mint and verify; forged signature; other form; expired; unknown
  version; malformed/oversized/noncanonical input; future issuance; wrong or missing proof; too fast;
  sequential used ticket refused with cache present; failed submit/link finalization keeps its ticket;
  cache unavailable still submits; link-token key cannot verify a ticket. Add shared JS/Apex digest
  vectors, including a nonzero difficulty that crosses a byte boundary.
- **Provisioning:** Publish creates keys when none exist; Publish again keeps them (existing link
  tokens still verify); a guest with no keys present gets "unavailable" and performs no DML.
- **Replay and retry:** a Freeform resend of a saved attempt still returns its original result
  (even after expiry/cache loss); a used ticket saves nothing and returns `USED` in all three
  modes; no automatic resend after a lost connection; expired-ticket refresh in all three modes.
- **Rejected submits:** this PR asserts only that a rejected outcome (non-empty `errors`) does not
  mark the ticket used. Fixing answers and resending is tested for the browser's own checks only;
  end-to-end recovery from a server-side rejection belongs to DEFERRED #68 (today such a submit
  still shows the thank-you). Cache-miss reuse is shown as a documented
  limitation through a controllable cache seam, not asserted as single-use. (Apex tests cannot run
  requests concurrently, so the concurrency limit is documented, not tested.)
- **Existing guest tests** in `FinalGuestControllerTest`, `FinalFreeformGuestTest`,
  `FinalGuestLinkTest`, and `FinalSurveySubmitTest` get a shared helper that
  mints a pre-aged ticket with difficulty 0 through `@TestVisible` seams (clock and difficulty), not
  a `Test.isRunningTest()` bypass.
- **Jest:** `finalProofOfWork` (known SHA-256 vectors, valid nonce, yields, cancellation, hidden-tab
  pause/resume); host metadata, monotonic 2 s wait, eligible refresh once, `USED` → `Final_Run_AlreadySent`
  + Submit off,
  "Still sending…" after 5 s, all error branches, double-click prevention, stale generations, answer
  retention, and active-language messages. Unknown transport failures must not cause Classic/Survey
  resubmission.
- **Live (dev org, public site):** normal submissions in all three modes; a missing ticket, forged
  proof and instant submit are refused; a replayed ticket gets the "already sent" message and saves nothing.
  Cache write/read confirmed against the real partition. Puzzle timing under CPU throttling, then
  the owner's phone. Managed-package cache behaviour (`local` namespace) is checked when the package
  exists (DEFERRED #51), not in this PR.

## Shipping notes

- Provision and verify the signing key and cache partition before enforcement. A missing cache
  allocation is an explicitly reported degraded mode; a missing signing key blocks readiness.
- **Rollout:** deploy Apex and host, publish the site at once (pre-authorized), then verify the
  served host and end-to-end submits. There are no public respondents yet (pre-package dev org), so
  no staged rollout or compatibility switch. A tab left open across the deploy has no ticket and is
  refused until reloaded; acceptable today. If a live site with respondents ever needs this kind of
  change, plan a staged rollout then.
- Land it **before the first package version**, so no subscriber site ever runs a host without
  tickets. The `v1` prefix lets a later format change accept both.
- New labels: `Final_Run_TooFast`, `Final_Run_StillSending`, `Final_Run_AlreadySent`.
- Labels stay in step in all four places (labels XML, `defaults.js`, `finalTranslate.js`
  imports, `RUNTIME_LABEL_NAMES`).
- Update DEFERRED #20 in the implementation PR as **proof-of-work friction and best-effort replay
  detection delivered**, once verified. Do not mark strict rate limiting or atomic single-use as
  delivered. Classic-form response caps and durable Classic/Survey retry safety stay open.

## Review references

- [Salesforce Platform Cache internals](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-platform-cache-internals.html): pending mutations are invisible to concurrent requests; request failure rolls them back.
- [Salesforce cache exceptions](https://developer.salesforce.com/docs/platform/apex-ref/references/apex-ref/apex-cache-exceptions.html): cache keys must be alphanumeric.
- [Salesforce Org cache reference](https://developer.salesforce.com/docs/platform/apex-ref/references/apex-ref/apex-class-cache-org.html): partition qualification and installed-package `local` namespace behavior.
- [Chrome Device Mode limitations](https://developer.chrome.com/docs/devtools/device-mode): a simulated viewport is not a physical mobile CPU benchmark.
- Code baseline: `FinalSubmitService.existingSubmission` queries only `Form_Submission__c`;
  `FinalSurveyTokenService.loadKeys` provisions during minting, not guest resolution;
  `finalGuestHost.handleSubmitRequest` currently has no bot-code refresh handler.
