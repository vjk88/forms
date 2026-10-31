# IMPL PLAN: header text fade (replaces the grey text plates)

Status: **BUILT as v6 (2026-10-31), branch `feat/header-fade`.** Read the v6 section first: it replaces the v3–v5 "CSS-defined text area" shape. Everything else below (rulings 1–5, plates removed in both states, eligibility, the viewer mapping, the switch and its storage, the Hidden-header flag, exposed edges) is built as written.

## v6: what changed after the first build (owner, 2026-10-31)

The v5 build (a full-width wash with a 160px strip reserved on the open side) was shown on the testtest banner and rejected: "no where close to the render you showed me". Two causes, two rulings:

1. **Shape: measure and hug the text.** The wash is solid from the first word to the last and fades to clear over 160px past them, like the mock. `c/finalTextFade` (shared by `finalFormHeader` and `finalNavSplitHero`) measures the glyphs of each text node, descending into open shadow roots. It deliberately avoids a Range over a whole block, because that also returns each paragraph's full-width box. The fade is cut at the surface edges: a span within 160px of an edge holds to it. A transform-scaled host (the Studio preview) is measured in the surface's own CSS px. Until the first measurement, and where it can't measure (no ResizeObserver, no Range rects, any error), the wash covers the whole surface. It re-measures on ResizeObserver (surface plus every block), after every render and once `document.fonts.ready` resolves. It writes `--fade-from` / `--fade-to` on the wash only when they change.
2. **Colour: the card's colour first.** The engine's header plate tries `[cardHex, headerHex, pageHex]` (it was header first), so the wash is white on light looks: marbleSplit goes from grey at 71% to white at 54%. It is still the faintest that reaches the 4.6:1 aim (`headerContrast.test.js` re-pinned).

**Dropped with v6** (no longer needed once the wash hugs the words):
- the reserved strips and the narrow full-wash rule;
- the `header-fade-width` and `header-pane-width` containers;
- the `.pane-content` wrapper and the hero-size move;
- the banner-bar compensation.

So the text never re-wraps, and nothing changes width when the switch is flipped. Badge and inline highlights are measured by their own box, so they no longer stretch: `justify-self: start` in logoBeside, `align-self: flex-start` in the pane. Banner bars are left out of the measured area, because they paint their own fill.

**Review fixes (uiux-flow-reviewer, 2026-10-31):**

