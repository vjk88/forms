# Guest Delivery · Prefill · Custom Lookup — Program Spec

**Status:** SPEC APPROVED-IN-PRINCIPLE (owner rulings 2026-07-19) — each phase still
gets its own IMPL_PLAN before code.
**Owner rulings:** hosting = Experience Cloud **LWR** template + iframe embed bridge
(an Aura-template site also works; the server family is host-agnostic) · order =
**Guest → Prefill → Lookup** · lookup v1 = **Core + dependent** (recently-viewed,
inline +New, SOQL WHERE hatch deferred to v2).
**Security law:** everything here obeys [RUNTIME_NOTES.md](./RUNTIME_NOTES.md) — this
spec adds build shape, not new security rules.

---

## Why one program

Three features, one dependency spine: the **guest controller family** is the
foundation; prefill's guest half and lookup's guest half are riders on it. Each
phase ships and has value alone.

Plain language: _guest_ = a person with the link and no Salesforce login. _Elevated
context_ = Apex that deliberately bypasses record sharing (`without sharing`) because
guests own nothing — which is exactly why every such method is hard-gated.

---

## Phase A — Guest render + submit (the foundation)

### A1. Server: the guest family (`FinalGuestController` + shared engine)

- **One class, `public without sharing`, every method opens with the HARD GATE**
  (legacy `FormViewerGuest` pattern, proven): form exists → `Status__c = 'Published'`
  → `Allowed_Adapters__c` contains `Public_Guest` → active version. Fail = one
  generic "This form is not available." (never leak which gate failed).
- **`getGuestSpec(formId)`** returns the runtime **projection** of the active
  published spec: element `binding` blocks stripped server-side at serve time (no
  publish-format change needed), theme `resolved` tokens intact. The client never
  sees field API names (RUNTIME_NOTES "spec delivery"). Handles the `{"overflow":
true}` ContentVersion path in system context.
- **`submitGuest(formId, payloadJson)`** — the submit engine refactors into a shared
  `FinalSubmitService` so internal and guest paths run ONE mapping/savepoint engine
  with different postures:
  - internal (existing `FinalSubmitController`): user's own CRUD/FLS via
    `stripInaccessible` — unchanged behavior;
  - guest: **the published spec IS the allow-list** — only fields the spec binds,
    only the form's target + repeat child objects, inserted system-mode
    (`Database.insert(..., AccessLevel.SYSTEM_MODE)` — explicit, since v67 defaults
    to user mode). No client-named objects or fields, ever.
- **Server-side enforcement at submit** (schema vocabulary already exists,
  `settings.availability` / `spamProtection`): open/close window, response cap,
  honeypot check, per-window rate limit (Platform Cache counter keyed by session/IP;
  fail closed politely). A closed form rejects a replayed POST (RUNTIME_NOTES).
- Apex tests: gate matrix (draft/unlisted/no-adapter/expired), projection strips
  bindings, allow-list rejects unbound fields, cap/window/honeypot enforcement,
  atomic rollback with repeats.

### A2. Host: LWR site page + viewer data source

- `c/finalGuestHost` — reads `formId` from the URL, calls the guest family, feeds
  the EXISTING `c-final-form-viewer` (which already takes a spec and emits submits;
  the host owns which controller family it talks to). No fork of the viewer.
- Site setup is **documented, not coded**: create LWR site → public access → guest
  profile gets ONLY the guest Apex class → CSP/clickjacking settings. Lives in
  `GUEST_SITE_SETUP.md` as an ordered checklist.
- Spam honeypot element renders in the guest host path (visually hidden input; the
  server checks it).

### A3. Iframe embed bridge

- `finalEmbedBridge` on the guest page: `ResizeObserver` on the rendered form →
  `postMessage({ type: 'finalforms:height', height })` to the parent. Outbound
  one-way, carries a number only; no inbound message handling.
- **Embed snippet** (documented, copy-paste): iframe + ~10-line listener that sets
  the iframe height; plus a script-free fixed-height fallback variant.
- Setup doc: the site's clickjacking **domain allow-list** step (framing is blocked
  until the embedding domain is explicitly allowed — that's the desired posture).
- This IS the "iframe" row of HOSTING_ADAPTERS_SPEC — mark that row satisfied.

