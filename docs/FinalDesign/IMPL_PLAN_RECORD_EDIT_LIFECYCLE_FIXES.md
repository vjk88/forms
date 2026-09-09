# Record-edit lifecycle fixes — implementation and rollout

> Current contract (2026-09-09): [Explicit record context](EXPLICIT_RECORD_CONTEXT.md) supersedes the `recordId` / `saveMode` activation rules below. The lifecycle protections still apply.

Status: implemented and deployed to revclouddev; browser journey verification remains pending.
Updated: 2026-09-08.
Original baseline: c943ebd. This document now describes the current working-tree implementation, not instructions to reapply over it. Unrelated working-tree changes are preserved.

## Evidence and scope

The original five failures were reproduced before implementation and recorded in scratch/review-2026-09-08.md, with the original reproducer retained in scratch/review-2026-09-08-recordEdit.test.js.txt. They are now covered by permanent recordEditLifecycle.test.js cases. Submit assertions use the published-spec/getSpec path; inline previews simulate submit and cannot prove that Apex was blocked.

The original baseline passed 799 frontend tests. The first implementation passed 824 frontend tests and lint; 30 existing deployed Apex tests passed in revclouddev (run 707hk000008TwH2). This does not establish browser correctness. The final presentation/toast adjustment adds two tests; final results are recorded below when complete.

Salesforce check-only validation 0Afhk000001C76tCAC succeeded for the three changed bundles with zero component errors. No Apex classes changed.

The review in REVIEW_RECORD_EDIT_LIFECYCLE_PLAN.md was supplied during implementation. Its baseline critique identified this document's stale proposed-status header. Its technical/design concerns are resolved or explicitly bounded below.

## Implemented behavior

1. Public recordId and URL record changes reconcile an explicit edit session independently of the form-spec cache. New sessions clear prior answers, file references, validation/completion state, pending Autofill work, and redirect timers. The next payload names the current record.
2. Edit states are inactive, missingRecord, loading, ready, and error. Both the submit handler and controls block saving until ready. A zero-bound-fields legacy spec still reads Id before readiness; a missing ID never bypasses the gate.
3. The edit reader was restructured from lwc:if into a single-item for:each. Each attempt has a new key, generation, and session identity. Old success/error events are ignored before changing answers or request bookkeeping. The shared reader rejects data whose record ID differs from its requested ID.
4. During loading, the respondent sees a spinner. The editable surface is hidden from visual and keyboard interaction until readiness. The record reader remains outside the hidden surface, so it can complete. Failed reads show an accessible error and Retry outside that surface. Revision-aware merging remains as a safeguard for queued events, retained session edits, and refreshes; normal users are no longer invited to type during the initial load.
5. Retry first calls notifyRecordUpdateAvailable([{ recordId }]), then remounts the keyed reader if the attempt is still current. The original session's edit revisions survive retries. This is the supported LDS refresh API; cached-error recovery still requires the live check below. A refresh rejection restores the error state. Switching records while retry is pending invalidates that attempt.
6. Record hydration precedes lookup Autofill. Static lookup defaults cannot launch a pre-hydration read. Loaded values are ordinary answers: preserveEdits preserves them, alwaysReplace may replace them, and manual edits during a pending Autofill request survive under either policy. There is no separate instruction to cancel pre-hydration work that should never start.
7. Stale submit success never completes or redirects the new form. Stale submit failure displays a sticky page-level lightning/toast notification naming the original object and record ID, without altering the new form's answers or inline errors. This covers same-page record navigation while the application remains loaded; a closed browser tab cannot display a later notification and there is no durable save-notification service.
8. The one-question-at-a-time layout accepts submitDisabled and disables its terminal action, while Continue remains usable. Other layouts retain the shared submit bar and the viewer's authoritative submit guard.

