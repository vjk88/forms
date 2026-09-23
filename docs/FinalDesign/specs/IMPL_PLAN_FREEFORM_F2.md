# IMPL_PLAN — Freeform F2 (mapping)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Freeform submission creates or finds several linked Salesforce records, configured in a
new Data mode in the Studio and run by a background job after the submission is saved.

**Architecture:** The mapping lives in the spec as `spec.mapping.actions`. Publishing validates it
inside `FinalSpecController.publishSpec` (`FinalMappingValidator`), beside the Autofill validator
already there. A trigger on `Form_Submission__c` queues one background job per submission
(`FinalMappingJob`) within measured capacity. The job calls `FinalMappingService`, which locks the
submission, runs the steps in order through `FinalMappingWriter` (a per-version allow-list fence,
system mode), and records Done or Failed. The Studio gains a Data mode (`finalDataMode` →
`finalMappingEditor` → `finalMappingAction`) that edits `spec.mapping` through a pure JS module
(`finalMappingModel`). The rule tables live once, in Apex (`FinalMappingRules`), and the Studio
fetches them.

**Tech Stack:** Apex and metadata at API 66.0 · LWC · sfdx-lwc-jest (`npm run test:unit`) · sf CLI
v2 · org alias `revclouddev`.

**Spec:** [FREEFORM_F2_MAPPING_SPEC.md](./FREEFORM_F2_MAPPING_SPEC.md) — rulings D29–D47. Read it
with this plan. Where they differ, this plan's "Decisions" section says why.

## Global Constraints

- API version **66.0** on every new metadata file.
- Target org: **`revclouddev`**.
- `FinalSubmitService.runFreeform` is **not modified**. Every answer is stored whether or not mapping
  runs.
- Destination records are written **only** through `FinalMappingWriter`, in system mode. Nothing else
  in F2 writes them.
- Author-facing reads and describe checks run **as the running user**. Background reads use
  `WITH SYSTEM_MODE` inside `without sharing` classes reachable only from the trigger and from the
  permission-checked retry method.
- Capacity is **`Limits.getLimitQueueableJobs() - Limits.getQueueableJobs()`**, read at queue time.
  Never a literal 50.
- At most **10** steps per form (`FinalMappingRules.MAX_STEPS`).
- Status values, exactly: **`Not needed`, `Queued`, `Done`, `Failed`, `Ready for Retry`**. There is
  no Running.
- The respondent never learns about records: no record id, no match result, in anything a guest
  receives.
- **Never** set `DuplicateRuleHeader.allowSave`.
- Test data uses **Contact only**. Account inserts are blocked in `revclouddev` by an always-true
  validation rule, and `Contact.HasOptedOutOfEmail` is a phantom field there. Linked-record tests
  use `Contact.ReportsToId` (a lookup from Contact to Contact).
- `AuraHandledException` messages are only readable in tests after `setMessage()`. Throw them through
  `FinalMappingRules.refusal(message)`.
- LWC CSS class names carry a component prefix (`dm-`, `me-`, `ma-`), because LEX global CSS leaks
  into embedded LWCs.
- User-facing copy: plain words, sentence case, no "successfully", no "please".
- Workflow: one branch per slice → push → PR → merge. Stage only files this plan names. Deploy and
  verify in the org, not just tests green. Any guest check starts with a **site publish**, because a
  metadata deploy never reaches guests.

## Decisions this plan makes that the spec doesn't — review these

1. **`match.filter` uses the lookup filter's own shape**, `{ "logic": "all", "rows": [...] }`, and is
   compiled by the existing `FinalLookupService.compile`. It's the same compiler the lookup already
   uses for search and for its submit check. The spec's example wrote `rules` where the real shape
   says `rows`; Task 2 corrects the spec.
2. **The guest projection strips `mapping`.** The spec never said so, but `FinalGuestController`
   already strips every other piece of binding vocabulary before a guest sees the spec. Without this,
   every public form would ship its target objects, field names and match filter to anyone with a
   browser.
3. **The compatibility rule lives once, in Apex** (`FinalMappingRules.COMPATIBLE`), and the Studio
   fetches it. The spec planned a JS twin in `finalSurveyMapping`; a fetched rule can't drift from the
   one publish enforces.
4. **`$User.` in a match filter is a publish blocker.** The job runs as whoever queued it — a site
   guest for a new submission — so `$User` would silently mean "the site guest user".
5. **`ref: "link"` is a publish blocker in F2.** A Freeform submission stores no link record (it has
   no field for one), so there is nothing to resolve it against. The shape stays reserved for when
   personalized links come to Freeform.
6. **Matrix, ranking and file questions can't be mapping sources.** Their answers are several values,
   or an order, or a file, not one value for one field.
7. **A Choice answer going into a text field writes the option's label**, taken from the
   submission's own version. Into a picklist it writes the stored value, which must exist in the
   picklist. `Options` answers go only to multi-select picklists. **One conversion serves every
   path** — writing a field, searching for the record, and a filter row compared against an answer —
   each against the field that value actually meets, which for a filter row is the field being
   filtered. Writing the label while searching the value is how a form silently creates a duplicate
   on every submission. Whether a missing value is fatal stays with the caller: an assignment skips
   it, a match fails.
8. **Build order is backend first:** schema → publish gate → runtime → reader → Studio screens. That
   way every guard is proven before any author can configure a mapping, and no half-working screen is
   ever deployed. The slice names still match the spec's M1–M8.
9. **The conditions editor gets a filter-only mode.** The mapping screen reuses
   `c/finalLookupFilter`, which also carries result-display fields, searchable fields and a
   guest-search switch — none of which a mapping saves. A permission-shaped switch that does nothing
   is worse than no switch. Lookups keep all of it; filter-only is opt-in.
10. **Task and Event can't be mapped to at all (owner ruling, spec D48).** Their "Name" and
    "Related To" fields can each point at several kinds of record, which the source picker can't
    offer, so a Task could never be linked to what the form just created. They're left out of the
    object list and refused at publish.

The full compatibility table (decision 7):

| Answer type | May go into                               |
| ----------- | ----------------------------------------- |
| Text        | Text, Text Area                           |
| Email       | Email, Text, Text Area                    |
| Phone       | Phone, Text, Text Area                    |
| URL         | URL, Text, Text Area                      |
| Choice      | Picklist (value), Text, Text Area (label) |
| Options     | Multi-select picklist                     |
| Number      | Number, Currency, Percent                 |
| Boolean     | Checkbox                                  |
| Date        | Date                                      |
| DateTime    | Date/Time                                 |

## File map

**Create**

| Path (under `force-app/main/default/`)                                 | Responsibility                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `objects/Form_Submission__c/fields/Mapping_Status__c.field-meta.xml`   | run status, restricted picklist                        |
| `objects/Form_Submission__c/fields/Mapping_Message__c.field-meta.xml`  | why a run failed                                       |
| `objects/Form_Submission__c/fields/Mapping_Attempts__c.field-meta.xml` | how many runs were tried                               |
| `objects/Form_Submission__c/fields/Mapping_Run_At__c.field-meta.xml`   | when the last run finished                             |
| `objects/Form_Submission__c/fields/Created_Records__c.field-meta.xml`  | audit: step id → record id                             |
| `customPermissions/Freeform_Retry_Mapping.customPermission-meta.xml`   | the Retry button's permission                          |
| `classes/FinalMappingRules.cls`                                        | constants, compatibility, value coercion, spec readers |
| `classes/FinalMappingValidator.cls`                                    | publish checks: blockers and warnings                  |
| `classes/FinalMappingController.cls`                                   | Studio reads: objects, compatibility, question types   |
| `classes/FinalMappingWriter.cls`                                       | the fence: the only writer of destination records      |
| `classes/FinalMappingService.cls`                                      | one mapping run                                        |
| `classes/FinalMappingJob.cls`                                          | background job wrapper                                 |
| `classes/FinalMappingTriggerHandler.cls`                               | sets status, queues within capacity                    |
| `triggers/FinalFormSubmissionTrigger.trigger`                          | the one entry point for every run                      |
| `classes/FinalMappingRetryController.cls`                              | the Retry button's server method                       |
| `classes/FinalMappingTestData.cls`                                     | shared test fixture (`@IsTest`)                        |
| `classes/FinalMapping*Test.cls` (7 classes, named per task)            | tests                                                  |
| `lwc/finalMappingModel/`                                               | pure JS: every read and write of `spec.mapping`        |
| `lwc/finalDataMode/`                                                   | Data mode shell                                        |
| `lwc/finalMappingEditor/`                                              | three columns: steps, selected step, answers index     |
| `lwc/finalMappingAction/`                                              | one step: operation, match, fields, sources            |

Every `.cls` gets a `.cls-meta.xml` with `<apiVersion>66.0</apiVersion>` and `<status>Active</status>`;
every LWC gets a `.js-meta.xml` with `<apiVersion>66.0</apiVersion>` and `<isExposed>false</isExposed>`.

**Modify**

| Path                                                               | Change                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `classes/FinalPublishWarnings.cls` (+ Test)                        | returns `PublishCheck {blockers, warnings}`; `isQuestion` public |
| `classes/FinalSpecController.cls` (+ Test)                         | calls `FinalMappingValidator.validateForPublish`                 |
| `classes/FinalGuestController.cls` (+ Test)                        | projection strips `mapping`                                      |
| `classes/FinalStudioController.cls`                                | `describeFields` rows gain `displayType`                         |
| `classes/FinalFormCreateController.cls`                            | `isSystemTable` becomes `public`                                 |
| `classes/FinalSubmissionController.cls` (+ Test)                   | `getSubmission` returns a `mapping` block                        |
| `permissionsets/Freeform_Submission_Reader.permissionset-meta.xml` | read on the five new fields                                      |
| `permissionsets/Freeform_Submission_Admin.permissionset-meta.xml`  | edit on status, custom permission, retry class                   |
| `permissionsets/Form_Builder_Admin.permissionset-meta.xml`         | `FinalMappingController` class access                            |
| `lwc/finalPublishDialog/` (+ test)                                 | shows blockers, disables Publish while any exist                 |
| `lwc/finalFormStudio/` (+ test)                                    | publish check shape; Data mode button and region                 |
| `lwc/finalSubmissionReader/` (+ test)                              | mapping status, created records, Retry                           |
| `lwc/finalLookupFilter/` (+ test)                                  | a filter-only mode, opt-in; lookups unchanged                    |
| `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md`               | decisions 1, 2, 4–7 written back into the spec                   |

## Slice order and why

| Order | Slice | Tasks | Why here                                                      |
| ----- | ----- | ----- | ------------------------------------------------------------- |
| 1     | M1    | 1     | everything below reads or writes these fields                 |
| 2     | M2    | 2–5   | publish refuses a bad mapping before anything can run one     |
| 3     | M6    | 6–9   | the runtime, proven against hand-written specs — no UI needed |
| 4     | M7    | 10–11 | admins can see and retry a run before authors can create one  |
| 5     | M3    | 12–14 | Data mode, the step list, and the model module                |
| 6     | M4    | 15    | editing a create step                                         |
| 7     | M5    | 16    | find-or-create                                                |
| 8     | M8    | 17    | the whole thing, in the org, as a guest                       |

