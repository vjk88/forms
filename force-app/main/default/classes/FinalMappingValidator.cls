/**
 * FinalMappingValidator — what publishing a mapping must refuse, and what
 * it must warn about (FREEFORM_F2_MAPPING_SPEC section 7).
 *
 * with sharing and no system mode: every describe check here is asked as
 * the person publishing, because their permissions are the only thing
 * standing between a public form and system-mode writes later (section 8).
 * publishSpec calls validateForPublish; FinalPublishWarnings calls
 * validate so the dialog shows the same results.
 */
public with sharing class FinalMappingValidator {
    public static final String BLOCKER = 'blocker';
    public static final String WARNING = 'warning';

    public class Diagnostic {
        @AuraEnabled
        public String severity;
        @AuraEnabled
        public String actionId;
        @AuraEnabled
        public String field;
        /** The whole sentence, step and section included (publish refusals). */
        @AuraEnabled
        public String message;
        /** Where it is, as the Studio shows it: "Step 2 · Contact". */
        @AuraEnabled
        public String step;
        /** The part of the step, by its heading: "Find an existing Contact where". */
        @AuraEnabled
        public String section;
        /** The sentence alone, for a place that already shows the step. */
        @AuraEnabled
        public String text;
        /** A question the problem is about, so the same one is said once. */
        @AuraEnabled
        public String questionKey;
        @AuraEnabled
        public String questionLabel;
        /** What this step uses that question for: "finds the Contact". */
        @AuraEnabled
        public String questionUse;

        public Diagnostic(
            String severity,
            String actionId,
            String field,
            String message
        ) {
            this.severity = severity;
            this.actionId = actionId;
            this.field = field;
            this.message = message;
            this.text = message;
        }

        public Diagnostic about(String key, String label, String use) {
            this.questionKey = key;
            this.questionLabel = label;
            this.questionUse = use;
            return this;
        }
    }

    /** One problem in the step being checked, placed by its step and section. */
    private static Diagnostic at(
        String severity,
        String actionId,
        String field,
        Context ctx,
        String section,
        String text
    ) {
        Diagnostic d = new Diagnostic(severity, actionId, field, text);
        d.step = ctx.stepLabel;
        d.section = section;
        d.message =
            ctx.stepLabel +
            (section == null ? '' : ', “' + section + '”') +
            ': ' +
            text;
        return d;
    }

    /** The object a step searches, for its sentences. */
    private static String d0(Context ctx) {
        return ctx.objectLabel == null ? 'record' : ctx.objectLabel;
    }

    /** Throws on the first blocker. "Couldn't check" is a refusal too (D38). */
    public static void validateForPublish(Id formId, Map<String, Object> spec) {
        List<Diagnostic> found;
        try {
            found = validate(spec, formId);
        } catch (Exception e) {
            throw FinalMappingRules.refusal(
                'The mapping couldn’t be checked, so the form wasn’t published. ' +
                e.getMessage()
            );
        }
        for (Diagnostic d : found) {
            if (d.severity == BLOCKER) {
                throw FinalMappingRules.refusal(
                    'The mapping can’t be published yet: ' + d.message
                );
            }
        }
    }

    public static List<Diagnostic> validate(
        Map<String, Object> spec,
        Id formId
    ) {
        List<Diagnostic> out = new List<Diagnostic>();
        Map<String, Object> mapping = spec == null
            ? null
            : FinalMappingRules.asMap(spec.get('mapping'));
        List<Object> raw = FinalMappingRules.asList(
            mapping == null ? null : mapping.get('actions')
        );
        if (raw.isEmpty()) {
            return out;
        }
        if (raw.size() > FinalMappingRules.MAX_STEPS) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    null,
                    null,
                    'A form can have at most ' +
                        FinalMappingRules.MAX_STEPS +
                        ' mapping steps. This one has ' +
                        raw.size() +
                        '.'
                )
            );
        }

        Context ctx = new Context();
        ctx.questions = FinalMappingRules.questionMap(spec);
        ctx.skippable = FinalMappingRules.skippableElementIds(spec);
        ctx.isPublic = isPublic(formId);
        ctx.placeholders = new Map<String, Object>();
        for (String key : ctx.questions.keySet()) {
            ctx.placeholders.put(key, 'x');
        }

        Set<String> seenIds = new Set<String>();
        Integer index = 0;
        for (Object o : raw) {
            index++;
            Map<String, Object> action = FinalMappingRules.asMap(o);
            ctx.stepLabel = 'Step ' + index;
            ctx.objectLabel = null;
            ctx.search = null;
            ctx.found = null;
            ctx.create = null;
            if (action == null) {
                out.add(
                    at(
                        BLOCKER,
                        null,
                        null,
                        ctx,
                        null,
                        'This step can’t be read. Remove it and add it again.'
                    )
                );
                continue;
            }
            String id = str(action.get('id'));
            if (id == null || !seenIds.add(id)) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        null,
                        ctx,
                        null,
                        'This step has no id, or shares one with another step. Remove it and add it again.'
                    )
                );
                continue;
            }
            checkAction(action, id, ctx, out);
        }
        return out;
    }

    private class Context {
        Map<String, Map<String, Object>> questions;
        Set<String> skippable;
        Boolean isPublic;
        Map<String, Object> placeholders;
        /** The step being checked: its label and its sections' headings. */
        String stepLabel;
        String objectLabel;
        String search;
        String found;
        String create;
        /** Steps seen so far, id → object API name: the only legal action refs. */
        Map<String, String> earlier = new Map<String, String>();
    }

    private static void checkAction(
        Map<String, Object> action,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        String objectApi = str(action.get('object'));
        Schema.SObjectType t = objectApi == null
            ? null
            : Schema.getGlobalDescribe().get(objectApi);
        if (t == null) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    null,
                    'Its object doesn’t exist in this org. Remove this step.'
                )
            );
            return;
        }
        Schema.DescribeSObjectResult d = t.getDescribe();
        // Said the way the step reads on the Data tab.
        String article = d.getLabel().left(1).toLowerCase().containsAny('aeiou')
            ? 'an '
            : 'a ';
        ctx.stepLabel += ' · ' + d.getLabel();
        ctx.objectLabel = d.getLabel();
        ctx.search = 'Find an existing ' + d.getLabel() + ' where';
        ctx.found = 'If one is found';
        ctx.create =
            (str(action.get('operation')) == FinalMappingRules.OP_FIND_OR_CREATE
                ? 'If none is found, create '
                : 'Create ') +
            article +
            d.getLabel() +
            ' with';
        if (
            FinalMappingRules.SETUP_OBJECTS.contains(d.getName().toLowerCase())
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    null,
                    'Salesforce can’t write ' +
                        d.getLabelPlural() +
                        ' together with ordinary records. Remove this step.'
                )
            );
            return;
        }
        String op = str(action.get('operation'));
        if (
            op != FinalMappingRules.OP_CREATE &&
            op != FinalMappingRules.OP_FIND_OR_CREATE
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    null,
                    'Choose Always create or Find or create.'
                )
            );
            return;
        }
        if (!d.isCreateable()) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    null,
                    'You can’t create ' +
                        d.getLabelPlural() +
                        ', so this form can’t either.'
                )
            );
            return;
        }

        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        String matchField = null;
        String onMatch = null;
        if (op == FinalMappingRules.OP_FIND_OR_CREATE) {
            Map<String, Object> match = FinalMappingRules.asMap(
                action.get('match')
            );
            if (match == null) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        null,
                        ctx,
                        ctx.search,
                        'Add the conditions that find the ' + d.getLabel() + '.'
                    )
                );
            } else {
                onMatch = str(match.get('onMatch'));
                matchField = checkMatch(match, d, fieldMap, id, ctx, out);
            }
        }

        Set<String> assigned = new Set<String>();
        List<String> overwritable = new List<String>();
        for (Object fo : FinalMappingRules.asList(action.get('fields'))) {
            Map<String, Object> f = FinalMappingRules.asMap(fo);
            String fieldApi = f == null ? null : str(f.get('field'));
            Schema.SObjectField sf = fieldApi == null
                ? null
                : fieldMap.get(fieldApi);
            if (sf == null) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fieldApi,
                        ctx,
                        ctx.create,
                        'A field here doesn’t exist' +
                            (fieldApi == null ? '.' : ': ' + fieldApi + '.') +
                            ' Remove it.'
                    )
                );
                continue;
            }
            Schema.DescribeFieldResult fd = sf.getDescribe();
            if (FinalMappingRules.isMultiTarget(fd)) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        fd.getLabel() +
                        ' can point at more than one kind of record, which mappings don’t support. Remove it.'
                    )
                );
                continue;
            }
            if (!assigned.add(fd.getName().toLowerCase())) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        fd.getLabel() + ' is here twice. Remove one.'
                    )
                );
                continue;
            }
            if (!fd.isCreateable()) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        'You can’t set ' +
                            fd.getLabel() +
                            ' on ' +
                            d.getLabelPlural() +
                            ', so this form can’t either.'
                    )
                );
            }
            if (f.get('writeOnMatch') == true) {
                if (onMatch != FinalMappingRules.ON_MATCH_UPDATE) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.found,
                            fd.getLabel() +
                                ' is ticked to update, but a found ' +
                                d.getLabel() +
                                ' is used as it is. Untick it, or choose Update it.'
                        )
                    );
                } else if (!fd.isUpdateable()) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.found,
                            'You can’t edit ' +
                                fd.getLabel() +
                                ' on ' +
                                d.getLabelPlural() +
                                ', so this form can’t update it. Untick it.'
                        )
                    );
                } else {
                    overwritable.add(fd.getLabel());
                }
            }
            checkSource(
                FinalMappingRules.asMap(f.get('source')),
                fd,
                id,
                ctx,
                out
            );
        }

        for (Schema.SObjectField sf : fieldMap.values()) {
            Schema.DescribeFieldResult fd = sf.getDescribe();
            if (
                isRequired(fd) && !assigned.contains(fd.getName().toLowerCase())
            ) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        fd.getLabel() +
                        ' is missing, and Salesforce requires it. Add it and choose what fills it.'
                    )
                );
            }
        }

        if (
            ctx.isPublic &&
            onMatch == FinalMappingRules.ON_MATCH_UPDATE &&
            !overwritable.isEmpty()
        ) {
            out.add(
                at(
                    WARNING,
                    id,
                    null,
                    ctx,
                    ctx.found,
                    'This form is public. Anyone who matches a ' +
                        d.getLabel() +
                        ' can update its ' +
                        String.join(overwritable, ', ') +
                        ' without signing in.'
                )
            );
        }
        ctx.earlier.put(id, d.getName());
    }

    /** Returns the match field's API name, or null when it is unusable. */
    private static String checkMatch(
        Map<String, Object> match,
        Schema.DescribeSObjectResult d,
        Map<String, Schema.SObjectField> fieldMap,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        String onMatch = str(match.get('onMatch'));
        if (
            onMatch != FinalMappingRules.ON_MATCH_REUSE &&
            onMatch != FinalMappingRules.ON_MATCH_UPDATE
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    ctx.found,
                    'Choose what happens to it: use it as it is, or update it.'
                )
            );
        } else if (
            onMatch == FinalMappingRules.ON_MATCH_UPDATE && !d.isUpdateable()
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    null,
                    ctx,
                    ctx.found,
                    'You can’t edit ' +
                        d.getLabelPlural() +
                        ', so this step can’t update the one it finds.'
                )
            );
        }

        Set<String> answerKeys = new Set<String>();
        String matchField = null;

        // Steps saved before round 1 had a separate "Where [field] matches the
        // answer to [question]". It still runs, as a condition like any other.
        String fieldApi = str(match.get('field'));
        if (fieldApi != null) {
            Schema.SObjectField mf = fieldMap.get(fieldApi);
            if (mf == null) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fieldApi,
                        ctx,
                        ctx.search,
                        'A condition uses a field that doesn’t exist.'
                    )
                );
            } else if (!mf.getDescribe().isFilterable()) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fieldApi,
                        ctx,
                        ctx.search,
                        'Salesforce can’t search by ' +
                            mf.getDescribe().getLabel() +
                            '. Use a different field.'
                    )
                );
            } else {
                matchField = mf.getDescribe().getName();
            }
            Map<String, Object> src = FinalMappingRules.asMap(
                match.get('source')
            );
            String key = src == null ? null : str(src.get('elementKey'));
            if (
                src == null ||
                str(src.get('kind')) != 'answer' ||
                key == null
            ) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fieldApi,
                        ctx,
                        ctx.search,
                        'A condition uses a question that isn’t on this form.'
                    )
                );
            } else {
                answerKeys.add(key);
                checkAnswer(
                    key,
                    mf == null ? null : mf.getDescribe(),
                    false,
                    fieldApi,
                    id,
                    ctx,
                    out
                );
            }
        }

        Boolean typed = str(match.get('filterMode')) == FILTER_MODE_SOQL;
        if (typed) {
            // Typed conditions replace the rows; leftover rows are ignored.
            Set<String> tokens = checkTypedConditions(match, d, id, ctx, out);
            if (tokens == null) {
                return matchField; // already refused, in its own words
            }
            answerKeys.addAll(tokens);
        } else {
            Map<String, Object> filter = FinalMappingRules.asMap(
                match.get('filter')
            );
            Boolean hasRows =
                filter != null &&
                !FinalMappingRules.asList(filter.get('rows')).isEmpty();
            if (hasRows && JSON.serialize(filter).contains('$User.')) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        null,
                        ctx,
                        ctx.search,
                        'A condition uses Current user. This step runs after the form is sent, when the current user is whoever sent it — often a site guest. Compare with an answer instead.'
                    )
                );
            } else if (hasRows) {
                answerKeys.addAll(checkRowAnswers(filter, d, id, ctx, out));
                FinalLookupService.Compiled c = FinalLookupService.compile(
                    new Map<String, Object>{ 'filter' => filter },
                    ctx.placeholders,
                    d.getName()
                );
                if (c.blocked) {
                    out.add(
                        at(BLOCKER, id, null, ctx, ctx.search, c.blockedReason)
                    );
                }
            }
        }

        // A search that compares with no answer finds the same records for
        // every submission — it isn't looking anyone up (round 1 #5).
        if (answerKeys.isEmpty()) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    typed ? CONDITIONS_FIELD : null,
                    ctx,
                    ctx.search,
                    'No condition compares with an answer, so every submission would find the same ' +
                        d.getLabel() +
                        '. Add one like Email equals the answer to “Your email”.'
                )
            );
        }
        return matchField;
    }

    private static final Set<String> LIST_OPERATORS = new Set<String>{
        'in',
        'nin',
        'includes',
        'excludes'
    };

    /**
     * D49: a filter row may compare with an answer. The answer must still be
     * on the form, hold one value (not a grid, an order, a file or several
     * choices — decision 9), fit the field the row filters on, and suit the
     * comparison: never a list operator, and "contains" only on text.
     */
    private static Set<String> checkRowAnswers(
        Map<String, Object> filter,
        Schema.DescribeSObjectResult d,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        Set<String> seen = new Set<String>();
        for (Object rowObj : FinalMappingRules.asList(filter.get('rows'))) {
            Map<String, Object> row = FinalMappingRules.asMap(rowObj);
            if (row == null) {
                continue;
            }
            String path = str(row.get('fieldPath'));
            String op = str(row.get('operator'));
            Schema.DescribeFieldResult rowField = path == null
                ? null
                : FinalMappingRules.fieldAt(d.getName(), path);
            List<String> keys = new List<String>();
            Boolean inList = false;
            if (isAnswerToken(row.get('value'))) {
                keys.add(((String) row.get('value')).substring(7));
            }
            for (Object entry : FinalMappingRules.asList(row.get('values'))) {
                if (isAnswerToken(entry)) {
                    keys.add(((String) entry).substring(7));
                    inList = true;
                }
            }
            Boolean badComparison =
                inList ||
                LIST_OPERATORS.contains(op) ||
                (op == 'like' &&
                rowField != null &&
                !FinalMappingRules.isTextLike(rowField.getType()));
            for (String key : keys) {
                seen.add(key);
                checkAnswer(key, rowField, badComparison, path, id, ctx, out);
            }
        }
        return seen;
    }

    /**
     * One answer a search compares with (D49, D51): still on the form, one
     * value (not a grid, an order, a file or several choices — decision 9),
     * fits the field, suits the comparison — and is always answered: a
     * question someone may skip can't be searched by (round 1 #5).
     */
    private static void checkAnswer(
        String key,
        Schema.DescribeFieldResult field,
        Boolean badComparison,
        String diagnosticField,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        Map<String, Object> q = ctx.questions.get(key);
        if (q == null) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    diagnosticField,
                    ctx,
                    ctx.search,
                    'A condition uses a question that’s no longer on the form.'
                )
            );
            return;
        }
        String answerType = FinalSubmitService.answerTypeOf(q);
        String qLabel = String.valueOf(q.get('label'));
        if (
            FinalMappingRules.UNMAPPABLE_ELEMENT_TYPES.contains(
                str(q.get('type'))
            ) || answerType == 'Options'
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    diagnosticField,
                    ctx,
                    ctx.search,
                    '“' +
                        qLabel +
                        '”' +
                        ' can hold more than one answer, so a condition can’t compare with it.'
                )
            );
            return;
        }
        if (
            field != null &&
            !FinalMappingRules.isCompatible(answerType, field.getType())
        ) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    diagnosticField,
                    ctx,
                    ctx.search,
                    'The answer to ' +
                        '“' +
                        qLabel +
                        '”' +
                        ' can’t be compared with ' +
                        field.getLabel() +
                        '.'
                )
            );
            return;
        }
        if (badComparison) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    diagnosticField,
                    ctx,
                    ctx.search,
                    'The answer to ' +
                        '“' +
                        qLabel +
                        '”' +
                        ' can’t be used with that operator.'
                )
            );
            return;
        }
        if (ctx.skippable.contains(key)) {
            out.add(
                at(
                        BLOCKER,
                        id,
                        diagnosticField,
                        ctx,
                        ctx.search,
                        '“' +
                            qLabel +
                            '”' +
                            ' can be skipped, but it’s used to find the ' +
                            d0(ctx) +
                            '.' +
                            ' Make it required (and not hidden by a rule).'
                    )
                    .about(key, qLabel, 'finds the ' + d0(ctx))
            );
        }
    }

    /** Diagnostics from typed conditions carry this, so checkConditions can pick them out. */
    public static final String CONDITIONS_FIELD = 'conditions';
    public static final String FILTER_MODE_SOQL = 'soql';

    /**
     * D50: conditions the author typed. Parsed (FinalMappingSoql), each
     * answer checked like a row's, then test-run as the author with
     * placeholder values — so a bad field, a field they can't read, or
     * anything else Salesforce refuses is caught now, in Salesforce's words.
     */
    private static Set<String> checkTypedConditions(
        Map<String, Object> match,
        Schema.DescribeSObjectResult d,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            str(match.get('soql'))
        );
        if (p.problem != null) {
            out.add(
                at(BLOCKER, id, CONDITIONS_FIELD, ctx, ctx.search, p.problem)
            );
            return null;
        }
        Set<String> seen = new Set<String>();
        Map<String, Object> binds = new Map<String, Object>();
        for (FinalMappingSoql.Token t : p.tokens) {
            seen.add(t.elementId);
            Schema.DescribeFieldResult f = FinalMappingRules.fieldAt(
                d.getName(),
                t.fieldPath
            );
            checkAnswer(
                t.elementId,
                f,
                t.operator == 'LIKE' &&
                    f != null &&
                    !FinalMappingRules.isTextLike(f.getType()),
                CONDITIONS_FIELD,
                id,
                ctx,
                out
            );
            binds.put(t.bindName, placeholderFor(f));
        }
        try {
            // The object name comes from describe; the conditions were
            // parsed above (no second statement, no binds of the author's
            // own, no sub-query) and run as the author, in USER_MODE.
            Database.queryWithBinds(
                'SELECT Id FROM ' + // NOPMD — see FinalMappingSoql (typed conditions, D50)
                    d.getName() +
                    ' WHERE (' +
                    p.whereClause +
                    ') LIMIT 0',
                binds,
                AccessLevel.USER_MODE
            );
        } catch (Exception e) {
            out.add(
                at(
                    BLOCKER,
                    id,
                    CONDITIONS_FIELD,
                    ctx,
                    ctx.search,
                    FinalMappingSoql.readableError(e.getMessage())
                )
            );
        }
        return seen;
    }

    /** A value of the field's type, so a test run can bind it. */
    private static Object placeholderFor(Schema.DescribeFieldResult f) {
        if (f == null) {
            return 'x'; // the query then names the field it can't find
        }
        switch on f.getType() {
            when DOUBLE, CURRENCY, PERCENT, INTEGER, LONG {
                return 0;
            }
            when DATE {
                return Date.today();
            }
            when DATETIME {
                return Datetime.now();
            }
            when TIME {
                return Time.newInstance(0, 0, 0, 0);
            }
            when BOOLEAN {
                return false;
            }
            when ID, REFERENCE {
                return '000000000000000AAA';
            }
            when else {
                return 'x';
            }
        }
    }

    private static Boolean isAnswerToken(Object raw) {
        return raw instanceof String && ((String) raw).startsWith('$field.');
    }

    private static void checkSource(
        Map<String, Object> src,
        Schema.DescribeFieldResult fd,
        String id,
        Context ctx,
        List<Diagnostic> out
    ) {
        String label = fd.getLabel();
        String kind = src == null ? null : str(src.get('kind'));
        if (kind == 'answer') {
            String key = str(src.get('elementKey'));
            Map<String, Object> q = key == null ? null : ctx.questions.get(key);
            if (q == null) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        label +
                        ' is filled from a question that’s no longer on the form.'
                    )
                );
                return;
            }
            if (
                FinalMappingRules.UNMAPPABLE_ELEMENT_TYPES.contains(
                    str(q.get('type'))
                )
            ) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        '“' +
                            q.get('label') +
                            '” gives more than one value, so it can’t fill ' +
                            label +
                            '.'
                    )
                );
                return;
            }
            String answerType = FinalSubmitService.answerTypeOf(q);
            if (!FinalMappingRules.isCompatible(answerType, fd.getType())) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        'A ' +
                            answerType.toLowerCase() +
                            ' answer can’t go into ' +
                            label +
                            '.'
                    )
                );
                return;
            }
            if (
                fd.getType() == Schema.DisplayType.PICKLIST ||
                fd.getType() == Schema.DisplayType.MULTIPICKLIST
            ) {
                Set<String> allowed = new Set<String>();
                for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
                    if (pe.isActive()) {
                        allowed.add(pe.getValue());
                    }
                }
                for (String v : FinalMappingRules.optionValues(q)) {
                    if (!allowed.contains(v)) {
                        out.add(
                            at(
                                BLOCKER,
                                id,
                                fd.getName(),
                                ctx,
                                ctx.create,
                                '“' +
                                    v +
                                    '” is an option on the form, but ' +
                                    label +
                                    ' doesn’t accept it.'
                            )
                        );
                        return;
                    }
                }
            }
            if (isRequired(fd) && ctx.skippable.contains(key)) {
                out.add(
                    at(
                            WARNING,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.create,
                            '“' +
                                q.get('label') +
                                '” can be skipped, but it fills ' +
                                label +
                                ', which Salesforce requires. When it’s skipped, this step fails.' +
                                ' Make it required (and not hidden by a rule).'
                        )
                        .about(
                            key,
                            String.valueOf(q.get('label')),
                            'fills ' + label + ', which Salesforce requires'
                        )
                );
            }
        } else if (kind == 'literal') {
            if (fd.getType() == Schema.DisplayType.REFERENCE) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        label +
                        ' can’t take a fixed value. Point it at another record.'
                    )
                );
                return;
            }
            try {
                FinalMappingRules.coerce(src.get('value'), fd);
            } catch (FinalMappingRules.MappingValueException e) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        e.getMessage()
                    )
                );
            }
        } else if (kind == 'recordRef') {
            if (fd.getType() != Schema.DisplayType.REFERENCE) {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        label +
                        ' isn’t a lookup, so it can’t point at another record.'
                    )
                );
                return;
            }
            String ref = str(src.get('ref'));
            if (ref != null && ref.startsWith('action:')) {
                String target = ctx.earlier.get(ref.substring(7));
                if (target == null) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.create,
                            label +
                            ' points at a step that comes later or no longer exists.'
                        )
                    );
                } else if (!refersTo(fd, target)) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.create,
                            label + ' can’t point at a ' + target + '.'
                        )
                    );
                }
            } else if (ref == 'link') {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        'Personalized-link records can’t be used in a mapping yet.'
                    )
                );
            } else if (ref != null && ref.startsWith('answer:')) {
                Map<String, Object> q = ctx.questions.get(ref.substring(7));
                Map<String, Object> config = q == null
                    ? null
                    : FinalMappingRules.asMap(q.get('config'));
                String refTo = config == null
                    ? null
                    : str(config.get('referenceTo'));
                if (q == null) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.create,
                            label +
                            ' points at a question that’s no longer on the form.'
                        )
                    );
                } else if (refTo == null || !refersTo(fd, refTo)) {
                    out.add(
                        at(
                            BLOCKER,
                            id,
                            fd.getName(),
                            ctx,
                            ctx.create,
                            label +
                                ' can’t point at the record picked in “' +
                                q.get('label') +
                                '”.'
                        )
                    );
                }
            } else {
                out.add(
                    at(
                        BLOCKER,
                        id,
                        fd.getName(),
                        ctx,
                        ctx.create,
                        label + ' points at a record the form can’t identify.'
                    )
                );
            }
        } else {
            out.add(
                at(
                    BLOCKER,
                    id,
                    fd.getName(),
                    ctx,
                    ctx.create,
                    'Choose what fills ' + label + '.'
                )
            );
        }
    }

    /** The same rule describeFields uses for "must be on the form". */
    private static Boolean isRequired(Schema.DescribeFieldResult fd) {
        return fd.isCreateable() &&
            !fd.isNillable() &&
            !fd.isDefaultedOnCreate() &&
            fd.getType() != Schema.DisplayType.BOOLEAN;
    }

    private static Boolean refersTo(
        Schema.DescribeFieldResult fd,
        String objectApi
    ) {
        for (Schema.SObjectType rt : fd.getReferenceTo()) {
            if (rt.getDescribe().getName().equalsIgnoreCase(objectApi)) {
                return true;
            }
        }
        return false;
    }

    private static Boolean isPublic(Id formId) {
        if (formId == null) {
            return false;
        }
        List<Form__c> forms = [
            SELECT Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            WITH USER_MODE
        ];
        return !forms.isEmpty() &&
            forms[0].Allowed_Adapters__c != null &&
            forms[0].Allowed_Adapters__c.contains('Public_Guest');
    }

    private static String str(Object o) {
        return o instanceof String && String.isNotBlank((String) o)
            ? (String) o
            : null;
    }
}
