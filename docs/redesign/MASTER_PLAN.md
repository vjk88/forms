# Forms App Redesign — Master Plan

> Status: DRAFT v1 (2026-06-09). Owner: Vijay. This is the living plan for the
> full redesign: AI-assisted layout/theming via Agentforce, 10+ structural
> layout archetypes, and a new creation experience. Building blocks
> (Form / Page / Section / Element / Related List) are unchanged.

---

## 0. Principles

1. **AI writes specs, never UI code.** All AI output is a Layout Spec or Theme
   Spec (JSON) validated in Apex against a schema + token allowlist + WCAG
   contrast check. A deterministic LWC layout engine renders it. (LWS forbids
   dynamic HTML anyway; this is also the AppExchange-survivable design.)
2. **AI is optional.** Target is 2GP/AppExchange; Einstein Generative AI /
   Agentforce is feature-detected. The 10+ curated archetypes and theme presets
   must deliver the full experience with zero AI licenses.
3. **Layout ≠ Skin.** Keep the formThemes separation: archetype = structural
   shell; skin = colors/fonts/radius/shadow. Skins are swappable across
   archetypes. All styling flows through `--c-*` design tokens.
4. **Evolve in place.** Reuse the non-z components (formDesigner, formPlayer,
   propertyPanel, fieldPalette, formRepeater, formThemes, editors). No parallel
   rebuild. The layout engine incrementally replaces formPlayer's archetype
   switch-case.
5. **Salesforce skill rules apply throughout**: USER_MODE, CRUD/FLS, guest
   guards, Apex tests, API v66.0.

---

## 1. Layout Spec (the contract — write this first)

A recursive container tree stored on `Form_Version__c.Layout_Spec__c`
(long text JSON). Sections/elements stay in the existing data model; the spec
only *places* them.

```jsonc
{
  "version": 1,
  "archetype": "splitHero",
  "shell": {
    "nav": "stepper",          // scroll | stepper | tabs | sidenav | oneAtATime | accordion
    "chrome": "card",          // card | fullbleed | paper
    "brandPanel": { "side": "left", "width": "38%", "content": ["logo", "title", "progress"] }
  },
  "pages": [
    {
      "pageId": "p1",
      "grid": 12,
      "zones": [
        { "span": 8, "children": [
            { "type": "columns", "ratio": [1, 1], "sections": ["sec_A", "sec_B"] },
            { "type": "stack", "sections": ["sec_C"] }
        ]},
        { "span": 4, "sticky": true, "children": [
            { "type": "stack", "sections": ["sec_summary"] }
        ]}
      ]
    }
  ],
  "responsive": { "collapseBelow": "768px", "collapseOrder": "source" }
}
```

Container types: `stack`, `columns` (arbitrary ratio), `zone` (grid cell,
span/sticky), nestable to allow "split layouts with page structures inside."
Theme Spec stays the existing skin JSON (accent, surface, pageBg, font, radius,
cardShadow, glass, dark, sectionDefault, ...).

Deliverable: `docs/redesign/LAYOUT_SPEC.md` — full JSON Schema + validation
rules + mobile collapse semantics.

## 2. Layout archetypes (13 structurally distinct)

> Roster source of truth: [archetypes/README.md](archetypes/README.md)
> (11 core + 2 fast-follow). The table below is a summary — update the README
> first, then mirror here.

| # | Archetype | Structure | Default nav | Notes |
|---|-----------|-----------|-------------|-------|
| 1 | Classic | Single centered column card | scroll | today's default |
| 2 | Split Hero | Fixed brand panel (logo/title/progress) + scrolling form pane | scroll or stepper | evolves current `split` |
| 3 | Wizard Stepper | Horizontal step indicator, one page per step | stepper | evolves current `stepped` |
| 4 | Side-Nav | Vertical page/section rail, content right | sidenav | record-page pattern; jump nav |
| 5 | Conversational | One question at a time, full screen, keyboard-first | oneAtATime | Typeform-style; survey killer feature |
| 6 | Immersive Glass | Full-bleed bg, floating translucent card | scroll | evolves current `immersive` |
| 7 | Mosaic Grid | 12-col dashboard grid; sections span zones | scroll | the complex multi-layout workhorse |
| 8 | Document / Paper | Label-left dense rows, print-like application form | scroll | uses current `compact` density work |
| 9 | Accordion Stack | Collapsible sections, one open, completion ticks | accordion | lightning-accordion base |
| 10 | Tabbed Card | Sections as horizontal tabs in one card | tabs | lightning-tabset base |
| 11 | Console | Back-office record edit: topbar, label-left, side meta, repeater tables | scroll | from mock 05; internal-only |
| 12 | Timeline / Journey | Vertical milestone spine, sections as stops | scroll | fast-follow |
| 13 | Kiosk | Oversized targets, card-carousel pages | oneAtATime | fast-follow |

