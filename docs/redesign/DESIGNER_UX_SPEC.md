# Form Designer — Build-Ready UX Spec

> **Status:** SPEC COMPLETE / build-ready (2026-06-15). The single source of truth
> for building the redesigned form designer. Fuses the interactive mockup + the
> theme spec + the header/hero spec + the phased plan.
>
> **Artifacts:** interactive mockup `designer-ux-blueprint-mockup.html` (open it —
> it is the visual reference) · `THEME_PROPERTIES_SPEC.md` (appearance surface) ·
> `HEADER_HERO_DND_SPEC.md` (Hero element + header zone) · `LAYOUT_SPEC.md` /
> `DESIGN_TOKENS.md` (engine + tokens).
> **Memory:** [[project-designer-redesign]], [[project-header-hero-dnd]],
> [[project-multipage-shells]], [[project-form-themes]].

---

## 1. The core principle — a decoupled editor

The designer edits the **model** (pages / sections / elements / settings). The
**engine** (`formLayoutEngine` + shells + themes) renders it. These are separate:

- **Blueprint** = a structural editor of the model. Theme-agnostic. **Stable** —
  it never changes when layouts/themes are added.
- **Live preview** = the real `formViewer` rendering the model. **All** presentation
  lives here.

**Payoff:** adding layouts/themes forever = render-path work only. The editor is
built **once**. This works because `materialize(archetype, …)` already derives the
layout from the model — the editor never needs per-layout editing.

> Consequence for estimating: most future "new layout / new theme" requests touch
> `formThemes` + a shell, NOT the designer. Budget accordingly.

---

## 2. Screen architecture (3 zones + chrome)

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BAR: FormBuilder Pro · [Forms|Surveys] · Form ▾ · Version ▾  …  ↶ ↷ · Saved · Publish │
├───────────┬───────────────────────────┬───────────────────────────────┤
│ MODE BAND │                           │                               │
│ [Build|Design]                        │                               │
├──┬────────┤   BLUEPRINT (center)       │   LIVE PREVIEW (right)         │
│⬚ │ panel  │   structural editor of     │   real formViewer             │
│▦ │ (insert│   the model — pages tabs,  │   device toggle (desk/mob)    │
│  │ + props│   sections, fields, hero,  │   persistent, on by default   │
│  │ )      │   related lists, drag      │                               │
│  │        │   [Hide editor ‹] collapse │                               │
└──┴────────┴───────────────────────────┴───────────────────────────────┘
  icon dock   ← LEFT WORKSPACE COLUMN →    ↑ shares the model, renders live
