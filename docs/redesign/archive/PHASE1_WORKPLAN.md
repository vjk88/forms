# Phase 1 Workplan — Task Cards for Implementation

> Purpose: make Phase 1 buildable by **any** competent coding model/agent.
> Each task card states: tier (who should do it), inputs to read, exact
> deliverables, acceptance criteria, and hard guardrails. Code-unit contracts
> (function signatures, component APIs) are defined in §2 — implementers code
> *against* these; changing a contract requires a human decision, not an
> implementer's judgment.

Tiers: **[A]** = strong model / careful review required (foundation,
security, judgment calls). **[B]** = any coding model (pattern-following,
spec is exhaustive). [B] tasks must not start before their listed
dependencies merge.

Global guardrails for ALL tasks:
- Read `docs/redesign/LAYOUT_SPEC.md` §§4–7 + your task's listed docs first.
- API v66.0 everywhere. USER_MODE + CRUD/FLS in all Apex. No raw hex/px in
  component CSS — tokens only (DESIGN_TOKENS.md §4 lint rules).
- Never modify: `c/formPlayer`, `c/formDesigner`, `c/propertyPanel`,
  existing Apex controllers — Phase 1 is purely additive (new components),
  legacy paths untouched.
- Never add an archetype switch/if-chain outside the registry. Never
  reimplement zone/column rendering inside a shell.
- If your task seems to need a contract change (§2) or a spec change, STOP
  and report — do not improvise.

---

## 1. Task graph

```
T1 spike [A] ──► T2 layoutModel [A] ──► T3 engine+zones [A] ──► T4 shellClassic [A]
                       │                                            │
                       ▼                                            ▼
                 T5 validator Apex [A]                  T7..T16 shells ×10 [B]
                       │                                            │
T6 presets+skins [B] ──┴──────────► T17 harness [B] ◄───────────────┘
T18 Key__c fields+backfill [A]      T19 webfonts [B]      T20 Jest+fixtures [B]
```

## 2. Code-unit contracts (FROZEN — change requires human sign-off)

### 2.1 `c/layoutModel` (JS module, no DOM)

```js
// All functions pure; never mutate inputs. Spec shapes per LAYOUT_SPEC §6.
export function materialize(presetId, pages, sections) → spec
//  applies the archetype board's fill rule; result passes validateSpec.
export function normalize(spec, pages, sections) → resolvedModel
//  applies orphan rule (§5): unplaced sections appended, unknown keys
//  dropped; returns { spec, warnings[] } — warnings for designer lint.
export function validateSpec(spec) → { ok, errors[] }   // client-side mirror
export function applyOps(spec, ops) → { spec, errors[] } // LAYOUT_SPEC §10
export function rebaseOps(ops, oldSpec, newSpec) → { ops, conflicts[] }
export const REGISTRY = { classic: 'c/shellClassic', splitHero: 'c/shellSplitHero', /* … all 11 */ };
```

### 2.2 `c/formLayoutEngine` (public API — what player/designer/wizard use)

```html
<c-form-layout-engine
  spec={spec} pages={pages} sections={sections} elements={elements}
  skin={skin}
  mode="live|preview|canvas"     <!-- preview ⇒ inert, no validation -->
  preview-scale="0.45"           <!-- 0.1–1 -->
  proposed-spec={specOrNull}     <!-- ghost preview, COPILOT_PANEL §3 -->
  onpagechange / onsectionstate / onsubmitrequest>
```
Engine resolves `normalize()`, sets `themeVars()` on its root, lazy-loads the
shell from `REGISTRY` via `lwc:is`, passes the resolved model down. **No Apex
calls. No archetype conditionals — shell selection only.**

### 2.3 Shell contract (every `c/shell*` implements exactly this)

```js
// AS BUILT (T3/T4, 2026-06-10) — `skin` dropped (tokens are CSS custom props
// on the engine root, shells just use var(--c-*)); `navState` renamed `nav`
// (it receives the toView() projection, not the raw state object).
@api model;      // resolved model from normalize(): pages→zones tree + chrome data + collapsed
@api nav;        // view from layoutNavState toView(): currentPage, states[], progress
@api mode;       // live | preview | canvas
// Events up (composed:false, engine handles): 'navrequest' {pageKey|dir},
// 'submitrequest'. Shells render chrome + <c-layout-zones zones mode
// collapsed={model.collapsed}> per page.
// Shells own ONLY chrome (their board §6) + their own CSS file.
```

