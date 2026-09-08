# Guest uploads and larger attachments: technical implementation plan

**Status:** Proposed design; no application code or metadata implemented by this document.  
**Date:** 2026-09-08.  
**Audience:** Developer implementing the feature, with explicit contracts and verification gates.  
**Scope:** Guest uploads on the published Experience Cloud LWR form, larger uploads for authenticated respondents on supported hosts, final submission, retries, quotas, cleanup, and authoring controls.

This is Slice 2 of [the existing file-upload plan](./IMPL_PLAN_FILE_UPLOAD.md). The owner requested this design; it does not record an implementation, deployment, or production-enablement approval. Existing internal upload behavior remains available during migration.

## 1. Outcome and architectural decision

A respondent can attach ordinary documents or phone photos, remove them, correct other answers, and submit once. Files appear on the record created by that submission, or on `Form_Response__c` for a survey. Guests receive no Salesforce record IDs or file-download URLs from the app.

**Use native Salesforce file transport with application-controlled staging.** File bytes travel from the browser through `lightning-file-upload` into Salesforce Files. Apex handles small metadata, capabilities, validation, and final record association. It must not receive or query large `VersionData` blobs.

The existing inline path sends Base64 inside the answer payload and inserts `ContentVersion` during submission. Its measured aggregate cap is 1,200,000 Base64 characters, approximately 879 KiB of raw data. Raising that constant or moving the same large JSON to a Queueable does not solve the initial request/heap problem.

The new flow is:

```text
Published form
  → create an upload session
  → reserve a one-file slot
  → upload bytes through Salesforce's native uploader
  → ContentVersion guard validates and records the staged file
  → respondent sees an attached-file receipt
  → submit answers plus receipt references
  → one transaction creates the submission, links files, and consumes the session
```

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
| `classes/FinalSubmitService.cls`                                         | `run` and survey path create records; `attachFiles` inserts inline files inside the savepoint. Nonempty guest `files` is rejected. | Add receipt attachment inside both submission transactions; keep legacy guest Base64 rejection. |
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

No existing dedicated upload-session/slot/quota objects or ContentVersion upload trigger were found in the local metadata inventory. Names in section 5 are **proposed new metadata**, not a changed-files manifest.

Two older documentation statements need an explicit architectural update when implementation lands:

- [RUNTIME_NOTES.md](./RUNTIME_NOTES.md) describes Apex inserting guest `VersionData` and using `FirstPublishLocationId` immediately. The staged path instead uses native transport and links to the server-created submission later. The restriction against arbitrary client-selected target records remains mandatory.
- [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) documents inline `files` and deferred draft attachments. This adds an opt-in receipt contract; it does not silently reinterpret old payloads or implement durable save-and-resume attachments.

## 3. First implementation batch: prove the native transport boundary

Do this small proof before building the full editor. Jest cannot establish any item in this section. The developer prepares targeted metadata; the owner performs deployment and approved org checks under the existing project workflow.

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

Use integer bytes internally and label MiB honestly in the UI (`1 MiB = 1,048,576 bytes`). These are proposed starting defaults, configurable downward per form and bounded by an org policy.

| Limit                                             | Anonymous guest                   | Authenticated staged user |
| ------------------------------------------------- | --------------------------------- | ------------------------- |
| Per file                                          | 10 MiB                            | 25 MiB                    |
| Aggregate per submission                          | 25 MiB                            | 50 MiB                    |
| Files per submission                              | 5                                 | 5                         |
| File selections per native dialog                 | 1                                 | 1                         |
| Upload slot lifetime                              | 10 minutes                        | 10 minutes                |
| Upload session lifetime                           | 2 hours, absolute                 | 2 hours, absolute         |
| Pending-file retention                            | Expiry followed by hourly cleanup | Same                      |
| Maximum outstanding staged bytes per enabled site | 500 MiB initially                 | Same shared site ceiling  |

One-file selection per reserved slot makes capability reuse/count enforcement explicit and works on Android. `multiple: true` means the respondent can add several file rows through repeated uploads, not that a single grant can upload an unlimited batch. Multi-select batch grants can be a later extension.

