# Branded PDFs of forms: plan and slice 1

**Status:** slice 1 built (this PR) and unit-tested; **not yet deployed or looked at in an org**
(§8 is the check list). Slice 2 (email a copy) is planned, not built.
**Owner decision (2026-11-02):** build the PDF **in the browser, as a real .pdf file**, and ship four
entry points: the respondent's copy after submit, the staff copy on a submission, the Studio's blank
form, and (slice 2) an emailed copy.

## 1. What people get

| Who | Where | What they click | What they get |
|---|---|---|---|
| Respondent (guest or signed in) | Thank-you screen | **Download a copy (PDF)** (author turns it on) | Their answers, in the form's branding, named `<Form> - my answers.pdf` |
| Staff | Freeform Answers card on a submission | **Download PDF** | The card's rows as a branded PDF, named `<Form> - <FS-number>.pdf` |
| Builder | Studio preview toolbar | Download icon (**Download form as PDF**) | The form itself, printable, with empty answer areas |
| Respondent | Their inbox (slice 2) | nothing | The copy attached to an email |

"Branded" means: the header band in the form's header colors, with the banner image above it and the
logo (or brand name), title and description inside it; accent page headings and rules; the form's own
fonts, with real bold; a thin accent bar on every later page; a footer with the form's name and
"Page n of m". Paper is always white, and every text color is checked against what it sits on (§4.4).

## 2. Why in the browser (and not the alternatives)

| Option | Verdict |
|---|---|
| **Browser-built PDF file (pdf-lib)**, chosen | One click, a real file, works on every host (LWR site, LEX, VF Studio, iframe embed), uses the form's real fonts. A guest needs **no new data endpoint**: the spec and answers are already in their browser at submit. |
| Browser print / Save as PDF | Pixel-exact, but goes through the print dialog (clumsy on phones), and keeping site and Lightning chrome out of the printout cannot be done reliably from inside a shadow-DOM component under LWS. |
| Server PDF (Visualforce `renderAs` / `Blob.toPdf`) | Can attach and email, but the engine is CSS 2.1: no web fonts, no modern layout, approximate branding. Kept for **slice 2 only**, where the server must build the file itself (§7). |

## 3. Pieces

| Piece | Kind | Job |
|---|---|---|
| `staticresources/formPdf/` | static resource | `pdf-lib.min.js` 1.17.1 + `fontkit.umd.min.js` 1.1.1 (MIT, unmodified; notices inside). Loaded on first PDF only. |
| `staticresources/formPdfFonts/` | static resource (generated) | Every bundled form font as TrueType, 400 and 700 (≈2.1 MB zipped). Built by `scripts/fonts/build-pdf-fonts.py`. |
| `c/finalSurveyPoints` | JS module | Likert / matrix points and scale bounds, extracted from the renderer so screen and paper can't disagree. |
| `c/finalAnswerText` | JS module | `optionLabel`, moved from the submission reader: stored value → the chosen words. |
| `c/finalPdfTheme` | JS module | Tokens → PDF colors (var(), color-mix, gradients, contrast) and fonts. |
| `c/finalPdfModel` | JS module | Spec + answers / reader rows → a flat list of printable blocks. |
| `c/finalPdfWriter` | JS module | Blocks → PDF bytes (pdf-lib), with pagination. |
| `c/finalPdfService` | JS module | Loads libs, fonts and images, draws, saves. The one entry point. |
| `FinalPdfImageService` / `FinalPdfController` | Apex | Image bytes, user mode, capped. |
| `FinalGuestController.getGuestPdfImages` | Apex | Image bytes for guests, spec-derived, opt-in only. |

**Fonts, the finding that shaped §3:** fontkit cannot embed the bundled **WOFF2** files. Its
subsetter crashes on WOFF2's transformed glyph table (inside a timer, so the error escapes any
`try`), an unsubsetted WOFF2 lands in the PDF as an invalid font, and its variation code breaks on
WOFF2 composite glyphs. Plain TrueType works for all 86 faces, so a build step converts them. Re-run
the script whenever `build-font-bundle.mjs` changes the bundle; `--check` fails when it's stale.

```bash
python3 -m pip install fonttools brotli && python3 scripts/fonts/build-pdf-fonts.py
```

## 4. How it works

### 4.1 Flow

