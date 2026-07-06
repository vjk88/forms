# Build Phases — the ordered slices, each behind a render-verified gate

> **Status: approved plan.** Execution order for the rebuild. Every phase ships end-to-end vertical
> slices — never "all the CSS, then all the JS." Companions: [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) ·
> [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) · [DATA_MODEL_DELTA.md](./DATA_MODEL_DELTA.md) ·
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md). Authored 2026-07-03.

## Standing rules (every phase, no exceptions)

1. **Parallel build.** New components live alongside legacy (`formPlayer`, old shells, `z*` — all
   untouched). Nothing legacy is modified or deleted until P7 cutover.
2. **The gate:** a phase is DONE when it's **deployed to the org and render-verified in a browser**
   — jest-green alone is not done ([[feedback-deploy-and-verify]]). Background/stacking/z-index CSS
   additionally requires render-verification _before merge_, not after.
3. Per-change git flow: branch off main → PR → merge (existing doctrine).
4. `themeEngine` and `expressionEngine` grow their jest suites in the same PR as every behavior
   change — these two modules are where correctness is cheapest.
5. Apex ships with tests + the Salesforce skill posture (`USER_MODE`, CRUD/FLS, guest guards) in the
   same phase, never "hardening later" — except where a phase is explicitly internal-only below.
6. **Naming & isolation (owner decision 2026-07-04): every NEW code artifact is prefixed `final`.**
   LWCs = `final` + the catalog's logical name (`pageFrame` → `finalPageFrame` →
   `<c-final-page-frame>`); logic modules `finalThemeEngine`; Apex classes `FinalSpecController`.
   **Exception: data model** — objects/fields keep their natural names per DATA_MODEL_DELTA.
   Zero collision with legacy during the parallel build, and the prefix makes P7's
   search-and-destroy deletion trivial (everything non-`final` in the legacy set dies). Never
   contaminate legacy folders or write overrides inside legacy code. The prefix is **permanent** —
   renaming shipped components post-cutover is churn for zero function; accepted.

---

## P0 · Walking skeleton — prove the architecture

**Build:** `themeEngine` (pure fn + exhaustive jest) · `layoutRegistry` · `pageFrame` (the §2.1 DOM:
`.page` / `.fx` / `.panel`) · `navScroll` · `sectionRenderer` + `elementRenderer` (**`field` type
only**) · minimal `formViewer` that parses a hand-authored `Spec_JSON__c` (one page, one section) ·
ONE built-in theme.

**Gate — the old bugs are the acceptance tests:**

- Page background color + uploaded image + mesh + texture enabled **together**, image Fit switched
  Cover→Contain→Tile — image fit must not move. (The slot-shift bug, dead by construction.)
- Theme applied/removed → neutral-fallback render is plain but correct.
- Deployed + screenshot-verified via the Playwright pipeline ([[reference-browser-testing]]).

## P1 · All seven layouts

**Build:** `navStepper` · `navTabs` · `navAccordion` · `navRail` · `navSplitHero` (+ Pane Flow via
the shared step-flow engine; its brand pane IS the product's hero — rich title/subtitle/highlight
with per-block Top/Center/Bottom placement, owner 2026-07-05) · `navOneAtATime` · `submitBar` slotting (one button implementation,
forwarded intents) · `layoutZones` · `formHeader` (+ `formHighlight`; branding = logo image, else
Brand Name typeset as a wordmark in `--c-font-display` — built-in emblems retired, legacy
`brandEmblem` is NOT reused) ·
nav-contract a11y (keyboard path per primitive).

**Work mode (owner 2026-07-04): shared chrome first (`submitBar`, `formHeader`, `layoutZones`),
then ONE layout per PR** — each configured end-to-end and render-verified against the checklist
below before its PR merges. Layouts are built fresh from the ARCH/catalog contracts, never ported
from the legacy shells — **`formStudio`'s shell layouts are the bug source** (button placements,
repeated headers/process indicators, Submit on every page, height traps) and their bugs ARE the
anti-checklist; **`formDesigner` is the stable-behavior reference** (owner correction 2026-07-04).

**Per-layout chrome checklist (every primitive passes ALL of these):**
1. **Buttons** — one `submitBar`, correct placement per layout; **Submit appears ONLY on the final
   page, Next/Back elsewhere** (formStudio bug: its sideNav shell showed "Submit" on every page);
   One-at-a-Time contexts default the advance label to **Continue** (catalog §2).
2. **Header** — exactly ONE header instance per form; never re-rendered per page/step/tab (legacy
   bug: repeated headers); title + subtitle placement verified in the layout's arrangement.
3. **Progress** — exactly ONE indicator, owned by the primitive; never doubled with the header's
   (legacy bug: repeated process indicators).
4. **Images** — header banner image AND page background image + effects render per the `pageFrame`
   contract in every layout; no layout may hide, crop-shift, or duplicate them.
5. **Height** — content-driven height; no fixed-height inner scroll traps (legacy "height issues");
   the page owns scrolling, not nested panels.
6. **Errors** — inline at the field + summary near the action, per the legacy `formDesigner`
   pattern (the one legacy behavior explicitly kept as the reference — owner 2026-07-04).

