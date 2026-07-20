# IMPL_PLAN — Phase A: Guest render + submit

**Program:** [GUEST_PREFILL_LOOKUP_SPEC.md](./GUEST_PREFILL_LOOKUP_SPEC.md) Phase A
**Status:** AWAITING OWNER REVIEW — no code until approved.
**Law:** [RUNTIME_NOTES.md](./RUNTIME_NOTES.md) (separate `without sharing` family,
hard gate, projection-only spec delivery, spec-as-allow-list submits).
**Precondition shipped:** PR #131 fixed the LWR blank-page bug (stale `lwc:is`
ctor) — the site host is now reliable.

Plain language: _guest_ = anyone with the link, no Salesforce login. _Projection_ =
the copy of the form definition we hand the browser after deleting everything a
guest doesn't need to see (like which Salesforce fields it writes to).

---

## Found while planning (changes the plan)

1. **Nothing in the final build writes `Form__c.Status__c` or
   `Allowed_Adapters__c`.** The legacy studio wrote them; `FinalSpecController.
publishSpec` only flips `Form_Version__c` rows. The guest gate (`Status__c =
'Published'` + adapters contains `Public_Guest`) would NEVER pass today. Phase A
   must add the writers (slice A1.5 below).
2. **The viewer's inline-spec path SIMULATES submit** ([finalFormViewer.js:558](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L558):
   `authoring || _inlineSpec → completed = true`, no record). The guest host feeds
   the viewer an inline spec, so without a change the guest submit would silently
   save nothing. A2 adds a delegate-submit contract (below).
3. **No overflow ContentVersion path exists in any Final\* class** — `Spec_JSON__c`
   is served whole. Guest family mirrors that (no overflow work in Phase A).
