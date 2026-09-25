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
        @AuraEnabled
        public String message;

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
        }
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
            String name = 'Step ' + index;
            if (action == null) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        null,
                        null,
                        name + ' is unreadable.'
                    )
                );
                continue;
            }
            String id = str(action.get('id'));
            if (id == null || !seenIds.add(id)) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        null,
                        name + ' has no id, or shares one with another step.'
                    )
                );
                continue;
            }
            checkAction(action, id, name, ctx, out);
        }
        return out;
    }

    private class Context {
        Map<String, Map<String, Object>> questions;
        Set<String> skippable;
        Boolean isPublic;
        Map<String, Object> placeholders;
        /** The object the step being checked searches, for its sentences. */
        String objectLabel;
        /** Steps seen so far, id → object API name: the only legal action refs. */
        Map<String, String> earlier = new Map<String, String>();
    }

    private static void checkAction(
        Map<String, Object> action,
        String id,
        String name,
        Context ctx,
        List<Diagnostic> out
    ) {
        String objectApi = str(action.get('object'));
        Schema.SObjectType t = objectApi == null
            ? null
            : Schema.getGlobalDescribe().get(objectApi);
        if (t == null) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    null,
                    name + ' names an object that doesn’t exist.'
                )
            );
            return;
        }
        Schema.DescribeSObjectResult d = t.getDescribe();
        name += ' (' + d.getLabel() + ')';
        if (
            FinalMappingRules.SETUP_OBJECTS.contains(d.getName().toLowerCase())
        ) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    null,
                    name +
                        ': Salesforce can’t write ' +
                        d.getLabelPlural() +
                        ' together with ordinary records.'
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
                new Diagnostic(BLOCKER, id, null, name + ' has no operation.')
            );
            return;
        }
        if (!d.isCreateable()) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        null,
                        name + ' says find or create but has no search set up.'
                    )
                );
            } else {
                onMatch = str(match.get('onMatch'));
                matchField = checkMatch(match, d, fieldMap, id, name, ctx, out);
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fieldApi,
                        name +
                            ' writes to a field that doesn’t exist' +
                            (fieldApi == null ? '.' : ': ' + fieldApi + '.')
                    )
                );
                continue;
            }
            Schema.DescribeFieldResult fd = sf.getDescribe();
            if (FinalMappingRules.isMultiTarget(fd)) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ': ' +
                            fd.getLabel() +
                            ' can point at more than one kind of record, and mappings don’t support that.'
                    )
                );
                continue;
            }
            if (!assigned.add(fd.getName().toLowerCase())) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name + ' writes to ' + fd.getLabel() + ' twice.'
                    )
                );
                continue;
            }
            if (!fd.isCreateable()) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
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
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            name +
                                ' marks ' +
                                fd.getLabel() +
                                ' to overwrite a found record, but this step doesn’t update found records.'
                        )
                    );
                } else if (!fd.isUpdateable()) {
                    out.add(
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            'You can’t edit ' +
                                fd.getLabel() +
                                ' on ' +
                                d.getLabelPlural() +
                                ', so this form can’t overwrite it.'
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
                name,
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ' leaves ' +
                            fd.getLabel() +
                            ' empty, and Salesforce requires it.'
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
                new Diagnostic(
                    WARNING,
                    id,
                    null,
                    'This form is public. ' +
                        name +
                        ' overwrites ' +
                        String.join(overwritable, ', ') +
                        ' on any ' +
                        d.getLabel() +
                        ' someone matches — without signing in.'
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
        String name,
        Context ctx,
        List<Diagnostic> out
    ) {
        String onMatch = str(match.get('onMatch'));
        if (
            onMatch != FinalMappingRules.ON_MATCH_REUSE &&
            onMatch != FinalMappingRules.ON_MATCH_UPDATE
        ) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    null,
                    name +
                    ': choose what happens when a matching record is found.'
                )
            );
        } else if (
            onMatch == FinalMappingRules.ON_MATCH_UPDATE && !d.isUpdateable()
        ) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    null,
                    'You can’t edit ' +
                        d.getLabelPlural() +
                        ', so this step can’t update the record it finds.'
                )
            );
        }

        ctx.objectLabel = d.getLabel();
        Set<String> answerKeys = new Set<String>();
        String matchField = null;

        // Steps saved before round 1 had a separate "Where [field] matches the
        // answer to [question]". It still runs, as a condition like any other.
        String fieldApi = str(match.get('field'));
        if (fieldApi != null) {
            Schema.SObjectField mf = fieldMap.get(fieldApi);
            if (mf == null) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fieldApi,
                        name + ' searches on a field that doesn’t exist.'
                    )
                );
            } else if (!mf.getDescribe().isFilterable()) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fieldApi,
                        name +
                            ' searches on ' +
                            mf.getDescribe().getLabel() +
                            ', which Salesforce can’t search by.'
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fieldApi,
                        name +
                        ' searches using a question that isn’t on this form.'
                    )
                );
            } else {
                answerKeys.add(key);
                checkAnswer(
                    key,
                    mf == null ? null : mf.getDescribe(),
                    false,
                    fieldApi,
                    '',
                    id,
                    name,
                    ctx,
                    out
                );
            }
        }

        Boolean typed = str(match.get('filterMode')) == FILTER_MODE_SOQL;
        if (typed) {
            // Typed conditions replace the rows; leftover rows are ignored.
            Set<String> tokens = checkTypedConditions(
                match,
                d,
                id,
                name,
                ctx,
                out
            );
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        null,
                        name +
                            ' uses the current user in its search. This step runs in the ' +
                            'background, where the current user is whoever submitted — often a site guest.'
                    )
                );
            } else if (hasRows) {
                answerKeys.addAll(
                    checkRowAnswers(filter, d, name, id, ctx, out)
                );
                FinalLookupService.Compiled c = FinalLookupService.compile(
                    new Map<String, Object>{ 'filter' => filter },
                    ctx.placeholders,
                    d.getName()
                );
                if (c.blocked) {
                    out.add(
                        new Diagnostic(
                            BLOCKER,
                            id,
                            null,
                            name + '’s search: ' + c.blockedReason
                        )
                    );
                }
            }
        }

        // A search that compares with no answer finds the same records for
        // every submission — it isn't looking anyone up (round 1 #5).
        if (answerKeys.isEmpty()) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    typed ? CONDITIONS_FIELD : null,
                    name +
                    ' must search by at least one answer. Add a condition that compares with a question, like “Email equals the answer to Your email”.'
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
        String name,
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
                checkAnswer(
                    key,
                    rowField,
                    badComparison,
                    path,
                    '’s search',
                    id,
                    name,
                    ctx,
                    out
                );
            }
        }
        return seen;
    }

    /**
     * One answer a search compares with (D49, D51): still on the form, one
     * value (not a grid, an order, a file or several choices — decision 9),
     * fits the field, suits the comparison — and is always answered: a
     * question someone may skip can't be searched by (round 1 #5).
     * `part` names the part of the step, for the missing-question message.
     */
    private static void checkAnswer(
        String key,
        Schema.DescribeFieldResult field,
        Boolean badComparison,
        String diagnosticField,
        String part,
        String id,
        String name,
        Context ctx,
        List<Diagnostic> out
    ) {
        Map<String, Object> q = ctx.questions.get(key);
        if (q == null) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    diagnosticField,
                    name +
                        part +
                        ' uses a question that’s no longer on the form.'
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
                new Diagnostic(
                    BLOCKER,
                    id,
                    diagnosticField,
                    name +
                        ': "' +
                        qLabel +
                        '" can hold more than one value, so a filter can’t compare with it.'
                )
            );
            return;
        }
        if (
            field != null &&
            !FinalMappingRules.isCompatible(answerType, field.getType())
        ) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    diagnosticField,
                    name +
                        ': the answer to "' +
                        qLabel +
                        '" can’t be compared with ' +
                        field.getLabel() +
                        '.'
                )
            );
            return;
        }
        if (badComparison) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    diagnosticField,
                    name +
                        ': "' +
                        qLabel +
                        '" can’t be used with that comparison.'
                )
            );
            return;
        }
        if (ctx.skippable.contains(key)) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    diagnosticField,
                    name +
                        ': “' +
                        qLabel +
                        '” is used to find the ' +
                        (ctx.objectLabel == null ? 'record' : ctx.objectLabel) +
                        ', so it must always be answered. Make it required (and not hidden by a rule), or take it out of the search.'
                )
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
        String name,
        Context ctx,
        List<Diagnostic> out
    ) {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            str(match.get('soql'))
        );
        if (p.problem != null) {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    CONDITIONS_FIELD,
                    name + '’s conditions: ' + p.problem
                )
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
                '’s conditions',
                id,
                name,
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
                new Diagnostic(
                    BLOCKER,
                    id,
                    CONDITIONS_FIELD,
                    name + ': ' + FinalMappingSoql.readableError(e.getMessage())
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
        String name,
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ' fills ' +
                            label +
                            ' from a question that’s no longer on the form.'
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
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ': "' +
                            q.get('label') +
                            '" gives more than one value, so it can’t fill ' +
                            label +
                            '.'
                    )
                );
                return;
            }
            String answerType = FinalSubmitService.answerTypeOf(q);
            if (!FinalMappingRules.isCompatible(answerType, fd.getType())) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ': a ' +
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
                            new Diagnostic(
                                BLOCKER,
                                id,
                                fd.getName(),
                                name +
                                    ': "' +
                                    v +
                                    '" is an option on the form but not a value ' +
                                    label +
                                    ' accepts.'
                            )
                        );
                        return;
                    }
                }
            }
            if (isRequired(fd) && ctx.skippable.contains(key)) {
                out.add(
                    new Diagnostic(
                        WARNING,
                        id,
                        fd.getName(),
                        name +
                            ' fills ' +
                            label +
                            ', which Salesforce requires, from "' +
                            q.get('label') +
                            '" — and that question can be skipped. When it is, this step fails.'
                    )
                );
            }
        } else if (kind == 'literal') {
            if (fd.getType() == Schema.DisplayType.REFERENCE) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ' fills ' +
                            label +
                            ' with a fixed value. Point it at another record instead.'
                    )
                );
                return;
            }
            try {
                FinalMappingRules.coerce(src.get('value'), fd);
            } catch (FinalMappingRules.MappingValueException e) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name + ': ' + e.getMessage()
                    )
                );
            }
        } else if (kind == 'recordRef') {
            if (fd.getType() != Schema.DisplayType.REFERENCE) {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ': ' +
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
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            name +
                                ' points ' +
                                label +
                                ' at a step that comes later or no longer exists.'
                        )
                    );
                } else if (!refersTo(fd, target)) {
                    out.add(
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            name +
                                ': ' +
                                label +
                                ' can’t point at a ' +
                                target +
                                '.'
                        )
                    );
                }
            } else if (ref == 'link') {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                        ': personalized-link records can’t be used in a Freeform mapping yet.'
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
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            name +
                                ' points ' +
                                label +
                                ' at a question that’s no longer on the form.'
                        )
                    );
                } else if (refTo == null || !refersTo(fd, refTo)) {
                    out.add(
                        new Diagnostic(
                            BLOCKER,
                            id,
                            fd.getName(),
                            name +
                                ': ' +
                                label +
                                ' can’t point at the record picked in "' +
                                q.get('label') +
                                '".'
                        )
                    );
                }
            } else {
                out.add(
                    new Diagnostic(
                        BLOCKER,
                        id,
                        fd.getName(),
                        name +
                            ' points ' +
                            label +
                            ' at a record the form can’t identify.'
                    )
                );
            }
        } else {
            out.add(
                new Diagnostic(
                    BLOCKER,
                    id,
                    fd.getName(),
                    name + ' has no source for ' + label + '.'
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
