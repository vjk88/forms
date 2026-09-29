# FinalStudio UX baseline and editor-mismatch diagnosis (Task 0)

Captured 2026-09-29 for `docs/FinalDesign/specs/IMPL_PLAN_STUDIO_UX_SIMPLIFICATION.md`. Product files edited by this task: none.

## 1. Capture context

| Item | Value |
| --- | --- |
| Repo commit | `aa98bbc` (main, "Merge pull request #361 … fix/choice-values") |
| Local modifications at capture | Tracked: `finalPropertyPanel.html` (unrelated WIP), `.claude/agent-memory/uiux-flow-reviewer/recurring-issues.md`. Untracked docs/objects/scripts. None touch the eight bundles under test. |
| Host | VF full-page host `/apex/FinalStudio?c__formId=a05hk000001RX8zAAG` (Lightning Out), dev org `revclouddev` |
| Browser | Playwright headless Chromium 149.0.7827.55, viewport 1280×800, device pixel ratio 1 |
| Deployed code vs commit | The org's eight target bundles (`finalFormStudio`, `finalPreviewStage`, `finalStudioStyles`, `finalBuilderCanvas`, `finalDesignPanel`, `finalDesignRegistry`, `finalFormHeader`, `finalPageFrame`) were retrieved and compared with the working tree: 29 files, 0 differences ignoring whitespace. The baseline therefore shows the code at `aa98bbc`. |
| Console | No console errors or page errors during the capture. |

## 2. Fixture (repeatable)

Form `a05hk000001RX8zAAG`, **Autofill Test: Satisfaction Survey (Personalized Link)**, a Survey connected to Contact. Read-only reference: later tasks use disposable copies for edits.

