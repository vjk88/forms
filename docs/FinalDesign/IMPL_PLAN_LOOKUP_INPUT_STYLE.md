# Build plan: the custom lookup follows the Input style (DEFERRED 35)

Status: built, deployed to the dev org, measured on the Studio, Lightning and the public site (2026-10-16). One PR, merged to main 2026-10-18 (PR #387) at the owner's word; it changes how every lookup on a published form looks (see section 5).

Owner, 2026-10-11: "Custom Lookup with filters styling sucks and doesn't follow Input style in Advanced Design -> Fields & Sections". "Custom lookup with filters" is the lookup whose Display as is **Filtered search** (our own search box; the default is the platform's own field). Source note: `qa/OWNER_ISSUES_2026-10-11.md` item 35.

## 1. In plain words

A lookup question (an Account on a Case form, say) looked like a visitor from another app next to the text boxes around it:

- the empty box was **taller** (40px against 32px) and **squarer** (4px corners against the theme's 8px);
- click into it and it drew a **thin black border** where a text box draws the theme's coloured ring;
- pick a record and the box **shrank into a small chip** that did not fill the row;
- Read-only was a **grey chip**, where a read-only text box is plain text;
- and none of it moved when Advanced design, Fields and Sections changed the Input style (fill, border, corners, shadow, outline or underline or filled).

On the **public site this is every lookup**: the guest copy of a form carries no field binding, so every reference question there is this search box.

## 2. Why (read from the code, then measured)

`finalLookup.css` read eight style settings that the theme engine never writes (`--c-field-height`, `--c-field-radius`, `--c-field-ink`, `--c-field-padding`, `--c-field-hover-bg`, `--c-field-readonly-bg`, `--c-field-help-ink`, `--c-error-ink`), so it always painted its hard-coded fallbacks. It also used the focus setting `--c-focus-ring` as if it were a colour (`outline: 2px solid var(--c-focus-ring)`), but that setting is a glow (`0 0 0 3px rgba(...)`), so the outline was invalid and only the border changed colour.

## 3. Measured before (the same form on all three hosts; the lookup was identical on each)

| | Text box | Lookup, before |
|---|---|---|
| Height | 32px | **40px** |
| Corner radius | the Input style's (8px here) | **4px** |
| Text colour | the theme's text colour | **#181818** |
| Focus | 3px ring in the theme's focus colour | **no ring; border turns near-black** |
| Chosen record | the same box | **34px chip, 310px wide** |
| Read-only | plain text, no box | **grey box** |
| Error colour | the theme's error colour | **#ba0517** (a fixed red) |

## 4. What changed (CSS only: `finalLookup.css`)

- **One box for the empty field and the chosen record**, 2rem (32px) tall, built from the same settings the platform text boxes get in `finalElementRenderer.css`: fill (`--c-input-bg`), border (`--c-input-border-color`), corner radius (`--c-input-radius`), shadow (`--c-input-shadow`), text colour (`--c-text`), placeholder (`--c-text-weak`). That is why it follows all three Input styles (outline, underline, filled) and every corner radius.
- **Focus is the text box focus**: `--c-input-shadow-focus` (a ring, or the inset underline on the underline look), with a transparent outline so forced-colours (Windows high contrast) mode, which draws no shadows, still shows a focus indicator. The clear button gets the ring too.
- **The chosen record** shows the name on the left and the clear button inside the same box on the right.
- **Read-only** is plain text, like a read-only text box. **Disabled** looks like a disabled text box.
- **Errors** use `--c-field-error` for the box and the message.
- **The results list**: opaque white with dark ink in every theme (like the platform's own dropdown lists; the field fill is see-through on dark themes and would let the fields below show through), corners from the Input style but capped at 12px, the highlighted row a tint of the form's focus colour.
- **On a phone** the clear button keeps its 28px look and gets a 44px hit area (an invisible 8px margin).
- The spinner uses the focus colour setting, not the glow.

Nothing else changed: no Apex, no theme engine, no spec, no other component. The lookup is used only by the form renderer (the builder panels use the separate filter editor).

## 5. Decisions and exceptions

- **32px, not 44px, on phones.** The lookup is a text-entry box, and the owner's complaint is that it differs from the text boxes. The platform text boxes stay 32px on every host (stage 3, decision 6), so the lookup follows them. Only the clear button, which is a tap target of ours, gets the 44px hit area.
- **The list stays white on dark themes**, as the platform's dropdown list does, so it is always readable.
- **Who sees a change after the next site publish:** every published form with a lookup, and on the public site that is every reference question. The change is the intended one (the lookup now looks like the fields around it), and it needs the owner's word before merging.

## 6. Tests

`finalLookup/__tests__/inputStyle.test.js` (10 tests) pins the contract: the stylesheet reads only settings something writes (a scan of the theme engine and the page frame), the box takes the Input style tokens, 32px, one rule for the empty box and the chosen record, focus is a shadow and never a colour made from a glow, forced-colours outline, error colour, opaque list, read-only plain, phone hit area. The existing 22 lookup tests are unchanged.

## 7. Verified (revclouddev, deployed and the site published)

Same in-memory form on the Studio (VF), Lightning and the public site:

| | Text box | Lookup, after (all three hosts) |
|---|---|---|
| Height, radius | 32px, 8px | **32px, 8px** |
| Text, fill, border | theme's | **the same** |
| Focus | 3px ring | **the same ring** (underline look: the same inset line) |
| Chosen record | the same box | **32px, full width, name left, x right** |
| Read-only | plain text | **plain text** |
| Error | theme error colour | **the same colour** |

Also checked: a dark theme (Dracula), a glass theme (Neon Nights), the underline look, and the filled look with pill corners (the lookup matches the text box in each); a 320px and a 390px phone (the box is as tall as the text boxes, the clear button has a 44 x 44px hit area); and the real "Autofill Test: Case Intake (Account Lookup)" form in the Studio (type, results list, pick a record).
