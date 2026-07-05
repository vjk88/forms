# Runtime & Security Notes

> Implementation constraints for the runtime / Apex layer of the rebuild — the "how it must be built"
> rules that don't belong in the component catalog. Component attributes live in
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md). Authored 2026-07-03.

## Guest file uploads — `fileUpload` & `formSignature` (review B)

Guest users on Experience / Site pages **cannot create `ContentVersion` (Files) directly** without
server help. Rules for the runtime Apex:

- A dedicated Apex controller runs **`without sharing`** to insert the file on the guest's behalf.
- Insert `ContentVersion` with **`FirstPublishLocationId` = target record Id** — this auto-creates the
  `ContentDocumentLink` in one step (cleaner than a manual link insert).
- **`formSignature` (ContentVersion output) reuses the SAME guest-safe path as `fileUpload`** — do not
  build a second file-insert route. (fileUpload already does base64-on-submit → atomic `ContentVersion`
  inside the submit savepoint; signature is just another file.)
- **Guardrails (mandatory — `without sharing` + guest = elevated context):** link files ONLY to the
  current submission's record; enforce size + file-type caps; never accept an arbitrary record Id from
  the client. This is the file-upload hardening TODO.

## Guest spam & bot protection (catalog review round 3)

A published guest form with no protection is a spam magnet. Layered defense, cheapest first —
surfaced as `formViewer`'s **Spam Protection** attribute:

- **Honeypot field** (visually hidden input humans never fill; bots do) — **default ON for guest
  forms**, zero user friction.
- **Server-side rate limiting** in the submit Apex (per-session/IP counters). Never client-side
  throttling only — the guest submit endpoint is the elevated-context surface, so the server is the
  only place a limit is real.
- **CAPTCHA** (optional, org-configured) for high-abuse forms.
- `formViewer`'s **Response Cap** and **Open/Close Window** also shrink the abuse surface — enforce
  both **server-side at submit**, not just in render (a closed form must reject a replayed POST).

## Guest drafts — `draftManager` security **[v2 — feature deferred (DEFERRED.md #2); rules bind when it's built]**

Save & Resume for guests means guest-created records holding PII, readable later by an
unauthenticated visitor. Rules:

- **Resume key = cryptographically unguessable token** (crypto-random, 128-bit+). Never a record Id,
  never sequential, never derived from user data.
- Guest read-back is **token-gated to exactly ONE draft**: the Apex takes the token, returns the
  matching draft or nothing. No list/query surface for guests, ever.
- **Expiry purge is mandatory** — scheduled cleanup deletes drafts past `Draft Expiry`. A draft
  store that only grows is a PII liability.
- **Emailed resume links:** send only to an address collected _inside this draft's form data_, and
  rate-limit sends — otherwise the org becomes an open email relay.

## Guest spec delivery & overflow — `Form_Version__c.Spec_JSON__c` (delta review B)

Since Guest users do not have access to standard file sharing or search in Experience Cloud, they cannot query `ContentVersion` records directly. This creates a roadblock when form configurations overflow the 131k character limit and store their specs as attachments.

- Guest spec retrieval runs strictly through the guest Apex controller (`without sharing`).
- **Overflow Interception:** If `Form_Version__c.Spec_JSON__c` contains `{"overflow": true}`, the Apex controller must query the related `ContentVersion`'s `VersionData` blob in system context and return the full parsed spec JSON string to the client.
- **What the endpoint serves = the runtime PROJECTION, never the full spec** (schema §8 / UIUX
  review #21): element `binding`s stripped, `render` display metadata compiled in at publish. The
  full spec (with bindings) stays server-side on the version record for answer mapping. This
  applies to the overflow path too — the overflow ContentVersion stores both artifacts or the
  controller extracts the projection; the client never receives field names.

## Validation timing — engine-owned UX rules (UIUX review #3)

The presentation contract lives in catalog §2; the engine-side rules bind here:

- **"Reward early, punish late":** a field first validates on **blur after being touched**; once it
  has erred, it re-validates on **every input** until valid. Never validate while typing a fresh
  field.
- Next/Submit with invalid fields: block, validate the full current page, set `pageValidity`, focus
  + scroll the first invalid field (respect reduced motion). No toasts, ever.
- **Submit dispatch sets the Submitting state** (buttons disabled, spinner) and clears on
  resolve/reject — the double-submit guard is structural, not a debounce.

## Submit payload caps (UIUX review #23)

The ~4.3 MB base64 file cap is per-file; the **submit payload as a whole needs a server-side size
check** too. v1 keeps the multiplier structurally impossible: file elements can't sit inside
repeatable sections (schema §4.1 law), so max payload ≈ answers + repeats + (file count × cap).

## Update mode — `saveMode: "update"` (UIUX review #26)

- v1: **internal audience only.** The update target resolves per `form.updateTarget` (schema §3) —
  source record or URL param — under the user's own CRUD/FLS/sharing (`WITH USER_MODE`).
- **Guest + update is out of v1 entirely.** If it ever ships it uses a signed/opaque token in the
  same class as draft resume keys and prefill tokens — a guessable record Id in a guest URL would
  be write access to arbitrary records.

## Guest prefill — `prefill.source: "sourceRecord"` (schema review B)

Guests cannot use LDS / UI-API (`getRecord`) on Experience sites, so record-based prefill needs the
server. And the sharper risk: a **raw record Id in a guest URL is a data-exposure oracle** —
Salesforce Ids are not secrets; anyone can substitute a different Id and read whatever the form
prefills. Rules:

- Guest prefill runs ONLY through the guest Apex controller (same guarded `without sharing` family
  as spec-fetch / submit).
- **The field allow-list is server-derived from the published spec** — the controller returns values
  only for fields the spec's autofill rules / bindings actually reference. Never accept a
  client-supplied field list. (Same posture as the old build's allow-listed `FormViewerGuest`.)
- The guest URL parameter is a **signed/opaque prefill token** minted when the link is generated
  (email send, flow, campaign) — NOT a raw record Id. The server resolves token → record + allowed
  fields. Raw-Id prefill is acceptable only for authenticated internal users.
- Internal users keep the platform path (LDS / UI-API enforces FLS + sharing natively — don't
  rebuild that).

## External embeds — `formMap` / `formVideo` on Experience Cloud

- External providers (Google Maps, Leaflet tile servers, YouTube, Vimeo) require **CSP Trusted
  Sites** on the Experience Cloud site — a subscriber-org admin step. Document it per provider, and
  **detect + degrade gracefully** (placeholder with a hint, not a broken grey box) when CSP blocks
  the load.
- **Default map provider = native `lightning-map`** — no API key, no CSP setup. "Salesforce Maps"
  the paid SKU is never required.
- **Prefer iframe embeds over provider JS SDKs** (e.g. `youtube-nocookie.com` iframe) — LWS blocks
  many SDK patterns; iframes are the LWS-safe path.
