# Picklist / choice dropdown in the conditions editor (DEFERRED #29)

Status: **BUILT and verified in the Studio** (2026-11-21; owner: "sounds good, show it broken").

## Rulings (owner, 2026-11-21)

1. When the rule's source has a fixed list of values (a picklist field, a choice question), the
   Value control is a **dropdown of the configured values**, not free text.
2. **A value that is no longer in the list is shown, broken, never hidden or replaced:** it stays
   selected as "<value> (no longer a choice)", the rule shows a warning ("This rule checks for a
   value the question no longer offers, so it can never match."), and publish warnings list it.
   The author picks a real value or deletes the rule.
3. Values come **live**: picklist-bound questions and record fields read Salesforce when the
   Studio opens (not the `config.options` copy saved when the question was added); survey /
   choice questions use the choices in the form.
4. **Inactive** picklist values: offered, marked "(inactive)", for rules on a **record field**
   (old records can still hold them); not offered for rules on a question's answer.
5. Changing a rule's source **clears** its value (the author picks again).
6. List operators (lookup filters' "in / includes / excludes") pick **several** values.

## Where (one component, three screens)

`c/finalRuleEditor` serves Show conditions (`finalConditionsModal`), lookup filters
(`finalLookupFilter`) and Freeform find-or-create searches. The dropdown applies wherever the
source has a value list:
- **Question sources** (`sources` + `sourceIndex`): add the question's options to its
  `sourceIndex` entry. Picklist-bound questions: live values from
  `FinalStudioController.describeFields(objectApi)` (the Studio already calls it); survey /
  choice questions: `element.config.options`.
- **Record-field sources** (the searchable field picker; `describeLookupFields` /
  `describeReadableFields` in `FinalLookupController`, which return `picklistValues`): add the
  inactive values separately so they can be offered and marked.
- Today `VALUE_KIND` keeps picklist as `'text'` with a comment pointing at #29; that becomes a
  `'choice'` kind.

## Broken values

- Dropdown options = the live list + (when the saved value is not in it) the saved value, selected,
  labelled with the new label `Final_*` / Studio wording "(no longer a choice)".
- Row warning uses the editor's existing per-row problem display (`data-problem`).
- Publish warnings: extend the existing visibility lint (`finalExpressionEngine.lintVisibility`,
  used by the Studio's publish check) with a "value no longer offered" warning, given the option
  lists. Warning, not a publish blocker (consistent with the other lint warnings).
- At runtime nothing changes: a rule whose value is gone simply never matches.

## Tests

- Jest: dropdown appears for picklist / choice sources and not for text; options live vs spec;
  missing value shown selected + warning; inactive offered only for record fields; source change
  clears the value; list operators multi-pick; lint warning for a gone value.
- Apex: the describe methods return inactive values separately (existing tests extended).
- Studio host: a Show condition on a picklist question, then a value removed from the form's
  choices shows "(no longer a choice)" + the warning + a publish warning.
