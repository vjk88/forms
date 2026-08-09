# Studio Actions — implementation plan

**Status:** approved; implementation in progress. Deployment remains a separate,
explicit step after the slice gates pass.

**Review pass (2026-08-09):** tightenings layered in from a code-verified
review — per-slice PRs, clone-spec treated as untrusted, export-download and
shared-asset coupling risks named, import validator called out as the
security-sensitive surface, and two owner-facing scope decisions added (topic
creation, permission-set/security). Load-bearing schema claims were verified
against the repo: `Form_Response__c.Form_Version__c` is a **required lookup with
`deleteConstraint=Restrict`** (the delete-block is real, not assumed), and **no
permission set currently grants `Survey_Invitation__c`** (only the Admin
profile does).

**Implementation progress (2026-08-08):** Slices 1 and 2 are complete on
`codex/studio-actions-slice-1`: the transfer/clone server core, editable-only
Clone action, focused dialog, live-spec handoff, shared Studio navigation, and
shared-file-safe image removal. The final targeted deployment dry-run compiled
all 16 included metadata components and passed all 28 focused Apex tests with
no coverage warnings. Four focused Jest suites pass all 49 tests, targeted
ESLint is clean, and the UI/UX review findings are resolved. Code Analyzer
reports 0 critical/high findings (49 moderate, 33 low across the combined
Slice 1+2 Apex set). No metadata has been deployed to the org.
The remaining Slice 2 rollout gate is the post-deploy Form/Survey smoke test in
both Lightning Experience and the Visualforce host.

**Scope:** the Studio top-bar Actions menu:

- Clone form
- Export form
- Import form
- Delete form

This plan is based on the current FinalDesign implementation and metadata, not
the retired legacy builder.

## 1. What the app stores today

Forms and Surveys use the same authoring backbone:

```text
Form__c
  └─ Form_Version__c (master-detail)
       └─ Spec_JSON__c — complete authoring or published specification
```

`Form__c.Form_Type__c` stores `Form` or `Survey`. The specification repeats the
runtime form type as `spec.form.type = "form" | "survey"`; both values must
agree when a record is cloned or imported.

The working draft is not a separate object. It is the one inactive
`Form_Version__c` numbered above the active version. Older inactive versions are
history. The active published version contains `resolved.tokens`; the Studio
removes `resolved` when a version re-enters authoring.

### Form submission storage

A Form uses the specification's bindings to create or update records on its
configured Salesforce object. Those business records are not children of
`Form__c` and must never be cloned, exported, imported, archived, or deleted by
Studio Actions.

### Survey submission storage

A Survey writes an application-owned response graph:

```text
Form_Version__c
  └─ Form_Response__c (required lookup, delete restricted)
       └─ Form_Response_Answer__c (master-detail)
            └─ Form_Answer_Topic__c (master-detail)
```

The restricted response-to-version lookup intentionally prevents a version—and
therefore its parent form—from being deleted while survey responses exist.

### Other related records

- `Survey_Invitation__c` is a lookup to `Form__c`; it does not belong in a
  clone/export/import and must be handled explicitly during archive/delete.
- Config images are Salesforce Files linked to `Form__c`. Their
  `ContentVersion` IDs and URLs can also appear inside the spec.
- Custom themes are shared `Theme_Definition__c` records. A custom theme ID in
  `spec.theme.name` is org-specific.
- Survey topic IDs are org-specific, but topic names are already snapshotted in
  the spec and can be resolved by name during import.
- `Form_Page__c`, `Form_Section__c`, and `Form_Element__c` are legacy-only for
  FinalDesign-created forms. The action service must not start writing them.

## 2. Recommended product semantics

### Clone form

Clone the **current authoring state**, including unsaved in-memory changes, into
a new `Form__c` with one v1 source version.

The clone:

- gets the default name `<source name> — Copy`, editable before confirmation;
- keeps Form versus Survey type, target object, layout, questions, mappings,
  rules, availability, completion settings, and design;
- mints a fresh form ID plus fresh `pg_`, `sec_`, and `el_` IDs;
- rewrites every ID reference in visibility and validation rules;
- removes `resolved`, publish dates, version history, responses, invitations,
  public access, link invalidation timestamps, and collected analytics;
