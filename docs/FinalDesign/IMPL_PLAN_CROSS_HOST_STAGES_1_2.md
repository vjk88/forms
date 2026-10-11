# Build plan: cross-host legibility (stage 1), then spacing and errors (stage 2)

**Status:** IN BUILD, stage 1 first. The owner said yes to the go order on 2026-10-10 ("yes to #1 and #2"), which also approved one disposable form for the unmodified end-to-end test. Stage 3 is **not** started (decisions 3 to 5 in the audit are still open). This plan is the file-by-file trace of stages 1 and 2. Delete or fold it into the catalog after ship.

**Spec (every number and the reasons):** `docs/FinalDesign/qa/CROSS_HOST_RENDER_AUDIT_2026-10-10.md`, sections 3A, 3B, 5 and 6.

**Branches:** `fix/legibility-stage1`, then `fix/spacing-errors-stage2`. Each opens a PR and is **not merged** until the owner has looked at the deployed result: both change how already-published forms look after the next site publish (stage 1 mostly on dark themes, stage 2 on the public site's spacing).

**Not in this work:** stage 3 (narrow-form sizing), the Studio's Mobile frame, rich text, refreshing older published forms' stored themes (they keep their stored colours; shared CSS still reaches them after a site publish), and the items in section 6.

---

## 1. Stage 1 in plain words

1. **Eleven built-in dark themes draw our red error message, required marker and invalid border at 1.7 to 2.5 : 1** (text needs 4.5 : 1, borders 3 : 1). They get a lighter red from the theme data. The 21 light themes already pass and are not touched. Neon Nights keeps its own hot pink, nudged just enough to pass.
2. **The platform paints the dropdown's text and three small icons (help, calendar, dropdown arrow) in fixed greys or brand blue** that no inherited colour reaches. Each widget is pointed at the theme's text colour through the styling hook it reads (found by testing, per host).
3. **Radio and checkbox option text is the same story** (a fixed dark grey on every host). Same fix, one hook name per host family.

## 2. File by file

### 2.1 `force-app/main/default/lwc/finalThemeCatalog/finalThemeCatalog.js` (data only)

- New constant above `THEMES`: `const ERROR_ON_DARK = '#ff8a80';` with a comment saying why, the thresholds, and that it clears 4.5 : 1 on the lightest dark panel's 8 % text tint with headroom.
- Ten dark themes get `fieldStates: { error: ERROR_ON_DARK, required: ERROR_ON_DARK }`: `dracula`, `tokyo`, `terminal`, `mintStepper`, `retroStepper`, `cyberSplit`, `auraSplit`, `carbonMatrix`, `cosmicVortex`, `auroraBorealis`. The engine merges `fieldStates` key by key, so `focus` stays derived from the accent.
- `neonNights` (bespoke hues kept): `fieldStates.error` `#ff5470` to `#ff617b`, `required` `#ff2e93` to `#ff59a9`. Smallest lift (same hue) that clears 4.5 : 1 on its panel tint with 0.3 headroom for the translucent glass.

Nothing else reads the old values: every consumer already reads the tokens `--c-field-error` and `--c-field-required` (`finalElementRenderer.css`, `finalFormViewer.css`, `finalSubmitBar.css`, `finalSectionRenderer.css`), so one data change recolours the message, the marker, the invalid border, the error banner and the submit-bar message together.

### 2.2 `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.css`

Hook names found by setting each candidate to red on the widget host of the real form (dark theme, all three host families), see section 3.

1. After the size rule for `.field lightning-radio-group, .field lightning-checkbox-group`, add a colour rule on the same selector:
   `--slds-g-color-on-surface-2: var(--c-text)` (Lightning), `--slds-g-color-neutral-base-30: var(--c-text)` (Studio), `--dxp-s-form-element-label-color: var(--c-text)` (public).
2. In `.field lightning-combobox` add `--slds-g-color-neutral-base-50: var(--c-text)` (dropdown text on the Studio and the public site; Lightning already follows `--slds-c-input-text-color`, which `:host` sets) and `--slds-c-icon-color-foreground-default: var(--c-text)` (dropdown arrow, all hosts).
3. Replace the dead rule `.field-label-row lightning-helptext { --slds-c-icon-color-foreground-default: ... }` (it moves nothing on any host; the help icon reads `--slds-c-icon-color-foreground`) with a rule setting `--slds-c-icon-color-foreground: var(--c-text)` on `.field-label-row lightning-helptext` and on `.field lightning-input` (the calendar icon lives inside the date input).
4. Comment block above these rules, same style as the size one: why they sit on the widgets and not on `.field`, and the one-line-per-host table.

### 2.3 Tests (written first, watched failing)

- `finalElementRenderer/__tests__/hostColourHooks.test.js` (new): reads the real stylesheet (same style as `typeScale.test.js`) and pins every hook above to `var(--c-text)` on the right selector, pins that the dead helptext hook is gone, and that none of the colour hooks sit on `.field` (they are global tokens that would recolour popups for every control).
- `finalThemeCatalog/__tests__/stateInkContrast.test.js` (new): for all 32 built-in themes, resolves the error and required inks and asserts at least 4.5 : 1 on the panel and on the panel plus 8 % text tint, and at least 3 : 1 (error ink) on the field fill; translucent glass panels are composited over the page colour and get 0.3 headroom. This is the tripwire that keeps a future dark theme from shipping the default red.

### 2.4 Not touched

The engine (no new token, the contract tripwire stays untouched), the HTML, the viewer, the lookup, Apex. Published forms keep their baked values.

## 3. Hook table (measured on the deployed form, dark theme, 2026-10-10)

| Target | Lightning (slds-plus) | Studio (Visualforce, Lightning Out) | Public site |
|---|---|---|---|
| Radio or checkbox option text | `--slds-g-color-on-surface-2` | `--slds-g-color-neutral-base-30` | `--dxp-s-form-element-label-color` |
| Dropdown text | `--slds-c-input-text-color` (already set on `:host`) | `--slds-g-color-neutral-base-50` | `--slds-g-color-neutral-base-50` |
| Dropdown arrow | `--slds-c-icon-color-foreground-default` | same | same |
| Help (i) icon | `--slds-c-icon-color-foreground` | same | same |
| Calendar icon | `--slds-c-icon-color-foreground` | same | same |

Today's colours these replace: dropdown text grey 116,116,116 (Studio, public); help and calendar icons brand blue 2,80,217 (Lightning), grey 116,116,116 (Studio), 118,113,107 (public); arrow 92,92,92 / 116,116,116 / 118,113,107.

## 4. Calls I made (veto any)

1. **One shared red for the ten dark themes** (`#ff8a80`, Material red A100) instead of ten hand-tuned values. Smallest passing red differs per theme (`#e3382c` on pure black up to `#ee877f` on slate); one value that clears the strictest keeps every dark theme's errors looking alike. Cost: pastel on the black themes.
2. **Icons and dropdown text use the theme's full text colour, not its weak colour.** The weak colour is under 3 : 1 on four dark themes.
3. **Only built-in themes are fixed.** A custom dark palette built on a light theme keeps the default red until its author changes it (the theme editor shows the contrast number). An engine rule that nudges any failing colour would override authored choices, so I did not add one.
4. **Neon Nights' two colours move a few percent lighter** (it is a pixel port of the owner's exploration 04). Easy to revert if the owner prefers the exact originals.
5. **The calendar/help hooks are set on `lightning-input` and `lightning-helptext`**, which also contain popups; section 5 checks the open date picker and help bubble for leakage, and any leak is fixed before the PR is shown.

