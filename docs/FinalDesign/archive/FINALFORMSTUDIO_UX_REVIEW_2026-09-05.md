# FinalFormStudio UI/UX review

Reviewed 5 September 2026. This reviews the existing Salesforce LWC application, not the separate UX prototype.

The recommendation is to refine the current Studio. Its Build/Design split, three-pane builder, actual respondent preview, contextual rules, and separate layout/theme selection are useful foundations. The greatest improvement would come from keeping the author oriented and making the preview a reliable testing workspace. Visual polish should support that work.

## Evidence and scope

Browser review covered the Forms & Surveys library; New Form kind selection, layout gallery, theme gallery and final setup; Survey template selection; and existing Studio configurations **R1 Survey Review**, **QA Record Rules**, and **R1 Form Review**. Within Studio I inspected Build, question and Salesforce field properties, the Logic index and an existing record condition, Simple and Advanced Design, Availability, Access & invitations, and Autofill.

The browser panel was approximately 919px wide for Studio. I also inspected the survey builder at an explicit **1366 × 900** laptop viewport. Findings below distinguish browser observations from source findings and design recommendations.

I entered a temporary preview answer and switched modes. I did not create a form, edit a saved specification, publish, change access, or generate/send invitations. Save/publish failure handling was reviewed in source, not induced in the org. Creation was inspected up to the final setup screen, without submitting it. This is a product/interaction review with focused accessibility findings, not a complete accessibility certification or exhaustive respondent-runtime test.

Relevant source is under `force-app/main/default/lwc/`: `finalFormStudio`, `finalPreviewStage`, `finalFormViewer`, `finalBuilderCanvas`, `finalFieldPalette`, `finalPropertyPanel`, `finalRuleEditor`, `finalDesignPanel`, `finalGalleryPicker`, `finalCreationGallery`, `finalFormsLibrary`, `finalStudioSettingsPanel`, and `finalRecordLinkPanel`.

## Recommended priorities

| Priority | Improvement                                         | Why it matters                                                                               | Scope                  |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| 1        | Preserve the preview test session                   | Testing a rule should not require re-entering all its inputs                                 | Viewer/Studio behavior |
| 1        | Add preview zoom/expand and adjustable panes        | Desktop preview is too small to use comfortably; narrow layouts crush the structure          | Layout + interaction   |
| 1        | Make save failures visible and retryable            | Authors need certainty that their changes are safe                                           | Status + behavior      |
| 1        | Correct contrast on small teal buttons              | Current white-on-teal chrome measures 3.74:1                                                 | Studio styling         |
| 1        | Make field/section selection keyboard accessible    | Essential building actions currently depend on the mouse                                     | Interaction            |
| 2        | Improve inspector orientation and Logic jumps       | Choosing a rule should put that rule in view                                                 | Navigation             |
| 2        | Add record context and rule explanations to preview | Record-based conditions cannot be meaningfully tested in the current ordinary Studio preview | Preview feature        |
| 2        | Simplify Design controls without removing depth     | Current-value choices are easier to understand than visual nudge buttons                     | Design panel           |
| 2        | Add library search and clearer statuses             | A growing library is difficult to scan manually                                              | Library                |
| 2        | Remove unfinished entry points and clarify creation | Active-looking placeholders break confidence                                                 | Creation/palette       |
| 2        | Use record lookup and clearer scheduling controls   | Native Salesforce tasks should work with recognizable records and dates                      | Settings               |

## 1. Keep the live preview, but make its state reliable

**Confirmed in the browser:** on R1 Survey Review, I selected “Happy, 4 of 5.” The accessibility state showed it checked. After switching Design → Build, it was unchecked. The preview session had reset.

**Confirmed in source:** `finalFormViewer.js:180` reapplies an updated specification with `preserveNav: true`, but `_apply` clears `this.answers` at line 485. It also resets other respondent state. `finalFormStudio.html` mounts separate preview instances in the Design and Build branches. Preserving navigation is therefore not the same as preserving a test scenario. The edit-triggered reset was traced in code rather than reproduced by modifying an org form.

Recommended behavior:

- Maintain an explicit Studio preview session containing answers, current position, repeat entries and device preference.
- Keep answers associated with stable element IDs when labels, styles or rules change. Prune removed fields and values that become incompatible with a changed question type.
- Re-evaluate visibility immediately against those retained answers.
- If the current question becomes hidden, move predictably to an available question and explain the change briefly.
- Clear the session through the existing Restart preview action, rather than on ordinary edits or mode switches.
- Keep this behavior scoped to Studio so published-form submission and reset semantics remain intentional.

**Acceptance check:** answer several questions, change a visibility rule, switch modes, and return. The remaining valid answers are retained and the resulting visibility matches them. Restart clears them.

## 2. Make the three-pane Build layout adaptable

