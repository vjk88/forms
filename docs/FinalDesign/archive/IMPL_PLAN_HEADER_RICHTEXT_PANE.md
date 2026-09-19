# Implementation Plan — Rich-text Header + Split Hero Pane Arrangement

**Status: AWAITING OWNER REVIEW — no code written.**
Delete this doc (or move rulings into the component catalog) once implemented and verified.

Owner rulings (2026-07-12): drop eyebrow/proof-points/quote/frame as properties. Instead:
rich-text Title/Subtitle + pane vertical arrangement + highlight placement choice.
Scope confirmations: pane-only for placement/arrangement; divider only when bottom
highlight exists; Emerald Luxe theme is a separate follow-up piece.

---

## 1 · What changes, file by file

### 1.1 `finalDesignRegistry.js` — 3 edits, 1 new control

| #   | Control                      | Change                                                                                                                                                                                                                              | Why                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `title` (Header area)        | `type: 'text'` → `type: 'richtext'` (path `header.title`, `simple: true` unchanged)                                                                                                                                                 | Owner ruling. Same editor as Thank-you message.                                                                                                                                                                                                                                                   |
| 2   | `description` (Header area)  | `type: 'text'` → `type: 'richtext'` (path unchanged)                                                                                                                                                                                | Same.                                                                                                                                                                                                                                                                                             |
| 3   | `highlight` (Header area)    | add `fallback: ''`                                                                                                                                                                                                                  | **Gate-bug prevention.** `needsValue` compares the _effective_ value; without a fallback an unset highlight is `undefined`, and `undefined !== ''` is true — the placement select would show for forms with no highlight at all. Exact same bug class as `sectionBorderColor` (fixed in PR #109). |
| 4   | **NEW** `highlightPlacement` | `type: 'select'`, `path: 'header.highlight.placement'`, `fallback: ''`, options: `''` = "Pane bottom", `'aboveTitle'` = "Above title", `appliesTo: { layouts: ['splitHero'] }`, `needsValue: [{ key: 'highlight', notEquals: '' }]` | The owner's placement choice. Split-Hero-only (other shells keep today's highlight position). Hidden until a highlight text exists. `''` drops the key via the existing plain-path select machinery — no orphan key ever stored.                                                                  |

No other registry changes. `brandName` and logo stay plain — they feed `alt=`
attributes and wordmark text where HTML must never land.

### 1.2 `finalDesignPanel.*` — one change (plan said zero; found during build)