Initial global extension allowlist: `.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx`. Authors can narrow it. Deny executable/script/HTML/SVG/macro-enabled/standalone archive formats regardless of author configuration. Reuse and strengthen the existing extension-policy helper; do not create diverging lists across transport modes.

Extension and platform `FileType` metadata checks do **not** prove that file contents are harmless or malware-free. No custom antivirus scanner is included in this release. Do not display a “security scanned” badge. If the subscriber requires scanning before staff access, a scan integration and `QUARANTINED → READY` verdict path must be designed before enabling that subscriber's uploads; do not load large blobs into Apex to inspect them.

### Proposed persisted JSON

This is a fragment of a normal `specVersion: 1` form. Keep `config.accept` as the existing comma-separated string; the new size property has explicit byte units.

```json
{
  "settings": {
    "uploads": {
      "transport": "stagedV1",
      "maxTotalBytes": 26214400,
      "maxFiles": 5
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

The array-valued `element.validation` contract and optional `when` gates were verified against schema section 7 and `finalExpressionEngine.validateElement`. Reuse that shape rather than adding an element-level upload-only required flag. Effective limits are the minimum of the published form, element, audience, org policy, and site moderation limits.

- Absent `settings.uploads.transport` preserves legacy inline-internal behavior. Public file upload is enabled only by publishing `stagedV1` and completing site setup.
- Missing `accept` in staged mode uses the restricted global list, never “anything.” Normalize known MIME aliases and `image/*` to a fixed safe extension set; reject unknown tokens instead of accepting everything.
- `multiple: false` forces element maxFiles to 1. Validate total and per-element counts independently.
- The older schema's reserved `maxSize`/`allowedTypes` names are not alternative new storage keys. On import, offer an explicit conversion with units or flag ambiguity; do not guess what an unlabelled size means.
- Do not persist a `linkToRecord` choice. The only attachment destination is the server-created submission record.
- File elements remain disallowed inside repeaters.

File properties should show **Allowed file types**, **Maximum file size**, and **Allow multiple files** with a count control when enabled. Explain the effective guest limit. Update the current “attach files when they submit” copy to explain that files upload when selected and are attached when the form is submitted. This belongs in field behavior, not premium Design settings.

## 5. Proposed metadata and capability model

Use server-generated 256-bit random capabilities, encoded Base64URL. Store SHA-256 digests in unique fields; never store raw secrets in ledger rows, logs, URLs, design JSON, or answer records. This is a short-lived, stateful upload capability, separate from Contact/personalized-link tokens.

### New metadata

| Proposed metadata                           | Fields / responsibilities                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Final_Upload_Session__c`                   | `Token_Hash__c` Text(64), unique; Form and Form Version lookups; authenticated `Actor_User__c` or approved `Guest_User_Id__c`; server-derived site/audience; status; creation/expiry; count/byte counters; request digest; result record ID/type and child count; consumed timestamp. OWD private. |
| `Final_Upload_Slot__c`                      | Session lookup; `Slot_Hash__c` Text(64), unique; random public `Slot_Key__c` for status correlation (not authorization); element ID; state; expiry; reserved max bytes; accepted version/document IDs; verified filename/bytes/extension; consumed/removed timestamp; cleanup status. OWD private. |
| `Final_Upload_Quota__c`                     | Unique bucket key; scope/site/form/time-window identifiers; session/grant counts; pending reserved bytes; successfully uploaded bytes. Rows are locked for atomic admission. No guest CRUD.                                                                                                        |
| `Final_Upload_Policy__mdt`                  | Disabled by default. Per-site/audience settings, approved guest-user identity, limits, rate windows, retention, supported transport and namespace-aware marker-field configuration. Treat as configuration, not a mutable counter.                                                                 |
| `ContentVersion.Final_Upload_fileupload__c` | Optional Text(255) field receiving the raw **slot** capability through native transport. Resolve its qualified API name with Schema metadata for packaging. It is never a target record ID.                                                                                                        |

Add exact field XML and tests during implementation; the table is a schema proposal, not a claim these files exist. Keep the correlation field optional to avoid introducing a globally required Files field. The session token authorizes status/removal/finalization; each slot token authorizes exactly one new document within that session and element.

Authenticated sessions bind to the real running user. Anonymous users share a site guest identity, so `CreatedById` alone cannot distinguish respondents: the unguessable session/slot capabilities are essential. A logged-in customer on a public host still gets a user-bound session even when that host uses the guest submission controller.

### State transitions

```text
Session: OPEN → CONSUMED
              → CANCELLED
              → EXPIRED

Slot: RESERVED → READY → CONSUMED
                       → REMOVED
                       → EXPIRED
      RESERVED → CANCELLED / EXPIRED
```

`READY` means the file is committed, correlated, and passes this release's metadata checks. It does not mean malware scanned. A failed native transaction leaves the reservation unconsumed; it can be retried before expiry or cancelled. A successful slot cannot accept a second document or another version of its first document.

## 6. Public and authenticated API contracts

Keep guest-callable methods on `FinalGuestController`; use a new authenticated `FinalUploadController` for internal/customer entry points. Both call shared policy/session services with an explicit, validated posture. Service/trigger classes are not Aura endpoints.

Proposed method names below are new contracts; verify every LWC import/signature against their actual Apex definitions when implemented.

| Method                                | Input                                                | Output                                                                                          |
| ------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createUploadSession`                 | `formId`, `versionId`                                | Raw session token, expiry, effective limits, supported transport.                               |
| `reserveUploadSlot`                   | Session token, element ID                            | Raw slot token, public slot key, marker field API name, expiry, effective accept list and size. |
| `getUploadStatus`                     | Session token                                        | Safe slot receipts and state; no file content, target IDs, or guest download URLs.              |
| `removeUpload`                        | Session token, slot token                            | Idempotent removed/pending-cleanup status.                                                      |
| `cancelUploadSession`                 | Session token                                        | Idempotent cancelled/pending-cleanup status.                                                    |
| Existing `submitGuest` / `submitForm` | Existing payload plus `fileRefs` and upload metadata | Existing success/error contract; retry may return stored success.                               |

All are imperative/non-cacheable. Cap small input strings and collection lengths before processing. Return generic authorization errors and safe actionable limit errors. Never accept object API names, a target record ID, ContentVersion IDs, or ContentDocument IDs as authority.

Status receipts identify rows by the random public slot key returned at reservation. They do not reissue raw capabilities from hashes. The browser retains its original slot token in memory; losing the whole browser session means starting again and allowing cleanup to expire the abandoned files. The one marker-field API name is transport configuration, not disclosure of the form's bound business schema; no business object/field API names are returned to guests.

Each admission/read endpoint independently loads the authorized exact spec and checks published status, enabled upload policy, permitted adapter, opening/closing windows, applicable response caps, and active version. Internal access uses the existing authenticated permission boundary; guest access uses server-loaded metadata behind the public gate, never `WITH USER_MODE` on authoring records. For staged uploads, require Form Version to belong to Form and be the intended active published version on both submission routes.

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

Enabling native guest uploads is an org setting. Protecting only files with our marker would allow the same enabled site guest user to send an unmarked native upload and skip app quotas.

For an explicitly enrolled site guest user, require a valid slot on **every guest ContentVersion insert**. Missing, fabricated, or expired markers fail closed. Other authenticated/unrelated uploads without our marker are unaffected. Any marked upload, regardless of actor, must pass the guard.

This creates a real site-level integration constraint: another uploader using the same guest user must adopt the slot protocol, or use a separately governed site/guest identity. Inventory existing uploaders before enrolling that guest user. Never silently break unrelated sites or claim a marker-only trigger closes anonymous storage admission.

Keep site **enrollment** separate from **admission enabled**. Turning off admission must continue rejecting unmarked or newly attempted guest uploads for that enrolled identity; it must not disable the guard and accidentally open the native endpoint.

### Validation sequence

1. Resolve marker hashes to slots in bulk; fail unknown capabilities without record-detail errors.
2. Acquire locks in a consistent order: quota buckets, sessions, slots, then existing invitation locks if submission also needs them. Sort keys/IDs within each type and recheck state after locking. Use the same order in submit, removal, and cleanup.
3. Check session/slot expiry, actor/site binding, exact published version and current availability, enabled element/type, and remaining admission budget. Reject explicit linking targets and uploads of a new version of an existing document; slots only authorize fresh staged files.
4. After insert, query only metadata by the inserted IDs. Require ContentSize to be present and within per-file, element, session, and org limits. Normalize filename/extension and enforce the intersection allowlist. Do not trust MIME or filename from `uploadfinished`.
5. Reject unexpected preexisting record/library/public distribution links. Account for only the platform's implicit owner link established in batch 1; no business record attachment occurs here.
6. Record verified version/document IDs on the slot, mark `READY`, reconcile reserved versus actual pending bytes, and consume the one-file grant in the same transaction. `addError` must roll back the upload and ledger changes on any rejection.

Validate marked updates/new versions too so the marker is not a back door for replacing content after acceptance. Bind finalization to the exact accepted version; do not attach a document that has unexpectedly gained another version or different links. Clear the raw marker once correlation is safely recorded if the native lifecycle permits it; otherwise tightly restrict field read access and remove it before business attachment. Prove this behavior rather than relying on trigger-field assignment surviving platform processing.

The after-insert size check prevents an oversized file from being **committed**. It does not stop all bytes from reaching Salesforce first. Native upload bandwidth/DDoS protection remains platform/ingress responsibility; app quotas must not be described as a pre-transfer size filter or an IP firewall.

## 8. Quotas, reservation, and denial behavior

Start with conservative configurable limits: 50 new sessions per form/hour, 200 per site/hour, 500 per org/hour; 20 slot reservations per session lifetime; at most five simultaneously reserved/ready slots. Enforce per-user buckets for authenticated callers. Anonymous browser hints may improve UX but are not trusted identity, and a shared guest user ID is not an individual visitor.

Add a guest accepted-byte budget of 1 GiB per site per UTC day and 5 GiB per org per UTC day initially. Reserve against that budget before upload, reconcile to actual accepted bytes, and never refund accepted daily bytes merely because a file was later submitted or deleted. Tune these proposed defaults explicitly for expected traffic; there is no claim that one set fits every subscriber.

Reserve the slot's maximum allowed bytes before enabling its uploader. This can temporarily underutilize capacity, but bounds concurrency without trusting a browser's declared file size. `READY` reduces the reservation to actual bytes. Cancellation/expiry releases unused reservation; successful submission releases pending-storage quota but does not reset daily admission counters.

Use persisted unique bucket keys and row locking; Platform Cache alone is not an enforcement store. Handle the race to create a bucket using its unique key and retry/reload, not duplicate counters. A lock failure or unavailable quota store returns a safe retryable refusal, never unlimited admission. Prune old time buckets while retaining enough history to explain denial.

Failed native uploads can reuse a still-valid slot until its short expiry because their trigger transaction rolls back. Reservation quotas therefore bound grants and committed storage, not every rejected native HTTP attempt. Do not pretend a counter rolled back with `addError` records durable rejected attempts. Add ingress controls separately if traffic evidence requires them.

On capacity exhaustion show **File uploads are temporarily unavailable. Try again later.** Keep already typed answers. Block final submission only when required attachments are missing or pending. Provide an admin kill switch for new sessions/slots and a health view of pending bytes, cleanup age, failure counts, and quota utilization. No raw capabilities or filenames in aggregate logs.

## 9. Final submission transaction and idempotency

Refactor the existing shared submit transaction deliberately; do not put an unrelated asynchronous linker after a success response.

1. Authenticate the session and request; compute a canonical digest from normalized answers, repeats, sorted slot hashes, and version identity. Exclude changing telemetry timestamps and hash secret values before inclusion. Preserve the existing honeypot and invitation semantics.
2. Lock and inspect the session before any business DML. If already consumed by the same submission key and digest, return the recorded original result without saving again. A different key/payload on a consumed session is refused.
3. For an open session, recheck current availability/version and existing tracked-link validity. Lock/check all referenced ready slots. Require matching session and element, exact accepted content version, count/size/type rules, and no duplicate slot/document references. Do not infer ownership from IDs in client data.
4. Validate file requirements using server-resolved receipts, not claimed file objects in `answers`.
5. Within one outer savepoint, call the existing classic/survey mapping work, create the authorized `ContentDocumentLink` records to `SubmitOutcome.recordId`, consume slots/session, and update any required invitation state. Store the safe success result and digest before commit.
6. If validation, record DML, link insertion, or required state updates fail, roll back the submission and linking/consumption. Previously staged files remain `READY` for a corrected retry. No half-saved business record and no best-effort required file link.

Do not nest the integration in a way that allows an existing inner savepoint to commit the response while outer receipt finalization fails. A caller-level catch must roll back the entire unit. Coordinate any existing invitation lock order; regression-test survey single-use links and writeback as well as classic forms.

Use `ShareType: 'V'` and `Visibility: 'InternalUsers'` for new business record links initially, subject to batch-1 support verification. This release allows customers to upload, not to browse/download submitted attachments. Customer download access is a separate explicit policy. No `ContentDistribution`, public URL, guest record sharing, or attachment to a caller-selected record.

Authenticated finalization must preserve the caller's normal rights to submit and link files. Guest association uses the narrow token/receipt-authorized system boundary. Do not turn every internal link failure into a system-mode retry.

A successful upload session is also the idempotency boundary for staged submissions with zero final attachments. Persist the stable submission key before the first submit attempt; after an uncertain response, retry the same key/digest. On success, clear browser capabilities after the result is received. Retain server consumed-session receipts for 30 days, then expire the retry guarantee without allowing the old token to create a new submission.

## 10. Validation and conditional visibility

Do not defer file validation to the separate general server-answer-validation backlog. This feature must enforce its own required/count/size/type rules server-side.

Read `element.validation` entries, including conditional `when`, from the exact published spec. Implement/reuse an Apex counterpart of the existing visibility evaluator for page, section, element, and required-condition applicability. Use shared JSON fixtures covering `all`, `any`, custom logic, blank/false/zero, dates, and trusted record-rule facts. Reuse server-resolved token facts; never accept client-provided visibility verdicts.

For v1 staged uploads, an effectively hidden file element has no required-file obligation and its receipts are not attached. The browser can retain its selected receipt in memory in case the field is shown again; finalization cancels any session slots not in the accepted visible manifest. Recompute file-driven blank/not-blank state from verified receipt presence, not from a forged answer value. File visibility depending on its own receipt, or a cycle among file visibility conditions, cannot publish in this slice.

If the server cannot evaluate a required-file condition supported by the client, block publication with a repairable diagnostic; do not silently waive the requirement or make hidden required fields impossible to submit. General text/pattern/range validation outside this file feature remains separate scope.

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

- First **Add file** creates/reuses a valid upload session and reserves a slot. Once ready, mount the native uploader with the slot marker and effective `accept`; never guess an unsupported maximum-size attribute.
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
- Before deletion, lock/recheck the session and slot to avoid racing finalization. Delete only documents referenced by app-owned, unconsumed ledger records and only after verifying their version/link history is still compatible with staging ownership.
- Allow only the known implicit owner link found in batch 1. If a document gained other links or another version, quarantine it for admin review; never delete an unrelated/shared file because it is old or guest-created.
- Delete the ContentDocument as the unit, not an arbitrary version ID submitted by the client. Salesforce describes ContentDocument as the parent whose deletion removes its children. [Salesforce Files data model — Help article](https://help.salesforce.com/s/articleView?id=005314319&language=en_US&type=1).
- Persist success/failure per cleanup item. Retry transient failures with backoff; alert if pending files exceed expiry plus 24 hours. Release storage reservations only according to the actual state, so failed deletion cannot make the pending-byte counter falsely empty.
- Removed files are eligible immediately; expired abandoned files are eligible after session expiry. Soft-deleted Files may still affect storage/recycle-bin behavior: verify actual storage reclamation during batch 1/cleanup QA and document administrator purge requirements. Do not silently hard-delete unrelated data.

After successful submission, the file belongs to the business record's lifecycle, not the two-hour staging TTL. Retain its attachment ledger. A periodic orphan audit may mark it for review when the original target has been permanently deleted or the link is gone, but **do not automatically delete consumed files by age**. Respect record undelete/retention and any additional sharing. An admin-confirmed purge can delete only demonstrably app-owned, unshared orphans after the configured retention; shared files must be retained.

This distinction gives abandoned uploads automatic cleanup without turning parent-record deletion into accidental loss of files someone later reused.

## 13. Implementation batches and proposed files

Each new class/bundle needs matching metadata and focused tests. Use the project's actual API version (the inspected upload classes/bundles are 66.0); do not copy an arbitrary version from another plan.

| Batch                    | Existing/new responsibility                                                                                                                                  | Completion evidence                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1. Transport proof       | **New minimal** correlation field, guard, session/slot prototype; actual LWR test host                                                                       | Section 3 passes in the org, including rejection rollback and no guest readback.                        |
| 2. Schema and policy     | **New** `FinalUploadPolicy.cls`; proposed objects/fields/policy metadata; existing publish/transfer validators and schema docs                               | Effective limits and normalization agree between UI/Apex; no secrets in specs or exports.               |
| 3. Admission and guard   | **New** `FinalUploadSessionService.cls`, `FinalUploadQuotaService.cls`, `FinalUploadGuard.cls`, `FinalUploadContentVersion.trigger`; guest/auth entry points | Actual native inserts require a valid single-use slot and cannot bypass via an unmarked guest request.  |
| 4. Respondent UI         | **New** `lwc/finalFileUpload/`, `finalFormViewer/fileUploadSession.js`; existing renderer/viewer/host/preview components                                     | Full native flow on supported hosts, simulated Studio flow, late-response isolation, accessible errors. |
| 5. Atomic submission     | **New** `FinalUploadFinalizeService.cls`, `FinalUploadValidation.cls`; existing `FinalSubmitService`, `FinalGuestController`, `FinalSubmitController`        | Record + links + receipt/invitation consumption are atomic and retry-idempotent.                        |
| 6. Cleanup/operations    | **New** `FinalUploadCleanupBatch.cls`, `FinalUploadCleanupScheduler.cls`; admin status/setup documentation                                                   | Abandoned files cleaned; shared/consumed files protected; quotas reflect deletion failures.             |
| 7. Authoring and rollout | Existing property panel, spec publish/transfer, permission sets, schema/runtime/pending docs                                                                 | Explicit opt-in, file behavior controls, legacy compatibility, and complete org acceptance evidence.    |

Keep helpers bulk-safe: sets/maps for spec, quota, session, slot, ContentVersion, and document-link reads. No SOQL/DML per receipt. Do not create a new Files binary API, concatenate chunks in Apex, expose an OAuth/session token to the browser, or attach staged files in a best-effort post-submit job.

## 14. Permissions, installation, and migration

1. Install the proposed metadata and tests through a targeted deployment manifest. The owner commits/deploys; never run an unscoped metadata deployment.
2. Keep native guest uploads disabled until the guard, quotas, cleanup, and approved guest identity configuration are present and verified. Confirm other guest upload consumers before applying site-wide enrollment.
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
- File metadata limits, no per-record query loops, quota concurrency/unique-key races, unknown type aliases, repeater restrictions, and no unmarked guest bypass.
- Required-file/visibility parity fixtures, including conditional required entries and record-derived facts.
- Submit/link/invitation failure rolls back business DML and consumption; ready files remain retryable. Same key/digest returns original success; changed digest or replay across sessions fails.
- Cleanup cannot delete consumed/shared/reversioned files; deletion failure remains visible and accounted for. No large Blob test construction to simulate native transport.

### Platform contract and real org journeys

| Scenario                                 | Required evidence                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Anonymous LWR, 5 MiB image               | Upload succeeds and is linked only after the form's successful submission. No app-returned IDs/download URL.         |
| Guest exact boundary and over-boundary   | Boundary accepted; oversized native attempt leaves zero committed staging file and zero business record.             |
| Authenticated 20 MiB document            | Native transport succeeds without binary payload passing through Apex. Test internal and intended customer license.  |
| Two concurrent uploads using one grant   | Exactly one committed document; ledger/count/bytes agree.                                                            |
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

A guest can upload a realistic attachment on the published LWR form, correct answers, remove/retry files, and submit exactly once; files attach only to that submission. Larger authenticated uploads work on supported hosts. Invalid admissions, quota overruns, stale sessions, wrong receipts, failed finalization, and abandoned uploads have tested outcomes. Existing internal inline uploads still work. Studio simulation and real upload testing are clearly distinguished.

No implementation item in [PENDING_WORK.md](./PENDING_WORK.md) is closed merely by creating this plan.