Deploy command used throughout (replace the paths with the task's files):

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingRules.cls
```

Apex test command used throughout:

```bash
sf apex run test --target-org revclouddev --class-names FinalMappingRulesTest --result-format human --wait 10
```

---

## M1 — Schema

### Task 1: Five fields, the custom permission, permission set grants

**Files:**

- Create: the five `objects/Form_Submission__c/fields/*.field-meta.xml` files below
- Create: `customPermissions/Freeform_Retry_Mapping.customPermission-meta.xml`
- Modify: `permissionsets/Freeform_Submission_Reader.permissionset-meta.xml`
- Modify: `permissionsets/Freeform_Submission_Admin.permissionset-meta.xml`
- Test: `classes/FinalMappingSchemaTest.cls`

**Interfaces:**

- Produces: fields `Mapping_Status__c`, `Mapping_Message__c`, `Mapping_Attempts__c`,
  `Mapping_Run_At__c`, `Created_Records__c` on `Form_Submission__c`; custom permission
  `Freeform_Retry_Mapping`.

- [ ] **Step 1: Write the failing test**

`classes/FinalMappingSchemaTest.cls`:

```apex
/**
 * The status values are code, not labels: the trigger, the service and the
 * retry method compare against them. A renamed value would silently stop
 * every run, so the exact list is pinned here.
 */
@IsTest
private class FinalMappingSchemaTest {
  @IsTest
  static void statusValuesAreExactlyTheFiveTheCodeUses() {
    List<String> values = new List<String>();
    for (
      Schema.PicklistEntry pe : Form_Submission__c.Mapping_Status__c.getDescribe()
        .getPicklistValues()
    ) {
      values.add(pe.getValue());
    }
    Assert.areEqual(
      new List<String>{
        'Not needed',
        'Queued',
        'Done',
        'Failed',
        'Ready for Retry'
      },
      values
    );
    Assert.isTrue(
      Form_Submission__c.Mapping_Status__c.getDescribe().isRestrictedPicklist(),
      'restricted, so no code path can invent a sixth value'
    );
  }
}
```

With its `FinalMappingSchemaTest.cls-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 2: Deploy the test alone to verify it fails**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingSchemaTest.cls`
Expected: FAIL — `Invalid field Mapping_Status__c for Form_Submission__c`.

- [ ] **Step 3: Create the fields**

`Mapping_Status__c.field-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Mapping_Status__c</fullName>
    <description
  >Where this submission's mapping run stands (FREEFORM_F2_MAPPING_SPEC 6.2). Set by the trigger on insert, by the mapping service after a run, and by an admin to Ready for Retry. There is no Running value: the status change and the work happen in one transaction, so it could never be seen. This field is the duplicate guard, checked under a row lock.</description>
    <inlineHelpText
  >Queued runs once, automatically. Failed shows why below. Set Ready for Retry to run it again.</inlineHelpText>
    <label>Mapping Status</label>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Picklist</type>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value><fullName>Not needed</fullName><default>false</default><label
        >Not needed</label></value>
            <value><fullName>Queued</fullName><default>false</default><label
        >Queued</label></value>
            <value><fullName>Done</fullName><default>false</default><label
        >Done</label></value>
            <value><fullName>Failed</fullName><default>false</default><label
        >Failed</label></value>
            <value><fullName>Ready for Retry</fullName><default
        >false</default><label>Ready for Retry</label></value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

`Mapping_Message__c.field-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Mapping_Message__c</fullName>
    <description
  >Why the last mapping run failed, written for the admin who has to fix it: which step, which field, what Salesforce said. Empty after a run that succeeded. An uncaught failure writes nothing here - its reason is in Setup, Apex Jobs.</description>
    <label>Mapping Message</label>
    <length>32768</length>
    <trackTrending>false</trackTrending>
    <type>LongTextArea</type>
    <visibleLines>3</visibleLines>
</CustomField>
```

`Mapping_Attempts__c.field-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Mapping_Attempts__c</fullName>
    <description
  >How many mapping runs have been tried. Kept through a handled failure because the service writes it before taking its savepoint.</description>
    <label>Mapping Attempts</label>
    <precision>4</precision>
    <required>false</required>
    <scale>0</scale>
    <trackTrending>false</trackTrending>
    <type>Number</type>
    <unique>false</unique>
</CustomField>
```

`Mapping_Run_At__c.field-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Mapping_Run_At__c</fullName>
    <description
  >When the last mapping run finished, whether it succeeded or failed.</description>
    <label>Mapping Run At</label>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>DateTime</type>
</CustomField>
```

`Created_Records__c.field-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Created_Records__c</fullName>
    <description
  >JSON map of mapping step id to the record it created or found. Audit only (FREEFORM_SPEC D17) - the duplicate guard is Mapping Status, never this field.</description>
    <label>Created Records</label>
    <length>32768</length>
    <trackTrending>false</trackTrending>
    <type>LongTextArea</type>
    <visibleLines>3</visibleLines>
</CustomField>
```

`customPermissions/Freeform_Retry_Mapping.customPermission-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CustomPermission xmlns="http://soap.sforce.com/2006/04/metadata">
    <description
  >Lets a person re-run a failed Freeform mapping from the submission page. The Retry method checks this itself - hiding the button protects nothing on its own.</description>
    <label>Retry Freeform Mappings</label>
</CustomPermission>
```

- [ ] **Step 4: Grant the fields and the permission**

In `Freeform_Submission_Reader.permissionset-meta.xml`, add one `fieldPermissions` block per field,
kept in alphabetical order with the existing blocks:

```xml
<fieldPermissions>
        <editable>false</editable>
        <field>Form_Submission__c.Created_Records__c</field>
        <readable>true</readable>
    </fieldPermissions>
```

…and the same with `Mapping_Attempts__c`, `Mapping_Message__c`, `Mapping_Run_At__c`,
`Mapping_Status__c`.

In `Freeform_Submission_Admin.permissionset-meta.xml`, add the same five blocks, except
`Mapping_Status__c` is `<editable>true</editable>` (that edit is the bulk-retry permission).

**Field edit alone is not enough.** That set currently says `<allowEdit>false</allowEdit>` on
`Form_Submission__c`, so nobody holding it can edit a submission at all and the bulk retry would be
impossible. Change that one line to `<allowEdit>true</allowEdit>` in its `Form_Submission__c`
`objectPermissions` block (the one that also carries `<viewAllRecords>true</viewAllRecords>`).

Say plainly what that buys and costs: this set is how an admin retries mappings in bulk, and the
price is that its holders can also edit submission records by hand. `allowCreate` and `allowDelete`
stay false, the reader set is untouched, and the answer rows are a separate object that this set
still only reads.

Also add:

```xml
<customPermissions>
        <enabled>true</enabled>
        <name>Freeform_Retry_Mapping</name>
    </customPermissions>
```

(The retry controller's class grant lands in Task 10, with the class.)

- [ ] **Step 5: Deploy and run the test**

Run:

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/objects/Form_Submission__c --source-dir force-app/main/default/customPermissions/Freeform_Retry_Mapping.customPermission-meta.xml --source-dir force-app/main/default/permissionsets/Freeform_Submission_Reader.permissionset-meta.xml --source-dir force-app/main/default/permissionsets/Freeform_Submission_Admin.permissionset-meta.xml --source-dir force-app/main/default/classes/FinalMappingSchemaTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingSchemaTest --result-format human --wait 10
```

Expected: deploy succeeds; 1 test passes.

- [ ] **Step 6: Commit, PR, merge**

```bash
git checkout -b feat/f2-m1-schema
git add force-app/main/default/objects/Form_Submission__c/fields/Mapping_Status__c.field-meta.xml force-app/main/default/objects/Form_Submission__c/fields/Mapping_Message__c.field-meta.xml force-app/main/default/objects/Form_Submission__c/fields/Mapping_Attempts__c.field-meta.xml force-app/main/default/objects/Form_Submission__c/fields/Mapping_Run_At__c.field-meta.xml force-app/main/default/objects/Form_Submission__c/fields/Created_Records__c.field-meta.xml force-app/main/default/customPermissions/Freeform_Retry_Mapping.customPermission-meta.xml force-app/main/default/permissionsets/Freeform_Submission_Reader.permissionset-meta.xml force-app/main/default/permissionsets/Freeform_Submission_Admin.permissionset-meta.xml force-app/main/default/classes/FinalMappingSchemaTest.cls force-app/main/default/classes/FinalMappingSchemaTest.cls-meta.xml
git commit -m "feat(freeform): F2 M1 - mapping status fields and retry permission"
```

Push, open the PR, merge (end the PR body with the attribution line).

---

## M2 — Rules, validator, publish gate

### Task 2: `FinalMappingRules` and the spec corrections

**Files:**

- Create: `classes/FinalMappingRules.cls`
- Modify: `classes/FinalPublishWarnings.cls:156` — `isQuestion` becomes `public`
- Create: `classes/FinalMappingTestData.cls`
- Test: `classes/FinalMappingRulesTest.cls`
- Modify: `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md` (decisions 1, 2, 4–7)

**Interfaces:**

- Consumes: `FinalPublishWarnings.isQuestion(Map<String, Object> el)` (made public here).
- Produces (used by every later Apex task):
  - constants `MAX_STEPS`, `OP_CREATE`, `OP_FIND_OR_CREATE`, `ON_MATCH_REUSE`, `ON_MATCH_UPDATE`,
    `STATUS_NOT_NEEDED`, `STATUS_QUEUED`, `STATUS_DONE`, `STATUS_FAILED`, `STATUS_READY_FOR_RETRY`,
    `Set<String> RUNNABLE`, `Set<String> RETRYABLE`, `Set<String> SETUP_OBJECTS` (lower case), `Set<String> UNSUPPORTED_OBJECTS` (lower case: task, event),
    `Set<String> UNMAPPABLE_ELEMENT_TYPES`, `Map<String, Set<Schema.DisplayType>> COMPATIBLE`
  - `Boolean isCompatible(String answerType, Schema.DisplayType t)`
  - `Boolean isTextLike(Schema.DisplayType t)`
  - `Object coerce(Object raw, Schema.DescribeFieldResult fd)` — throws `MappingValueException`
  - `Object valueOf(Form_Submission_Answer__c a)` — the stored value; null when blank or unparsed
  - `Object answerValue(Form_Submission_Answer__c a, Map<String, Object> question, Schema.DescribeFieldResult fd)`
    — **the one conversion**: the answer in the destination field's vocabulary, list shape preserved,
    null when absent. Used by writes, by the match search, and by filter rows
  - `Schema.DescribeFieldResult fieldAt(String objectApi, String path)` — the field a filter path
    ends at, or null
  - `List<Map<String, Object>> actionsOf(Map<String, Object> spec)`
  - `List<Map<String, Object>> questionsInOrder(Map<String, Object> spec)`
  - `Map<String, Map<String, Object>> questionMap(Map<String, Object> spec)`
  - `Set<String> skippableElementIds(Map<String, Object> spec)`
  - `String optionLabel(Map<String, Object> question, String value)`
  - `List<String> optionValues(Map<String, Object> question)`
  - `AuraHandledException refusal(String message)`
  - `Map<String, Object> asMap(Object o)`, `List<Object> asList(Object o)` — never null for lists
  - `class MappingValueException extends Exception`

- [ ] **Step 1: Make `isQuestion` public, and give the lookup compiler a public path resolver**

In `classes/FinalPublishWarnings.cls`, change line 156:

```apex
    private static Boolean isQuestion(Map<String, Object> el) {
```

to:

```apex
    public static Boolean isQuestion(Map<String, Object> el) {
```

In `classes/FinalLookupService.cls`, add beside `resolvePath` (which stays private and unchanged):

```apex
    /**
     * The field a filter path ends at, as a describe. `resolvePath` already
     * knows that a hop may be written as the field (`Customer__c`) or as the
     * relationship (`Customer__r`, `Account`) and emits the relationship
     * spelling; this walks that canonical path to the final field.
     *
     * Mapping needs it to convert an answer against the field a condition
     * actually filters on. Rewriting the rule in a second place is how the
     * two would quietly disagree about a custom relationship.
     */
    public static Schema.DescribeFieldResult fieldAt(
        String objectName,
        String path
    ) {
        String canonical = resolvePath(objectName, path);
        if (canonical == null) {
            return null;
        }
        List<String> parts = canonical.split('\\.');
        Schema.SObjectType current = Schema.getGlobalDescribe().get(objectName);
        for (Integer i = 0; current != null && i < parts.size(); i++) {
            Map<String, Schema.SObjectField> fields = current.getDescribe()
                .fields.getMap();
            if (i == parts.size() - 1) {
                Schema.SObjectField f = fields.get(parts[i].toLowerCase());
                return f == null ? null : f.getDescribe();
            }
            Schema.SObjectType next = null;
            for (Schema.SObjectField f : fields.values()) {
                Schema.DescribeFieldResult d = f.getDescribe();
                if (
                    d.getType() == Schema.DisplayType.REFERENCE &&
                    parts[i].equalsIgnoreCase(d.getRelationshipName())
                ) {
                    List<Schema.SObjectType> refs = d.getReferenceTo();
                    next = refs.isEmpty() ? null : refs[0];
                    break;
                }
            }
            current = next;
        }
        return null;
    }
```

- [ ] **Step 2: Write the shared test fixture**

`classes/FinalMappingTestData.cls`:

```apex
/**
 * Shared fixture for the F2 mapping tests. Contact only: in revclouddev an
 * always-true validation rule blocks every Account insert, and
 * Contact.HasOptedOutOfEmail is a phantom field. Linked records use
 * Contact.ReportsToId, a lookup from Contact to Contact.
 */
@IsTest
public class FinalMappingTestData {
  public static Id formId;
  public static Id versionId;

  public static Map<String, Object> question(
    String id,
    String inputType,
    String label
  ) {
    return new Map<String, Object>{
      'id' => id,
      'type' => 'field',
      'label' => label,
      'required' => true,
      'config' => new Map<String, Object>{ 'inputType' => inputType }
    };
  }

  public static List<Object> standardQuestions() {
    return new List<Object>{
      question('el_last', 'text', 'Your surname'),
      question('el_email', 'email', 'Work email'),
      question('el_title', 'text', 'Job title')
    };
  }

  public static Map<String, Object> answer(String elementKey) {
    return new Map<String, Object>{
      'kind' => 'answer',
      'elementKey' => elementKey
    };
  }

  public static Map<String, Object> literal(Object value) {
    return new Map<String, Object>{ 'kind' => 'literal', 'value' => value };
  }

  public static Map<String, Object> ref(String ref) {
    return new Map<String, Object>{ 'kind' => 'recordRef', 'ref' => ref };
  }

  public static Map<String, Object> field(
    String api,
    Map<String, Object> source
  ) {
    return new Map<String, Object>{ 'field' => api, 'source' => source };
  }

  /** A filter every Contact passes: LastName is required, so never blank. */
  public static Map<String, Object> anyNamedContact() {
    return new Map<String, Object>{
      'logic' => 'all',
      'rows' => new List<Object>{
        new Map<String, Object>{
          'fieldPath' => 'LastName',
          'operator' => 'isNotBlank'
        }
      }
    };
  }

  public static Map<String, Object> createContact(String id) {
    return new Map<String, Object>{
      'id' => id,
      'object' => 'Contact',
      'operation' => 'create',
      'fields' => new List<Object>{
        field('LastName', answer('el_last')),
        field('Email', answer('el_email'))
      }
    };
  }

  /** onMatch null = the author has not answered the match question. */
  public static Map<String, Object> findOrCreateContact(
    String id,
    String onMatch
  ) {
    Map<String, Object> match = new Map<String, Object>{
      'field' => 'Email',
      'source' => answer('el_email'),
      'filter' => anyNamedContact()
    };
    if (onMatch != null) {
      match.put('onMatch', onMatch);
    }
    return new Map<String, Object>{
      'id' => id,
      'object' => 'Contact',
      'operation' => 'findOrCreate',
      'match' => match,
      'fields' => new List<Object>{
        field('LastName', answer('el_last')),
        field('Email', answer('el_email')),
        field('Title', answer('el_title'))
      }
    };
  }

  public static Map<String, Object> spec(
    List<Object> elements,
    List<Object> actions
  ) {
    Map<String, Object> s = new Map<String, Object>{
      'specVersion' => 1,
      'form' => new Map<String, Object>{
        'name' => 'Mapping test',
        'type' => 'freeform'
      },
      'layout' => new Map<String, Object>{ 'type' => 'scroll' },
      'settings' => new Map<String, Object>(),
      'resolved' => new Map<String, Object>{
        'tokens' => new Map<String, Object>{ 'accent' => '#000000' }
      },
      'pages' => new List<Object>{
        new Map<String, Object>{
          'id' => 'pg_1',
          'sections' => new List<Object>{
            new Map<String, Object>{ 'id' => 'sec_1', 'elements' => elements }
          }
        }
      }
    };
    if (actions != null) {
      s.put('mapping', new Map<String, Object>{ 'actions' => actions });
    }
    return s;
  }

  /** A Freeform form with one active version carrying this spec. */
  public static Id publish(Map<String, Object> spec) {
    Form__c form = new Form__c(
      Name = 'Mapping test',
      Form_Type__c = 'Freeform'
    );
    insert form;
    formId = form.Id;
    Form_Version__c v = new Form_Version__c(
      Form__c = form.Id,
      Version_Number__c = 1,
      Is_Active__c = true,
      Spec_JSON__c = JSON.serialize(spec),
      Engine_Version__c = 1
    );
    insert v;
    versionId = v.Id;
    return v.Id;
  }

  /**
   * A submission and its text answers, the way the submit path leaves
   * them. A null value means the question was skipped: no row at all.
   */
  public static Id submit(Map<String, String> textAnswers) {
    Form_Submission__c s = new Form_Submission__c(
      Form__c = formId,
      Form_Version__c = versionId,
      Submitted_Date__c = Datetime.now()
    );
    insert s;
    List<Form_Submission_Answer__c> rows = new List<Form_Submission_Answer__c>();
    for (String key : textAnswers.keySet()) {
      String value = textAnswers.get(key);
      if (value == null) {
        continue;
      }
      rows.add(
        new Form_Submission_Answer__c(
          Form_Submission__c = s.Id,
          Element_Key__c = key,
          Answer_Type__c = key == 'el_email' ? 'Email' : 'Text',
          Text_Value__c = value
        )
      );
    }
    insert rows;
    return s.Id;
  }

  public static Form_Submission__c reload(Id submissionId) {
    return [
      SELECT
        Id,
        Mapping_Status__c,
        Mapping_Message__c,
        Mapping_Attempts__c,
        Mapping_Run_At__c,
        Created_Records__c
      FROM Form_Submission__c
      WHERE Id = :submissionId
    ];
  }
}
```

- [ ] **Step 3: Write the failing tests**

`classes/FinalMappingRulesTest.cls`:

```apex
@IsTest
private class FinalMappingRulesTest {
  @IsTest
  static void compatibilityFollowsTheTable() {
    Assert.isTrue(
      FinalMappingRules.isCompatible('Email', Schema.DisplayType.EMAIL)
    );
    Assert.isTrue(
      FinalMappingRules.isCompatible('Choice', Schema.DisplayType.PICKLIST)
    );
    Assert.isFalse(
      FinalMappingRules.isCompatible('Text', Schema.DisplayType.DOUBLE),
      'text never goes into a number'
    );
    Assert.isFalse(
      FinalMappingRules.isCompatible('Options', Schema.DisplayType.STRING),
      'several choices only go into a multi-select picklist'
    );
    Assert.isFalse(
      FinalMappingRules.isCompatible(null, Schema.DisplayType.STRING)
    );
  }

  @IsTest
  static void coerceConvertsOrExplains() {
    Schema.DescribeFieldResult title = Contact.Title.getDescribe();
    Assert.areEqual('CEO', FinalMappingRules.coerce('CEO', title));

    String tooLong = 'x'.repeat(title.getLength() + 1);
    try {
      FinalMappingRules.coerce(tooLong, title);
      Assert.fail('a value longer than the field must be refused');
    } catch (FinalMappingRules.MappingValueException e) {
      Assert.isTrue(e.getMessage().contains('Title'), e.getMessage());
    }

    Schema.DescribeFieldResult birthdate = Contact.Birthdate.getDescribe();
    Assert.areEqual(
      Date.newInstance(1990, 4, 2),
      FinalMappingRules.coerce('1990-04-02', birthdate)
    );
    try {
      FinalMappingRules.coerce('not a date', birthdate);
      Assert.fail('a non-date must be refused');
    } catch (FinalMappingRules.MappingValueException e) {
      Assert.isTrue(e.getMessage().contains('Birthdate'), e.getMessage());
    }
  }

  @IsTest
  static void valueOfTreatsBlankAndUnparsedAsAbsent() {
    Assert.isNull(
      FinalMappingRules.valueOf(
        new Form_Submission_Answer__c(Answer_Type__c = 'Text')
      )
    );
    Assert.isNull(
      FinalMappingRules.valueOf(
        new Form_Submission_Answer__c(
          Answer_Type__c = 'Number',
          Value_Unparsed__c = true,
          Text_Value__c = 'twelve'
        )
      ),
      'an unparsed answer is not a value'
    );
    Assert.areEqual(
      12,
      FinalMappingRules.valueOf(
        new Form_Submission_Answer__c(
          Answer_Type__c = 'Number',
          Numeric_Value__c = 12
        )
      )
    );
  }

  @IsTest
  static void aChoiceConvertsToWhereverItIsGoing() {
    // The bug this function exists to prevent: writing the label and
    // searching the value, so every submission makes another record.
    Map<String, Object> question = new Map<String, Object>{
      'id' => 'el_tier',
      'type' => 'field',
      'label' => 'Tier',
      'config' => new Map<String, Object>{
        'inputType' => 'picklist',
        'options' => new List<Object>{
          new Map<String, Object>{
            'value' => 'vip',
            'label' => 'Priority customer'
          }
        }
      }
    };
    Form_Submission_Answer__c a = new Form_Submission_Answer__c(
      Element_Key__c = 'el_tier',
      Answer_Type__c = 'Choice',
      Text_Value__c = 'vip'
    );

    Assert.areEqual(
      'Priority customer',
      FinalMappingRules.answerValue(a, question, Contact.Title.getDescribe()),
      'into a text field, the label'
    );
    Assert.areEqual(
      'vip',
      FinalMappingRules.answerValue(
        a,
        question,
        Contact.LeadSource.getDescribe()
      ),
      'into a picklist, the stored value'
    );
  }

  @IsTest
  static void answerValueKeepsSeveralChoicesAsAList() {
    Form_Submission_Answer__c a = new Form_Submission_Answer__c(
      Answer_Type__c = 'Options',
      Selected_Options_JSON__c = '["a","b"]'
    );
    Object v = FinalMappingRules.answerValue(
      a,
      new Map<String, Object>(),
      Contact.LeadSource.getDescribe()
    );
    Assert.isTrue(
      v instanceof List<Object>,
      'an operator that wants a list gets one'
    );
  }

  @IsTest
  static void answerValueIsNullWhenTheAnswerIsAbsent() {
    Assert.isNull(
      FinalMappingRules.answerValue(null, null, Contact.Title.getDescribe())
    );
    Assert.isNull(
      FinalMappingRules.answerValue(
        new Form_Submission_Answer__c(Answer_Type__c = 'Text'),
        null,
        Contact.Title.getDescribe()
      ),
      'blank is absent; what that means is the caller’s business'
    );
  }

  @IsTest
  static void fieldAtWalksAPathWrittenEitherWay() {
    // A hop can be the field or the relationship. Both must land on the
    // same field, or a filter passes publish and then converts nothing.
    Assert.areEqual(
      'Type',
      FinalMappingRules.fieldAt('Contact', 'Account.Type').getName()
    );
    Assert.areEqual(
      'Type',
      FinalMappingRules.fieldAt('Contact', 'AccountId.Type').getName()
    );
    Assert.areEqual(
      'LastName',
      FinalMappingRules.fieldAt('Contact', 'ReportsTo.LastName').getName(),
      'a relationship name, not a field name'
    );
    Assert.areEqual(
      'LastName',
      FinalMappingRules.fieldAt('Contact', 'LastName').getName()
    );
    Assert.isNull(FinalMappingRules.fieldAt('Contact', 'Nope.Nope'));
  }

  @IsTest
  static void skippableMeansNotAlwaysRequiredOrConditional() {
    Map<String, Object> optional = FinalMappingTestData.question(
      'el_opt',
      'text',
      'Optional'
    );
    optional.put('required', false);
    Map<String, Object> hidden = FinalMappingTestData.question(
      'el_hidden',
      'text',
      'Hidden sometimes'
    );
    hidden.put(
      'visibility',
      new Map<String, Object>{
        'rules' => new List<Object>{ new Map<String, Object>() }
      }
    );
    Map<String, Object> spec = FinalMappingTestData.spec(
      new List<Object>{
        FinalMappingTestData.question('el_req', 'text', 'Required'),
        optional,
        hidden
      },
      null
    );

    Set<String> skippable = FinalMappingRules.skippableElementIds(spec);

    Assert.isFalse(skippable.contains('el_req'));
    Assert.isTrue(skippable.contains('el_opt'));
    Assert.isTrue(skippable.contains('el_hidden'), 'required but hideable');
  }

  @IsTest
  static void actionsOfIsEmptyWithoutAMapping() {
    Assert.areEqual(
      0,
      FinalMappingRules.actionsOf(
          FinalMappingTestData.spec(new List<Object>(), null)
        )
        .size()
    );
  }
}
```

- [ ] **Step 4: Deploy to verify the tests fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingTestData.cls --source-dir force-app/main/default/classes/FinalMappingRulesTest.cls`
Expected: FAIL — `Variable does not exist: FinalMappingRules`.

- [ ] **Step 5: Write `FinalMappingRules`**

`classes/FinalMappingRules.cls`:

```apex
/**
 * FinalMappingRules — the rules Freeform mapping lives by, stated once
 * (FREEFORM_F2_MAPPING_SPEC). No DML, no queries. The validator, the
 * runtime and the Studio all read these, so the three cannot disagree.
 */
public with sharing class FinalMappingRules {
  public static final Integer MAX_STEPS = 10;

  public static final String OP_CREATE = 'create';
  public static final String OP_FIND_OR_CREATE = 'findOrCreate';
  public static final String ON_MATCH_REUSE = 'reuse';
  public static final String ON_MATCH_UPDATE = 'update';

  public static final String STATUS_NOT_NEEDED = 'Not needed';
  public static final String STATUS_QUEUED = 'Queued';
  public static final String STATUS_DONE = 'Done';
  public static final String STATUS_FAILED = 'Failed';
  public static final String STATUS_READY_FOR_RETRY = 'Ready for Retry';

  /** The service runs from these. Done and Not needed never run. */
  public static final Set<String> RUNNABLE = new Set<String>{
    STATUS_QUEUED,
    STATUS_FAILED,
    STATUS_READY_FOR_RETRY
  };

  /** A person may retry from these (D42). Queued never is. */
  public static final Set<String> RETRYABLE = new Set<String>{
    STATUS_FAILED,
    STATUS_READY_FOR_RETRY
  };

  /**
   * Setup objects. Salesforce refuses to write these in the same
   * transaction as ordinary records (MIXED_DML_OPERATION), so a mapping
   * naming one would fail on every submission. Lower case.
   */
  public static final Set<String> SETUP_OBJECTS = new Set<String>{
    'fieldpermissions',
    'group',
    'groupmember',
    'objectpermissions',
    'objectterritory2assignmentrule',
    'objectterritory2assignmentruleitem',
    'permissionset',
    'permissionsetassignment',
    'permissionsetgroup',
    'queuesobject',
    'ruleterritory2association',
    'setupentityaccess',
    'territory2',
    'territory2model',
    'user',
    'userpackagelicense',
    'userrole',
    'userterritory2association'
  };

  /**
   * Objects a mapping can't write to by owner ruling (spec D48). Task and
   * Event link to other records through fields that can point at several
   * kinds of record, and the mapping can't offer those. Lower case.
   */
  public static final Set<String> UNSUPPORTED_OBJECTS = new Set<String>{
    'task',
    'event'
  };

  /**
   * Question types whose answer is not one value for one field: a grid,
   * an order, a file.
   */
  public static final Set<String> UNMAPPABLE_ELEMENT_TYPES = new Set<String>{
    'matrix',
    'ranking',
    'file'
  };

  /**
   * Which destination field types each answer type may be written to,
   * keyed by Answer_Type__c (FinalSubmitService.answerTypeOf). A pair not
   * listed is a publish blocker.
   */
  public static final Map<String, Set<Schema.DisplayType>> COMPATIBLE = new Map<String, Set<Schema.DisplayType>>{
    'Text' => new Set<Schema.DisplayType>{
      Schema.DisplayType.STRING,
      Schema.DisplayType.TEXTAREA
    },
    'Email' => new Set<Schema.DisplayType>{
      Schema.DisplayType.EMAIL,
      Schema.DisplayType.STRING,
      Schema.DisplayType.TEXTAREA
    },
    'Phone' => new Set<Schema.DisplayType>{
      Schema.DisplayType.PHONE,
      Schema.DisplayType.STRING,
      Schema.DisplayType.TEXTAREA
    },
    'URL' => new Set<Schema.DisplayType>{
      Schema.DisplayType.URL,
      Schema.DisplayType.STRING,
      Schema.DisplayType.TEXTAREA
    },
    'Choice' => new Set<Schema.DisplayType>{
      Schema.DisplayType.PICKLIST,
      Schema.DisplayType.STRING,
      Schema.DisplayType.TEXTAREA
    },
    'Options' => new Set<Schema.DisplayType>{
      Schema.DisplayType.MULTIPICKLIST
    },
    'Number' => new Set<Schema.DisplayType>{
      Schema.DisplayType.DOUBLE,
      Schema.DisplayType.INTEGER,
      Schema.DisplayType.LONG,
      Schema.DisplayType.CURRENCY,
      Schema.DisplayType.PERCENT
    },
    'Boolean' => new Set<Schema.DisplayType>{ Schema.DisplayType.BOOLEAN },
    'Date' => new Set<Schema.DisplayType>{ Schema.DisplayType.DATE },
    'DateTime' => new Set<Schema.DisplayType>{ Schema.DisplayType.DATETIME }
  };

  public class MappingValueException extends Exception {
  }

  public static Boolean isCompatible(String answerType, Schema.DisplayType t) {
    return answerType != null &&
      COMPATIBLE.containsKey(answerType) &&
      COMPATIBLE.get(answerType).contains(t);
  }

  public static Boolean isTextLike(Schema.DisplayType t) {
    return t == Schema.DisplayType.STRING ||
      t == Schema.DisplayType.TEXTAREA ||
      t == Schema.DisplayType.EMAIL ||
      t == Schema.DisplayType.PHONE ||
      t == Schema.DisplayType.URL;
  }

  /**
   * An AuraHandledException whose message survives into tests: without
   * setMessage, getMessage() returns "Script-thrown exception".
   */
  public static AuraHandledException refusal(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  /**
   * An answer value or a fixed value, turned into what the field stores.
   * Throws MappingValueException with a sentence an admin can act on.
   */
  public static Object coerce(Object raw, Schema.DescribeFieldResult fd) {
    String label = fd.getLabel();
    try {
      switch on fd.getType() {
        when STRING, TEXTAREA, EMAIL, PHONE, URL {
          String s = String.valueOf(raw);
          if (s.length() > fd.getLength()) {
            throw new MappingValueException(
              'The value is longer than ' +
                label +
                ' allows (' +
                fd.getLength() +
                ' characters).'
            );
          }
          return s;
        }
        when DOUBLE, CURRENCY, PERCENT {
          return decimalOf(raw);
        }
        when INTEGER {
          return decimalOf(raw).intValue();
        }
        when LONG {
          return decimalOf(raw).longValue();
        }
        when BOOLEAN {
          if (raw instanceof Boolean) {
            return raw;
          }
          String s = String.valueOf(raw).toLowerCase();
          if (s == 'true' || s == 'false') {
            return s == 'true';
          }
          throw new MappingValueException(label + ' needs true or false.');
        }
        when DATE {
          return raw instanceof Date ? raw : Date.valueOf(String.valueOf(raw));
        }
        when DATETIME {
          return raw instanceof Datetime
            ? raw
            : (Datetime) JSON.deserialize(
                '"' + String.valueOf(raw) + '"',
                Datetime.class
              );
        }
        when PICKLIST {
          String s = String.valueOf(raw);
          if (!activeValues(fd).contains(s)) {
            throw new MappingValueException(
              '"' + s + '" isn’t a value ' + label + ' accepts.'
            );
          }
          return s;
        }
        when MULTIPICKLIST {
          List<String> parts = new List<String>();
          if (raw instanceof List<Object>) {
            for (Object o : (List<Object>) raw) {
              parts.add(String.valueOf(o));
            }
          } else {
            parts.addAll(String.valueOf(raw).split(';'));
          }
          Set<String> ok = activeValues(fd);
          for (String p : parts) {
            if (!ok.contains(p)) {
              throw new MappingValueException(
                '"' + p + '" isn’t a value ' + label + ' accepts.'
              );
            }
          }
          return String.join(parts, ';');
        }
        when REFERENCE {
          return Id.valueOf(String.valueOf(raw));
        }
        when else {
          throw new MappingValueException(
            label + ' is a kind of field a mapping can’t fill.'
          );
        }
      }
    } catch (MappingValueException e) {
      throw e;
    } catch (Exception e) {
      throw new MappingValueException('The value doesn’t fit ' + label + '.');
    }
  }

  private static Decimal decimalOf(Object raw) {
    return raw instanceof Decimal
      ? (Decimal) raw
      : Decimal.valueOf(String.valueOf(raw));
  }

  private static Set<String> activeValues(Schema.DescribeFieldResult fd) {
    Set<String> out = new Set<String>();
    for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
      if (pe.isActive()) {
        out.add(pe.getValue());
      }
    }
    return out;
  }

  /**
   * The typed value of a stored answer, or null when it is blank or did
   * not convert when it was stored. Null means "leave the field alone"
   * (D44) — callers decide whether that is allowed.
   */
  public static Object valueOf(Form_Submission_Answer__c a) {
    if (a == null || a.Value_Unparsed__c == true) {
      return null;
    }
    switch on a.Answer_Type__c {
      when 'Number' {
        return a.Numeric_Value__c;
      }
      when 'Boolean' {
        return a.Boolean_Value__c;
      }
      when 'Date' {
        return a.Date_Value__c;
      }
      when 'DateTime' {
        return a.DateTime_Value__c;
      }
      when 'Options' {
        if (String.isBlank(a.Selected_Options_JSON__c)) {
          return null;
        }
        List<Object> picked = (List<Object>) JSON.deserializeUntyped(
          a.Selected_Options_JSON__c
        );
        return picked.isEmpty() ? null : picked;
      }
      when else {
        return String.isBlank(a.Text_Value__c) ? null : a.Text_Value__c;
      }
    }
  }

  /**
   * A stored answer as the DESTINATION field's vocabulary — the one
   * conversion, used when writing a field, when searching for a record and
   * when a filter row compares against an answer. Each caller passes the
   * field that value is actually going up against: for a filter row that is
   * the field being filtered, not the field being written.
   *
   * A choice goes into text as its label and into a picklist as its stored
   * value. Writing one and searching the other is how a form quietly makes a
   * duplicate on every submission.
   *
   * Shape is preserved: several choices stay a list, so an operator that
   * wants a list still gets one. Null means the answer is absent; what that
   * means is the caller's business — an assignment skips, a match fails.
   */
  public static Object answerValue(
    Form_Submission_Answer__c a,
    Map<String, Object> question,
    Schema.DescribeFieldResult fd
  ) {
    if (a == null) {
      return null;
    }
    if (a.Value_Unparsed__c == true) {
      // The raw text is all there is; only a text field can take it.
      return isTextLike(fd.getType()) && String.isNotBlank(a.Text_Value__c)
        ? a.Text_Value__c
        : null;
    }
    Object v = valueOf(a);
    if (v == null) {
      return null;
    }
    Boolean asLabel =
      isTextLike(fd.getType()) &&
      (a.Answer_Type__c == 'Choice' || a.Answer_Type__c == 'Options');
    if (!asLabel) {
      return v;
    }
    if (v instanceof List<Object>) {
      List<String> labels = new List<String>();
      for (Object o : (List<Object>) v) {
        labels.add(optionLabel(question, String.valueOf(o)));
      }
      return labels;
    }
    return optionLabel(question, String.valueOf(v));
  }

  /**
   * The field a filter path ends at ("Account.Type"), or null when the path
   * does not resolve — the filter compiler refuses those itself, with a
   * better message than we could give here.
   */
  public static Schema.DescribeFieldResult fieldAt(
    String objectApi,
    String path
  ) {
    // The lookup compiler's own resolver, so publish, the search and the
    // filter all agree about what `Customer__r.Name` means. A hop can be
    // written as the field or as the relationship, and only that code
    // knows both spellings.
    return FinalLookupService.fieldAt(objectApi, path);
  }

  public static List<Map<String, Object>> actionsOf(Map<String, Object> spec) {
    List<Map<String, Object>> out = new List<Map<String, Object>>();
    Map<String, Object> mapping = spec == null
      ? null
      : asMap(spec.get('mapping'));
    for (Object a : asList(mapping == null ? null : mapping.get('actions'))) {
      Map<String, Object> action = asMap(a);
      if (action != null) {
        out.add(action);
      }
    }
    return out;
  }

  /** Every question, in the order the form asks them. */
  public static List<Map<String, Object>> questionsInOrder(
    Map<String, Object> spec
  ) {
    List<Map<String, Object>> out = new List<Map<String, Object>>();
    for (Object pageObj : asList(spec == null ? null : spec.get('pages'))) {
      Map<String, Object> page = asMap(pageObj);
      for (Object secObj : asList(page == null ? null : page.get('sections'))) {
        Map<String, Object> sec = asMap(secObj);
        for (Object elObj : asList(sec == null ? null : sec.get('elements'))) {
          Map<String, Object> el = asMap(elObj);
          if (
            el != null &&
            el.get('id') instanceof String &&
            FinalPublishWarnings.isQuestion(el)
          ) {
            out.add(el);
          }
        }
      }
    }
    return out;
  }

  public static Map<String, Map<String, Object>> questionMap(
    Map<String, Object> spec
  ) {
    Map<String, Map<String, Object>> out = new Map<String, Map<String, Object>>();
    for (Map<String, Object> q : questionsInOrder(spec)) {
      out.put((String) q.get('id'), q);
    }
    return out;
  }

  /**
   * Questions a respondent can leave without an answer: not always
   * required, or on a page, section or element with a visibility rule
   * (rule-hidden answers are dropped before the server sees them).
   */
  public static Set<String> skippableElementIds(Map<String, Object> spec) {
    Set<String> out = new Set<String>();
    for (Object pageObj : asList(spec == null ? null : spec.get('pages'))) {
      Map<String, Object> page = asMap(pageObj);
      Boolean pageConditional = hasRule(page);
      for (Object secObj : asList(page == null ? null : page.get('sections'))) {
        Map<String, Object> sec = asMap(secObj);
        Boolean secConditional = pageConditional || hasRule(sec);
        for (Object elObj : asList(sec == null ? null : sec.get('elements'))) {
          Map<String, Object> el = asMap(elObj);
          if (el == null || !(el.get('id') instanceof String)) {
            continue;
          }
          if (secConditional || hasRule(el) || !isAlwaysRequired(el)) {
            out.add((String) el.get('id'));
          }
        }
      }
    }
    return out;
  }

  private static Boolean hasRule(Map<String, Object> node) {
    if (node == null || node.get('visibility') == null) {
      return false;
    }
    Map<String, Object> v = asMap(node.get('visibility'));
    return v == null || !asList(v.get('rules')).isEmpty();
  }

  private static Boolean isAlwaysRequired(Map<String, Object> el) {
    if (el.get('required') == true) {
      return true;
    }
    for (Object vObj : asList(el.get('validation'))) {
      Map<String, Object> v = asMap(vObj);
      if (v != null && v.get('type') == 'required' && v.get('when') == null) {
        return true;
      }
    }
    return false;
  }

  /** The option values a Choice or Options question offers. */
  public static List<String> optionValues(Map<String, Object> question) {
    List<String> out = new List<String>();
    Map<String, Object> config = asMap(question.get('config'));
    for (Object o : asList(config == null ? null : config.get('options'))) {
      Map<String, Object> opt = asMap(o);
      if (opt != null && opt.get('value') != null) {
        out.add(String.valueOf(opt.get('value')));
      }
    }
    return out;
  }

  /**
   * The label the submission's own version shows for a stored option
   * value — "the version is the dictionary" (FREEFORM_SPEC 8). Falls back
   * to the value, never to blank.
   */
  public static String optionLabel(Map<String, Object> question, String value) {
    Map<String, Object> config = question == null
      ? null
      : asMap(question.get('config'));
    for (Object o : asList(config == null ? null : config.get('options'))) {
      Map<String, Object> opt = asMap(o);
      if (opt != null && String.valueOf(opt.get('value')) == value) {
        Object label = opt.get('label');
        return label == null || String.isBlank(String.valueOf(label))
          ? value
          : String.valueOf(label);
      }
    }
    return value;
  }

  public static Map<String, Object> asMap(Object o) {
    return o instanceof Map<String, Object> ? (Map<String, Object>) o : null;
  }

  public static List<Object> asList(Object o) {
    return o instanceof List<Object> ? (List<Object>) o : new List<Object>();
  }
}
```

- [ ] **Step 6: Deploy and run**

Run:

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalPublishWarnings.cls --source-dir force-app/main/default/classes/FinalMappingRules.cls --source-dir force-app/main/default/classes/FinalMappingTestData.cls --source-dir force-app/main/default/classes/FinalMappingRulesTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingRulesTest --class-names FinalPublishWarningsTest --result-format human --wait 10
```

Expected: all pass (the existing warnings tests are unaffected by `isQuestion` becoming public).

- [ ] **Step 7: Write the plan's decisions back into the spec**

In `FREEFORM_F2_MAPPING_SPEC.md`:

- §4 JSON example: change `"filter": { "logic": "all", "rules": [ /* same shape as lookup filters */ ] }`
  to `"filter": { "logic": "all", "rows": [ /* the lookup filter's own shape, compiled by FinalLookupService.compile */ ] }`.
- §4.3: after the table, add: _In F2 `link` is a publish blocker: a Freeform submission stores no link
  record, so there is nothing to resolve it against. The shape stays reserved._
- §7 blockers: add _a `$User.` value in a match filter — the job runs as whoever queued it, often a
  site guest_; _a `recordRef` of `link`_; _a matrix, ranking or file question used as a source_.
- §8, after the three numbered points: _**Guests never see the mapping.** `FinalGuestController`'s
  projection removes `mapping` along with every other piece of binding vocabulary._
- §5.4: replace the section body with: _The compatibility rule lives once, in Apex
  (`FinalMappingRules.COMPATIBLE`). The Studio fetches it through `FinalMappingController.compatibility`,
  so the rule publish enforces and the rule the source picker shows are the same rule._ followed by
  the compatibility table from this plan.

- [ ] **Step 8: Commit** (the slice's PR opens after Task 5)

```bash
git checkout -b feat/f2-m2-publish-gate
git add force-app/main/default/classes/FinalPublishWarnings.cls force-app/main/default/classes/FinalMappingRules.cls force-app/main/default/classes/FinalMappingRules.cls-meta.xml force-app/main/default/classes/FinalMappingTestData.cls force-app/main/default/classes/FinalMappingTestData.cls-meta.xml force-app/main/default/classes/FinalMappingRulesTest.cls force-app/main/default/classes/FinalMappingRulesTest.cls-meta.xml docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md
git commit -m "feat(freeform): F2 M2 - mapping rules stated once"
```

### Task 3: `FinalMappingValidator`

**Files:**

- Create: `classes/FinalMappingValidator.cls`
- Test: `classes/FinalMappingValidatorTest.cls`

**Interfaces:**

- Consumes: everything `FinalMappingRules` produces; `FinalSubmitService.answerTypeOf(Map<String, Object>)`;
  `FinalLookupService.compile(Map<String, Object> cfg, Map<String, Object> answers, String objectName)`
  returning `FinalLookupService.Compiled {whereClause, binds, blocked, blockedReason}`.
- Produces:
  - `class Diagnostic { @AuraEnabled String severity; String actionId; String field; String message; }` —
    severity is `'blocker'` or `'warning'`
  - `List<Diagnostic> validate(Map<String, Object> spec, Id formId)` — runs as the current user
  - `void validateForPublish(Id formId, Map<String, Object> spec)` — throws on any blocker, and when
    the check itself cannot finish

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingValidatorTest.cls`:

```apex
/**
 * Publish refuses what cannot run and warns about what can hurt
 * (FREEFORM_F2_MAPPING_SPEC section 7). Spec tests 9, 10 and 17 live here
 * in validator form; FinalSpecControllerTest proves publishSpec calls it.
 */
@IsTest
private class FinalMappingValidatorTest {
  private static List<FinalMappingValidator.Diagnostic> check(
    List<Object> actions
  ) {
    return FinalMappingValidator.validate(
      FinalMappingTestData.spec(
        FinalMappingTestData.standardQuestions(),
        actions
      ),
      null
    );
  }

  private static List<String> blockers(
    List<FinalMappingValidator.Diagnostic> found
  ) {
    List<String> out = new List<String>();
    for (FinalMappingValidator.Diagnostic d : found) {
      if (d.severity == 'blocker') {
        out.add(d.message);
      }
    }
    return out;
  }

  private static Boolean anyContains(List<String> messages, String fragment) {
    for (String m : messages) {
      if (m.contains(fragment)) {
        return true;
      }
    }
    return false;
  }

  @IsTest
  static void aCleanMappingHasNoBlockers() {
    List<String> found = blockers(
      check(
        new List<Object>{
          FinalMappingTestData.createContact('act_a'),
          FinalMappingTestData.findOrCreateContact('act_b', 'reuse')
        }
      )
    );
    Assert.areEqual(new List<String>(), found);
  }

  @IsTest
  static void anUnansweredMatchQuestionBlocks() {
    List<String> found = blockers(
      check(
        new List<Object>{
          FinalMappingTestData.findOrCreateContact('act_a', null)
        }
      )
    );
    Assert.isTrue(
      anyContains(found, 'choose what happens when a matching record is found'),
      String.join(found, ' | ')
    );
  }

  @IsTest
  static void elevenStepsBlock() {
    List<Object> actions = new List<Object>();
    for (Integer i = 0; i < 11; i++) {
      actions.add(FinalMappingTestData.createContact('act_' + i));
    }
    Assert.isTrue(anyContains(blockers(check(actions)), 'at most 10'));
  }

  @IsTest
  static void aSetupObjectBlocks() {
    Map<String, Object> action = FinalMappingTestData.createContact('act_a');
    action.put('object', 'User');
    Assert.isTrue(
      anyContains(
        blockers(check(new List<Object>{ action })),
        'together with ordinary records'
      )
    );
  }

  @IsTest
  static void taskAndEventBlock() {
    for (String objectApi : new List<String>{ 'Task', 'Event' }) {
      Map<String, Object> action = FinalMappingTestData.createContact('act_a');
      action.put('object', objectApi);
      Assert.isTrue(
        anyContains(
          blockers(check(new List<Object>{ action })),
          'forms can’t create'
        ),
        objectApi + ' must be refused'
      );
    }
  }

  @IsTest
  static void aMissingFilterBlocks() {
    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'reuse'
    );
    ((Map<String, Object>) action.get('match')).remove('filter');
    Assert.isTrue(
      anyContains(blockers(check(new List<Object>{ action })), 'needs a filter')
    );
  }

  @IsTest
  static void currentUserInAFilterBlocks() {
    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'reuse'
    );
    ((Map<String, Object>) action.get('match'))
      .put(
        'filter',
        new Map<String, Object>{
          'logic' => 'all',
          'rows' => new List<Object>{
            new Map<String, Object>{
              'fieldPath' => 'OwnerId',
              'operator' => 'eq',
              'value' => '$User.Id'
            }
          }
        }
      );
    Assert.isTrue(
      anyContains(blockers(check(new List<Object>{ action })), 'current user')
    );
  }

  @IsTest
  static void aReferenceToALaterStepBlocks() {
    Map<String, Object> first = FinalMappingTestData.createContact('act_a');
    ((List<Object>) first.get('fields'))
      .add(
        FinalMappingTestData.field(
          'ReportsToId',
          FinalMappingTestData.ref('action:act_b')
        )
      );
    List<String> found = blockers(
      check(
        new List<Object>{ first, FinalMappingTestData.createContact('act_b') }
      )
    );
    Assert.isTrue(anyContains(found, 'comes later or no longer exists'));
  }

  @IsTest
  static void aLinkReferenceBlocksInF2() {
    Map<String, Object> action = FinalMappingTestData.createContact('act_a');
    ((List<Object>) action.get('fields'))
      .add(
        FinalMappingTestData.field(
          'ReportsToId',
          FinalMappingTestData.ref('link')
        )
      );
    Assert.isTrue(
      anyContains(
        blockers(check(new List<Object>{ action })),
        'personalized-link'
      )
    );
  }

  @IsTest
  static void anIncompatibleAnswerBlocks() {
    Map<String, Object> action = FinalMappingTestData.createContact('act_a');
    ((List<Object>) action.get('fields'))
      .add(
        FinalMappingTestData.field(
          'Birthdate',
          FinalMappingTestData.answer('el_title')
        )
      );
    Assert.isTrue(
      anyContains(blockers(check(new List<Object>{ action })), 'can’t go into')
    );
  }

  @IsTest
  static void aRequiredFieldWithNoSourceBlocks() {
    Map<String, Object> action = FinalMappingTestData.createContact('act_a');
    action.put(
      'fields',
      new List<Object>{
        FinalMappingTestData.field(
          'Email',
          FinalMappingTestData.answer('el_email')
        )
      }
    );
    Assert.isTrue(
      anyContains(
        blockers(check(new List<Object>{ action })),
        'Last Name empty'
      )
    );
  }

  @IsTest
  static void overwritingTheMatchFieldBlocks() {
    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'update'
    );
    for (Object o : (List<Object>) action.get('fields')) {
      Map<String, Object> f = (Map<String, Object>) o;
      if (f.get('field') == 'Email') {
        f.put('writeOnMatch', true);
      }
    }
    Assert.isTrue(
      anyContains(
        blockers(check(new List<Object>{ action })),
        'the field used to find the record'
      )
    );
  }

  @IsTest
  static void anOptionalSourceForARequiredFieldWarns() {
    Map<String, Object> optional = FinalMappingTestData.question(
      'el_last',
      'text',
      'Your surname'
    );
    optional.put('required', false);
    List<FinalMappingValidator.Diagnostic> found = FinalMappingValidator.validate(
      FinalMappingTestData.spec(
        new List<Object>{
          optional,
          FinalMappingTestData.question('el_email', 'email', 'Work email')
        },
        new List<Object>{ FinalMappingTestData.createContact('act_a') }
      ),
      null
    );
    Boolean warned = false;
    for (FinalMappingValidator.Diagnostic d : found) {
      warned |= d.severity == 'warning' && d.message.contains('can be skipped');
    }
    Assert.isTrue(warned, 'skipping it would fail the step');
  }

  @IsTest
  static void thePublishersOwnPermissionsDecide() {
    // Spec test 10, as the publisher: someone who cannot create Contacts
    // cannot publish a form that creates them.
    Profile minimum = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Minimum Access - Salesforce'
    ];
    User noAccess = new User(
      Alias = 'nomap',
      Email = 'nomap@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'No mapping access',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = minimum.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'nomap' + Crypto.getRandomInteger() + '@example.com'
    );
    insert noAccess;

    List<String> found;
    System.runAs(noAccess) {
      found = blockers(
        check(new List<Object>{ FinalMappingTestData.createContact('act_a') })
      );
    }
    Assert.isTrue(
      anyContains(found, 'You can’t create Contacts'),
      String.join(found, ' | ')
    );
  }

  @IsTest
  static void validateForPublishThrowsTheFirstBlocker() {
    try {
      FinalMappingValidator.validateForPublish(
        null,
        FinalMappingTestData.spec(
          FinalMappingTestData.standardQuestions(),
          new List<Object>{
            FinalMappingTestData.findOrCreateContact('act_a', null)
          }
        )
      );
      Assert.fail('a blocker must refuse the publish');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('matching record is found'),
        e.getMessage()
      );
    }
  }
}
```

- [ ] **Step 2: Deploy to verify the tests fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingValidatorTest.cls`
Expected: FAIL — `Invalid type: FinalMappingValidator.Diagnostic`.

- [ ] **Step 3: Write the validator**

`classes/FinalMappingValidator.cls`:

```apex
/**
 * FinalMappingValidator — what publishing a mapping must refuse, and what
 * it must warn about (FREEFORM_F2_MAPPING_SPEC section 7).
 *
 * with sharing and no system mode: every describe check here is asked as
 * the person publishing, because their permissions are the only thing
 * standing between a public form and system-mode writes later (section 8).
 * publishSpec calls validateForPublish; FinalPublishWarnings calls
 * validate so the dialog shows the same results.
 */
public with sharing class FinalMappingValidator {
  public static final String BLOCKER = 'blocker';
  public static final String WARNING = 'warning';

  public class Diagnostic {
    @AuraEnabled
    public String severity;
    @AuraEnabled
    public String actionId;
    @AuraEnabled
    public String field;
    @AuraEnabled
    public String message;

    public Diagnostic(
      String severity,
      String actionId,
      String field,
      String message
    ) {
      this.severity = severity;
      this.actionId = actionId;
      this.field = field;
      this.message = message;
    }
  }

  /** Throws on the first blocker. "Couldn't check" is a refusal too (D38). */
  public static void validateForPublish(Id formId, Map<String, Object> spec) {
    List<Diagnostic> found;
    try {
      found = validate(spec, formId);
    } catch (Exception e) {
      throw FinalMappingRules.refusal(
        'The mapping couldn’t be checked, so the form wasn’t published. ' +
        e.getMessage()
      );
    }
    for (Diagnostic d : found) {
      if (d.severity == BLOCKER) {
        throw FinalMappingRules.refusal(
          'The mapping can’t be published yet: ' + d.message
        );
      }
    }
  }

  public static List<Diagnostic> validate(Map<String, Object> spec, Id formId) {
    List<Diagnostic> out = new List<Diagnostic>();
    Map<String, Object> mapping = spec == null
      ? null
      : FinalMappingRules.asMap(spec.get('mapping'));
    List<Object> raw = FinalMappingRules.asList(
      mapping == null ? null : mapping.get('actions')
    );
    if (raw.isEmpty()) {
      return out;
    }
    if (raw.size() > FinalMappingRules.MAX_STEPS) {
      out.add(
        new Diagnostic(
          BLOCKER,
          null,
          null,
          'A form can have at most ' +
            FinalMappingRules.MAX_STEPS +
            ' mapping steps. This one has ' +
            raw.size() +
            '.'
        )
      );
    }

    Context ctx = new Context();
    ctx.questions = FinalMappingRules.questionMap(spec);
    ctx.skippable = FinalMappingRules.skippableElementIds(spec);
    ctx.isPublic = isPublic(formId);
    ctx.placeholders = new Map<String, Object>();
    for (String key : ctx.questions.keySet()) {
      ctx.placeholders.put(key, 'x');
    }

    Set<String> seenIds = new Set<String>();
    Integer index = 0;
    for (Object o : raw) {
      index++;
      Map<String, Object> action = FinalMappingRules.asMap(o);
      String name = 'Step ' + index;
      if (action == null) {
        out.add(new Diagnostic(BLOCKER, null, null, name + ' is unreadable.'));
        continue;
      }
      String id = str(action.get('id'));
      if (id == null || !seenIds.add(id)) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            null,
            name + ' has no id, or shares one with another step.'
          )
        );
        continue;
      }
      checkAction(action, id, name, ctx, out);
    }
    return out;
  }

  private class Context {
    Map<String, Map<String, Object>> questions;
    Set<String> skippable;
    Boolean isPublic;
    Map<String, Object> placeholders;
    /** Steps seen so far, id → object API name: the only legal action refs. */
    Map<String, String> earlier = new Map<String, String>();
  }

  private static void checkAction(
    Map<String, Object> action,
    String id,
    String name,
    Context ctx,
    List<Diagnostic> out
  ) {
    String objectApi = str(action.get('object'));
    Schema.SObjectType t = objectApi == null
      ? null
      : Schema.getGlobalDescribe().get(objectApi);
    if (t == null) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name + ' names an object that doesn’t exist.'
        )
      );
      return;
    }
    Schema.DescribeSObjectResult d = t.getDescribe();
    name += ' (' + d.getLabel() + ')';
    if (FinalMappingRules.SETUP_OBJECTS.contains(d.getName().toLowerCase())) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name +
            ': Salesforce can’t write ' +
            d.getLabelPlural() +
            ' together with ordinary records.'
        )
      );
      return;
    }
    if (
      FinalMappingRules.UNSUPPORTED_OBJECTS.contains(d.getName().toLowerCase())
    ) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name + ': forms can’t create ' + d.getLabelPlural() + '.'
        )
      );
      return;
    }
    String op = str(action.get('operation'));
    if (
      op != FinalMappingRules.OP_CREATE &&
      op != FinalMappingRules.OP_FIND_OR_CREATE
    ) {
      out.add(new Diagnostic(BLOCKER, id, null, name + ' has no operation.'));
      return;
    }
    if (!d.isCreateable()) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          'You can’t create ' +
            d.getLabelPlural() +
            ', so this form can’t either.'
        )
      );
      return;
    }

    Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
    String matchField = null;
    String onMatch = null;
    if (op == FinalMappingRules.OP_FIND_OR_CREATE) {
      Map<String, Object> match = FinalMappingRules.asMap(action.get('match'));
      if (match == null) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            null,
            name + ' says find or create but has no search set up.'
          )
        );
      } else {
        onMatch = str(match.get('onMatch'));
        matchField = checkMatch(match, d, fieldMap, id, name, ctx, out);
      }
    }

    Set<String> assigned = new Set<String>();
    List<String> overwritable = new List<String>();
    for (Object fo : FinalMappingRules.asList(action.get('fields'))) {
      Map<String, Object> f = FinalMappingRules.asMap(fo);
      String fieldApi = f == null ? null : str(f.get('field'));
      Schema.SObjectField sf = fieldApi == null ? null : fieldMap.get(fieldApi);
      if (sf == null) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fieldApi,
            name +
              ' writes to a field that doesn’t exist' +
              (fieldApi == null ? '.' : ': ' + fieldApi + '.')
          )
        );
        continue;
      }
      Schema.DescribeFieldResult fd = sf.getDescribe();
      if (!assigned.add(fd.getName().toLowerCase())) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name + ' writes to ' + fd.getLabel() + ' twice.'
          )
        );
        continue;
      }
      if (!fd.isCreateable()) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            'You can’t set ' +
              fd.getLabel() +
              ' on ' +
              d.getLabelPlural() +
              ', so this form can’t either.'
          )
        );
      }
      if (f.get('writeOnMatch') == true) {
        if (onMatch != FinalMappingRules.ON_MATCH_UPDATE) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name +
                ' marks ' +
                fd.getLabel() +
                ' to overwrite a found record, but this step doesn’t update found records.'
            )
          );
        } else if (fd.getName().equalsIgnoreCase(matchField)) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name +
                ' can’t overwrite ' +
                fd.getLabel() +
                ' — it’s the field used to find the record.'
            )
          );
        } else if (!fd.isUpdateable()) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              'You can’t edit ' +
                fd.getLabel() +
                ' on ' +
                d.getLabelPlural() +
                ', so this form can’t overwrite it.'
            )
          );
        } else {
          overwritable.add(fd.getLabel());
        }
      }
      checkSource(
        FinalMappingRules.asMap(f.get('source')),
        fd,
        id,
        name,
        ctx,
        out
      );
    }

    for (Schema.SObjectField sf : fieldMap.values()) {
      Schema.DescribeFieldResult fd = sf.getDescribe();
      if (isRequired(fd) && !assigned.contains(fd.getName().toLowerCase())) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ' leaves ' +
              fd.getLabel() +
              ' empty, and Salesforce requires it.'
          )
        );
      }
    }

    if (
      ctx.isPublic &&
      onMatch == FinalMappingRules.ON_MATCH_UPDATE &&
      !overwritable.isEmpty()
    ) {
      out.add(
        new Diagnostic(
          WARNING,
          id,
          null,
          'This form is public. ' +
            name +
            ' overwrites ' +
            String.join(overwritable, ', ') +
            ' on any ' +
            d.getLabel() +
            ' someone matches — without signing in.'
        )
      );
    }
    ctx.earlier.put(id, d.getName());
  }

  /** Returns the match field's API name, or null when it is unusable. */
  private static String checkMatch(
    Map<String, Object> match,
    Schema.DescribeSObjectResult d,
    Map<String, Schema.SObjectField> fieldMap,
    String id,
    String name,
    Context ctx,
    List<Diagnostic> out
  ) {
    String onMatch = str(match.get('onMatch'));
    if (
      onMatch != FinalMappingRules.ON_MATCH_REUSE &&
      onMatch != FinalMappingRules.ON_MATCH_UPDATE
    ) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name + ': choose what happens when a matching record is found.'
        )
      );
    } else if (
      onMatch == FinalMappingRules.ON_MATCH_UPDATE && !d.isUpdateable()
    ) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          'You can’t edit ' +
            d.getLabelPlural() +
            ', so this step can’t update the record it finds.'
        )
      );
    }

    String fieldApi = str(match.get('field'));
    Schema.SObjectField mf = fieldApi == null ? null : fieldMap.get(fieldApi);
    String matchField = null;
    if (mf == null) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          fieldApi,
          name + ' searches on a field that doesn’t exist.'
        )
      );
    } else if (!mf.getDescribe().isFilterable()) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          fieldApi,
          name +
            ' searches on ' +
            mf.getDescribe().getLabel() +
            ', which Salesforce can’t search by.'
        )
      );
    } else {
      matchField = mf.getDescribe().getName();
    }

    Map<String, Object> src = FinalMappingRules.asMap(match.get('source'));
    String key = src == null ? null : str(src.get('elementKey'));
    Map<String, Object> q = key == null ? null : ctx.questions.get(key);
    if (src == null || str(src.get('kind')) != 'answer' || q == null) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          fieldApi,
          name + ' searches using a question that isn’t on this form.'
        )
      );
    } else if (
      mf != null &&
      !FinalMappingRules.isCompatible(
        FinalSubmitService.answerTypeOf(q),
        mf.getDescribe().getType()
      )
    ) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          fieldApi,
          name +
            ': the answer to "' +
            q.get('label') +
            '" can’t be compared with ' +
            mf.getDescribe().getLabel() +
            '.'
        )
      );
    } else if (ctx.skippable.contains(key)) {
      out.add(
        new Diagnostic(
          WARNING,
          id,
          fieldApi,
          name +
            ' searches using "' +
            q.get('label') +
            '", which can be skipped. When it is, this step fails.'
        )
      );
    }

    Map<String, Object> filter = FinalMappingRules.asMap(match.get('filter'));
    if (
      filter == null || FinalMappingRules.asList(filter.get('rows')).isEmpty()
    ) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name +
            ' needs a filter. Searching every ' +
            d.getLabel() +
            ' in the org isn’t allowed.'
        )
      );
    } else if (JSON.serialize(filter).contains('$User.')) {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          null,
          name +
            ' uses the current user in its filter. This step runs in the ' +
            'background, where the current user is whoever submitted — often a site guest.'
        )
      );
    } else {
      FinalLookupService.Compiled c = FinalLookupService.compile(
        new Map<String, Object>{ 'filter' => filter },
        ctx.placeholders,
        d.getName()
      );
      if (c.blocked) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            null,
            name + '’s filter: ' + c.blockedReason
          )
        );
      }
    }
    return matchField;
  }

  private static void checkSource(
    Map<String, Object> src,
    Schema.DescribeFieldResult fd,
    String id,
    String name,
    Context ctx,
    List<Diagnostic> out
  ) {
    String label = fd.getLabel();
    String kind = src == null ? null : str(src.get('kind'));
    if (kind == 'answer') {
      String key = str(src.get('elementKey'));
      Map<String, Object> q = key == null ? null : ctx.questions.get(key);
      if (q == null) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ' fills ' +
              label +
              ' from a question that’s no longer on the form.'
          )
        );
        return;
      }
      if (
        FinalMappingRules.UNMAPPABLE_ELEMENT_TYPES.contains(str(q.get('type')))
      ) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ': "' +
              q.get('label') +
              '" gives more than one value, so it can’t fill ' +
              label +
              '.'
          )
        );
        return;
      }
      String answerType = FinalSubmitService.answerTypeOf(q);
      if (!FinalMappingRules.isCompatible(answerType, fd.getType())) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ': a ' +
              answerType.toLowerCase() +
              ' answer can’t go into ' +
              label +
              '.'
          )
        );
        return;
      }
      if (
        fd.getType() == Schema.DisplayType.PICKLIST ||
        fd.getType() == Schema.DisplayType.MULTIPICKLIST
      ) {
        Set<String> allowed = new Set<String>();
        for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
          if (pe.isActive()) {
            allowed.add(pe.getValue());
          }
        }
        for (String v : FinalMappingRules.optionValues(q)) {
          if (!allowed.contains(v)) {
            out.add(
              new Diagnostic(
                BLOCKER,
                id,
                fd.getName(),
                name +
                  ': "' +
                  v +
                  '" is an option on the form but not a value ' +
                  label +
                  ' accepts.'
              )
            );
            return;
          }
        }
      }
      if (isRequired(fd) && ctx.skippable.contains(key)) {
        out.add(
          new Diagnostic(
            WARNING,
            id,
            fd.getName(),
            name +
              ' fills ' +
              label +
              ', which Salesforce requires, from "' +
              q.get('label') +
              '" — and that question can be skipped. When it is, this step fails.'
          )
        );
      }
    } else if (kind == 'literal') {
      if (fd.getType() == Schema.DisplayType.REFERENCE) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ' fills ' +
              label +
              ' with a fixed value. Point it at another record instead.'
          )
        );
        return;
      }
      try {
        FinalMappingRules.coerce(src.get('value'), fd);
      } catch (FinalMappingRules.MappingValueException e) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name + ': ' + e.getMessage()
          )
        );
      }
    } else if (kind == 'recordRef') {
      if (fd.getType() != Schema.DisplayType.REFERENCE) {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
              ': ' +
              label +
              ' isn’t a lookup, so it can’t point at another record.'
          )
        );
        return;
      }
      String ref = str(src.get('ref'));
      if (ref != null && ref.startsWith('action:')) {
        String target = ctx.earlier.get(ref.substring(7));
        if (target == null) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name +
                ' points ' +
                label +
                ' at a step that comes later or no longer exists.'
            )
          );
        } else if (!refersTo(fd, target)) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name + ': ' + label + ' can’t point at a ' + target + '.'
            )
          );
        }
      } else if (ref == 'link') {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name +
            ': personalized-link records can’t be used in a Freeform mapping yet.'
          )
        );
      } else if (ref != null && ref.startsWith('answer:')) {
        Map<String, Object> q = ctx.questions.get(ref.substring(7));
        Map<String, Object> config = q == null
          ? null
          : FinalMappingRules.asMap(q.get('config'));
        String refTo = config == null ? null : str(config.get('referenceTo'));
        if (q == null) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name +
                ' points ' +
                label +
                ' at a question that’s no longer on the form.'
            )
          );
        } else if (refTo == null || !refersTo(fd, refTo)) {
          out.add(
            new Diagnostic(
              BLOCKER,
              id,
              fd.getName(),
              name +
                ': ' +
                label +
                ' can’t point at the record picked in "' +
                q.get('label') +
                '".'
            )
          );
        }
      } else {
        out.add(
          new Diagnostic(
            BLOCKER,
            id,
            fd.getName(),
            name + ' points ' + label + ' at a record the form can’t identify.'
          )
        );
      }
    } else {
      out.add(
        new Diagnostic(
          BLOCKER,
          id,
          fd.getName(),
          name + ' has no source for ' + label + '.'
        )
      );
    }
  }

  /** The same rule describeFields uses for "must be on the form". */
  private static Boolean isRequired(Schema.DescribeFieldResult fd) {
    return fd.isCreateable() &&
      !fd.isNillable() &&
      !fd.isDefaultedOnCreate() &&
      fd.getType() != Schema.DisplayType.BOOLEAN;
  }

  private static Boolean refersTo(
    Schema.DescribeFieldResult fd,
    String objectApi
  ) {
    for (Schema.SObjectType rt : fd.getReferenceTo()) {
      if (rt.getDescribe().getName().equalsIgnoreCase(objectApi)) {
        return true;
      }
    }
    return false;
  }

  private static Boolean isPublic(Id formId) {
    if (formId == null) {
      return false;
    }
    List<Form__c> forms = [
      SELECT Allowed_Adapters__c
      FROM Form__c
      WHERE Id = :formId
      WITH USER_MODE
    ];
    return !forms.isEmpty() &&
      forms[0].Allowed_Adapters__c != null &&
      forms[0].Allowed_Adapters__c.contains('Public_Guest');
  }

  private static String str(Object o) {
    return o instanceof String && String.isNotBlank((String) o)
      ? (String) o
      : null;
  }
}
```

- [ ] **Step 4: Deploy and run**

Run:

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingValidator.cls --source-dir force-app/main/default/classes/FinalMappingValidatorTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingValidatorTest --result-format human --wait 10
```

