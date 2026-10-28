---
name: fonts-engine
description: Fonts A1 engine contract (two regimes, FormsBundled aliases, resolved.fonts manifest, display-weight token) and the review traps found in the PR 398 gate (2026-10-24)
metadata:
  type: project
---

Fonts plan = docs/FinalDesign/IMPL_PLAN_FONTS_AND_BRAND_THEME.md (A1 engine → A2 bundle → A3 picker → B1/B2 brand).

Contract (A1, PR 398): legacy regime (no `fonts` object at either level) must equal pre-A1 `resolveTokens` exactly; new regime = per-side first-hit table, form before theme. Bundled faces register ONLY under `FormsBundled<Name>` aliases (system stack names plain Roboto). Published forms load fonts only from `spec.resolved.fonts`; old snapshots fall back to `overrides.customFont`. `--c-font-display-weight` is emitted only for single-weight bundled display faces.

**Why:** a published form never sees its theme recipe; plain family names would hijack legacy fallbacks.

**How to apply (traps to re-check on A2/A3/B):**
- Hand-typed lookup maps (`BUNDLED_FONTS[key]`, `FONT_PAIRINGS[k]`) need own-property checks; `constructor`/`__proto__` keys threw inside resolveTokens and the guest viewer.
- Any `isPlainObject(fonts)` flips the regime, even `fonts: {}`; writers (A3 reset/one-side edit) must not leave empty objects.
- Display-font consumers: grep `var(--c-font-display` in final* CSS — finalAfterSubmit `.confirmation-title` (thank-you) and finalThemeCard `.tc-h` were missed by the "7 heading rules".
- Keys AND aliases are persisted (keys in refs/manifests, aliases baked into published tokens): never rename; freeze-test them.
- Jest `toEqual` ignores undefined-valued keys; "byte-identical" claims need `toStrictEqual`.
- Legacy-equivalence can be checked fast by loading origin/main's engine and the branch engine as .mjs in node and diffing edge inputs.

A2 gate (PR 399, 2026-10-24) traps found:
- Google css2 returns HTTP 400 for a weight RANGE on a static family, and for a VARIABLE family `wght@400;700` returns the SAME url twice. So a build script that swallows non-OK responses can silently downgrade a variable family to "single 400" (headings lose bold). Pin shape per family in tests.
- New `fonts.pairing` keys `geometric`/`editorial` reuse legacy `typography` keys (Avenir / Georgia stacks) under the same UI label "Font pairing" — flag at A3 if not renamed.
- bundledFontData.js is reformatted by lint-staged prettier; fonts.json is not (staticresources is prettier-ignored). No CI: drift tests run only when an lwc file is staged.
- Bundle is Latin subset only: latin-ext glyphs (ř, ł, ş, Vietnamese) fall back per glyph.

A3 gate (PR 400, 2026-10-24) traps found:
- sidePatch copy rule keyed on "level has ANY font key" freezes a theme-inherited side: two heading edits in a row from "From theme" (1st writes {display}, 2nd sees `fonts` and copies the theme body). Copy must key on LEGACY keys (typography/customFont incl. null) deciding the side, and "other decided" must mean USABLE (fontRefStack), not truthy, else unusable fonts[other] + legacy keys flips the side.
- Toggle forced open by derived state (`_open || isCustom`) makes "Hide" a dead button.
- Legacy stack labels ('Editorial (serif display)', 'Geometric') collide with new pairing labels in "From theme · …"; Customize "Current" fallback printed raw keys ("editorial · current") and the per-side stack meaning was lost (editorial body = system sans).
- Form `customFont: null` alone shows "From theme · <theme custom font>" while the preview hides it (inherit label computed with form=null).
- Probe harness: a scratch jest config extending the repo's (rootDir = worktree, roots += scratchpad dir, testMatch on the probe) runs throwaway probes against real c/ modules without touching the repo.
