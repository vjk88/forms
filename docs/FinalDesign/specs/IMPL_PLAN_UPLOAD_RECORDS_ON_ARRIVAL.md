# Uploads: no record until a file arrives (plan, 2026-11-26, rev 4: built)

Follow-up to PR 492 (#53). Owner rulings, 2026-11-26:
- No record may exist before a file does. Page loads and clicks write nothing.
- Respondents see **Upload Files** directly; the **Add a file** step is gone.
- **One signed tag per question per visit**, reusable for every file, replaces the earlier one-slot-per-file design.
- Zero-file submits create no upload record. Retry after a lost reply is handled the same as other classic forms.

## How it works

1. **Open the form.** Upload Files shows at once.
   - The browser starts a signed **session**, then asks for each file question's signed **tag**: "files from this visit, for this question". Nothing is saved.
   - Until the tag arrives, the uploader is disabled and shows "Preparing upload…".
   - For guests this takes about 2 s: the existing ticket-age wait plus the bot-check puzzle.
2. **Upload files.** One tag covers any number of files, and the native picker allows multi-select when the question does.
   - Salesforce stores each file, and the `ContentVersion` trigger checks the tag and every limit.
   - The **first accepted file creates the one `Form_Upload__c`**. Each further file adds an entry to that record's JSON.
   - The server gives each file its own random key.
3. **Submit.** The submit names files by their server keys; the session token proves the attempt is this visit's. The server then:
   - finishes checking any upload just made
   - creates the submission
   - links the kept files
   - marks removed or unselected files for cleanup

   If nothing was ever uploaded, there is no upload record and none is created.
4. **Walk away.** The hourly cleanup removes abandoned files, unchanged.

## Tokens (`FinalUploadToken`)

- **Session:** `s1.<publicKey>.<versionId>.<flags>.<attemptExpiry>.<sig>`
- **Tag:** `t1.<publicKey>.<versionId>.<elementId b64url>.<attemptExpiry>.<flags>.<sig>`, about 160 characters (the field holds 255; `elementId` is at most 40 characters).
- `flags` holds the public-host and guest bits. Expiry is in epoch seconds: the attempt's 2 hours.
- The signature is an HMAC over the token **plus the caller's user Id**, which is not stored in the token, so only the user a token was issued to can present it.
- The key is derived from the `FinalLinkKeys` MAC key, the same root the guest tickets use.
- Why signed rather than a plain random code: a random code can only be checked later if it was saved, and saving one per page load is the spam this removes.

## Server

- **`create`:** checks every gate from today (uploads enabled, published form, active version, public gate, response cap, guest ticket plus proof-of-work), then returns the session. No DML.
- **`reserve`:** returns the question's tag and advisory limits. No DML.
- **Guard `beforeInsert`:**
  - Verifies the tag against the current user, its guest flag and the attempt expiry.
  - Rechecks that uploads are enabled and that the gates still apply.
  - Locks the attempt if one exists; otherwise uses an unsaved draft built from the tag.
  - Refuses a version that already has a content document, or that was published elsewhere.
- **Guard `afterInsert`:**
  - Reads the stored size and extension, and checks the file is a fresh, unshared first version.
  - Enforces the limits:
    - per-question count
    - active files
    - lifetime selections
    - size, type and total
  - **Guests** get the admin-editable defaults (10 MiB per file, 5 active files, 25 MiB total, 20 lifetime selections) plus the form's own rules. **Signed-in users** get only the form's rules.
  - Inserts the attempt on the first file (`Public_Key__c` is unique), or updates it. Writes the entry with a fresh random key, and clears the marker.
  - Any refusal rolls back the whole insert.
- **Status, remove and cancel:** each verifies the session.
  - With no attempt yet, status is empty, and remove or cancel do nothing.
  - Remove takes the file's key. A key presented with another visit's session finds nothing.
- **Submit (`prepare`):** finds the attempt.
  - **Attempt found** (even if every file was removed): validated, linked, consumed and cleaned as before.
  - **No attempt:** no record is created, and any file references are refused.
  - **Required file questions are enforced on both paths.**
  - **Zero-file retry after a lost reply** (owner ruling: the same as other classic forms):
    - **Freeform:** replay-safe through its `Submission_Key__c`.
    - **Survey and classic:** not replay-safe, which is the same exposure those forms have without a file question. Fixing that is a separate item.

## Browser (`finalFileUpload`, the viewer, `fileUploadSession`)

What Salesforce's uploader actually does (tested live, 2026-11-26):
- **During an upload** the dialog is modal, and its only exits cancel the upload. A file closed mid-upload never arrives.
- **A refused file** shows "Can't upload", and re-picking in the same uploader works.
- **`uploadfinished` fires after success, refusal and cancel alike**, so it is never trusted on its own.

What the component does:
- **After the dialog closes**, it adds one `pending` row per reported file and disables the uploader. The viewer's pending-file check holds Submit.
- **Then it asks for status:**
  - The rows become exactly the server's READY files for this question.
  - A confirmed empty reply removes the pending rows, which releases Submit.
  - A failed check keeps the rows pending, with **Retry**, and keeps Submit blocked.
- **A single-file question** hides the uploader once it has a file. Removing that file brings it back with the same tag.
- **While the uploader is disabled**, a dropped file is swallowed, so the browser cannot open it and leave the form.
- **After a removal**, focus moves to the uploader once it is usable.
- **The guest bot-check puzzle** uses plain arrays, not typed arrays. Lightning Web Security wraps typed arrays, which made a ~60 ms puzzle take 14–36 s.
- **Starting a session is not time-limited**, because it may wait on that puzzle, which never gives up by design.

## Tests

**Apex:**
- no record from a session, tags or cancel; the first file creates it, with host, guest flag and expiry from the tag
- one tag takes several files, each with its own key
- an altered tag (flag flipped, or signature changed) is refused
- another user's tag is refused
- a refused file leaves the tag usable for a re-pick
- uploads switched off after the tag was issued are refused
- the count limit is enforced on arrival
- another session cannot remove this visit's file
- a zero-file submit creates no record
- removing the only optional file still submits
- a required question with no file is refused, whether the attempt doesn't exist or every file was removed

Two truly simultaneous first files cannot be staged. The unique `Public_Key__c` is the protection.

**Jest:**
- the tag is requested on mount without touching the answer
- disabled and "Preparing upload…" until the tag is ready, with drops swallowed meanwhile
- multi-file rows come from status
- Submit is held until status answers
- an empty reply releases Submit; a failed check offers Retry
- remove sends the file's key
- a single-file question hides the uploader once it has a file
- an untouched optional question submits

**Live, on TestSite as a guest:**
- page load writes 0 records
- the first file creates exactly one; later files join it
- remove one, then submit: the kept file is linked
- a no-file submit adds no record
- Upload Files is ready about 3.4 s after a warm guest load
