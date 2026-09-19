# IMPL_PLAN — Freeform F1

> Build plan for [FREEFORM_SPEC.md](./FREEFORM_SPEC.md) F1 (rulings D1–D20). Owner said "start
> implementing" 2026-09-19. One branch + PR per slice, merged autonomously; org-verified before F1 is
> called done. **F2 (mapping), F2.5 (invitations), F3/F4 (templates) are NOT in this plan.**

## Slice order and why

Schema first, because nothing else can be written or tested without the two objects. Then the kind
module, because every later slice calls it. Then creation → Studio → submit → reader, which is the
user's own path through the product.

| Slice  | Ships                                                                                                                                                     | Depends on |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **S1** | Schema: type value, validation rule, both objects, tab, list views, admin + read-only permission sets                                                     | —          |
| **S2** | `FinalFormKind` (Apex) + `c/finalFormKind` (LWC); every two-type check swapped; safe delete counts submissions; clone / export / import accept `freeform` | S1         |
| **S3** | Creation: third card, Freeform path, Apex create                                                                                                          | S2         |
| **S4** | Studio surfaces: palette (7 new inputs + grouping), question settings, settings drawer, design panel, library label                                       | S2         |
| **S5** | Submit: shared answer-store routine, `runFreeform`, `Answer_Type__c` + `Value_Unparsed__c`, idempotency key, serialized response limit (Survey too)       | S1, S2     |
| **S6** | Reader component + record page + report type                                                                                                              | S5         |
| **S7** | Publish warnings: type change, deletion with answers, public access + file questions                                                                      | S5         |

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

## S2 — The kind module

**New:** `classes/FinalFormKind.cls` (+ test), `lwc/finalFormKind/finalFormKind.js` (+ jest).

Capability table per FREEFORM_SPEC §4.1. Unknown type throws / returns nothing usable — never Form.

**Changed (the §4.3 trace):** `FinalSubmitService` dispatch, `FinalFormActionsService` (clone +
import), `FinalFormPackageService`, `FinalSpecTransferValidator`, `FinalSpecDescribeValidator`
(three-way object requirement), `FinalFormActionsSelector.countResponses`, `finalFormStudio`,
`finalPropertyPanel`, `finalStudioSettingsPanel`, `finalAutofillPanel`, `finalDesignRegistry`,
`finalFormsLibrary`.

**Rule for this slice:** Survey and Form behavior must not move. Existing suites run untouched; any
diff in them is a bug in the slice, not a test to update.

## S3 — Creation

**Changed:** `lwc/finalCreationGallery` (third kind card, Freeform path template → layout → theme →
name), `classes/FinalFormCreateController` (kind parameter on the template creator; Freeform gets
`Form_Type__c = 'Freeform'`, blank `Primary_Context_Object__c`, spec `form.type = 'freeform'`, no
`targetObject`).

## S4 — Studio surfaces

**Changed:** `lwc/finalFieldPalette` (Email, Phone, Date, URL, Dropdown, Single choice, Multiple
choice + two group headings; Survey's roster untouched), `lwc/finalFormStudio` (mint defaults for the
new kinds; capability-driven panels), `lwc/finalPropertyPanel` (hide Topics and Map to field),
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

## Orphan ledger

Nothing is deleted in F1. Two things are deliberately left in place and untouched:

- `Z_Form_Submission__c` — legacy, unrelated to this work despite the similar name.
- `Submission_Storage__c` on `Form__c` — legacy; Freeform leaves it blank.

After F1 ships: fold anything learned back into FREEFORM_SPEC, and delete this plan per the standing
cleanup process.