API references: [LDS refresh](https://developer.salesforce.com/docs/platform/lwc/guide/reference-notify-record-update.html), [page-level toast](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-toast).

## Explicit scope decisions

### Server contract

Readiness is enforced by the viewer. The server still validates saveMode, record presence/type, permitted bindings, repeats, and user-mode write access. A client-supplied hydrated flag would not be trustworthy and is intentionally not added. A server-issued editing session or server-side comparison requires a separate protocol and design; it is not represented as completed here. The owner's last-write-wins rule is unchanged. Other hosts invoking the submit endpoint remain responsible for forming intentional updates.

### Files, repeats, empty forms, and authoring

- Internal file attachment behavior already runs through FinalSubmitService.attachFiles(parentId, ...) inside the same savepoint after an update. This work preserves that path; it does not add existing-attachment listing, replacement, deletion, or guest upload support. File attachment on edit forms remains an explicit browser-verification item, not a newly certified capability.
- On a record switch, clearing the answers map removes pending file/repeat references. No persisted files or records are deleted. Repeat sections remain rejected for update forms; reset logic is a general session cleanup, not a promise of repeat support.
- Rejecting zero-bound-field forms at publish time is a separate authoring-validation improvement. Existing published specs must still fail safely at runtime rather than bypass readiness.
- This patch does not implement Record Page Edit Slice 4. Authors still need a prepared spec with saveMode: update. It is a runtime correctness fix, not a declaration that the author-facing edit-mode product is complete.

## Changed source and test files

- force-app/main/default/lwc/finalFormViewer/finalFormViewer.js
- force-app/main/default/lwc/finalFormViewer/finalFormViewer.html
- force-app/main/default/lwc/finalFormViewer/**tests**/recordEdit.test.js
- force-app/main/default/lwc/finalFormViewer/**tests**/recordEditLifecycle.test.js
- force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.js
- force-app/main/default/lwc/finalAutofillRecordSource/**tests**/finalAutofillRecordSource.test.js
- force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.js
- force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.html
- force-app/main/default/lwc/finalNavOneAtATime/**tests**/finalNavOneAtATime.test.js

Deploy only these three bundles with explicit --source-dir paths. Never deploy the entire workspace.

## Verification matrix

| Scenario                                       | Observable pass condition                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pending read or failed read                    | Hidden editable surface; no Apex submit invocation even from a direct submit event     |
| Retry after a read failure                     | LDS refresh requested; new generation; surface appears only after successful hydration |
| A to B or URL-only switch                      | A answers cleared immediately; reader and submitted payload identify B                 |
| A to B to A / stale response or error          | Only newest generation changes answers/error/request state                             |
| Same-ID property delivery                      | Existing edits remain; no new read                                                     |
| Queued manual clear, false, zero               | Hydration preserves the edit                                                           |
| Null versus omitted record field               | Null clears untouched defaults; omission remains distinct                              |
| Loaded lookup with each policy                 | Reader starts after hydration and respects preserveEdits/alwaysReplace                 |
| Manual edits during Autofill / source clearing | Manual values survive; only rule-owned values clear                                    |
| Old save completion                            | No redirect or completion on B; failure produces a toast identifying A                 |
| One-question-at-a-time layout                  | Continue still works; terminal Save cannot fire while blocked                          |
| Preview/authoring/guest exclusions             | No edit reader mounted for authoring, preservePreview, or delegateSubmit               |
| Create mode                                    | Record ID does not arm edit loading; published create still submits                    |
| Disconnect/reconnect during initial read       | Fresh request generation; pending edits preserved                                      |

Permanent lifecycle and source-reader tests exercise the above. Existing guest Autofill, submission, record placement, preview-session, and reconnect suites remain part of the full regression run.

## Rollout and recovery

1. Validate the three bundles together against revclouddev. Completed: check-only job 0Afhk000001C76tCAC.
2. Deploy all three together to that development org, as explicitly requested by the owner. Keep rollout limited to existing test placements; do not add broad edit-form placements or enable an authoring toggle.
3. Run the browser scenarios below using dedicated test records before broader adoption. Successful deployment alone is not end-to-end verification. A guest-site smoke check must use the updated published site bundle; LWC deployment alone does not refresh an LWR site build.
4. If readiness incorrectly blocks valid edits, first remove/disable the affected edit-form placement and direct users to standard Salesforce record editing. Inspect the error and repair the loader. Do not bypass readiness or blindly restore c943ebd, which reintroduces the wrong-record/premature-save defects.
5. Roll back to a later independently verified release only if necessary. Preserve form/spec data and unrelated metadata; rollback must remain bundle-scoped. Record affected placements and notify the owner of temporary unavailability. There is no newly added global kill switch.

## Browser verification still required

Use dedicated Contact records A and B with distinguishable values and a prepared published update spec. Observe the actual getRecord request before selecting an interception pattern. In a browser test harness with Playwright network control, install page.route for that observed record request, hold the route until a test-controlled promise resolves, then continue it. Do not guess an endpoint or delay every request. If the available browser tool lacks interception, use a supported DevTools/network harness or mark the delayed-read case unverified; a fast happy path is not a substitute.

1. Hold A's read. Verify the spinner, absence of focusable edit controls, and no write. Release it and verify loaded values.
2. Reuse the mounted viewer from A to B, edit B, submit, and re-query both records. Only B must change.
3. Fail the observed record read, verify error and blocked Save, restore connectivity, and Retry. Confirm a real successful read; test cached failure recovery rather than merely clicking the button.
4. Load a bound lookup and verify Autofill starts without reselection, under both policies.
5. Hold/fail A's save after navigation to B. Verify the sticky toast identifies A and B remains unaffected. Check same-page navigation and unmount behavior separately.
6. Attach a disposable file to B and verify its link targets B. Also confirm file failure rolls back the update. Do not infer this from the scalar-field tests.
7. Smoke-test create mode, Studio preview, and guest Autofill. Record the exact host/build and actual journeys covered.

## Final results

- Final frontend run: 79 suites, 826 tests, and 1 snapshot passed. This includes 27 additional tests over the original 799-test baseline.
- Lint passed for changed JavaScript; git diff --check passed. The LWC1201 slot warning was confirmed present in both HEAD and the changed template; no new compiler warning was introduced.
- Apex regression run 707hk000008TwH2: 30 deployed tests passed before the LWC deployment. No Apex classes changed, and deployment did not run Apex tests again. Coverage was not requested.
- Salesforce validation: 0Afhk000001C76tCAC succeeded, 3/3 bundles, zero component errors.
- Salesforce deployment: 0Afhk000001C5mYCAS succeeded at 2026-09-08 22:19:18 UTC, 3/3 bundles, zero component errors. Only finalFormViewer, finalAutofillRecordSource, and finalNavOneAtATime were deployed.
- Browser attempt reached the RevCloudDev login page; there is no authenticated session in the available browser. Delayed-read, cached-error retry, actual record-switch writes, toast delivery, and file attachment journeys are not browser-verified. The login tab was left available for follow-up.
- No Experience site republish was performed; guest browser verification remains pending against an updated site build.
- Earlier source-upload approval blocks were resolved by the owner's explicit instruction to deploy to revclouddev.
