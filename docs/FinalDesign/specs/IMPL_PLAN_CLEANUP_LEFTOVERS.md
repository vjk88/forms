# Cleanup plan — leftovers, test scaffolding and dead fields

**Status:** FOR OWNER REVIEW — nothing deleted yet. Written 2026-09-19.
Scope is cleanup item #4: things that are not the old build (that is P7) but are still clutter.
Every row says what it is, who uses it, and what I propose. **You decide the ones marked ⚖️.**

---

## 1. The guest-upload proof run (PRs #256–#262) — delete

A throwaway test to see whether a guest could push a file into Salesforce. It stopped at an org
setting (PR #262) and never became product code. **Nothing outside the proof uses any of it**
(checked: no references from other classes or components).

| Kind              | Items                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex (6 + 1 test) | `FinalUploadCapability`, `FinalUploadProofController`, `FinalUploadProofGuard`, `FinalUploadProofPolicy`, `FinalUploadProofStore`, `FinalUploadProofTest` |
| Objects           | `Final_Upload_Proof__c` (10 fields), `Final_Upload_Proof_Lock__c`                                                                                         |
| Metadata type     | `Final_Upload_Proof_Policy__mdt` + 3 records (`Disabled`, `Operator`, `TestSiteGuest`)                                                                    |
| Permissions       | Custom permission `Final_Upload_Proof_Admin`, permission set `Final_Upload_Proof_Admin`                                                                   |
| UI                | `finalUploadProof` component, `Final_Upload_Proof` page + tab                                                                                             |
| Field             | `ContentVersion.Final_Upload_fileupload__c`                                                                                                               |
| Doc               | `archive/GUEST_UPLOAD_PROOF_*` stays archived as history                                                                                                  |

⚖️ **One exception to decide:** `ContentVersion.Final_Upload_fileupload__c`. Salesforce needs a field
ending in `fileupload__c` for guest uploads on LWR sites. When guest upload is built for real, a
field like this comes back. **Proposal:** delete it now with the proof, and add a properly-named
one when guest upload is built — no half-used field in between.

Removing from the org needs a destructive deploy. Before that: confirm the two objects hold no
records (PR #262 says the org was left clean; re-check at run time).

## 2. Developer test pages

| Page                                                         | What it is                                              | Proposal                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Final_Design_Test` (page, tab, component `finalDesignTest`) | P2 theme-phase harness: Design panel next to the viewer | **Delete.** The Studio does this now.                                                                                    |
| `Final_Upload_Proof`                                         | Part of §1                                              | Deleted with §1                                                                                                          |
| `Final_P0_Test` (page, tab)                                  | Where every browser check runs forms inside Lightning   | ⚖️ **Keep for now** — it is the QA host. Rename to something honest (e.g. `Form_Preview`) at packaging, or drop it then. |

**Not leftovers (checked, keep):** `finalStuck` (the sticky navigation bars use it) and
`finalSampleSpec` (the creation gallery previews use it).

## 3. Test objects that live only in the org — a packaging blocker

`Job_Application__c` is **not in the repo** (untracked), yet **8 committed Apex test classes use it**
(`FinalGuestLinkTest`, `FinalSubmitControllerTest`, `FinalStudioControllerTest`,
`FinalAutofillControllerTest`, `FinalLookupServiceTest`, `FinalSurveyObjectTest`,
`FinalSurveyTokenServiceTest`, and others). Tests passed only because this org has the object. A
fresh org, a scratch org or a package build **fails**.

Four more generated test objects sit untracked beside it — `Event_Feedback__c`,
`Hardware_Request__c`, `Property_Inspection__c`, `Work_History__c` — plus `Form_Viewer_App`, tab
`Form_Viewer_Page` and the `scripts/generate_test_objects.js` / `update_profile.js` that made them.

⚖️ **Proposal:** move all of it into a separate `unpackaged/` folder, registered in
`sfdx-project.json` as test-only metadata (2GP `unpackagedMetadata`). Tests keep working, the
objects are committed, and they never ship to customers. Alternative: rewrite the 8 test classes onto
standard objects (Contact/Case) — more work, and this org's Account validation rules are why tests
moved off standard objects in the first place.

## 4. Dead fields

Scanned every field on the product objects against the new code, pages, layouts and report types.
"Legacy refs" = only the old build uses it, so it goes with P7. **Zero refs** = nothing uses it at all.

| Object                    | Unused by the new build                                                                                                                                   | Proposal                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Form__c`                 | `Default_Owner_Id__c`, `Global_Styles_JSON__c` (zero refs) · `Layout_Config__c`, `Layout_Mode__c`, `Schema_Snapshot__c`, `Submission_Storage__c` (legacy) | Delete the zero-ref two now; the rest with P7                                                                                                      |
| `Form_Version__c`         | `Change_Notes__c`, `Layout_Config__c`, `Layout_Mode__c`, `Layout_Spec__c`, `Published_By__c`, `Schema_Snapshot__c` (all legacy)                           | With P7                                                                                                                                            |
| `Form_Response__c`        | `Account__c`, `Campaign__c`, `Case__c`, `Contact__c`, `Lead__c`, `Opportunity__c`, `Primary_Record_Id__c` (zero refs) · `IP_Address__c` (legacy)          | ⚖️ Delete the seven. Responses already link to their record through `Related_Record_Id__c` / `Related_Record_Type__c`, which works for any object. |
| `Form_Response_Answer__c` | `Lookup_Reference_Id__c` (zero refs) · `Sentiment_Label__c`, `Sentiment_Score__c`, `Sentiment_Source__c` (zero refs) · `Form_Element__c` (legacy)         | Delete `Lookup_Reference_Id__c`. ⚖️ Sentiment fields are reserved for DEFERRED #11 (Agentforce sentiment) — keep or delete.                        |
| `Form_Template__c`        | `Category__c`, `Definition__c` (legacy)                                                                                                                   | Keep until the template gallery (DEFERRED #15) is decided                                                                                          |
| `Form__c`                 | **`Allowed_Adapters__c`** — only its `Public_Guest` value is read                                                                                         | ⚖️ Replace with a checkbox `Is_Public__c` (recommended), or keep it and drop the dead values `Internal_Record_Page`, `Flow_Screen`, `Embedded`     |

The scan reads the repo, not the org. Before deleting, re-check each field in the org for reports,
Flows or list views that reference it (Salesforce blocks deleting a referenced field anyway).
Any field removal must happen **before** the first managed package version — afterwards fields are
nearly impossible to remove.

## 5. The 31 uncommitted files

| Group                                                                                                                                                                                               | Proposal                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tooling: `.agents/`, `.claude/skills/`, `.claude/agent-memory/…`, `.impeccable/`                                                                                                                    | Add to `.gitignore` — local tool state, not project files                                               |
| `docs/FinalDesign/CUSTOM_FONTS.md`                                                                                                                                                                  | **Commit into `specs/`.** Shipped code (font loader, theme engine, `FinalFontController`) points at it. |
| `docs/FinalDesign/` others: `COMPONENT_CATALOG.csv`, `GUEST_UPLOAD_PROOF_CHANGED_FILES.md`, `STUDIO_ACTIONS_SMOKE_TEST_MATRIX.md`, `design_panel_ia_expanded.html`, `design_panel_ia_proposal.html` | Move to `archive/` and commit (history), or delete — ⚖️ your pick                                       |
| `docs/redesign/` extras (screenshot, CSV, mockup) and `docs/ux-prototype/`                                                                                                                          | Delete — old-build material                                                                             |
| `scratch/` (review notes, two `.tar.gz`, JSON outputs, a Python script)                                                                                                                             | Delete, and add `scratch/` to `.gitignore`                                                              |
| Test objects, app, tab and the two scripts                                                                                                                                                          | See §3                                                                                                  |

## 6. Order and safety

1. Repo-only first (§5, §2 `finalDesignTest`, §3 move) — one PR, no org change.
2. Then the org: one destructive deploy for §1 + §2 + the §4 fields you approve, after a record check.
3. Full Apex test run (`RunLocalTests`) and the Jest suite after each step.
4. `Allowed_Adapters__c` → `Is_Public__c` is a small feature change of its own (toggle, guest gate,
   archive/delete, data copy) — separate PR, if you choose it.