### 2.4 `c/layoutZones`

```js
@api zones;   // one page's zone tree (validated)
@api mode;
// Renders CSS grid per LAYOUT_SPEC §5 + §7 (reads --c-grid-gap etc.);
// renders sections via <c-layout-section-host section-key=…>.
// Collapse behavior driven by container query on effective breakpoint
// passed in the model (never hardcode 768).
```

### 2.5 `c/layoutNavState` (JS module)

```js
export function createNavState(spec, visiblePages) → navState
export function next(navState, validateFn) / back(navState) / goTo(navState, pageKey)
// Encodes per-nav-model gating per the boards: stepper validates forward,
// sidenav/tabs soft-validate, oneAtATime per-element, accordion per-panel.
```

## 3. Task cards

### T1 [A] Dynamic-import spike
Read: LAYOUT_SPEC §11. Deliver: throwaway `c/zSpikeDynamicImport` proving
`lwc:is` + `await import('c/x')` works in: Lightning app page, Experience
Cloud guest, and (desk-check) 2GP namespace docs. Output: short
`docs/redesign/SPIKE_RESULTS.md` + decision (lazy vs static registry).
Accept: documented yes/no per surface with screenshots/errors.
DONE 2026-06-10 (as `c/zEngineSpike`). YES on both surfaces — lazy literal
`import()` confirmed; engine needs `lightning__dynamicComponent` capability;
`:host-context` banned (see SPIKE_RESULTS.md). Decision: lazy loading stays.

### T2 [A] `c/layoutModel`
Read: LAYOUT_SPEC §§5–6, §10; all archetype boards' "fill rule" lines.
Deliver: module per §2.1 + exhaustive Jest (orphan rule, every op, rebase
conflicts, depth/size caps). Accept: 100% branch coverage on applyOps/rebase;
fixtures reused by T5's Apex tests (same JSON files).

### T3 [A] `c/formLayoutEngine` + `c/layoutZones` + `c/layoutSectionHost` + `c/layoutNavState`
Read: §2.2–2.5, LAYOUT_SPEC §7/§11, DESIGN_TOKENS.md. Deliver: components
per contract; sectionHost bridges to existing element rendering (reuse
`c/fieldPreview` patterns — do not fork element markup). Accept: engine
renders a hand-written valid spec with zero shells present except T4's.

### T4 [A] `c/shellClassic` (reference shell)
Read: archetypes/classic.md. Deliver: the canonical shell every [B] task
copies; includes a `HOW_TO_BUILD_A_SHELL.md` README in the component folder
(structure walkthrough, what belongs in shell vs zones vs engine).
Accept: classic board §3–§8 fully realized; passes T17 harness checks.

### T5 [A] `FormLayoutSpecValidator` (Apex) + `applySpecPatch`
Read: LAYOUT_SPEC §6 (schema + semantic checks), COPILOT_PANEL §5.
Deliver: validator (shared by save/AI/import), `Layout_Spec__c` field
metadata, applySpecPatch + `Spec_History__c`. USER_MODE; draft-only writes.
Accept: Apex tests mirror T2 fixtures 1:1; invalid spec can never persist
(negative tests prove it).
DONE 2026-06-10. Signature as built:
`applySpecPatch(Id formVersionId, String specJson, String opsJson, String source)`
— the client computes the new spec with c/layoutModel applyOps (same code as
the ghost preview) and sends the FULL spec; the server re-runs the complete
validator (`validateForVersion`) before the write, so a tampered/invalid spec
can never persist. `opsJson` is changelog/audit metadata. Rationale: avoids a
second full Apex port of the op engine that would have to stay in lockstep
with the JS one; the validator (already mirrored by design) remains the only
trust boundary. Apex tests still owed (deferred by owner).

