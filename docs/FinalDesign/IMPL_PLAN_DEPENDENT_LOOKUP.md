# Reusable lookup and dependent filters — technical implementation plan

Status: proposed implementation; no feature code changed by this document.
Prepared: 2026-09-08. Audience: junior developer, with senior review of Apex access enforcement.

## 1. Outcome and scope

Build a reusable single-record lookup using `lightning-record-picker`. Keep the existing Forms integration working, add fixed and answer-dependent filters, and expose a thin Screen Flow adapter.

The main journey is: select an Account, then select a Contact belonging to that Account. Changing the Account clears the Contact and updates the available results immediately. Selecting or clearing that Contact continues to drive existing Autofill rules.

This is an extension of the working lookup, not a replacement of Autofill. It refines authenticated D1/D2 in [the program spec](./GUEST_PREFILL_LOOKUP_SPEC.md). Native search replaces the earlier proposed custom search endpoint for this scope. Anonymous search, polymorphic references, multiple selections, inline record creation, recent records, external data, and repeater-row dependencies remain separate work.

“Reusable” means embeddable in supported Salesforce LWC hosts and Screen Flows. It does not promise support in every browser container or anonymous website.

## 2. Verified starting point

These are source observations, not new org verification:

- `finalLookup` already wraps `lightning-record-picker`, accepts `targetObject`, and emits `valuechange` with `{ elementId, value }`. It blocks anonymous search. It does not currently forward filter, display, or matching configuration.
- `finalElementRenderer` renders that adapter and forwards selection through the normal answer event.
- `FinalStudioController.describeFields` discovers single-target references. Studio stores `element.config.referenceTo`; polymorphic references are deliberately excluded.
- `finalFormViewer` owns answers, visibility, and Autofill. Its `handleValueChange` marks changes as manual before calling `_handleSourceLookupChange`. A dependency-driven clear must not blindly use that manual-edit path.
- `FinalAutofillController.getLookupPlan` exists and returns authenticated lookup descriptors and Autofill rules. `finalGuestHost` fetches it for logged-in respondents. Its current catch permits the form to continue without the plan; new filtered lookups must fail closed if their policy cannot be loaded.
- `element.binding` is an object, for example `{ "object": "Case", "field": "ContactId" }`.

Do not reclassify repaired Autofill work as missing. The additions here are filter configuration, dependency coordination, reusable APIs, and selection-policy enforcement.

## 3. Native component choice and compatibility gate

Use `lightning-record-picker`: it accepts declarative filters and configurable matching/display fields. Search uses GraphQL. It supports Lightning Experience, Experience Builder Sites, and Salesforce mobile. Matching supports Text and Formula(Text), with one additional matching field; display supports one additional field. Use its documented `ready` event before imperative focus. [Salesforce record picker reference](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-record-picker.html).

Do not use `lightning-input-field` as the reusable core: it belongs inside record-edit-form and does not support dependent lookups. [Salesforce input field reference](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-input-field.html).

Before substantial development, run a small native-picker spike in each required host:

| Host                                               | Required evidence                                                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal Lightning page                            | Account selection filters Contact; keyboard and clear work.                                                                                                                       |
| Logged-in Experience Cloud/LWR page                | Search and selected-record hydration work under the customer's actual permissions.                                                                                                |
| Screen Flow                                        | Input changes update filters; output and validation work on Next/Back.                                                                                                            |
| Current Studio Visualforce/Lightning Out container | Verify the actual host. Do not infer support from Lightning Experience. If unsupported, show a clearly labeled simulated preview and test the real picker in a supported runtime. |

Record the API version and object used in the spike. Keep existing metadata versions unless a demonstrated requirement needs a targeted upgrade. Native object support is a separate check from Apex Describe: a reference target existing in the schema does not prove the picker can search it.

## 4. Component boundaries

```text
Any supported custom LWC ───────────────> finalRecordLookup
Screen Flow ──> finalLookupFlow ────────> finalRecordLookup
Forms viewer ──> renderer ──> finalLookup ──> finalRecordLookup
                       ↑
          resolved filters and dependency state
```

### New generic core: `finalRecordLookup`

Own native rendering, accessible label/help/error state, and normalized events. It must not import Forms controllers, inspect form specs, know element IDs, or execute Autofill. Do not add a provider framework or custom search service in this release.

