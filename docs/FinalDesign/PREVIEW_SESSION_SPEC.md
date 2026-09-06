# Studio preview session

Implemented locally 2026-09-06; deployment and org verification remain with the owner.

## Scope and ownership

Editable Studio Build and Design share one in-memory test session. The viewer reconciles
answers when a new specification finishes applying. Studio hands a shallow snapshot through
the preview stage before changing modes or entering version history. History gets a separate
preview; returning to the editable form restores its session. Loading another form or reloading
Studio starts fresh. No answers enter the form specification, undo history, storage, or Apex.
The opt-in is separate from `authoring`, which controls click-to-select. Guest/published viewers
and creation previews retain their existing behavior.

## Preservation and pruning

- Labels, help, theme, layout, ordering, visibility and validation edits preserve answers.
  Hidden questions retain their answers so changing a rule does not destroy a test scenario.
- Question identity is its element ID. Deletion drops its answer. A changed question type,
  field input type, scalar/multiple choice shape, field binding or survey mapping drops that
  question's answer. Moving into or out of a repeater starts a new answer context.
- Choice values identify options; renaming labels preserves selection. Removed values are
  removed from the answer. Free-text Other answers survive while Other remains enabled.
  Ranking preserves surviving order and appends newly added options in authored order.
  Matrix drops removed rows/points; Likert drops removed points. Ordinary numeric bounds or
  validation changes retain the test input so the author can see the resulting validation.
- Repeater rows retain their order and answers. Child object or relationship changes reset
  the repeater; child question changes prune only the affected cells. Lowering maximum entries
  keeps the first allowed rows; raising minimum entries pads with empty rows.
- Files retain their existing in-memory objects, without serializing or deep copying base64.
  Removing a file question or changing its binding drops its answer. Changing multiple to single
  keeps the first file. Other file constraints affect subsequent file selection as today.
  Hand-off snapshots are released after adoption; Restart and Studio teardown release session
  references. This does not increase the existing per-file upload size limit.

## Position and restart

The current visible page is restored by its stable ID, then by a surviving question when
one-question-per-screen or layout changes alter page IDs. If that page disappears, the previous
index is clamped to the remaining visible pages. Exact pixel scroll position, input focus and
collapsed section state are not part of this session contract.

Desktop/tablet/mobile survives Build/Design changes. Restart remounts the viewer and clears
answers, repeater rows, page position and submit feedback while keeping the device. Spec edits
and mode switches return a simulated completion screen to the form with the answers retained;
revealed validation errors are cleared and can be revealed again by advancing/submitting.

## Verification

Local checks: 21 related Jest suites passed, with focused reruns after adding file-hydration
and empty-option-bag coverage (158 tests total). Changed JavaScript passes ESLint and changed
LWC files are formatted with Prettier.

Jest covers reconciliation, real preview hydration, mode hand-off, restart, visibility/page
identity and repeater rows. Run the viewer, stage, Studio, section and element renderer suites.
Org smoke test: enter ordinary/choice/repeater/file answers; change a visibility rule and theme;
switch Build/Design; remove a selected option; change a repeater object; Restart. Check that the
retained answers are visibly selected, the expected rule still fires, and a fresh run is blank.

## Changed files

Paths below are relative to the repository root. No Git operations or deployment were performed.

- `force-app/main/default/lwc/finalFormViewer/finalFormViewer.js`
- `force-app/main/default/lwc/finalFormViewer/previewSession.js` (new)
- `force-app/main/default/lwc/finalFormViewer/__tests__/previewSession.test.js` (new)
- `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.js`
- `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.html`
- `force-app/main/default/lwc/finalPreviewStage/__tests__/finalPreviewStage.test.js`
- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.js`
- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.html`
- `force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js`
- `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.js`
- `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.html`
- `force-app/main/default/lwc/finalElementRenderer/__tests__/finalElementRendererHydration.test.js`
- `force-app/main/default/lwc/finalElementRenderer/__tests__/finalElementRendererFile.test.js`
- `force-app/main/default/lwc/finalSectionRenderer/finalSectionRenderer.js`
- `force-app/main/default/lwc/finalSectionRenderer/__tests__/repeats.test.js`
- `docs/FinalDesign/PREVIEW_SESSION_SPEC.md` (new)
- `docs/FinalDesign/PENDING_WORK.md`
