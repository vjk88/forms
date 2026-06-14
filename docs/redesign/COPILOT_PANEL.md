# Design Copilot Panel — UX Spec & Action Surface

> Phase 0 deliverable. The conversational Agentforce surface inside the form
> builder (Tier 2 of MASTER_PLAN §4). Locks the UX contract *and* the Apex
> invocable action signatures so Phase 4 builds without redesign. Everything
> here is feature-detected: no Einstein GenAI / Agentforce license → the
> builder simply has no copilot button.

---

## 1. Principles

1. **Propose → preview → apply.** The agent never mutates the working draft
   directly. Every suggestion arrives as a validated patch the user sees
   rendered *before* accepting. Apply is one click; undo is one click.
2. **Same rails as humans.** Agent patches go through the identical
   `FormLayoutSpecValidator` + theme validator as designer edits. There is no
   privileged AI write path.
3. **Talk about the form, act on the spec.** The agent's vocabulary is the
   semantic ops of LAYOUT_SPEC §10 + theme patches. It cannot touch data
   mapping, validation rules, or submissions in v1 (see Non-goals).
4. **Visible reasoning, small diffs.** Each applied change produces a
   human-readable changelog line ("Moved *Address* beside *Contact*"), ≤ 15
   ops per turn.

## 2. Non-goals (v1)

- No field/data-mapping changes (adding elements bound to new object fields)
  — v1.1 candidate, needs FLS-aware grounding.
- No publishing, sharing, or submission-data access. Builder-draft scope only.
- No free-form CSS/HTML. Ever.

## 3. Placement & anatomy

Docked right panel in `formDesigner`, toggled by a `✦ Design copilot` button
in the builder header. 360px, collapsible; coexists with the property panel
(opening one collapses the other — same dock slot).

```
┌ formDesigner ──────────────────────────────────────────────┐
│ ◄ Forms   Contact Request · DRAFT        [Preview] [✦] [⋮] │
├──────────────────────────────┬──────────────────────────────┤
│                              │ ✦ Design copilot         ─ ✕ │
│        (canvas — real        ├──────────────────────────────┤
│         layout engine)       │ ⏺ You: make page 2 a two-    │
│                              │   column layout with the     │
│   ┌─────────┐  ┌─────────┐   │   address on the left        │
│   │Contact  │  │Address  │   │                              │
│   │░░░░░░░░░│  │▓▓▓▓▓▓▓▓▓│◄──┼─ ✦ Done — here's a preview.  │
│   └─────────┘  └─────────┘   │   ┌──────────────────────┐   │
│                              │   │ ▦ 2 changes          │   │
│      (ghost preview of       │   │ • Split page 2 into  │   │
│       proposed patch)        │   │   1:1 columns        │   │
│                              │   │ • Moved Address →    │   │
│                              │   │   left column        │   │
│                              │   │ [Apply] [Discard]    │   │
│                              │   └──────────────────────┘   │
│                              ├──────────────────────────────┤
│                              │ [Ask about your design…  ➤]  │
│                              │ ⚡ Warmer colors · Try Mosaic │
│                              │    · Tighten spacing         │
└──────────────────────────────┴──────────────────────────────┘
```

- **Ghost preview:** while a patch is pending, the canvas renders the
  *proposed* spec with a dashed accent outline on changed regions + a
  floating "Previewing suggestion — Apply / Discard" pill. The draft itself
  is untouched (preview = engine fed `applyOps(currentSpec, ops)` in memory).
- **Patch card** in the chat: op list in plain English, change count, Apply /
  Discard. Applied cards collapse to a changelog line with an `Undo` link.
- **Suggestion chips** under the composer: contextual quick actions (rotated
  from a static catalog + current state, e.g. "Try Mosaic" only when ≥ 3
  sections). Chips work without typing — discoverability for non-prompters.

## 4. Conversation behaviors

| User says | Agent does |
|---|---|
| "make it warmer" | `setTheme` patch (accent/pageBg/font); preview re-skins |
| "put contact info side by side with address" | `splitColumns` + `moveSection` |
| "this feels cramped" | `setDensity` and/or `setTheme` spacing keys; explains choice |
| "make page 2 a wizard" | proposes `setArchetype`/`setShell` — flags page-grouping implications, asks before restructuring > 1 page |
| "which layout suits a guest survey?" | Recommends from archetype `ai` metadata (grounding), with rationale; offers to apply |
| "match my logo" | Tier-3 palette extraction → `setTheme`; falls back to client-side palette if vision unavailable |
| Ambiguous ("fix it") | Asks one clarifying question max, then proposes its best read |
| Out of scope ("delete responses") | Declines, names the right place ("Responses tab") |

Multi-turn context: the agent session holds the form's current spec digest +
section/page names (refreshed each turn) — *never field values or response
data*.

## 5. Action surface (locks Phase 4 Apex signatures)

Custom Agentforce agent, topic **"Form Design"**, with these invocable
actions. All take `formVersionId` (validated: current user must have builder
access via the existing FormDesignerController checks; draft versions only).

