# FinalStudio UX improvements: results and handoff (Task 7)

Completed 2026-09-29 against `docs/FinalDesign/specs/IMPL_PLAN_STUDIO_UX_SIMPLIFICATION.md`. Baseline and the editor-mismatch diagnosis are in `studio-ux-baseline.md`. Screenshots and raw numbers are in `screenshots/studio-ux/`.

Process note: at the owner's request the full browser pass was batched into this task and each change was deployed to the dev org as it landed, so the owner could test in parallel. Each task also got a targeted org check when it landed (recorded in its PR); this document is the combined pass.

## 1. What shipped

| Task | PR | What changed |
| --- | --- | --- |
| 0 | #362 | Baseline numbers, screenshots and the FormBuilder Pro vs FinalStudio diagnosis (docs only) |
| 1 | #363 | **Expand preview / Collapse preview** button; the preview takes the whole workspace under the top bar without remounting |
| 2 | #364 | **Collapsible tools column** (44px strip), stable pane widths (tools and structure a quarter each, preview at least half) and a stacked Build layout below 960px |
| 3 | #365 | **Light structure panel** with a teal selection (tokens plus a tinted selected surface; section borders use the stronger token) |
| 4 | #366 | **Compact Advanced rich text**: Title, Description and Brand name are closed disclosures with a one-line summary |
| 6 | #367 | **Save-aware "Back to forms"**: finishes saving first, stays put with Retry if the save fails |
| 5A + 5B | #368 | **Compact respondent spacing and header on narrow forms** (a form 540px wide or less) |

Files changed by the whole program (product code): `finalPreviewStage` (4 files), `finalFormStudio` (4), `finalDesignPanel` (4), `finalBuilderCanvas` (3, comments and CSS only), `finalStudioStyles` (1), `finalPageFrame` (1), `finalFormHeader` (1). No Apex, objects, packages or persisted form properties were added. Workspace state (`previewExpanded`, `toolsCollapsed`, `exiting`) lives only in the Studio component, never in the spec, undo history, Apex or storage.

### Release notes

- **Authors:** the preview can expand to the full workspace; the tools column can fold away; the structure panel is light; Advanced rich-text editors no longer stack open; the top-left button reads "Back to forms" and saves first.
- **Respondents (affects every already-published form once deployed, with no republish):** on a form 540px wide or less the outer margins, card padding and header are tighter, and long words in the header wrap instead of stretching the card. Wider forms are unchanged. Roll back by restoring `finalPageFrame.css` and `finalFormHeader.css` together.

## 2. Before and after

Same fixture as the baseline: the "Autofill Test: Satisfaction Survey" v5 draft, Chromium 149, 1280×800, VF full-page host.

| Measure | Before | After |
| --- | --- | --- |
| Build panes (tools / structure / preview) | 320 / 320 / 640 | 320 / 320 / 640 open; 44 / 320 / 916 with tools collapsed |
| Desktop preview scale, Build | 47% | 47% open, **69%** tools collapsed, **97%** expanded |
| Desktop preview scale, Design | 64% | 64% normal, **97%** expanded |
| Advanced Brand & header | three editors, 3 × 219px; Brand name started at y = 927 (below the fold) | three summary rows; all end by y = 579 |
| Mobile header (long-title survey) | 292 × 354px, title 25.6px | 332 × 184px, title 20px |
| Mobile: first input below the top of the device | 558px | **316px** |
| Mobile spacing (page / card) | 64/16/32/16 and 32px | 16/12/24/12 and 16px |
| Top-bar label | ← Exit | ← Back to forms |

Screenshots: `baseline-*.png` against `after-build.png`, `after-build-tools-collapsed.png`, `after-build-expanded-preview.png`, `after-design-advanced.png`, `after-mobile-preview.png`, `after-stacked-768.png`. `lex-build.png` is the Lightning Experience host, and `after-dark-respondent-theme-light-structure.png` shows a dark immersive respondent theme beside the light structure panel.

## 3. Automated checks

