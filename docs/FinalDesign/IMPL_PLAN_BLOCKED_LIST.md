# Blocked list by Submit / Next + guest refusals (DEFERRED #68)

Status: **BUILT and verified live** (2026-11-21). Mock: [mocks/blocked-list-mock.html](./mocks/blocked-list-mock.html).

## Rulings (owner, 2026-11-21)

1. "Fix N fields" goes away. By Submit / Next the respondent sees a **bulleted list of the
   questions** that need correcting.
2. For the browser's own checks the list shows **question names only** (each question already
   shows its red message beside it).
3. For refusals that come back **from the server** on Submit, each bullet shows the **question
   name and the message**.
4. A refused submit **never** reaches the thank-you screen: the respondent stays on the form,
   answers kept, the list by Submit (DEFERRED #68).

## Behaviour

- **Heading**: "Please fix this to submit:" / "Please fix these to submit:" / "...to continue:"
  (reuses the four `Final_Run_FixFields*` labels with new values; no label deleted).
- **Bullets**: question label as a link-styled button that jumps to that question (the existing
  `_focusTarget` with `elementId`). Related-list entries: "References, entry 2: Email".
- **Long lists**: first 5, then "and N more" (new label `Final_Run_AndMore` = "and {0} more").
- **Server refusals** (signed-in and guest): each routed `FieldError` becomes a bullet
  "Label: message"; one that names no question is a bullet with its message only. The questions
  still turn red as today.
- **Guests (#68)**: `submitGuest` no longer reports success when `FinalSubmitService.run` returns
  errors. It returns `success = false` with the errors; `finalGuestHost` passes them to the
  viewer (`failSubmit(message, { errors })`), routed exactly like the signed-in path.
  - Our own answer checks (`FinalAnswerValidator`) keep the author's message and question.
  - Lookup refusals stay the generic guest message (a public form must not reveal records).
  - Org validation rules / DML failures are unchanged: one plain line "Your response could not
    be saved. Nothing was recorded." (already thrown for guests).
  - The bot-check ticket is not marked used on a refusal (already so).
- **One at a time** layouts (no line by the button): the top banner lists the same way.
- **Screen readers**: the list sits in the existing polite live region by the buttons; announced
  once. Bullets are buttons, so they are reachable by keyboard.

## Tests

- Viewer: blocked list names (client checks), 5 + "and N more", group entry naming, Next vs
  Submit heading, click jumps to that question, server errors as "name: message", unrouted error
  as message only, One at a time banner list.
- Host: a refused guest submit (`success:false` + errors) never completes the viewer.
- Apex: a guest submit with a missing required answer returns `success = false` with the
  question's error, saves nothing, does not mark the ticket; lookup refusal stays generic.
- Live: public site guest submit with an empty required answer (the #68 reproduction) shows the
  list by Submit, no thank-you; Studio preview shows the list on a blocked Submit.

Updates DEFERRED #68 to Done in the same PR.
