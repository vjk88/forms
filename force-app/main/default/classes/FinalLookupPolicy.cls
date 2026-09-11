/**
 * FinalLookupPolicy — the server's opinion about lookup filters
 * (IMPL_PLAN_DEPENDENT_LOOKUP §8, schema FORM_SPEC_SCHEMA §4.2).
 *
 * Two jobs, one rulebook:
 *
 *  1. AUTHORING. Validate `element.lookupConfig` against real Describe
 *     information at publish, so an unpublishable filter never reaches a
 *     respondent.
 *  2. SUBMISSION. Recompile that filter from the authoritative published spec
 *     and re-check every selected Id — object, readability, and membership —
 *     under the respondent's OWN permissions.
 *
 * Three rules this class exists to enforce, none of which the client can be
 * trusted with:
 *
 *  - The reference target is derived from Describe, never read from
 *    `config.referenceTo`. A client that rewrites that string must not be able
 *    to redirect a query at another object.
 *  - Every identifier in a query comes from Describe's own canonical name and
 *    every value is bound. Nothing client-supplied is ever concatenated.
 *  - A missing controlling answer DISABLES a lookup. It never silently drops
 *    the criterion, which would turn a narrow filter into "every record on the
 *    object" — the exact opposite of what the author asked for.
 *
 * And the rule that is easiest to get wrong: an answer is not authorization.
 * A respondent submitting an AccountId does not thereby earn the right to read
 * that Account's Contacts. Membership in the filter and READ access are checked
 * separately, and both must hold.
 */