```
surface (viewer / reader / preview stage)
  └─ c/finalPdfModel  → doc (title, logo, banner, meta lines, blocks[])
  └─ c/finalPdfService.downloadPdf({ doc, tokens, loadImages, fileName })
        ├─ loadScript formPdf (once)            → PDFLib, fontkit
        ├─ c/finalPdfTheme.pdfTheme(tokens)     → colors, font keys
        ├─ fetch formPdfFonts/<family>-400/700  → TrueType bytes (same origin)
        ├─ loadImages(versionIds)               → base64 (Apex; §5)
        ├─ c/finalPdfWriter.renderPdf(...)      → Uint8Array
        └─ Blob URL + <a download>              → the file
```

A font or image that fails to load is left out (Helvetica stands in). Only a missing library or a
draw failure fails the download, with one message: "The PDF could not be made. Check your connection
and try again." It is shown under the button that was clicked, and the button stays usable.

### 4.2 Shared truths (no drift)

- Choice values print as **labels** through `c/finalAnswerText.optionLabel`, the resolver the reader
  already used (values are internal keys; RUNTIME_NOTES "values only, never labels" is about
  matching; this is about display).
- Scale points and bounds come from `c/finalSurveyPoints`, which the renderer now imports too.
- The staff PDF is built from the reader's own `sections`, so screen and paper say the same thing,
  orphaned answers and "Stored as text" notes included.

### 4.3 What a copy contains

- **Respondent copy:** the payload that was actually submitted (rule-hidden answers are already
  absent) plus the set of rule-hidden keys, so a hidden question is left out instead of printing
  "No answer". Pages and sections emptied by rules are dropped. Lookups print the picked record's
  **name** (it now rides `valuechange.detail.label`); a native lookup with no name prints its value.
  Consent statements print with Agreed / Not agreed. Rich text, images and callouts are **left out**
  of a copy (they are instructions, not answers).
- **Blank form:** every question with room to answer (lines, boxes, option circles and squares, scale
  circles, a matrix grid, one empty repeat entry), plus rich text, callouts, images and dividers.
- **Staff copy:** the reader's header (submission number, who, when, version) and rows, plus the file
  list.

### 4.4 Theme rules

- Tokens: the viewer's own (`getPdfSnapshot()` / `_cardTokens || tokens`) for live forms, the
  version's frozen `resolved.tokens` for a stored submission. Never re-resolved from the catalog.
- Colors: `var()` chains resolve through the bag; `color-mix(in srgb …)` is computed; a gradient
  gives its first stop; alpha is composited over what it sits on.
- Readability on white paper: body and muted text must reach 4.5:1 or fall back to `#1f2937` /
  `#526071`; the accent is darkened until headings reach 3:1; header text must reach 4.5:1 on the
  band or switches to the better of white and dark. A header that is just white gets an accent rule
  under it.
- Fonts: the bundled family a `--c-font-*` stack names first. Uploaded fonts and the installed-font
  ("system") stack can't be embedded: sans → Inter, serif → Noto Serif, mono → IBM Plex Mono.
- Characters the chosen font lacks print as `?`, never as an empty box. **Known limit:** the bundled
  fonts are Latin subsets, so Cyrillic, Greek, CJK, Arabic and similar answers print as `?` today
  (§9).
- Page size: Letter for US, CA, MX, PH, CL, CO, VE locales, A4 everywhere else.

## 5. Images and security

A form's logo, banner and image blocks are Salesforce Files on another domain, so the browser can
show them but not read their bytes. The server hands the bytes over:

- **Signed-in (`FinalPdfController.getImages(versionIds)`):** `with sharing`, **USER MODE**. The
  browser names files, and the user's own access decides; an unreadable id comes back in `skipped`,
  exactly like one that doesn't exist.
- **Guest (`FinalGuestController.getGuestPdfImages(formId)`):** behind the same hard gate as every
  guest method. **The guest names nothing:** the files are exactly the ones the active published spec
  references (`versionId` / `contentVersionId` anywhere in it). Served **only** when the author
  turned on `settings.completion.downloadCopy`. Deliberately *not* refused after the form closes:
  the response that filled the last place still gets its copy. These images are already public
  (ContentDistribution links), so this exposes nothing new.
- Both: images only (PNG, JPEG, GIF, WebP; GIF and WebP go through a canvas to PNG), ≤ 12 files,
  ≤ 2 MB each, ≤ 3 MB together. Sizes are checked before any blob is loaded.
