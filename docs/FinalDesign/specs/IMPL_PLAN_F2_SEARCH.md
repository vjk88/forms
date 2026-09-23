# IMPL_PLAN — Conditions editor rebuilt, and the F2 find-or-create search

> **Status:** revision 2, draft for owner review, 2026-09-23. No code yet.
> Rev 2: the owner asked for the Form Designer's condition editor style everywhere (in a dialog),
> and a plan review found seven defects in rev 1 (the table at the end says where each was fixed).
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

**Spec:** [FREEFORM_F2_MAPPING_SPEC.md](./FREEFORM_F2_MAPPING_SPEC.md). Task 1 adds rulings
D49–D53 to it.

## Owner rulings (2026-09-23)

| #   | Ruling                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D49 | **A mapping filter row compares against a fixed value or an answer.** Columns: Field · Operator · Compare with · Value. Only answers whose type and single-value shape fit the row are offered.                                                                             |
| D50 | **An author may type the WHERE clause instead of building rows** — a "Write the conditions" tab in the conditions dialog. Either-or per step; switching warns before discarding. Mapping search only. A deliberate exception to "never raw expressions" (visibility rules). |
| D51 | **Answers go into a typed clause through an Insert answer button** as a readable `{Your email}`, and always run as bound values.                                                                                                                                            |
| D52 | **The searched field is pre-filled in the create list, and stays editable.** Softens D45.                                                                                                                                                                                   |
| D53 | **One condition editor, Form Designer style, in a dialog, for all three screens** (visibility rules, lookup filters, mapping search). Each screen shows a one-line summary and an Edit button.                                                                              |
| —   | **Answers are always bound values** (review bug). Nothing a respondent types is read as `$User.`, `$field.` or query text; fixed test-first in this work.                                                                                                                   |

## Global constraints

- API **66.0**; org **`revclouddev`**; Contact-only test data.
- **Saved shapes don't change** for visibility rules (`{action, logic, customLogic, rules[]}`) or
  lookup filters (`{logic, customLogic, rows[]}`). The runtime evaluators
  (`finalExpressionEngine`, `FinalLookupService.compile`) are not touched, so every form already
  published behaves exactly as before.
- Lookup filters get the new look but **no answer comparisons** — comparing a lookup with another
  answer is dependent lookups, which the owner is rebuilding themselves (DO NOT resurrect v1).
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
     (and, for the mapping, the typed tab), and returns the result only on **Save**. Cancel returns
     nothing. So an unfinished edit can never reach the spec or publish.
   - `c/finalConditionsSummary` (new) — the one line each screen shows: _"Shown when 2 conditions are
     all met"_ / _"Searches Contacts where 1 condition is met"_ / _"No conditions — always shown"_,
     plus **Edit conditions**. It opens the dialog and emits the saved value.
2. **Columns per screen.**

   | Screen                | Columns                                       |
   | --------------------- | --------------------------------------------- |
   | Visibility rules      | Source · Question or field · Operator · Value |
   | Lookup filter         | Field · Operator · Value                      |
   | Mapping search (rows) | Field · Operator · Compare with · Value       |

   Visibility **Source** = "An answer" and — only when the form has record sources (surveys with a
   record link) — "The linked record". That replaces today's two `<optgroup>`s inside one select.

3. **Save is disabled until the draft is usable**, with the reason shown in the footer: a row missing
   its field, operator or value; custom logic that names a missing row or doesn't close a bracket
   (checked with the existing `evaluateCustomLogic`); in the typed tab, a `{name}` that isn't a
   question. Lint warnings from `lintVisibility` still show, and don't block (as today).
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

## File map

**Create**

| Path (under `force-app/main/default/`) | Responsibility                                               |
| -------------------------------------- | ------------------------------------------------------------ |
| `lwc/finalConditionsModal/` (+test)    | the dialog: draft, Save gate, Clear all, Build/Write tabs    |
| `lwc/finalConditionsSummary/` (+test)  | one-line summary + Edit conditions                           |
| `lwc/finalMappingSoql/` (+test)        | the Write tab: textarea, Insert answer, display-name mapping |
| `classes/FinalMappingSoql.cls` (+Test) | parse a typed clause: guards, tokens → binds, no DML         |

