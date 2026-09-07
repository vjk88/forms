# Autofill rules: implementation design

**Status:** Proposed implementation design; application code is not changed by this document.  
**Source reviewed:** 2026-09-07, local Final Apex classes and Final LWCs. Existing behavior below is source-verified, not newly verified in the org.  
**Audience:** A junior developer implementing the feature in small, reviewable batches.  
**Scope:** Personalized-link Autofill and authenticated lookup-driven Autofill, including authoring, runtime, permissions, publishing, transfer, and tests.

## 1. What we are building

An author maps fields from a Salesforce source record to answers on a form. The source record comes from either an existing encrypted personalized link or a lookup selection made by a logged-in respondent.

Example: a Case intake form opens from a link associated with a Contact. The Contact's first name and email populate the form. A logged-in respondent selects an Account; its phone and website populate other answers. Submitting creates the form's configured output. Reading the Contact or Account does **not** authorize updating either source record.

| Term           | Meaning                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Source         | The Salesforce record supplying values, such as a Contact.                                                               |
| Destination    | A form element receiving a value. Identified by element ID, not by its bound Salesforce field name.                      |
| Mapping        | One source field paired with one destination element.                                                                    |
| Token          | The existing encrypted and authenticated `c__rt` URL value. It is not a Base64-encoded Contact ID.                       |
| Published spec | The immutable form configuration that the server authorizes a respondent to use.                                         |
| Ownership      | Runtime bookkeeping indicating that a value still belongs to an Autofill rule and has not been edited by the respondent. |

### Delivery boundaries

Both source types are required to complete this feature. Implement the basic authenticated lookup selector as a dependency; do not leave lookup Autofill connected to a text box containing a record ID.

For this first release:

- One personalized-link source object per form, with one enabled link rule containing multiple mappings.
- Multiple lookup rules, with at most one enabled rule per source lookup.
- Editable text, textarea, email, phone, and URL destinations. Numbers, dates, choices, checkboxes, reference destinations, repeaters, files, and compound fields are deferred.
- Default behavior preserves respondent edits. An explicit **Always replace when the source changes** option is available with the limitations in section 6.
- No source-to-source chains, expressions, relationship traversal such as `Account.Owner.Email`, or automatic inference of the current user's Contact.
- Basic non-polymorphic lookups for authenticated users. Dependent lookup filters, recent records, inline creation, and the broader custom-lookup Phase D remain separate work.
- Guest lookup search is excluded. A public form can use personalized-link Autofill and can additionally show an optional lookup to authenticated respondents.
- No paid-access changes, new crypto format, source-record writeback, or new business objects.

These boundaries narrow the mapping types, not the two requested user journeys.

## 2. Existing implementation to reuse

All code paths in this table are relative to `force-app/main/default/`.

| Existing file                                                            | What exists                                                                                                                                  | Required extension                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `classes/FinalSurveyTokenService.cls`                                    | AES256 encryption plus HMACSHA256; mint/resolve; form, record, object, issue/expiry time, optional invitation claims; protected key storage. | Reuse unchanged token protocol and keys. Claim validation belongs in the caller.                                                               |
| `classes/FinalStudioController.cls`                                      | `mintRecordLink`, `mintTrackedLink`, `invalidateLinks`; currently restricted to Surveys.                                                     | Accept eligible classic forms using their published link rule. Preserve existing survey behavior and method contracts.                         |
| `classes/FinalSurveyLinkInvocable.cls`                                   | Bulk Flow link action with per-request results, TTL, tracking, and single-use inputs; survey-only gate.                                      | Generalize supported forms without renaming its class, invocable method, or existing inputs. Update its description to explain eligible Forms. |
| `classes/FinalGuestController.cls`                                       | Published/public gating, `getGuestRecordContext`, token/invitation validation, public spec projection, submit token channel `meta.rt`.       | Resolve classic-form link sources; return a version-bound Autofill result; keep existing survey context working.                               |
| `classes/FinalGuestContextService.cls`                                   | Published-spec field allowlist and a system-context guest record read.                                                                       | Add the explicitly approved link mappings to the server-side read plan.                                                                        |
| `classes/FinalSurveyObjectController.cls`                                | Existing internal survey prefill and guest-opted mapping selection.                                                                          | Detect destination collisions with new Autofill rules. Do not replace existing survey mappings.                                                |
| `lwc/finalGuestHost/finalGuestHost.js`                                   | Reads `c__rt`/`rt`, loads guest spec/context, delegates submission.                                                                          | Guard token changes and stale context requests; pass version/session identity.                                                                 |
| `lwc/finalFormViewer/finalFormViewer.js`                                 | Answer state keyed by element ID, context prefill, visibility recomputation, preview reconciliation.                                         | Coordinate defaults, existing prefill, new rules, and async requests in one answer pipeline.                                                   |
| `lwc/finalFormViewer/previewSession.js`                                  | Preserves preview answers/session across builder edits.                                                                                      | Preserve/prune runtime Autofill state without saving it into the spec.                                                                         |
| `lwc/finalFieldPalette/`                                                 | Build rail includes an Autofill placeholder.                                                                                                 | Replace the placeholder with the rule editor.                                                                                                  |
| `lwc/finalElementRenderer/`                                              | Field rendering and `valuechange` events.                                                                                                    | Add basic lookup rendering and normal answer events.                                                                                           |
| `classes/FinalSpecController.cls`                                        | `publishSpec` creates the active published version.                                                                                          | Server-side Autofill validation and disclosure-change invalidation.                                                                            |
| `classes/FinalSpecTransferService.cls`, `FinalSpecTransferValidator.cls` | Import/clone structure rewriting and validation.                                                                                             | Remap Autofill element references and validate imported rules.                                                                                 |