- starts as `Status__c = Draft`, guest access off, with one editable v1 version;
- reuses the existing custom theme and linked config files inside the same org
  for the first release; it does not duplicate their bytes. **Known v1
  limitation:** because the clone points at the source's `ContentVersion` bytes,
  editing or deleting the source's config image can alter or break the clone's
  reference. Slice 2 must therefore make image removal shared-file safe: remove
  only the calling form's `ContentDocumentLink` while other links exist, and
  delete the `ContentDocument` only when that form is its sole remaining link.
  Byte-level asset independence is part of the separate ZIP follow-up.

After success, navigate directly to the new Studio URL. The source stays open
and unchanged if any part of the clone transaction fails.

### Export form

Export the **current authoring state**, not every historical version and never
responses or invitations. Download a UTF-8 file named
`<safe-name>.finalform.json`.

**Host risk:** triggering a file download from inside the Visualforce +
Lightning Out Studio host is the same class of iframe wart as clipboard access
(already a known limitation on record links). Prove the download in _both_ hosts
early in Slice 3; if the VF host blocks it, fall back to a copyable text area
rather than a silently failing download button.

The v1 package envelope:

```json
{
  "kind": "final-form-package",
  "packageVersion": 1,
  "exportedAt": "ISO-8601",
  "metadata": {
    "name": "Event Feedback",
    "type": "survey",
    "description": ""
  },
  "spec": {},
  "dependencies": {
    "customTheme": null,
    "assets": [],
    "topics": []
  }
}
```

Before download:

- remove `spec.form.id` and `resolved`;
- keep structural IDs because they preserve rule references inside the package;
- include custom-theme name, base theme, and property JSON when used;
- include survey topic names; treat IDs as non-portable hints only;
- list config assets in a manifest, but do not embed binary images in v1.

If the form uses Salesforce-hosted images, the export dialog must say that v1
exports configuration and asset references, not image bytes. Same-org imports
can reuse visible assets. Cross-org import must clear inaccessible asset
references and report them as warnings instead of persisting broken URLs.

Full ZIP-with-assets portability is a separate follow-up because current images
may be 5 MB each and cannot safely be round-tripped through one Aura payload or
Apex heap.

### Import form

Import always **creates a new Form or Survey**. It never overwrites the form
currently open in Studio.

Flow:

1. Choose one `.finalform.json` file.
2. Parse it client-side for immediate format/size feedback.
3. Send the raw package to a server-side inspection method.
4. Show name, type, page/question counts, connected object, theme, and all
   warnings/errors.
5. Let the user edit the new name.
6. Create only after explicit confirmation.
7. Navigate to the new Studio record.

Server-side import must revalidate everything; client validation is only UX.
Validation includes:

- package kind/version and `specVersion`;
- JSON object shape and `Spec_JSON__c` length;
- agreement between package type and `spec.form.type`;
- supported layout, element, rule, and settings vocabulary;
- unique page/section/element IDs before remapping;
- target object existence and running-user access;
- mapped field existence and compatible field type;
- rule references resolving to imported elements;
- repeater object/relationship validity;
- custom theme definition validity;
- survey topics resolved or created by name, never trusted by foreign ID.

**Side effect to disclose:** resolving topics "by name, create if missing" means
an import can spawn org-wide topic vocabulary records. An import must not
silently mutate shared org data — the inspection summary must list which topics
will be created, and this is an explicit owner decision (see §8).

A Form with a missing target object or invalid required binding is a blocking
error. A Survey may import disconnected only after the preview explicitly
reports which mappings and record rules will be removed.

Import then uses the same fresh-ID and create transaction as Clone. It starts
Draft and private; publish history, public access, responses, invitation tokens,
and source-org record IDs never cross the boundary.

### Delete form

The menu keeps the requested label **Delete form**, but it starts with a server
preflight summary:

- version count;
- Survey response count;
- tracked invitation count;
- config-file count;
- whether hard deletion is allowed.

Recommended retention behavior:

