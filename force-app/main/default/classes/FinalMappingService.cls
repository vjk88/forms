/**
 * FinalMappingService — one mapping run for one submission
 * (FREEFORM_F2_MAPPING_SPEC 6.4).
 *
 * Called by FinalMappingJob, which the trigger queues, and directly by
 * FinalMappingRetryController. without sharing: the job runs as whoever
 * queued it — a site guest for a new submission — and must read the
 * submission, its version and its answers regardless. Both entry points
 * identify the submission on the server; the retry controller checks
 * permission and visibility before calling in.
 *
 * Caught failures roll back to the savepoint and record Failed with a
 * message. Limit exceptions cannot be caught; they roll back everything
 * and leave the status as it was (D43).
 */
public without sharing class FinalMappingService {
    public class Result {
        @AuraEnabled
        public String status;
        @AuraEnabled
        public String message;

        public Result(String status, String message) {
            this.status = status;
            this.message = message;
        }
    }

    /** A step failed; the message is already a sentence an admin can act on. */
    public class StepException extends Exception {
    }

    public static Result run(Id submissionId) {
        List<Form_Submission__c> rows = [
            SELECT Id, Mapping_Status__c, Mapping_Attempts__c, Form_Version__c
            FROM Form_Submission__c
            WHERE Id = :submissionId
            WITH SYSTEM_MODE
            FOR UPDATE
        ];
        if (rows.isEmpty()) {
            return new Result(null, 'That submission no longer exists.');
        }
        Form_Submission__c sub = rows[0];
        if (!FinalMappingRules.RUNNABLE.contains(sub.Mapping_Status__c)) {
            return new Result(
                sub.Mapping_Status__c,
                'Nothing to run: this submission is ' +
                    (sub.Mapping_Status__c == null
                        ? 'not set up for mapping'
                        : sub.Mapping_Status__c) +
                    '.'
            );
        }

        sub.Mapping_Attempts__c =
            (sub.Mapping_Attempts__c == null ? 0 : sub.Mapping_Attempts__c) + 1;
        Database.update(
            new Form_Submission__c(
                Id = sub.Id,
                Mapping_Attempts__c = sub.Mapping_Attempts__c
            ),
            true,
            AccessLevel.SYSTEM_MODE
        );
        // After the attempts write, so a rollback keeps the count (6.4).
        Savepoint sp = Database.setSavepoint();
        try {
            Map<String, Id> recordIds = execute(sub);
            Database.update(
                new Form_Submission__c(
                    Id = sub.Id,
                    Mapping_Status__c = FinalMappingRules.STATUS_DONE,
                    Mapping_Message__c = null,
                    Mapping_Run_At__c = Datetime.now(),
                    Created_Records__c = JSON.serialize(recordIds)
                ),
                true,
                AccessLevel.SYSTEM_MODE
            );
            return new Result(FinalMappingRules.STATUS_DONE, null);
        } catch (Exception e) {
            Database.rollback(sp);
            String message = e.getMessage().abbreviate(32768);
            // Never reuse in-memory records after a rollback: their Ids point
            // at rows that no longer exist. Status only (6.4).
            Database.update(
                new Form_Submission__c(
                    Id = sub.Id,
                    Mapping_Status__c = FinalMappingRules.STATUS_FAILED,
                    Mapping_Message__c = message,
                    Mapping_Run_At__c = Datetime.now()
                ),
                true,
                AccessLevel.SYSTEM_MODE
            );
            return new Result(FinalMappingRules.STATUS_FAILED, message);
        }
    }

    private static Map<String, Id> execute(Form_Submission__c sub) {
        Form_Version__c version = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :sub.Form_Version__c
            WITH SYSTEM_MODE
        ];
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        List<Map<String, Object>> actions = FinalMappingRules.actionsOf(spec);
        Run run = new Run();
        run.questions = FinalMappingRules.questionMap(spec);
        run.answers = answersOf(sub.Id);
        run.writer = new FinalMappingWriter(actions);

        Integer index = 0;
        for (Map<String, Object> action : actions) {
            index++;
            String objectApi = String.valueOf(action.get('object'));
            String name = 'Step ' + index + ' (' + objectApi + ')';
            Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApi);
            if (t == null) {
                throw new StepException(
                    name + ': the object no longer exists.'
                );
            }
            try {
                run.recordIds.put(
                    (String) action.get('id'),
                    runStep(action, t.getDescribe(), run)
                );
            } catch (StepException e) {
                throw new StepException(name + ': ' + e.getMessage());
            } catch (DmlException e) {
                throw new StepException(
                    name + ': ' + dmlSentence(e, t.getDescribe().getLabel())
                );
            } catch (FinalMappingRules.MappingValueException e) {
                throw new StepException(name + ': ' + e.getMessage());
            } catch (FinalMappingWriter.FenceException e) {
                throw new StepException(name + ': ' + e.getMessage());
            } catch (QueryException e) {
                // Typed conditions that broke after publishing (a field
                // deleted, a value Salesforce now refuses).
                throw new StepException(
                    name + ': ' + FinalMappingSoql.readableError(e.getMessage())
                );
            }
        }
        return run.recordIds;
    }

    private class Run {
        Map<String, Map<String, Object>> questions;
        Map<String, Form_Submission_Answer__c> answers;
        FinalMappingWriter writer;
        Map<String, Id> recordIds = new Map<String, Id>();
    }

    private static Id runStep(
        Map<String, Object> action,
        Schema.DescribeSObjectResult d,
        Run run
    ) {
        String actionId = (String) action.get('id');
        if (action.get('operation') == FinalMappingRules.OP_FIND_OR_CREATE) {
            Map<String, Object> match = FinalMappingRules.asMap(
                action.get('match')
            );
            Id found = findOne(match, d, run);
            if (found != null) {
                if (match.get('onMatch') == FinalMappingRules.ON_MATCH_UPDATE) {
                    SObject rec = d.getSObjectType().newSObject(found);
                    if (fill(rec, action, d, run, true) > 0) {
                        run.writer.updateFor(actionId, rec);
                    }
                }
                return found;
            }
        }
        SObject rec = d.getSObjectType().newSObject();
        fill(rec, action, d, run, false);
        return run.writer.insertFor(actionId, rec);
    }

    /** Puts each resolvable value on the record; returns how many. */
    private static Integer fill(
        SObject rec,
        Map<String, Object> action,
        Schema.DescribeSObjectResult d,
        Run run,
        Boolean updating
    ) {
        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        Integer written = 0;
        for (Object o : FinalMappingRules.asList(action.get('fields'))) {
            Map<String, Object> f = FinalMappingRules.asMap(o);
            if (f == null || (updating && f.get('writeOnMatch') != true)) {
                continue;
            }
            String fieldApi = String.valueOf(f.get('field'));
            Schema.SObjectField sf = fieldMap.get(fieldApi);
            if (sf == null) {
                throw new StepException(fieldApi + ' no longer exists.');
            }
            Schema.DescribeFieldResult fd = sf.getDescribe();
            Object value = sourceValue(
                FinalMappingRules.asMap(f.get('source')),
                fd,
                run
            );
            if (value == null) {
                continue; // a skipped answer never writes (D44)
            }
            rec.put(fd.getName(), FinalMappingRules.coerce(value, fd));
            written++;
        }
        return written;
    }

    private static Object sourceValue(
        Map<String, Object> src,
        Schema.DescribeFieldResult fd,
        Run run
    ) {
        String kind = String.valueOf(src.get('kind'));
        if (kind == 'literal') {
            Object v = src.get('value');
            return v == null || String.isBlank(String.valueOf(v)) ? null : v;
        }
        if (kind == 'recordRef') {
            String ref = String.valueOf(src.get('ref'));
            Id target = null;
            if (ref.startsWith('action:')) {
                target = run.recordIds.get(ref.substring(7));
            } else if (ref.startsWith('answer:')) {
                Form_Submission_Answer__c a = run.answers.get(ref.substring(7));
                if (a != null && String.isNotBlank(a.Text_Value__c)) {
                    try {
                        target = Id.valueOf(a.Text_Value__c);
                    } catch (Exception e) {
                        throw new StepException(
                            'the record picked for ' +
                                fd.getLabel() +
                                ' isn’t a record id.'
                        );
                    }
                }
            }
            if (target == null) {
                return null;
            }
            for (Schema.SObjectType rt : fd.getReferenceTo()) {
                if (rt == target.getSobjectType()) {
                    return target;
                }
            }
            throw new StepException(
                fd.getLabel() +
                    ' can’t point at a ' +
                    target.getSobjectType().getDescribe().getLabel() +
                    '.'
            );
        }
        String key = String.valueOf(src.get('elementKey'));
        Form_Submission_Answer__c a = run.answers.get(key);
        if (a == null) {
            return null;
        }
        Map<String, Object> q = run.questions.get(key);
        if (a.Value_Unparsed__c == true) {
            if (FinalMappingRules.isTextLike(fd.getType())) {
                return String.isBlank(a.Text_Value__c) ? null : a.Text_Value__c;
            }
            throw new StepException(
                'the answer to "' +
                    labelOf(q) +
                    '" couldn’t be read as ' +
                    a.Answer_Type__c +
                    ', so it can’t go into ' +
                    fd.getLabel() +
                    '.'
            );
        }
        // One conversion, against the field this value is going into.
        return FinalMappingRules.answerValue(a, q, fd);
    }

    private static Id findOne(
        Map<String, Object> match,
        Schema.DescribeSObjectResult d,
        Run run
    ) {
        Map<String, Object> src = FinalMappingRules.asMap(match.get('source'));
        Schema.SObjectField mf = d.fields.getMap()
            .get(String.valueOf(match.get('field')));
        if (mf == null) {
            throw new StepException(
                'the field it searches on no longer exists.'
            );
        }
        String key = String.valueOf(src.get('elementKey'));
        // The SAME conversion the write uses, against the field being searched:
        // a choice written as a label must not be searched as its value.
        Object matchValue = FinalMappingRules.answerValue(
            run.answers.get(key),
            run.questions.get(key),
            mf.getDescribe()
        );
        if (matchValue == null) {
            // Never search for a blank value: it matches every record without one (D44).
            throw new StepException(
                'the answer used to find the record was left blank, so no search was run.'
            );
        }
        String whereClause;
        Map<String, Object> binds;
        if (match.get('filterMode') == FinalMappingValidator.FILTER_MODE_SOQL) {
            FinalMappingSoql.Parsed p = typedConditions(match, d, run);
            whereClause = p.whereClause;
            binds = typedBinds(p, d, run);
        } else {
            Resolved r = resolvedFilter(match.get('filter'), d, run);
            FinalLookupService.Compiled c = FinalLookupService.compile(
                new Map<String, Object>{ 'filter' => r.filter },
                r.answers,
                d.getName()
            );
            if (c.blocked || String.isBlank(c.whereClause)) {
                throw new StepException(
                    'its search filter couldn’t be applied' +
                    (c.blockedReason == null ? '.' : ': ' + c.blockedReason)
                );
            }
            whereClause = c.whereClause;
            binds = new Map<String, Object>(c.binds);
        }
        // m* (typed), b* (compiled) and mappingMatchValue never collide.
        binds.put('mappingMatchValue', matchValue);
        String soql =
            'SELECT Id FROM ' +
            d.getName() +
            ' WHERE ' +
            mf.getDescribe().getName() +
            ' = :mappingMatchValue' +
            ' AND (' +
            whereClause + // NOPMD — typed conditions: parsed by FinalMappingSoql, checked as the author at publish (D50)
            ') LIMIT 2';
        List<SObject> hits = Database.queryWithBinds(
            soql,
            binds,
            AccessLevel.SYSTEM_MODE
        );
        if (hits.size() > 1) {
            throw new StepException(
                'more than one ' +
                    d.getLabel() +
                    ' matched, so nothing was written. Merge or fix the duplicates, then retry.'
            );
        }
        return hits.isEmpty() ? null : hits[0].Id;
    }

    /** Typed conditions (D50), parsed again here: a spec is never trusted. */
    private static FinalMappingSoql.Parsed typedConditions(
        Map<String, Object> match,
        Schema.DescribeSObjectResult d,
        Run run
    ) {
        Object raw = match.get('soql');
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            raw instanceof String ? (String) raw : null
        );
        if (p.problem != null) {
            throw new StepException('its conditions can’t run: ' + p.problem);
        }
        return p;
    }

    /**
     * Each answer in typed conditions, converted against the field it sits
     * next to (a choice searched the way it is written) and bound — never
     * spliced into the query. Under LIKE it matches as typed: a respondent’s
     * % or _ is not a wildcard.
     */
    private static Map<String, Object> typedBinds(
        FinalMappingSoql.Parsed p,
        Schema.DescribeSObjectResult d,
        Run run
    ) {
        Map<String, Object> binds = new Map<String, Object>();
        for (FinalMappingSoql.Token t : p.tokens) {
            Schema.DescribeFieldResult fd = FinalMappingRules.fieldAt(
                d.getName(),
                t.fieldPath
            );
            if (fd == null) {
                throw new StepException(
                    'its conditions can’t run: ' +
                        t.fieldPath +
                        ' no longer exists.'
                );
            }
            Map<String, Object> q = run.questions.get(t.elementId);
            Object v = FinalMappingRules.answerValue(
                run.answers.get(t.elementId),
                q,
                fd
            );
            if (v == null) {
                // Never search on a blank: it matches every record without one (D44).
                throw new StepException(
                    'the answer to "' +
                        labelOf(q) +
                        '" was left blank, so no search was run.'
                );
            }
            if (t.operator == 'LIKE') {
                v = FinalMappingSoql.escapeLike(String.valueOf(v));
            }
            binds.put(t.bindName, v);
        }
        return binds;
    }

    /**
     * The filter the compiler is handed, and the answers its `$field.` tokens
     * point at. A converted answer never goes into the row itself: the
     * compiler reads a row's value as a possible `$User.` or `$field.` token,
     * so a respondent who typed "$User.Name" would be searched as the running
     * user's name. From the answers map it comes back as-is.
     */
    private class Resolved {
        Object filter;
        Map<String, Object> answers = new Map<String, Object>();
    }

    /**
     * A copy of the filter with every `$field.` value already converted
     * against the field that row filters on — which is not the field the
     * answer would be written to. The shared compiler stays exactly as
     * lookups use it; only the values it is handed change.
     *
     * A value that resolves to nothing is left as the token, so the compiler
     * refuses the filter in its own words and the step fails rather than
     * searching on a blank.
     */
    private static Resolved resolvedFilter(
        Object filter,
        Schema.DescribeSObjectResult d,
        Run run
    ) {
        Resolved out = new Resolved();
        out.filter = filter;
        if (!(filter instanceof Map<String, Object>)) {
            return out;
        }
        Map<String, Object> copy = (Map<String, Object>) JSON.deserializeUntyped(
            JSON.serialize(filter)
        );
        out.filter = copy;
        for (Object rowObj : FinalMappingRules.asList(copy.get('rows'))) {
            Map<String, Object> row = FinalMappingRules.asMap(rowObj);
            if (row == null) {
                continue;
            }
            Schema.DescribeFieldResult fd = FinalMappingRules.fieldAt(
                d.getName(),
                String.valueOf(row.get('fieldPath'))
            );
            if (fd == null) {
                continue; // the compiler refuses the path itself, in better words
            }
            // "is one of" / "includes" keep their entries in `values`, and the
            // compiler never resolves tokens in there at all — so they are
            // resolved here, keeping the list a list.
            if (row.get('values') instanceof List<Object>) {
                List<Object> resolved = new List<Object>();
                Boolean unresolved = false;
                for (Object entry : (List<Object>) row.get('values')) {
                    if (!isToken(entry)) {
                        resolved.add(entry);
                        continue;
                    }
                    Object converted = answerFor((String) entry, fd, run);
                    if (converted == null) {
                        unresolved = true;
                        break;
                    }
                    if (converted instanceof List<Object>) {
                        resolved.addAll((List<Object>) converted);
                    } else {
                        resolved.add(converted);
                    }
                }
                // A condition that cannot be resolved blocks the whole filter, the
                // way the compiler does it — an empty list is how we say so. It
                // never silently drops out and widens the search.
                row.put('values', unresolved ? new List<Object>() : resolved);
                continue;
            }
            if (isToken(row.get('value'))) {
                Object converted = answerFor(
                    (String) row.get('value'),
                    fd,
                    run
                );
                if (converted != null) {
                    // A private key: `__m…` can't be an element id, so it never
                    // collides with a real question.
                    String key = '__m' + out.answers.size();
                    out.answers.put(key, converted);
                    row.put('value', '$field.' + key);
                }
                // left as the token when it resolves to nothing: the compiler then
                // blocks the filter and the step fails, rather than searching blank
            }
        }
        return out;
    }

    private static Boolean isToken(Object raw) {
        return raw instanceof String && ((String) raw).startsWith('$field.');
    }

    private static Object answerFor(
        String token,
        Schema.DescribeFieldResult fd,
        Run run
    ) {
        String key = token.substring(7);
        return FinalMappingRules.answerValue(
            run.answers.get(key),
            run.questions.get(key),
            fd
        );
    }

    private static Map<String, Form_Submission_Answer__c> answersOf(
        Id submissionId
    ) {
        Map<String, Form_Submission_Answer__c> out = new Map<String, Form_Submission_Answer__c>();
        for (Form_Submission_Answer__c a : [
            SELECT
                Element_Key__c,
                Answer_Type__c,
                Value_Unparsed__c,
                Text_Value__c,
                Numeric_Value__c,
                Boolean_Value__c,
                Date_Value__c,
                DateTime_Value__c,
                Selected_Options_JSON__c
            FROM Form_Submission_Answer__c
            WHERE Form_Submission__c = :submissionId
            WITH SYSTEM_MODE
            ORDER BY Entry_Index__c NULLS FIRST
        ]) {
            if (!out.containsKey(a.Element_Key__c)) {
                out.put(a.Element_Key__c, a);
            }
        }
        return out;
    }

    private static String dmlSentence(DmlException e, String objectLabel) {
        if (
            e.getNumDml() > 0 &&
            e.getDmlType(0) == StatusCode.DUPLICATES_DETECTED
        ) {
            return 'Salesforce’s duplicate rules blocked saving this ' +
                objectLabel +
                '.';
        }
        return e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage();
    }

    private static String labelOf(Map<String, Object> q) {
        return q == null ||
            q.get('label') == null
            ? 'a question'
            : String.valueOf(q.get('label'));
    }
}