Important gaps verified in the source:

1. `FinalStudioController.describeFields` filters for fields that are both readable and createable. It is a destination-field picker, not a suitable source-field picker. Add a separate read-only describe API.
2. `FinalGuestController.projectForGuest` removes `settings.prefill` and bindings. Do not reverse this stripping to implement Autofill.
3. `finalGuestHost` currently deduplicates loading by form ID alone. A different token for the same form must trigger a new context session.
4. The schema documents `defaultValue`, but a general default-seeding implementation was not found in the reviewed Final runtime. Implement static defaults explicitly; do not assume they run today.
5. A basic Final lookup component was not found. The older lookup/Autofill components are reference material, not the implementation target.
6. Existing invitation consumption is post-submit and best-effort. That is insufficient to promise atomic single-use enforcement for the new classic-form path; section 8 defines the required transaction behavior.

## 3. Persisted configuration

Use `settings.prefill.autofillRules`, the reserved Final schema location. Do not write legacy `formSettings.autofillRules` or `studioMeta.autofill`. This is additive within top-level `specVersion: 1`.

The following is a settings fragment, not a complete form. The destination/source element IDs must exist in the containing spec.

```json
{
  "settings": {
    "prefill": {
      "source": "sourceRecord",
      "rulesVersion": 1,
      "autofillRules": [
        {
          "id": "af_contact",
          "name": "Contact from personalized link",
          "enabled": true,
          "source": {
            "type": "link",
            "objectApiName": "Contact"
          },
          "policy": "preserveEdits",
          "mappings": [
            {
              "id": "afm_first_name",
              "from": "FirstName",
              "to": "el_first_name",
              "guestAllowed": true
            },
            {
              "id": "afm_email",
              "from": "Email",
              "to": "el_email",
              "guestAllowed": true
            }
          ]
        },
        {
          "id": "af_account",
          "name": "Selected account details",
          "enabled": true,
          "source": {
            "type": "lookup",
            "elementId": "el_account_lookup"
          },
          "policy": "preserveEdits",
          "mappings": [
            {
              "id": "afm_account_phone",
              "from": "Phone",
              "to": "el_account_phone",
              "guestAllowed": false
            },
            {
              "id": "afm_account_website",
              "from": "Website",
              "to": "el_account_website",
              "guestAllowed": false
            }
          ]
        }
      ]
    }
  }
}
```

### Contract rules

- `rulesVersion` must be `1` when new rules exist. An absent/empty rules array is a no-op. Unknown rule versions cannot publish; runtime skips them safely.
- `prefill.source` remains a legacy compatibility hint. New execution dispatches exclusively on each rule's `source.type`; it must not run a second legacy record fetch because this hint is set.
- IDs are stable while editing. Names are optional display labels. Mapping `from` is a direct field API name; `to` is an element ID.
- Lookup source object is inferred from the source element's Salesforce reference binding using Describe. Do not persist or trust a separately editable lookup object name.
- `guestAllowed` defaults to **false**. It applies only to link mappings. Reject `true` on lookup mappings. Unchecking it prevents anonymous disclosure; authenticated respondents can still receive permitted values through their own record access.
- Policies: `preserveEdits` or `alwaysReplace`. Missing policy means `preserveEdits`.
- Disabled rules do not fetch, claim destinations, or expose guest fields. Incomplete disabled rules may be saved in a draft. Enabled incomplete rules may also be saved for author recovery, but cannot publish. Publishing excludes disabled invalid rules from runtime plans.
- Do not persist tokens, selected test records, fetched values, errors, ownership, request IDs, or respondent answers here.
- Proposed guardrails: at most 20 enabled rules and 50 enabled mappings total per form; at most 50 distinct source fields in a read plan. Enforce identical limits in UI and Apex. Exceeding a limit is a diagnostic, never silent truncation.

### Type compatibility

| Source Describe type                        | Destination                          | Conversion                                              |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| String, TextArea                            | text or textarea                     | Preserve string; no silent truncation.                  |
| Email                                       | email, text, textarea                | Preserve string.                                        |
| Phone                                       | phone, text, textarea                | Preserve string.                                        |
| URL                                         | URL, text, textarea                  | Preserve string; existing URL validation still applies. |
| Readable formula returning one of the above | Corresponding compatible destination | Same conversion as its scalar return type.              |

