# Dormant Vocabulary Sweep (reverse audit)

**Date:** 2026-07-14 · **Status:** FINDINGS — awaiting owner rulings (no code changed)

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
- **19 dormant keys + 2 dormant value-sets** remain, all cataloged below.

## Ledger — dormant keys (reader line-refs verified 2026-07-14)

### finalNavSplitHero (reader: finalNavSplitHero.js)

| Key                        | Reader    | What it would do                             | Verdict |
| -------------------------- | --------- | -------------------------------------------- | ------- |
| `ratio`                    | :118      | `'third'` → 1/3 pane instead of 1/2          | DORMANT |
| `sticky`                   | :124      | `false` → pane scrolls away (non-bleed only) | DORMANT |
| `paneImage`                | :151      | pane background image `{url}`                | DORMANT |
| `paneBg` / `paneBgOpacity` | :150/:164 | pane fill override + veil strength           | DORMANT |
| `blockPlacement`           | zoneList  | per-block Top/Center/Bottom overrides        | DORMANT |

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

Recommend the PR #118 honest-frame treatment for both.

## Options for each dormant key (owner rules per row)

1. **Keep as documented vocabulary** — the JSDoc PRODUCT-SET/DORMANT truthing
   (PR #116) already prevents future false claims; cost of keeping is near zero.
2. **Build the writer** — promote to a Design-panel control (e.g. `ratio`,
   accordion `allowMultiple`, section `surface` when the styles pass lands).
3. **Delete the reader** — for keys that will never get a writer
   (e.g. `element.config.height`, `submit.placement`).

No changes made in this sweep; it is evidence for those rulings.
