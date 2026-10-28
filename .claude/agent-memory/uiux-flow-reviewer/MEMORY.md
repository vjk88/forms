# UI/UX Flow Reviewer — Memory Index

- [Design tokens](tokens.md) — `--c-*` token set + radius; FOCUS: --c-focus-ring is a shadow, outlines use --c-field-focus; per-theme 3:1 fails
- [Component map & flow](component-map.md) — what each LWC does, the create→design→publish journey, admin vs guest split
- [Recurring UX issues](recurring-issues.md) — anti-patterns to flag fast (flat property panel, dead component, palette typo, double-submit, contrast-model gaps, assistive-text false positives, live-normalizing inputs, symmetric blend filters)
- [Strengths to preserve](strengths.md) — good patterns worth reusing so I don't suggest regressing them
- [Redesign Phase 0](redesign-phase0.md) — docs/redesign deliverables: spec-JSON architecture, 13 archetypes, preserve-list, recurring gate-review flags
- [Fonts engine (A1+)](fonts-engine.md) — two regimes, FormsBundled aliases, resolved.fonts manifest; traps: proto keys, `fonts:{}` flips regime, A3 sidePatch freeze + dead toggle
- [Layout engine shells](layout-engine-shells.md) — Phase 1 engine/shell/nav-state contract + recurring shell UX defects (dead nav, conv autofocus, on-accent contrast)