## 5. Verification (all of this before the PR is shown)

1. Jest: the two new files red then green, then the full suite green through the pre-commit hook.
2. Deploy the branch to `revclouddev` (the two bundles), wait out the Studio's bundle cache, then measure with the cross-host harness on **Studio (Visualforce)**, **Lightning**, and the **public site after a site publish**, never fewer.
3. **State matrix** for radio, checkbox group, single checkbox, toggle, dropdown, date input and help icon: default, hover, focus, checked or selected, disabled, invalid, dropdown open, date picker open, help bubble open. Themes: Editorial Ivory (light), Dracula Dark (dark), and a synthetic mid-tone (slate panel with white text, because no built-in panel is mid-tone).
4. **Side-effect diff:** set each new hook to a loud colour and compare the computed colour, background, border and fill of **every descendant** of the widget (open popups included) with the baseline. Anything that moves besides the intended target is explained or fixed.
5. **Contrast of each target in each state** against its real background: text at least 4.5 : 1, icons and borders at least 3 : 1 (disabled exempt, but must still look different).
6. **Unmodified end-to-end test (audit test B):** one disposable form (kitchen sink, Dracula Dark, default comfortable density) created through the Studio's Import and published through the normal Publish, site published, then measured on the public site and in Lightning with no spec patching. Its exact name and ids are given in chat when it is created, and again when it is removed.
7. Before and after pictures of the dark theme on all three hosts for the owner.

## 6. Seen in passing, not touched (not on the approved list)

- **Secondary text (`textWeak`) is under 4.5 : 1 on its own panel in four themes:** Dracula Dark 3.03, Tokyo Midnight 3.56, Retro Terminal 4.19, Amber Terminal Stepper 3.66. Captions, help text and placeholders use it.
- **The lookup widget has its own error ink** (`--c-error-ink`, `#ba0517`), so it will keep the old red on dark themes.
- Neither is changed here; each would need its own go.

## 7. Stage 2 (details filled in before it starts)

Spacing (B1, B2): neutralise the 16 px the public site adds under platform widgets, with an explicit selector list or a shared class, after finding the exact rule and its specificity on the public site. Invalid styling (B4): text area and dropdown get the same red border as text boxes (today `.has-errors lightning-textarea` sets the input hook, but the text area reads `--slds-c-textarea-color-border`; the dropdown has no rule), and radio and checkbox groups get a group outline in the error colour. Same verification protocol as section 5, plus the field-pitch and error-distance measurements from the audit (3B).