Each archetype = a preset Layout Spec + a default skin (extends
`LAYOUT_TEMPLATES` in `c/formThemes`). Every archetype must define its mobile
collapse behavior in the archetype board (Phase 0 deliverable).

## 3. Creation experience (redesigned newFormDialog → full-screen wizard)

> SUPERSEDED 2026-06-12: creation pivoted from a wizard to **gallery-first**
> (curated + custom templates + start-from-layout) — see PHASE2_WORKPLAN
> "CREATION REDESIGN" + project memory. The AI affordances below ("Describe
> your brand", "Start with AI") are **Phase 4** (§5), not part of the
> Phase-2 gallery.

Live preview pane permanently on the right; preview = the **real layout
engine** at ~0.5 scale (no static images).

1. **Foundation** — name, Form vs Survey, **Primary Object**.
2. **Layout** — archetype gallery. On object selection, Apex describe seeds the
   preview with 4–6 required + createable, non-system fields (Name, required
   customs, etc.) as element stubs. Clicking an archetype re-renders preview.
3. **Theme** — skin presets, brand color/logo upload (reuse
   FormAssetController), and AI box: "Describe your brand…" → Tier-1 prompt
   template → theme spec → live preview update.

Parallel **"Start with AI"** path: natural-language description of the form →
one-shot proposal of object fields + archetype + theme + seed sections → lands
in the same preview for refinement.

New Apex: `FormObjectDescribeController.getSeedFields(objectApiName)`
(cacheable, USER_MODE describe).

## 4. AI / Agentforce architecture

```
User intent → Agentforce agent / Prompt Template
           → Layout Spec patch + Theme Spec patch (JSON only)
           → Apex validator (JSON schema, token allowlist, WCAG contrast)
           → preview diff in builder → user clicks Apply (undoable)
```

> All of §4 is **Phase 4** (see §5). The pipeline above is the contract; nothing
> here ships earlier. AI emits **token patches, never raw CSS.**

**Tier 1 — one-shot (build first):** Prompt Builder templates invoked from Apex
(`ConnectApi.EinsteinPromptTemplateService` or `aiplatform.ModelsAPI` for
structured output). Use cases: theme-from-brand-description, **theme-from-brand-
URL** (Apex fetch/extract via an allow-listed service → LLM synthesizes a token
patch), layout suggestion from form purpose, "Start with AI" creation.

**Tier 2 — conversational copilot:** custom Agentforce agent, topic "Form
Design", Apex invocable actions:
- `ProposeLayout(formVersionId, instruction)` → spec patch
- `ApplyThemePatch(formVersionId, instruction)` → skin patch
- `RestructureSections(formVersionId, instruction)` → placement patch
- `PreviewSpec(patch)` → render-token summary for the agent to describe
Docked chat panel in the designer (custom LWC chat via Agent API). Every agent
change is a reviewable patch with preview-before-apply + undo (spec history on
the working draft).

**Tier 3 — vision:** Models API multimodal "match my logo" → palette. Non-AI
fallback: client-side canvas palette extraction from the uploaded logo.

**Guardrails:** Apex-side schema validation; only allowlisted archetypes,
container types, token names; contrast checker rejects unreadable skins; cap
spec size/depth; never persist unvalidated AI output.

**Feature detection:** dynamic check for Einstein GenAI provisioning; AI
affordances hidden when absent.

## 5. Phased roadmap

### Phase 0 — UX design sprint  ✅ DONE
Deliverables (all in docs/redesign/):
- `LAYOUT_SPEC.md` — JSON Schema + semantics (the contract; everything depends on it)
- `DESIGN_TOKENS.md` — token system v2 (extend `--c-*`; density, spacing scale, dark)
- Archetype boards — 1 page per archetype: grid, nav, mobile collapse, default skin
- Wireframes: creation wizard, designer shell redesign, copilot panel, preview harness
- UX review of flows (uiux-flow-reviewer pass on wireframes)

### Phase 1 — Layout engine  ✅ DONE 2026-06-11 (engine + 11 shells + skins; all 4 gates passed — see PHASE1_WORKPLAN)
> Scope note: bullet 3 (formPlayer adopts the engine) was deliberately held
> back by the workplan's "legacy untouched" guardrail — it is the first work
> item of Phase 2, before the wizard.
- `c/formLayoutEngine` = thin orchestrator + **one shell LWC per archetype**
  lazy-loaded via registry + `lwc:is` (LAYOUT_SPEC §11 architecture); shared
  `c/layoutZones` recursive renderer, `c/layoutModel`/`c/layoutNavState`
  modules. Week-1 spike: dynamic import under LWS/guest/2GP.
- 11 core preset specs (+2 fast-follow boards already final); harness page to QA archetype × skin × density × mobile
- formPlayer adopts engine behind the existing archetype values (back-compat:
  colour-only themes and the 5 legacy layouts map to preset specs)

### Phase 2 — Creation wizard  ← CURRENT (runs off PHASE2_WORKPLAN.md)
- **Step 0 (owner decision 2026-06-12): NEW `c/formViewer`** replaces the
  retrofit plan — old c/formPlayer stays untouched (existing forms keep
  working) and is deleted in Phase 6. formViewer = engine in live mode +
  new c/formSectionRenderer (real fields). Legacy layouts map to preset
  specs for preview only; no auto-migration.
- Full-screen wizard w/ live engine preview; seed-field describe Apex; theme step
- Replace newFormDialog entry point

### Phase 3 — Designer redesign
- Canvas renders the real layout (WYSIWYG); zone-aware drag & drop
- propertyPanel "Placement" controls (zone, span, column, sticky)
- Spec history / undo stack on working draft

### Phase 4 — AI layer  (SINGLE HOME FOR ALL AI — nothing AI ships before this)
> Consolidation rule (owner 2026-06-13): every AI/Agentforce/Einstein
> affordance lives in Phase 4. Earlier phases ship fully usable with ZERO AI
> licenses; AI is feature-detected and absent (not disabled) when unprovisioned.
> AI output is ALWAYS a validated Layout/Theme **token patch — never raw CSS**
> (raw CSS can't cross the engine's nested shadow roots; tokens are safe +
> validatable + undoable through the single-writer pipeline).

- **Tier 1 — one-shot prompt templates** (build first) + validator + feature
  detection. Use cases:
  - **"Start with AI"** creation path — NL form description → proposal of
    object + fields + archetype + theme (lands in the gallery/preview to
    refine). [creation pivoted to gallery-first; this is its AI on-ramp — see
    PHASE2_WORKPLAN, CREATION_WIZARD §6]
  - **"Describe your brand"** → Theme-token patch (CREATION_WIZARD §5).
  - **Brand-from-URL** → give a site URL, extract its fonts/colors/accent,
    recommend a Theme-token patch. Split: (a) FETCH+EXTRACT is plumbing, not AI
    — server-side Apex callout to an allow-listed brand-extraction/headless
    service (browser CORS blocks arbitrary fetch; true accent colors need a
    rendered page, not HTML parsing); (b) the LLM SYNTHESIZES the raw signals
    into a coherent token patch. Output = tokens, not CSS.
  - Layout suggestion from form purpose.
- **Tier 2 — conversational copilot:** Agentforce agent ("Form Design" topic) +
  invocable actions (ProposeLayout / ApplyThemePatch / RestructureSections /
  PreviewSpec) + docked copilot panel LWC. Preview-before-apply + undo via spec
  history. See COPILOT_PANEL.md.
- **Tier 3 — vision/palette:** Models API "match my logo/site" → palette.
  **Non-AI fallback (do regardless):** client-side canvas palette extraction
  from an uploaded logo — pure browser, no callout, no license.
- **Analytics (deferred):** Agentforce sentiment over survey responses
  (Form vs Survey model) lands here too.
- Guardrails (§4): Apex schema validation, archetype/container/token allowlist,
  WCAG contrast reject, spec size/depth cap; never persist unvalidated output.

### Phase 5 — Feature specs (one doc each, then build)
- Autofill (evolve autofillEditor)
- Lookup filters (Element_Lookup_Mapping__c extension)
- Per-element conditional re-render rules
- Non-field elements: rich text, image, divider, signature, file upload
- Related list / formRepeater placement inside zones (3 styles already done)
- Multi-object sections (see deferred deep-dive memory)

### Phase 6 — Hardening & packaging
- Guest parity for all archetypes; USER_MODE/FLS audit; Apex + Jest coverage;
  2GP packaging; security review prep (CSP, LWS, image hardening TODOs)

## 6. Open decisions

| Decision | Recommendation | Status |
|---|---|---|
| Build alongside vs evolve in place | Evolve in place (formThemes seams are right) | proposed |
| Agentforce optional for package | Yes — presets are the no-license path | assumed, confirm |
| Spec storage | `Form_Version__c.Layout_Spec__c` long text JSON, versioned with the form version | proposed |
| Legacy 5 layouts | Map to preset specs; no data migration needed | proposed |
| Mobile strategy | Every archetype defines collapse rules in its board; engine enforces | proposed |