- **With Survey responses:** hard delete is blocked. The dialog offers
  **Archive form** instead. Archiving preserves every version/response for
  reporting, sets `Status__c = Archived`, removes `Public_Guest`, invalidates
  existing record links, and exits Studio.
- **Without Survey responses:** allow deletion after the user types the exact
  form name. Delete tracked invitations, clean legacy structure rows if any,
  then delete the `Form__c` root so versions cascade. Delete a linked config
  file only when that `ContentDocument` has no links outside this form;
  otherwise remove only this form's link.
- **Classic Forms:** never delete business records created or updated through
  the Form. The confirmation must state that only the form configuration is
  removed.

Response purge is deliberately not a Studio action. If regulations require it,
build a separate admin-only retention workflow with audit logging.

Archived records need a matching library and Studio posture: hide them from the
default Forms list, add an Archived filter, and provide Restore. A stale or
bookmarked Studio URL must not reopen an archived record for editing; the load
returns an archived/read-only result and directs the user to Restore. Restore
always returns the record to **Draft** in v1 and does not automatically
re-enable public access. Republishing is an explicit owner action; an active
version alone cannot recover the former status because newly created Drafts
also start with an active v1 version.

## 3. Shared transfer rules

Clone and Import must call one server-owned transformation pipeline. Do not
implement one remapper in JavaScript and another in Apex.

Clone's in-memory spec is client-supplied and therefore **as untrusted as an
import package**. `cloneForm` must run the same server-side validation as
`importForm` (ID uniqueness, layout/element/rule vocabulary, target-object and
mapped-field describe checks, `Spec_JSON__c` size bound) before it persists. Do
not treat "it came from our own builder" as trusted input.

### Fresh ID map

Build maps for every page, section, and element before changing references.
Then rewrite:

- `page.id`, `section.id`, and `element.id`;
- `visibility.rules[].source` on pages, sections, and elements;
- `validation[].when.rules[].source`;
- `validation[].compareTo` where present;
- any future schema-declared ID reference through an explicit allowlist.

Record-field rule sources such as `record:Industry` and Salesforce field API
names are not structural IDs and must not be rewritten.

Finally set the new `spec.form.id` and name, and strip all `resolved` artifacts.
Tests must fail when a new schema reference is introduced without a remap rule.

### Root-record defaults

Every Clone/Import root starts with:

- correct `Form_Type__c` and matching `spec.form.type`;
- `Status__c = Draft`;
- `Allowed_Adapters__c` without `Public_Guest`;
- null `Published_Date__c` and `Links_Invalidated_On__c`;
- connected object copied/imported only after describe validation;
- one `Form_Version__c`, version 1, containing the unresolved authoring spec.

## 4. Proposed architecture

### Apex

Add:

- `FinalFormActionsController` — thin `@AuraEnabled` entry points, `with
sharing`, sanitized `AuraHandledException` messages.
- `FinalFormActionsService` — transaction orchestration for clone/import,
  archive, and zero-response delete.
- `FinalFormActionsSelector` — bounded USER_MODE queries for roots, versions,
  response counts, invitations, legacy rows, and linked files.
- `FinalSpecTransferService` — pure package validation, dependency
  normalization, fresh-ID remapping, and authoring-spec cleanup.
- `FinalSpecTransferValidator` and `FinalSpecDescribeValidator` — the split
  **security-sensitive surface** behind the transfer service. The first owns
  schema vocabulary and reference integrity; the second owns object/field/
  relationship describes and never constructs dynamic SOQL. Enforce the
  `Spec_JSON__c` size bound before work and give these paths the most
  adversarial Apex coverage in the program (malformed, oversized,
  injection-shaped field names, dangling references).

Recommended controller methods:

```text
getActionSummary(formId)
cloneForm(formId, currentSpecJson, requestedName)
inspectImport(packageJson)
importForm(packageJson, requestedName, acceptedWarningCodes)
archiveForm(formId)
deleteForm(formId, confirmationName)
restoreForm(formId)
```

`inspectImport` performs no DML. `importForm` repeats validation inside the
creation transaction; it must not trust a prior preview response.

