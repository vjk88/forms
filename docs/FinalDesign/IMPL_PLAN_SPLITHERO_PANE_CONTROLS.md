# IMPL PLAN — Split Hero pane Side + Width controls (sweep BUILD slice 2)

**Status:** IMPLEMENTED (PR #126, 2026-07-18) — deployed + live-verified. Awaiting owner doc cleanup.
**Why:** DORMANT_VOCABULARY_SWEEP BUILD rulings for `ratio` and `side` (the
owner-caught appliesTo correction). Both readers already work
(finalNavSplitHero.js `side` :117, `ratio` :118-119).

## Changes (2 files + tests)

### 1. finalDesignRegistry.js — 2 controls in the existing splitHero layout group (:682)

| Control    | Type   | Path                   | Values                          | Hint                                                                                   |
| ---------- | ------ | ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| Pane side  | select | `layout.options.side`  | '' = Left / `right` = Right     | "Which side the brand pane sits on. The form takes the other side."                    |
| Pane width | select | `layout.options.ratio` | '' = Half / `third` = One-third | "Half = pane and form split evenly. One-third = smaller pane, more room for the form." |

**Deliberately a NEW control for `side`** — the rail's Side control (:491) stays
rail-gated in its rail-labeled group; sharing one control across two layouts'
groups is what caused the sweep's side misclassification.

### 2. finalNavSplitHero.js — JSDoc only

`side`, `ratio` move DORMANT → PRODUCT-SET.

### 3. Tests

- Registry jest: both controls resolve for splitHero only.
- finalNavSplitHero jest: layoutClass cases for `side-right` / `ratio-third`
  (readers untested today — add both).

## Known behavior (unchanged, worth stating)

`_switchLayout` (finalDesignPanel.js:883) wipes options on a layout switch, so Side/
Width don't survive splitHero → stepper → splitHero. Identical to paneFlow's existing
behavior — not a new gap.

## Orphan ledger

None — writers added to existing readers. `sticky`, `paneImage`, `paneBg`,
`paneBgOpacity` remain the pane's only dormant keys (sticky = KEEP; pane surface trio
= slice 3).

## Verify

Org: splitHero form → Right + One-third → pane flips and narrows in stage (desktop);
narrow container still stacks. Screenshots eyeballed.
