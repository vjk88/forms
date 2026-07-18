# IMPL PLAN — Header surface controls drive the Split Hero pane (sweep BUILD slice 3)

**Status:** IMPLEMENTED (PR #127, 2026-07-18) — owner chose §4 option (a); deployed + live-verified. Awaiting owner doc cleanup.
**Why:** DORMANT_VOCABULARY_SWEEP BUILD ruling for the pane surface trio
(`paneImage` / `paneBg` / `paneBgOpacity`). Design › Header's Fill + Banner controls
are hidden on splitHero (`appliesTo: { notLayouts: ['splitHero'] }`, registry
:705/:715/:723/:735) while the pane's surface vocabulary has no writer — one editor
should drive the lockup surface on every layout.

## Trace that shaped this plan (verified 2026-07-18)

The pane's no-config branch (finalNavSplitHero.js paneStyle :157-162) ALREADY paints
`var(--c-header-bg)` + `--c-header-bg-gradient` + `--c-header-text`. The Fill controls
write `palette.headerBg`/`palette.headerBgOpacity` → the engine composes them INTO
that token. **So Fill + Fill opacity work on the pane today with zero new wiring —
only their gate hides them.** Only the banner image (a model key, `header.bgImage`,
not a token) needs real plumbing.

## Changes (3 files + tests)

### 1. finalDesignRegistry.js — lift 4 gates

Remove `appliesTo: { notLayouts: ['splitHero'] }` from `headerBg` (:705),
`headerBgOpacity` (:715), `bannerImage` (:723), `bannerOpacity` (:735). Hint check:
"fades the banner into the header fill color" stays true for the pane — keep.

### 2. finalFormViewer.js — map the image in the ownsHeader branch (:234)

Alongside the existing lockup mapping: `options.paneImage = header.bgImage` (url +
opacity ride the same object). Map ALWAYS when ownsHeader (not only when
`!paneConfigured` — surface and lockup are independent).

### 3. finalNavSplitHero.js — themed image branch in paneStyle

New first branch: image present AND no explicit `paneBg` →
`background-color: var(--c-header-bg)` + a `color-mix(in srgb, var(--c-header-bg)
(100−opacity)%, transparent)` veil over the image + `color: var(--c-header-text)` —
the exact composition finalFormHeader.surfaceStyle uses (:69), so banner opacity
behaves identically on both hosts. The legacy `paneBg` veil branch stays for
hand-seeded specs (or dies — §4).

### 4. OWNER DECISION — `paneBg`/`paneBgOpacity` end state

- **(a) Recommended:** DELETE the legacy veil branch. Pane surface = theme tokens +
  mapped image, full stop. `paneImage` becomes DERIVED (viewer-written), `paneBg`
  vocabulary disappears; simplest honest model, no hand-seeded specs exist in prod.
- **(b)** Keep the veil branch as tolerated legacy (stays a documented dormant pair).

### 5. Tests

- Registry jest: 4 controls now resolve on splitHero.
- Viewer jest: ownsHeader spec with `header.bgImage` → layout receives
  `options.paneImage`.
- splitHero jest: paneStyle with mapped image → header-bg veil + image layers +
  header-text ink; without image → unchanged themed branch.

## Orphan ledger

After (a): `sticky` is the pane's ONLY remaining dormant key (KEEP). After (b): the
trio stays documented dormant. Nothing new becomes unread/unwritten either way.

## Verify

Org, splitHero form: upload a Banner image → paints on the pane with the theme fill
veil; drop Image opacity → image fades into the fill; set Fill → pane recolors (no
code in that path — gate-lift only). Also confirm a NON-splitHero layout's header
banner is unchanged. Screenshots eyeballed.