```

- **Top bar** (§3) — app/form-level chrome.
- **Mode band** — a `Build | Design` toggle in a slim band **above the left
  panel** (scopes the modes to the editing workspace, not the whole app).
- **Left workspace column** — icon dock + contextual panel.
- **Blueprint** (center) — structural editor; collapsible ("Hide editor") so the
  preview can take more room within Build mode too.
- **Live preview** (right) — `formViewer`, device toggle, persistent.

---

## 3. Top bar (trimmed for the new design)

| Element | Behavior |
|---|---|
| **FormBuilder Pro** | app brand |
| **Forms / Surveys** | segmented switch between the two builder types |
| **Form name ▾** | switch between forms / rename |
| **Version ▾** (`v2 Draft`) | version selection; **history + discard fold into this dropdown** |
| **Undo / Redo** | ↶ ↷ |
| **Autosave status** | "All changes saved" / "Saving…" — replaces an explicit Save |
| **Publish** | the deliberate publish action |

**Removed as redundant:** eye/Preview (live preview is always on), `+ New Form`
(app/list-level), explicit `Save *` (autosave), standalone settings gear (form-behavior
settings surface, if needed, opens from the form/version dropdown — NOT theme).

---

## 4. Build mode

### 4.1 Left dock (Insert)
Icon dock, **panel stays open** (pin / auto-close toggle). Two icons:
- **Fields** — object fields + search. **When a related list is selected, the panel
  swaps to that child object's fields** (header: "Fields · Contacts") and hides the
  primary fields. Reuses `zFieldPalette` concepts.
- **Insert (Elements)** — grouped: *Structure* (Section), *Content* (Hero, Display
  Text, Image, Callout, Divider, Spacer, Consent, File Upload), *Data* (Related List).

### 4.2 Blueprint canvas
A clean, high-contrast **structural** view (NOT WYSIWYG, NOT decorative-dark):
- **Page tab strip** at top — add (`+`), drag to reorder, click to edit. **Pages are
  managed here, never dragged from the dock.**
- **Sections** — draggable from the dock + a "+ Add section" on canvas. Show
  title, columns, the fields inside as labeled slots, drag grips.
- **Hero** — draggable content block (body or header zone). See `HEADER_HERO_DND_SPEC`.
- **Related List** — draggable, drops **outside** sections; on drop, pick the child
  object **once → locks** (change = delete & re-add). Selecting it switches the
  Fields panel context (§4.1).
- **Selection** — click any element → its properties open in the **left panel**
  (unified inspector lives left in this model). Click empty canvas → deselect.
- **Collapse** — "Hide editor" hides the blueprint; preview expands; a slim strip
  re-opens it.

### 4.3 Selection → properties (unified inspector, left)
One contextual panel. Field / Section / Hero / Related List each show their own
properties (label, required, width, visibility, columns, style, image, headline,
CTA action, display style, locked object, …). Reuses `zPropertyPanel` concepts.

---

## 5. Design mode

Toggling **Design**: the **blueprint auto-hides**, the **live preview expands to
fill**, and the left dock swaps to appearance categories (its own focused surface,
à la Zoho "Form Customization" — `THEME_PROPERTIES_SPEC` §10.6). Categories:

| Category | Edits (→ `THEME_PROPERTIES_SPEC`) |
|---|---|
| **Layout** | the layout cutouts (same as the gallery) — §1.1, §5 layout options |
| **Theme & Color** | theme / skin / accent / surfaces / field-state colors — §3.1, §3.2, §3.6 |
| **Header** | header zone blocks (drag-reorder) + alignment + surface — §4 |
| **Buttons** | shape / width / alignment / submit color / label — §7 |
| **After-submit** | thank-you vs redirect + message — (FormSubmit behavior) |

Changing any of these **only re-renders the preview** — the blueprint is untouched.

---

## 6. Live preview

- Embeds the **real `formViewer`** (single rendering source of truth) — interactive
  (type, validate, page through).
- **Device toggle** (desktop / mobile) flips the rendered width — same FormDesigner
  preview pattern already working (true device width, no scale; see
  [[reference-container-type-flex-collapse]] + [[project-responsive-pass]]).
- **Persistent, on by default**; the blueprint's "Hide editor" gives it more room.

---

## 7. Component architecture (build)

**New (the designer shell):**
| Component | Role |
|---|---|
| `c/formStudio` *(provisional name)* | the 3-zone shell: top bar, mode band, left column, blueprint, preview. Owns `mode` (build/design), selection, page state. |
| `c/studioBlueprint` | the structural canvas (renders the model schematically; drag/drop, selection). |
| `c/studioDock` | left icon dock + contextual panel (insert + inspector); swaps content by mode + selection. |

**Reused as-is (the render + model layers):**
- `c/formViewer` → the live preview (already renders the model live).
- `c/formLayoutEngine` + shells + `c/formThemes` → rendering (untouched by designer).
- `c/layoutModel` (`materialize`, `normalize`) → the model the blueprint edits.
- `c/formNav` → multi-page nav (already built).
- Concepts/markup salvageable from `zFieldPalette`, `zPropertyPanel`, `zFormElement`.

**Apex:** `FormViewerController` (preview data), `FormCreateController` /
`FormTemplateController` (create), `FormAssetController` (images), `FormSubmitController`.

**Storage:** content = `Form_Version__c` body JSON + spec JSON; appearance =
`Layout_Config__c` JSON (`THEME_PROPERTIES_SPEC` §8). Additive, 2GP-safe.

> **Decision needed (build start):** new `c/formStudio` fresh vs evolve
> `zFormDesigner`. Recommendation: **fresh component**, reusing model + `formViewer`
> + salvaged palette/property markup. Legacy isn't a constraint ([[feedback-legacy-no-constraint]]).

---

## 8. Element type plumbing (from the designer reality-check)

A new element (e.g. **Hero**) touches:
1. **Palette** — `zFieldPalette` `COMMON_COMPONENTS` (drag = `{dragType:'component', componentType}`).
2. **Drop → element** — `zFormDesigner`/studio drop handler creates `{type, …defaults}`.
3. **Blueprint render** — `zFormElement`/`studioBlueprint` per-type branch.
4. **Live render** — `formSectionRenderer` branch.
5. **Preview stub** — `layoutSectionHost` + add to `FULL_WIDTH_TYPES`.
6. **Property panel** — `zPropertyPanel`/inspector editor.
7. ⚠️ **Casing seam** — palette emits PascalCase (`Hero`); `zFormElement` checks
   lowercase (`static_text`). Pin where the normalization happens so the type is
   consistent across blueprint + live/preview.

---

## 9. Phased build plan

- **P1 — Hero element** (decoupled, low-risk, works in current designer + render
  path; real user value). Build per §8 + `HEADER_HERO_DND_SPEC` P1. **First code.**
- **P2 — Blueprint shell** (`c/formStudio` + `studioBlueprint` + `studioDock`):
  3-zone layout, Build/Design modes, `formViewer` preview embed, selection→inspector,
  page tab strip, section/field rendering, collapse. The centerpiece.
- **P3 — Design mode panels** (Layout / Theme / Header / Buttons / After) wired to
  `Layout_Config__c` per `THEME_PROPERTIES_SPEC`; header zone (P2/P3 of header spec);
  related-list locking + field-context switch.
- **P4 — Polish**: a11y (focus, roles, keyboard DnD), responsive of the designer
  chrome itself, empty/loading/error states, autosave/version wiring.

Each phase: lint + jest + deploy revcloud@dev.com; apply `~/.claude/skills/salesforce.md`
(USER_MODE, CRUD/FLS, guest guards, tests) per [[feedback-apply-salesforce-skill]].

---

## 10. Consolidated decisions

1. Decoupled editor — blueprint edits model, `formViewer` renders (§1).
2. Two-mode workspace — persistent `Build | Design` toggle **above the left panel**;
   Design hides blueprint, expands preview, swaps dock to appearance categories.
3. Unified inspector — one contextual panel (left); selection drives it.
4. Pages on a tab strip (not a drag block); sections draggable; related list drops
   outside sections + locks its object + switches field context; Hero draggable.
5. Docks stay open (pin/auto-close); blueprint collapsible.
6. Top bar trimmed (§3) — keep Forms/Surveys + version; autosave replaces Save;
   undo/redo kept; eye/new-form/gear removed.
7. Icons: SLDS `lightning-icon utility:*` at build (mockup SVGs are throwaway,
   license-safe). Modern look OK for designer chrome; in-form content icon set tabled.
8. New `c/formStudio` (fresh), reusing model + `formViewer` + salvaged markup.

---

## 11. Open questions (resolve at build start)

- Final component names (`formStudio` et al.).
- Drag-and-drop library/approach for the blueprint (native HTML5 DnD vs a11y-friendly
  keyboard-reorder; the existing designer uses native DnD — likely keep + add keyboard).
- Where form-**behavior** settings (notifications, access, submission) live now that
  the gear is gone — proposed: a section of the form/version dropdown or an "After-submit"-
  adjacent settings surface. Decide when P3 lands.
- Survey mode parity — the Forms/Surveys switch implies the studio also hosts the
  survey builder; confirm scope (likely same shell, different palette/render).