**Observed:** the structure column became a very thin strip in the approximately 919px panel. Section names and questions were reduced to fragments. At 1366px the structure was usable, but the desktop preview’s text and controls were still very small.

**Source:** the Build inspector is fixed at 320px; preview takes 50% with a 340px minimum; structure receives the remainder (`finalFormStudio.css:300`, `:429`). Desktop is laid out at 1280px and transformed to fit (`finalPreviewStage.js`, `DEVICES` and `_apply`). At 1366px, roughly 646px of usable preview width yields approximately **50% scale**. A 14px respondent label therefore appears about 7px tall. This is a preview presentation problem, not proof that the published form uses a 7px font.

Recommended controls:

- Preserve the three panes at normal desktop widths.
- Add keyboard-operable splitters and remember the author’s preferred widths.
- Show **Desktop · 1280px | Fit 50% | 100% | Expand**. Provide a scrollable 100% view and an expanded preview with an obvious return action.
- Let authors collapse the field palette or switch the structure into a compact outline at narrower widths. Do not let all three columns shrink indefinitely.
- In the outline, show real labels on up to two lines; keep their complete text available on focus/selection.
- Preserve the fixed device width when testing Desktop/Tablet/Mobile. Simply rendering the desktop form in the half-width container would change its responsive layout and lose the purpose of device simulation.

## 3. Extend the existing rules workflow

The current system already has a Logic index, per-element Visibility controls, All/Any/Custom expressions, grouped answer/record sources, and explanatory record-rule text. Keep these capabilities.

**Observed:** clicking “High-band salary expectations? — Shown by 1 rule” selected the correct element, but opened its properties at the top. Visibility remained below label, behavior, caption, placeholder and checks. The user must scroll to find the rule they explicitly requested.

Change Logic-index navigation to focus and scroll directly to the Visibility section. Keep the selected question’s heading visible. Add a compact breadcrumb such as **Feedback › About you › Role**. Use context-aware back labels: “Questions” for a survey, or “Back to Logic” when arriving from the rules list, rather than always “‹ Fields.” Preserve palette tab and scroll position on return.

A compact inspector with **Content**, **Behavior**, and **Data** sections or jump links would reduce scanning. This should organize the existing controls, not introduce another full-page rules editor. Keep the active rule and preview visible together.

**Record-context gap:** QA Record Rules has a `Desired Salary > 100` condition. The dependent question was absent from preview, and the inspector correctly explained that record rules need a record link. The current preview stage exposes no record selector/context input; Build authoring also bypasses normal record-context fetching. An author cannot compare records from inside this workspace.

Add **Preview as: Blank response / Test record**, using records the author may access, plus clearly identified simulated values where appropriate. An optional “Explain visibility” display should distinguish:

- “Hidden: Desired Salary is 80; rule requires greater than 100.”
- “Not evaluated: choose a test record.”
- “Shown: all conditions match.”

Keep hidden fields in the structure so they remain editable. Do not expose author debugging explanations in the respondent form.

**Typed rule controls:** every source currently receives the same operator options and comparison values use a text input (`finalRuleEditor.js:151`, `finalRuleEditor.html:128`). Offer operators and value editors appropriate to numbers, dates, booleans, choices and text. Preserve the existing source groups. For unfinished rule edits, keep a clearly marked draft state and a last-valid test result instead of making temporary incomplete configuration appear to be a definitive result.

## 4. Simplify Design while keeping its depth

Keep Simple/Advanced, the area-based Advanced navigation, theme/layout galleries, override counts, contrast feedback and reset controls. They are useful existing features.

**Simple currently is not especially compact.** Its Title and Subtitle each expose a large rich-text toolbar. Several essentials move below the fold. Collapse formatting until requested or focused, preserving the stored rich-text content. Keep common formatting convenient; place less common commands behind a disclosure.

**Show current state instead of relying on visual nudges.** Rounder/Sharper increment or decrement radius; Airy/Dense set a density value (`finalDesignPanel.js:798`). The four buttons do not clearly communicate the current values, and a radius nudge can reach an endpoint without obvious feedback.

Prefer **Corners: Square / Soft / Round** and **Spacing: Compact / Comfortable**, mapped to the supported values. If nudge controls remain, display the current value and disable unavailable directions.

**Reduce repeated chrome.** In Simple, customization information appears both near the panel header and in an advanced-customization callout. Consolidate this into one useful summary: “1 customization · Review · Reset.” Show Theme/Layout prominently in their relevant area, with a compact current-theme summary elsewhere.

**Use helper text selectively.** Advanced Palette currently displays substantial explanations in a yellow/brown tone below most controls. Keep one-line effects visible, put longer descriptions behind “More,” and use neutral text for ordinary help. Reserve warning color for actual issues. Keep actionable contrast warnings visible.

