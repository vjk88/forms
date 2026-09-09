# Explicit record context for Final Form Viewer

Suggested PR title: **Make form editing and survey context explicit host inputs**

## Behavior

`finalFormViewer` exposes `existingRecordId` and `surveyContextRecordId` in Lightning App Builder and Experience Builder. It no longer declares a public `recordId` property or automatically consumes the page record.

| Input                                          | Behavior                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Blank `existingRecordId`, with no URL fallback | Create an ordinary form record, including on record pages                      |
| Actual 15- or 18-character ID                  | Load and edit that record for ordinary forms                                   |
| `recordId` or `{!recordId}`                    | Resolve `CurrentPageReference.attributes.recordId` on a `standard__recordPage` |
| Nonblank input that cannot resolve             | Block with an error; never silently create                                     |
| `surveyContextRecordId`                        | Supply survey prefill, record-rule facts, and mapped writeback context         |

The component handles both expression spellings explicitly. It also accepts a real ID when a host resolves the binding itself. This does not depend on Lightning App Builder evaluating arbitrary custom-property expressions.

A nonblank component attribute takes precedence over its URL fallback. Links use `c__existingRecordId` or `c__surveyContextRecordId`. Whitespace is trimmed. `c__recordId` is no longer consumed. Each form type ignores the other type's attribute. Studio previews and delegated guest rendering do not use these IDs to access records.

## Runtime and server contract

The authenticated ordinary-form viewer and submission service derive create/update intent from the explicit edit target. No separate save-mode switch is required. The persisted `form.saveMode` remains a legacy authoring/import-validation hint; it no longer selects the authenticated submission operation. The existing guest endpoint's refusal of legacy update specs remains unchanged.

The ordinary-form submit payload uses `meta.existingRecordId`. A blank/missing target creates. A nonblank malformed value (including non-string JSON) is rejected. Legacy ordinary-form `meta.recordId` requests are rejected with a migration message to prevent accidentally inserting instead of updating.

The survey service's existing internal `meta.recordId` payload and Apex `getRecordContext(recordId)` parameter remain intact. They are internal transport contracts, not exposed viewer properties. Survey responses still create response records and perform only configured mapped writeback.

The server validates record ID type and target object, maps only spec-bound fields, strips inaccessible fields, and uses user-mode update DML. A guest cannot gain edit access by supplying an ID. Client configuration does not grant permissions.

## Lifecycle and limitations

Changing the effective edit target resets answers and Autofill ownership, invalidates old reads/submissions, and waits for hydration. Clearing the target returns to a fresh create session. Repeated page-reference notifications for the same edit context preserve manual edits.

Survey context changes reset the previous answers and record-rule facts and invalidate pending context responses. Submission waits for the current context request to finish. Existing best-effort behavior for context-fetch failures remains: failed prefill does not itself prevent filling out the survey; server authorization still applies to any writeback.

A create form may be placed on a record page for another object. When a current-record expression is used, a known page-object mismatch is blocked. Explicit IDs are validated against the form target through the record read and server submission.

Editing forms with repeating sections remains unsupported and is blocked before reading/submitting, with a matching server guard. Existing last-write-wins behavior remains; this change does not add conflict detection or child-record editing.

## Migration and release

Deploy `finalFormViewer` and `FinalSubmitService` together. Include the changed Apex test class for validation.

1. Inventory placements and embedded hosts that relied on automatic `recordId`. Configure **Existing Record Id** as `{!recordId}` for ordinary edit forms, or **Survey Context Record Id** for surveys.
2. Update embedded attributes from `record-id` to `existing-record-id` or `survey-context-record-id`.
3. Update URLs from `c__recordId` to the appropriate named parameter.
4. Update ordinary-form API callers from `meta.recordId` to `meta.existingRecordId`.
5. Validate create, edit, survey prefill/writeback, and record-to-record navigation in the actual intended Lightning and Experience Builder surfaces.

**Breaking behavior:** old placements with no new attribute will create ordinary records and have no survey context. A legacy `saveMode: update` spec alone no longer activates authenticated edit mode. Coordinate placement configuration with release before making the form available to users.

## Validation

- Full frontend suite: **836 tests, 79 suites, 1 snapshot passed**. After the final survey reconnect guard and regression test, the viewer suite was rerun: **127 tests, 17 suites passed**.
- ESLint and task-scoped `git diff --check`: passed for the changed files. The repository-wide diff still has pre-existing whitespace findings in unrelated files.
- Salesforce targeted validation-only run `0Afhk000001DAAfCAO`: **52 Apex tests passed**, no component errors. `FinalSubmitService` coverage: **82.8%** (636 / 768 executable lines). Test classes: `FinalSubmitControllerTest`, `FinalSurveySubmitTest`, `FinalGuestControllerTest`.
- Final viewer compiler-only validation `0Afhk000001DACHCA4`: **passed**, zero component errors.
- Apex Code Analyzer: no severity 1 or 2 findings. Exact final summary:

```text
Found 113 violation(s) across 2 file(s):
    43 Moderate severity violation(s) found.
    70 Low severity violation(s) found.
```

The analyzer still reports complexity, documentation, and test-style findings across the two existing classes. The pre-existing intentional typed-value fallback now has a narrowly scoped, documented `PMD.EmptyCatchBlock` suppression; runtime behavior is unchanged.

The existing LWC1201 submit-bar slot warning remains. Browser validation of configured bindings, Lightning console navigation, Experience Builder rendering, and actual user permissions remains a manual release check. Jest results alone do not verify those journeys.

All validation deployments were `checkOnly`; these changes have not been applied to the org. No commit or PR was created.

## Files for this PR

This is the task-specific file set. The workspace also contains unrelated changes that should not be included automatically. Validation JSON under `scratch/` is local evidence, not part of this file set.

- `docs/FinalDesign/EXPLICIT_RECORD_CONTEXT.md`
- `docs/FinalDesign/IMPL_PLAN_RECORD_EDIT_LIFECYCLE_FIXES.md`
- `docs/FinalDesign/IMPL_PLAN_RECORD_PAGE_EDIT.md`
- `force-app/main/default/classes/FinalSubmitControllerTest.cls`
- `force-app/main/default/classes/FinalSubmitService.cls`
- `force-app/main/default/lwc/finalFormViewer/__tests__/recordEdit.test.js`
- `force-app/main/default/lwc/finalFormViewer/__tests__/recordEditLifecycle.test.js`
- `force-app/main/default/lwc/finalFormViewer/__tests__/recordPagePlacement.test.js`
- `force-app/main/default/lwc/finalFormViewer/__tests__/recordRules.test.js`
- `force-app/main/default/lwc/finalFormViewer/finalFormViewer.js`
- `force-app/main/default/lwc/finalFormViewer/finalFormViewer.js-meta.xml`
