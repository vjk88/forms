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
- No Salesforce deployment or production-browser verification was performed. No Git commands were run against this Salesforce repository.

## Manual verification after targeted deployment

1. Open an existing customized form in Design. Confirm three Simple sections and no Look shortcuts; expand each section and check the live preview while editing.
2. Switch Simple → Advanced Design → Simple. Check custom colors, rich text, images and layout settings remain intact.
3. Open all five Advanced sections. Check conditional controls for stepper, rail, tabs, accordion, one-at-a-time and both Split Hero variants; also check a survey.
4. Edit Back / Next / Continue / Submit labels and check the appropriate buttons in preview, including conversational Back after advancing.
5. Add/edit/clear the confirmation title and message, submit in preview, and verify older forms with no title retain their previous appearance.
6. Open a form using Toast & go. Simple must preserve that mode and retained screen content; its settings link should open After submit.
7. Change themes on a customized form and exercise Keep / Use theme as-is / Cancel. Test a group reset and confirm header content and other groups survive.
8. Check keyboard focus, native disclosure controls, color pickers and rich-text menus at the normal Studio pane width.

Deploy only these six bundles: finalDesignPanel, finalDesignRegistry, finalAfterSubmit, finalFormViewer, finalNavOneAtATime, finalNavSplitHero. Commit and deployment remain with the owner.
