# Theme & Layout Properties — Editor Spec

> **Status:** DRAFT for review (2026-06-13). No code yet — this is the full
> enumeration of everything a user can edit in the theme/layout editor.
> Decisions locked this session: **7 layouts in 3 groups**, **7 themes + accent
> picker** (see §1). Builds on `DESIGN_TOKENS.md` (the `--c-*` token layer) and
> `LAYOUT_SPEC.md` (the engine). Storage = `Form_Version__c.Layout_Config__c`
> JSON; images = ContentVersion via `FormAssetController` ([[project-config-image-storage]]).

---

## 0. The two axes (mental model)

```
LAYOUT  (structure — how the form flows)      ×      THEME (appearance — how it looks)
  organised into 3 user-facing groups                 7 named themes + accent + overrides
        │                                                         │
        └──────────────  mix & match: any layout × any theme  ───┘
```

- **Layout** decides navigation/flow. **Theme → Skin → Accent** decide appearance
  (three nested tiers, see §1.2).
- Appearance resolves in order: `THEMES[id]` (family base) **→ `SKINS[id][skin]`**
  (the light/dark/mood variant) **→ accent** (color override) **→ per-property
  overrides** the user edits here. The editor writes **Theme Spec keys**, never raw
  `--c-*` tokens — `themeVars()` is still the only token producer (DESIGN_TOKENS §1).
- Everything below is either a **Theme Spec key** (appearance, cascades into
  tokens) or a **config block** (`header`, `layout.options`, per-section/field).

---

## 1. Catalog (the locked decisions)

### 1.1 Layouts — 3 groups, 8 layouts (7 shell components)

Canonical layout ids = the `presets.js` PRESETS keys (Phase 3 T3.3). Old
archetype names resolve via `ARCHETYPE_ALIAS`. Shell components: **12 → 7**.

| Group (user-facing) | Layout (`id`) | Flow | Shell component |
|---|---|---|---|
| **Continuous Flow** — one page, scroll, all visible | **Stacked** (`stacked`) | single column of sections | `c/shellStack` (absorbs classic/sfRecordPage/glass/document/console — their looks are now **themes**) |
| | **Bento Grid** (`bento`) | 2D packed tiles | `c/shellStack` + MOSAIC fill rule (grid lives in the fill, not the shell) |
| **Paginated / Nav-Driven** — move between pages | **Stepper** (`stepper`) | linear steps + progress | `c/shellWizard` (stepperMode: vertical/horizontal/progress — T3.4) |
| | **Split Hero** (`splitHero`) | brand panel + steps | `c/shellSplitHero` — **its own layout** (owner): the whole left panel IS the header panel + holds any number of brand/highlight messages |
| | **Side Nav** (`sideNav`) | persistent index, jump to any page | `c/shellSideNav` |
| | **One-at-a-Time** (`oneAtATime`) | one section at a time, minimal | `c/shellConversational` |
| **Tabbed & Accordion** — one page, progressive disclosure | **Tabbed** (`tabbed`) | tabbed sections | `c/shellTabbed` |
| | **Accordion** (`accordion`) | collapse/expand in place | `c/shellAccordion` |

### 1.2 Appearance = Theme → Skin → Accent (three tiers)

- **Theme** = the design *language* (typography style, radius, shadow, section
  style, surface philosophy). **7 of them.** Picked first.
- **Skin** = a curated **variant within a theme** — light/dark + surface *mood*
  (NOT just a recolor). Each theme ships 2–4. This is the new third dropdown.
- **Accent** = the single brand **color** knob, layered on top of any theme+skin
  (color picker, §3.1). Kept separate from Skin so they don't overlap: Skin
  changes the *mood/surface*, Accent changes the *color*.

**The 7 themes + proposed skins** (skins are a starting proposal — easy to edit):