| Check | Result |
| --- | --- |
| Whole LWC Jest suite (`npm run test:unit -- -- --maxWorkers=2`) | **108 suites, 1,317 tests, all passing** (broader than the plan's "union of affected suites") |
| Tests added by this work | 33: preview stage 3, Studio 24 (7 preview expansion, 6 tools panel, 11 Back to forms), Design panel 6. One existing Studio test (hosted-mode exit) was updated to await the save |
| ESLint on every changed JS file | 0 errors; 1 pre-existing warning (`finalFormStudio.js` unused `eslint-disable`), not from this work |
| Prettier on the 24 changed text files, checked against the committed content | all clean (a working-tree check reports CRLF noise from Windows `autocrlf`; the committed blobs are LF) |
| Pre-commit hook (prettier, eslint, related Jest) on each commit | passed every time |
| Baseline failures | none |

New tests were written first and watched fail for the right reason. Guard tests that passed before their feature existed were mutation-checked (opt-in guard, no-remount, the expanded-preview precedence rule, and the `editorLocked` finding).

## 4. Browser acceptance

Hosts and sizes: **VF full-page host** (`/apex/FinalStudio`) at 1280×800, 1024×768, 1440×900 and 768×1024; **Lightning Experience** (`/lightning/n/Final_Studio`) at 1280×800 and 768×1024. Chromium 149 headless, dev org `revclouddev`, driven by Playwright. Edits were made only on a disposable scratch clone, never on the reference survey.

| Scenario | VF | LEX | Evidence |
| --- | --- | --- | --- |
| New controls work; top bar stays reachable | Pass | Pass | Expand preview Fit 47% → 97% (VF) and → 95% (LEX, 16px of page padding) |
| LEX host: no unrelated platform styling | n/a | Pass | Structure and control colours resolve to the intended tokens; screenshots |
| 1024×768, 1280×800, 1440×900: no page-level horizontal overflow; controls fit | Pass | Pass (1280) | Panes 256/256/512, 320/320/640, 320/320/800; the property panel fits at 256px |
| 768px window: Build panes stack and stay reachable | Pass | Pass | Tools 320px, structure 360px, preview in normal flow; collapsed tools become a 44px row |
| Field selected → collapse tools → expand preview → return | Pass | Pass | Selection survives; the strip returns |
| Expanded preview: click another field | Pass | not run | Selection updates; the layout and the collapse preference stay |
| Preview text and choices survive workspace toggles and Build/Design changes | Pass | not run | Answer kept across expand, device change, zoom change and collapse |
| Tablet + 100% zoom survive toggles | Pass | not run | Same stage and viewer DOM nodes across toggles |
| Restart resets answers, keeps the device | Pass | not run | |
| Advanced rich text works by keyboard; formatting stays stored | Pass | Opens with its full toolbar only | VF: Enter toggles; two typing bursts stayed in order across the autosave echo; bold reached the preview. LEX: not typed into |
| Structure drag/drop and Alt+Up/Down | Highlight only | not run | The canvas JavaScript was not changed and its Jest suite (including the move actions) passes. In the browser only the real dragover handler was exercised (a teal insertion line, cleared by dragend); an actual drop, reorder and Alt+Up/Down were not re-run |
| Read-only published version | Pass | not run | No edit or save controls; the structure canvas is not mounted |
| Settings drawer and theme-gallery overlay after adding the workspace container | Pass | Pass | Both still cover the whole 1280×800 window |
| Mobile preview vs a real narrow hosted form | Preview only | Preview only | See "Not verified" |
| Light and dark respondent themes | Pass | not run | A dark theme (Neon Nights) renders dark while the structure panel stays light |
| Pending save + Back to forms | Pass | Pass | The edit typed just before Back is in the saved draft; a forced `saveDraft` failure stays with the normal error and Retry, and unlocks |
| Repeated toggles | Pass | not run | 10 rapid toggles leave one stage and one viewer, no console errors |

Task 3 state pass (VF, computed colours): normal (dashed `#7c8999`, 3.56:1), hover (darker dashed), selected (solid teal, mint tint, ring), keyboard focus on unselected and selected rows (2px teal outline), required asterisk (5.88:1 on the tint), empty section placeholder (label 6.14:1), drag-over highlight, read-only.

Mobile checks, in the Studio preview (the preview canvas width is the form's width, which is exactly what the container measures): the boundary is exact (539px and 540px compact, 541px regular); Desktop and Tablet unchanged; Split Hero keeps zero padding; no overflow at 320, 390 or 540px; a 72-character unbroken word wraps at 390px (7 lines) and 320px (9 lines).

## 5. Not verified, and why

- **A real hosted guest form** (Task 5A/5B "real 390px-wide hosted form"). It needs an Experience-site publish, which was not approved and was not done. The Studio preview shares the same renderer and container, but the guest host (LWR, published snapshot, possibly native shadow) is unchecked.
- **Firefox and Safari.** Not installed in the test environment. The one engine-sensitive assumption (a `container-type` wrapper not re-anchoring `position: fixed` overlays) was proven only in Chromium 149.
- **Header fixtures not run:** a short title, a logo plus description, rich text with an explicitly large inline size, no header, and a Split Hero header pane. The long-title survey and the long-unbroken-word fixture were run.
- **LEX cells marked "not run"** above were covered in the VF host only.
- Touch input was not exercised; the disclosures are native `<details>`/`<summary>`, which respond to taps.

## 6. Mismatch diagnosis status (separate from UX completion)

Confirmed differing formats: FinalStudio reads and writes `Form_Version__c.Spec_JSON__c`; the legacy FormBuilder Pro designers read `Layout_Config__c`, which is blank for forms authored in FinalStudio, and they open the active version rather than the draft. Nothing was converted or synchronised, and the two editors are not interchangeable. See `studio-ux-baseline.md`.

## 7. Remaining items and next actions

1. **Decide on an Experience-site publish** to verify 5A/5B on a real guest form. Until then guests keep the old spacing.
2. **Very long unbroken words on wider forms** (above 540px) can still overflow the header card. This predates the work and was left alone on purpose (Desktop rendering intact); applying the same wrapping at every width is a small follow-up.
3. **Retire the legacy tabs** (`Form_Builder`, `Form_Studio`, `ZFromDesigner`, the `form_Desginer` page) from navigation if the two editors should stop being compared (Task 0's separate action).
4. **Firefox and Safari pass** for the workspace container and the disclosure chevron.
5. Pre-existing and untouched: about 65px of the VF window is unused below the workspace, and in LEX the workspace sits below about 320px of platform chrome (banner, header, tabs, page title) so the page scrolls; the `finalFormStudio.js` unused `eslint-disable` warning.
