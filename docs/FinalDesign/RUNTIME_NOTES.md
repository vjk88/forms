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

## Guest drafts — `draftManager` security (same elevated-context class as file upload)
Save & Resume for guests means guest-created records holding PII, readable later by an
unauthenticated visitor. Rules:

- **Resume key = cryptographically unguessable token** (crypto-random, 128-bit+). Never a record Id,
  never sequential, never derived from user data.
- Guest read-back is **token-gated to exactly ONE draft**: the Apex takes the token, returns the
  matching draft or nothing. No list/query surface for guests, ever.
- **Expiry purge is mandatory** — scheduled cleanup deletes drafts past `Draft Expiry`. A draft
  store that only grows is a PII liability.
- **Emailed resume links:** send only to an address collected *inside this draft's form data*, and
  rate-limit sends — otherwise the org becomes an open email relay.

## External embeds — `formMap` / `formVideo` on Experience Cloud
- External providers (Google Maps, Leaflet tile servers, YouTube, Vimeo) require **CSP Trusted
  Sites** on the Experience Cloud site — a subscriber-org admin step. Document it per provider, and
  **detect + degrade gracefully** (placeholder with a hint, not a broken grey box) when CSP blocks
  the load.
- **Default map provider = native `lightning-map`** — no API key, no CSP setup. "Salesforce Maps"
  the paid SKU is never required.
- **Prefer iframe embeds over provider JS SDKs** (e.g. `youtube-nocookie.com` iframe) — LWS blocks
  many SDK patterns; iframes are the LWS-safe path.
