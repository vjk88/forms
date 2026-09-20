/**
 * What an author should know BEFORE they publish (FREEFORM_SPEC §6.3, D12/D20).
 *
 * These are warnings, never blocks. Each one describes a consequence the
 * author cannot see from the canvas — answers already collected under a
 * different shape, or a question that will fail for the audience the form is
 * open to. The author decides; this class only makes the cost visible.
 *
 * Nothing here writes. It compares the draft about to be published against
 * the version currently live, and against what has already been stored.
 */
public with sharing class FinalPublishWarnings {
    /**
     * @param formId  the form about to be published
     * @param specJson the draft being published
     * @return plain sentences, in the order an author should read them
     */
    @AuraEnabled
    public static List<String> forPublish(Id formId, String specJson) {
        List<String> warnings = new List<String>();
        if (formId == null || String.isBlank(specJson)) {
            return warnings;
        }
        Map<String, Object> draft;
        try {
            draft = (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            return warnings; // publish itself will refuse it, and say why
        }

        Map<String, Map<String, Object>> newQuestions = questionsOf(draft);
        Map<String, Map<String, Object>> liveQuestions = questionsOf(
            liveSpec(formId)
        );
        Set<String> answered = answeredElementKeys(formId);

        // 1. A question whose answers will now land in a different column.
        //    Old rows keep their own Answer_Type__c, so reporting sees one
        //    question stored two ways - worth knowing, not worth blocking.
        //
        //    LATENT (D26, found 2026-09-20). No author can reach this today:
        //    nothing in the Studio writes a question's inputType or its root
        //    type. A type is fixed when the question is dragged from the
        //    palette; delete-then-re-add is a DIFFERENT question with a new
        //    id, which is warning 2; and importForm always creates a new
        //    Draft form, which has no answers to warn about. Kept because it
        //    is correct and cheap, and becomes live the day a change-type
        //    control exists. Its tests build the before/after specs directly,
        //    which is exactly why the gap went unnoticed - do not read them
        //    as evidence that the path works.
        for (String elementId : newQuestions.keySet()) {
            if (!liveQuestions.containsKey(elementId)) {
                continue;
            }
            if (!answered.contains(elementId)) {
                continue;
            }
            String was = FinalSubmitService.answerTypeOf(
                liveQuestions.get(elementId)
            );
            String now = FinalSubmitService.answerTypeOf(
                newQuestions.get(elementId)
            );
            if (was == now) {
                continue;
            }
            warnings.add(
                'Answers already collected for "' +
                    labelOf(liveQuestions.get(elementId), elementId) +
                    '" are stored as ' +
                    was.toLowerCase() +
                    '. New answers will be stored as ' +
                    now.toLowerCase() +
                    ', so reports will show this question in two places.'
            );
        }

        // 2. A question that has answers, being removed. Re-adding it later
        //    mints a NEW id, which reports treat as a different question.
        for (String elementId : liveQuestions.keySet()) {
            if (newQuestions.containsKey(elementId)) {
                continue;
            }
            if (!answered.contains(elementId)) {
                continue;
            }
            warnings.add(
                'You are removing "' +
                    labelOf(liveQuestions.get(elementId), elementId) +
                    '", which already has answers. They stay on their' +
                    ' submissions, but adding the question back later counts' +
                    ' as a different question.'
            );
        }

        // 3. Public access + file questions. Guests cannot upload yet (D20),
        //    so the respondent would meet this as an error at submit time -
        //    the worst possible moment to discover it.
        if (isPublic(formId)) {
            List<String> fileQuestions = fileQuestionLabels(draft);
            if (!fileQuestions.isEmpty()) {
                warnings.add(
                    '"' +
                        String.join(fileQuestions, '", "') +
                        '" cannot accept files from people who are not' +
                        ' signed in. They will see an error when they submit.'
                );
            }
        }
        return warnings;
    }

    /** Every question in a spec, by element id. Content blocks are skipped. */
    private static Map<String, Map<String, Object>> questionsOf(
        Map<String, Object> spec
    ) {
        Map<String, Map<String, Object>> out = new Map<String, Map<String, Object>>();
        if (spec == null) {
            return out;
        }
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            for (
                Object secObj : asList(
                    page == null ? null : page.get('sections')
                )
            ) {
                Map<String, Object> sec = asMap(secObj);
                for (
                    Object elObj : asList(
                        sec == null ? null : sec.get('elements')
                    )
                ) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null || !(el.get('id') instanceof String)) {
                        continue;
                    }
                    if (!isQuestion(el)) {
                        continue;
                    }
                    out.put((String) el.get('id'), el);
                }
            }
        }
        return out;
    }

    private static final Set<String> BLOCK_TYPES = new Set<String>{
        'richText',
        'image',
        'callout',
        'divider',
        'spacer'
    };

    private static Boolean isQuestion(Map<String, Object> el) {
        Object t = el.get('type');
        String type = t instanceof String ? (String) t : '';
        return !BLOCK_TYPES.contains(type) && type != 'file';
    }

    private static List<String> fileQuestionLabels(Map<String, Object> spec) {
        List<String> out = new List<String>();
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            for (
                Object secObj : asList(
                    page == null ? null : page.get('sections')
                )
            ) {
                Map<String, Object> sec = asMap(secObj);
                for (
                    Object elObj : asList(
                        sec == null ? null : sec.get('elements')
                    )
                ) {
                    Map<String, Object> el = asMap(elObj);
                    Object t = el == null ? null : el.get('type');
                    if (t instanceof String && (String) t == 'file') {
                        out.add(labelOf(el, 'A file question'));
                    }
                }
            }
        }
        return out;
    }

    private static String labelOf(Map<String, Object> el, String fallback) {
        Object label = el == null ? null : el.get('label');
        return label instanceof String && String.isNotBlank((String) label)
            ? (String) label
            : fallback;
    }

    /** The spec currently live for this form, or null when nothing is. */
    private static Map<String, Object> liveSpec(Id formId) {
        List<Form_Version__c> live = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            WITH USER_MODE
            ORDER BY Version_Number__c DESC
            LIMIT 1
        ];
        if (live.isEmpty() || String.isBlank(live[0].Spec_JSON__c)) {
            return null;
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(
                live[0].Spec_JSON__c
            );
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Element keys that already have answers for this form, in EITHER store.
     * A form only ever fills one of them, so asking both costs one query and
     * keeps this class from having to care which type the form is.
     */
    private static Set<String> answeredElementKeys(Id formId) {
        Set<String> keys = new Set<String>();
        for (AggregateResult ar : [
            SELECT Element_Key__c key
            FROM Form_Submission_Answer__c
            WHERE Form_Submission__r.Form__c = :formId
            WITH USER_MODE
            GROUP BY Element_Key__c
            LIMIT 2000
        ]) {
            keys.add((String) ar.get('key'));
        }
        for (AggregateResult ar : [
            SELECT Element_Key__c key
            FROM Form_Response_Answer__c
            WHERE Form_Response__r.Form_Version__r.Form__c = :formId
            WITH USER_MODE
            GROUP BY Element_Key__c
            LIMIT 2000
        ]) {
            keys.add((String) ar.get('key'));
        }
        // Matrix answers are stored as '<elementId>:<statement>'; the
        // question they belong to is what an author recognises.
        Set<String> out = new Set<String>();
        for (String key : keys) {
            if (key == null) {
                continue;
            }
            Integer colon = key.indexOf(':');
            out.add(colon > 0 ? key.substring(0, colon) : key);
        }
        return out;
    }

    private static Boolean isPublic(Id formId) {
        List<Form__c> forms = [
            SELECT Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            WITH USER_MODE
            LIMIT 1
        ];
        return !forms.isEmpty() &&
            String.isNotBlank(forms[0].Allowed_Adapters__c) &&
            forms[0].Allowed_Adapters__c.contains('Public_Guest');
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
}
