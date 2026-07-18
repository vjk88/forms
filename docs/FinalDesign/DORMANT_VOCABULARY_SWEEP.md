# Dormant Vocabulary Sweep (reverse audit)

**Date:** 2026-07-14 · **Status:** RULINGS EXECUTED (owner approved 2026-07-18)

- Fake-copy fixes → **PR #122** (callout + consent honest frames; empty consent
  loses its checkbox).
- DELETE sweep → **PR #123** (all 9 reads removed; zones now collapse at one
  always-on 540px constant; theme-level Outline/Subtle verified token-path-safe
  before the class values were trimmed).
- BUILD slices → three IMPL\*PLAN docs awaiting owner review before code:
  IMPL_PLAN_ACCORDION_OPTIONS · IMPL_PLAN_SPLITHERO_PANE_CONTROLS ·
  IMPL_PLAN_HEADER_PANE_SURFACE_MAP (contains one owner decision: paneBg end
  state — and a trace discovery: header Fill already reaches the pane via
  --c-header-bg, so only the banner image needs plumbing).
- KEEP rows unchanged, documented in their files' JSDoc.

The forward audit (DESIGN_CONTROL_AUDIT.md) started from panel controls and checked
each one paints. This sweep runs the OTHER direction: start from every config key the
final\* **render code reads** (a "reader"), and hunt for a **writer** — any UI that can
actually set it (Design-panel registry path, Studio inspector / property panel, theme
catalog preset, creation-gallery seed). A reader with no writer is **dormant
vocabulary**: code that promises a feature nothing can switch on. This is the bug
class behind the paneTitle incident (2026-07-12).

**Plain language:** _reader_ = render code that paints a value if present. _writer_ =
a place a human (or the product) can put that value into a form's spec. _Dormant_ =
painted if it ever appeared, but nothing today can make it appear.

## Method

1. Extracted every `options.* / header.* / section.* / element.* / submit.* /
settings.*` read across all 45 final\* components.
2. Extracted every writer: 43 registry `path:` + 45 `themePath:` entries, all
   `_prop()/_config()/repeatchange/blockstylechange` patches in finalPropertyPanel,
   studio canvas writes, theme-catalog presets, sample-spec/gallery seeds.
3. Cross-checked CSS custom properties: 77 tokens emitted by finalThemeEngine vs
   every `var(--c-*)` consumption in final\* CSS/JS (multiline `var(` wraps and
   programmatic `getPropertyValue` reads accounted for).
4. Every DORMANT verdict below was verified by a repo-wide writer grep, not JSDoc.

## Verdict summary

- **CSS tokens: CLEAN.** All 77 emitted tokens are consumed; nothing consumed is
  unemitted. (`--c-nav-sticky` is set programmatically by finalPageFrame in LEX
  embeds — pageFrame.js:125; the only other suspect was comment text.)
- **Header model: CLEAN.** Every `header.*` key and every arrangement/style VALUE the
  renderer supports is writable from the panel.
- **After-submit, stepper, oneAtATime, scroll: CLEAN.** Every option read has a
  registry writer (incl. `redirectUrl`, executed by finalFormViewer.js:599-607).
- **20 dormant keys + 2 dormant value-sets** remain, all cataloged below (count
  corrected 2026-07-18: splitHero `side` was missed by an appliesTo-blind writer
  check — see the correction note in the Split Hero table).

## Ledger — dormant keys (reader line-refs verified 2026-07-14)

### finalNavSplitHero (reader: finalNavSplitHero.js)

| Key                        | Reader    | What it would do                             | Verdict                |
| -------------------------- | --------- | -------------------------------------------- | ---------------------- |
| `side`                     | :117      | `'right'` → brand pane on the right          | DORMANT (on splitHero) |
| `ratio`                    | :118      | `'third'` → 1/3 pane instead of 1/2          | DORMANT                |
| `sticky`                   | :124      | `false` → pane scrolls away (non-bleed only) | DORMANT                |
| `paneImage`                | :151      | pane background image `{url}`                | DORMANT                |
| `paneBg` / `paneBgOpacity` | :150/:164 | pane fill override + veil strength           | DORMANT                |
| `blockPlacement`           | zoneList  | per-block Top/Center/Bottom overrides        | DORMANT                |

**`side` correction (2026-07-18, owner-caught):** the first pass marked splitHero
`side` product-set because a registry writer for `layout.options.side` exists
(registry :494) — but that control is gated `appliesTo: { layouts: ['rail'] }`, and
options are layout-scoped (the panel rebuilds them on every layout switch,
designPanel.js:883-897), so it can never write into a splitHero spec. Writer checks
must include the `appliesTo` gate, not just path existence. Rail's own `side` stays
product-set.

`paneTitle/paneSubtitle/paneBrandName/paneLogo/paneHighlight` are **DERIVED, not
dormant**: finalFormViewer.js:243-250 copies `header.*` into them at runtime (Design ›
Header IS the pane editor). No authoring surface writes them directly — the "explicit
pane config wins" branch (:235-241) only fires for hand-seeded legacy specs.

