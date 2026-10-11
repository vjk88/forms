# Cross-host render audit — does a form look and behave the same in the Studio preview, inside Salesforce and on the public site?

**Date:** 2026-10-10 · **Status:** findings and a plan. Owner's go on 2026-10-10 for stage 1, then stage 2 (and one disposable form for test B); **stage 1 is in build** on branch `fix/legibility-stage1` (file-by-file trace in `docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md`); stage 3 is not started, decisions 3 to 5 are still open · **Revised three times** the same day after reviews (section 0)

**The question (owner):** "preview and actual form should display the same sizes. Is there anything else in the UI rendering that works differently in preview / actual form / public site?"

## 0. Review feedback and what changed

### Round 1

| # | Review point | Disposition | What changed here |
|---|---|---|---|
| 1 | The dropdown's 3.05 : 1 is not "Low": it fails for ordinary text. Group it with the dark-theme choice fix. | **Accepted.** | Dropdown text is graded High and sits in group A with the choice-text fix. Recomputed against the field's real background it is **2.54 : 1**, not 3.05; on a light theme the same grey is 4.67 : 1, so it passes only by a hair. The calendar and help icons are graded against the 3 : 1 non-text rule. |
| 2 | Keep the platform controls for now; accept native mobile date pickers; fix the preview's content-width accuracy separately. A different picker look is not a defect. | **Accepted.** | "Draw radios, checkboxes, dropdown and date ourselves" is parked (section 7). The phone date box is an accepted, documented difference. The Studio's Mobile preview width is its own item (3E). |
| 3 | Make the CSS exact: `.field > lightning-*` is not valid. Scope colour hooks to the affected controls and check selected, disabled, invalid and focused states. Turning text red proves a hook influences it, not that overriding it has no other effects. | **Accepted.** | The plan names a shared class (or an explicit selector list); every hook change must pass a state matrix plus a side-effect check that diffs every descendant (section 5, stages 1 and 2). |
| 4 | Test intended consistency, not every pixel; compare at the same content width; allow documented differences. | **Accepted.** | Section 6 is a parity contract with an allow-list. |
| 5 | Add the live-review issues: 32 px inputs, 34 px ranking buttons, five-point ratings wrapping at 320 px. | **Accepted and verified.** | Group C. All three reproduce on every host I measured. |
| 6 | Keep one unmodified end-to-end test of a freshly published form. | **Accepted.** | Section 6, test B. It needs your OK to create and publish a disposable form. |

### Round 2

| # | Review point | Disposition | What changed here |
|---|---|---|---|
| 1 | The mobile sizing targets conflict: five 44 px buttons need 220 px before gaps, so trimming gaps cannot fit a 202 px column. Keep compact desktop density, use at least 44 px touch targets on mobile, recover width by reducing nested horizontal padding, and define a separate layout for the eleven-point scale. | **Accepted, and it exposed a wrong number of mine.** | Stage 3 is rewritten around that recommendation. Correction: the gap between the survey buttons is 6 px in compact density (8 px in comfortable), so five 36 px buttons need **204 px** (I had written about 212 px); at 44 px they need **236 px** even with 4 px gaps. The padding stack was measured (3C). The emoji scale (60 px buttons) and the 0 to 10 scale are separate items. Round 3 corrected a further assumption in this row's first version: it said 44 px buttons already fit at 390 px everywhere, which was true only in compact density. |
| 2 | Move error styling earlier: the text area and dropdown invalid borders go into stage 2 with error placement; dark-theme error-text and required-marker contrast leave "Parked" and go into stage 1. | **Accepted, and measured.** | The invalid borders moved to stage 2. The dark-theme numbers were not measured before; now they are, on all three hosts: error text and required marker **2.17 : 1**, invalid text-box border **1.80 : 1** (A5 to A7). |
| 3 | Model the preview's viewport and page margins separately: keep a 390 px device frame, apply the host's margins inside it, do not hard-code "360 px form"; the 320 px option is useful. | **Accepted.** | 3E and stage 5 rewritten (the 360 px figure was only a measurement on one host). |
| 4 | Make the test contract precise: exact font family and weight, tolerances for sizes only, contrast must meet a threshold rather than match, separate expectations for disabled controls, compare field heights only where wrapping and structure are equivalent. | **Accepted.** | Section 6 table rewritten, one rule type per row. |
| 5 | Remove contradictory wording: "everything we draw ourselves is identical" conflicts with the ranking-button padding; "leave older published forms alone" should say "don't refresh their baked themes; shared CSS fixes still affect them". | **Accepted.** | Headline, 3D, 4.1, sections 5 and 7 reworded. |

### Round 3

