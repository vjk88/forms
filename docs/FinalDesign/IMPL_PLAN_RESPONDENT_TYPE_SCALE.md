# Build plan: published-form text sizes

**Status:** IN BUILD. The owner approved the spec on 2026-10-03 ("lets update the code using this one"). This plan is the file-by-file trace of that spec. Delete or fold it into the catalog after ship (owner's call).

**Spec (source of truth for every number):** `docs/FinalDesign/specs/RESPONDENT_TYPE_SCALE_RECOMMENDATIONS.md`

**Branch:** `feat/respondent-type-scale`. One PR, several commits. Opened, **not merged** until the owner has looked at the deployed result (this changes the look of every published form).

**Not in this work:** Studio screens (separate typography pass), form data, specs, Apex, spacing other than the one card-padding change, the guest-site publish (needs the owner's approval each time).

---

## 1. How it works (plain words)

1. **One list of named sizes** (`--c-fs-title`, `--c-fs-label`, ...) is declared once, on the page frame's `.page` element. Every respondent stylesheet reads those names instead of its own number.
2. **Which list applies** is chosen by layout:
   - Standard: scroll, wizard, tabs, accordion, side rail, Split hero ("All fields together").
   - Section at a time: One at a time, Split hero ("One section at a time"). The viewer already computes this as `ownsAdvance`.
   - Single question: any section the viewer marks `convo` (surveys set to "One question per page"). The page frame only learns that the form is in this mode, so the form title can step down to 24.
3. **Phones** (whole form 540px wide or less) swap in the Mobile column through one container query on the form's own width (`final-form-viewport`). Tablet = desktop.
4. **The form declares its own base size** (`.page { font-size: 1rem }`) so text with no size stops borrowing the host's 13px.
5. **Typed text:** inside Salesforce it inherits; on the public site `--dxp-s-form-element-text-font-size` is set to the answer size. Both are set once, on `.field`, so they always see the right set.

## 2. Token table (the numbers live in `finalPageFrame.css` only)

| Token | Standard D/T / M | Section at a time D/T / M | Single question (on `.sec-convo`) D/T / M |
|---|---|---|---|
| `--c-fs-title` | 28 / 20 | 28 / 20 | 24 / 20 (form title; set from the frame) |
| `--c-fs-title-compact` | 20 | 20 | 20 |
| `--c-fs-thanks` (thank-you headline) | 28 / 20 | 28 / 20 | 28 / 20 (never steps down) |
| `--c-fs-section` | 20 / 18 | 26 / 20 | 14 / 14 |
| `--c-fs-label` | 16 | 18 / 16 | 32 / 24 |
| `--c-fs-answer` | 16 | 18 / 16 | 18 / 16 |
| `--c-fs-desc` | 16 | 16 | 16 |
| `--c-fs-help` | 14 | 14 | 14 |
| `--c-fs-error` | 16 | 16 | 16 |
| `--c-fs-secondary` | 14 | 14 | 14 |
| `--c-fs-button` | 16 | 16 | 16 |
| `--c-fs-nav` | 16 | 16 | 16 |
| `--c-fs-brand` | 18 | 18 | 18 |
| `--c-fs-hero` | `clamp(1.6rem, 4cqw, 2.4rem)` | same | same |
| `--c-fs-hero-compact` | 1.15rem (18.4) | same | same |
| `--c-fs-readout-min` | 1.25rem (20) | same | same |

`--c-fs-title-compact`, `--c-fs-thanks` and `--c-fs-readout-min` are additions to the spec's Appendix A list (the spec said "names are proposals"): the one-row header title (20), the thank-you headline (28, which must not step down to 24 with the form title) and the slider readout floor (20) each needed a named home so the guard test can stay strict.

**Derive multiples where used** (spec Appendix A rule 2): stars `answer x 1.7`, emoji `answer x 2`, slider readout cap `answer x 2.2` stay in the element stylesheet, never in the token layer.

## 3. File by file

| File | Change |
|---|---|
| `finalPageFrame/finalPageFrame.css` | Add the token list on `.page` (Standard), `.page[data-size-set='section']`, `.page[data-single]` (title only), and the Mobile step inside `@container final-form-viewport (max-width: 540px)`. Add `font-size: 1rem` on `.page`. |
| `finalPageFrame/finalPageFrame.js/.html` | New `@api sizeSet` and `@api single`; written as `data-size-set` / `data-single` on `.page`. |
| `finalFormViewer/finalFormViewer.js/.html` | Compute `sizeSet` (`ownsAdvance` -> `section`, else `standard`) and `single` (`onePerScreen`); pass both to the frame. Add the **label-scale shim**: a published snapshot without `--c-label-scale` gets `0.875` when `--c-label-transform` is `uppercase`, else `1`. |
| `finalFormViewer/finalFormViewer.css` | `.viewer-error` / `.viewer-busy-text` / `.viewer-submit-error` use tokens (error box has no frame around it, so it carries a rem fallback). |
| `finalThemeEngine/finalThemeEngine.js` | `LABEL_LOOKS` gains `scale` (1 / 0.875 / 1 / 0.875); new contract token `--c-label-scale` (appended to contract v1). **`--c-label-size` keeps being emitted** (the contract test says never remove) but nothing reads it any more. |
| `finalElementRenderer/finalElementRenderer.css` | Every font size -> a role token (mapping in section 4). `.field` sets `font-size` and the DXP hook to the answer size. `.scale-chip` rule order fixed (`font: inherit` used to reset its size). |
| `finalSectionRenderer/finalSectionRenderer.css` | `.sec-convo`: the fluid `--convo-base` ladder is replaced by the Single question token values + Mobile step. Section title/description/repeater text use tokens. |
| `finalFormHeader/finalFormHeader.css` | title/brand/description -> tokens; dead `.style-minimal` rule deleted; narrow rule keeps line-height only. |
| `finalNavOneAtATime/*` | tokens for counter, progress text, back link, button, helper; `card-single` class so a Single question card has 26px padding on phones. |
| `finalNavSplitHero/finalNavSplitHero.css` | brand, hero title (`--c-fs-hero`, compact in the stacked rule), subtitle, progress, back, button, helper, form-side lockup -> tokens. |
| `finalNavStepper`, `finalNavRail`, `finalNavTabs`, `finalNavScroll`, `finalNavAccordion` | tokens per spec tables 8.2 to 8.5 (`font-size: 0` rules for dots mode stay). |
| `finalSubmitBar`, `finalAfterSubmit`, `finalFormHighlight`, `finalGuestHost`, `finalLookup` | tokens (lookup and guest host carry a rem fallback because they are also used outside a form frame). |
| New test | `finalPageFrame/__tests__/typeScale.test.js`: the guard (no hard-coded size in respondent CSS) plus a table test that fails if a token value drifts from the spec numbers. |

## 4. Element stylesheet mapping

| Today | Role |
|---|---|
| `.field-label` (13) | `--c-fs-label` times `--c-label-scale` |
| `.label-uppercase` (11) | `--c-fs-label` x 0.875 |
| `.field-caption` (13.1), `.choice-desc` (12.8) | `--c-fs-help` |
| `.field-error` (0.8em) | `--c-fs-error` |
| `.block-richtext`, `.block-callout`, `.consent-text` | `--c-fs-desc` |
| `.unsupported`, `.block-*-empty`, `.block-file-frame`, `.file-item-name`, `.file-item-size`, `.scale-endlabels`, `.rank-num`, `.mx-head`, `.mx-point-label` | `--c-fs-secondary` |
| `.ic-label`, `.mx-statement`, scale chips, choice chips | `--c-fs-answer` |
| `.file-item-x` (x glyph), `.choice-emo` | em (relative to their own text) |
| `.scale-icon`, `.emoji-chip`, `.slider-val` | multiples of `--c-fs-answer` (unchanged ratios) |

## 5. Orphan ledger

| Setting | Writer | Reader |
|---|---|---|
| `--c-fs-*` (all) | `finalPageFrame.css`, `.sec-convo` | every respondent stylesheet in section 3 |
| `--c-label-scale` | engine `LABEL_LOOKS`; viewer shim for old snapshots | `.field-label` |
| `--c-label-size` | engine (unchanged) | **none** (kept only for contract v1; delete at the next contract bump) |
| `data-size-set`, `data-single` | viewer -> frame | `finalPageFrame.css` |
| `--convo-base`, `--c-q-title-size`, `--c-q-caption-size`, `--c-q-answer-size` | `.sec-convo` | **deleted** (readers rewritten) |

## 6. Things for the owner's eye

1. **Lookup rows in spec 8.10 were measured on the wrong component.** The 12/13/13/11/12/12 "today" numbers belong to the Studio's search-as-you-type box (`finalTypeahead`), not the respondent lookup (`finalLookup`). The target numbers still hold (typed and result names follow the answer size, result detail line 14, error 16). Spec text corrected.
2. **Card padding 26** is applied to the One at a time card (`.question-card`) when its screen is a Single question, on forms 540px or narrower. Other layouts' panels are already 16px on phones, so they are untouched. One at a time without One question per page keeps 32 (open question in the spec).
3. **Line heights** are already unitless everywhere; nothing changes (the spec only states the rule).
4. **Radio, checkbox and dropdown text** was unverified at build time (spec section 11). Checked 2026-10-09 by swapping the widgets into a copy of a form inside the browser: the platform widgets size that text themselves, so it did not follow the answer size (13 and 12 inside Salesforce, a fixed 16 on the public site). Fixed with per-host settings on the radio, checkbox and dropdown widgets (three kinds of host; the Studio preview was missed by the first fix and covered on 2026-10-10) and re-measured on the deployed code; see spec section 11.
5. **Rail numbers** go from 12 to 14px inside a 22px circle. Checked visually after deploy.

## 7. Checks (results 2026-10-03)

Done: jest (113 suites, 1,377 tests), eslint, prettier; deploy to `revclouddev`; read-only measure in the Salesforce viewer tab on 9 forms x 3 widths and in the Studio preview. **Every computed size matched the spec tables**, card padding was 26 (One question per page, phone) / 32 (everything else), and the Studio preview agreed with the viewer tab. Public site: the owner approved the site publish on 2026-10-03 (and said site publishes no longer need asking); after it landed, 4 public forms x 3 widths were measured as a signed-out visitor and matched the Salesforce numbers, including typed text (16 Standard, 18 One at a time on desktop and tablet). Not done: Side rail and Accordion (no test form exists), error text (cannot be rendered without a validation rule), radio / checkbox / dropdown text on the public site (no public form contains them), Firefox / Safari / iPhone, 200% zoom.

Plan as written:

1. Jest: new guard + table test, engine contract and snapshot (adds `--c-label-scale`), frame attribute test, viewer size-set and shim tests, OAT card class test; then the full suite.
2. Deploy to the dev org (`revclouddev`) in steps; each time a read-only measure of computed sizes (Studio preview + LEX viewer), nothing typed or submitted.
3. Spec section 12 step 4 (7 layouts x 3 devices, 200% zoom) after the last step. Public site needs a site publish: **ask first**.
4. Rollback: revert the stylesheets (and the three JS edits). Nothing in data changes.
