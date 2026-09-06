# Studio color consistency and contrast

**Status: DONE.** Implemented, deployed to `revclouddev` and org-verified on 2026-09-06.

Respondent-theme isolation was verified in the org by switching a form's theme live: `--c-accent`
moved `#0f766e → #9355af` and `--c-page-bg` `#f6f4ee → #01130b` while `--c-studio-accent` held at
`#0f766e`. See PENDING_WORK §9.5 for the full result set and the two mechanisms that guarantee the
separation (disjoint `--c-studio-*` namespace; `finalPageFrame` re-declaring `color`/`font-family`).

## What changed

- One shared authoring palette in the CSS-only `finalStudioStyles` LWC bundle. Existing recovery-dialog `--c-studio-*` variables are consolidated here; gallery `--g-*` aliases now use the same palette.
- Primary actions and selection accents use teal `#0f766e`, with a darker hover color. Creation/gallery chrome no longer uses a separate indigo accent.
- Consistent neutral text, helper text, surfaces and control borders. Warning, error, success and information notices retain distinct semantic colors.
- The Build canvas stays dark. Its text, drag handles, empty-drop guidance, control borders and selection/drop indicators now use dedicated high-contrast dark-surface tokens.
- Native keyboard focus uses a solid teal outline on light surfaces and mint on the dark canvas. Clipped segmented controls use an inset outline; selected filled segments use a white inset outline. Selected theme/layout cards have a separate offset focus outline.
- Added field labels no longer fade with whole-row opacity; their existing Added badge and subdued background communicate the state while keeping text readable.
- Salesforce button color hooks are scoped to authoring `lightning-button` elements. No global Salesforce brand variables are overridden.

No application JavaScript, templates, Apex, data access, layout dimensions, drag-and-drop behavior or Alt+arrow handling changed. No movement menus were added. No Git commands or deployment were run.

## Contrast results

| Pair                                                | Ratio                          |
| --------------------------------------------------- | ------------------------------ |
| White on primary teal                               | **5.47:1** (previously 3.74:1) |
| White on primary hover                              | 7.58:1                         |
| Main text on white                                  | 14.68:1                        |
| Helper text on white                                | 6.42:1                         |
| Helper text on the darkest supported light surface  | 5.71:1                         |
| Muted canvas text on a canvas section               | 7.27:1                         |
| Canvas selection accent on a canvas section         | 8.03:1                         |
| Input border on the darkest supported light surface | 3.17:1                         |
| Canvas control border on a canvas section           | 3.83:1                         |

The palette audit checks 60 intended foreground/background pairs: at least 4.5:1 for normal text and 3:1 for control boundaries/focus indicators. This is a palette check, not a claim that every composed screen meets every WCAG requirement. Disabled controls, customer-selected theme colors and platform-rendered base controls require separate consideration.

## Exact files for review

23 existing component stylesheets changed:

| File                                                                               | Scope                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `force-app/main/default/lwc/finalFormStudio/finalFormStudio.css`                   | Studio toolbar, workspace, recovery notices and settings drawer          |
| `force-app/main/default/lwc/finalPreviewStage/finalPreviewStage.css`               | Preview device controls and restart button                               |
| `force-app/main/default/lwc/finalBuilderCanvas/finalBuilderCanvas.css`             | Dark canvas text, drag handles, drop targets and keyboard focus          |
| `force-app/main/default/lwc/finalFieldPalette/finalFieldPalette.css`               | Palette tabs, field cards and readable Added state                       |
| `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.css`                 | Design lenses, inputs, selected tiles and guidance                       |
| `force-app/main/default/lwc/finalPropertyPanel/finalPropertyPanel.css`             | Properties, segmented controls, upload links and Added state             |
| `force-app/main/default/lwc/finalFormsLibrary/finalFormsLibrary.css`               | Library actions, filters and status messages                             |
| `force-app/main/default/lwc/finalCreationGallery/finalCreationGallery.css`         | Creation flow, gallery palette aliases, object labels and device buttons |
| `force-app/main/default/lwc/finalThemeGallery/finalThemeGallery.css`               | Theme filters and layout selector                                        |
| `force-app/main/default/lwc/finalLayoutCard/finalLayoutCard.css`                   | Only the outer selection frame, icon and metadata                        |
| `force-app/main/default/lwc/finalThemeCard/finalThemeCard.css`                     | Only the outer selection frame and metadata                              |
| `force-app/main/default/lwc/finalThemeEditor/finalThemeEditor.css`                 | Theme editor dialog and primary action                                   |
| `force-app/main/default/lwc/finalColorControl/finalColorControl.css`               | Color-picker chrome and contrast result badges                           |
| `force-app/main/default/lwc/finalGradientControl/finalGradientControl.css`         | Gradient editor controls and clipped-segment focus                       |
| `force-app/main/default/lwc/finalRuleEditor/finalRuleEditor.css`                   | Rule controls, focus, hints and errors                                   |
| `force-app/main/default/lwc/finalValidationEditor/finalValidationEditor.css`       | Validation controls, focus, hints and errors                             |
| `force-app/main/default/lwc/finalRelationshipPicker/finalRelationshipPicker.css`   | Relationship picker dialog and options                                   |
| `force-app/main/default/lwc/finalStudioActionDialog/finalStudioActionDialog.css`   | Save/publish/action dialog chrome                                        |
| `force-app/main/default/lwc/finalStudioSettingsPanel/finalStudioSettingsPanel.css` | Settings labels, boundaries and errors                                   |
| `force-app/main/default/lwc/finalConnectedObjectCard/finalConnectedObjectCard.css` | Connected-object editor chrome                                           |
| `force-app/main/default/lwc/finalRecordLinkPanel/finalRecordLinkPanel.css`         | Record-link controls and notices                                         |
| `force-app/main/default/lwc/finalGalleryPicker/finalGalleryPicker.css`             | Gallery dialog chrome                                                    |
| `force-app/main/default/lwc/finalImageUploader/finalImageUploader.css`             | Image-upload controls and errors                                         |