Expected: 15 pass. If `aRequiredFieldWithNoSourceBlocks` fails on the label, run
`System.debug(Contact.LastName.getDescribe().getLabel())` in anonymous Apex and use the org's label in
the assertion — orgs can relabel standard fields.

- [ ] **Step 5: Prove the guards bite**

Temporarily change `if (raw.size() > FinalMappingRules.MAX_STEPS)` to `if (false)`, deploy, run
`elevenStepsBlock` — expected FAIL. Revert, redeploy, re-run — expected PASS. Do the same with the
`$User.` branch and `currentUserInAFilterBlocks`.

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/classes/FinalMappingValidator.cls force-app/main/default/classes/FinalMappingValidator.cls-meta.xml force-app/main/default/classes/FinalMappingValidatorTest.cls force-app/main/default/classes/FinalMappingValidatorTest.cls-meta.xml
git commit -m "feat(freeform): F2 M2 - mapping validator"
```

### Task 4: The publish gate, the guest projection, the check the dialog reads

**Files:**

- Modify: `classes/FinalSpecController.cls:95` (after the Autofill validator call)
- Modify: `classes/FinalGuestController.cls:379` (`projectForGuest`)
- Modify: `classes/FinalPublishWarnings.cls` (`forPublish` return type)
- Modify tests: `classes/FinalSpecControllerTest.cls`, `classes/FinalGuestControllerTest.cls`,
  `classes/FinalPublishWarningsTest.cls`

**Interfaces:**

- Consumes: `FinalMappingValidator.validateForPublish`, `FinalMappingValidator.validate`.
- Produces: `FinalPublishWarnings.PublishCheck { @AuraEnabled List<String> blockers; @AuraEnabled List<String> warnings; }`
  returned by `FinalPublishWarnings.forPublish(Id formId, String specJson)`. Task 5 reads it.

- [ ] **Step 1: Write the failing tests**

Add to `classes/FinalSpecControllerTest.cls` (spec test 9 — the gate holds without the dialog):

```apex
    @IsTest
    static void publishSpecRefusesAnUnfinishedMappingCalledDirectly() {
        Map<String, Object> spec = FinalMappingTestData.spec(
            FinalMappingTestData.standardQuestions(),
            new List<Object>{
                FinalMappingTestData.findOrCreateContact('act_a', null)
            }
        );
        Form__c form = new Form__c(Name = 'Gate test', Form_Type__c = 'Freeform');
        insert form;

        Boolean refused = false;
        try {
            FinalSpecController.publishSpec(form.Id, JSON.serialize(spec));
        } catch (AuraHandledException e) {
            refused = true;
            Assert.isTrue(
                e.getMessage().contains('matching record is found'),
                e.getMessage()
            );
        }

        Assert.isTrue(refused, 'no dialog was involved, and publish still refused');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :form.Id],
            'nothing was published'
        );
    }

    @IsTest
    static void publishSpecRefusesElevenSteps() {
        // Spec test 17.
        List<Object> actions = new List<Object>();
        for (Integer i = 0; i < 11; i++) {
            actions.add(FinalMappingTestData.createContact('act_' + i));
        }
        Form__c form = new Form__c(Name = 'Cap test', Form_Type__c = 'Freeform');
        insert form;
        Boolean refused = false;
        try {
            FinalSpecController.publishSpec(
                form.Id,
                JSON.serialize(
                    FinalMappingTestData.spec(
                        FinalMappingTestData.standardQuestions(),
                        actions
                    )
                )
            );
        } catch (AuraHandledException e) {
            refused = e.getMessage().contains('at most 10');
        }
        Assert.isTrue(refused);
    }
```

Add to `classes/FinalGuestControllerTest.cls` (decision 2), next to `gatePassServesProjectedSpec`.
It reuses that file's `makeForm(name, adapters, published, specJson)` and `contactSpec()` helpers:

```apex
    @IsTest
    static void theMappingNeverReachesAGuest() {
        // contactSpec() ends with '}'; splice a mapping in before it.
        String spec =
            contactSpec().removeEnd('}') +
            ',"mapping":{"actions":[{"id":"act_secret","object":"Contact",' +
            '"operation":"create","fields":[]}]}}';
        Form__c f = makeForm('Mapped', 'Public_Guest', true, spec);

        String json = FinalGuestController.getGuestSpec(f.Id);

        Assert.isFalse(json.contains('"mapping"'), 'the mapping leaked to a guest');
        Assert.isFalse(json.contains('act_secret'), 'a step id leaked to a guest');
    }
