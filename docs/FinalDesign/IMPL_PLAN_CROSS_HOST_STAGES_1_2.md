# Build plan: cross-host legibility (stage 1), then spacing and errors (stage 2)

**Status:** IN BUILD, stage 1 first. The owner said yes to the go order on 2026-10-10 ("yes to #1 and #2"), which also approved one disposable form for the unmodified end-to-end test. Stage 3 is **not** started (decisions 3 to 5 in the audit are still open). This plan is the file-by-file trace of stages 1 and 2. Delete or fold it into the catalog after ship.

**Spec (every number and the reasons):** `docs/FinalDesign/qa/CROSS_HOST_RENDER_AUDIT_2026-10-10.md`, sections 3A, 3B, 5 and 6.

**Branches:** `fix/legibility-stage1`, then `fix/spacing-errors-stage2`. Each opens a PR and is **not merged** until the owner has looked at the deployed result: both change how already-published forms look after the next site publish (stage 1 mostly on dark themes, stage 2 on the public site's spacing).

**Not in this work:** stage 3 (narrow-form sizing), the Studio's Mobile frame, rich text, refreshing older published forms' stored themes (they keep their stored colours; shared CSS still reaches them after a site publish), and the items in section 6.

---

## 1. Stage 1 in plain words

1. **Eleven built-in dark themes draw our red error message, required marker and invalid border at 1.7 to 2.5 : 1** (text needs 4.5 : 1, borders 3 : 1). They get a lighter red from the theme data. The 21 light themes already pass and are not touched. Neon Nights keeps its own hot pink, nudged just enough to pass.
2. **The platform paints the dropdown's text and three small icons (help, calendar, dropdown arrow) in fixed greys or brand blue** that no inherited colour reaches. Text is pointed at the theme's text colour through the styling hook each host reads. Icons are pointed at a new mid-grey ink the engine emits only on dark themes (section 2.2 explains why not the text colour).
3. **Radio and checkbox option text is the same story** (a fixed dark grey on every host). Same fix, one hook name per host family.
4. **Two states the first measurement run showed my fix would break** are handled too: the help icon's hover/focus colour (a dark navy that vanishes on a dark theme) and a disabled dropdown (the platform keeps its box light grey, so light text on it disappears). See section 8.

## 2. File by file

### 2.1 `force-app/main/default/lwc/finalThemeCatalog/finalThemeCatalog.js` (data only)

- A commit of its own first formats the file with prettier (it was written as compact rows, which the pre-commit hook rewrites on any edit). Proven mechanical: `getBuiltinTheme`, `listBuiltinThemes`, `getBrandCopy` and `resolveTokens` are identical for all 32 themes before and after.
- New constant above `THEMES`: `const ERROR_ON_DARK = '#ff8a80';` with a comment saying why, the thresholds, and that it clears 4.5 : 1 on the lightest dark panel's 8 % text tint with headroom.
- Ten dark themes get `fieldStates: { error: ERROR_ON_DARK, required: ERROR_ON_DARK }`: `dracula`, `tokyo`, `terminal`, `mintStepper`, `retroStepper`, `cyberSplit`, `auraSplit`, `carbonMatrix`, `cosmicVortex`, `auroraBorealis`. The engine merges `fieldStates` key by key, so `focus` stays derived from the accent.
- `neonNights` (bespoke hues kept): `fieldStates.error` `#ff5470` to `#ff617b`, `required` `#ff2e93` to `#ff59a9`. Smallest lift (same hue) that clears 4.5 : 1 on its panel tint with 0.3 headroom for the translucent glass.

Nothing else reads the old values: every consumer already reads the tokens `--c-field-error` and `--c-field-required` (`finalElementRenderer.css`, `finalFormViewer.css`, `finalSubmitBar.css`, `finalSectionRenderer.css`), so one data change recolours the message, the marker, the invalid border, the error banner and the submit-bar message together.

### 2.2 `force-app/main/default/lwc/finalThemeEngine/finalThemeEngine.js` (one derived token)

- New conditional token **`--c-icon`** = `#8d8d8d`, emitted only when `isDarkSurface(pal)`; `null` otherwise (the engine's existing guard drops it). No setting, no editor control, so no orphan.
- Why a token and not the text colour: the same icons also sit in the platform's fixed-white popups (the date picker's prev/next arrows, the dropdown list's check mark) and on the white box a focused dropdown turns into on the public site. The first deploy proved it: with the text colour, those arrows measured 1.07 : 1 on the popup. One mid grey clears 3 : 1 on the dark field (3.6 : 1 on the lightest dark field fill) and on white (3.3 : 1).
- Light themes emit nothing; the CSS hooks that read it become invalid and fall back to the platform's own icon colours, which already pass there.
- Contract event: appended to `CONTRACT_V1` and to both "conditional" lists in `finalThemeEngine.test.js`. The full-theme snapshot is the light Editorial Ivory theme, so it does not change.

### 2.3 `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.css`

Hook names found by setting each candidate to red on the widget host of the real form (dark theme, all three host families), then re-found per state; see section 3.

1. Colour rule on `.field lightning-radio-group, .field lightning-checkbox-group`: `--slds-g-color-on-surface-2`, `--slds-g-color-neutral-base-30`, `--dxp-s-form-element-label-color`, all `var(--c-text)`.
2. `.field lightning-combobox`: `--slds-g-color-neutral-base-50: var(--c-text)` (dropdown text on the Studio and the public site; Lightning already follows `--slds-c-input-text-color`, which `:host` sets) and `--slds-c-icon-color-foreground-default: var(--c-icon)` (the arrow).
3. `.field-readonly lightning-combobox` (later in the cascade): `--slds-g-color-neutral-base-50: #6b6b6b`. The platform keeps a disabled dropdown on a light-grey box in every theme, so light text there measured 1.04 : 1.
4. `.field lightning-input, .field-label-row lightning-helptext`: `--slds-c-icon-color-foreground` (help and calendar icons at rest), `--slds-c-button-text-color-hover` and `--sds-c-button-text-color-hover` (hover and focus on Lightning and the Studio), all `var(--c-icon)`.
5. `.field-label-row lightning-helptext`: `--dxp-g-neutral-3: var(--c-icon)` (the public site colours the help icon's hover and focus from this one).
6. The dead rule `.field-label-row lightning-helptext { --slds-c-icon-color-foreground-default: ... }` is removed (it moved nothing on any host).
7. Comment block above the rules: why they sit on the widgets and not on `.field`, the table of hooks per host, and why icons use `--c-icon`.

### 2.4 `force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.js`

`fieldClass` adds the modifier `field-readonly` when `el.readOnly` (the property the template already maps to `disabled` on the dropdown, radio and checkbox groups). It is the only way CSS can tell a disabled dropdown from an enabled one: the platform does not reflect `disabled` onto the host element.

### 2.5 Tests (written first, watched failing)

- `finalElementRenderer/__tests__/hostColourHooks.test.js` (new): reads the real stylesheet (same style as `typeScale.test.js`) and pins every hook above on the right selector, that icon hooks read `--c-icon` and never the text colour, that the disabled-dropdown rule exists and comes after the enabled one, that the dead helptext hook is gone, and that none of the colour hooks sit on `.field`.
- `finalThemeCatalog/__tests__/stateInkContrast.test.js` (new): for all 32 built-in themes, error and required inks clear 4.5 : 1 on the panel and on the panel plus 8 % text tint, the error ink clears 3 : 1 on the field fill, and the icon ink is present exactly on dark panels and clears 3 : 1 on the field fill and on white. Glass panels are composited over the page colour and get 0.3 headroom. This is the tripwire that keeps a future dark theme from shipping the default red.
- `finalThemeEngine/__tests__/iconInk.test.js` (new) and the contract lists in `finalThemeEngine.test.js`: the token is emitted on dark surfaces (including a dark override on a light theme and glass panels) and not on light ones.
- `finalElementRenderer/__tests__/finalElementRenderer.test.js`: a read-only dropdown carries `field-readonly`, an editable one does not.

### 2.6 Not touched

The HTML, the viewer, the lookup, Apex. Published forms keep their baked values.

## 3. Hook table (measured on the deployed form, dark theme, 2026-10-10 and 2026-10-11)

| Target | Lightning (slds-plus) | Studio (Visualforce, Lightning Out) | Public site |
|---|---|---|---|
| Radio or checkbox option text | `--slds-g-color-on-surface-2` | `--slds-g-color-neutral-base-30` | `--dxp-s-form-element-label-color` |
| Dropdown text | `--slds-c-input-text-color` (already set on `:host`) | `--slds-g-color-neutral-base-50` | `--slds-g-color-neutral-base-50` |
| Dropdown arrow | `--slds-c-icon-color-foreground-default` | same | same |
| Help (i) icon, resting | `--slds-c-icon-color-foreground` | same | same |
| Help icon, hover and focus | `--slds-c-button-text-color-hover` | `--slds-c-button-text-color-hover` (also spelt `--sds-...`) | `--dxp-g-neutral-3` |
| Calendar icon, resting | `--slds-c-icon-color-foreground` | same | same |
| Calendar icon, hover | `--slds-c-button-text-color-hover` | follows the resting hook | follows the resting hook |
| Disabled dropdown box | no hook (fixed light grey, Studio and public) | | |

Today's colours these replace: dropdown text grey 116,116,116 (Studio, public); help and calendar icons brand blue 2,80,217 (Lightning), grey 116,116,116 (Studio), 118,113,107 (public); arrow 92,92,92 / 116,116,116 / 118,113,107; hover and focus on the help icon dark navy 3,35,77 (Lightning) and 1,68,134 (Studio).

## 4. Calls I made (veto any)

1. **One shared red for the ten dark themes** (`#ff8a80`, Material red A100) instead of ten hand-tuned values. The smallest passing red differs per theme (`#e3382c` on pure black up to `#ee877f` on slate); one value that clears the strictest keeps every dark theme's errors looking alike. Cost: pastel on the black themes.
2. **Text uses the theme's full text colour, not its weak colour.** The weak colour is under 3 : 1 on four dark themes.
3. **Icons use one mid grey (`#8d8d8d`) on dark themes, so they are quieter than the text** and have no hover brightening there (hover and focus show the same grey; the platform's own hover was a navy that disappeared). On light themes nothing changes.
4. **Only built-in themes are fixed.** A custom dark palette built on a light theme keeps the default red until its author changes it (the theme editor shows the contrast number). An engine rule that nudges any failing colour would override authored choices, so I did not add one. (The icon ink is different: it is derived from the surface, so it does follow a custom dark palette.)
5. **Neon Nights' two colours move a few percent lighter** (it is a pixel port of the owner's exploration 04). Easy to revert if the owner prefers the exact originals.
6. **A disabled dropdown's text is a fixed `#6b6b6b`**, because the box it sits on is a fixed light grey in every theme.

## 5. Verification (all of this before the PR is shown)

1. Jest: the new files red then green, then the full suite green through the pre-commit hook.
2. Deploy the branch to `revclouddev`, then measure with the cross-host harness on **Studio (Visualforce)**, **Lightning**, and the **public site after a site publish**, never fewer.
3. **State matrix** for radio, checkbox group, single checkbox, toggle, dropdown, date input and help icon: default, hover, focus, checked or selected, disabled, dropdown open, date picker open, help bubble open. Themes: Editorial Ivory (light), Dracula Dark (dark), and a synthetic mid-tone (slate panel with white text, because no built-in panel is mid-tone). Each target against its **real** background (ancestors composited through the slots), text at least 4.5 : 1, icons at least 3 : 1; disabled exempt but must stay legible.
4. **Side-effect diff:** every hook forced to `initial` on the widget host versus as deployed, every descendant's computed colour, background, border and fill, popups open. Anything that moves besides the intended target is explained or fixed.
5. **Error colours:** the `errorsDark` and `errors` scenarios on all three hosts (message, marker, invalid border).
6. **Unmodified end-to-end test (audit test B):** one disposable form (kitchen sink, Dracula Dark, default comfortable density) created through the product's Import and published through the Studio's Publish screen (the theme snapshot is baked by the Studio's JavaScript at that moment, so a server shortcut would skip the very thing under test), site published, then measured on the public site and in Lightning with no spec patching. Its exact name and ids are given in chat when it is created, and again when it is removed.
7. Before and after pictures of the dark theme on all three hosts for the owner.

## 6. Seen in passing, not touched (not on the approved list)

- **Secondary text (`textWeak`) is under 4.5 : 1 on its own panel in four themes:** Dracula Dark 3.03, Tokyo Midnight 3.56, Retro Terminal 4.19, Amber Terminal Stepper 3.66. Captions, help text and placeholders use it.
- **Field boundaries are faint on the light theme too:** the dropdown's border measures 1.9 : 1 on Editorial Ivory on every host and the off toggle's track 1.4 : 1 (WCAG asks 3 : 1 for the edge that identifies a control). They are the platform's and the theme's hairline design, unchanged by stage 1.
- **The lookup widget has its own error ink** (`--c-error-ink`, `#ba0517`), so it will keep the old red on dark themes.
- None of these is changed here; each would need its own go.

## 7. Stage 2 (details filled in before it starts)

Spacing (B1, B2): neutralise the 16 px the public site adds under platform widgets, with an explicit selector list or a shared class, after finding the exact rule and its specificity on the public site. Invalid styling (B4): text area and dropdown get the same red border as text boxes (today `.has-errors lightning-textarea` sets the input hook, but the text area reads `--slds-c-textarea-color-border`; the dropdown has no rule), and radio and checkbox groups get a group outline in the error colour. Same verification protocol as section 5, plus the field-pitch and error-distance measurements from the audit (3B).

## 8. What the first measurement run found (2026-10-11), and what changed

The first deploy used the text colour for the icons and one dropdown-text rule for every state. The state matrix and the side-effect diff, run on all three hosts, caught three things the headline numbers hid:

| Found | Where | Fix |
|---|---|---|
| The date picker's prev/next arrows (and the dropdown list's check mark) turned near-white on the platform's white popup, 1.07 : 1 | all three hosts | icons read `--c-icon` (a mid grey that works on dark and on white), section 2.2 |
| The help icon's hover and focus stayed the platform's dark navy, 1.09 to 1.47 : 1 on a dark theme (Lightning and Studio) or the old grey 2.95 : 1 (public) | all three hosts | per-host hover and focus hooks, section 2.3 items 4 and 5 |
| A disabled dropdown showed near-white text on the platform's light-grey box, 1.04 : 1 (it had been readable before my change) | Studio and public | `field-readonly` class and a dark ink, sections 2.3 item 3 and 2.4 |

The headline fixes held in every state and on every host: option text 1.05 / 1.21 / 1.46 to 13.4 : 1, dropdown text 2.54 to 11.1 : 1, icons at rest 2.1 to 3.0 to 13.4 : 1 (before the icon ink was introduced).