| Version | Id | State |
| --- | --- | --- |
| v1 | `a04hk000000hQC9AAM` | Archived |
| v2 | `a04hk000000hQCAAA2` | Archived |
| v4 | `a04hk000000lQK1AAM` | Active (Published) |
| v5 | `a04hk000000lOq6AAE` | Draft, last modified 2026-09-23 23:50 UTC (the earlier comparison's "v5 Draft" still exists, unchanged since) |

Screenshots use **v5 Draft**: theme Editorial Ivory, layout Scroll, one page, one section ("Customer feedback"), nine elements, title = the form name, description "Open this through a personalized link and your name and email are already filled in."

Steps (each state is reached from a fresh page load):

1. Open the Studio. It **lands in Design mode** (`mode = 'design'`, `finalFormStudio.js:103`).
2. Click **Build**. Capture. Click the first structure row to select a field and capture again.
3. Still in Build, click **Mobile** in the preview toolbar and capture.
4. Return to Desktop, click **Design** (Simple lens) and capture. Click **Advanced design**, open every `details.group`, and capture.

Playwright locators pierce the shadow DOM. Raw numbers: `screenshots/studio-ux/baseline-metrics.json`.

## 3. Measurements

| Screen | Baseline |
| --- | --- |
| Build, panes | Top bar 53px. `.st-body` 682px tall (y 53–735), so **65px of the 800px window sits unused below it** in the VF host (pre-existing; expansion in Task 1 fills `.st-body`, not the window). Tools 320px, structure 320px, preview 640px. |
| Build, preview | Preview viewport 603px wide → Desktop **Fit 47%**. No page-level horizontal overflow. |
| Design Simple | Left pane 430px, preview viewport 814px, Desktop **Fit 64%**. |
| Design Advanced (Brand & header) | Three stacked rich-text editors, **219px each (657px total)**: Title at y 418, Description at y 673, **Brand name at y 927, below the 800px fold**. |
| Mobile preview (Build, 100%) | Device canvas 390px wide. Header box 292×354px, title 25.6px (1.6rem), wrapping to five lines. **First input starts 558px below the top of the device**. |

Note for Task 5B: the plan's target "first input within the first 650px" is **already met at baseline (558px)**. It cannot show an improvement, so Task 5B is judged on the relative reduction against 558px as well as on that ceiling.

Screenshots (`screenshots/studio-ux/`): `baseline-build.png`, `baseline-build-selected.png`, `baseline-design-simple.png`, `baseline-design-advanced.png`, `baseline-mobile-preview.png`. The mobile capture was taken with a field selected, so the properties panel is showing on the left.

## 4. Editor mismatch diagnosis

**Result: confirmed differing formats**, with a contributing version-selection difference. It is not a loading or rendering defect in FinalStudio.

### Earlier live observation

The 2026-09-23 comparison (recorded in the plan) found FinalStudio and "FormBuilder Pro" showing different structure for the same survey. Its original screenshots were not available, so this section does not rely on them; everything below was re-observed on 2026-09-29.

### Current local code evidence

Three org tabs mount three legacy designers that all show the brand "FormBuilder Pro". Similar labels do not prove which route was used, so each was traced:

| Org tab | Component | Controller (payload read) |
| --- | --- | --- |
| `Form_Builder` | `formDesigner` | `FormDesignerController.getFormLayout` (`:972`) → `Form_Version__c.Layout_Config__c` |
| `Form_Studio` | `formStudio` | `FormStudioController.getFormLayout` (`:323`) → `Form_Version__c.Layout_Config__c` |
| `ZFromDesigner` | `zFormDesigner` | `Z_FormDesignerController` → `Z_Form__c` / `Z_Form_Version__c.Z_Form_Definition_JSON__c`, a separate object family (the org holds 2 `Z_Form_Version__c` rows), so it cannot open this survey |
| `Final_Studio` (this plan) | `finalFormStudio` | `FinalStudioController.loadStudio` → `Form_Version__c.Spec_JSON__c`, **draft first, else active** |

An App Page (`form_Desginer`) also hosts `formStudio` beside `zLayoutHarness`.

### Newly verified live facts (counts only; no form content recorded)

Payload fields on the four versions of this survey:

| Version | `Spec_JSON__c` | `Layout_Config__c` | `Layout_Mode__c`, `Layout_Spec__c`, `Schema_Snapshot__c` |
| --- | --- | --- | --- |
| v1 | populated: 1 page, 1 section, 0 elements | **blank** | blank |
| v2 | populated: 1 page, 1 section, 4 elements | **blank** | blank |
| v4 (Active) | populated: 1 page, 1 section, 5 elements | **blank** | blank |
| v5 (Draft) | populated: 1 page, 1 section, 9 elements | **blank** | blank |

Legacy `formStudio` (tab `Form_Studio`) was driven live after picking this survey: `getFormVersions` listed v5, v4, v2, v1, but `getFormLayout` was requested for **`a04hk000000lQK1AAM` (v4, Active)**, and the live preview read "This form is empty — add sections and fields" (`screenshots/studio-ux/legacy-formstudio-v4-empty.png`). FinalStudio, given the same form, opens the draft **v5** (`a04hk000000lOq6AAE`) with nine elements.

### Classification and next action

- **Different formats:** FinalStudio writes and reads `Spec_JSON__c`. The legacy editors read `Layout_Config__c` from the same version rows, and that field is blank for every version of a form authored in FinalStudio, so the legacy editor shows an empty form.
- **Different default version:** FinalStudio opens the draft (v5); the legacy editor opened the active version (v4). A side-by-side of "v5 Draft" against the legacy editor compared different versions as well as different fields.
- **Next action (separate, nothing implemented):** treat the legacy tabs as reference only. Decide whether to retire the org tabs `Form_Builder`, `Form_Studio` and `ZFromDesigner` (and the `form_Desginer` page) from navigation so the two editors stop being compared. No JSON conversion and no save-path synchronisation.

The two editors are **not interchangeable**, and this UX work does not change that.

### Not done

- `formDesigner` (tab `Form_Builder`) was not driven live: the Playwright step that opens its survey dropdown did not match. Its Apex reads the same field as `formStudio` (above).

## 5. Status

Task 0 verified for FinalStudio at `aa98bbc`. Later tasks compare against the numbers in section 3.