**Modify**

| Path                                                 | Change                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `lwc/finalRuleEditor/` (+test)                       | rebuilt as the columned grid; `columns` mode; opt-in answer comparisons   |
| `lwc/finalPropertyPanel/` (+test)                    | Visibility group: summary + dialog instead of the inline editor           |
| `lwc/finalLookupFilter/` (+test)                     | conditions: summary + dialog; `answerChoices` / `allowTyped` pass-through |
| `lwc/finalMappingModel/` (+test)                     | `setFilterMode`, `setSoql`, pre-fill rules, index + state for filters     |
| `lwc/finalMappingAction/` (+test)                    | branch layout, answer choices, `why` fix                                  |
| `classes/FinalMappingService.cls` (+Test)            | token fix; typed clause at runtime; query errors named per step           |
| `classes/FinalMappingValidator.cls` (+Test)          | row answers checked; typed clause parsed and test-run as the author       |
| `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md` | D49–D53, §4 shape, §5.2 layout, §7 blockers                               |

## Slice order

| Order | Slice | Tasks | Why here                                                               |
| ----- | ----- | ----- | ---------------------------------------------------------------------- |
| 1     | S1    | 1–2   | rulings, then the bug fix — later slices send more answers into search |
| 2     | S2    | 3–5   | the new editor + dialog, on all three screens, same saved shapes       |
| 3     | S3    | 6–7   | answers in mapping rows: publish check, then the Compare with column   |
| 4     | S4    | 8–11  | the typed clause: parser, publish, runtime, Write tab                  |
| 5     | S5    | 12    | the mapping step as branches; pre-fill; small fixes                    |
| 6     | S6    | 13    | org walkthrough, signed in and as a guest                              |

---

## S1 — Rulings and the bug fix

### Task 1: Spec rulings

**Files:** `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md`

- [ ] Add D49–D53 to §2 (dated 2026-09-23), worded as above.
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
- Value controls keep today's typing rules (`VALUE_KIND`, `canDisplay`, operator lists by subtype),
  rendered as `lightning-input` type number / date / datetime / text, or a Yes/No
  `lightning-combobox`.
- The "(not valid here)" preservation for saved operators and values stays.
- `@api get problems()` — the Save-gate list from decision 3, as sentences, for the dialog.
- Lint (`lintVisibility`) and the record hint render under the grid exactly as now.
- Mapping-only pieces (the Compare with column) arrive in Task 7; with `columns="mapping"` before
  then it renders as `lookup`.

- [ ] Jest: every existing behaviour test ported to the new markup (operators by subtype, value
      typing, "(not valid here)", lint, record hint, custom logic); header row once; column sets per
      mode; Source switch resets the row; `problems` for missing field/operator/value, bad custom
      logic (`1 AND (2 OR 3)` over one row) and clean for `1`.

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
  `lightning-tabset` "Build conditions" / "Write the conditions" around it (Task 11).
- Footer (left to right, as the Form Designer): **Clear all** (empties the draft, stays open),
  **Cancel** (`close()` → `undefined`), **Save** (`close({ value, typed })`), brand, disabled while
  `problems.length`; the first problem shows beside it in `cm-problem`.
- Nothing the dialog does touches the spec until Save.

**`finalConditionsSummary`** — `@api` the same inputs plus `emptyText`, `summaryNoun`. Renders one line
and a `lightning-button` **Edit conditions** (or **Add conditions** when empty). On click: `open(...)`;
on a result, emits `conditionschange { value, typed }`. Summary text:

| State      | Visibility                              | Filter / search                                    |
| ---------- | --------------------------------------- | -------------------------------------------------- |
| none       | "Always shown"                          | "No conditions"                                    |
| all        | "Shown when all 2 conditions are met"   | "Only where all 2 conditions are met"              |
| any        | "Shown when any of 2 conditions is met" | "Only where any of 2 conditions is met"            |
| custom     | "Shown when 1 AND (2 OR 3)"             | "Only where 1 AND (2 OR 3)"                        |
| typed      | —                                       | "Only where: " + first 80 characters of the clause |
| hide rules | "Hidden when …" (same variants)         | —                                                  |