Use clearer labels where they remove guesswork: “Header & intro” for Words; “Buttons & completion” where Finish/Actions controls warrant that scope; “Typography” for Type. Do not rename familiar terms merely for novelty.

## 5. Refine the Studio visual system

The actual app has a workable teal identity. Keep it. Standardize the authoring chrome independently of each form’s respondent theme.

| Role                                 | Proposed value | Application                                                                                  |
| ------------------------------------ | -------------- | -------------------------------------------------------------------------------------------- |
| Primary action / selected control    | `#0F766E`      | Publish and active Studio controls; white text measures **5.47:1**                           |
| Primary hover / stronger link        | `#0B6E65`      | Hover/active accent; white text measures **6.12:1**                                          |
| Selected light surface               | `#E6F4F1`      | Inspector selection and navigation backgrounds, paired with dark teal text                   |
| Panel                                | `#FFFFFF`      | Properties, toolbars and dialogs                                                             |
| Workspace                            | `#F4F6F8`      | Quiet surrounding canvas                                                                     |
| Main text                            | `#1F2937`      | Labels and ordinary content                                                                  |
| Secondary text                       | `#5F6B7A`      | Helper text and metadata                                                                     |
| Dividers                             | `#E2E8F0`      | Decorative panel boundaries; use a stronger tested border where necessary to identify inputs |
| Structure surface, if retaining dark | `#242A31`      | Softer charcoal; validate text and selected-outline contrast on it                           |

**Measured issue:** white on the existing `#0D9488` is **3.74:1**. Studio uses it with small button text in the top bar, preview device selector and Design mode selector. WCAG requires 4.5:1 for ordinary small text, so darkening these backgrounds is a concrete fix, not just taste. The respondent Design panel already warns about this same color in the QA Record Rules form; apply that discipline to Studio itself. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).

