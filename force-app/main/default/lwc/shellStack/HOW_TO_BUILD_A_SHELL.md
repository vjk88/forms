# How to build a shell (read before T7–T16)

A shell = one archetype's chrome. Copy this component's structure exactly.

## Steps
1. Read your board in `docs/redesign/archetypes/<name>.md` — ALL sections,
   including §10 "Exploration alignment" if present. If a mock exists in
   `design-explorations/`, it is the visual truth.
2. Create `c/shell<Name>` with the same `@api` surface as this component:
   `model`, `nav`, `mode` (contract: PHASE1_WORKPLAN §2.3). Do not add APIs.
3. Render every page's containers with
   `<c-layout-zones zones={page.zones} mode={mode}>`.
   NEVER reimplement zones/columns/stacks. Zones reflow to a single column on
   their own via a CSS container query (layoutZones reads its OWN width) — you
   do NOT pass a `collapsed` flag, and the engine no longer runs a ResizeObserver
   (it misread width inside Lightning columns).
4. Build your chrome per the board §3 wireframe + §6 behavior: stepper rail,
   tabs, accordion headers, brand panel, etc. Use `nav` (view from
   layoutNavState) for current page/progress/states; fire
   `navrequest` (`{ dir: 'next'|'back' }` or `{ pageKey }`) and
   `submitrequest` — the engine owns state.
5. Submit placement: follow LAYOUT_SPEC §4 principle; read
   `model.shell.submit`.
6. CSS: tokens only (`var(--c-*, fallback)`), DESIGN_TOKENS.md. No raw hex.
   No Apex. No `import` of anything except `lwc` (+ shared chrome components
   like c/layoutStepper when they exist).
7. Mobile: implement your board §7 collapse with **CSS container queries**, not
   `@media`. Put `container-type: inline-size` (name it if you query by name) on
   `:host`, then `@container (max-width: …)`. Forms render in variable-width
   regions, so viewport `@media` is wrong — the shell must read its OWN width.
8. Register: add one literal-loader line in `formLayoutEngine.js`
   `SHELL_LOADERS`, e.g. `mosaicGrid: () => import('c/shellMosaic')`.
9. Verify on the harness page in all skins. Acceptance criteria: your task
   card in PHASE1_WORKPLAN §3.

## Hard rules (review-reject if violated)
- z-index in shell CSS must stay ≤ 3. Lightning Experience's own chrome
  (global nav, page header) sits at z-index ~4–6 — anything higher paints
  over Salesforce's header when the page scrolls.
- No archetype conditionals anywhere outside `SHELL_LOADERS`.
- No zone/column markup in the shell.
- No new events or API properties.
- Chrome only — content rendering belongs to layoutZones/layoutSectionHost.
