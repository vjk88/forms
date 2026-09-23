# IMPL_PLAN — F2 find-or-create search, rebuilt

> **Status:** draft for owner review, 2026-09-23. No code yet.
> **For agentic workers:** use superpowers:executing-plans, task by task. Checkboxes track steps.

**Goal:** An author can build the find-or-create search out of form answers — in condition rows or
in a WHERE clause they type — and the step reads as the two branches it really is: _if one is found_,
_if none is found, create_.

**Why (what the owner saw, 2026-09-23):**

1. The main search could use an answer ("Email matches Your email") but the filter rows under it
   could only take typed-in values. The runtime already understood answers in rows; the screen gave
   no way to pick one.
2. Under "When one is found, it's used as-is and nothing is written to it" sat a list of field
   mappings. Nothing said those fields are only for the record created when **nothing** is found.
3. Last Name → "A fixed value" showed _"Another record: Last Name isn't a lookup field."_ underneath,
   which reads like an error. Custom logic `1 AND (2 OR 3)` over a single row wasn't flagged until
   publish.
4. From the plan review: a respondent who types `$User.Email` into an answer used by a filter row
   gets it read as an instruction — the search compares against the site guest user's email.

**Spec:** [FREEFORM_F2_MAPPING_SPEC.md](./FREEFORM_F2_MAPPING_SPEC.md). This plan adds rulings
D49–D52 to it (Task 1).

## Owner rulings (2026-09-23)

| #   | Ruling                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D49 | **A filter row compares against a fixed value or an answer.** Each row gets a "A fixed value / The answer to…" choice. Only answers whose type fits the row's field are offered.                                                                 |
| D50 | **An author may type the WHERE clause instead of building rows.** Either-or per step, switching warns before discarding. Mapping search only — lookup questions keep rows. A deliberate exception to "never raw expressions" (visibility rules). |
| D51 | **Answers go into a typed clause through an Insert answer button** as a readable `{Your email}`, and always run as bound values — never pasted into the query text.                                                                              |
| D52 | **The searched field is pre-filled in the create list, and stays editable.** Choosing "Email matches Your email" adds `Email ← Your email` to the new-record fields when Email isn't there yet. Softens D45.                                     |
| —   | **Answers are always bound values** (the review bug). Nothing a respondent types is ever read as `$User.`, `$field.` or query text. Fixed in this same work, test first.                                                                         |

## Global constraints

- API **66.0**; org **`revclouddev`**; Contact-only test data (Account inserts are blocked there).
- `FinalLookupService.compile` behaviour is **unchanged for lookups**. Lookup questions get no WHERE box
  and no answer rows beyond what they have today.
- The typed clause is checked at publish **as the author** (`USER_MODE`) and run in the background
  in `SYSTEM_MODE`, exactly like rows today.
- CSS prefixes: `ma-` (action), `ms-` (new SOQL box), `re-` (rule editor).
- Copy: plain words, sentence case, no "please", no "successfully".
- One branch per slice → PR → merge; deploy + click through, not just tests green; site publish before
  any guest check.

## Decisions this plan makes — review these

1. **Spec shape.** Rows stay in `match.filter` exactly as today. The typed clause is
   `match.soql` (string), and the mode is `match.filterMode: "soql"`. No `filterMode` = rows, so every
   mapping already published keeps working with no migration.
2. **Stored token = `{!<elementId>}`**, shown to the author as `{<question label>}`. Stored by id, so
   renaming a question never breaks a clause; the box redraws with the new label. Two questions with
   the same label show as `{Label}` and `{Label (2)}`, in form order.
3. **An answer in a typed clause must sit right after a field and a comparison** —
   `Email = {Your email}`, `CloseDate >= {Start date}`. That is how the runtime knows which field the
   answer is compared with, so a choice is searched by its label or its value exactly as a write
   would store it (F2 decision 7 — the duplicate-maker). Allowed comparisons: `=` `!=` `<>` `<` `<=`
   `>` `>=` `LIKE`. `LIKE {x}` matches the answer exactly; wildcards can't be added around an answer.
   Anywhere else, `{…}` is a publish blocker that says where to put it.