```

In `classes/FinalPublishWarningsTest.cls`, every one of the 9 calls reads
`List<String> found = FinalPublishWarnings.forPublish(`. Change each to
`List<String> found = FinalPublishWarnings.forPublish(` … `).warnings;` — i.e. append `.warnings`
after the call's closing parenthesis. Then add:

```apex
    @IsTest
    static void mappingBlockersComeBackSeparately() {
        Form__c form = new Form__c(Name = 'Dialog test', Form_Type__c = 'Freeform');
        insert form;
        FinalPublishWarnings.PublishCheck check = FinalPublishWarnings.forPublish(
            form.Id,
            JSON.serialize(
                FinalMappingTestData.spec(
                    FinalMappingTestData.standardQuestions(),
                    new List<Object>{
                        FinalMappingTestData.findOrCreateContact('act_a', null)
                    }
                )
            )
        );
        Assert.areEqual(1, check.blockers.size(), String.join(check.blockers, ' | '));
        Assert.isTrue(check.blockers[0].contains('matching record is found'));
    }
```

- [ ] **Step 2: Deploy the tests to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalSpecControllerTest.cls --source-dir force-app/main/default/classes/FinalPublishWarningsTest.cls --source-dir force-app/main/default/classes/FinalGuestControllerTest.cls`
Expected: FAIL — `Variable does not exist: warnings` / `Invalid type: FinalPublishWarnings.PublishCheck`.

- [ ] **Step 3: Add the gate**

In `classes/FinalSpecController.cls`, directly after:

```apex
        // Server-side Autofill validation (IMPL_PLAN_AUTOFILL_RULES §9)
        FinalAutofillValidator.validateForPublish(formId, spec);
```

add:

```apex

        // Mapping validation (FREEFORM_F2_MAPPING_SPEC D38). This is the gate:
        // the dialog only shows the same results, and an @AuraEnabled method
        // can be called without the dialog.
        FinalMappingValidator.validateForPublish(formId, spec);
```

- [ ] **Step 4: Strip the mapping from the guest projection**

In `classes/FinalGuestController.cls`, first line inside `projectForGuest`:

```apex
        // Which objects and fields a form writes, and how it searches for
        // records, are never a guest's business (F2 plan, decision 2).
        spec.remove('mapping');
```

- [ ] **Step 5: Return blockers beside warnings**

In `classes/FinalPublishWarnings.cls`, add inside the class, above `forPublish`:

```apex
/** What the publish dialog shows: what refuses, then what to know. */
public class PublishCheck {
  @AuraEnabled
  public List<String> blockers = new List<String>();
  @AuraEnabled
  public List<String> warnings = new List<String>();
}
```

Change the signature `public static List<String> forPublish(Id formId, String specJson)` to
`public static PublishCheck forPublish(Id formId, String specJson)`. Add
`PublishCheck check = new PublishCheck();` as its first line. Replace **each** `return warnings;` in
the method with:

```apex
            check.warnings = warnings;
            return check;
```

(indentation matching each site). Immediately before the method's **final** `return`, add:

```apex
        // Mapping (FREEFORM_F2_MAPPING_SPEC section 7): the same validator
        // publishSpec runs, without throwing, so the author sees it first.
        try {
            for (FinalMappingValidator.Diagnostic d : FinalMappingValidator.validate(draft, formId)) {
                if (d.severity == FinalMappingValidator.BLOCKER) {
                    check.blockers.add(d.message);
                } else {
                    warnings.add(d.message);
                }
            }
        } catch (Exception e) {
            check.blockers.add(
                'The mapping couldn’t be checked. Publishing will be refused until it can be.'
            );
        }
```

Update the method's doc comment `@return` line to: `@return blockers (publishing will be refused)
and warnings (plain sentences, in the order an author should read them)`.

- [ ] **Step 6: Deploy and run**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalSpecController.cls --source-dir force-app/main/default/classes/FinalGuestController.cls --source-dir force-app/main/default/classes/FinalPublishWarnings.cls --source-dir force-app/main/default/classes/FinalSpecControllerTest.cls --source-dir force-app/main/default/classes/FinalPublishWarningsTest.cls --source-dir force-app/main/default/classes/FinalGuestControllerTest.cls
sf apex run test --target-org revclouddev --class-names FinalSpecControllerTest --class-names FinalPublishWarningsTest --class-names FinalGuestControllerTest --result-format human --wait 10
```

Expected: all pass, old and new.

- [ ] **Step 7: Prove the gate bites**

Comment out the `FinalMappingValidator.validateForPublish(formId, spec);` line, deploy, run
`publishSpecRefusesAnUnfinishedMappingCalledDirectly` — expected FAIL. Restore, redeploy — PASS.

- [ ] **Step 8: Commit**

```bash
git add force-app/main/default/classes/FinalSpecController.cls force-app/main/default/classes/FinalGuestController.cls force-app/main/default/classes/FinalPublishWarnings.cls force-app/main/default/classes/FinalSpecControllerTest.cls force-app/main/default/classes/FinalPublishWarningsTest.cls force-app/main/default/classes/FinalGuestControllerTest.cls
git commit -m "feat(freeform): F2 M2 - publishSpec refuses a broken mapping; guests never see it"
```

### Task 5: The dialog shows blockers

**Files:**

- Modify: `lwc/finalPublishDialog/finalPublishDialog.js`, `.html`, `.css`
- Modify: `lwc/finalFormStudio/finalFormStudio.js:2694-2740`
- Tests: `lwc/finalPublishDialog/__tests__/finalPublishDialog.test.js`,
  `lwc/finalFormStudio/__tests__/finalFormStudio.test.js`

**Interfaces:**

- Consumes: `FinalPublishWarnings.forPublish` → `{ blockers: string[], warnings: string[] }`.
- Produces: `c-final-publish-dialog` accepts `@api blockers = []`; Publish is disabled while any
  exist.

- [ ] **Step 1: Write the failing dialog tests**

`finalPublishDialog.test.js` has `mount({ formName, warnings })`, `heading(el)`,
`confirmButton(el)` and `flush()`. Extend `mount` to take blockers — change its signature and body to:

```js
function mount({
  formName = 'Untitled Freeform',
  warnings = [],
  blockers = []
} = {}) {
  const el = createElement('c-final-publish-dialog', {
    is: FinalPublishDialog
  });
  el.formName = formName;
  el.warnings = warnings;
  el.blockers = blockers;
  document.body.appendChild(el);
  return el;
}
```

Then append:

```js
describe('blockers', () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it('lists blockers above warnings and disables Publish', async () => {
    const el = mount({
      formName: 'Partner application',
      blockers: [
        'Step 2 (Contact): choose what happens when a matching record is found.'
      ],
      warnings: ['A warning']
    });
    await flush();
    const blockers = el.shadowRoot.querySelectorAll('.pd-blocker');
    expect(blockers).toHaveLength(1);
    expect(blockers[0].textContent).toContain('matching record is found');
    expect(confirmButton(el).disabled).toBe(true);
  });

  it('says what is wrong in the heading', async () => {
    const el = mount({ formName: 'F', blockers: ['a', 'b'] });
    await flush();
    expect(heading(el)).toBe('Fix 2 things before publishing');
  });

  it('keeps Publish enabled with warnings only', async () => {
    const el = mount({ formName: 'F', warnings: ['w'] });
    await flush();
    expect(confirmButton(el).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:unit -- force-app/main/default/lwc/finalPublishDialog`
Expected: FAIL — `.pd-blocker` not found.

- [ ] **Step 3: Implement**

In `finalPublishDialog.js`, add below `@api warnings = [];`:

```js
    /** Reasons publishing will be refused; may be empty. While any exist, Publish is off. */
    @api blockers = [];

    get hasBlockers() {
        return Boolean(this.blockers && this.blockers.length);
    }

    get blockerItems() {
        return (this.blockers || []).map((text, i) => ({ key: `b${i}`, text }));
    }
```

Replace `get question()` and `get heading()` with:

```js
    get question() {
        return this.hasBlockers
            ? `"${this.formName}" can’t be published yet.`
            : `Publish "${this.formName}"?`;
    }

    get heading() {
        const blocked = this.blockers ? this.blockers.length : 0;
        if (blocked === 1) {
            return 'Fix this before publishing';
        }
        if (blocked > 1) {
            return `Fix ${blocked} things before publishing`;
        }
        const count = this.warnings ? this.warnings.length : 0;
        if (count === 0) {
            return 'Publish form';
        }
        if (count === 1) {
            return 'One thing to know before publishing';
        }
        return `${count} things to know before publishing`;
    }
```

In `finalPublishDialog.html`, directly after `<p class="pd-question">{question}</p>`:

```html
<template lwc:if={hasBlockers}>
  <ul class="pd-blockers">
    <template for:each={blockerItems} for:item="item">
      <li key={item.key} class="pd-blocker">
        <lightning-icon
          icon-name="utility:error"
          variant="error"
          size="x-small"
          alternative-text="Must fix"
          class="pd-blocker-icon"
        ></lightning-icon>
        <span class="pd-blocker-text">{item.text}</span>
      </li>
    </template>
  </ul>
</template>
```

and give the Publish button `disabled={hasBlockers}`:

```html
<lightning-button
  label={confirmLabel}
  variant="brand"
  disabled={hasBlockers}
  onclick={handlePublish}
></lightning-button>
```

Append to `finalPublishDialog.css`:

```css
.pd-blockers {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
}
.pd-blocker {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.375rem 0;
}
.pd-blocker-icon {
  flex-shrink: 0;
  margin-top: 0.125rem;
}
```

- [ ] **Step 4: Update the Studio call site**

In `finalFormStudio.js`, replace `_publishWarnings()` (line 2694) with:

```js
    async _publishCheck() {
        try {
            const found = await publishWarnings({
                formId: this.formId,
                specJson: JSON.stringify(this.spec)
            });
            return {
                blockers: (found && found.blockers) || [],
                warnings: (found && found.warnings) || []
            };
        } catch (e) {
            // publishSpec is the gate (F2 D38), so a failed check only costs
            // the author the preview of what publish would refuse.
            // eslint-disable-next-line no-console
            console.error('Publish warnings unavailable:', e);
            return { blockers: [], warnings: [] };
        }
    }
```

In `handlePublish`, replace `const warnings = await this._publishWarnings();` and the
`FinalPublishDialog.open({...})` call with:

```js
const { blockers, warnings } = await this._publishCheck();
const ok = await FinalPublishDialog.open({
  size: 'small',
  label: blockers.length
    ? 'Can’t publish yet'
    : warnings.length
      ? 'Publish anyway?'
      : 'Publish form',
  formName: this.formName,
  blockers,
  warnings
});
```

- [ ] **Step 5: Update the Studio tests**

In `finalFormStudio.test.js`, three publish mocks use the old array shape. Change them:

- line 2083: `publishWarnings.mockReset().mockResolvedValue([]);` →
  `publishWarnings.mockReset().mockResolvedValue({ blockers: [], warnings: [] });`
- line 2306: `publishWarnings.mockResolvedValue([ … ]);` →
  `publishWarnings.mockResolvedValue({ blockers: [], warnings: [ … ] });` (same two strings)
- line 2325: `publishWarnings.mockResolvedValue(['a consequence']);` →
  `publishWarnings.mockResolvedValue({ blockers: [], warnings: ['a consequence'] });`

The `mockRejectedValue` at line 2336 stays. Then add, inside the same `describe` block (it defines
`ready()`, `publish(element)` and uses `micro(12)`), right after
`'hands consequences to the dialog that can list them'`:

```js
it('passes blockers to the dialog', async () => {
  publishWarnings.mockResolvedValue({
    blockers: ['Step 1 (Contact) has no operation.'],
    warnings: []
  });
  const element = await ready();
  publish(element);
  await micro(12);

  const opened = FinalPublishDialog.open.mock.calls[0][0];
  expect(opened.label).toBe('Can’t publish yet');
  expect(opened.blockers).toEqual(['Step 1 (Contact) has no operation.']);
});
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:unit -- force-app/main/default/lwc/finalPublishDialog force-app/main/default/lwc/finalFormStudio`
Expected: all pass.

- [ ] **Step 7: Deploy and verify in the org**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/lwc/finalPublishDialog --source-dir force-app/main/default/lwc/finalFormStudio
```

Open `/apex/FinalStudio?c__formId=<any Freeform draft id>`, publish with no mapping — the dialog
looks exactly as before. (A blocker can't be produced from the UI until Task 16; Task 17 checks it
end to end.)

- [ ] **Step 8: Commit, PR, merge the M2 slice**

```bash
git add force-app/main/default/lwc/finalPublishDialog force-app/main/default/lwc/finalFormStudio/finalFormStudio.js force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js
git commit -m "feat(freeform): F2 M2 - publish dialog shows blockers"
git push -u origin feat/f2-m2-publish-gate
```

Open the PR (list tests 9, 10, 17 as covered), merge.

---

## M6 — Runtime

### Task 6: `FinalMappingWriter` — the fence

**Files:**

- Create: `classes/FinalMappingWriter.cls`
- Test: `classes/FinalMappingWriterTest.cls`

**Interfaces:**

- Consumes: `FinalMappingRules.asList`, `asMap`, `ON_MATCH_UPDATE`.
- Produces:
  - `FinalMappingWriter(List<Map<String, Object>> actions)`
  - `Id insertFor(String actionId, SObject record)`
  - `void updateFor(String actionId, SObject record)`
  - `class FenceException extends Exception`

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingWriterTest.cls`:

```apex
/**
 * The fence (D36): system mode skips the permission check, so this list is
 * the only thing deciding what a mapping may write. Spec tests 1 and 2.
 */
@IsTest
private class FinalMappingWriterTest {
  private static FinalMappingWriter writer() {
    return new FinalMappingWriter(
      new List<Map<String, Object>>{
        FinalMappingTestData.createContact('act_a'),
        FinalMappingTestData.findOrCreateContact('act_b', 'update')
      }
    );
  }

  @IsTest
  static void anObjectNotInTheStepIsRefused() {
    // Test 1. A Form__c claiming to be step act_a's record.
    try {
      writer().insertFor('act_a', new Form__c(Name = 'Smuggled'));
      Assert.fail('a stranger must not get through');
    } catch (FinalMappingWriter.FenceException e) {
      Assert.isTrue(e.getMessage().contains('Form__c'), e.getMessage());
    }
    Assert.areEqual(0, [SELECT COUNT() FROM Form__c WHERE Name = 'Smuggled']);
  }

  @IsTest
  static void aFieldNotInTheStepIsRefusedOnAnAllowedObject() {
    // Test 2. Contact is allowed; Title is not one of act_a's fields.
    try {
      writer()
        .insertFor(
          'act_a',
          new Contact(LastName = 'Ok', Title = 'Not allowed')
        );
      Assert.fail('an unlisted field must not get through');
    } catch (FinalMappingWriter.FenceException e) {
      Assert.isTrue(e.getMessage().contains('Title'), e.getMessage());
    }
  }

  @IsTest
  static void anUnknownStepIsRefused() {
    try {
      writer().insertFor('act_nope', new Contact(LastName = 'x'));
      Assert.fail('a step not in the published mapping must not write');
    } catch (FinalMappingWriter.FenceException e) {
      Assert.isTrue(e.getMessage().contains('act_nope'));
    }
  }

  @IsTest
  static void anUpdateMayOnlyTouchWriteOnMatchFields() {
    Contact existing = new Contact(
      LastName = 'Existing',
      Email = 'e@example.com'
    );
    insert existing;
    try {
      // Title has no writeOnMatch flag in the fixture.
      writer().updateFor('act_b', new Contact(Id = existing.Id, Title = 'x'));
      Assert.fail('an update is limited to fields flagged writeOnMatch');
    } catch (FinalMappingWriter.FenceException e) {
      Assert.isTrue(e.getMessage().contains('Title'));
    }
  }

  @IsTest
  static void listedFieldsGoThrough() {
    Id created = writer()
      .insertFor(
        'act_a',
        new Contact(LastName = 'Allowed', Email = 'a@example.com')
      );
    Assert.areEqual(
      'Allowed',
      [SELECT LastName FROM Contact WHERE Id = :created].LastName
    );
  }
}
```

- [ ] **Step 2: Deploy to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingWriterTest.cls`
Expected: FAIL — `Invalid type: FinalMappingWriter`.

- [ ] **Step 3: Write the fence**

`classes/FinalMappingWriter.cls`:

```apex
/**
 * FinalMappingWriter — the only code that writes a mapping's records (D36).
 *
 * It writes in system mode, because a site guest can create nothing, so it
 * replaces the permission check with an explicit list: the published
 * version's own steps. A record whose object, or any populated field, is
 * not in the step it claims to belong to is refused before any DML.
 *
 * Duplicate rules still apply to every write here. allowSave is never set
 * (D40): the org's rules outrank the form.
 */
public without sharing class FinalMappingWriter {
  public class FenceException extends Exception {
  }

  private final Map<String, Map<String, Object>> actionsById = new Map<String, Map<String, Object>>();

  public FinalMappingWriter(List<Map<String, Object>> actions) {
    for (Map<String, Object> a : actions) {
      if (a.get('id') instanceof String) {
        actionsById.put((String) a.get('id'), a);
      }
    }
  }

  public Id insertFor(String actionId, SObject record) {
    check(actionId, record, false);
    Database.insert(record, true, AccessLevel.SYSTEM_MODE);
    return record.Id;
  }

  public void updateFor(String actionId, SObject record) {
    check(actionId, record, true);
    Database.update(record, true, AccessLevel.SYSTEM_MODE);
  }

  private void check(String actionId, SObject record, Boolean isUpdate) {
    Map<String, Object> action = actionsById.get(actionId);
    if (action == null) {
      throw new FenceException(
        'Step ' + actionId + ' isn’t in the published mapping.'
      );
    }
    String objectName = record.getSObjectType().getDescribe().getName();
    if (!objectName.equalsIgnoreCase(String.valueOf(action.get('object')))) {
      throw new FenceException(
        objectName + ' isn’t the object step ' + actionId + ' writes.'
      );
    }
    Set<String> allowed = allowedFields(action, isUpdate);
    for (String field : record.getPopulatedFieldsAsMap().keySet()) {
      if (field.equalsIgnoreCase('Id')) {
        continue;
      }
      if (!allowed.contains(field.toLowerCase())) {
        throw new FenceException(
          field + ' isn’t a field step ' + actionId + ' may write.'
        );
      }
    }
  }

  private static Set<String> allowedFields(
    Map<String, Object> action,
    Boolean isUpdate
  ) {
    Set<String> out = new Set<String>();
    if (isUpdate) {
      Map<String, Object> match = FinalMappingRules.asMap(action.get('match'));
      if (
        match == null ||
        match.get('onMatch') != FinalMappingRules.ON_MATCH_UPDATE
      ) {
        return out; // reuse: nothing may be written to a found record
      }
    }
    for (Object o : FinalMappingRules.asList(action.get('fields'))) {
      Map<String, Object> f = FinalMappingRules.asMap(o);
      if (f == null || !(f.get('field') instanceof String)) {
        continue;
      }
      if (isUpdate && f.get('writeOnMatch') != true) {
        continue;
      }
      out.add(((String) f.get('field')).toLowerCase());
    }
    if (isUpdate) {
      Object matchField = FinalMappingRules.asMap(action.get('match'))
        .get('field');
      if (matchField instanceof String) {
        out.remove(((String) matchField).toLowerCase());
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Deploy and run**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingWriter.cls --source-dir force-app/main/default/classes/FinalMappingWriterTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingWriterTest --result-format human --wait 10
```

Expected: 5 pass.

- [ ] **Step 5: Prove the fence bites**

Replace the body of `check(...)` with `return;`, deploy, run — tests 1, 2 and the update test FAIL.
Restore, redeploy, PASS.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/f2-m6-runtime
git add force-app/main/default/classes/FinalMappingWriter.cls force-app/main/default/classes/FinalMappingWriter.cls-meta.xml force-app/main/default/classes/FinalMappingWriterTest.cls force-app/main/default/classes/FinalMappingWriterTest.cls-meta.xml
git commit -m "feat(freeform): F2 M6 - the mapping writer's fence"
```

### Task 7: `FinalMappingService` — one run

**Files:**

- Create: `classes/FinalMappingService.cls`
- Test: `classes/FinalMappingServiceTest.cls`

**Interfaces:**

- Consumes: `FinalMappingRules.*`, `FinalMappingWriter`, `FinalLookupService.compile`.
- Produces:
  - `class Result { @AuraEnabled String status; @AuraEnabled String message; }`
  - `static Result run(Id submissionId)` — never throws a caught failure; limit exceptions escape
    by design (D43)

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingServiceTest.cls`:

```apex
/**
 * One mapping run (FREEFORM_F2_MAPPING_SPEC 6.4). run() is called directly:
 * these prove the service, the trigger has its own tests. The job the
 * trigger queues on insert never runs here — nothing calls Test.stopTest.
 */
@IsTest
private class FinalMappingServiceTest {
  private static Id arrange(List<Object> actions, Map<String, String> answers) {
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(
        FinalMappingTestData.standardQuestions(),
        actions
      )
    );
    return FinalMappingTestData.submit(answers);
  }

  private static Map<String, String> jane() {
    return new Map<String, String>{
      'el_last' => 'Jane',
      'el_email' => 'jane@example.com',
      'el_title' => 'CTO'
    };
  }

  @IsTest
  static void aCreateStepMakesTheRecordAndRecordsIt() {
    Id subId = arrange(
      new List<Object>{ FinalMappingTestData.createContact('act_a') },
      jane()
    );

    FinalMappingService.Result r = FinalMappingService.run(subId);

    Assert.areEqual('Done', r.status, r.message);
    Contact c = [
      SELECT LastName, Email
      FROM Contact
      WHERE Email = 'jane@example.com'
    ];
    Assert.areEqual('Jane', c.LastName);
    Form_Submission__c sub = FinalMappingTestData.reload(subId);
    Assert.areEqual(1, sub.Mapping_Attempts__c);
    Map<String, Object> created = (Map<String, Object>) JSON.deserializeUntyped(
      sub.Created_Records__c
    );
    Assert.areEqual(String.valueOf(c.Id), created.get('act_a'));
  }

  @IsTest
  static void twoMatchesWriteNothing() {
    // Test 3 (D33).
    insert new List<Contact>{
      new Contact(LastName = 'One', Email = 'jane@example.com'),
      new Contact(LastName = 'Two', Email = 'jane@example.com')
    };
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'update')
      },
      jane()
    );

    FinalMappingService.Result r = FinalMappingService.run(subId);

    Assert.areEqual('Failed', r.status);
    Assert.isTrue(r.message.contains('more than one'), r.message);
    Assert.areEqual(
      2,
      [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
    );
  }

  @IsTest
  static void aFailedRunKeepsItsAttemptAndSaysWhy() {
    // Test 4: the savepoint sits after the attempts write.
    insert new List<Contact>{
      new Contact(LastName = 'One', Email = 'jane@example.com'),
      new Contact(LastName = 'Two', Email = 'jane@example.com')
    };
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
      },
      jane()
    );

    FinalMappingService.run(subId);

    Form_Submission__c sub = FinalMappingTestData.reload(subId);
    Assert.areEqual('Failed', sub.Mapping_Status__c);
    Assert.areEqual(
      1,
      sub.Mapping_Attempts__c,
      'the attempt survived the rollback'
    );
    Assert.isTrue(String.isNotBlank(sub.Mapping_Message__c));
  }

  @IsTest
  static void runningTwiceMakesOneSetOfRecords() {
    // Test 5.
    Id subId = arrange(
      new List<Object>{ FinalMappingTestData.createContact('act_a') },
      jane()
    );
    FinalMappingService.run(subId);
    FinalMappingService.Result second = FinalMappingService.run(subId);
    Assert.areEqual('Done', second.status);
    Assert.isTrue(second.message.contains('Nothing to run'), second.message);
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
    );
  }

  @IsTest
  static void aRecordRefPointsAtTheEarlierStepsRecord() {
    // Test 6, created case.
    Map<String, Object> manager = FinalMappingTestData.createContact('act_a');
    Map<String, Object> report = new Map<String, Object>{
      'id' => 'act_b',
      'object' => 'Contact',
      'operation' => 'create',
      'fields' => new List<Object>{
        FinalMappingTestData.field(
          'LastName',
          FinalMappingTestData.literal('Report')
        ),
        FinalMappingTestData.field(
          'ReportsToId',
          FinalMappingTestData.ref('action:act_a')
        )
      }
    };
    Id subId = arrange(new List<Object>{ manager, report }, jane());

    FinalMappingService.run(subId);

    Contact boss = [SELECT Id FROM Contact WHERE Email = 'jane@example.com'];
    Assert.areEqual(
      boss.Id,
      [SELECT ReportsToId FROM Contact WHERE LastName = 'Report'].ReportsToId
    );
  }

  @IsTest
  static void aRecordRefPointsAtTheRecordAnEarlierStepFound() {
    // Test 6, found case.
    Contact existing = new Contact(
      LastName = 'Already here',
      Email = 'jane@example.com'
    );
    insert existing;
    Map<String, Object> report = new Map<String, Object>{
      'id' => 'act_b',
      'object' => 'Contact',
      'operation' => 'create',
      'fields' => new List<Object>{
        FinalMappingTestData.field(
          'LastName',
          FinalMappingTestData.literal('Report')
        ),
        FinalMappingTestData.field(
          'ReportsToId',
          FinalMappingTestData.ref('action:act_a')
        )
      }
    };
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'reuse'),
        report
      },
      jane()
    );

    FinalMappingService.run(subId);

    Assert.areEqual(
      existing.Id,
      [SELECT ReportsToId FROM Contact WHERE LastName = 'Report'].ReportsToId
    );
  }

  @IsTest
  static void reuseWritesNothingToTheMatch() {
    // Test 7.
    Contact existing = new Contact(
      LastName = 'Original',
      Email = 'jane@example.com',
      Title = 'Old'
    );
    insert existing;
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
      },
      jane()
    );

    FinalMappingService.run(subId);

    Contact after = [
      SELECT LastName, Title
      FROM Contact
      WHERE Id = :existing.Id
    ];
    Assert.areEqual('Original', after.LastName);
    Assert.areEqual('Old', after.Title);
    Assert.areEqual(1, [SELECT COUNT() FROM Contact], 'no duplicate was made');
  }

  @IsTest
  static void updateWritesOnlyFlaggedFieldsAndNeverTheMatchField() {
    // Test 8.
    Contact existing = new Contact(
      LastName = 'Original',
      Email = 'jane@example.com',
      Title = 'Old'
    );
    insert existing;
    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'update'
    );
    for (Object o : (List<Object>) action.get('fields')) {
      Map<String, Object> f = (Map<String, Object>) o;
      if (f.get('field') == 'Title') {
        f.put('writeOnMatch', true);
      }
    }
    Id subId = arrange(new List<Object>{ action }, jane());

    FinalMappingService.run(subId);

    Contact after = [
      SELECT LastName, Email, Title
      FROM Contact
      WHERE Id = :existing.Id
    ];
    Assert.areEqual('CTO', after.Title, 'the flagged field was written');
    Assert.areEqual(
      'Original',
      after.LastName,
      'an unflagged field was left alone'
    );
    Assert.areEqual('jane@example.com', after.Email);
  }

  @IsTest
  static void aSkippedAnswerLeavesTheFieldAlone() {
    // Test 13 (D44).
    Contact existing = new Contact(
      LastName = 'Original',
      Email = 'jane@example.com',
      Title = 'Keep me'
    );
    insert existing;
    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'update'
    );
    for (Object o : (List<Object>) action.get('fields')) {
      ((Map<String, Object>) o)
        .put('writeOnMatch', ((Map<String, Object>) o).get('field') == 'Title');
    }
    Map<String, String> answers = jane();
    answers.put('el_title', null); // skipped: no row at all
    Id subId = arrange(new List<Object>{ action }, answers);

    FinalMappingService.Result r = FinalMappingService.run(subId);

    Assert.areEqual('Done', r.status, r.message);
    Assert.areEqual(
      'Keep me',
      [SELECT Title FROM Contact WHERE Id = :existing.Id].Title
    );
  }

  @IsTest
  static void aBlankMatchValueFailsWithoutSearching() {
    // Test 14 (D44).
    Contact noEmail = new Contact(LastName = 'No email');
    insert noEmail;
    Map<String, String> answers = jane();
    answers.put('el_email', null);
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'update')
      },
      answers
    );

    FinalMappingService.Result r = FinalMappingService.run(subId);

    Assert.areEqual('Failed', r.status);
    Assert.isTrue(r.message.contains('left blank'), r.message);
    Assert.areEqual(
      'No email',
      [SELECT LastName FROM Contact WHERE Id = :noEmail.Id].LastName
    );
  }

  @IsTest
  static void aChoiceIsSearchedTheWayItIsWritten() {
    // Write the label, search the value, and every submission quietly makes
    // another Contact. Both paths go through the one conversion now.
    Map<String, Object> action = new Map<String, Object>{
      'id' => 'act_a',
      'object' => 'Contact',
      'operation' => 'findOrCreate',
      'match' => new Map<String, Object>{
        'field' => 'Title',
        'source' => FinalMappingTestData.answer('el_tier'),
        'filter' => FinalMappingTestData.anyNamedContact(),
        'onMatch' => 'reuse'
      },
      'fields' => new List<Object>{
        FinalMappingTestData.field(
          'LastName',
          FinalMappingTestData.answer('el_last')
        ),
        FinalMappingTestData.field(
          'Title',
          FinalMappingTestData.answer('el_tier')
        )
      }
    };
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(
        new List<Object>{
          FinalMappingTestData.question('el_last', 'text', 'Your surname'),
          tierQuestion()
        },
        new List<Object>{ action }
      )
    );

    FinalMappingService.run(tierSubmission());
    FinalMappingService.Result second = FinalMappingService.run(
      tierSubmission()
    );

    Assert.areEqual('Done', second.status, second.message);
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Contact WHERE Title = 'Priority customer'],
      'the second submission found the first one’s Contact'
    );
  }

  @IsTest
  static void aFilterConvertsAnAnswerInsideAnIsOneOfList() {
    // "is one of" keeps its entries in `values`, which the compiler never
    // resolves tokens inside. Unconverted, the search compares Title with
    // the literal text "$field.el_tier", matches nothing, and quietly makes
    // a second Contact.
    Contact existing = new Contact(
      LastName = 'Existing',
      Email = 'jane@example.com',
      Title = 'Priority customer'
    );
    insert existing;

    Map<String, Object> action = FinalMappingTestData.findOrCreateContact(
      'act_a',
      'reuse'
    );
    ((Map<String, Object>) action.get('match'))
      .put(
        'filter',
        new Map<String, Object>{
          'logic' => 'all',
          'rows' => new List<Object>{
            new Map<String, Object>{
              'fieldPath' => 'Title',
              'operator' => 'in',
              'values' => new List<Object>{ '$field.el_tier' }
            }
          }
        }
      );
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(
        new List<Object>{
          FinalMappingTestData.question('el_last', 'text', 'Your surname'),
          FinalMappingTestData.question('el_email', 'email', 'Work email'),
          tierQuestion()
        },
        new List<Object>{ action }
      )
    );

    FinalMappingService.Result r = FinalMappingService.run(tierSubmission());

    Assert.areEqual('Done', r.status, r.message);
    Assert.areEqual(1, [SELECT COUNT() FROM Contact], 'it found the one that exists');
  }

  private static Map<String, Object> tierQuestion() {
    return new Map<String, Object>{
      'id' => 'el_tier',
      'type' => 'field',
      'label' => 'Tier',
      'required' => true,
      'config' => new Map<String, Object>{
        'inputType' => 'picklist',
        'options' => new List<Object>{
          new Map<String, Object>{
            'value' => 'vip',
            'label' => 'Priority customer'
          }
        }
      }
    };
  }

  /** A submission whose tier answer is a stored choice value. */
  private static Id tierSubmission() {
    Id subId = FinalMappingTestData.submit(
      new Map<String, String>{
        'el_last' => 'Jane',
        'el_email' => 'jane@example.com',
        'el_tier' => 'vip'
      }
    );
    update new Form_Submission_Answer__c(
      Id = [
        SELECT Id
        FROM Form_Submission_Answer__c
        WHERE Form_Submission__c = :subId AND Element_Key__c = 'el_tier'
      ]
      .Id,
      Answer_Type__c = 'Choice'
    );
    return subId;
  }

  @IsTest
  static void aFailureLeavesTheSubmissionAndAnswers() {
    // Test 15.
    insert new List<Contact>{
      new Contact(LastName = 'One', Email = 'jane@example.com'),
      new Contact(LastName = 'Two', Email = 'jane@example.com')
    };
    Id subId = arrange(
      new List<Object>{
        FinalMappingTestData.findOrCreateContact('act_a', 'reuse')
      },
      jane()
    );

    FinalMappingService.run(subId);

    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Form_Submission__c WHERE Id = :subId]
    );
    Assert.areEqual(
      3,
      [
        SELECT COUNT()
        FROM Form_Submission_Answer__c
        WHERE Form_Submission__c = :subId
      ]
    );
  }

  @IsTest
  static void aLaterStepFailingUndoesTheEarlierOnes() {
    // All-or-nothing per submission (FREEFORM_SPEC F2 contract 4).
    insert new List<Contact>{
      new Contact(LastName = 'One', Email = 'dup@example.com'),
      new Contact(LastName = 'Two', Email = 'dup@example.com')
    };
    Map<String, Object> second = FinalMappingTestData.findOrCreateContact(
      'act_b',
      'reuse'
    );
    ((Map<String, Object>) second.get('match'))
      .put('source', FinalMappingTestData.answer('el_title'));
    Map<String, String> answers = jane();
    answers.put('el_title', 'dup@example.com');
    Id subId = arrange(
      new List<Object>{ FinalMappingTestData.createContact('act_a'), second },
      answers
    );

    FinalMappingService.Result r = FinalMappingService.run(subId);

    Assert.areEqual('Failed', r.status);
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com'],
      'step 1 was rolled back'
    );
  }
}
```

- [ ] **Step 2: Deploy to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingServiceTest.cls`
Expected: FAIL — `Invalid type: FinalMappingService.Result`.

- [ ] **Step 3: Write the service**

`classes/FinalMappingService.cls`:

```apex
/**
 * FinalMappingService — one mapping run for one submission
 * (FREEFORM_F2_MAPPING_SPEC 6.4).
 *
 * Called by FinalMappingJob, which the trigger queues, and directly by
 * FinalMappingRetryController. without sharing: the job runs as whoever
 * queued it — a site guest for a new submission — and must read the
 * submission, its version and its answers regardless. Both entry points
 * identify the submission on the server; the retry controller checks
 * permission and visibility before calling in.
 *
 * Caught failures roll back to the savepoint and record Failed with a
 * message. Limit exceptions cannot be caught; they roll back everything
 * and leave the status as it was (D43).
 */
public without sharing class FinalMappingService {
  public class Result {
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String message;

    public Result(String status, String message) {
      this.status = status;
      this.message = message;
    }
  }

  /** A step failed; the message is already a sentence an admin can act on. */
  public class StepException extends Exception {
  }

  public static Result run(Id submissionId) {
    List<Form_Submission__c> rows = [
      SELECT Id, Mapping_Status__c, Mapping_Attempts__c, Form_Version__c
      FROM Form_Submission__c
      WHERE Id = :submissionId
      WITH SYSTEM_MODE
      FOR UPDATE
    ];
    if (rows.isEmpty()) {
      return new Result(null, 'That submission no longer exists.');
    }
    Form_Submission__c sub = rows[0];
    if (!FinalMappingRules.RUNNABLE.contains(sub.Mapping_Status__c)) {
      return new Result(
        sub.Mapping_Status__c,
        'Nothing to run: this submission is ' +
          (sub.Mapping_Status__c == null
            ? 'not set up for mapping'
            : sub.Mapping_Status__c) +
          '.'
      );
    }

    sub.Mapping_Attempts__c =
      (sub.Mapping_Attempts__c == null ? 0 : sub.Mapping_Attempts__c) + 1;
    Database.update(
      new Form_Submission__c(
        Id = sub.Id,
        Mapping_Attempts__c = sub.Mapping_Attempts__c
      ),
      true,
      AccessLevel.SYSTEM_MODE
    );
    // After the attempts write, so a rollback keeps the count (6.4).
    Savepoint sp = Database.setSavepoint();
    try {
      Map<String, Id> recordIds = execute(sub);
      Database.update(
        new Form_Submission__c(
          Id = sub.Id,
          Mapping_Status__c = FinalMappingRules.STATUS_DONE,
          Mapping_Message__c = null,
          Mapping_Run_At__c = Datetime.now(),
          Created_Records__c = JSON.serialize(recordIds)
        ),
        true,
        AccessLevel.SYSTEM_MODE
      );
      return new Result(FinalMappingRules.STATUS_DONE, null);
    } catch (Exception e) {
      Database.rollback(sp);
      String message = e.getMessage().abbreviate(32768);
      // Never reuse in-memory records after a rollback: their Ids point
      // at rows that no longer exist. Status only (6.4).
      Database.update(
        new Form_Submission__c(
          Id = sub.Id,
          Mapping_Status__c = FinalMappingRules.STATUS_FAILED,
          Mapping_Message__c = message,
          Mapping_Run_At__c = Datetime.now()
        ),
        true,
        AccessLevel.SYSTEM_MODE
      );
      return new Result(FinalMappingRules.STATUS_FAILED, message);
    }
  }

  private static Map<String, Id> execute(Form_Submission__c sub) {
    Form_Version__c version = [
      SELECT Spec_JSON__c
      FROM Form_Version__c
      WHERE Id = :sub.Form_Version__c
      WITH SYSTEM_MODE
    ];
    Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
      version.Spec_JSON__c
    );
    List<Map<String, Object>> actions = FinalMappingRules.actionsOf(spec);
    Run run = new Run();
    run.questions = FinalMappingRules.questionMap(spec);
    run.answers = answersOf(sub.Id);
    run.writer = new FinalMappingWriter(actions);

    Integer index = 0;
    for (Map<String, Object> action : actions) {
      index++;
      String objectApi = String.valueOf(action.get('object'));
      String name = 'Step ' + index + ' (' + objectApi + ')';
      Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApi);
      if (t == null) {
        throw new StepException(name + ': the object no longer exists.');
      }
      try {
        run.recordIds.put(
          (String) action.get('id'),
          runStep(action, t.getDescribe(), run)
        );
      } catch (StepException e) {
        throw new StepException(name + ': ' + e.getMessage());
      } catch (DmlException e) {
        throw new StepException(
          name + ': ' + dmlSentence(e, t.getDescribe().getLabel())
        );
      } catch (FinalMappingRules.MappingValueException e) {
        throw new StepException(name + ': ' + e.getMessage());
      } catch (FinalMappingWriter.FenceException e) {
        throw new StepException(name + ': ' + e.getMessage());
      }
    }
    return run.recordIds;
  }

  private class Run {
    Map<String, Map<String, Object>> questions;
    Map<String, Form_Submission_Answer__c> answers;
    FinalMappingWriter writer;
    Map<String, Id> recordIds = new Map<String, Id>();
  }

  private static Id runStep(
    Map<String, Object> action,
    Schema.DescribeSObjectResult d,
    Run run
  ) {
    String actionId = (String) action.get('id');
    if (action.get('operation') == FinalMappingRules.OP_FIND_OR_CREATE) {
      Map<String, Object> match = FinalMappingRules.asMap(action.get('match'));
      Id found = findOne(match, d, run);
      if (found != null) {
        if (match.get('onMatch') == FinalMappingRules.ON_MATCH_UPDATE) {
          SObject rec = d.getSObjectType().newSObject(found);
          if (fill(rec, action, d, run, true) > 0) {
            run.writer.updateFor(actionId, rec);
          }
        }
        return found;
      }
    }
    SObject rec = d.getSObjectType().newSObject();
    fill(rec, action, d, run, false);
    return run.writer.insertFor(actionId, rec);
  }

  /** Puts each resolvable value on the record; returns how many. */
  private static Integer fill(
    SObject rec,
    Map<String, Object> action,
    Schema.DescribeSObjectResult d,
    Run run,
    Boolean updating
  ) {
    Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
    Integer written = 0;
    for (Object o : FinalMappingRules.asList(action.get('fields'))) {
      Map<String, Object> f = FinalMappingRules.asMap(o);
      if (f == null || (updating && f.get('writeOnMatch') != true)) {
        continue;
      }
      String fieldApi = String.valueOf(f.get('field'));
      Schema.SObjectField sf = fieldMap.get(fieldApi);
      if (sf == null) {
        throw new StepException(fieldApi + ' no longer exists.');
      }
      Schema.DescribeFieldResult fd = sf.getDescribe();
      Object value = sourceValue(
        FinalMappingRules.asMap(f.get('source')),
        fd,
        run
      );
      if (value == null) {
        continue; // a skipped answer never writes (D44)
      }
      rec.put(fd.getName(), FinalMappingRules.coerce(value, fd));
      written++;
    }
    return written;
  }

  private static Object sourceValue(
    Map<String, Object> src,
    Schema.DescribeFieldResult fd,
    Run run
  ) {
    String kind = String.valueOf(src.get('kind'));
    if (kind == 'literal') {
      Object v = src.get('value');
      return v == null || String.isBlank(String.valueOf(v)) ? null : v;
    }
    if (kind == 'recordRef') {
      String ref = String.valueOf(src.get('ref'));
      Id target = null;
      if (ref.startsWith('action:')) {
        target = run.recordIds.get(ref.substring(7));
      } else if (ref.startsWith('answer:')) {
        Form_Submission_Answer__c a = run.answers.get(ref.substring(7));
        if (a != null && String.isNotBlank(a.Text_Value__c)) {
          try {
            target = Id.valueOf(a.Text_Value__c);
          } catch (Exception e) {
            throw new StepException(
              'the record picked for ' + fd.getLabel() + ' isn’t a record id.'
            );
          }
        }
      }
      if (target == null) {
        return null;
      }
      for (Schema.SObjectType rt : fd.getReferenceTo()) {
        if (rt == target.getSobjectType()) {
          return target;
        }
      }
      throw new StepException(
        fd.getLabel() +
          ' can’t point at a ' +
          target.getSobjectType().getDescribe().getLabel() +
          '.'
      );
    }
    String key = String.valueOf(src.get('elementKey'));
    Form_Submission_Answer__c a = run.answers.get(key);
    if (a == null) {
      return null;
    }
    Map<String, Object> q = run.questions.get(key);
    if (a.Value_Unparsed__c == true) {
      if (FinalMappingRules.isTextLike(fd.getType())) {
        return String.isBlank(a.Text_Value__c) ? null : a.Text_Value__c;
      }
      throw new StepException(
        'the answer to "' +
          labelOf(q) +
          '" couldn’t be read as ' +
          a.Answer_Type__c +
          ', so it can’t go into ' +
          fd.getLabel() +
          '.'
      );
    }
    // One conversion, against the field this value is going into.
    return FinalMappingRules.answerValue(a, q, fd);
  }

  private static Id findOne(
    Map<String, Object> match,
    Schema.DescribeSObjectResult d,
    Run run
  ) {
    Map<String, Object> src = FinalMappingRules.asMap(match.get('source'));
    Schema.SObjectField mf = d.fields.getMap()
      .get(String.valueOf(match.get('field')));
    if (mf == null) {
      throw new StepException('the field it searches on no longer exists.');
    }
    String key = String.valueOf(src.get('elementKey'));
    // The SAME conversion the write uses, against the field being searched:
    // a choice written as a label must not be searched as its value.
    Object matchValue = FinalMappingRules.answerValue(
      run.answers.get(key),
      run.questions.get(key),
      mf.getDescribe()
    );
    if (matchValue == null) {
      // Never search for a blank value: it matches every record without one (D44).
      throw new StepException(
        'the answer used to find the record was left blank, so no search was run.'
      );
    }
    FinalLookupService.Compiled c = FinalLookupService.compile(
      new Map<String, Object>{ 'filter' => resolvedFilter(match.get('filter'), d, run) },
      new Map<String, Object>(),
      d.getName()
    );
    if (c.blocked || String.isBlank(c.whereClause)) {
      throw new StepException(
        'its search filter couldn’t be applied' +
        (c.blockedReason == null ? '.' : ': ' + c.blockedReason)
      );
    }
    Map<String, Object> binds = new Map<String, Object>(c.binds);
    binds.put('mappingMatchValue', matchValue);
    String soql =
      'SELECT Id FROM ' +
      d.getName() +
      ' WHERE ' +
      mf.getDescribe().getName() +
      ' = :mappingMatchValue' +
      ' AND (' +
      c.whereClause +
      ') LIMIT 2';
    List<SObject> hits = Database.queryWithBinds(
      soql,
      binds,
      AccessLevel.SYSTEM_MODE
    );
    if (hits.size() > 1) {
      throw new StepException(
        'more than one ' +
          d.getLabel() +
          ' matched, so nothing was written. Merge or fix the duplicates, then retry.'
      );
    }
    return hits.isEmpty() ? null : hits[0].Id;
  }

  /**
   * A copy of the filter with every `$field.` value already converted
   * against the field that row filters on — which is not the field the
   * answer would be written to. The shared compiler stays exactly as
   * lookups use it; only the values it is handed change.
   *
   * A value that resolves to nothing is left as the token, so the compiler
   * refuses the filter in its own words and the step fails rather than
   * searching on a blank.
   */
  private static Object resolvedFilter(
    Object filter,
    Schema.DescribeSObjectResult d,
    Run run
  ) {
    if (!(filter instanceof Map<String, Object>)) {
      return filter;
    }
    Map<String, Object> copy = (Map<String, Object>) JSON.deserializeUntyped(
      JSON.serialize(filter)
    );
    for (Object rowObj : FinalMappingRules.asList(copy.get('rows'))) {
      Map<String, Object> row = FinalMappingRules.asMap(rowObj);
      if (row == null) {
        continue;
      }
      Schema.DescribeFieldResult fd = FinalMappingRules.fieldAt(
        d.getName(),
        String.valueOf(row.get('fieldPath'))
      );
      if (fd == null) {
        continue; // the compiler refuses the path itself, in better words
      }
      // "is one of" / "includes" keep their entries in `values`, and the
      // compiler never resolves tokens in there at all — so they are
      // resolved here, keeping the list a list.
      if (row.get('values') instanceof List<Object>) {
        List<Object> resolved = new List<Object>();
        Boolean unresolved = false;
        for (Object entry : (List<Object>) row.get('values')) {
          if (!isToken(entry)) {
            resolved.add(entry);
            continue;
          }
          Object converted = answerFor((String) entry, fd, run);
          if (converted == null) {
            unresolved = true;
            break;
          }
          if (converted instanceof List<Object>) {
            resolved.addAll((List<Object>) converted);
          } else {
            resolved.add(converted);
          }
        }
        // A condition that cannot be resolved blocks the whole filter, the
        // way the compiler does it — an empty list is how we say so. It
        // never silently drops out and widens the search.
        row.put('values', unresolved ? new List<Object>() : resolved);
        continue;
      }
      if (isToken(row.get('value'))) {
        Object converted = answerFor((String) row.get('value'), fd, run);
        if (converted != null) {
          row.put('value', converted);
        }
        // left as the token when it resolves to nothing: the compiler then
        // blocks the filter and the step fails, rather than searching blank
      }
    }
    return copy;
  }

  private static Boolean isToken(Object raw) {
    return raw instanceof String && ((String) raw).startsWith('$field.');
  }

  private static Object answerFor(
    String token,
    Schema.DescribeFieldResult fd,
    Run run
  ) {
    String key = token.substring(7);
    return FinalMappingRules.answerValue(
      run.answers.get(key),
      run.questions.get(key),
      fd
    );
  }

  private static Map<String, Form_Submission_Answer__c> answersOf(
    Id submissionId
  ) {
    Map<String, Form_Submission_Answer__c> out = new Map<String, Form_Submission_Answer__c>();
    for (Form_Submission_Answer__c a : [
      SELECT
        Element_Key__c,
        Answer_Type__c,
        Value_Unparsed__c,
        Text_Value__c,
        Numeric_Value__c,
        Boolean_Value__c,
        Date_Value__c,
        DateTime_Value__c,
        Selected_Options_JSON__c
      FROM Form_Submission_Answer__c
      WHERE Form_Submission__c = :submissionId
      WITH SYSTEM_MODE
      ORDER BY Entry_Index__c NULLS FIRST
    ]) {
      if (!out.containsKey(a.Element_Key__c)) {
        out.put(a.Element_Key__c, a);
      }
    }
    return out;
  }

  private static String dmlSentence(DmlException e, String objectLabel) {
    if (
      e.getNumDml() > 0 &&
      e.getDmlType(0) == StatusCode.DUPLICATES_DETECTED
    ) {
      return 'Salesforce’s duplicate rules blocked saving this ' +
        objectLabel +
        '.';
    }
    return e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage();
  }

  private static String labelOf(Map<String, Object> q) {
    return q == null ||
      q.get('label') == null
      ? 'a question'
      : String.valueOf(q.get('label'));
  }
}
```

