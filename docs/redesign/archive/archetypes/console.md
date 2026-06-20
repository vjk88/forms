# Console

## 1. Identity

| | |
|---|---|
| id | `console` |
| tier | core |
| nav | `scroll` |
| chrome | `card` (app-chrome variant) |
| density | compact |
| legacy mapping | — (new; design source: `design-explorations/05-admin-record-edit.html`) |

The back-office record-edit experience: breadcrumb topbar, label-left compact
rows, side system-meta panel, inline related-list tables, sticky savebar.
Forms are object-bound — this is the archetype for *editing records fast*.

## 2. When to use / AI metadata

```yaml
ai:
  keywords: [admin, back-office, record, edit, update, internal, console, operations, data entry, line items]
  fieldCount: { min: 8, max: 80 }
  pages: single   # multi-page renders as grouped cards with jump links
  audience: [internal, embedded]
  recommendWhen: "internal record edit/update on a known record; repeater-heavy forms (line items); power users"
  avoidWhen: "guest anything; brand-forward forms; first-time-user flows"
```

## 3. Structure (desktop)

```
┌──────────────────────────────────────────────────┐
│ ⬢ Opportunities / Halden — Renewal  [Cancel][Save]│ ← sticky topbar
├──────────────────────────────────────────────────┤
│  Halden Group — Renewal   ● Open  #OPP-4471      │ ← title row + badges
│ ┌──────────────────────────────┐ ┌─────────────┐ │
│ │ DETAILS                      │ │ SYSTEM      │ │
│ │ Name *        [___________]  │ │ Created  …  │ │
│ │ Account       [___________]  │ │ Modified …  │ │
│ │ Stage         [select ▾   ]  │ │ Source   …  │ │
│ │ Close/Amount  [____][_____]  │ │ ◉ Last edit │ │
│ ├──────────────────────────────┤ └─────────────┘ │
│ │ LINE ITEMS (3)    + Add item │      250px      │
│ │ Product   Qty  Price  Total  │                 │
│ │ ───────────────────────────  │                 │
│ │ Total              $48,000   │                 │
│ └──────────────────────────────┘                 │
│                          [Cancel] [Save record]  │ ← sticky savebar
└──────────────────────────────────────────────────┘
```

## 4. Preset spec

Fill rule: sections as cards in the main zone (source order); a Live Summary /
meta widget in the side zone; repeater sections default to table style.

```json
{
  "version": 1,
  "archetype": "console",
  "density": "compact",
  "shell": {
    "nav": "scroll",
    "chrome": "card",
    "maxWidth": "wide",
    "header": "none",
    "progress": "none",
    "submit": { "placement": "stickyBottom", "alignment": "right" }
  },
  "pages": [
    { "pageKey": "p_main", "grid": 12, "zones": [
      { "type": "zone", "span": 9, "children": [
        { "type": "stack", "sections": ["sec_details", "sec_line_items"] }
      ]},
      { "type": "zone", "span": 3, "sticky": true, "children": [
        { "type": "stack", "sections": ["w_meta"] }
      ]}
    ]}
  ],
  "responsive": { "collapseBelow": "1024px", "collapseOrder": "mainFirst" }
}
```

`w_meta` = widget-backed pseudo-section (Live Summary widget, meta-rows
variant — Phase 5 widgets spec). `header: none` — the **topbar + title row**
are engine chrome keyed off `archetype` (breadcrumb derives from the bound
object + record; badges from designer-picked status/reference fields).

## 5. Default skin

New `LAYOUT_TEMPLATES.console` (source: mock 05 — IBM Plex, indigo):

```js
{ name: 'console', label: 'Console', font: 'plex',
  accent: '#4f46e5', surface: '#ffffff', pageBg: '#f4f5f7',
  radius: 'rounded', cardShadow: 'none', sectionDefault: 'card',
  glass: false, labelPosition: 'left', labelStyle: 'muted-sm' }
```

(`plex` = new FONT_PAIRING from the webfont bundle — see audit §Cross-cutting.
Card borders hairline `--c-border-light`, uppercase micro section headers.)

## 6. Interaction & nav behavior

- **Topbar (sticky):** object icon + breadcrumb + Cancel/Save; Save mirrors
  the savebar (one submit pipeline); keyboard `Ctrl/Cmd+S` triggers Save.
- **Title row:** record Name + designer-configured badge fields (status
  picklist → colored badge, reference/auto-number → mono badge).
- Label-left rows with hairline separators; `labelPosition` flips to `top`
  below breakpoint (Document board rule reused).
- Read-only fields render as plain values (`val read` pattern), not disabled
  inputs — respects FLS-driven read-only from the existing controllers.
- Sticky savebar appears once content scrolls past the topbar actions
  (avoid duplicate CTAs in short forms — engine measures).
- Cancel = discard confirmation if dirty.

## 7. Mobile collapse (< 1024px)

- Side meta zone drops below content (`mainFirst`), sticky off.
- Topbar keeps breadcrumb tail only (record name); actions move into the
  sticky savebar. Label-left → label-top.
- Repeater tables fall back to stacked cards (existing formRepeater mobile
  behavior).

## 8. Repeaters & edge cases

- **The repeater showcase archetype**: table style with header row, hover
  rows, inline add-row, delete per row, and a **totals footer** (new repeater
  option — sum of a designer-picked numeric column; Phase 5 repeater spec).
- Lookups render with the link treatment (`lk`) in read mode.
- Embedded adapter: natural fit (record pages); topbar suppressed when the
  host page already provides record context (designer toggle, default
  suppressed on `Embedded`).
- Guest: lint-blocked (internal-only archetype; AI never recommends it for
  guest adapters).
- Autofill/URL-prefill pairs strongly here (record-edit) — note for the
  Phase 5 autofill spec.

## 9. Open questions

- Badge field configuration UX — title-row settings in the designer's form
  settings tab, or property panel on a pseudo-element? (leaning: form
  settings tab)
- `Ctrl+S` capture inside Lightning record pages (host app also binds it) —
  verify; drop the shortcut on `Embedded`/`Internal_Record_Page` adapters if
  it conflicts.