**Gate:** the same themed form switched across ALL 7 layouts — page background, panel surface, and
header survive every switch (the chrome bug's regression test), and every layout has passed the
checklist above. Lazy-load verified: scroll form downloads only `navScroll` (network tab). Keyboard
walk on stepper + tabs + accordion.

## P2 · Full theme system

**Build:** `themeCatalog` (all built-ins, managed-hidden) · theme property completeness (fonts,
field states, effects) · `themeGallery` + `themeCard` · `Theme_Definition__c` + `themeEditor`
(custom themes, Save/Save-As) · `designPanel` (7-tab IA) with registry-driven conditional
visibility · `colorControl` + `contrastBadge` + `imageUploader` · **resolve-at-publish** (publish
action compiles `Spec_JSON__c` with the `resolved` block).

**Gate:** publish a themed form → open as guest → renders from `resolved.tokens` with
**`themeCatalog` absent from the guest bundle** (network tab proof). The absence check covers ALL
design-mode components too — `designPanel`, `themeEditor`, `colorControl`, `contrastBadge` never
load outside the builder (review C; LWC only loads what the rendered template references, so this
is a verification, not machinery). Design-mode tweaks preview instantly (no wire calls in the
loop). Engine snapshot tests cover the full catalog.

## P3 · The builder

**Build:** `formStudio` (Build|Design modes) · `builderCanvas` (**DnD = sanctioned CODE PORT of
legacy formStudio's machinery** — owner 2026-07-05, the one exception to rule 1; rules + port scope
in [CANVAS_RULES.md](./CANVAS_RULES.md) §7 and [[reference-formstudio-dnd]]) · `fieldPalette`
(registry-driven) · `propertyPanel` · `pageManager` · `bindingPicker` · `visibilityRules` +
`validationEditor` over a jest-covered `expressionEngine` · `historyManager` (in-memory, Build-mode
only, coalescing).

_expressionEngine checklist (review F8): wire gating + advance-denial into the `finalStepFlow`
consumers — splitHero/oneAtATime `_go` and the viewer's `pageValidity` are accepted-but-unread
placeholders until this lands; the catalog's `Navigation: Free / Gated` row is fiction until wired._

**Gate:** author a real form in the org from blank — pages, sections, bound fields, a visibility
rule, a validation rule — publish it, submit it internally, see the record. Undo/redo across 20
structural edits. Preview === published render (one-parser rule holds).

## P4 · Element widgets

**Build (registry rows, one PR each):** `formLookup` (per CUSTOM_LOOKUP_SPEC phases) · `fileUpload`
(base64-on-submit path re-proven) · `formRepeater` (+ sectionRenderer Repeatable composition) ·
`formSignature` (reuses the file path) · `formVideo` (iframe embeds).
_`heroElement` RETIRED (owner 2026-07-05) — hero = splitHero's brand pane, built in P1._
_`formMap` DEFERRED to v2 — [DEFERRED.md](./DEFERRED.md) #1 (registry key reserved)._

**Gate:** each widget submits end-to-end internally; unknown-type placeholder verified (forward
compat). Video degrades gracefully without CSP setup. _Note: File upload and signature widgets are validated in internal user contexts only during P4; guest-upload capabilities are deferred to P5 when guest-safe server-side handlers are built._

## P5 · Guest runtime & hardening

**Build:** guest `without sharing` controller set (spec fetch, submit, file insert)
with RUNTIME_NOTES guardrails · spam protection (honeypot default, rate limit, availability
enforced server-side at submit) · `formCompletion` · prefill/autofill (guest-safe allow-list,
signed prefill token) · survey answer-store writes with `Label_Snapshot__c` + `Entry_Index__c`.
_Save & Resume (`Form_Draft__c`, `draftManager`, purge job) DEFERRED to v2 —
[DEFERRED.md](./DEFERRED.md) #2._

_Asset-URL checkpoint (review F13): built-in theme images snapshot `/resource/formThemeAssets/…`
paths into published `resolved.tokens`; Experience Cloud serves static resources under a site base
path → guest-side broken images. Decide here: rewrite at publish per-audience, or serve theme
assets from a guest-safe CDN/CMS channel._

**Gate:** full guest E2E on an Experience site: open → upload file → submit → answers + files land
correctly. Replayed POST against a closed form rejected. Apex tests green incl. guest-context
tests. **This phase is the security review point.**

## P6 · Creation & templates

**Build:** `formGallery` + `templateCard` + `newFormDialog` (Form/Survey fork, gallery-first per
[[project-creation-gallery-first]]) · `Form_Template__c` seeding · theme-coherence prune pass
([[project-gallery-themes-coherence]] — finally).

**Gate:** new user goes template → tweak → publish → guest submit without touching legacy UI.

## P7 · Cutover & deletion

**Do:** re-publish surviving forms through the new pipeline → flip consumers (app pages, Experience
pages) to the new `formViewer` → delete legacy LWCs (formPlayer, old shells, old designer,
all `z*`) → drop deprecated fields + retired objects (DATA_MODEL_DELTA §4) → docs sweep.

**Gate:** org-wide grep proves zero references to deleted components; every live form renders
through the new pipeline.

---

## Sequencing logic (why this order)

- **P0–P1 first** because layout×theme is where the old build died — prove the contract before
  investing in editors.
- **P2 before P3:** the builder's Design mode is a UI over a theme system that must already work.
- **Widgets (P4) after the builder (P3):** widgets need `propertyPanel` + palette to be authorable;
  until then hand-authored specs cover rendering tests.
- **Guest hardening (P5) after widgets:** the security review covers the REAL submit surface, not a
  subset that grows afterward.
- Every phase leaves `main` shippable — the app is never mid-refactor broken, because legacy keeps
  serving until P7.
