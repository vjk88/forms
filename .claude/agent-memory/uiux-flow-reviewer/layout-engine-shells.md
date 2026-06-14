---
name: layout-engine-shells
description: Phase 1 layout engine — shell contract, nav-state gating model, and the recurring UX defects found in the 11 archetype shells
metadata:
  type: project
---

The Phase 1 redesign render path is `c/formLayoutEngine` (thin orchestrator, no Apex,
lazy-loads one `c/shell*` via literal `import()` keyed off `spec.archetype`) →
`c/layoutZones` (CSS-grid container) → `c/layoutSectionHost`. Shells own ONLY their
board's chrome (nav rails, steppers, submit bars) + their own CSS; they never
reimplement zones. Nav is a pure state machine in `c/layoutNavState` (gating:
stepper/oneAtATime validate forward; sidenav/tabs/accordion free-nav; scroll = no
paging). Collapse is engine-owned: ResizeObserver on `.engine` root → `model.collapsed`
(NOT media queries / NOT :host-context, which is banned on-platform). The 11 boards in
`docs/redesign/archetypes/*.md` §3/§6/§7 are the intent spec.

**Why:** AI→spec-JSON-only architecture; deterministic engine renders any valid spec;
chrome is engine-owned keyed off archetype, never a spec node. See [[redesign-phase0]].

**How to apply when reviewing these shells — recurring defect classes I keep finding:**
- **Dead nav affordances.** Multi-page shells that render all pages stacked (sideNav,
  and glass if multi-page) but expose clickable rail/tab items that update nav-state
  highlight without scrolling content → click does nothing. Check that free-nav shells
  actually `scrollIntoView` / scroll-spy, and stepper shells make future steps
  non-clickable (board rule: "future steps not clickable"; `goTo` only advances one
  gated step, so a future-step click silently mis-navigates).
- **Conversational autofocus.** Board §6 mandates autofocus on every screen; the shell
  had `tabindex=0` + a comment but no focus-move on section change → keyboard-first flow
  broken + focus lost on DOM swap. Always check focus management on screen/step change.
- **White button text on light accents.** Repo-wide `.submit-btn { color:#fff }` pattern
  fails contrast on pale-accent skins (glass default teal ~1.7:1). Recommend a
  `--c-on-accent` token resolved per skin in `themeVars()` rather than per-shell fixes.
- **Placeholder counters that read as real.** Live validation deferred to Phase 2, but
  accordion `progressLabel` hardcodes `0 / N` — looks stuck. Omit the number, don't show 0.
- **`aria-current={isActive}`** renders the string "false"; should resolve to
  'step'/'page' or be absent.
- **Hardcoded `rgba(0,0,0,0.04)`** hover tints (wizard/sideNav rails) — off-token,
  invisible on dark skins; prefer `color-mix(... var(--c-text) ...)`.

**Harness (`c/zLayoutHarness`):** archetype × skin × density × seed × viewport + matrix.
Uses `mode="preview"` (inert → submit blocked, nav works). Gaps: can't fire Submit; skin
and archetype are independent with no "default skin" reset, so reviewers can accidentally
review a mismatched pairing.