| Public input                       | Contract                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `objectApiName`                    | One supported Salesforce object.                                          |
| `value`                            | Controlled record ID or null. Never mutate the caller's public property.  |
| `label`, `placeholder`, `variant`  | Sensible defaults; external labels must still have an accessible name.    |
| `required`, `disabled`, `readOnly` | Boolean state; read-only disables selection and clearing.                 |
| `filter`                           | Resolved native filter object; no answer tokens.                          |
| `matchingInfo`, `displayInfo`      | Native-shaped configuration. Caller owns semantic validation.             |
| `contextKey`                       | Opaque identity of the configuration/session that produced this instance. |
| `pending`, `unavailableMessage`    | Caller-controlled policy-loading or blocked state.                        |

Events:

- `selectionchange`: `{ recordId, contextKey }`, where clear is null. Emit once for a user action; input setters do not emit selection events.
- `lookupstatechange`: `{ status, contextKey }`; statuses are `loading`, `ready`, `error`. This describes control readiness, not server authorization of the selected record.
- `lookuperror`: normalized error code and safe message. Do not expose Apex internals.

Expose `focus()`, `setCustomValidity(message)`, `checkValidity()`, and `reportValidity()`. The last two return a **wrapper-defined** boolean based on required value, pending/error state, and custom errors. `reportValidity()` also asks the native control to display its error. Do not assume a native `checkValidity()` exists or that native `reportValidity()` returns a boolean. Verify the native method contract in the spike. Parent submit validation remains authoritative.

Preserve disabled/read-only existing values; an unavailable empty required input needs an actionable error, not an automatic pass. Do not equate native readiness with selected-record membership in the filter.

### Existing Forms adapter: `finalLookup`

Keep `elementId`, `targetObject`, existing value/label/state inputs, and the exact existing bubbling/composed `{ elementId, value }` `valuechange` event. Translate `targetObject` to `objectApiName`. Forward resolved configuration and methods to the core. Preserve `pickererror` compatibility where currently consumed.

The adapter checks `contextKey` before accepting a generic selection. Extra generic event fields must not change the Forms answer shape. Keep anonymous search disabled.

### New Flow adapter: `finalLookupFlow`

Expose `lightning__FlowScreen`. Provide scalar configuration: `objectApiName`, `label`, `required`, `disabled`, `value`, `filterFieldApiName`, and `controllingValue`. The last two support the common equality dependency without making admins write JSON. Optional `filterJson` is for advanced fixed criteria; parse and validate it, then AND the dependent criterion. Invalid JSON blocks the control with a configuration message.

