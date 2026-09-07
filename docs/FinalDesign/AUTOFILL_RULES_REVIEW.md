# Autofill implementation review

Reviewed local source on 2026-09-07 against [the implementation design](./IMPL_PLAN_AUTOFILL_RULES.md) and [the changed-files inventory](./AUTOFILL_RULES_CHANGED_FILES.md).

**Result: changes required before deployment.** The implementation contains useful building blocks, but the complete author/guest/customer journeys are not working correctly as assembled.

This review changed no application files and performed no Git operations or deployment. Apex findings are based on source inspection; no org compilation or Apex execution was performed.

## Verification performed

- Ran the existing Jest suite with `node node_modules/@salesforce/sfdx-lwc-jest/bin/sfdx-lwc-jest -- --runInBand --silent`: **76 suites, 779 tests, and 1 snapshot passed**.
- Ran targeted ESLint on seven Autofill/runtime JavaScript files: **17 errors** (unused variables, a restricted timer, and public-property reassignment). This is the current local result; no baseline comparison was made to attribute every lint error to this feature.
- Executed the actual pure JavaScript modules directly to reproduce four defects: null initial preview session, destination-keyed context producing no patch, old requests surviving a rule edit, and Always replace leaving a rule-owned value after clearing its source.
- Traced authoring, source Describe, guest context, token minting, submission, LDS wiring, preview, publication, and transfer integration.
- Checked the inventory against the filesystem: **51 listed file rows**, two nonexistent paths, and several implemented integration files omitted from the inventory.

Passing Jest does not establish Apex compilation, guest security, real UI API behavior, or end-to-end completion. Several existing tests use inputs that bypass the defects below.

## P1: deployment and core-flow blockers

### R1. New Apex test calls a nonexistent method overload

