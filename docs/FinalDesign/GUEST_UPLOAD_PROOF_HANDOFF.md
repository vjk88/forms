# Guest upload — batch 1 implementation handoff

Prepared 2026-09-09. **Local implementation only; no deployment or Git operations.**

## What is implemented

The native transport proof required by [implementation plan §3](./IMPL_PLAN_GUEST_FILE_UPLOAD.md#3-first-implementation-batch-prove-the-native-transport-boundary):

- Optional, namespace-resolved ContentVersion correlation field.
- 256-bit random, single-use capabilities; only SHA-256 digests in a private proof ledger.
- Administrator-issued, actor-bound, ten-minute upload slots.
- Disabled-by-default custom metadata enrollment, separate from admission enabled. An enrolled guest must supply a valid slot even after admission is turned off.
- ContentVersion insert/update guard: rejects invalid/expired/reused slots, mismatched actors, explicit attachment targets, new versions of staged documents, unsupported extension, and oversized metadata. It records exact accepted version/document metadata and clears the raw marker in the upload transaction.
- One global lock serializes proof admission and acceptance. The isolated proof permits at most 20 issued grants and 100 MiB of reserved maxima; expired or uploaded grants still count until the operator inspects and cleans up. A grant may reserve 1 byte through 25 MiB to exercise native boundary checks. These are **proof limits**, not the production quota system.
- An App Builder / Experience Builder test component. Operators issue grants and inspect metadata; a guest pastes a temporary grant and uses native file transport without calling Apex. UI never treats `uploadfinished` IDs as a valid receipt.
- Focused Apex test source and LWC lifecycle tests, including old native-instance completion events.

The prototype uses `Final_Upload_Proof__c` as one one-file grant/session ledger. Production session/slot/quota objects have deliberately not been substituted into the app before the transport gate is proven. The guard dispatch currently names the proof implementation explicitly. It must be refactored into the production policy/session services after this gate, not left as production admission policy.

## What is not implemented yet

No production `stagedV1` authoring toggle, respondent session endpoints, Forms renderer integration, receipt submission, visibility/required-file server evaluator, atomic linking/idempotency, or scheduled cleanup. No guest/controller permission broadening. Existing inline uploads and form submission code are unchanged.

The plan explicitly says to prove the native transport before the full editor, and to stop if the proof fails. Its real LWR/ContentVersion behavior cannot be established locally. Preparing this first batch does **not** complete guest uploads or close the pending-work item.

## Owner-controlled installation

Use [the targeted manifest](../../manifest/guest-upload-proof.xml) only after reviewing this batch.

The manifest contains only this proof's Apex, trigger, LWC, ledger/configuration metadata, optional ContentVersion field, and operator permission set. It does not contain site settings, authoring records, existing permission sets, or all application metadata.

Owner command, **not executed by Codex**:

```powershell
sf project deploy start --manifest manifest/guest-upload-proof.xml --test-level RunSpecifiedTests --tests FinalUploadProofTest --target-org <sandbox-alias>
```

This is a scoped manifest deployment. Do not use an unscoped deploy. Do not deploy/enable this proof in a production business org. The controller/marked-upload path additionally rejects environments other than a sandbox or Developer Edition.

1. Use a dedicated test LWR site/guest identity. Inventory other uploaders using that identity before enrollment; all its unmarked ContentVersion inserts will be rejected. Do not enable guest upload settings on a shared production site for this proof.
2. Assign `Final_Upload_Proof_Admin` only to the internal test operator. Guest and customer test users must never receive it. Guests need no Apex class access, no ledger CRUD, no authoring access, and no broad Files-query permission for this harness.
3. Create a custom metadata record under **Upload Proof Policy** for the intended test actor:
   - For the internal operator: leave both user-ID fields empty; enable admission.
   - For a guest: set **Enrolled Guest User ID** to that site's exact guest User ID; leave the authenticated-user field empty; enable admission.
   - For a customer: set **Approved Authenticated Test User ID** to the exact customer's User ID; leave the guest field empty; enable admission.
   - Never populate both identity fields. Leave the shipped `Disabled` record disabled.
4. Add **Upload Transport Proof (Sandbox Only)** to an internal Lightning App page for the operator and an isolated LWR test page. Republish the site as required. Do not put it on the Lightning Out Studio page: native file upload is unsupported there.
5. In that isolated environment, configure native guest upload and LWR file upload according to [Salesforce's component reference](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-file-upload.html). Record any minimum marker-field permission actually required by native transport. Do not grant guest ledger or authoring CRUD to work around a failure.
6. The operator enters the intended actor ID and maximum bytes, then clicks **Issue test slot**. Copy the temporary JSON directly into the other test browser. Do not save it in a URL, chat, screenshot, log, ticket, document, localStorage, or sessionStorage. The harness keeps it only in memory.
7. In the test browser click **Use test slot** and upload exactly one file. The native uploader has no `record-id`. Return to the operator page and **Inspect ledger** using the original grant.

The separate internal controller is custom-permission gated server-side; hiding buttons is not the security boundary. The customer/guest browser does not mint a slot itself in this batch. All grants are operator-issued to keep this incomplete prototype bounded and separate from public form admission.

## Record actual evidence before continuing

All entries start **NOT RUN**. Record real dates/results without capabilities or sensitive filenames. Operator inspection IDs are allowed only in restricted QA evidence, never returned to an anonymous caller.

| Check                                    | Expected result                                                                                                                                        | Status  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Authenticated native upload              | READY ledger; correct bytes and exact version; marker cleared; no business target link.                                                                | NOT RUN |
| Anonymous LWR upload                     | Same metadata invariants, no guest ledger CRUD; inspect the actual default owner and implicit link after commit.                                       | NOT RUN |
| Customer license native upload           | Operator-issued actor-bound grant works using that customer's ordinary Files transport rights.                                                         | NOT RUN |
| Exact boundary / one byte over           | Boundary commits; over-limit attempt leaves zero committed version/document and no READY receipt. Query the actual rows.                               | NOT RUN |
| Unsupported extension                    | Crafted/native attempt fails server-side, even if browser accept filtering is bypassed. No stored file.                                                | NOT RUN |
| Fabricated / expired / wrong actor grant | Rejected atomically; no receipt or file. Use a second browser signed in as a different user for actor mismatch.                                        | NOT RUN |
| Same slot concurrently in two browsers   | Exactly one committed document and one READY ledger. A sequential retry is also rejected.                                                              | NOT RUN |
| Unmarked enrolled guest request          | Remove the marker attributes using a temporary isolated negative-test uploader; native request must fail.                                              | NOT RUN |
| Admission disabled, enrollment retained  | Old unused grants and unmarked guest attempts both fail. Ordinary unrelated authenticated uploads still work.                                          | NOT RUN |
| New version / marked update              | Cannot replace the accepted content or edit away protection.                                                                                           | NOT RUN |
| Marker cleanup lifecycle                 | Raw field null after commit. If after-insert update is incompatible with native transport, stop and amend the design.                                  | NOT RUN |
| Anonymous readback                       | No anonymous file search/download, public distribution, authoring/ledger access, or unexpected implicit link. Probe from a separate anonymous browser. | NOT RUN |
| Namespace / ContentVersion validation    | Qualified marker works; required-field/custom validation behavior documented for intended org.                                                         | NOT RUN |
| Removal/finalization race                | Deferred to the later real session/finalization implementation; this prototype has no removal or submit endpoint.                                      | NOT RUN |

READY proves only the implemented metadata checks. Extensions/FileType are not malware inspection. The guard never queries file bodies. Post-insert size rejection does not prevent bytes reaching Salesforce's transport.

If the native lifecycle creates a business/public link after this ContentVersion trigger executes, if marker clearing fails, or if `addError` leaves stored files, this proof fails. Do not enable the production flow or substitute best-effort deletion for atomic enforcement. The operator inspection includes current links, owner, latest version, and marker-cleared state to detect these lifecycle mismatches.

## Cleanup after the proof

There is deliberately no automatic destructive cleanup in the prototype. Keep the test scope small. Disabling admission does not delete files or release reservations.

After turning admission off, inspect each grant and wait for in-flight test requests to settle. Before removing a proof document, verify its exact accepted version is still the only version, its links are limited to the observed implicit owner link, and no ContentDistribution or other sharing exists. Delete only the verified test ContentDocument; verify recycle-bin/storage behavior. If it gained versions or links, preserve it for manual review.

Delete that ledger row only after its file is confirmed removed, or after an unused reservation has expired and has no stored file. Keep the global lock row. Never delete ledger protection before deleting its verified staged file, and never reset proof capacity while files are left behind. Keep guest enrollment in place until guest native upload admission has been disabled for the test environment; removing enrollment first would stop unmarked-upload enforcement.

Production abandoned-file cleanup, retention, consumed-file preservation, and removal/finalization concurrency are later batches. This runbook is not a replacement for them.

## Local verification

- LWC: **10 tests passed across 2 suites**, including the guest surface and stale native-instance callbacks.
- ESLint: passed for the new LWC bundle.
- Prettier/Apex parser: passed for new source. This is parsing, not an Apex compiler/type check.
- Metadata XML: 31 files parsed; all 15 targeted manifest members and both Apex imports resolve. The inventory records 42 source/manifest files plus documentation/output.
- Apex test source: 20 methods prepared, including 251-record guarded and ordinary-upload cases; execution/coverage remain unverified.
- PMD: see [raw analyzer output](./GUEST_UPLOAD_PROOF_ANALYZER.json). High-severity CRUD findings were reviewed and narrowly suppressed for the intentionally system-context ledger and non-disclosing Organization environment gate. Grant/actor checks and operator custom permission remain mandatory. Remaining style/complexity/documentation warnings are not a claim of a clean scan.

Final analyzer summary (exit code 0 at severity threshold 2):

```text
Found 73 violation(s) across 7 file(s):
    23 Moderate severity violation(s) found.
    50 Low severity violation(s) found.
```

No unsuppressed high/critical findings remained. The explicit CRUD suppressions still require security review; they do not establish real guest permissions or transport behavior.

- Apex execution attempt: `sf apex run test --tests FinalUploadProofTest --result-format json --wait 1` failed with **EACCES** reaching the configured org's tooling test endpoint. No org test result or coverage was obtained. These new classes also have not been deployed, so org tests cannot yet validate this local revision.
- Native LWR, sharing/FLS, concurrency, rollback storage rows, and licenses: **NOT VERIFIED**.

The temporary Salesforce CLI log-write issue was avoided by setting `SF_DISABLE_LOG_FILE=true` for subsequent tool calls. No authentication settings were changed.

## Next implementation step

After the transport evidence passes, implement production schema/policy and persisted quotas, then the respondent control and atomic submission path. Preserve the plan's exact published-form gates and capability boundaries; the sandbox proof intentionally has no form/version/availability gate because it is not a production endpoint. Do not reuse its global proof budget or operator grant creation as public admission.

See [the mechanically checked file inventory](./GUEST_UPLOAD_PROOF_CHANGED_FILES.md) for every file prepared in this batch.