Use `value` as an input/output String for revisiting screens; configuration properties are input-only. Publish selection changes using `FlowAttributeChangeEvent('value', recordId)`. Handle null inputs and parent changes. Do not assign to an `@api` input or dispatch navigation and value updates together. [Flow runtime considerations](https://developer.salesforce.com/docs/platform/lwc/guide/use-flow-runtime-considerations.html), [Flow target metadata](https://developer.salesforce.com/docs/platform/lwc/guide/targets-lightning-flow-screen.html).

Implement Flow `validate()` returning `{ isValid, errorMessage }`, store external errors in `setCustomValidity()`, and render internal/external errors in `reportValidity()`. Initial mount must not flash a required error. [Flow validation methods](https://developer.salesforce.com/docs/platform/lwc/guide/use-flow-validate-external-internal-methods.html).

A Flow filter is search UX, not a trusted save policy. The Flow's save service must enforce its business relationship independently. Forms-specific Apex validation must not be advertised as automatically securing arbitrary downstream Flow DML.

## 5. Persisted Forms contract

Use the previously reserved `element.lookupConfig`, with its own version. Do not move reference metadata out of `config.referenceTo`. The top-level form schema remains additive.

Example element fragment: a Case Contact constrained by the Account answer. `el_account` must identify the Case AccountId element elsewhere in the same form.

```json
{
  "id": "el_contact",
  "binding": { "object": "Case", "field": "ContactId" },
  "config": { "inputType": "reference", "referenceTo": "Contact" },
  "lookupConfig": {
    "version": 1,
    "filter": {
      "mode": "all",
      "criteria": [
        {
          "id": "lc_account",
          "fieldPath": "AccountId",
          "operator": "eq",
          "value": { "kind": "answer", "elementId": "el_account" }
        }
      ]
    },
    "displayInfo": { "primaryField": "Name", "additionalFields": ["Title"] },
    "matchingInfo": {
      "primaryField": { "fieldPath": "Name", "mode": "startsWith" }
    }
  }
}
```

A fixed criterion uses `"value": { "kind": "constant", "value": "Customer" }`, with a typed value appropriate to the field. Explicit constant null is different from an unanswered controlling field.

Proposed v1 product limits:

- Up to 10 criteria, `mode: all | any`. Compile to native AND/OR; no custom expression editor.
- Direct fields only. No relationship traversal, raw SOQL, `$User` expressions, or arbitrary JavaScript.
- Reference/ID fields: `eq`, `ne`; Text and single picklist fields: `eq`, `ne`; Boolean: `eq`, `ne`; Number/Currency/Percent: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`.
- Date/time, multi-select picklists, encrypted/long/rich text, list operators, and wildcard operators are deferred. These are v1 application limits, not claims about all native capabilities.
- Answer sources must be scalar, outside repeaters, and type-compatible. A reference source must target the expected object. Preserve false and zero; never use a truthiness check for “unanswered.”
- Missing controlling answers disable the whole lookup, including `mode: any`. Never omit the missing row and broaden the search.
- Dependency changes clear the selected value in v1. Keeping a still-compatible selection through revalidation is a future enhancement.

Validate fields using Describe and native capability constraints. Native search-field eligibility is narrower than general filter-field eligibility. Filter and search configuration do not automatically inherit all configured Salesforce lookup-field rules; retain platform DML enforcement as well.

No `lookupConfig` means existing unfiltered behavior. Reject unsupported versions on publish/import. The old program spec's token strings and visibility operators were a proposal: do not silently interpret them as this schema. If an actual saved fixture uses them, add an explicit migration with tests before accepting it.

## 6. Studio authoring

Add a **Lookup results** section to the existing field property panel, only for supported reference fields:

1. **Show:** primary label and optional secondary detail, defaulting to the native name display.
2. **Search by:** default name field; optional supported additional text field under an expandable setting.
3. **Limit results:** Add condition; rows read “Contact → Account / equals / Answer to → Account.” Offer “A fixed value” and “An answer” as value sources.
4. **Match:** All conditions / Any condition, shown only with multiple rows.

Display “Choose Account first” in the live preview while the dependency is empty. Explain beneath the condition: “Changing Account clears the selected Contact.” Keep record/object IDs and filter JSON out of the respondent UI.

Drafts can contain unfinished rows with inline errors. Publish must reject invalid rows, missing source elements, incompatible types, unsupported fields, and dependency cycles. Deleting a referenced question must identify affected lookup rules and require repair before publish. Renaming preserves ID references; duplicating a group remaps references to duplicated elements while preserving deliberately external references. Add contract fixtures for both cases.

Unsaved Studio preview resolves the draft locally. It must not call the published-policy validator and mistake a different published configuration for its own. Label simulation if the Studio host cannot run the native picker.

## 7. Runtime dependency algorithm

Create a pure utility for validating config shape, building a dependency graph, normalizing values, producing native filters, and calculating affected descendants. Keep network access out of this utility.

Build a directed graph from controlling element to dependent lookup. Reject cycles before publish; runtime also fails closed for malformed imported data. Use a stable configuration/session fingerprint, not only the selected record ID.

For every answer mutation, including Autofill and programmatic hydration:

1. Normalize and compare old/new values. A same-value write must not clear children.
2. For a real post-hydration dependency change, invalidate affected lookup generations immediately.
3. Clear selected descendants once in topological order, then update their filters/disabled states.
4. Route clears into the normal answer and visibility pipeline with origin `dependency`. Invoke the existing source-lookup Autofill clear behavior, but do not call `onManualEdit` for these programmatic clears.
5. Apply resulting Autofill changes through the same coordinator. Settle the graph before presenting enabled child controls. Prevent reentrant loops; if cross-feature rules oscillate, stop with a configuration error rather than spin.
6. Preserve the viewer's existing page identity/focus restoration behavior.

Refactor the viewer to one internal answer-application entry point with explicit origins such as `user`, `autofill`, `dependency`, and `hydrate`. Do not have native selection, Autofill, and dependency handlers mutate `_answers` independently. Add a test for an Autofill-produced controlling answer; watching only user events is insufficient.

Initial hydration is a batch, not a series of user changes. Load answers and policy first, then validate any supplied lookup selections. Do not clear a valid restored child merely because its parent was populated during hydration. Do not assume that setting a native picker value proves membership in the current filter.

While a lookup's policy or restored selection is being validated, block its interaction and relevant navigation/submission. An optional empty lookup may remain unavailable without preventing the entire form; a required applicable lookup must report that it cannot be completed. A nonempty unverified selection must never pass submit.

When identity, version, or respondent token changes, immediately discard prior filters, validation results, and queued events. Key/remount the native child for a new policy generation and attach an immutable instance context to its callbacks. Native events do not carry request identity: attaching the _current_ context to a stale old event would falsely legitimize it. Test events dispatched by a detached old instance.

## 8. Apex policy and submit enforcement

Introduce a dedicated `FinalLookupPolicy` service and `FinalLookupController` boundary. The following names are proposed contracts, not existing methods.

### Policy service responsibilities

- Validate authoring configuration against real binding Describe information; derive the reference target server-side instead of trusting `config.referenceTo`.
- Compile the restricted predicate from the authoritative spec. Allowlist all object/field identifiers, bind every value, and reject type/operator mismatches. Do not concatenate client identifiers or values into SOQL.
- Resolve controlling answers from the complete normalized submission state, including existing values when handling partial edits. Prevent omission from turning a dependent filter into an unrestricted query.
- Verify each selected ID belongs to the target object, is readable by the actual authenticated respondent, and satisfies the compiled filter. Use user-mode record queries regardless of delegated submission posture.
- Batch lookups by compatible object/predicate where possible, deduplicate selections, and cap work based on the validated spec. Do not perform one SOQL query per arbitrary client-supplied element. Add governor-limit tests at the documented maximum supported form size; choose and document a publish-time lookup-count limit if needed.

Do not treat answers as authorization. An Account chosen on the form is user input; the service must independently check access to the Contact and enforce any separate tenant/customer entitlement rules. Equality to a submitted AccountId alone is not authorization to see that Contact.

### Endpoint and published plan

Proposed `validateSelections(formId, versionId, answers)` returns only per-element validity codes and the validated version/context; it is not a record-search or record-data endpoint. Accept a bounded answer payload, reconstruct lookup configuration on the server, and reject arbitrary element IDs. Return safe codes such as `SOURCE_REQUIRED`, `SELECTION_UNAVAILABLE`, and `CONFIG_UNAVAILABLE`, without disclosing whether inaccessible records exist.

Extend authenticated `getLookupPlan` descriptors with validated lookup configuration, delegating policy work to the new service. Preserve its existing `lookups` and `rules` shape and Autofill consumers. Review its current publication gates: every public-facing lookup endpoint must independently enforce active version, allowed delivery channel, availability dates/closed state, and applicable response limits. Authentication alone is insufficient.

For logged-in public-host respondents, missing policy must disable affected pickers; do not fall back to an unfiltered picker. Preserve a non-sensitive `requiresLookupPolicy` marker in projected runtime metadata so a failed plan fetch is distinguishable from a genuinely unfiltered element. Do not expose source API names to anonymous clients just to implement this marker.

Anonymous callers are rejected by the new selection endpoint. Keep public metadata resolution in the existing published/public-gated path; never grant guests access to authoring records or call an internal with-sharing authoring loader as a guest workaround. Do not weaken field access when policy fields are unreadable: return unavailable, never drop a condition.

### Submit integration

Call the same policy service inside `FinalSubmitService`, before form or survey persistence. UI validation and a previous endpoint response are not proof at submit time. Recheck access and membership against current records and the pinned authoritative form version. A changed Contact Account relationship must be caught on submit.

Validate all supplied lookup selections. For required/conditional rules, integrate with authoritative visibility and normalized answers; do not trust the client's list of visible elements. If a server evaluator needed for this path is not available, implement that explicit dependency before claiming conditional required validation complete. Hidden retained selections still require authorization if they will be persisted; otherwise remove them from persistence using the existing hidden-answer policy.

Distinguish authenticated identity from `Posture.GUEST`: a logged-in Experience Cloud customer can use the public submission path and must still have lookup reads enforced using their real access. For anonymous submissions, reject client-supplied lookup IDs unless an existing separately authorized server-derived context explicitly permits that binding. A disabled guest widget alone is not enforcement. Preserve legitimate token-based Autofill through its own trust contract.

Return element-linked errors without committing partial form/survey writes. Keep DML relationship restrictions in effect; the new filter check complements platform validation.

## 9. File ownership and build order

This is a proposed implementation inventory, not a list of code changed by this document. Existing paths below were checked on disk; new names are explicitly proposed. All source paths are relative to `force-app/main/default`.

| Slice                      | Existing integration points                                                                                            | Proposed additions / deliverable                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0: native proof            | `lwc/finalLookup/`                                                                                                     | Host spike evidence and confirmed native API contracts; no custom search fallback by assumption.                                     |
| 1: reusable core           | `lwc/finalLookup/`, `lwc/finalElementRenderer/`                                                                        | New `lwc/finalRecordLookup/`; preserve existing answer events and Autofill.                                                          |
| 2: schema and policy       | `classes/FinalSpecTransferValidator.cls`, `classes/FinalSpecController.cls`, `classes/FinalStudioController.cls`       | New `classes/FinalLookupPolicy.cls` and test class, metadata companions; publish/import validation and typed fixtures.               |
| 3: Studio configuration    | `lwc/finalPropertyPanel/`, `lwc/finalFormStudio/`                                                                      | New `lwc/finalLookupConfigEditor/` and `lwc/finalLookupUtils/`; live draft filter preview.                                           |
| 4: runtime and enforcement | `lwc/finalFormViewer/`, `lwc/finalGuestHost/`, `classes/FinalAutofillController.cls`, `classes/FinalSubmitService.cls` | New `classes/FinalLookupController.cls` and test class, metadata companions; policy projection, dependency lifecycle, submit checks. |
| 5: reuse outside Forms     | No existing Flow adapter assumed                                                                                       | New `lwc/finalLookupFlow/`, metadata, tests, sample Screen Flow setup instructions.                                                  |

Each new LWC bundle needs the usual JS, HTML where rendering, and metadata files; add CSS only when needed. Each slice has tests beside the code it owns. Update [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) when the schema actually lands. Keep the pending-work entry pending until runtime/org evidence exists.

Slices are development order, not permission to release partially enforced filtering. Do not expose authorable filters in production before the dependency engine and server checks are both present. If the native host spike fails, document that host's limitation before deciding on a separate custom provider implementation.

## 10. Verification and acceptance

### Frontend and schema tests

- Existing lookup selection/clear retains the real `{ elementId, value }` payload through renderer and viewer; Autofill still applies, clears untouched values, and preserves subsequent manual edits.
- Exact compiled filter object and typed values, including false, zero, null constant, blank answer, all/any, and no-config compatibility.
- Account A → Contact A → Account B clears Contact; clearing Account disables Contact; descendants clear once; sibling lookups remain unchanged.
- Hydration preserves a server-validated compatible selection; incompatible or inaccessible restored selections cannot submit.
- Old policy responses, old native instances, and identity/token switches cannot restore a stale value.
- Invalid configuration, missing plan, unsupported object, and unreadable policy fields never produce unrestricted search.
- Renames, deletes, clone remapping, cycles, malformed import, and schema version handling.
- Keyboard selection/clear and focus restoration; accessible label with hidden visual label; required error after attempted navigation rather than on mount.
- Flow null inputs, controlling-value changes, output clear, Back/revisit, and external validation errors.

### Apex tests and real platform evidence

- Compile the actual Apex classes and run policy/controller/submit tests. Use both genuine bound-element fixtures and tampered payloads.
- Assert inaccessible selections, foreign-object IDs, invalid identifiers/operators, mismatched version/form IDs, closed/unavailable forms, omitted parent answers, and forged anonymous lookup values are rejected.
- Verify logged-in public-host behavior separately from internal and anonymous behavior. Include field access and relationship changes between selection and submit.
- Prove rejected lookup submissions commit no partial form/survey changes. Exercise maximum supported configuration size and query limits.
- In an org, complete Account → Contact in Lightning and logged-in Experience Cloud; change and clear the Account; submit; reopen/edit; test a restricted-access customer. Repeat in Screen Flow.
- In the Studio host, show either a working native preview or an explicit simulated preview; no silent broken picker.

Jest proves frontend behavior under mocks. It does not prove GraphQL object support, Apex compilation, Flow runtime behavior, sharing/FLS, or the real host. Report those verification tiers separately.

### Definition of done

An admin can configure the Account/Contact dependency without JSON. Respondents cannot select stale children after a parent change. Existing Autofill continues to work. Tampered submissions are rejected server-side. A separate LWC and a Screen Flow can use the reusable lookup without importing Forms internals. Anonymous lookup search remains unavailable. Publish/import rejects invalid policies, and the required org journeys have recorded evidence.

No Git operations or deployment are part of this documentation task. During implementation, report exact changed files to the owner; deployment remains targeted and owner-controlled.
