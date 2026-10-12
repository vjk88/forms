# Phone-width check

`phone-check.cjs` is the standing guard for stage 3 (forms on phones). It loads a **published, public** form on the guest site as a signed-out visitor at 320, 360 and 390px, at both densities, and asserts the numbers stage 3 fixed:

| Check | Rule |
| --- | --- |
| Sideways scroll | none |
| Answer column | at least 236px (five 44px buttons and four 4px gaps) |
| Page margin | the public site leaves 15px on each side of the form, the number the Studio's "Public site" preview frame draws (`previewFrame.js`) |
| Every scale (rating 5 / 10, opinion scale 5 / 7 / 10, emoji, 0-10, standard and conversational) | **one row whenever its buttons fit**, **no lone last button**, **centered** |
| Every control of ours | at least 44 x 44px |

The platform's own controls (text box, dropdown, radio and checkbox rows, toggle, help and calendar buttons) are **listed with their sizes but never fail the check**: no styling hook enlarges them the same way on all three hosts, so they stay at the platform's size unless the owner chooses otherwise (`docs/FinalDesign/qa/STAGE3_PLATFORM_CONTROLS_PROBE_2026-10-11.md`).

## Run it

```bash
node scripts/qa/phone-check.cjs --site https://<your-site>.my.site.com --form-id <Form__c Id>
```

`--form-id` is any published form with the public link on; its own questions are not used. The spec the guest site hands to the browser is replaced **in memory** by a kitchen sink of every question type, so nothing is saved, clicked, typed or submitted, and the form on the server is never touched. Options: `--widths 320,360,390`, `--densities comfortable,compact`, `--out <folder>` (one JSON per run; default a temp folder). Or set `PHONE_CHECK_SITE` and `PHONE_CHECK_FORM_ID`.

Exit code 0 = every check passed, 1 = a check failed (each failure is printed as a sentence), 2 = could not run.

Run it **after a deploy and a site publish** (a metadata deploy alone never reaches the guest site; see `docs/FinalDesign/RUNTIME_NOTES.md`). It needs the dev dependency `playwright` and its browser (`npx playwright install chromium`).

## Prove the check can fail

```bash
node scripts/qa/phone-check.cjs --self-test
```

Needs no browser and no org. It feeds the rules a clean result (must pass) and ten deliberately bad ones (sideways scroll, a 190px column, a page margin the Studio frame does not draw, no scale found, a row that fits but wraps, a lone button, an off-center scale, a 36px button, a 34px arrow, a page that did not render) and fails unless every one is caught.

## When it fails

- *answer column*: some layer of padding grew back; the budget per side is page 4 + form card 1 + 8 + section card 1 + 12 (`finalPageFrame.css`, `--c-pad-cap`).
- *page margin*: the public site's page now leaves a different amount beside the form, so the Studio's "Public site" frame (`HOSTS` in `finalPreviewStage/previewFrame.js`, measured 2026-10-11) draws the wrong width again. Re-measure the form width at 320, 360, 390, 768 and 1280px, update the table in that file and `PAGE_MARGIN` here.
- *wraps though it fits one row* / *lone button*: `finalScaleLayout` did not run or a stylesheet fights its `--scale-row-max`, `--scale-row-gap` or `--c-q-control-h`.
- *our control is smaller than 44px*: something stopped reading `--c-control-h` on a narrow form, or a fixed size was added outside the narrow-form rule in `finalElementRenderer.css`.
