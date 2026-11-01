# Build plan: the error count by the Next / Submit button

Status: plan, waiting for the owner's OK (2026-10-31). Nothing built. Revised the same day for two review rounds: round 1 (P1 Accordion, P2 stale lookups) and round 2 (P1 step-flow submit failures, P2 one fixed focus target, P2 Accordion keeps surviving panels). Each was checked against the code or the plan before the change.

Owner rulings, 2026-10-31 (buttons in chat):

- **"Count, as designed"**: the line by the button says how many questions need fixing, as COMPONENT_CATALOG §1 "Blocked Message" specified in P1. It does not list each error.
- **"Jump to it"**: a blocked click also scrolls to the first red question and puts the cursor in it, as catalog §2 specified.
- **"Down by the button"**: when the server refuses a Submit, that sentence moves from the top of the form to the same line by the button.
- **"We don't need this for one at a time"**, and **"Yes, leave it out too"** for Split with Pane flow = One at a time. Both step-flow layouts stay exactly as they are today.

## 1. In plain words

**Today.** Someone clicks Next with two questions wrong. The questions turn red and the page stays put. Nothing near the button says why. If the red question is above the fold, the button just looks broken. When the server refuses a Submit, the reason shows at the top of the form, far from the button they clicked.

**After.** The same click puts **"Fix 2 fields to continue"** right above the buttons, scrolls to the first red question and puts the cursor in it. As they fix things the line changes to "Fix 1 field to continue" and then disappears. A refused Submit puts its sentence on that same line.

Why it was missing: `finalSubmitBar` has had the line since P1 (`blockedMessage`, styled, `aria-live`), but `finalFormViewer` never passes it a value. The jump to the first field was never written either.

## 2. The line

