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
