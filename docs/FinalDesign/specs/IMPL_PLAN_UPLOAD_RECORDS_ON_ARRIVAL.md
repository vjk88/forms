# Uploads: no record until a file arrives (plan, 2026-11-26, rev 3)

Rev 3:
- surveys are **not** replay-safe; the rev 2 claim was wrong
- the native uploader's behaviour is now tested live
- "never uploaded" is distinguished from "removed the last file"
- slot expiry is separated from proof that a file arrived


Follow-up to PR 492 (#53). Owner rulings, 2026-11-26:
- No record may exist before a file does. Page loads and clicks must write nothing.
- Respondents see **Upload Files** directly; the **Add a file** step goes away.

Rev 2 applies the review of rev 1:
- reserving a slot never counts as an answer
- the first file carries everything the trigger needs
- no cache limits in this change
- a recovery path when two first files race

## Today

- `create` inserts a `Form_Upload__c` row and `reserve` updates it, before any file exists.
- One solved guest ticket can call `create` repeatedly. A per-ticket throttle is **#72**, deliberately deferred by the owner on 2026-11-23, and stays out of scope here.
- `Public_Key__c` is already declared unique in the repo. **Verify that the org has it unique before deploying**; if it does not, deploying the field is the fix.

## New shape

### 1. Session token: signed, nothing saved

`create` returns a signed token. No DML.
- **Claims:** public key, form version, public-host flag, guest flag, attempt expiry (2 hours, as today).
- **Signature:** HMAC, using `FinalGuestTicket`'s derived key. The signature also covers the caller's user Id, which is not stored in the token; every later call recomputes it from `UserInfo.getUserId()`.
- **Checks kept from today:** uploads enabled, published form and active version, public gate, response cap, and for guests the ticket plus proof-of-work.
- **No new cache limits.**

### 2. Slot token: signed, nothing saved

The marker for `Final_Upload_fileupload__c` (255 characters max):

`v2.<publicKey>.<slotKey>.<versionId>.<elementId>.<slotExpiry>.<attemptExpiry>.<flags>.<signature>`

- `flags` holds the host and guest flags.
- The signature also covers the uploader's user Id, which is not stored in the marker.
- The marker is self-sufficient: the trigger knows the form version, host, guest rules, element and both expiry times without any record.
- `elementId` is limited to 40 characters, which keeps the marker at about 225 characters.
- `reserve` may read the existing attempt (no lock) so it can return honest remaining limits. No DML.

### 3. The record is created when a file arrives (`FinalUploadGuard`)

`beforeInsert`:
- Verify the signature against the current user, and both expiry times.
- Recheck that uploads are still enabled, the version is still active, and the public gate still applies.
- Lock the attempt by public key, if one exists.
- Refuse the file if any of these apply:
  - the slot key is already in the JSON (one file per slot; a replay is refused)
  - the attempt is not open
  - the version has a content document, or it was published to somewhere else

`afterInsert` (the file's stored size and extension are only known here; any refusal rolls back the whole insert):
- Read the stored size and extension, and check the uploaded file is a fresh, unshared first version.
- Refuse the file if it breaks an existing limit:
  - per-question count
  - active files
  - lifetime selections
  - size, type or total

  Limits apply exactly as today:
  - **Guests:** the admin-editable defaults (10 MiB per file, 5 active files, 25 MiB total, 20 lifetime selections), plus the form's own rules.
  - **Signed-in:** the form's own rules only; there is no default cap.
- Create the attempt on its first file. Its host, guest flag and expiry come from the marker.
- Otherwise update the attempt.
- Write the entry as `READY` and clear the marker, as today.

**Two first files at once.** Both can see no attempt.
- The unique `Public_Key__c` lets one insert win.
- The other file's insert fails cleanly, and its dialog shows "Can't upload".
- **Browser recovery** (the live re-pick test confirmed this works): the winning file shows as Attached. The losing file's slot is still unused, so the person picks that file again.
- The end state is one attempt holding both files.

### 4. Status, remove and cancel

Each verifies the signed session.
- With no attempt yet: status returns an empty receipt, and remove or cancel do nothing (no DML).
- A reserved slot that is never used needs no call. Its token expires.

### 5. Submit

`prepare` verifies the signed session, then **looks for the attempt record**.
- **Record found** (at least one file ever arrived, even if all were later removed): unchanged from today. It validates the files referenced at submit, links them, consumes the attempt, and marks unselected files `REMOVED` for cleanup. Removing the only optional file and submitting therefore finishes the attempt and cleans the file up.
- **No record found** (nothing ever arrived): submit **without creating one**. Any file references in the payload are refused.
- **Required file questions are checked in both cases**, using the same `FinalUploadValidation.manifest` rule as today.

**Slot expiry vs proof of arrival.** At submit the browser sends each file's marker again, as proof the file arrived. The marker is still checked for a valid signature and a matching attempt. Its 10-minute **slot** expiry does not apply here, because that limits only when a file may be *uploaded*. What applies at submit is the attempt's 2-hour expiry, as today.

**Zero-file retry after a lost reply.** Owner ruling, 2026-11-26: the same as other classic forms, so no upload record is created for this.

| Type | Retry after a lost reply, with no files |
|---|---|
| Freeform | Replay-safe through `Form_Submission__c.Submission_Key__c` and `existingSubmission`. |
| Survey | **Not replay-safe.** Surveys save to `Form_Response__c`, which has no retry key. This is the same exposure as a survey without a file question. |
| Classic (object-bound) | **Not replay-safe.** The same exposure as a classic form without a file question. |

Retry protection for surveys and classic forms is a separate item, not part of the upload code.

### 6. Cleanup

Unchanged. Only attempts that received a file exist.

### 7. Browser (`finalFileUpload`, the viewer, `fileUploadSession`)

- **Reserving a slot never touches the answer.** The grant lives only in component state, and no `pending` row is emitted. A row appears only when a file has been sent, so an untouched optional file question submits empty.
- **Upload Files** shows straight away. The slot is reserved quietly when the question appears.
  - Guests wait about 2 seconds, because of the existing ticket-age wait and proof-of-work.
  - Until the slot is ready, the button shows but is disabled.
- After each confirmed file, the next slot is reserved while the question still allows more.
- **Add a file** and **Cancel this upload** are removed. The × on a file row stays.
**What the native uploader actually does** (tested live on TestSite, 2026-11-26):
- **During an upload** the dialog is modal. **Done** is disabled; the only exits are **Cancel** and × ("Cancel and close"), and either one cancels the upload. A file closed mid-upload never reached Salesforce. Submit cannot be reached during an upload, so the design needs no "uploading" state.
- **A refused file** (for example, over the size limit) shows "Can't upload <name>." in the dialog with **Got It**. The slot stays unused, and re-picking a good file in the same uploader worked.
- **Between the dialog closing and the status reply**, the component adds a `pending` row for the slot. The viewer's existing pending-file check then holds Submit, so a fast Submit cannot go without a file that did arrive, which the server would otherwise clean up as unselected.
  - If the status check fails, the row stays pending with **Retry**, and Submit stays blocked.
- **`uploadfinished` fires after success, refusal and cancel alike.** So after every `uploadfinished`, the browser asks the server for status:
  - **The slot's file arrived:** show its row (Attached), then reserve the next slot if more files are allowed.
  - **Nothing arrived:** keep the same slot, with no row and no error. The person can simply pick again.

  Today's build instead shows "Checking upload…" and "Upload status is unknown" in this case, which is a bug this change removes.

**Slot refresh.** An unused slot is quietly replaced about one minute before its 10-minute expiry, so someone who spends 15 minutes on other questions still has a working **Upload Files** button. The attempt's 2-hour expiry, once a file has arrived, is unchanged.

## Unchanged

- Linking files to the record at submit (guests use `AllUsers`, per PR 493).
- Hidden-answer handling.
- Studio preview simulation.
- Guest ticket and proof-of-work checks.
- The per-attempt limits.

## Tests

**Apex:**
- zero rows after `create`/`reserve`
- a row created on the first file, with host, guest flag and expiry taken from the marker
- a forged or altered marker refused, including one with the host flag flipped
- a marker presented by a different user refused
- a replayed slot refused
- each expiry refused
- uploads switched off between reserve and arrival
- a refused first file leaves its slot unused: the **same** marker then succeeds, and the attempt holds that one file (the recovery path after losing a first-file race)
- two truly concurrent first files cannot be staged in Apex or with one native uploader; the unique `Public_Key__c` is the protection, and the PR says this is untested live
- a zero-file submit creates no upload record
- remove the only optional file, then submit: it succeeds, the attempt is consumed and the file is marked removed
- a required file question left empty is refused on both paths: with no attempt record, and with one that exists but whose files were all removed
- a file submitted after its slot expired, but within the attempt's 2 hours, is accepted
- an upload after the slot expired is refused
- the existing four upload test classes reworked

**Jest:**
- open the form, ignore Upload Files, and Submit succeeds
- the disabled-until-ready state
- the next slot is reserved after an upload
- `uploadfinished` with nothing arrived: no row, no error, the same slot kept
- the unused slot is refreshed before it expires
- `fileUploadSession` and `stagedUploads`

**Live, on TestSite as a real guest:**
- page load writes 0 rows
- an untouched file question submits
- two files, uploaded one after the other and overlapping
- remove one, then submit: links made, attempt `CONSUMED`
- the submit replayed
- a forged marker refused
- the signed-in path still works

## Cost (my time)

About 90–120 minutes, mostly the Apex test rework, the deploys and the live guest run.
