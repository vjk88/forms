# Native uploads implementation and QA - 2026-11-25

Implemented and deployed to `revclouddev` for QA. No git commit was created.

## Behavior

- One private `Form_Upload__c` per attempt; multiple file entries in JSON. Binaries travel through the native uploader into Salesforce Files.
- Guest defaults: 10 MiB/file, 5 active files, 25 MiB total, 20 lifetime selections per attempt. Admins can change them. Signed-in respondents have no application default size/count/total limits.
- Explicit published limits and accept lists apply. Missing accept allows any type. No usage record or shared storage cap; Salesforce handles org storage.
- Server-verified file receipts; atomic business-record creation, file association and attempt consumption; stable-key retries; abandoned/removed-file cleanup protects consumed/shared files.
- Studio supports explicit native transport opt-in and file restrictions. Preview simulates selection. Existing inline forms retain their existing path.

## Verified

- Scoped metadata deployment: `0Afhk000002R7FZCA0`, succeeded with zero component errors.
- Viewer context-switch safeguard deployment: `0Afhk000002RAi5CAG`, succeeded with zero component errors.
- Final settings-label/help deployment: `0Afhk000002RAoXCAW`, succeeded with zero component errors.
- Apex run `707hk00000OR21D`: **187 passed, 0 failed**, including 29 new upload tests and existing guest/internal/form/survey/freeform/settings/spec/proof regressions.
- New production class coverage: Guard 88%, CleanupBatch 97%, CleanupScheduler 100%, Policy 78%, Service 86%, FinalizeService 89%, Store 97%, Validation 88%, Controller 75%. These are selected-run results, not a whole-org release coverage claim.
- Full frontend run: 226/229 suites and 4673/4676 tests passed; the remaining three were timeouts. Rerunning those three suites separately passed all 223 tests. A subsequent focused run covering upload controls, settings, session lifecycle and cross-component payloads passed all 13 tests, including the added context-switch regression.
- PMD scan of targeted Apex/trigger files: zero critical/high findings; 230 moderate and 282 low findings remain. Narrow system-context suppressions document intentional public gates and protected settings operations. This is not a warning-free scan.
- Existing focused translation, theme, focus, Studio sizing and upload integration guards passed. ESLint passed for the new controls/session helper and changed viewer. `git diff --check` passed.

Raw local evidence is retained under `.tmp/upload-*` (not intended for commit). Apex test names containing Guest exercise the public endpoint under the test actor; they do not impersonate an actual anonymous native upload.

## Remaining live QA and setup

Automatic approval review rejected enabling `Final_Settings__c.Uploads_Enabled__c` and creating/publishing the synthetic public form because those persistently change org settings and public exposure. Explicit approval was requested; those actions were not performed. The existing site home is empty. The app upload switch and shipped guest enrollment remain disabled.

After approval:

1. Enable native uploads in app settings, enroll the intended site guest identity in `Final_Upload_Policy__mdt`, and verify controller/correlation-field access. Org guest/LWR Files settings were already confirmed enabled by read-only preflight.
2. Publish the isolated route with `finalGuestHost` and a synthetic form opted into `stagedV1`. Prepared local artifacts are `.tmp/upload-qa-setup.apex` and `.tmp/upload-qa-site`; the attempted hidden-directory site deployment returned NothingToDeploy and did not establish a published route.
3. Test an actual anonymous upload of two small files, submission, receipt replay, removal, oversize/type refusal and abandoned cleanup. Verify Files links and cleared native secret markers server-side. Also exercise an authenticated respondent beyond guest defaults. Browser end-to-end acceptance is not yet claimed.
4. Schedule `FinalUploadCleanupScheduler` hourly (for example cron `0 0 * * * ?`), avoiding duplicate jobs. Scheduling is an installation step and has not been performed. Test abandoned cleanup once using the real job.

Cleanup writes `RETRY`, `REVIEW` and deletion state into the same JSON and retries transient deletions hourly. There is no dedicated cleanup dashboard or automated overdue alert in this implementation; administrators can inspect attempt records with appropriately scoped internal access. Do not mark live rollout/operational acceptance complete until these checks and the desired monitoring are established.

## Suggested commit

`feat: add native form uploads with one JSON-backed attempt`

Add staged Salesforce Files uploads for published forms, with multiple files on one private Form_Upload__c attempt. Apply configurable guest defaults without signed-in defaults, validate file receipts, link files atomically on submission, preserve safe retries, and clean abandoned files. Add Studio/settings controls, metadata, regression tests and QA documentation.

See [the mechanically verified file inventory](GUEST_UPLOAD_CHANGED_FILES_2026-11-25.md) for the exact task files. Review and commit only those files; unrelated existing workspace changes are excluded.
