---
name: redesign-phase0
description: Phase 0 redesign deliverables (docs/redesign) — structure, key UX decisions, and recurring review flags
metadata:
  type: project
---

The full redesign UX spec lives in `docs/redesign/`: MASTER_PLAN, LAYOUT_SPEC (the
JSON contract), DESIGN_TOKENS, CREATION_WIZARD, COPILOT_PANEL,
DESIGN_EXPLORATIONS_AUDIT, and 13 archetype boards under `archetypes/`. Visual
north star = 5 HTML mockups in `design-explorations/` (01–05). See [[component-map]]
for the current (pre-redesign) app.

**Why:** AI→spec-JSON-only architecture (LWS forbids dynamic HTML; AppExchange-
survivable). Deterministic `c/formLayoutEngine` renders any valid spec. AI is
optional/feature-detected — 13 curated archetypes + theme presets are the zero-
license path.

**How to apply when reviewing redesign docs:**
- Load-bearing decisions to PRESERVE (don't suggest regressing): orphan rule
  (switching archetypes re-places, never deletes); validator is the ONLY writer
  of `Layout_Spec__c`; "preview never lies" (real engine at scale, seeds become
  real rows); chrome is engine-owned keyed off archetype (never a spec node);
  AI feature is absent-not-disabled.
- Archetype count is **13** (11 core Phase 1 + Timeline/Kiosk fast-follow).
  `archetypes/README.md` is the source of truth — MASTER_PLAN §2 and LAYOUT_SPEC
  §8 were stale (said 12, omitted Console #13) as of 2026-06-10 review.
- Recurring flags found in Phase 0 gate review (2026-06-10): gallery at 0.18
  scale makes Side-Nav/Tabbed/Accordion (and mobile-collapsed Classic/Mosaic/
  Document/Console) read as duplicates — fix with `recommendWhen` captions +
  nav glyphs + grouped bands; submit placement varies per board with no stated
  principle; copilot stale-base auto-discard is a trust risk (prefer rebase-or-
  keep); mobile-collapse §7 reads as absolute but several boards override the
  768px breakpoint to 1024px.
