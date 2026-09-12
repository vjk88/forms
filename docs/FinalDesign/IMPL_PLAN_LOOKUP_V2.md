# IMPL_PLAN — Lookup v2: custom control + native field mode

> Status: **DRAFT FOR OWNER REVIEW. No code written.**
> Supersedes the reverted v1 (PRs #264-#268, removed by #270).
> Source of truth for scope: the feature list agreed 2026-09-11, plus
> `GUEST_PREFILL_LOOKUP_SPEC.md` §Lookup, which already specified a custom
> Apex-backed control and said in as many words that the filter rows reuse the
> visibility-rule operators.

---

## 1. Why v1 was wrong, in one paragraph

`finalLookup` was built on `lightning-record-picker`. That control was never
chosen for this job — it arrived as a placeholder inside the Autofill commit
(`0e88e5f`) and later work treated it as the foundation. Everything painful
about v1 descends from it: an eleven-operator ceiling, one level of
relationship traversal, a selection that silently survives a filter change, no
control over result rows, and a hard refusal for guests that currently ships as
product copy. None of those are lookup problems. They are UI API problems.

---

## 2. Two modes, chosen per element, never mixed

|                   | **Native field mode**                                                        | **Custom mode**                     |
| :---------------- | :--------------------------------------------------------------------------- | :---------------------------------- |
| Renders           | `lightning-input-field` inside `lightning-record-edit-form`                  | `c/finalLookup` over an Apex search |
| Filter source     | The field's **configured Salesforce lookup filter**, applied by the platform | Our `lookupConfig` filter rows      |
| Dependent lookups | Free, platform-driven                                                        | Our engine                          |
| Guests            | **No** (UI API)                                                              | Yes, hard-gated                     |
| Object coverage   | UI-API-supported objects only                                                | Any queryable object                |
| Available when    | The form is bound to that object **and** the element binds that field        | Always                              |

A field's configured lookup filter is the platform's business. Native field mode
lets the platform enforce it. Custom mode does not read it, reimplement it, or
care that it exists.

**Authoring surface:** one radio in the element inspector.
_Use the field's Salesforce lookup filter_ / _Use my own conditions_. The first
is offered only when the element is bound to a reference field on the form's
target object. Choosing it hides the filter rows entirely.

---

## 3. Native field mode

- A section holding at least one native-mode field wraps its body in
  `lightning-record-edit-form` with `object-api-name`, `record-id` and
  `record-type-id`. We never call its `submit()`. It is a **render and FLS
  container only**; our own Apex still owns the save.
- The lookup renders as `lightning-input-field` with `variant="label-hidden"`,
  so our label, help text and error chrome stay ours.
- Values are harvested from the field's `change` event
  (`event.detail.value`, keyed by `event.target.fieldName`) and written into the
  answers map through the normal path. For a lookup that value is the record id,
  which is what the payload already carries.

**We inspect nothing.** Whatever the platform does with that field — lookup
filters, dependent lookups, record-type behaviour — is the platform's business
and happens without our involvement. An author who wants native behaviour picks
native mode and gets it. We do not read, mirror, warn about, or engineer around
any of it.

---

## 4. Custom mode — the pieces

### 4.1 `c/finalLookup` (rewritten, one component)

An ARIA combobox. No `lightning-record-picker`, no second runtime component.

- Type-ahead: 300 ms debounce, 2-character minimum, 8 results, per the spec.
- Result rows: primary line plus one secondary line, each able to show a
  cross-object field.
- Full keyboard: up, down, home, end, escape, enter, plus
  `aria-activedescendant` and a live region for result counts.
- States it renders: idle, loading, results, no results, selected pill,
  read-only pill, disabled, invalid.
- One error line, owned by the component.
- Flow-facing `@api` attributes so an admin can set target object, display
  fields, search fields and filter rows without Forms.

**This is the risk line item.** A hand-rolled combobox is where accessibility
goes to die. Budget real time for it and test with a screen reader, not just
Jest.

### 4.2 `FinalLookupService.cls` — one compiler, two callers

The same compiled WHERE clause serves search and verification. This is the
single most important structural decision in the plan: it deletes the entire
class of bug where the dropdown and the submit check disagree.

- `search(formId, versionId, elementId, term, answers)` — config read from the
  **published spec**, never from the client.
- `verify(formId, versionId, elementId, recordIds, answers)` — same compile,
  `Database.queryWithBinds(..., AccessLevel.USER_MODE)`.
- Parameter-bound throughout. No string concatenation of values, ever.
- Operators: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `like`, `in`, `nin`,
  `includes`, `excludes`.
- Relationship traversal beyond one level, because we own the SOQL.
- Value sources: constant, another answer, `$User.*`, record context.

Because there is only SOQL and no GraphQL, the timezone-parity problem that
consumed a whole section of the other plan **does not exist here**. One engine
cannot disagree with itself.

### 4.3 Reuse from the rule stack

- `evaluateCustomLogic` from `c/finalExpressionEngine`, **as-is**. It already
  parses `1 AND (2 OR 3)` with parentheses and precedence and returns null on
  malformed input. `lintVisibility` already probes it at build time.
- `c/finalRuleEditor` as the authoring shell. It already has All / Any / Custom
  with the expression box, rule rows, type-driven operator lists, a guard that
  keeps showing an operator a repointed source no longer offers, and
  bool/number/date value inputs. It takes `@api sources` and `@api noun`, so it
  can be pointed at object fields instead of form answers.

**What must be added, not reused:** the rule vocabulary speaks seven operators
covering five of the eleven we need. `lte`, `gte`, `in`, `nin`, `includes` and
`excludes` are new, in both the editor's option list and the compiler. The
evaluator itself is not reusable at all — rules _answer_ a question in the
browser, a filter is _compiled_ into a query. Same row shape, opposite
direction.

**And there is no Apex logic parser anywhere in the repo.** Record rules dodge
it by having the server compute per-row facts and the client combine them. A
filter has to be combined server-side to become SOQL, so `filterLogic` in Apex
is genuinely new code.

---

## 5. Reactive behaviour (the 2026-09-11 rulings)

- **No blocking.** A child never refuses to search because its parent is empty.
  Authors hide it with an ordinary visibility rule.
- **Never auto-write a visibility rule** from a filter.
- **No clearing.** When the compiled filter changes, keep the selection, mark
  the field invalid, and show the error immediately, using the same message the
  server check produces.
- Submit is the enforcement point, and a form with an invalid lookup cannot be
  submitted.
- Re-check down a chain, parent first, once each.
- No re-check on a no-op write, and none when loading a saved record.
- Hidden lookups are excluded from the payload and never checked (already true,
  PR #269).

---

## 6. Slices

| #   | Slice                                                                     | Ships alone?   |
| :-- | :------------------------------------------------------------------------ | :------------- |
| S0  | `lookupConfig` schema + mode flag + publish gate                          | no, foundation |
| S1  | `FinalLookupService` compiler, search + verify, all operators, Apex tests | yes            |
| S2  | `c/finalLookup` rewritten as an ARIA combobox over S1                     | yes            |
| S3  | Authoring: rule-editor shell + field pickers + operator widening          | yes            |
| S4  | Viewer wiring: recompile, mark-invalid, cascade, submit gate              | yes            |
| S5  | Native field mode: record-edit-form container                             | yes            |
| S6  | Guest gating: allow-list, rate discipline, no field-level detail          | yes            |
| S7  | Environment verification: LEX, Lightning Out, Experience Cloud, guest     | gate           |

S5 is independent of S1-S4 and could move earlier if the record-edit path
matters more than the guest path.

---

## 7. Limitation ledger — read this before approving

**Native field mode**

1. **UI API object coverage is not universal.** Some objects are unsupported.
   Needs a per-object gate at authoring time, verified against the org rather
   than assumed.
2. **No guests.** UI API is unavailable to guest users, so this mode is
   authenticated-only by nature.
3. **The platform owns the filter.** We cannot add conditions on top of it. It
   is the field's filter or ours, never both.
4. **Styling drift.** `lightning-input-field` brings SLDS defaults that our
   theme engine does not control as tightly as our own inputs.
5. **Record type matters.** Lookup filters can differ per record type, so
   `record-type-id` has to be passed and kept current.
   **Custom mode**

6. **Accessibility is the real cost.** A hand-rolled combobox is the usual
   failure point. This needs screen-reader testing, not just unit tests.
7. **Apex on every keystroke.** Debounce, minimum length and result caps are
   specified, but query selectivity on large objects still needs attention.
8. **We lose recent items, object icons and free maintenance.** Salesforce
   stops fixing our combobox for us.
9. **Guest search is a data-exposure decision, not only a technical one.** An
   anonymous visitor must not be able to enumerate an object by typing one
   letter. The spec's answer is the hard-gated, spec-derived object and field
   allow-list with config read only from the published spec. That line has to
   hold or the feature should stay off.
10. **This contradicts the standing preference for native base components.** It
    is a deliberate exception, and the guest gap is the reason.

---

## 8. Owner rulings, 2026-09-11

1. **Native field mode ships first.** It becomes S1; the custom control follows.
2. **Platform filter only in native mode.** The field's configured filter, take
   it or leave it. An author who needs more switches that element to custom
   mode. We never layer our rows on top of it.
3. **Guest search is in scope for v1**, hard-gated by the spec-derived object
   and field allow-list.

---

## 9. S1 detail — native field mode

### 9.2 Where the form wraps

**Section level**, matching legacy `formSectionRenderer`. A section holding at
least one native-mode element renders its body inside
`lightning-record-edit-form`.

Considered and rejected: per-element wrapping puts every field in its own form,
which strands each field on its own and defeats the point. Page-level
wrapping would cover more but means touching every layout template, and nesting
the layout inside a form invites styling and nested-form trouble.

**Consequence, stated plainly:** a controlling field in a _different section_
will not be seen by the filter. The filter then reads the saved record value
instead of the user's unsaved edit. Authors get a warning at publish when a
native-mode lookup's controlling field lives outside its section.

### 9.3 Files

| File                       | Change                                                                   |
| :------------------------- | :----------------------------------------------------------------------- |
| `lwc/finalSectionRenderer` | wrap body in `record-edit-form` when the section needs it                |
| `lwc/finalElementRenderer` | `lightning-input-field` branch for native mode, `variant="label-hidden"` |
| `lwc/finalFormViewer`      | pass record context down; harvest field `change` into the answers map    |
| `lwc/finalPropertyPanel`   | the mode radio, offered only for a bound reference field                 |
| `FORM_SPEC_SCHEMA.md`      | `element.lookupMode: "native" \| "custom"`, default custom               |

### 9.4 Not in S1

Custom mode, the Apex compiler, the combobox, guest search, filter authoring.
`finalLookup` keeps its current `lightning-record-picker` body until S2 replaces
it, so nothing regresses for authenticated non-record-bound forms.
