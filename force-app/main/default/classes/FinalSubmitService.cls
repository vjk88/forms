/**
 * FinalSubmitService — the shared form-submission engine (Phase A, slice A1).
 *
 * ONE mapping/savepoint engine, TWO postures. Extracted from
 * FinalSubmitController so the internal and guest submit paths run identical
 * spec→record mapping, type coercion, and atomic parent+repeat-children DML —
 * differing ONLY in how the write is authorized:
 *
 *   INTERNAL — the running user's own CRUD/FLS: Security.stripInaccessible
 *              (CREATABLE) then `insert as user`. Byte-for-byte the
 *              pre-refactor FinalSubmitController behavior.
 *   GUEST    — the PUBLISHED SPEC is the allow-list. The field walk only ever
 *              maps fields the spec binds, so a guest can never name an object
 *              or field by crafting a payload. DML runs
 *              Database.insert(records, true, AccessLevel.SYSTEM_MODE) —
 *              system mode stated EXPLICITLY (guests own nothing; user-mode DML
 *              would fail, and v67 flips the default to user mode). The hard
 *              gate + spec allow-list are the trust boundary, not sharing.
 *              Callers (FinalGuestController) own the gating and the
 *              guests-never-update rule.
 *
 * `inherited sharing`: runs with-sharing under FinalSubmitController and
 * without-sharing under FinalGuestController; the guest DML is SYSTEM_MODE so
 * the sharing keyword is moot on that path.
 */