4. **What a typed clause may not contain** (outside quoted text): `;`, `$`, a `:` that starts a bind
   (`:name`, `: x`, `:(`) — `LAST_N_DAYS:30` and other date literals still work — and the words
   `SELECT FROM LIMIT OFFSET ORDER GROUP HAVING FOR WITH USING UPDATE TYPEOF ALL`. So **no
   sub-queries**: a clause filters the step's own object, with relationship paths like
   `Account.Type = 'Customer'`. Keeps the Security Review story to "a WHERE on one object".
5. **Maximum 4,000 characters** for a typed clause. A blocker past that.
6. **Answers in rows are single-value only.** The "The answer to…" choice is offered for Equals, Not
   equals, Contains, less/greater, At most, At least — not for Is one of / Includes, which keep a
   typed list. (The runtime already handles answers in lists; the screen just doesn't offer it.)
7. **Row answers that can be skipped warn, not block** — same wording and rule as the main search:
   _"… which can be skipped. When it is, this step fails."_
8. **The token-bug fix doesn't touch the shared compiler.** The mapping runtime hands the compiler
   each answer through its `answers` map under a private key (`$field.__m0`), so the compiler returns
   the value as-is and never re-reads it. Today it pastes the answer into `row.value`, where the
   compiler reads it again.
9. **"Another record: … isn't a lookup field" shows only while a row has no source.** Its job is to
   explain why "Another record" isn't in the list; once a source is picked, it's noise.
10. **Custom logic is checked as the author types** with the existing `evaluateCustomLogic`
    (finalExpressionEngine). This is in the shared rule editor, so visibility rules get the same
    warning — display only, nothing saved differently.
11. **Pre-fill (D52) follows the search while untouched.** When the author changes the search
    answer and the pre-filled row still points at the old one, it moves with it. If the author has
    changed that row, it's left alone.

## File map

**Create**

| Path (under `force-app/main/default/`) | Responsibility                                                 |
| -------------------------------------- | -------------------------------------------------------------- |
| `classes/FinalMappingSoql.cls` (+Test) | parse a typed clause: guards, answer tokens → binds, no DML    |
| `lwc/finalMappingSoql/`                | the typed-clause box: textarea, Insert answer, inline problems |
| `lwc/finalMappingSoql/__tests__/`      | jest                                                           |

**Modify**

| Path                                                 | Change                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `classes/FinalMappingService.cls` (+Test)            | token fix (decision 8); `findOne` runs the typed clause; query errors named per step |
| `classes/FinalMappingValidator.cls` (+Test)          | row answers checked; typed clause parsed + test-run as the author                    |
| `lwc/finalRuleEditor/` (+test)                       | opt-in `answerChoices`: per-row fixed/answer choice; custom-logic inline check       |
| `lwc/finalLookupFilter/` (+test)                     | passes `answerChoices` through; nothing else                                         |
| `lwc/finalMappingModel/` (+test)                     | `setFilterMode`, `setSoql`; D52 pre-fill in `setMatch`; `actionState` for soql mode  |
| `lwc/finalMappingAction/` (+test)                    | mode switch, soql box, branch layout, answer choices, `why` fix                      |
| `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md` | D49–D52, §4 shape, §5.2 layout, §7 new blockers                                      |

## Slice order

| Order | Slice | Tasks | Why here                                                             |
| ----- | ----- | ----- | -------------------------------------------------------------------- |
| 1     | S1    | 1–2   | the bug fix first — every later slice sends more answers into search |
| 2     | S2    | 3–4   | answers in rows: backend check, then the screen                      |
| 3     | S3    | 5–8   | the typed clause: parser, publish, runtime, screen                   |
| 4     | S4    | 9     | branch layout, pre-fill, the two small screen fixes                  |
| 5     | S5    | 10    | org walkthrough as a guest                                           |

---

## S1 — Answers are always bound values

### Task 1: Spec rulings

**Files:** `docs/FinalDesign/specs/FREEFORM_F2_MAPPING_SPEC.md`

- [ ] Add D49–D52 to the §2 ledger (dated 2026-09-23), worded as in the rulings table above.
- [ ] §4: add `filterMode` and `soql` to the `match` example and a short §4.6 "The typed clause"
      (token form, decisions 3–5).
- [ ] §5.2: replace the middle-column description with the branch layout from Task 9.
- [ ] §7: add the new blockers and warnings from Tasks 3 and 6.
- [ ] §10: strike "Keeping the match answer and the saved value in step" and point at D52.
- [ ] Branch `docs/f2-search-rulings`, PR, merge.

### Task 2: The fix

**Files:** `classes/FinalMappingService.cls`, `classes/FinalMappingServiceTest.cls`

- [ ] **Step 1: Failing tests** in `FinalMappingServiceTest`:
  - `rowAnswerIsNeverReadAsAToken` — Contact step, find-or-create on Email, filter row
    `LastName eq $field.<surname question>`. The respondent's surname answer is the text
    `$User.Name`. A Contact exists with LastName `$User.Name` and the matching email.
    Expect: **found** (status Done, no new Contact). Today the compiler swaps in the running user's
    full name, finds nothing and creates a duplicate. (`$User.Name` because the compiler resolves
    only Id, ProfileId, Email and Name.)
  - `rowAnswerThatLooksLikeAFieldTokenIsLiteral` — same, answer text `$field.x`. Expect Done and the
    literal matched; today the step fails with "A filter condition has no value yet".
- [ ] **Step 2:** run them, see both fail.
- [ ] **Step 3:** in `resolvedFilter`, stop writing converted answers into `row.value`. Instead:

```apex
// A per-run answers map for the compiler. The compiler returns what it finds
// here as-is; it never re-reads it, so nothing a respondent typed can become
// "$User." or "$field." (review finding, 2026-09-23).
private class Resolved {
  Object filter;
  Map<String, Object> answers = new Map<String, Object>();
}
```

`resolvedFilter` returns a `Resolved`. For a single-value row whose `value` is a token and whose
answer converts to non-null: `key = '__m' + resolved.answers.size()`,
`resolved.answers.put(key, converted)`, `row.put('value', '$field.' + key)`. A token that resolves
to nothing is still left as it was, so the compiler blocks the filter and the step fails (unchanged).
`values` lists are unchanged (the compiler never reads tokens inside them).
`findOne` passes `r.answers` as the compiler's second argument instead of `new Map<String, Object>()`.

- [ ] **Step 4:** both tests pass; run the whole `FinalMappingServiceTest` and `FinalLookupServiceTest`.
- [ ] **Step 5:** deploy the class + test; branch `fix/f2-answers-bound`, PR, merge.

---

## S2 — Answers in filter rows

### Task 3: Publish checks row answers

**Files:** `classes/FinalMappingValidator.cls`, `classes/FinalMappingValidatorTest.cls`

In `checkMatch`, rows branch, after the `$User.` check and before the compile, for every row and
for each token in `value` or in `values`:

| Condition                                                           | Result                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| token names no question on the form                                 | blocker: _"Step N (Contact)'s filter uses a question that's no longer on the form."_      |
| question is matrix / ranking / file                                 | blocker: _"… "Q" gives more than one value, so a filter can't use it."_                   |
| `FinalMappingRules.fieldAt` resolves and answer type doesn't fit it | blocker: _"… the answer to "Q" can't be compared with Field."_ (same compatibility table) |
| question is skippable                                               | warning: _"… filters using "Q", which can be skipped. When it is, this step fails."_      |

- [ ] Tests: one per row of the table, plus "a compatible, required answer produces nothing".
- [ ] Deploy, run `FinalMappingValidatorTest` + `FinalPublishWarningsTest`.

### Task 4: The row choice on screen

**Files:** `lwc/finalRuleEditor/*`, `lwc/finalLookupFilter/*`, `lwc/finalMappingAction/*` (+ tests)

**finalRuleEditor** — new opt-in `@api answerChoices` (default `null`: every current caller renders
exactly as today).

- Shape: `[{ elementKey, label, fits: ['string','email', …] }]` — `fits` in the lowercase
  display-type vocabulary `describeLookupFields` already uses for `sources[].type`.
- In `rows`, per rule: `const fieldType = (this.sources.find(s => s.id === rule.source) || {}).type`;
  `answerOptions = answerChoices.filter(a => a.fits.includes(fieldType))`;
  `usesAnswer = typeof rule.value === 'string' && rule.value.startsWith('$field.')`;
  `offerAnswer = Boolean(this.answerChoices) && SINGLE_VALUE.has(rule.operator) && answerOptions.length > 0`
  where `SINGLE_VALUE = equals, notEquals, contains, greaterThan, lessThan, lte, gte`.
- Markup, inside `r.needsValue`, before the existing value controls:

```html
<template lwc:if="{r.offerAnswer}">
  <select
    class="re-select re-value-kind"
    aria-label="Compare with"
    data-index="{r.index}"
    onchange="{handleValueKind}"
  >
    <option value="fixed" selected="{r.fixedSelected}">A fixed value</option>
    <option value="answer" selected="{r.answerSelected}">The answer to…</option>
  </select>
</template>
<template lwc:if="{r.usesAnswer}">
  <select
    class="re-select re-value"
    aria-label="Question"
    data-index="{r.index}"
    data-prop="value"
    onchange="{handleRuleField}"
  >
    <!-- r.answerOptions, value = "$field.<elementKey>", plus a
             "(question removed)" option when the saved key isn't offered -->
  </select>
</template>
<template lwc:else> …existing bool / number / date / text controls… </template>
```

- `handleValueKind`: `answer` → `rule.value = '$field.' + first answerOption.elementKey`;
  `fixed` → `rule.value = ''`. Emits as usual.
- In `handleRuleField`, when `operator` changes to one outside `SINGLE_VALUE` and the value is a
  token, clear it (a list operator never holds an answer — decision 6). When `source` changes and
  the token's question doesn't fit the new field, clear it.
- A token whose question isn't in `answerChoices` still shows, as "(question removed)", so opening
  the editor never rewrites the saved rule (same rule as the existing "(not valid here)" operator).

**finalLookupFilter** — `@api answerChoices = null;` passed to `<c-final-rule-editor answer-choices={answerChoices}>`.
`ruleValue` / `_toRow` already pass a `$field.` value straight through; no change.

**finalMappingAction** — `get filterAnswerChoices()` from `questions` where `q.mappable`:
`fits = (compatibility[q.answerType] || []).map(t => t.toLowerCase())`. Passed as
`answer-choices={filterAnswerChoices}`.

- [ ] Jest (`finalRuleEditor.test.js`): no `answerChoices` → no "Compare with" select (every
      existing test untouched); with choices → only fitting questions listed; switching to answer
      emits `$field.<key>`; changing operator to Is one of clears a token; a removed question shows
      "(question removed)" and is not rewritten on render.
- [ ] Jest (`finalMappingAction.test.js`): the filter receives choices filtered by compatibility.
- [ ] Deploy the three components; branch `feat/f2-row-answers`, PR, merge.

---

## S3 — The typed WHERE clause

### Task 5: `FinalMappingSoql` — the parser

**Files:** `classes/FinalMappingSoql.cls`, `classes/FinalMappingSoqlTest.cls`

Pure: no queries, no DML, no describe. Used by the validator (Task 6) and the runtime (Task 7).

```apex
public with sharing class FinalMappingSoql {
    public static final Integer MAX_LENGTH = 4000;

    public class Token {
        public String elementId;   // from {!el_x}
        public String fieldPath;   // the field right before the comparison
        public String bindName;    // m0, m1, …
    }

    public class Parsed {
        public String whereClause;             // tokens replaced by :m0, :m1 …
        public List<Token> tokens = new List<Token>();
        public String problem;                 // null when usable; a sentence otherwise
    }

    public static Parsed parse(String clause) { … }
}
```

Rules, in order — the first failure sets `problem` and returns:

1. Blank → _"Write the conditions, or switch back to building them."_
2. Longer than 4,000 → _"Keep the clause under 4,000 characters."_
3. Walk the text once, tracking whether we're inside `'…'` (with `\'` escapes). Outside quotes:
   - `;` → _"Remove the semicolon — this box takes one set of conditions."_
   - `$` → _"`$` values like $User can't be used here. Insert an answer instead."_
   - `:` followed by a letter, `_`, `(` or whitespace → _"Use Insert answer instead of a `:` value."_
     (`LAST_N_DAYS:30` passes: a digit follows.)
   - A banned word (decision 4) as a whole word, any case → _"`LIMIT` can't be used here — this box
     takes only the conditions after WHERE."_ (the word named as typed).
   - `{!` + `[A-Za-z0-9_]+` + `}` → a token. The text before it, trimmed, must end with
     `<path> <op>` where path = `[A-Za-z_][A-Za-z0-9_.]*` and op is one of decision 3's. Otherwise
     _"Put each answer right after a field and a comparison, like `Email = {Your email}`."_
   - Any other `{` or `}` → _"Use Insert answer to add answers — braces can't be typed."_
4. Unclosed quote → _"A quoted value isn't closed."_
5. Brackets that don't balance (outside quotes) → _"The brackets don't match."_

- [ ] `FinalMappingSoqlTest`, one method per rule above, plus: two tokens get `m0` and `m1`; a token
      inside quotes (`Name = '{!el_a}'`) stays literal text; `LAST_N_DAYS:30` passes;
      `Name LIKE {!el_a}` gives fieldPath `Name`; `Account.Type = {!el_a}` gives `Account.Type`;
      `Title = 'SELECT one'` passes (the word is inside quotes); `select` in any case is refused.
- [ ] Deploy; run.

### Task 6: Publish checks the typed clause

**Files:** `classes/FinalMappingValidator.cls`, `classes/FinalMappingValidatorTest.cls`

In `checkMatch`, branch on `str(match.get('filterMode')) == 'soql'`:

1. `Parsed p = FinalMappingSoql.parse(str(match.get('soql')))`; `p.problem != null` → blocker
   _"Step N (Contact)'s conditions: " + p.problem_. Stop.
2. For each token: the question checks from Task 3's table (exists, not matrix/ranking/file, type
   fits `fieldAt(object, fieldPath)`, skippable → warning). A `fieldPath` that doesn't resolve is
   left to step 3, which names it in Salesforce's words.
