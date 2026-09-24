# IMPL_PLAN — Conditions editor rebuilt, and the F2 find-or-create search

> **Status:** revision 3 + review rounds 2–4, draft for owner review, 2026-09-23. No code yet.
> Rev 2: the owner asked for the Form Designer's condition editor style everywhere (in a dialog),
> and a plan review found seven defects in rev 1 (the table at the end says where each was fixed).
> Rev 3: the Form Designer's **sources** too — related fields in one flat list, **Current user**
> (any User field, plus Profile name and Role name), the **linked record for Forms** (the record
> being edited), and **NOT** in custom logic (D54–D57, slice S2b).
> **For agentic workers:** use superpowers:executing-plans, task by task. Checkboxes track steps.

**Goal:** One clean condition editor — Form Designer style, in a dialog — for visibility rules,
lookup filters and the mapping search. In the mapping search an author can compare with form
answers, in rows or in a WHERE clause they type, and the step reads as its two branches: _if one is
found_, _if none is found, create_.

**Why (what the owner saw, 2026-09-23):**

1. The Studio's condition editor is a stack of bare browser dropdowns. The Form Designer's
   (`visibilityEditor`) was one row per condition with labelled columns — Source · Field · Operator ·
   Value — in a dialog with Save / Cancel / Clear All. That is the look to copy.
2. In the mapping search the main match could use an answer, but the filter rows couldn't. The
   runtime already understood answers in rows; the screen offered no way to pick one.
3. Under "When one is found, it's used as-is and nothing is written to it" sat the field list, which
   is really for the record created when **nothing** is found. Nothing said so.
4. Last Name → "A fixed value" showed _"Another record: Last Name isn't a lookup field."_ underneath.
   Custom logic `1 AND (2 OR 3)` over one row wasn't flagged until publish.
5. From the F2 plan review: a respondent who types `$User.Name` into an answer used by a filter row
   has it read as an instruction.
6. The Form Designer's Source column offered the record (with related fields listed flat, like
   "Account › Type"), Current User and User Profile. The rebuilt editor had none of that, and
   linked-record rules only worked for Surveys — although a Form opened with `existingRecordId`
   has a record too.

**Spec:** [FREEFORM_F2_MAPPING_SPEC.md](./FREEFORM_F2_MAPPING_SPEC.md). Task 1 adds rulings
D49–D57 to it; D54–D57 also go into
[EXPLICIT_RECORD_CONTEXT.md](./EXPLICIT_RECORD_CONTEXT.md) (linked records) and the visibility-rules
spec, since they are not mapping-only.

## Owner rulings (2026-09-23)

| #   | Ruling                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D49 | **A mapping filter row compares against a fixed value or an answer.** Columns: Field · Operator · Compare with · Value. Only answers whose type and single-value shape fit the row are offered.                                                                         |
| D50 | **An author may type the WHERE clause instead of building rows** — an "Advanced (SOQL)" tab in the conditions dialog. Either-or per step; switching warns before discarding. Mapping search only. A deliberate exception to "never raw expressions" (visibility rules). |
| D51 | **Answers go into a typed clause through an Insert answer button** as a readable `{Your email}`, and always run as bound values.                                                                                                                                        |
| D52 | **The searched field is pre-filled in the create list, and stays editable.** Softens D45.                                                                                                                                                                               |
| D53 | **One condition editor, Form Designer style, in a dialog, for all three screens** (visibility rules, lookup filters, mapping search). Each screen shows a one-line summary and an Edit button.                                                                          |
| D54 | **Related fields sit in the Field list, one level deep, flat** — "Account › Type" next to the object's own fields — on all three screens. Advanced (SOQL) stays for anything rows can't say.                                                                            |
| D55 | **Current user is a source**: any User field, plus Profile name and Role name. Visibility rules and lookup filters only; the mapping search keeps refusing it (it runs in the background as whoever submitted — usually the site guest).                                |
| D56 | **The linked record works for Forms too**: the record a Form is editing (`existingRecordId`). No authoring toggle — editing is already switched on by that viewer input (EXPLICIT_RECORD_CONTEXT, 2026-09-09).                                                          |
| D57 | **Custom logic accepts NOT**, and every query we build writes it as `(NOT (…))` — the only form Salesforce accepts after another condition (proven in `revclouddev` 2026-09-23). The Form Designer's specific logic messages are copied.                                |
| —   | **Answers are always bound values** (review bug). Nothing a respondent types is read as `$User.`, `$field.` or query text; fixed test-first in this work.                                                                                                               |

## Global constraints

- API **66.0**; org **`revclouddev`**; Contact-only test data.
- **Saved shapes only grow.** Visibility rules (`{action, logic, customLogic, rules[]}`) and lookup
  filters (`{logic, customLogic, rows[]}`) keep their shape. New things are additive: `user:<path>`
  and `record:<Rel>.<Field>` sources, `$User.<path>` lookup values, `NOT` in `customLogic`. Every
  rule saved today evaluates exactly as before; tests pin that.
- Lookup filters get **no answer comparisons** — comparing a lookup with another answer is dependent
  lookups, which the owner is rebuilding themselves (DO NOT resurrect v1).
- **Rules evaluate where they already do:** visibility in the browser (linked-record rows as
  server yes/no verdicts, never values); lookup filters and mapping search as one SOQL query each.
  Nothing becomes several queries per rule.
- **Current user values are the running user's own**, read once per page. The browser may use them
  only for visibility (display); anything that searches records reads them on the server itself.
- The typed clause is checked at publish as the author (`USER_MODE`), run in the background in
  `SYSTEM_MODE`, like rows today.
- Native first: `LightningModal` (already used by `finalPublishDialog`), `lightning-combobox`,
  `lightning-input`, `lightning-tabset`, `LightningConfirm`.
- CSS prefixes: `re-` (rule editor), `cm-` (conditions dialog), `cs-` (summary), `ms-` (typed box),
  `ma-` (mapping step).
- Copy: plain words, sentence case, no "please", no "successfully".
- One branch per slice → PR → merge; deploy + click through; uiux-flow-reviewer before merging the
  UI slices; site publish before any guest check.

## Decisions this plan makes — review these

1. **Three components, one job each.**
   - `c/finalRuleEditor` — rebuilt in place as the Form Designer–style row grid. Same `@api` inputs
     and the same `rulechange` event, so its callers barely change. It edits whatever `value` it is
     given; it never opens anything.
   - `c/finalConditionsModal` (new, `LightningModal`) — holds a **draft copy**, hosts the editor
     (and, for the mapping, the typed tab), and returns the result only on **Apply conditions**. Cancel returns
     nothing. So an unfinished edit can never reach the spec or publish.
   - `c/finalConditionsSummary` (new) — what each screen shows: the conditions **spelled out**, one
     per line, as the old Form Builder did (`propertyPanel.visibilityDisplay`), plus **Edit
     conditions** (decision 19). It opens the dialog and emits the applied value.
   - `c/finalFieldPicker` (new) — the searchable field chooser used in the Field column (decision
     20). Operators and other short lists stay ordinary `lightning-combobox`.
2. **Columns per screen.**

   | Screen                | Columns                                       | Source / Compare with offers                                                                                              |
   | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
   | Visibility rules      | Source · Question or field · Operator · Value | Source: **An answer** · **The linked record** (Surveys with a connected object, and Forms — D56) · **Current user** (D55) |
   | Lookup filter         | Field · Operator · Compare with · Value       | Compare with: **A fixed value** · **Current user** (not when the lookup allows anonymous search)                          |
   | Mapping search (rows) | Field · Operator · Compare with · Value       | Compare with: **A fixed value** · **An answer**                                                                           |

   The Field column on the lookup and mapping screens, and under "The linked record", lists the
   object's own fields and then related ones: "Account › Type" (D54). **Form Settings** from the
   Form Designer is not carried over: an author building one form already knows its layout and type,
   so a rule on it could never change.

