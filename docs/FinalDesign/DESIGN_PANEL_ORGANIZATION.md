# Design panel organization

Implemented September 6, 2026. UI organization only; Advanced Design remains accessible. Paid access will be wired separately.

## User-visible changes

- Simple has three sections: Appearance; Content & branding; Buttons & confirmation. Only Appearance starts expanded. Native disclosure controls support keyboard use.
- Appearance contains theme selection, layout selection and accent color. Content contains logo, title and description. Buttons and confirmation contains only the labels the chosen layout uses, plus optional confirmation title and rich-text message.
- Removed Simple's Rounder, Sharper, Airy and Dense shortcuts. Custom-theme editing is reached from Advanced Design.
- Advanced Design replaces the nine-icon rail with five expandable sections: Brand & header; Page & form; Fields & sections; Navigation & buttons; After submit. Each section contains smaller disclosure groups. Theme/layout selection stays above the Advanced sections.
- All 99 registry controls (98 existing plus optional confirmation title) are mapped once in the Advanced presentation. Group/layout/form-type gates still apply; hidden values are retained.
- Shared Back/Next labels are shown where used. Conversational layouts expose Continue instead of Next. Both conversational navigation components now consume the configured Back label; Split Hero also consumes the configured Continue label.
- Existing toast completion stays unchanged when entering Simple; a contextual link opens its After submit settings.
- Theme-switch confirmation includes hidden theme overrides. Group resets remove only that group's theme overrides and retain content, uploaded header image references and unrelated settings.

## Data and compatibility

The host still owns the spec; the panel edits a copy and emits the existing specchange event. Font/theme Apex calls are unchanged. No licensing checks, upgrade checkout, new Apex or migrations were added.

The new optional plain-text title is stored at settings.completion.title and rendered by finalAfterSubmit. Missing titles render no extra heading, preserving existing forms. Existing rich-text content continues through the same Salesforce editor; its supported formats were not narrowed, avoiding a new formatting-loss risk. Salesforce documents that restricting formats can affect how existing/pasted formatting is represented: [Input Rich Text](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-input-rich-text).

Both modes write the same spec paths. Merely switching modes emits no specchange. Theme changes retain the existing Keep customizations / Use theme as-is / Cancel decision. Layout changes retain their established reconciliation of layout-specific options.

## Changed files

- `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.js`
- `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.html`
- `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.css`
- `force-app/main/default/lwc/finalDesignPanel/__tests__/finalDesignPanel.test.js`
- `force-app/main/default/lwc/finalDesignRegistry/finalDesignRegistry.js`
- `force-app/main/default/lwc/finalAfterSubmit/finalAfterSubmit.js`
- `force-app/main/default/lwc/finalAfterSubmit/finalAfterSubmit.html`
- `force-app/main/default/lwc/finalAfterSubmit/finalAfterSubmit.css`
- `force-app/main/default/lwc/finalAfterSubmit/__tests__/finalAfterSubmit.test.js`
- `force-app/main/default/lwc/finalFormViewer/finalFormViewer.html`
- `force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.js`
- `force-app/main/default/lwc/finalNavOneAtATime/finalNavOneAtATime.html`
- `force-app/main/default/lwc/finalNavOneAtATime/__tests__/finalNavOneAtATime.test.js`
- `force-app/main/default/lwc/finalNavSplitHero/finalNavSplitHero.js`
- `force-app/main/default/lwc/finalNavSplitHero/finalNavSplitHero.html`
- `force-app/main/default/lwc/finalNavSplitHero/__tests__/finalNavSplitHero.test.js`
- `force-app/main/default/lwc/finalFormViewer/__tests__/headerPaneMap.test.js`
- `force-app/main/default/lwc/finalDesignPanel/finalDesignPanel.js-meta.xml`
- `docs/FinalDesign/DESIGN_PANEL_ORGANIZATION.md` (this handoff)

## Validation

- 164 tests passed across 17 suites covering Design, completion, conversational navigation, Studio and the form viewer.
- New regression coverage includes all-control coverage/uniqueness, all layout variants' button labels, Simple section defaults, state preservation, confirmation content, toast-mode preservation, hidden-override theme confirmation, reset scope, and the viewer-to-navigation label contract.
- ESLint and Prettier checks are run on changed files.
- The existing dynamic-component slot compiler warning and jsdom CSS-parser limitations were observed during local tests; they did not fail the suites. No new warning suppression was added to the test files.
- **Shipped 2026-09-06.** All six bundles deployed to `revclouddev`, then merged to `main` as PR #239. The pre-commit prettier pass changed nothing, so the deployed source and `main` are identical.
- **Org render QA run 2026-09-07** (Playwright, headless, `/apex/FinalStudio`): **60 assertions passed, zero product failures, no console errors.** Results per step below.