### finalNavRail (finalNavRail.js)

| Key      | Reader | What it would do                        | Verdict |
| -------- | ------ | --------------------------------------- | ------- |
| `sticky` | :59    | `false` → rail scrolls away             | DORMANT |
| `dock`   | :63    | `false` → rail loses its docked posture | DORMANT |

### finalNavTabs / finalNavAccordion

| Key              | Reader        | What it would do                                                                 | Verdict |
| ---------------- | ------------- | -------------------------------------------------------------------------------- | ------- |
| `showTabIcons`   | tabs :76      | page icons on tabs — **doubly dormant**: `page.icon` itself has no writer either | DORMANT |
| `allowMultiple`  | accordion :84 | several panels open at once                                                      | DORMANT |
| `firstPanelOpen` | accordion :41 | `false` → all panels start closed                                                | DORMANT |
| `iconPosition`   | accordion :48 | `'trailing'` chevron side                                                        | DORMANT |

### Zones (finalLayoutZones.js, viewer merge finalFormViewer.js:316-319)

| Key                                 | What it would do                        | Verdict                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zonesDefault.arrangement` / `.gap` | section grid arrangement + gap          | SEED-ONLY — creation/switch writes fixed `{arrangement:'single', gap:'md'}` (designPanel.js:902, sampleSpec.js:111); no control ever edits them, other arrangements/gaps unreachable |
| `zonesDefault.collapse`             | early/standard/late responsive collapse | DORMANT — no writer at all                                                                                                                                                           |
| `page.zones` (per-page override)    | per-page arrangement                    | DORMANT — viewer merges it (:318), nothing writes it                                                                                                                                 |

### Section / element / submit

| Key                                            | Reader                        | Verdict                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `section.surface` `{bg,border,shadow,padding}` | sectionRenderer :44-56        | DORMANT — SURFACE_MODEL_SPEC vocabulary landed renderer-first; no writer yet                                                                                       |
| `section.style` values `outline/subtle/flat`   | sectionRenderer :16,:40       | DORMANT VALUES — Block style control offers plain/card/boxed, and only for standalone content blocks; regular sections can't set style at all (always `card`)      |
| `element.disabled`                             | elementRenderer.html :35,:105 | DORMANT — Behavior writes `required/readOnly`, never `disabled`                                                                                                    |
| `element.labelPosition` (per-element)          | elementRenderer :252          | SEED-ONLY (sampleSpec writes constant `'top'` — the default). **By design:** owner ruled no per-field label styling (BUILDER_SURFACES); theme-level control exists |
| `element.labelStyle` (per-element)             | elementRenderer label classes | DORMANT — same owner ruling; theme-level `labelStyle` is the product surface                                                                                       |
| `element.config.height` (spacer px)            | elementRenderer :220          | DORMANT — legacy numeric tolerance; panel writes `size` presets                                                                                                    |
| `submit.placement`                             | submitBar :47                 | DORMANT — `'sticky'` submit bar; only legacy layoutModel presets ever wrote it                                                                                     |
| `highlight.variant/icon/dismissible`           | formHighlight                 | DORMANT (known — PR #116 JSDoc) — panel writes text + placement only                                                                                               |

## Related finding — fake-copy fallback bug class (NOT dormancy; owner just hit this)

Same class as the `Add your text…` bug fixed in PR #118, still present in
finalElementRenderer:

- **Callout** with no message → renders literal `Callout message…` (:236)
- **Consent** with no terms → renders literal **`I agree to the terms.`** (:240) — a
  guest-checkable fake consent line on a live form. Worst of the three.

**Fix:** PR #118 honest-frame treatment, adapted per block:

- **Callout** — empty `html` → the dashed hint frame ("Callout — write the message in
  its properties"); never literal copy. Tone icon stays out of the empty state.
- **Consent** — empty `html` → hint frame ("Consent — write the terms in its
  properties") **and suppress the checkbox**: a consent with no terms must never be
  something a guest can check. (Empty + `required` would otherwise gate submit on
  agreeing to nothing.)

## Recommended fixes (owner rules per row; recommendations only, no code changed)

Legend — **KEEP**: leave the reader, one-line DORMANT JSDoc (the PR #116 convention),
zero cost. **BUILD**: add the writer; each build is its own slice with an
IMPL_PLAN\_\*.md first, per process. **DELETE**: remove the reader + its CSS/tests in
one cleanup PR.

### Split Hero

| Key                                      | Rec                                     | How                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ratio`                                  | **BUILD**                               | Registry select `layout.options.ratio` ('' = Half, `third` = Third), appliesTo splitHero, beside Progress style. The reader already works — this is a ~10-line registry entry + jest. Cheapest real feature in the ledger.                                                                                                                                                                                                                                |
| `side`                                   | **BUILD (same slice as ratio)**         | "Pane side" select ('' = Left, `right` = Right) in the splitHero group — a NEW control writing the same `layout.options.side` path. Don't widen the rail control's appliesTo: it lives in the rail-labeled "Side rail" group (registry :486-500). Reader :117 already works.                                                                                                                                                                              |
| `paneImage` / `paneBg` / `paneBgOpacity` | **BUILD via mapping, not new controls** | Don't invent pane-specific controls. Lift the `notLayouts: ['splitHero']` gate on the Header fill/banner/opacity controls (registry :715/:723) and extend the viewer's header→pane copy (finalFormViewer.js:243-250) to also map `header.bgImage → paneImage` and header fill → `paneBg`. One editor (Design › Header) drives the lockup on every layout; no new vocabulary, and the pane finally honors the image the panel already knows how to upload. |
| `sticky` (pane)                          | **KEEP**                                | Sanctioned escape hatch (owner sticky-pane ruling 2026-07-11, non-bleed only). Expose only if a pinning pass ever lands.                                                                                                                                                                                                                                                                                                                                  |
| `blockPlacement`                         | **DELETE**                              | The shipped `highlightPlacement` control covers the real need (highlight above title / bottom). The zoneList default map stays as internal mechanism; only the `opts.blockPlacement` override read goes.                                                                                                                                                                                                                                                  |

