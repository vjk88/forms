---
name: recurring-issues
description: UX anti-patterns and concrete bugs found in the forms builder/player to flag quickly in future reviews
metadata:
  type: project
---

Flag these fast (verify they still exist before recommending — line numbers drift):

1. **Property panel has no progressive disclosure.** `propertyPanel.html` is one long vertical scroll per context. Form Settings stacks ~12 controls + 3 conditional destination sub-blocks. Element props stack label/render-as/custom-values/slider/help/placeholder/visibility. Recommend grouping into collapsible sections or sub-tabs (Style / Behavior / Logic). Highest-impact cognitive-load fix.

2. **`completionEditor` is an orphan component.** No `c-completion-editor` reference anywhere in lwc/. Completion UX was reimplemented in `propertyPanel` (Form Settings, the After-Submit + destination blocks) AND as inline preview in `formDesigner.html`. The standalone component is dead code that was nonetheless edited in the recent diff. Completion config is effectively DUPLICATED between propertyPanel and completionEditor. Recommend deleting completionEditor or consolidating.

3. **Guest double-submit risk (Critical).** `formPlayer.handleSubmitClick()` calls `form.submit()`; the submit button is NOT disabled and shows no spinner until `handleSuccess` sets `isSubmitted=true`. Guests writing real records can double-click → duplicate records. Fix: set an `_submitting` flag, disable the submit button + show spinner, clear on success/error.

4. **Palette typo `class="palette-gro up"`** in `fieldPalette.html` (~L90) — splits into two bogus classes, breaks the Required Fields group wrapper styling. Should be `palette-group`.

5. **Raw hex instead of tokens** in a few spots (see [[tokens]]): toast `#032d60`, success rings `#eafbe7/#eafbe8`, player section header `#f7f9fb`.

6. **Top app bar is custom, not SLDS.** Primary Forms/Surveys nav + name/version dropdowns are hand-rolled buttons/menus. Works and looks clean, but accessibility of the custom dropdowns (`dd-menu`) needs checking: no `role=menu`/`aria-expanded`/arrow-key nav, closes via a full-screen backdrop div. Flag for keyboard + SR support.

7. **No skeleton/optimistic states in builder load.** Save uses a status strip (good), but version/layout load and the player first paint rely on `lightning-spinner` on blank. Player especially could use a skeleton to avoid spinner-on-blank + layout shift.