Reject rich-text HTML, encrypted fields, references/IDs, compound fields, relationship paths, and other types for v1. A missing field due to access restrictions is **omitted**, not converted to null. A readable field with an actual null value is explicitly present as null. Existing destination length/format validation still runs; do not silently shorten data or turn invalid values into successful answers.

## 4. Author experience: Build > Autofill

Keep the existing live preview beside the builder. Replace the Autofill placeholder with `finalAutofillPanel`; `finalFormStudio` continues to own spec changes, undo/redo, dirty state, and save.

1. Empty state: **Fill answers from Salesforce records** with **Add rule**.
2. Choose **Personalized link** or **Lookup selection**.
3. Link: choose a readable source object. Lookup: choose an eligible lookup already on the form. If none exists, show **Add a lookup field first**, with navigation to Fields.
4. Add mapping rows: **Salesforce field → Form answer**. Filter to compatible destinations and explain unavailable fields. Default each guest disclosure checkbox to off.
5. Show **Preserve respondent edits** as the default. Advanced option: **Always replace when the source changes**; help text: “May replace an earlier answer. Edits made while loading are still kept.”
6. For link rules on public forms, show the disclosure choices together: **Allow anyone with this personalized link to receive these values**. Display the selected field labels before saving/publishing. Never auto-select all fields.
7. Rule list shows name, source, mapping count, enabled toggle, and actionable errors. Changing/deleting a source or destination leaves a visible repairable rule error; do not silently redirect mappings.
8. **Test in preview** selects an explicit record under the author's own access. Show a persistent **Test data** indicator and a **Clear test data** action. No guest token is minted just to preview.
9. **Create personalized link** is available for a published eligible form and uses existing link generation. Show expiry/tracked/single-use controls already supported by the backend. A draft rule must not generate a link against unpublished permissions.

All settings changes emit a spec patch through the existing Studio commit/history path. Do not mutate an `@api` spec in a child. Preserve unfinished mappings through save/reopen. Provide labels, keyboard navigation, inline errors, and focus on the first publish error. Do not add another configuration wizard.

The older program-spec suggestion to place this under Actions is superseded by **Build > Autofill** for this feature.

## 5. Basic lookup dependency and authenticated reads

### Lookup element

Add `finalLookup` as a thin wrapper around `lightning-record-picker`. Extend destination Describe metadata with the non-polymorphic `referenceTo` object and expose eligible reference fields in the palette. Store the ordinary field binding plus `config.inputType: "reference"`; existing `config.renderAs: "Default"` is sufficient. Treat the reference value as a Salesforce record ID in `answers[elementId]`.

- Support only bindings with exactly one reference target and a record-picker-supported target object.
- Renderer routes reference input to the wrapper. Wrapper emits the existing `{ elementId, value }` event with selected record ID or null. Preserve the established parent event contract.
- Bind the current answer back into the picker so preview restore, undo, and re-render retain selection.
- Surface picker validation through the existing form-validation path, including required fields, focus, clear, and errors.
- Validate reference ID type on submission using the existing binding/submit validation path; a browser-provided ID is not trusted merely because it came from a picker.
- For anonymous respondents, render an explanatory unavailable state for optional lookup fields and do not initialize the picker or query records. Reject publication of required lookup fields for an anonymous audience in this slice, including conditionally visible required lookups. Other destination answers remain manually editable.

The platform picker uses GraphQL and has object-support constraints, including its Name-field requirement. Do not advertise universal object support or fall back to a raw-ID text box. Test Contact, Account, and any intended custom object under the actual Experience Cloud license. [Salesforce record picker reference](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-record-picker).

### Record read plan

Add a renderless `finalAutofillRecordSource` LWC using LDS `getRecord`. Both internal users and authenticated customers read source values with **their own access**. The public host's `delegateSubmit` flag identifies a submission route, not the respondent's identity.

Use `@salesforce/user/isGuest` for client routing, with independent server identity checks for authenticated endpoints. A logged-in customer can still be using `finalGuestHost`; do not send their lookup reads through a system-context guest query.

Proposed authenticated API in new `FinalAutofillController`:

| Method                                         | Contract                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `describeSourceFields(formId, objectApiName)`  | Author-only. Verify authority to edit that form using the existing Studio authorization model. Return readable supported fields and labels, not only createable fields.               |
| `getLookupPlan(formId, versionId)`             | Authenticated respondent. Return eligible lookup element metadata and rules from the exact authorized published version. No business record query.                                    |
| `resolveLinkForUser(formId, versionId, token)` | Authenticated respondent. Validate the existing token and form/version eligibility; return its source record ID plus a permitted read plan. Values are subsequently read through LDS. |

For internal published forms, verify form/version access in USER_MODE. For an authenticated customer opening a public form, apply the public availability gate and allow only that form's active published version; do not require customer access to authoring objects and do not expose draft metadata. Isolate that narrow system-context metadata load in the existing public service boundary. Every authenticated endpoint rejects a guest caller regardless of client flags. Author preview instead uses the author's draft configuration and readable Describe metadata; it cannot authorize a guest fetch.