- `finalFormViewer` still contains no guest code: the guest host passes its loader in through the
  new `pdf-image-loader` property (RUNTIME_NOTES "one renderer, two hosts").
- No answer ever leaves the browser for a PDF: the respondent copy is built entirely client-side.

## 6. Entry points (slice 1)

### 6.1 Respondent copy

- Spec: `settings.completion.downloadCopy` (boolean, default off) and
  `settings.completion.downloadLabel` (text, default "Download a copy (PDF)"). Design → After submit →
  Confirmation: a toggle and a label field (registry rows `asDownloadCopy`, `asDownloadLabel`).
  Completion **screen** only: Toast & go leaves at once.
- `finalAfterSubmit`: a secondary button under the message. Busy: "Preparing your PDF…", disabled,
  `aria-busy`. Failure: a line under the button (`role=alert`). Respondent tokens only.
- `finalFormViewer`: snapshots the submitted copy on every successful path (delegated, internal and
  preview simulation), builds the document on click. New `@api pdfImageLoader` and
  `@api getPdfSnapshot()`.
- Already-published forms change only when republished with the toggle on (the public site serves a
  published snapshot).

### 6.2 Staff copy

`finalSubmissionReader`: `lightning-button` "Download PDF" (utility:download) in the card's actions
slot (DESIGN_SYSTEM 5.1); "Preparing PDF…" while busy; failure as the card's existing error line.
Requires `FinalPdfController` access, added to Form Builder Admin and both Freeform Submission
permission sets.

### 6.3 Studio blank form

`finalPreviewStage`: a bordered icon button (DESIGN_SYSTEM 5.2) beside Restart preview,
"Download form as PDF". It reads `getPdfSnapshot()` from the viewer on the stage, so the PDF uses the
draft's live tokens. A failure shows as a line under the toolbar.

## 7. Slice 2 (not built): email a copy

The browser must **not** send the PDF to be mailed: a guest could then mail any content to any
address. The server builds the emailed copy itself, from what it stored:

1. Author setting `settings.completion.emailCopy: { enabled, emailElementId, subject, message }`.
   Publish warns if `emailElementId` is not an email question on the form.
2. After a successful submit (guest or internal), queue a `Queueable` with the submission Id. It
   reads the stored answers and the version spec, renders with `Blob.toPdf` from a server template
   (colors, logo and standard fonts; approximate branding by design, §2), and sends it with
   `Messaging.SingleEmailMessage` **only** to the address stored in that submission's
   `emailElementId` answer.
3. Rate limits: one email per submission (idempotent on the submission key), and per-address and
   per-form daily caps in a custom setting. Respect `Messaging.reserveSingleEmailCapacity`.
4. Org-wide email address for the From line; nothing sent when none is configured (publish warning).
5. Tests: answer-derived recipient only, cap enforcement, no send on failed submit, template escapes
   all answer text.

## 8. Before calling slice 1 done (in-org checks)

None of these can run outside an org. Record results in `qa/` with dates.

1. Deploy to `revclouddev`, including both static resources (check the zip stays under 5 MB).
2. LWR guest site: `loadScript` of `formPdf` works under LWS; `window.PDFLib` and `window.fontkit`
   are reachable; fonts fetch from `/sfsites/c/resource/...`; the Blob download works in Chrome,
   Safari (macOS and iOS) and Firefox. Publish a form with Download a copy on, then submit and
   download as a guest.
3. Guest profile: `getGuestPdfImages` returns the logo; a form with the toggle off refuses.
4. LEX record page: Download PDF on a submission; images for a user who can see the files, and a
   user who can't (images skipped, PDF still made).
5. VF Studio (`/apex/FinalStudio`) and the LEX tab: blank PDF with a built-in theme and a custom
   theme, wide and under 700px. Switch the respondent theme: the PDF repaints, the Studio doesn't.
6. Open each PDF in Acrobat and in Preview: fonts embedded, text selectable, page numbers right.
7. Iframe embed: the download works inside the embed snippet's iframe (if a browser blocks
   downloads from cross-site iframes, note it in GUEST_SITE_SETUP).

## 9. Later

- Non-Latin answers: a fallback font family (Noto Sans with Cyrillic, Greek and Vietnamese, then CJK
  on demand) and per-character font runs in the writer.
- Uploaded brand fonts: convert the uploaded WOFF2 to TrueType at upload time.
- Signature images in the copy, once `formSignature` ships.
- Optional content blocks in a copy (author toggle), and page size as an author setting.
