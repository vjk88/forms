# Build plan: stages 4 and 5, the form's font on the public site and an honest Studio preview frame

Status: building (2026-10-11). Stages 1 to 3 are merged (#374 to #382; #383 waits for the owner). **Stage 4 (B3) is built, deployed, measured and open as PR 385, waiting for the owner's word.** **Stage 5 is built, deployed to the dev org and measured on the Studio's own host (this PR).**

Source: `qa/CROSS_HOST_RENDER_AUDIT_2026-10-10.md` (3B for B3, 3E and section 9 decision 7 for the preview frame).

## 0. Decisions (owner, 2026-10-11)

- **Default preview profile: Public site, 15 px a side.**
- **B5 (a themed focus ring for radios, checkboxes and the toggle): skipped entirely.** Nothing is built for it.
- **Merge policy.** Stage 5 only changes the Studio's preview chrome, so it is merged as soon as it is green. Stage 4 (B3) restyles typed text on every published public form whose font is not the system font, so it waits for the owner's word.
- **The roughly 50 merged branches on GitHub are left as they are.** The repository keeps a merged branch on purpose (the setting `delete_branch_on_merge` is off); no branch is deleted.

## 1. In plain words

Two small things that make the three places a form shows up (the Studio preview, a Lightning page, the public site) agree with each other.

1. **The text people type uses the wrong font on the public site.** A form with a brand font shows its labels, titles and buttons in that font, but the text typed into a box, and the radio and checkbox option labels, come out in the site's own font. Lightning and the Studio already do it right.
2. **The Studio's Mobile preview is wider than a real phone page.** It draws the form 390 px wide, edge to edge. A real phone has two separate things: the **screen** (390 px) and the **margin the page leaves around the form** (the public site leaves 15 px a side, Lightning 28). So the real form is 360 px wide on the public site and 334 px in Lightning, and everything inside has 30 to 56 px less room than the preview shows (the 0 to 10 scale splits 7 + 4 in the Studio and 6 + 5 on the real page). There is also no 320 px option for the smallest phones.

## 2. Stage 4: B3, the font (PR 385)

`finalElementRenderer.css`, the `.field` rule gets the two public-site settings that the platform's widgets read, set to the form's own body-font token (`--c-font-body`, the same token our labels and titles use):

- `--dxp-s-form-element-text-font-family` for typed text;
- `--dxp-s-form-element-label-font-family` for option labels and the required star.

Both exist on the public site only; nothing sets a font on a Lightning widget, so Lightning and the Studio are untouched (pinned by `typedTextFont.test.js`).

**How it was found.** A census of every visible piece of text and its font on the full kitchen sink with a custom font, then each candidate setting put on the widget with a different font to see which one moved it (the hook scan in the probe).

**Measured (revclouddev, deployed and the site published).**

| Host | Kinds of text missing the form's font, before | after |
|---|---|---|
| Public site | 6 (text box, long answer, required star on text and dropdown, radio labels, checkbox labels) | 0 |
| Lightning viewer | 0 | 0 |
| Studio preview | 1 (a heading inside a Rich text block; needs `--lwc-fontFamily`, Studio only, parked) | 1 |

**Who sees a change.** Of the 32 built-in themes, 31 have the system font stack as their body font (Editorial Ivory uses a serif for titles only, which this does not touch) and the public site's own default is the same stack, so nothing visible changes for them. Neon Nights (geometric: Avenir Next, Century Gothic, Futura, Trebuchet) changes, and so does any form that picked Mono, Geometric or Humanist typography or uploaded a custom font. That is the intended result (answers match the rest of the form), and the reason this waits for the owner.

**Undo.** Revert the commit (one rule, two lines) and publish the site.

## 3. Stage 5: the preview frame (one PR, Studio only)

### 3.1 The model

A frame is three independent choices:

- the **screen**: Desktop 1280 x 800, Tablet 768 x 1024, or a phone of **320 x 568, 360 x 800 or 390 x 844** (the phone choice appears when Mobile is selected; 390 stays the default);
- the **host** the form is shown on, which decides the page margin around it: **Public site**, **Lightning page**, or **Edge to edge** (no margin, what the Studio drew until now);
- the zoom (Fit or 100%), unchanged.

**Form width = screen width - 2 x host margin.** The viewer is laid out at exactly that width, so every container query, theme padding and layout rule runs against the width the real page gives the form. No form width is hard-coded anywhere.

### 3.2 Measured margins (the same in-memory kitchen-sink form, signed-out public site and the Lightning viewer tab, 2026-10-11)

| Screen | Public site: form / answer column | Lightning page: form / answer column |
|---|---|---|
| 320 | 290 / 238 | 264 / 212 |
| 360 | 330 / 278 | 304 / 252 |
| 390 | 360 / 308 | 334 / 282 |
| 768 | 738 / 642 | 736 / 640 |
| 1280 | 1250 / 688 | 1248 / 688 |

So the **public site leaves 15 px a side at every width**, and **Lightning leaves 28 px a side on a phone (320, 360 and 390 alike) and 16 px at tablet and desktop**. The profile therefore keeps a margin per host and per screen kind (phone, tablet, desktop), not one number per host.

### 3.3 What is built

- `finalPreviewStage/previewFrame.js`: the model, a pure module with no DOM. It holds the screens, the phones, the hosts and their margins (with the measured table above in a comment), and `resolveFrame()` / `normalizeFrame()` (an unknown or missing key falls back to Desktop, 390, Public site, so older hand-offs still load).
- `finalPreviewStage` (js, html, css):
  - the canvas keeps the screen width and gets `padding-inline` = the host margin with `box-sizing: border-box`, so the viewer inside is exactly the form width; the scale, Fit and 100% math still uses the screen width;
  - the margin shows as two quiet hatched bands (pseudo-elements, so the form's own rounded corners never show a hatch behind them);
  - a **320 | 360 | 390** segmented control while Mobile is selected, and a **Shown on** dropdown (native select, the Studio's existing dropdown style) whose entries carry the number, for example "Public site · 15 px";
  - `getSession()` also hands back `phone` and `host`, and the Studio's Build/Design hand-off restores them.
- Nothing outside the Studio's preview chrome changes: the viewer, the theme engine and every shared renderer are untouched.

### 3.4 Tests

- `previewFrame.test.js`: form width = screen - 2 x margin for every screen and host, and equal to the measured table above; unknown keys fall back.
- `finalPreviewStage.test.js`: Mobile defaults to 390 with 15 px margins (canvas 390 wide, content 360); 320 and 360 resize the canvas and the device height; the phone control only shows on Mobile; the host select changes the margin and its option text; the session round trip keeps phone and host; Restart and Expand keep them; the existing tests stay as they are.

### 3.5 Acceptance (measured on the Studio's own host, `/apex/FinalStudio`, with the same in-memory form as the real hosts)

- Mobile + 390 + Public site: the form is **360** wide and the first answer box **308**, as on the public site; Lightning page: **334** and **282**, as in Lightning.
- 320 and 360 match the table within 1 px for both hosts (238 / 278 on the public site, 212 / 252 in Lightning).
- Tablet and Desktop match the table (738 and 1250 on the public site, 736 and 1248 in Lightning).
- Edge to edge reproduces the old frame exactly (390 wide).
- The toolbar still works in a narrow pane (it wraps instead of clipping), every control has a name for a screen reader, and Restart / Expand / Fit / 100% behave as before.

### 3.6 Risks

- **Studio-only cache.** The Studio page caches the old component bundle for about a minute after a deploy; measure after it has refreshed.
- **A stored hand-off.** The session object is in memory only (Build to Design); an old one without `phone` or `host` falls back to the defaults.
- **Lightning margin is for the viewer tab.** The 28 / 16 px figures are what the app page tab leaves; a Lightning record page can leave a different amount. The dropdown says "Lightning page", and the number is shown, so nobody reads it as a promise about every page.
- **Embedded surface.** The Studio and Lightning draw the form as an embedded surface (corner rounding, viewport-fill height) and the public site does not (section 4 item 4 of the audit); the Public site profile does not change that, it only fixes the width.

## 4. What was built

**Stage 4 (B3): PR 385, open, waiting for the owner's word.** As planned (section 2). Before/after picture sent in chat (public site, form font set to a serif so the difference is obvious).

**Stage 5: this PR.** As planned (section 3), plus one standing guard.

- `previewFrame.js` (the pure model) and `previewFrame.test.js` (13 tests: the measured form widths, form = screen - 2 x margin for every combination, Edge to edge = the old frame, defaults and per-key fallbacks).
- `finalPreviewStage`: the canvas is the screen wide with the host margin as `padding-inline`, the hatched bands, the 320 | 360 | 390 control (Mobile only), the "Shown on" dropdown, and a session that carries `phone` and `host`. Eight new stage tests; the 13 existing ones are untouched and green; the Studio suite is green.
- **Standing guard (not in the plan above):** `scripts/qa/phone-check.cjs` now also fails if the public site stops leaving 15 px on each side of the form (rule "page margin", self-test case 10), so a change to the site's page cannot quietly make the Studio's Public-site frame wrong again. Lightning's 28 / 16 px cannot be guarded the same way (it needs a signed-in session), so that column is a dated measurement.

**Measured on the Studio's own host** (`/apex/FinalStudio`, deployed to revclouddev, the same in-memory kitchen-sink form as on the real hosts): 15 frames, Desktop, Tablet and Mobile 320 / 360 / 390, each with Public site, Lightning page and Edge to edge. All ten comparisons with a real host match to the pixel, form width and first answer box (public 290 / 238, 330 / 278, 360 / 308, 738 / 642, 1250 / 688; Lightning 264 / 212, 304 / 252, 334 / 282, 736 / 640, 1248 / 688). Edge to edge reproduces the old frame (390 wide, answer box 338). The toolbar is one row in a wide pane and wraps to two rows in Build mode's narrow pane (763 px) with Mobile selected; nothing is clipped.
