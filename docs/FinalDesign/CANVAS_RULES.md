# Canvas Rules — element placement, drop validity, and inspector behavior

> **Status: extracted contract, binds at P3 (`builderCanvas`).** These rules were hard-won in the
> legacy `formStudio` builder ("we fixed a lot of issues… I don't know where they are logged" —
> owner 2026-07-05); this doc is where they're logged. Source of record for each rule is cited into
> [formStudio.js](../../force-app/main/default/lwc/formStudio/formStudio.js) as of extraction —
> the REBUILD reimplements the rules from this doc, never by porting shell code. Companions:
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md) §5 · [[reference-formstudio-dnd]] (DnD event
> model: capture-phase gatekeeper, imperative highlights, native no-drop — kept as-is).

## 1 · Drop validity — ONE source of truth

One predicate decides BOTH the cursor and the highlight (legacy `_sectionAcceptsDrag`,
formStudio.js:2439). The gatekeeper consults it; nothing else re-derives validity.

| Drag kind | May drop where |
|---|---|
| Section / page reorder | Anywhere in the canvas (insertion line) |
| Palette content block (hero-class, image, divider…) | Anywhere — including standalone in the gaps BETWEEN sections |
| Palette **field** | Only into a real field-section — **never** into a content block, **never** into a repeater section (child fields are added via the repeater's inspector, not the parent-object palette), **never** in gaps between sections |
| Existing **element** move | Only between sections sharing its **data context** (§2) |

Rejection = native no-drop cursor. **No toasts, no error flashes** — invalid spots simply refuse.

## 2 · Data-context signatures — fields can't wander across objects

Every section carries a context signature: `'parent'` for primary-object sections,
`rel:{childObject}` for repeater sections (formStudio.js:1050). An element may only move between
sections with the **same signature**:

- A parent-object field can never land inside a repeater.
- A child-object field can never leak out of its repeater (or into a different repeater).
- Two repeaters on the same child object share a signature — moving between them is legal.

## 3 · Content blocks hold nothing

Content blocks (standalone image / rich text / divider blocks) are leaf surfaces: they never
accept fields or elements dropped into them (formStudio.js:2443). They reorder like sections and
may live in the gaps between sections.

## 4 · The Repeater drop flow (owner-kept UX — the reference)

1. **Repeater** is a first-class draggable palette item.
2. Drop (or click-add) opens the **child-relationship picker** — the primary object's child
   relationships listed as "{Child Object Label} · via {linking field}" (formStudio.js:1687-1749).
3. Picking one mints the repeatable section **at the drop position**, titled by the child object
   label, selected, with its child-field list loading.
4. Its inspector is DEDICATED (never the generic section inspector): display style
   (Stacked / Table / Tiles+modal), add-button label, min/max entries, columns, and the
   **child-object field list** for adding fields (deduped against fields already in the section).
5. Requires a primary context object — without one, click-add informs and aborts.

## 5 · Inspector rules (properties differ by what & where)

- The inspector is **per-type**: Field / Image / Callout / Consent / Divider / Display text /
  File upload / Spacer / Section / Related list (repeater) each expose only their own properties
  (formStudio.js:1145-1170). No universal property grid.
- A repeater section's inspector is owned by the repeater flow (§4) — it never shows plain
  field-section props (formStudio.js:1151).
- **Section inner padding is a GLOBAL design setting, not per-section** (formStudio.js:1234) — the
  rebuild keeps padding on the density/theme cascade, with per-section padding only via the
  section `surface` override (schema §4).

## 6 · Serialization invariants (repeater)

- A standalone repeater serializes as a **wrapper section carrying one relatedSection** — and a
  field-section never re-nests a stale relatedSections copy (formStudio.js:644-683). Rebuild
  equivalent: `repeat` lives ON the section (schema §4.1); the invariant becomes "repeat config
  serializes exactly once, on the section that owns it."
- Elements inside the repeater bind to the CHILD object; the linking field is config, never an
  authored element.

## 7 · What the rebuild does NOT port

The legacy shells' chrome bugs (BUILD_PHASES P1 anti-checklist) and formStudio's
serializer/inspector implementation. Only the RULES above + the DnD event model
([[reference-formstudio-dnd]]) carry forward.