Use semantic Studio tokens for action, selected, hover, border, muted text, success and error. Avoid changing all respondent theme tokens to impose a studio color scheme. Use supported Salesforce styling hooks for base components where available, validating against this app’s actual Visualforce/Lightning host; avoid brittle overrides of internal component markup. See [Salesforce styling hooks guidance](https://developer.salesforce.com/docs/platform/lwc/guide/create-components-css-custom-properties).

Additional styling refinements:

- Use a consistent Studio font stack, 13–14px ordinary text and a small, deliberate heading scale. Keep respondent typography theme-controlled.
- Use consistent button heights, radii and icon treatment. Replace text-glyph undo/redo/delete icons with consistent icons and accessible names.
- Reduce nested dashed borders and placeholder bars in the blueprint. Use one selected outline; let labels and hierarchy dominate.
- Keep the dark structure if it helps distinguish editing structure from the actual form. Soften it rather than replacing it solely to make the app look different.
- Replace “BLUEPRINT — structure only; the preview is the truth” with a concise “Structure” heading and optional introductory help.
- Preserve the readable white panels and restrained spacing already present. Large gradients or additional decorative cards would add little here.

## 6. Improve New Form and the library

### Creation

The initial Form/Survey choice and separate layout/theme steps are sensible. Suggested refinement: **Type → Layout or template → Theme → Details**, with a small progress indicator and a persistent summary of prior choices. Keep Back predictable and retain choices.

**Layout cards:** currently different layouts use different colors, imagery and typography. Use a shared neutral theme and the same sample content in this step so users compare structure. Let the theme step demonstrate appearance.

**Theme gallery:** previews correctly use the selected layout. Keep that. Consider a short suggested/default set with “All themes,” retaining the existing category filters. Keep layout names out of style filtering where they imply a restriction that does not exist; theme names such as “Stepper” or “Split-Hero” are confusing when the same theme can be previewed in another layout.

**Flow detail:** one observed layout-to-theme transition landed near the end of the theme gallery. Investigate focus/scroll restoration and ensure each new step starts at its heading; restore the previous scroll position only when intentionally going Back. The source changes step state without an evident step-level focus/scroll reset. This was a single observed transition, not a proven universal failure.

**Final setup preview:** desktop creation preview uses horizontal scrolling in a narrow pane, while Studio uses scaled fitting. Make the controls consistent: visible scale, fit, actual size and expand. This reduces the learning cost between creation and editing.

**Remove visible dead ends:** Form templates currently presents an active-looking tab with a “coming next” shelf. Autofill in Studio displays “prefill mapping arrives with a later slice.” Hide unfinished actions or clearly disable them without occupying a main workflow destination. Existing implemented mapping/prefill features should remain available where they work.

**Copy:** use “Create or update Salesforce records” only where the selected flow actually supports those operations. Replace “every answer becomes a field” with wording that explains saving into the chosen object’s fields. Replace “answer store” and “later slice” with user language. Survey templates should explain the feedback collected and how results can be used, without promising unimplemented analysis.

### Library

The table is a good base; it does not need to become a decorative card dashboard. In the reviewed org, the long list and repeated names made manual scanning difficult.

- Add search by name, type and object, plus sortable Modified/Name columns.
- Make the form name a link to Studio; reduce the repeated outlined action buttons competing with every row name.
- Separate version from lifecycle: for example **Published v2 · Unpublished changes**, **Draft**, **Archived**. Explain “v1 + draft” in plain language.
- Display object labels such as “Job Application,” with the API name available secondarily when useful. Keep API names visible where technical mapping decisions need them.
- Preserve Current/Archived and the existing restore explanations. Keep search/filter state when returning from Studio.
- Rename the create action to “New form or survey” if the added length fits; it opens both choices.

## 7. Make save, publish and settings states unambiguous

**Source finding:** save failures produce “Save failed — retrying on next change,” with no explicit Retry action. The top-bar status is hidden under 1100px (`finalFormStudio.css:218`), which also hides an important error. The plain top-bar span is not a live status region. Publish errors share the save-error state (`finalFormStudio.js:2370`).

Keep a compact status at all widths. On failure, show persistent **“Changes not saved · Retry”**, preserve the unsaved work, and explain any action needed. Announce status changes appropriately without repeatedly interrupting screen-reader users. Distinguish a save failure from a publish failure. Make “saved draft” and “published live version” visibly different concepts.

The publish confirmation already warns that the live form updates. Improve it with a concise version/audience summary and any actionable issues that actually exist. Avoid adding a long generic checklist. Public access, accepting responses, and draft publication are separate states; present those distinctions plainly.

**Availability:** the 440px drawer places Open at and Close at side by side, each containing date and time inputs. The resulting date boxes are cramped. Stack these groups vertically, show the timezone actually used by Salesforce, and provide a plain schedule summary. Remove the duplicate Availability heading and the implementation sentence about the submission service. Retain the existing validation and save cue.

**Invitations:** replace the primary raw 15/18-character record-ID input with a searchable record lookup. Show the selected record name and useful disambiguating detail, scoped to the chosen object and user access. A paste-ID option can remain secondary. Salesforce supplies [lightning-record-picker](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-record-picker); confirm object and host support before choosing it over a supported custom lookup.

The existing immediate-save explanation for guest access is useful. Keep the existing confirmation for enabling public access. Visually separate “Invalidate all invitation links” from ordinary creation actions and explain its scope. No additional access toggles or external Salesforce connection step are needed.

## 8. Accessibility and interaction consistency

These changes improve everyday usability as well as accessibility:

- **Structure selection:** clickable/draggable field and section divs have no corresponding keyboard selection/reorder handlers in `finalBuilderCanvas.html`. Make primary selection focusable and operable with Enter/Space. Provide Move up/down/to section/page actions so drag is optional. Keep focus sensible after deletion and use the existing Undo capability.
- **Selected controls:** Build/Design and device buttons already expose pressed state. Extend that consistency to property segments and Design-area selection. The Simple/Advanced wrapper declares a tablist but its controls lack complete tab semantics; use an appropriate complete pattern rather than a partial one.
- **Dialogs:** Settings already contains keyboard/focus handling. Creation and gallery components need equivalent verification: focus enters the dialog, remains within it, Escape closes where appropriate, and focus returns to the invoking button. Gallery source handles Escape and initial close-button focus, but does not show a complete trap/return pattern. Creation’s object suggestions should expose combobox/listbox keyboard behavior, not just clickable text rows.
- **Labels and targets:** give delete controls context-specific accessible names. Keep icon targets comfortably usable and do not rely on hover to reveal the only way to perform an essential action.
- **Color:** never use color alone for selected/error/visibility state. Retain text and icons alongside it.

See [W3C keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard) for the requirement that functionality be keyboard operable. These are focused source/browser findings, not a claim that every component fails or passes WCAG.

## Implementation sequence and acceptance checks

**First pass: polish and clarity.** Darken action teal; standardize Studio text/buttons/borders; shorten internal copy; remove unfinished destinations; clarify current corner/spacing values; stack schedule inputs; preserve save-error visibility. These are relatively contained changes.

**Second pass: daily authoring workflow.** Preserve preview state; add fit/100%/expand and pane resizing; improve Logic jump/focus; add library search; fix essential keyboard selection and dialog behavior. These changes merit focused regression tests.

**Third pass: complex logic support.** Add permission-aware test-record context, typed rule editors and optional rule explanations. Keep test/debug UI isolated from the respondent experience.

Acceptance should include: a multi-page form and survey; long labels; empty/filled/hidden questions; answer retention across spec edits and mode switches; repeated sections; record-based show and hide rules with and without context; 1366px and a narrow split-app panel; keyboard-only selection/reordering; failed draft saving; and immediate-versus-published settings. Do not broaden this review into an unrelated app rewrite.