public inherited sharing class FinalSubmitService {
    public enum Posture {
        INTERNAL,
        GUEST
    }

    /**
     * WHERE a set of answers is stored.
     *
     * Survey and Freeform run the same walk over the same spec and build the
     * same rows; they differ only in which two objects receive them and
     * whether survey analytics apply. One descriptor instead of a second copy
     * of 200 lines - the value columns share their API names precisely so
     * this can work.
     */
    private class AnswerSink {
        SObjectType answerType;
        String parentField;
        Boolean writesAnswerType;
        Boolean appliesAnalytics;

        AnswerSink(
            SObjectType answerType,
            String parentField,
            Boolean writesAnswerType,
            Boolean appliesAnalytics
        ) {
            this.answerType = answerType;
            this.parentField = parentField;
            this.writesAnswerType = writesAnswerType;
            this.appliesAnalytics = appliesAnalytics;
        }

        SObject newRow(Id parentId) {
            SObject row = answerType.newSObject();
            row.put(parentField, parentId);
            return row;
        }
    }

    private static AnswerSink surveySink() {
        return new AnswerSink(
            Form_Response_Answer__c.SObjectType,
            'Form_Response__c',
            false,
            true
        );
    }

    private static AnswerSink freeformSink() {
        return new AnswerSink(
            Form_Submission_Answer__c.SObjectType,
            'Form_Submission__c',
            true,
            false
        );
    }

    public class SubmitOutcome {
        public Id recordId;
        public Integer childCount;
        /** Populated INSTEAD of recordId when the save was rejected and the
         *  caller is entitled to field-level detail (never a guest). */
        public List<FieldError> errors;
    }

    /**
     * One rejected write, carrying the fields it blames.
     *
     * The old build returned this shape and the respondent landed on the exact
     * field that failed; the rebuild collapsed every failure into a single
     * sentence, so a validation rule on one field told the respondent nothing
     * about which. `fields` may be empty — object-level and cross-field rules
     * name nothing, and those become a form-level message.
     */
    public class FieldError {
        @AuraEnabled
        public String message;
        @AuraEnabled
        public List<String> fields;
    }

    // ------------------------------------------------- lookup enforcement

    /**
     * The submit-time half of the lookup contract.
     *
     * The browser filtered a dropdown; that is UX, not security. Every lookup
     * answer is re-checked here against the SAME compiled filter the search
     * used, under the submitting user's own permissions. A record that no
     * longer qualifies is refused before anything is written, so a form can
     * never half-save around a bad reference.
     *
     * A guest is told a field is not acceptable and nothing else — naming the
     * filter would describe data they cannot see.
     */
    private static List<FieldError> lookupErrors(
        Map<String, Object> spec,
        Map<String, Object> answers,
        Posture mode
    ) {
        List<FieldError> out = new List<FieldError>();
        if (answers == null || answers.isEmpty()) {
            return out;
        }
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null) {
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null) {
                        continue;
                    }
                    Map<String, Object> cfg = asMap(el.get('lookupConfig'));
                    if (cfg == null) {
                        continue;
                    }
                    String elId = (String) el.get('id');
                    Object raw = answers.get(elId);
                    if (
                        !(raw instanceof String) || String.isBlank((String) raw)
                    ) {
                        continue; // nothing chosen is not a violation
                    }
                    Id chosen;
                    try {
                        chosen = Id.valueOf((String) raw);
                    } catch (Exception e) {
                        out.add(
                            lookupError(el, mode, 'is not a valid selection.')
                        );
                        continue;
                    }
                    Set<Id> ok = FinalLookupService.verify(
                        cfg,
                        new Set<Id>{ chosen },
                        answers
                    );
                    if (!ok.contains(chosen)) {
                        out.add(
                            lookupError(
                                el,
                                mode,
                                'is no longer available for the answers on this form.'
                            )
                        );
                    }
                }
            }
        }
        return out;
    }

    private static FieldError lookupError(
        Map<String, Object> el,
        Posture mode,
        String reason
    ) {
        FieldError fe = new FieldError();
        String label = (String) el.get('label');
        if (mode == Posture.GUEST) {
            fe.message = 'One of your answers could not be accepted.';
        } else {
            fe.message =
                (String.isBlank(label) ? 'That selection' : label) +
                ' ' +
                reason;
        }
        // The client routes by bound field name; an unbound question has none
        // and becomes a form-level message rather than a mis-aimed one.
        fe.fields = new List<String>();
        Map<String, Object> binding = asMap(el.get('binding'));
        String field = binding == null ? null : (String) binding.get('field');
        if (String.isNotBlank(field)) {
            fe.fields.add(field);
        }
        return fe;
    }

    /**
     * DmlException → per-field errors.
     *
     * `getDmlFieldNames` (NOT `getDmlFields`, which returns SObjectField
     * tokens) gives the API names the spec already binds, so the client maps
     * them straight to elements with no describe call.
     */
    private static List<FieldError> dmlErrors(DmlException e) {
        List<FieldError> out = new List<FieldError>();
        for (Integer i = 0; i < e.getNumDml(); i++) {
            FieldError fe = new FieldError();
            fe.message = e.getDmlMessage(i);
            fe.fields = e.getDmlFieldNames(i) == null
                ? new List<String>()
                : e.getDmlFieldNames(i);
            out.add(fe);
        }
        if (out.isEmpty()) {
            FieldError fe = new FieldError();
            fe.message = e.getMessage();
            fe.fields = new List<String>();
            out.add(fe);
        }
        return out;
    }

    /**
     * Maps an already-parsed payload onto the spec's bound target object and
     * repeat children, inserting everything inside ONE savepoint. The caller
     * owns loading/gating the spec and parsing both JSON blobs.
     */
    public static SubmitOutcome run(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Posture mode
    ) {
        return run(spec, payload, null, mode);
    }

    /**
     * 4-arg entry: versionId is the SERVER-loaded version identity — never
     * client-claimed (IMPL_PLAN_SURVEY_S1 rev-2 trust fix). The form path
     * ignores it; the survey path anchors the response row to it.
     */
    public static SubmitOutcome run(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Id versionId,
        Posture mode
    ) {
        // Three types, three paths, and NO fallback: an unrecognized type
        // used to land in the object path below and fail complaining about a
        // missing target object, which described the wrong problem.
        String formType = FinalFormTypes.fromSpecOrDefault(
            spec,
            FinalFormTypes.FORM
        );
        if (formType == FinalFormTypes.SURVEY) {
            return runSurvey(spec, payload, versionId, mode);
        }
        if (formType == FinalFormTypes.FREEFORM) {
            return runFreeform(spec, payload, versionId, mode);
        }
        Map<String, Object> answers = asMap(payload.get('answers'));
        Map<String, Object> repeats = asMap(payload.get('repeats'));

        Map<String, Object> form = asMap(spec.get('form'));
        String targetObject = form == null
            ? null
            : (String) form.get('targetObject');
        if (String.isBlank(targetObject)) {
            throw new AuraHandledException(
                'This form has no target object to save to.'
            );
        }
        Schema.SObjectType parentType = Schema.getGlobalDescribe()
            .get(targetObject);
        if (parentType == null) {
            throw new AuraHandledException('Unknown object: ' + targetObject);
        }

        // one walk splits parent-scope bindings from repeat sections. Only
        // fields the SPEC binds are ever collected — this is the guest
        // allow-list, by construction (a client-named field is impossible).
        Map<String, Object> parentBindings = new Map<String, Object>();
        List<RepeatPlan> repeatPlans = new List<RepeatPlan>();
        for (Object pageObj : asList(spec.get('pages'))) {
            for (Object secObj : asList(asMap(pageObj).get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                Map<String, Object> repeatCfg = asMap(sec.get('repeat'));
                if (repeatCfg != null) {
                    RepeatPlan plan = new RepeatPlan();
                    plan.sectionId = (String) sec.get('id');
                    plan.childObject = (String) repeatCfg.get('childObject');
                    plan.relationshipField = (String) repeatCfg.get(
                        'relationshipField'
                    );
                    plan.elements = asList(sec.get('elements'));
                    repeatPlans.add(plan);
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    Map<String, Object> binding = asMap(el.get('binding'));
                    String elId = (String) el.get('id');
                    if (
                        binding == null ||
                        String.isBlank((String) binding.get('field')) ||
                        !answers.containsKey(elId)
                    ) {
                        continue;
                    }
                    parentBindings.put(
                        (String) binding.get('field'),
                        answers.get(elId)
                    );
                }
            }
        }

        // Runtime intent comes from the explicit edit target, never the
        // authoring saveMode hint. Client IDs still grant no permissions.
        Map<String, Object> meta = asMap(payload.get('meta'));
        Object requestedId = meta == null ? null : meta.get('existingRecordId');
        Boolean isUpdate =
            requestedId != null &&
            (!(requestedId instanceof String) ||
            !String.isBlank((String) requestedId));
        if (!String.isBlank(getStr(meta, 'recordId'))) {
            throw new AuraHandledException(
                'Use existingRecordId to select the record to edit.'
            );
        }
        Id existingId = null;
        if (isUpdate) {
            // Belt to FinalGuestController's brace (it refuses an update spec
            // before reaching here). A guest must never update anything.
            if (mode == Posture.GUEST) {
                throw new AuraHandledException('This form is not available.');
            }
            existingId = idOrNull(requestedId);
            if (existingId == null) {
                throw new AuraHandledException(
                    'The existing record ID is invalid.'
                );
            }
            // A client-supplied id cannot be trusted to be the right SHAPE.
            // (It needs no trust to be the right PERMISSION: `update as user`
            // below means the caller can only touch what they already could.)
            if (existingId.getSObjectType() != parentType) {
                throw new AuraHandledException(
                    'This form saves to ' +
                        targetObject +
                        ', but the record it was given is not a ' +
                        targetObject +
                        ' record.'
                );
            }
            // D2 (owner, 2026-09-08): repeat sections are blocked at PUBLISH on
            // an edit form. This is the runtime half of that ruling — matching
            // typed rows back to existing children is unbuilt, and silently
            // inserting duplicates would be worse than refusing.
            if (!repeatPlans.isEmpty()) {
                throw new AuraHandledException(
                    'This form edits a record, so it cannot contain a repeating section.'
                );
            }
        }

        List<FieldError> badLookups = lookupErrors(spec, answers, mode);
        if (!badLookups.isEmpty()) {
            SubmitOutcome refused = new SubmitOutcome();
            refused.errors = badLookups;
            return refused;
        }

        Savepoint sp = Database.setSavepoint();
        try {
            SObject parent = buildRecord(parentType, parentBindings);
            Id parentId;
            if (isUpdate) {
                parent.put('Id', existingId);
                List<SObject> parentList = stripForUpdate(
                    new List<SObject>{ parent },
                    mode
                );
                doUpdate(parentList, mode);
                parentId = existingId;
            } else {
                List<SObject> parentList = stripForCreate(
                    new List<SObject>{ parent },
                    mode
                );
                doInsert(parentList, mode);
                parentId = parentList[0].Id;
            }

            Integer childCount = 0;
            for (RepeatPlan plan : repeatPlans) {
                childCount += insertEntries(plan, repeats, parentId, mode);
            }

            // Inside the savepoint: a rejected file rolls the record back too.
            attachFiles(parentId, spec, payload, mode);

            SubmitOutcome res = new SubmitOutcome();
            res.recordId = parentId;
            res.childCount = childCount;
            return res;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (DmlException e) {
            Database.rollback(sp);
            // A GUEST is told nothing about which field of which object
            // rejected the write — a public form must not become a probe for
            // an org's validation rules. Guests keep the flat refusal.
            if (mode == Posture.GUEST) {
                throw new AuraHandledException(
                    'Your response could not be saved. Nothing was recorded.'
                );
            }
            SubmitOutcome res = new SubmitOutcome();
            res.errors = dmlErrors(e);
            return res;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Your response could not be saved. Nothing was recorded.'
            );
        }
    }

    private class RepeatPlan {
        String sectionId;
        String childObject;
        String relationshipField;
        List<Object> elements;
    }

    // ===== SURVEY: answer-store submit (SURVEY_PLAN §6 · IMPL_PLAN_SURVEY_S1) =====

    /**
     * Survey path: answers become Form_Response__c + Form_Response_Answer__c
     * rows (+ Form_Answer_Topic__c tag links) instead of business-object
     * fields.
     *
     * SECURITY — SYSTEM-MODE FENCES (owner ruling 7-2, 2026-07-27; documented
     * here for AppExchange Security Review): the inserts below run in system
     * mode for BOTH postures, so any respondent can file answers without
     * object perms (the "mailbox" model — you don't need a key to the post
     * office to mail a letter). The fences that keep that safe:
     *  1. Scope: exactly three app-owned objects (response / answer / link).
     *  2. Create-only — this path never updates or deletes anything.
     *  3. The server decides every field written; client input can never name
     *     a field or column (answers key by element id against the spec the
     *     CONTROLLER loaded and gated).
     *  4. Reads stay permission-checked everywhere else — system mode covers
     *     only the drop-in-the-box moment.
     */
    private static SubmitOutcome runSurvey(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Id versionId,
        Posture mode
    ) {
        if (versionId == null) {
            throw new AuraHandledException(
                'This survey has no published version to submit to.'
            );
        }
        // D16: counting and then inserting is not atomic, so the form row is
        // locked for the rest of this transaction whenever a limit exists.
        // This is the one behavior change the shared extraction makes to
        // Survey, and it makes the limit mean what it says.
        lockFormIfCapped(spec, formIdOfVersion(versionId));
        if (responseCapReached(spec, versionId)) {
            throw new AuraHandledException(closedMessage(spec));
        }
        Map<String, Object> answers = asMap(payload.get('answers'));
        Map<String, Object> repeats = asMap(payload.get('repeats'));
        Map<String, Object> meta = asMap(payload.get('meta'));

        List<Map<String, Object>> flat = new List<Map<String, Object>>();
        List<RepeatPlan> plans = new List<RepeatPlan>();
        collectElements(spec, flat, plans);

        Set<Id> validTopics = validTopicIds(flat, plans);

        Form_Response__c response = new Form_Response__c(
            Form_Version__c = versionId,
            Status__c = 'Completed',
            Submitted_Date__c = Datetime.now(),
            Completion_Time_Seconds__c = completionSeconds(meta)
        );
        if (!isAnonymous(spec) && mode == Posture.INTERNAL) {
            // capture what the channel knows: internal = the running user;
            // guests stay null (the site guest user id is noise; IP is v2)
            response.Submitted_By__c = UserInfo.getUserId();
        }
        String sess = getStr(meta, 'sessionId');
        if (sess != null) {
            response.Session_Id__c = sess.abbreviate(255);
        }

        // Surveys carry lookups too, and a survey response is just as capable
        // of pointing at a record the filter excludes.
        List<FieldError> badLookups = lookupErrors(spec, answers, mode);
        if (!badLookups.isEmpty()) {
            SubmitOutcome refused = new SubmitOutcome();
            refused.errors = badLookups;
            return refused;
        }

        AnswerSink sink = surveySink();
        Savepoint sp = Database.setSavepoint();
        try {
            insertFenced(new List<SObject>{ response });

            List<List<Id>> topicsPerRow = new List<List<Id>>();
            List<SObject> rows = buildAnswerRows(
                flat,
                plans,
                answers,
                repeats,
                response.Id,
                validTopics,
                topicsPerRow,
                sink
            );
            if (!rows.isEmpty()) {
                insertFenced(rows);
            }
            List<Form_Answer_Topic__c> links = new List<Form_Answer_Topic__c>();
            for (Integer i = 0; i < rows.size(); i++) {
                for (Id topicId : topicsPerRow[i]) {
                    links.add(
                        new Form_Answer_Topic__c(
                            Answer__c = (Id) rows[i].get('Id'),
                            Topic__c = topicId
                        )
                    );
                }
            }
            if (!links.isEmpty()) {
                insertFenced(links);
            }

            // Survey-object writeback (SURVEY_OBJECT_SPEC, owner 2026-07-31):
            // mapped answers ALSO update the context record - USER MODE, not
            // the fenced system-mode above (updating a business record needs
            // the runner's real edit rights), inside this savepoint so answer
            // rows and the record land or roll back together. Internal only;
            // guests carry no record context (Phase B/C tokens own that).
            if (mode == Posture.INTERNAL) {
                applyMappedWriteback(spec, flat, answers, meta);
            }

            // Survey attachments hang off the response record itself - the
            // only record this transaction owns. Inside the savepoint.
            attachFiles(response.Id, spec, payload, mode);

            SubmitOutcome res = new SubmitOutcome();
            res.recordId = response.Id;
            res.childCount = rows.size();
            return res;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (DmlException e) {
            Database.rollback(sp);
            // A survey's own answer rows are app-owned and system-mode, so a
            // DML failure here is almost always the MAPPED WRITEBACK - real
            // fields on the connected record, rejected by a validation rule or
            // the runner's edit rights. That is a failure the respondent can
            // actually act on, and it is worth naming: the writeback sits
            // inside this savepoint, so a rejected field discards the entire
            // response, and "could not be saved" leaves them nothing to fix.
            //
            // Writeback is INTERNAL-only (guests carry no record context), so
            // a guest cannot reach a field-level failure at all. The guard
            // stays anyway: nothing about a public form should ever depend on
            // a condition two hundred lines away staying true.
            if (mode == Posture.GUEST) {
                throw new AuraHandledException(
                    'Your response could not be saved. Nothing was recorded.'
                );
            }
            SubmitOutcome res = new SubmitOutcome();
            res.errors = dmlErrors(e);
            return res;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Your response could not be saved. Nothing was recorded.'
            );
        }
    }

    /**
     * Freeform submit (FREEFORM_SPEC F1).
     *
     * Same fenced, create-only posture as a survey response: the published
     * spec is the allow-list, the server decides every field, and the write
     * is system-mode over app-owned objects only. What differs:
     *   - the submission carries an idempotency key, so a browser that never
     *     saw our response can retry without storing a second submission;
     *   - every answer row records Answer_Type__c;
     *   - no analytics, no topics, and no mapped writeback (that is F2, and
     *     it will run in its OWN transaction - a savepoint cannot protect
     *     answers from an uncatchable failure).
     */
    private static SubmitOutcome runFreeform(
        Map<String, Object> spec,
        Map<String, Object> payload,
        Id versionId,
        Posture mode
    ) {
        if (versionId == null) {
            throw new AuraHandledException(
                'This form has no published version to submit to.'
            );
        }
        Map<String, Object> meta = asMap(payload.get('meta'));
        String submissionKey = getStr(meta, 'submissionKey');

        Id formId = formIdOfVersion(versionId);

        // A repeat of an attempt we already stored is not an error: the
        // browser lost our answer, not its mind. Scoped to THIS form, so a
        // key left over from another form can never be mistaken for a retry
        // and answer this submit with a stranger's submission.
        SubmitOutcome replayed = existingSubmission(submissionKey, formId);
        if (replayed != null) {
            return replayed;
        }

        // Counting and then inserting is not atomic: two submissions can both
        // pass the count for the last free slot. When a limit is configured,
        // the form row is locked for the rest of this transaction so
        // acceptance is serialized.
        lockFormIfCapped(spec, formId);
        // Waiting on that lock takes time, and a twin of this very attempt
        // may have committed meanwhile - possibly taking the last slot. Ask
        // again before judging the cap, or a retry gets told the form is full
        // by its own earlier self.
        replayed = existingSubmission(submissionKey, formId);
        if (replayed != null) {
            return replayed;
        }
        if (responseCapReached(spec, versionId)) {
            throw new AuraHandledException(closedMessage(spec));
        }

        Map<String, Object> answers = asMap(payload.get('answers'));
        Map<String, Object> repeats = asMap(payload.get('repeats'));

        List<Map<String, Object>> flat = new List<Map<String, Object>>();
        List<RepeatPlan> plans = new List<RepeatPlan>();
        collectElements(spec, flat, plans);

        List<FieldError> badLookups = lookupErrors(spec, answers, mode);
        if (!badLookups.isEmpty()) {
            SubmitOutcome refused = new SubmitOutcome();
            refused.errors = badLookups;
            return refused;
        }

        Form_Submission__c submission = new Form_Submission__c(
            Form__c = formId,
            Form_Version__c = versionId,
            Submitted_Date__c = Datetime.now(),
            Completion_Time_Seconds__c = completionSeconds(meta)
        );
        if (String.isNotBlank(submissionKey)) {
            submission.Submission_Key__c = submissionKey.abbreviate(64);
        }
        if (!isAnonymous(spec) && mode == Posture.INTERNAL) {
            submission.Submitted_By__c = UserInfo.getUserId();
        }
        String sess = getStr(meta, 'sessionId');
        if (sess != null) {
            submission.Session_Id__c = sess.abbreviate(255);
        }

        AnswerSink sink = freeformSink();
        Savepoint sp = Database.setSavepoint();
        try {
            insertFenced(new List<SObject>{ submission });

            List<SObject> rows = buildAnswerRows(
                flat,
                plans,
                answers,
                repeats,
                submission.Id,
                new Set<Id>(),
                new List<List<Id>>(),
                sink
            );
            if (!rows.isEmpty()) {
                insertFenced(rows);
            }
            attachFiles(submission.Id, spec, payload, mode);

            SubmitOutcome res = new SubmitOutcome();
            res.recordId = submission.Id;
            res.childCount = rows.size();
            return res;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (DmlException e) {
            Database.rollback(sp);
            // Two submissions racing on the same key: whoever lost reads the
            // winner back rather than reporting a failure the person cannot
            // act on. Salesforce enforces this with a unique index, which no
            // amount of checking-first could do.
            if (isDuplicateKey(e)) {
                SubmitOutcome winner = existingSubmission(
                    submissionKey,
                    formId
                );
                if (winner != null) {
                    return winner;
                }
                // The key is held by a DIFFERENT form. Failing loudly is the
                // whole point: the alternative was reporting success and
                // storing nothing, and a reload mints a fresh key.
                throw new AuraHandledException(
                    'Your answers could not be saved. Reload the page and try' +
                    ' again.'
                );
            }
            throw new AuraHandledException(
                'Your answers could not be saved. Nothing was recorded.'
            );
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Your answers could not be saved. Nothing was recorded.'
            );
        }
    }

    /**
     * The submission already stored under this key FOR THIS FORM, or null.
     *
     * System mode: the key is a secret the client just proved it holds, and a
     * guest can read nothing. The form is part of the question because the
     * key is minted in a browser that may have filled in another form first -
     * matching on the key alone once answered a new form's submit with an old
     * form's submission, and called it success.
     *
     * Public because the guest controller must ask BEFORE it judges
     * availability: a retry of a submission that already landed deserves its
     * answer even if the form has since closed or filled up.
     */
    public static SubmitOutcome existingSubmission(
        String submissionKey,
        Id formId
    ) {
        if (String.isBlank(submissionKey) || formId == null) {
            return null;
        }
        List<SObject> found = Database.queryWithBinds(
            'SELECT Id, (SELECT Id FROM Answers__r) FROM Form_Submission__c ' +
            'WHERE Submission_Key__c = :k AND Form__c = :f LIMIT 1',
            new Map<String, Object>{
                'k' => submissionKey.abbreviate(64),
                'f' => formId
            },
            AccessLevel.SYSTEM_MODE
        );
        if (found.isEmpty()) {
            return null;
        }
        SubmitOutcome res = new SubmitOutcome();
        res.recordId = found[0].Id;
        List<SObject> kids = found[0].getSObjects('Answers__r');
        res.childCount = kids == null ? 0 : kids.size();
        return res;
    }

    private static Boolean isDuplicateKey(DmlException e) {
        for (Integer i = 0; i < e.getNumDml(); i++) {
            if (e.getDmlType(i) == StatusCode.DUPLICATE_VALUE) {
                return true;
            }
        }
        return false;
    }

    private static Id formIdOfVersion(Id versionId) {
        List<SObject> vs = Database.queryWithBinds(
            'SELECT Form__c FROM Form_Version__c WHERE Id = :vid',
            new Map<String, Object>{ 'vid' => versionId },
            AccessLevel.SYSTEM_MODE
        );
        if (vs.isEmpty()) {
            throw new AuraHandledException('This form is not available.');
        }
        return (Id) vs[0].get('Form__c');
    }

    /**
     * Serializes acceptance while a response limit is in force (D16).
     *
     * FOR UPDATE holds the form row until this transaction commits, so a
     * second submission waits rather than counting the same free slot. Only
     * taken when a limit exists - an uncapped form pays nothing.
     */
    private static void lockFormIfCapped(Map<String, Object> spec, Id formId) {
        Map<String, Object> avail = availability(spec);
        Decimal cap = avail == null
            ? null
            : numOrNull(avail.get('responseCap'));
        if (cap == null || cap <= 0 || formId == null) {
            return;
        }
        Database.queryWithBinds(
            'SELECT Id FROM Form__c WHERE Id = :fid FOR UPDATE',
            new Map<String, Object>{ 'fid' => formId },
            AccessLevel.SYSTEM_MODE
        );
    }

    /** One walk over the spec: plain elements and repeat plans. */
    private static void collectElements(
        Map<String, Object> spec,
        List<Map<String, Object>> flat,
        List<RepeatPlan> plans
    ) {
        for (Object pageObj : asList(spec.get('pages'))) {
            for (Object secObj : asList(asMap(pageObj).get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null) {
                    continue;
                }
                if (asMap(sec.get('repeat')) != null) {
                    RepeatPlan plan = new RepeatPlan();
                    plan.sectionId = (String) sec.get('id');
                    plan.elements = asList(sec.get('elements'));
                    plans.add(plan);
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el != null && el.get('id') != null) {
                        flat.add(el);
                    }
                }
            }
        }
    }

    /** Answered elements + repeat entries -> typed rows, for either store. */
    private static List<SObject> buildAnswerRows(
        List<Map<String, Object>> flat,
        List<RepeatPlan> plans,
        Map<String, Object> answers,
        Map<String, Object> repeats,
        Id parentId,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow,
        AnswerSink sink
    ) {
        List<SObject> rows = new List<SObject>();
        for (Map<String, Object> el : flat) {
            String elId = (String) el.get('id');
            if (answers == null || !answers.containsKey(elId)) {
                continue;
            }
            Object raw = answers.get(elId);
            if (isMatrixElement(el) && raw instanceof Map<String, Object>) {
                rows.addAll(
                    matrixAnswerRows(
                        el,
                        (Map<String, Object>) raw,
                        parentId,
                        null,
                        validTopics,
                        topicsPerRow,
                        sink
                    )
                );
                continue;
            }
            SObject row = answerRow(
                el,
                raw,
                parentId,
                null,
                validTopics,
                topicsPerRow,
                sink
            );
            if (row != null) {
                rows.add(row);
            }
        }
        for (RepeatPlan plan : plans) {
            List<Object> entries = repeats == null
                ? null
                : asList(repeats.get(plan.sectionId));
            if (entries == null) {
                continue;
            }
            for (Integer i = 0; i < entries.size(); i++) {
                Map<String, Object> entry = asMap(entries[i]);
                if (entry == null || entry.isEmpty()) {
                    continue;
                }
                for (Object elObj : plan.elements) {
                    Map<String, Object> el = asMap(elObj);
                    String elId = el == null ? null : (String) el.get('id');
                    if (elId == null || !entry.containsKey(elId)) {
                        continue;
                    }
                    SObject row = answerRow(
                        el,
                        entry.get(elId),
                        parentId,
                        i,
                        validTopics,
                        topicsPerRow,
                        sink
                    );
                    if (row != null) {
                        rows.add(row);
                    }
                }
            }
        }
        return rows;
    }

    private static Boolean isMatrixElement(Map<String, Object> el) {
        Object t = el.get('type');
        return t instanceof String && (String) t == 'matrix';
    }

    /**
     * Mapped-question writeback: answers whose elements declare
     * `mapping: {object, field}` update the meta.recordId record of the
     * survey's targetObject. The server walks the SPEC for mappings (client
     * input can never name a field); coercion follows the field's describe
     * type; stripInaccessible(UPDATABLE) drops fields the runner cannot
     * edit; `update as user` enforces CRUD + sharing.
     */
    private static void applyMappedWriteback(
        Map<String, Object> spec,
        List<Map<String, Object>> flat,
        Map<String, Object> answers,
        Map<String, Object> meta
    ) {
        String recIdStr = getStr(meta, 'recordId');
        Map<String, Object> formNode = asMap(spec.get('form'));
        String targetObject = formNode == null
            ? null
            : (String) formNode.get('targetObject');
        if (
            String.isBlank(recIdStr) ||
            String.isBlank(targetObject) ||
            answers == null
        ) {
            return;
        }
        // 'write' skips prefill-only mappings (SO-2 direction)
        Map<String, String> fieldByElement = FinalSurveyObjectController.mappedFields(
            spec,
            targetObject,
            'write'
        );
        if (fieldByElement.isEmpty()) {
            return;
        }
        Id recordId;
        try {
            recordId = Id.valueOf(recIdStr);
        } catch (Exception e) {
            throw new AuraHandledException('Invalid record for this survey.');
        }
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(targetObject.toLowerCase());
        if (t == null || recordId.getSObjectType() != t) {
            throw new AuraHandledException('Invalid record for this survey.');
        }
        Map<String, Schema.SObjectField> fieldMap = t.getDescribe()
            .fields.getMap();
        SObject rec = t.newSObject(recordId);
        Boolean hasWrites = false;
        for (String elId : fieldByElement.keySet()) {
            if (!answers.containsKey(elId) || answers.get(elId) == null) {
                continue; // unanswered mapped questions leave the field alone
            }
            String field = fieldByElement.get(elId);
            Schema.SObjectField fTok = fieldMap.get(field.toLowerCase());
            if (fTok == null) {
                continue; // field vanished since authoring — skip, don't die
            }
            rec.put(
                field,
                coerceForField(fTok.getDescribe(), answers.get(elId))
            );
            hasWrites = true;
        }
        if (!hasWrites) {
            return;
        }
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<SObject>{ rec }
        );
        update as user decision.getRecords();
    }

    /** Answer value → the mapped field's type (describe-driven). */
    private static Object coerceForField(
        Schema.DescribeFieldResult fd,
        Object raw
    ) {
        switch on fd.getType() {
            when BOOLEAN {
                return raw instanceof Boolean
                    ? raw
                    : Boolean.valueOf(String.valueOf(raw));
            }
            when DOUBLE, CURRENCY, PERCENT, INTEGER, LONG {
                return Decimal.valueOf(String.valueOf(raw));
            }
            when else {
                String s = String.valueOf(raw);
                Integer max = fd.getLength();
                return max > 0 ? s.abbreviate(max) : s;
            }
        }
    }

    /** Matrix picks {statementKey → value} → one answer row per statement.
     *  Element_Key = '<elementId>:<statementKey>'; the label photocopy
     *  carries "question — statement" so reports read standalone. Topics and
     *  the normalized score apply PER ROW (each appends to topicsPerRow —
     *  the caller's alignment law). */
    private static List<SObject> matrixAnswerRows(
        Map<String, Object> el,
        Map<String, Object> picks,
        Id parentId,
        Integer entryIndex,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow,
        AnswerSink sink
    ) {
        List<SObject> out = new List<SObject>();
        Map<String, Object> config = asMap(el.get('config'));
        Map<String, String> statementLabels = new Map<String, String>();
        for (Object rObj : asList(config == null ? null : config.get('rows'))) {
            Map<String, Object> r = asMap(rObj);
            if (r == null || r.get('value') == null) {
                continue;
            }
            String key = String.valueOf(r.get('value'));
            Object lbl = r.get('label');
            statementLabels.put(
                key,
                lbl instanceof String ? (String) lbl : key
            );
        }
        Object qLabelObj = el.get('label');
        String qLabel = qLabelObj instanceof String ? (String) qLabelObj : '';
        String elId = (String) el.get('id');
        for (String statementKey : picks.keySet()) {
            Object v = picks.get(statementKey);
            if (v == null) {
                continue;
            }
            SObject row = sink.newRow(parentId);
            row.put(
                'Element_Key__c',
                (elId + ':' + statementKey).abbreviate(255)
            );
            row.put('Entry_Index__c', entryIndex);
            String stLabel = statementLabels.containsKey(statementKey)
                ? statementLabels.get(statementKey)
                : statementKey;
            row.put(
                'Label_Snapshot__c',
                (qLabel + ' — ' + stLabel).abbreviate(255)
            );
            Decimal numeric = numOrNull(v);
            row.put('Numeric_Value__c', numeric);
            if (numeric == null) {
                row.put('Text_Value__c', String.valueOf(v));
            }
            // A matrix row is typed by ITS OWN value, not the question:
            // a scale matrix stores numbers, a choice matrix stores picks.
            if (sink.writesAnswerType) {
                row.put(
                    'Answer_Type__c',
                    numeric == null ? 'Choice' : 'Number'
                );
            }
            applyAnalytics(row, el, validTopics, topicsPerRow, sink);
            out.add(row);
        }
        return out;
    }

    /** One answered element → one typed answer row; its valid topic ids are
     *  appended (as one list) to the parallel topicsPerRow. Blank values
     *  return null — nothing to store (Boolean false is NOT blank). */
    private static SObject answerRow(
        Map<String, Object> el,
        Object value,
        Id parentId,
        Integer entryIndex,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow,
        AnswerSink sink
    ) {
        if (value == null) {
            return null;
        }
        if (value instanceof String && String.isBlank((String) value)) {
            return null;
        }
        if (value instanceof List<Object> && ((List<Object>) value).isEmpty()) {
            return null;
        }
        SObject row = sink.newRow(parentId);
        row.put('Element_Key__c', (String) el.get('id'));
        row.put('Entry_Index__c', entryIndex);
        Object label = el.get('label');
        if (label instanceof String) {
            row.put('Label_Snapshot__c', ((String) label).abbreviate(255));
        }
        writeTypedValue(row, el, value, sink);
        applyAnalytics(row, el, validTopics, topicsPerRow, sink);
        return row;
    }

    /** Typed storage is part of the type (SURVEY_PLAN principle 2.0.4):
     *  pick the value column from the JSON value's own type first, then the
     *  element's declared kind. Unparseable claims fall back to text —
     *  never a crash, never a dropped answer. */
    // Failed typed parsing intentionally falls through to the text fallback.
    @SuppressWarnings('PMD.EmptyCatchBlock')
    /**
     * Typed storage is part of the type (SURVEY_PLAN 2.0.4).
     *
     * Survey picks the column from the JSON value's own shape. Freeform
     * cannot: FREEFORM_SPEC 5.2.1 promises the SAME question always stores
     * the same way, whether the payload carried 42 or "42", so its column
     * comes from the PUBLISHED question and Answer_Type__c records which one
     * holds it. A value that will not convert is kept as text and flagged
     * Value_Unparsed__c - never dropped, never silently retyped.
     */
    private static void writeTypedValue(
        SObject row,
        Map<String, Object> el,
        Object value,
        AnswerSink sink
    ) {
        if (!sink.writesAnswerType) {
            writeUntypedValue(row, el, value);
            return;
        }
        String answerType = answerTypeOf(el);
        row.put('Answer_Type__c', answerType);
        if (answerType == 'Options') {
            List<Object> many = value instanceof List<Object>
                ? (List<Object>) value
                : new List<Object>{ value };
            row.put('Selected_Options_JSON__c', JSON.serialize(many));
            return;
        }
        if (answerType == 'Boolean') {
            if (value instanceof Boolean) {
                row.put('Boolean_Value__c', (Boolean) value);
                return;
            }
            String s = String.valueOf(value).toLowerCase();
            if (s == 'true' || s == 'false') {
                row.put('Boolean_Value__c', s == 'true');
                return;
            }
            unparsed(row, value);
            return;
        }
        if (answerType == 'Number') {
            try {
                row.put(
                    'Numeric_Value__c',
                    Decimal.valueOf(String.valueOf(value))
                );
            } catch (Exception e) {
                unparsed(row, value);
            }
            return;
        }
        if (answerType == 'Date') {
            try {
                row.put('Date_Value__c', Date.valueOf(String.valueOf(value)));
            } catch (Exception e) {
                unparsed(row, value);
            }
            return;
        }
        if (answerType == 'DateTime') {
            try {
                row.put(
                    'DateTime_Value__c',
                    (Datetime) JSON.deserialize(
                        '"' + String.valueOf(value) + '"',
                        Datetime.class
                    )
                );
            } catch (Exception e) {
                unparsed(row, value);
            }
            return;
        }
        // Text, Email, Phone, URL and Choice all live in the text column;
        // Answer_Type__c is what tells them apart.
        row.put('Text_Value__c', String.valueOf(value).abbreviate(32768));
    }

    /** The raw value survives in the text column, marked as not converted. */
    private static void unparsed(SObject row, Object value) {
        row.put('Value_Unparsed__c', true);
        row.put('Text_Value__c', String.valueOf(value).abbreviate(32768));
    }

    /**
     * What the PUBLISHED question says this answer is (FREEFORM_SPEC 5.2.1),
     * decided by the element and never by the payload.
     */
    public static String answerTypeOf(Map<String, Object> el) {
        Object t = el.get('type');
        String elType = t instanceof String ? (String) t : '';
        if (NUMERIC_TYPES.contains(elType)) {
            return 'Number';
        }
        if (elType == 'yesNo' || elType == 'consent') {
            return 'Boolean';
        }
        if (elType == 'ranking') {
            return 'Options';
        }
        Map<String, Object> config = asMap(el.get('config'));
        if (elType == 'imageChoice') {
            Object multiple = config == null ? null : config.get('multiple');
            return multiple == true ? 'Options' : 'Choice';
        }
        Object input = config == null ? null : config.get('inputType');
        String kind = input instanceof String
            ? ((String) input).toLowerCase()
            : 'text';
        if (kind == 'email') {
            return 'Email';
        }
        if (kind == 'phone' || kind == 'tel') {
            return 'Phone';
        }
        if (kind == 'url') {
            return 'URL';
        }
        if (kind == 'date') {
            return 'Date';
        }
        if (kind == 'datetime' || kind == 'datetime-local') {
            return 'DateTime';
        }
        if (
            kind == 'number' ||
            kind == 'currency' ||
            kind == 'percent' ||
            kind == 'slider'
        ) {
            return 'Number';
        }
        if (kind == 'checkbox') {
            return 'Boolean';
        }
        if (kind == 'picklist' || kind == 'multipicklist') {
            Object renderAs = config == null ? null : config.get('renderAs');
            String how = renderAs instanceof String ? (String) renderAs : '';
            Boolean multi =
                kind == 'multipicklist' ||
                how == 'Checkbox_Group' ||
                how == 'Custom_MultiSelect';
            return multi ? 'Options' : 'Choice';
        }
        return 'Text';
    }

    /** The survey rule, unchanged: the JSON value's own shape picks the
     *  column, then the element's declared kind, then text. */
    // Failed typed parsing intentionally falls through to the text fallback.
    @SuppressWarnings('PMD.EmptyCatchBlock')
    private static void writeUntypedValue(
        SObject row,
        Map<String, Object> el,
        Object value
    ) {
        if (value instanceof Boolean) {
            row.put('Boolean_Value__c', (Boolean) value);
            return;
        }
        if (value instanceof List<Object>) {
            row.put('Selected_Options_JSON__c', JSON.serialize(value));
            return;
        }
        if (
            value instanceof Decimal ||
            value instanceof Integer ||
            value instanceof Double ||
            value instanceof Long
        ) {
            row.put('Numeric_Value__c', Decimal.valueOf(String.valueOf(value)));
            return;
        }
        String s = String.valueOf(value);
        String kind = valueKind(el);
        if (kind == 'number') {
            try {
                row.put('Numeric_Value__c', Decimal.valueOf(s));
                return;
            } catch (Exception e) {
                // fall through to text
            }
        } else if (kind == 'date') {
            try {
                row.put('Date_Value__c', Date.valueOf(s));
                return;
            } catch (Exception e) {
                // fall through to text
            }
        } else if (kind == 'datetime') {
            try {
                row.put(
                    'DateTime_Value__c',
                    (Datetime) JSON.deserialize('"' + s + '"', Datetime.class)
                );
                return;
            } catch (Exception e) {
                // fall through to text
            }
        }
        row.put('Text_Value__c', s.abbreviate(32768));
    }

    private static final Set<String> NUMERIC_TYPES = new Set<String>{
        'nps',
        'rating',
        'scale',
        'emojiScale',
        'likert',
        'slider'
    };

    /** number | date | datetime | text — from the registry key, else
     *  config.inputType (unbound survey `field` elements carry it). */
    private static String valueKind(Map<String, Object> el) {
        String t = (String) el.get('type');
        if (NUMERIC_TYPES.contains(t)) {
            return 'number';
        }
        Map<String, Object> config = asMap(el.get('config'));
        Object input = config == null ? null : config.get('inputType');
        if (!(input instanceof String)) {
            return 'text';
        }
        String kind = ((String) input).toLowerCase();
        if (
            kind == 'number' ||
            kind == 'currency' ||
            kind == 'percent' ||
            kind == 'slider'
        ) {
            return 'number';
        }
        if (kind == 'date') {
            return 'date';
        }
        if (kind == 'datetime' || kind == 'datetime-local') {
            return 'datetime';
        }
        return 'text';
    }

    /** Normalized score (0–100 linear map) + topic tags from the element's
     *  analytics block. ALWAYS appends exactly one (possibly empty) topic-id
     *  list to topicsPerRow — the caller's row/topics alignment depends on it.
     *  Unknown/retired topic ids keep their display name but get no link —
     *  never fail a submit over a tag (IMPL_PLAN 7-3). */
    private static void applyAnalytics(
        SObject row,
        Map<String, Object> el,
        Set<Id> validTopics,
        List<List<Id>> topicsPerRow,
        AnswerSink sink
    ) {
        List<Id> rowTopics = new List<Id>();
        // Freeform has no analytics (D4), but the parallel-list law still
        // holds: EVERY row appends exactly one (possibly empty) entry.
        if (!sink.appliesAnalytics) {
            topicsPerRow.add(rowTopics);
            return;
        }
        Map<String, Object> analytics = asMap(el.get('analytics'));
        Decimal numeric = (Decimal) row.get('Numeric_Value__c');
        if (analytics != null) {
            Object role = analytics.get('role');
            if (
                role instanceof String &&
                (String) role == 'score' &&
                numeric != null
            ) {
                Decimal minV = numOrNull(analytics.get('scaleMin'));
                Decimal maxV = numOrNull(analytics.get('scaleMax'));
                if (minV != null && maxV != null && maxV > minV) {
                    Decimal norm = ((numeric - minV) / (maxV - minV)) * 100;
                    if (norm < 0) {
                        norm = 0;
                    }
                    if (norm > 100) {
                        norm = 100;
                    }
                    row.put('Normalized_Score__c', norm.setScale(2));
                }
            }
            List<String> names = new List<String>();
            for (Object tObj : asList(analytics.get('topics'))) {
                Map<String, Object> t = asMap(tObj);
                if (t == null) {
                    continue;
                }
                Object nm = t.get('name');
                if (nm instanceof String && String.isNotBlank((String) nm)) {
                    names.add((String) nm);
                }
                Id tid = idOrNull(t.get('id'));
                if (tid != null && validTopics.contains(tid)) {
                    rowTopics.add(tid);
                }
            }
            if (!names.isEmpty()) {
                row.put(
                    'Topic_Snapshot__c',
                    String.join(names, '; ').abbreviate(255)
                );
            }
        }
        topicsPerRow.add(rowTopics);
    }

    /** Every topic id the spec references, validated in ONE system-mode query
     *  (respondents may lack read on the vocabulary — validation is part of
     *  the fenced storage moment; see runSurvey doc). */
    private static Set<Id> validTopicIds(
        List<Map<String, Object>> flat,
        List<RepeatPlan> plans
    ) {
        Set<Id> wanted = new Set<Id>();
        List<Map<String, Object>> all = new List<Map<String, Object>>(flat);
        for (RepeatPlan plan : plans) {
            for (Object elObj : plan.elements) {
                Map<String, Object> el = asMap(elObj);
                if (el != null) {
                    all.add(el);
                }
            }
        }
        for (Map<String, Object> el : all) {
            Map<String, Object> analytics = asMap(el.get('analytics'));
            if (analytics == null) {
                continue;
            }
            for (Object tObj : asList(analytics.get('topics'))) {
                Map<String, Object> t = asMap(tObj);
                Id tid = t == null ? null : idOrNull(t.get('id'));
                if (tid != null) {
                    wanted.add(tid);
                }
            }
        }
        Set<Id> valid = new Set<Id>();
        if (wanted.isEmpty()) {
            return valid;
        }
        for (
            SObject st : Database.queryWithBinds(
                'SELECT Id FROM Survey_Topic__c WHERE Id IN :ids',
                new Map<String, Object>{ 'ids' => wanted },
                AccessLevel.SYSTEM_MODE
            )
        ) {
            valid.add(st.Id);
        }
        return valid;
    }

    /** Test-only failure injection: the savepoint's all-or-nothing guarantee
     *  is otherwise unreachable through the defensive public API. */
    @TestVisible
    private static Boolean testFailAnswerInsert = false;

    /** SYSTEM-MODE create for the three survey storage objects ONLY (ruling
     *  7-2 — the mailbox). Never reads, updates, or deletes. All-or-none. */
    private static void insertFenced(List<SObject> records) {
        if (
            testFailAnswerInsert &&
            !records.isEmpty() &&
            records[0] instanceof Form_Response_Answer__c
        ) {
            throw new AuraHandledException('Injected test failure.');
        }
        Database.insert(records, true, AccessLevel.SYSTEM_MODE);
    }

    /** settings.anonymous == true → keep scores, store no identity (S1
     *  honors the authored flag; the full anonymous UX is slice S5). */
    private static Boolean isAnonymous(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        Object v = settings == null ? null : settings.get('anonymous');
        return v instanceof Boolean && (Boolean) v;
    }

    /** Client-claimed timing — analytics-grade, never trust-grade. */
    private static Decimal completionSeconds(Map<String, Object> meta) {
        Datetime started = parseIso(getStr(meta, 'startedAt'));
        Datetime submitted = parseIso(getStr(meta, 'submittedAt'));
        if (started == null || submitted == null) {
            return null;
        }
        Long secs = (submitted.getTime() - started.getTime()) / 1000;
        return secs < 0 ? 0 : Decimal.valueOf(secs);
    }

    // ===== availability (ONE truth for both controllers — DEFERRED #20) =====

    /** Closed = manual status='closed', OR before opensAt, OR after closesAt.
     *  Missing/blank window bounds are simply not applied. */
    public static Boolean isClosed(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        if (avail == null) {
            return false;
        }
        if ((String) avail.get('status') == 'closed') {
            return true;
        }
        Datetime now = Datetime.now();
        Datetime opensAt = parseIso((String) avail.get('opensAt'));
        Datetime closesAt = parseIso((String) avail.get('closesAt'));
        return (opensAt != null && now < opensAt) ||
            (closesAt != null &&
            now > closesAt);
    }

    public static String closedMessage(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        Object msg = avail == null ? null : avail.get('closedMessage');
        return msg instanceof String && String.isNotBlank((String) msg)
            ? (String) msg
            : 'This form is no longer accepting responses.';
    }

    /** settings.availability.responseCap: N responses across ALL versions of
     *  the form → closed. Surveys only — a classic form's submissions are
     *  arbitrary business records the platform can't count generically
     *  (DEFERRED #20 note). System-mode counts: the cap must hold for guests
     *  who can see nothing. */
    public static Boolean responseCapReached(
        Map<String, Object> spec,
        Id versionId
    ) {
        if (versionId == null) {
            return false;
        }
        Map<String, Object> avail = availability(spec);
        Decimal cap = avail == null
            ? null
            : numOrNull(avail.get('responseCap'));
        if (cap == null || cap <= 0) {
            return false;
        }
        List<SObject> vs = Database.queryWithBinds(
            'SELECT Form__c FROM Form_Version__c WHERE Id = :vid',
            new Map<String, Object>{ 'vid' => versionId },
            AccessLevel.SYSTEM_MODE
        );
        if (vs.isEmpty()) {
            return false;
        }
        Id formId = (Id) vs[0].get('Form__c');
        // Each answer store counts its OWN rows. Counting survey responses
        // for a Freeform would report zero forever, and the limit would be a
        // setting that does nothing (caught by its own test, S5).
        String soql = FinalFormTypes.fromSpecOrDefault(
                spec,
                FinalFormTypes.SURVEY
            ) == FinalFormTypes.FREEFORM
            ? 'SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :fid'
            : 'SELECT COUNT() FROM Form_Response__c WHERE Form_Version__r.Form__c = :fid';
        Integer taken = Database.countQueryWithBinds(
            soql,
            new Map<String, Object>{ 'fid' => formId },
            AccessLevel.SYSTEM_MODE
        );
        return taken >= cap;
    }

    private static Map<String, Object> availability(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        return settings == null ? null : asMap(settings.get('availability'));
    }

    /** ISO-8601 → Datetime; blank/garbage → null (never a crash). */
    private static Datetime parseIso(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return (Datetime) JSON.deserialize('"' + s + '"', Datetime.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static Decimal numOrNull(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static Id idOrNull(Object v) {
        if (!(v instanceof String) || String.isBlank((String) v)) {
            return null;
        }
        try {
            return (Id) (String) v;
        } catch (Exception e) {
            return null;
        }
    }

    private static String getStr(Map<String, Object> m, String key) {
        Object v = m == null ? null : m.get(key);
        return v instanceof String ? (String) v : null;
    }

    /** One repeatable section's entries → child records (schema §4.1/§8). */
    private static Integer insertEntries(
        RepeatPlan plan,
        Map<String, Object> repeats,
        Id parentId,
        Posture mode
    ) {
        List<Object> entries = repeats == null
            ? null
            : asList(repeats.get(plan.sectionId));
        if (entries == null || entries.isEmpty()) {
            return 0;
        }
        Schema.SObjectType childType = Schema.getGlobalDescribe()
            .get(plan.childObject);
        if (childType == null) {
            throw new AuraHandledException(
                'Unknown object: ' + plan.childObject
            );
        }
        // element id → bound field, once per section
        Map<String, String> fieldByElement = new Map<String, String>();
        for (Object elObj : plan.elements) {
            Map<String, Object> el = asMap(elObj);
            Map<String, Object> binding = asMap(el.get('binding'));
            if (binding != null && binding.get('field') != null) {
                fieldByElement.put(
                    (String) el.get('id'),
                    (String) binding.get('field')
                );
            }
        }
        List<SObject> children = new List<SObject>();
        for (Object entryObj : entries) {
            Map<String, Object> entry = asMap(entryObj);
            if (entry == null || entry.isEmpty()) {
                continue;
            }
            Map<String, Object> bindings = new Map<String, Object>();
            Boolean hasValue = false;
            for (String elId : fieldByElement.keySet()) {
                if (entry.containsKey(elId)) {
                    Object v = entry.get(elId);
                    bindings.put(fieldByElement.get(elId), v);
                    if (v != null && String.valueOf(v) != '') {
                        hasValue = true;
                    }
                }
            }
            if (!hasValue) {
                continue; // an untouched blank entry inserts nothing
            }
            children.add(buildRecord(childType, bindings));
        }
        if (children.isEmpty()) {
            return 0;
        }
        // FLS first, then the linking field (schema §6: the linking field is
        // config, never an authored element — stripping must not eat it)
        List<SObject> stripped = stripForCreate(children, mode);
        for (SObject child : stripped) {
            child.put(plan.relationshipField, parentId);
        }
        doInsert(stripped, mode);
        return stripped.size();
    }

    /** Posture-appropriate FLS strip: INTERNAL removes fields the running user
     *  can't create; GUEST trusts the spec allow-list (the walk already bounded
     *  the fields) and strips nothing. */
    private static List<SObject> stripForCreate(
        List<SObject> records,
        Posture mode
    ) {
        if (mode == Posture.GUEST) {
            return records;
        }
        return Security.stripInaccessible(AccessType.CREATABLE, records)
            .getRecords();
    }

    /**
     * The edit-mode twin of `stripForCreate`. Createable and updateable are
     * genuinely different permissions — a field can be one without the other
     * (a create-only field, or one locked after insert) — so an update MUST
     * ask the question it is actually asking. The old build made the same
     * distinction per field (`isUpdate ? !isUpdateable() : !isCreateable()`).
     *
     * No GUEST branch on purpose: guests never reach the update path, and if
     * that ever changed this should fail loudly rather than pass records
     * through unstripped the way the create twin does for its gated posture.
     */
    private static List<SObject> stripForUpdate(
        List<SObject> records,
        Posture mode
    ) {
        if (mode == Posture.GUEST) {
            throw new AuraHandledException('This form is not available.');
        }
        return Security.stripInaccessible(AccessType.UPDATABLE, records)
            .getRecords();
    }

    // ---- File attachments (schema §8 `files`) ---------------------------

    /**
     * Caps are on the BASE64 STRING, and they are MEASURED, not estimated.
     *
     * The submit path holds the base64 three times over at peak: once inside
     * `payloadJson`, once in the deserialized map, and once as the decoded
     * Blob. Measured against this org (2026-09-03), heap grows at almost
     * exactly 3 bytes per base64 char on the real round trip:
     *
     *   raw 1.00 MB → 1,333,336 b64 chars → heap 4,001,288 of 6,000,000
     *   raw 1.30 MB → 1,733,336 b64 chars → heap 5,201,288 of 6,000,000
     *   raw 1.45 MB → 1,933,336 b64 chars → heap 5,801,288 of 6,000,000
     *   raw 1.60 MB → 2,133,336 b64 chars → LimitException at 6,401,137
     *
     * 1,200,000 chars ≈ 3.6 MB of heap, leaving ~2.4 MB for the spec JSON,
     * the parsed payload, describe maps and the records themselves. That is
     * ~880 KB of actual file — well under the old build's remembered "~4.3 MB",
     * which does not survive contact with a JSON-wrapped payload.
     *
     * `heapHeadroomHoldsAtTheCap` walks the real path at the aggregate cap.
     * If it ever fails, LOWER these — never raise the assertion.
     */
    @TestVisible
    private static final Integer MAX_FILE_B64_CHARS = 1200000;
    @TestVisible
    private static final Integer MAX_PAYLOAD_B64_CHARS = 1200000;

    /** Extensions refused no matter what the author configured — an upload
     *  endpoint is not a place to host executables. */
    private static final Set<String> DENIED_EXTENSIONS = new Set<String>{
        'exe',
        'dll',
        'bat',
        'cmd',
        'com',
        'scr',
        'msi',
        'jar',
        'js',
        'vbs',
        'ps1',
        'sh',
        'app',
        'apk',
        'hta',
        'jse',
        'wsf'
    };

    /**
     * Attaches `payload.files` to the record this transaction just created.
     *
     * Called INSIDE the caller's savepoint, so a rejected file rolls the whole
     * submission back — a respondent never gets a half-saved record. Every
     * check fails closed, and rejection messages stay generic (naming the
     * offending extension would make this a gate oracle).
     *
     * `parentId` is always the record we just inserted; a client-supplied Id
     * is never accepted (RUNTIME_NOTES guest guardrail).
     */
    private static void attachFiles(
        Id parentId,
        Map<String, Object> spec,
        Map<String, Object> payload,
        Posture mode
    ) {
        List<Object> entries = asList(payload.get('files'));
        if (entries == null || entries.isEmpty()) {
            return;
        }
        // Guest upload is its own slice (IMPL_PLAN_FILE_UPLOAD §3): reject
        // rather than silently drop, so the boundary is observable.
        if (mode == Posture.GUEST) {
            throw new AuraHandledException(
                'This form cannot accept file uploads.'
            );
        }

        // Aggregate cap BEFORE decoding anything — the whole-payload check
        // RUNTIME_NOTES requires alongside the per-file one.
        Integer totalChars = 0;
        for (Object entryObj : entries) {
            Map<String, Object> entry = asMap(entryObj);
            String b64 = entry == null ? null : (String) entry.get('base64');
            totalChars += (b64 == null ? 0 : b64.length());
        }
        if (totalChars > MAX_PAYLOAD_B64_CHARS) {
            throw new AuraHandledException(
                'Your attachments are too large. Nothing was recorded.'
            );
        }

        Map<String, Set<String>> allowedByElement = fileElementAllowLists(spec);
        List<ContentVersion> versions = new List<ContentVersion>();
        for (Object entryObj : entries) {
            Map<String, Object> entry = asMap(entryObj);
            if (entry == null) {
                continue;
            }
            String elementId = (String) entry.get('elementId');
            String name = (String) entry.get('name');
            String b64 = (String) entry.get('base64');
            if (
                String.isBlank(elementId) ||
                String.isBlank(name) ||
                String.isBlank(b64)
            ) {
                throw new AuraHandledException(
                    'That file could not be attached. Nothing was recorded.'
                );
            }
            // The PUBLISHED SPEC is the allow-list — same law as the field
            // walk. An elementId that isn't an authored `file` element (or
            // sits inside a repeatable section, schema §4.1) is refused.
            if (!allowedByElement.containsKey(elementId)) {
                throw new AuraHandledException(
                    'That file could not be attached. Nothing was recorded.'
                );
            }
            if (b64.length() > MAX_FILE_B64_CHARS) {
                throw new AuraHandledException(
                    'That file is too large. Nothing was recorded.'
                );
            }
            // Type is derived SERVER-SIDE from the name; the client's
            // contentType is never read, because it is trivially forged.
            if (!extensionAllowed(name, allowedByElement.get(elementId))) {
                throw new AuraHandledException(
                    'That file type cannot be attached. Nothing was recorded.'
                );
            }
            ContentVersion cv = new ContentVersion();
            cv.Title = name;
            cv.PathOnClient = name;
            cv.IsMajorVersion = true;
            cv.FirstPublishLocationId = parentId; // auto-links, one step
            try {
                cv.VersionData = EncodingUtil.base64Decode(b64);
            } catch (Exception e) {
                throw new AuraHandledException(
                    'That file could not be attached. Nothing was recorded.'
                );
            }
            versions.add(cv);
        }
        if (!versions.isEmpty()) {
            doInsert(versions, mode);
        }
    }

    /**
     * Every authored `file` element id → the extension allow-list resolved
     * from its `accept` config (empty = any, subject to DENIED_EXTENSIONS).
     * Elements inside a repeatable section are OMITTED: schema §4.1 forbids
     * them, the builder blocks the drop, and this is the server-side backstop
     * for a spec that predates the block or was hand-edited.
     */
    private static Map<String, Set<String>> fileElementAllowLists(
        Map<String, Object> spec
    ) {
        Map<String, Set<String>> out = new Map<String, Set<String>>();
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null || sec.get('repeat') != null) {
                    continue; // §4.1 backstop
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null) {
                        continue;
                    }
                    Object elType = el.get('type');
                    if (
                        !(elType instanceof String) || (String) elType != 'file'
                    ) {
                        continue;
                    }
                    String elId = (String) el.get('id');
                    if (String.isBlank(elId)) {
                        continue;
                    }
                    Map<String, Object> config = asMap(el.get('config'));
                    Object accept = config == null
                        ? null
                        : config.get('accept');
                    out.put(elId, parseAccept((String) accept));
                }
            }
        }
        return out;
    }

    /** `accept` (".pdf,.png" or "application/pdf") → a lower-case extension
     *  set. MIME entries can't gate an extension, so they widen to "any" and
     *  leave DENIED_EXTENSIONS as the floor. */
    private static Set<String> parseAccept(String accept) {
        Set<String> exts = new Set<String>();
        if (String.isBlank(accept)) {
            return exts;
        }
        for (String part : accept.split(',')) {
            String token = part.trim().toLowerCase();
            if (token.startsWith('.') && token.length() > 1) {
                exts.add(token.substring(1));
            }
        }
        return exts;
    }

    private static Boolean extensionAllowed(String name, Set<String> allowed) {
        Integer dot = name.lastIndexOf('.');
        String ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
        if (String.isBlank(ext) || DENIED_EXTENSIONS.contains(ext)) {
            return false;
        }
        return allowed == null || allowed.isEmpty() || allowed.contains(ext);
    }

    /** Posture-appropriate insert: INTERNAL as the running user (CRUD/FLS via
     *  `as user`); GUEST in system mode (guests own nothing — the gate + spec
     *  allow-list are the boundary). All-or-none either way. */
    private static void doInsert(List<SObject> records, Posture mode) {
        if (mode == Posture.GUEST) {
            Database.insert(records, true, AccessLevel.SYSTEM_MODE);
        } else {
            insert as user records;
        }
    }

    /**
     * Edit-mode DML. `update as user` is the whole security story for a
     * client-supplied record id: the caller can only modify records their own
     * CRUD/FLS/sharing already permits, so a hand-crafted `meta.existingRecordId`
     * buys them nothing they did not already have.
     *
     * Owner ruling D1 (2026-09-08): LAST WRITE WINS. There is deliberately no
     * `LastModifiedDate` check — a submit against a record someone else edited
     * in the meantime overwrites their change to the fields this form binds
     * (fields the form does not bind are untouched, since only spec-bound
     * fields are ever built into the record).
     */
    private static void doUpdate(List<SObject> records, Posture mode) {
        if (mode == Posture.GUEST) {
            throw new AuraHandledException('This form is not available.');
        }
        update as user records;
    }

    /** Raw JSON answers → a typed SObject (coercion by describe type). */
    private static SObject buildRecord(
        Schema.SObjectType type,
        Map<String, Object> bindings
    ) {
        SObject record = type.newSObject();
        Map<String, Schema.SObjectField> fields = type.getDescribe()
            .fields.getMap();
        for (String fieldName : bindings.keySet()) {
            Schema.SObjectField field = fields.get(fieldName);
            if (field == null) {
                continue; // spec drift — never a crash
            }
            Object coerced = coerce(
                field.getDescribe().getType(),
                bindings.get(fieldName)
            );
            if (coerced != null) {
                record.put(fieldName, coerced);
            }
        }
        return record;
    }

    @SuppressWarnings('PMD.CyclomaticComplexity')
    private static Object coerce(Schema.DisplayType t, Object raw) {
        if (raw == null) {
            return null;
        }
        String s = String.valueOf(raw);
        if (s == '' && t != Schema.DisplayType.BOOLEAN) {
            return null;
        }
        switch on t {
            when BOOLEAN {
                return raw instanceof Boolean ? raw : s == 'true';
            }
            when DOUBLE, CURRENCY, PERCENT {
                return Decimal.valueOf(s);
            }
            when INTEGER, LONG {
                return Integer.valueOf(Decimal.valueOf(s).intValue());
            }
            when DATE {
                return Date.valueOf(s);
            }
            when DATETIME {
                // ISO-8601 from the client — JSON parsing handles zones
                return (Datetime) JSON.deserialize(
                    '"' + s + '"',
                    Datetime.class
                );
            }
            when MULTIPICKLIST {
                if (raw instanceof List<Object>) {
                    List<String> parts = new List<String>();
                    for (Object o : (List<Object>) raw) {
                        parts.add(String.valueOf(o));
                    }
                    return String.join(parts, ';');
                }
                return s;
            }
            when else {
                if (raw instanceof List<Object>) {
                    // checkbox-group answers on text fields
                    List<String> parts = new List<String>();
                    for (Object o : (List<Object>) raw) {
                        parts.add(String.valueOf(o));
                    }
                    return String.join(parts, ';');
                }
                return s;
            }
        }
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
