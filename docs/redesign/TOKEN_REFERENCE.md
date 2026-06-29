# `--c-*` Token Reference — every token, one place

> Built 2026-06-27 **entirely from grep** (producer = `formThemes.js`; consumers = every
> `var(--c-*)` in the live stack), not from memory. Grouped by status so the broken ones cluster.
> "Works where" = which **live** components actually reference it (the form as a respondent sees it).
> Companion: [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md).

**Shell codes:** ST=Stack · WZ=Wizard · SH=SplitHero · SN=SideNav · CV=Conversational · TB=Tabbed ·
AC=Accordion. **Shared layers:** `fields`=formSectionRenderer · `lSH`=layoutSectionHost ·
`nav`=formNav · `engine`=formLayoutEngine · `zones`=layoutZones · `hl`=formHighlight · `rep`=formRepeater.

Status key: ✅ works · 🟡 works on some layouts only · 🔴 produced but **nothing** consumes it (dead) ·
⚪ consumed but **never produced** (stuck on fallback) · 🎛️ theme-conditional (only emitted in
dark/palette or via an override) · ⛔ out of scope (builder UI, not the form).

---

## ✅ Fix log

Each fix is recorded here as it lands. ⚠️ = code-path fix, not yet render-tested.

### 2026-06-29 (later 11) — Dark-theme background bug + scrim/control-font doc fixes
> Dark skins were silently dropping ALL page background layers. Code fix + doc reconciliation
> (1 cmp deployed, jest 45/45). ⚠️ render-pending — verify on Immersive Dark with a texture on.
- **BUG FIX (formThemes.js:927):** the dark branch emitted `--c-bg-scrim: rgba(0,0,0,0.18)` — a flat
  color in a slot every shell consumes as a `background-image` layer. A bare `rgba()` is not a valid
  `<image>` → invalid-at-computed-value-time → the whole multi-layer `background-image` collapsed to
  `none`, so under **any dark skin** the texture / mesh / page-bg-image **all vanished**. Fixed to emit
  `linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18))` (matching the image-scrim path at L898).
- **Doc:** `--c-bg-scrim` was wrongly 🔴 dead (Dead table + "later 10" list) → it's produced (L898/L927)
  + consumed by all 7 shells. Corrected to ✅ CONSUMED.
- **Doc:** `--c-control-font` was wrongly 🔴 produced-but-dead → it's no longer produced (replaced by
  `--c-input-font-size`, L762). Corrected to CUT/replaced.

### 2026-06-28 (later 10) — Dead-token hygiene cut
> Grep-verified zero-consumer tokens removed from the `formThemes.js` producer (1 cmp deployed, 0 err,
> jest 45/45). Pure hygiene — no behavior change, every cut token had **no** consumer anywhere in `force-app`.
- **Cut (5):** `--c-zone-pad` (zones use `--c-grid-gap`), `--c-summary-w` (unbuilt summary zone),
  `--c-dur-3` (no consumer; `--c-dur-1`/`-2` kept — used by formNav + 5 shells), `--c-input-border-bottom`
  (removed from all 3 input-style branches; underline solved via `--slds-c-input-shadow` since "later"),
  `--c-title-fill` (titles styled by weight/size in shells).
- **Explicitly KEPT (verified live):** `--c-stickybar-h` (wired in 3 shells), `--c-input-border`/`-bg`/`-radius`
  (layoutSectionHost + SLDS hooks), `--c-rail-w` (sideNav/wizard), `--c-grid-gap` (layoutZones).
- **Tests:** the two `--c-title-fill` assertions flipped to `toBeUndefined()` to lock in the cut.
- **Still 🔴 (not cut — have a possible future home):** `--c-panel-decor-color` (accent band, deferred),
  `--c-input-font`, `--c-back-color`, `--c-section-header-bg`.
  (Superseded since: `--c-bg-scrim` is now CONSUMED by all 7 shells; `--c-control-font` was replaced by
  `--c-input-font-size` — see "later 11".)

### 2026-06-27 (later 9) — Sticky-bar regression fixes (supersedes parts of "later 8")
> User flagged 3 issues with the "later 8" change. All addressed (5 cmp, 0 err, jest 35/35, ⚠️ render-pending).
- **Width bug (real, mine):** shellStack rendered the sticky `.savebar` as a **sibling of `<article>`**
  (the card with the max-width) → it spanned the full page wrapper, not the card. **Fix:** sticky submit
  is now a footer **inside** the card (`.submit-row.is-sticky`), matching Tabbed/Accordion. Width =
  content width in both inline + sticky states. Outside `.savebar` markup/CSS removed.
- **Control restored:** un-removed "Submit button placement" (getter + panel select). Options now
  **Inline | Sticky (auto-hides on short forms)**. (Reverts "later 8"'s removal + the hardcoded
  `isStickySubmit = true`; it now reads `['auto','stickyBottom'].includes(placement)`.)