### T6 [B] Presets + skins  (deps: T2)
Read: every board §4–§5; DESIGN_EXPLORATIONS_AUDIT (skin amendments).
Deliver: 13 preset templates in `c/layoutModel` presets file + new
`LAYOUT_TEMPLATES` entries + new Theme Spec keys in `themeVars()`
(inputStyle/texture/bgEffect/titleStyle/panelDecor/labelStyle/labelPosition/
controlScale) with v1 defaults per DESIGN_TOKENS §6.
Accept: each preset passes `validateSpec`; `themeVars()` output unchanged
for v1 skins (regression Jest with today's snapshots).
DONE 2026-06-11. All v2 keys live in `themeVars(t, density)` (`density` is an
optional 2nd arg — comes from the LAYOUT spec, engine passes it). 12 new
archetype default-skin `LAYOUT_TEMPLATES` entries added per boards §5/§10
(classic doubles as its own → 13 total incl. timeline + kiosk); legacy 5
entries untouched, regression Jest green (73 tests). Notes:
- console skin uses `font: 'enterprise'` interim (board wants 'plex' — webfont
  bundle tabled with T19; enterprise stack already leads with IBM Plex Sans).
- Legacy `templateGallery` is safe: it renders from a hardcoded 5-name ORDER
  list, so new entries don't leak into the old designer.
NOTE for T19: the pairing's mono micro-label face slot is `labelFace`, NOT
`label` (`label` is the pairing's display name — collision).

### T7–T16 [B] Shells ×10  (deps: T3, T4, T6; one task per archetype)
DONE 2026-06-11. All 10 shells deployed to org. SHELL_LOADERS in
formLayoutEngine.js wired for all archetypes.

Components built (all 61 Jest tests still green):
- T7  splitHero      → c/shellSplitHero   (brand panel + scroll/stepper pane; mobile top band)
- T8  wizardStepper  → c/shellWizard      (sticky numbered rail + sheet + meta bar; mobile dots)
- T9  sideNav        → c/shellSideNav     (240px rail + content; mobile sticky top bar)
- T10 conversational → c/shellConversational (section-at-a-time; Enter/OK; progress bar)
- T11 immersiveGlass → c/shellGlass       (fullbleed bg + glass card; reduced-transparency fallback)
- T12 mosaicGrid     → c/shellMosaic      (card + standard header; zones handle grid complexity)
- T13 document       → c/shellDocument    (paper chrome: accent rule + sheet margins + compact density)
- T14 accordion      → c/shellAccordion   (lightning-accordion; Continue ↓ per panel; submit always visible)
- T15 tabbedCard     → c/shellTabbed      (lightning-tabset; progress fraction + submit in footer)
- T16 console        → c/shellConsole     (sticky topbar + title row + sticky savebar)

Phase 1 deferred items carried forward:
- Document section auto-numbering (requires layoutSectionHost archetype awareness — Phase 2)
- Console cancel/discard pipeline (needs Phase 2 dirty-state contract)
- Accordion completion ticks (live validation not wired until Phase 2)
- Conversational element-level stepping (board §6: one element/screen — Phase 5)

Review gate 3 (every-3-shells consistency sweep): due after harness verification.

### T17 [B] QA harness  (deps: T3, T4)
Deliver: `c/zLayoutHarness` app page — matrix archetype × skin × density ×
viewport + the 11-mini-engines (0.18 scale) perf check + seed-data presets
(Contact/Lead/Case/custom fixtures). Accept: a human can verify any board
visually in < 30s; perf numbers logged.
DONE 2026-06-10 (built early to unblock T7–T16 verification). Deployed;
add "Z Layout Harness" to an app page. Un-built shells show the engine's
"not implemented" notice — expected until each T7–T16 task lands. Matrix
wall-time shown in the perf line.

### T18 [A] `Key__c` fields + slug generation + backfill
Read: LAYOUT_SPEC §9. Deliver: fields on Form_Page__c/Form_Section__c,
generation in existing trigger handlers, idempotent backfill script,
clone-copies-keys test. Accept: version clone keeps spec valid (test).
DONE 2026-06-10. `FormKeyUtil` + new `FormPageTrigger`/handler + section
handler extended; fields are externalId, NON-unique (keys repeat across
cloned versions by design); `scripts/apex/backfill-keys.apex` run (16 pages).
Clone SELECTs include Key__c; `createDraftFromActive` copies Layout_Spec__c.
Clone-copies-keys Apex test still owed (deferred by owner).

### T19 [B] Webfont static resources  (deps: none) — TABLED 2026-06-10 by owner; revisit after shells land. System-stack pairings cover the interim.
Read: DESIGN_TOKENS §5. Deliver: OFL license verification note + static
resources + `FONT_PAIRINGS` additions (with `label` face slot) + guest-access
check note. Accept: pairings render in harness; licenses documented.

### T20 [B] Jest fixtures library  (deps: T2)
Deliver: shared spec/section fixtures (valid, orphaned, deep, conflicting)
used by T2/T5/T17 and future copilot tests. Accept: imported by ≥ 2 suites.
DONE 2026-06-10. `c/layoutFixtures` (zero imports — no cycles): PAGES/SECTIONS
basics, 3 rich SEEDS, baseSpec/deepSpec, INVALID_SPECS matrix (14 cases with
expected error codes shared with the Apex validator), ORPHAN_CASES,
CONFLICT_OPS. Imported by layoutModel + layoutFixtures suites (61 tests
green) and the T17 harness.

## 4. Review gates (human or strong-model review before merge)

1. After T2+T5: contracts vs LAYOUT_SPEC diff review (the heart).
   **PASSED 2026-06-10 (strong-model review).** JS↔Apex validators agree on
   every error code/path for the Jest fixture matrix. Three deliberate
   server-stricter drifts (all fail-safe — Apex may reject where JS accepts,
   never the reverse):
   (a) byte cap: Apex measures the raw JSON string, JS measures re-minified —
       pretty-printed near-limit specs fail server-side first (field length
       32768 enforces raw anyway);
   (b) keys: Apex `isNotBlank` rejects whitespace-only keys, JS `length>0`
       accepts them;
   (c) explicit-null enum values (e.g. `"chrome": null`): JS errors
       invalid-enum, Apex skips — harmless because nulls are dropped on
       round-trip and the key is optional.
   Warnings parity: `ok` flag is identical on both sides; warning sets differ
   by design (Apex adds data cross-checks + nav-compat; JS warnings live in
   normalize()).
2. After T4: shell reference walkthrough — everything else copies it.
3. After every 3 [B] shells: consistency sweep (submit placement, token
   usage, mobile collapse) against the boards.
   **DONE 2026-06-11 (single sweep over all 10 — shells landed in one batch).**
   Bugs found & fixed: collapse-selector bug in wizard/sideNav/document
   (`.is-collapsed .layout` written as descendant selector but the class sits
   ON the root — never matched; now `.layout.is-collapsed`); sideNav global
   `width:100%` submit leaking to content-end button; accordion
   `openSections[0]` on a string (single-open reports string, not array);
   conversational unclamped section index on model shrink; splitHero inline
   `flex-basis 38%` becoming a height in collapsed column flow; conversational
   submit ignoring `submit.alignment`; missing `.align-stretch` in splitHero.
   Accepted deviations (documented, not bugs): wizard sheet-footer alignment
   hardcoded right (stepper convention); glass/accordion/tabbed/console use
   media queries instead of model.collapsed (allowed per HOW_TO step 7);
   `#fff` button text + var() fallback hex match the reference shell pattern.
4. End of phase: uiux-flow-reviewer pass on the harness.
   **DONE 2026-06-11.** All P1/P2 findings fixed same day:
   - P1: sideNav rail clicks now swap pages (multi-page renders current page
     only); wizard future steps disabled (completed-only jump-back per board);
     conversational re-focuses the shell on screen change (keyboard-first);
     glass respects shell.maxWidth + renders page-label dividers multi-page.
   - P2: new `--c-on-accent` token in themeVars (luminance-picked text color
     on accent — fixes white-on-teal submit in Immersive Dark); accordion's
     dead "0/N ✓" replaced with section count until Phase 2 validation;
     aria-current now emits step/page or omits (no "false" strings);
     splitHero step dots have a live "Step n of m" aria-label.
   - P3 deferred to Phase 2 backlog: harness live-mode toggle (submit can't
     fire in preview — by design), harness allows mismatched skin/archetype
     pairings (arguably a feature for QA), single-page sideNav scroll-spy
     (sections-as-rail-entries variant), a few off-token hover tints.
