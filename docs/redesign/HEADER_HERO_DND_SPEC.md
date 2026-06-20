# Header & Hero — Drag-and-Drop Spec

Status: **SPEC FINALIZED / build-ready** · Owner-approved 2026-06-14
(remaining: a designer-code reality check before P1, see end)

## Goal
Give authors flexible placement of (a) a **Hero content block** and (b) the
**form Header**, without re-introducing the "too many confusing options" problem
the gallery redesign is solving, and without breaking multi-page (pagination)
branding or per-layout identity.

## Decisions (owner)
1. **Hero content block** — a draggable *element* (image/video + headline +
   subtext + optional CTA). Drops into any section/page like other elements.
   Page-bound (shows where placed). Rides the existing drag-drop + element system.
2. **Form Header → persistent header zone** — NOT loose in page bodies. A
   form-level band shown on **every** page. Author can **drag to reorder** its
   internal blocks (logo / title / subtitle / an in-header Hero) and set
   alignment / logo placement / show-hide. The band stays persistent across pages.
3. **Layout still owns WHERE the band sits** (splitHero → left hero panel; wizard
   → top sheet-head; stacked → top). Drag = reorder/align *within* the band, not
   relocate it across the layout. This is what keeps pagination branding intact
   AND preserves each layout's identity (resolves the chrome-vs-content collision).

## The chrome-vs-zone resolution (key architectural call)
Today the header is shell **chrome**: each shell hardcodes `logo → title → desc`
from `model.header`. We make `model.header` hold an **ordered list of header
blocks** + `align` + flags. Shells render the blocks **in order** in their existing
header slot. So:
- One source of header content (form-level, persistent).
- Each shell PRESENTS that content in its identity position (no shell repositioning
  by the user).
- splitHero's left panel = the header zone rendered vertically (consistent with the
  hero panel we just shipped). Same content, different presentation per layout.

## Data model (additive)
```
header: {
  align: 'left' | 'center',          // existing fields stay for back-compat
  logo, title, description,
  blocks: [                          // NEW — ordered; absent = legacy logo/title/desc
    { type: 'logo' },
    { type: 'title' },
    { type: 'subtitle' },
    { type: 'hero', mediaUrl, headline, subtext, cta:{label,href} }
  ],
  show: { logo, title, subtitle }    // show-hide toggles
}
```
Hero as a BODY element rides the existing element schema (full-width type):
```
{ type: 'Hero',
  imageUrl,                          // IMAGE ONLY in v1 (Files/ContentVersion or URL)
  headline, subtext,
  cta: {                             // OPTIONAL
    label,
    action: 'start' | 'link',        // author picks PER HERO
    href                             // used when action='link'
  }
}
```
Shape: **inline media + text + optional CTA** (image/banner above the headline+
subtext; NOT a full-bleed background — keeps text legible). The in-header Hero is
the SAME element rendered in the header slot (one component, two homes).
CTA `action:'start'` = scroll to first field / advance to first page; `'link'` =
open `href`.

## Build phases
- **P1 — Hero element (decoupled, lowest risk):** add `Hero` to the element
  palette; render it in `c/formSectionRenderer` (live) + `c/layoutSectionHost`
  stub (preview); add to FULL_WIDTH_TYPES; property-panel fields. No header/zone
  changes. Immediately useful.
- **P2 — Header zone model + render:** extend `model.header.blocks`; shells render
  blocks in order (fallback to legacy logo/title/desc when `blocks` absent). Engine
  ensures the zone is fed to every page.
- **P3 — Header zone editor (designer):** drag-reorder blocks, add in-header Hero,
  alignment / show-hide in the property panel.

## Resolved (owner, 2026-06-14)
- **Hero shape:** inline media + text + optional CTA (NOT background hero, NOT
  text-only).
- **Media v1:** image only (Files/ContentVersion or URL); video later.
- **CTA:** author picks per hero — `start` (jump to form) OR `link` (external href).
- **In-header vs body Hero:** SAME element, two homes.
- **Header zone:** alignment is zone-level (left/center); reorderable blocks =
  logo / title / subtitle / hero.

## Still to confirm before P1 code
- Designer reality check: confirm the palette + drop + body-JSON schema in
  `formDesigner`/`zFormDesigner` + `propertyPanel` (the DnD already works for
  sections/elements — Hero should slot into that, not a new system).

See memory [[project-multipage-shells]], [[project-creation-gallery-first]],
LAYOUT_SPEC.md, THEME_PROPERTIES_SPEC.md.