- [ ] **Step 4: Deploy and run**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingService.cls --source-dir force-app/main/default/classes/FinalMappingServiceTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingServiceTest --result-format human --wait 10
```

Expected: 14 pass. The trigger doesn't exist yet, so `submit()` leaves `Mapping_Status__c` blank and
the first run returns "Nothing to run". **Therefore, until Task 8 lands, add this line at the end of
`FinalMappingTestData.submit` before `return s.Id;`:**

```apex
        update new Form_Submission__c(Id = s.Id, Mapping_Status__c = FinalMappingRules.STATUS_QUEUED);
```

Remove it again in Task 8 Step 5, when the trigger sets the status itself.

- [ ] **Step 5: Prove the guards bite**

(a) Move `Savepoint sp = Database.setSavepoint();` above the attempts `Database.update`, deploy, run
`aFailedRunKeepsItsAttemptAndSaysWhy` — expected FAIL (attempts 0). Restore.
(b) Remove the `if (matchValue == null)` throw, deploy, run `aBlankMatchValueFailsWithoutSearching` —
expected FAIL. Restore, redeploy, all PASS.

- [ ] **Step 6: Commit**

```bash
git add force-app/main/default/classes/FinalMappingService.cls force-app/main/default/classes/FinalMappingService.cls-meta.xml force-app/main/default/classes/FinalMappingServiceTest.cls force-app/main/default/classes/FinalMappingServiceTest.cls-meta.xml force-app/main/default/classes/FinalMappingTestData.cls
git commit -m "feat(freeform): F2 M6 - one mapping run"
```

### Task 8: The trigger, the job, measured capacity

**Files:**

- Create: `classes/FinalMappingJob.cls`, `classes/FinalMappingTriggerHandler.cls`,
  `triggers/FinalFormSubmissionTrigger.trigger`
- Modify: `classes/FinalMappingTestData.cls` (remove the Task 7 status line)
- Test: `classes/FinalMappingTriggerTest.cls`

**Interfaces:**

- Consumes: `FinalMappingService.run(Id)`, `FinalMappingRules.actionsOf`, status constants.
- Produces: `FinalMappingJob(Id submissionId)` implements `Queueable`;
  `FinalMappingTriggerHandler.beforeInsert(List<Form_Submission__c>)`,
  `afterInsert(List<Form_Submission__c>)`,
  `afterUpdate(List<Form_Submission__c>, Map<Id, Form_Submission__c>)`,
  `Integer capacity()`.

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingTriggerTest.cls`:

```apex
/**
 * The trigger starts every run (D41) and measures its room first (D46).
 * Tests 12 and 16 use capacity up deliberately, so they prove the trigger
 * reads what is left rather than assuming 50.
 */
@IsTest
private class FinalMappingTriggerTest {
  /** Takes up one background-job slot and does nothing. */
  public class Filler implements Queueable {
    public void execute(QueueableContext c) {
    }
  }

  private static void fill(Integer slots) {
    for (Integer i = 0; i < slots; i++) {
      System.enqueueJob(new Filler());
    }
  }

  private static Map<String, String> jane() {
    return new Map<String, String>{
      'el_last' => 'Jane',
      'el_email' => 'jane@example.com'
    };
  }

  private static void publishWithMapping() {
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(
        FinalMappingTestData.standardQuestions(),
        new List<Object>{ FinalMappingTestData.createContact('act_a') }
      )
    );
  }

  @IsTest
  static void aSubmissionWithoutMappingIsNotNeeded() {
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(FinalMappingTestData.standardQuestions(), null)
    );
    Id subId = FinalMappingTestData.submit(jane());
    Assert.areEqual(
      'Not needed',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
  }

  @IsTest
  static void aNewSubmissionIsQueuedAndRunsInTheBackground() {
    publishWithMapping();
    Test.startTest();
    Id subId = FinalMappingTestData.submit(jane());
    Assert.areEqual(
      'Queued',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
    Test.stopTest(); // runs the queued job

    Assert.areEqual(
      'Done',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Contact WHERE Email = 'jane@example.com']
    );
  }

  @IsTest
  static void aSubmissionWithNoRoomIsSavedAsFailedNotRefused() {
    // Test 16 (D46): other code has used every slot.
    publishWithMapping();
    Test.startTest();
    fill(Limits.getLimitQueueableJobs());
    Id subId = FinalMappingTestData.submit(jane());
    Test.stopTest();

    Form_Submission__c sub = FinalMappingTestData.reload(subId);
    Assert.areEqual('Failed', sub.Mapping_Status__c, 'saved, not refused');
    Assert.isTrue(
      sub.Mapping_Message__c.contains('no background-job capacity'),
      sub.Mapping_Message__c
    );
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM Form_Submission_Answer__c
        WHERE Form_Submission__c = :subId
      ],
      'the answers survived'
    );
  }

  @IsTest
  static void readyForRetryQueuesARun() {
    publishWithMapping();
    Id subId = FinalMappingTestData.submit(jane());
    update new Form_Submission__c(Id = subId, Mapping_Status__c = 'Failed');

    Test.startTest();
    update new Form_Submission__c(
      Id = subId,
      Mapping_Status__c = 'Ready for Retry'
    );
    Test.stopTest();

    Assert.areEqual(
      'Done',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
  }

  @IsTest
  static void aBulkRetryBiggerThanTheRoomLeftIsRefusedWithTheRealNumber() {
    // Test 12: 5 slots left, 6 retries asked for.
    publishWithMapping();
    List<Form_Submission__c> subs = new List<Form_Submission__c>();
    for (Integer i = 0; i < 6; i++) {
      subs.add(
        new Form_Submission__c(
          Id = FinalMappingTestData.submit(jane()),
          Mapping_Status__c = 'Failed'
        )
      );
    }
    update subs;

    Test.startTest();
    fill(Limits.getLimitQueueableJobs() - Limits.getQueueableJobs() - 5);
    for (Form_Submission__c s : subs) {
      s.Mapping_Status__c = 'Ready for Retry';
    }
    String message = '';
    try {
      update subs;
    } catch (DmlException e) {
      message = e.getDmlMessage(0);
    }
    Test.stopTest();

    Assert.isTrue(message.contains('Only 5 more'), message);
    Assert.isTrue(message.contains('retry 5 or fewer'), message);
  }

  @IsTest
  static void aDoneSubmissionIsNotRequeuedByOtherEdits() {
    publishWithMapping();
    Id subId = FinalMappingTestData.submit(jane());
    update new Form_Submission__c(Id = subId, Mapping_Status__c = 'Done');
    Test.startTest();
    update new Form_Submission__c(Id = subId, Mapping_Message__c = 'a note');
    Integer queued = Limits.getQueueableJobs();
    Test.stopTest();
    Assert.areEqual(0, queued, 'only a change TO Ready for Retry queues');
  }
}
```

- [ ] **Step 2: Deploy to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingTriggerTest.cls`
Then run it: expected FAIL — statuses stay blank, nothing queues.

- [ ] **Step 3: Write the job**

`classes/FinalMappingJob.cls`:

```apex
/**
 * One background mapping run (FREEFORM_F2_MAPPING_SPEC 6.3). Deliberately
 * thin: an uncaught exception here stays uncaught. Its reason lives in
 * Setup → Apex Jobs and the submission keeps its status (D43).
 */
public without sharing class FinalMappingJob implements Queueable {
  private final Id submissionId;

  public FinalMappingJob(Id submissionId) {
    this.submissionId = submissionId;
  }

  public void execute(QueueableContext context) {
    FinalMappingService.run(submissionId);
  }
}
```

- [ ] **Step 4: Write the handler and the trigger**

`classes/FinalMappingTriggerHandler.cls`:

```apex
/**
 * Decides which submissions need a mapping run and queues them
 * (FREEFORM_F2_MAPPING_SPEC 6.3, D41, D46).
 *
 * Capacity is measured at the moment of queueing, never assumed: other
 * automation in the same transaction may already have used it, even for a
 * single guest submission. Going over is an error Apex cannot catch, and it
 * would take the respondent's submission down with it.
 */
public without sharing class FinalMappingTriggerHandler {
  @TestVisible
  private static final String NO_CAPACITY_ON_INSERT =
    'The mapping couldn’t be started: no background-job capacity was left ' +
    'when this submission was saved. Retry it.';

  public static Integer capacity() {
    return Limits.getLimitQueueableJobs() - Limits.getQueueableJobs();
  }

  public static void beforeInsert(List<Form_Submission__c> rows) {
    Set<Id> versionIds = new Set<Id>();
    for (Form_Submission__c s : rows) {
      if (s.Form_Version__c != null) {
        versionIds.add(s.Form_Version__c);
      }
    }
    Set<Id> mapped = new Set<Id>();
    if (!versionIds.isEmpty()) {
      // System mode: a guest cannot read Form_Version__c.
      for (Form_Version__c v : [
        SELECT Id, Spec_JSON__c
        FROM Form_Version__c
        WHERE Id IN :versionIds
        WITH SYSTEM_MODE
      ]) {
        if (hasMapping(v.Spec_JSON__c)) {
          mapped.add(v.Id);
        }
      }
    }
    for (Form_Submission__c s : rows) {
      s.Mapping_Status__c = mapped.contains(s.Form_Version__c)
        ? FinalMappingRules.STATUS_QUEUED
        : FinalMappingRules.STATUS_NOT_NEEDED;
    }
  }

  /** New submissions are never refused: refusing would roll back the answers (D46). */
  public static void afterInsert(List<Form_Submission__c> rows) {
    List<Id> toQueue = new List<Id>();
    for (Form_Submission__c s : rows) {
      if (s.Mapping_Status__c == FinalMappingRules.STATUS_QUEUED) {
        toQueue.add(s.Id);
      }
    }
    if (toQueue.isEmpty()) {
      return;
    }
    Integer room = capacity();
    List<Form_Submission__c> failed = new List<Form_Submission__c>();
    for (Integer i = 0; i < toQueue.size(); i++) {
      if (i >= room) {
        failed.add(failedRow(toQueue[i], NO_CAPACITY_ON_INSERT));
        continue;
      }
      try {
        System.enqueueJob(new FinalMappingJob(toQueue[i]));
      } catch (Exception e) {
        failed.add(
          failedRow(
            toQueue[i],
            'The mapping couldn’t be started: ' + e.getMessage()
          )
        );
      }
    }
    if (!failed.isEmpty()) {
      Database.update(failed, true, AccessLevel.SYSTEM_MODE);
    }
  }

  /** A bulk retry is refused whole when it won't fit, with the real number. */
  public static void afterUpdate(
    List<Form_Submission__c> rows,
    Map<Id, Form_Submission__c> oldById
  ) {
    List<Form_Submission__c> retries = new List<Form_Submission__c>();
    for (Form_Submission__c s : rows) {
      if (
        s.Mapping_Status__c == FinalMappingRules.STATUS_READY_FOR_RETRY &&
        oldById.get(s.Id).Mapping_Status__c !=
        FinalMappingRules.STATUS_READY_FOR_RETRY
      ) {
        retries.add(s);
      }
    }
    if (retries.isEmpty()) {
      return;
    }
    Integer room = capacity();
    if (retries.size() > room) {
      String message = noRoomForRetry(room);
      for (Form_Submission__c s : retries) {
        s.addError(message);
      }
      return;
    }
    for (Form_Submission__c s : retries) {
      try {
        System.enqueueJob(new FinalMappingJob(s.Id));
      } catch (Exception e) {
        s.addError('The retry couldn’t be started: ' + e.getMessage());
      }
    }
  }

  @TestVisible
  private static String noRoomForRetry(Integer room) {
    if (room <= 0) {
      return 'No background jobs can be started in this save — other automation has ' +
        'already used them. Retry in a separate save.';
    }
    if (room == 1) {
      return 'Only 1 more background job can be started in this save — retry 1 submission at a time.';
    }
    return 'Only ' +
      room +
      ' more background jobs can be started in this save — retry ' +
      room +
      ' or fewer submissions at a time.';
  }

  private static Form_Submission__c failedRow(Id submissionId, String message) {
    return new Form_Submission__c(
      Id = submissionId,
      Mapping_Status__c = FinalMappingRules.STATUS_FAILED,
      Mapping_Message__c = message
    );
  }

  private static Boolean hasMapping(String specJson) {
    if (String.isBlank(specJson) || !specJson.contains('"mapping"')) {
      return false;
    }
    try {
      return !FinalMappingRules.actionsOf(
          (Map<String, Object>) JSON.deserializeUntyped(specJson)
        )
        .isEmpty();
    } catch (Exception e) {
      return false;
    }
  }
}
```

`triggers/FinalFormSubmissionTrigger.trigger`:

```apex
/**
 * The one entry point for every mapping run (FREEFORM_F2_MAPPING_SPEC D41).
 * Before insert decides the status; after insert queues new runs; after
 * update queues a run only on a change TO Ready for Retry.
 */
trigger FinalFormSubmissionTrigger on Form_Submission__c(
  before insert,
  after insert,
  after update
) {
  if (Trigger.isBefore && Trigger.isInsert) {
    FinalMappingTriggerHandler.beforeInsert(Trigger.new);
  } else if (Trigger.isAfter && Trigger.isInsert) {
    FinalMappingTriggerHandler.afterInsert(Trigger.new);
  } else if (Trigger.isAfter && Trigger.isUpdate) {
    FinalMappingTriggerHandler.afterUpdate(Trigger.new, Trigger.oldMap);
  }
}
```

`triggers/FinalFormSubmissionTrigger.trigger-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<ApexTrigger xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <status>Active</status>
</ApexTrigger>
```

- [ ] **Step 5: Remove the Task 7 stopgap**

Delete from `FinalMappingTestData.submit` the line
`update new Form_Submission__c(Id = s.Id, Mapping_Status__c = FinalMappingRules.STATUS_QUEUED);` — the
trigger sets the status now.

- [ ] **Step 6: Deploy and run everything that inserts a submission**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingJob.cls --source-dir force-app/main/default/classes/FinalMappingTriggerHandler.cls --source-dir force-app/main/default/triggers/FinalFormSubmissionTrigger.trigger --source-dir force-app/main/default/classes/FinalMappingTestData.cls --source-dir force-app/main/default/classes/FinalMappingTriggerTest.cls
sf apex run test --target-org revclouddev --class-names FinalMappingTriggerTest --class-names FinalMappingServiceTest --class-names FinalFreeformSubmitTest --class-names FinalFreeformGuestTest --class-names FinalSubmissionAccessTest --class-names FinalSubmissionControllerTest --class-names FinalSubmitFenceTest --result-format human --wait 20
```

Expected: all pass. The F1 classes matter: every one of their submissions now goes through the
trigger and must come out `Not needed`, with nothing queued.

- [ ] **Step 7: Prove capacity is measured**

Replace `return Limits.getLimitQueueableJobs() - Limits.getQueueableJobs();` with `return 50;`,
deploy, run tests 12 and 16 — expected FAIL (test 16 with an uncatchable limit error, test 12
with "Only 50 more"). Restore, redeploy, PASS.

- [ ] **Step 8: Commit, PR, merge the M6 slice**

```bash
git add force-app/main/default/classes/FinalMappingJob.cls force-app/main/default/classes/FinalMappingJob.cls-meta.xml force-app/main/default/classes/FinalMappingTriggerHandler.cls force-app/main/default/classes/FinalMappingTriggerHandler.cls-meta.xml force-app/main/default/triggers/FinalFormSubmissionTrigger.trigger force-app/main/default/triggers/FinalFormSubmissionTrigger.trigger-meta.xml force-app/main/default/classes/FinalMappingTestData.cls force-app/main/default/classes/FinalMappingTriggerTest.cls force-app/main/default/classes/FinalMappingTriggerTest.cls-meta.xml
git commit -m "feat(freeform): F2 M6 - trigger queues each run within measured capacity"
git push -u origin feat/f2-m6-runtime
```

PR body lists tests 1–8 and 12–16. Merge.

### Task 9: Full Apex regression

**Files:** none changed.

- [ ] **Step 1: Run the whole local suite**

Run: `sf apex run test --target-org revclouddev --test-level RunLocalTests --result-format human --code-coverage --wait 30`
Expected: no new failures against the pre-F2 baseline. New classes each at 85%+. Check per-class
coverage with RunLocalTests, not RunSpecifiedTests — a subset run under-reports.

- [ ] **Step 2:** If anything regressed, fix it on a branch named `fix/f2-regression-<what>` before
      starting M7.

---

## M7 — Reader and retry

### Task 10: The Retry method

**Files:**

- Create: `classes/FinalMappingRetryController.cls`
- Modify: `permissionsets/Freeform_Submission_Admin.permissionset-meta.xml` (class access)
- Test: `classes/FinalMappingRetryControllerTest.cls`

**Interfaces:**

- Consumes: `FinalMappingService.run(Id)`, `FinalMappingRules.RETRYABLE`, `refusal`.
- Produces: `@AuraEnabled static FinalMappingService.Result retry(Id submissionId)`.

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingRetryControllerTest.cls`:

```apex
/**
 * Spec test 11: the checks live in the method, not in whether the button
 * is showing.
 */
@IsTest
private class FinalMappingRetryControllerTest {
  private static Id failedSubmission() {
    FinalMappingTestData.publish(
      FinalMappingTestData.spec(
        FinalMappingTestData.standardQuestions(),
        new List<Object>{ FinalMappingTestData.createContact('act_a') }
      )
    );
    Id subId = FinalMappingTestData.submit(
      new Map<String, String>{
        'el_last' => 'Jane',
        'el_email' => 'jane@example.com'
      }
    );
    update new Form_Submission__c(Id = subId, Mapping_Status__c = 'Failed');
    return subId;
  }