### Rail / Tabs / Accordion

| Key                                                           | Rec                  | How                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rail `sticky` / `dock`                                        | **KEEP**             | Escape hatches; LEX pins everything static anyway (finalStuck discovery: no current host pins). Deleting saves nothing, exposing helps nobody.                                                                                                                                      |
| tabs `showTabIcons` + `page.icon`                             | **DELETE (default)** | Making it real needs TWO writers (a page-inspector icon picker + a registry toggle) for a decoration nobody asked for. If the gallery-coherence pass wants page icons, rebuild both writers then — reuse the section icon-grid machinery. Until ruled otherwise, delete both reads. |
| accordion `allowMultiple` / `firstPanelOpen` / `iconPosition` | **BUILD**            | One small slice: an Accordion layout group in the Design panel (two toggles + a Leading/Trailing segmented). Readers already work; accordion is the only layout shipping ZERO options today.                                                                                        |

### Zones

| Key                                 | Rec                    | How                                                                                                                                                            |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zonesDefault.collapse`             | **DELETE**             | Schema §4 never specced it; the file itself admits only `'source'` order exists (finalLayoutZones.js:11). Remove the read + the three collapse-\* CSS classes. |
| `page.zones` per-page override      | **DELETE**             | Remove the merge in finalFormViewer.js:318. Resurrect only if per-page layout ever gets specced — the git history keeps the recipe.                            |
| `zonesDefault.arrangement` / `.gap` | **KEEP (frozen seed)** | Working mechanism behind every form; just not author-editable. If the styles pass wants page-level arrangement, promote to a "Page layout" control then.       |

### Section / element / submit / highlight

| Key                                          | Rec               | How                                                                                                                                                                       |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `section.surface`                            | **KEEP**          | This is SURFACE_MODEL_SPEC's landing zone — the writer arrives with the scheduled Section-as-surface work. Deleting it now = re-typing it later.                          |
| `section.style` values `outline/subtle/flat` | **DELETE values** | Trim KNOWN_STYLES (sectionRenderer :16) to the three the Block style control offers. The 2-click rule says don't grow the segmented control to six.                       |
| `element.disabled`                           | **DELETE**        | Remove both HTML binds; `readOnly` (Behavior control) is the product surface for non-editable fields.                                                                     |
| per-element `labelPosition` / `labelStyle`   | **KEEP**          | By-design dormant (owner ruled label styling global-only). The theme-level controls are the product surface; surgery on the label machinery buys nothing. One-line JSDoc. |
| `element.config.height` (spacer px)          | **DELETE**        | No final-build spec ever carried it (born in the legacy schema); the panel writes `size` presets. Drop the numeric branch (elementRenderer :220).                         |
| `submit.placement`                           | **DELETE**        | Sticky submit bar was never ruled into LAYOUT_REFINEMENTS. Remove the read (submitBar :47) + the `.sticky` CSS block.                                                     |
| `highlight.variant` / `icon`                 | **KEEP**          | Honest future candidate (a "highlight tone" control mirrors the callout tones). Documented DORMANT since PR #116.                                                         |
| `highlight.dismissible`                      | **DELETE**        | Guest-side dismiss state with no persistence story — a guest re-sees the highlight on every page anyway.                                                                  |

### Suggested execution order

1. **Fake-copy fixes** (callout + consent) — bug-class closure, one PR, mirrors #118.
2. **The DELETE sweep** — one cleanup PR: blockPlacement, showTabIcons + page.icon,
   zones collapse + per-page merge, element.disabled, spacer height, submit.placement,
   section style values, highlight.dismissible. Each removal is reader-only, so jest +
   one org smoke pass covers it.
3. **BUILD slices** (each with IMPL_PLAN first): accordion options → splitHero ratio →
   header→pane image/fill mapping.

KEEPs need no work — their DORMANT JSDoc lines already exist or ride the DELETE PR.