- **Card first only where the title keeps its ink.** A plain card-first order flipped white titles to black under a white haze on auraSplit, botanicalSplit and marbleLuxury, and on the banner scope of five more. The engine now tries the card colour alone and keeps it only when the title colour doesn't move (`wordsSteps === 0`); otherwise it uses the old order.
  - `headerFadeInk.test.js` pins every gallery look's title colours, in every scope, to main's (`__fixtures__/headerInkMain.json`, generated from main's engine).
  - Descriptions may move a hair closer to their own colour (at most one unit on marble), never from dark to light.
- **Re-measuring.** It re-measures on any image load inside the surface (a late logo moves inline text without resizing anything) and on every `document.fonts` `loadingdone`, not just `ready`.
- **One RAMP.** The fade length is set in one place: JS writes `--fade-ramp`, and the CSS falls back to 0, which, with no edges set, is still the full wash.
- **Watching.** The watcher disconnects while the wash is off.
- **Exposed edges on a phone.** They keep the narrow-form padding cap, at 20px each (36px top and 20px bottom on a phone, instead of about 72px more).
- **Copy.** The On tile reads "A soft fade behind the text".
- **Left as is:** the engine still emits the now-unread `--c-header-plate-pad/-outset/-fit/-radius` tokens, which the engine tests pin, and the Hidden-header gate stays as ruled.

**Verified (Studio host, testtest, spec patched in flight, writes aborted): 96/96 checks.** Every word sits inside the solid span in:
- all five arrangements;
- long and wrapping text;
- a theme photo;
- Split carded at both sides and ratios, and immersive at both sides (title size unchanged);
- One at a time on vintagePaper and neonNights (exposed edges);
- the switch On → Off → On.

## What a person sees today

When header text sits on a photo, the theme engine puts a flat grey box behind each block of text (the "text plate", PR 410). One box sits behind the brand name, another behind the title and description, and they have different widths. The owner (2026-10-31): "who wants this ugly looking headers".

## What they will see

- **The boxes are gone.** A soft wash in the header's own colour sits behind the text and fades into the photo beside it. This is option 1 from the testtest mock.
- **A broader, predictable wash.** The text wraps inside a defined layout area. One continuous, full-height wash protects that entire area, then fades outside it. Short text does not make the wash shrink. On narrow surfaces the wash can cover the whole header.
- **Turning it off.** In Design → Header → Surface, a **Text fade** row of two buttons: **On** and **Off**.
  - **Off** removes the fade. It also removes every plate (header, highlight and Split pane) along with the spacing the plates added. The text sits straight on the photo.
  - The control's hint warns that text may be hard to read on a busy photo.

## Rulings (owner, 2026-10-31)

1. Option 1 (the fade), not the glow.
2. **Everywhere.** The fade replaces the plates on:
   - a form's banner photo;
   - theme header photos;
   - the Split brand pane;
   - the One at a time header on the page.
3. **Off means bare text with a warning.** No glow fallback.
4. It is a user-facing switch in Design → Header.
5. **Review corrections retained:**
   - plates go in both states;
   - Split gets the setting through the viewer;
   - protection covers every header text block, including Split's progress text;
   - the Design panel work and how the setting is saved are part of this change.
6. **Simplification approved for v3:** use CSS layout boundaries, not measured glyph bounds. Keep the existing contrast solver. Accept a broader wash in exchange for removing DOM Range measurement, ResizeObserver logic and font-load measurement callbacks.
7. **v4 engineering decisions:** preserve the header's arrangement DOM with padding; give Split a pane-sized query container with a descendant content area; soften exposed-page header edges only outside the text; scope the Hidden-header exception to this control. Details and validation requirements follow.
8. **v5 refinements:** keep each arrangement's current banner-highlight width (measured first, compensated only where the bar spans today); express the Hidden-header exception as a registry condition flag; check flush alignment by position at named widths; state the edge-spacing change with its exact scope.

## Engineering calls (mine, listed so you can overrule them)

### Plates are removed in both states

A box-shaped plate is never drawn again, whichever way the switch is set.

- Every plate painter stops reading its plate: `finalFormHeader` (`.lockup-text`, `.brand-wordmark`), `finalFormHighlight`, and `finalNavSplitHero` (`.pane-title`, `.pane-subtitle`, `.pane .progress-text`, `.pane .brand-wordmark`).
- Those painters drop the plate background, plate padding, negative side margin (outset) and Split's plate-specific `fit-content` width. Highlight badge/banner fills and their normal spacing remain; only the inline highlight's contrast plate is removed.
- **Banner-highlight width contract.** The reserved strip must not change any highlight's current rendered width.
  - Today `.hdr` is a flex column with `align-items: flex-start` and `.hdr-highlight` has no width rule, so in stacked, textOnly, inline and centered the host shrinks to its content, and `.hl-banner`'s `width: 100%` is only as wide as its own text. Those arrangements need no compensation unless the bar wraps.
  - In **logoBeside**, `.hdr-highlight` is a grid item spanning `1 / -1` and stretches, so the bar spans the full content width today. Only there is the strip compensated: set the host's width explicitly to the content width plus the strip (from the same shared variable) and align it to the start edge. A negative margin alone is not enough, because it does not enlarge a `width: 100%` element.
  - **Split pane:** measure the pane's highlight host width in the browser first. Compensate the same way only if it spans the pane's content today.
  - Measure each case's rendered bar width before the change and require the same width after it, with the switch On and Off.
- Removing all four means no empty plate spacing is left behind. The deliberate transition-strip spacing described below replaces it and is identical with the switch On and Off.
- The engine's plate tokens become **input to the fade only**.

### When the fade appears

The fade is drawn only where both of these hold:

- the engine produced a non-transparent plate colour for that surface (`--c-header-plate`, `-page`, `-banner`; Split reads the same through `paneStyle`), meaning its colour solver needed backing on that surface;
- the switch is not Off.

A surface with no plate, or an explicitly transparent plate token, gets no fade. The existing surface-specific token selection remains authoritative, including banner and One at a time page scopes.

### Default and eligibility

- The switch is On for every form, old ones included. Nothing stored changes: the spec holds `header.textFade: false` only when someone switches it off.
- **Eligibility limit:** the engine is unchanged, so the fade can only appear where the theme engine writes plate tokens. A legacy theme snapshot without those tokens never drew a plate, and it gets no fade either. "On by default" means on wherever a plate would have been drawn.

### Strength

- Over the protected text, the fade uses exactly the plate colour and opacity the engine works out today.
- That is the faintest wash at which the header solver reaches its **4.6:1 aim for both the title and the description** (`TEXT_AIM`, `headerColours` in finalReadableText).
- Preserve the solver's existing contrast result by keeping that colour and opacity constant everywhere behind the protected text. The transition must never run underneath it.
- This is a contrast calculation for the colours/layers the engine models, not a claim of "98% accurate readability" for arbitrary content. Existing exceptions, including author-supplied inline rich-text colours and legacy snapshots, remain exceptions. No photo-pixel analysis or new runtime readability detector is added.

### CSS-defined protected text area

The layout defines the protected area before text renders. CSS uses the same boundaries for the content and the wash, so no script needs to find where the letters end.

- **Header:** retain the existing direct children of `.hdr`; do not insert a content wrapper. Reserve the horizontal transition space as additional padding on `.hdr`, keeping its flex/grid arrangements and `.arr-logo-beside .hdr-highlight` relationship intact. Fold the extra spacing into the existing padding rules, including `.hdr.hdr--flush`, rather than relying on a less-specific override.
- **Split pane:** add one `.pane-content` child containing branding, all zones, divider and progress. The banner and fade remain sibling layers. Move the pane's content padding and vertical flex distribution to this child; keep the outer `.pane` responsible for grid position, sticky behavior, surface, clipping and overall height. The child fills the available pane height without adding another scrolling region. Transfer the existing narrow row arrangement to the child and preserve which zones are hidden.
- Text wraps within these boundaries. Apply `min-width: 0` to the relevant flex/grid content and `overflow-wrap: anywhere` directly to the rich-text hosts at **every width**, not only inside the current narrow rule. Keep constraints for logos, highlights and supported rich-text images too; long words are not the only possible overflow source. Do not inspect the shadow DOM of `lightning-formatted-rich-text` or the highlight component.
- Use shared CSS custom properties for the reserved transition space and content boundary. Content sizing and gradient stops must reference those same values in the same coordinate system, accounting for existing padding and borders.
- For a surface that has a plate, keep the content area identical with Text fade On and Off; switching the wash must not change line wrapping or text position. Surfaces without a plate retain their existing content width.
- Off therefore leaves an unused side strip on wide surfaces. This is intentional and must be included in the visual review, rather than treated as leftover plate padding.

### Query the actual surface width

- **Header:** use the header component's block host as a named `header-fade-width` inline-size container, with `width: 100%`, `min-width: 0` and `box-sizing: border-box`. Its child `.hdr` can then change padding at the actual header width, including a narrow max-width card on a wide form. Do not approximate this with the whole-form width or make `.hdr` query its own size.
- Keep existing `@container final-form-viewport` rules named and unchanged in purpose. A new unnamed query must not accidentally select the fade container. Audit container-relative units as well: names do not stop `cqi`/`cqw` from resolving against a nearer container. In particular, verify the flush header still aligns with the progress strip's `--c-strip-inset` at every host width.
- **Split:** make the existing outer `.pane` a named `header-pane-width` inline-size container, with border-box sizing, a full-track width and `min-width: 0`. Move its content padding to `.pane-content` so the container's content-box width and the layer's horizontal extent use the same basis. Target `.pane-content` and the fade layer in this query; a query cannot restyle its own `.pane` container.
- Preserve the existing `split` container for whole-layout stacking, ratio/side rules and narrow visibility. A 300px pane in a 900px layout gets a full wash without switching the entire layout to its phone arrangement.
- Preserve the existing hero type scale: `--c-fs-hero` contains `4cqw`, currently based on the whole Split. Resolve it as the real `font-size` on `.pane` (whose query ancestor is still `split`) and let the title inherit that computed size through `.pane-content` and the zones. Retain the existing explicit compact-title override. Do not re-evaluate that token on the title inside the new pane container. Verify other text retains its own explicit type tokens.

### Shape and responsive defaults

- One layer covers the surface's **full height**. It has no separate rectangles around individual text blocks, and it follows the surface's corner radius.
- **Left-aligned arrangements:** reserve a right-hand transition strip, initially the smaller of 160px or 20% of the surface width. The wash stays at the solver's opacity from the left edge through the protected content area, then fades to clear across that strip.
- **Centered arrangement:** reserve matching strips on both sides, each initially the smaller of 80px or 10% of the surface width. The central content area has constant wash strength, with transitions outside it on both sides.
- These strip sizes are engineering defaults for visual validation, not new author controls. Normal content padding is inside the protected area; it must not push text into the transition.
- **Narrow header or pane (540px or less):** reserve no transition strip. Let the content use its normal available width and apply an even wash over the entire surface. Base this on the header/pane's available width, not only the browser viewport; a narrow Split pane on a wide screen also needs this behavior.
- There is **no runtime overflow detector**. Wrapping, shrinkable tracks and media constraints must keep supported content inside the area. If browser validation identifies an arrangement that needs a full wash, encode a deterministic arrangement/width rule before shipping and test it; do not add measurement or silently clip content.
- **Trade-off:** the wash stays broad when the text is short, and reserving a strip can make long text wrap sooner on wide surfaces. This is accepted in place of precise text measurement. Check the final balance with the real-host screenshots below.

### One at a time over an exposed page

- A wash ending abruptly at a transparent header's top/bottom can read as a rectangular band over the continuous page background. This is a visual concern to validate, not a reason to reduce the wash under text.
- **Chosen treatment:** add vertical feathering only when the One at a time open-page header exposes the page directly: no rendered banner, no theme header image/gradient, and a transparent header fill. The `-page` suffix alone is insufficient; it also covers headers with their own surface. Keep authored fills/photos unchanged, including translucent fills.
- Reserve explicit top and bottom transition space inside that header, initially **32px at each edge**, in addition to the normal content padding. The wash reaches full solver strength before any content begins and stays there until all content ends. Fade the wash to transparent within the reserved edge strips. Horizontal fading, where present, remains outside the content as well.
- Apply the vertical mask/gradient to the decorative wash only, never to the text or entire header. Its opacity is 1 throughout the protected area; do not stack two overlapping colour washes that change the solver's alpha. With no mask support, retain the full-strength wash as the accessibility fallback and record the hard-edge limitation.
- **Scope of the spacing change.** It applies only to One at a time open-page headers that expose the page (as defined above) **and** get a non-transparent plate from the engine. Legacy snapshots without plate tokens, and headers with their own surface, keep today's spacing.
- **Visual trade-off, documented.** The two edge strips add 64px in total, which is noticeable on a phone. 32px per edge is a starting value to validate in the screenshots, not a fixed number; it may come down if the feathering still reads softly.
- Keep these edge strips in both switch states for eligible exposed-page headers. This intentionally adds breathing space above the lockup and before the following progress strip, replacing the current zero-bottom-padding flush behavior in this case only. Verify this spacing in the real-host review.
- Keep feathering inside the header's layout box. Do not rely on overflowing the page frame or paint the wash over the following progress/navigation controls. Narrow surfaces use a full-width wash with the same outside-text vertical feathering.

### Rendering and changes

- The protection and content boundaries exist together on first paint. There is no initially unprotected state or post-measurement narrowing.
- Content edits, font loading, typography changes and resizing reflow inside the same CSS area. No DOM `Range`, `getClientRects()`, text-bound measurement, ResizeObserver or `document.fonts.ready` callback is needed for the fade.
- Theme/banner/layout changes must update the selected plate colour and eligibility along with the content-area mode. Keep the fade colour connected to the current surface tokens; do not cache an initial computed colour indefinitely.
- Derive presentation context from the viewer's already-resolved tokens and layout/header data, and pass it reactively to the header/pane. It includes plate eligibility and the exposed-page treatment; it is not saved in the spec. Use exactly the same base/page/banner precedence as the colour painter, treating explicit `transparent` as an override rather than falling back to another scope. No DOM measurement is needed to decide these states.
- Use the full-surface wash as the CSS fallback where the responsive layout cannot be applied. The layer is decorative (`aria-hidden`), does not intercept pointer events, and remains above the image but below all content.

### No strength slider

The owner asked for a way to remove it.

## Build

1. **`finalFormHeader`**
   - Add a `.hdr-fade` layer above `.banner-layer` and below the content.
   - Drop the plate painting from `.lockup-text` and `.brand-wordmark`: background, padding, outset.
   - Preserve the arrangement DOM; reserve strips through padding. Add the named host-width query and the exposed-page vertical treatment described above. Derive gradient and content boundaries from shared CSS values, including flush-mode padding.
   - Read `hdr.textFade`.
2. **`finalFormHighlight`**
   - Drop its plate painting in both states.
3. **`finalNavSplitHero`**
   - Add the same fade layer in the pane.
   - Drop the plate painting on the title, subtitle, progress text and brand name, including the `fit-content` width.
   - Add `.pane-content` and the named pane-width query. Transfer padding and vertical layout while preserving sticky behavior, whole-layout stacking and existing grid tracks. Preserve the whole-Split hero font size as described above.
   - Read a new `paneTextFade` option.
4. **`finalFormViewer`**
   - On `ownsHeader` layouts, map `header.textFade` to `options.paneTextFade` **every time**.
   - That mapping is independent of `paneConfigured`, the lockup mapping and the banner mapping. A Split pane with its own words still follows the switch.
   - Pass reactive presentation context for effective plate eligibility and exposed-page treatment, derived from current resolved tokens. Cover theme/banner/layout changes and completion without persisting derived state or changing the contrast engine.
5. **`finalDesignRegistry`**
   - Add a **Text fade** control to Header → Surface:
     - type `tiles`, with the options **On** and **Off**;
     - path `header.textFade`;
     - hint: "Adds a background fade where needed to help header text stand out. Off: text may be hard to read over photos.";
     - visible on `ownsHeader` layouts regardless of a saved `header.style: 'none'`; otherwise hidden when the header style is Hidden. Split still shows its pane when a previous layout left that value behind.
   - Check that the Design sections still pair up one-to-one.
   - Keep the control visible on applicable plain headers too: the hint explains why a currently readable surface may show no visual change. Do not gate it on the presence of an uploaded photo; theme photos and other difficult surfaces also qualify.
6. **`finalDesignPanel`**
   - Tiles today write their option value as a string. Add an optional `store` map on a tiles control (`{ on: undefined, off: false }`) and a matching `read` function, so:
     - **Off** saves the boolean `false`;
     - **On** removes the property, because the existing `_apply(key, undefined)` calls `deleteAt`;
     - the lit tile comes from `value === false ? 'off' : 'on'`.
   - The rendering is the existing tiles markup; no new control type.
   - Express the visibility exception in the **registry**, as a flag on this control's condition: `needsValue: [{ key: 'headerStyle', notEquals: 'none', unlessOwnsHeader: true }]`.
   - In the shared `_unavailableReason` path (used by rendering and by search/shortcuts), skip a condition that carries `unlessOwnsHeader: true` when `this.layoutInfo.ownsHeader` is true. No control key is named in panel code.
   - Do not globally skip conditions merely because their dependency control is unavailable. Conditions without the flag behave exactly as today, including on Split. Test both the visible UI and the edit/search availability path.
7. **Theme engine:** no change. The comment over the plate CSS in `finalFormHeader` is reworded: the tokens now feed the fade.

## Tests (Jest: state and component contracts)

- **No plate anywhere:** verify both states select the new rendering path for header, inline highlight and Split. Check removal of the old plate bindings; check actual CSS painting in the browser validation below.
- **CSS source guard:** follow the declaration-reading approach in `finalThemeEngine/__tests__/textContrastCss.test.js`. Reject old plate colour/pad/outset/fit bindings on the listed text painters, including aliases that resolve to them. Allow plate colours on the new decorative fade layers and preserve badge/banner styling. This is a source regression guard, not proof of computed browser styles.
- **On → Off → On:** protection is enabled, disabled and enabled again without changing the protected content-area mode.
- **Eligibility and scope:** absent or transparent plate tokens produce no fade; cover legacy snapshots and the base, banner and page token scopes. Changing theme, removing a banner or switching layout must not retain stale eligibility/colour.
- **Arrangement contracts:** the protected area contains every applicable text block for all five arrangements; no geometry stubs or measurement APIs are required.
- **Exposed-page treatment:** cover transparent open-page headers, local banners, theme images/gradients and nontransparent fills. Only the first case gets vertical feathering. Changing any of these inputs updates the treatment, including while the switch is Off.
- **Split:**
  - the viewer maps `textFade` when the pane has its own words and when it borrows the header's;
  - progress text belongs to the protected content area;
  - switching from a Hidden header to Split leaves Text fade available.
- **Panel:**
  - clicking Off emits a spec with `header.textFade === false`;
  - clicking On emits one without the key;
  - the lit tile follows both;
  - save and reload (the spec goes through JSON and is mounted again) keeps both states.
  - Hidden on an ordinary layout blocks the control in both rendering and search/edit paths; Split ignores that stale setting; switching back restores the gate. Existing controls' dependency tests still pass.
  - A condition **without** `unlessOwnsHeader` still blocks its control on Split (a registry fixture with a Split-applicable control proves it); only flagged conditions are skipped.
- The header test runs across all five arrangements: stacked, logoBeside, textOnly, inline and centered.
- Jest checks state, mappings and markup contracts. It does not prove wrapping, container-query behavior, gradient coverage or rendered contrast; those checks require a real browser.

### Existing regression tests to read and retain

All paths below are relative to `force-app/main/default/lwc` and were verified in this worktree.

- `finalFormHeader/__tests__/finalFormHeader.test.js`: extend for fade state, exposed-page mode and preserved arrangements. Keep banner-layer and `has-banner` scope checks; update exact style-string expectations only where the intended presentation changes require it.
- `finalThemeEngine/__tests__/headerContrast.test.js`: retain numeric plate colours, contrast assertions and legacy behavior. Those tokens now feed a wash; their values must not change. Descriptive test names/comments may be clarified without weakening assertions.
- `finalNavSplitHero/__tests__/bleedTracks.test.js`: this pins grid-track order and dimensions, not plates. Keep its expectations unchanged while adding the pane-content wrapper.
- `finalThemeEngine/__tests__/textContrastCss.test.js`: retain its existing checks and add or reuse a focused CSS guard for the removed text plates. Do not delete inventory coverage just to accommodate new styles.
- `finalFormViewer/__tests__/headerPaneMap.test.js` and `finalDesignPanel/__tests__/finalDesignPanel.test.js`: extend the real mapping, boolean storage and narrowly scoped availability contracts.

## Checking it in the org

- When implementation is authorized, deploy only the changed components with targeted `--source-dir` paths, then publish the test site as required for validation.
- Playwright on the Studio preview (`/apex/FinalStudio`), in Lightning, and on the public site:
  - testtest's banner;
  - a theme with a header photo;
  - a Split form (wide and narrow);
  - carded Split at both sides and both ratios, including a roughly 300px pane in a 900px layout; immersive Split at both sides and its existing width choices;
  - One at a time;
  - each arrangement;
  - short and multiline text, long unbroken words/URLs, inline rich-text formatting, logos, inline highlights and badge/banner highlights;
  - live changes to font family, size and weight after the first render, including a newly loaded font;
  - a narrow header/pane on a wide viewport, plus phone width;
  - each one with the switch On, then Off, then On.
- **Flush alignment by position.** On One at a time with the flush header, measure where the header text and the progress strip actually start (their rendered left edges, and right edges), not only that they share `--c-strip-inset`. Check widths 520, 600, 750 and 850px (where `clamp(20px, 4cqi, 35px)` is unclamped) and just either side of 540px. If the edges differ, fix the shared width reference before shipping.
- **Banner-highlight width.** Before and after, measure the rendered `.hl-banner` width in stacked, centered, inline, logoBeside and the Split pane, switch On and Off. Each must match its before-width.
- Verify actual header width at both sides of 540px even when the surrounding form is wide. Check that the new named containers do not change existing type scales, flush header/progress alignment or whole-layout breakpoints. Compare Split title size before/after at the same whole-layout width.
- For the exposed-page case, check top/bottom edges over both bright and dark page imagery, short and multiline lockups, and phone width. Confirm no vertical fade crosses text, no clipping produces a hard cutoff, and the added spacing before progress is acceptable. Headers with their own surfaces retain their normal edges.
- Check that every visible text block stays within the constant-strength area, all transitions start outside it, and narrow surfaces use the full wash. Test actual Salesforce rich-text components, not only mocks.
- Check On → Off → On preserves text positions and wrapping, no plate background/spacing remains, and badge/banner styling is preserved. Verify the wash does not block links or controls.
- Measure contrast over the wash where the text sits for engine-controlled colours. Record authored-colour exceptions separately; do not present contrast results as a universal readability percentage.
- **Save and reload in the Studio:** set Off, save, reload; it is still Off. Set On, save, reload; it is still On. This uses a scratch form, not the owner's.
- Then a test sheet for the owner, click by click, using the exact labels on screen.

## Not in this change

- Parked-work row 40 (header text over a faded banner has no scrim) is covered by the fade wherever a plate was drawn. It is marked done only if the screenshots show it.
