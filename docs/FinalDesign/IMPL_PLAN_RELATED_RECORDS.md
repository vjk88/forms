# Build plan: make Related records (repeating groups) trustworthy

Status: Part 1 BUILT 2026-11-13 (branch feat/related-records-fixes). Part 2 not built. Closes the runtime half of [DEFERRED.md](./DEFERRED.md) #19.
The display styles pass (a real Table and Tiles) stays deferred.

**Two parts.** **Part 1** (§1 to §12) fixes what is broken today and is ready to build. **Part 2** (at the
end) is the owner's 2026-11-12 ask: on an existing record, show the related records that already exist, let
people change them, add to them and delete them. Part 2's direction and look are agreed in chat; some
behaviour and two save-time contracts are not settled, so it is **not ready to build**. Part 1 goes first
because Part 2 stands on it.

Revised the same day for review round 1 (six findings, each checked against the code before the change):
P1 hidden groups vs the server minimum (§5), P1 entries redrawn from stored answers (§3), P2 minimum-only
groups (§5), P2 server-error lifecycle (§4), P2 one absolute entry cap (§5), P2 focus target (§4).

Review round 2: bounded Min and Max, including older/imported specs (§5); survey topic links included in
the row budget (§5); the entry key counter travels with the entries (§3). Tests and file scope are updated.
Part 2 also records the open decisions on sparse-update counts and update/delete conflicts across lists.

Round 2 checked against the code (all five changes hold) and tightened in four places: the publish and
import home of the limit check is named (§5, §10); the invalid-limits message has a place to appear (§5);
the survey budget says honestly when it is counted (§5, §11); and a wrong claim that Publish already runs
`validateRepeat` is corrected, with that check now added to the publish gate (§5, §7).

Owner rulings, 2026-11-12 (buttons in chat):

