# Server-side answer validation (DEFERRED #24)

Owner 2026-11-15: "do it", phased: **Medium now, Large next**.

## Why

Required / pattern / range checks run only in the browser (`finalExpressionEngine.validateElement`). A
hand-edited submit request (the payload is plain JSON, visible in dev tools) can skip a required question
or send an out-of-range number, and the server saves it. It is not a security hole: the spec allow-list,
availability, caps and CRUD/FLS are already enforced on the server, and Salesforce's own required fields and
validation rules still fire. But Security Review tests for browser-only validation, and a skipped required
consent box would store a record that claims consent nobody gave.

## Phase 1 (this change): what the server checks

One shared walk, `FinalAnswerValidator` (new Apex class), called by all three submit paths in
`FinalSubmitService` (form, survey, freeform) **before anything is written**. Failures come back through the
existing `SubmitOutcome.errors` / `FieldError` path, so the browser shows them on the question that failed,
exactly like server lookup errors do today.

For every element's `validation` entries (FORM_SPEC_SCHEMA §7; `el.required` is authoring sugar the
serializer compiles into a `required` entry):

| Entry | Checked when | Rule (mirrors `validateEntry` / `validateElement`) |
| --- | --- | --- |
| `required` | the element, its section and its page carry **no** visibility rule, and the entry has no `when` | blank value fails. yesNo: `false` is an answer. consent/checkbox: `false` fails. matrix: every row answered. |
| `pattern` | the value was sent and is not blank, entry has no `when` | the regex must **find** a match (JS `test()` semantics, not Apex `matches()`); a pattern Apex can't compile never blocks |
| `range` | sent, not blank, no `when` | must parse as a number and sit within min/max |
| `custom` | never in phase 1 | compares two answers through the rule engine: phase 2 |

**Absent vs blank.** The browser sends only answered questions and drops answers hidden by a rule. So:
- a **new record or response**: a required element that is absent or blank fails (it has no rule, so it was shown);
- a **record-page edit** (`existingRecordId`): only a required element that was **sent blank** fails. An absent
  one means "unchanged", and the record already holds its value.

**Messages.** The entry's own `message`, else the same default the browser uses. Guests get the same message
(it names their own question, nothing about data they can't see).

Not in scope: repeat-section entries (they already have server checks: min/max, per-entry), file questions,
`custom` entries, anything gated by a rule.

## Phase 2 (next, Large): the rules on the server

Port `finalExpressionEngine`'s visibility logic to Apex (7 operators, all/any/custom logic with NOT,
three-valued UNKNOWN; record facts already computed server-side by `FinalSurveyObjectController`; user facts
from `UserInfo`), then lift the phase-1 exclusions: rule-gated `required`, `when`-gated entries and `custom`.
One shared JSON test-vector file runs in both jest and Apex so the two evaluators can never disagree.

## Tests

Apex: required absent/blank/present for each path; yesNo false passes; consent false fails; matrix partial
fails; pattern find-semantics and a malformed pattern; range bounds and non-numbers; rule-gated and
`when`-gated entries skipped; edit mode absent passes and blank fails; nothing is written on failure.
Org: a crafted payload against a real published form is refused with the field-scoped message; a normal
submit still saves.