| Invocable action | Input | Output |
|---|---|---|
| `GetDesignContext` | formVersionId | spec digest, archetype, skin, page/section names+keys, counts, validation lint summary |
| `ProposeLayoutPatch` | formVersionId, instruction | `ops[]` (LAYOUT_SPEC §10), rationale, humanSummary[] |
| `ProposeThemePatch` | formVersionId, instruction | theme patch JSON, rationale, contrastReport |
| `RecommendArchetype` | formVersionId, intent | ranked archetypes + rationale (grounded in board `ai` metadata) |
| `ValidatePatch` | formVersionId, ops[] | ok / machine-readable errors (agent self-corrects, max 2 retries) |
| `RenderPatchSummary` | ops[] | plain-English changelog lines (deterministic Apex, not LLM — what the patch card shows) |

**Apply is NOT an agent action.** The Apply button calls
`FormDesignerController.applySpecPatch(formVersionId, ops)` directly from the
LWC — the human click is the only write trigger. `applySpecPatch` =
validate → apply → push undo entry (`Spec_History__c` ring buffer, 20) →
return new spec. Per LAYOUT_SPEC §6, this validator-fronted method is the
**only** persistence path for `Layout_Spec__c` — copilot, wizard, and manual
designer edits all converge on it; implementers must not add a second one.

Because patches are semantic ops (not absolute positions), rebasing onto a
changed spec (see §7) is well-defined: each op re-resolves its
`sectionKey`/`pageKey` targets against the current tree and fails localized,
not wholesale.

Chat transport: custom LWC chat (`c/designCopilot`) → Apex → **Agent API**
(REST, named credential). We own the UI (patch cards, ghost-preview hooks),
which the standard Agentforce panel can't do.

## 6. Guardrails & trust

- Identical validator path as manual edits (§1.2); ops allowlist; ≤ 15
  ops/turn; rejected patches return machine-readable reasons for
  self-correction, then surface honestly: "I couldn't produce a valid change
  for that."
- Contrast checker on every theme patch; failing patches are auto-corrected
  to nearest passing values *with a note*, not silently.
- Grounding data out: describe metadata, spec, board metadata. Never record
  data, never submission data. Documented for security review.
- Rate/size: agent calls metered per the org's Einstein limits; panel shows a
  quiet "limit reached" state rather than erroring.
- Every applied patch is attributed in the changelog ("via copilot") —
  auditability for teams.

## 7. States

| State | Behavior |
|---|---|
| No license / not provisioned | No ✦ button (absent, not disabled) |
| Provisioned, agent disabled by admin | ✦ opens a one-card explainer with the setup link (admin-only) |
| First open | Empty-state: 3 example prompts + the suggestion chips |
| Published version open (read-only) | Panel read-only: can discuss/recommend, Apply disabled with "drafts only" note |
| Patch pending + user edits canvas manually | **Rebase-or-keep, never silent discard:** ops re-apply onto the new spec; clean rebase → preview refreshes with an "updated to your latest edits" note; conflict (op targets a moved/deleted node) → inline choice "Keep suggestion (re-propose)" / "Discard suggestion" |
| Network/agent error | Retry affordance in-thread; never blocks the builder |
| Long thinking | Streaming status line ("Sketching a two-column layout…"); cancellable |

## 8. Undo & history

- `Spec_History__c` (draft-scoped JSON ring buffer, 20 entries) records both
  manual and copilot patches — one undo stack, no special AI lane.
- Panel changelog lists applied entries; `Undo` reverts to the entry's base
  (with downstream-entry warning if not the latest).
- Builder's existing save flow is unchanged — history rides the working draft.

## 9. Build notes (Phase 4)

- New LWC: `c/designCopilot` (chat, patch cards, chips), ghost-preview mode on
  `c/formLayoutEngine` (`proposed-spec` attribute + changed-region outlines).
- New Apex: `FormCopilotController` (Agent API transport, session mgmt),
  invocable action classes (§5), `applySpecPatch` + `Spec_History__c` on
  FormDesignerController side (this lands in **Phase 3** with the designer
  redesign — undo is wanted for manual edits anyway).
- Agent metadata: GenAI plugin/topic + prompt templates grounded with board
  `ai` YAML blocks (single source: generate grounding from the boards at
  build time, don't hand-copy).
- Tests: `testing-agentforce` utterance suite per §4 table; Apex tests for
  validator/applySpecPatch paths; Jest for patch-card lifecycle incl. stale
  discard.

## 10. Open questions

- Voice & name: "Design copilot" (working name) — confirm naming vs
  Agentforce branding guidelines for AppExchange listings.
- Should chips be archetype-aware curated lists per board (more setup, better
  quality) or one global catalog with availability rules? (leaning: global
  catalog with rules — boards already encode the conditions)
- Conversation persistence across builder sessions: keep thread per form
  draft (nice continuity) or fresh each open (simpler, cleaner privacy
  story)? (leaning: fresh each open for v1; revisit with user feedback)
