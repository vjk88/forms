# Guest uploads and larger attachments: technical implementation plan

**Status:** Implemented and deployed to `revclouddev` for QA, 2026-11-25: one `Form_Upload__c` per attempt, multiple files in JSON, guest defaults only, atomic association/retries and cleanup. All 187 selected Apex tests pass. Native anonymous browser transport is still unverified; the public QA setup remains pending explicit approval after automatic approval review rejected the settings/public-form change. See [the implementation handoff](../qa/GUEST_UPLOAD_IMPLEMENTATION_2026-11-25.md) for exact evidence, setup and limitations. No git commit was made.
**Date:** 2026-09-08; storage model revised 2026-11-23.
**Audience:** Developer implementing the feature, with explicit contracts and verification gates.  
**Scope:** Guest uploads on the published Experience Cloud LWR form, larger uploads for authenticated respondents on supported hosts, final submission, retries, per-attempt limits, cleanup, and authoring controls.

See [the transport-proof handoff](../archive/GUEST_UPLOAD_PROOF_HANDOFF.md) for the actual first batch,
targeted metadata manifest, local checks, and the owner-run org gate. The prototype is
isolated from the production form pipeline and does not enable staged respondent uploads.

This is Slice 2 of [the existing file-upload plan](./IMPL_PLAN_FILE_UPLOAD.md). The owner authorized implementation and targeted QA deployment, with no git commit. Production enablement is separate. Existing inline upload behavior remains available during migration.

## 1. Outcome and architectural decision

A respondent can attach ordinary documents or phone photos, remove them, correct other answers, and submit once. Files appear on the record created by that submission, or on `Form_Response__c` for a survey / `Form_Submission__c` for a freeform form. Guests receive no Salesforce record IDs or file-download URLs from the app.

**Use native Salesforce file transport with application-controlled staging.** File bytes travel from the browser through `lightning-file-upload` into Salesforce Files. Apex handles small metadata, capabilities, validation, and final record association. It must not receive or query large `VersionData` blobs.

The existing inline path sends Base64 inside the answer payload and inserts `ContentVersion` during submission. Its measured aggregate cap is 1,200,000 Base64 characters, approximately 879 KiB of raw data. Raising that constant or moving the same large JSON to a Queueable does not solve the initial request/heap problem.

The new flow is:

```text
Published form
  → create/reuse one Form_Upload__c record for this attempt
  → add a reserved file entry to its Files_JSON__c array
  → upload bytes through Salesforce's native uploader
  → ContentVersion guard validates and records the staged file
  → respondent sees an attached-file receipt
  → submit answers plus receipt references
  → one transaction creates the submission, links all accepted files, and completes Form_Upload__c
```

**Simple storage model:** Salesforce Files stores the actual files. One `Form_Upload__c` attempt record stores the form, expiry, submission result, and a JSON array describing all its files. There are no separate session, per-file, or usage records. Enforce file size/count and total bytes on this attempt only; Salesforce handles org storage limits. Section 8 defines per-attempt enforcement and storage-error behavior.

The file upload and final submission are separate transactions. We can make **submission creation + file linking + session consumption atomic**. We cannot roll back an already completed upload when someone abandons the form; cleanup handles it.

### Supported surfaces

| Surface                                      | New behavior                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published LWR site, anonymous guest          | Native staged uploads after site setup and server checks.                                                                                                          |
| Published LWR site, authenticated customer   | Same receipts; bind session to that user. File transport uses their platform permissions. Existing public-form submission posture remains independent of identity. |
| Lightning Experience respondent viewer       | Same staged protocol for published forms; normal internal submission permissions.                                                                                  |
| Studio on `FinalStudio.page` / Lightning Out | Local simulated file selection and validation only; no native file persistence. Offer an explicit link to test the published LWR form.                             |
| Existing inline internal forms               | Continue the current small-file path until deliberately published with staged uploads.                                                                             |

Salesforce supports a guest upload correlation field on `ContentVersion` whose API name ends in `fileupload__c`, supplied through `file-field-name`/`file-field-value`; omit `record-id` for staging. Guest uploads and LWR upload support require org settings. The component is unsupported in Lightning Out; Android has multiple-selection restrictions. The event documentation distinguishes guest results from authenticated `documentId` results, so do not use event IDs as authorization. [Official file-upload component reference — developer documentation](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-file-upload.html).

Our limits below are product limits, not a restatement of Salesforce's much larger transport maximum.

## 2. Existing implementation and exact extension points

All code paths below are relative to `force-app/main/default/` and were verified to exist locally on the design date.

| Existing file/bundle                                                     | Source-verified behavior                                                                                                           | Extend here                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `classes/FinalSubmitService.cls`                                         | `run`, survey, and freeform paths create records; `attachFiles` inserts inline files inside the savepoint. Nonempty guest `files` is rejected. | Add receipt attachment inside all three submission transactions; keep legacy guest Base64 rejection. |
| `classes/FinalGuestController.cls`                                       | Public/active-version gates, availability checks on spec/submit, token validation, guest submission.                               | Public session/slot/receipt entry points and upload-session submit coordination.                |
| `classes/FinalSubmitController.cls`                                      | Authenticated version loading and submit wrapper.                                                                                  | Upload-session identity/idempotency and exact form-version agreement.                           |
| `lwc/finalElementRenderer/`                                              | Native HTML file selection/drop, Base64 read, local file list, ordinary `valuechange`.                                             | Delegate staged mode to a small new upload control; retain inline/simulated modes.              |
| `lwc/finalFormViewer/finalFormViewer.js`                                 | `_payload` removes file answers from `answers`, emits `{elementId,name,base64}` under `files`.                                     | Emit small `fileRefs` for staged mode; pending and retry coordination.                          |
| `lwc/finalFormViewer/previewSession.js`                                  | Preserves/prunes in-memory preview answers.                                                                                        | Preserve simulated attachments only; never persist upload capabilities in design state.         |
| `lwc/finalGuestHost/`                                                    | Loads projected spec, injects context, submits through guest controller.                                                           | Own guest upload session, lifecycle, safe capability distribution, and retry state.             |
| `lwc/finalPreviewStage/`                                                 | Studio device preview and restart.                                                                                                 | Simulate attachments and reset them without creating Files.                                     |
| `lwc/finalPropertyPanel/`                                                | File properties currently expose label and explanatory text.                                                                       | Add actual type, size, count, and multiple-file controls.                                       |
| `lwc/finalBuilderCanvas/`                                                | File elements are prohibited inside repeaters.                                                                                     | Preserve this restriction, including move/import/publish paths.                                 |
| `classes/FinalSpecController.cls`                                        | Server publication.                                                                                                                | Validate upload policy and supported file configurations.                                       |
| `classes/FinalSpecTransferValidator.cls`, `FinalSpecTransferService.cls` | Spec transfer validation and clone/import handling.                                                                                | Transfer policy only; reject/drop runtime transport state explicitly.                           |