- **"Show them as 'Coming soon'"**: Table and Tiles stay in the Display style buttons, greyed out, with a line
  saying they are coming. Only Stacked can be picked. **Revised later the same day for Table only** ("Yes,
  both", Part 2): Part 1 still ships Table greyed out; Part 2 builds it and switches it on. Tiles stays
  "coming soon".
- **"No entries, just '+ Add'"**: Min rows = 0 means the group starts empty with only its Add button.
- **Extras, all three in this change**: a search box in the "What should this group repeat?" picker, hide
  system-only links in that picker, and inspector boxes for the entry title and the remove button's label.

## 1. In plain words

**Today** (live-tested 2026-11-12 on two throwaway forms, see §9). Saving works: the main record and every
filled-in entry are saved together or not at all, blank entries are skipped, and removing an entry never
shifts answers between entries. But these things lie to the builder or the respondent:

| # | What is set up, or done | What actually happens | Seen |
|---|---|---|---|
| 1 | "Show Subject when Priority = High", both fields inside the group | Subject never appears, in any entry. Its answer can never be given. | Live |
| 2 | Last Name marked Required inside the group | Nothing checks it. The form says "Thank you!" with it blank. | Live |
| 3 | Min rows = 2 | Both entries can be left blank, and the record saves with 0 related records. | Live |
| 4 | Display style = Table | The form still shows stacked cards. | Live |
| 5 | Fill two entries, click Next, then Back (any paged layout); or fold and unfold the section | The group shows blank entries again while the two filled ones are still stored. Submit saves entries nobody can see; typing into the blanks wipes them. | Code only |

Plus smaller things: the object picker is a long A-Z list with no search and odd system objects; the group's
field list offers the link field itself (Account ID); a rule can name the field it sits on; the × button has
no name for screen readers; nothing on the server stops a guest from sending thousands of entries.

**After.** Entries are always drawn from what the form has stored, so they survive Next/Back and folding.
Rules and required checks work entry by entry, exactly like the rest of the form, with red messages on the
right entry and the "Fix N fields" count by the button. Min rows is enforced with one clear message. Table and
Tiles say "coming soon" instead of silently doing nothing.

**Why it was broken (the code):** each entry's answers are stored together as one list
(`repeat:{sectionId}` → `[{elId: value}, …]`). The rule engine and the checks only ever look up single answers
by question id (`this.answers[el.id]` in `finalFormViewer._ruleCtx` and `pageValidity`), so they see blank for
every question inside a group. `pageValidity` and the red-message pass skip group sections on purpose
("DEFERRED per-entry gating"), and the server never checks `min`. For bug 5: `finalSectionRenderer` keeps the
entry list in its own memory and is only re-seeded from stored answers in the Studio preview
(`previewEntries` / `previewRevision`); paged layouts draw `currentPageList` only, so leaving the page
destroys that memory.

## 2. Words used here

- **Entry**: one filled-in copy of the group (one related record).
- **Entry key**: the entry's fixed name (`en_0`, `en_1`, …). It never changes when other entries are added or
  removed. Position on screen is not identity.
- **Started entry**: an entry where at least one *visible* question has an answer. An entry whose only answers
  sit in questions a rule hides counts as not started.
- **Untouched entry**: not started. Never checked, never saved, never red.
- **Always-shown group**: neither the group nor its page carries a visibility rule.

## 3. The viewer owns the entries (bugs 1 and 5; review finding 2)

One contract replaces today's two (live: renderer-only memory; preview: `previewEntries`).

- **Stored in the viewer**, per group: the answer list as today (`repeat:{sectionId}`, the §8 payload shape,
  unchanged) plus a parallel list of entry keys and the next key number (`_repeatKeys[sectionId] =
  { keys: ['en_0','en_2'], seq: 3 }`). Keys never go to the server.
- **Sent down to the section on every render**, live and preview alike:
  `entries: [{ key, values, hidden: [elId], errors: {elId: [msg]}, focus: { n, elementId } | undefined }]`,
  in order, plus `nextEntrySeq: _repeatKeys[sectionId].seq` and `minMessage` (§5). Before anything is stored
  the viewer assumes `min` untouched entries keyed `en_0 … en_{min-1}` and `nextEntrySeq: min`, so both sides
  agree from the first paint. Validate the bounds in §5 before creating those entries.
- **The section renderer draws from that list.**
  - Created (first paint, back from another page, group un-hidden): it seeds its keys and values from
    `entries`, and its key counter from `nextEntrySeq`, never from the entry count or highest surviving key.
    Nothing is lost by leaving and returning. A removed key is never reused within the same form session.
  - While it stays mounted it remains the owner of in-progress typing; a new `entries` list with the same keys
    never replaces what is in a control mid-typing. A different section id or a new preview revision re-seeds,
    as the preview does today.
  - Every question in an entry is handed its stored `value` (today only the preview branch does this). So a
    question that a rule hid and showed again, or a section folded and unfolded, comes back showing the answer
    the form still holds: what you see is what will be sent.
- **Sent up on every change**: the same one event as today (`elementId: repeat:{sectionId}`, `value`: the
  list) with three additions: `keys` (order and identity), `nextEntrySeq` (the next unused key number), and `change`
  (`{ kind: 'answer', key, elementId }`, `{ kind: 'add', key }` or `{ kind: 'remove', key }`). §4 needs
  `change` to clear the right error. Add allocates `en_{nextEntrySeq}` and increments the counter before
  emitting; answer and remove preserve it. The viewer retains the greater of its stored and emitted
  counters. Remounts and preview revisions for the same group never lower it; a fresh form session resets it.
- **Rules per entry.** The viewer keeps the rule engine. For a group it stops filtering `s.elements` with the
  form-wide context and instead builds one context per entry: `getValue(id)` → that entry's value when `id`
  belongs to this group, else today's lookup (other answers, user fields). The result is each entry's
  `hidden` list. This is what FORM_SPEC_SCHEMA §4.1 already promises ("entry 2's 'show if X = Yes' reads
  entry 2's X").
- **Hidden answers are dropped per entry** at submit, the same rule as #269: a question a rule hides in entry
  2 sends nothing for entry 2. It stays in memory, so showing the question again shows the answer again.
- **Builder:** the rule picker already offers same-group questions (and only those, for a question in a group).
  New: it no longer offers **the question the rule is on** (true for every question, not only groups).

## 4. Required answers and checks inside an entry (bug 2; review findings 4 and 6)

- **Started entries are checked fully**: required answers and every validation check, exactly as a normal
  question, against that entry's own answers and only for questions visible in that entry. Red messages appear
  under the right question in the right entry, at the same moment the rest of the page turns red (the first
  blocked Next/Submit).
- **Untouched entries are never red** and are not saved (today's server behaviour, kept). The minimum is
  enforced separately (§5), so nobody faces a wall of red empty boxes.
- **Counted.** Each red question in an entry counts once in "Fix N fields to continue"
  ([IMPL_PLAN_BLOCKED_MESSAGE](./IMPL_PLAN_BLOCKED_MESSAGE.md)); a group's minimum message counts once.
  `pageValidity`, `blockedMessage` and `_requestFocus` stop skipping group sections.
- **The jump names its question.** At a blocked click the viewer fixes one target, as today, now possibly
  inside a group: `{ n, sectionId, key, elementId }`. It stamps `focus: { n, elementId }` on **that entry
  only**; the section renderer passes `focusRequest: n` to **that question in that entry only**. Targets, in
  form order:
  1. a red question in a started entry → that question;
  2. a group's minimum message → the first visible question that can take focus in the first untouched entry;
  3. fallback when that entry has nothing to focus (every question hidden by rules, or only display blocks),
     or when there is no entry at all → the group's **Add** button; with no Add button either, the group's
     heading is scrolled into view and nothing takes focus.
  Same "one fixed target per click, consumed once" rule as today.

### Database refusals on a related record

Today the server reports a refused related record by field name only, and the viewer copies that message onto
the matching question in **every** entry (and could paint a main-record question with the same field label).
Not seen live (on 2026-11-12 the Account validation rule fired first); the org check (§9) covers it.

- **Server.** `FinalSubmitService.insertEntries` catches the insert failure itself and reports each failed row
  with `sectionId` and `entryIndex`, then rolls everything back as today. `FieldError` gains those two fields
  (both empty for main-record errors). **`entryIndex` is zero-based and is the position in the list as it was
  sent**, blanks included: `DmlException.getDmlIndex(i)` is mapped back past the skipped blank entries. (So a
  failure on the third sent entry, after a skipped blank second one, reports `2`.)
- **Client, routing.** At submit the viewer snapshots that group's key order. An error with a `sectionId` is
  turned from index into **entry key** using the snapshot and stored as
  `_serverEntryErrors[sectionId][key][elId]`. It reaches only that group's questions in that entry. An error
  without a `sectionId` reaches only questions outside groups.
- **Client, lifetime.** Keyed by entry key, never by position, so removing an earlier entry cannot slide an
  error onto its neighbour. Cleared by the section's `change`:
  - `answer` for that key and question → that one message goes (the complaint was about the value that was
    sent, the same reasoning as normal questions today);
  - `remove` for that key → all of that entry's messages go;
  - the next Submit → everything goes, as today.
  `add` and answers in other entries clear nothing.
- Guests still get the single flat refusal (a public form must not reveal the org's validation rules).

## 5. Min, max and the entry cap (bug 3; review findings 1, 3 and 5)

| Setting | What the respondent sees | What blocks Next/Submit |
|---|---|---|
| Min 0 (owner ruling) | Group title, then only "+ Add {thing}" | Nothing. Zero entries is fine. |
| Min N ≥ 1 (default for new groups stays 1) | N untouched entries, no × on them | Fewer than N started entries |
| Max M, 1–50 | Add button disappears at M entries | n/a |
| Max blank or 0 | Add button disappears at **50** entries | n/a |

- **The minimum message**: one line under the group's title, in the theme's error style: **"Fill in at least
  2 entries."** ("1 entry" when N = 1). It appears with the other red messages (first blocked click),
  disappears as soon as enough entries are started, and a hidden group never shows or counts it.
- **A minimum is a check in its own right.** Today `pageValidity` answers "all valid" without looking when no
  question has a validation (`_hasValidation` false). A group with Min ≥ 1 now switches that flag on by
  itself, so a form whose only check is "Min 2" on a group of optional questions still blocks.
- **Server minimum: only for always-shown groups.** The viewer leaves a rule-hidden group out of the payload
  on purpose, and the server cannot run "show if" rules (there is no Apex rule engine; `FinalMappingRules
  .skippable` already uses the same "has a visibility rule" test for the same reason). So:
  - group and page carry **no** visibility rule → the server counts started entries and refuses fewer than
    `min` with the same sentence (form-level, nothing written). A guest cannot skip this by leaving the group
    out.
  - group or page **has** a visibility rule → the browser check is the only check. A crafted request could
    send fewer entries than the minimum, exactly as it can skip a Required answer today (the server never
    checks `required` either). Accepted for v1; it cannot write anything the form does not already allow.
- **One absolute cap: 50 entries per group** (`MAX_ENTRIES_PER_GROUP`, engineering call).
  - Server, first thing, on the **raw** list before blanks are dropped: more than 50 items for any group →
    refused with "Too many entries in {group title}." An explicit Max above 50 in a spec does not raise it.
    A positive spec Max below 50 is enforced too, also on the raw list; blank/0 means the cap of 50.
  - Browser: blank/0 Max means an effective maximum of 50; otherwise it is the smaller of Max and 50.
    The Add button stops at that per-group limit; the combined submission still has the budget below.
- **Bounds are validated together, before entries are created.** Min is a whole number from 0 to 50;
  blank/missing Min keeps the default of 1. Max is blank, 0, or a whole number from 1 to 50. Blank/0 Max
  remains valid and means up to 50, not a maximum of zero. Min must not exceed the effective maximum.
  - Inspector: the Max label becomes **"Max rows (0 = up to 50)"**. Out-of-range, fractional or nonnumeric
    input shows "Min rows must be a whole number from 0 to 50." or "Max rows must be blank or a whole number
    from 0 to 50." under the relevant control (5.19), and is not saved. A positive Max below Min shows
    "Max rows can't be less than Min rows." under Max. Raising Min above an existing positive Max shows
    "Min rows can't exceed Max rows." under Min and is not saved.
  - Publish and import apply the same bounds and effective-maximum comparison through **one shared check**,
    `FinalPublishWarnings.repeatLimitProblems(spec)`, called from two places:
    - `FinalSpecController.publishSpec`, the publish gate, next to `choiceOptionProblems` and
      `lookupsWithoutObject`. This is new: normal Publish checks nothing about a group today.
    - `FinalSpecDescribeValidator.validateRepeat`, which both import paths already call
      (`FinalSpecTransferValidator`, `FinalSurveyImportNormalizer`).
    Older drafts with invalid settings remain inspectable, with the relevant errors, but cannot publish
    until corrected. Do not silently lower Min or rewrite stored settings.
  - **Publish also runs `validateRepeat` on every group** (my call). Today that check, which confirms the
    child object and its link field really point at the form's object and can be written, runs on import
    only, so a hand-made spec could publish a group with any link field. Same gate, same call.
  - Already-published specs: a positive whole-number Max above 50 still has an effective maximum of 50
    (the compatibility rule above). Invalid Min, malformed/negative/fractional Max, or Min above the
    effective maximum means **the form does not open**: the viewer shows "The entry limits for {group
    title} need to be corrected by the form owner." in its existing top error banner, with no Retry (the
    visitor can do nothing about it), before it creates any entries. Submission refuses the same invalid
    configuration before any write. Thus Min 51 with Max blank never creates 51 rows or presents an
    impossible form to complete. (No such spec exists today: only the two 2026-11-12 test forms have
    groups, and both are valid. This path is a guard, so it stays this small.)
- **Whole-submission budget: 2,000 rows from groups.** A Form writes one record per entry, but a Survey writes
  answer rows **and `Form_Answer_Topic__c` links**. The server adds up the rows all groups would produce:
  related records for a Form; answer rows plus every topic-link row for a Survey, using the same answer
  and valid-topic selection as the write path. It refuses above 2,000 with "This response has too many
  entries. Remove some and try again." For example, 2,000 answers with four topic links each mean
  10,000 group rows and must be refused, even though the answer count alone meets the old threshold.
  **When it is counted:** a Form's related records are counted before anything is written. A Survey's rows
  can only be built after its response record exists (each answer row carries that record's Id), so there
  the count happens inside the save, after the rows are built and before they are inserted, and a refusal
  rolls the response back with everything else. Either way nothing is left behind. The limit is a
  `@TestVisible` value so tests can lower it instead of creating thousands of rows.
  This is a budget for group-generated writes, not a guarantee for the whole transaction: it reserves
  headroom for ordinary answers and their topic links, the main record, mapped writeback and automation.
  Arbitrary org triggers/flows can still exhaust transaction limits; do not promise that they always fit.

## 6. Display style: Table and Tiles "coming soon" (bug 4, owner ruling)

- `finalButtonGroup` already supports a disabled option. Table and Tiles become disabled options in the
  group inspector, and the settings row gets a help line below it (5.4): **"Table and Tiles are coming soon."**
  A disabled button can't show a hover tip to keyboard users, so the help line is the message.
- A spec that already says `table` / `tileModal` keeps rendering stacked (today's fallback) and its button
  shows Stacked. (No form in the org uses them: 0 of 98 forms had any group before the 2026-11-12 test.)
- DESIGN_SYSTEM.md 5.7 gets one sentence in the same PR: an option that isn't built yet is a disabled
  segment plus a help line naming it, never a hidden or silently ignored choice.
- **Table does not stay greyed out for long.** Part 2 (P2.3) builds the real Table and enables its button;
  the help line then reads "Tiles is coming soon." Part 1 keeps Table disabled so the fixes stay small.

## 7. Builder extras (owner ruling)

1. **Search in "What should this group repeat?"** (`finalRelationshipPicker`): a `lightning-input
   type="search"`, label "Search objects", first thing in the dialog, focused on open. It filters by the
   object's label, its API name, or the link field's label ("via Contact ID"). No match → the empty state
   (5.20): "No objects match “xyz”." Escape clears the search first, then closes the dialog (5.16 order).
2. **Hide system-only links** (`FinalStudioController.describeChildRelationships`, server side so every caller
   agrees): skip child objects whose API name ends in `Feed`, `History`, `Share` or `ChangeEvent`, custom
   settings, and this fixed list: `Attachment`, `Note`, `NoteAndAttachment`, `CombinedAttachment`,
   `AttachedContentDocument`, `ContentDocumentLink`, `ContentVersion`, `ContentDistribution`,
   `EntitySubscription`, `TopicAssignment`, `ProcessInstance`, `ProcessInstanceHistory`, `RecordAction`,
   `FlowRecordRelation`, `ActivityHistory`, `OpenActivity`. Everything else stays, including custom
   objects. `validateRepeat` does not use this list, so a spec that already names one of these objects is
   never refused because of it, on import or at publish (§5).
3. **Entry title + remove label boxes** in the group inspector, under "Add-button label", as settings rows
   (5.4) with `lightning-input`:
   - **Entry title**, help: "{index} becomes the entry number, like Case 1, Case 2." Blank falls back to
     "Entry {index}".
   - **Remove button label**, help: "Read out by screen readers and shown on hover." Blank falls back to
     "Remove".
4. **The link field is not offered** in the group's field list (Account ID under a Contact group). The submit
   engine always sets it; letting the builder add it as a question would let the respondent overwrite it.

## 8. Respondent-side details

- The × keeps its look. It gains `aria-label="{remove label} {entry title}"` ("Remove Case 2").
- After **Add**, focus moves to the first question of the new entry (the Add button when it has none). After
  **×**, focus moves to the Add button (the entry it was in is gone). Today focus is lost in both cases.
- Min 0 with zero entries: the group shows its title, description and Add button only. Nothing else.

## 9. Check in the org

Throwaway forms from the 2026-11-12 test are reused: **Related Records Check 2 (Claude)** `a05hk000002khqPAAQ`
(Contact → Cases, Split Hero) on `/lightning/n/Final_P0_Test?c__formId=…` and on the Studio preview
`/apex/FinalStudio`. Use Contact/Case, not Account: the org's Account validation rule `sfs23` (formula
`true`) refuses every Account save. The form gets a second page so Next/Back can be tried.

1. Rule: Subject shown when Priority = High. Entry 1 High → Subject appears in entry 1 only; entry 2 stays
   hidden. Answer Subject in entry 1, switch Priority to Low → Subject hides; back to High → it returns
   **showing the answer**. Submit while hidden → the saved Case has no Subject.
2. Required: mark Subject required. Leave it blank in a started entry, with an optional question above it →
   red under that entry's Subject, "Fix 1 field to submit", cursor lands in Subject (not the optional one).
3. Min 2: leave both blank → "Fill in at least 2 entries.", cursor in entry 1's first question. Fill one →
   still shown. Fill two → gone, saves 2. Same with every question optional and no other check on the form.
4. Min 0: group shows only "+ Add Case"; submit with none → saves the Contact, 0 Cases.
5. Next/Back (bug 5): fill two entries, Next, Back → both entries are there with their answers. Fold and
   unfold the section → same. Confirm first that today's build loses them, so the fix is proven against a
   real failure.
6. Hidden group: a rule hides the whole group (Min 1) → submit succeeds, no related records, no message.
   Same with the rule on the group's page.
7. Database refusal on one entry: add a temporary validation rule on Case (Subject must not be "bad"), submit
   entries "ok", blank, "bad" → only the third entry's Subject is red. Fix it → the message goes. Submit
   again with "bad" in entry 3, then remove entry 1 → the message stays on the same entry (now second), not
   the one after it. Remove the rule afterwards (named in chat first).
8. Cap: with Max blank, the Add button disappears at 50 entries.
9. Builder: Table/Tiles greyed with the help line; picker search finds "Case" by typing "cas"; Attachment and
   Feed rows are gone; Contact ID is not in the Case field list; the rule picker doesn't offer Subject on
   Subject; Entry title "Ticket {index}" shows "Ticket 1"; Min and Max refuse 51 and fractions, Max accepts
   blank/0, and neither edit can leave Min above the effective maximum.
   Add three entries, remove the last, Next, Back, then Add: the new entry is empty and shows no red message.
   (That it gets a fresh key is not visible by clicking; Jest covers it.)
10. Guest: make test form 2 public, run the pre-authorized site publish, repeat checks 2-5 on the public site
    at desktop and 390 px. Then make it private again.

Before/after photos of the group inspector, the picker and an entry with errors go with a click-by-click test
sheet, on the Studio preview and the Lightning tab.

## 10. Files

- `finalFormViewer.js`: `_repeatKeys`, `nextEntrySeq`, the `entries` contract (values, per-entry `hidden` /
  `errors` / `focus`), `minMessage`, per-entry rule context, entry-aware `pageValidity` / `blockedMessage` /
  `_requestFocus`, Min ≥ 1 switching `_hasValidation` on, `_payload` per-entry hidden drop,
  `_serverEntryErrors` (routing by submit-time key snapshot, clearing by `change`), effective max of 50,
  invalid-limit configuration refusal before entry initialization
- `finalFormViewer/previewSession.js`: preview keeps its entries through the same contract
  (`previewEntries` folds into `entries`)
- `finalSectionRenderer.js/.html/.css`: seed from `entries` and `nextEntrySeq` when created, hand each question
  its `value`, hide / errors / focus per entry, `keys` + `nextEntrySeq` + `change` on the event, min 0 empty start,
  minimum message line,
  × `aria-label`, focus after Add / ×
- `finalPropertyPanel.js/.html`: disabled Table/Tiles + help line, Entry title and Remove label rows,
  integer bounds for Min/Max, blank/0 Max support, effective-maximum comparison on either edit, new Max
  label, link field filtered from the child list
- `finalFormStudio.js`: rule sources exclude the selected question
- `finalRelationshipPicker.js/.html/.css`: search box + empty state
- `FinalSubmitService.cls`: `FieldError.sectionId/entryIndex`, `insertEntries` error mapping, raw-list cap of
  50 and spec Max, invalid-limit configuration refusal, 2,000-row budget including survey topic links,
  minimum for always-shown groups (form and survey paths)
- `FinalPublishWarnings.cls`: new `repeatLimitProblems(spec)`, the one shared limit check of §5
- `FinalSpecController.cls`: `publishSpec` gate calls `repeatLimitProblems` and `validateRepeat` for every
  group
- `FinalSpecDescribeValidator.cls`: `validateRepeat` calls `repeatLimitProblems`, which covers both import
  paths (forms and surveys) without relying on the inspector
- `FinalStudioController.cls`: system-only filter in `describeChildRelationships`
- `DESIGN_SYSTEM.md` 5.7 sentence, FORM_SPEC_SCHEMA §4.1 (min 0, started entries, the cap, where the server
  enforces the minimum, numeric bounds and legacy handling, topic-link budget), DEFERRED #19 narrowed to the
  styles pass

## 11. Tests

**Jest**
- Viewer, rules: same-group rule hides/shows per entry; outside-group rule applies to every entry;
  hidden-in-entry answer is dropped from `repeats` in the payload but kept in memory; an entry with answers
  only in hidden questions counts as untouched.
- Viewer, restore: after a rule hides and shows a question, the entry handed to the section carries its
  stored value; entry keys and values survive an answer update, a page change and back, and a hidden group
  being shown again.
- Viewer/section, key allocation: add `en_0`, `en_1`, `en_2`, remove `en_2`, navigate away/back, then Add →
  `en_3`, never `en_2`. Repeat through group hide/show and preview revision; removing every entry with Min 0
  also retains the counter. Answer/remove events never lower `nextEntrySeq`; a fresh form session resets it.
- Viewer, checks: required blank in a started entry blocks Next and is counted; untouched entry is never red;
  with an optional question first and a required one second, the focus target is the required one; fixing it
  doesn't move focus.
- Viewer, minimum: min 2 with 1 started → one message, counted once, focus on the first untouched entry's
  first question; that entry with every question hidden → focus falls back to Add; min 0 → no message with
  zero entries; **a form with no field validation at all** and a Min 2 group still blocks; a hidden group
  (section rule, and page rule) with Min 1 neither blocks nor counts.
- Viewer, server errors: one with `sectionId` + zero-based `entryIndex` lands only on that entry's question;
  one without lands only outside groups, even when a group question has the same label; an `answer` change on
  that entry and question clears it; an answer elsewhere doesn't; removing an **earlier** entry leaves the
  message on the same entry key; removing that entry clears it; the next Submit clears all.
- Viewer, cap: with Max blank the effective max handed to the section is 50; Max 5 stays 5; a spec Max of
  500 is treated as 50. Min 51/Max blank, Min 6/Max 5, and malformed/negative/fractional limits show the
  configuration refusal before entries are created; blank Min defaults to 1 and Min 0 stays 0.
- Section renderer: created with two stored entries → draws both with their values and keys; a new `entries`
  list with the same keys does not overwrite a control being typed in; fold/unfold keeps answers visible;
  min 0 starts with no entries; Add focuses the new entry's first question; × focuses Add; the event carries
  `keys`, `nextEntrySeq` and the right `change`; × `aria-label` includes the entry title; `focusRequest` reaches only the
  named question in the named entry.
- Property panel: Table/Tiles disabled + help line; Entry title / Remove label write `entryLabel` /
  `removeLabel`; Min/Max accept 50 and reject 51, negatives, fractions and nonnumeric input; Max accepts
  blank/0 with Min 1 or 50; changing either setting cannot leave Min above the effective maximum and does
  not save invalid edits; the link field is not listed.
- Studio: rule sources never include the selected question.
- Relationship picker: search filters by label, API name and link label; empty state; Escape clears, then closes.

**Apex**
- Minimum: an always-shown group with fewer started entries than `min` → refused, nothing written (form and
  survey). The same group **with a visibility rule on the section**, and **on its page**, omitted from the
  payload → accepted.
- Cap: 51 raw items → refused even when 50 of them are blank and even when the spec says Max 500; more than a
  positive spec Max of 5 → refused; blank/0 Max permits up to 50 raw entries.
- Configuration: `publishSpec` and both import paths reject invalid numeric limits and Min above the
  effective maximum, for forms and surveys. `publishSpec` also rejects a group whose link field does not
  point at the form's object. Submission rejects Min 51/Max blank, Min 6/Max 5 and malformed limits before
  any write; an already-published whole-number Max 500 is capped at 50 without rewriting the spec.
- Budget, with the `@TestVisible` limit lowered (to 20, say): a survey whose groups would write more
  answer-plus-topic-link rows than the limit → refused, and the response record is rolled back with it.
  Include answers with four valid topics each (5 answers = 25 rows, refused, though 5 alone is under the
  limit), exactly the limit (accepted when otherwise valid) and one over (refused). Excluded/retired
  topics do not consume link rows, matching the write path. Form budgets count related records and refuse
  before anything is written.
- Errors: entries sent as [ok, blank, bad] → the failure reports the group's `sectionId` and
  `entryIndex` **2**; the main record rolls back; a guest gets the flat refusal with no fields.
- `describeChildRelationships` on Account leaves out Attachment, AccountFeed, AccountHistory, AccountShare,
  keeps Contact, Case and Opportunity.

## 12. Not in this change

- A real Table: not in Part 1, built in Part 2 (P2.3, owner ruling "Yes, both").
- A real Tiles look (still the styles pass; it starts with a mock, per the owner's 2026-06-07 style rulings).
- Groups inside groups and file questions inside groups (v1 laws).
- Groups on a form that edits an existing record: still refused after Part 1. Part 2 lifts that.
- Rules on questions **outside** a group that read answers **inside** it (§7 scoping law; the builder already
  refuses them).
- A server-side rule engine. Until one exists the minimum on a group that a rule can hide is checked in the
  browser only (§5).
- A builder warning when rules can hide every question of an entry while the group has a minimum (the
  respondent then can't meet it; the focus fallback in §4 at least lands them on Add). Hide the whole group
  with a group rule instead.

---

# Part 2: related lists on an existing record

Status: DIRECTION AGREED 2026-11-12, **not ready to build** (see "Not settled yet"). Builds after Part 1.

Owner, in chat, 2026-11-12:

- "I want this to be used as both read only and editable.. you know like a lightning record page."
- On a Contact's record page the list **shows the Cases that already exist** for that Contact.
- **The builder can filter each list**, and one form can hold **several lists of the same object**: "open
  cases, closed cases etc."
- People can **add new records** there, "with some fields autofilling in the backend or frontend".
- People can **update the fields we show** for the existing records.
- Each row has **a way to go to the actual record** in Salesforce.
- **Read-only is a config option** the builder picks when adding the list.
- **Delete "can be option"**, and there is **always a warning** before a record is really deleted.
- **One Save** for everything. Delete follows it: warn, mark the row "will be deleted when you save" with an
  Undo, really delete at Save. ("lets say yes for now")
- For **signed-in people on a record page**, not guests. The **builder** sets the filter, not the person
  filling in the form.
- **The look: Cards and Table, both.** Shown the mock
  ([mocks/related-lists-mock.html](./mocks/related-lists-mock.html)), the owner said it "looks good", then:
  "why just one view, why cant A and B?" and **"Yes, both"**. The builder picks per list. Look C (rows
  that open) was not chosen.

## P2.1 In plain words

**Today.** A form with a group works only when it creates a brand-new record. Put the same form on a record
page so it edits that Contact, and it shows "Editing an existing record is not supported for forms with
repeating sections." That block was deliberate (owner D2, 2026-09-08): the form could not load the existing
Cases, so every Save would have created new ones next to them. Refusing was safer than duplicating.

**After.** On an existing record each list loads that record's related records and knows which row is which.
A row is a real Case: change it and the Case is updated, not copied. New rows become new Cases. A list can be
read-only, can be filtered by the builder, and can allow delete.

**On a form that creates a new record nothing changes**: there are no existing records to show, so an
editable list is the add-only group of Part 1, and a read-only list is not shown at all.

## P2.2 What the builder sets, per list

All in the group's inspector, as settings rows (5.4). Exact layout comes from the mock.

| Setting | What it does | Default |
|---|---|---|
| **Show** (conditions) | Which existing records appear: "Status equals Closed". The same conditions editor as lookups and visibility rules (`finalConditionsModal`, with the query operators lookups use). Blank = all of them. | Blank |
| **Read only** | Rows show their values as plain text. Nothing can be changed, added or deleted. | Off |
| **Allow delete** | Each row gets a delete control. Not offered while Read only is on. | Off |
| **Link to record** | Each existing row gets "Open {Case}". | On |
| **Display style** (exists today) | **Stacked** = Cards (look A), **Table** (look B). Tiles stays greyed out. | Stacked |

Two lists of the same object are simply two groups, each with its own conditions (this already works in the
builder: a group is a section). Each picks its own Display style, so "Open cases" can be Cards and "Closed
cases" a Table on the same form.

## P2.3 What the person on the record page gets

- **Loading**: each list shows a loading state (5.20), then its rows. An empty list says so in one line and,
  when it is editable, shows its Add button.
- **Changing a row**: the questions the builder put in the group, filled with that record's values. Rules
  (Part 1 §3) and checks (Part 1 §4) work per row on those values.
- **Adding**: the Add button, exactly as Part 1.
- **Opening the record**: "Open {Case}" opens the Salesforce record **in a new tab**, so unsaved changes on
  the form are not lost. (My call.)
- **Deleting**: click delete → an inline "Delete this Case? This can't be undone after you save." (inline
  dialog; `lightning/confirm` hangs in the VF Studio) → the row stays, marked **"Will be deleted when you
  save"**, with **Undo**. A new row that was never saved is simply removed with the × as today, no warning.
- **Save**: the form's one Save. Main record, changed rows, new rows and deletions all succeed together or
  not at all. Afterwards every list reloads, so a Case changed from Open to Closed moves to the right list.
- **A row the person may not edit** (Salesforce sharing says no) shows as a read-only row inside an editable
  list. Delete appears only on rows they may delete.

### The two looks (owner ruling "Yes, both"; the details are my calls)

Both follow the mock. Everything above (rules, checks, delete, Save) behaves the same in either look.

- **Cards (Stacked)**: today's look, one card per record. The card's heading is the record's own name
  ("Case 00001026"; "New case" for a row not saved yet), with "Open Case" and the delete control at its end.
  A read-only card shows each question's label over its value as plain text.
- **Table**: one line per record.
  - Columns are the group's questions, in the builder's order, headed by their labels. The first column is
    the record's name, and it is the "Open Case" link when Link to record is on ("New" for an unsaved row).
    The delete control sits in a last, unlabelled column.
  - An editable list has the control in each cell; a read-only list has plain text. A question a rule hides
    for that row leaves its cell empty; the column stays. A red message sits under its own cell's control.
  - Add appends a new line at the bottom (the owner's 2026-06-07 ruling: stacked and table add inline).
  - "Will be deleted when you save" + Undo replaces the row's cells, as in the mock; the name and first
    value stay, struck through, so the person can see which record it is.
  - Hand-built on the SLDS table markup, not `lightning-datatable` (owner 2026-06-07: its inline edit suits
    existing rows, not adding new ones). It reads the form's theme tokens like every respondent component.
  - **When it doesn't fit, it becomes Cards by itself.** The component measures its own width (never the
    screen's): if the columns can't each keep a usable width, that list draws as Cards. So a phone, a narrow
    record-page column, or a group with many questions never produces a squashed or sideways-scrolling
    table. The inspector says so under Display style when Table is picked: "Shows as cards where there
    isn't room."
- **Table works for every group once built**, including the add-only group on a form that creates a new
  record, not only for lists on an existing record.
- **New groups still start as Stacked.** Nothing changes for a builder who never touches the setting.

## P2.4 How it works (engineering calls, mine)

- **Loading is server-side and runs as the signed-in user.** New `FinalRelatedListService.load(formId,
  versionId, parentRecordId)` returns, per list: `rows: [{ id, name, values: {elementId: value}, canEdit,
  canDelete }]`, `total`. `name` is the record's own Name field (Case Number for a Case), for the card
  heading and the table's first column. One query per list: the group's bound fields, `WHERE {linkField} = :parentId AND
  ({compiled conditions})`, `WITH USER_MODE`, plus `UserRecordAccess` for the edit/delete flags. Field names
  never leave the server; values are keyed by question id, like the rest of the runtime.
- **One compiler for the conditions**, the Lookup v2 rule (`FinalLookupService` / `FinalLookupLogic`): the
  published conditions are compiled once, and that same clause loads the rows **and** checks them at Save.
  Conditions may compare with the main record's fields and the current user (sources the editor already has).
- **Identity.** A loaded row's entry key (Part 1 §2) is its record id; a new row keeps `en_N`. The payload's
  entry carries the reserved key `$id` for an existing record. Deletions travel as
  `repeatDeletes: { sectionId: [id] }`.
- **Only what changed is written.** The viewer remembers each loaded row's starting values and sends only the
  rows, and within them only the questions, the person actually changed. A row nobody touched is not
  updated at all (no needless trigger runs, no stolen "last modified by"). This is also how owner D1 (**last
  write wins**, no modified-date guard) applies here: only to the fields the person changed. This sparse
  payload cannot be counted as the full list; see the open counting contract under "Not settled yet".
- **Save-time checks, before anything is written** (`FinalSubmitService`, same savepoint as today):
  - every `$id` and every delete id is re-queried with the list's own clause: it must be a child of **this**
    parent and match the list's conditions **as it was before the edit**. A crafted id for someone else's
    Case is refused. (Changing Status so the row leaves the list is fine: the check is on the stored record.)
  - Read only list → any change, add or delete for it is refused. Allow delete off → any delete is refused.
  - updates use `stripInaccessible(UPDATABLE)` then `update as user`; deletes use `delete as user`; new rows
    insert as Part 1.
  - the same record changed through two lists in one Save: the changes are merged; two different values for
    the same field → refused with a message naming the record. Update-versus-delete conflicts and repeated
    delete ids need the separate contract under "Not settled yet" before this slice is built.
  - a record deleted by someone else in the meantime → that row gets the message "This Case no longer
    exists." and nothing is saved.
- **The 50 cap (Part 1 §5) counts loaded rows too.** A list shows at most 50 existing records, newest first.
  With more, a line under the list says "Showing 50 of 312." with "View all in Salesforce" (the standard
  related list), and Add is hidden. (My call, including "newest first": no sort setting in v1.)
- **Minimum**: existing rows count toward Min rows. **Required and other checks run on new rows and on rows
  the person changed**, never on an untouched existing row: an old Case with a gap must not block someone who
  only came to fix a phone number. (My call.)
- **Where it switches on**: exactly where record edit does today (`existingRecordId` on the viewer; never in
  the Studio preview, `authoring` or `delegateSubmit`, the same load-bearing exclusions). The Studio preview
  shows each list with its add row and one line: "Existing {Cases} appear here on a record page." It never
  reads real records.
- **Forms only.** Guests never load records (record edit already refuses guests). Surveys and Freeform are
  out: a Survey is never a record page, and Freeform writes through Mapping.
- **The September block comes out in two places**: the viewer's `_editConfigurationError` and the server's
  "cannot contain a repeating section" refusal, each replaced by the checks above. (The server comment
  mentions a publish-time block too; none exists in the code, so there is nothing to remove there.)

## P2.5 Order of work

Each slice is its own PR, deployed and checked on a Contact record page and the Studio preview.

1. **See**: load existing rows, Show conditions, Read only, Link to record, the 50 line, and **both looks in
   their read-only form** (Cards and the new Table, with the fall-back to Cards). No saving yet: every list
   on an edit form behaves as read-only. Lifts the block for read-only lists. The Table button is enabled
   from this slice; until slice 2 a Table list that has to be editable (an add-only group on a new-record
   form) draws as Cards, through the same fall-back.
2. **Change and add**: editable rows **in both looks** (the Table's editable cells and inline Add), so
   add-only groups get a real Table too; only-what-changed, one Save, reload after Save, per-row checks.
3. **Delete**: Allow delete, the warning, "will be deleted" + Undo, delete at Save.

## Not settled yet (owner questions and review decisions; not decided here)

- **Auto-filled fields on a new row.** The owner wants "some fields autofilling in the backend or frontend".
  Which values, who sets them and whether the person sees them is not described yet.
- **Read only means no Add button.** My guess; the owner has not confirmed it.
- **Counts with sparse updates and truncated lists.** Part 1 counts submitted entries; Part 2 sends only
  changed rows, so payload length cannot enforce Min or Max. Before the Change and add slice, define the
  server-authoritative count from stored list membership plus additions minus deletions, and whether
  edits that move records into/out of a filter change that count in the same Save. Distinguish the 50-row
  display/request cap from total membership: a list with 312 existing records must not make an unrelated
  parent edit fail simply because it already exceeds 50. Specify how authored Max, Min, unseen rows and
  read-only lists participate. Required cases: no child changes with a positive Min; a deletion crossing
  Min; an addition crossing Max; a filter-changing edit; and a truncated list whose parent alone changes.
- **One record updated and deleted through overlapping lists.** Before the Delete slice, decide whether
  an update in one list plus a delete in another is rejected or whether one action takes precedence, and
  specify how the result is explained on both rows. Repeated deletes of the same record must be deduplicated
  into one DML delete, after authorization is checked for every originating list; a permitted list must
  not authorize a delete submitted through a read-only or delete-disabled list. Required cases: update
  plus delete in either list order; the same delete through two lists; a forbidden origin; and Undo leaving
  an update in the other list. Keep the one-Save atomicity promise for all cases.