| # | Review point | Disposition | What changed here |
|---|---|---|---|
| 0 | "The plan is solid. Stages 1–2 are ready to implement." | **Plan accepted, not started.** Building needs your go: stage 2 changes how existing public forms look once the site is published. | Nothing built. Section 9 is now the one decision list. |
| 1 | Recovering mobile width must work with both open sections and deliberately authored cards. Removing default section cards (S1) can help but must not be the only solution. | **Accepted, and the numbers agree.** With no section card at all the public site is still 4 px short at 320 px (232 px of answer column against the 236 px needed). | Stage 3, item 2: a rule plus a padding budget that cuts all three layers and has to pass with cards and with open sections. S1 is optional help, not a dependency. |
| 2 | Specify the eleven-point layout instead of leaving examples: 4 + 4 + 3 on narrow answer columns, 6 + 5 once 284 px is available, 44 px targets, 4 px gaps, captions attached clearly to the low and high ends. | **Accepted.** | Stage 3, item 5: a table by answer-column width, plus a caption rule (today the captions sit in a row below the buttons, so a wrapped scale would put the "low" caption under the wrong button). |
| 3 | Test at real public-site widths of 320, 360 and 390 px, both densities, open and card sections, and the five-point, emoji and eleven-point scales. Equal-width host comparisons cannot catch a problem every host shares. | **Accepted, and it already earned its keep.** Measuring both densities showed my phone numbers so far were **compact only**, while all 32 built-in themes default to comfortable. The default case is worse than I had reported (3C). | Test C (section 6). Group C rewritten with measured tables W and T. |
| 4 | Touch targets: explicitly include platform inputs, dropdowns, radio and checkbox options, toggles, help and calendar buttons; measure the clickable area including clickable labels, not just the visible icon. | **Accepted and measured.** The help and calendar buttons are 16 × 16 px and a radio option is 21 px high. Whether the platform lets us enlarge them is not known yet. | C7 and table T. Stage 3 starts with a probe (item 0); decision 6 in section 9 covers what to do if the probe fails. |
| 5 | Six small corrections. | **All applied:** (a) "narrow form" replaces "phone step" for the 540 px rule; (b) the native date box now reads "the current preview does not reproduce it" (3D, item 1); (c) disabled-control focus is tested per control type (section 6); (d) a letter-spacing tolerance, ±0.1 px, is added (my pick, section 9); (e) the S1 link points at `../specs/LAYOUT_CLEANLINESS_RECOMMENDATIONS.md`; (f) the unresolved stage-3 decisions moved into section 9. | See those places. |
| 6 | Keep the agreed scope: current font scale, platform controls, native mobile date pickers, deferred rich-text styling, no refresh of older baked themes. | **Confirmed.** | The "Decided" line in section 5 lists all five. |

## 1. How it was measured

One form, rendered in four places, with the browser edited **in memory only**. Nothing was saved, every save request from the Studio was blocked and none was attempted, and Submit was never clicked.

| Short name | Where it is | Platform stylesheet it runs on |
|---|---|---|
| **Studio preview** | the Studio page (`/apex/FinalStudio`, a Visualforce page running the app through Lightning Out) | Salesforce's older ("classic") design system |
| **Studio in Lightning** | the same Studio opened as a Lightning tab (`/lightning/n/Final_Studio`) | Lightning's newer design system |
| **Actual form in Lightning** | the viewer tab (`/lightning/n/Final_P0_Test`), how internal users see a form | Lightning's newer design system |
| **Public site** | the guest site (`my.site.com/form?formId=…`), signed out | the older design system plus the site theme |

The form used the Editorial Ivory theme (and Dracula Dark for the dark passes) with a "kitchen sink" page of every element type. Every visible text, control, icon and image was measured and compared host against host with the public site as the reference. Extra passes: phone width (390, 360 and 320), One at a time, dark theme (including validation errors), custom brand font, validation errors, open dropdown, keyboard focus, clickable areas.

**Density.** The test form's theme carries an override to **compact** density, but all 32 built-in themes default to **comfortable**. Anything about sizes, spacing or wrapping on narrow forms (group C) is therefore measured in both. The colour and host-difference findings (3A, 3B) were measured in compact and do not depend on it.

**Limitation.** A published form stores its theme as baked values that win over the theme name. The comparison removed them so every host resolves the same theme from the same code. That isolates host differences but **does not exercise the real publish path**; no freshly published form has been measured yet (section 6, test B).

## 2. Headline

**Almost everything we draw ourselves is identical on every host**: labels, titles, section headings, theme colours, chips, cards, slider, the survey questions, matrix, images we can load; no blocked or failed requests; identical tab order. **The one exception found is our ranking arrow buttons**, which inherit the host's default button padding (0 in Lightning, 1 px / 6 px elsewhere). **Every other host difference is something the Salesforce platform draws**: text boxes, text area, dropdown, radios, checkboxes, toggle, date picker, help icon, rich text.

The hosts fall into two families: *Actual form in Lightning* and *Studio in Lightning* behave identically to each other; *Studio preview* and *Public site* behave almost identically to each other. So the Studio preview predicts the public site better than the actual form inside Salesforce does.

Separately, some problems exist **even though every host agrees**: dark-theme legibility of our own error colour (A5 to A7) and narrow-form usability (group C).

## 3. Findings

### 3A. Legibility: fix first (accessibility failures)

Thresholds: ordinary text needs **4.5 : 1** (WCAG 2.1 SC 1.4.3); icons, control boundaries and other interface parts needed to understand the form need **3 : 1** (SC 1.4.11). Our own labels on the same dark card measure 13.4 : 1.