The repository contains the isolated `Final_Upload_Proof__c` prototype and `FinalUploadContentVersion` trigger. They do not implement the production model below. Section 5 proposes `Form_Upload__c`; this is a design, not a changed-files manifest.

Two older documentation statements need an explicit architectural update when implementation lands:

- [RUNTIME_NOTES.md](../RUNTIME_NOTES.md) describes Apex inserting guest `VersionData` and using `FirstPublishLocationId` immediately. The staged path instead uses native transport and links to the server-created submission later. The restriction against arbitrary client-selected target records remains mandatory.
- [FORM_SPEC_SCHEMA.md](../FORM_SPEC_SCHEMA.md) documents inline `files` and deferred draft attachments. This adds an opt-in receipt contract; it does not silently reinterpret old payloads or implement durable save-and-resume attachments.

## 3. First implementation batch: prove the native transport boundary

Do this small proof before building the full editor. Jest cannot establish any item in this section. The developer prepares targeted metadata; the owner performs deployment and approved org checks under the existing project workflow.

**Latest preflight (2026-11-25):** Org connection, guest enrollment and the internal proof page are confirmed. Current Content settings show guest upload enabled. The anonymous home page is blank and the retrieved site bundle has no proof component, so no anonymous file upload was executed. See [the current check evidence](../qa/GUEST_UPLOAD_CHECK_2026-11-25.md). Restore the isolated public harness before rerunning this gate.

On the actual LWR site, prove:

1. An anonymous upload with the optional correlation field, no `record-id`, and the required org settings creates a new file; no guest access to `Form__c`, `Form_Version__c`, sessions, or receipts is granted.
2. The ContentVersion insert trigger receives the correlation value on initial upload. In after-insert, metadata queries expose `ContentSize`, `ContentDocumentId`, extension, and version identity without querying `VersionData`.
3. `addError` on the triggering row rejects the native upload and leaves no committed document/version/link. Test invalid correlation, oversized content, duplicate slot use, and disallowed extension. Verify actual storage rows rather than trusting the toast.
4. The guard can query the correlation ledger in its narrow system-context service without requiring guest authoring/ledger CRUD. No broad “Query All Files” grant to the guest is an acceptable workaround.
5. A staged guest file is not anonymously downloadable or searchable. Identify the actual default owner and implicit links created by the platform; document that exact behavior before implementing cleanup.
6. Multiple uploads to the same slot concurrently result in at most one committed staged document. Removal versus finalization races preserve exactly one valid outcome.
7. Namespace-aware correlation-field resolution, custom ContentVersion validation/required fields, the LWR bundle publication, and customer licenses work in the intended environment.

**If these fail, stop the native-transport implementation at this batch and amend the design.** In particular, do not replace transactional enforcement with “upload anything and delete it later.” A separately authorized external upload broker would be an alternative design, not an automatic fallback.