- **overflow:hidden → overflow:clip** on `.card` in **shellTabbed + shellAccordion** (user's catch):
  `overflow:hidden` makes the card a scroll container that **traps** `position:sticky` so the footer
  can't pin to the viewport; `clip` clips to the border-radius identically but creates NO scroll
  container, so sticky passes through. (~96% support: Chrome90+/FF81+/Safari16+.) **shellSideNav NOT
  affected** — its `.pane` is `overflow-y:auto` (a real scroll container), so sticky already works there.
- **Default = `'auto'`** (sticky) for the 4 scrolling presets (stacked/bento/tabbed/accordion);
  `submitPlacement` enum in layoutModel.js gained `'auto'` (else validateSpec rejected it — jest caught).
- **Submit button was NEVER tied to lightning-record-edit-form** (user Q): `fireSubmit()` dispatches a
  `submitrequest` CustomEvent; record-edit-forms live in formSectionRenderer (per-section, context-only);
  formViewer collects + submits via FormSubmitController. The change was CSS-positioning only — zero
  data/submit-path impact.
- **🔴 KNOWN ISSUE (deferred — user will fix later):** with Sticky active, the pinned bar **floats over
  the trailing fields** while scrolling (the bar covers only its own strip, so the last fields — e.g. a
  date/time row — bleed out beneath it). Sticky is left **default `'auto'` but known-imperfect**; the
  user opted to keep it as-is rather than revert to Inline. Proper fix needs a real browser render
  (pin-only-on-overflow + full coverage of content behind the bar) — NOT yet done. Inline placement is
  unaffected (correct).

### 2026-06-27 (later 8) — Sticky submit bar → Auto default (4 cmp, 0 err, ⚠️)
> **Correction:** the sticky submit bar was NOT unbuilt — I wrongly said "no shell renders one" when
> auditing the dead `--c-stickybar-h` token. Reality: the scrolling shells already had a self-releasing
> sticky element (shellStack `.savebar`; shellTabbed/Accordion footer `.is-sticky`, all
> `position:sticky;bottom:0`), gated by `submit.placement === 'stickyBottom'`, defaulting to `'flow'`.
> Paginated shells (wizard/splitHero/sideNav) drive submit through `c-form-nav`; conversational has its
> own flow.
- **Auto is now the standard** on the 3 scrolling shells (Stack/Tabbed/Accordion): `isStickySubmit`
  returns `true`, so the sticky footer/savebar always renders. `position:sticky` **self-releases** —
  short form → sits inline at the end; long form → pins to the viewport bottom. No JS observer needed.
- **Removed** the "Submit button placement" Design-panel control (it only ever drove these shells).
  The `submit.placement` field + formStudio plumbing are **kept** in the saved model for a future opt-out.
- **`--c-stickybar-h` (64px) WIRED** (no longer dead) — `min-height` on `.savebar` /
  `.footer-row.is-sticky` / `.card-footer.is-sticky`.
- Paginated + conversational shells unchanged (their submit is nav/flow-positioned already).

### 2026-06-27 (later 7) — Background-surface opacity + "Card"→"Content" rename (2 cmp, 0 err, ⚠️)
- **Opacity on the 3 background surfaces** (the original transparency ask). New `withAlpha(color, alpha)`
  helper in formThemes: a PLAIN 6-digit hex + opacity<1 → 8-digit `#RRGGBBAA`; gradients/rgba()/url()
  banners/`transparent` pass through untouched. Applied to `--c-card-bg` (`surfaceAlpha`), `--c-page-bg`
  (`pageBgAlpha`), `--c-header-bg` (`headerBgAlpha`). No shell change — alpha is baked into the existing
  token value. Three "…opacity" sliders (0–100%) added to the panel; one generic `onAlpha` handler.
  **Content opacity is the star: lower it and the page bg/image shows through the form card.**
- **Label rename:** Design-panel **"Card background" → "Content background"** (UI label only; the
  internal `--c-card-bg` token is unchanged to avoid a risky cross-shell rename).
- Still open: alpha on text/border/accent pickers is intentionally NOT added (a11y — bg surfaces only).

### 2026-06-27 (later 6) — Real bg customization, Phase 2 + 3 (deployed 9 cmp, 0 err, ⚠️ unverified)
- **Phase 2 — Mesh color pickers:** Design panel now shows **4 color swatches** when Mesh is on
  (`meshHues` getter seeds from override→theme→defaults; `onMeshHue` rebuilds the array →
  `_emit('theme','meshHues',[…])`). formThemes already consumed `theme.meshHues`; bumped blob
  `color-mix` 55%→62% so user hues read as a real mesh, not one wash. Mesh toggle relabeled
  "Animated mesh / Flowing color hues" → **"Mesh background / Soft color blobs"** (it's static).
- **Phase 3a — Texture intensity:** grain/grid alpha is now **dynamic** (`grainSvg(a)`/`gridCss(a)`
  builders). Default intensity 1 → grain **α0.12** (was a near-invisible fixed 0.05) / grid α0.07;
  new "Texture intensity" slider 0.25×–2.5× (`textureIntensity` key). Shows when a texture is active.
- **Phase 3b — Image fit:** `bgImageFit` (cover/contain/tile) → `--c-bg-size` + `--c-bg-repeat`;
  shells' image layer now reads `var(--c-bg-size, cover)` / `var(--c-bg-repeat, no-repeat)`.
- **Phase 3c — Legibility scrim:** `bgScrim` (0–0.7) → `--c-bg-scrim`
  (`linear-gradient(rgba(0,0,0,a)…)`), inserted as a layer ABOVE the image, BELOW content, in all 7
  shells. "Image dim (legibility)" slider; only shown when a page bg image is set.
- Shells now a **4-layer** bg stack: `texture, mesh, scrim, image` (size `auto, cover, cover,
  var(--c-bg-size)`). No formStudio change (all keys ride the generic `theme` handler).

### 2026-06-27 (later 5) — Real bg customization, Phase 1: Page background IMAGE upload
> User rejected the thin FX surface ("no way to customize the bg"). Chose **Real bg customization**
> (image upload + mesh color pickers + intensity). **Phase 1 = page bg image upload** built + deployed
> (10 cmp, 0 errors, ⚠️ unverified). **No Apex** — reuses existing `uploadImage`/`deleteImage`.
> Phase 2 = mesh color pickers; Phase 3 = intensity + image fit/scrim.
- New Design-panel control "Page background image" (file upload + thumb + Remove), mirrors the header
  banner. `onBgFile`/`onBgRemove` → `_emit('bgAsset','pageBg',File|null)`.
- formStudio `handleDesignChange` case `'bgAsset'` → `_uploadBgAsset`/`_removeBgAsset` (ContentVersion via
  `uploadImage`; stores `_customTheme.pageBgImage` + `pageBgImageVersionId`). Rides skin.overrides.
- formThemes emits `--c-page-bg-image: url('…')` when `theme.pageBgImage` set.
- All 7 shells: page bg now a 3-layer stack `background-image: var(--c-texture,none), var(--c-mesh-bg,none),
  var(--c-page-bg-image,none)` with `background-size: auto, cover, cover` / repeat / position. Image is
  bottom layer (cover); texture/mesh on top.
- **Caveat:** `pageBgImageVersionId` persists only via theme overrides (same as header banner —
  [[project-config-image-storage]] hardening still open). No fit/scrim controls yet (Phase 3).

### 2026-06-27 (later 4) — FX: Background texture + Mesh wired (accent band deferred)
> **Deployed 8 cmp (formThemes + 7 shells), 0 errors. ⚠️ NOT render-verified.** The FX trio was 100%
> dead (produced, no consumer). Texture + Mesh now wired into every shell's page background; **Top
> accent band deferred** (user choice — its only theme, Split Hero, has plain card-less sections, so no
> clean target yet; needs a per-layout target decision).
- **Background texture** (`--c-texture`) 🔴→✅ — both values are valid `background-image`s (grain =
  SVG data-URI, grid = repeating-gradients). Each shell's page-bg split into `background-color:
  var(--c-page-bg)` + `background-image: var(--c-texture, none), var(--c-mesh-bg, none)`. Content sits
  above the host bg automatically. Lights up Wizard (grid), Conversational (grain), Immersive Dark (grain).
- **Mesh** (`--c-mesh-*`) 🔴→✅ — new single token `--c-mesh-bg` produced in formThemes (4 soft
  `radial-gradient` blobs from the mesh hues, softened via `color-mix`, **STATIC — not animated**), layered
  in the same shell bg. Lights up Immersive Dark. ("Animated mesh" → just "Mesh"; animation was the gimmicky part.)
- **Top accent band** (`--c-panel-decor-color`) — **DEFERRED**, still 🔴.
- Shells touched: Stack/Tabbed/Accordion (`.chrome-fullbleed`), Conversational (`.conv`), Wizard (`:host`),
  SideNav (`.layout`), SplitHero (`.layout`).

### 2026-06-27 (later 3) — Input style = Underline + Label style (both user-verified*)
> **Underline** 🔴→✅ **user-confirmed working.** SLDS has no per-side border hook, so: when
> `inputStyle === 'underline'`, override the native field to a transparent box border
> (`--slds-c-input-color-border/-combobox/-textarea: transparent`) and draw the line via the
> **box-shadow hook** `--slds-c-input-shadow: inset 0 -1.5px 0 0 var(--c-border)` (+ combobox/textarea).
> This was a SPIKE (the hook could've been a no-op like the height hooks) — it **works on v66**.
> Override pushed AFTER the main SLDS-hook block so last-declaration-wins on the duplicate border hook.
> All in `formThemes.js`.
- **Label style** (mono-caps/muted-sm) 🔴→✅ — the `--c-label-*` family was ALL dead (no consumer).
  Fix: render **our own label** (`.el-flabel`) consuming `--c-label-font/size/tracking/transform/color`,
  with the native field `variant="label-hidden"` (keeps its assistive-text label → no a11y loss) and the
  visual label `aria-hidden` (no double SR announcement). Gated on `useCustomLabel = helpText ||
  labelStyle !== 'default'` so plain default fields stay on the native path. `labelStyle` threaded
  engine→host→renderer like `labelPosition`. Files: formLayoutEngine, layoutSectionHost, formSectionRenderer
  (.js/.html/.css). *Label style render-verified pending user eyeball; underline confirmed.

### 2026-06-27 (later) — Control scale repurposed to field TEXT size
> **Intent correction from user:** "Control scale should control the size of the text in the input
> fields, it has nothing to do with buttons." Previously the slider only changed `--c-control-h`
> (button/CTA height); native field text never moved. **Deployed `0Afhk000000Lj3nCAC` (formThemes +
> formSectionRenderer, 0 errors). ⚠️ NOT render-verified — user verifies browser themselves.**
- **`--c-control-h`** (`formThemes.js:744`) — dropped the `× scale`; now `${baseH}px`, density-fixed.
  The Control scale slider **no longer resizes buttons/CTA**.
- **`--c-field-h`** *(new, line ~745)* = `round(baseH × scale)px` — native **field height** grows with
  the slider so larger text isn't cramped; feeds the SLDS `--slds-c-input-sizing/spacing/combobox-height`
  hooks (which now read `--c-field-h`, not `--c-control-h`).
- **`--c-input-font-size`** *(new)* = `${0.9375 × scale}rem` (1.0x≈15px → 1.5x≈22px) — replaces the
  dead `--c-control-font`. Wired two ways: (1) SLDS hook `--slds-c-input-font-size`; (2) inherited
  `font-size` on `lightning-input-field/input/combobox/textarea` in **formSectionRenderer.css** (font-size
  inherits across the shadow boundary even where the hook is a no-op — the path most likely to actually
  take on v66). **OPEN:** if v66 hardcodes `.slds-input` font-size, neither path works → wrap fields.
- **`--c-tap-min`** — decoupled from scale (`44px` constant).

### 2026-06-27 (later) — Label position = Left via native field variant
> **Audit correction:** the audit claimed label transform/font "work." **They don't — NO CSS consumes
> any `--c-label-*` token** (transform/font/size/tracking/col were all dead). Native field labels live
> in `lightning-input-field`'s shadow DOM; CSS can't reach them and there are no SLDS hooks for
> transform/size/tracking or per-side input borders. **Deployed (4 cmp, 0 errors). ⚠️ NOT render-verified.**
- **Label position = Left** 🔴→✅(code) — implemented via native **`variant="label-inline"`**, NOT the
  dead `--c-label-col` token. Threaded like `density`: `formLayoutEngine` stamps `labelPosition` on each
  section VM → `layoutSectionHost` passes `label-position` → `formSectionRenderer` (`@api labelPosition`)
  computes per-field `fieldVariant` → `lightning-input-field variant={el.fieldVariant}`.
- **`--c-label-col`** — **CUT** (dead producer line removed from `formThemes.js`).
- **Help-text fields** ✅ — their custom `.slds-form-element` wrapper now gets
  `slds-form-element_horizontal` when Left, so the custom label sits beside the control too
  (the native label-inline variant can't reach them; their field is label-hidden). ⚠️ verify the
  help "?" icon placement looks right.
- **Still 🔴 (need field-wrapping, deferred):** Label style (mono-caps/muted-sm transform/size/tracking),
  Input style = Underline (per-side border). Only fix = render our own labels/inputs.

### 2026-06-27 — control-side key mismatches + field-renderer aliases (all in `formThemes.js`)
> **Deploy status:** two deploys to `revcloud@dev.com` 2026-06-27 — `0Afhk000000Le46CAC` (first,
> contained the inverted shadow logic) then `0Afhk000000Lj5NCAS` (corrected shadow-first). **Card
> shadow now confirmed working in-org by the user.** The other fixes below shipped in the same bundle
> but are still ⚠️ (not individually eyeball-confirmed). After any deploy, hard-refresh the Studio tab.
> Tip: "Soft shadow" is faint (`rgba(0,0,0,0.05)`) — use **"Strong elevation"** to see Card shadow clearly.
- **Card shadow** 🔴→✅ **verified in-org** — ⚠️ my first attempt was **wrong**: I wrote
  `shadowSpec = theme.cardShadow ?? theme.shadow`, but **every theme structure defines `cardShadow`**
  (e.g. Lightning = `'none'`), so the override was *always* ignored (headless test: set Strong → still
  `none`). **Corrected to shadow-first:** `shadowSpec = theme.shadow != null ? theme.shadow :
  theme.cardShadow` so the per-form override wins. Redeployed (`0Afhk000000Lj5NCAS`); **user confirmed
  working**.
- **Border (strong)** 🟡→✅ — added `['border', '--c-border']` to the OVERRIDES table, so the panel's
  `border` key colors inputs/dividers too, not just the card outline (which it already did via the
  `cardBorder` fold). ⚠️
- **Muted text** — emit `--c-text-muted: var(--c-text-weak, #64748b)`. **Correction (in-org test):**
  `--c-text-muted` colors the **section description line + collapse chevron**
  (formSectionRenderer.css:114,122), **NOT field help text**. Field help is native `field-level-help`
  (a "?" tooltip icon, only when a field has help text set) and isn't colored by any `--c-*`.
- **Control/density height** — emit `--c-input-height: var(--c-control-h, 2.5rem)`. **Correction
  (in-org test):** this only sizes the **empty-space filler** (`.el-emptyspace`, css:80). **Native
  fields do NOT resize** with Control scale — they depend on `--slds-c-input-sizing-height`, a no-op
  on this SLDS version. Only buttons (+ filler) scale. Real field resizing is an OPEN item, not a one-liner.
- **Sunken field blocks** ✅ — emit `--c-surface-2: var(--c-surface-sunken, #f9fafb)`. ⚠️
- **Field error color** ⚪→✅ — now **produce** `--c-error: #ba0517` (+ `--c-danger: var(--c-error)`,
  `--c-error-bg: #fef1f1`), replacing the 3 inconsistent fallbacks (`#ba0517`/`#ea001e`/`#ba1a1a`)
  with one value. ⚠️ (minor: formNav/shells that were `#ea001e` shift to `#ba0517`.)
- **Callout/alert colors** ⚪→✅ — now produce `--c-callout-{info,success,warning,error}-bg`. ⚠️
- **Still open** (not one-liners — need consumers + a render pass): texture/mesh/top-accent-band
  (dead), Underline bottom-border (`--c-input-border-bottom`), Left label column (`--c-label-col`),
  label size/tracking, control-font, and the 🟡 inert-on-3-shells set.

---

## 🎚️ Design-panel exposure — what a user can actually change

Of the ~75 tokens, only the subset below is wired to a control in `c/designPanel`. The rest are
derived, structural, motion, or not-yet-exposed (e.g. fonts). "Reaches token?" traces the full chain:
control → `data-key` → `handleDesignChange` ([formStudio.js:1875](../../force-app/main/default/lwc/formStudio/formStudio.js)) →
`buildTokenString`. Verified by grep this session.

| Design-panel control | writes key | token(s) it should set | Reaches token? |
|---|---|---|---|
| Accent color | `accent` (accent scope) | `--c-accent` (+ derived `--c-on-accent`, `--c-focus-ring`, `--c-brand`, `--c-submit-bg` default) | ✅ |
| Button text | `accentText` | `--c-on-accent` | ✅ (inert on SN, CV) |
| Page background | `pageBg` | `--c-page-bg` | ✅ |
| Page background opacity | `pageBgAlpha` | `--c-page-bg` (via `withAlpha`) | ✅ **new 2026-06-27** (hex→#RRGGBBAA) ⚠️ |
| Content background (was "Card background") | `surface` | `--c-card-bg` | ✅ (inert on CV) |
| Content background opacity | `surfaceAlpha` | `--c-card-bg` (via `withAlpha`) | ✅ **new 2026-06-27** — page bg shows through ⚠️ |
| Header background color | `headerBg` | `--c-header-bg` | ✅ (inert on SN) |
| Header background opacity | `headerBgAlpha` | `--c-header-bg` (via `withAlpha`) | ✅ **new 2026-06-27** ⚠️ |
| Main text | `text` | `--c-text` | ✅ |
| Header text | `headerText` | `--c-header-text` | ✅ |
| Border (light) | `borderLight` | `--c-border-light` | ✅ |
| Corner rounding | `radius` | `--c-radius` (+ `--c-radius-card`) | ✅ (radius-card inert on SH, SN) |
| Section inner padding | `sectionPadding` | `--c-section-padding` | ✅ |
| Section look & style | `sectionDefault` | section **model** (token `--c-section-style` is dead) | ✅ via model |
| Sizing scale (density) | (spacing scope) | `--c-space-1..5`, `--c-control-h` | ✅ |
| Control scale | `controlScale` | `--c-input-font-size` (field text) + `--c-field-h` (field height) | 🟡 **repurposed 2026-06-27 → field TEXT size**; no longer touches buttons; ⚠️ unverified on v66 |
| Card border width / style | `borderWidth` / `borderStyle` | `--c-card-border` | 🟡 inert on SH, SN, CV |
| Glassmorphism | `glass` | `--c-glass-blur` | 🟡 inert on SH, SN, CV |
| Muted text | `textMuted` | `--c-text-weak`/`-meta` (+ `--c-text-muted` → **section desc/chevron, NOT field help**) | 🟡 colors section descriptions; field help is a native "?" icon |
| Border (strong) | `border` | `--c-card-border` (fold) + `--c-border` | ✅ **fixed 2026-06-27** ⚠️ |
| Input style | `inputStyle` | `--c-input-*` + SLDS hooks (Underline via `--slds-c-input-shadow`) | ✅ **Underline fixed + user-verified 2026-06-27** (transparent border + inset box-shadow line); filled/outline ok |
| Label style | `labelStyle` | `--c-label-font/size/tracking/transform` via `.el-flabel` custom label | ✅ **fixed 2026-06-27** (own label, native field label-hidden); ⚠️ user eyeball pending |
| **Card shadow** | `shadow` | `--c-card-shadow` | ✅ **fixed + verified in-org 2026-06-27** (shadow-first override) |
| **Label position** | `labelPosition` | native `variant="label-inline"` (token `--c-label-col` **cut**) | ✅ **fixed 2026-06-27** (renderer prop, not a token) ⚠️ |
| **Background texture** | `texture` | `--c-texture` | ✅ **fixed 2026-06-27** (all 7 shells' page-bg; grain α now 0.12 default) ⚠️ |
| **Texture intensity** | `textureIntensity` | `--c-texture` (dynamic grain/grid α) | ✅ **new 2026-06-27** (slider 0.25–2.5×) ⚠️ |
| **Mesh** (was "Animated mesh") | `bgEffect` | `--c-mesh-*` → `--c-mesh-bg` | ✅ **fixed 2026-06-27** (static radial blobs, all shells) ⚠️ |
| **Mesh colors** | `meshHues` (array) | `--c-mesh-1..4` → `--c-mesh-bg` | ✅ **new 2026-06-27** (4 user swatches, shown when Mesh on) ⚠️ |
| **Page background image** | `pageBgImage` (+ `pageBgImageVersionId`) | `--c-page-bg-image` | ✅ **new 2026-06-27** (file upload, ContentVersion; all 7 shells) ⚠️ |
| **Image fit** | `bgImageFit` | `--c-bg-size` + `--c-bg-repeat` | ✅ **new 2026-06-27** (cover/contain/tile; shown when image set) ⚠️ |
| **Image dim (scrim)** | `bgScrim` | `--c-bg-scrim` | ✅ **new 2026-06-27** (0–0.7 darken layer over image) ⚠️ |
| **Top accent band** | `panelDecor` | `--c-panel-decor-color` | 🔴 **DEFERRED** — placement is layout-specific; only Split Hero uses it (no cards) |

**Tally (updated 2026-06-27):** ~30 controls now target tokens. Of the originally-broken 5: **Card
shadow, Label position, Background texture, Mesh = FIXED**; only **Top accent band** remains 🔴
(deferred). New bg-customization controls added: Texture intensity, Mesh colors, Page background image,
Image fit, Image dim. Most fixes are ⚠️ deployed-not-yet-eyeballed except Card shadow + Underline +
Control scale + Label position (user-verified).

**Not exposed in the panel at all** (no control): fonts (`--c-font-body/-display` — picker
deferred), `--c-back-color`, `--c-border` (only reachable indirectly, see above),
`--c-header-text-weak`, `--c-surface-sunken/-alt`, the palette lane (`--c-secondary*/-tertiary*`), all
motion (`--c-dur-1/-2`, `--c-ease`), the surviving structural (`--c-grid-gap`, `--c-rail-w`,
`--c-stickybar-h`, `--c-shell-*`), and every never-produced constant
(`--c-space-6/7/8`, `--c-radius-sm`).
*(Note: `--c-error*`/`--c-danger`/`--c-callout-*`/`--c-input-height`/`--c-surface-2`/`--c-text-muted`
were in this list pre-Phase-1 — they are now **produced** at formThemes.js:1071-1082, see fix log.)*

---

## ✅ Works — produced and consumed broadly

| Token | What it does | Works where (live) | Issue | Fix in |
|---|---|---|---|---|
| `--c-accent` | brand/accent color | all 7 shells + fields, nav, hl, rep, engine | — | — |
| `--c-page-bg` | page background | all 7 shells + engine | — | — |
| `--c-submit-bg` | submit button fill | all 7 shells + fields | — | — |
| `--c-radius` | button/input corner radius | all 7 shells + fields, nav, rep, engine | — | — |
| `--c-control-h` | control height (density) | all 7 shells + fields (+ native via SLDS hook) | — | — |
| `--c-space-1..5` | spacing scale | all shells + fields, nav, engine, zones | — | — |
| `--c-font-display` | heading font | all shells + fields | — | — |
| `--c-font-body` | body font | engine, nav, lSH, WZ | — | — |
| `--c-focus-ring` | input focus ring | all shells + fields, nav | — | — |
| `--c-header-text` | text over header | ST WZ SH CV TB AC + hl | — (SN uses rail header) | — |
| `--c-grid-gap` | zone/column gutter | zones | — | — |
| `--c-rail-w` | rail width (240px) | WZ, SN | — (rail shells only) | — |
| `--slds-c-input-*`, `--slds-c-combobox-*`, `--slds-c-textarea-*`, `--slds-s-label-color` (16 hooks) | carry theme into **native Lightning fields** | native fields everywhere | — | — |

---

## 🟡 Works on some layouts only — inert on the rest

Same control, no effect on the listed shells because their CSS never references the token.

| Token | What it does | Works on | Inert on | Fix in (add `var()`) |
|---|---|---|---|---|
| `--c-card-border` | card outline (border color/width/style controls) | ST WZ TB AC + fields, lSH | **SH, SN, CV** | shellSplitHero.css, shellSideNav.css, shellConversational.css |
| `--c-card-shadow` | card elevation | ST WZ TB AC SN + fields, lSH | **SH, CV** | shellSplitHero.css, shellConversational.css |
| `--c-glass-blur` | frosted glass | ST WZ TB AC | **SH, SN, CV** | shellSplitHero/SideNav/Conversational.css |
| `--c-card-bg` | card/content surface | ST WZ SH SN TB AC + fields, rep, lSH | **CV** | shellConversational.css |
| `--c-radius-card` | card corner radius | ST WZ CV TB AC + fields | **SH, SN** | shellSplitHero.css, shellSideNav.css |
| `--c-on-accent` | button-text on accent | ST WZ SH TB AC (via lSH) + fields, nav | **SN, CV** | shellSideNav.css, shellConversational.css |
| `--c-tap-min` | mobile touch-target floor | SN CV AC | ST WZ SH TB | those shells' .css (if wanted) |
| `--c-header-text-weak` | secondary header text | SH only | all others | other shells' .css (mostly n/a) |
| `--c-header-bg` | header surface color | ST WZ SH CV TB AC | **SN** | shellSideNav.css (n/a — rail header) |

---

## 🔴 Dead — produced by the engine, consumed by NOTHING live

The control/value is computed and emitted, then ignored. Either wire a consumer or delete the
producer line in `formThemes.js`.

| Token | Intended job | Design control | Fix: wire a consumer in… |
|---|---|---|---|
| ~~`--c-texture`~~ | paper/grid surface texture | Background texture | ✅ **CONSUMED 2026-06-27** — all 7 shells' page-bg `background-image` |
| ~~`--c-mesh-1..4`~~ + `--c-mesh-bg` | mesh blob hues → ready-made radial-gradient bg | Mesh background | ✅ **CONSUMED 2026-06-27** — `--c-mesh-bg` layered in all 7 shells |
| `--c-panel-decor-color` | top accent band tint | Top accent band | 🔴 **DEFERRED** — needs per-layout target (Split Hero has no cards) |
| ~~`--c-title-fill`~~ | title color | (internal) | ✅ **CUT 2026-06-28** — no consumer; titles styled by weight/size in shells |
| ~~`--c-bg-scrim`~~ | legibility scrim (dark skin + bg-image dim) | Image dim (scrim) + dark skin | ✅ **CONSUMED** — all 7 shells' page-bg `background-image`; produced L898 (image scrim) + L927 (dark). Dark branch **fixed 2026-06-29** to emit a gradient (was a flat `rgba()` → invalidated the whole bg-image). |
| ~~`--c-dur-3`~~ | 600ms entrance duration | (internal motion) | ✅ **CUT 2026-06-28** — no consumer (`--c-dur-1`/`-2` kept, used widely) |
| ~~`--c-stickybar-h`~~ | sticky bar height | (internal) | ✅ **WIRED 2026-06-27** — `min-height` on the auto sticky savebar/footer (Stack/Tabbed/Accordion) |
| ~~`--c-summary-w`~~ | summary zone width | (internal) | ✅ **CUT 2026-06-28** — unbuilt summary zone, no consumer |
| ~~`--c-zone-pad`~~ | zone inner padding | (internal) | ✅ **CUT 2026-06-28** — zones use `--c-grid-gap` instead |
| ~~`--c-control-font`~~ | control font scale | Control scale (partial) | ✅ **CUT/replaced** — no longer produced; superseded by `--c-input-font-size` (L762, consumed by formSectionRenderer) |
| `--c-input-font` | input font family | Input style (partial) | a `fields`/`lSH` rule, or cut |
| ~~`--c-input-border-bottom`~~ | underline-input bottom border | Input style = Underline | ✅ **CUT 2026-06-28** — underline solved via `--slds-c-input-shadow` inset line; this token was redundant in all 3 input-style branches |
| ~~`--c-label-size`~~ | label font size | Label style (mono/muted) | ✅ **CONSUMED 2026-06-27** by `.el-flabel` |
| ~~`--c-label-tracking`~~ | label letter-spacing | Label style | ✅ **CONSUMED 2026-06-27** by `.el-flabel` |
| ~~`--c-label-col`~~ | ~~left-label column width~~ | Label position = Left | ✅ **CUT 2026-06-27** — Left now uses native `variant="label-inline"`, not a token |
| `--c-back-color` | back-button color | (multi-page back) | only legacy formPlayer used it — wire into formNav, or cut |
| `--c-section-header-bg` | section header strip bg | Section look & style | only legacy/builder use it — wire into `fields`, or cut |

> **Note on two "controls" people assume are dead:** `--c-section-style` and `--c-header-style` are
> emitted but unreferenced — *however* those features (section look, header style) are driven by the
> **layout/section model** in JS, not by these tokens. The tokens are dead weight; the features still
> work. (Not independently re-verified by rendering — flagged.)

---

## ⚪ Consumed but never produced — stuck on a hardcoded fallback

These appear in live CSS with a literal fallback; the engine never sets them, so design choices can't
reach them. Several are **name mismatches** with a token the engine *does* produce.

| Token | Consumed by | Stuck at | Issue / fix |
|---|---|---|---|
| `--c-text-muted` | formSectionRenderer `.sec-desc`, `.sec-chevron` | aliases `--c-text-weak` | ✅ produced 2026-06-27 — colors **section description**, NOT field help |
| `--c-input-height` | formSectionRenderer `.el-emptyspace` only | aliases `--c-control-h` | ✅ produced 2026-06-27 — sizes **filler only; native fields unaffected** |
| `--c-surface-2` | fields | aliases `--c-surface-sunken` | ✅ **now produced 2026-06-27** (was mismatch) ⚠️ |
| `--c-danger` | fields | aliases `--c-error` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-error` | fields, nav, rep, formViewer, SN, WZ | `#ba0517` | ✅ **now produced 2026-06-27** (was unproduced, 3 inconsistent fallbacks) ⚠️ |
| `--c-error-bg` | formViewer | `#fef1f1` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-callout-info-bg` | fields | `#eef4ff` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-callout-success-bg` | fields | `#ebf7ee` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-callout-warning-bg` | fields | `#fdf6e3` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-callout-error-bg` | fields | `#fdeded` | ✅ **now produced 2026-06-27** ⚠️ |
| `--c-space-6` | ST WZ TB AC CV | `32px` | never produced → formThemes.js (extend SPACE_SCALES) |
| `--c-space-7` | fields | `3rem` | never produced → formThemes.js |
| `--c-space-8` | formViewer | `3rem` | never produced → formThemes.js |
| `--c-radius-sm` | CV, fields | `6px` | never produced → formThemes.js |
| `--c-shell-min-h` / `--c-shell-rail-h` | all rail/scroll shells | `100%` / `100vh` | engine sets to `auto` in **preview only**; structural — leave as-is |

---

## 🎛️ Theme-conditional — only emitted in dark / palette / override

These work and are consumed broadly (all shells + fields/nav), but the engine **only emits them**
when the skin is dark, a 4-lane palette is supplied (dormant), or you set the matching override. In a
plain light theme with no override they fall back to each consumer's literal. Not bugs — just know
they're conditional.

| Token | Drives | Emitted when |
|---|---|---|
| `--c-text` | body text color | dark · palette · "Main text" override |
| `--c-text-weak` | muted text | dark · palette · "Muted text" override (and note `--c-text-muted` mismatch above) |
| `--c-text-meta` | meta text | dark · palette · "Muted text" override |
| `--c-label` | field label color | dark · palette |
| `--c-border` | input/divider border | dark · "Border (strong)" override |
| `--c-border-light` | hairlines | dark · override |
| `--c-surface-sunken` | sunken surfaces | dark · palette |
| `--c-surface-alt` | alt surface (skeleton, input bg, repeater) | dark · palette |
| `--c-brand` / `--c-brand-dark` | accent aliases | always (= accent) |
| `--c-secondary{,-weak,-faint}` | secondary role color | **palette only (dormant — never fed)** |
| `--c-tertiary{,-weak,-faint}` | tertiary role color | **palette only (dormant — never fed)** |

---

## ⛔ Out of scope — builder/legacy chrome, not the rendered form

Verified token-by-token: every consumer is a builder or legacy panel (formDesigner, designerCanvas,
fieldPalette, propertyPanel, newFormDialog, fieldPreview, completionEditor, z*). **Not** used by any
live form component, so they're irrelevant to theming a form:

`--c-bg` · `--c-surface` · `--c-brand-bg` · `--c-brand-light` · `--c-border-cool` · `--c-navy` ·
`--c-success` / `--c-success-bg` · `--c-warning` / `--c-warning-bg`

---

## What to actually do (smallest → biggest)

1. ~~Aliases/produce in `formThemes.js`~~ ✅ **DONE 2026-06-27 (Phase 1)** — `--c-text-muted`,
   `--c-input-height`, `--c-surface-2`, `--c-danger` aliases + pinned `--c-error`/`--c-error-bg` + the
   four `--c-callout-*-bg` all emitted at
   [formThemes.js:1071-1082](../../force-app/main/default/lwc/formThemes/formThemes.js#L1071) and
   grep-confirmed consumed. ⚠️ code-path wired, not render-verified.
2. ~~Verify Input=Underline and Label=Left render~~ ✅ **DONE** — both work (Underline via
   `--slds-c-input-shadow`, Left via native `variant="label-inline"`); the dead tokens
   `--c-input-border-bottom` + `--c-label-col` were **cut**, not wired.
3. **Decide the remaining 🔴 effects** (accent-band/bg-scrim + `--c-control-font`/`--c-input-font`) — wire
   or cut. (texture/mesh = consumed; title-fill/dur-3/zone-pad/summary-w = cut 2026-06-28.)
4. **Inert-per-layout (🟡)** — either add the `var()` to the 3 bespoke shells, or hide those controls
   on those layouts (see COVERAGE_MATRIX A5).

> Honesty note: every cell above is backed by a grep run this session. The two places I have **not**
> proven by rendering the form are the "feature works via model, token dead" claim (section/header
> style) and the Underline/Left-label breakage — both are flagged inline.