`richtext` control type, its `handleRichText` (empty editor → key dropped), and
select machinery all exist (built for After-Submit, PR #78). Verified at
`finalDesignPanel.js:259/294/721`.

**IMPLEMENTATION ADDENDUM:** the plan missed that the **Simple lens** hand-renders
its own Title/Subtitle as hardcoded plain `<input>`s (finalDesignPanel.html
WORDS card), bypassing the registry. Left alone they would display raw HTML tags
and flatten rich titles on edit. Fixed: both swapped to the same
`lightning-input-rich-text` + `handleRichText` as the advanced lens. Submit label
stays a plain input on purpose (button labels must never carry HTML).

### 1.3 `finalThemeEngine.js` — **zero changes**

No new tokens, no palette keys, no contract event. The divider uses `currentColor`
mixes inside the pane CSS (matching the existing dot/track doctrine in that file).
**Nothing for the design-control audit to inherit.**

### 1.4 `finalFormHeader.html` / `.css` — rich-text rendering (all card shells)

- `<h1 class="hdr-title">{hdr.title}</h1>` → `<h1>` wrapping
  `<lightning-formatted-rich-text value={hdr.title}>`. Keeps the `<h1>` for the
  heading semantics; inner markup is DOM-built so no parser breakage.
- `<p class="hdr-desc">{hdr.description}</p>` → `<div class="hdr-desc">` wrapping
  formatted-rich-text (a stored `<p>` inside a literal `<p>` is invalid HTML).
- CSS added:
  ```css
  .hdr-title p,
  .hdr-desc p {
    margin: 0;
    font: inherit;
  }
  .hdr-desc ul,
  .hdr-desc ol {
    margin: 0;
    padding-left: 1.25em;
  }
  ```
  Rich text arrives wrapped in `<p>` tags — without the reset every title grows
  browser-default paragraph margins. `font: inherit` keeps the h1 scale; authored
  inline spans (color, italic, size) still win because they're inline styles.

### 1.5 `finalNavSplitHero.js` — zone defaults + placement + divider

- `zoneList` defaults change: `{ title: 'top', subtitle: 'top', highlight: 'bottom' }`
  → `{ title: 'center', subtitle: 'center', highlight: 'bottom' }`.
  `zone-center` already has `flex: 1; justify-content: center` — moving the blocks
  there IS the vertical centering. Brand row stays first (top-pinned), progress
  stays last (bottom-pinned by the stretchy center zone).
- Highlight placement: when `opts.paneHighlight.placement === 'aboveTitle'`, the
  highlight block joins the center zone **ordered before the title** (block-array
  order controls within-zone order). Otherwise bottom zone, as today.
- New getter `showPaneDivider`: true when a bottom-placed highlight with text
  exists. (Placement `aboveTitle` → no divider.)
- Lockup: `{lockup.title}` / `{lockup.description}` plain interpolations →
  formatted-rich-text (dormant path in practice — the viewer only builds a lockup
  when explicit `pane*` options exist, i.e. seeded P0 forms — but it must not
  regress into raw-HTML text).
- `blockPlacement` (dormant, read-only vocabulary): still honored if ever written;
  only its _defaults_ move. Explicitly NOT exposing it — stays documented as dormant.

### 1.6 `finalNavSplitHero.html`

- Divider element between the bottom zone and the progress block:
  `<div class="pane-divider" lwc:if={showPaneDivider}></div>`
- Lockup title/desc swap to formatted-rich-text (see 1.5).
- Zone/blocks markup otherwise unchanged (ordering handled in JS).

**Bottom-stack render order (owner's literal words — flagged for review, see §3):**

```
… stretchy center zone …
[highlight]        ← bottom-placed highlight
──────────         ← divider (only when highlight above it exists)
● ● ○  Step 2 of 3 ← progress footer (unchanged component, last element)
```

### 1.7 `finalNavSplitHero.css` — exact rule list

| Rule                                                                                                                       | Action                                 | Why                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pane-title p, .pane-subtitle p { margin: 0; }`                                                                           | ADD                                    | Rich-text `<p>` margin reset inside the pane.                                                                                                                                                                   |
| `.pane-subtitle ul, .pane-subtitle ol { margin: 0; padding-left: 1.2em; }`                                                 | ADD                                    | Authored ✓ checklists in the subtitle get sane indentation.                                                                                                                                                     |
| `.pane-divider { border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent); margin-top: var(--c-space-4); }` | ADD                                    | The hairline. `currentColor`-based per this file's existing doctrine (hero white on painted panes, `--c-header-text` on themed ones — never hard-coded white).                                                  |
| `.lockup-title p, .lockup-desc p { margin: 0; }`                                                                           | ADD                                    | Same reset for the (dormant) form-side lockup.                                                                                                                                                                  |
| narrow container block (`@container split (max-width: 540px)`)                                                             | ADD `.pane-divider { display: none; }` | Divider is a pane sibling, not inside a zone — the existing zone/progress hide rules don't catch it.                                                                                                            |
| Vertical pinning (brand top / progress bottom)                                                                             | **NO change expected**                 | The flex column + `zone-center: flex 1` already pins both ends once content moves to the center zone. Verified live before merge; contingency if bleed mode misbehaves: `margin-top: auto` on the bottom stack. |

**No CSS rules deleted. No `--c-*` tokens added or removed.**

### 1.8 `finalFormViewer.js` — **zero changes**

The header→pane mapping passes strings through untouched; `hasLockup` is a
truthiness check (HTML string is still truthy). Traced: no `document.title`,
`aria-*`, or `alt=` consumer of `header.title`/`description` in any final-build
component. (`brandName` feeds `alt=` — stays plain text, see 1.1.)

---

## 2 · Orphan ledger — every setting, writer → reader

Plain words: a **writer** is the pen — the UI control that sets a value. A
**reader** is the eyes — the render code that paints from it. A healthy setting
has both. An **orphan** has one side only: a knob nothing reads (dead control)
or code no knob can reach (dormant option). This table proves every setting this
PR touches keeps both sides.

`header.title` is the REAL setting (edited, stored, rendered everywhere).
`paneTitle` is only Split Hero's internal pipe name — the viewer copies
`header.title` into it at runtime (finalFormViewer.js:245). Nothing in this plan
builds against `paneTitle`.

| Setting                                                                      | Writer (UI)                                         | Reader (render)                                                                               | State after this change                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `header.title`                                                               | Design › Header (richtext)                          | finalFormHeader + splitHero pane (+ lockup)                                                   | LIVE, rich                                                                               |
| `header.description`                                                         | Design › Header (richtext)                          | same                                                                                          | LIVE, rich                                                                               |
| `header.highlight.text`                                                      | Design › Header (text)                              | finalFormHighlight in all shells                                                              | LIVE (unchanged)                                                                         |
| `header.highlight.placement`                                                 | **NEW** Design › Header select (splitHero-gated)    | splitHero `zoneList`                                                                          | LIVE, paired                                                                             |
| `header.highlight.variant/icon/dismissible`                                  | none                                                | finalFormHighlight                                                                            | **dormant — untouched, documented here**                                                 |
| `layout.options.paneTitle/paneSubtitle/paneHighlight/paneBrandName/paneLogo` | none (only the old P0 seed script ever wrote these) | splitHero legacy override path — when present in a saved spec they replace the header content | **dormant — untouched; listed only so nobody mistakes them for the real settings above** |
| `layout.options.blockPlacement`                                              | none                                                | splitHero `zoneList` override                                                                 | **dormant — untouched; only defaults move**                                              |
| `layout.options.ratio`                                                       | none                                                | splitHero `layoutClass`                                                                       | **dormant — untouched (separate open ruling)**                                           |

Nothing new is added without both a writer and a reader. Nothing existing loses
its writer or reader.

---

## 3 · Line-items that need YOUR eye

1. **Bottom order = highlight → divider → progress** (your literal phrasing:
   highlight "just above the divider above the Progress bar"). Note the mockup
   has the divider ABOVE the quote text. If you wanted mockup order
   (divider → highlight → progress), say so — one-line change, but I'm building
   your words, not my guess.
2. **Every existing Split Hero form shifts visually**: title/subtitle move from
   top-clustered to vertically centered. Deliberate per your ruling — flagging
   because it changes live forms on deploy.
3. **Forms that already have a highlight** gain the divider above their progress
   (they're bottom-placed by default). Small visual change, follows from the rule.
4. Rich-text titles now possible on **all 7 shells**, not just Split Hero (shared
   header model — the entire point). Existing plain-text titles render pixel-
   identical (plain string through formatted-rich-text stays plain; verified in
   the test plan).

---

## 4 · Test & verification plan

Jest (before deploy):

- splitHero: new zone defaults; `aboveTitle` ordering; divider only with bottom
  highlight; lockup rich-text render.
- finalFormHeader: rich value renders through formatted-rich-text; plain string
  unchanged.
- finalDesignPanel test (~line 694) updates: title control is now richtext.
- Registry: placement gate hidden when highlight empty (the `fallback: ''` fix).

Live (Playwright, throwaway form, idempotent probes, computed-style assertions):

1. Author bold + colored-italic title via spec → renders styled in pane AND in a
   card shell (stack layout).
2. Pane: brand top / title block vertically centered / progress flush bottom —
   `getBoundingClientRect` assertions, both bleed and carded modes.
3. Highlight placement toggle: above title ↔ bottom+divider; divider absent when
   highlight cleared. Panel select hidden until highlight text exists.
4. Narrow (≤540px container): strip mode unchanged, divider hidden.
5. Existing-form regression: seeded/plain-title form renders byte-identical
   header.

Ship: own branch → PR → merge → redeploy from main → re-verify → delete
throwaway form. Then owner review of this doc's §3 outcomes → doc cleanup.
