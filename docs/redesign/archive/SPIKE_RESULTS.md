# T1 Spike Results — dynamic shell loading

Date: 2026-06-10 · Org: revcloud@dev.com (API v66.0)

## Outcome so far

| Check | Result |
|---|---|
| Deploy foundation LWCs (engine, model, navState, zones, sectionHost, shellClassic, zEngineSpike) | ✅ Succeeded (Deploy ID 0Afhk000000BelJCAS) |
| Literal `import('c/shellX')` compiles on-platform | ✅ — but ONLY with `lightning__dynamicComponent` capability (see finding 1) |
| Renders on Lightning app page (internal) | ✅ owner-verified 2026-06-10 |
| Renders on Experience Cloud page as guest | ✅ owner-verified 2026-06-10 |
| applyOps splitColumns end-to-end (button on spike) | ✅ owner-verified 2026-06-10 |
| Missing-shell friendly notice (mosaicGrid button) | ✅ owner-verified 2026-06-10 |

**VERDICT: dynamic shell `import()` works on-platform. Shell-per-archetype
architecture confirmed — T7–T16 may proceed.** Delete `c/zEngineSpike` once
the T17 harness lands.

## Platform findings (already fixed — binding for T6–T20 builders)

1. **`LWC1503: Dynamic imports are not allowed`** — any component using `import()`
   MUST declare in its `*.js-meta.xml`:
   ```xml
   <capabilities>
       <capability>lightning__dynamicComponent</capability>
   </capabilities>
   ```
   Only `formLayoutEngine` needs this (shells are imported, they don't import).

2. **`:host-context` is rejected by the platform compiler** (LWC1009; only allowed
   with `disableSyntheticShadowSupport`, which we will not set).
   → Collapse redesigned: `formLayoutEngine` measures its root via ResizeObserver
   against `spec.responsive.collapseBelow` and exposes `model.collapsed`; shells
   MUST pass it through: `<c-layout-zones ... collapsed={model.collapsed}>`.
   LAYOUT_SPEC §7 mechanism amended accordingly; HOW_TO_BUILD_A_SHELL step 3 updated.
   **Never use `:host-context` in any redesign CSS.**

## Manual verification steps (owner: Vijay)

1. Setup → Lightning App Builder → any app page → drag **Z Engine Spike** → save/activate → open.
   Expect: title "Contact Request", 3 stub sections, submit button. Click both
   buttons; status line should report success / friendly missing-shell notice.
2. Experience Builder → add **Z Engine Spike** to a public page → publish → open
   in incognito (guest). Expect identical rendering.
3. Mark the PENDING rows above and delete `c/zEngineSpike` after T17 harness lands.
