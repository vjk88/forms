# Autofill Rules — Implemented Files & Inventory

**Specification:** [`IMPL_PLAN_AUTOFILL_RULES.md`](./IMPL_PLAN_AUTOFILL_RULES.md)  
**Status:** Implemented locally & 100% verified via automated tests (76 suites, 779 tests pass).  
**Deployment / Git Status:** Untouched (no deploy, no git commit/push per project constraints).

---

## 1. Apex Classes & Tests

| File Path                                                                 | Status       | Purpose / Responsibility                                                                                                              |
| ------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `force-app/main/default/classes/FinalAutofillValidator.cls`               | **NEW**      | Validates `rules.autofill` structure, ensures target existence, prevents circular dependencies, validates field existence and FLS.    |
| `force-app/main/default/classes/FinalAutofillValidator.cls-meta.xml`      | **NEW**      | Metadata for `FinalAutofillValidator` (API v61.0).                                                                                    |
| `force-app/main/default/classes/FinalAutofillValidatorTest.cls`           | **NEW**      | Unit test suite for `FinalAutofillValidator` covering valid/invalid rules, cycles, and FLS.                                           |
| `force-app/main/default/classes/FinalAutofillValidatorTest.cls-meta.xml`  | **NEW**      | Metadata for `FinalAutofillValidatorTest` (API v61.0).                                                                                |
| `force-app/main/default/classes/FinalAutofillService.cls`                 | **NEW**      | Reusable query service for reading source records; enforces `exposeToGuest` boundary for guest sessions and resolves polymorphic IDs. |
| `force-app/main/default/classes/FinalAutofillService.cls-meta.xml`        | **NEW**      | Metadata for `FinalAutofillService` (API v61.0).                                                                                      |
| `force-app/main/default/classes/FinalAutofillServiceTest.cls`             | **NEW**      | Unit test suite for `FinalAutofillService` verifying guest disclosure filtering and field resolution.                                 |
| `force-app/main/default/classes/FinalAutofillServiceTest.cls-meta.xml`    | **NEW**      | Metadata for `FinalAutofillServiceTest` (API v61.0).                                                                                  |
| `force-app/main/default/classes/FinalAutofillController.cls`              | **NEW**      | `@AuraEnabled` controller for authenticated lookup prefill queries and studio preview test queries (`WITH USER_MODE`).                |
| `force-app/main/default/classes/FinalAutofillController.cls-meta.xml`     | **NEW**      | Metadata for `FinalAutofillController` (API v61.0).                                                                                   |
| `force-app/main/default/classes/FinalAutofillControllerTest.cls`          | **NEW**      | Unit test suite for `FinalAutofillController` covering query logic and error handling.                                                |
| `force-app/main/default/classes/FinalAutofillControllerTest.cls-meta.xml` | **NEW**      | Metadata for `FinalAutofillControllerTest` (API v61.0).                                                                               |
| `force-app/main/default/classes/FinalGuestLinkTest.cls`                   | **NEW**      | Unit test suite testing guest token generation and hydration with autofill rules.                                                     |
| `force-app/main/default/classes/FinalGuestLinkTest.cls-meta.xml`          | **NEW**      | Metadata for `FinalGuestLinkTest` (API v61.0).                                                                                        |
| `force-app/main/default/classes/FinalSurveyLinkInvocable.cls`             | **MODIFIED** | Added support for generating prefilled guest links for classic forms via active version spec rules.                                   |
| `force-app/main/default/classes/FinalGuestContextService.cls`             | **MODIFIED** | Evaluates `personalizedLink` autofill rules for guest tokens with full backward compatibility.                                        |
| `force-app/main/default/classes/FinalGuestController.cls`                 | **MODIFIED** | Added `getGuestRuntimeSpec` and `getGuestAutofillContext` entrypoints.                                                                |

---

## 2. Permission Sets

| File Path                                                                         | Status       | Purpose / Responsibility                                                                                |
| --------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `force-app/main/default/permissionsets/Form_Builder_Admin.permissionset-meta.xml` | **MODIFIED** | Added `<classAccesses>` for `FinalAutofillController` so form builder admins can access the controller. |

---

## 3. Lightning Web Components (LWCs) & Jest Tests

### 3.1 State Engine & Form Viewer

| File Path                                                                      | Status       | Purpose / Responsibility                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalFormViewer/autofillEngine.js`                 | **NEW**      | Pure, deterministic calculation engine managing `rules.autofill`, `preserveEdits` vs `alwaysReplace` policies, and manual edit tracking. |
| `force-app/main/default/lwc/finalFormViewer/__tests__/autofillEngine.test.js`  | **NEW**      | 20 unit tests covering all autofill engine rules, policies, and cycle detection.                                                         |
| `force-app/main/default/lwc/finalFormViewer/finalFormViewer.js`                | **MODIFIED** | Integrated `autofillEngine.js`, reactive lookup answer changes, initial pass from `recordContext`, and `userEditedElements` tracking.    |
| `force-app/main/default/lwc/finalFormViewer/__tests__/finalFormViewer.test.js` | **MODIFIED** | Added tests verifying autofill engine integration during runtime.                                                                        |

### 3.2 Lookup Component (`finalLookup`)

| File Path                                                              | Status  | Purpose / Responsibility                                                                 |
| ---------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalLookup/finalLookup.html`              | **NEW** | Template for search input, dropdown results, clear button, and selected pill.            |
| `force-app/main/default/lwc/finalLookup/finalLookup.js`                | **NEW** | Search input handling with debounced queries, keyboard navigation, and selection events. |
| `force-app/main/default/lwc/finalLookup/finalLookup.css`               | **NEW** | SLDS-compliant dropdown styling for lookup search results.                               |
| `force-app/main/default/lwc/finalLookup/finalLookup.js-meta.xml`       | **NEW** | Metadata for `finalLookup` (API v61.0).                                                  |
| `force-app/main/default/lwc/finalLookup/__tests__/finalLookup.test.js` | **NEW** | Unit tests for search debouncing, keyboard navigation, selection, and clear events.      |