## Manual verification after targeted deployment

Steps 1–4, 6 and 8 are **verified in the org** (2026-09-07). Steps 5 and 7 are partly verified —
what remains is called out inline, and both remainders are blocked on the same thing: they write
real data (a submitted response; a destructive override clear).

1. **PASS** — Open an existing customized form in Design. Confirm three Simple sections and no Look shortcuts; expand each section and check the live preview while editing. _Exactly `Appearance / Content & branding / Buttons & confirmation`, only the first open, zero `[data-look]` nodes._
2. **PASS** — Switch Simple → Advanced Design → Simple. Check custom colors, rich text, images and layout settings remain intact. _Theme, layout, rich text and every input identical across the round trip._
3. **PASS** — Open all five Advanced sections. Check conditional controls for stepper, rail, tabs, accordion, one-at-a-time and both Split Hero variants; also check a survey. _All seven layouts exercised (rail and accordion by switching layout on a scratch form, then restoring). Surveys included._
4. **PASS** — Edit Back / Next / Continue / Submit labels and check the appropriate buttons in preview, including conversational Back after advancing. _See "Label gates" below — the strongest result in the run._
5. **PARTIAL** — Add/edit/clear the confirmation title and message, submit in preview, and verify older forms with no title retain their previous appearance. _Verified: the title renders only in screen mode, is hidden in toast, **survives a screen → toast → screen round trip with its value intact** (IA §6), and clears. **Not verified:** submitting in preview to see the rendered confirmation — it writes a real response record. Jest covers the render, including that the title is emitted as text, not rich text._
6. **PASS** — Open a form using Toast & go. Simple must preserve that mode and retained screen content; its settings link should open After submit. _Simple summarises "Save · Toast & go"; the link switches to Advanced **and** expands After submit._
7. **PARTIAL** — Change themes on a customized form and exercise Keep / Use theme as-is / Cancel. Test a group reset and confirm header content and other groups survive. _Verified: the gallery opens, Cancel is non-destructive, and the customization count includes overrides hidden from the current lens. **Not verified:** Keep / Use-theme-as-is and group reset — all three destroy overrides on a real form._
8. **PASS** — Check keyboard focus, native disclosure controls, color pickers and rich-text menus at the normal Studio pane width. _Enter toggles a section, `aria-expanded` flips, focus is retained; pickers and rich-text menus render._

### Label gates — org-proven, not just jest-proven

Per layout the panel renders exactly the labels that layout actually uses: stepper / tabs / rail /
Split Hero show Back + **Next** + Submit; one-at-a-time and **Split Hero · Conversational** show
Back + **Continue** + Submit; scroll and accordion show Submit alone.

Flipping `paneFlow` on Split Hero live made `advanceLabel` appear and `nextLabel` vanish, and both
reverted — so `ownsAdvance = ownsHeader && paneFlow === 'oneAtATime'`, the subtlest branch here,
holds against a real org. Setting Back = "QA Back" and Continue = "QA Continue" then advancing a
screen rendered both on the real buttons, which closes the open question about whether the new
`backLabel` API actually reaches them.

### Findings — cosmetic, none blocking

- **The Arrangement hint is now wrong on conversational layouts.** It reads "How Back / **Next** /
  Submit line up" (static, unconditional) but those layouts have no Next — the control directly
  above it says "Continue button label". This reorganization's Next/Continue split is what made the
  hint inaccurate. Logged in [PENDING_WORK.md](./PENDING_WORK.md) §9.1.
- **Brand & header opens onto three stacked rich-text editors** (Title, Description, Brand name),
  each with a permanent toolbar, pushing Colors / Typography / Header appearance below the fold. It
  is the default-open section, so it is the first thing seen in Advanced. Same fix as the existing
  §9.2 "collapse rich-text toolbars until focused" item, which now applies to Advanced too.
- **Duplicated customization chrome** — the "N customization(s) · Reset all" chip sits directly
  above "N advanced customization(s) are active." Pre-existing; already tracked in §9.2.

### QA method and cleanup

Playwright headless against `/apex/FinalStudio` with per-run frontdoor auth. Four forms were
mutated during testing (paneFlow, button labels, completion title, and layout switches on the
scratch `rerere` form); each was reverted in-script and the specs were **re-queried afterwards to
confirm** every one is back to its original state. No residue.

Deploy only these six bundles: finalDesignPanel, finalDesignRegistry, finalAfterSubmit, finalFormViewer, finalNavOneAtATime, finalNavSplitHero.
