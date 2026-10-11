# Stage 3, slice S0: can the platform's own controls be made bigger on a phone?

Probe run 2026-10-11 against the dev org (`revclouddev`), read-only: nothing was clicked, saved or published. The same kitchen-sink form was loaded in memory on the public site (390 px phone), the Lightning viewer (390 px) and the Studio preview (Visualforce), and for every platform control we asked two questions: how big is the thing a finger has to hit, and does any styling hook (a CSS custom property the platform reads) make it bigger?

## 1. The plain answer

**No single hook works on all three hosts, and for the choice controls no host has one at all.** So a phone-sized (44 px) version of these controls cannot be switched on from our stylesheet and look the same everywhere. That is the situation the plan called decision 6, so this report ends with the options and a recommendation. Nothing in slices S1 (padding), S2 (our own controls) or S4 (the standing test) depends on it.

One fact worth knowing before anything else: the text box height hook we already set (`--slds-c-input-sizing-height: var(--c-control-h)`) does **nothing on any host**. Text boxes are 32 px tall at both densities. The density setting only ever sized our own controls.

## 2. How big each control is today (identical on all three hosts)

| Control | What a finger has to hit | Notes |
| --- | --- | --- |
| Text box, date box, dropdown | the whole box: full width x **32 px** | width is never the problem, height is |
| Text area | full width x 66 px | already fine |
| Radio / checkbox option | its label: text-wide x **21 px**; the rows sit **26 px** apart | the label covers the round or square box and the words |
| Single checkbox | **24 x 21 px** box (the words next to it are our own label, which already forwards the tap) | |
| Toggle | the row is 24 px tall, the switch itself 48 x 24 | |
| Help (i) button | **16 x 16 px** | |
| Calendar button (inside a date box) | **16 x 16 px** (Lightning and Studio; the public site uses the phone's own date control, no button) | |

## 3. Which host has a hook that grows it

"Yes" means setting that custom property on the field made the control's own box bigger, one pixel for one pixel (measured by setting 48 px and reading the box back).

| Control | Public site | Studio (Visualforce) | Lightning viewer |
| --- | --- | --- | --- |
| Text box, date box | **yes**: `--dxp-s-form-element-spacing-block-start` and `-end` (the padding) | **yes**: `--lwc-heightInput` | **none found** |
| Dropdown | **yes**: the same two `--dxp-s-form-element-spacing-block-*` | **yes**: `--lwc-heightInput` | **none found** |
| Text area | yes (`--slds-c-textarea-spacing-block-*`) | yes (same) | yes (same) |
| Radio / checkbox option | **none** (only the text size moves it) | **none** (only width) | **none** (only width and text size) |
| Single checkbox | **none** | **none** | **none** |
| Toggle | none | `--lwc-heightToggle` | `--slds-g-sizing-7` (a global size token, too blunt to use) |
| Help (i) button | yes (`--dxp-s-button-padding-block-*`, or `--slds-c-button-spacing-*`) | yes (`--slds-c-button-spacing-*`) | **none found** |
| Calendar button | not applicable | yes (`--slds-c-button-spacing-*`) | **none found** |

Method: every custom property named in the page's readable stylesheets that looks size-related (785 on the public site, 664 on Studio, 295 in Lightning), plus a list of hook names from the platform's documentation, was set one at a time on the control's host; any property that changed the control's box was recorded. Raw results: `xh/psz-*-probe.json` in the session's scratch folder; the script is `xhost-probe-size.mjs`.

Why the hosts differ: the public site is styled by Experience Cloud's own theme layer (`--dxp-*`), the Studio preview runs on the classic Lightning Design System (`--lwc-*`), and the Lightning viewer runs on the newer one (`--slds-g-*`), which publishes far fewer per-control hooks.

## 4. What the accessibility rules say

By my reading of WCAG 2.2, success criterion 2.5.8 (Target Size, Minimum, level AA): a target should be at least 24 x 24 px, **unless** it sits far enough from its neighbours that a 24 px circle drawn on it touches no other target. Option rows 26 px apart satisfy that, and so do the isolated 16 px buttons. So these controls pass the AA rule through its spacing exception. They do **not** meet the stricter 44 x 44 px guideline (WCAG 2.5.5, and the Apple and Material recommendations). That is a comfort gap on a phone, not a failure.

## 5. The options for decision 6 (owner's call)

1. **Leave the platform's controls as they are, everywhere (recommended for now).** Every host stays identical, which is the rule that matters most. Our own controls (scales, chips, cards, yes/no, buttons) all reach 44 px in slice S2, and anyone who wants big tap targets for choices can already pick the Chips or Cards style, which are our own 44 to 46 px controls. Cost: radios and checkboxes stay 21 px rows.
2. **Grow what each host allows.** Text box, dropdown, date box and help button get taller on the public site and in Studio; Lightning stays 32 px. Cost: the three hosts then differ, in the direction the owner has said they do not want.
3. **Draw the choice controls ourselves** (radio rows, checkbox rows, toggle, help button): 44 px rows, identical everywhere, and the per-host text-size and colour hooks from stages 1 and 2 stop being needed. Cost: a real project (keyboard, screen-reader, error and "Other" behaviour all have to be rebuilt and tested); the plan parked it on purpose.
4. **On a phone only, show radio and checkbox groups in our Cards style automatically.** Big rows without building anything new. Cost: every existing form's choices change look on a phone.

Recommendation: **1 now**, and **3 as its own later stage** if the owner wants 44 px everywhere.

## 6. Side findings

- The words next to a single checkbox or toggle are already tappable: our label forwards the tap (`handleLabelClick`). The same label tap focuses text boxes, text areas and dropdowns, which widens their effective target upward by the label's 21 px.
- The text box's 32 px comes from the platform's `.slds-input` rule on every host (not density, not our hook).
