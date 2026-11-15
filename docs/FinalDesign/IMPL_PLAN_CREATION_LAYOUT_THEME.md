# Creation: layout and theme on one page

Owner 2026-11-14. Mock: [mocks/creation-layout-theme-merge-mock.html](./mocks/creation-layout-theme-merge-mock.html)
("mock looks good, go ahead"). Closes DEFERRED #64; #15 (form templates) was killed the same day.

## Rulings (owner, 2026-11-14)

1. **No templates for Forms.** The Form templates tab, its empty shelf and the "Form templates arrive
   next" subtitle go. Surveys and Freeform keep their template shelves.
2. **One page picks the layout and the theme.** The theme step's "Preview in" row becomes layout
   picture tiles that set the layout; every theme card previews in it.
3. **Defaults:** Surveys start on One at a time and the page says so. Forms and Freeform start on
   Scroll. Anyone can switch before picking a theme.
4. **Clicking a theme goes straight to Details** (one click, as today). Details shows what was picked:
   Layout and Theme, each with Change, for all three types.
5. **The Studio is untouched.** Design → Theme → Change… keeps its preview-only "Preview in" row;
   Layout keeps its own Change….

## Flows

| Type | Before | After |
| --- | --- | --- |
| Form | type → layout (+ templates tab) → theme → details | type → **layout + theme** → details |
| Survey | type → template → theme → details (always One at a time) | type → template → **layout + theme** → details |
| Freeform | type → template → layout → theme → details | type → template → **layout + theme** → details |

## Build

| Part | Change |
| --- | --- |
| `finalDesignArt` | `layoutArt(key)`: a small drawing for each of the 8 layout choices (same 56×36 box and `pa-*` shapes as the Design tiles). |
| `finalPictureChoice` | `columns="8"`: one row when the page is wide (≥ 760px of container), four per row otherwise. |
| `finalThemeGallery` | `@api hideLayoutSwitch`: hides the "Preview in" row. Off by default, so the Studio picker keeps it. |
| `finalCreationGallery` | The layout step and entry toggle are deleted. The theme step becomes "Pick a layout and theme": layout tiles, a survey-only note, then the theme gallery with the row hidden. The type (and template) choice sets the default layout. Details: the form's Layout dropdown becomes a Layout chip like Theme's; Survey and Freeform gain it too. Both chips go back to the layout + theme page. |
| `FinalFormCreateController.createSurveyFromTemplate` | Takes `layoutType` and `paneFlow`. Blank or `oneAtATime` with no pane flow writes exactly today's block (`{ type: 'oneAtATime' }`), so a default survey is unchanged; any other layout writes the same `layoutBlock` a new form gets. Pane flow is refused off splitHero, as in the other two creators. |

Not in scope: layout pictures inside the Details chips (the chips stay text, matching the built Theme
chip); the Studio's pickers; DEFERRED #18(a) (hiding "Preview in" in the Studio).

## Tests

- Jest: form opens the merged page on Scroll; survey on One at a time with the note; freeform on
  Scroll; a layout tile re-previews the gallery; theme click lands on Details with both chips; Change
  returns; each create call carries the picked layout. No Form templates tab anywhere.
- Jest: `finalThemeGallery` hides "Preview in" only when asked; `layoutArt` draws all 8 keys.
- Apex: survey with Stepper gets the form layout block; blank layout keeps `{ type: 'oneAtATime' }`;
  a pane flow off splitHero is refused.
- Org: walk all three types on the LEX tab and `/apex/FinalStudio`; open the created survey in the
  Studio and check its layout.