| Theme | Identity | Proposed skins | Seeded from |
|---|---|---|---|
| **Lightning** | SLDS-faithful, native Salesforce (4px, #f3f3f3, SF Sans, hairline borders, no shadow) | Light · Dark | `sfRecordPage` |
| **Cloud** | Friendly enterprise blue, rounded, soft shadow | Light · Dark · Soft | `classic` |
| **Midnight** | Dark, glass, mesh gradient | Noir · Aurora · Nebula *(mesh-hue moods)* | `immersiveGlass` |
| **Luxe** | Serif display, sharp, gradient | Emerald · Onyx (dark) · Champagne (light) | `splitHero` / `split` |
| **Editorial** | Warm paper, serif, refined, left labels | Paper (light) · Ink (dark) | `document` + `conversational` |
| **Blueprint** | Technical — mono-caps labels, grid texture, boxed | Blueprint · Graphite (dark) | `wizardStepper` / `stepped` |
| **Kiosk** | Oversized touch controls, bold | Daylight · Spotlight (dark) | `kiosk` |

The retired skins (`sideNav`/`accordion`/`tabbedCard`/`mosaicGrid`/`console`/
`compact`/`timeline`) were Cloud + a different accent → they stay as **accent
presets** (color swatches in the Accent picker), *not* skins or themes.

---

## 2. Scope hierarchy (where each property lives)

```
Form (whole surface)
└── Header panel
    ├── Logo · Title · Subtitle · Highlight message
    └── Header surface (bg color / image / opacity / padding)
└── Content (the form body surface)
    └── Section  (global default + per-section override)
        └── Section header (icon · title · bg)
        └── Field   (global default + per-field override)
└── Navigation chrome (rail / tabs / stepper / side panel)
└── Actions (submit / back / cancel)
```

Cascade: **Theme base → Form/Theme overrides → Section override → Field override.**
Lower scope wins. (Same layered cascade as today's themes — just more keys.)

---

## 3. Property reference

Legend — **UI**: control type in the editor · **→ key/path**: Theme Spec key or
`Layout_Config__c` path · **→ token**: resulting `--c-*` (written by `themeVars()`).

### 3.1 Theme, Skin, Accent & global color

| Property | What it controls | Type | UI | Default | → key / token |
|---|---|---|---|---|---|
| **Theme** | design language (type/radius/shadow/section/surface) | one of 7 | **dropdown** | per template/layout | `theme.id` → resolves the whole token base |
| **Skin** | variant within the theme (light/dark + mood) | theme's skins | **dropdown** (options depend on Theme) | theme's default skin | `theme.skin` → layers over the base |
| Accent color | buttons, active states, links, focus ring, progress | hex | color picker + preset swatches | skin's accent | `theme.accent` → `--c-accent` (hover/active/ring/submit derived via `color-mix`) |
| Submit button color | submit fill | hex/“accent” | color picker | accent | `submitBg` → `--c-submit-bg` |
| Border color | hairlines, dividers, card borders | hex | color picker | theme | `borderColor` → `--c-border` / `--c-border-light` |

### 3.2 Surfaces — background **fill** (color / gradient / image), **opacity**

Each surface has a **fill** — a **solid color OR a gradient** — plus an optional
image layer and an opacity. The token layer **already accepts gradient strings**
(today's skins set `pageBg: 'linear-gradient(...)'`), so a gradient is just a
richer fill value, not new plumbing — the editor adds a **gradient builder**.
Images are **asset references** (ContentVersion Id) resolved to URLs at render —
never raw URLs in the spec (DESIGN_TOKENS §4 guardrail).

| Surface | Fill (color / gradient) | Image | Opacity | Fit/position | → keys |
|---|---|---|---|---|---|
| **Whole form** (page) | ✓ | ✓ | ✓ | cover/contain/tile + position | `pageBg`, `pageBgImageId`, `pageBgOpacity`, `pageBgSize`, `pageBgPos` → `--c-page-bg`, `--c-page-bg-image`, `--c-page-bg-opacity` |
| **Content** (form body card) | ✓ | ✓ | ✓ | cover/contain/tile | `contentBg`, `contentBgImageId`, `contentBgOpacity` → `--c-card-bg`, `--c-content-bg-image`, `--c-content-bg-opacity` |
| **Header panel** | ✓ | ✓ | ✓ | cover/contain | `header.surface.bgColor`, `.bgImageId`, `.bgOpacity` → `--c-header-bg`, `--c-header-bg-image`, `--c-header-bg-opacity` |
| **Section header** | ✓ | — | ✓ | — | `sectionHeaderBg` (+ per-section) → `--c-section-header-bg` |
| **Nav chrome** (rail/tabs/side panel) | ✓ | — | ✓ | — | `navBg`, `navBgOpacity` → `--c-nav-bg`, `--c-nav-bg-opacity` |

- **Fill = color or gradient.** The fill control toggles solid ↔ gradient; the
  gradient builder does linear/radial, angle, and 2+ stops. Same key holds either
  a hex or a gradient string (e.g. `pageBg: "linear-gradient(160deg,#059669,#064e3b)"`).
- **🔭 V2 — custom CSS backgrounds.** Beyond a gradient: let power users supply a
  raw CSS **background value** (layered gradients, patterns, multi-image). Because
  it feeds a `--c-*-bg` token **value** (not a CSS rule crossing shadow roots),
  it's a clean extension — sanitized (no `url()` to unapproved hosts, no
  `expression()`/js URIs). Deferred to V2.
- **Opacity** is per-surface (your earlier requirement) — slider 0–100%, applied
  to the surface fill/image, not its content. Image + opacity composite over the
  fill beneath, so text stays on a controllable scrim.
- **Legibility:** when an image/gradient is set, an auto scrim (`--c-bg-scrim`)
  keeps text ≥ 4.5:1; the editor warns if a manual fill fails contrast (DESIGN_TOKENS §4).
- **Header text color** auto-derives readable on/over the header bg
  (`readableOn()` → `--c-header-text` / `--c-header-text-weak`), with a manual
  override (`header.surface.textColor`).

### 3.3 Typography — **per role** (different fonts per text element)

A theme picks a base **font pairing**; each role can override family + size +
weight independently. Roles:

| Role | Applies to | Override keys | → token |
|---|---|---|---|
| **Header title** | the big header title | `font.title.{family,size,weight,spacing}` | `--c-font-title`, `--c-title-size`, `--c-title-weight` |
| **Header subtitle** | header subtitle line | `font.subtitle.{family,size,weight}` | `--c-font-subtitle`, `--c-subtitle-size` |
| **Section header** | section titles | `font.section.{family,size,weight,transform}` | `--c-font-section`, `--c-section-size` |
| **Field label** | input labels | `font.label.{family,size,transform}` | `--c-font-label`, `--c-label-size`, `--c-label-transform` |
| **Body / input** | input text, values, paragraphs | `font.body.{family,size}` | `--c-font-body`, `--c-control-font` |
| **Help / description** | help text, descriptions | `font.help.{family,size}` | `--c-font-help` |

- **Family** = a curated pairing/face from `FONT_PAIRINGS` (DESIGN_TOKENS §5;
  system-safe now, webfonts via static resource later) — not arbitrary URLs.
- **Size** = scale step or rem; **weight** = 400–800; **transform** =
  none/caps/mono-caps; **spacing** = letter-spacing (floor −0.04em per a11y).
- UI: per-role row → font dropdown + size stepper + weight + (title/section)
  transform toggle. “Reset to theme” per row.

### 3.4 Spacing & **padding** (per scope)

| Property | Scope | Type | UI | Default | → token |
|---|---|---|---|---|---|
| Density | whole form | spacious/comfortable/compact | segmented | comfortable | `density` → `--c-space-1…5` |
| **Header padding** | header panel | rem / scale | slider | scale 5 | `header.surface.padding` → `--c-header-pad` |
| **Section padding** | section (global + per-section) | rem / scale | slider | derived | `sectionPadding` → `--c-section-padding` |
| Section gap | between sections | rem / scale | slider | space 4 | `sectionGap` → `--c-section-gap` |
| **Field padding / height** | field (global + per-field) | rem / scale | slider | 40px | `controlScale` / `fieldPadding` → `--c-control-h`, `--c-field-pad` |
| Field gap | between fields | rem / scale | slider | space 3 | `fieldGap` → `--c-field-gap` |
| Content max-width | content body | narrow/medium/wide/full | segmented | per layout | `contentMaxWidth` → `--c-maxw` |
| Content padding | content body | rem / scale | slider | scale 5 | `contentPadding` → `--c-content-pad` |

### 3.5 Shape

| Property | Type | Default | → token |
|---|---|---|---|
| Corner radius | sharp/rounded/round/pill/slds | theme | `radius` → `--c-radius`, `--c-radius-card` |
| Card shadow | none/soft/medium/strong | theme | `cardShadow` → `--c-card-shadow` |
| Section style | card/plain/boxed/subtle | theme | `sectionDefault` → `--c-section-style` |
| Input style | outline/underline/filled | theme | `inputStyle` → `--c-input-*` |
| Texture | none/grain/grid | theme | `texture` → `--c-texture` |

---

## 4. Header panel (your new requirements, in detail)

### 4.1 Arrangement variants (`header.variant`)

```
inline          [▩ Logo]  Title · Subtitle                  (all one line)
stacked         [▩ Logo]                                     (each on its own line,
                Title                                          centered or left)
                Subtitle
logoBeside      [▩ Logo]   Title                              (logo left, title +
                           Subtitle                            subtitle stacked beside)
textOnly                   Title                              (no logo)
                           Subtitle
```

| Property | Type | UI | Default |
|---|---|---|---|
| Show header | toggle | switch | on |
| Variant | inline / stacked / logoBeside / textOnly | visual radio (mini previews) | logoBeside |
| Alignment | left / center | segmented | left |
| Min height | rem | slider | auto |

### 4.2 Elements

| Element | Properties | Keys |
|---|---|---|
| **Logo** | image (asset), max-height, alt text | `header.logo.{assetId, maxHeight, alt}` |
| **Title** | text + (typography role §3.3) + color | `header.title.{text, color}` + `font.title` |
| **Subtitle** | text + (typography role) + color | `header.subtitle.{text, color}` + `font.subtitle` |
| **Highlight message** | see §4.3 | `header.highlight.*` |
| **Surface** | bg color / image / opacity / padding (§3.2, §3.4) | `header.surface.*` |

### 4.3 Highlight message(s) (new — promo / deadline / event banner)

`header.highlight` is an **array** of one or more message blocks (§10.4) — e.g. a
deadline pill *and* a promo banner. Each block has the properties below; for
things like *“Submissions close Friday 5 PM”*, an event date, or a promotion.

| Property | What it controls | Type | UI | Default |
|---|---|---|---|---|
| Show | on/off | toggle | switch | off |
| Content | the message | **sanitized HTML** (bold/italic/links/line-break only) | rich-text mini editor | — |
| Style | how it reads | banner / inline / pill | segmented | banner |
| Tone | semantic color | accent / info / success / warning | select | accent |
| Background | custom bg | hex | color picker | tone-derived |
| Icon | leading icon | utility:* | icon picker | none |
| Placement | where in header | above title / below subtitle / own row | select | own row |
| Dismissible | respondent can close | toggle | switch | off |

- **Security:** HTML is sanitized to an allowlist (no `<script>`, no inline
  handlers, no arbitrary URLs beyond `http(s)`/`mailto`) — critical because the
  header renders on **guest/public** forms. Stored as the sanitized string.
- Honors theme contrast checks like any other surface.

---

## 5. Layout-specific options (`layout.options`)

Only the options relevant to the chosen layout show in the editor.

| Layout | Options |
|---|---|
| **Stacked** | content max-width; sticky action bar on/off (ex-console); show page labels |
| **Bento Grid** | tile sizing (auto / manual spans); column count at breakpoints |
| **Stepper** | **Stepper mode** (`vertical` rail / `horizontal` top steps / `progress` bar) — a dropdown shown **only when this layout is selected**; auto-collapses to `progress` on narrow containers (§5.1); allow back-nav (clickable vs locked); **brand panel** (on/off, side, width, content = logo/title/desc/quote — ex-splitHero); step transition |
| **Side Nav** | nav width; nav position (left/right); collapse breakpoint |
| **One-at-a-Time** | progress bar on/off; advance on Enter; question scale |
| **Tabbed** | tab placement (top/left); default tab; overflow (scroll/menu) |
| **Accordion** | single-open vs multi-open; default expanded section(s) |

### 5.1 Stepper modes (new — one responsive shell, three displays)

`layout.options.stepperMode` chooses how the step indicator renders. **All three
live in `shellWizard`** so the choice is also a responsive fallback chain, not
three separate shells:

```
vertical    │1│ Step one        horizontal   ①──②──③──④      progress   Step 2 of 4
            │2│ Step two ←active              ▲ active                   ▓▓▓▓▓░░░░░ 40%
            │3│ Step three      (steps across the top)         (compact bar + count)
            │4│ Step four
 (numbered rail on the side)
```

| Mode | Display | Best for |
|---|---|---|
| `vertical` | numbered rail beside the form (today’s shellWizard) | many steps, descriptive labels, wide screens |
| `horizontal` | steps across the top | few steps, dashboards, default on desktop |
| `progress` | a slim bar + “Step N of M” | compact / mobile / minimal |

**Responsive rule (the powerful bit):** the chosen text-heavy mode
(`vertical`/`horizontal`) **auto-collapses to `progress`** when the form’s
**container** drops below ~520px — handled in `shellWizard` CSS via a **container
query** (preferred over viewport media query — a form often renders in a narrow
Lightning page column or modal, so its *own* width is what matters, not the
device). One shell, one config value, three displays, graceful on any width.
*(Build note: `horizontal`/`progress` can lean on native
`lightning-progress-indicator` per [[feedback-use-native-slds-lwc]].)*

---

## 6. Section & field overrides

### 6.1 Per-section (overrides the global section defaults)

| Property | Type | Keys |
|---|---|---|
| Section style | card/plain/boxed/subtle | `sections[].style` |
| Header **icon** | utility:* (like formDesigner) | `sections[].icon` |
| Header **bg color** | hex | `sections[].headerBgColor` |
| Section bg color | hex | `sections[].bgColor` |
| **Padding** | rem/scale | `sections[].padding` |
| Columns | 1 / 2 / 3 (field layout within section) | `sections[].columns` |
| Collapsible / default open | toggle (accordion/tabbed) | `sections[].open` |

### 6.2 Per-field (overrides global field defaults)

| Property | Type | Keys |
|---|---|---|
| Label position | top / left / hidden | `fields[].labelPosition` → `--c-label-col` |
| Label style | default / muted / caps / mono-caps | `fields[].labelStyle` |
| Input style | outline / underline / filled | `fields[].inputStyle` |
| Field width / span | within section columns | `fields[].span` |
| Help text | show / position | `fields[].help` |

---

## 7. Actions

| Property | Type | Default | Keys |
|---|---|---|---|
| Submit label | text | “Submit” | `actions.submitLabel` |
| Submit placement | flow / sticky-bottom | per layout | `actions.submitPlacement` |
| Submit alignment | left/center/right/full | right | `actions.submitAlign` |
| Submit color | accent / custom | accent | `actions.submitColor` → `--c-submit-bg` |
| Back / Cancel labels | text | — | `actions.backLabel`, `.cancelLabel` |

---

## 8. Storage model (`Layout_Config__c` JSON shape)

```jsonc
{
  "layout":   { "group": "paginated", "type": "stepper", "options": { "stepperMode": "horizontal", "allowBack": true, "brandPanel": { "on": true, "side": "left", "width": "38%" } } },
  "theme":    { "id": "lightning", "skin": "dark", "accent": "#0176d3", "overrides": { "radius": "round", "cardShadow": "soft" } },
  "header":   {
    "show": true, "variant": "logoBeside", "align": "left",
    "logo": { "assetId": "068...", "maxHeight": 40 },
    "title": { "text": "Event Registration", "color": null },
    "subtitle": { "text": "Annual summit 2026" },
    "highlight": [ { "html": "<b>Closes Fri 5 PM</b>", "style": "pill", "tone": "warning", "placement": "ownRow" }, { "html": "Early-bird pricing ends soon", "style": "banner", "tone": "accent" } ],
    "surface": { "bgColor": "#0f4c81", "bgImageId": "068...", "bgOpacity": 0.85, "padding": "scale5" }
  },
  "font":     { "title": { "family": "luxe-serif", "size": "2rem", "weight": 700 }, "subtitle": { "family": "system" }, "label": { "transform": "mono-caps" } },
  "surfaces": { "form": { "bgColor": "#f3f3f3", "bgImageId": null, "bgOpacity": 1 }, "content": { "bgColor": "#fff", "bgOpacity": 1 }, "nav": { "bgColor": "#fff" } },
  "spacing":  { "density": "comfortable", "sectionPadding": "scale4", "fieldGap": "scale3", "contentMaxWidth": "wide" },
  "shape":    { "radius": "slds", "cardShadow": "none", "borderColor": "#dddbda" },
  "sections": [ { "key": "sec1", "style": "card", "icon": "utility:event", "headerBgColor": "#f7f9fb", "columns": 2 } ],
  "fields":   { "labelPosition": "top", "inputStyle": "outline" },
  "actions":  { "submitLabel": "Register", "submitPlacement": "flow", "submitAlign": "right" }
}
```

- `theme.overrides` + `font` + `surfaces` + `spacing` + `shape` are all **Theme
  Spec keys** → fed to `themeVars()` → `--c-*` tokens. No new producer.
- `header`, `layout`, `sections`, `fields`, `actions` are **config blocks** read
  by the engine/shells directly.
- Image keys store **ContentVersion Ids**; a resolver maps Id → URL (public when
  the form is public) at load — keeps raw URLs out of the spec.

---

## 9. Cross-cutting rules

1. **Token discipline unchanged** — editor writes Theme Spec keys; only
   `themeVars()` writes `--c-*`; component CSS stays hex/px-free (DESIGN_TOKENS §1).
2. **Images** only via `FormAssetController` / ContentVersion; per-surface
   opacity + auto-scrim for legibility ([[project-config-image-storage]]).
3. **Contrast floor** (WCAG 4.5:1 / 3:1 large) validated on every color/surface;
   warn-and-suggest, never silently ship unreadable.
4. **Highlight HTML sanitized** to a tag allowlist (guest-safe).
5. **Orthogonality** — any theme × any layout. Shell-aware effects (Midnight
   mesh, Luxe frame, glass blur, brand panel) render where supported, degrade
   gracefully elsewhere.
6. **Guest parity** — every property must render identically on the public/guest
   surface (fonts + images load via the same static-resource / public URLs).
7. **2GP-safe** — all additive; new Theme Spec keys default to current behavior
   (zero visual change without opt-in), matching DESIGN_TOKENS §6 migration rule.
8. **Responsive by container, every layout.** Each layout adapts to its **own
   width** (container queries preferred over viewport media queries — forms render
   in variable regions: Lightning page columns, modals, guest full-width). Minimum
   expected adaptations: Stepper vertical/horizontal → `progress` bar (§5.1);
   Side Nav rail → top bar / drawer; Bento → single column; brand panel → top
   band; Tabbed → scrollable / overflow-menu tabs. **No layout may overflow or
   clip at any width.**

---

## 10. Decisions (resolved 2026-06-13)

1. **Editor surface → SEPARATE PANELS.** Not one combined tabbed “Design” panel.
   User has their own ideas for how the panels are arranged (TBD) — build the
   Layout / Theme / Header / Surfaces / Spacing controls as **distinct surfaces**.
2. **Per-field overrides → YES in v1** (§6.2 ships in the first release).
3. **Typography → DEFERRED to the END.** Per-role fonts (§3.3) and custom webfont
   uploads are the **last** thing built; everything else lands first. (Themes still
   carry a base pairing meanwhile; per-role overrides come last.)
4. **Highlight message → MULTIPLE allowed** (“yes to both”). `header.highlight`
   is an **array** of blocks (single message = length 1) — e.g. a deadline pill
   *and* a promo banner. Each block keeps the §4.3 properties.
5. **Custom templates → SAVE THE WHOLE DESIGN, EXCEPT object + content.** A saved
   “my template” captures layout, theme, accent, header (variant / logo / title /
   subtitle / highlights), surfaces, spacing, shape, and section-**style** defaults
   — but **NOT** the form’s `suggestedObject` and **NOT** the actual sections /
   inputs (the data structure). So a custom template is a reusable **look** applied
   onto any form’s own content. ⚠️ This changes today’s behavior — see §11.

---

## 11. Custom template = a design preset (model change from §10.5)

> **⏸ TABLED (2026-06-13).** This whole feature is deferred. Also: **“Save as
> template” does NOT belong in the creation gallery** — the gallery is for
> *starting* a form. Saving a design-preset is an action **on an existing form**
> (form/builder level), since you’re capturing the design you just built. When
> revived: remove “Save as my template” from `c/formCreationGallery`’s detail
> view and add it as a form-level action. Spec kept below for when we pick it up.

**Today:** `FormTemplateController.saveTemplate` stores the whole form body
(`bodyJson` incl. sections/elements + the bound object) in `Form_Template__c`.
A custom template is effectively a *full form clone*.

**New model:** a custom template stores **design only** — no object, no
sections/inputs. Its `Definition` blob =

```jsonc
{
  "kind": "designPreset",
  "layout":  { "group": "...", "type": "...", "options": { ... } },
  "theme":   { "id": "...", "skin": "...", "accent": "...", "overrides": { ... } },
  "header":  { "variant": "...", "logo": {...}, "title": {...}, "subtitle": {...}, "highlight": [ ... ], "surface": {...} },
  "font":    { ...per-role (when typography ships) },
  "surfaces":{ "form": {...}, "content": {...}, "nav": {...} },
  "spacing": { ... }, "shape": { ... },
  "sectionStyleDefaults": { "style": "...", "headerBgColor": "...", "padding": "..." }
  // NO suggestedObject · NO sections[] content · NO fields/inputs
}
```

Implications to wire when this is built (not now):
- **Save:** capture the current form’s design (the keys above) — strip object +
  section/field content. Add `kind: "designPreset"` so the gallery can tell
  design-presets apart from any legacy full-form templates.
- **Apply:** applying a custom template **merges its design onto the current
  form’s content** — it does NOT replace sections/inputs and does NOT rebind the
  object. (Contrast with built-in templates, which still seed object + content.)
- **Gallery:** “My templates” become *looks*, usable on any form regardless of
  object — they no longer carry an object tag.
- **Section-style application:** `sectionStyleDefaults` apply to the form’s
  existing sections by position/role; per-section overrides aren’t carried (no
  section identity to map to).

---

## 12. Custom Skin — “bring your own” brand kit

> The “Versatile Form Architect” mock. The 7 themes + their skins are curated
> **defaults**; this lets a user author **their own skin** — a brand kit of
> colors + fonts — saved and reusable across forms. It’s the user-authored member
> of the **Skin** tier (§1.2).
>
> **It LAYERS on a chosen theme** (resolved §12.5.1): the brand kit overrides
> **colors + fonts only**; the Theme keeps the **structure** (radius, shadow,
> section style, input style, spacing). So a custom skin = your brand on one of
> our 7 proven design languages — less to author, structurally coherent by default.

### 12.1 The brand kit (what the user defines)

**Color roles — the four-lane palette** (matches the mock). Each is a base color
that auto-expands into a tint/shade **ramp**. These drive the form's **components**
(buttons, text, borders, accents) and are **SEPARATE from per-surface background
fills** (§3.2) — that's the "background colors are different" point: the 4 roles
are the brand *palette*; backgrounds are per-surface *fills* layered on top.

| Role | What it drives in a form | → tokens (from ramp steps) |
|---|---|---|
| **Primary** | submit/primary buttons, links, active/selected, focus ring, progress fill | `--c-accent`, `--c-brand`, `--c-submit-bg`, `--c-brand-dark` |
| **Secondary** | secondary buttons, progress track, section-header accent, info tone | `--c-secondary` (+ section/nav accents) |
| **Tertiary** | highlights / badges, header highlight message, promo / warning tone | `--c-tertiary` (+ highlight accents) |
| **Neutral** | text, labels, borders, **and the DEFAULT surface backgrounds** | `--c-text` / `-weak` / `-meta`, `--c-label`, `--c-border` / `-light`, `--c-surface-sunken`, default `--c-page-bg` / `--c-card-bg` |

- **Ramps auto-generate** from each base (OKLCH lightness steps) for a consistent
  scale; advanced users can nudge individual steps. (Mock shows ~10-step ramps.)
- **Neutral seeds the default backgrounds**, but **any surface can be overridden**
  with its own color / gradient / image in §3.2. So the two axes compose: 4 color
  roles set the palette → §3.2 fills override specific surfaces.
- In the 3-tier model, a custom skin's **Primary** *is* the accent — the §3.1
  Accent picker is the quick single-color override for **preset** skins.

**Font roles** (base pairing — 3 roles; distinct from the deferred §3.3 per-element
overrides, which still come last):

| Role | Applies to | → token |
|---|---|---|
| **Headline** | header titles + section headers | `--c-font-display` / `--c-font-title` |
| **Body** | inputs, values, paragraphs | `--c-font-body` |
| **Label** | field labels | `--c-font-label` |

**Plus** a default **button style** (Primary / Secondary / Inverted / Outlined →
maps to submit / secondary / ghost buttons), matching the mock.

### 12.2 Live preview
The editor previews the kit on representative **form** controls — buttons, input,
label, section header, highlight message, icons — so users see real output, not
swatches in a vacuum. (Reuses the live engine on a sample form.)

### 12.3 Where it shows up
- In the **Skin dropdown**: preset skins **＋ “New custom skin…”** (opens the
  brand kit) **＋** the user’s saved custom skins.
- A custom skin is **reusable across any form**, independent of object/content.

### 12.4 Storage & tokens
- A custom skin is just a **Theme Spec object** the user authored (color roles +
  ramps + fonts + button style) → fed to `themeVars()` like any skin. **No new
  token producer** (DESIGN_TOKENS §1 rule intact).
- Stored as a reusable record — proposed **`Form_Skin__c`** with one
  `Definition__c` JSON blob (mirrors the custom-template pattern).
- **Token expansion needed:** themes carry a single `accent` today; the brand kit
  adds the 4 color roles + ramps → a DESIGN_TOKENS extension (`--c-secondary`,
  `--c-tertiary`, role ramp steps). Additive; defaults preserve current behavior.

### 12.5 Decisions
1. ✅ **Layers on a chosen theme** (kit = colors+fonts; theme keeps structure).
2. ✅ **Color roles = FOUR** — Primary / Secondary / Tertiary / Neutral, each with
   a ramp (the four-lane scheme from the mock). **Background fills are a SEPARATE
   axis** (§3.2): gradients now, custom-CSS in V2.
3. ⏳ **Ramps** — auto-only vs auto + per-step manual (mock shows editable ramps). OPEN.
4. ⏳ **Storage** — dedicated `Form_Skin__c` vs reuse the template Definition store. OPEN.
```