3. **Problems show beside the control that needs fixing.** The button is **Apply conditions** (not
   "Save" — it doesn't save or publish the form). What counts as a problem: a row missing its
   field, operator or value; an answer that was removed or no longer fits; custom logic that fails
   the Form Designer's checks (copied from `visibilityEditor.validateCustomLogic`, with NOT —
   decision 17); in the Advanced (SOQL) tab, a `{name}` that isn't a question.
   - Each problem appears **under its own control** — the row's field, operator or value
     (`setCustomValidity` + `reportValidity` on the `lightning-*` input, or a `re-row-problem` line
     for the answer picker), the logic box, or the SOQL box.
   - A row shows its problems once it has been touched, or after an Apply attempt — a freshly
     added empty row isn't shouted at.
   - **Apply conditions stays clickable.** With problems, clicking it marks every problem, focuses
     the first one, and keeps the dialog open (the Form Designer's own `handleSave` pattern). The
     footer then says _"3 conditions need attention"_ with a **Go to first** link.
   - Lint warnings from `lintVisibility` still show, and don't block (as today).
4. **Mapping spec shape.** Rows stay in `match.filter`. The typed clause is `match.soql` (string),
   mode `match.filterMode: "soql"`. No `filterMode` = rows, so published mappings need no migration.
5. **Stored token = `{!<elementId>}`**, shown as `{<question label>}`. Display names are made
   collision-free (decision 6), so renaming a question never breaks a clause.
6. **Display names.** Build one map per dialog open, in form order: a question's label if no other
   name in the map equals it; otherwise `Label (2)`, `(3)`, … bumped until it equals **no** real label
   and no name already given. A token whose question is gone gets `removed question 1`, `2`, … (same
   bumping), each mapped to its own original id. Editing converts back through the same map, so a
   round trip preserves every id — including removed ones.
7. **An answer in a typed clause sits right after a field and a comparison** —
   `Email = {Your email}`. The parser keeps that field **and** that comparison with the token. The
   field tells the runtime how to convert a choice (label vs stored value — F2 decision 7). The
   comparison matters for `LIKE`: the answer is escaped (`\` → `\\`, `%` → `\%`, `_` → `\_`) so it
   matches as typed; a respondent's `%` is never a wildcard. Allowed: `=` `!=` `<>` `<` `<=` `>`
   `>=` `LIKE`.
8. **A typed clause may not contain** (outside quoted text): `;`, `$`, a `:` that starts a bind
   (`:name`, `: x`, `:(` — `LAST_N_DAYS:30` still works), or the words
   `SELECT FROM LIMIT OFFSET ORDER GROUP HAVING FOR WITH USING UPDATE TYPEOF ALL`. No sub-queries; a
   clause filters the step's own object (relationship paths like `Account.Type` are fine). Max
   4,000 characters.
9. **Answers in rows and in typed clauses are single values only.** An answer qualifies when its
   type is in the compatibility table for the field **and** it is not `Options` (several choices).
   Operators: Equals / Not equals / Contains / less / greater / At most / At least — and Contains
   only for text-like fields. The picker, the dialog and publish all apply the same three checks.
10. **Skippable answers in conditions warn, not block** — _"… which can be skipped. When it is, this
    step fails."_
11. **The token-bug fix leaves the shared compiler alone.** The mapping runtime passes each converted
    answer through the compiler's `answers` map under a private key (`$field.__m0`), so the compiler
    returns it as-is. Today it pastes the answer into `row.value`, where the compiler reads it again.
12. **Pre-fill (D52) runs only when the main search changes** — `setMatch` with a `field` or `source`
    patch, never a filter edit. It adds `field ← search answer` marked `prefilled`. It follows a later
    change of search answer while still `prefilled`; editing the row clears the mark. **Deleting** the
    pre-filled row sets `match.prefillDeclined = true`, and nothing re-adds it until the search
    **field** changes (which clears the flag).
13. **"Another record: … isn't a lookup field"** shows only while a row has no source.
14. **Related fields (D54), exactly like the Form Designer.** The Field list is the object's own
    fields, then, for each single-target lookup, its target's filterable fields labelled
    "Target › Field" and stored as `Rel.Field` (`Account.Type`). One level only. The describe comes
    from `FinalLookupController.describeLookupFields(object, relationshipName)`, which already
    supports this — one call per relationship, fetched **on demand** when the author opens that
    relationship in the searchable field picker, and cached for the session (decision 20). Every
    relationship is listed; none is capped away. Lookups that can point at several kinds of record
    (Task's Related To) are skipped, as today.
    _Supersedes rev 2's "own fields only" (owner reversed it after seeing the Form Designer)._
15. **Current user (D55).**
    - **Fields:** every User field the author can **read**, plus two named extras, **Profile name**
      (`Profile.Name`) and **Role name** (`UserRole.Name`). Listed as "Current user › Title".
      Described with `FinalLookupController.describeLookupFields('User', null)` — read-access based
      (`isAccessible`), with types. **Not** `FinalStudioController.describeFields`: that one refuses
      an object the author can't create and drops non-creatable fields, which is most of User.
      (`describeLookupFields` lists filterable fields only, so long text areas aren't offered — a
      rule comparing a long text area is rare, and the same list serves lookup filters, where
      filterable is required.)
    - **Visibility — in the browser.** Stored as `user:<path>` (`user:Profile.Name`,
      `user:Department`). The viewer collects every `user:` path in the spec; if there are any and
      the viewer isn't a guest, it reads them **once** with
      `@wire(getRecord, { recordId: '$userWireId', optionalFields: ['User.' + path, …] })`
      (`userWireId` stays `undefined` — the wire stays idle — when the form has no user rules).
      `optionalFields`, so a field this user can't read comes back missing and counts as blank
      instead of failing the whole read. Role is blank for users with no role.
    - **Types reach the viewer too.** The engine types comparisons through `ctx.getType(id)`, which
      today knows only questions — so a user **date** compared "greater than January 1" would fall
      through to number conversion and come out false. The viewer also wires
      `getObjectInfo({ objectApiName: USER_OBJECT })` (same idle-unless-needed id trick) and answers
      `getType('user:<path>')` from its `dataType` (Date → `date`, DateTime → `datetime`, numbers →
      `number`, Boolean → `checkbox`, else text; `Profile.Name` / `UserRole.Name` → text).
    - **Guests:** `@salesforce/user/isGuest` → no read at all, and user context is **unavailable**
      (decision 18) — not blank. The rule editor says so under a user row on a public form:
      _"People who aren't signed in have no user details, so this condition never counts as met
      for them."_
    - **Lookup filters — on the server.** Stored as `$User.<path>` in the row value.
      `FinalLookupService` keeps its four fast paths (Id, ProfileId, Email, Name) and resolves any
      other path by describe-checking it against User (`Profile.Name`, `UserRole.Name`, or a User
      field) and reading all such paths in **one** `SELECT … FROM User WHERE Id = :me` `WITH USER_MODE`
      per request. A guest request with a `$User.` row **blocks the filter** (no results) rather than
      searching with the site guest's values. The Studio hides Current user when the lookup's
      "anonymous search" switch is on.
    - **It's display, not security** — the help text says: _"Hides this for tidiness. Anyone
      determined can still see hidden questions in the page, so don't rely on it to keep things
      private."_ Hidden answers are already dropped on submit (PR #269).
    - **Mapping search:** unchanged — `$User` stays a publish blocker (F2 decision 4).
16. **The linked record for Forms (D56).** A Form's linked record is the record it is **editing**
    (`existingRecordId`), which is always the form's `targetObject`. A Form in create mode has no
    linked record, so its record context is **unavailable** (decision 18) — the same as a Survey
    opened without a record today, and the editor's existing hint covers it (worded for both
    types). Server guards
    stay: the record must be the form's object, and the person must be able to see it
    (`UserRecordAccess`). No authoring toggle is needed (EXPLICIT_RECORD_CONTEXT).
17. **NOT (D57).** Grammar everywhere: numbers, AND, OR, NOT, brackets; NOT binds tightest.
    Verified in `revclouddev` on 30 Contacts: `NOT Title = 'Zzz'` → 30 (**includes the 11 blank
    Titles**), `LastName != null AND NOT (…)` → _unexpected token: 'NOT'_, `LastName != null AND
(NOT (…))` → 23, `NOT NOT …` refused. So `FinalLookupLogic` emits every NOT as `(NOT (x))`. The
    browser engine treats a blank answer the same way (NOT equals on a blank is true), so the three
    screens agree. Advanced (SOQL): when Salesforce's error contains `unexpected token: 'NOT'`,
    publish adds _"Put NOT and what follows it in brackets: A AND (NOT B)."_ NOT never reaches past
    an **unavailable** context — decision 18.
18. **Unavailable context is not the same as blank.** Today a linked-record condition with no record
    is simply "false", which NOT would flip to true — so "Show when NOT (Record › Status = Closed)"
    would show its question in create mode. The policy:
    - **Unavailable** = the context isn't there: no linked record (create mode, Survey without a
      record link), the verdicts or user values are **still loading**, the read **failed**, or the
      viewer is a **guest** (user context). **Blank** = the record or user is there and the field is
      empty — a real value, and NOT works on it normally.
    - **Three-valued logic.** A condition on an unavailable context is **unknown** — not true, not
      false. Logic combines with the standard rules: `true OR unknown` = true, `false OR unknown` =
      unknown, `true AND unknown` = unknown, `false AND unknown` = false, `NOT unknown` = unknown.
      At the end, **unknown counts as not met**, and then `action` applies — so a show-rule stays
      hidden and a hide-rule doesn't hide, as the editor's hints already promise.
    - **Why this and not "any unavailable condition fails the whole rule":** for every rule that can
      exist today (AND / OR / brackets, no NOT), three-valued logic with unknown → not met gives
      **exactly** the result of today's "unavailable condition = false" — such formulas can only
      get truer as a condition goes from false to true, so "true under every completion" equals
      "true with unknown as false". "Answer = Yes OR Record › Title = Manager" still shows on Yes
      with no record. NOT is the only thing that can tell the two apart, and NOT is new. **No
      published rule changes; no versioning is needed.** Task 14 pins it with a table test.
    - The same evaluation decides validation `when` gates (unknown → the gate doesn't apply).
    - Engine contract: `ctx.isAvailable('record' | 'user')` → boolean. **Record** is available when
      `_ruleFacts` has arrived for the current context and the read didn't fail. **User** is
      available only when **both** the user values **and** the User type metadata have arrived and
      neither failed, and the viewer isn't a guest (decision 15 — values without types would compare
      dates as numbers). Answers are always available.
    - `evaluateCustomLogic` keeps its public contract (`null` = malformed) for today's callers; the
      three-valued version is a separate internal function whose "unknown" is a distinct value, so
      "malformed" and "unknown" can never be confused.
19. **Summaries spell the conditions out** (the old Form Builder's `visibilityDisplay`, improved):

    ```
    VISIBILITY RULES
    SHOW WHEN CUSTOM LOGIC IS MET:
    1  Account › Industry equals "Technology"
    2  Current user › Profile name equals "Admin"
    3  Contact email is blank
    Logic: 1 AND (2 OR 3)
    [Edit conditions]
    ```

    - One line per condition, **numbered** so the logic line means something; **labels, not API
      names** (the old one showed `AssetId`); operators in words; the value quoted; answers as
      `the answer to "Your email"`; user fields as `Current user › Role name`.
    - Heading by logic: _Show when ALL are met_ / _ANY is met_ / _custom logic is met_ (and _Hide
      when …_ for hide rules; _Only records where …_ on lookup and mapping screens).
    - More than 5 conditions: the first 5, then _"+ 3 more"_. The logic line always shows.
    - Advanced (SOQL): _"Advanced (SOQL):"_ and the clause in its display form (`{Your email}`), up
      to 3 lines, then an ellipsis.
    - Style from the old panel: each line a light block with a 2px brand-colour left border
      (`cs-rule`), the heading in small caps.

20. **A searchable field picker, with related fields on demand.** `lightning-combobox` has no
    type-to-search, so a list of own fields plus every related field would be a long scroll.
    - `c/finalFieldPicker` reuses `finalObjectPicker`'s type-to-search behaviour (the picker Data
      mode already uses for objects: type to filter, arrows move, Enter picks, Escape closes). The
      shared part moves into `c/finalTypeahead`; `finalObjectPicker` becomes a thin wrapper around it,
      with its public API unchanged.
    - **Matches** label, API name, or relationship name. Each option shows the label
      (`Account › Industry`) and the API path underneath in small grey text (`Account.Industry`).
    - **Related fields load on demand, and every relationship is reachable** — no cap. The list shows
      own fields, then one entry per single-target lookup: _"Account ›"_. Choosing it (or pressing
      → on it) loads that object's fields with `describeLookupFields(object, relationship)` and shows
      them in place; _"‹ Back"_ returns. Typing a relationship's name surfaces its entry.
    - **Cached for the editing session**, in one module-level map keyed by object + relationship, so
      reopening the dialog or another row never re-fetches.
    - Once a relationship's fields are loaded, typing matches them too (so "Industry" finds
      "Account › Industry"). Before that, a line under the results says _"Fields on related records
      appear when you open them (›)."_
21. **Advanced (SOQL) gives feedback while you look at it, and switching is free.**
    - The tab is named **Advanced (SOQL)** — SOQL is Salesforce's query language, and the name says
      what you're opening.
    - **Check conditions** button under the box runs the **same server check publish runs** (Task 9)
      and shows the result right there: _"These conditions run."_ or the problems. It's a new
      `@AuraEnabled FinalMappingController.checkConditions(specJson, actionId, soql)` that calls the
      validator's typed-clause path for that one step, as the author (`USER_MODE`), and returns its
      diagnostics. Nothing is saved.
    - **Both drafts are kept** while you switch tabs. Switching never asks.
    - An **inline notice** on the open tab, only when the other tab has content: _"Applying uses
      Advanced (SOQL). The 2 conditions you built will be removed."_ (and the mirror).
    - **Apply conditions confirms the replacement** — the one question, asked once, only when
      something would be discarded (`LightningConfirm`: _"Replace the 2 built conditions with the
      Advanced (SOQL) conditions?"_).
22. **Choosing an answer is explicit.** Picking _An answer_ in Compare with sets the value to empty,
    shows a _"Choose a question…"_ picker and moves focus to it. Compatibility narrows the list; it
    never picks for the author. Until a question is chosen, the row has a problem (decision 3). A
    saved answer that no longer qualifies says why:
    - the question is gone → _"Question removed."_
    - the question exists but its type no longer fits this field → _"Question type is incompatible."_
    - it can't be used with this comparison → _"This question can't be used with this comparison."_

## File map

**Create**

| Path (under `force-app/main/default/`) | Responsibility                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `lwc/finalConditionsModal/` (+test)    | the dialog: draft, Apply gate, Clear all, Conditions / Advanced (SOQL) tabs |
| `lwc/finalConditionsSummary/` (+test)  | conditions spelled out, numbered + Edit conditions (decision 19)            |
| `lwc/finalMappingSoql/` (+test)        | the Advanced (SOQL) tab: textarea, Insert answer, display-name mapping      |
| `classes/FinalMappingSoql.cls` (+Test) | parse a typed clause: guards, tokens → binds, no DML                        |
| `lwc/finalTypeahead/` (+test)          | the shared type-to-search list, moved out of `finalObjectPicker`            |
| `lwc/finalFieldPicker/` (+test)        | searchable fields, related fields on demand, session cache (decision 20)    |

**Modify**

| Path                                                 | Change                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lwc/finalRuleEditor/` (+test)                       | rebuilt as the columned grid; `columns` mode; opt-in answer comparisons               |
| `lwc/finalPropertyPanel/` (+test)                    | Visibility group: summary + dialog instead of the inline editor                       |
| `lwc/finalLookupFilter/` (+test)                     | conditions: summary + dialog; `answerChoices` / `allowTyped` pass-through             |
| `lwc/finalObjectPicker/` (+test)                     | becomes a thin wrapper over `finalTypeahead`; public API unchanged                    |
| `classes/FinalMappingController.cls` (+Test)         | `checkConditions` — the publish check for one step's Advanced (SOQL), on demand       |
| `lwc/finalMappingModel/` (+test)                     | `setFilterMode`, `setSoql`, pre-fill rules, index + state for filters                 |
| `lwc/finalMappingAction/` (+test)                    | branch layout, answer choices, `why` fix                                              |
| `classes/FinalMappingService.cls` (+Test)            | token fix; typed clause at runtime; query errors named per step                       |
| `classes/FinalMappingValidator.cls` (+Test)          | row answers checked; typed clause parsed and test-run as the author                   |
| `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md` | D49–D57, §4 shape, §5.2 layout, §7 blockers                                           |
| `lwc/finalExpressionEngine/` (+test)                 | NOT in `evaluateCustomLogic`; `validateCustomLogic` (Form Designer messages) exported |
| `lwc/finalFormViewer/` (+test)                       | `user:` values via one `getRecord`; linked-record verdicts for Forms                  |
| `lwc/finalFormStudio/` (+test)                       | record sources for Forms; user sources + related-field describes                      |
| `classes/FinalLookupLogic.cls` (+Test)               | NOT, always emitted as `(NOT (…))`                                                    |
| `classes/FinalLookupService.cls` (+Test)             | `$User.<any path>` read once server-side; guests blocked                              |
| `classes/FinalSurveyObjectController.cls` (+Test)    | `getRecordContext` accepts Forms; verdicts follow `Rel.Field` paths                   |
| `classes/FinalGuestContextService.cls` (+Test)       | same path-following for guest links; Forms if the link path reaches them              |
| `docs/FinalDesign/specs/EXPLICIT_RECORD_CONTEXT.md`  | linked-record rules for Forms (D56)                                                   |

## Slice order

| Order | Slice | Tasks | Why here                                                                |
| ----- | ----- | ----- | ----------------------------------------------------------------------- |
| 1     | S1    | 1–2   | rulings, then the bug fix — later slices send more answers into search  |
| 2     | S2    | 3–5   | the new editor + dialog, on all three screens, same saved shapes        |
| 3     | S2b   | 14–18 | the sources: related fields, NOT, Current user, linked record for Forms |
| 4     | S3    | 6–7   | answers in mapping rows: publish check, then the Compare with column    |
| 5     | S4    | 8–11  | the typed clause: parser, publish, runtime, Advanced (SOQL)             |
| 6     | S5    | 12    | the mapping step as branches; pre-fill; small fixes                     |
| 7     | S6    | 13    | org walkthrough, signed in and as a guest                               |

---

## S1 — Rulings and the bug fix

### Task 1: Spec rulings

**Files:** `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md`

- [ ] Add D49–D57 to §2 (dated 2026-09-23), worded as above; D54–D57 also in the visibility-rules spec.
- [ ] §4: `filterMode`, `soql`, `prefillDeclined`, `fields[].prefilled` in the `match` example;
      new §4.6 "The typed clause" (decisions 5–8).
- [ ] §5.2: the branch layout from Task 12 and the summary + dialog from Task 4.
- [ ] §7: blockers and warnings from Tasks 6 and 9.
- [ ] §10: strike "Keeping the match answer and the saved value in step"; point at D52.
- [ ] Branch `docs/f2-search-rulings`, PR, merge.

### Task 2: Answers are always bound values

**Files:** `classes/FinalMappingService.cls`, `classes/FinalMappingServiceTest.cls`

- [ ] **Failing tests first:**
  - `rowAnswerIsNeverReadAsAToken` — find-or-create Contact on Email; filter row
    `LastName eq $field.<surname>`; the surname answer is `$User.Name`; a Contact exists with
    LastName `$User.Name` and the matching email. Expect **found**, status Done, no new Contact.
    Today the compiler swaps in the running user's full name and creates a duplicate.
    (`$User.Name`: the compiler resolves only Id, ProfileId, Email and Name.)
  - `rowAnswerThatLooksLikeAFieldTokenIsLiteral` — answer `$field.x`; expect the literal matched.
    Today the step fails with "A filter condition has no value yet".
- [ ] Run; both fail.
- [ ] `resolvedFilter` returns a private `Resolved { Object filter; Map<String,Object> answers; }`.
      For a single-value row whose token converts to non-null:
      `key = '__m' + answers.size(); answers.put(key, converted); row.put('value', '$field.' + key);`.
      A token that converts to nothing stays as it was (the compiler blocks; the step fails —
      unchanged). `values` lists unchanged. `findOne` passes `r.answers` to `compile`.
- [ ] Both pass; run `FinalMappingServiceTest` and `FinalLookupServiceTest` in full.
- [ ] Deploy; branch `fix/f2-answers-bound`, PR, merge.

---

## S2 — The condition editor, Form Designer style

### Task 3: `finalRuleEditor` rebuilt as a grid

**Files:** `lwc/finalRuleEditor/finalRuleEditor.{html,js,css}`, `__tests__/finalRuleEditor.test.js`

Copy the Form Designer's structure (`visibilityEditor.html` / `.css`) — technique, not its code
paths: a header row shown once, one grid row per condition, `lightning-combobox` /
`lightning-input` with `variant="label-hidden"`, a numbered first column, a bare delete icon, and
**Add condition** (`lightning-button`, variant base, `utility:add`) under the rows.

- New `@api columns` — `'visibility'` (default), `'lookup'`, `'mapping'` — picks the column set in
  decision 2. `forRecords` is removed (its only caller, `finalLookupFilter`, switches to `columns`).
- Top: `lightning-combobox` "Show when" / "Search records where" with _All conditions are met (AND)_,
  _Any condition is met (OR)_, _Custom logic_. Custom logic: `lightning-input` with
  `field-level-help` "Refer to each condition by its number. Use AND, OR and brackets." and, under
  it, the inline problem (`re-logic-problem`, `role="status"`) from decision 3.
- Grid: `grid-template-columns: 1.25rem repeat(N, minmax(0, 1fr)) auto` where N is 3 or 4; below
  36rem of container width the Value cell wraps under the row (`container-type: inline-size` on the
  root, with `width: 100%` — the flex-collapse gotcha).
- Visibility **Source** column: "An answer" / "The linked record" (the latter only when
  `recordSources.length`). Picking a source resets Field, Operator, Value.
- The **Field / Question or field** column is `c-final-field-picker` (decision 20, built in Task 15;
  until then it takes a flat list). Operator stays a `lightning-combobox`.
- Value controls keep today's typing rules (`VALUE_KIND`, `canDisplay`, operator lists by subtype),
  rendered as `lightning-input` type number / date / datetime / text, or a Yes/No
  `lightning-combobox`.
- The "(not valid here)" preservation for saved operators and values stays.
- `@api get problems()` → `[{ rowIndex, control: 'field'|'operator'|'value'|'answer'|'logic', message }]`
  (decision 3). `@api reportProblems()` marks every one on its control and returns the first;
  `@api focusProblem(i)` focuses a problem's control. Rows track `touched` so a new empty row
  shows nothing until it's been used or Apply was tried.
- Lint (`lintVisibility`) and the record hint render under the grid exactly as now.
- Mapping-only pieces (the Compare with column) arrive in Task 7; with `columns="mapping"` before
  then it renders as `lookup`.

- [ ] Jest: every existing behaviour test ported to the new markup (operators by subtype, value
      typing, "(not valid here)", lint, record hint, custom logic); header row once; column sets per
      mode; Source switch resets the row; `problems` for missing field/operator/value, bad custom
      logic (`1 AND (2 OR 3)` over one row) and clean for `1`; a new empty row shows no error until
      touched; `reportProblems()` puts each message under its own control and returns the first.

### Task 4: The dialog and the summary

**Files:** `lwc/finalConditionsModal/*`, `lwc/finalConditionsSummary/*` (+ tests)

**`finalConditionsModal extends LightningModal`** — opened with
`FinalConditionsModal.open({ size: 'medium', label, description, columns, value, sources,
recordSources, sourceIndex, hostRepeatSectionId, noun, extraOperators, answerChoices, allowTyped,
typedValue, questions })`.

- Header: `label` ("Visibility — Account description", "Filter — Account lookup",
  "Find an existing Contact") and `description` ("Show this field only when the conditions below are
  met." / "Only records that meet these conditions can be picked." / "Only Contacts that meet these
  conditions are searched.").
- Body: `c-final-rule-editor` bound to a **draft** (deep copy of `value`). When `allowTyped`, a
  `lightning-tabset` "Conditions" / "Advanced (SOQL)" around it (Task 11).
- Footer (left to right, as the Form Designer): **Clear all** (empties the draft, stays open),
  **Cancel** (`close()` → `undefined`), **Apply conditions** (brand; decision 3). Apply with no
  problems → `close({ value, typed })` (after the replacement question in decision 21, if any).
  Apply with problems → `reportProblems()`, focus the first, and show `cm-attention`:
  _"3 conditions need attention"_ + **Go to first** (a base `lightning-button` calling
  `focusProblem(0)`). The count updates as problems are fixed and the line disappears at zero.
- Nothing the dialog does touches the spec until Apply.

**`finalConditionsSummary`** — `@api` the same inputs plus `objectLabel` (for "Only records where").
Renders decision 19's spelled-out list and a `lightning-button` **Edit conditions** (or **Add
conditions** when there are none; _"Always shown"_ / _"No conditions"_ above it). On click:
`open(...)`; on a result, emits `conditionschange { value, typed }`.

- Condition text comes from one exported pure function, `describeCondition(rule, labels)` in
  `finalConditionsSummary.js` — `labels` maps ids and paths to labels (the same `sources` the
  dialog gets) — so the summary and any future screen word conditions the same way.
- Operators in words, matching the editor's operator labels (`equals`, `does not equal`,
  `contains`, `is greater than`, `is at most`, `is one of`, `is blank`, …); values quoted; list
  values joined with commas; `$field.x` → `the answer to "Q"`; `$User.x` → `Current user › Label`;
  a missing label falls back to the API path rather than blank.

- [ ] Jest (the publish dialog's tests show how to mock `LightningModal.open`): Apply returns the
      draft; Cancel returns nothing and the summary emits nothing; Clear all empties only the draft;
      Apply with 3 problems keeps the dialog open, focuses the first, shows "3 conditions need
      attention", and Go to first refocuses it; the count drops as rows are fixed. Summary: every
      heading variant (all / any / custom / hide / lookup / mapping / Advanced (SOQL)); numbering;
      labels not API names; `+ 3 more` after 5; answers, user and related fields worded;
      `describeCondition` for every operator.

### Task 5: The three screens switch over

**Files:** `lwc/finalPropertyPanel/*`, `lwc/finalLookupFilter/*` (+ tests)

- **finalPropertyPanel** — the Visibility group renders `c-final-conditions-summary` with
  `columns="visibility"` and today's inputs (`ruleSources`, `recordRuleSources`, `ruleIndex`,
  `hostRepeatSectionId`, `ruleNoun`); `conditionschange` feeds the existing `handleRuleChange`
  (same value shape, so nothing downstream changes).
- **finalLookupFilter** — the conditions area becomes `c-final-conditions-summary`
  `columns={conditionColumns}` (`'lookup'`, or `'mapping'` when `filterOnly`), translating to and
  from the rule editor's vocabulary exactly as today (`ruleValue`, `_toRow`). New pass-throughs:
  `@api answerChoices = []`, `@api allowTyped = false`, `@api typedValue`, `@api questions = []`;
  the event gains `typed` (Task 11).
- [ ] Jest: panel and lookup filter tests updated to open-and-save through the mocked dialog;
      saved shapes identical to before for the same edits.
- [ ] Deploy; click through visibility on a question, a section and a page, and a lookup filter, in
      `/apex/FinalStudio`. Publish a form with each and confirm the runtime behaves as before.
- [ ] uiux-flow-reviewer pass; branch `feat/conditions-editor`, PR, merge.

---

## S2b — The sources (runs third, after S2)

### Task 14: NOT, and the Form Designer's logic messages

**Files:** `lwc/finalExpressionEngine/*`, `classes/FinalLookupLogic.cls` (+ tests), `lwc/finalRuleEditor/*`

- [ ] **Pin today first:** tests that every logic string accepted today (`1`, `1 AND 2`,
      `1 AND (2 OR 3)`, `(1 OR 2) AND 3`) gives the same result in both evaluators after the change.
- [ ] `finalExpressionEngine`: `evaluateCustomLogic` learns `NOT` (unary, binds tighter than AND);
      new exported `validateCustomLogic(expr, count)` → `null` or a sentence, ported from
      `visibilityEditor.validateCustomLogic` / `checkSyntax`: _"Condition 3 doesn't exist — you have 1
      condition."_, _"Only condition numbers, AND, OR, NOT and brackets are allowed."_,
      _"Unbalanced brackets."_, _"Unexpected "OR" in the logic."_, _"Condition 2 has no field.
      Complete every condition to use custom logic."_
- [ ] `FinalLookupLogic`: tokenizer and parser accept `NOT`; output wraps it as `(NOT (x))`.
      Apex test builds the WHERE for `1 AND NOT 2` and **runs it** against Contacts (the proven
      forms from decision 17), plus `NOT (1 OR 2)`, `NOT NOT 1` → `(NOT ((NOT (x))))` runs.
- [ ] `finalRuleEditor` uses `validateCustomLogic` for its inline problem and the Apply gate.
- [ ] Both runtimes agree: a shared table of 12 expressions × answer patterns run through JS
      and Apex (Apex via the compiled WHERE against fixture Contacts) gives identical results.

### Task 15: Related fields in the Field list (D54)

**Files:** `lwc/finalTypeahead/*` (new), `lwc/finalFieldPicker/*` (new), `lwc/finalObjectPicker/*`,
`lwc/finalLookupFilter/*`, `lwc/finalFormStudio/*`, `lwc/finalRuleEditor/*`,
`classes/FinalSurveyObjectController.cls`, `classes/FinalGuestContextService.cls` (+ tests)

- [ ] **`finalTypeahead`** — move `finalObjectPicker`'s search box, matching, result list and keys
      (↑ ↓ Enter Escape) into it, generalised to `items: [{ value, label, meta, searchText, kind }]`
      (`meta` = the small grey second line; `kind: 'group'` = a "Account ›" entry). Emits `pick` and
      `open-group`. `finalObjectPicker` keeps its `@api` and events and renders `c-final-typeahead`;
      its existing tests pass unchanged.
- [ ] **`finalFieldPicker`** — `@api objectApi`, `@api prefix` (`''`, `record:` or `user:`),
      `@api value`, `@api extraItems` (Profile name / Role name for users). Loads
      `describeLookupFields(objectApi, null)` → own fields (`meta` = API name) + one group entry per
      single-target relationship (`Account ›`, `meta` = `Account → Account`). Picking a group, or →
      on it, calls `describeLookupFields(objectApi, rel)` and shows `‹ Back` + that object's fields
      as `Account › Industry` (`meta` = `Account.Industry`). **No cap** — every relationship is
      listed. Search matches label, API name and relationship name; fields of opened relationships
      join the search. Hint under the results until a relationship is opened: _"Fields on related
      records appear when you open them (›)."_ Emits `fieldchange { value: prefix + path, label, type }`.
- [ ] **Session cache** — a module-level `Map` in `finalFieldPicker.js` keyed
      `objectApi|relationship` holding the describe promise, shared by every picker instance, so
      reopening the dialog or another row never re-fetches. Failed reads are dropped from the cache
      so a retry can succeed.
- [ ] **Where it's used:** the lookup and mapping Field column (`prefix ''`), visibility's linked
      record (`record:`, object = the form's object), visibility's Current user and the lookup's
      Compare with → Current user (`user:` / `$User.`, object `User`, extra items Profile name and
      Role name). A saved path whose relationship hasn't been opened yet still shows its label: the
      picker opens that one relationship on load.
- [ ] Jest: typing matches label / API / relationship; group opens and Back returns; keyboard; a
      second picker on the same object makes no second server call; a failed load retries; a saved
      `Account.Industry` value shows "Account › Industry" on open; `finalObjectPicker` tests unchanged.
- [ ] **Server verdicts follow paths.** `FinalSurveyObjectController.ruleFacts` and
      `FinalGuestContextService` resolve each `record:` path with `FinalLookupService.fieldAt`
      (unknown → the row is false, as an unknown field is today), SELECT the path as written
      (`Account.Type`), and read it with `rec.getSObject('Account')?.get('Type')`. Still one query,
      spec-declared paths only, verdicts only. Tests: own field, related field, related record
      absent (null lookup → blank), unknown path.
- [ ] Mapping validator + runtime need nothing: `fieldAt` and `compile` already take paths (tests
      pin it: a row on `ReportsTo.LastName` publishes and finds).

### Task 16: Current user (D55)

**Files:** `lwc/finalFormStudio/*`, `lwc/finalRuleEditor/*`, `lwc/finalFormViewer/*`,
`lwc/finalLookupFilter/*`, `classes/FinalLookupService.cls` (+ tests)

- [ ] **Studio sources:** `describeLookupFields({ objectApiName: 'User', relationshipName: null })`
      once per Studio session (decision 15 — read access, not create) → Current user fields
      `user:<path>` plus `user:Profile.Name` ("Profile name") and `user:UserRole.Name`
      ("Role name"), both typed text. They join `ruleIndexMap` with their types,
      so operators and lint type them like any field.
- [ ] **Rule editor:** visibility Source gains **Current user**; lookup Compare with gains
      **Current user** (a field picker whose value is `$User.<path>`), not offered when
      `allowGuest` is on. The public-form note under user rows (decision 15).
- [ ] **Viewer:** `get userPaths()` collects `user:` sources across page/section/element visibility
      and validation `when` gates (same walk as `specHasRecordRules`). `userWireId = isGuest ||
!userPaths.length ? undefined : currentUserId`. `@wire(getRecord, { recordId: '$userWireId',
optionalFields: '$userFieldNames' })` → `_userValues` (reassigned, never mutated, so
      visibility getters recompute). `getValue` returns `_userValues[path]` for `user:` ids (a
      field missing from an `optionalFields` reply is **blank** — the user is there, the value
      isn't readable). `getObjectInfo(User)` feeds `getType` for `user:` ids (decision 15).
      Readiness is one state, `_userCtx = 'idle' | 'loading' | 'ready' | 'failed'`: `ready` only
      when **both** wires have delivered data; either wire's error → `failed` (and it stays failed
      until the context changes). `isAvailable('user')` is true only in `ready` (decision 18).
- [ ] **Lookup server:** `FinalLookupService.userValue` keeps its four fast paths; any other path is
      checked against User describe (or is `Profile.Name` / `UserRole.Name`), all such paths in a
      compile are read in one `SELECT … FROM User WHERE Id = :me WITH USER_MODE`. Guest running user + any `$User.` row → `blocked = true`, reason _"This filter needs a signed-in person."_
- [ ] **Engine (decision 18):** each `record:` / `user:` condition whose context is unavailable
      evaluates to **unknown**; ALL / ANY / custom logic (with NOT) combine three-valued; the result
      maps unknown → not met, then `action`. A ctx without `isAvailable` keeps today's behaviour
      exactly (record rows without facts are false).
- [ ] **Compatibility table test (Task 14 file):** for every NOT-free expression shape in the
      suite × every true/false/unavailable assignment, the new evaluator equals today's evaluator
      run with unavailable = false — including "Answer = Yes OR Record › Title = Manager" with no
      record (shown) and the same as a hide-rule (hidden).
- [ ] Tests: viewer makes no read when there are no user rules or the viewer is a guest; a
      `Profile.Name equals` rule shows/hides; a user **date** field "greater than 2026-01-01" and a
      **datetime** "less than" compare as dates (fails today without the runtime type); a user
      **number** and **checkbox** field; a missing optional field is blank and `NOT (x = 'a')` is
      met on it; for a guest, `NOT (Profile name = Partner)` is **not** met (unavailable), while
      `Answer = Yes OR NOT (Profile name = Partner)` **is** met on Yes; while the user read is
      loading and after it fails, a show-rule with NOT stays hidden; **readiness in both orders**
      (values then types, types then values) — a user-date rule is only evaluated once both are in;
      **metadata failure** with values present → unavailable, not a number comparison; lookup filter on
      `$User.UserRole.Name` returns the right rows; guest request blocked; a `$User.` path that isn't
      a User field is blocked, not queried.

### Task 17: The linked record for Forms (D56)

**Files:** `lwc/finalFormStudio/*`, `lwc/finalFormViewer/*`,
`classes/FinalSurveyObjectController.cls`, `classes/FinalGuestController.cls` /
`FinalGuestContextService.cls` (+ tests), `docs/FinalDesign/specs/EXPLICIT_RECORD_CONTEXT.md`

- [ ] **Studio:** `recordRuleSources` returns fields when `isSurvey && objectApi` **or** the form
      is an ordinary Form with a `targetObject`. The rule editor's hint is reworded for both:
      _"Linked-record rules work when the form opens with a record — a Survey's record link, or the
      record a Form is editing. Without one, this is hidden."_ (and the hide-rule variant).
- [ ] **Viewer:** when a Form has a resolved edit target (`existingRecordId`) and
      `specHasRecordRules(spec)`, call `getRecordContext` for **verdicts only** (the Form's values
      already load through the edit path). Same exclusions as edit mode: never under `authoring`,
      `preservePreview` or `delegateSubmit`.
- [ ] **Server:** `load()` accepts `form.type` `survey` (as today) or an ordinary form; `prefill`
      stays survey-only; errors reworded neutrally ("This form has no connected object."). The
      object check and `UserRecordAccess` gate are unchanged.
- [ ] **Guest links:** trace whether a Form's personal link reaches `FinalGuestContextService`
      verdicts today (Forms' links fill answers — "links work for everyone", 2026-09-15). If record
      rules are survey-only there, extend them the same way; if the Form link path has no record
      read at all, stop and report before building.
- [ ] Tests: a Form editing a Contact shows a question only when `record:Title` equals X; the same
      Form in create mode hides it; **"Show when NOT (Title = X)" stays hidden in create mode, while
      verdicts are loading, and after `getRecordContext` fails** — and shows on a record whose Title
      is blank (blank ≠ unavailable); a hide-rule with NOT in create mode doesn't hide; a validation
      `when` gate with a record condition doesn't apply in create mode; a record of the wrong object
      is refused; a user without access
      to the record gets "Record not found."; Surveys unchanged.
- [ ] EXPLICIT_RECORD_CONTEXT: a "Linked-record rules" section for Forms.

### Task 18: Ship S2b

- [ ] Deploy; click through in `/apex/FinalStudio` and on `Final_P0_Test`
      (`/lightning/n/Final_P0_Test?c__formId=…&c__existingRecordId=…`): a NOT rule, a related-field
      rule, a Profile-name rule, a Role-name rule, a Form-linked-record rule.
- [ ] uiux-flow-reviewer pass; branch `feat/conditions-sources`, PR, merge.

---

## S3 — Answers in mapping rows

### Task 6: Publish checks row answers

**Files:** `classes/FinalMappingValidator.cls`, `classes/FinalMappingValidatorTest.cls`

In `checkMatch` (rows mode), for each token in a row's `value` **or** `values`:

| Condition                                                                                                                | Result                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| no such question                                                                                                         | blocker: _"Step N (Contact)'s filter uses a question that's no longer on the form."_ |
| matrix / ranking / file, or answer type `Options`                                                                        | blocker: _"… "Q" can hold more than one value, so a filter can't compare with it."_  |
| `fieldAt` resolves and `isCompatible(answerType, field type)` is false                                                   | blocker: _"… the answer to "Q" can't be compared with Field."_                       |
| operator is `like` and the field isn't text-like; or a list operator (`in`, `nin`, `includes`, `excludes`) holds a token | blocker: _"… "Q" can't be used with that comparison."_                               |
| question is skippable                                                                                                    | warning: _"… filters using "Q", which can be skipped. When it is, this step fails."_ |

- [ ] One test per row, plus "a compatible, required, single answer produces nothing".
- [ ] Deploy; run validator + `FinalPublishWarningsTest`.

### Task 7: The Compare with column

**Files:** `lwc/finalRuleEditor/*`, `lwc/finalMappingAction/*` (+ tests)

**finalRuleEditor** — `@api answerChoices = []` (never null). Two separate gates:

- **Reading** saved answers: `get answersOn() { return this.columns === 'mapping'; }`. On the
  mapping screen a `$field.` value is **always** an answer — even when no eligible question is left —
  so a removed question still shows "(question removed)" and still needs fixing before Apply. On every other screen
  `$field.` is plain text, as today (visibility rules and lookups untouched).
- **Offering** a new answer: "An answer" appears in Compare with only when `answersOn` and the row
  has at least one fitting choice (below). No choices → the row can still hold and show an old token;
  it just can't pick a new one.

When `answersOn`, per row:

- `fieldType = (this.sources.find((s) => s.id === rule.source) || {}).type`
- `fitting = answerChoices.filter((a) => a.fits.includes(fieldType))` — `answerChoices` arrive
  already stripped of `Options` answers (decision 9).
- `operatorAllowsAnswer = SCALAR_OPS.has(rule.operator) && (rule.operator !== 'contains' || TEXTLIKE.has(fieldType))`
  where `SCALAR_OPS = equals, notEquals, contains, greaterThan, lessThan, lte, gte`.
- **Compare with** cell: `lightning-combobox` "A fixed value" / "An answer" — "An answer" offered
  only when `fitting.length && operatorAllowsAnswer`.
- **Value** cell: the typed control, or a question `lightning-combobox` (value `$field.<key>`,
  placeholder _"Choose a question…"_), so opening never rewrites a rule. A saved key that isn't in
  `fitting` stays selected as an extra option labelled by why (decision 22): _"(Question removed)"_
  when no question on the form has that id, _"(Question type is incompatible)"_ when it exists but
  its type doesn't fit this field, _"(Can't be used with this comparison)"_ when only the operator
  rules it out.
- Choosing **An answer** in Compare with sets the value to `''` and moves focus to the _Choose a
  question…_ picker — nothing is chosen for the author (decision 22). → **A fixed value** sets `''`.
  Changing the operator or field so a chosen answer no longer qualifies keeps it, marked with the
  reason above, rather than clearing it silently.
- `problems` adds, on the row's `answer` control: _"Choose a question."_ (empty), or the reason
  sentence from decision 22.

**finalMappingAction** — `get filterAnswerChoices()`: questions with `q.mappable` and
`q.answerType !== 'Options'`, `fits = (compatibility[q.answerType] || []).map((t) => t.toLowerCase())`.
Passed to `c-final-lookup-filter answer-choices`.

- [ ] Jest: gate off → no Compare with column and `$field.x` renders as plain text (visibility
      regression test); gate on → only fitting, single-value answers; Contains offers answers only
      for text fields; Is one of offers none; choosing An answer leaves the value empty, focuses the
      question picker and reports "Choose a question." until one is picked; an operator change that
      rules a chosen answer out keeps it and marks "(Can't be used with this comparison)"; a removed
      question shows "(Question removed)" untouched; a question whose type changed shows
      "(Question type is incompatible)"; `Options` questions never listed; **with
      `answerChoices = []` on the mapping screen, a saved `$field.el_gone` still shows
      "(Question removed)", offers no "An answer" for new rows, and stops Apply.**
- [ ] Deploy; branch `feat/f2-row-answers`, PR, merge.

---

## S4 — The typed WHERE clause

### Task 8: `FinalMappingSoql` — the parser

**Files:** `classes/FinalMappingSoql.cls`, `classes/FinalMappingSoqlTest.cls`

Pure: no queries, no DML, no describe.

```apex
public with sharing class FinalMappingSoql {
    public static final Integer MAX_LENGTH = 4000;

    public class Token {
        public String elementId;   // from {!el_x}
        public String fieldPath;   // the field before the comparison
        public String operator;    // '=', '!=', '<>', '<', '<=', '>', '>=', 'LIKE' (upper-cased)
        public String bindName;    // m0, m1, …
    }

    public class Parsed {
        public String whereClause;                 // tokens replaced by :m0, :m1 …
        public List<Token> tokens = new List<Token>();
        public String problem;                     // null when usable
    }

    public static Parsed parse(String clause) { … }

    /** For LIKE: the answer matches as typed (decision 7). */
    public static String escapeLike(String s) {
        return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
    }
}
```

Rules, first failure wins:

1. Blank → _"Write the search, or go back to Conditions."_
2. Over 4,000 → _"Keep the conditions under 4,000 characters."_
3. One pass, tracking `'…'` with `\'` escapes. Outside quotes:
   - `;` → _"Remove the semicolon — this box takes one set of conditions."_
   - `$` → _"Values like $User can't be used here. Insert an answer instead."_
   - `:` followed by a letter, `_`, `(` or whitespace → _"Use Insert answer instead of a : value."_
   - a banned word (decision 8), whole word, any case → _"LIMIT can't be used here — this box takes
     only the conditions after WHERE."_ (naming the word as typed)
   - `{!` `[A-Za-z0-9_]+` `}` → a token; the trimmed text before it must end `<path> <op>`
     (path `[A-Za-z_][A-Za-z0-9_.]*`, op from decision 7, case-insensitive `LIKE`), else
     _"Put each answer right after a field and a comparison, like Email = {Your email}."_
   - any other `{` or `}` → _"There's no question called "…". Use Insert answer."_ (the text
     between the braces). The dialog already stops Apply on these (Task 11); this refuses one that
     arrives in an imported or hand-edited spec.
4. Unclosed quote → _"A quoted value isn't closed."_
5. Unbalanced brackets outside quotes → _"The brackets don't match."_

- [ ] One test per rule, plus: two tokens → `m0`, `m1`; a token inside quotes stays text;
      `LAST_N_DAYS:30` passes; `Name LIKE {!el_a}` → fieldPath `Name`, operator `LIKE`;
      `Account.Type = {!el_a}` → `Account.Type`; `Title = 'SELECT one'` passes; `select` refused in
      any case; `escapeLike` for `50%`, `a_b`, `c:\\x`.
- [ ] Deploy; run.

### Task 9: Publish checks the typed clause

**Files:** `classes/FinalMappingValidator.cls`, `classes/FinalMappingValidatorTest.cls`

In `checkMatch`, when `filterMode == 'soql'` (rows branch skipped; any leftover rows ignored):

1. `parse`; a problem → blocker _"Step N (Contact)'s conditions: " + problem_. Stop. (Every diagnostic from this path carries `field = 'conditions'` so `checkConditions` can pick them out — Task 11.)
2. Per token: Task 6's question checks, with `LIKE` treated as `like` (text-like fields only).
3. Test-run as the author:

```apex
Map<String, Object> binds = new Map<String, Object>();
for (FinalMappingSoql.Token t : p.tokens) {
    binds.put(t.bindName, placeholderFor(FinalMappingRules.fieldAt(d.getName(), t.fieldPath)));
}
try {
    Database.queryWithBinds(
        'SELECT Id FROM ' + d.getName() + ' WHERE ' + p.whereClause + ' LIMIT 0', // NOPMD — see Security Review note
        binds,
        AccessLevel.USER_MODE
    );
} catch (Exception e) {
    out.add(new Diagnostic(BLOCKER, id, 'conditions', name + '’s conditions don’t run: ' + e.getMessage()));
}
```

`placeholderFor`: text-like/picklist → `'x'`; number types → `0`; Date → `Date.today()`;
DateTime → `Datetime.now()`; Boolean → `false`; unresolved → `'x'` (the query then names the bad
field). `d.getName()` comes from describe, never the spec.

- [ ] Tests: each parse problem is a blocker; `Nope__c = 'x'` is a blocker quoting Salesforce; an
      unfitting or `Options` token is a blocker; `LIKE` on a number field is a blocker; skippable
      token warns; a field the running user can't read (minimal permission set, fresh `runAs`) is a
      blocker; a clean clause produces nothing.
- [ ] Deploy; run validator + publish-warnings tests.

### Task 10: The runtime runs the typed clause

**Files:** `classes/FinalMappingService.cls`, `classes/FinalMappingServiceTest.cls`

In `findOne`, when `filterMode == 'soql'`: parse (a problem → `StepException('its conditions can’t
run: ' + problem)`); per token, `v = answerValue(answer, question, fieldAt(object, fieldPath))`;
null → `StepException('the answer to "Q" was left blank, so no search was run.')`; if
`operator == 'LIKE'`, `v = FinalMappingSoql.escapeLike(String.valueOf(v))`; `binds.put(bindName, v)`.
The query is built as today (`… = :mappingMatchValue AND (<whereClause>) LIMIT 2`, `SYSTEM_MODE`,
`// NOPMD`). Bind names `m*` can't collide with the compiler's `b*` or `mappingMatchValue`.

`execute` gains `catch (QueryException e)` → `StepException(name + ': its search couldn’t run: ' +
e.getMessage())`.

- [ ] Tests: one-answer clause finds the right Contact; a Choice answer against a text field is
      searched by its **label**; `Title LIKE {x}` with answer `50%` matches only `50%`, not `500`;
      a skipped answer fails with "left blank" and writes nothing; a clause broken after publish
      fails naming the step; two matches still fail as ambiguous.
- [ ] Deploy; run `FinalMappingServiceTest`, `FinalMappingTriggerTest`.

### Task 11: The Advanced (SOQL) tab

**Files:** `lwc/finalMappingSoql/*`, `classes/FinalMappingController.cls` (+Test), `lwc/finalConditionsModal/*`, `lwc/finalMappingModel/*`,
`lwc/finalLookupFilter/*`, `lwc/finalMappingAction/*` (+ tests)

**finalMappingSoql** (`ms-`) — `@api value` (stored text), `@api questions`; emits `soqlchange`.

- Exported pure functions: `displayNames(questions, storedText)` → `Map<id, name>` built per
  decision 6 (including removed ids found in `storedText`); `toDisplay(stored, names)`;
  `toStored(display, names)`. `toStored` swaps only exact `{name}` matches outside quotes;
  anything else stays exactly as typed in the draft and is listed in `problems`, which stops Apply
  (below).
- The names map is built **once per dialog open** and kept, so a question renamed mid-edit can't
  shift it.
- Native `<textarea class="ms-text">` (needs `selectionStart`), label "Conditions — the part after
  WHERE", placeholder `LastName != null AND CreatedDate = LAST_N_DAYS:30`.
- `lightning-combobox` **Insert answer**: mappable, non-`Options` questions; inserts `{name}` at the
  cursor, then resets.
- `@api get problems()`: blank, or any `{…}` outside quotes that isn't a known name →
  "There's no question called "…". Use Insert answer." — the dialog's Apply gate reads it.
- Hint: _"Put each answer right after a field and a comparison, like Email = {Your email}. Check
  conditions runs the same check publishing does."_
- **Check conditions** (`lightning-button`, neutral) under the box (decision 21). Disabled while the
  box has a local problem (unknown `{name}`), since the server would only repeat it. On click:
  `toStored(text)` → `checkConditions({ specJson, actionId, soql })` → shows `ms-check` beneath:
  a success line _"These conditions run."_ (`utility:success`) or each diagnostic as its own line
  (`utility:error` for blockers, `utility:warning` for warnings). Any edit to the box clears the
  result, so a stale "These conditions run." is never shown. A spinner while it runs; a failed call
  says _"The check couldn't run. Try again."_

**`FinalMappingController.checkConditions(String specJson, String actionId, String soql)`** —
`@AuraEnabled`, `with sharing`, guests refused. Parses `specJson`, puts `soql` and
`filterMode: 'soql'` on that action's `match` in memory, runs `FinalMappingValidator.validate`
for the spec, and returns the diagnostics whose `actionId` matches and that come from the
conditions (the typed-clause path — Task 9 tags them `field = 'conditions'`). Nothing is written.
Apex tests: a clean clause → empty list; `Nope__c = 1` → the Salesforce message; an unfitting
`{token}` → blocker; skippable token → warning; guest → refused; an `actionId` not in the spec →
_"That step isn't in this form."_

**finalConditionsModal** — when `allowTyped`: tabs **Conditions** / **Advanced (SOQL)**, starting
on the saved mode (decision 21).

- Each tab keeps its **own draft**; switching tabs never asks and never discards.
- When the other tab has content, the open tab shows an inline notice (`cm-replace`, an SLDS
  scoped notification): _"Applying uses Advanced (SOQL). The 2 conditions you built will be
  removed."_ / _"Applying uses the built conditions. The Advanced (SOQL) text will be removed."_
- **Apply conditions** applies the **open** tab. If the other tab has content, it asks once
  (`LightningConfirm`): _"Replace the 2 built conditions with the Advanced (SOQL) conditions?"_ /
  the mirror. Cancel there keeps the dialog open with both drafts. Confirm →
  `close({ value, typed: { mode, soql } })`, and only then is the other half dropped.

**finalMappingModel**

```js
export function setFilterMode(spec, actionId, mode, soql) {
  return update(spec, actionId, (a) => {
    a.match = a.match || emptyMatch();
    if (mode === 'soql') {
      a.match.filterMode = 'soql';
      a.match.soql = soql || '';
      a.match.filter = { logic: 'all', rows: [] };
    } else {
      delete a.match.filterMode;
      delete a.match.soql;
    }
  });
}
```

`actionState`: soql mode is complete when `match.soql` is non-blank. `answerIndex`: tokens in
`match.soql` and `$field.` values in `match.filter.rows` (`value` and `values`) are recorded as
`use: 'filter'`, so a question used only in a condition no longer shows "Stored only". The index
labels `filter` as "used to narrow the search".

**finalLookupFilter / finalMappingAction** — `allowTyped` and `typedValue` flow to the summary;
`conditionschange.typed` → `setFilterMode` + `setMatch({ filter })` in one emitted spec.

- [ ] Jest: `displayNames` for labels `Name`, `Name`, `Name (2)` gives three distinct names that
      each round-trip to their own id; two removed questions stay distinct; quotes untouched; an
      unknown `{x}` is kept as typed and listed in `problems`; Insert answer at the cursor; switching
      tabs keeps both drafts and asks nothing; the replace notice appears only when the other tab has
      content; Apply asks once when it would discard, Cancel keeps both, Confirm drops the other
      half; Check conditions shows success / blockers / warnings, clears on the next edit, is
      disabled with an unknown name, and handles a failed call; `answerIndex` for row and typed
      references; `actionState` soql complete/incomplete.
- [ ] Deploy (Tasks 8–11); branch `feat/f2-typed-conditions`, PR, merge.

---

## S5 — The step reads as its branches

### Task 12: Layout, pre-fill, small fixes

**Files:** `lwc/finalMappingAction/*`, `lwc/finalMappingModel/*` (+ tests)

```
FIND AN EXISTING CONTACT
  Where [Email ▾]  matches the answer to [Your email ▾]
  Only records where:
  1  Title equals "Manager"
  2  Last Name equals the answer to "Your surname"          [Edit conditions]
  A filter is required. Searching every Contact in the org is refused when you publish.

IF ONE IS FOUND
  (unanswered) the two choice cards, as today
  (answered)   "Use it as-is. Nothing is written to it."  Change
               "Update the fields ticked 'Also update when found' below."  Change

IF NONE IS FOUND — CREATE A CONTACT WITH
  Field on Contact | Gets its value from | Also update when found (update mode only) | ×
```

- `ma-branch` sections, `h3.ma-subhead` headings. An Always create step shows only
  "Create a {objectLabel} with".
- Match-field row tag: "used to find the record — never overwritten".
- **Pre-fill (decision 12)** in `finalMappingModel`:

```js
export function setMatch(spec, actionId, patch) {
  return update(spec, actionId, (a) => {
    const fieldChanged = patch.field && patch.field !== (a.match || {}).field;
    a.match = { ...(a.match || emptyMatch()), ...patch };
    if (fieldChanged) {
      // the old search field's untouched pre-fill goes; the author's own rows stay
      a.fields = a.fields.filter(
        (f) => !(f.prefilled && f.field !== a.match.field)
      );
      delete a.match.prefillDeclined;
      const matched = a.fields.find((f) => f.field === a.match.field);
      if (matched) delete matched.writeOnMatch;
    }
    if (!('field' in patch) && !('source' in patch)) return; // filter edits never pre-fill
    const m = a.match;
    if (
      !m.field ||
      !m.source ||
      m.source.kind !== 'answer' ||
      m.prefillDeclined
    )
      return;
    const row = a.fields.find((f) => f.field === m.field);
    if (!row)
      a.fields.unshift({
        field: m.field,
        source: { ...m.source },
        prefilled: true
      });
    else if (row.prefilled) row.source = { ...m.source };
  });
}
```

`setFieldSource` deletes `prefilled`. `removeField` sets `match.prefillDeclined = true` when the
removed field is the search field. The writer's fence and the validator read only `field`,
`source`, `writeOnMatch` (checked), so the new keys are inert at runtime.

- `why` (decision 13): set only when `!entry.source` and the field isn't a lookup.

- [ ] Jest: headings per operation; summaries; pre-fill added on field+source, follows an untouched
      source change, stays after an edit, **not re-added after deletion when a filter or the source
      changes**, re-offered after the search field changes; `why` gone once a source is set.
- [ ] Deploy; uiux-flow-reviewer pass; branch `feat/f2-step-branches`, PR, merge.

---

## S6 — Org walkthrough

### Task 13: Signed in and as a guest, in `revclouddev`

- [ ] Deploy all; **publish the site**.
- [ ] Visibility: on a question, section and page, open the dialog, add two conditions, Apply — the
      panel lists both, numbered, in words. Add a row and leave it empty, press Apply: the error sits
      under that row's control, the footer says "1 condition needs attention", Go to first focuses it. Cancel
      a third edit and confirm nothing changed; preview obeys the rules.
- [ ] Lookup filter: add a condition in the dialog; the lookup still searches as before.
- [ ] Mapping, test form `a05hk000001aby9AAA`:
  1. Find-or-create Contact, Email ← Work email: the Email row appears pre-filled. Delete it, edit
     the filter — it stays deleted. **Then add Email ← Work email back by hand** (without it, a new
     Contact is created without the email and the reuse check below can't pass).
  2. Rows: `Last Name · Equals · An answer · Your surname`. Publish.
  3. Guest submits twice with the same email → second reuses the first.
  4. Guest surname `$User.Name` → a Contact with that literal surname; never the guest user's name.
  5. Advanced (SOQL): `LastName = {Your surname} AND CreatedDate = LAST_N_DAYS:30`. Switching tabs keeps
     both drafts; the replace notice shows; **Check conditions** says "These conditions run."; Apply asks
     once before replacing the rows.
     Publish clean; guest submit behaves.
  6. `Title LIKE {Job title}` with answer `50%` matches only `50%`.
  7. `LastName = 'x'; DELETE`, `LIMIT 5`, `Nope__c = 1`, `Email = :x` → each refused at publish
     with its sentence. `{Not a question}` never gets that far: the dialog shows _"There's no
     question called "Not a question". Use Insert answer."_ and **Apply is refused, with the problem shown under the box**.
- [ ] **Sources (S2b), signed in:** a NOT rule; "Account › Type" in a lookup filter; a visibility
      rule on Profile name and one on Role name (switch the test user's role to see it flip); a Form
      on `Final_P0_Test` with `c__existingRecordId` showing a question only for Contacts whose Title is X.
- [ ] **Sources, as a guest:** the public form with a Profile-name rule — user context is
      **unavailable**, so the rule is not met (a show-rule stays hidden, even with NOT); no user read
      appears in the network log.
- [ ] "What actually shipped" below; branch `docs/f2-search-shipped`.

## Orphan ledger

- `finalRuleEditor`: markup and CSS replaced; `@api forRecords` **removed** (only caller:
  `finalLookupFilter`, switched to `columns`); new `@api columns`, `@api answerChoices`,
  `@api get problems()`. Public event and value shapes unchanged.
- `finalPropertyPanel` and `finalLookupFilter` stop embedding the editor directly; they embed
  `finalConditionsSummary`.
- `FinalMappingService.resolvedFilter` returns the private `Resolved`; only caller `findOne`.
- New spec keys: `match.filterMode`, `match.soql`, `match.prefillDeclined`, `fields[].prefilled`.
  Published mappings without them behave as before.
- The legacy `visibilityEditor` is copied for technique only; it is not referenced or changed.
- `finalExpressionEngine` gains NOT and `validateCustomLogic`; `FinalLookupLogic` gains NOT. Logic accepted today evaluates identically (pinned in Task 14).
- `FinalSurveyObjectController.getRecordContext` accepts ordinary Forms (verdicts only); its survey behaviour is unchanged.
- `FinalLookupService.userValue` reads any User path server-side; its four fast paths are unchanged.
- Nothing is deleted.

## Security Review note

The typed clause is dynamic SOQL from text an admin typed. The defence: only a Form Builder admin
authors it; it is parsed against a closed deny-list (no `;`, no binds, no sub-queries, no `$`, no
clause keywords); it is test-run in `USER_MODE` at publish; respondent input only ever enters as
bind values, LIKE-escaped where it matters; the object name comes from describe. The two query
sites carry `// NOPMD` pointing here rather than weakening `ApexSOQLInjection`.

## Plan review, round 1 — where each finding went

| #   | Finding                                                    | Fixed in                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | an invalid edit could leave the old clause to be published | the dialog holds a draft until Save (decision 1, Task 4); an unknown `{name}` keeps **Save disabled** with its sentence (Task 11), so it never reaches the spec from the Studio; the parser still refuses one that arrives another way — an imported or hand-edited spec (Task 8) |
| P1  | the rule-editor change wasn't really opt-in                | `answerChoices = []`, every answer path gated on `answersOn` (Task 7)                                                                                                                                                                                                             |
| P2  | `LIKE` answers still acted as wildcards                    | tokens keep their comparison; `escapeLike` at runtime (decision 7, Tasks 8, 10)                                                                                                                                                                                                   |
| P2  | display names could collide                                | collision-free names incl. removed questions, built once per open (decision 6, Task 11)                                                                                                                                                                                           |
| P2  | multi-select answers could appear under Equals             | `Options` excluded; operator + cardinality checked in picker, dialog and publish (decision 9, Tasks 6, 7)                                                                                                                                                                         |
| —   | pre-fill could undo a deletion                             | pre-fill only on field/source changes; `prefillDeclined` (decision 12, Task 12)                                                                                                                                                                                                   |
| —   | the answers index missed filter references                 | `use: 'filter'` for rows and typed tokens (Task 11)                                                                                                                                                                                                                               |

## Plan review, round 2 (rev 3) — where each finding went

| #   | Finding                                                                                                        | Fixed in                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Current user fields came from `describeFields`, which needs Create on User and drops non-creatable fields      | `describeLookupFields('User')`, read-access based (decision 15, Task 16)                                                |
| 2   | user date/datetime comparisons fell through to number conversion — the viewer's `getType` only knows questions | `getObjectInfo(User)` feeds `getType` for `user:` ids; date, datetime, number and checkbox tests (decision 15, Task 16) |
| 3   | NOT turned "no linked record" into true, showing questions in create mode                                      | **unavailable ≠ blank** (decision 18) — refined in round 3 to three-valued logic                                        |
| 4   | deleting the last eligible question switched `$field.` back to plain text                                      | reading gated on `columns === 'mapping'` alone; the choices count only gates offering (Task 7)                          |

## Plan review, round 3 — where each finding went

| #   | Finding                                                                                                                         | Fixed in                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "any unavailable condition fails the whole rule" changed existing OR rules (Answer = Yes OR a record condition, with no record) | three-valued logic, unknown → not met at the end; identical to today for every NOT-free rule, pinned by a table test; no versioning (decision 18, Task 16) |
| 2   | user values could be "available" before their types arrived                                                                     | one readiness state: ready only when values **and** types are in, either error → failed; tests for both orders and metadata failure (decision 18, Task 16) |
| 3   | walkthrough deleted the Email mapping, then expected reuse by email                                                             | Email re-added by hand before the reuse check (Task 13)                                                                                                    |
| 4   | review table said unknown `{names}` are saved                                                                                   | aligned: Save stays disabled; the parser covers imported specs (review table, Tasks 8, 11, 13)                                                             |
| 5   | guest walkthrough still said "blank"                                                                                            | now "unavailable, not met" (Task 13)                                                                                                                       |

## Plan review, round 4 (owner) — where each point went

| #   | Point                                                                                                               | Fixed in                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | choosing "An answer" silently picked the first fitting question                                                     | value left empty, "Choose a question…" focused, a problem until chosen (decision 22, Task 7)                                                                                                                                                                   |
| 2   | one flat combobox of own + related fields would be enormous and unsearchable; the 25-relationship cap was arbitrary | `finalFieldPicker` on a shared `finalTypeahead` (from `finalObjectPicker`): search by label, API name or relationship; `Account › Industry` with the API path underneath; every relationship listed and loaded on demand; session cache (decision 20, Task 15) |
| 3   | summaries only counted conditions                                                                                   | each condition spelled out, numbered, in labels, with the logic line — the old Form Builder's panel, improved (decision 19, Task 4)                                                                                                                            |
| 4   | Advanced search only got query feedback at publish; switching tabs was disruptive                                   | named **Advanced (SOQL)**; **Check conditions** runs the publish check on demand; both drafts kept; inline replace notice; one confirmation on Apply (decision 21, Task 11)                                                                                    |
| 5   | one footer sentence for all problems                                                                                | errors under the control that needs fixing; "3 conditions need attention" + Go to first; **Apply conditions** instead of Save; "Question removed" vs "Question type is incompatible" (decisions 3, 22; Tasks 3, 4, 7)                                          |

## What actually shipped (2026-09-24)

Every slice shipped, was merged, deployed to `revclouddev` and checked there.

| Slice | PRs                          | What landed                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1    | #332, #333, #334             | Rulings D49–D57 in the spec; answers are always bound values (a respondent's `$User.Name` is searched as that text).                                                                                                                                                                                                                                                                                         |
| S2    | #335                         | One conditions editor, Form Designer style, in a dialog, on all three screens; summaries spelled out and numbered; errors beside their controls; "N conditions need attention" + Go to first.                                                                                                                                                                                                                |
| S2b   | #336, #337, #338, #339, #340 | NOT in custom logic (written `(NOT (…))` in SOQL) with three-valued logic in the browser; related fields ("Account › Type") in a shared searchable `finalTypeahead` / `finalFieldPicker`; Current user (any User field + Profile name + Role name); the linked record for Forms (`existingRecordId`); review fixes (Escape keeps the dialog open, a click opens a relationship in place, "Showing 50 of N"). |
| S3    | #341                         | Mapping filter rows compare with **An answer**; nothing is chosen for the author; a saved answer that no longer fits is kept and says why; publish checks removed / several-value / incompatible / wrong-comparison answers and warns on skippable ones.                                                                                                                                                     |
| S4    | #342                         | **Advanced (SOQL)** tab: `FinalMappingSoql` parser, publish check that test-runs the clause as the author, runtime that binds answers and LIKE-escapes them, `checkConditions` for **Check conditions**; review fixes (quoted answers and deleted questions stop Apply, problems show while typing, undo kept).                                                                                              |
| S5    | #343                         | The step reads as Find / If one is found / If none is found, create …; the searched field is pre-filled (editable, stays deleted); "Also update when found"; review fixes (a/an, heading levels, a note on the pre-filled row).                                                                                                                                                                              |

**Differences from the plan**

- `answerChoices` lists **every** question; ones that hold several values arrive with `fits: []`. A saved multi-value answer therefore says "Question type is incompatible" rather than "Question removed".
- The typed box's blank message is _"Write the conditions, or go back to the Conditions tab."_ (Apex parser and dialog), after design review.
- The typed box also refuses, before Apply: an answer inside quotes (it would be searched as those words) and a question deleted since the clause was written. The plan only had unknown names.
- The typed box builds its names when it appears and again when the question list arrives, until the author edits — the dialog can hand over the saved text before the questions (found in the org walkthrough; Insert answer did nothing).
- Not taken from review: a "Discard your changes?" prompt on Cancel / Esc / Clear all — the built tab doesn't ask either, and Cancel returning nothing is the dialog's contract.

**Org walkthrough (S6, `revclouddev`, form `a05hk000001aby9AAA`)**

- Publish refused each bad clause with its sentence: `; DELETE`, `LIMIT 5`, `Nope__c = 1` (Salesforce's own message), `Email = :x`, `{Not a question}`.
- Published `LastName = {Your answer} AND CreatedDate = LAST_N_DAYS:30` (version `a04hk000000ocJpAAI`), then the TestSite.
- Guest, surname F2Walk: created the Contact. Same surname and email again: the step **found that Contact** (same id) and wrote nothing to it.
- Guest surname `$User.Name`: saved as that literal text.
- Studio: the Advanced (SOQL) tab, replace notice, Insert answer (`{Your answer}` at the cursor) and Check conditions (skippable warning; "No such column 'Nope\_\_c'…") all worked; dialog cancelled.
- Earlier slices were checked in the org as they shipped (visibility dialog errors, "Account › Account Type" in the field picker, a Profile-name rule showing and hiding a question, Linked record offered on a Contact Form).

**Not walked in the org this time** (covered by tests that run in the org or in jest):
`Title LIKE {…}` with `50%` (Apex `aTypedLikeAnswerMatchesAsTyped`, real SOQL); a choice searched by its label (Apex); the guest Profile-name rule staying hidden (jest `userConditionsGuest`); a Role change flipping a rule.

The QA form's unpublished v4 draft was left as it was; its previous versions are backed up outside the repo.
