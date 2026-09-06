# Builder navigation and reordering

**2026-09-06 — the optional actions menu is REMOVED. Alt + ↑ / ↓ is the whole reorder story.**

Two rejected iterations, kept on the record so neither gets re-proposed:

1. **An always-on action bar** (PR #230) — `lwc:if={selectedItem}`, so Move up / Move down /
   Move to… appeared on every selection, competing with the drag it was meant to supplement.
   Rejected by the owner.
2. **A right-click / Shift+F10 context menu** (PR #232) — no chrome, but still "so many clicks
   compared to drag and drop". Also rejected. Removed here.

**What remains:** drag-and-drop is primary and untouched. Questions, sections, blocks and page chips
are native selection buttons reached with Tab, activated with Enter/Space; Up/Down and Home/End move
focus; **Alt + ↑ / ↓ reorders the focused item among its siblings.** Selection adds nothing to the
screen, and right-click gives the browser's own menu back.

**Org-verified 2026-09-06** after removal: right-click opens no custom menu and
`contextmenu.defaultPrevented` is `false` (native menu restored) · plain click renders no popup and
no action bar · Alt+↓ then Alt+↑ move an item down and back · the on-screen hint reads "Use Tab to
reach items and Enter to select. Alt + ↑ / ↓ moves an item up or down."

> **Known consequence, accepted deliberately.** Move to… was the only keyboard route for moving an
> item **between** sections or pages; Alt+Arrow only reorders among siblings. Cross-container moves
> are now **drag-only**. Customer-ready criterion #1 (§7.1 of PENDING_WORK) lists "move between
> sections/pages", so that clause is knowingly unmet by keyboard. If it needs closing later, the
> cheapest honest option is a destination picker reached from somewhere other than a per-item menu —
> not a revival of either rejected design above.

## Current interaction

Drag-and-drop remains the primary mouse interaction. Ordinary selection adds no action bar or
move buttons. The owner rejected a permanent action bar; that bar has been removed locally.

Question labels, section/block labels and page chips are native selection buttons, reached with
Tab and activated with Enter/Space. Up/Down and Home/End move focus among visible selection
buttons without changing selection. Alt+Up/Down reorders the focused item among its siblings.

Right-click on a question, section, block or page chip, or Shift+F10 / the Context Menu key on its
selection button, opens custom actions. Empty canvas keeps the browser context menu. This replaces
the initial implementation's F2 action bar. Menu Up/Down and Home/End move focus; Escape returns
focus to the item. Clicking elsewhere or moving focus outside dismisses it. Move to opens a
destination picker; cancelling returns to its menu action. No Delete keyboard shortcut is added.

## Structural rules and focus

- Questions reorder inside their section, sections/blocks within a page, and pages within the form.
  The destination picker supports moves between sections/pages.
- Only compatible destinations are shown. Studio also enforces these rules for drag intents:
  parent fields stay in parent sections, child fields stay in repeaters with the same child object,
  files cannot enter repeaters, and standalone blocks move whole.
- A parent question moved to a page with no compatible section gets a new ordinary section.
  A child question needs an existing compatible repeater.
- Cross-page question/section moves show the destination page. Dragging pages keeps the existing
  active-page behavior; keyboard page reordering follows the focused page.
- Successful menu/shortcut moves focus the moved item. Deletion focuses/selects the next sibling,
  previous sibling, or parent when none remain. The only page cannot be deleted.
- Screen-reader status announces completed menu/shortcut moves and deletions; rejected mutations
  are not announced as successful. Delete buttons have contextual accessible names.

Canvas emits intents; Studio uses its existing mutation, undo/redo and autosave paths. No new Apex
calls or persisted UI-state fields. Each section has one stable keyed wrapper around its gap and
body, fixing an LWC patch failure exposed by moves between pages with mixed sections/blocks.

## Owner smoke test for this revision

1. Drag questions, sections and pages; verify ordinary selection shows no action bar.
2. Tab to a question; use Enter and Alt+Up/Down, then Shift+F10. Test menu arrows and Escape.
3. Right-click the question and move it to another page; check focus, preview, undo and saving.
4. Move a child question between same-object repeaters; incompatible destinations must be absent.
5. Delete first/last/only items; focus should stay in the structure. Undo the operations.
6. Check at narrow widths and with a screen reader. Verify outside clicks dismiss the menu.

Local validation: 82 tests passed across the canvas, Studio, preview stage and preview-session
suites. Changed JavaScript passes ESLint; changed LWC files pass Prettier checks.

Jest covers these component interactions and the existing drag/drop contracts. Actual browser,
assistive-technology and live-org verification of the revised menu remains pending.

## Files in this change

- `force-app/main/default/lwc/finalBuilderCanvas/finalBuilderCanvas.js`
- `force-app/main/default/lwc/finalBuilderCanvas/finalBuilderCanvas.html`
- `force-app/main/default/lwc/finalBuilderCanvas/finalBuilderCanvas.css`
- `force-app/main/default/lwc/finalBuilderCanvas/movement.js` (new)
- `force-app/main/default/lwc/finalBuilderCanvas/__tests__/finalBuilderCanvas.test.js`
- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.js`
- `force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js`
- `docs/FinalDesign/BUILDER_KEYBOARD_SPEC.md` (new)
- `docs/FinalDesign/PENDING_WORK.md`

Git and deployment remain with the owner.