- [ ] Jest (the publish dialog's tests show how to mock `LightningModal.open`): Save returns the
      draft; Cancel returns nothing and the summary emits nothing; Clear all empties only the draft;
      Save disabled with the problem shown; summary wording per row of the table.

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

**finalRuleEditor** — `@api answerChoices = []` (never null). All answer behaviour is gated on
`get answersOn() { return this.columns === 'mapping' && this.answerChoices.length > 0; }` — when
off, `$field.` values render and change exactly as any other text (so visibility rules and lookups
are untouched).

When on, per row:

- `fieldType = (this.sources.find((s) => s.id === rule.source) || {}).type`
- `fitting = answerChoices.filter((a) => a.fits.includes(fieldType))` — `answerChoices` arrive
  already stripped of `Options` answers (decision 9).
- `operatorAllowsAnswer = SCALAR_OPS.has(rule.operator) && (rule.operator !== 'contains' || TEXTLIKE.has(fieldType))`
  where `SCALAR_OPS = equals, notEquals, contains, greaterThan, lessThan, lte, gte`.
- **Compare with** cell: `lightning-combobox` "A fixed value" / "An answer" — "An answer" offered
  only when `fitting.length && operatorAllowsAnswer`.
- **Value** cell: the typed control, or a question `lightning-combobox` (value `$field.<key>`),
  plus a "(question removed)" option when the saved key isn't in `fitting`, so opening never
  rewrites a rule.
- Changing Compare with → answer sets `$field.<first fitting>`; → fixed sets `''`. Changing the
  operator or the field so the answer no longer qualifies clears the value to `''` visibly.
- `problems` adds: "Condition N compares with an answer that can't be used there." for a token that
  no longer qualifies.

**finalMappingAction** — `get filterAnswerChoices()`: questions with `q.mappable` and
`q.answerType !== 'Options'`, `fits = (compatibility[q.answerType] || []).map((t) => t.toLowerCase())`.
Passed to `c-final-lookup-filter answer-choices`.

- [ ] Jest: gate off → no Compare with column and `$field.x` renders as plain text (visibility
      regression test); gate on → only fitting, single-value answers; Contains offers answers only
      for text fields; Is one of offers none; operator change clears a token; removed question shows
      "(question removed)" untouched; `Options` questions never listed.
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

1. Blank → _"Write the conditions, or go back to building them."_
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
     between the braces). This is how an unknown display name typed in the box (Task 11) is refused
     at publish.
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

1. `parse`; a problem → blocker _"Step N (Contact)'s conditions: " + problem_. Stop.
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
    out.add(new Diagnostic(BLOCKER, id, null, name + '’s conditions don’t run: ' + e.getMessage()));
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

### Task 11: The Write tab

**Files:** `lwc/finalMappingSoql/*`, `lwc/finalConditionsModal/*`, `lwc/finalMappingModel/*`,
`lwc/finalLookupFilter/*`, `lwc/finalMappingAction/*` (+ tests)

**finalMappingSoql** (`ms-`) — `@api value` (stored text), `@api questions`; emits `soqlchange`.

- Exported pure functions: `displayNames(questions, storedText)` → `Map<id, name>` built per
  decision 6 (including removed ids found in `storedText`); `toDisplay(stored, names)`;
  `toStored(display, names)`. `toStored` swaps only exact `{name}` matches outside quotes;
  anything else stays exactly as typed, so the parser refuses it at publish by name.
- The names map is built **once per dialog open** and kept, so a question renamed mid-edit can't
  shift it.
- Native `<textarea class="ms-text">` (needs `selectionStart`), label "Conditions — the part after
  WHERE", placeholder `LastName != null AND CreatedDate = LAST_N_DAYS:30`.
- `lightning-combobox` **Insert answer**: mappable, non-`Options` questions; inserts `{name}` at the
  cursor, then resets.
- `@api get problems()`: blank, or any `{…}` outside quotes that isn't a known name →
  "There's no question called "…". Use Insert answer." — the dialog's Save gate reads it.