Use `WITH USER_MODE` / user-mode DML, explicit sharing, one savepoint per
mutation, no SOQL or DML in loops, and bounded package sizes. Do not add
`without sharing` or async Apex to this slice.

### LWC

Update `finalFormStudio` to render the Actions button between Settings and
Publish only in editable mode. The menu rolls out incrementally: each merged
slice adds only the actions whose backend and host verification are complete.
Never render disabled, placeholder, or dead menu items.

Add `finalStudioActionDialog` as a focused child component for:

- clone naming;
- export dependency warning;
- import file selection, inspection summary, and confirmation;
- delete/archive preflight and typed-name confirmation.

The child owns local form/file validation and emits intent. `finalFormStudio`
owns Apex calls, busy/error state, downloads, and navigation. Clone/Import
results use the existing `studioUrl` helper so LEX and the Visualforce host
navigate consistently.

Update `finalFormsLibrary` and `FinalStudioController.listForms()` for type,
status, archived filtering, and Restore.

## 5. Files expected to change

### New

- `force-app/main/default/classes/FinalFormActionsController.cls`
- `force-app/main/default/classes/FinalFormActionsController.cls-meta.xml`
- `force-app/main/default/classes/FinalFormActionsControllerTest.cls`
- `force-app/main/default/classes/FinalFormActionsControllerTest.cls-meta.xml`
- `force-app/main/default/classes/FinalFormActionsService.cls`
- `force-app/main/default/classes/FinalFormActionsService.cls-meta.xml`
- `force-app/main/default/classes/FinalFormActionsSelector.cls`
- `force-app/main/default/classes/FinalFormActionsSelector.cls-meta.xml`
- `force-app/main/default/classes/FinalSpecTransferService.cls`
- `force-app/main/default/classes/FinalSpecTransferService.cls-meta.xml`
- `force-app/main/default/classes/FinalSpecTransferValidator.cls`
- `force-app/main/default/classes/FinalSpecTransferValidator.cls-meta.xml`
- `force-app/main/default/classes/FinalSpecDescribeValidator.cls`
- `force-app/main/default/classes/FinalSpecDescribeValidator.cls-meta.xml`
- `force-app/main/default/classes/FinalSpecTransferServiceTest.cls`
- `force-app/main/default/classes/FinalSpecTransferServiceTest.cls-meta.xml`
- `force-app/main/default/lwc/finalStudioActionDialog/*`

### Existing

- `force-app/main/default/lwc/finalFormStudio/*`
- `force-app/main/default/lwc/finalFormsLibrary/*`
- `force-app/main/default/classes/FinalStudioController.cls`
- `force-app/main/default/classes/FinalStudioControllerTest.cls`
- `force-app/main/default/permissionsets/Form_Builder_Admin.permissionset-meta.xml`
- `docs/FinalDesign/FORM_STUDIO_IA.md`
- `docs/FinalDesign/DEFERRED.md`

The permission set must add access to the new controller and confirm the
builder has the object/field access used by invitation cleanup and archived
library management. The current permission set does not grant
`Survey_Invitation__c` access even though the Admin profile does; resolve that
gap in this program rather than assuming profile permissions.

## 6. Test plan

### Apex

- Clone a Form and a Survey; assert new root/version IDs and correct type.
- Assert every page/section/element ID changes and all rule references follow.
- Assert source history, responses, invitations, access state, and publish
  state are not copied.
- Assert current unsaved spec JSON, not an older database version, is cloned.
- Reject malformed, oversized, unsupported, and type-mismatched packages.
- Reject duplicate IDs and dangling rule references.
- Validate objects, mappings, repeat relationships, and field compatibility.
- Resolve Survey topics by name without duplicating vocabulary records.
- Import a custom theme dependency with explicit confirmation.
- Import creates a new private Draft and never overwrites the current form.
- Delete with responses is blocked; archive preserves response/answer/topic
  rows and disables public/link access.
- Delete without responses removes config/invitations but never target business
  records.
- Shared files are unlinked, not deleted; exclusively linked files are cleaned.
- Every mutating failure rolls back the entire action.
- Exercise CRUD/FLS/sharing failures with user-mode behavior.

