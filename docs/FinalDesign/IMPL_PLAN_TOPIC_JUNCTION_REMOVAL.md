# Survey topics: text field only (#67) and a real topic picker (#31)

Owner 2026-11-16. Ruling: **no junction object.** Topics live only in the answer's text field
`Form_Response_Answer__c.Topic_Snapshot__c`, names joined with `"; "` (unchanged separator). The owner
deletes the `Form_Answer_Topic__c` object in the org themselves.

## Why

Each submitted survey writes 1 `Form_Response__c` + 1 `Form_Response_Answer__c` per question + 1
`Form_Answer_Topic__c` per answer per topic. At ~2 KB per record, the junction can double a response's
storage. Nothing reads it: the survey report type (`Survey_Responses_with_Answers`) groups and filters on
`Topic_Snapshot__c`, no screen or Apex reads the links (verified 2026-11-16: only the writer, two test classes
and a permission set reference it). Trade-off accepted: a question with several topics can be filtered
("Topics contains Support") but not grouped per topic in standard reports.

## Build

1. **`FinalSubmitService.cls`, survey path (`runSurvey`, ~lines 1255-1380):**
   - Delete the `Form_Answer_Topic__c` insert block (`List<Form_Answer_Topic__c> links ...` through
     `insertFenced(links)`, ~1367-1380).
   - Row budget: `groupRows += 1 + topicsPerRow[i].size()` becomes `groupRows += 1` (topic links no
     longer cost rows). Drop `topicsPerRow` entirely if nothing else reads it.
   - Keep `validTopicIds(...)` and the snapshot writer (~2290: `String.join(names, '; ').abbreviate(255)`):
     topics are still validated against active `Survey_Topic__c` Ids before their names are written.
   - Update the doc comment that mentions "Form_Answer_Topic__c tag links" (~1255).
2. **Tests:** `FinalSurveySubmitTest.cls`, `FinalSubmitFenceTest.cls`: replace every assertion that
   queries `Form_Answer_Topic__c` with an assertion on `Topic_Snapshot__c` (exact names, `"; "`
   separated, order as stored on the question). Add one test: a question with 2 topics writes
   `"A; B"` and inserts no other record type than response + answers.
3. **`permissionsets/Form_Builder_Admin.permissionset-meta.xml`:** remove the object permission and
   both field permissions for `Form_Answer_Topic__c` (`Answer__c`, `Topic__c`).
4. **Source:** delete `objects/Form_Answer_Topic__c/` from the repo (object + `Answer__c`, `Topic__c`)
   so git matches the org after the owner's delete. Deploy steps 1-3 **before** the org delete
   (Apex that names the object blocks deleting it).
5. `grep -rn "Form_Answer_Topic" force-app docs` must return only history (archive/plan docs).

## Done when

- The Apex test classes that submit surveys pass (`FinalSurveySubmitTest`, `FinalSubmitFenceTest`,
  `FinalSurveyObjectTest`, `FinalAnswerValidatorTest`).
- A real survey submit in `revclouddev` with a topic-tagged NPS question writes the snapshot text and no
  junction row; the `Survey_Responses_with_Answers` report still shows the topic column.
- DEFERRED #67 marked done in the same PR.

---

# Part 2: pre-defined topics, picked from a dropdown (DEFERRED #31)

Owner rulings 2026-11-18: **only users with a permission can create a topic while editing a question**;
**admins manage topics on a native Salesforce tab.** Build after Part 1 (or alongside; no shared files except
the permission set). Surveys only; Freeform has no topics.

## Today (verified 2026-11-18)

- `finalPropertyPanel.html` ~356-387: **Topics (chart tags)** = chips for the question's topics plus a text
  `<input list>` with a `<datalist>` of suggestions. Shown only on NPS, Rating, Opinion Scale, Emoji Scale,
  Yes/No, Image Choice, Likert, Ranking and Matrix questions.
- `finalPropertyPanel.js` ~1048-1090: `topicChips`, remove, and `handleTopicEntry`, which **creates any
  typed name** through `FinalStudioController.createSurveyTopic` (~line 1025).
  `listSurveyTopics` (~line 1002) supplies the suggestions.
- `Survey_Topic__c` has `Active__c`; there is no tab, so nothing in the app can reach it.

## Build

1. **Custom permission `Create_Survey_Topics`** ("Create survey topics while building"), granted in
   `Form_Builder_Admin`.
2. **`FinalStudioController`:**
   - `listSurveyTopics`: active topics only, sorted by name, USER_MODE (no change if already so). Add
     `canCreateSurveyTopics()` (`@AuraEnabled(cacheable=true)`:
     `FeatureManagement.checkPermission('Create_Survey_Topics')`), or return the flag with the list.
   - `createSurveyTopic`: **refuse without the permission** (server is the gate, the hidden UI is just
     courtesy). Keep the existing exact-name dedupe; make it case-insensitive and trimmed.
3. **Panel (`finalPropertyPanel`)**: replace the text box + datalist with a `lightning-combobox`
   (label "Add a topic", placeholder "Pick a topic") listing active topics not already on the question.
   Picking one adds a chip; chips keep their × to remove (unchanged).
   - With the permission: a last option **"Create a topic…"** opens a small inline box (name + Add,
     DESIGN_SYSTEM inline-confirm pattern 5.17, never `lightning/confirm`) that calls `createSurveyTopic`
     and adds the new chip.
   - No active topics and no permission: the combobox is replaced by one line:
     "No topics yet. An admin adds them on the Survey Topics tab."
   - A chip whose topic was since deactivated still shows (it's the question's history), marked
     "(inactive)"; it can be removed but not re-added.
   - Restyle only, per DESIGN_SYSTEM §0: Studio tokens, sentence case.
4. **Native tab:** `tabs/Survey_Topic__c.tab-meta.xml`, an "All topics" list view (Name, Active,
   Description if it exists, Last modified), added to the Forms app's navigation if the app lists tabs.
   Object and field access for `Survey_Topic__c` in `Form_Builder_Admin` (read for builders, full for admins:
   follow the existing pattern there).
5. **Seed:** keep the existing seed (Support, Onboarding); no change.

## Tests

- Apex: `createSurveyTopic` refused without the permission, allowed with it (assign the permission set in
  a fresh `runAs` user); duplicate names (case/space variants) return the existing topic; the list holds
  active topics only.
- Jest (`finalPropertyPanel`): combobox lists only unused active topics; picking adds a chip; the
  "Create a topic…" option appears only with the permission; empty state text without topics or
  permission; an inactive chip is labelled and removable.
- Org: on the Studio host, a builder without the permission can't create; an admin can, and the topic
  then appears on the Survey Topics tab; a submitted survey still writes the snapshot (Part 1).

## Done when

All the above pass, it's checked on `/apex/FinalStudio`, and DEFERRED #31 is marked done in the same PR.
