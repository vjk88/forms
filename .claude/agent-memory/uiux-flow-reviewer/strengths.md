---
name: strengths
description: Good UX patterns already in the forms project worth preserving and reusing — don't suggest regressing these
metadata:
  type: project
---

Preserve / reuse these (they are already done well):

- **Player responsiveness via container queries.** `formPlayer.css` uses `container-type: inline-size` and `@container (max-width: 36rem)` so the form adapts to its OWN width (record-page column, device-preview), not the viewport. Mobile turns vertical-nav into a horizontal scrollable pill strip and drops card framing edge-to-edge under 30rem. Genuinely modern; do not replace with viewport media queries.
- **Themed buttons via SLDS styling hooks.** Player maps `--c-submit-bg`/`--c-back-color`/`--c-radius` onto `--slds-c-button-*` hooks instead of overriding internals. Correct, upgrade-safe approach.
- **Error UX in player.** Aggregated error summary near the submit button (`.player-errors`, role="alert"), smooth-scrolls into view, multi-page submit jumps to the first page with an error (`goToFirstErrorPage`). Inline per-field errors for custom controls. Keep this.
- **Save status strip** in builder: "Unsaved changes" (warning) vs "Saved HH:MM" (success) with icon, plus `Save *` dirty marker and auto-save on context switch (`autoSaveThen`). Good perceived-state feedback.
- **newFormDialog structure** is the model for progressive disclosure the rest of the app should follow: clear Data / Experience / Advanced section heads, radio CARDS for experience, locked Form Type with a lock icon.
- **Honeypot + guest-only CAPTCHA** spam handling, off-screen (not display:none) honeypot. Security-aware without burdening internal users.
- **fieldPalette** "Added" tag on already-used fields + search + collapsible Required/All/Related groups — good way to keep a long field list scannable.