**Location:** [FinalAutofillControllerTest.cls:129](../../force-app/main/default/classes/FinalAutofillControllerTest.cls#L129), [FinalStudioController.cls:327](../../force-app/main/default/classes/FinalStudioController.cls#L327).

The test calls `FinalStudioController.mintRecordLink(f.Id, ja.Id, null)`. The controller defines only `mintRecordLink(Id formId, Id recordId)`. This test cannot compile against the local class as written. Jest does not compile Apex, so the green local suite misses it.

**Fix:** use the existing two-argument API unless an actual product requirement calls for an additional overload. Compile the targeted Apex set and execute its tests before claiming Apex verification.

### R2. Guest context now depends on guest access to authoring records

**Location:** [FinalGuestController.cls:345](../../force-app/main/default/classes/FinalGuestController.cls#L345), [FinalAutofillService.cls:102](../../force-app/main/default/classes/FinalAutofillService.cls#L102). Classic submission also calls this helper at [FinalGuestController.cls:168](../../force-app/main/default/classes/FinalGuestController.cls#L168).

`getGuestAutofillContext` calls `FinalAutofillService.resolveLinkSource`, which is `with sharing` and queries `Form__c` and `Form_Version__c` using `WITH USER_MODE`. The intended guest model deliberately does not grant access to these authoring records. The helper therefore throws or finds no record; the endpoint catches this and returns `unavailable` for a valid link.

Because the host now uses the new endpoint for existing surveys too, this can regress existing survey token prefill. Classic tracked submission similarly cannot resolve its source and then rejects the otherwise valid tracked token.

**Fix:** keep user-mode authorization for minting. For guest resolution, derive the source contract from the exact published spec already loaded behind the public gate; do not query it again through an author-only/user-mode helper. Do not fix this by opening guest access to authoring records.

**Regression test:** use a real guest identity with no Form/Form Version record access; verify valid classic and existing survey links, plus a classic tracked submission.

### R3. LDS record read omits a required request parameter

**Location:** [finalAutofillRecordSource.js:30](../../force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.js#L30).

The wire supplies `recordId` and `optionalFields`, but neither `fields` nor `layoutTypes`. Putting `Account.Id` inside `optionalFields` does not satisfy the required parameter. Salesforce documents that one of `fields` or `layoutTypes` is required. [Official getRecord contract](https://developer.salesforce.com/docs/platform/lwc/guide/reference-wire-adapters-record.html).

**Fix:** pass the source object's ID field through `fields`, and mapped source fields through `optionalFields`. Preserve omission versus null.

**Regression test:** assert the wire configuration, not only manually emitted mock results; verify a real lookup fetch in Salesforce. Current tests emit `getRecord` data directly and never test request validity.

### R4. Authenticated source plans are not connected to any LWC

**Location:** [FinalAutofillController.cls:63](../../force-app/main/default/classes/FinalAutofillController.cls#L63), [finalGuestHost.js:130](../../force-app/main/default/lwc/finalGuestHost/finalGuestHost.js#L130), [finalFormViewer.js:1240](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L1240).

There are no LWC calls to `getLookupPlan` or `resolveLinkForUser`. The guest host always loads the guest-projected configuration and calls the guest context API, including for logged-in customers.

Consequences:

- A logged-in customer using the public host receives no authenticated-only link mappings.
- Guest-projected lookup rules have no source element ID or source field names, so `_handleSourceLookupChange` cannot match or execute them for that customer.
- Internal personalized-link Autofill has no caller for its token-to-LDS plan.

The controller's `loadActivePublishedVersion` also has no separate public-customer metadata authorization path: its class enforces record sharing, so a customer without authoring-record access cannot simply be routed to it and expected to succeed.

**Fix:** add explicit authenticated routing and plan loading, feed validated lookup descriptors/rules into the viewer, and use LDS for that user's records. Implement the narrowly gated active-public-version metadata path without granting customers authoring access. Keep guest identity checks server-side.

**Regression test:** a logged-in Experience Cloud user on the public host, including a mapping with `guestAllowed: false`, a valid lookup selection, and a source record inaccessible to that customer.

### R5. Authors cannot create the intended source lookup, and plan parsing uses the wrong binding shape

**Location:** [FinalStudioController.cls:613](../../force-app/main/default/classes/FinalStudioController.cls#L613), [FinalStudioController.cls:705](../../force-app/main/default/classes/FinalStudioController.cls#L705), [FinalAutofillController.cls:270](../../force-app/main/default/classes/FinalAutofillController.cls#L270).

`inputTypeOf` still has no `REFERENCE` branch. The normal Describe/palette path therefore excludes lookup fields, and no reference-target metadata is added there. The panel's “Add a lookup field first” action cannot complete the required dependency through the normal authoring flow.

Separately, `inspectLookups` casts each element's `binding` to `String`. Final bindings are objects such as `{ object: 'Case', field: 'AccountId' }`. Passing a normal bound spec to `getLookupPlan` will produce a type-conversion failure, including when the bound element is not a lookup. The new Apex test avoids this by supplying a string binding and does not assert an actual populated lookup plan.

**Fix:** expose supported single-target reference fields, carry their canonical target metadata into the element, and resolve lookup targets from `binding.object`/`binding.field` with Describe. Update the validator, renderer, and runtime to agree on this shape; do not trust client-authored `referenceTo` as the authorization source.

**Regression test:** start with a normal Case form, add AccountId from Fields, configure its Autofill rule, publish, and verify the resulting lookup plan contains Account and the expected mappings.

### R6. Studio's real preview path cannot apply Autofill

**Location:** [finalFormViewer.js:534](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L534), [previewSession.js:152](../../force-app/main/default/lwc/finalFormViewer/previewSession.js#L152), [finalFormStudio.js:575](../../force-app/main/default/lwc/finalFormStudio/finalFormStudio.js#L575), [finalFormViewer.js:759](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L759).

Two independent problems block preview:

1. Studio sets `preserve-session`, which becomes `preservePreview`. On the first mount `_autofillSession` is null, and reconciliation immediately returns null. The code only creates a session in the other branch. The preview therefore never gets its initial Autofill session.
2. Studio sends test values keyed by destination IDs. The engine reads `mapping.from` for the full authored spec. For `{ from: 'Email', to: 'el_email' }`, `{ el_email: 'person@example.test' }` produces an empty patch. The integration test passes source-field keys instead, unlike the actual panel/Studio contract.

Both behaviors were reproduced by executing the actual modules. Fixing only one will not restore preview.

**Fix:** initialize a missing session even in preservation mode, normalize injected destination values separately from LDS source-field results, and add a real Studio/panel-to-viewer test. Also make “Clear test data” remove the applied test answers: setting `recordContext` to null currently returns without clearing values.

### R7. Changing the URL token retains the previous person's context

**Location:** [finalGuestHost.js:101](../../force-app/main/default/lwc/finalGuestHost/finalGuestHost.js#L101), [finalFormViewer.js:734](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L734).

The host detects a new form/token load generation, but does not clear the previous `spec`, `recordContext`, or viewer session before awaiting the new requests. It assigns the next spec while the old context is still injected. The viewer can consequently seed the new session with the previous token's values. If the new token returns empty/unavailable context, there is no clearing patch to remove those values.

The old viewer also remains available to submit while the host's current URL token has already changed. Generation checks on promise completion do not prevent this mixed-state interval.

**Fix:** unmount/reset or explicitly invalidate the old respondent session before fetching the new token's spec/context; keep submission unavailable during that transition. Bind context and submit completion to the captured session identity. An empty new context must never retain values from a previous link.

**Regression test:** same form, valid token A → token B with delayed/invalid/empty context; verify A's values disappear immediately and cannot be submitted with B.

### R8. Link minters do not check access to fields they will disclose

**Location:** [FinalStudioController.cls:411](../../force-app/main/default/classes/FinalStudioController.cls#L411), [FinalSurveyLinkInvocable.cls:87](../../force-app/main/default/classes/FinalSurveyLinkInvocable.cls#L87).

The Studio minter checks a user-mode `SELECT Id`; Flow checks `UserRecordAccess`. Neither checks read permission for the effective guest-disclosed fields. A user who can read the record but not a published sensitive field can mint a token that the system-context guest path is intended to use to disclose that field. This becomes exposed once R2 is repaired.

**Fix:** check the minter's object/record access and FLS for the effective disclosure union, including existing survey guest-prefill mappings. Reject unauthorized minting consistently in Studio and Flow. Preserve the deliberately restricted guest read boundary.

**Regression test:** publish as an author who can read a field, then mint as a user who can read the record but lacks that field's FLS; neither entry point should issue the link.

### R9. The new context endpoint does not enforce form availability windows

**Location:** [FinalGuestController.cls:328](../../force-app/main/default/classes/FinalGuestController.cls#L328).

`getGuestRuntimeSpec` checks `FinalSubmitService.isClosed` and the response cap, but `getGuestAutofillContext` only applies `gate` and active-version matching before reading personal values. `gate` checks Published/Public_Guest, not opening/closing windows or caps. Calling the context endpoint directly can therefore bypass the availability rule that would hide the form, once source resolution succeeds.

**Fix:** apply the same current availability checks independently in the context endpoint before record resolution/query. A prior spec request is not an authorization guarantee.

**Regression test:** valid token against a not-yet-open, closed-by-date, and capped form returns no source values, even when called directly.

## P2: additional functional defects

### R10. Preview rule edits do not invalidate pending requests

**Location:** [previewSession.js:152](../../force-app/main/default/lwc/finalFormViewer/previewSession.js#L152), [finalFormViewer.js:1359](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js#L1359).

Reconciliation replaces `rules` but retains the previous fingerprint and pending request state. A request begun before changing its source/mappings remains current; this was reproduced with `isRequestCurrent`. The viewer also reconstructs result identity using the current fingerprint/version rather than the original captured request identity.

**Fix:** recompute fingerprints, invalidate changed/removed rule requests and their timers, and return the complete immutable identity with each result. Discard obsolete timer/error callbacks without setting a new submit error. Add the rule-edit-during-fetch case alongside normal A→B record selection tests.

### R11. “Invalidate all links” rejects classic forms

**Location:** [FinalStudioController.cls:478](../../force-app/main/default/classes/FinalStudioController.cls#L478).

The new Autofill panel exposes this action for classic forms, but the server still throws `Record links are for surveys.` The generalized minting path and invalidation path disagree.

**Fix:** apply the eligible-form authorization to invalidation as well. Test mint → successful prefill → invalidate → old token refused → newly minted token accepted for a classic form.

### R12. Flow source-contract lookup is no longer bulk-safe across forms

**Location:** [FinalSurveyLinkInvocable.cls:80](../../force-app/main/default/classes/FinalSurveyLinkInvocable.cls#L80).

The invocable loops over distinct form IDs and calls a helper that queries each form and active version separately. A batch of roughly 50 distinct eligible forms exhausts the synchronous SOQL allowance even before other transaction work. The cache helps repeated use of one form, but does not bulkify distinct forms.

**Fix:** query forms and active versions in sets, then resolve contracts from the loaded records/maps. Test a heterogeneous bulk request and assert query count stays bounded. Keep per-request errors and result ordering.

### R13. Always replace leaves obsolete values after source clear/change

**Location:** [autofillEngine.js:174](../../force-app/main/default/lwc/finalFormViewer/autofillEngine.js#L174), [autofillEngine.js:358](../../force-app/main/default/lwc/finalFormViewer/autofillEngine.js#L358).

After an earlier manual edit, `alwaysReplace` can legitimately apply a new value and assign rule ownership. It leaves `touched[destination]` true, however, and `onSourceChanged` refuses to clear any touched destination. Clearing the lookup then leaves the newly Autofilled value from the old source, despite there being no edit since Autofill took ownership. This was reproduced against the actual engine.

**Fix:** distinguish historical edits from edits made after the most recent application. Ownership/current edit revision should determine clearing, while preserving genuinely subsequent manual edits. Test manual value → Always replace → clear/change source.

## Inventory and verification corrections

The supplied inventory should not describe this as “100% verified.” In addition to the source issues above:

- It lists 51 paths but claims 42 files.
- `lwc/finalFormViewer/__tests__/finalFormViewer.test.js` does not exist. The new integration test is `autofillIntegration.test.js`.
- `lwc/finalAutofillRecordSource/finalAutofillRecordSource.css` does not exist.
- Its lookup description says custom debounced search; the implementation actually wraps `lightning-record-picker`.
- Its record-source description says it wraps a picker/search API; it is actually renderless LDS.
- Its persisted-schema descriptions use `rules.autofill`, `exposeToGuest`, and `personalizedLink`, whereas the actual code uses `settings.prefill.autofillRules`, `guestAllowed`, and `link`.
- It omits important changed integration files, including `FinalStudioController.cls`, `FinalSpecController.cls`, `FinalSpecTransferService.cls`, `FinalSpecTransferValidator.cls`, `finalFormViewer.html`, and `previewSession.js`.
- The reviewed controller Apex test uses a string binding and calls an invalid overload. Existing frontend mocks do not validate real guest permissions or the real LDS parameter contract.

Update the file manifest and describe the evidence accurately: frontend unit tests pass; Apex compilation/tests and real guest/customer flows still require verification.

## Suggested repair order

1. Fix the Apex compilation defect, guest contract-resolution boundary, and LDS request contract.
2. Complete the real lookup authoring/metadata path and authenticated host routing.
3. Repair Studio preview initialization/value normalization and guest token/session reset.
4. Enforce disclosure FLS and availability checks; fix invalidation and Flow batching.
5. Repair request reconciliation and ownership semantics, then add regression tests for each finding.
6. Re-run focused and existing relevant suites, compile/validate the targeted Apex through the owner's deployment workflow, and verify anonymous/internal/customer journeys before updating implementation status.