  /** A reader: can see submissions, lacks Freeform_Retry_Mapping. */
  private static User reader() {
    Profile minimum = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Minimum Access - Salesforce'
    ];
    User u = new User(
      Alias = 'retry',
      Email = 'retry@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Retry tester',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = minimum.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'retry' + Crypto.getRandomInteger() + '@example.com'
    );
    insert u;
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Freeform_Submission_Reader'
      ]
      .Id
    );
    return u;
  }

  /** Everything the admin set grants, on a plain licence. */
  private static User admin() {
    Profile minimum = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Minimum Access - Salesforce'
    ];
    User u = new User(
      Alias = 'fadm',
      Email = 'fadm@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Freeform admin',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = minimum.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'fadm' + Crypto.getRandomInteger() + '@example.com'
    );
    insert u;
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Freeform_Submission_Admin'
      ]
      .Id
    );
    return u;
  }

  @IsTest
  static void theAdminSetReallyAllowsTheBulkRetryEdit() {
    // Field-level edit is not enough on its own. Without object edit on
    // Form_Submission__c nobody holding this set can set Ready for Retry,
    // and the bulk path does not exist for anyone but a System
    // Administrator.
    Id subId = failedSubmission();
    User u = admin();

    System.runAs(u) {
      update new Form_Submission__c(
        Id = subId,
        Mapping_Status__c = 'Ready for Retry'
      );
    }

    Assert.areEqual(
      'Ready for Retry',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
  }

  @IsTest
  static void withoutThePermissionTheMethodRefuses() {
    Id subId = failedSubmission();
    User u = reader();
    String message = '';
    System.runAs(u) {
      try {
        FinalMappingRetryController.retry(subId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
    }
    Assert.isTrue(message.contains('permission'), message);
    Assert.areEqual(
      'Failed',
      FinalMappingTestData.reload(subId).Mapping_Status__c
    );
  }

  @IsTest
  static void queuedAndDoneAreRefused() {
    Id subId = failedSubmission();
    for (String status : new List<String>{ 'Queued', 'Done' }) {
      update new Form_Submission__c(Id = subId, Mapping_Status__c = status);
      String message = '';
      try {
        FinalMappingRetryController.retry(subId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Assert.isTrue(
        message.contains('Only a failed submission'),
        status + ': ' + message
      );
    }
  }

  @IsTest
  static void aFailedSubmissionRunsNow() {
    Id subId = failedSubmission();
    // The running test user is a System Administrator; grant the
    // custom permission through the admin set.
    insert new PermissionSetAssignment(
      AssigneeId = UserInfo.getUserId(),
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Freeform_Submission_Admin'
      ]
      .Id
    );
    User me = [SELECT Id FROM User WHERE Id = :UserInfo.getUserId()];
    FinalMappingService.Result r;
    System.runAs(me) {
      r = FinalMappingRetryController.retry(subId);
    }
    Assert.areEqual('Done', r.status, r.message);
  }
}
```

(`System.runAs(me)` refreshes the session so the new permission set is seen — a fresh `runAs` is
required for in-test permission sets in this org.)

- [ ] **Step 2: Deploy to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingRetryControllerTest.cls`
Expected: FAIL — `Variable does not exist: FinalMappingRetryController`.

- [ ] **Step 3: Write the controller**

`classes/FinalMappingRetryController.cls`:

```apex
/**
 * The Retry button's server method (FREEFORM_F2_MAPPING_SPEC 8.1). Every
 * check is here, because an @AuraEnabled method can be called without the
 * button: the permission, the caller's own view of the record, and the
 * status. Then the run happens now, in the caller's transaction.
 */
public with sharing class FinalMappingRetryController {
  @AuraEnabled
  public static FinalMappingService.Result retry(Id submissionId) {
    if (!FeatureManagement.checkPermission('Freeform_Retry_Mapping')) {
      throw FinalMappingRules.refusal(
        'You don’t have permission to retry mappings.'
      );
    }
    List<Form_Submission__c> visible = [
      SELECT Id, Mapping_Status__c
      FROM Form_Submission__c
      WHERE Id = :submissionId
      WITH USER_MODE
    ];
    if (visible.isEmpty()) {
      throw FinalMappingRules.refusal(
        'That submission isn’t available to you.'
      );
    }
    if (!FinalMappingRules.RETRYABLE.contains(visible[0].Mapping_Status__c)) {
      throw FinalMappingRules.refusal(
        'Only a failed submission, or one marked Ready for Retry, can be retried.'
      );
    }
    return FinalMappingService.run(submissionId);
  }
}
```

In `Freeform_Submission_Admin.permissionset-meta.xml`, add:

```xml
<classAccesses>
        <apexClass>FinalMappingRetryController</apexClass>
        <enabled>true</enabled>
    </classAccesses>
```

- [ ] **Step 4: Deploy and run**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingRetryController.cls --source-dir force-app/main/default/classes/FinalMappingRetryControllerTest.cls --source-dir force-app/main/default/permissionsets/Freeform_Submission_Admin.permissionset-meta.xml
sf apex run test --target-org revclouddev --class-names FinalMappingRetryControllerTest --result-format human --wait 10
```

Expected: 5 pass.

- [ ] **Step 5: Prove the permission check bites**

Delete the `checkPermission` block, deploy, run `withoutThePermissionTheMethodRefuses` — expected
FAIL. Restore, redeploy, PASS.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/f2-m7-reader-retry
git add force-app/main/default/classes/FinalMappingRetryController.cls force-app/main/default/classes/FinalMappingRetryController.cls-meta.xml force-app/main/default/classes/FinalMappingRetryControllerTest.cls force-app/main/default/classes/FinalMappingRetryControllerTest.cls-meta.xml force-app/main/default/permissionsets/Freeform_Submission_Admin.permissionset-meta.xml
git commit -m "feat(freeform): F2 M7 - retry method checks permission itself"
```

### Task 11: The reader shows the mapping and offers Retry

**Files:**

- Modify: `classes/FinalSubmissionController.cls` (`getSubmission`)
- Modify: `lwc/finalSubmissionReader/finalSubmissionReader.js`, `.html`, `.css`
- Tests: `classes/FinalSubmissionControllerTest.cls`,
  `lwc/finalSubmissionReader/__tests__/finalSubmissionReader.test.js`

**Interfaces:**

- Consumes: `FinalMappingRetryController.retry`.
- Produces: `getSubmission` result gains
  `mapping: { status, message, attempts, runAt, records: [{ actionId, recordId }], canRetry }`.

- [ ] **Step 1: Write the failing Apex test**

Add to `FinalSubmissionControllerTest.cls`, which already has `buildSubmission(String questionLabel)`
returning a submission id:

```apex
    @IsTest
    static void theMappingBlockTravelsWithTheSubmission() {
        Id subId = buildSubmission('Your name');
        update new Form_Submission__c(
            Id = subId,
            Mapping_Status__c = 'Failed',
            Mapping_Message__c = 'Step 1 (Contact): more than one Contact matched.',
            Mapping_Attempts__c = 1
        );

        Map<String, Object> result = FinalSubmissionController.getSubmission(subId);

        Map<String, Object> mapping = (Map<String, Object>) result.get('mapping');
        Assert.areEqual('Failed', mapping.get('status'));
        Assert.isTrue(String.valueOf(mapping.get('message')).contains('more than one'));
        Assert.areEqual(false, mapping.get('canRetry'), 'no custom permission, no button');
    }
```

- [ ] **Step 2: Implement the Apex side**

In `FinalSubmissionController.getSubmission`, add to the `Form_Submission__c` SELECT (after
`Form_Version__r.Spec_JSON__c`):
`Mapping_Status__c, Mapping_Message__c, Mapping_Attempts__c, Mapping_Run_At__c, Created_Records__c`.
The method returns a map literal; add one entry after `'files' => fileLinks(submissionId)`:

```apex
            'files' => fileLinks(submissionId),
            'mapping' => mappingOf(sub)
```

and add below `fileLinks`:

```apex
    /** The mapping run, for the reader (FREEFORM_F2_MAPPING_SPEC 8.1). */
    private static Map<String, Object> mappingOf(Form_Submission__c sub) {
        List<Map<String, Object>> records = new List<Map<String, Object>>();
        if (String.isNotBlank(sub.Created_Records__c)) {
            Map<String, Object> byAction = (Map<String, Object>) JSON.deserializeUntyped(
                sub.Created_Records__c
            );
            for (String actionId : byAction.keySet()) {
                records.add(
                    new Map<String, Object>{
                        'actionId' => actionId,
                        'recordId' => byAction.get(actionId)
                    }
                );
            }
        }
        return new Map<String, Object>{
            'status' => sub.Mapping_Status__c,
            'message' => sub.Mapping_Message__c,
            'attempts' => sub.Mapping_Attempts__c,
            'runAt' => sub.Mapping_Run_At__c,
            'records' => records,
            'canRetry' => FinalMappingRules.RETRYABLE.contains(sub.Mapping_Status__c) &&
                FeatureManagement.checkPermission('Freeform_Retry_Mapping')
        };
    }
```

- [ ] **Step 3: Write the failing jest tests**

`finalSubmissionReader.test.js` feeds the wire with `getSubmission.emit(payload)` through its
`mount(payload)` helper, builds payloads from `base`, and has `flush()`. Add the retry mock beside the
file's other `jest.mock` calls, and its import beside the other imports:

```js
jest.mock(
  '@salesforce/apex/FinalMappingRetryController.retry',
  () => ({ default: jest.fn() }),
  { virtual: true }
);
import retry from '@salesforce/apex/FinalMappingRetryController.retry';
```

Then append:

```js
describe('mapping', () => {
  const withMapping = (mapping) => ({ ...base, mapping });

  it('shows a failed run and its reason', async () => {
    const el = await mount(
      withMapping({
        status: 'Failed',
        message: 'Step 1 (Contact): more than one Contact matched.',
        records: [],
        canRetry: false
      })
    );
    expect(
      el.shadowRoot.querySelector('.sr-mapping-status').textContent
    ).toContain('Failed');
    expect(
      el.shadowRoot.querySelector('.sr-mapping-message').textContent
    ).toContain('more than one');
    expect(el.shadowRoot.querySelector('.sr-retry')).toBeNull();
  });

  it('offers Retry only when allowed, and shows the result', async () => {
    retry.mockResolvedValue({ status: 'Done', message: null });
    const el = await mount(
      withMapping({
        status: 'Failed',
        message: 'x',
        records: [],
        canRetry: true
      })
    );
    el.shadowRoot.querySelector('.sr-retry').click();
    await flush();
    expect(retry).toHaveBeenCalledWith({ submissionId: el.recordId });
    // refreshApex re-provisions the wire; the test plays the new value.
    getSubmission.emit(
      withMapping({
        status: 'Done',
        message: null,
        records: [],
        canRetry: false
      })
    );
    await flush();
    expect(
      el.shadowRoot.querySelector('.sr-mapping-status').textContent
    ).toContain('Done');
  });

  it('says nothing when the form has no mapping', async () => {
    const el = await mount(
      withMapping({ status: 'Not needed', records: [], canRetry: false })
    );
    expect(el.shadowRoot.querySelector('.sr-mapping')).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npm run test:unit -- force-app/main/default/lwc/finalSubmissionReader`
Expected: FAIL — `.sr-mapping-status` not found.

- [ ] **Step 5: Implement the reader**

In `finalSubmissionReader.js`, add the imports:

```js
import { refreshApex } from '@salesforce/apex';
import retry from '@salesforce/apex/FinalMappingRetryController.retry';
```

Change the wire handler so it keeps the provisioned value for `refreshApex`:

```js
    @wire(getSubmission, { submissionId: '$recordId' })
    wired(result) {
        this._wiredResult = result;
        const { data, error } = result;
        if (data) {
            this.data = data;
            this.error = undefined;
        } else if (error) {
            this.data = undefined;
            this.error =
                (error.body && error.body.message) ||
                'This submission could not be loaded.';
        }
    }
```

Add fields and getters to the class:

```js
    _wiredResult;
    retrying = false;
    retryError = '';

    get mapping() {
        return this.data && this.data.mapping;
    }

    /** Nothing to say for a form without mapping steps. */
    get showMapping() {
        const m = this.mapping;
        return Boolean(m && m.status && m.status !== 'Not needed');
    }

    get mappingStatusClass() {
        const s = this.mapping && this.mapping.status;
        return `sr-mapping-status sr-mapping-status--${s === 'Failed' ? 'bad' : s === 'Done' ? 'good' : 'wait'}`;
    }

    get mappingRecords() {
        return ((this.mapping && this.mapping.records) || []).map((r) => ({
            key: r.actionId,
            recordId: r.recordId
        }));
    }

    get hasMappingRecords() {
        return this.mappingRecords.length > 0;
    }

    async handleRetry() {
        this.retrying = true;
        this.retryError = '';
        try {
            await retry({ submissionId: this.recordId });
            await refreshApex(this._wiredResult);
        } catch (e) {
            this.retryError = (e && e.body && e.body.message) || 'The retry couldn’t start. Try again.';
        } finally {
            this.retrying = false;
        }
    }

    handleOpenRecord(event) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: event.currentTarget.dataset.id, actionName: 'view' }
        });
    }
```

In `finalSubmissionReader.html`, directly after the closing `</div>` of `sr-head`:

```html
<template lwc:if={showMapping}>
  <div class="slds-p-horizontal_medium sr-mapping">
    <p class="sr-mapping-line">
      Records from this submission:
      <span class={mappingStatusClass}>{mapping.status}</span>
    </p>
    <template lwc:if={mapping.message}>
      <p class="sr-mapping-message">{mapping.message}</p>
    </template>
    <template lwc:if={hasMappingRecords}>
      <ul class="sr-mapping-records">
        <template for:each={mappingRecords} for:item="rec">
          <li key={rec.key}>
            <button
              type="button"
              class="sr-file-open"
              data-id={rec.recordId}
              onclick={handleOpenRecord}
            >
              {rec.recordId}
            </button>
          </li>
        </template>
      </ul>
    </template>
    <template lwc:if={mapping.canRetry}>
      <lightning-button
        class="sr-retry"
        label="Retry mapping"
        onclick={handleRetry}
        disabled={retrying}
      ></lightning-button>
    </template>
    <template lwc:if={retryError}>
      <p class="sr-error" role="alert">{retryError}</p>
    </template>
  </div>
</template>
```

Append to `finalSubmissionReader.css`:

```css
.sr-mapping {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--slds-g-color-border-base-1, #e5e5e5);
}
.sr-mapping-status {
  font-weight: 600;
}
.sr-mapping-status--bad {
  color: var(--slds-g-color-error-base-40, #b0281a);
}
.sr-mapping-status--good {
  color: var(--slds-g-color-success-base-40, #2e844a);
}
.sr-mapping-message {
  margin: 0.25rem 0 0.5rem;
  white-space: pre-line;
}
.sr-mapping-records {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
}
```

- [ ] **Step 6: Run and deploy**

```bash
npm run test:unit -- force-app/main/default/lwc/finalSubmissionReader
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalSubmissionController.cls --source-dir force-app/main/default/classes/FinalSubmissionControllerTest.cls --source-dir force-app/main/default/lwc/finalSubmissionReader
sf apex run test --target-org revclouddev --class-names FinalSubmissionControllerTest --result-format human --wait 10
```

Expected: all pass.

- [ ] **Step 7: Verify in the org**

Open any existing Freeform submission record page: no mapping block (status `Not needed`, or blank
on submissions saved before the trigger existed — `showMapping` hides both). In Developer Console,
set one submission's `Mapping_Status__c` to Failed with a message; reload: the block shows with the
reason, and with Retry if your user has `Freeform_Submission_Admin`.

- [ ] **Step 8: Commit, PR, merge the M7 slice**

```bash
git add force-app/main/default/classes/FinalSubmissionController.cls force-app/main/default/classes/FinalSubmissionControllerTest.cls force-app/main/default/lwc/finalSubmissionReader
git commit -m "feat(freeform): F2 M7 - reader shows the mapping run and offers Retry"
git push -u origin feat/f2-m7-reader-retry
```

---

## M3 — Data mode and the step list

### Task 12: `finalMappingModel` — every read and write of `spec.mapping`

**Files:**

- Create: `lwc/finalMappingModel/finalMappingModel.js`, `.js-meta.xml`
- Test: `lwc/finalMappingModel/__tests__/finalMappingModel.test.js`

**Interfaces:**

- Produces (pure, never mutates input, each write returns a new spec):
  - `MAX_STEPS` (10)
  - `actionsOf(spec) → Action[]`
  - `addAction(spec, objectApi, operation) → { spec, actionId }` (actionId null at the cap)
  - `removeAction(spec, actionId) → spec`
  - `moveAction(spec, fromIndex, toIndex) → spec`
  - `setOperation(spec, actionId, 'create' | 'findOrCreate') → spec`
  - `setFieldSource(spec, actionId, field, source) → spec`
  - `removeField(spec, actionId, field) → spec`
  - `setMatch(spec, actionId, patch) → spec` — patch of `{ field?, source?, filter? }`
  - `setOnMatch(spec, actionId, 'reuse' | 'update') → spec`
  - `setWriteOnMatch(spec, actionId, field, on) → spec`
  - `answerIndex(spec) → Map<elementKey, Array<{ actionId, object, field, step, use }>>` where `use`
    is `'value'` (fills the field), `'match'` (finds the record) or `'link'` (the record picked in
    this question fills a relationship)
  - `actionState(actions, index) → 'ok' | 'incomplete' | 'broken'`

- [ ] **Step 1: Write the failing tests**

`finalMappingModel.test.js`:

```js
import {
  MAX_STEPS,
  actionsOf,
  addAction,
  removeAction,
  moveAction,
  setOperation,
  setFieldSource,
  removeField,
  setMatch,
  setOnMatch,
  setWriteOnMatch,
  answerIndex,
  actionState
} from 'c/finalMappingModel';

const base = () => ({ specVersion: 1, pages: [] });
const answer = (elementKey) => ({ kind: 'answer', elementKey });

describe('finalMappingModel', () => {
  it('adds steps with fresh ids and never mutates its input', () => {
    const spec = base();
    const { spec: next, actionId } = addAction(spec, 'Contact', 'create');
    expect(spec.mapping).toBeUndefined();
    expect(actionId).toMatch(/^act_[a-z0-9]{8}$/);
    expect(actionsOf(next)).toEqual([
      { id: actionId, object: 'Contact', operation: 'create', fields: [] }
    ]);
  });

  it('stops at the cap', () => {
    let spec = base();
    for (let i = 0; i < MAX_STEPS; i++)
      spec = addAction(spec, 'Contact', 'create').spec;
    const { spec: same, actionId } = addAction(spec, 'Contact', 'create');
    expect(actionId).toBeNull();
    expect(actionsOf(same)).toHaveLength(MAX_STEPS);
  });

  it('a new find-or-create step has no match answer', () => {
    const { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
    const a = actionsOf(spec).find((x) => x.id === actionId);
    expect(a.match).toEqual({
      field: null,
      source: null,
      filter: { logic: 'all', rows: [] }
    });
    expect('onMatch' in a.match).toBe(false);
  });

  it('moves steps', () => {
    let spec = addAction(base(), 'Contact', 'create').spec;
    spec = addAction(spec, 'Case', 'create').spec;
    expect(actionsOf(moveAction(spec, 1, 0)).map((a) => a.object)).toEqual([
      'Case',
      'Contact'
    ]);
  });

  it('removing a step leaves references to it for publish to name', () => {
    let { spec, actionId: first } = addAction(base(), 'Contact', 'create');
    const r = addAction(spec, 'Contact', 'create');
    spec = setFieldSource(r.spec, r.actionId, 'ReportsToId', {
      kind: 'recordRef',
      ref: `action:${first}`
    });
    spec = removeAction(spec, first);
    const left = actionsOf(spec)[0];
    expect(left.fields[0].source.ref).toBe(`action:${first}`);
    expect(actionState(actionsOf(spec), 0)).toBe('broken');
  });

  it('sets, replaces and removes a field source', () => {
    const { spec, actionId } = addAction(base(), 'Contact', 'create');
    let next = setFieldSource(spec, actionId, 'LastName', answer('el_a'));
    next = setFieldSource(next, actionId, 'LastName', answer('el_b'));
    expect(actionsOf(next)[0].fields).toEqual([
      { field: 'LastName', source: answer('el_b') }
    ]);
    expect(
      actionsOf(removeField(next, actionId, 'LastName'))[0].fields
    ).toEqual([]);
  });

  it('switching back to create drops the match and every overwrite flag', () => {
    let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
    spec = setFieldSource(spec, actionId, 'Title', answer('el_t'));
    spec = setOnMatch(spec, actionId, 'update');
    spec = setWriteOnMatch(spec, actionId, 'Title', true);
    spec = setOperation(spec, actionId, 'create');
    const a = actionsOf(spec)[0];
    expect(a.match).toBeUndefined();
    expect(a.fields[0].writeOnMatch).toBeUndefined();
  });

  it('reuse clears overwrite flags; the match field can never be flagged', () => {
    let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
    spec = setMatch(spec, actionId, { field: 'Email', source: answer('el_e') });
    spec = setFieldSource(spec, actionId, 'Email', answer('el_e'));
    spec = setFieldSource(spec, actionId, 'Title', answer('el_t'));
    spec = setOnMatch(spec, actionId, 'update');
    spec = setWriteOnMatch(spec, actionId, 'Email', true);
    spec = setWriteOnMatch(spec, actionId, 'Title', true);
    let a = actionsOf(spec)[0];
    expect(
      a.fields.find((f) => f.field === 'Email').writeOnMatch
    ).toBeUndefined();
    expect(a.fields.find((f) => f.field === 'Title').writeOnMatch).toBe(true);
    spec = setOnMatch(spec, actionId, 'reuse');
    a = actionsOf(spec)[0];
    expect(
      a.fields.find((f) => f.field === 'Title').writeOnMatch
    ).toBeUndefined();
  });

  it('indexes answers by where they go', () => {
    let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
    spec = setMatch(spec, actionId, { field: 'Email', source: answer('el_e') });
    spec = setFieldSource(spec, actionId, 'Email', answer('el_e'));
    const index = answerIndex(spec);
    expect(index.get('el_e')).toEqual([
      { actionId, object: 'Contact', field: 'Email', use: 'match', step: 1 },
      { actionId, object: 'Contact', field: 'Email', use: 'value', step: 1 }
    ]);
  });

  it('calls a step incomplete until its match question is answered', () => {
    let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
    spec = setMatch(spec, actionId, {
      field: 'Email',
      source: answer('el_e'),
      filter: {
        logic: 'all',
        rows: [{ fieldPath: 'LastName', operator: 'isNotBlank' }]
      }
    });
    spec = setFieldSource(spec, actionId, 'LastName', answer('el_l'));
    expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
    spec = setOnMatch(spec, actionId, 'reuse');
    expect(actionState(actionsOf(spec), 0)).toBe('ok');
  });

  it('a field with no source picked yet is unfinished, not fine', () => {
    const created = addAction(base(), 'Contact', 'create');
    // exactly what "Add a field" leaves behind
    const spec = setFieldSource(created.spec, created.actionId, 'Email', null);
    expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
  });

  it('counts false and 0 as real fixed values', () => {
    const created = addAction(base(), 'Contact', 'create');
    let spec = setFieldSource(created.spec, created.actionId, 'DoNotCall', {
      kind: 'literal',
      value: false
    });
    expect(actionState(actionsOf(spec), 0)).toBe('ok');
    spec = setFieldSource(created.spec, created.actionId, 'Level__c', {
      kind: 'literal',
      value: 0
    });
    expect(actionState(actionsOf(spec), 0)).toBe('ok');
  });

  it('an empty fixed value is unfinished', () => {
    const created = addAction(base(), 'Contact', 'create');
    const spec = setFieldSource(created.spec, created.actionId, 'Title', {
      kind: 'literal',
      value: ''
    });
    expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
  });

  it('indexes the record picked in a lookup question as a link', () => {
    const created = addAction(base(), 'Contact', 'create');
    const spec = setFieldSource(created.spec, created.actionId, 'ReportsToId', {
      kind: 'recordRef',
      ref: 'answer:el_pick'
    });
    expect(answerIndex(spec).get('el_pick')).toEqual([
      {
        actionId: created.actionId,
        object: 'Contact',
        field: 'ReportsToId',
        use: 'link',
        step: 1
      }
    ]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingModel`
Expected: FAIL — module `c/finalMappingModel` not found.

- [ ] **Step 3: Write the module**

`finalMappingModel.js`:

```js
/**
 * finalMappingModel — every read and write of spec.mapping, as pure
 * functions (FREEFORM_F2_MAPPING_SPEC section 4). Components stay thin:
 * they call these and emit the returned spec. Nothing here mutates its
 * input. Publish is the real judge (FinalMappingValidator); actionState
 * only gives the step list its hints.
 */
export const MAX_STEPS = 10;

export function actionsOf(spec) {
  return (spec && spec.mapping && spec.mapping.actions) || [];
}

function withActions(spec) {
  const next = JSON.parse(JSON.stringify(spec || {}));
  next.mapping = next.mapping || {};
  next.mapping.actions = next.mapping.actions || [];
  return next;
}

function update(spec, actionId, fn) {
  const next = withActions(spec);
  const action = next.mapping.actions.find((a) => a.id === actionId);
  if (action) {
    action.fields = action.fields || [];
    fn(action);
  }
  return next;
}

/** Same shape and randomness as the Studio's element ids. */
function mintActionId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) {
    suffix += (b % 36).toString(36);
  }
  return `act_${suffix}`;
}

function emptyMatch() {
  return { field: null, source: null, filter: { logic: 'all', rows: [] } };
}

export function addAction(spec, objectApi, operation = 'create') {
  const next = withActions(spec);
  if (next.mapping.actions.length >= MAX_STEPS) {
    return { spec, actionId: null };
  }
  const actionId = mintActionId();
  const action = { id: actionId, object: objectApi, operation, fields: [] };
  if (operation === 'findOrCreate') {
    action.match = emptyMatch(); // no onMatch: the author must answer (D32)
  }
  next.mapping.actions.push(action);
  return { spec: next, actionId };
}

/**
 * References to the removed step stay where they are. Publish refuses them
 * and names the step, which is louder than silently clearing an author's
 * work.
 */
export function removeAction(spec, actionId) {
  const next = withActions(spec);
  next.mapping.actions = next.mapping.actions.filter((a) => a.id !== actionId);
  return next;
}

export function moveAction(spec, fromIndex, toIndex) {
  const next = withActions(spec);
  const list = next.mapping.actions;
  if (
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex >= list.length
  ) {
    return next;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return next;
}

function dropOverwriteFlags(action) {
  action.fields.forEach((f) => {
    delete f.writeOnMatch;
  });
}

export function setOperation(spec, actionId, operation) {
  return update(spec, actionId, (a) => {
    a.operation = operation;
    if (operation === 'findOrCreate') {
      a.match = a.match || emptyMatch();
    } else {
      delete a.match;
      dropOverwriteFlags(a);
    }
  });
}

export function setFieldSource(spec, actionId, field, source) {
  return update(spec, actionId, (a) => {
    const existing = a.fields.find((f) => f.field === field);
    if (existing) {
      existing.source = source;
    } else {
      a.fields.push({ field, source });
    }
  });
}

export function removeField(spec, actionId, field) {
  return update(spec, actionId, (a) => {
    a.fields = a.fields.filter((f) => f.field !== field);
  });
}

export function setMatch(spec, actionId, patch) {
  return update(spec, actionId, (a) => {
    a.match = { ...(a.match || emptyMatch()), ...patch };
    if (patch.field) {
      const matched = a.fields.find((f) => f.field === patch.field);
      if (matched) {
        delete matched.writeOnMatch;
      }
    }
  });
}

export function setOnMatch(spec, actionId, onMatch) {
  return update(spec, actionId, (a) => {
    a.match = { ...(a.match || emptyMatch()), onMatch };
    if (onMatch !== 'update') {
      dropOverwriteFlags(a);
    }
  });
}

/** The match field can never be overwritten: you don't overwrite what you searched by. */
export function setWriteOnMatch(spec, actionId, field, on) {
  return update(spec, actionId, (a) => {
    if (!a.match || a.match.onMatch !== 'update' || a.match.field === field) {
      return;
    }
    const f = a.fields.find((x) => x.field === field);
    if (!f) {
      return;
    }
    if (on) {
      f.writeOnMatch = true;
    } else {
      delete f.writeOnMatch;
    }
  });
}

export function answerIndex(spec) {
  const index = new Map();
  const add = (key, entry) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  };
  actionsOf(spec).forEach((a, i) => {
    const base = { actionId: a.id, object: a.object, step: i + 1 };
    if (a.match && a.match.source && a.match.source.kind === 'answer') {
      add(a.match.source.elementKey, {
        ...base,
        field: a.match.field,
        use: 'match'
      });
    }
    (a.fields || []).forEach((f) => {
      if (!f.source) return;
      if (f.source.kind === 'answer') {
        add(f.source.elementKey, { ...base, field: f.field, use: 'value' });
      } else if (
        f.source.kind === 'recordRef' &&
        typeof f.source.ref === 'string' &&
        f.source.ref.startsWith('answer:')
      ) {
        // The record picked in a lookup question, filling a relationship.
        // It IS used; without this it read as "Stored only".
        add(f.source.ref.slice(7), { ...base, field: f.field, use: 'link' });
      }
    });
  });
  return index;
}

/**
 * A source is usable, not merely present. `false` and `0` are perfectly
 * good fixed values, so nothing here asks whether a value is truthy.
 */
function sourceUsable(source, earlier) {
  if (!source) return false;
  if (source.kind === 'answer') {
    return typeof source.elementKey === 'string' && source.elementKey !== '';
  }
  if (source.kind === 'literal') {
    return (
      source.value !== null && source.value !== undefined && source.value !== ''
    );
  }
  if (source.kind === 'recordRef') {
    const ref = source.ref;
    if (typeof ref !== 'string') return false;
    if (ref.startsWith('action:')) return earlier.has(ref.slice(7));
    if (ref.startsWith('answer:')) return ref.length > 'answer:'.length;
    return false; // 'link' is refused at publish while F2 has nowhere to read it
  }
  return false;
}

export function actionState(actions, index) {
  const a = actions[index];
  if (!a) return 'broken';
  const earlier = new Set(actions.slice(0, index).map((x) => x.id));
  const fields = a.fields || [];
  const broken = fields.some(
    (f) =>
      f.source &&
      f.source.kind === 'recordRef' &&
      typeof f.source.ref === 'string' &&
      f.source.ref.startsWith('action:') &&
      !earlier.has(f.source.ref.slice(7))
  );
  if (broken) return 'broken';
  if (!fields.length) return 'incomplete';
  // A field whose source was never picked — which is the state "Add a
  // field" leaves behind — is unfinished, not fine.
  if (fields.some((f) => !sourceUsable(f.source, earlier))) return 'incomplete';
  if (a.operation === 'findOrCreate') {
    const m = a.match || {};
    if (
      !m.field ||
      !sourceUsable(m.source, earlier) ||
      !m.onMatch ||
      !(m.filter && (m.filter.rows || []).length)
    ) {
      return 'incomplete';
    }
  }
  return 'ok';
}
```

`finalMappingModel.js-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingModel`
Expected: 14 pass.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/f2-m3-data-mode
git add force-app/main/default/lwc/finalMappingModel
git commit -m "feat(freeform): F2 M3 - mapping model module"
```

### Task 13: `FinalMappingController` — what the Studio reads

**Files:**

- Create: `classes/FinalMappingController.cls`
- Modify: `classes/FinalFormCreateController.cls:54` — `isSystemTable` becomes `public static`
- Modify: `classes/FinalStudioController.cls` — `describeFields` rows gain `displayType`
- Modify: `permissionsets/Form_Builder_Admin.permissionset-meta.xml`
- Test: `classes/FinalMappingControllerTest.cls`

**Interfaces:**

- Consumes: `FinalMappingRules.COMPATIBLE`, `SETUP_OBJECTS`, `questionsInOrder`,
  `skippableElementIds`, `UNMAPPABLE_ELEMENT_TYPES`; `FinalSubmitService.answerTypeOf`;
  `FinalFormCreateController.isSystemTable`.
- Produces:
  - `@AuraEnabled(cacheable=true) List<Map<String, String>> listCreatableObjects()` → `[{label, value}]`
  - `@AuraEnabled(cacheable=true) Map<String, List<String>> compatibility()` → answer type → DisplayType names
  - `@AuraEnabled List<Map<String, Object>> describeQuestions(String specJson)` →
    `[{elementKey, label, answerType, skippable, mappable, referenceTo}]`, in form order
  - `describeFields` rows gain `displayType` (e.g. `'EMAIL'`)

- [ ] **Step 1: Write the failing tests**

`classes/FinalMappingControllerTest.cls`:

```apex
@IsTest
private class FinalMappingControllerTest {
  @IsTest
  static void creatableObjectsExcludeSetupObjects() {
    Set<String> names = new Set<String>();
    for (
      Map<String, String> o : FinalMappingController.listCreatableObjects()
    ) {
      names.add(o.get('value'));
    }
    Assert.isTrue(names.contains('Contact'));
    Assert.isFalse(
      names.contains('User'),
      'a setup object would fail every run'
    );
    Assert.isFalse(names.contains('Task'), 'not supported (D48)');
    Assert.isFalse(names.contains('Event'), 'not supported (D48)');
  }

  @IsTest
  static void compatibilityIsTheApexTable() {
    Map<String, List<String>> table = FinalMappingController.compatibility();
    Assert.isTrue(table.get('Email').contains('EMAIL'));
    Assert.isFalse(table.get('Text').contains('DOUBLE'));
  }

  @IsTest
  static void questionsComeBackInFormOrderWithTheirTypes() {
    Map<String, Object> optional = FinalMappingTestData.question(
      'el_title',
      'text',
      'Job title'
    );
    optional.put('required', false);
    List<Map<String, Object>> found = FinalMappingController.describeQuestions(
      JSON.serialize(
        FinalMappingTestData.spec(
          new List<Object>{
            FinalMappingTestData.question('el_email', 'email', 'Work email'),
            optional
          },
          null
        )
      )
    );
    Assert.areEqual('el_email', found[0].get('elementKey'));
    Assert.areEqual('Email', found[0].get('answerType'));
    Assert.areEqual(false, found[0].get('skippable'));
    Assert.areEqual(true, found[1].get('skippable'));
    Assert.areEqual(true, found[1].get('mappable'));
  }

  @IsTest
  static void describeFieldsCarriesTheDescribeType() {
    for (
      Map<String, Object> row : FinalStudioController.describeFields('Contact')
    ) {
      if (row.get('apiName') == 'Email') {
        Assert.areEqual('EMAIL', row.get('displayType'));
        return;
      }
    }
    Assert.fail('Contact.Email is creatable and must be listed');
  }
}
```

- [ ] **Step 2: Deploy to verify they fail**

Run: `sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingControllerTest.cls`
Expected: FAIL — `Variable does not exist: FinalMappingController`.

- [ ] **Step 3: Implement**

In `FinalFormCreateController.cls` line 54, change `private static Boolean isSystemTable(String name) {`
to `public static Boolean isSystemTable(String name) {`.

In `FinalStudioController.describeFields`, inside the `Map<String, Object> row = new Map<String, Object>{ … }`
literal, add after `'inputType' => inputType,`:

```apex
                // The describe type itself, so the mapping source picker can
                // apply FinalMappingRules.COMPATIBLE exactly as publish does.
                'displayType' => String.valueOf(fd.getType()),
```

`classes/FinalMappingController.cls`:

```apex
/**
 * FinalMappingController — what the Studio's Data mode reads
 * (FREEFORM_F2_MAPPING_SPEC section 5). with sharing, as the author: the
 * object list reflects what they can create, which is what publish will
 * check anyway.
 */
public with sharing class FinalMappingController {
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> listCreatableObjects() {
    List<Map<String, String>> out = new List<Map<String, String>>();
    for (Schema.SObjectType st : Schema.getGlobalDescribe().values()) {
      try {
        Schema.DescribeSObjectResult d = st.getDescribe();
        if (
          d.isCreateable() &&
          d.isQueryable() &&
          d.isAccessible() &&
          !d.isDeprecatedAndHidden() &&
          !d.isCustomSetting() &&
          !FinalFormCreateController.isSystemTable(d.getName()) &&
          !FinalMappingRules.SETUP_OBJECTS.contains(d.getName().toLowerCase()) &&
          !FinalMappingRules.UNSUPPORTED_OBJECTS.contains(d.getName().toLowerCase())
        ) {
          out.add(
            new Map<String, String>{
              'label' => d.getLabel(),
              'value' => d.getName()
            }
          );
        }
      } catch (Exception ignored) {
        // Some describes throw for restricted types — skip them.
      }
    }
    out.sort(new ByLabel());
    return out;
  }

  @AuraEnabled(cacheable=true)
  public static Map<String, List<String>> compatibility() {
    Map<String, List<String>> out = new Map<String, List<String>>();
    for (String answerType : FinalMappingRules.COMPATIBLE.keySet()) {
      List<String> types = new List<String>();
      for (
        Schema.DisplayType t : FinalMappingRules.COMPATIBLE.get(answerType)
      ) {
        types.add(t.name());
      }
      types.sort();
      out.put(answerType, types);
    }
    return out;
  }

  @AuraEnabled
  public static List<Map<String, Object>> describeQuestions(String specJson) {
    Map<String, Object> spec;
    try {
      spec = (Map<String, Object>) JSON.deserializeUntyped(specJson);
    } catch (Exception e) {
      throw FinalMappingRules.refusal('The form couldn’t be read.');
    }
    Set<String> skippable = FinalMappingRules.skippableElementIds(spec);
    List<Map<String, Object>> out = new List<Map<String, Object>>();
    for (Map<String, Object> q : FinalMappingRules.questionsInOrder(spec)) {
      String id = (String) q.get('id');
      Map<String, Object> config = FinalMappingRules.asMap(q.get('config'));
      out.add(
        new Map<String, Object>{
          'elementKey' => id,
          'label' => q.get('label'),
          'answerType' => FinalSubmitService.answerTypeOf(q),
          'skippable' => skippable.contains(id),
          'mappable' => !FinalMappingRules.UNMAPPABLE_ELEMENT_TYPES.contains(
            String.valueOf(q.get('type'))
          ),
          'referenceTo' => config == null ? null : config.get('referenceTo')
        }
      );
    }
    return out;
  }

  private class ByLabel implements System.Comparator<Map<String, String>> {
    public Integer compare(Map<String, String> a, Map<String, String> b) {
      return a.get('label').compareTo(b.get('label'));
    }
  }
}
```

In `Form_Builder_Admin.permissionset-meta.xml`:

```xml
<classAccesses>
        <apexClass>FinalMappingController</apexClass>
        <enabled>true</enabled>
    </classAccesses>
```

- [ ] **Step 4: Deploy and run**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/classes/FinalMappingController.cls --source-dir force-app/main/default/classes/FinalMappingControllerTest.cls --source-dir force-app/main/default/classes/FinalFormCreateController.cls --source-dir force-app/main/default/classes/FinalStudioController.cls --source-dir force-app/main/default/permissionsets/Form_Builder_Admin.permissionset-meta.xml
sf apex run test --target-org revclouddev --class-names FinalMappingControllerTest --class-names FinalStudioControllerTest --class-names FinalFormCreateControllerTest --result-format human --wait 15
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add force-app/main/default/classes/FinalMappingController.cls force-app/main/default/classes/FinalMappingController.cls-meta.xml force-app/main/default/classes/FinalMappingControllerTest.cls force-app/main/default/classes/FinalMappingControllerTest.cls-meta.xml force-app/main/default/classes/FinalFormCreateController.cls force-app/main/default/classes/FinalStudioController.cls force-app/main/default/permissionsets/Form_Builder_Admin.permissionset-meta.xml
git commit -m "feat(freeform): F2 M3 - Studio reads for Data mode"
```

### Task 14: Data mode in the Studio, the step list, the answers index

**Files:**

- Create: `lwc/finalDataMode/` (`.js`, `.html`, `.css`, `.js-meta.xml`, `__tests__/finalDataMode.test.js`)
- Create: `lwc/finalMappingEditor/` (same set)
- Modify: `lwc/finalFormStudio/finalFormStudio.js`, `.html`; test

**Interfaces:**

- Consumes: `c/finalMappingModel`; `FinalMappingController.listCreatableObjects`, `.compatibility`,
  `.describeQuestions`.
- Produces:
  - `<c-final-data-mode spec form-id read-only is-public onspecchange>`
  - `<c-final-mapping-editor spec read-only is-public onspecchange>` — renders the step list and
    the answers index; hosts `<c-final-mapping-action>` (Task 15) for the selected step
  - Studio: `mode === 'data'`; `get isData`, `get dataClass`, `get isDataPressed`,
    `get showDataMode` (Freeform only), `handleModeData()`

- [ ] **Step 1: Write the failing Studio test**

The Studio derives its type from `spec.form.type` (`c/finalFormTypes`, `FREEFORM = 'freeform'`).
Data mode renders the real editor, which calls Apex on connect, so the Studio test file needs those
three mocks with resolved defaults. Add them beside the file's other `jest.mock` calls:

```js
jest.mock(
  '@salesforce/apex/FinalMappingController.listCreatableObjects',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.compatibility',
  () => ({ default: jest.fn(() => Promise.resolve({})) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.describeQuestions',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
```

Then append, using the file's `mount()`, `flush()`, `SPEC`, `loadStudio` and
`CurrentPageReference`:

```js
describe('Data mode', () => {
  async function open(type) {
    const spec = JSON.parse(JSON.stringify(SPEC));
    spec.form = { id: 'a0F1', name: 'Mapped', type };
    loadStudio.mockResolvedValue({
      name: 'Mapped',
      specJson: JSON.stringify(spec),
      draftVersionId: 'a0V1',
      versionNumber: 2,
      activeVersionNumber: 1
    });
    const el = mount();
    CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
    await flush();
    return el;
  }
  const modes = (el) => [...el.shadowRoot.querySelectorAll('.st-mode')];

  it('is offered for a Freeform and opens the data surface', async () => {
    const el = await open('freeform');
    const data = modes(el).find((b) => b.textContent.trim() === 'Data');
    expect(data).toBeTruthy();
    data.click();
    await flush();
    expect(el.shadowRoot.querySelector('c-final-data-mode')).toBeTruthy();
    expect(data.getAttribute('aria-pressed')).toBe('true');
  });

  it('is not offered for a Form', async () => {
    const el = await open('form');
    expect(modes(el).map((b) => b.textContent.trim())).toEqual([
      'Build',
      'Design'
    ]);
  });
});
```

Existing tests pick Build as `.st-mode[0]`; Data goes after Build, so that index is unchanged.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- force-app/main/default/lwc/finalFormStudio`
Expected: FAIL — no Data button.

- [ ] **Step 3: Add the mode to the Studio**

In `finalFormStudio.js`, next to `get isDesign()` (line 491):

```js
    get isData() {
        return this.mode === 'data';
    }

    /** Data mode is Freeform-only in F2; Form and Survey gain it with Autofill (D30). */
    get showDataMode() {
        return this.isFreeform;
    }

    get dataClass() {
        return this.mode === 'data' ? 'st-mode on' : 'st-mode';
    }

    get isDataPressed() {
        return String(this.mode === 'data');
    }
```

Next to `handleModeDesign()` (line 628):

```js
    handleModeData() {
        if (this.isReadOnly) {
            return;
        }
        if (this.mode !== 'data') this.capturePreviewSession();
        this.mode = 'data';
        this.settingsMenuOpen = false;
    }
```

In `finalFormStudio.html`, between the Build and Design buttons inside `.st-modes`:

```html
<template lwc:if={showDataMode}>
  <button
    type="button"
    class={dataClass}
    aria-pressed={isDataPressed}
    disabled={modeDisabled}
    onclick={handleModeData}
  >
    Data
  </button>
</template>
```

And add a region directly before `<template lwc:elseif={isDesign}>` (line 288):

```html
<template lwc:elseif={isData}>
  <main class="st-stagearea st-stagearea--data">
    <c-final-data-mode
      spec={spec}
      form-id={formId}
      read-only={isReadOnly}
      is-public={isPublic}
      onspecchange={handleSpecChange}
    ></c-final-data-mode>
  </main>
</template>
```

- [ ] **Step 4: Write `finalDataMode`**

`finalDataMode.html`:

```html
<template>
  <div class="dm-shell">
    <nav class="dm-sections" aria-label="Data sections">
      <span class="dm-section dm-section--on" aria-current="page">
        <lightning-icon
          icon-name="utility:upload"
          size="x-small"
        ></lightning-icon>
        <span>Mapping</span>
        <span class="dm-count">{stepCountLabel}</span>
      </span>
      <span class="dm-spacer"></span>
      <span class="dm-hint">Runs after each submission is saved</span>
    </nav>
    <c-final-mapping-editor
      spec={spec}
      read-only={readOnly}
      is-public={isPublic}
      onspecchange={handleSpecChange}
    ></c-final-mapping-editor>
  </div>
</template>
```

`finalDataMode.js`:

```js
import { LightningElement, api } from 'lwc';
import { actionsOf } from 'c/finalMappingModel';

/**
 * finalDataMode — the Studio's Data mode (FREEFORM_F2_MAPPING_SPEC section
 * 3): where values come from, and where they go. F2 ships the Mapping
 * section only; Autofill moves in beside it in its own slice (D30).
 */
export default class FinalDataMode extends LightningElement {
  @api spec;
  @api formId;
  @api readOnly = false;
  @api isPublic = false;

  get stepCountLabel() {
    const n = actionsOf(this.spec).length;
    return n === 1 ? '1 record' : `${n} records`;
  }

  handleSpecChange(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('specchange', { detail: { spec: event.detail.spec } })
    );
  }
}
```

`finalDataMode.css`:

```css
:host {
  display: block;
  height: 100%;
}
.dm-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.dm-sections {
  display: flex;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0 1rem;
  min-height: 2.75rem;
  background: #fff;
  border-bottom: 1px solid #e3e3e3;
}
.dm-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.875rem;
  font-size: 0.8125rem;
  border-bottom: 2px solid transparent;
}
.dm-section--on {
  font-weight: 600;
  color: #0b5cab;
  border-bottom-color: #0b5cab;
}
.dm-count {
  font-weight: 400;
  color: #6b6b6b;
}
.dm-spacer {
  flex-grow: 1;
}
.dm-hint {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: #6b6b6b;
}
```

`finalDataMode/__tests__/finalDataMode.test.js`:

```js
import { createElement } from 'lwc';
import FinalDataMode from 'c/finalDataMode';

jest.mock(
  '@salesforce/apex/FinalMappingController.listCreatableObjects',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.compatibility',
  () => ({ default: jest.fn(() => Promise.resolve({})) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.describeQuestions',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);

describe('c-final-data-mode', () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it('counts the records the mapping makes', () => {
    const el = createElement('c-final-data-mode', { is: FinalDataMode });
    el.spec = { mapping: { actions: [{ id: 'act_1' }, { id: 'act_2' }] } };
    document.body.appendChild(el);
    expect(el.shadowRoot.querySelector('.dm-count').textContent).toBe(
      '2 records'
    );
  });

  it('relays the editor’s spec change', () => {
    const el = createElement('c-final-data-mode', { is: FinalDataMode });
    el.spec = {};
    document.body.appendChild(el);
    const handler = jest.fn();
    el.addEventListener('specchange', handler);
    el.shadowRoot
      .querySelector('c-final-mapping-editor')
      .dispatchEvent(
        new CustomEvent('specchange', { detail: { spec: { next: true } } })
      );
    expect(handler.mock.calls[0][0].detail.spec).toEqual({ next: true });
  });
});
```

- [ ] **Step 5: Write `finalMappingEditor`**

`finalMappingEditor.js`:

```js
import { LightningElement, api } from 'lwc';
import listCreatableObjects from '@salesforce/apex/FinalMappingController.listCreatableObjects';
import compatibility from '@salesforce/apex/FinalMappingController.compatibility';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';
import {
  MAX_STEPS,
  actionsOf,
  addAction,
  moveAction,
  answerIndex,
  actionState
} from 'c/finalMappingModel';

const STATE_TEXT = {
  incomplete: 'Not finished',
  broken: 'Points at a missing step'
};

/** What this answer does on that record, in the author's words. */
function describeUse(use) {
  if (use.use === 'match') return 'used to find the record';
  if (use.use === 'link') return `linked as ${use.field}`;
  return use.field;
}

/**
 * finalMappingEditor — the Mapping page (FREEFORM_F2_MAPPING_SPEC section
 * 5): the steps in run order, the selected step, and where every answer
 * lands. It owns selection; the spec belongs to the Studio.
 */
export default class FinalMappingEditor extends LightningElement {
  @api readOnly = false;
  @api isPublic = false;

  objects = [];
  compat = {};
  questions = [];
  selectedId;
  adding = false;
  newObject = '';
  newOperation = 'create';
  _spec;
  _questionsFor;
  _dragFrom = null;

  @api
  get spec() {
    return this._spec;
  }
  set spec(value) {
    this._spec = value;
    this._loadQuestions();
  }

  /**
   * Imperative, not @wire: the Studio's tests mock Apex as plain
   * functions, and both methods are cacheable either way.
   */
  connectedCallback() {
    listCreatableObjects()
      .then((data) => {
        this.objects = data || [];
      })
      .catch(() => {
        this.objects = [];
      });
    compatibility()
      .then((data) => {
        this.compat = data || {};
      })
      .catch(() => {
        this.compat = {};
      });
  }

  /** Question types come from Apex so they match what publish checks. */
  async _loadQuestions() {
    const pagesJson = JSON.stringify((this._spec && this._spec.pages) || []);
    if (pagesJson === this._questionsFor) return;
    this._questionsFor = pagesJson;
    try {
      this.questions = await describeQuestions({
        specJson: JSON.stringify(this._spec || {})
      });
    } catch (e) {
      this.questions = [];
    }
  }

  get actions() {
    return actionsOf(this._spec);
  }

  get hasActions() {
    return this.actions.length > 0;
  }

  get atCap() {
    return this.actions.length >= MAX_STEPS;
  }

  get cards() {
    const labels = new Map(this.objects.map((o) => [o.value, o.label]));
    const all = this.actions;
    return all.map((a, i) => {
      const state = actionState(all, i);
      const selected = a.id === this.selectedIdOrFirst;
      return {
        id: a.id,
        index: i,
        title: `${i + 1}  ${labels.get(a.object) || a.object}`,
        detail: `${a.operation === 'findOrCreate' ? 'Find or create' : 'Create'} · ${(a.fields || []).length} fields`,
        stateText: STATE_TEXT[state] || '',
        cls: `me-card${selected ? ' me-card--on' : ''}${state !== 'ok' ? ' me-card--warn' : ''}`,
        ariaCurrent: selected ? 'true' : 'false',
        draggable: this.readOnly ? 'false' : 'true',
        upDisabled: i === 0 || this.readOnly,
        downDisabled: i === all.length - 1 || this.readOnly
      };
    });
  }

  get selectedIdOrFirst() {
    const all = this.actions;
    if (all.some((a) => a.id === this.selectedId)) return this.selectedId;
    return all.length ? all[0].id : null;
  }

  get objectOptions() {
    return this.objects;
  }

  get operationOptions() {
    return [
      { label: 'Always create', value: 'create' },
      { label: 'Find or create', value: 'findOrCreate' }
    ];
  }

  get addDisabled() {
    return !this.newObject || this.readOnly;
  }

  get indexRows() {
    const index = answerIndex(this._spec);
    const labels = new Map(this.objects.map((o) => [o.value, o.label]));
    return this.questions.map((q) => {
      const uses = index.get(q.elementKey) || [];
      return {
        key: q.elementKey,
        label: q.label,
        where: uses.length
          ? uses
              .map(
                (u) =>
                  `${labels.get(u.object) || u.object} · ${describeUse(u)}`
              )
              .join(', ')
          : 'Stored only',
        cls: uses.length
          ? 'me-index-where me-index-where--mapped'
          : 'me-index-where'
      };
    });
  }

  handleSelect(event) {
    this.selectedId = event.currentTarget.dataset.id;
  }

  handleStartAdd() {
    this.adding = true;
  }

  handleObjectPick(event) {
    this.newObject = event.detail.value;
  }

  handleOperationPick(event) {
    this.newOperation = event.detail.value;
  }

  handleCancelAdd() {
    this.adding = false;
    this.newObject = '';
  }

  handleAdd() {
    const { spec, actionId } = addAction(
      this._spec,
      this.newObject,
      this.newOperation
    );
    if (!actionId) return;
    this.adding = false;
    this.newObject = '';
    this.newOperation = 'create';
    this.selectedId = actionId;
    this._emit(spec);
  }

  handleMoveUp(event) {
    const i = Number(event.currentTarget.dataset.index);
    this._emit(moveAction(this._spec, i, i - 1));
  }

  handleMoveDown(event) {
    const i = Number(event.currentTarget.dataset.index);
    this._emit(moveAction(this._spec, i, i + 1));
  }

  handleDragStart(event) {
    this._dragFrom = Number(event.currentTarget.dataset.index);
    event.dataTransfer.effectAllowed = 'move';
  }

  handleDragOver(event) {
    if (this._dragFrom !== null) event.preventDefault();
  }

  handleDrop(event) {
    event.preventDefault();
    const to = Number(event.currentTarget.dataset.index);
    if (this._dragFrom !== null && to !== this._dragFrom) {
      this._emit(moveAction(this._spec, this._dragFrom, to));
    }
    this._dragFrom = null;
  }

  handleActionChange(event) {
    event.stopPropagation();
    this._emit(event.detail.spec);
  }

  handleActionRemoved(event) {
    event.stopPropagation();
    this.selectedId = null;
    this._emit(event.detail.spec);
  }

  _emit(spec) {
    this.dispatchEvent(new CustomEvent('specchange', { detail: { spec } }));
  }
}
```

`finalMappingEditor.html`:

```html
<template>
  <div class="me-grid">
    <section class="me-col me-steps" aria-label="Records created">
      <h2 class="me-heading">Records created</h2>
      <p class="me-note">
        In this order. A record can only point at one created before it.
      </p>
      <template for:each={cards} for:item="card">
        <div
          key={card.id}
          class={card.cls}
          draggable={card.draggable}
          data-index={card.index}
          ondragstart={handleDragStart}
          ondragover={handleDragOver}
          ondrop={handleDrop}
        >
          <button
            type="button"
            class="me-card-main"
            data-id={card.id}
            aria-current={card.ariaCurrent}
            onclick={handleSelect}
          >
            <span class="me-card-title">{card.title}</span>
            <span class="me-card-detail">{card.detail}</span>
            <template lwc:if={card.stateText}>
              <span class="me-card-state">{card.stateText}</span>
            </template>
          </button>
          <span class="me-card-moves">
            <lightning-button-icon
              icon-name="utility:up"
              variant="bare"
              size="small"
              alternative-text="Move up"
              data-index={card.index}
              disabled={card.upDisabled}
              onclick={handleMoveUp}
            ></lightning-button-icon>
            <lightning-button-icon
              icon-name="utility:down"
              variant="bare"
              size="small"
              alternative-text="Move down"
              data-index={card.index}
              disabled={card.downDisabled}
              onclick={handleMoveDown}
            ></lightning-button-icon>
          </span>
        </div>
      </template>

      <template lwc:if={adding}>
        <div class="me-add">
          <lightning-combobox
            label="Object"
            placeholder="Choose an object"
            options={objectOptions}
            value={newObject}
            onchange={handleObjectPick}
          ></lightning-combobox>
          <lightning-radio-group
            label="What this step does"
            options={operationOptions}
            value={newOperation}
            type="button"
            onchange={handleOperationPick}
          ></lightning-radio-group>
          <div class="me-add-buttons">
            <lightning-button
              label="Cancel"
              onclick={handleCancelAdd}
            ></lightning-button>
            <lightning-button
              label="Add record"
              variant="brand"
              disabled={addDisabled}
              onclick={handleAdd}
            ></lightning-button>
          </div>
        </div>
      </template>
      <template lwc:elseif={atCap}>
        <p class="me-note">A form can create at most 10 records.</p>
      </template>
      <template lwc:else>
        <button
          type="button"
          class="me-add-start"
          disabled={readOnly}
          onclick={handleStartAdd}
        >
          <lightning-icon
            icon-name="utility:add"
            size="x-small"
          ></lightning-icon>
          Add a record
        </button>
      </template>

      <p class="me-footer">
        If any step fails, none of the records are created. The answers are
        always kept.
      </p>
    </section>

    <section class="me-col me-detail" aria-label="Selected record">
      <template lwc:if={hasActions}>
        <c-final-mapping-action
          spec={spec}
          action-id={selectedIdOrFirst}
          objects={objects}
          questions={questions}
          compatibility={compat}
          read-only={readOnly}
          is-public={isPublic}
          onspecchange={handleActionChange}
          onactionremoved={handleActionRemoved}
        ></c-final-mapping-action>
      </template>
      <template lwc:else>
        <div class="me-empty">
          <h2 class="me-empty-title">Send answers to Salesforce records</h2>
          <p>
            Add a record, then choose which answer fills each of its fields.
            Answers are stored either way.
          </p>
        </div>
      </template>
    </section>

    <section class="me-col me-index" aria-label="Answers">
      <h2 class="me-heading">Answers</h2>
      <template for:each={indexRows} for:item="row">
        <div key={row.key} class="me-index-row">
          <span class="me-index-label">{row.label}</span>
          <span class={row.cls}>{row.where}</span>
        </div>
      </template>
      <p class="me-footer">
        Every answer is stored and readable on the submission, whether or not it
        reaches a record.
      </p>
    </section>
  </div>
</template>
```

`finalMappingEditor.css`:

```css
:host {
  display: block;
  flex-grow: 1;
  min-height: 0;
}
.me-grid {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr) 20rem;
  gap: 1rem;
  padding: 1rem;
  height: 100%;
  box-sizing: border-box;
}
.me-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  overflow: auto;
  background: #fff;
  border: 1px solid #e3e3e3;
  border-radius: 0.5rem;
  padding: 0.875rem;
}
.me-heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.025rem;
  text-transform: uppercase;
  color: #6b6b6b;
}
.me-note,
.me-footer {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #6b6b6b;
}
.me-footer {
  margin-top: auto;
  padding-top: 0.625rem;
  border-top: 1px solid #e3e3e3;
}
.me-card {
  display: flex;
  align-items: flex-start;
  border: 1px solid #e3e3e3;
  border-radius: 0.375rem;
}
.me-card--on {
  background: #eaf3fb;
  border-color: #0b5cab;
}
.me-card--warn {
  border-color: #f0c894;
}
.me-card-main {
  flex-grow: 1;
  text-align: left;
  background: transparent;
  border: none;
  padding: 0.625rem 0.75rem;
  cursor: pointer;
}
.me-card-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
}
.me-card-detail {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.me-card-state {
  display: block;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #8a5300;
}
.me-card-moves {
  display: flex;
  flex-direction: column;
  padding: 0.25rem;
}
.me-add-start {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: transparent;
  border: 1px dashed #cfcfcf;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  color: #0b5cab;
  cursor: pointer;
}
.me-add {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem;
  border: 1px solid #e3e3e3;
  border-radius: 0.375rem;
}
.me-add-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.me-empty {
  margin: auto;
  max-width: 26rem;
  text-align: center;
  color: #444;
}
.me-empty-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}
.me-index-row {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.125rem;
  border-bottom: 1px solid #f0f0f0;
}
.me-index-label {
  font-size: 0.8125rem;
}
.me-index-where {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.me-index-where--mapped {
  color: #0b5cab;
}
```

`finalMappingEditor/__tests__/finalMappingEditor.test.js`:

```js
import { createElement } from 'lwc';
import FinalMappingEditor from 'c/finalMappingEditor';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';

jest.mock(
  '@salesforce/apex/FinalMappingController.listCreatableObjects',
  () => ({
    default: jest.fn(() =>
      Promise.resolve([{ label: 'Contact', value: 'Contact' }])
    )
  }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.compatibility',
  () => ({ default: jest.fn(() => Promise.resolve({})) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/FinalMappingController.describeQuestions',
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec) {
  const el = createElement('c-final-mapping-editor', {
    is: FinalMappingEditor
  });
  el.spec = spec;
  document.body.appendChild(el);
  return el;
}

describe('c-final-mapping-editor', () => {
  beforeEach(() => {
    describeQuestions.mockResolvedValue([
      {
        elementKey: 'el_e',
        label: 'Work email',
        answerType: 'Email',
        skippable: false,
        mappable: true
      },
      {
        elementKey: 'el_n',
        label: 'Anything else',
        answerType: 'Text',
        skippable: true,
        mappable: true
      }
    ]);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it('invites the first record when there are none', async () => {
    const el = mount({ pages: [] });
    await flush();
    expect(
      el.shadowRoot.querySelector('.me-empty-title').textContent
    ).toContain('Send answers');
  });

  it('lists steps in order and marks an unfinished one', async () => {
    const el = mount({
      pages: [],
      mapping: {
        actions: [
          {
            id: 'act_1',
            object: 'Contact',
            operation: 'findOrCreate',
            fields: [
              {
                field: 'LastName',
                source: { kind: 'answer', elementKey: 'el_n' }
              }
            ],
            match: { field: 'Email' }
          }
        ]
      }
    });
    await flush();
    const card = el.shadowRoot.querySelector('.me-card');
    expect(card.textContent).toContain('1');
    expect(card.querySelector('.me-card-state').textContent).toBe(
      'Not finished'
    );
  });

  it('shows which answers go nowhere', async () => {
    const el = mount({
      pages: [],
      mapping: {
        actions: [
          {
            id: 'act_1',
            object: 'Contact',
            operation: 'create',
            fields: [
              { field: 'Email', source: { kind: 'answer', elementKey: 'el_e' } }
            ]
          }
        ]
      }
    });
    await flush();
    const rows = [...el.shadowRoot.querySelectorAll('.me-index-row')].map(
      (r) => r.textContent
    );
    expect(rows[0]).toContain('Contact · Email');
    expect(rows[1]).toContain('Stored only');
  });

  it('moving a step emits the reordered spec', async () => {
    const el = mount({
      pages: [],
      mapping: {
        actions: [
          { id: 'act_1', object: 'Contact', operation: 'create', fields: [] },
          { id: 'act_2', object: 'Case', operation: 'create', fields: [] }
        ]
      }
    });
    await flush();
    const handler = jest.fn();
    el.addEventListener('specchange', handler);
    el.shadowRoot
      .querySelectorAll('lightning-button-icon[data-index="1"]')[0]
      .click();
    expect(
      handler.mock.calls[0][0].detail.spec.mapping.actions.map((a) => a.id)
    ).toEqual(['act_2', 'act_1']);
  });
});
```

`c-final-mapping-action` doesn't exist until Task 15. To keep this task green on its own, create its
bundle now as a stub: `finalMappingAction.js`

```js
import { LightningElement, api } from 'lwc';

export default class FinalMappingAction extends LightningElement {
  @api spec;
  @api actionId;
  @api objects = [];
  @api questions = [];
  @api compatibility = {};
  @api readOnly = false;
  @api isPublic = false;
}
```

`finalMappingAction.html`: `<template><div class="ma-stub"></div></template>`, plus its
`.js-meta.xml`. Task 15 replaces both files.

- [ ] **Step 6: Run the tests**

Run: `npm run test:unit -- force-app/main/default/lwc/finalFormStudio force-app/main/default/lwc/finalDataMode force-app/main/default/lwc/finalMappingEditor`
Expected: all pass.

- [ ] **Step 7: Deploy and verify in the org**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/lwc/finalDataMode --source-dir force-app/main/default/lwc/finalMappingEditor --source-dir force-app/main/default/lwc/finalMappingAction --source-dir force-app/main/default/lwc/finalMappingModel --source-dir force-app/main/default/lwc/finalFormStudio
```

Open a Freeform draft in `/apex/FinalStudio`: the top bar shows Build | Data | Design; Data shows
the empty state; Add a record → Contact → Add record → a card appears marked "Not finished". A Form
or Survey shows no Data button. Check the three columns at 1440px and at 1280px — the open layout
question is decided here: if the right column crowds the middle at 1280, record that in the PR.

- [ ] **Step 8: Commit, PR, merge the M3 slice**

```bash
git add force-app/main/default/lwc/finalDataMode force-app/main/default/lwc/finalMappingEditor force-app/main/default/lwc/finalMappingAction force-app/main/default/lwc/finalFormStudio/finalFormStudio.js force-app/main/default/lwc/finalFormStudio/finalFormStudio.html force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js
git commit -m "feat(freeform): F2 M3 - Data mode, the step list and the answers index"
git push -u origin feat/f2-m3-data-mode
```

Run the `uiux-flow-reviewer` agent on the Data mode before merging (standing pre-merge gate for UI
work). Merge.

---

## M4 — Editing a create step

### Task 15: `finalMappingAction` — operation, fields, sources

**Files:**

- Replace: `lwc/finalMappingAction/finalMappingAction.js`, `.html`; create `.css`
- Test: `lwc/finalMappingAction/__tests__/finalMappingAction.test.js`

**Interfaces:**

- Consumes: `c/finalMappingModel` (`actionsOf`, `setOperation`, `setFieldSource`, `removeField`,
  `removeAction`); `FinalStudioController.describeFields(objectApi)` rows
  `{apiName, label, inputType, displayType, required, referenceTo?, options?}`.
- Produces: `<c-final-mapping-action spec action-id objects questions compatibility read-only is-public onspecchange onactionremoved>`.
  Task 16 adds the match block to this same component.

- [ ] **Step 1: Write the failing tests**

`finalMappingAction/__tests__/finalMappingAction.test.js`:

```js
import { createElement } from 'lwc';
import FinalMappingAction from 'c/finalMappingAction';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

jest.mock(
  '@salesforce/apex/FinalStudioController.describeFields',
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);

const FIELDS = [
  {
    apiName: 'LastName',
    label: 'Last Name',
    displayType: 'STRING',
    required: true
  },
  { apiName: 'Email', label: 'Email', displayType: 'EMAIL', required: false },
  {
    apiName: 'Birthdate',
    label: 'Birthdate',
    displayType: 'DATE',
    required: false
  },
  {
    apiName: 'ReportsToId',
    label: 'Reports To',
    displayType: 'REFERENCE',
    required: false,
    referenceTo: 'Contact'
  }
];
const CASE_FIELDS = [
  {
    apiName: 'Subject',
    label: 'Subject',
    displayType: 'STRING',
    required: false
  },
  {
    apiName: 'Status',
    label: 'Status',
    displayType: 'PICKLIST',
    required: false
  }
];
const QUESTIONS = [
  {
    elementKey: 'el_e',
    label: 'Work email',
    answerType: 'Email',
    mappable: true
  },
  {
    elementKey: 'el_n',
    label: 'Your surname',
    answerType: 'Text',
    mappable: true
  }
];
const COMPAT = {
  Email: ['EMAIL', 'STRING', 'TEXTAREA'],
  Text: ['STRING', 'TEXTAREA']
};

function mount(actions, actionId) {
  describeFields.mockResolvedValue(FIELDS);
  const el = createElement('c-final-mapping-action', {
    is: FinalMappingAction
  });
  Object.assign(el, {
    spec: { mapping: { actions } },
    actionId,
    objects: [{ label: 'Contact', value: 'Contact' }],
    questions: QUESTIONS,
    compatibility: COMPAT
  });
  document.body.appendChild(el);
  return el;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('c-final-mapping-action', () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it('offers only answers that fit the field', async () => {
    const el = mount(
      [
        {
          id: 'act_1',
          object: 'Contact',
          operation: 'create',
          fields: [{ field: 'Email', source: null }]
        }
      ],
      'act_1'
    );
    await flush();
    const picker = el.shadowRoot.querySelector(
      'lightning-combobox[data-field="Email"]'
    );
    const values = picker.options.map((o) => o.value);
    expect(values).toContain('answer:el_e');
    expect(values).not.toContain('answer:el_n'); // text never goes into Email
    expect(values).toContain('literal');
  });

  it('explains why another record is not offered', async () => {
    const el = mount(
      [
        {
          id: 'act_1',
          object: 'Contact',
          operation: 'create',
          fields: [{ field: 'Email', source: null }]
        }
      ],
      'act_1'
    );
    await flush();
    expect(
      el.shadowRoot.querySelector('[data-row="Email"] .ma-why').textContent
    ).toContain('isn’t a lookup');
  });

  it('offers earlier steps for a lookup field', async () => {
    const el = mount(
      [
        { id: 'act_0', object: 'Contact', operation: 'create', fields: [] },
        {
          id: 'act_1',
          object: 'Contact',
          operation: 'create',
          fields: [{ field: 'ReportsToId', source: null }]
        }
      ],
      'act_1'
    );
    await flush();
    const values = el.shadowRoot
      .querySelector('lightning-combobox[data-field="ReportsToId"]')
      .options.map((o) => o.value);
    expect(values).toContain('action:act_0');
  });

  it('choosing an answer emits the spec with that source', async () => {
    const el = mount(
      [
        {
          id: 'act_1',
          object: 'Contact',
          operation: 'create',
          fields: [{ field: 'Email', source: null }]
        }
      ],
      'act_1'
    );
    await flush();
    const handler = jest.fn();
    el.addEventListener('specchange', handler);
    el.shadowRoot
      .querySelector('lightning-combobox[data-field="Email"]')
      .dispatchEvent(
        new CustomEvent('change', { detail: { value: 'answer:el_e' } })
      );
    const action = handler.mock.calls[0][0].detail.spec.mapping.actions[0];
    expect(action.fields[0].source).toEqual({
      kind: 'answer',
      elementKey: 'el_e'
    });
  });

  it('drops a describe that lands after the author moved on', async () => {
    // Two steps, two describes, finishing in the wrong order. Without the
    // guard the Case step offers Contact's fields.
    let landLate;
    describeFields.mockReset();
    describeFields
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            landLate = () => resolve(FIELDS);
          })
      )
      .mockImplementationOnce(() => Promise.resolve(CASE_FIELDS));

    const el = createElement('c-final-mapping-action', {
      is: FinalMappingAction
    });
    Object.assign(el, {
      spec: {
        mapping: {
          actions: [
            {
              id: 'act_1',
              object: 'Contact',
              operation: 'create',
              fields: [{ field: 'LastName', source: null }]
            },
            {
              id: 'act_2',
              object: 'Case',
              operation: 'create',
              fields: [{ field: 'Subject', source: null }]
            }
          ]
        }
      },
      actionId: 'act_1',
      objects: [
        { label: 'Contact', value: 'Contact' },
        { label: 'Case', value: 'Case' }
      ],
      questions: QUESTIONS,
      compatibility: COMPAT
    });
    document.body.appendChild(el);
    el.actionId = 'act_2';
    await flush();
    landLate();
    await flush();

    const offered = el.shadowRoot
      .querySelector('.ma-add-field')
      .options.map((o) => o.value);
    expect(offered).toEqual(['Status']);
  });

  it('marks required fields', async () => {
    const el = mount(
      [
        {
          id: 'act_1',
          object: 'Contact',
          operation: 'create',
          fields: [{ field: 'LastName', source: null }]
        }
      ],
      'act_1'
    );
    await flush();
    expect(
      el.shadowRoot.querySelector('[data-row="LastName"] .ma-required')
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingAction`
Expected: FAIL — the stub renders no comboboxes.

- [ ] **Step 3: Implement**

`finalMappingAction.js`:

```js
import { LightningElement, api } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import {
  actionsOf,
  setOperation,
  setFieldSource,
  removeField,
  removeAction
} from 'c/finalMappingModel';

/**
 * finalMappingAction — one step of a mapping (FREEFORM_F2_MAPPING_SPEC
 * 5.2). The source picker offers only what fits: answers whose type the
 * Apex compatibility table accepts for this field, a fixed value, and —
 * for lookups only — records the server can identify. What it can't offer
 * it says, rather than hiding.
 */
export default class FinalMappingAction extends LightningElement {
  @api spec;
  @api actionId;
  @api objects = [];
  @api questions = [];
  @api compatibility = {};
  @api readOnly = false;
  @api isPublic = false;

  fields = [];
  addingField = '';

  get action() {
    return actionsOf(this.spec).find((a) => a.id === this.actionId) || null;
  }

  get index() {
    return actionsOf(this.spec).findIndex((a) => a.id === this.actionId);
  }

  get objectApi() {
    return this.action && this.action.object;
  }

  _fieldsFor;

  /**
   * Imperative, not @wire, for the same reason as the editor: the Studio
   * already mocks describeFields as a plain function in its tests.
   */
  renderedCallback() {
    const objectApi = this.objectApi; // not `api`: that name is the lwc decorator
    if (!objectApi || objectApi === this._fieldsFor) {
      return;
    }
    this._fieldsFor = objectApi;
    // Nothing from the last object survives the switch, and a reply that
    // arrives after the author has moved on is dropped: two describes can
    // finish in either order, and the slower one would otherwise paint
    // Contact's fields onto a Case step.
    this.fields = [];
    describeFields({ objectApi })
      .then((data) => {
        if (this.objectApi === objectApi) {
          this.fields = data || [];
        }
      })
      .catch(() => {
        if (this.objectApi === objectApi) {
          this.fields = [];
        }
      });
  }

  get objectLabel() {
    const hit = (this.objects || []).find((o) => o.value === this.objectApi);
    return hit ? hit.label : this.objectApi;
  }

  get stepText() {
    return `step ${this.index + 1} of ${actionsOf(this.spec).length}`;
  }

  get operationOptions() {
    return [
      { label: 'Always create', value: 'create' },
      { label: 'Find or create', value: 'findOrCreate' }
    ];
  }

  get operation() {
    return this.action ? this.action.operation : 'create';
  }

  get isFindOrCreate() {
    return this.operation === 'findOrCreate';
  }

  get earlierSteps() {
    const all = actionsOf(this.spec);
    return all.slice(0, Math.max(this.index, 0));
  }

  get rows() {
    const byApi = new Map(this.fields.map((f) => [f.apiName, f]));
    return ((this.action && this.action.fields) || []).map((entry) => {
      const f = byApi.get(entry.field) || {
        apiName: entry.field,
        label: entry.field
      };
      const isLookup = f.displayType === 'REFERENCE';
      return {
        key: entry.field,
        label: f.label,
        required: Boolean(f.required),
        options: this._sourceOptions(f),
        value: this._sourceValue(entry.source),
        isLiteral: entry.source && entry.source.kind === 'literal',
        literal:
          entry.source && entry.source.kind === 'literal'
            ? entry.source.value
            : '',
        why: isLookup ? '' : `Another record: ${f.label} isn’t a lookup field.`
      };
    });
  }

  _sourceOptions(f) {
    const out = [];
    const fits = (q) =>
      q.mappable &&
      (this.compatibility[q.answerType] || []).includes(f.displayType);
    (this.questions || []).filter(fits).forEach((q) => {
      out.push({
        label: `Answer: ${q.label}`,
        value: `answer:${q.elementKey}`
      });
    });
    if (f.displayType !== 'REFERENCE') {
      out.push({ label: 'A fixed value', value: 'literal' });
    } else {
      this.earlierSteps
        .filter((s) => s.object === f.referenceTo)
        .forEach((s) => {
          const n = actionsOf(this.spec).indexOf(s) + 1;
          out.push({
            label: `The ${this.objectLabelFor(s.object)} from step ${n}`,
            value: `action:${s.id}`
          });
        });
      (this.questions || [])
        .filter((q) => q.referenceTo && q.referenceTo === f.referenceTo)
        .forEach((q) => {
          out.push({
            label: `The record picked in "${q.label}"`,
            value: `pick:${q.elementKey}`
          });
        });
    }
    return out;
  }

  objectLabelFor(api) {
    const hit = (this.objects || []).find((o) => o.value === api);
    return hit ? hit.label : api;
  }

  _sourceValue(source) {
    if (!source) return '';
    if (source.kind === 'answer') return `answer:${source.elementKey}`;
    if (source.kind === 'literal') return 'literal';
    if (source.kind === 'recordRef') {
      if (source.ref.startsWith('action:')) return source.ref;
      if (source.ref.startsWith('answer:'))
        return `pick:${source.ref.slice(7)}`;
    }
    return '';
  }

  get unusedFieldOptions() {
    const used = new Set(
      ((this.action && this.action.fields) || []).map((f) => f.field)
    );
    return this.fields
      .filter((f) => !used.has(f.apiName))
      .map((f) => ({ label: f.label, value: f.apiName }));
  }

  handleOperation(event) {
    this._emit(setOperation(this.spec, this.actionId, event.detail.value));
  }

  handleSource(event) {
    const field = event.target.dataset.field;
    const v = event.detail.value;
    let source = null;
    if (v.startsWith('answer:'))
      source = { kind: 'answer', elementKey: v.slice(7) };
    else if (v === 'literal') source = { kind: 'literal', value: '' };
    else if (v.startsWith('action:')) source = { kind: 'recordRef', ref: v };
    else if (v.startsWith('pick:'))
      source = { kind: 'recordRef', ref: `answer:${v.slice(5)}` };
    this._emit(setFieldSource(this.spec, this.actionId, field, source));
  }

  handleLiteral(event) {
    const field = event.target.dataset.field;
    this._emit(
      setFieldSource(this.spec, this.actionId, field, {
        kind: 'literal',
        value: event.detail.value
      })
    );
  }

  handleRemoveField(event) {
    this._emit(
      removeField(this.spec, this.actionId, event.currentTarget.dataset.field)
    );
  }

  handleAddField(event) {
    this._emit(
      setFieldSource(this.spec, this.actionId, event.detail.value, null)
    );
  }

  handleRemoveStep() {
    this.dispatchEvent(
      new CustomEvent('actionremoved', {
        detail: { spec: removeAction(this.spec, this.actionId) }
      })
    );
  }

  _emit(spec) {
    this.dispatchEvent(new CustomEvent('specchange', { detail: { spec } }));
  }
}
```

`finalMappingAction.html`:

```html
<template>
  <template lwc:if={action}>
    <div class="ma-head">
      <h2 class="ma-title">{objectLabel}</h2>
      <span class="ma-step">{stepText}</span>
      <span class="ma-spacer"></span>
      <lightning-radio-group
        class="ma-operation"
        label="What this step does"
        variant="label-hidden"
        type="button"
        options={operationOptions}
        value={operation}
        disabled={readOnly}
        onchange={handleOperation}
      ></lightning-radio-group>
      <lightning-button-icon
        icon-name="utility:delete"
        alternative-text="Remove this record"
        disabled={readOnly}
        onclick={handleRemoveStep}
      ></lightning-button-icon>
    </div>

    <table class="ma-table">
      <thead>
        <tr>
          <th scope="col" class="ma-th">Field on {objectLabel}</th>
          <th scope="col" class="ma-th">Gets its value from</th>
          <th scope="col" class="ma-th ma-th--narrow">
            <span class="slds-assistive-text">Remove</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template for:each={rows} for:item="row">
          <tr key={row.key} data-row={row.key} class="ma-row">
            <td class="ma-td">
              {row.label}
              <template lwc:if={row.required}>
                <abbr class="ma-required" title="Required">*</abbr>
              </template>
            </td>
            <td class="ma-td">
              <lightning-combobox
                label="Source"
                variant="label-hidden"
                placeholder="Choose a source"
                data-field={row.key}
                options={row.options}
                value={row.value}
                disabled={readOnly}
                onchange={handleSource}
              ></lightning-combobox>
              <template lwc:if={row.isLiteral}>
                <lightning-input
                  label="Fixed value"
                  data-field={row.key}
                  value={row.literal}
                  disabled={readOnly}
                  onchange={handleLiteral}
                ></lightning-input>
              </template>
              <template lwc:if={row.why}>
                <p class="ma-why">{row.why}</p>
              </template>
            </td>
            <td class="ma-td">
              <lightning-button-icon
                icon-name="utility:close"
                variant="bare"
                alternative-text="Remove field"
                data-field={row.key}
                disabled={readOnly}
                onclick={handleRemoveField}
              ></lightning-button-icon>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <lightning-combobox
      class="ma-add-field"
      label="Add a field"
      placeholder="Choose a field"
      options={unusedFieldOptions}
      value={addingField}
      disabled={readOnly}
      onchange={handleAddField}
    ></lightning-combobox>
  </template>
</template>
```

`finalMappingAction.css`:

```css
:host {
  display: block;
}
.ma-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.875rem;
}
.ma-title {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 600;
}
.ma-step {
  font-size: 0.75rem;
  color: #6b6b6b;
}
.ma-spacer {
  flex-grow: 1;
}
.ma-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.ma-th {
  text-align: left;
  padding: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #6b6b6b;
}
.ma-th--narrow {
  width: 2.5rem;
}
.ma-row {
  border-top: 1px solid #e3e3e3;
}
.ma-td {
  padding: 0.5rem 0.75rem 0.5rem 0;
  vertical-align: top;
}
.ma-required {
  color: #9a2c2c;
  text-decoration: none;
}
.ma-why {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.ma-add-field {
  display: block;
  margin-top: 0.75rem;
  max-width: 20rem;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingAction force-app/main/default/lwc/finalMappingEditor`
Expected: all pass.

- [ ] **Step 5: Deploy and verify in the org**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/lwc/finalMappingAction
```

In a Freeform draft with an email question and a text question: add a Contact step, add Last Name
and Email, pick sources. The Email picker must not offer the text question. Add a second Contact
step: its Reports To picker offers "The Contact from step 1". Publish: the dialog shows no blocker
for a complete create mapping. Remove Last Name's source and publish: the dialog shows the "leaves
Last Name empty" blocker and Publish is disabled.

- [ ] **Step 6: Commit, PR, merge the M4 slice**

```bash
git checkout -b feat/f2-m4-create-editor
git add force-app/main/default/lwc/finalMappingAction
git commit -m "feat(freeform): F2 M4 - edit a create step"
git push -u origin feat/f2-m4-create-editor
```

Run `uiux-flow-reviewer`, then merge.

---

## M5 — Find or create

### Task 16: The match block, the match question, overwrite flags

**Files:**

- Modify: `lwc/finalLookupFilter/finalLookupFilter.js`, `.html` — a filter-only mode
- Modify: `lwc/finalLookupFilter/__tests__/finalLookupFilter.test.js`
- Modify: `lwc/finalMappingAction/finalMappingAction.js`, `.html`, `.css`
- Test: `lwc/finalMappingAction/__tests__/finalMappingAction.test.js`

**Interfaces:**

- Consumes: `setMatch`, `setOnMatch`, `setWriteOnMatch` from `c/finalMappingModel`;
  `<c-final-lookup-filter target-object value filter-only onlookupconfigchange>` whose `value` is a
  config holding `filter`, and whose event `detail.value` is the next config.
- Produces: `c-final-lookup-filter` gains `@api filterOnly = false`. Lookups are unchanged by
  default; filter-only hides the three controls that mean nothing to a mapping.

- [ ] **Step 1: Write the failing tests**

Append to `finalMappingAction.test.js`:

```js
describe('find or create', () => {
  const foc = (match, fields) => [
    { id: 'act_1', object: 'Contact', operation: 'findOrCreate', match, fields }
  ];

  it('asks what happens on a match, and says why on a public form', async () => {
    const el = mount(
      foc(
        {
          field: 'Email',
          source: { kind: 'answer', elementKey: 'el_e' },
          filter: { logic: 'all', rows: [] }
        },
        []
      ),
      'act_1'
    );
    el.isPublic = true;
    await flush();
    const q = el.shadowRoot.querySelector('.ma-question');
    expect(q.textContent).toContain('When we find one');
    expect(q.textContent).toContain('without signing in');
  });

  it('answering "use it" emits reuse and hides the question', async () => {
    const el = mount(
      foc(
        { field: 'Email', source: null, filter: { logic: 'all', rows: [] } },
        []
      ),
      'act_1'
    );
    await flush();
    const handler = jest.fn();
    el.addEventListener('specchange', handler);
    el.shadowRoot.querySelector('[data-on-match="reuse"]').click();
    expect(
      handler.mock.calls[0][0].detail.spec.mapping.actions[0].match.onMatch
    ).toBe('reuse');
  });

  it('update shows an overwrite tick per field, off, and none on the match field', async () => {
    const el = mount(
      foc(
        {
          field: 'Email',
          source: { kind: 'answer', elementKey: 'el_e' },
          filter: { logic: 'all', rows: [] },
          onMatch: 'update'
        },
        [
          { field: 'Email', source: { kind: 'answer', elementKey: 'el_e' } },
          { field: 'LastName', source: { kind: 'answer', elementKey: 'el_n' } }
        ]
      ),
      'act_1'
    );
    await flush();
    expect(
      el.shadowRoot.querySelector(
        '[data-row="LastName"] lightning-input[data-overwrite]'
      ).checked
    ).toBe(false);
    expect(
      el.shadowRoot.querySelector(
        '[data-row="Email"] lightning-input[data-overwrite]'
      )
    ).toBeNull();
    expect(
      el.shadowRoot.querySelector('[data-row="Email"] .ma-lock').textContent
    ).toContain('never overwritten');
  });

  it('passes the filter to the lookup filter editor and takes its changes', async () => {
    const el = mount(
      foc(
        { field: 'Email', source: null, filter: { logic: 'all', rows: [] } },
        []
      ),
      'act_1'
    );
    await flush();
    const editor = el.shadowRoot.querySelector('c-final-lookup-filter');
    expect(editor.targetObject).toBe('Contact');
    expect(editor.filterOnly).toBe(true); // no result-display, search or guest controls here
    const handler = jest.fn();
    el.addEventListener('specchange', handler);
    const rows = [{ fieldPath: 'LastName', operator: 'isNotBlank' }];
    editor.dispatchEvent(
      new CustomEvent('lookupconfigchange', {
        detail: { value: { filter: { logic: 'all', rows } } }
      })
    );
    expect(
      handler.mock.calls[0][0].detail.spec.mapping.actions[0].match.filter.rows
    ).toEqual(rows);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingAction`
Expected: FAIL — `.ma-question` not found.

- [ ] **Step 3: Give the lookup filter a filter-only mode**

The mapping screen reuses `c/finalLookupFilter` for its conditions, but three of that component's
controls mean nothing to a mapping and the mapping handler saves none of them: **Show in each
result**, **Search these fields**, and **Let people filling this form anonymously search it**. The
last one is the reason this can't wait — it reads as a permission switch, and on the mapping screen
it changes nothing at all.

Lookups keep every control. Filter-only is opt-in, so nothing that ships today moves.

Add to `finalLookupFilter.js`, beside `@api targetObject`:

```js
    /**
     * Conditions only. The mapping screen (F2) reuses this editor for a
     * find-or-create search, where result display, searchable fields and
     * guest search have no meaning — and a guest-search switch that does
     * nothing is worse than no switch at all.
     */
    @api filterOnly = false;

    get showLookupControls() {
        return !this.filterOnly;
    }
```

In `finalLookupFilter.html`, wrap the three controls and the field hint between them — everything
from the first `<lightning-input label="Show in each result"` down to and including the guest
checkbox — in:

```html
<template lwc:if={showLookupControls}>
    ... the three lightning-inputs and the <p class="lf-hint"> between them, unchanged ...
</template>
```

The conditions block (`.lf-conditions` with `c-final-rule-editor`) stays outside it, so the filter
events are untouched.

That file's helper is `mount(value)`, which sets `targetObject` itself. Give it a second argument so
the new tests can turn the mode on, leaving every existing call working:

```js
function mount(value, { filterOnly = false } = {}) {
    describeLookupFields.mockResolvedValue(DESCRIBE);
    const el = createElement('c-final-lookup-filter', {
        is: FinalLookupFilter
    });
    el.targetObject = 'Contact';
    el.filterOnly = filterOnly;
    el.value = value || null;
    document.body.appendChild(el);
    return el;
}
```

Then add:

```js
    it('hides the lookup-only controls in filter-only mode', async () => {
        const el = mount(null, { filterOnly: true });
        await flush();
        const labels = [...el.shadowRoot.querySelectorAll('lightning-input')].map((i) => i.label);
        expect(labels).not.toContain('Show in each result');
        expect(labels).not.toContain('Search these fields');
        expect(labels).not.toContain('Let people filling this form anonymously search it');
        expect(el.shadowRoot.querySelector('c-final-rule-editor')).toBeTruthy();
    });

    it('a lookup still gets all of them', async () => {
        const el = mount(null);
        await flush();
        const labels = [...el.shadowRoot.querySelectorAll('lightning-input')].map((i) => i.label);
        expect(labels).toContain('Show in each result');
        expect(labels).toContain('Let people filling this form anonymously search it');
    });
```

Run: `npm run test:unit -- force-app/main/default/lwc/finalLookupFilter`
Expected: both pass, and every test already in that file still passes — lookups are unchanged.

- [ ] **Step 4: Implement the match block**

In `finalMappingAction.js`, extend the import:

```js
import {
  actionsOf,
  setOperation,
  setFieldSource,
  removeField,
  removeAction,
  setMatch,
  setOnMatch,
  setWriteOnMatch
} from 'c/finalMappingModel';
```

Add:

```js
    get match() {
        return (this.action && this.action.match) || {};
    }

    get onMatch() {
        return this.match.onMatch || null;
    }

    get matchUnanswered() {
        return this.isFindOrCreate && !this.onMatch;
    }

    get matchSummary() {
        return this.onMatch === 'update'
            ? 'When one is found, the fields ticked below are overwritten.'
            : 'When one is found, it’s used as-is and nothing is written to it.';
    }

    get showOverwrite() {
        return this.isFindOrCreate && this.onMatch === 'update';
    }

    /** Text-like fields: what you can meaningfully search by in v1. */
    get matchFieldOptions() {
        const searchable = new Set(['STRING', 'EMAIL', 'PHONE', 'URL']);
        return this.fields.filter((f) => searchable.has(f.displayType)).map((f) => ({ label: f.label, value: f.apiName }));
    }

    get matchSourceOptions() {
        const f = this.fields.find((x) => x.apiName === this.match.field);
        if (!f) return [];
        return (this.questions || [])
            .filter((q) => q.mappable && (this.compatibility[q.answerType] || []).includes(f.displayType))
            .map((q) => ({ label: q.label, value: q.elementKey }));
    }

    get matchSourceValue() {
        return this.match.source && this.match.source.elementKey;
    }

    /** finalLookupFilter speaks whole lookup configs; hand it one holding our filter. */
    get filterConfig() {
        return { filter: this.match.filter || { logic: 'all', rows: [] } };
    }

    handleMatchField(event) {
        this._emit(setMatch(this.spec, this.actionId, { field: event.detail.value }));
    }

    handleMatchSource(event) {
        this._emit(
            setMatch(this.spec, this.actionId, { source: { kind: 'answer', elementKey: event.detail.value } })
        );
    }

    handleFilter(event) {
        event.stopPropagation();
        const next = event.detail.value || {};
        this._emit(setMatch(this.spec, this.actionId, { filter: next.filter || { logic: 'all', rows: [] } }));
    }

    handleOnMatch(event) {
        this._emit(setOnMatch(this.spec, this.actionId, event.currentTarget.dataset.onMatch));
    }

    handleChangeOnMatch() {
        const next = JSON.parse(JSON.stringify(this.spec));
        const a = actionsOf(next).find((x) => x.id === this.actionId);
        delete a.match.onMatch;
        a.fields.forEach((f) => delete f.writeOnMatch);
        this._emit(next);
    }

    handleOverwrite(event) {
        this._emit(setWriteOnMatch(this.spec, this.actionId, event.target.dataset.field, event.target.checked));
    }
```

Extend `rows` so each row carries the overwrite and lock state — inside the `map`, add:

```js
                isMatchField: this.isFindOrCreate && entry.field === this.match.field,
                showTick: this.showOverwrite && entry.field !== this.match.field,
                overwrite: entry.writeOnMatch === true,
```

In `finalMappingAction.html`, insert between `</div>` of `ma-head` and `<table class="ma-table">`:

```html
<template lwc:if={isFindOrCreate}>
  <div class="ma-match">
    <h3 class="ma-subhead">Find an existing {objectLabel}</h3>
    <div class="ma-match-line">
      <lightning-combobox
        label="Where"
        placeholder="Choose a field"
        options={matchFieldOptions}
        value={match.field}
        disabled={readOnly}
        onchange={handleMatchField}
      ></lightning-combobox>
      <lightning-combobox
        label="Matches the answer to"
        placeholder="Choose a question"
        options={matchSourceOptions}
        value={matchSourceValue}
        disabled={readOnly}
        onchange={handleMatchSource}
      ></lightning-combobox>
    </div>
    <c-final-lookup-filter
      target-object={objectApi}
      value={filterConfig}
      filter-only
      onlookupconfigchange={handleFilter}
    ></c-final-lookup-filter>
    <p class="ma-note">
      A filter is required. Searching every {objectLabel} in the org is refused
      when you publish.
    </p>
  </div>

  <template lwc:if={matchUnanswered}>
    <div class="ma-question" role="group" aria-label="When we find one">
      <h3 class="ma-question-title">
        <lightning-icon
          icon-name="utility:warning"
          variant="warning"
          size="x-small"
        ></lightning-icon>
        When we find one, what should happen to it?
      </h3>
      <template lwc:if={isPublic}>
        <p class="ma-question-why">
          This form is public. Anyone who guesses a real value reaches whatever
          you allow here, without signing in.
        </p>
      </template>
      <div class="ma-question-choices">
        <button
          type="button"
          class="ma-choice"
          data-on-match="reuse"
          disabled={readOnly}
          onclick={handleOnMatch}
        >
          <span class="ma-choice-title">Use it, leave it alone</span>
          <span class="ma-choice-detail">
            No duplicate is made and later records point at it. Nothing is
            written to it.
          </span>
        </button>
        <button
          type="button"
          class="ma-choice"
          data-on-match="update"
          disabled={readOnly}
          onclick={handleOnMatch}
        >
          <span class="ma-choice-title">Update it with these answers</span>
          <span class="ma-choice-detail">
            You then pick each field that may be overwritten. Every one starts
            off.
          </span>
        </button>
      </div>
    </div>
  </template>
  <template lwc:else>
    <p class="ma-match-summary">
      {matchSummary}
      <button
        type="button"
        class="ma-link"
        disabled={readOnly}
        onclick={handleChangeOnMatch}
      >
        Change
      </button>
    </p>
  </template>
</template>
```

In the table header, add a column after "Gets its value from":

```html
<template lwc:if={showOverwrite}>
  <th scope="col" class="ma-th ma-th--narrow">Overwrite</th>
</template>
```

and in each row, after the source `<td>`:

```html
<template lwc:if={showOverwrite}>
  <td class="ma-td">
    <template lwc:if={row.showTick}>
      <lightning-input
        type="checkbox"
        label="Overwrite on a match"
        variant="label-hidden"
        data-overwrite
        data-field={row.key}
        checked={row.overwrite}
        disabled={readOnly}
        onchange={handleOverwrite}
      ></lightning-input>
    </template>
  </td>
</template>
```

and inside the first `<td>` after the required marker:

```html
<template lwc:if={row.isMatchField}>
  <span class="ma-lock">
    <lightning-icon icon-name="utility:lock" size="xx-small"></lightning-icon>
    used to match — never overwritten
  </span>
</template>
```

Append to `finalMappingAction.css`:

```css
.ma-match {
  border: 1px solid #e3e3e3;
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
  margin-bottom: 0.625rem;
}
.ma-subhead {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #6b6b6b;
}
.ma-match-line {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;
  margin-bottom: 0.5rem;
}
.ma-note {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.ma-question {
  border: 1px solid #f0c894;
  background: #fdf3e3;
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
  margin-bottom: 0.875rem;
}
.ma-question-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b3f00;
}
.ma-question-why {
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: #6b3f00;
}
.ma-question-choices {
  display: flex;
  gap: 0.625rem;
  margin-top: 0.75rem;
}
.ma-choice {
  flex: 1 1 0;
  text-align: left;
  background: #fff;
  border: 1px solid #cfcfcf;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}
.ma-choice-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
}
.ma-choice-detail {
  display: block;
  margin-top: 0.1875rem;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.ma-match-summary {
  margin: 0 0 0.875rem;
  font-size: 0.8125rem;
  color: #444;
}
.ma-link {
  background: none;
  border: none;
  padding: 0;
  margin-left: 0.375rem;
  color: #0b5cab;
  cursor: pointer;
}
.ma-lock {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  font-size: 0.75rem;
  color: #6b6b6b;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit -- force-app/main/default/lwc/finalMappingAction force-app/main/default/lwc/finalMappingModel force-app/main/default/lwc/finalLookupFilter`
Expected: all pass, the lookup filter's own existing tests included.

- [ ] **Step 6: Deploy and verify in the org**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default/lwc/finalMappingAction --source-dir force-app/main/default/lwc/finalLookupFilter
```

On a public Freeform: add a Find or create Contact step. The amber question shows with the public
sentence. Publish now → blocked ("choose what happens"). Answer "Update it" → the Overwrite column
appears, every tick off, Email locked. Tick Title → publish → the dialog warns that this public form
overwrites Title. Clear the filter → publish blocked ("needs a filter").

On the same screen, check the conditions editor shows **only** conditions: no "Show in each result", no
"Search these fields", and no anonymous-search checkbox. Then open any form with a lookup question
and confirm its filter still shows all three.

- [ ] **Step 7: Commit, PR, merge the M5 slice**

```bash
git checkout -b feat/f2-m5-find-or-create
git add force-app/main/default/lwc/finalMappingAction force-app/main/default/lwc/finalLookupFilter
git commit -m "feat(freeform): F2 M5 - find or create, with the match question asked out loud"
git push -u origin feat/f2-m5-find-or-create
```

Run `uiux-flow-reviewer`, then merge.

---

## M8 — Org walkthrough

### Task 17: The whole thing, as a guest, in `revclouddev`

**Files:** none, unless a defect is found. A defect gets its own `fix/f2-…` branch, a test that
fails without the fix, and a PR.

- [ ] **Step 1: Deploy everything and assign permissions**

```bash
sf project deploy start --target-org revclouddev --source-dir force-app/main/default
sf org assign permset --target-org revclouddev --name Freeform_Submission_Admin
```

- [ ] **Step 2: Publish the site**

Setup → Digital Experiences → All Sites → the site → Builder → **Publish**. A metadata deploy never
reaches guests; skipping this tests yesterday's bundle.

- [ ] **Step 3: Build the form**

A new Freeform with questions Your surname (text, required), Work email (email, required), Manager's
surname (text, required), Job title (text, optional). Public access on. Data mode:

1. Contact — Always create — Last Name ← Manager's surname.
2. Contact — Find or create — Email matches Work email — filter `Last Name is not blank` — "Use it,
   leave it alone" — Last Name ← Your surname, Email ← Work email, Title ← Job title, Reports To ←
   the Contact from step 1.

Publish. Expected: the dialog shows one warning — Job title can be skipped — and no blockers.

- [ ] **Step 4: Submit as a guest, twice**

Open the form's public URL in a private window. Submit as `walk1@example.com`. Then submit again
with the same email and a different surname.

Expected, on the submission record pages (as the admin):

- the first: Records from this submission: **Done**, two records listed, the second Contact's
  Reports To is the first;
- the second: **Done**; its step 2 record is the **same** Contact as the first submission's step 2
  (reused, not duplicated); that Contact's surname is unchanged.
- The guest saw only the thank-you screen both times — no record ids, no match wording.

- [ ] **Step 5: Force a failure and retry it**

Create a second Contact with Email `walk1@example.com` by hand. Submit once more as the guest.
Expected: **Failed**, with "more than one Contact matched". Delete the hand-made duplicate, click
**Retry mapping**. Expected: **Done**.

- [ ] **Step 6: Duplicate rules**

In Setup → Duplicate Rules, make sure a Contact rule is active with Action on Create = **Block**,
matching on email. Change step 2 to Always create, publish, submit twice with the same email.
Expected: the second submission is **Failed** with "Salesforce's duplicate rules blocked saving this
Contact." Restore the rule to its previous setting afterwards.

- [ ] **Step 7: Bulk retry**

**As a user who holds `Freeform_Submission_Admin` and is not a System Administrator** — a System
Administrator would pass whatever the permission set says. From a list view of Freeform Submissions,
inline-edit two Failed submissions to **Ready for Retry** and save. Expected: the edit is allowed,
both run, and each ends **Done** or **Failed** with a reason; neither stays on Ready for Retry.

- [ ] **Step 8: Record the results**

Add a "What actually shipped" section to this plan: PRs per slice, anything the walkthrough changed,
and any open item decided along the way — the answers-index layout question in particular. Commit it
on a `docs/f2-shipped` branch, PR, merge.

---

## Spec coverage

| Spec requirement                                        | Task      |
| ------------------------------------------------------- | --------- |
| Data mode, Freeform-only (D29, D30)                     | 14        |
| Action-owned shape, array order, `elementKey` (4.1–4.2) | 12        |
| `recordRef` forms (4.3)                                 | 3, 7, 15  |
| `onMatch`, no default, match field locked (D32, 4.4)    | 3, 12, 16 |
| Skipped and blank answers (D44, 4.5)                    | 2, 7      |
| Step list, source picker, derived index (5.1–5.3)       | 14, 15    |
| One compatibility rule (5.4)                            | 2, 13     |
| `runFreeform` untouched (6.1)                           | —         |
| Five fields, no Running (6.2)                           | 1         |
| Trigger, measured capacity (D41, D46, 6.3)              | 8         |
| Service, savepoint order (6.4)                          | 7         |
| Ambiguous match fails (D33, 6.5)                        | 7         |
| Duplicate rules respected (D40, 6.6)                    | 6, 7, 17  |
| Uncaught failures left alone (D43, 6.7)                 | 8         |
| Gate inside `publishSpec` (D38, 7)                      | 3, 4      |
| Dialog shows blockers (7)                               | 5         |
| Author permissions, fence, bargain (D36, 8)             | 3, 6      |
| Permission sets, custom permission (8)                  | 1, 10, 13 |
| Retry button and status value (D42, 8.1)                | 8, 10, 11 |
| 10-step cap (D47)                                       | 3, 4, 12  |
| Acceptance tests 1–17                                   | 3–11      |
| Duplicate rule in the org                               | 17        |

## Orphan ledger

- `FinalPublishWarnings.forPublish` changes its return type from `List<String>` to `PublishCheck`.
  Its only callers are `finalFormStudio` and `FinalPublishWarningsTest`, both updated in Tasks 4–5.
  Nothing is left pointing at the old shape.
- `FinalPublishWarnings.isQuestion` and `FinalFormCreateController.isSystemTable` go from private to
  public. No behaviour changes.
- `c/finalLookupFilter` gains `@api filterOnly`, defaulting to false. Every lookup that uses it today
  renders exactly as it does now.
- Nothing is deleted.

## Cleanup

After the walkthrough, fold "What actually shipped" into FREEFORM_F2_MAPPING_SPEC's status header
and delete this plan, when the owner says so. (The F1 plan is still waiting on that same word.)