| # | What a person sees | Studio preview | Lightning | Public site | Grade |
|---|---|---|---|---|---|
| A1 | **Radio and checkbox choices on a dark theme are unreadable.** The platform draws their text in a fixed dark grey, not the theme text colour. Dracula Dark, against the card: | 1.46 : 1 | 1.05 : 1 | 1.21 : 1 | **Serious.** 11 of the 32 built-in themes, all the dark ones: Dracula Dark, Tokyo Midnight, Retro Terminal, Neo-Mint Stepper, Amber Terminal Stepper, Cyber Midnight Split-Hero, Bioluminescent Split, Carbon Matrix, Cosmic Vortex, Northern Lights, Neon Nights |
| A2 | **Dropdown text on a dark theme** (placeholder and selected value), against the field's own background (rgb 53,55,66). Fails even the 3 : 1 large-text bar. On the light Ivory theme the same grey is 4.67 : 1 (passes narrowly); Lightning's own colour is fine on both. | 2.54 : 1 | 11.1 : 1 (fine) | 2.54 : 1 | **High** |
| A3 | **Calendar icon** against the input (3 : 1 needed) | 2.54 : 1 | 1.78 : 1 | 2.45 : 1 | **High** |
| A4 | **Help (i) icon** against the card. It is the only way to read a field's help text. | 3.05 : 1 | 2.14 : 1 | 2.95 : 1 | **Medium to high** |
| A5 | **Error message text on a dark theme.** Our own red (#b42318) is not adapted per theme. Against the dark card (6.5 : 1 on the light Ivory card): | 2.17 : 1 | 2.17 : 1 | 2.17 : 1 | **High** |
| A6 | **Required marker (\*) on a dark theme.** Same red, it is text. | 2.17 : 1 | 2.17 : 1 | 2.17 : 1 | **High** |
| A7 | **Invalid text-box border on a dark theme** (3 : 1 needed; 6.6 : 1 on the light theme). The text area and dropdown do not turn red at all (B4); their normal border is 2.13 : 1 against the field. | 1.80 : 1 | 1.80 : 1 | 1.80 : 1 | **High** |

A5 to A7 are our own colours, so they are a theme-engine fix (an accessible error colour per theme), not a platform-hook fix. None of the 49 published versions in this dev org combine a dark theme with platform radio or checkbox questions today, so A1 is a trap for the next author rather than live damage here; the error colours (A5 to A7) hit every required field on any dark theme. The icon colour does not follow the theme on any host: the colour was identical on Editorial Ivory and Dracula Dark (public rgb 118,113,107, Lightning rgb 2,80,217, Studio rgb 116,116,116), even though our CSS sets it from `--c-text-weak`.

**Hooks found for the choice-text colour** (set to red on the radio group host and the option text turned red): Lightning `--slds-g-color-on-surface-2`, Studio preview `--slds-g-color-neutral-base-30`, public site `--dxp-s-form-element-label-color`. This proves the hook influences the text, not that overriding it is safe: all three are shared colour tokens, so stage 1 must check what else changes.

### 3B. Consistency: fix second (host differences that matter)

| # | What a person sees | Studio preview | Lightning | Public site | Grade |
|---|---|---|---|---|---|
| B1 | **Space between fields.** Every field built on a platform widget (text, email, phone, number, URL, date, text area, dropdown, radio group, checkbox group, single checkbox, toggle) is 16 px taller on the public site: the site gives the platform's wrapper `margin-bottom: 16px`; Lightning and the Studio give 0. On the test page: 14 fields, +224 px (+11 %); a 7-field One at a time page: +112 px (570 vs 458). Fields we draw ourselves differ by 0. | 56.8 px per text field | 56.8 px | **72.8 px** | High. The preview understates the public form's length |
| B2 | **Where an error message sits.** Same margin: on the public site the message is 22 px below its own box and 12 px above the next field's label, so it reads as belonging to the next field. In the Studio and Lightning it is 6 px under its own box. | 6 px | 6 px | **22 px** | High (same cause as B1) |
| B3 | **Brand font in typed text.** With a custom brand font, labels and titles use it everywhere, but text typed into a text box stays in the system font on the public site only. The font file itself loads on every host. | brand font | brand font | system font | Medium (only forms with a custom font) |
| B4 | **Error border.** When validation fails the red border appears on the text, email, number and date boxes, but not on the text area or the dropdown; radio and checkbox groups show only the message. Identical on all hosts, so this is an inconsistency inside every host. | same | same | same | Medium. Fixed together with B2 (stage 2) |
| B5 | **Keyboard focus ring.** Themed teal on text boxes, text area, chips, cards and survey buttons everywhere. The dropdown and calendar button get the platform's blue (a different blue per host); radios, checkboxes and the toggle get the browser default outline. Tab order is identical on every host (40 of 40 stops). | same | same | same | Low |

**3B-1 scope.** These are CSS fixes. CSS is delivered with the site bundle, so after a site publish they reach existing published forms too (a form published last month would get the tighter spacing). Only the baked theme values stay frozen.

### 3C. Usability: independent of the host

All of this is identical on every host, so a host comparison never finds it. Three terms used from here on:

- **Narrow form**: the form itself is 540 px wide or narrower. This is the existing `final-form-viewport` rule in `finalPageFrame.css`, which the code already labels "Narrow form". It is about the form's width, not the device: a phone, a narrow Lightning region and a desktop side panel all trigger it.
- **Answer column**: the width left for answers inside the nested cards (the padding stack below).
- **Density**: every one of the 32 built-in themes defaults to *comfortable*; *compact* is an author's override. My test form carried that override, so the first rounds of this document had compact numbers only, which understate the default case. Everything below is measured in both.

| # | What a person sees | Measured | Grade |
|---|---|---|---|
| C1 | **Text boxes and dropdowns are 32 px high** on every host, at both densities. Our own controls follow the density (survey buttons 36 px compact, 44 px comfortable; chips 42 / 44; cards and yes/no 46). The code already maps the density's control height onto the platform input (`--slds-c-input-sizing-height: var(--c-control-h)`, 36 px compact, 44 px comfortable), but that setting has no effect on any of the three platform stylesheets. | 32 px (public, Lightning, Studio; both densities) | Medium to high on narrow forms (44 px is the usual touch minimum; WCAG 2.2 AA asks 24 px) |
| C2 | **Ranking arrows (▲ ▼) are 34 × 34 px** on every host and at both densities. | 34 × 34 | Medium on narrow forms |
| C3 | **A five-point scale (stars, numbers) ends with a lonely button.** In the default comfortable density it breaks 4 + 1 at a 360 px screen and 3 + 2 at 320 px; in compact it breaks 4 + 1 at 320 px (table W). The cause is arithmetic. Comfortable buttons are 44 px with 8 px gaps, so five need **252 px**, and the answer column is 230 px at 360 px and 190 px at 320 px. Compact buttons are 36 px with 6 px gaps, so five need **204 px**, and the column is 202 px at 320 px. At the 44 px target with 4 px gaps five buttons need **236 px**, which is more than the column at 320 px (202 / 190) and at 360 px comfortable (230). Trimming gaps alone cannot fix it; width has to come from the padding around the answer column (stage 3). On the public site nothing scrolls sideways at any width measured. | table W | Medium to high |
| C4 | **Emoji scale.** The buttons are 60 × 44 px, so five need 324 px (compact) or 332 px (comfortable), more than any answer column measured. | table W | Medium |
| C5 | **Eleven-point (0 to 10) scale ends with a lone "10".** 5 + 5 + 1 at a 360 px screen in compact and at 390 px in comfortable (the default density on a common iPhone width). At 44 px eleven buttons need 484 px before gaps, so on a narrow form it can never sit on one row; it needs its own layout rule (stage 3), not the five-point fix. | table W | Medium to high |
| C6 | **Survey buttons are 36 px at compact density** (stars, numbered scale, eleven-point), matrix cells 36 px, chips and Likert rows 42 px, Next and Back 36 px: over the WCAG 2.2 minimum, under 44 px. Comfortable is already 44 px for all of these. | 36 compact; 44 comfortable | Low to medium on narrow forms |
| C7 | **The platform's own targets are small, some tiny.** The help (i) and calendar buttons are **16 × 16 px**; a radio or checkbox option is **21 px** high (a single checkbox 24 × 21); the toggle is 24 px, the slider 30 px, the file upload 21 px. These are the clickable boxes (the control's own box plus a clickable label), not the visible icons. | table T | Medium to high on narrow forms |