Authenticated plans may contain object/field API names needed by LDS, but only for validated mappings/source lookups, filtered to readable metadata. Do not return the full unprojected authoring spec. Anonymous responses continue to omit those names and raw source record IDs.

Use this plan shape for `getLookupPlan`; `resolveLinkForUser` returns the same rule shape with a validated `recordId` instead of a lookup `sourceElementId`. Metadata lookup and source-record reads remain separate:

```json
{
  "versionId": "published-version-id",
  "lookups": [{ "elementId": "el_account_lookup", "objectApiName": "Account" }],
  "rules": [
    {
      "ruleId": "af_account",
      "sourceElementId": "el_account_lookup",
      "objectApiName": "Account",
      "policy": "preserveEdits",
      "mappings": [
        { "from": "Phone", "to": "el_account_phone" },
        { "from": "Website", "to": "el_account_website" }
      ]
    }
  ]
}
```

Include all eligible source lookup descriptors needed to render the authenticated form, even if a lookup has no Autofill rule. On plan failure, do not leave a required authenticated lookup silently absent: show a loading/error state with retry, and prevent submission until the field can render or normal validation can report its failure.

Use `getRecord` with the object ID field as the required field and compatible mapped fields as `optionalFields`, so unavailable optional fields are omitted rather than failing every mapping. Extract scalar `value`, preserving null versus omission. UI API object support and polymorphic restrictions still apply. [Salesforce getRecord reference](https://developer.salesforce.com/docs/platform/lwc/guide/reference-wire-adapters-record).

Create a new keyed source-reader instance for each rule request generation. Its response must echo the captured rule ID, source record ID, generation, and session ID; a late wire callback must not acquire a newer request's identity. Discard obsolete instances/results. Deduplicate simultaneous reads for the same object/record/field set within a session where practical; correctness must not depend on caching.

## 6. Answer application and async behavior

Add a pure `autofillEngine.js` module under `finalFormViewer`. It decides patches; it does not query Salesforce, manipulate DOM, or submit records.

Runtime state per session:

```text
sessionId, specVersionId, rulesFingerprint
editRevision[elementId], touched[elementId]
owner[elementId] = { ruleId, sourceKey, lastAppliedValue }
request[ruleId] = { generation, sourceKey, startedRevisions, status }
```

`sourceKey` is runtime-only. Never put a token in logs or persisted state. Compare raw tokens only in memory when detecting a changed link session.

### Initialization order

1. Restore an existing preview session when applicable; prune removed or incompatible elements/rules.
2. Seed static `defaultValue` only for answers absent from restored state. Treat `false`, zero, and empty strings as explicit defaults when authored. Validate defaults using the destination type.
3. Apply existing survey context and new link results through the same guarded answer-patch mechanism. Publish validation prevents them from owning the same destination.
4. Execute lookup rules when a restored or user-selected source ID becomes available. Do not depend on a DOM change event to start a restored selection.

Static defaults win initial link Autofill, including `alwaysReplace`; this follows the documented schema precedence. Dynamic legacy `{ "fromSource": "Contact.Email" }` defaults are not implemented by this work: diagnose them and require an explicit Autofill mapping. Do not silently treat the object as a field value.

### Default `preserveEdits` policy

| Situation                                                            | Required result                                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| First fetch; destination absent, untouched, without explicit default | Apply available mapped value. Record ownership.                                                                       |
| Respondent already entered or cleared destination                    | Preserve it, including a deliberately cleared blank.                                                                  |
| Same rule supplied the value; respondent has not edited it           | Refresh when the source changes.                                                                                      |
| Respondent edits a populated value, even back to the same text       | Increment edit revision, mark touched, remove rule ownership.                                                         |
| Source lookup is cleared                                             | Clear only values still owned by that lookup rule. Keep manual edits and defaults.                                    |
| Source changes from A to B                                           | Immediately clear untouched A-owned values, then fetch B. Do not display A's phone under B's selection while loading. |
| Readable source field is null                                        | Clear that rule's untouched owned value; otherwise leave unrelated/manual/default answers intact.                     |
| Field omitted because unreadable                                     | Do not apply it; display an author/test diagnostic. Do not expose API names in respondent errors.                     |
| Record fetch fails or times out                                      | Keep manual/default answers. Previously cleared values from A remain cleared. Offer retry/manual entry.               |

Every manual edit increments a revision, even if the value does not change. Every request snapshots destination revisions. A result can apply only if the session, version, rule fingerprint, generation, and source ID still match, and the destination has not been edited since the request started.

### `alwaysReplace` policy

On a successful source change, replace compatible destination values that existed **before** the request started, including earlier manual values. Continue preserving edits made while that request was pending. Preserve explicit static defaults on the initial link load. Clearing a source and fetch failure never clear manually owned values; only untouched rule-owned values are cleared. The option does not mean “lock this answer forever.”

### Applying a result

Compute one patch for all eligible mappings, then update `answers` once. Reuse the page/reveal anchor behavior in `handleValueChange`: recompute visibility, retain the same visible page if possible, otherwise clamp to a valid page. Do not fire synthetic DOM changes or trigger Autofill from Autofill destination patches. Reference destinations are forbidden, so chains cannot arise.

Conceptual request handler:

```text
onSourceChanged(rule, recordId):
  invalidate previous generation for rule
  clear untouched values owned by the previous source
  if recordId is empty: finish
  capture session/version/fingerprint/generation and edit revisions
  start read with that immutable request identity

onResult(identity, fields):
  if identity is no longer current: discard
  compute policy-compatible patch, excluding edits made after request start
  apply patch and visibility update atomically
  mark request complete
```

Hide/show does not grant or remove data access. Hidden answers retain the runtime's existing lifecycle; Autofill must not invent a second clearing policy. A newly visible destination displays its current answer. Do not wait for a hidden field to mount before applying a value.

While Autofill is pending, keep field editing and page navigation available. Disable Submit with **Finishing Autofill…** until the current fetch settles. Use a 10-second per-request timeout, invalidate its generation, restore submission, and show **Could not fill these details. Enter them yourself or retry.** All v1 destinations are editable; existing required/format validation remains the final gate. A late timed-out result cannot overwrite subsequent answers.

## 7. Guest personalized-link reads

### Reuse the token

Continue using `FinalSurveyTokenService`. Its existing wire format is two Base64URL segments and its payload already carries the form, record, object, issue/expiry time, and optional invitation. Existing five- and six-part payloads must continue resolving. No new URL encoder, token object, key store, or client-side decoder is needed.

Generalize source selection:

- Classic form: the active published enabled link rule supplies its source object. This can differ from the form's submission target, e.g. Contact source and Case destination.
- Connected survey: retain its existing primary context object. An additional link Autofill rule must use that same object in v1, because one token supplies one source record.
- Existing surveys without new rules retain their existing path.

### Server read contract

Add non-cacheable, imperative `getGuestRuntimeSpec(formId)` returning `{ versionId, spec }`, using the same projection and availability helpers as `getGuestSpec`. For a closed form return the existing safe closed message and no form structure. Keep `getGuestSpec`'s old string contract for existing callers. The new host reads the envelope's version ID; do not expect it to already exist in the current projected spec. A version-change reload calls this new method afresh rather than accepting a stale cache entry.

Keep `getGuestRecordContext(formId, token)` for old callers. Add a version-aware method, `getGuestAutofillContext(formId, versionId, token)`, in `FinalGuestController`, backed by shared validation/query helpers. Return this shape for the new path:

```json
{
  "versionId": "published-version-id",
  "status": "applied",
  "prefill": { "existing-survey-element-id": "Existing value" },
  "ruleFacts": {},
  "autofill": [
    {
      "ruleId": "af_contact",
      "values": { "el_first_name": "Avery", "el_email": "avery@example.test" }
    }
  ]
}
```

`prefill` retains its existing survey meaning; new rule values live under `autofill`, so ownership is unambiguous. Supported statuses: `applied`, `empty`, `unavailable`, `versionChanged`. Invalid, expired, revoked, wrong-record-type, and missing-record contexts all return `unavailable` with no values and no distinguishing record detail. A missing token returns `empty`. The form itself still renders when eligible.

This context method must also be non-cacheable and called imperatively. Do not serve previously cached personal values after revocation/expiry, or cache tokens/results in browser storage. This cannot erase values a respondent already received; revocation prevents subsequent authorized fetches and applicable tracked submissions.

Before a system-context read:

1. Apply all existing public-form gates, including published/active version, adapter, and availability rules.
2. Require `versionId` to equal the form's current active published version. Re-read/verify this identity as needed before returning a result; never use a client-supplied spec.
3. Validate token crypto, form ID, expiry, invalidation cutoff, actual ID object type, and agreement with the configured source object and claim object. Validate invitation form/record/object, expiry, revocation, and single-use state when present.
4. Build the query exclusively from enabled published link mappings with `guestAllowed: true`, plus the existing authorized survey context needs. Validate names/types via Describe; bind the record ID. Neither field lists nor source IDs come from client request parameters.
5. Execute at most one source-record query for this union. Return only destination values and existing safe rule facts. Do not return the raw record, source ID, binding metadata, query text, or field-access diagnostics.

The guest query intentionally runs in system context after token authorization. That is different from authenticated LDS access. The author must have read access to configure disclosed fields; the published guest opt-in is the disclosure authority. Client-provided `guestAllowed` cannot authorize a request.

### Public projection and host

Leave `settings.prefill` stripped. Add only a sanitized runtime descriptor, e.g. `runtime.autofill`, containing enabled guest rule IDs, destination IDs, and policies. Never include source object/field API names. Authenticated plans are fetched separately after identity checks; optional guest lookup placeholders need only safe display metadata.

Change `finalGuestHost` to begin a fresh load generation when form ID or token changes, clearing injected context, pending work, and previous answers. Incorporate the loaded published version into session identity. Capture this identity before each fetch; stale results cannot replace current `recordContext`. `versionChanged` reloads the spec once with a user-visible refresh state; prevent an infinite republish/reload loop.

Carry the served version as `meta.specVersionId` through submission metadata. When the server-loaded active spec enables new Autofill rules, require this field and compare it to the authorized active version; a missing value cannot bypass the check. On mismatch reject with **This form changed. Reload it before submitting.** Do not reinterpret old element answers against a newly published spec. Older forms without new Autofill rules retain their existing behavior until upgraded deliberately.

### Published disclosure changes

Existing tokens are form-bound, not version-bound. A previously issued link must not silently gain access to newly approved guest fields after a republish.

At publish, compare the old and new effective guest-disclosure contracts: source object and enabled guest mapping tuples (source field, destination ID), including existing survey guest-prefill providers. Any change invalidates earlier links using existing `Links_Invalidated_On__c`. Do this server-side in the same transaction as activating the version. Do not invalidate for unrelated styling, labels, or authenticated-only lookup edits. Removing mappings also invalidates conservatively.

The publish UI must state **This changes the information shared by personalized links. Existing links will stop autofilling; generate new links after publishing.** If tracked links are present, explain that existing tracked submissions will also be rejected. This is part of reviewing a publish operation, not a client-only enforcement switch. Keep unchanged legacy survey token behavior intact.

## 8. Link generation, Flow, and submission

Move shared link eligibility/source-object resolution into a new non-exposed `FinalAutofillService` helper, used by Studio minting, invalidation, and the existing Flow invocable. Do not merely delete the survey-only `if` checks.

- Resolve the active published source contract for new classic forms; reject missing/disabled/invalid link rules.
- Verify the minter's form access and source-record access using existing USER_MODE/UserRecordAccess protections. Verify read access to the fields the published link will disclose as well; record access alone is insufficient.
- Preserve TTL handling, per-request Flow errors, tracking, and single-use inputs. Keep the invocable bulk-safe: group describes/forms/access checks rather than querying per request.
- Return the existing query parameters `c__formId` and `c__rt`. Reuse the existing host URL composition; no hardcoded Salesforce domain.
- Reuse `Survey_Invitation__c` and `FinalSurveyInvitationService` for optional tracking; their names need not change. Check actual metadata validation/permissions for classic-form eligibility during implementation and adjust narrowly if required.
- Explain in author help that an untracked link is reusable until expiry or form-wide invalidation. Possession of a guest link grants its explicitly published disclosure; encoding does not identify who is holding it.

### Submission boundary

Autofilled answers remain ordinary respondent answers subject to normal validation. Never treat them as verified identity or immutable source data. The source record ID must not become a classic form's update target, binding override, or arbitrary field assignment. Preserve guest create-only behavior and existing survey response-link behavior.

Continue sending the token through `meta.rt`. For a new classic-form tracked link, validate it again on submit. Within one transaction/savepoint, lock its invitation row with `FOR UPDATE`, recheck validity/single-use state, perform normal submission, and mark it responded. Roll back the business submission if the required invitation state update fails. Event publication may remain best-effort; consumption may not. Two concurrent single-use submissions must produce one successful save.

Do not consume a link during spec load, prefill, preview, or a failed submission. Email scanners opening links must not burn invitations. A valid stateless link that expires before submission can fall back to ordinary manual submission under the existing tokenless/public-form rules; a cryptographically recognizable tracked link that fails invitation validation is refused. Tampered/unresolvable tokens disclose no data and cannot establish an invitation identity.

**Important:** single-use applies to that invitation, not to all submissions to a public form. Removing a token can still access a form that allows ordinary public submissions. Invitation-only form access is a separate product feature and must not be implied here.

Implement the new classic-form transactional path without silently changing unrelated survey submission semantics. If factoring shared consumption hardens surveys too, explicitly include survey concurrency and failure regression tests in that batch.

## 9. Validation and configuration lifecycle

Add `FinalAutofillValidator`, returning stable diagnostics such as:

```text
{ code: "AUTOFILL_DESTINATION_CONFLICT", ruleId, mappingId, message }
```

Run equivalent fast checks in the editor, but Apex is authoritative. Invoke validation from publish and import/transfer paths, including publish calls made outside Studio. Validate against the server's form identity/type and current Describe, not a client-claimed form type.

Reject enabled rules when:

- Source/destination element is missing, repeated, incompatible, read-only, or a content block.
- Link source object or field does not exist, is unsupported, or the author cannot read it.
- Lookup source is not a supported single-target reference field, or is inside a repeater.
- Multiple enabled providers target the same element, including an existing survey mapping with a read/prefill direction. Do not choose whichever finishes first.
- Multiple link rules/source objects, duplicate lookup source rules, invalid types/policies, relationship paths, invalid guest flags, or limits are present.
- An anonymous audience has a required lookup that cannot be filled in this release.
- A connected survey's link source differs from its primary context object.

Lifecycle requirements:

| Operation                 | Behavior                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save draft                | Preserve unfinished authoring; return diagnostics without silently deleting mappings.                                                                                                         |
| Publish                   | Block enabled invalid rules; compile audience-safe plans and disclosure comparison.                                                                                                           |
| Delete/change bound field | Show affected rule errors; allow author to repair/remove/disable before publication.                                                                                                          |
| Clone/import              | Remap `source.elementId` and every mapping `to` using the same element-ID map as structure cloning. Generate fresh rule/mapping IDs for cloned/imported copies. Never transfer runtime state. |
| Export                    | Export configuration only; never tokens, selected test records, or fetched data.                                                                                                              |
| Restore a version         | Restore rules with that version's element IDs; revalidate before it becomes active.                                                                                                           |
| Preview spec edit         | Preserve compatible manual answers and ownership; invalidate changed rule requests; prune removed references. Never reapply a late result from the old rule.                                  |
| Remove/disable a rule     | Cancel its requests and drop its ownership metadata; keep current answers until explicit preview reset or normal answer reconciliation.                                                       |
| Reset preview             | Clear source selections, test record, answers, ownership, touched flags, and pending requests; re-seed defaults.                                                                              |

Rule fingerprints include enabled status, source, mappings, and policy. Labels alone need not reset requests. Preview runtime state may live in `exportPreviewSession`/`importPreviewSession`, but never in design JSON, undo history, local storage, or exported files. When a restored record cannot be read, retain manual answers and expose a test diagnostic.

## 10. Implementation batches and file ownership

Names marked **new** are proposed files, not existing components. Create Apex/LWC metadata companions for new bundles/classes. Use the project's existing API version and formatting conventions.

| Batch                                | Files/modules                                                                                                                                                                                   | Deliverable and completion check                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Contracts and pure behavior       | **new** `lwc/finalFormViewer/autofillEngine.js` and tests; `FORM_SPEC_SCHEMA.md`                                                                                                                | Types, validation parity helpers, ownership/patch engine. Unit tests cover all section 6 transitions before UI wiring.                                                         |
| 2. Server validation and lifecycle   | **new** `classes/FinalAutofillValidator.cls`, `FinalAutofillService.cls` and tests; `FinalSpecController`, `FinalSpecTransferValidator`, `FinalSpecTransferService`                             | Publish rejects invalid rules, clone remaps references, disclosure changes invalidate old links atomically. Existing no-rule forms still publish.                              |
| 3. Link authorization and guest read | `FinalStudioController`, `FinalSurveyLinkInvocable`, `FinalGuestController`, `FinalGuestContextService`; related token/invitation tests                                                         | Classic forms reuse encrypted links and version-safe guest mapping reads. Implement tracked-submit transaction and run survey regressions. Token wire format stays compatible. |
| 4. Authenticated source and lookup   | **new** `classes/FinalAutofillController.cls`, `lwc/finalAutofillRecordSource/`, `lwc/finalLookup/`; `FinalStudioController` reference metadata; `finalElementRenderer`, palette field creation | Real lookup selection and LDS reads work for internal users and customers; anonymous clients cannot invoke authenticated endpoints.                                            |
| 5. Runtime integration               | `finalFormViewer.js/.html`, `previewSession.js`, `finalGuestHost.js/.html`; existing validation adapters as needed                                                                              | Defaults, context, bulk patches, visibility, pending submission, token/version changes, and preview state follow sections 6–7.                                                 |
| 6. Authoring                         | **new** `lwc/finalAutofillPanel/`; `finalFieldPalette`, `finalFormStudio`, existing personalized-link surface                                                                                   | Build > Autofill creates/edits/tests both sources; existing commit/undo/save flow is preserved. Accessible diagnostics and guest disclosure review are present.                |
| 7. Permissions and verification      | Existing author/runtime permission sets, targeted test classes, docs                                                                                                                            | Grant only necessary new Apex entry-point access; verify actual internal/customer/guest journeys. Update status docs only after implementation evidence exists.                |

Do not expose service/validator classes as Aura endpoints. Existing `Form_Builder_Admin.permissionset-meta.xml` is an author permission-set integration point. Authenticated respondent and site guest access must be configured for their respective entry points without granting broad Contact/Account access or access to protected token keys. LDS requires the respondent's actual object/field/record permissions; this feature does not manufacture those permissions.

Before editing, inspect nearby tests and actual helper signatures. Proposed method contracts above describe required behavior; keep existing APIs backward-compatible and adapt shared helpers to the codebase. No Git actions or deployment are part of creating this design. During implementation, the owner commits and deploys; provide a precise changed-file list and validation results.

## 11. Test plan

### Pure engine / LWC Jest

- First link fill, static default precedence, restored preview precedence, and no-rule no-op.
- Manual edits before/during fetch, deliberately cleared blanks, same-text edits, null versus omitted fields, and no silent truncation.
- A → B requests completed B → A; source cleared mid-request; token changed on the same form; rule removed/disabled while loading; timeout followed by late success.
- `alwaysReplace` replaces earlier edits but preserves edits during loading; source clear/failure does not erase manual values.
- One atomic patch causes correct conditional visibility and keeps/clamps the current page anchor.
- Restored lookup selection triggers its rule; destination updates never trigger a chain.
- Guest projection contains no source APIs/IDs; authenticated public-host user routes to LDS; anonymous user initializes no picker.
- Picker selection/clear/required-validation/focus and preview hydration behave through the normal valuechange pipeline.
- Submit pending status and timeout release; version-change submission response; retry does not duplicate unrelated reads.
- Undo/redo, save/reopen, clone/remap, and preview reset preserve the specified configuration/runtime separation.

### Apex tests

- Existing five-/six-part tokens and existing survey links continue working.
- Valid Contact token on a Case form; wrong form, wrong object, payload object disagreement, tampering, expiry, invalidation, revoked/expired/used invitation, and deleted record.
- Guest reads only active published opted-in fields. Client-supplied extra fields, destination IDs, rule configuration, or draft version IDs cannot expand disclosure.
- Public availability gates apply to both metadata and context endpoints. Authenticated APIs reject anonymous callers. Customer published metadata route cannot read drafts.
- Author readable-but-not-createable fields are selectable sources; inaccessible fields/records fail safely. Actual LDS FLS behavior also requires org verification.
- Republish with disclosure changes invalidates old links; style-only republish does not. Context/submission against a different active version fails safely.
- Conflicting destination providers, missing elements, unsupported types, repeated sources, required guest lookup, and limits fail server publication.
- Flow mixed valid/invalid requests remain bulk-safe and preserve output ordering and old input contracts.
- Single-use invitation: successful classic submission marks used; failed submission leaves unused; state-update failure rolls back submission; event failure does not roll back successful required state changes.
- Classic submission does not update the Contact/Account used as its Autofill source. Existing survey response stamping remains correct.
- Transfer rewrites source/destination element references; disabled incomplete rules remain editable and cannot grant guest access.

### Manual org acceptance matrix

| Actor/scenario                      | Expected evidence                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anonymous, valid Contact link       | Approved values appear; network response has only safe destination values; manual edits survive; Case submit succeeds without changing Contact.        |
| Anonymous, no/invalid/expired token | Form renders with defaults/manual entry and no record disclosure; generic context message if needed. Recognizable invalid tracked token cannot submit. |
| Internal user, lookup               | Real record picker populates mapped fields; changing/clearing selection follows ownership policy.                                                      |
| Logged-in Experience Cloud customer | Lookup uses that customer's access, including when hosted by `finalGuestHost`; another customer's record cannot be read.                               |
| Slow network                        | Edit a destination while fetching, select A then B, navigate pages, and retry after timeout; no stale overwrite.                                       |
| Concurrent single-use submits       | Two real overlapping requests result in one saved submission for that invitation. Unit tests alone do not prove concurrency.                           |
| Republish while filling             | No old context enters a new spec; stale-version submission asks for reload. Disclosure change prevents old links fetching newly shared fields.         |
| Studio live preview                 | Explicit test record, visible test-data indicator, visibility updates, undo/reopen/reset, and no test values in saved/exported spec.                   |
| Keyboard/mobile                     | Mapping editor and lookup are usable; loading/error messages and focus behavior are accessible.                                                        |

Use existing Account/Contact/Case test fixtures and isolated Apex test data. Do not add production business objects solely for tests. Run focused Jest/Apex suites and existing relevant survey, guest, publish/transfer, and preview regression suites. Report which checks were local, org-executed, or still unverified. The owner handles deployment and final org acceptance.

## 12. Definition of done

The feature is complete when an author can configure, publish, generate a link for, and test a Contact-based classic form; an anonymous respondent receives only approved mapped values; and internal/customer respondents can select a lookup to populate other answers through their own permissions. Both flows must preserve edits, handle stale requests, respect visibility, survive save/clone/import, and submit through existing form validation without writing to source records.

Required handoff: changed files, configuration/schema examples, targeted test results, permission/setup steps, known platform lookup limitations, and org acceptance results or an explicit remaining verification list. Do not mark this document's proposed behavior as implemented until those changes exist.

## References

- [Guest Delivery / Prefill / Lookup program](./GUEST_PREFILL_LOOKUP_SPEC.md): program context; this document supplies the two-source implementation plan and updates the authoring placement for this feature.
- [Final form schema](./FORM_SPEC_SCHEMA.md): additive settings location, element IDs, defaults, and published snapshots.
- [Runtime notes](./RUNTIME_NOTES.md): authenticated LDS reads and guarded guest authorization.
- [Pending work](./PENDING_WORK.md): project status; this design does not close its implementation items.
- [Legacy element properties, section 15b](../redesign/ELEMENT_PROPERTIES_SPEC.md): historical Autofill ideas only; do not copy its storage or raw guest record-ID authorization.
