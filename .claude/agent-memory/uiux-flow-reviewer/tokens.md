---
name: tokens
description: The --c-* design token set and runtime-injected theme tokens used across the forms builder and player
metadata:
  type: project
---

Design tokens are declared identically on `:host` in BOTH `formDesigner.css` and `formPlayer.css` (duplicated literally — a candidate for a shared base, but LWC has no easy global :host inheritance so duplication is pragmatic).

Color/spacing tokens (static):
- Brand: `--c-brand #0176d3`, `--c-brand-dark #005fb2`, `--c-brand-light #1b96ff`, `--c-brand-bg #eaf5fe`
- Surface: `--c-bg #fbf9f9`, `--c-surface #fff`, `--c-surface-alt #f3f3f3`
- Border: `--c-border #dddbda`, `--c-border-cool #c0c7d4`, `--c-border-light #e5e5e5`
- Text: `--c-text #1b1c1c`, `--c-text-weak #706e6b`, `--c-text-meta #aeb4be`, `--c-label #514f4d`
- Status: `--c-success #2e844a` (+`--c-success-bg`), `--c-error #ba1a1a` (+`--c-error-bg`), `--c-warning #fe9339`

Radius tokens are NOT in the static block — they are injected at runtime from the form theme:
- `--c-radius` and `--c-radius-card` are built in JS (formDesigner.js ~L345, formPlayer.js ~L985) from the theme's radius setting. CSS references them with fallbacks, e.g. `var(--c-radius-card, 14px)`. This is intentional, not a missing token.
- Player also sets `--c-submit-bg` / `--c-back-color` and maps them onto SLDS button styling hooks (`--slds-c-button-*`). Good pattern.

There is NO spacing scale token (no `--c-space-*`). Spacing is raw rem values + SLDS margin utility classes. If recommending spacing fixes, either use SLDS utilities already in use or propose adding a `--c-space-*` scale.

Token gaps to flag when seen: raw hex still appears for a few one-offs — e.g. `#032d60` (toast preview bar) and `#eafbe7`/`#eafbe8` (success ring) in formDesigner.css; `#f7f9fb` section header bg in formPlayer.css. These should become tokens (e.g. `--c-navy`, reuse `--c-success-bg`).

## Focus tokens (final* stack, verified 2026-10-24, PR 397)
- `--c-focus-ring` is a whole BOX-SHADOW (`0 0 0 3px rgba(focus,.55)`), never a colour; inside `outline:` it invalidates the declaration -> no ring. Outline colour = `--c-field-focus` (default in finalPageFrame.css). Guard: finalThemeEngine/__tests__/focusRingUsage.test.js. Sibling shadow tokens with the same trap: `--c-input-shadow-focus`, `--c-input-shadow`, `--c-section-shadow`.
- The 55% halo fails WCAG 1.4.11 3:1 on most themes (Dracula ~2.5, oceanBreeze ~1.7, Nordic ~3.06); solid 2px `--c-field-focus` outline (file controls, slider thumb) is the stronger, forced-colors-safe pattern.
- Solid `--c-field-focus` itself is <3:1 on light themes with bright accents: oceanBreeze (gallery) 2.4 vs white field / ~2.0 vs content; sunsetDunes 2.8; desertOasis 2.87 vs section. All dark themes pass (>=3.77).
