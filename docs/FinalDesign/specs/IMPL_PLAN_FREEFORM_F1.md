# IMPL_PLAN — Freeform F1

> Build plan for [FREEFORM_SPEC.md](./FREEFORM_SPEC.md) F1 (rulings D1–D25). Owner said "start
> implementing" 2026-09-19. One branch + PR per slice, merged autonomously; org-verified before F1 is
> called done. **F2 (mapping), F2.5 (invitations), F3/F4 (templates) are NOT in this plan.**
>
> **Status 2026-09-20: all seven slices SHIPPED, then three review rounds of corrections shipped on
> top.** Kept (not deleted) at the owner's instruction — two org checks are still outstanding, and
> this is where they are tracked. Findings that changed the DESIGN have been folded into
> FREEFORM_SPEC (D21–D25); what stays here is the build record and the open list.

## Slice order and why

Schema first, because nothing else can be written or tested without the two objects. Then the kind
module, because every later slice calls it. Then creation → Studio → submit → reader, which is the
user's own path through the product.

| Slice  | Ships                                                                                                                                                       | Depends on | Shipped |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| **S1** | Schema: type value, validation rule, both objects, tab, list views, admin + read-only permission sets                                                       | —          | #292    |
| **S2** | `FinalFormTypes` (Apex) + `c/finalFormTypes` (LWC); every two-type check swapped; safe delete counts submissions; clone / export / import accept `freeform` | S1         | #293    |
| **S3** | Creation: third card, Freeform path, Apex create                                                                                                            | S2         | #294    |
| **S4** | Studio surfaces: palette (7 new inputs + grouping), question settings, settings drawer, design panel, library label                                         | S2         | #296    |
| **S5** | Submit: shared answer-store routine, `runFreeform`, `Answer_Type__c` + `Value_Unparsed__c`, idempotency key, serialized response limit (Survey too)         | S1, S2     | #297    |
| **S6** | Reader component + record page + report type                                                                                                                | S5         | #298    |
| **S7** | Publish warnings: type change, deletion with answers, public access + file questions                                                                        | S5         | #299    |

## S1 — Schema

**New:** `objects/Form_Submission__c/` (object, 7 fields, `All` list view),
`objects/Form_Submission_Answer__c/` (object, 12 fields), `tabs/Form_Submission__c.tab-meta.xml`,
`permissionsets/Freeform_Submission_Reader.permissionset-meta.xml`.

**Changed:** `objects/Form__c/fields/Form_Type__c.field-meta.xml` (add `Freeform`, rewrite help text),
`objects/Form__c/validationRules/VR_Primary_Object_Required.validationRule-meta.xml` (skip Freeform),
`permissionsets/Form_Builder_Admin.permissionset-meta.xml` (CRUD + View All + every field).

Field-level detail is FREEFORM_SPEC §5.1–5.2; `Answer_Type__c` values come from §5.2.1.

