# IMPL PLAN — Accordion layout options (sweep BUILD slice 1)

**Status:** IMPLEMENTED (PR #125, 2026-07-18) — deployed + live-verified. Awaiting owner doc cleanup.
**Why:** DORMANT_VOCABULARY_SWEEP BUILD ruling. All three readers already work
(finalNavAccordion.js `firstPanelOpen` :41, `iconPosition` :48, `allowMultiple` :84);
accordion is the only layout with zero Design-panel options.

## Changes (2 files + tests)

### 1. finalDesignRegistry.js — new group in the Layout area

New group `accordion`, `appliesTo: { layouts: ['accordion'] }` (same pattern as the
"Side rail" group :486):

| Control                   | Type   | Path                            | Values / fallback                                   | Hint (plain language)                                           |
| ------------------------- | ------ | ------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Open several at once      | toggle | `layout.options.allowMultiple`  | fallback `false`                                    | "Off = opening a section closes the previous one."              |
| First section starts open | toggle | `layout.options.firstPanelOpen` | fallback `true` (reader treats `!== false` as true) | "Off = every section starts closed."                            |
| Arrow side                | select | `layout.options.iconPosition`   | '' = Left (leading) / `trailing` = Right            | "Which side of the section title the open/close arrow sits on." |

### 2. finalNavAccordion.js — JSDoc only

Flip the options JSDoc from DORMANT to PRODUCT-SET for all three keys.

### 3. Tests

- finalDesignRegistry jest: the three controls resolve for layout `accordion` and
  not for others.
- finalNavAccordion behavior tests already cover the readers.

## Orphan ledger

None — three writers added to existing readers; nothing becomes unread/unwritten.

## Verify

Org: accordion form → toggle each control → open-state / arrow-side change in the
stage; screenshot eyeballed.