- Hint: _"Checked when you publish, as you. Put each answer right after a field and a comparison,
  like Email = {Your email}."_

**finalConditionsModal** — when `allowTyped`: tabs **Build conditions** / **Write the conditions**,
starting on the saved mode. Leaving a tab whose content isn't empty asks via `LightningConfirm`:
_"Switch to writing the conditions? The 2 conditions you built will be removed when you save."_ (and
the mirror). Save returns `{ value, typed: { mode, soql } }` for the tab that is open; the other half
is dropped **only on Save**.

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
      unknown `{x}` is kept as typed and listed in `problems`; Insert answer at the cursor; tab switch
      asks and Cancel keeps both; Save drops the other half; `answerIndex` for row and typed
      references; `actionState` soql complete/incomplete.
- [ ] Deploy (Tasks 8–11); branch `feat/f2-typed-conditions`, PR, merge.

---

## S5 — The step reads as its branches

### Task 12: Layout, pre-fill, small fixes

**Files:** `lwc/finalMappingAction/*`, `lwc/finalMappingModel/*` (+ tests)

```
FIND AN EXISTING CONTACT
  Where [Email ▾]  matches the answer to [Your email ▾]
  Only where all 2 conditions are met            [Edit conditions]
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
- [ ] Visibility: on a question, section and page, open the dialog, add two conditions, Save; Cancel
      a third edit and confirm nothing changed; preview obeys the rules.
- [ ] Lookup filter: add a condition in the dialog; the lookup still searches as before.
- [ ] Mapping, test form `a05hk000001aby9AAA`:
  1. Find-or-create Contact, Email ← Work email: the Email row appears pre-filled. Delete it, edit
     the filter — it stays deleted.
  2. Rows: `Last Name · Equals · An answer · Your surname`. Publish.
  3. Guest submits twice with the same email → second reuses the first.
  4. Guest surname `$User.Name` → a Contact with that literal surname; never the guest user's name.
  5. Write tab: `LastName = {Your surname} AND CreatedDate = LAST_N_DAYS:30`. Switching asks first.
     Publish clean; guest submit behaves.
  6. `Title LIKE {Job title}` with answer `50%` matches only `50%`.
  7. `LastName = 'x'; DELETE`, `LIMIT 5`, `Nope__c = 1`, `Email = :x`, `{Not a question}` → each
     refused at publish with its sentence.
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
- Nothing is deleted.

## Security Review note

The typed clause is dynamic SOQL from text an admin typed. The defence: only a Form Builder admin
authors it; it is parsed against a closed deny-list (no `;`, no binds, no sub-queries, no `$`, no
clause keywords); it is test-run in `USER_MODE` at publish; respondent input only ever enters as
bind values, LIKE-escaped where it matters; the object name comes from describe. The two query
sites carry `// NOPMD` pointing here rather than weakening `ApexSOQLInjection`.

## Plan review, round 1 — where each finding went

| #   | Finding                                                    | Fixed in                                                                                                                                                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | an invalid edit could leave the old clause to be published | the dialog holds a draft until Save (decision 1, Task 4); unknown `{names}` are saved as typed and refused by the parser (Tasks 8, 11) — the spec always equals what the author last saved |
| P1  | the rule-editor change wasn't really opt-in                | `answerChoices = []`, every answer path gated on `answersOn` (Task 7)                                                                                                                      |
| P2  | `LIKE` answers still acted as wildcards                    | tokens keep their comparison; `escapeLike` at runtime (decision 7, Tasks 8, 10)                                                                                                            |
| P2  | display names could collide                                | collision-free names incl. removed questions, built once per open (decision 6, Task 11)                                                                                                    |
| P2  | multi-select answers could appear under Equals             | `Options` excluded; operator + cardinality checked in picker, dialog and publish (decision 9, Tasks 6, 7)                                                                                  |
| —   | pre-fill could undo a deletion                             | pre-fill only on field/source changes; `prefillDeclined` (decision 12, Task 12)                                                                                                            |
| —   | the answers index missed filter references                 | `use: 'filter'` for rows and typed tokens (Task 11)                                                                                                                                        |