**Verify:** deploy to the org; confirm the picklist offers three values, and that a Form row with type
Freeform and a blank `Primary_Context_Object__c` saves (today's rule refuses it).

## S2 — The form-type module

**New:** `classes/FinalFormTypes.cls` (+ test), `lwc/finalFormTypes/finalFormTypes.js` (+ jest). Built as `FinalFormKind`; renamed on the owner's word before merge, and the gallery's own `kind` naming followed in #295.

Capability table per FREEFORM_SPEC §4.1. Unknown type throws / returns nothing usable — never Form.

**Changed (the §4.3 trace):** `FinalSubmitService` dispatch, `FinalFormActionsService` (clone +
import), `FinalFormPackageService`, `FinalSpecTransferValidator`, `FinalSpecDescribeValidator`
(three-way object requirement), `FinalFormActionsSelector.countResponses`, `finalFormStudio`,
`finalPropertyPanel`, `finalStudioSettingsPanel`, `finalAutofillPanel`, `finalDesignRegistry`,
`finalFormsLibrary`.

**Rule for this slice:** Survey and Form behavior must not move. Existing suites run untouched; any
diff in them is a bug in the slice, not a test to update.

## S3 — Creation

**Changed:** `lwc/finalCreationGallery` (third form-type card, Freeform path template → layout → theme →
name), `classes/FinalFormCreateController` (form-type parameter on the template creator; Freeform gets
`Form_Type__c = 'Freeform'`, blank `Primary_Context_Object__c`, spec `form.type = 'freeform'`, no
`targetObject`).

## S4 — Studio surfaces

**Changed:** `lwc/finalFieldPalette` (Email, Phone, Date, URL, Dropdown, Single choice, Multiple
choice + two group headings; Survey's roster untouched), `lwc/finalFormStudio` (mint defaults for the
new question types; capability-driven panels), `lwc/finalPropertyPanel` (hide Topics and Map to field),
`lwc/finalStudioSettingsPanel` (hide record links; response limit copy), `lwc/finalFormsLibrary`
(third label).

## S5 — Submit

**Changed:** `classes/FinalSubmitService` — extract the answer-store routine behind a descriptor
(parent object + stamping, answer object + parent field, whether `Answer_Type__c` is written, whether
analytics apply), add `runFreeform`, three-way dispatch, `Answer_Type__c` / `Value_Unparsed__c`
normalization (§5.2.1), idempotency key handling (§7.4), serialized response limit (§7.5, Survey
included). `classes/FinalGuestController` + `classes/FinalSubmitController` pass the key through.

**The one deliberate behavior change:** the response-limit race, fixed for Survey as well (D16).

## S6 — Reader

**New:** `classes/FinalSubmissionController.cls` (+ test) — one USER_MODE read returning the
submission, its answers and **its own version's spec**; `lwc/finalSubmissionReader` (+ jest);
`flexipages/` record page; `reportTypes/Freeform_Submissions_with_Answers.reportType-meta.xml`.

Rendering rules per §8: order and wording from the submission's version, skipped questions as "No
answer", questions added later absent entirely, `Value_Unparsed__c` shown as raw text with a note.

## S7 — Publish warnings

**Changed:** `classes/FinalSpecController.publishSpec` (or a small validator beside it) +
`lwc/finalFormStudio` publish dialog. Three warnings, none blocking (§6.3).

## Tests

FREEFORM_SPEC §10 is the acceptance list; each slice lands its own share:

- S1 — deploy + the Freeform row saves with no object.
- S2 — kind unit tests (Apex + jest); clone/export/import round trip; safe delete.
- S3 — jest on the creation path.
- S4 — jest on palette, question settings, settings drawer.
- S5 — Apex 1–13 (typing, idempotency, cap race, guest, matrix).
- S6 — jest 19 (version-faithful rendering) + reader Apex.
- S7 — jest 18.

## Org verification (before F1 is called done)

Create → build with a mix of widgets and general inputs → visibility rule → preview → publish →
submit signed-in → submit as a guest → read both submissions → rename a question, publish, confirm
the old submission still reads as submitted → run the report type.

## What actually shipped

| Slice  | PR         | Note                                                           |
| ------ | ---------- | -------------------------------------------------------------- |
| S1     | #292       | schema                                                         |
| S2     | #293       | `FinalFormKind` → renamed `FinalFormTypes` at the owner's word |
| S3     | #294, #295 | creation; #295 renamed the gallery's `kind` to `formType`      |
| S4     | #296       | studio surfaces                                                |
| S5     | #297       | submit                                                         |
| S6     | #298       | reader                                                         |
| S7     | #299       | publish warnings                                               |
| **R1** | #300       | review round 2 — data integrity (D22, D23, D24)                |
| **R2** | #301       | review round 2 — permissions (D25)                             |
| **R3** | #302       | review round 2 — reader fidelity                               |

**Review round 2 (2026-09-20) raised 8 findings and all 8 were real.** Three of them reported
_success_ while doing the wrong thing, which is exactly why the slice-by-slice org checks missed
them — the walkthrough below only proves the happy path. Two of the three were hidden by comments of
mine that described behaviour the code did not have. The lesson worth keeping: **a comment claiming
a reset, a check or a guard is a claim, and claims in comments are not verified by anything.**

## Still open

1. **Guest submit on a published site, end to end.** Never done in a browser. R1 changed the guest
   submit path in three places (replay short-circuit ahead of the honeypot and link checks,
   unconditional version validation, form-scoped key lookup) — all covered by Apex tests, none by a
   real submit through LWR. Remember a deploy alone does not reach guests; the site needs a publish.
2. ~~**The publish-warning dialog, seen.**~~ **DONE 2026-09-20.** Seen in the org, and it was
   wrong: `LightningConfirm` takes a plain string, so three warnings arrived as one paragraph with
   the bullets reading as stray dots. Replaced with `c/finalPublishDialog` (#304) for the
   with-consequences case, plain confirm kept for the rest.

   This also turned up **D26**: publish warning 1 (type change with answers) cannot be triggered by
   any author action, because nothing in the Studio changes a question's type. Kept as latent code.
   The feature that would make it live — **a change-type control** — is a candidate slice near F2,
   and it is not small: what happens to a picklist's options on the way to text, whether the stored
   answer survives, and whether the renderer copes are all real questions.

Both are written up as owner-runnable steps; they are the last two claims in F1 that rest on tests
alone.

## Orphan ledger (unchanged)

Nothing was deleted in F1. Two things are deliberately left in place and untouched:

- `Z_Form_Submission__c` — legacy, unrelated to this work despite the similar name.
- `Submission_Storage__c` on `Form__c` — legacy; Freeform leaves it blank.

Nothing new was orphaned by review round 2 either. `Freeform_Submission_Admin` is **new**, not a
replacement: `Freeform_Submission_Reader` keeps its name and its API name, and only its grants
changed.

## Cleanup

The standing process says fold learnings into the spec and delete the plan. The fold is **done**
(D21–D25, §5.4, §7.3–7.5, §8, §10). The delete is **deliberately deferred** — owner, 2026-09-20 —
until the two open org checks are closed.
