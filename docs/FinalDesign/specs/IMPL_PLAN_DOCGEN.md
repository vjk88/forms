# M3: document generation

Date: 2026-10-27  
Status: planned; builds on the M1 document model and renderer. See the [roadmap](../PLAN_DOCUMENTS_AND_PAYMENTS.md).

## Outcome and first templates

An admin selects a template, inserts permitted merge fields, previews sample data, and publishes an immutable version. A submission or verified payment generates the selected document and attaches it to the permitted Salesforce context.

Start with an application confirmation letter, completion certificate, and payment confirmation. The built-in M1 submission PDF remains available and uses the same document-generation pipeline.

## Scope

PDF output with a native editor for supported text, headings, logos, tables, page breaks, headers/footers, and merge fields. Add declarative conditions and repeated rows in separate slices. Avoid arbitrary executable expressions, unrestricted HTML/CSS, arbitrary SOQL, and external resource URLs.

Word uploads, DOCX output, electronic signatures, contract negotiation, PDF attachment merging, multilingual automatic translation, and bulk mail delivery are outside M3. They must not quietly become requirements for the first template editor.

## Template and data contracts

- Separate an editable template from immutable published versions. Form versions pin a template version, not a mutable “latest” pointer.
- Merge fields have stable IDs, display labels, types, formatting rules, and source scopes. Initial scopes are submission snapshot, approved context snapshot, and confirmed payment summary.
- Author-time access is checked when choosing Salesforce fields; execution-time permissions and disclosure policy also apply. A background worker's broader permissions must not expand the allowed merge data.
- Related Salesforce data is explicitly allow-listed and frozen into the generation input under the appropriate security policy. Guest documents cannot perform arbitrary relationship traversals or expose internal fields just because the template author can read them.
- Submission copies always use submission-time data. A document triggered after mapping may explicitly use a newly captured post-mapping context snapshot; label that timing, preserve the original receipt, and never mix timestamps silently.
- Conditions use a typed, validated declarative tree. Repeated tables have bounded rows, depth, and output size. Reject cycles, unknown fields, incompatible types, and unsupported formatting at publish.
- Pin template version, source snapshot version/hash, renderer version, locale/time zone, and trigger event to each generated output. Regeneration creates an auditable new revision; it does not overwrite previously issued bytes.

## Trigger model

| Trigger | Eligibility | Example |
| --- | --- | --- |
| Submission accepted | Receipt committed; allowed merge input complete | Application acknowledgement |
| Payment confirmed | Verified paid obligation; eligible action not already fulfilled | Payment confirmation |
| Mapping succeeded | Required records exist and approved post-mapping snapshot captured | Record-linked letter |
| Manual internal request | Authorized user and pinned template/input selection | Reissue a certificate |

Store a durable action key per receipt + template version + trigger occurrence. Use the document job/lease/retry mechanism from M1. An unavailable dependency stays pending with a clear reason; a template or rendering failure never changes payment or submission success.

## Builder and admin experience

Documents starts with “Submission copy” and “Add document.” Custom documents have a template, trigger, and delivery destination. Advanced formatting and conditions appear only when relevant. Keep a document's content editing separate from when it is generated.

The preview uses synthetic/sample data and exposes missing-value, long-text, repeated-row, and pagination cases. Publishing reports actionable errors beside the relevant field/section. Do not promise that interactive preview is an exact PDF proof until an actual generated preview has been inspected.

Admins can inspect template version, generation status, issued time, associated receipt, and safe failure details; retry generation or issue a new revision. Any guest download uses M1 scoped access. Delivery initially supports on-screen download and authorized Salesforce Files attachment. Email is a separate follow-on with recipient selection, verification policy, send deduplication, bounce/failure status, and recovery.

## Implementation slices

| Slice | Deliverable | Done when |
| --- | --- | --- |
| DOC-1 | Template/version schema, merge schema and read-only sample templates | Versions remain immutable; older forms continue using their pinned version |
| DOC-2 | Native editor for core document blocks, typed merge picker, sample preview | An admin can create and publish an acknowledgement without code |
| DOC-3 | Conditions and repeated tables with validation and caps | Empty, conditional, and multi-page output behaves predictably |
| DOC-4 | Submission/payment/mapping trigger orchestration and manual internal generation | Every trigger produces one eligible logical document with traceable input |
| DOC-5 | Version/revision history, import/export remapping, access, retention, package checks | Cross-org template transfer has no stale record IDs or credential references |

## Acceptance cases

- [ ] Published template edits create a new version; previous forms and documents retain their original version.
- [ ] Missing required merge values fail with actionable diagnostics; optional values follow a documented blank/default rule.
- [ ] Conditional sections and tables handle null, false, zero, empty lists, maximum rows, and long content correctly.
- [ ] Field permission changes, revoked access, forged merge identifiers, and unauthorized guest relationship data are rejected safely.
- [ ] Repeated payment or mapping events cannot issue duplicate documents; explicit reissues remain distinguishable.
- [ ] Admin preview cannot query unauthorized records or leak real respondent data through sample defaults.
- [ ] PDF outputs are inspected in an org for layout, fonts, page breaks, and supported international text.
- [ ] Retention/deletion removes or expires the correct generated files, revisions, source snapshots, and access grants without silently changing business records.

## Next decisions after M1

Use real M1 PDF feedback to choose the minimum editor block set and print styles. Confirm the first customer's required document and Salesforce merge sources before expanding the template language. Establish supported limits from the proven renderer instead of promising general-purpose desktop publishing.