public with sharing class FinalLookupPolicy {
    public static final Integer CONFIG_VERSION = 1;
    public static final Integer MAX_CRITERIA = 10;
    public static final Integer MAX_FILTERED_LOOKUPS = 20;

    /** Verdict codes. Deliberately incurious: none of them reveals whether an
     *  inaccessible record exists, only that this selection cannot stand. */
    public static final String CODE_OK = 'OK';
    public static final String CODE_SOURCE_REQUIRED = 'SOURCE_REQUIRED';
    public static final String CODE_SELECTION_UNAVAILABLE = 'SELECTION_UNAVAILABLE';
    public static final String CODE_CONFIG_UNAVAILABLE = 'CONFIG_UNAVAILABLE';

    private static Map<String, Schema.SObjectType> globalDescribeCache;

    public class Diagnostic {
        @AuraEnabled
        public String code;
        @AuraEnabled
        public String elementId;
        @AuraEnabled
        public String criterionId;
        @AuraEnabled
        public String message;

        public Diagnostic(
            String code,
            String elementId,
            String criterionId,
            String message
        ) {
            this.code = code;
            this.elementId = elementId;
            this.criterionId = criterionId;
            this.message = message;
        }
    }

    /** One reference element's compiled, describe-backed lookup policy. */
    public class CompiledLookup {
        public String elementId;
        public String targetObject;
        public String mode;
        public List<CompiledCriterion> criteria = new List<CompiledCriterion>();
        /** Element ids whose answers this lookup depends on. */
        public Set<String> sourceElementIds = new Set<String>();
    }

    public class CompiledCriterion {
        public String criterionId;
        public String fieldName; // canonical, from Describe
        public String operator; // canonical SOQL operator
        public Schema.DisplayType fieldType;
        public Boolean isAnswerSourced;
        public String sourceElementId;
        public Object constantValue;
    }

    // =====================================================================
    // Authoring validation
    // =====================================================================

    /** Publication gate. Throws on the first problem, the way Autofill does. */
    public static void validateForPublish(Id formId, Map<String, Object> spec) {
        List<Diagnostic> diagnostics = validate(spec);
        if (!diagnostics.isEmpty()) {
            throw new AuraHandledException(
                'Lookup filter validation failed: ' + diagnostics[0].message
            );
        }
    }

    /**
     * Full authoring inspection. Returns every problem rather than the first,
     * so the Studio can mark each offending row.
     */
    public static List<Diagnostic> validate(Map<String, Object> spec) {
        List<Diagnostic> diagnostics = new List<Diagnostic>();
        if (spec == null) {
            return diagnostics;
        }

        Map<String, Map<String, Object>> elementById = new Map<String, Map<String, Object>>();
        Set<String> insideRepeater = new Set<String>();
        indexElements(spec, elementById, insideRepeater);

        Map<String, Map<String, Object>> configured = new Map<String, Map<String, Object>>();
        for (String elId : elementById.keySet()) {
            Map<String, Object> cfg = asMap(
                elementById.get(elId).get('lookupConfig')
            );
            if (cfg != null) {
                configured.put(elId, cfg);
            }
        }
        if (configured.isEmpty()) {
            return diagnostics;
        }
        if (configured.size() > MAX_FILTERED_LOOKUPS) {
            diagnostics.add(
                new Diagnostic(
                    'TOO_MANY_LOOKUPS',
                    null,
                    null,
                    'A form can carry at most ' +
                        MAX_FILTERED_LOOKUPS +
                        ' filtered lookups.'
                )
            );
            return diagnostics;
        }

        // elementId -> the lookup elements that depend on its answer
        Map<String, Set<String>> dependents = new Map<String, Set<String>>();

        for (String elId : configured.keySet()) {
            Map<String, Object> el = elementById.get(elId);
            Map<String, Object> cfg = configured.get(elId);

            Integer version = asInteger(cfg.get('version'));
            if (version == null || version != CONFIG_VERSION) {
                diagnostics.add(
                    new Diagnostic(
                        'UNSUPPORTED_VERSION',
                        elId,
                        null,
                        'This lookup filter was written by a different version of the app and cannot be published here.'
                    )
                );
                continue;
            }

            Schema.DescribeFieldResult bindingField = describeBinding(el);
            if (bindingField == null) {
                diagnostics.add(
                    new Diagnostic(
                        'UNRESOLVED_BINDING',
                        elId,
                        null,
                        'This lookup is not bound to a field that exists.'
                    )
                );
                continue;
            }
            // The target comes from the schema, never from config.referenceTo.
            List<Schema.SObjectType> refs = bindingField.getReferenceTo();
            if (refs == null || refs.size() != 1) {
                diagnostics.add(
                    new Diagnostic(
                        'UNSUPPORTED_REFERENCE',
                        elId,
                        null,
                        'Only lookups that point at exactly one object can be filtered.'
                    )
                );
                continue;
            }
            Schema.DescribeSObjectResult target = refs[0].getDescribe();

            validateFilter(
                elId,
                cfg,
                target,
                elementById,
                insideRepeater,
                dependents,
                diagnostics
            );
            validateDisplayAndMatching(elId, cfg, target, diagnostics);
        }

        detectCycles(configured.keySet(), dependents, diagnostics);
        return diagnostics;
    }

    private static void validateFilter(
        String elId,
        Map<String, Object> cfg,
        Schema.DescribeSObjectResult target,
        Map<String, Map<String, Object>> elementById,
        Set<String> insideRepeater,
        Map<String, Set<String>> dependents,
        List<Diagnostic> diagnostics
    ) {
        Map<String, Object> filter = asMap(cfg.get('filter'));
        if (filter == null) {
            return;
        }
        String mode = asString(filter.get('mode'));
        if (mode != null && mode != 'all' && mode != 'any') {
            diagnostics.add(
                new Diagnostic(
                    'UNSUPPORTED_MODE',
                    elId,
                    null,
                    'Conditions must be combined with either all or any.'
                )
            );
        }
        List<Object> criteria = asList(filter.get('criteria'));
        if (criteria == null || criteria.isEmpty()) {
            return;
        }
        if (criteria.size() > MAX_CRITERIA) {
            diagnostics.add(
                new Diagnostic(
                    'TOO_MANY_CRITERIA',
                    elId,
                    null,
                    'A lookup can carry at most ' +
                        MAX_CRITERIA +
                        ' conditions.'
                )
            );
            return;
        }

        Map<String, Schema.SObjectField> targetFields = target.fields.getMap();

        for (Object cObj : criteria) {
            Map<String, Object> crit = asMap(cObj);
            if (crit == null) {
                continue;
            }
            String critId = asString(crit.get('id'));
            String fieldPath = asString(crit.get('fieldPath'));
            String operator = asString(crit.get('operator'));

            if (String.isBlank(fieldPath)) {
                diagnostics.add(
                    new Diagnostic(
                        'MISSING_FIELD',
                        elId,
                        critId,
                        'A condition needs a field to filter on.'
                    )
                );
                continue;
            }
            if (fieldPath.contains('.')) {
                diagnostics.add(
                    new Diagnostic(
                        'RELATIONSHIP_NOT_SUPPORTED',
                        elId,
                        critId,
                        'Conditions can only use fields directly on ' +
                            target.getLabel() +
                            '.'
                    )
                );
                continue;
            }
            Schema.SObjectField f = targetFields.get(fieldPath.toLowerCase());
            if (f == null) {
                diagnostics.add(
                    new Diagnostic(
                        'UNKNOWN_FIELD',
                        elId,
                        critId,
                        'There is no field called ' +
                            fieldPath +
                            ' on ' +
                            target.getLabel() +
                            '.'
                    )
                );
                continue;
            }
            Schema.DescribeFieldResult fd = f.getDescribe();
            if (!fd.isFilterable()) {
                diagnostics.add(
                    new Diagnostic(
                        'FIELD_NOT_FILTERABLE',
                        elId,
                        critId,
                        fd.getLabel() + ' cannot be used to filter records.'
                    )
                );
                continue;
            }
            if (!isSupportedType(fd.getType())) {
                diagnostics.add(
                    new Diagnostic(
                        'UNSUPPORTED_FIELD_TYPE',
                        elId,
                        critId,
                        fd.getLabel() +
                        ' is a field type this version cannot filter on yet.'
                    )
                );
                continue;
            }
            if (!allowedOperators(fd.getType()).contains(operator)) {
                diagnostics.add(
                    new Diagnostic(
                        'UNSUPPORTED_OPERATOR',
                        elId,
                        critId,
                        'That comparison cannot be used with ' +
                            fd.getLabel() +
                            '.'
                    )
                );
                continue;
            }

            validateCriterionValue(
                elId,
                critId,
                crit,
                fd,
                elementById,
                insideRepeater,
                dependents,
                diagnostics
            );
        }
    }

    private static void validateCriterionValue(
        String elId,
        String critId,
        Map<String, Object> crit,
        Schema.DescribeFieldResult fd,
        Map<String, Map<String, Object>> elementById,
        Set<String> insideRepeater,
        Map<String, Set<String>> dependents,
        List<Diagnostic> diagnostics
    ) {
        Map<String, Object> value = asMap(crit.get('value'));
        if (value == null) {
            diagnostics.add(
                new Diagnostic(
                    'MISSING_VALUE',
                    elId,
                    critId,
                    'A condition needs something to compare against.'
                )
            );
            return;
        }
        String kind = asString(value.get('kind'));

        if (kind == 'constant') {
            // An explicit null IS a value. `containsKey` is the only honest
            // test — a truthiness check would reject false and 0 as well.
            if (!value.containsKey('value')) {
                diagnostics.add(
                    new Diagnostic(
                        'MISSING_VALUE',
                        elId,
                        critId,
                        'A fixed value is missing.'
                    )
                );
                return;
            }
            if (
                value.get('value') != null &&
                !constantFits(fd, value.get('value'))
            ) {
                diagnostics.add(
                    new Diagnostic(
                        'VALUE_TYPE_MISMATCH',
                        elId,
                        critId,
                        'That fixed value does not suit ' + fd.getLabel() + '.'
                    )
                );
            }
            return;
        }

        if (kind != 'answer') {
            diagnostics.add(
                new Diagnostic(
                    'UNSUPPORTED_VALUE_KIND',
                    elId,
                    critId,
                    'A condition compares against either a fixed value or an answer.'
                )
            );
            return;
        }

        String sourceId = asString(value.get('elementId'));
        if (String.isBlank(sourceId)) {
            diagnostics.add(
                new Diagnostic(
                    'MISSING_SOURCE',
                    elId,
                    critId,
                    'Choose which question this condition reads.'
                )
            );
            return;
        }
        if (sourceId == elId) {
            diagnostics.add(
                new Diagnostic(
                    'SELF_REFERENCE',
                    elId,
                    critId,
                    'A lookup cannot filter itself by its own answer.'
                )
            );
            return;
        }
        Map<String, Object> source = elementById.get(sourceId);
        if (source == null) {
            diagnostics.add(
                new Diagnostic(
                    'MISSING_SOURCE_ELEMENT',
                    elId,
                    critId,
                    'The question this condition reads is no longer on the form.'
                )
            );
            return;
        }
        if (insideRepeater.contains(sourceId)) {
            diagnostics.add(
                new Diagnostic(
                    'SOURCE_IN_REPEATER',
                    elId,
                    critId,
                    'A condition cannot read an answer from inside a repeating group.'
                )
            );
            return;
        }
        if (!sourceFits(fd, source)) {
            diagnostics.add(
                new Diagnostic(
                    'SOURCE_TYPE_MISMATCH',
                    elId,
                    critId,
                    'That answer cannot be compared against ' +
                        fd.getLabel() +
                        '.'
                )
            );
            return;
        }

        if (!dependents.containsKey(sourceId)) {
            dependents.put(sourceId, new Set<String>());
        }
        dependents.get(sourceId).add(elId);
    }

    private static void validateDisplayAndMatching(
        String elId,
        Map<String, Object> cfg,
        Schema.DescribeSObjectResult target,
        List<Diagnostic> diagnostics
    ) {
        Map<String, Schema.SObjectField> fields = target.fields.getMap();

        Map<String, Object> display = asMap(cfg.get('displayInfo'));
        if (display != null) {
            List<String> names = new List<String>();
            if (asString(display.get('primaryField')) != null) {
                names.add(asString(display.get('primaryField')));
            }
            List<Object> extra = asList(display.get('additionalFields'));
            for (Object o : (extra == null ? new List<Object>() : extra)) {
                if (o instanceof String) {
                    names.add((String) o);
                }
            }
            for (String n : names) {
                Schema.SObjectField f = fields.get(n.toLowerCase());
                if (f == null) {
                    diagnostics.add(
                        new Diagnostic(
                            'UNKNOWN_DISPLAY_FIELD',
                            elId,
                            null,
                            'There is no field called ' +
                                n +
                                ' to show on ' +
                                target.getLabel() +
                                '.'
                        )
                    );
                } else if (!f.getDescribe().isAccessible()) {
                    diagnostics.add(
                        new Diagnostic(
                            'DISPLAY_FIELD_UNREADABLE',
                            elId,
                            null,
                            'You cannot read ' +
                                n +
                                ', so it cannot be shown in results.'
                        )
                    );
                }
            }
        }

        Map<String, Object> matching = asMap(cfg.get('matchingInfo'));
        if (matching == null) {
            return;
        }
        Map<String, Object> primary = asMap(matching.get('primaryField'));
        String path = primary == null
            ? null
            : asString(primary.get('fieldPath'));
        if (String.isBlank(path)) {
            return;
        }
        Schema.SObjectField f = fields.get(path.toLowerCase());
        if (f == null) {
            diagnostics.add(
                new Diagnostic(
                    'UNKNOWN_SEARCH_FIELD',
                    elId,
                    null,
                    'There is no field called ' +
                        path +
                        ' to search on ' +
                        target.getLabel() +
                        '.'
                )
            );
            return;
        }
        // Search eligibility is narrower than filter eligibility — the native
        // control only matches on text, so a filterable number field is not a
        // legal search field even though it is a legal condition field.
        Schema.DisplayType t = f.getDescribe().getType();
        if (
            t != Schema.DisplayType.STRING &&
            t != Schema.DisplayType.EMAIL &&
            t != Schema.DisplayType.PHONE &&
            t != Schema.DisplayType.URL
        ) {
            diagnostics.add(
                new Diagnostic(
                    'UNSUPPORTED_SEARCH_FIELD',
                    elId,
                    null,
                    f.getDescribe().getLabel() +
                    ' cannot be used to search — pick a text field.'
                )
            );
        }
    }

    private static void detectCycles(
        Set<String> lookupIds,
        Map<String, Set<String>> dependents,
        List<Diagnostic> diagnostics
    ) {
        // Depth-first, colouring nodes: absent = unvisited, false = on the
        // current path, true = finished. A node met while still on the path is
        // a cycle.
        Map<String, Boolean> state = new Map<String, Boolean>();
        for (String start : lookupIds) {
            if (state.containsKey(start)) {
                continue;
            }
            List<String> stack = new List<String>{ start };
            while (!stack.isEmpty()) {
                String node = stack.remove(stack.size() - 1);
                if (state.containsKey(node)) {
                    if (state.get(node) == false) {
                        state.put(node, true);
                    }
                    continue;
                }
                state.put(node, false);
                stack.add(node);
                for (
                    String next : (dependents.containsKey(node)
                        ? dependents.get(node)
                        : new Set<String>())
                ) {
                    if (state.containsKey(next) && state.get(next) == false) {
                        diagnostics.add(
                            new Diagnostic(
                                'DEPENDENCY_CYCLE',
                                next,
                                null,
                                'These lookups depend on each other in a loop, so none of them can ever be filled in.'
                            )
                        );
                        return;
                    }
                    if (!state.containsKey(next)) {
                        stack.add(next);
                    }
                }
            }
        }
    }

    // =====================================================================
    // Compilation + selection verification
    // =====================================================================

    /**
     * Compile every filtered lookup in a published spec. Describe is the only
     * source of object and field identifiers; the spec supplies intent, never
     * SOQL text.
     */
    public static Map<String, CompiledLookup> compile(
        Map<String, Object> spec
    ) {
        Map<String, CompiledLookup> compiled = new Map<String, CompiledLookup>();
        if (spec == null) {
            return compiled;
        }
        Map<String, Map<String, Object>> elementById = new Map<String, Map<String, Object>>();
        Set<String> insideRepeater = new Set<String>();
        indexElements(spec, elementById, insideRepeater);

        for (String elId : elementById.keySet()) {
            Map<String, Object> el = elementById.get(elId);
            Map<String, Object> cfg = asMap(el.get('lookupConfig'));
            if (
                cfg == null ||
                asInteger(cfg.get('version')) != CONFIG_VERSION
            ) {
                continue;
            }
            Schema.DescribeFieldResult bindingField = describeBinding(el);
            if (bindingField == null) {
                continue;
            }
            List<Schema.SObjectType> refs = bindingField.getReferenceTo();
            if (refs == null || refs.size() != 1) {
                continue;
            }
            Schema.DescribeSObjectResult target = refs[0].getDescribe();

            CompiledLookup out = new CompiledLookup();
            out.elementId = elId;
            out.targetObject = target.getName();
            Map<String, Object> filter = asMap(cfg.get('filter'));
            out.mode = filter == null ? 'all' : asString(filter.get('mode'));
            if (out.mode != 'any') {
                out.mode = 'all';
            }

            Map<String, Schema.SObjectField> fields = target.fields.getMap();
            List<Object> criteria = filter == null
                ? null
                : asList(filter.get('criteria'));
            Boolean usable = true;
            for (
                Object cObj : (criteria == null ? new List<Object>() : criteria)
            ) {
                Map<String, Object> crit = asMap(cObj);
                if (crit == null) {
                    continue;
                }
                String path = asString(crit.get('fieldPath'));
                Schema.SObjectField f = path == null
                    ? null
                    : fields.get(path.toLowerCase());
                if (f == null) {
                    usable = false;
                    break;
                }
                Schema.DescribeFieldResult fd = f.getDescribe();
                String op = soqlOperator(asString(crit.get('operator')));
                if (
                    op == null ||
                    !isSupportedType(fd.getType()) ||
                    !fd.isFilterable()
                ) {
                    usable = false;
                    break;
                }
                Map<String, Object> value = asMap(crit.get('value'));
                if (value == null) {
                    usable = false;
                    break;
                }

                CompiledCriterion cc = new CompiledCriterion();
                cc.criterionId = asString(crit.get('id'));
                cc.fieldName = fd.getName(); // canonical — never the client's spelling
                cc.operator = op;
                cc.fieldType = fd.getType();
                if (asString(value.get('kind')) == 'answer') {
                    cc.isAnswerSourced = true;
                    cc.sourceElementId = asString(value.get('elementId'));
                    if (String.isBlank(cc.sourceElementId)) {
                        usable = false;
                        break;
                    }
                    out.sourceElementIds.add(cc.sourceElementId);
                } else {
                    cc.isAnswerSourced = false;
                    cc.constantValue = value.get('value');
                }
                out.criteria.add(cc);
            }
            if (usable) {
                compiled.put(elId, out);
            } else {
                // A configuration that cannot be compiled must block its
                // lookup, never degrade into an unfiltered one.
                CompiledLookup broken = new CompiledLookup();
                broken.elementId = elId;
                broken.targetObject = null;
                compiled.put(elId, broken);
            }
        }
        return compiled;
    }

    /**
     * Re-check each submitted lookup selection against the published policy.
     *
     * `answers` is the COMPLETE normalized submission state, including values
     * carried over from an existing record — resolving a controlling answer
     * from a partial payload would let an omitted parent widen the filter.
     *
     * Returns elementId -> verdict code. Elements with no configured filter do
     * not appear: this method is about filtered lookups, not about whether a
     * field was filled in.
     */
    public static Map<String, String> verifySelections(
        Map<String, Object> spec,
        Map<String, Object> answers
    ) {
        Map<String, String> verdicts = new Map<String, String>();
        Map<String, CompiledLookup> compiled = compile(spec);
        if (compiled.isEmpty()) {
            return verdicts;
        }
        Map<String, Object> state = answers == null
            ? new Map<String, Object>()
            : answers;

        // objectName -> elementIds sharing that target, so one query can serve
        // several lookups instead of one query per element.
        Map<String, List<CompiledLookup>> pending = new Map<String, List<CompiledLookup>>();

        for (String elId : compiled.keySet()) {
            CompiledLookup lk = compiled.get(elId);
            String selected = asString(state.get(elId));

            if (lk.targetObject == null) {
                // Broken configuration. An empty answer is simply unfiltered
                // nothing; a populated one cannot be justified.
                verdicts.put(
                    elId,
                    String.isBlank(selected) ? CODE_OK : CODE_CONFIG_UNAVAILABLE
                );
                continue;
            }
            if (String.isBlank(selected)) {
                verdicts.put(elId, CODE_OK);
                continue;
            }
            if (!isIdOfObject(selected, lk.targetObject)) {
                verdicts.put(elId, CODE_SELECTION_UNAVAILABLE);
                continue;
            }
            if (missingSource(lk, state)) {
                // The control should have been disabled. A value arriving
                // anyway is not something we can validate, so it cannot stand.
                verdicts.put(elId, CODE_SOURCE_REQUIRED);
                continue;
            }
            if (!pending.containsKey(lk.targetObject)) {
                pending.put(lk.targetObject, new List<CompiledLookup>());
            }
            pending.get(lk.targetObject).add(lk);
        }

        for (String objectName : pending.keySet()) {
            for (CompiledLookup lk : pending.get(objectName)) {
                verdicts.put(lk.elementId, verifyOne(lk, state));
            }
        }
        return verdicts;
    }

    /** True when any answer-sourced criterion has no answer behind it. */
    private static Boolean missingSource(
        CompiledLookup lk,
        Map<String, Object> state
    ) {
        for (CompiledCriterion cc : lk.criteria) {
            if (!cc.isAnswerSourced) {
                continue;
            }
            Object v = state.get(cc.sourceElementId);
            // `false` and `0` are answers. Only null and the empty string are
            // absences, and a truthiness test would get both wrong.
            if (v == null || (v instanceof String && ((String) v) == '')) {
                return true;
            }
        }
        return false;
    }

    private static String verifyOne(
        CompiledLookup lk,
        Map<String, Object> state
    ) {
        String selected = asString(state.get(lk.elementId));
        List<String> clauses = new List<String>();
        Map<String, Object> binds = new Map<String, Object>();
        Integer i = 0;

        for (CompiledCriterion cc : lk.criteria) {
            Object raw = cc.isAnswerSourced
                ? state.get(cc.sourceElementId)
                : cc.constantValue;
            Object coerced;
            try {
                coerced = coerce(raw, cc.fieldType);
            } catch (Exception e) {
                return CODE_SELECTION_UNAVAILABLE;
            }
            String bindName = 'b' + i;
            i++;
            if (coerced == null) {
                // SOQL has no `= null`; the null comparison operators are the
                // only correct spelling, and they take no bind.
                clauses.add(
                    cc.fieldName + (cc.operator == '=' ? ' = NULL' : ' != NULL')
                );
            } else {
                binds.put(bindName, coerced);
                clauses.add(cc.fieldName + ' ' + cc.operator + ' :' + bindName);
            }
        }

        String predicate = clauses.isEmpty()
            ? null
            : '(' +
              String.join(clauses, lk.mode == 'any' ? ' OR ' : ' AND ') +
              ')';

        binds.put('selectedId', (Id) selected);
        String soql =
            'SELECT Id FROM ' +
            lk.targetObject +
            ' WHERE Id = :selectedId' +
            (predicate == null ? '' : ' AND ' + predicate) +
            ' LIMIT 1';

        try {
            // USER_MODE, always. The submitting identity's own sharing and FLS
            // decide readability — a delegated or system-mode submission path
            // must not be able to launder a read the respondent cannot make.
            List<SObject> rows = Database.queryWithBinds(
                soql,
                binds,
                AccessLevel.USER_MODE
            );
            return rows.isEmpty() ? CODE_SELECTION_UNAVAILABLE : CODE_OK;
        } catch (Exception e) {
            // Unreadable policy fields, a revoked object, a malformed value:
            // every one of them means unavailable. None of them means "let it
            // through unfiltered".
            return CODE_SELECTION_UNAVAILABLE;
        }
    }

    // =====================================================================
    // Type rules
    // =====================================================================

    private static Boolean isSupportedType(Schema.DisplayType t) {
        return numericTypes().contains(t) ||
            textTypes().contains(t) ||
            t == Schema.DisplayType.BOOLEAN ||
            t == Schema.DisplayType.PICKLIST ||
            t == Schema.DisplayType.REFERENCE ||
            t == Schema.DisplayType.ID;
    }

    private static Set<Schema.DisplayType> numericTypes() {
        return new Set<Schema.DisplayType>{
            Schema.DisplayType.DOUBLE,
            Schema.DisplayType.CURRENCY,
            Schema.DisplayType.PERCENT,
            Schema.DisplayType.INTEGER,
            Schema.DisplayType.LONG
        };
    }

    /** "Text" reads as the text-backed types, not only STRING — filtering a
     *  Contact by Email is plainly the same kind of comparison. Long text,
     *  rich text and encrypted text stay out. */
    private static Set<Schema.DisplayType> textTypes() {
        return new Set<Schema.DisplayType>{
            Schema.DisplayType.STRING,
            Schema.DisplayType.EMAIL,
            Schema.DisplayType.PHONE,
            Schema.DisplayType.URL
        };
    }

    private static Set<String> allowedOperators(Schema.DisplayType t) {
        if (numericTypes().contains(t)) {
            return new Set<String>{ 'eq', 'ne', 'lt', 'lte', 'gt', 'gte' };
        }
        return new Set<String>{ 'eq', 'ne' };
    }

    private static String soqlOperator(String op) {
        Map<String, String> m = new Map<String, String>{
            'eq' => '=',
            'ne' => '!=',
            'lt' => '<',
            'lte' => '<=',
            'gt' => '>',
            'gte' => '>='
        };
        return m.get(op);
    }

    private static Boolean constantFits(
        Schema.DescribeFieldResult fd,
        Object v
    ) {
        Schema.DisplayType t = fd.getType();
        if (numericTypes().contains(t)) {
            return v instanceof Decimal ||
                v instanceof Integer ||
                v instanceof Double ||
                v instanceof Long;
        }
        if (t == Schema.DisplayType.BOOLEAN) {
            return v instanceof Boolean;
        }
        if (t == Schema.DisplayType.REFERENCE || t == Schema.DisplayType.ID) {
            if (!(v instanceof String)) {
                return false;
            }
            List<Schema.SObjectType> refs = fd.getReferenceTo();
            String expected = refs != null &&
                refs.size() == 1
                ? refs[0].getDescribe().getName()
                : null;
            return expected == null
                ? false
                : isIdOfObject((String) v, expected);
        }
        return v instanceof String;
    }

    /** A source element's answer must be able to stand in for this field. */
    private static Boolean sourceFits(
        Schema.DescribeFieldResult fd,
        Map<String, Object> source
    ) {
        Schema.DisplayType t = fd.getType();
        Map<String, Object> cfg = asMap(source.get('config'));
        String inputType = cfg == null ? null : asString(cfg.get('inputType'));

        if (t == Schema.DisplayType.REFERENCE || t == Schema.DisplayType.ID) {
            // Only another lookup can supply a record Id, and it must point at
            // the same object this field points at.
            if (inputType != 'reference' && inputType != 'lookup') {
                return false;
            }
            Schema.DescribeFieldResult sourceField = describeBinding(source);
            if (sourceField == null) {
                return false;
            }
            List<Schema.SObjectType> mine = fd.getReferenceTo();
            List<Schema.SObjectType> theirs = sourceField.getReferenceTo();
            if (
                mine == null ||
                theirs == null ||
                mine.size() != 1 ||
                theirs.size() != 1
            ) {
                return false;
            }
            return mine[0].getDescribe().getName() ==
                theirs[0].getDescribe().getName();
        }
        if (t == Schema.DisplayType.BOOLEAN) {
            return inputType == 'checkbox' || inputType == 'boolean';
        }
        if (numericTypes().contains(t)) {
            return inputType == 'number' ||
                inputType == 'currency' ||
                inputType == 'percent';
        }
        // Text and picklist accept any scalar answer; the value is stringified.
        return inputType != 'reference' && inputType != 'lookup';
    }

    private static Object coerce(Object raw, Schema.DisplayType t) {
        if (raw == null) {
            return null;
        }
        if (numericTypes().contains(t)) {
            if (
                raw instanceof Decimal ||
                raw instanceof Integer ||
                raw instanceof Double ||
                raw instanceof Long
            ) {
                return raw;
            }
            return Decimal.valueOf(String.valueOf(raw));
        }
        if (t == Schema.DisplayType.BOOLEAN) {
            if (raw instanceof Boolean) {
                return raw;
            }
            return Boolean.valueOf(String.valueOf(raw));
        }
        if (t == Schema.DisplayType.REFERENCE || t == Schema.DisplayType.ID) {
            return (Id) String.valueOf(raw);
        }
        String s = String.valueOf(raw);
        return s == '' ? null : s;
    }

    // =====================================================================
    // Small helpers
    // =====================================================================

    private static Boolean isIdOfObject(String value, String objectName) {
        if (String.isBlank(value) || String.isBlank(objectName)) {
            return false;
        }
        try {
            Id parsed = (Id) value;
            Schema.SObjectType t = parsed.getSObjectType();
            return t != null && t.getDescribe().getName() == objectName;
        } catch (Exception e) {
            return false;
        }
    }

    private static Schema.DescribeFieldResult describeBinding(
        Map<String, Object> el
    ) {
        Map<String, Object> binding = asMap(el.get('binding'));
        if (binding == null) {
            return null;
        }
        String objectName = asString(binding.get('object'));
        String fieldName = asString(binding.get('field'));
        if (String.isBlank(objectName) || String.isBlank(fieldName)) {
            return null;
        }
        if (globalDescribeCache == null) {
            globalDescribeCache = Schema.getGlobalDescribe();
        }
        Schema.SObjectType t = globalDescribeCache.get(
            objectName.toLowerCase()
        );
        if (t == null) {
            return null;
        }
        Schema.SObjectField f = t.getDescribe()
            .fields.getMap()
            .get(fieldName.toLowerCase());
        return f == null ? null : f.getDescribe();
    }

    private static void indexElements(
        Map<String, Object> spec,
        Map<String, Map<String, Object>> elementById,
        Set<String> insideRepeater
    ) {
        List<Object> pages = asList(spec.get('pages'));
        for (Object pObj : (pages == null ? new List<Object>() : pages)) {
            Map<String, Object> page = asMap(pObj);
            if (page == null) {
                continue;
            }
            List<Object> sections = asList(page.get('sections'));
            for (
                Object sObj : (sections == null ? new List<Object>() : sections)
            ) {
                Map<String, Object> sec = asMap(sObj);
                if (sec == null) {
                    continue;
                }
                Boolean repeats =
                    sec.get('repeat') != null &&
                    sec.get('repeat') != false;
                List<Object> elements = asList(sec.get('elements'));
                for (
                    Object eObj : (elements == null
                        ? new List<Object>()
                        : elements)
                ) {
                    Map<String, Object> el = asMap(eObj);
                    String elId = el == null ? null : asString(el.get('id'));
                    if (String.isBlank(elId)) {
                        continue;
                    }
                    elementById.put(elId, el);
                    if (repeats) {
                        insideRepeater.add(elId);
                    }
                }
            }
        }
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object> ? (List<Object>) o : null;
    }

    private static String asString(Object o) {
        return o instanceof String ? (String) o : null;
    }

    private static Integer asInteger(Object o) {
        if (o instanceof Integer) {
            return (Integer) o;
        }
        if (o instanceof Decimal) {
            return ((Decimal) o).intValue();
        }
        return null;
    }
}