**Table W. How the survey scales wrap today** (public site, measured; numbers are buttons per row, so a trailing "1" is a lonely button).

| Scale | 320 px compact | 320 px comfortable | 360 px compact | 360 px comfortable | 390 px compact | 390 px comfortable |
|---|---|---|---|---|---|---|
| Five-point (stars, numbers) | 4 + 1 | 3 + 2 | 5 | 4 + 1 | 5 | 5 |
| Emoji | 3 + 2 | 2 + 2 + 1 | 3 + 2 | 3 + 2 | 4 + 1 | 3 + 2 |
| Eleven-point | 4 + 4 + 3 | 3 + 3 + 3 + 2 | 5 + 5 + 1 | 4 + 4 + 3 | 6 + 5 | 5 + 5 + 1 |

**Table W2. The same scales in Lightning and in the Studio's Mobile frame** (measured; Lightning's answer column is 26 px narrower than the public site's because its page margin is 28 px a side against the site's 15, and the Studio frame's is 30 px wider because it has none).

| Host and screen | Density | Five-point | Emoji | Eleven-point |
|---|---|---|---|---|
| Lightning, 390 px | compact | 5 | 3 + 2 | 6 + 5 |
| Lightning, 390 px | comfortable | 4 + 1 | 3 + 2 | 4 + 4 + 3 |
| Lightning, 360 px | compact | 5 | 3 + 2 | 5 + 5 + 1 |
| Lightning, 360 px | comfortable | 4 + 1 | 3 + 2 | 4 + 4 + 3 |
| Lightning, 320 px | compact | 4 + 1 | 2 + 2 + 1 | 4 + 4 + 3 |
| Lightning, 320 px | comfortable | 3 + 2 | 2 + 2 + 1 | 3 + 3 + 3 + 2 |
| Studio Mobile frame, 390 px | compact | 5 | 4 + 1 | 7 + 4 |
| Studio Mobile frame, 390 px | comfortable | 5 | 4 + 1 | 5 + 5 + 1 |