General Apex trigger transaction/error behavior is documented in [Apex trigger fundamentals — Salesforce Trailhead](https://trailhead.salesforce.com/content/learn/modules/apex_triggers/apex_triggers_intro). The exact ContentVersion/native-LWR lifecycle above remains an org proof requirement; generic trigger documentation does not prove those details. The object-reference pages returned empty shells during this design review, so their contents are not claimed as verified evidence.

## 4. Scope, policy, and authoring

### Initial product defaults

Use integer bytes internally and label MiB honestly in the UI (`1 MiB = 1,048,576 bytes`). Guest defaults are 10 MiB per file, five files, and 25 MiB per attempt. Admins can raise or lower these guest defaults in upload policy; they are not hard-coded ceilings. Logged-in users have no application default file-size, total-byte, or file-count limit. Explicit author/admin restrictions still apply when configured, as do Salesforce transport, site moderation, and org storage limits.

| Limit                                             | Anonymous guest                   | Authenticated staged user |
| ------------------------------------------------- | --------------------------------- | ------------------------- |
| Per file | 10 MiB; admin-configurable | No app default limit |
| Aggregate per submission | 25 MiB; admin-configurable | No app default limit |
| Files per submission | 5; admin-configurable | No app default limit |
| File selections per native dialog                 | 1                                 | 1                         |
| Upload slot lifetime                              | 10 minutes                        | 10 minutes                |
| Upload session lifetime                           | 2 hours, absolute                 | 2 hours, absolute         |
| Pending-file retention                            | Expiry followed by hourly cleanup | Same                      |

One-file selection per reserved slot makes capability reuse/count enforcement explicit and works on Android. `multiple: true` means the respondent can add several file rows through repeated uploads, not that a single grant can upload an unlimited batch. Multi-select batch grants can be a later extension.

**File types: the author decides; nothing is blocked by the app (owner 2026-11-23).** The file question's **Allowed file types** (`config.accept`, any extensions the author lists) drives the native picker's `accept` filter, and the guard refuses a committed file whose extension is not on that list, because the picker filter alone can be bypassed by a script. With no list, any type is accepted. There is no app-level blocklist of "dangerous" types.

**No virus scanning** (owner 2026-11-23): Salesforce does not scan uploads either. The org admin's own Setup → File Upload and Download Security settings (how types such as HTML are downloaded or opened) remain the platform control. Never show a "scanned" badge or claim files are safe.

### Proposed persisted JSON

This is a fragment of a normal `specVersion: 1` form. `guestDefaults` is an optional published form override of the admin-configured guest policy defaults and applies only to guests. The element restrictions shown are explicit author choices, not logged-in defaults; omit them for no app restriction. Validate overrides according to the admin's configured authoring rights. Keep `config.accept` as the existing comma-separated string; the new size property has explicit byte units.

```json
{
  "settings": {
    "uploads": {
      "transport": "stagedV1",
      "guestDefaults": {
        "maxFileBytes": 10485760,
        "maxTotalBytes": 26214400,
        "maxFiles": 5
      }
    }
  },
  "pages": [
    {
      "id": "pg_main",
      "sections": [
        {
          "id": "sec_docs",
          "elements": [
            {
              "id": "el_documents",
              "type": "file",
              "label": "Supporting documents",
              "config": {
                "accept": ".pdf,.jpg,.jpeg,.png",
                "multiple": true,
                "maxFiles": 3,
                "maxSizeBytes": 10485760
              },
              "validation": [
                { "type": "required", "message": "Add a supporting document." }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

The array-valued `element.validation` contract and optional `when` gates were verified against schema section 7 and `finalExpressionEngine.validateElement`. Reuse that shape rather than adding an element-level upload-only required flag. Effective limits use only explicitly configured restrictions and applicable Salesforce platform limits. Guest attempts also apply the admin-configured guest defaults. An absent size/count/total restriction means unbounded by the app for logged-in users; never substitute guest defaults or the former authenticated 25 MiB/50 MiB/five-file values. Determine audience from the running user, including signed-in customers on a public host.

- Absent `settings.uploads.transport` preserves legacy inline-internal behavior. Public file upload is enabled only by publishing `stagedV1` and completing site setup.
- Missing `accept` means any type. Store and compare extensions in lower case without the dot; MIME patterns such as `image/*` only filter the picker, so the guard compares against the extensions the author listed.
- `multiple: false` forces element maxFiles to 1. Validate total and per-element counts independently.
- The older schema's reserved `maxSize`/`allowedTypes` names are not alternative new storage keys. On import, offer an explicit conversion with units or flag ambiguity; do not guess what an unlabelled size means.
- Do not persist a `linkToRecord` choice. The only attachment destination is the server-created submission record.
- File elements remain disallowed inside repeaters.

File properties should show **Allowed file types**, **Maximum file size**, and **Allow multiple files** with a count control when enabled. Explain the effective guest limit. Update the current “attach files when they submit” copy to explain that files upload when selected and are attached when the form is submitted. This belongs in field behavior, not premium Design settings.

## 5. One Form_Upload__c record per attempt

Salesforce Files holds the bytes. **Create one `Form_Upload__c` record per form attempt, with all its file entries in `Files_JSON__c`.** Adding a second or fifth file updates that same record. Do not create a separate session record, per-file record, or quota object.

The existing API terms “session” and “slot” remain useful: a session means the attempt record; a slot means one JSON file entry. They do not name additional database records. Multiple files remain supported with the section 4 defaults, including admin-configurable guest defaults and no logged-in default file-count cap. One native dialog uploads one reserved entry at a time; several entries may upload concurrently.

### Proposed metadata

| Metadata | Purpose |
| --- | --- |
| `Form_Upload__c` | Private object containing one record per form attempt. Guests have no object CRUD. No special usage record, record-kind discriminator, or shared counters. |
| Attempt identity fields | `Public_Key__c` Text(64), unique; `Token_Hash__c` Text(64), unique; `Form__c` and `Form_Version__c` lookups; running `Actor_User__c` / enrolled `Guest_User_Id__c`; server-derived `Site_Key__c` and audience. Public key is a random lookup key, never authorization. |
| Attempt lifecycle fields | `Status__c` (`OPEN`, `CONSUMED`, `CANCELLED`, `EXPIRED`); `Expires_At__c`; `Submission_Key__c`; safe result record ID/type and child count; consumed timestamp. Keep queryable expiry/status on normal fields so cleanup does not scan JSON to find expired attempts. |
| `Files_JSON__c` | Long Text Area configured for 131,072 characters. Versioned JSON containing every file entry for the attempt, including removal and cleanup state. Enforce a 64,000-character application limit, bounded filenames/error codes, and an admin-configurable guest lifetime-entry limit (initially 20). Do not apply that 20-entry limit to logged-in users. The JSON field/application character ceiling remains a technical capacity limit; return an explicit capacity error rather than silently truncating file entries. Do not store file bytes or raw secrets. |
| `Final_Upload_Policy__mdt` | Disabled-by-default settings: enrolled guest identities, enabled sites/audiences, limits, retention, supported hosts, namespace-aware marker field. Configuration only; not counters. |
| `ContentVersion.Final_Upload_fileupload__c` | Optional Text(255) correlation field for the upload marker. Resolve its qualified API name using Schema metadata. Never place a target record ID in it. |
| `ContentVersion.Form_Upload_Key__c` | Optional Text(64) server-stamped attempt public key; not a secret or authorization. Retain it after clearing the raw marker, restrict field access, and guard against caller edits. It lets later version/update checks find the attempt without searching inside JSON. |

These are proposed fields, not existing production metadata. Reuse the prototype's correlation field and refactor its trigger rather than installing a second competing guard.

### Example file array

This is server-only JSON on `Form_Upload__c`, not the published form spec or a browser-writable document. The sample illustrates two files on the same attempt. IDs and hashes below are placeholders.

```json
{
  "schemaVersion": 1,
  "files": [
    {
      "key": "random-file-key-a",
      "elementId": "el_documents",
      "tokenHash": "sha256-of-file-secret-a",
      "state": "READY",
      "expiresAt": "2026-11-23T18:10:00Z",
      "reservedMaxBytes": 10485760,
      "contentVersionId": "server-verified-version-a",
      "contentDocumentId": "server-verified-document-a",
      "name": "supporting-document.pdf",
      "sizeBytes": 5242880,
      "extension": "pdf",
      "cleanupStatus": "NONE"
    },
    {
      "key": "random-file-key-b",
      "elementId": "el_documents",
      "tokenHash": "sha256-of-file-secret-b",
      "state": "RESERVED",
      "expiresAt": "2026-11-23T18:12:00Z",
      "reservedMaxBytes": 10485760,
      "cleanupStatus": "NONE"
    }
  ]
}
```

Keep removed/expired entries until their files have been safely deleted or preserved for review. Persist cleanup result/retry time per entry. Repeated removal/cleanup must be idempotent; confirmed-deleted entries must not be processed again. Do not reuse file keys. The configurable guest lifetime-entry cap and the JSON character ceiling bound JSON growth. Logged-in attempts have no fixed default entry-count cap; enforce the JSON character ceiling without dropping file history.

### Tokens and finding the right JSON entry

Generate separate 256-bit random secrets for the attempt and each file. Store only SHA-256 hashes. The attempt token is `attemptPublicKey.secret`; the file marker / `slotToken` is `attemptPublicKey.fileKey.secret`. Only random public keys and secrets travel in these tokens, never Salesforce IDs. Both fit within the marker field's 255-character limit using bounded Base64URL keys.

The trigger parses the marker, queries the attempt by its indexed unique public key, locks the record, finds the file key in JSON, and compares the secret hash. On acceptance, stamp the nonsecret `ContentVersion.Form_Upload_Key__c`. For updates or new versions, resolve the original accepted version through the document's version metadata and that key, then check the locked attempt JSON. Do not scan all attempts or rely on the cleared secret marker to recognize a protected document. Bulk-resolve these metadata reads and reject attempts to remove/change the server-stamped key. Public keys alone grant nothing. A file token authorizes one new file only; the attempt token authorizes status, removal, and final submission. Do not put secrets in logs, URLs, persisted JSON, answers, exports, or resume drafts. Status returns safe projections, never the stored JSON or token hashes.

Authenticated attempts bind to the running user. Guests share a site identity, so the secret tokens distinguish visitors. A signed-in customer on a public host still gets a user-bound attempt.

### Concurrent updates

Every change reloads `Form_Upload__c` under a row lock, parses the latest JSON, changes the relevant entries, and writes it once. Never write back a JSON snapshot supplied by the browser or loaded before the lock. Two simultaneous uploads to different entries must both survive; two uploads using the same entry can commit at most one file. In a bulk trigger, group all versions by attempt and update each attempt once.

### State transitions

```text
Attempt: OPEN → CONSUMED / CANCELLED / EXPIRED
File:    RESERVED → READY → CONSUMED / REMOVED / EXPIRED
         RESERVED → CANCELLED / EXPIRED
```

`READY` means committed and accepted by the size and allowed-type checks. A rejected native transaction leaves the entry `RESERVED` and retryable until expiry. A consumed entry cannot accept another file or version.

## 6. Public and authenticated API contracts

Keep guest-callable methods on `FinalGuestController`; use a new authenticated `FinalUploadController` for internal/customer entry points. Both call shared policy/session services with an explicit, validated posture. Service/trigger classes are not Aura endpoints.

Proposed method names below are new contracts; verify every LWC import/signature against their actual Apex definitions when implemented.

| Method                                | Input                                                | Output                                                                                          |
| ------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createUploadSession`                 | `formId`, `versionId`; guest page ticket and proof nonce                                | Raw session token, expiry, effective limits, supported transport.                               |
| `reserveUploadSlot`                   | Session token, element ID                            | Raw file marker (`slotToken`), public file key, marker field API name, expiry, effective accept list and size. |
| `getUploadStatus`                     | Session token                                        | Safe slot receipts and state; no file content, target IDs, or guest download URLs.              |
| `removeUpload`                        | Session token, slot token                            | Idempotent removed/pending-cleanup status.                                                      |
| `cancelUploadSession`                 | Session token                                        | Idempotent cancelled/pending-cleanup status.                                                    |
| Existing `submitGuest` / `submitForm` | Existing payload plus `fileRefs` and upload metadata | Existing success/error contract; retry may return stored success.                               |

All are imperative/non-cacheable. Cap small input strings and collection lengths before processing. Return generic authorization errors and safe actionable limit errors. Never accept object API names, a target record ID, ContentVersion IDs, or ContentDocument IDs as authority.

Status receipts identify JSON entries by the random public file key returned at reservation. They do not reissue raw capabilities from hashes. The browser retains its original slot token in memory; losing the whole browser session means starting again and allowing cleanup to expire the abandoned files. The one marker-field API name is transport configuration, not disclosure of the form's bound business schema; no business object/field API names are returned to guests.

Each admission/read endpoint independently loads the authorized exact spec and checks published status, enabled upload policy, that the form is public (`Is_Public__c`) for guest calls, opening/closing windows, applicable response caps, and active version. Internal access uses the existing authenticated permission boundary; guest access uses server-loaded metadata behind the public gate, never `WITH USER_MODE` on authoring records. For staged uploads, require Form Version to belong to Form and be the intended active published version on both submission routes.

**Bot check on guest attempts.** Guest `createUploadSession` requires the page's ticket and solved proof-of-work nonce (`FinalGuestTicket.verify`, PR 475). The ticket is not used up until Submit. Signed-in callers skip this check. Existing guest bot checks stay in scope; no per-ticket attempt counter is required for this release.

### Nice to have: guest attempt throttle (DEFERRED #72)

Owner 2026-11-23 moved the additional **three attempts per page ticket** throttle to Very nice to have. If implemented later, count attempts in Platform Cache partition `local.FinalGuest`, following `FinalAddressGuestGuard`, and define cache-unavailable behavior explicitly. That existing read/check/write pattern is not atomic, so concurrent requests can exceed three and cache eviction can reset a count. Describe it as a best-effort throttle, not an exact limit or storage guarantee. It requires no usage record or global lock and does not block the initial upload release. See [DEFERRED #72](../DEFERRED.md#very-nice-to-have).

**Revocation exception for removal:** after closure/republish, cancellation and removal may still authenticate the capability against its original session solely to remove its unconsumed uploads. They cannot create/read new form context, reserve slots, or attach files. After successful consumption, status can return only the session's stored success receipt to support recovery from a lost network response; it cannot reopen upload privileges.

### Final submission payload

```json
{
  "answers": { "el_name": "Avery" },
  "repeats": {},
  "fileRefs": [
    { "elementId": "el_documents", "slotToken": "opaque-slot-capability" }
  ],
  "meta": {
    "specVersionId": "published-version-id",
    "uploadSessionToken": "opaque-session-capability",
    "submissionKey": "stable-random-client-request-key"
  }
}
```

`fileRefs` is the only staged submission channel. Reject a staged request mixing it with legacy Base64 `files`; reject Base64 guest uploads as before. Strip file answer objects out of `answers`. Do not trust names/sizes supplied by the browser; get them from accepted server receipts. An empty `fileRefs` list is allowed only when effective file requirements are satisfied.

Do not place upload secrets into `Form_Response_Answer__c`, telemetry, export/import, or resume drafts. A survey file answer, if recorded for reporting, contains only safe attachment metadata/association derived server-side; the document link is to `Form_Response__c`.

## 7. Native upload guard: the enforcement point

New `FinalUploadContentVersion` trigger delegates to `FinalUploadGuard`. Validate before/after insert as proved in batch 1. No code path queries, decodes, concatenates, or logs `VersionData`.

### Prevent the unmarked-upload bypass

Enabling native guest uploads is an org setting. Protecting only files with our marker would allow the same enabled site guest user to send an unmarked native upload and skip per-attempt checks.

For an explicitly enrolled site guest user, require a valid slot on **every guest ContentVersion insert**. Missing, fabricated, or expired markers fail closed. Other authenticated/unrelated uploads without our marker are unaffected. Any marked upload, regardless of actor, must pass the guard.

This creates a real site-level integration constraint: another uploader using the same guest user must adopt the slot protocol, or use a separately governed site/guest identity. Inventory existing uploaders before enrolling that guest user. Never silently break unrelated sites or claim a marker-only trigger closes anonymous storage admission.

Keep site **enrollment** separate from **admission enabled**. Turning off admission must continue rejecting unmarked or newly attempted guest uploads for that enrolled identity; it must not disable the guard and accidentally open the native endpoint.

### Validation sequence

1. Parse bounded markers; resolve attempt public keys in bulk, then verify each file key and secret hash against the locked JSON. Fail unknown capabilities without record-detail errors.
2. Acquire locks in one consistent order: attempt records, existing invitation records, then form-cap records. Sort IDs within each type; recheck state after locking. Use this order in admission, native guard, submit, removal, and cleanup. Refactor existing controller lock acquisition where necessary; never acquire an earlier lock while holding a later one.
3. Check session/slot expiry, actor/site binding, exact published version and current availability, enabled element/type, and remaining per-attempt file count/byte allowance. Reject caller-selected business/library targets and uploads of a new version of an existing document; slots only authorize fresh staged files.
4. After insert, query only metadata by the inserted IDs. Require ContentSize to be present and within the configured per-file, per-element, and per-attempt limits. Salesforce enforces org storage limits. Normalize the extension and, when the author listed allowed types, refuse a file whose extension is not on that list. Do not trust MIME or filename from `uploadfinished`.
5. Preserve the authenticated proof finding: native transport can populate `FirstPublishLocationId` with the uploading user even without `record-id`; do not reject that verified implicit owner location. Guest ownership/link behavior still needs proof. Reject unexpected preexisting record/library/public distribution links. Account for only the platform's implicit owner link established in batch 1; no business record attachment occurs here.
6. Record verified version/document IDs in the JSON entry, mark it `READY`, replace its reserved maximum with verified actual bytes for per-attempt checks, and save the attempt JSON in the same transaction. `addError` must roll back the upload and ledger changes on any rejection.

Validate marked updates/new versions too so the marker is not a back door for replacing content after acceptance. Bind finalization to the exact accepted version; do not attach a document that has unexpectedly gained another version or different links. Clear the raw marker once correlation is safely recorded if the native lifecycle permits it; otherwise tightly restrict field read access and remove it before business attachment. Prove this behavior rather than relying on trigger-field assignment surviving platform processing.

The after-insert size check prevents an oversized file from being **committed**. It does not stop all bytes from reaching Salesforce first. Native upload bandwidth/DDoS protection remains platform/ingress responsibility; per-attempt limits must not be described as a pre-transfer size filter or an IP firewall.

## 8. Per-attempt limits and Salesforce storage

**Use only the person's `Form_Upload__c` record. Salesforce handles org storage limits.** There is no usage record, shared storage budget, daily byte allowance, cross-visitor counter, or application-managed site/org upload cap. Do not add shared hourly attempt counters or a usage service as part of this feature. Existing form availability/response caps remain independent submission rules.

### Multiple files on the same attempt

Apply the admin-configurable guest defaults: **five files**, **10 MiB per file**, and **25 MiB total** initially. Admins can raise or lower them. **Logged-in users have no app default size, total-byte, or file-count limit**; apply only explicitly configured restrictions and Salesforce limits. The initial guest lifetime-entry limit is 20 and is admin-configurable; logged-in users have no default lifetime-entry count. Every attempt must still fit the bounded JSON field. Each entry gets a ten-minute upload token; the attempt expires after two hours.

Before issuing a marker, lock the attempt, read the latest JSON, and check its per-element and total file counts. For the attempt's byte allowance, count each active `RESERVED` entry at its server-calculated maximum size and each committed pending file at its verified actual size. When a size/total restriction exists, limit a new reservation to the smaller applicable per-file maximum and remaining total-byte allowance; refuse if no capacity remains. Represent absent limits as null/unbounded, never zero or a guest default. For logged-in uploads without either restriction, issue the marker without an app byte reservation and record actual size after upload; Salesforce controls transport/storage. Apply count checks only when a count limit is configured. Return that effective maximum to the UI. This reserves room only within this attempt, not in Salesforce storage.

When a native upload commits, replace that entry's reserved maximum with the verified actual size. On rejection, the native transaction rolls back and leaves the prior reservation retryable until expiry. Locking the attempt prevents two concurrent uploads from exceeding its limits or overwriting each other's JSON. Different attempts do not share a lock or counters.

For example, a guest attempt with a 25 MiB total limit can accept files of 10 MiB, 10 MiB, and 5 MiB. After two 10 MiB files, the next grant has a 5 MiB maximum. It cannot authorize another 10 MiB file. Up to five smaller files are also allowed within that total.

Cancelling an unused grant releases its allowance within the attempt. Removing a committed file invalidates its submission receipt immediately, but its actual bytes continue to count toward the attempt's pending-byte allowance until cleanup confirms deletion. Keep the failed deletion/review state in JSON; do not treat the file as gone. File-count limits apply to active RESERVED/READY entries, with any configured guest lifetime-entry limit covering removed entries too. No five-file or 20-entry fallback applies to logged-in users. Recompute byte totals from the bounded JSON rather than maintaining another counter record.

### If Salesforce refuses an upload

Do not try to predict or reserve org capacity in application records. If Salesforce refuses the native upload because org storage is full or another platform limit is reached, do not mark the entry READY or fabricate a receipt. Preserve answers and existing files, reconcile the entry's status, and offer retry/cancel with a safe message. The native component may provide only a generic failure; do not claim a storage-specific cause unless it is actually available.

Allow a valid submission using already accepted files, or without optional files; it needs no new file upload. A pending/unknown entry must be resolved or cancelled first. A new attempt with no selected files starts with an empty file array. Creation/submission can still fail under Salesforce platform limits; surface a safe error and do not report success or create duplicate submissions on retry.

### Cleanup and administration

Keep hourly abandoned-file cleanup and the admission kill switch. Cleanup works from each attempt's expiry and JSON file entries; it updates that same record after each deletion attempt. Show cleanup failures and oldest pending files to admins without creating a shared usage record.

Salesforce's org storage limit is the only org-wide storage ceiling in this design. Per-attempt limits do not bound total storage across visitors or identify individual anonymous people. Admins manage actual org capacity through Salesforce. Cleanup must not claim immediate physical storage reclamation until recycle-bin behavior has been verified.

## 9. Final submission transaction and idempotency

Refactor the existing shared submit transaction deliberately; do not put an unrelated asynchronous linker after a success response.

1. Authenticate the session and request. Preserve the existing honeypot, guest bot check and invitation semantics.
2. Acquire attempt locks in the section 7 order before any business DML; inspect the attempt record. If it is already consumed by the same submission key, return the recorded original result without saving again. A different key on a consumed attempt is refused.
3. For an open session, recheck current availability/version and existing tracked-link validity. Check all referenced READY entries in the freshly locked attempt JSON; there are no separate file rows to lock. Require matching session and element, exact accepted content version, count/size/type rules, and no duplicate slot/document references. Do not infer ownership from IDs in client data.
4. Validate file requirements using server-resolved receipts, not claimed file objects in `answers`.
5. Within one outer savepoint, call the existing classic/survey/freeform submission work, create the authorized `ContentDocumentLink` records to `SubmitOutcome.recordId`, mark accepted JSON entries and the attempt CONSUMED, and update any required invitation state. Store the safe success result before commit.
6. If validation, record DML, link insertion, or required state updates fail, roll back the submission and linking/consumption. Previously staged files remain `READY` for a corrected retry. No half-saved business record and no best-effort required file link.

Do not nest the integration in a way that allows an existing inner savepoint to commit the response while outer receipt finalization fails. A caller-level catch must roll back the entire unit. Coordinate the existing invitation and form-cap locks using section 7. Check a matching consumed attempt before rejecting a now-used invitation or closed form, returning only the previously authorized safe result. Reconcile freeform's existing submission-key lookup with the attempt key so it cannot bypass attachment validation or link new files to an unrelated retry. Regression-test all three submission paths and single-use links.

Use `ShareType: 'V'` and `Visibility: 'InternalUsers'` for new business record links initially, subject to batch-1 support verification. This release allows customers to upload, not to browse/download submitted attachments. Customer download access is a separate explicit policy. No `ContentDistribution`, public URL, guest record sharing, or attachment to a caller-selected record.

Authenticated finalization must preserve the caller's normal rights to submit and link files. Guest association uses the narrow token/receipt-authorized system boundary. Do not turn every internal link failure into a system-mode retry.

The attempt record is also the idempotency boundary for staged submissions with zero final attachments. Create/reuse it on the first Add file, or immediately before the first submit if no file was selected. An empty attempt requires no file upload or application storage reservation. Persist the stable submission key before the first submit attempt; after an uncertain response, retry with the same key. On success, clear browser capabilities after the result is received. Keep the file association history on the attempt record for the attachment lifecycle.

## 10. Validation and conditional visibility

Do not defer file validation to the separate general server-answer-validation backlog. This feature must enforce its own required/count/size/type rules server-side.

Follow the existing server answer check (PR 463, `FinalAnswerValidator`): the server enforces a file question's **unconditional** required/count/size/type rules; a required rule with a `when` condition, or a file question inside a page, section or element that has a show/hide rule, is enforced by the browser only, exactly as the server check already treats every other question. No Apex rules engine is built for this feature (that stays DEFERRED #66).

A hidden file question's answer is dropped from the payload by the browser like any hidden answer (#269), so its receipts are never sent and its files are never attached; finalization cancels any of the attempt's entries that the submitted `fileRefs` do not name. Recompute file-driven blank/not-blank state from verified receipt presence, not from a forged answer value.

General text/pattern/range validation outside this file feature remains separate scope.

## 11. LWC state, user experience, and preview

Add `finalFileUpload` for staged transport and `fileUploadSession.js` under the viewer for state orchestration. Use the existing `valuechange` channel to represent file rows, with an explicit discriminated shape:

```json
{
  "elementId": "el_documents",
  "value": [
    {
      "kind": "stagedV1",
      "slotToken": "opaque-slot-capability",
      "name": "supporting-document.pdf",
      "sizeBytes": 5242880,
      "state": "ready"
    }
  ]
}
```

This shape is memory-only; `_payload` emits only receipt references. Simulated preview rows use `kind: "preview"` and can never be submitted. Legacy inline rows keep their existing shape and transport.

Sequence for adding one file:

- First **Add file** creates/reuses the attempt record and reserves a JSON file entry. Each later file adds an entry to that same record. If no file was selected, create/reuse an empty attempt immediately before the first submit; no native upload is required. Once ready, mount the native uploader with the slot marker and effective `accept`; never guess an unsupported maximum-size attribute.
- Native selection/progress runs in its own UI. After `uploadfinished`, call `getUploadStatus`; show **Checking upload…** until the matching slot is ready. Do not fabricate success or use returned IDs to claim files.
- Display the server-verified name/size with an accessible **Remove [filename]** action. Successful removal immediately invalidates the receipt; physical deletion may finish in cleanup.
- If the native transaction committed but its browser event was lost, bounded status reconciliation on focus/retry can discover the ready slot. Do not automatically create another file.
- Keep answers/navigation usable while uploading. Submit waits for applicable pending uploads. Cancellation/retry is explicit; no permanent spinner. After a bounded wait, show a retry/cancel action rather than accepting an unknown pending file.

Capture form/version/session/generation with every asynchronous operation. Ignore late responses after reset, token change, sign-in/out, or new form load. Cancel the old session best-effort on teardown; server expiry remains the backstop. A file A response must never enter file B's new slot. Never put capabilities in a URL, localStorage, sessionStorage, design history, or a saved form draft.

Studio preview is intentionally local: validate file metadata and show the attachment rows without persisting Salesforce Files. Preserve these preview objects across ordinary Build/Design changes; reset them on Restart and prune removed file elements. Add **Test uploads on published form** to exercise the real transport. Do not report a simulated preview as org verification.

Use existing theme tokens, filenames as text, keyboard-operable buttons, live status/error announcements, and visible size/type guidance. The native dialog may show a generic server rejection; explain limits before selection and show a safe follow-up error. No custom upload-progress animation is required.

## 12. Cleanup and file lifecycle after submission

New `FinalUploadCleanupBatch` plus `FinalUploadCleanupScheduler` run hourly, with smaller rerunnable scopes. Scheduling is an installation/setup step performed by the owner/admin, not by this documentation task.

- Expire open sessions and reservations; mark unconsumed ready documents for deletion.
- Before deletion, lock the attempt record, reload its JSON, and recheck each entry to avoid racing finalization. Delete only documents referenced by app-owned, unconsumed JSON entries and only after verifying their version/link history is still compatible with staging ownership.
- Allow only the known implicit owner link found in batch 1. If a document gained other links or another version, quarantine it for admin review; never delete an unrelated/shared file because it is old or guest-created.
- Delete the ContentDocument as the unit, not an arbitrary version ID submitted by the client. Salesforce describes ContentDocument as the parent whose deletion removes its children. [Salesforce Files data model — Help article](https://help.salesforce.com/s/articleView?id=005314319&language=en_US&type=1).
- Persist success/failure and retry state per JSON file entry on the attempt record. Retry transient failures with backoff; alert if pending files exceed expiry plus 24 hours. Count a removed file as still present for that attempt until deletion is confirmed; do not claim a failed deletion freed storage.
- Removed files are eligible immediately; expired abandoned files are eligible after session expiry. Soft-deleted Files may still affect storage/recycle-bin behavior: verify actual storage reclamation during batch 1/cleanup QA and document administrator purge requirements. Do not silently hard-delete unrelated data.

After successful submission, the file belongs to the business record's lifecycle, not the two-hour staging TTL. Retain its attachment ledger. A periodic orphan audit may mark it for review when the original target has been permanently deleted or the link is gone, but **do not automatically delete consumed files by age**. Respect record undelete/retention and any additional sharing. An admin-confirmed purge can delete only demonstrably app-owned, unshared orphans after the configured retention; shared files must be retained.

This distinction gives abandoned uploads automatic cleanup without turning parent-record deletion into accidental loss of files someone later reused.

## 13. Implementation batches and proposed files

Each new class/bundle needs matching metadata and focused tests. Use the project's actual API version (the inspected upload classes/bundles are 66.0); do not copy an arbitrary version from another plan.

| Batch                    | Existing/new responsibility                                                                                                                                  | Completion evidence                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1. Transport proof       | Existing isolated correlation field, guard, proof prototype; actual LWR test host                                                                       | Section 3 passes in the org, including rejection rollback and no guest readback.                        |
| 2. Schema and policy     | **New** `FinalUploadPolicy.cls`; `Form_Upload__c`, bounded file JSON and policy metadata; existing publish/transfer validators and schema docs                               | Effective limits and normalization agree between UI/Apex; no secrets in specs or exports.               |
| 3. Admission and guard   | **New** `FinalUploadService.cls`, `FinalUploadGuard.cls`, `FinalUploadContentVersion.trigger`; guest/auth entry points | Actual native inserts require a valid single-use slot and cannot bypass via an unmarked guest request.  |
| 4. Respondent UI         | **New** `lwc/finalFileUpload/`, `finalFormViewer/fileUploadSession.js`; existing renderer/viewer/host/preview components                                     | Full native flow on supported hosts, simulated Studio flow, late-response isolation, accessible errors. |
| 5. Atomic submission     | **New** `FinalUploadFinalizeService.cls`, `FinalUploadValidation.cls`; existing `FinalSubmitService`, `FinalGuestController`, `FinalSubmitController`        | Record + links + receipt/invitation consumption are atomic and retry-idempotent.                        |
| 6. Cleanup/operations    | **New** `FinalUploadCleanupBatch.cls`, `FinalUploadCleanupScheduler.cls`; admin status/setup documentation                                                   | Abandoned files cleaned; shared/consumed files protected; deletion failures remain visible on the attempt.             |
| 7. Authoring and rollout | Existing property panel, spec publish/transfer, permission sets, schema/runtime/pending docs                                                                 | Explicit opt-in, file behavior controls, legacy compatibility, and complete org acceptance evidence.    |

Keep helpers bulk-safe: sets/maps for specs, attempt records, parsed file entries, ContentVersion, and document-link reads; lock and update each affected attempt once per operation; different attempts have no global upload lock. Do not retain separate session/slot persistence helpers or shared usage services from the superseded model. No SOQL/DML per receipt. Do not create a new Files binary API, concatenate chunks in Apex, expose an OAuth/session token to the browser, or attach staged files in a best-effort post-submit job.

## 14. Permissions, installation, and migration

1. Install the proposed metadata and tests through a targeted deployment manifest. The owner commits/deploys; never run an unscoped metadata deployment.
2. Keep native guest uploads disabled until the guard, per-attempt limits, cleanup, and approved guest identity configuration are present and verified. Confirm other guest upload consumers before applying site-wide enrollment.
3. Enable the two native/LWR settings documented by Salesforce only in the intended org/site setup. Republish the Experience Cloud site after component deployment before evaluating guest behavior.
4. Grant guest Apex access only to the existing guest controller surface. Grant only the correlation-field/platform permissions actually required by the verified native transport. No guest CRUD on authoring, upload ledgers, business targets, or general Files query access.
5. Authenticated respondents get the narrowly scoped controller access and their normal Files rights; authors get upload configuration/diagnostics. Restrict ledger inspection and cleanup administration to admins.
6. Publish selected forms with `transport: "stagedV1"`; do not silently change already-published internal inline forms. Public forms requiring attachments must not be enabled on an unsupported host or disabled upload site.
7. On republish, invalidate open sessions pinned to the old version. The client reloads and explains that attachments must be added again; do not attach old receipts to a new spec. Background cleanup handles the old files.
8. Rollback disables new admission and restores an appropriate published form version; it must not delete successful submissions or their files. Keep cleanup running for outstanding abandoned staging data.

Namespace qualification, installed permissions, actual guest default ownership, and external-user licensing require a separate subscriber-org verification pass before packaging claims are made.

## 15. Acceptance tests and handoff

### Frontend unit mocks

- Real emitted event shape from upload control → renderer → viewer → host → submit payload; no Base64 in staged mode and no capability in exported design.
- All four lifecycle phases: mount/hydrate, application, remove/reset, identity/token switch.
- Pending upload, lost native event, status retry, remove during fetch, out-of-order responses, spec change, mode change, and submission retry.
- Required/count/size/type guidance, keyboard/remove labels, native error fallback, and hidden file behavior.
- Studio preview works under preserve-session but creates no upload session or Salesforce file.
- Legacy internal renderer/payload and preview preservation regressions.

### Apex syntax, typing, and unit behavior

- Every proposed signature matches its caller; compile all new metadata/class dependencies.
- Invalid/expired/missing marker, wrong guest site/user, wrong form/version/element, duplicate slot, arbitrary supplied record/document/version ID, and guest Base64 rejection.
- Guest defaults can be raised/lowered by admins; logged-in internal/customer callers receive no default size/count/total limit, including on a public host. Explicit configured restrictions and JSON/platform capacity limits still apply; missing limits stay unbounded.
- File metadata limits, retained attempt-key lookup after secret-marker clearing, no per-record query loops, attempt lock contention, per-attempt concurrent count/byte limits, JSON bounds/schema validation, unknown type aliases, repeater restrictions, and no unmarked guest bypass.
- Concurrent files on one attempt preserve both JSON entries; duplicate file markers commit once; malformed/oversized JSON fails closed; removal/cleanup is idempotent; different attempts remain independent and require no shared records.
- Required-file/visibility parity fixtures, including conditional required entries and record-derived facts.
- Submit/link/invitation failure rolls back business DML and consumption; ready files remain retryable. The same submission key returns the original success; a different key on a consumed attempt fails.
- Cleanup cannot delete consumed/shared/reversioned files; deletion failure remains visible and accounted for. No large Blob test construction to simulate native transport.

### Platform contract and real org journeys

| Scenario                                 | Required evidence                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Anonymous LWR, 5 MiB image               | Upload succeeds and is linked only after the form's successful submission. No app-returned IDs/download URL.         |
| Guest exact boundary and over-boundary   | Boundary accepted; oversized native attempt leaves zero committed staging file and zero business record.             |
| Logged-in uploads without app defaults | Prove a file above the old 25 MiB default, aggregate above 50 MiB, and more than five files where platform/JSON capacity permits; no binary payload through Apex. Test internal and intended customer license. |
| Two concurrent uploads using one grant   | Exactly one committed document; ledger/count/bytes agree.                                                            |
| Different files uploaded concurrently | Both file entries survive on one attempt record within its count/byte limits; no lost JSON update. |
| Native upload rejected by Salesforce | No fabricated READY entry; typed answers and prior files preserved; status reconciled before retry/cancel. |
| Two concurrent final submissions         | Exactly one created target/response; retry returns the original result.                                              |
| File link failure after record creation  | Neither business record nor consumed receipt survives; prior staged file can be retried.                             |
| Closure/cap/republish after opening form | Fresh upload admission and submission refuse stale authorization; cleanup/removal remains possible.                  |
| Guest uploads without our marker         | Enrolled guest identity is rejected; unrelated authenticated Files use remains intact.                               |
| Anonymous download/search probe          | Staged and submitted files are not anonymously readable; no public distributions exist.                              |
| Browser closed after upload              | Hourly cleanup removes abandoned app-owned documents according to retention.                                         |
| File shared elsewhere / parent deleted   | Consumed/shared file is preserved; orphan audit reports rather than blindly deleting.                                |
| Lightning Out Studio and mobile          | Preview simulation is honest; published supported host performs real transport; keyboard/Android/iOS flows verified. |

The implementation handoff must provide a **mechanically generated actual changed-files list**, setup instructions, exact limits, test output, org evidence, and explicit remaining verification gaps. Separate Jest, Apex compilation/execution, platform-contract checks, and real guest/customer journeys. A green Jest suite alone cannot close this feature.

## 16. Definition of done

A guest can upload a realistic attachment on the published LWR form, correct answers, remove/retry files, and submit exactly once; files attach only to that submission. Larger authenticated uploads work on supported hosts. Invalid admissions, per-attempt limit overruns, stale sessions, wrong receipts, failed finalization, and abandoned uploads have tested outcomes. Existing internal inline uploads still work. Studio simulation and real upload testing are clearly distinguished.

No implementation item in [DEFERRED.md](../DEFERRED.md) (#53) is closed merely by creating this plan.
