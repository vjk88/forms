# M1: submission PDF downloads

Date: 2026-10-27  
Status: planned; depends on M0 in the [roadmap](../PLAN_DOCUMENTS_AND_PAYMENTS.md).

## First completed experience

An admin enables a submission PDF. A respondent submits a form, sees that their answers were saved, and downloads a branded document. An authorized internal user can retrieve the same retained document from its submission/record context.

Support freeform and surveys first, followed by classic create/update forms before declaring M1 complete. Existing submissions without a receipt are not silently reconstructed from today's records; historical regeneration/backfill is outside M1.

## Output contract

- Form title, logo where supported, submission date/time with time zone, and an opaque reference number that does not authorize access.
- Visible submitted questions and formatted answers in published order; repeated entries retain order; empty visible answers have a consistent blank marker.
- Resolved display labels for choices/lookups only when authorized at submission time. Never fetch arbitrary related-record fields for a guest PDF.
- Dedicated print layout with headers, footers, page numbering, wrapping, and deliberate page breaks. Attachment names may be listed; attached files are not merged or publicly linked.
- No navigation controls, validation UI, hidden answers, internal bindings, or credentials. Rich text is sanitized to a documented subset.
- Snapshot and template/render version are pinned. Editing the form or Salesforce record does not change a previously generated file.

## Renderer decision

Start with a Salesforce-native Visualforce print page behind a renderer interface. Share the normalized document model with future DocGen. The interactive LWC renderer is not the PDF renderer.

Salesforce documents CSS 2.1 and font/asset restrictions, no JavaScript-rendered content, and no web-font support in native PDF rendering. Those constraints require a real rendering spike and supported print styles. See [PDF limitations](https://developer.salesforce.com/docs/platform/salesforce-pages-developers-guide/guide/pages-output-pdf-considerations.html) and [fonts](https://developer.salesforce.com/docs/platform/salesforce-pages-developers-guide/guide/pages-output-pdf-supported-fonts.html).

Spike exit: representative PDFs render legibly, authorized downloads work on supported hosts, and measured heap/file/time limits fit the supported input envelope. Include Salesforce mobile separately from mobile web; do not promise Visualforce PDF rendering inside the Salesforce mobile app. Record the supported download route. If the native path fails a required case, record alternatives and their data-processing implications before changing engines.

## Implementation slices

| Slice | Work | Done when |
| --- | --- | --- |
| PDF-1 | Receipt/snapshot schema; feature-disabled default; answer normalization for freeform and surveys; independent guest attempt proof | Accepted answers and receipt commit atomically; retries cannot disclose another receipt |
| PDF-2 | Built-in submission template and renderer; background generation after commit; document record and private File | Retrying generation yields one logical output; failure leaves answers saved |
| PDF-3 | Authenticated document retrieval plus narrowly scoped guest grant and download endpoint | Tampered, expired, revoked, and cross-receipt access fail without data disclosure |
| PDF-4 | Documents setting; publish/transfer/projection validation; completion DTO and host/viewer integration | Settings round-trip; internal and guest respondents can reach ready/failure states |
| PDF-5 | Classic create/update snapshots; child-entry coverage; optional authorized link to resulting business record | Later record edits cannot change the historical PDF; failed record saves create no receipt |
| PDF-6 | Retention, cleanup, retry/admin visibility, package permissions, org/browser acceptance | All release cases below pass with recorded evidence |

Existing implementation touchpoints are listed in the roadmap. In particular, extend `FinalGuestController.GuestSubmitResult`, consume it in `finalGuestHost`, and extend the viewer's completion API together. Preserve the no-record-ID guest contract and existing internal navigation behavior.

## Generation and delivery

Persist a durable pending document request with the receipt. Generate in a separate transaction that can read committed input; prove the chosen PDF API and async context in the org. Bound concurrency and do not assume queue capacity is always available. A recoverable dispatcher can find pending work if immediate enqueueing fails.

Use a unique logical key from receipt, template version, output kind, and render version. Record `pending -> generating -> ready` or `failed`, with attempts, safe error code, and a lease/timeout for abandoned work. Retries must not create duplicate visible Files.

The proposed default is temporary private storage for 24 hours, with admin-enabled retained Salesforce Files. This is a product default to validate, not an existing retention policy. Expire grants independently and purge temporary file content and sensitive snapshots according to the chosen retention rules. Retained Files follow explicit record access and deletion rules; deleting all versions, links, and derived outputs must be handled deliberately.

No public `ContentDistribution` link is created by default. Prove the token-gated binary delivery mechanism and response limits during M0. Only allowed branding assets are fetched; arbitrary remote images in document content are rejected.

## Completion UX

Show “Your response was saved” immediately after acceptance, then “Preparing your PDF,” “Download PDF,” or “Your response was saved, but the PDF could not be prepared. Retry.” Retrying affects the document job only.

Enabling a respondent download requires a completion screen; prevent publishing a conflicting toast-only or automatic-redirect configuration until an explicit compatible behavior is implemented. Keyboard focus and status announcements must remain usable while the document changes state. Preview uses simulated files and states.

## Acceptance cases

- [ ] Freeform, survey, classic create, and classic update preserve correct labels, choices, dates, repeated rows, and authorized display values.
- [ ] Hidden fields stay excluded even if client payloads contain values; server rules determine visibility and accepted content.
- [ ] Lost submit responses and repeated clicks do not create duplicate receipts/documents or broaden guest access.
- [ ] No successful document is produced for a rejected/rolled-back submit, including honeypot fake-success responses.
- [ ] Editing the live form, template defaults, related records, or the source record after submission leaves the saved copy unchanged.
- [ ] Wrong token, guessed IDs, expired/revoked grant, wrong receipt, and unauthorized internal user cannot retrieve content.
- [ ] Long text, long URLs, international characters, page breaks, logo, repeated tables, and maximum supported input render correctly.
- [ ] Rendering outage, queue exhaustion, timeout, cleanup, and retry preserve accepted answers and display accurate status.
- [ ] Lightning, Experience Cloud guest, supported mobile browsers, and delegated submit paths are exercised in an org; unsupported hosts have documented behavior.

## Deferred

Blank-form PDFs, editable/fillable PDF fields, exact web-theme reproduction, attachment merging, emailing copies, and custom templates. Email delivery becomes an explicit later slice with recipient authorization and retry semantics.