## Phase B — Prefill (internal first)

- **Schema (already reserved, §settings.prefill):** `source: 'urlParams' |
'sourceRecord' | 'none'` + `autofillRules` porting the OLD-BUILD model that
  shipped and worked: `{ source: 'url' | 'record', param?, recordIdParam?,
sourceObject?, mappings: [{ from, to }] }` — `to` is an ELEMENT ID, never a field
  name (client-side vocabulary stays binding-free).
- **URL params:** viewer host resolves `?param=value` → element initial answers.
  Element-level `defaultValue` wins over form-level prefill (schema nit, kept).
- **Record prefill, internal:** the platform path (LDS `getRecord`) in the internal
  host — FLS + sharing enforced natively, zero custom Apex (RUNTIME_NOTES rule:
  don't rebuild what the platform enforces).
- **Authoring:** "Prefill" group in the studio (Actions area beside After submit) —
  ports the legacy `autofillEditor` modal pattern: rule list + one-rule editor,
  mappings from source field → form element.
- Guests in this phase: **`urlParams` only for non-sensitive plain values**; record
  prefill for guests explicitly waits for Phase C tokens.

## Phase C — Guest record prefill (tokens, never raw Ids)

- RUNTIME_NOTES law: a raw record Id in a guest URL is a data oracle. Guest record
  prefill = **signed opaque token**: `Crypto.generateMac(HMAC-SHA256)` over
  `formId|recordId|expiry` with an org-secret key (protected Custom Setting,
  generated once), URL-safe base64.
- Mint surface: "Copy prefilled link" for a record (v1: internal studio/share
  action; later: flow action for campaigns).
- Resolve: guest family verifies signature + expiry, loads the record system-mode,
  returns ONLY the fields the published spec's autofill rules reference
  (server-derived allow-list; client field lists ignored).

## Phase D — Custom lookup (Core + dependent)

- **Element:** reference-bound fields gain Display-as "Search picker" →
  `c/finalLookup`: type-ahead (300ms debounce, min 2 chars, max 8 results),
  primary + secondary display fields, keyboard nav + ARIA combobox.
- **Config (`element.lookupConfig`, subset of the old spec):** display fields,
  searchFields, declarative filter rows (visibility-rule operators reused) with
  dynamic tokens `$User.<field>` and `$field.<elementId>` (dependent lookups —
  Contact picker filtered by the chosen Account).
- **Server:** `search(formId, versionId, elementId, term, context)` — config loaded
  from the PUBLISHED spec server-side (client config ignored), filters compiled to
  **parameter-bound** WHERE, `WITH USER_MODE` for internal users.
- **Builder:** lookup section in the field inspector, progressive (reference
  bindings only); preset filter rows, no regex/no raw SOQL (2-click rule).
- **Guest search:** same shape in the guest family, hard-gated + the spec-derived
  object/field allow-list; `allowCreate` hard-off for guests (and deferred for v1
  entirely).
- **v2 (deferred):** recently-viewed, inline +New, SOQL WHERE escape hatch,
  polymorphic references.

---

## Build sequencing (each = branch + IMPL_PLAN + PR)

| #   | Slice                                                  | Ships alone?                   |
| --- | ------------------------------------------------------ | ------------------------------ |
| A1  | Guest controller family + shared submit engine + tests | yes (API-complete before host) |
| A2  | LWR host component + site setup doc                    | yes — guest forms live         |
| A3  | Availability/spam server enforcement                   | yes                            |
| A4  | Embed bridge + snippet doc                             | yes — iframe row done          |
| B1  | Prefill runtime (urlParams + LDS record path)          | yes — internal value           |
| B2  | Prefill authoring UI                                   | yes                            |
| C1  | Token mint + resolve + guest prefill                   | yes                            |
| D1  | Lookup server + element (internal)                     | yes                            |
| D2  | Lookup builder config UI                               | yes                            |
| D3  | Guest lookup search                                    | yes                            |

Old-build artifacts referenced as TECHNIQUE ONLY (never product truth):
`FormViewerGuest.cls` (gate pattern), `formAutofill`/`autofillEditor` (rule model +
editor UX), `docs/redesign/CUSTOM_LOOKUP_SPEC.md` (scope source for D).