3. **Test-run as the author:**

```apex
Map<String, Object> binds = new Map<String, Object>();
for (FinalMappingSoql.Token t : p.tokens) {
    binds.put(t.bindName, placeholderFor(FinalMappingRules.fieldAt(d.getName(), t.fieldPath)));
}
try {
    Database.queryWithBinds(
        'SELECT Id FROM ' + d.getName() + ' WHERE ' + p.whereClause + ' LIMIT 0',
        binds,
        AccessLevel.USER_MODE
    );
} catch (Exception e) {
    out.add(new Diagnostic(BLOCKER, id, null,
        name + '’s conditions don’t run: ' + e.getMessage()));
}
```

`placeholderFor`: String/Email/Phone/URL/Picklist/TextArea → `'x'`, number types → `0`,
Date → `Date.today()`, DateTime → `Datetime.now()`, Boolean → `false`, anything else `'x'`.
`d.getName()` comes from describe, never from the spec. `LIMIT 0` returns no rows; `USER_MODE`
means a field or object the author can't see is refused here, before it ever runs as system. 4. The rows branch is skipped in soql mode; rows in `match.filter` left over from before the switch
are ignored (the screen clears them — Task 8 — but publish doesn't depend on that).

- [ ] Tests: each parse problem surfaces as a blocker; an unknown field
      (`Nope__c = 'x'`) is a blocker quoting Salesforce; a token on a field its answer doesn't fit
      is a blocker; a skippable token warns; a clean clause produces nothing; a clause on a field
      the running user can't read (test user with a minimal permission set, fresh `runAs`) is a
      blocker.
- [ ] Deploy; run validator + publish-warnings tests.

### Task 7: The runtime runs the typed clause

**Files:** `classes/FinalMappingService.cls`, `classes/FinalMappingServiceTest.cls`

In `findOne`, after the main match value is resolved:

```apex
String whereClause;
Map<String, Object> binds;
if (match.get('filterMode') == 'soql') {
    FinalMappingSoql.Parsed p = FinalMappingSoql.parse(String.valueOf(match.get('soql')));
    if (p.problem != null) {
        throw new StepException('its conditions can’t run: ' + p.problem);
    }
    binds = new Map<String, Object>();
    for (FinalMappingSoql.Token t : p.tokens) {
        Schema.DescribeFieldResult fd = FinalMappingRules.fieldAt(d.getName(), t.fieldPath);
        Object v = fd == null ? null : FinalMappingRules.answerValue(
            run.answers.get(t.elementId), run.questions.get(t.elementId), fd);
        if (v == null) {
            throw new StepException('the answer to "' + labelOf(run.questions.get(t.elementId)) +
                '" was left blank, so no search was run.');
        }
        binds.put(t.bindName, v);
    }
    whereClause = p.whereClause;
} else {
    … today's compile path (with Task 2's answers map) …
}
binds.put('mappingMatchValue', matchValue);
```

The query string is built exactly as today (`SELECT Id … = :mappingMatchValue AND (…) LIMIT 2`,
`SYSTEM_MODE`). Bind names `m0…` can't collide with the compiler's `b0…` or `mappingMatchValue`.

Also in `execute`: add `catch (QueryException e)` → `StepException(name + ': its search couldn’t run: ' + e.getMessage())`
— today a query error would reach `run()` without the step's name.

- [ ] Tests: typed clause with one answer finds the right Contact; the same with a Choice answer
      against a text field searches the **label** (decision 3); a skipped answer fails the step with
      the "left blank" sentence and writes nothing; a clause that became invalid after publish
      (hand-written spec naming a missing field) fails with "Step 1 (Contact): its search couldn't
      run: …"; two matches still fail as ambiguous.
- [ ] Deploy; run `FinalMappingServiceTest`, `FinalMappingTriggerTest`.

### Task 8: The box on screen

**Files:** `lwc/finalMappingSoql/*` (new), `lwc/finalMappingModel/*`, `lwc/finalMappingAction/*` (+ tests)

**finalMappingModel**

```js
/** Either-or (D50). The other half is cleared, so a spec never carries both. */
export function setFilterMode(spec, actionId, mode) {
  return update(spec, actionId, (a) => {
    a.match = a.match || emptyMatch();
    if (mode === 'soql') {
      a.match.filterMode = 'soql';
      a.match.soql = a.match.soql || '';
      a.match.filter = { logic: 'all', rows: [] };
    } else {
      delete a.match.filterMode;
      delete a.match.soql;
      a.match.filter = a.match.filter || { logic: 'all', rows: [] };
    }
  });
}

export function setSoql(spec, actionId, text) {
  /* sets a.match.soql */
}
```

`actionState`: in soql mode the filter part is complete when `match.soql` is non-blank (the
server judges the rest). `answerIndex`: tokens in `match.soql` count as `use: 'match'` so the answers
index doesn't call them "Stored only".

**finalMappingSoql** (`ms-` classes)

- `@api value` (stored text with `{!id}`), `@api questions` (the same list the action has),
  `@api readOnly`. Emits `soqlchange {value}` with stored text.
- Displays `toDisplay(value)`: each `{!id}` outside quotes → `{Label}` (duplicates `{Label (2)}` in
  form order; unknown id → `{removed question}`).
- A native `<textarea class="ms-text">` (needs `selectionStart` for inserting at the cursor), label
  "Conditions (the part after WHERE)", placeholder `LastName != null AND Title LIKE '%Manager%'`.
- `lightning-combobox` "Insert answer": mappable questions; picking one inserts `{Label}` at the
  cursor and resets the combobox.
- On change: `toStored(text)`; any `{…}` outside quotes that isn't a known label → inline
  `ms-problem` _"There's no question called "X". Use Insert answer."_ and **nothing is emitted**
  until fixed (the box keeps the draft). Otherwise emit.
- Hint under the box: _"Checked when you publish, as you. Answers are compared exactly as typed —
  put each one right after a field, like `Email = {Your email}`."_
- `toDisplay`/`toStored` are exported pure functions in the component's JS for jest.

**finalMappingAction**

- Above the filter: `lightning-radio-group` type button, options "Build with conditions" /
  "Write the conditions", value from `match.filterMode`.
- Switching when the side being left has content (rows present, or non-blank soql) asks first via
  `LightningConfirm` (`lightning/confirm`): _"Switch to writing the conditions? The N conditions
  you've built will be removed."_ / the mirror sentence. Cancel → radio snaps back.
- Soql mode renders `<c-final-mapping-soql>`; rows mode renders the existing `c-final-lookup-filter`.
- The "A filter is required…" note stays under both.

- [ ] Jest: `toDisplay`/`toStored` round-trip incl. duplicate labels, quotes, removed questions;
      unknown `{label}` shows the problem and doesn't emit; Insert answer inserts at the cursor;
      mode switch with rows asks, cancel keeps rows, confirm clears them; `setFilterMode` clears the
      other half; `actionState` soql complete/incomplete.
- [ ] Deploy (Apex from Tasks 5–7 + LWCs); branch `feat/f2-typed-conditions`, PR, merge.

---

## S4 — The step reads as its branches

### Task 9: Layout, pre-fill, two small fixes

**Files:** `lwc/finalMappingAction/*`, `lwc/finalMappingModel/*`, `lwc/finalRuleEditor/*` (+ tests)

**Layout** (find or create):

```
FIND AN EXISTING CONTACT
  Where [Email ▾]  matches the answer to [Your email ▾]
  [Build with conditions | Write the conditions]
  …rows or box…
  A filter is required. Searching every Contact in the org is refused when you publish.

IF ONE IS FOUND
  (unanswered)  the two choice cards, as today
  (answered)    "Use it as-is. Nothing is written to it."  Change
                or "Update the fields ticked 'Also update when found' below."  Change

IF NONE IS FOUND — CREATE A CONTACT WITH
  Field on Contact | Gets its value from | Also update when found (update mode only) | ×
```

- `ma-branch` sections with `h3.ma-subhead` headings: "If one is found", and
  "If none is found — create a {objectLabel} with". An "Always create" step shows one heading:
  "Create a {objectLabel} with".
- The overwrite column header becomes "Also update when found", so it reads as the one place the
  table touches a found record.
- Summaries lose "When one is found," (the heading says it).
- Match-field row tag: "used to find the record — never overwritten" (lock icon stays).

**Pre-fill (D52)** — in `finalMappingModel.setMatch`, after applying the patch:

```js
const m = a.match;
if (m.field && m.source && m.source.kind === 'answer') {
  const row = a.fields.find((f) => f.field === m.field);
  if (!row) {
    a.fields.unshift({
      field: m.field,
      source: { ...m.source },
      prefilled: true
    });
  } else if (row.prefilled && patch.source) {
    row.source = { ...m.source }; // decision 11: follows while untouched
  }
}
```

`setFieldSource` deletes `prefilled` (the author has taken the row over). If `patch.field` changes
to a different field, a still-`prefilled` row for the old field is removed; an edited one stays.
`prefilled` is editor bookkeeping: the validator, writer and runtime ignore unknown keys, and
`FinalMappingWriter`'s fence reads only `field` (checked).

**`why` fix (decision 9)** — `why` is set only when `!entry.source` and the field isn't a lookup.

**Custom logic (decision 10)** — `finalRuleEditor`: `get logicProblem()` returns
_"Check the logic: it names a condition that isn't there, or a bracket isn't closed."_ when
`isCustomLogic` and `evaluateCustomLogic(customLogic, rules.map(() => true)) === null`; shown as
`p.re-logic-problem` with `role="status"` under the expression box.

- [ ] Jest: headings per operation; summaries; pre-fill added once, follows an untouched change,
      stays after an edit, removed when the search field changes; `why` hidden once a source is
      set; logic problem for `1 AND (2 OR 3)` over one rule and clear for `1`; every existing
      `finalRuleEditor` visibility test still passes.
- [ ] Deploy; then the uiux-flow-reviewer pass on the Data mode step before merging.
- [ ] Branch `feat/f2-step-branches`, PR, merge.

---

## S5 — Org walkthrough

### Task 10: As a guest, in `revclouddev`

- [ ] Deploy everything; **publish the site**.
- [ ] Reuse test form `a05hk000001aby9AAA` ("F2 Mapping QA (Claude)").
  1. Step 1 find-or-create Contact by Email ← Work email. Expect the Email row pre-filled.
     Rows mode: `Last Name equals` **the answer to** Your surname. Publish: one warning only if a
     used question is optional.
  2. Guest submits `walk2@example.com` / Walker twice → second reuses the first.
  3. Guest submits a surname of `$User.Name` → a Contact with that literal surname is created
     or found — never the guest user's name.
  4. Switch step 1 to **Write the conditions**: confirm prompt appears; write
     `LastName = {Your surname} AND CreatedDate = LAST_N_DAYS:30`. Publish clean.
     Guest submit → found / created as expected.
  5. Try `LastName = 'x'; DELETE`, `LIMIT 5`, `Nope__c = 1`, `Email = :x` → each is refused at
     publish with its sentence.
- [ ] Record results under "What actually shipped" in this doc; branch `docs/f2-search-shipped`.

## Orphan ledger

- `FinalMappingService.resolvedFilter` changes its return type to the private `Resolved` class.
  Its only caller is `findOne`.
- `finalRuleEditor` gains `@api answerChoices` (default `null`) and a custom-logic hint. Visibility
  rules and lookups render the same except the hint, which only appears on malformed logic.
- `finalLookupFilter` gains `@api answerChoices` (default `null`); lookups don't pass it.
- Spec actions may now carry `match.filterMode`, `match.soql` and `fields[].prefilled`. Every
  published mapping without them behaves exactly as before.
- Nothing is deleted.

## Security Review note

The typed clause is dynamic SOQL built from text an admin typed. The defence, to write up for the
review: only a Form Builder admin can author it; it is parsed with a closed deny-list (no `;`, no
binds, no sub-queries, no `$`, no clause keywords); it is test-run in `USER_MODE` at publish, so
nothing the author can't see gets through; respondent input only ever enters as bind values; the
object name comes from describe. Expect PMD `ApexSOQLInjection` on the two query sites — suppress
them with a `// NOPMD` comment citing this section, not by weakening the rule.