**Table T. Clickable areas today** (measured at a 390 px screen on all three hosts; width × height in px; the platform's controls are the same size in both densities, only ours change with density). The target for a narrow form is 44 × 44.

| Target | Clickable area | Same on all hosts? |
|---|---|---|
| Help (i) button | 16 × 16 | yes |
| Calendar button | 16 × 16 (on phones the public site shows the browser's own date box instead) | yes |
| Text box, dropdown | full width × 32 | yes |
| Text area | full width × 66 | yes |
| Radio or checkbox option (its label) | 112 to 135 wide × 21 | yes |
| Single checkbox | 24 × 21 | yes |
| Toggle | full width × 24 on the public site and in Lightning; **48 × 24 (the switch only) in the Studio** | **no** |
| Slider | full width × 30 | yes |
| File upload | full width × 21 | yes |
| Ranking arrows (ours) | 34 × 34 | yes |
| Survey buttons, matrix cells, chips, Likert rows, Next and Back (ours) | compact: 36 / 36 / 42 / 42 / 36 high; comfortable: 44 high for all | yes |
| Emoji buttons (ours) | 60 × 44 | yes |
| Cards, yes/no (ours) | 46 high | yes |

**Hit-test.** For every target the page was asked what sits under the centre of its clickable box (after scrolling it into view). The answer was the control itself or its label for all 78 targets on the public site at 390 px, all 79 in Lightning and 78 of 79 in the Studio frame. The one exception is the 16 × 16 calendar button: in the Studio frame and on the public site at desktop width the centre lands on the date input underneath, not on the button (on the public site I found the picker only opens by clicking the input). So the button's own box is not a separate, reliable tap target there.

**Padding stack.** Between the screen edge and the answers there are nested layers. They are fixed pixel amounts, not percentages, so the same stack applies at every width. Measured on the public site at 320, 360 and 390 px in both densities, and in Lightning and the Studio frame:

| Layer, outside to inside (per side) | Public site | Lightning | Studio Mobile frame | Ours? |
|---|---|---|---|---|
| The host's own page margin (site: 5 margin + 10 padding; Lightning: its page body; Studio frame: none) | 15 | 28 | 0 | no |
| Page padding (`.page`) | 12 | 12 | 12 | yes |
| The form's card (`.panel`): 1 border + 16 padding | 17 | 17 | 17 | yes |
| A section's card (`.section`): 1 border + 14 padding (compact) or 20 padding (comfortable) | 15 or 21 | 15 or 21 | 15 or 21 | yes |
| **Total per side before the answer column** | **59 compact / 65 comfortable** | **72 / 78** | **44 / 50** | ours: **44 / 50** |

The answer column is the screen width minus twice that total:

| Screen width | Public compact | Public comfortable | Lightning compact | Lightning comfortable | Studio frame compact | Studio frame comfortable |
|---|---|---|---|---|---|---|
| 320 px | 202 | 190 | 176 | 164 | n/a | n/a |
| 360 px | 242 | 230 | 216 | 204 | n/a | n/a |
| 390 px | 272 | 260 | 246 | 234 | 302 | 290 |

Every cell above was measured, not derived: the public site and Lightning at all three widths in both densities, and the Studio frame at 390 px (read from the width of the survey-scale rows, which are as wide as the answer column).

Five 44 px buttons need **252 px with comfortable's 8 px gaps, 244 px with compact's 6 px gaps and 236 px with the planned 4 px gaps**. Measured against the 236 px of the planned layout:

- **Public site:** passes at 390 px in both densities and at 360 px in compact (242 px); short at 360 px comfortable (230 px, by 6 px) and at 320 px (by 34 px compact, 46 px comfortable).
- **Lightning:** passes only at 390 px compact (246 px); short by 2 px at 390 px comfortable (234 px), by 20 px (compact) or 32 px (comfortable) at 360 px, and by 60 or 72 px at 320 px. A 320 px Lightning window is not a realistic target: Lightning's own page is 455 px wide there, because of its header, and also at 390 px and 360 px.
- **Studio frame:** passes at 390 px in both densities (302 / 290 px).

With sections open (no section card, which S1 would make the default) the public site at 320 px is still 4 px short: 15 + 12 + 17 = 44 px a side leaves 232 px.

### 3D. Differences we accept (documented, allowed in the test)

These are not defects on their own:

1. **Phone date box.** At a narrow viewport the public site shows the browser's native `mm/dd/yyyy` date input; Lightning and the Studio's Mobile frame show Salesforce's picker. Native pickers on phones are accepted. The current preview does not reproduce it.
2. **Platform popups.** The opened dropdown list (Studio: 4 px corners, dark grey border #747474; public: 4 px, pale border #ecebea; Lightning: 8 px, no border, larger shadow), the calendar, and the help bubble (navy #16325c public, #032d60 elsewhere; 8 px corners in Lightning). Not themed.
3. **Text-box inner padding** 12 / 16 px (Studio, public) vs 8 / 8 px (Lightning).
4. **Help and calendar icon hue and shape** (Lightning blue and round, others grey and square), provided the contrast rules in 3A pass.
5. **Radio and checkbox rows** 25 px (Studio, Lightning) vs 21 px (public), and slider readout and title wrapping, which follow the form's width.
6. **Rich text ("Display text").** Headings are 16 px / 600 in Lightning and 18 px / 400 elsewhere; links use the platform blue (#0250d9 Lightning, #005fb2 public), not the theme accent. This is a font mismatch rather than a picker look, so it stays on the watch list: not in this round, revisit if authors use headings in Display text.

(The ranking arrows' padding difference is **not** in this list: those are our own buttons, so it is a defect that goes away when C2 is fixed.)

### 3E. Preview accuracy (separate fix)

The Studio's Mobile device is a **390 px wide form with no page margins around it**. A real phone has two separate things: the screen width (what CSS calls the viewport, 390 px here) and the host's own margins inside it. Measured: on the public site the form is 360 px wide at a 390 px screen (15 px a side from the site's page: 5 px margin plus 10 px padding), and 334 px in Lightning (28 px a side). So the Studio frame is 30 px (8 %) wider than a real public phone page, which gives its answers 30 px more room (302 px against 272 px in compact, 290 px against 260 px in comfortable) and changes wrapping: in compact the 0 to 10 scale splits 7 + 4 in the Studio frame and 6 + 5 on the public site. A single hard-coded "360 px form" would fix one host and one layout only, because themes, layouts (bleed, rail, split hero) and hosts each add their own margins. The fix is to model them separately (stage 5). The Studio's device frame has no 320 px option, so the 320 px measurements came from the other hosts only.

## 4. Differences that are by design (from the code, not rendered)

1. **The public site shows a frozen copy of the theme; the preview runs the live theme engine.** Publishing bakes the theme values into the version (`resolveSpecForPublish`); the Studio deletes them on drafts. Engine or theme improvements reach a published form only when it is republished. The viewer has shims for known cases. This work does not refresh older published forms' baked themes; shared CSS fixes still affect them (3B-1).
2. **Draft versus published.** The preview shows the draft; the public site shows the last published version.
3. **The preview simulates Submit.** It validates in the browser, then shows the thank-you screen without calling the server, so server-side errors cannot be previewed. It also skips link-token prefill, Autofill from records, edit-mode loading and survey record context.
4. **Page surface.** The Studio and Lightning are an "embedded" surface; the public site is a full page. The "Corner rounding (embedded)" setting and the viewport-fill rule apply in the first two and never on the public site (the control says so).
5. **Lookups.** A bound lookup renders the platform's picker in the preview and Lightning; the guest projection strips bindings, so the public site renders our own search box. Not rendered in this test.
6. **Images.** An image saved with a login-only path (`/sfc/servlet.shepherd/…`) loads in the Studio and Lightning and is broken for guests unless the file has a public link; the server swaps in the public link only when the image carries its file id. Measured: 1000 × 1000 in the Studio and Lightning, 0 × 0 on the public site; a public file link and an inline image loaded everywhere.
7. **Locale.** Dates and numbers drawn by platform widgets follow the respondent's locale; the preview follows the author's.
8. **Window height.** Split hero and Side rail heights follow the browser window on the public site and a simulated device in the Studio.
9. **Date picker calendar** is 12 px on every host (the platform hard-codes it; DEFERRED #34).

## 5. Plan, revised (nothing started)

**Decided and not part of this plan:** keep the current font scale (the respondent type scale shipped in #370 to #373); keep the platform controls; accept native phone date pickers; defer rich-text styling; for older published forms, do not refresh their baked themes (shared CSS fixes still reach them after a site publish, so they change look).

**Stage 1. Legibility (3A, A1 to A7).**
- Choice text: set the radio and checkbox text colour from the theme text colour, one hook per host (Lightning `--slds-g-color-on-surface-2`, Studio `--slds-g-color-neutral-base-30`, public `--dxp-s-form-element-label-color`), on a shared class (stage 2), scoped to those controls.
- Dropdown text and the two icons: find the equivalent hook on each host the same way; icons must reach 3 : 1 on every theme.
- **Error text, required marker and invalid border on dark themes (A5 to A7).** These are our own colours: give each theme an accessible error colour (4.5 : 1 for the message and the marker against the surface they sit on, 3 : 1 for the border against the field) instead of one fixed red.
- **Verification, not just influence.** For every colour change: (a) the state matrix: default, hover, checked or selected, disabled, invalid and focused, for radio, checkbox group, single checkbox, toggle, dropdown and date input, on each host, on a light theme, a dark theme and a mid-tone theme; (b) a **side-effect check**: set the hook to a loud colour and diff the computed colour, background, border and fill of **every descendant** of the widget, to list what else it moves; (c) contrast of each state against its real background (4.5 : 1 text, 3 : 1 icons and borders). Disabled controls follow section 6.

**Stage 2. Spacing, error placement and error styling (B1, B2, B4).**
- Spacing and placement: add a shared class (for example `platform-control`) to the platform widgets in `finalElementRenderer.html` and set `margin: 0` on it, or use an explicit selector list. `.field > lightning-*` is **not valid CSS**; the explicit list would be `.field > lightning-input, .field > lightning-textarea, .field > lightning-combobox, .field > lightning-radio-group, .field > lightning-checkbox-group` (plus `lightning-input-field` inside `lightning-record-edit-form`, and the consent `lightning-input`). Verify on each host that the override wins (specificity and `!important`), including the toggle and single-checkbox variants.
- Error styling, in the same change: the text area and the dropdown get the same invalid border as the text boxes, and radio and checkbox groups get an equivalent invalid indicator (decide which: a group outline or an icon).
- Acceptance: field heights and error placement (at most 8 px from the box) match across hosts at the same content width, wherever wrapping and control structure are equivalent. **This tightens existing public forms after the site publish, so it needs your word.**

**Stage 3. Narrow-form usability (group C).** Everything in this stage applies when the form is 540 px wide or narrower (a "narrow form", defined in 3C); forms wider than that keep today's sizes, compact density included. Scope note: this is not a 320 px edge case. In the default comfortable density the five-point scales already end with a lonely button at a 360 px screen and the 0 to 10 scale ends with a lone "10" at 390 px (table W).

0. **Probe first.** For each platform target (text box, text area, dropdown, radio and checkbox options, toggle, help button, calendar button) find out whether its clickable area can be enlarged from outside: a styling hook or a documented CSS property that works on all three platform stylesheets, found the same way the choice-text hooks were. None is known today (the `--slds-c-input-sizing-height` mapping has no effect). Report before building. Targets with no way to grow go to decision 6 in section 9.
1. **Touch targets.** Every target has at least 44 × 44 px of clickable area, in both densities. Ours: survey buttons, ranking arrows, chips, cards, emoji buttons, yes/no, matrix cells, Next, Back and Submit. The platform's: text boxes, text areas, dropdowns, radio and checkbox options, single checkbox, toggle, help and calendar buttons, file upload. Clickable area means the box that receives the tap, including a label that activates the control, not the visible icon (table T).
2. **Width.** The rule: **the answer column is at least 236 px on a 320 px public-site screen, in both densities, with sections as cards and with sections open.** Open sections (S1) cannot be the whole answer: with no section card at all the public site is still 4 px short at 320 px (44 px a side leaves 232 px). So the budget cuts all three layers, with the same values in both densities (the section card's padding is capped, not scaled):

   | Layer (per side, on a narrow form) | Today | Proposed |
   |---|---|---|
   | Page padding | 12 | 4 |
   | The form's card (border + padding) | 1 + 16 | 1 + 8 |
   | A section's card (border + padding) | 1 + 14 compact, 1 + 20 comfortable | 1 + 12 |
   | **Ours in total** | **44 compact, 50 comfortable** | **26** |

   Result on the public site (host margin 15): 238 px of answer column at 320 px (2 px over the 236 needed), 278 px at 360 px and 308 px at 390 px, in both densities; with sections open, 264 px at 320 px. In Lightning (host margin 28): 252 px at 360 px and 282 px at 390 px; 212 px at 320 px is not a target (3C). These are starting values; the rule is what has to hold. It changes the narrow-form look of every existing form (tighter side padding). The layout-cleanliness proposal S1 ([LAYOUT_CLEANLINESS_RECOMMENDATIONS.md](../specs/LAYOUT_CLEANLINESS_RECOMMENDATIONS.md), still waiting for your decision) is independent: it may remove section cards by default, which only adds room. Whether an authored section padding is capped too is decision 4.
3. **Gaps.** 4 px between survey buttons on narrow forms (today 6 px compact, 8 px comfortable).
4. **Five-point and emoji scales sit on one row.** Five 44 px buttons with 4 px gaps need 236 px. The emoji buttons become 44 px wide on narrow forms (today 60 px).
5. **Eleven-point scale.** Buttons are 44 × 44 px with 4 px gaps, in a grid of equal columns (each at least 44 px wide), last row left-aligned under the same columns. The column count follows the answer column:

   | Answer column | Layout | Why |
   |---|---|---|
   | 284 px and up | 6 + 5 | six buttons need 284 px |
   | 188 to 283 px | 4 + 4 + 3 | four need 188 px; five (236 px) would leave a lone button |
   | under 188 px | 3 + 3 + 3 + 2 | three need 140 px |

   **Captions.** Today the low and high captions are two lines of text in a row *below* the buttons. That is fine while the scale is one row. Once it wraps, the low caption would sit under the wrong button (under "8", not "0"). So whenever the scale is laid out in more than one row (answer column under 524 px, what eleven buttons need), the captions become a legend above the buttons that names the number each one belongs to: "0 = Not likely" at the left, "10 = Extremely likely" at the right, stacked on two lines if they do not fit on one. Screen readers are unaffected: the group's accessible name already says "0 = Not likely to 10 = Extremely likely", and the legend stays hidden from them exactly as today's captions are, so nothing is read twice.
6. **Density.** Compact stays on forms wider than 540 px. On narrow forms the 44 px minimum applies at both densities.

Acceptance for the whole stage: test C (section 6).

**Stage 4. Smaller consistency.** The brand font in typed text on the public site (B3); a themed focus ring for radios, checkboxes and the toggle (B5, optional).

**Stage 5. Preview accuracy (3E).** Model the viewport and the host's margins separately in the device frame: the frame is the screen width (390 px as today, plus a new 320 px option, and optionally 360 px); a host profile then adds that host's own side margin inside it (measured: public site 15 px a side, Lightning 28 px a side; selectable), and theme and layout padding come from the real viewer. Do not hard-code a form width.

**Stage 6. Tests (section 6).**

## 6. Tests

**A. Parity check with an allow-list.** Run the kitchen-sink form on the four hosts with each host sized so the form is the same width on every host for each comparison (record the width), and apply exactly these rules:

| Property | Rule | Tolerance or threshold |
|---|---|---|
| Font family and weight (our own text, and typed text) | must match across hosts; typed text must use the form's font | exact |
| Font size, line height, letter spacing | must match across hosts | size ±0.5 px; line height ±1 px; letter spacing ±0.1 px (computed value, "normal" counts as 0) |
| Spacing between fields; label, control and error heights | must match across hosts, compared **only where wrapping and control structure are equivalent** (same number of label and error lines, same control type and option count); otherwise compare the parts separately | ±2 px |
| Contrast of text, icons, borders and focus rings | must **meet a threshold** in every state, light, dark and mid-tone theme; not "match across hosts" | text ≥ 4.5 : 1; icons, control boundaries, focus rings ≥ 3 : 1 |
| Disabled controls | separate expectations: exempt from the contrast thresholds, but must look different from the enabled state and ignore input. Whether a disabled control leaves the tab order is checked **per control type**, not required of all: a natively disabled input or button does; a read-only field or a control marked `aria-disabled` may stay focusable. The expected behaviour for each control type is written down when the test is built, and every host is compared to that record | difference in colour or opacity; opacity ±0.05 across hosts |
| Errors | message within 8 px of its box; every invalid field type shows an invalid indicator (border, outline or icon) | 8 px |
| Keyboard | tab order identical; a visible focus indicator at every stop | focus ring ≥ 3 : 1 |
| Requests | no blocked or failed requests | none |

Allowed to differ (documented): the native date picker on phones; platform popups (dropdown list, calendar, help bubble); text-box inner padding; icon hue and shape (contrast permitting); radio and checkbox row height (±4 px); rich-text typography (until brought into scope); the Studio Mobile frame's margins (until stage 5).

**B. One unmodified end-to-end test.** Publish a fresh disposable form (kitchen sink plus a dark theme) through the normal Studio path, run the site publish, then load it on the public site and in Lightning with **no spec patching**, so baked theme values, publish and theme resolution are in play, and run the same measurements. It needs your OK to create and publish a form (the deletion would be named in chat by exact name afterwards).

**C. Narrow-form matrix (absolute thresholds, public site, real widths).** Test A compares hosts with each other, so it cannot catch a problem that every host shares, and everything in group C is exactly that kind of problem. This test checks fixed thresholds instead. It runs on the public site, where phones actually are, at real screen widths of **320, 360 and 390 px**, in **both densities** (compact and comfortable), with sections **open and as cards**: 3 × 2 × 2 = 12 combinations, on a form holding a five-point scale (stars and numbers), the emoji scale, the eleven-point scale and every platform control. Every combination must pass all of:

| Check | Threshold |
|---|---|
| Sideways scroll | none: page scroll width no larger than the screen width |
| Answer column | at least 236 px (what five 44 px buttons with 4 px gaps need) at every width in the matrix, in both section modes |
| Clickable area of every target | at least 44 × 44 px (targets listed below) |
| Five-point scales (stars, numbers) and the emoji scale | one row |
| Eleven-point scale | rows follow the table in stage 3; never a row with a single button |
| Captions | the low caption sits next to the first button and the high caption next to the last one, in every layout |

Targets: the platform's text boxes, text areas, dropdowns, radio and checkbox options, single checkbox, toggle, help and calendar buttons, and file upload; and ours: survey buttons, ranking arrows, chips, cards, emoji buttons, yes/no, matrix cells, Next, Back and Submit. Links inside a sentence are exempt (WCAG 2.2's inline exception). **Clickable area** means the box that receives the tap: the control's own box joined with any label that activates it, hit-tested at its centre; never just the visible icon (the help icon is 14 px inside a 16 px button, for example).

**D. Standing gate.** Run A, B and C before any "fixed" claim on look, size or spacing, and after every platform release. The harness exists in my scratch folder and would move into `scripts/` with a short README; it needs the density switch (`DENSITY=compact` or `comfortable`) that the newest probes already have.

## 7. Parked or not in scope

- Drawing radios, checkboxes, dropdown and date ourselves (identical on every host by construction). A future option only; decision 6 in section 9 names the one case where a single control might be drawn.
- Rich text typography (3D-6).
- Refreshing baked theme values on older published forms (their look still changes with the shared CSS fixes, see 3B-1).

## 8. Not checked

The thank-you screen on live hosts (needs a Submit click, which I do not do without your word), Firefox, Safari and real phones, the Salesforce mobile app, Experience sites that use the older page builder, rendered lookups, the other 27 themes at runtime (A1 was computed for all 32 from their colours and rendered for Dracula Dark), the Studio at 320 px (its device frame has no 320 px option), disabled controls (no state data yet; stage 1's matrix covers them). Also: the density-dependent numbers in 3C come from one form (the kitchen sink); a narrow answer column inside a wide form (a two-column section on a desktop) can wrap a scale the same way, and stage 3 does not cover it; and the clickable-area hit-tests (table T) were taken at one screen width, which is enough for the platform controls because their size does not depend on width.

## 9. Decision list (one place)

Nothing below is started. "Needs your word" means I will not begin until you say so.

| # | Decision | My recommendation | Status |
|---|---|---|---|
| 1 | **Go order.** Stage 1 (legibility, including the dark-theme error colours), then stage 2 (spacing, error placement and invalid borders; this changes how existing public forms look after the next site publish). | Stage 1 first, then 2. | Needs your word |
| 2 | **Disposable form** for test B: OK to create and publish one? I would name its deletion in chat afterwards. | Yes. | Needs your word |
| 3 | **Stage 3, width.** The rule (answer column of at least 236 px at a 320 px public-site screen, both densities, cards and open sections) and the starting budget (page padding 4, form card 1 + 8, section card 1 + 12). It tightens the narrow-form look of every existing form. S1 stays its own decision and is not a dependency. | Yes. | Needs your word before stage 3 |
| 4 | **Stage 3, authored section padding.** On a narrow form, cap an authored section padding at the budget value (the form card already does this with `min(…, 16px)`), or let authored values win and accept narrower columns? | Cap it. | Needs your word before stage 3 |
| 5 | **Stage 3, eleven-point scale.** The layout table (6 + 5 from 284 px, 4 + 4 + 3 from 188 px, 3 + 3 + 3 + 2 below) and captions as a numbered legend above the buttons whenever the scale wraps. | Yes. | Confirm before stage 3 |
| 6 | **Stage 3, platform targets that cannot be enlarged** (known after the probe in item 0): (a) accept them with a documented exception; (b) enlarge the clickable area with our own wrapper where the platform allows; (c) draw that one control ourselves (for example our own help button; drawing radios, checkboxes and the rest stays parked). | (b), then (a); (c) only for the help and calendar buttons if nothing else works. | Decide only if the probe fails |
| 7 | **Stage 5, preview.** Add 320 px (and optionally 360 px) device frames, and a selectable host-margin profile (public site 15 px a side, Lightning 28 px a side). | Yes. | Confirm |
| 8 | **Letter-spacing tolerance** in test A: ±0.1 px (my pick; the review asked for one without a value). | Fine as is. | FYI |