Additional files:

| File                                                                         | Change                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.css`         | New shared authoring tokens, focus rules and scoped Salesforce button hooks             |
| `force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.js-meta.xml` | New non-exposed CSS-only bundle, API 66                                                 |
| `jest.config.js`                                                             | Resolve the CSS-only module to its real stylesheet in Jest; no stylesheet mock          |
| `scripts/qa/studio-colors.cjs`                                               | New repeatable contrast, token-reference, import-scope and stylesheet compilation audit |
| `docs/FinalDesign/PENDING_WORK.md`                                           | Update §9.5 with local completion and pending org verification                          |
| `docs/FinalDesign/STUDIO_COLOR_CONSISTENCY.md`                               | This handoff and file inventory                                                         |

**Include the new `finalStudioStyles` bundle when deploying the changed authoring components.** The importing components depend on it. The Jest config, QA script and documentation are local tooling only.

## Verification completed

- `node scripts/qa/studio-colors.cjs`: 60 contrast pairs passed; all 24 authoring/shared stylesheets compiled through the LWC compiler; shared imports and token references validated.
- Existing Jest tests for all affected authoring bundles that have test suites: **19 suites, 190 tests passed**. No existing tests or expected respondent theme values were changed.
- Local Chromium fixture using the actual component stylesheets in isolated shadow roots: selected device background and inset focus, creation input focus, dark canvas focus, and customer-theme isolation passed. This is a CSS fixture, not a deployed Studio smoke test.
- Before/after filesystem hashes confirmed existing LWC JavaScript, HTML, metadata, runtime/legacy stylesheets and theme catalog/engine files were unchanged. The 138 themed layout-thumbnail declarations and 148 theme-preview/remaining card declarations retained their values; only formatting whitespace changed.

## Org verification after deployment

1. Open the Forms library, start New Form, select layouts/themes and complete the creation flow. Check that gallery selection frames and primary actions share the Studio teal, while theme thumbnails retain their own palette.
2. In Studio, inspect Build and Design, property panels, rules/validation, theme editing, image controls and the settings/action dialogs. Confirm text, notices and selected controls remain readable.
3. Use Tab/Shift+Tab through Build/Design, Desktop/Tablet/Mobile, Design lenses and gradient switches. Check selected and unselected focus, especially inside clipped groups. Check a focused selected theme/layout card too.
4. Confirm drag handles and drop guidance are visible on the dark canvas; exercise drag-and-drop and Alt+↑/↓ once to verify the unchanged behavior in the org.
5. Select a visibly different respondent theme and switch Build/Design. Confirm its live preview, color swatches and published/guest rendering retain their original colors.
6. Check Salesforce base buttons/icons, including destructive actions, in the org's active Lightning styling. These native shadow internals are not covered by Jest stubs or the local CSS fixture; their rendering depends on the active Salesforce styling system. This change scopes component hooks and leaves Salesforce global styling intact.