4. **Image public-ness is frozen at upload time.** `FinalAssetController` decides
   public ContentDistribution vs internal shepherd URL from `Allowed_Adapters__c`
   AT UPLOAD ([FinalAssetController.cls:69](../../force-app/main/default/classes/FinalAssetController.cls#L69)).
   Upload a logo while the form is private, enable Public link later ⇒ the spec
   still carries the internal URL ⇒ broken images for every guest. Handled in
   A1.5 + A1 projection (below). Built-in theme images (static resource) carry a
   separate risk: their baked URLs may not resolve on the site domain — A2 must
   live-check a themed form with images EARLY.

## Slices (each = branch + PR, in order)

### A1 — Server: `FinalGuestController` + shared `FinalSubmitService`

**New `classes/FinalGuestController.cls`** — `public without sharing`; the ONLY
class the guest profile gets. Two `@AuraEnabled` methods:

- `getGuestSpec(Id formId)`:
  1. **Hard gate** (legacy `FormViewerGuest` pattern): form exists → `Status__c =
'Published'` → `Allowed_Adapters__c` contains `Public_Guest` → active
     `Form_Version__c` with non-blank `Spec_JSON__c`. Any failure = one generic
     `'This form is not available.'` — never which gate failed.
  2. **Projection, stripped server-side at serve time** (no publish-format change):
     - every `element.binding` (field API names)
     - `form.targetObject`
     - `section.repeat.childObject` + `section.repeat.relationshipField`
       (display keys in `repeat` stay — the tile/modal UI needs them)
     - `settings.prefill` (arrives Phase B with its own guest rules)
     - kept intact: `resolved.tokens`, `layout`, `header`, `pages` structure,
       `settings.completion`, `settings.availability.closedMessage`
  3. A closed/not-yet-open form (A3 vocabulary) returns ONLY
     `{ closed: true, closedMessage }` — no projection (a bot that can't submit
     gets no form structure either). The HOST renders the closed screen; the
     viewer never mounts. (Corrected 2026-07-20 — first draft contradicted
     itself between A1 and A2 here.)
  4. **Serve-time image URL rewrite** (find #4): for each spec image that stores
     `contentVersionId`, the projection swaps the URL for that version's public
     `ContentDistribution.ContentDownloadUrl` when one exists (read-only query,
     no DML in the read path). Missing distribution ⇒ URL passes through
     (renders broken for guests until the toggle re-mints — see A1.5).
- `submitGuest(Id formId, String payloadJson)`: same hard gate re-checked (a
  replayed POST against a closed form dies server-side), then the shared engine in
  guest posture. Result mirrors `SubmitResult` but returns **no recordId** to the
  client (a guest gets no record access; the After-Submit screen shows message
  only, never "view record").

**New `classes/FinalSubmitService.cls`** — the mapping/savepoint engine extracted
from `FinalSubmitController` (walk spec → bindings, coerce by describe, parent +
repeat children in ONE savepoint). `inherited sharing`; takes a posture enum:

- `INTERNAL`: `Security.stripInaccessible(CREATABLE)` + `insert as user` —
  byte-for-byte today's behavior. `FinalSubmitController.submitForm` becomes a
  thin wrapper (public API unchanged; its jest/apex tests keep passing).
- `GUEST`: **the published spec IS the allow-list** — the engine only ever maps
  fields the spec binds (client-sent field names are impossible by construction;
  stray answer keys are ignored). No stripInaccessible; DML via
  `Database.insert(records, true, AccessLevel.SYSTEM_MODE)` (allOrNone explicit) —
  system mode stated explicitly because **v67** flips the DML default to user
  mode (org is v66 today; the explicitness is future-proofing + audit clarity —
  corrected 2026-07-20, first draft misattributed this to v66).
  Insert-only forever: `form.saveMode = 'update'` specs are REFUSED at the gate
  for guests (RUNTIME_NOTES: guests never update).

**`FinalGuestControllerTest`** (guest-context via `System.runAs` site guest user
pattern where possible, else direct): gate matrix (missing form / draft / no
adapter / no active version), projection strips all four vocabularies, submit
allow-list ignores unbound answers, update-mode spec refused, atomic rollback
with a failing repeat child, generic-message assertion on every gate failure.

### A1.5 — Gate writers (without these the gate never opens)

- `FinalSpecController.publishSpec` additionally sets `Form__c.Status__c =
'Published'` + `Published_Date__c = now` (`update as user`, same savepoint).
- **Studio "Public link" toggle** — new `FinalStudioController.setGuestAccess(
Id formId, Boolean enabled)` (`with sharing`, `as user`) that adds/removes
  `Public_Guest` in `Allowed_Adapters__c`. UI: one toggle + hint ("Anyone with
  the link can view and submit — no Salesforce login") in the design panel's
  **Settings area**, new "Sharing" group beside After submit. Default OFF for
  every existing and new form — publishing alone never exposes anything.
- **Enabling the toggle also re-mints image links** (find #4): `setGuestAccess(
true)` walks the form's linked ContentVersions and creates any missing public
  `ContentDistribution` (internal-user context — guests never trigger DML for
  this). Combined with A1's serve-time URL rewrite, images uploaded BEFORE the
  toggle flip render for guests without re-uploading or rewriting stored specs.
  Disabling does NOT delete distributions in v1 (already-shared links keep
  working by ContentDistribution's nature; noted in the setup doc).

### A2 — Host: `c/finalGuestHost` + viewer delegate-submit

- **New `lwc/finalGuestHost`** (targets `lightningCommunity__Page` +
  `lightningCommunity__Default`; `formId` as a Builder-configurable property AND
  `?formId=` URL param fallback): calls `getGuestSpec`, feeds the EXISTING
  `c-final-form-viewer` via its `spec` @api. Renders the gate failure / closed
  message standalone (no viewer). No fork of the viewer.
- **Viewer contract (small, additive)** — new `@api delegateSubmit = false`:
  - when true, `handleSubmit` still runs full validation, then instead of
    simulating or calling internal Apex, emits `submitrequest` CustomEvent
    carrying the payload (same shape as today's `_payload()`);
  - host calls `submitGuest`, then viewer `@api completeSubmit()` on success or
    `@api failSubmit(message)` on error (renders in the existing submitError
    slot); `_submitting` guards double-fires as today;
  - the After-Submit "record" redirect is suppressed under `delegateSubmit`
    (guests can't view records; `redirectTo='url'` still works).
  - jest: delegate path emits + completes/fails; non-delegate paths untouched.
- **`GUEST_SITE_SETUP.md`** (documented, not coded): LWR site → public access ON →
  guest profile gets ONLY `FinalGuestController` + object CREATE on the target
  object is NOT needed (system-mode DML) → CSP/clickjacking allow-list steps.

### A3 — Availability + spam enforcement (server-side, guest path)

In `FinalGuestController` (vocabulary already authored+stored, DEFERRED #20):

- `settings.availability`: `status='closed'`, `opensAt`/`closesAt` window checked
  at BOTH getGuestSpec (renders closed screen) and submitGuest (rejects replay).
- `responseCap`: counter field **`Form__c.Submission_Count__c`** incremented
  inside the guest submit savepoint; cap reached ⇒ closed behavior. (Counting
  target-object records is wrong — other processes create them too.)
- Honeypot (`spamProtection='honeypot'`): host renders a visually-hidden input
  (autocomplete bait); the HOST merges its value into the viewer-emitted payload
  as `meta.hp` before calling Apex (the viewer builds the payload and knows
  nothing of the bait); non-empty ⇒ the server returns a **fake success** (no
  record) so bots learn nothing. `'captcha'` stays schema-only (deferred).
- Rate limit: per-window counter in Platform Cache keyed by guest session id;
  **degrades to no-op when no cache capacity is provisioned** (dev orgs default
  to 0) — documented in GUEST_SITE_SETUP.
- Internal submits are untouched by all of A3 (owner ruling embedded in spec:
  enforcement is the guest family's job in v1).

### A4 — Embed bridge + snippet

- Bridge lives INSIDE `finalGuestHost` (no separate component): a
  `ResizeObserver` on the rendered form posts
  `postMessage({ type: 'finalforms:height', height }, '*')` — outbound one-way,
  a number only, no inbound listener. Always on; harmless outside an iframe.
- Embed snippet (in GUEST_SITE_SETUP.md): iframe + ~10-line parent listener that
  sets iframe height, plus a script-free fixed-height fallback. Site clickjack
  domain allow-list step documented (framing stays blocked until the embedding
  domain is explicitly allowed — desired posture).
- Marks the "iframe" row of HOSTING_ADAPTERS_SPEC satisfied.

## Orphan ledger

- `FinalSubmitController` keeps its name/API as the internal wrapper — nothing
  orphaned; its test class stays.
- Legacy `FormViewerGuest`/`FormViewerController` untouched (technique reference
  only, still serving the old `c/formViewer`).
- Viewer's simulate-on-inline path unchanged for authoring/preview; the
  `delegateSubmit` flag is additive.
- New field `Submission_Count__c` (A3) is guest-family-internal; internal
  submits do NOT increment it in v1 (counts = public responses).

## Open calls (recommendation first)

1. **Sharing toggle placement** — recommended: Settings area "Sharing" group.
   Alternative: inside the Publish confirmation flow.
2. **responseCap counting** — recommended: `Form__c.Submission_Count__c` counter
   (racy under burst, fine at this scale). Alternative: defer cap to v2.
3. **Honeypot behavior** — recommended: fake success. Alternative: generic error.
4. **Rate limit** — recommended: ship with cache-degrade no-op + doc note.