### Jest

- Actions menu position, keyboard behavior, Escape, and read-only posture.
- Only one action dialog is rendered; focus enters and restores correctly.
- Clone name validation, busy state, error, and navigation.
- Export uses the current in-memory spec and produces the v1 envelope.
- Export warns when asset bytes are omitted.
- Import rejects wrong extension/size/JSON before Apex and renders server
  warnings/errors.
- Delete requires exact-name confirmation and renders the response-aware
  Archive branch.
- Library hides Archived by default and Restore refreshes the wired list.

### Manual host verification

- LEX Studio and Visualforce + Lightning Out Studio.
- File chooser and JSON download in both hosts.
- Popup/navigation behavior after Clone and Import.
- Large but valid 131k spec.
- Form and Survey with built-in theme, custom theme, topics, mappings, rules,
  and config images.

## 7. Implementation slices

Each slice ships as its own branch → PR → merge, **not** one program-sized PR.
The blast radius here (six production Apex classes, two Apex test classes, a
new LWC, the studio, the library, and a permission set) is too large to review
as a single change; the slice gates below are the PR boundaries. Slice 1 is
server-core-only and must be green in Apex tests before any Actions button
exists.

### Slice 1 — transfer contract and server core

- Build package DTO/validation and fresh-ID remapper.
- Build selector/service/controller skeletons.
- Prove Form and Survey clone transactions in Apex tests.

**Gate:** no UI; Apex tests prove IDs/references, security, and rollback.

### Slice 2 — Clone

- Add the Actions menu shell with Clone as its only item, plus the Clone dialog.
- Wire current in-memory spec to `cloneForm`.
- Navigate to the clone.
- Make config-image removal safe for files shared by a source and clone: unlink
  this form when other `ContentDocumentLink` rows exist; delete bytes only for
  an exclusively linked document.

**Gate:** Form and Survey clone end-to-end in both Studio hosts.

### Slice 3 — Export and Import

- Add v1 JSON envelope generation/download.
- Add import inspection and creation flow.
- Embed/resolve custom-theme and topic dependencies.
- Ship explicit v1 asset-reference warnings.
- Add Export and Import to the existing Actions menu only after their paths are
  complete; Clone remains the only earlier item.

**Gate:** same-org round trip preserves behavior; cross-org missing dependencies
produce warnings or blocking errors, never a silently broken form.

### Slice 4 — Delete, Archive, Restore

- Add preflight counts and typed-name confirmation.
- Add zero-response delete and response-preserving archive.
- Add Archived library filter and Restore.
- Block archived records from reopening as editable through a stale Studio URL;
  v1 Restore always returns them to Draft.
- Add Delete form to the Actions menu only when this slice is complete.

**Gate:** no response, answer, topic, invitation, file, or business-record data
is removed outside the approved branch.

### Slice 5 — quality and rollout

- Jest, Apex tests, Code Analyzer, formatting, permission-set verification.
- Targeted sandbox deployment only.
- Manual LEX and Visualforce host verification.
- Update IA and close `DEFERRED.md` #17.

**Gate:** all targeted tests pass and the owner approves destructive copy and
cross-org export limitations.

### Separate follow-up — portable binary assets

Design and security-review a ZIP package with image bytes only if cross-org
image portability is required. Do not force multi-megabyte binary data through
one Aura/Apex JSON request.

## 8. Owner decisions to confirm

Recommended defaults are already reflected above:

1. Clone/Export use the current authoring state only, not version history.
2. Import always creates a new root; it never overwrites the open form.
3. Surveys with responses can be archived but not purged from Studio.
4. v1 export is JSON configuration plus an asset manifest; binary assets are a
   separate ZIP follow-up.
5. Import may create survey topic vocabulary records by name when they are
   missing — accepted as a disclosed side effect (listed in the inspection
   summary), or imports with unknown topics are blocked instead.
6. This program also closes the `Survey_Invitation__c` permission-set gap, so it
   touches the org's security posture (relevant to the eventual AppExchange
   Security Review) rather than being a pure Studio-UI change.

Once these decisions are accepted, implementation can proceed without additional
IA questions.