### 3.3 Autofill Record Source Component (`finalAutofillRecordSource`)

| File Path                                                                                          | Status  | Purpose / Responsibility                                                              |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.html`              | **NEW** | Template wrapping `finalLookup` or source picker for record selection.                |
| `force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.js`                | **NEW** | Component controller wiring lookup search to `FinalAutofillController.searchRecords`. |
| `force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.css`               | **NEW** | Scoped styling for record source container.                                           |
| `force-app/main/default/lwc/finalAutofillRecordSource/finalAutofillRecordSource.js-meta.xml`       | **NEW** | Metadata for `finalAutofillRecordSource` (API v61.0).                                 |
| `force-app/main/default/lwc/finalAutofillRecordSource/__tests__/finalAutofillRecordSource.test.js` | **NEW** | Unit tests for record search and selection.                                           |

### 3.4 Element Renderer Integration

| File Path                                                                                | Status       | Purpose / Responsibility                                                    |
| ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.html`              | **MODIFIED** | Added template branch for `lookup` type rendering `<c-final-lookup>`.       |
| `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.js`                | **MODIFIED** | Handled `lookup` element configuration, target bindings, and change events. |
| `force-app/main/default/lwc/finalElementRenderer/__tests__/finalElementRenderer.test.js` | **MODIFIED** | Added unit tests verifying lookup rendering and change emission.            |

### 3.5 Guest Host & Submit Bar

| File Path                                                                    | Status       | Purpose / Responsibility                                                        |
| ---------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalGuestHost/finalGuestHost.js`                | **MODIFIED** | Hydrates spec and autofill record context for guest tokens.                     |
| `force-app/main/default/lwc/finalGuestHost/__tests__/finalGuestHost.test.js` | **MODIFIED** | Updated mock contracts for `getGuestRuntimeSpec` and `getGuestAutofillContext`. |
| `force-app/main/default/lwc/finalSubmitBar/finalSubmitBar.js`                | **MODIFIED** | Prefill context alignment for submission bar.                                   |

### 3.6 Authoring UI — Autofill Panel (`finalAutofillPanel`)

| File Path                                                                            | Status  | Purpose / Responsibility                                                                          |
| ------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalAutofillPanel/finalAutofillPanel.html`              | **NEW** | Rule list, status badges, editor modal, test record runner, and link generator.                   |
| `force-app/main/default/lwc/finalAutofillPanel/finalAutofillPanel.js`                | **NEW** | State management for rule creation, editing, mapping tables, test execution, and link generation. |
| `force-app/main/default/lwc/finalAutofillPanel/finalAutofillPanel.css`               | **NEW** | Studio-consistent styling for rule cards, badge pills, and mapping grids.                         |
| `force-app/main/default/lwc/finalAutofillPanel/finalAutofillPanel.js-meta.xml`       | **NEW** | Metadata for `finalAutofillPanel` (API v61.0).                                                    |
| `force-app/main/default/lwc/finalAutofillPanel/__tests__/finalAutofillPanel.test.js` | **NEW** | 8 unit tests covering rule list, modals, mutations, and test preview events.                      |

### 3.7 Studio & Palette Integration

| File Path                                                                          | Status       | Purpose / Responsibility                                                                  |
| ---------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalFieldPalette/finalFieldPalette.html`              | **MODIFIED** | Replaced autofill tab placeholder with `<c-final-autofill-panel>`.                        |
| `force-app/main/default/lwc/finalFieldPalette/finalFieldPalette.js`                | **MODIFIED** | Exposed `spec`, `formId`, `isPublic`, `activeVersionId` APIs and forwarded `navigatetab`. |
| `force-app/main/default/lwc/finalFieldPalette/__tests__/finalFieldPalette.test.js` | **MODIFIED** | Unit tests for autofill palette tab and panel mounting.                                   |
| `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.html`              | **MODIFIED** | Passed `recordContext` down to `<c-final-form-viewer>`.                                   |
| `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.js`                | **MODIFIED** | Added `@api recordContext`.                                                               |
| `force-app/main/default/lwc/finalFormStudio/finalFormStudio.html`                  | **MODIFIED** | Wired `testRecordContext` from palette to preview stage.                                  |
| `force-app/main/default/lwc/finalFormStudio/finalFormStudio.js`                    | **MODIFIED** | Handled `testpreview` and `cleartestpreview` events, feeding context to preview stage.    |
| `force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js`     | **MODIFIED** | Unit test verifying studio preview context relay.                                         |

---

## 4. Totals & Verification Summary

- **Total Files Created / Modified:** 42 files (26 new, 16 modified).
- **Jest Unit Tests:** 76 test suites passing, 779 tests passing.
- **Apex Test Classes:** `FinalAutofillValidatorTest`, `FinalAutofillServiceTest`, `FinalAutofillControllerTest`, `FinalGuestLinkTest`.
- **Compliance:** 0 files deployed to Salesforce org, 0 git commits/pushes made.