| Situation | Text on the line |
|---|---|
| Blocked, and the bar shows **Next** | "Fix 1 field to continue" / "Fix 3 fields to continue" |
| Blocked, and the bar shows only **Submit** (last page, Scroll, Accordion) | "Fix 1 field to submit" / "Fix 3 fields to submit" |
| The server refused the Submit | the existing sentence ("Some answers were not accepted. See the highlighted fields.", the rule's own message, or "Your response could not be saved. Please try again.") |
| Nothing wrong | empty (takes no space, as today) |

- **What counts:** questions that show a red message right now: a failed validation rule, a required answer missing, a lookup marked stale, or a field the server refused. The number always matches the red questions the person can see or open.
- **Which pages:** in paged layouts (Tabs, Wizard steps, Side rail, Split with Pane flow = Pages) it means the current page. The two layouts the registry marks `paginates: false`, **Scroll and Accordion**, show the whole form as one territory (Accordion's panels all sit above one button bar), so there it means every page.
- **When it appears:** at the same moment the red messages appear, which is the first blocked click on that page (before that, a half-filled page stays quiet, as today). After that it updates as answers change.
- **The server's sentence beats the count**, and stays until the next Submit, the same lifetime the top banner has today.

## 3. Jump to the first red question

- **When:** every blocked Next or Submit, and a Submit the server refused because of named fields (not in the step-flow layouts, §3a). Submit already moves to the first page with a problem; the jump happens after that page renders.
- **What:** the question scrolls to the middle of its scroll area (smoothly, or instantly when the person has reduced motion switched on), and its control takes focus: the text box, dropdown, lookup, first choice button, slider, and so on. When a question has nothing to focus, it only scrolls.
- **How (engineering):** data flows down the way answers and errors already do, so none of the seven layouts needs a new method.
  - **One fixed target per blocked click** (review round 2, P2). At the click the viewer takes the next number from a module-level counter (unique even with two viewers on one page). It records `{ n, elementId, sectionIds, pageKey }`: the first red question, plus every section holding a red question at that moment. It stamps `focusRequest: n` on **that element id only**, and the section counter on **those section ids only**. It never recomputes "the first red question" afterwards, so fixing Q1 cannot hand the number to Q2 and pull the cursor away mid-typing.
  - **Consumed means consumed, beyond any one component's lifetime.** Each acting module (`finalElementRenderer`, `finalNavAccordion`, `finalSectionRenderer`) keeps a module-level record of what it has already acted on (the last number; for sections, `n:sectionId`). A renderer that is destroyed and recreated, for example when someone closes and reopens an Accordion panel, sees the number as already used and does nothing. Only the next blocked click, with a new number, moves anything.
- **Accordion opens the panel first** (review finding P1, verified 2026-10-31). Accordion keeps its open panels to itself and does not draw the questions inside a closed panel, so changing the viewer's page and stamping `focusRequest` reaches nothing. Two changes to `finalNavAccordion`:
  1. **Keep the open panels when answers change.** Today its `pages` setter resets the open panels whenever page data arrives, and the viewer sends new page data after every answer (a throwaway Jest probe confirmed the array is replaced on each `valuechange`). New rule (review round 2, P2): **every open panel that is still there stays open**. A panel that vanished (a rule hid its page) drops out of the open list. Only when **none** of the open panels survive does the default apply again ("First panel open": the first visible panel). A genuinely new form shares no page ids with the old one, so it gets the default by the same rule. A rule showing or hiding some *other* page, or an answer that drives such a rule, never closes the panel you are in. Side effect, expected and wanted: if today's code snaps panel 2 shut the moment you answer a question in it, this fixes that. The code says it does; the org check in §9 confirms it either way.
  2. **Open the panel that holds the focus target.** When incoming page data carries a `focusRequest` number it has not acted on, Accordion opens that question's panel (alongside the others when "Allow multiple" is on, instead of them when it is off). The question then renders and the renderer does the jump as usual.
- **Folded sections unfold too.** A collapsible section that is folded does not draw its questions either (`finalSectionRenderer` `showBody`), so the same trap applies inside any layout. The viewer stamps the same counter on every section that holds a red question at a blocked click, and a folded section unfolds when it sees a new number. Every counted question can then be seen, not only the first. The person's own fold state otherwise survives as today (re-init only when a different section arrives).

## 3a. Not changed: the step-flow layouts (owner, 2026-10-31)

**One at a time** and **Split with Pane flow = One at a time** are left exactly as today: no count line, no jump, no change to how they deny an advance. The viewer already flags both with one value, `ownsAdvance`. `blockedMessage` returns empty and no `focusRequest` is stamped while it is true. Split with Pane flow = **Pages** is a paged layout and gets the full change.

**Their submit failures stay at the top** (review round 2, P1). §5 moves server and save failures to the line by the button, but these two layouts get no line (One at a time has no button bar at all). Moving the sentence would make it vanish. So while `ownsAdvance` is true, the top banner keeps showing Submit failures (server refusal, failed save, the guest site's `failSubmit`) exactly as today.

## 4. Submit finds every problem, stale lookups included

**Whole-form layouts (Scroll, Accordion).** Today Submit reveals the red messages on the **first** bad page only, though the whole form is one territory. Someone fixes those, clicks Submit again, and only then sees the problems further down. With a count by the button that becomes misleading ("Fix 1 field" while three more wait below). So a blocked Submit reveals every bad page; the count covers all of them and the jump goes to the first red question in form order.

**The stale-lookup path too** (review finding P2, verified 2026-10-31). Today `handleSubmit` returns as soon as any lookup is marked stale: it reveals the lookup's page and never checks the others. Fixing only the normal branch would leave required answers elsewhere hidden. So both reasons go into one check. A page is bad if it fails validation **or** holds a stale lookup.
- Whole-form layouts reveal every bad page.
- Paged layouts land on the **first** bad page in form order. Small change from today: a stale lookup on page 3 no longer beats a missing answer on page 1; the person starts at page 1.
- The jump goes to the first red question on the landed page or, in whole-form layouts, in the form.

Paged layouts otherwise keep today's behavior.

## 5. What leaves the top of the form

| Message | Today | After |
|---|---|---|
| Server refused the Submit, or the save failed, including the guest site's `failSubmit` | top banner | **line by the button**, except in the two step-flow layouts, where it stays in the top banner (§3a) |
| "Could not fill these details. Enter them yourself or retry." (Autofill) | top banner | top banner. Nobody clicked a button to cause it. It moves to its own store, `_autofillError`, so it no longer shares one with Submit |
| The record to edit could not load (`editError`, with Retry) | top banner | top banner, unchanged |

## 6. Screen readers

The line is already `aria-live="polite"`, so the count and the server sentence are read out when they change. The jump moves focus to the question, and that question's own message (already `role="alert"`) is read with it. The top banner was `role="alert"`; the sentence now gets the polite line plus the focus move. Read out twice in a row would be noise.

## 7. Files

- `finalFormViewer.js`: `blockedMessage` getter (count + wording + server sentence), `focusRequest` stamping in `visiblePages`, one bad-page check for validation and stale lookups in `handleSubmit`, whole-form reveal for `paginates: false` layouts, `_autofillError` split out of `_submitError`
- `finalNavAccordion.js`: keep every open panel that is still there; default only when none survive; open the panel holding a new, unconsumed `focusRequest`
- `finalSectionRenderer.js`: unfold on a new counter number stamped on the section
- `finalFormViewer.html`: pass `blocked-message` to the bar; the top banner shows `autofillError`, plus the Submit failure while `ownsAdvance` is true (§3a)
- `finalElementRenderer.js`: act on a new `focusRequest` (scroll into view respecting reduced motion, then focus the control)
- Tests (below), this doc, and COMPONENT_CATALOG §1 row wording if it changes

## 8. Tests (Jest)

- Count: blocked Next with 2 bad → "Fix 2 fields to continue"; fix one → "Fix 1 field to continue"; fix both → empty. Singular and plural.
- Wording follows the button: last page / Scroll shows "to submit".
- Quiet before the first blocked click, even with invalid answers.
- Hidden (rule-hidden) questions and repeat sections are never counted.
- Stale lookup counts as one.
- Server field refusal: the sentence sits on the bar, not the top; it beats the count; cleared by the next Submit. `failSubmit` lands on the bar too.
- Autofill failure stays at the top and is not on the bar.
- `focusRequest` is stamped on the first red question only, and a new number appears on each blocked click; the renderer focuses once per number and calls `scrollIntoView` with `behavior: 'auto'` under reduced motion.
- Step-flow layouts unchanged: with `oneAtATime`, and with `splitHero` + Pane flow One at a time, a blocked advance leaves `blockedMessage` empty and stamps no `focusRequest`; `splitHero` + Pane flow Pages gets both.
- Step-flow Submit failures still visible: in both step-flow layouts, a server field refusal, a failed save and `failSubmit` each show in the top banner (and not on the bar).
- Fixed target: after a blocked click, fixing the first red question does **not** stamp the number on the second, and focus does not move. Answer updates keep the stamp on the original element id only.
- Consumed once: Accordion, blocked click lands on a question in panel 2 (focused). The person fixes it, closes panel 2 and reopens it with no new blocked click, and nothing is focused or scrolled. A second blocked click (new number) jumps again.
- Accordion with a conditional page: panel 2 is open and a question in it shows or hides page 4 through a rule. Panel 2 stays open both ways. If the rule hides the open panel's own page, the first visible panel opens (with "First panel open" on) or none (off).
- Folded section: a red question inside a folded section unfolds it on a blocked click; a second blocked click with the same number does not re-unfold a section the person folded again; the person's fold survives an answer update.
- Scroll and Accordion: Submit reveals every bad page; paged layouts still land on the first bad page.
- Stale lookup together with missing required answers: a stale lookup on page 2 and required answers missing on pages 1 and 3. Scroll reveals all three and counts 3; Tabs lands on page 1 (not page 2) and the jump targets page 1's question.
- Accordion (direct component tests, since the viewer test mounts layouts as a stand-in): a new `pages` array with the same page ids keeps the open panels (panel 2 stays open after an answer); a changed id set re-seeds the default; a failure in the **second, initially closed** panel opens it on a new `focusRequest`, with "Allow multiple" on (both open) and off (only panel 2 open); the same `focusRequest` number arriving again does not reopen a panel the person has since closed.
- The existing `submitError` tests are updated to the new home of the Autofill message.

## 9. Check in the org

Deploy, run a site publish (pre-authorized), then on the **Studio preview** (`/apex/FinalStudio`), a **Lightning page**, and the **public site**, at desktop width and on a 390 px phone, for Tabs, Stepper, Rail, Accordion, Scroll and Split (Pane flow = Pages), plus one form with a folded section (and One at a time, to confirm it is unchanged): click Next with two empty required questions, then confirm the line reads correctly, the page scrolls to the first one, the cursor is in it, and the line counts down as you fix them. Accordion extra: leave panel 2 empty and closed, click Submit, and panel 2 must open with the cursor in it; then answer a question inside panel 2 and it must stay open. Screenshots go with a click-by-click test sheet.

## 10. Not in this change

- Listing each error by the button (the owner chose the count).
- Per-entry errors inside repeat sections (DEFERRED: repeats validate as one value).
- One at a time and Split with Pane flow = One at a time (§3a, owner).
