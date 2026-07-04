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

**Build:** `navStepper` · `navTabs` · `navAccordion` · `navRail` · `navSplitHero` · `navOneAtATime`
· `submitBar` slotting (one button implementation, forwarded intents) · `layoutZones` · `formHeader`
(+ `formHighlight`, `brandEmblem` reuse) · nav-contract a11y (keyboard path per primitive).

**Gate:** the same themed form switched across ALL 7 layouts — page background, panel surface, and
header survive every switch (the chrome bug's regression test). Lazy-load verified: scroll form
downloads only `navScroll` (network tab). Keyboard walk on stepper + tabs + accordion.

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

**Build:** `formStudio` (Build|Design modes) · `builderCanvas` (DnD per [[reference-formstudio-dnd]]
model: capture-phase gatekeeper, imperative highlights, native no-drop) · `fieldPalette` (registry-
driven) · `propertyPanel` · `pageManager` · `bindingPicker` · `visibilityRules` + `validationEditor`
over a jest-covered `expressionEngine` · `historyManager` (in-memory, Build-mode only, coalescing).

**Gate:** author a real form in the org from blank — pages, sections, bound fields, a visibility
rule, a validation rule — publish it, submit it internally, see the record. Undo/redo across 20
structural edits. Preview === published render (one-parser rule holds).

## P4 · Element widgets

**Build (registry rows, one PR each):** `formLookup` (per CUSTOM_LOOKUP_SPEC phases) · `fileUpload`
(base64-on-submit path re-proven) · `formRepeater` (+ sectionRenderer Repeatable composition) ·
`formSignature` (reuses the file path) · `formVideo` (iframe embeds) · `heroElement`.
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
