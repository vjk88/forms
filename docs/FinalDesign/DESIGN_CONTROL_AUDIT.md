# Design-Mode Control Audit — every CSS setting, verified

> Owner request 2026-07-11: "check all the CSS settings one by one, do not assume anything…
> I want a report first." **Report only — nothing in this document has been fixed.**
>
> Method: every control in `finalDesignRegistry` was traced control → write path (theme
> override or spec path) → engine token (`finalThemeEngine.resolveTokens`) → CSS consumer →
> layouts affected. Static pass = whitespace-tolerant grep of every `var(--c-*)` read across
> all `final*` components, reconciled against every token the engine emits. Live probes
> (Playwright against the deployed VF studio, throwaway forms, deleted after) ran for the
> high-risk chains: an explicit `fieldStates.focus = #ff0000` override, the underline input
> shell, left label position, monoCaps label style. Prior in-session live verifications
> (PRs #97/#103/#104/#105/#106) count as evidence where cited.

## 1 · The focus-color finding (owner's lead item)

**Observation**: "Input focus color is taking the accent color, not the focus setting."

**What actually happens** (probe-verified, splitHero, nordic + `focus: #ff0000` override):

| Piece                       | Verdict                                     | Evidence                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus RING (the 3px halo)   | **WORKS** — honors the setting              | ring painted `rgba(255, 0, 0, 0.32)` under the red override                                                                                                                                              |
| Focused BORDER color        | **INERT** — hook never applies              | border stayed `rgb(188,191,195)` under the red override (`--slds-c-input-color-border-focus` is ignored by this org's `lightning-input`; the error path avoids this by setting the `--sds-c-*` twin too) |
| Default when unset          | focus = **accent**                          | engine: `fs.focus \|\| pal.accent` — by design                                                                                                                                                           |
| The panel swatch when unset | **LIES** — shows empty, not the live accent | the `focus` control has no `fallback`/`fallbackToken`                                                                                                                                                    |
| Theme catalog               | focus **never differs from accent**         | only `editorialIvory` (#0f766e = its accent) and `neonNights` (#ff2e93 = its accent) set it at all                                                                                                       |

**So the owner saw exactly what ships**: the visible focus color IS the ring, the ring defaults
to accent, no theme ever sets anything else, and the panel swatch never tells you "currently
accent" — the control looks dead even though the chain works when set.

**Recommendation (matches the owner's instinct)**: remove the Focus color control and let focus
ride the accent. Zero visual change anywhere in the catalog. Keep the engine's
`fs.focus || accent` fallback so old specs with an override keep working. While in there,
either delete the inert `--slds-c-input-color-border-focus` mapping or pair it with its
`--sds-c-*` twin like the error mapping already does.

## 2 · Section styles (owner's second question)

**Where they are**: the runtime (`finalSectionRenderer`) supports SIX per-section looks —
`plain / card / boxed / outline / subtle / flat` — driven by each section's own `style` key.
Default is **card** (a 4%-ink tint + 12%-ink border, derived from `--c-text` so it adapts to
dark themes). On Split Hero's floating form card that tint sits on white-on-white, which is why
it reads as nearly invisible there.

**Who can set them: effectively nobody.**

- Regular sections: **no style picker exists anywhere** — not in the Build-mode section
  inspector (it has Title / Columns / Header / Icon only), not in Design mode.
- Standalone content blocks only: a 3-option "Block style" (plain/card/boxed) in Build mode.
- Repeaters: their own repeat style (stacked/table/tile) — different thing.
- Design mode: the Body area has no Sections group, and the engine deliberately **never emits**
  `--c-section-bg/border/shadow` ("the preset decides" carve-out, ARCH §3.1 rule 5).

**Owner direction** (2026-07-11, not yet built): per-section styling should NOT live on each
section's properties; a form-wide Section setting belongs in Design mode. Natural shape:
a Design › Body › **Sections** group — Section style select (the six presets) + optional
Section fill / border color (the `--c-section-*` tokens already exist as override points in
every preset's `var()` read, so custom colors get honored with zero renderer change).
Open call: what happens to per-section `style` keys already in specs (honor as exceptions vs
ignore).

## 3 · Defects found (ranked, none fixed)

1. **Focus border hook inert** — see §1. Invisible today (the ring dominates) but a real dead
   mapping in `finalElementRenderer.css`.
2. **Side-rail active page highlight is transparent** — `.rail-link.active` reads
   `var(--c-section-bg)` with **no fallback**, and the engine never emits that token → the
   active row has no background tint in ANY theme (only the bold text + accent number chip
   carry the state). Fix candidate: a `color-mix` ink-tint fallback like the section presets.
3. **Divider blocks ignore the theme border** — `.block-divider` reads `--c-input-border`,
   which is never emitted (the real token is `--c-input-border-color`) → dividers always fall
   back to `--c-text-weak`. Name-mismatch.
4. **Swatch lies** — color controls whose displayed value ≠ what actually paints when unset
   (the `fallbackToken` pattern that `labelColor`/`fieldBg` use correctly is missing):
   - `focus` — shows empty; really the accent.
   - `submitBg` — shows empty; really the accent.
   - `borderColor` — shows static `#d8d8d8`; really `mix(text, contentBg, 16%)`.
   - `fieldBorderColor` — shows static `#c9ced6`; really `mix(text, contentBg, 30%)`.
   - `submitText` — shows `#ffffff`; really `onColor(submitBg)` (black on light fills).
   - `onAccent` — shows `#ffffff`; really `onColor(accent)`.
5. **`--c-font-size` dead read** — `.block-richtext` reads a token nothing emits; the fallback
   always wins. Cosmetic dead code.

## 4 · Control-by-control verdicts

Everything not listed under §3 traced clean. ✅ = full chain verified (token emitted, consumed,
and either live-probed or exercised by a cited PR's browser verification).

| Area · control                                                         | Verdict                     | Notes                                                                                     |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Theme · Accent                                                         | ✅                          | consumed by 9 components + derivation base (focus, submit, on-accent)                     |
| Theme · Button text (onAccent)                                         | ✅ paints / swatch lie §3.4 | chips, pills, step markers                                                                |
| Theme · Text / Muted text                                              | ✅                          | ink + derivation base for borders and section tints                                       |
| Type · Font pairing (+ custom fonts)                                   | ✅                          | body + display tokens; display reaches headers, section titles, splitHero pane            |
| Backdrop · Fill / gradient / opacity                                   | ✅                          | pageFrame fixed layer stack                                                               |
| Backdrop · Image / fit / scrim / image opacity                         | ✅                          | fixed 4-layer stack, fit can't collide with effects                                       |
| Backdrop · Corner rounding (embedded)                                  | ✅                          | live-verified PR #97; embedded-only by design (guest pages own the viewport, stay square) |
| Backdrop · Mesh / blob colors / intensity / float                      | ✅                          | PRs #70–72 pixel-verified                                                                 |
| Backdrop · Texture / intensity                                         | ✅                          | one self-tiling layer                                                                     |
| Backdrop · Glass blur                                                  | ✅                          | 9 consumers; opaque-fill hint already warns when invisible                                |
| Layout · Max content width                                             | ✅                          | carded panel cap + bleed `--frame-max` (live #106)                                        |
| Layout · Density                                                       | ✅                          | space scale, control height, section pad                                                  |
| Paging · all 16 controls                                               | ✅                          | built + live-verified this week (PRs #103/#104/#105)                                      |
| Header · words (style/arrangement/brand/logo/title/subtitle/highlight) | ✅                          | standard+minimal+none handled; 5 arrangements; highlight = shared banner                  |
| Header · surface (fill/opacity/banner/banner opacity)                  | ✅                          | hidden for splitHero (#105); paints formHeader elsewhere                                  |
| Header · text colors                                                   | ✅                          | also ink the theme-dressed splitHero pane                                                 |
| Body · Fill / gradient / opacity                                       | ✅                          | content panel + every card surface                                                        |
| Body · Shadow (6 depths) / Corner rounding / Border weight             | ✅                          | shared scales                                                                             |
| Body · Border color                                                    | ✅ paints / swatch lie §3.4 |                                                                                           |
| Fields · Input style (outline/underline/filled)                        | ✅                          | underline live-probed today — the old build's broken underline is FIXED here              |
| Fields · Input fill                                                    | ✅                          | wins in every shell; truthful swatch (fallbackToken)                                      |
| Fields · Input border                                                  | ✅ paints / swatch lie §3.4 |                                                                                           |
| Fields · Focus color                                                   | §1                          | ring works, border hook inert, default accent, swatch empty                               |
| Fields · Error color                                                   | ✅                          | inline messages + input border (both hook prefixes) + submit denial                       |
| Fields · Required marker                                               | ✅                          |                                                                                           |
| Fields · Label position / color / style                                | ✅                          | left + monoCaps live-probed; labelColor truthful swatch                                   |
| Actions · Submit/Next/Back labels, Arrangement                         | ✅                          | 4 arrangements incl. stretch                                                              |
| Actions · Button fill / label color                                    | ✅ paint / swatch lies §3.4 | fill unset = accent (blank swatch)                                                        |
| After submit (all)                                                     | content/behavior, not CSS   | exercised by P2/P3 gates                                                                  |

**Theme-only knobs (no panel control — by design, not defects)**: `fieldRadius` (input-corner
override), `meshBlend`/`meshBlur` (Neon recipe), `submitBgGradient`, `submitGlow`,
`headerTitleGradient` (gradient display titles), `pageImage.position`.

## 5 · What the audit did NOT cover

Per-element config (element-level label overrides, renderAs variants), content controls
(titles, messages, After-Submit routing) — those are behavior/content, not CSS settings.
The `--c-nav-sticky` token is pageFrame-internal plumbing (LEX unpin, PR #101), not a setting.
