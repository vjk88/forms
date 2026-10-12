# Four issues the owner reported (2026-10-11), noted and NOT implemented

The owner's instruction: "Note down these issues, do not implement them yet." So this is a record, not a plan. Each item says what a person sees, what I found by **reading the code** (nothing here was re-measured in a browser yet), and what the options look like when we pick it up. A "token" below means a named style setting (a CSS custom property) that the theme sets once and every component reads.

Parked in [DEFERRED.md](../DEFERRED.md) as items 35 to 38. Nothing is decided; where I give a recommendation it is only that.

## 35. The custom lookup does not follow the Input style

**What you see.** In the owner's screenshot (Side rail layout, a Case form) the lookup box, "Account", is visibly taller (about 40px) with squarer corners than the text boxes under it, "Subject" and the others (about 30px, rounder). Changing the Input style in Advanced design, Fields and Sections (corner radius, fill, border, shadow) does not move the lookup.

**Why (from the code).** `finalLookup.css` reads tokens the theme engine never writes: `--c-field-height`, `--c-field-radius`, `--c-field-ink`, `--c-field-padding`, `--c-field-hover-bg`, `--c-field-readonly-bg`, `--c-field-help-ink` and `--c-error-ink`. Because they do not exist, it always paints its hard-coded fallbacks (2.5rem tall, 0.25rem corners, near-black text, a fixed red for errors). The tokens that carry the Input style are `--c-input-radius`, `--c-input-bg`, `--c-input-border-color`, `--c-input-shadow` and `--c-input-shadow-focus` (plus `--c-field-bg`, `--c-field-border`, `--c-field-focus`, `--c-field-error`); the lookup reads only two of them.

**Probably also broken (to verify).** The lookup uses `--c-focus-ring` as a colour (`outline: 2px solid var(--c-focus-ring)` and `border-color`), but the engine writes that token as a glow (`0 0 0 3px rgba(...)`). In a themed form both declarations are then invalid, so the lookup box may show **no visible focus state** at all. That would be an accessibility bug, not only a looks bug.

**Side note.** `finalLookupFilter` (the "filters" part) is the builder-side editor, built on the shared rule editor; it reads no theme tokens, but it is Studio chrome, not respondent UI. I read "custom lookup with filters" as the respondent-facing lookup field. If the owner meant the filter editor's look, say so.

**When we pick it up.** Point the lookup at the same tokens and sizes the platform inputs use (32px tall text boxes today, the theme's radius, fill, border, shadow, `--c-field-focus` for focus, `--c-field-error` for errors); add a test that every token the lookup reads is one the engine writes; verify on Studio, Lightning and the public site, including a dark theme.

## 36. "Display as" and "Choice look" fight each other (and why are there two?)

**What you see.** Set a choice question to Display as: Radio buttons and Choice look: Chips (or Cards). Now change Display as to anything else, for example Dropdown. The preview does not change, and the Choice look row disappears, so the panel gives no way back out.

**Why (from the code).**

- The panel has two controls: **Display as** (`config.renderAs`, a list of control types) and **Choice look** (`config.optionStyle`, Plain / Chips / Cards). Choice look is shown only while Display as is Radio buttons, Checkboxes or Multi-select. The panel needs a helper sentence to explain the difference ("Display as picks the control; Choice look redraws that control's options as chips or cards"), which is the smell.
- Changing Display as writes only `renderAs`; it never touches `optionStyle`.
- The renderer's `isChipChoice` is "a field with options whose `optionStyle` is chips or cards", and it takes over completely. It reads `renderAs` only to decide single or multiple selection. So chips and cards win over Dropdown for ever, and the control that would reset them has just been hidden.

**Why two controls exist.** Chips and cards were added later as a second axis next to radio and checkbox groups. To a person they are just more ways to display the same choices.

**Options.** (a) One control, **Display as**: Dropdown, Radio buttons, Checkboxes, Chips, Cards (single or multiple comes from the question), with the two stored fields mapped internally and existing forms migrated on read. (b) Keep two, but make them consistent: switching Display as to Dropdown clears the look, and Choice look stays visible but disabled. My recommendation is (a); it removes the question "why are there two". It needs the owner's call because it changes the Studio panel and the saved shape.

## 37. The section name is shown twice in layouts that already label the page

**What you see.** In the owner's screenshot, the Side rail says "1 Details" and the section card under it has the heading "Details" again. The same happens in Tabbed pages, Wizard steps and Accordion. One at a time does not (it labels nothing).

**Why (from the code).**

- Those four layouts label their items with the **page** name (`page.name`, or "Page N").
- The section renderer shows its own **section** title whenever the section has a title, description or icon (`hasHeader`). Nothing compares it with the page name or knows the layout already shows it.
- The repeat is built in: a new form starts with a page named "Details" and a section titled "<Object> details" (`FinalFormCreateController`), so even a brand-new form says "Details" and "Case details" one above the other.
- A Design setting "Section headers: Hide" exists, but it is global and manual.

**Options.** (a) Hide the section heading when the layout labels pages and the page has exactly one section, or when the section title equals the page name (case-insensitive). (b) Stop creating two names for a starter form. (c) Both. A section title on a page with several sections stays. **Open question for the owner:** on a one-section page, should a section title that adds information ("Case details" under "Details") still show? It interacts with item 38 and with the layout-cleanliness decision S1 (sections open by default), which is also still waiting for an answer.

## 38. The section heading looks bad in the Scroll layout

**What you see (my reading, not yet confirmed with a picture).** Scroll shows each page's name as a divider heading and then each section's title. The divider (`.divider` in `finalNavScroll.css`) is the same size and font as the section title but **grey** (`--c-text-weak`) with a **gradient** underline; the section title (`.sec-title`) is **black** with no line. So the page name is lighter than the section under it (backwards hierarchy), and there are two kinds of line in the same form.

**Already analysed.** The 2026-10-09 layout-cleanliness audit has this as S3 ("Scroll heading ink, one kind of line"); see [LAYOUT_CLEANLINESS_RECOMMENDATIONS.md](../specs/LAYOUT_CLEANLINESS_RECOMMENDATIONS.md) (still untracked and unreviewed). The owner calling it "horrible" raises its priority; it was a pending recommendation before.

**Not known yet.** Which element the owner means (the page divider, the section title, or both) and what they want instead. Ask with a screenshot when we start.

## Suggested order, when the owner says go

1. **36** first: it is a stuck state (a real bug), small, and it needs one decision (a or b).
2. **35**: tokens and the probable missing focus ring; no design decision needed, only verification.
3. **37 and 38 together**: they touch every layout and every existing form's headings, so they need the owner's answers first (the open questions above and S1 of the layout-cleanliness audit).
