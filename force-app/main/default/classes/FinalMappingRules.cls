/**
 * FinalMappingRules — the rules Freeform mapping lives by, stated once
 * (FREEFORM_F2_MAPPING_SPEC). No DML, no queries. The validator, the
 * runtime and the Studio all read these, so the three cannot disagree.
 */
public with sharing class FinalMappingRules {
    public static final Integer MAX_STEPS = 10;

    public static final String OP_CREATE = 'create';
    public static final String OP_FIND_OR_CREATE = 'findOrCreate';
    public static final String ON_MATCH_REUSE = 'reuse';
    public static final String ON_MATCH_UPDATE = 'update';

    public static final String STATUS_NOT_NEEDED = 'Not needed';
    public static final String STATUS_QUEUED = 'Queued';
    public static final String STATUS_DONE = 'Done';
    public static final String STATUS_FAILED = 'Failed';
    public static final String STATUS_READY_FOR_RETRY = 'Ready for Retry';

    /** The service runs from these. Done and Not needed never run. */
    public static final Set<String> RUNNABLE = new Set<String>{
        STATUS_QUEUED,
        STATUS_FAILED,
        STATUS_READY_FOR_RETRY
    };

    /** A person may retry from these (D42). Queued never is. */
    public static final Set<String> RETRYABLE = new Set<String>{
        STATUS_FAILED,
        STATUS_READY_FOR_RETRY
    };

    /**
     * Setup objects. Salesforce refuses to write these in the same
     * transaction as ordinary records (MIXED_DML_OPERATION), so a mapping
     * naming one would fail on every submission. Lower case.
     */
    public static final Set<String> SETUP_OBJECTS = new Set<String>{
        'fieldpermissions',
        'group',
        'groupmember',
        'objectpermissions',
        'objectterritory2assignmentrule',
        'objectterritory2assignmentruleitem',
        'permissionset',
        'permissionsetassignment',
        'permissionsetgroup',
        'queuesobject',
        'ruleterritory2association',
        'setupentityaccess',
        'territory2',
        'territory2model',
        'user',
        'userpackagelicense',
        'userrole',
        'userterritory2association'
    };

    /**
     * A lookup that can point at more than one kind of record — a Task's
     * Related To, a Case's Owner. Not supported as a mapping destination
     * (spec D48): there is no way to offer the author a single target.
     */
    public static Boolean isMultiTarget(Schema.DescribeFieldResult fd) {
        return fd.getType() == Schema.DisplayType.REFERENCE &&
            fd.getReferenceTo().size() > 1;
    }

    /**
     * Question types whose answer is not one value for one field: a grid,
     * an order, a file.
     */
    public static final Set<String> UNMAPPABLE_ELEMENT_TYPES = new Set<String>{
        'matrix',
        'ranking',
        'file'
    };

    /**
     * Which destination field types each answer type may be written to,
     * keyed by Answer_Type__c (FinalSubmitService.answerTypeOf). A pair not
     * listed is a publish blocker.
     */
    public static final Map<String, Set<Schema.DisplayType>> COMPATIBLE = new Map<String, Set<Schema.DisplayType>>{
        'Text' => new Set<Schema.DisplayType>{
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA
        },
        'Email' => new Set<Schema.DisplayType>{
            Schema.DisplayType.EMAIL,
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA
        },
        'Phone' => new Set<Schema.DisplayType>{
            Schema.DisplayType.PHONE,
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA
        },
        'URL' => new Set<Schema.DisplayType>{
            Schema.DisplayType.URL,
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA
        },
        'Choice' => new Set<Schema.DisplayType>{
            Schema.DisplayType.PICKLIST,
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA
        },
        'Options' => new Set<Schema.DisplayType>{
            Schema.DisplayType.MULTIPICKLIST
        },
        'Number' => new Set<Schema.DisplayType>{
            Schema.DisplayType.DOUBLE,
            Schema.DisplayType.INTEGER,
            Schema.DisplayType.LONG,
            Schema.DisplayType.CURRENCY,
            Schema.DisplayType.PERCENT
        },
        'Boolean' => new Set<Schema.DisplayType>{ Schema.DisplayType.BOOLEAN },
        'Date' => new Set<Schema.DisplayType>{ Schema.DisplayType.DATE },
        'DateTime' => new Set<Schema.DisplayType>{ Schema.DisplayType.DATETIME }
    };

    public class MappingValueException extends Exception {
    }

    public static Boolean isCompatible(
        String answerType,
        Schema.DisplayType t
    ) {
        return answerType != null &&
            COMPATIBLE.containsKey(answerType) &&
            COMPATIBLE.get(answerType).contains(t);
    }

    public static Boolean isTextLike(Schema.DisplayType t) {
        return t == Schema.DisplayType.STRING ||
            t == Schema.DisplayType.TEXTAREA ||
            t == Schema.DisplayType.EMAIL ||
            t == Schema.DisplayType.PHONE ||
            t == Schema.DisplayType.URL;
    }

    /**
     * An AuraHandledException whose message survives into tests: without
     * setMessage, getMessage() returns "Script-thrown exception".
     */
    public static AuraHandledException refusal(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }

    /**
     * An answer value or a fixed value, turned into what the field stores.
     * Throws MappingValueException with a sentence an admin can act on.
     */
    public static Object coerce(Object raw, Schema.DescribeFieldResult fd) {
        String label = fd.getLabel();
        try {
            switch on fd.getType() {
                when STRING, TEXTAREA, EMAIL, PHONE, URL {
                    String s = String.valueOf(raw);
                    if (s.length() > fd.getLength()) {
                        throw new MappingValueException(
                            'The value is longer than ' +
                                label +
                                ' allows (' +
                                fd.getLength() +
                                ' characters).'
                        );
                    }
                    return s;
                }
                when DOUBLE, CURRENCY, PERCENT {
                    return decimalOf(raw);
                }
                when INTEGER {
                    return decimalOf(raw).intValue();
                }
                when LONG {
                    return decimalOf(raw).longValue();
                }
                when BOOLEAN {
                    if (raw instanceof Boolean) {
                        return raw;
                    }
                    String s = String.valueOf(raw).toLowerCase();
                    if (s == 'true' || s == 'false') {
                        return s == 'true';
                    }
                    throw new MappingValueException(
                        label + ' needs true or false.'
                    );
                }
                when DATE {
                    return raw instanceof Date
                        ? raw
                        : Date.valueOf(String.valueOf(raw));
                }
                when DATETIME {
                    return raw instanceof Datetime
                        ? raw
                        : (Datetime) JSON.deserialize(
                              '"' + String.valueOf(raw) + '"',
                              Datetime.class
                          );
                }
                when PICKLIST {
                    String s = String.valueOf(raw);
                    if (!activeValues(fd).contains(s)) {
                        throw new MappingValueException(
                            '"' + s + '" isn’t a value ' + label + ' accepts.'
                        );
                    }
                    return s;
                }
                when MULTIPICKLIST {
                    List<String> parts = new List<String>();
                    if (raw instanceof List<Object>) {
                        for (Object o : (List<Object>) raw) {
                            parts.add(String.valueOf(o));
                        }
                    } else {
                        parts.addAll(String.valueOf(raw).split(';'));
                    }
                    Set<String> ok = activeValues(fd);
                    for (String p : parts) {
                        if (!ok.contains(p)) {
                            throw new MappingValueException(
                                '"' +
                                    p +
                                    '" isn’t a value ' +
                                    label +
                                    ' accepts.'
                            );
                        }
                    }
                    return String.join(parts, ';');
                }
                when REFERENCE {
                    return Id.valueOf(String.valueOf(raw));
                }
                when else {
                    throw new MappingValueException(
                        label + ' is a kind of field a mapping can’t fill.'
                    );
                }
            }
        } catch (MappingValueException e) {
            throw e;
        } catch (Exception e) {
            throw new MappingValueException(
                'The value doesn’t fit ' + label + '.'
            );
        }
    }

    private static Decimal decimalOf(Object raw) {
        return raw instanceof Decimal
            ? (Decimal) raw
            : Decimal.valueOf(String.valueOf(raw));
    }

    private static Set<String> activeValues(Schema.DescribeFieldResult fd) {
        Set<String> out = new Set<String>();
        for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
            if (pe.isActive()) {
                out.add(pe.getValue());
            }
        }
        return out;
    }

    /**
     * The typed value of a stored answer, or null when it is blank or did
     * not convert when it was stored. Null means "leave the field alone"
     * (D44) — callers decide whether that is allowed.
     */
    public static Object valueOf(Form_Submission_Answer__c a) {
        if (a == null || a.Value_Unparsed__c == true) {
            return null;
        }
        switch on a.Answer_Type__c {
            when 'Number' {
                return a.Numeric_Value__c;
            }
            when 'Boolean' {
                return a.Boolean_Value__c;
            }
            when 'Date' {
                return a.Date_Value__c;
            }
            when 'DateTime' {
                return a.DateTime_Value__c;
            }
            when 'Options' {
                if (String.isBlank(a.Selected_Options_JSON__c)) {
                    return null;
                }
                List<Object> picked = (List<Object>) JSON.deserializeUntyped(
                    a.Selected_Options_JSON__c
                );
                return picked.isEmpty() ? null : picked;
            }
            when else {
                return String.isBlank(a.Text_Value__c) ? null : a.Text_Value__c;
            }
        }
    }

    /**
     * A stored answer as the DESTINATION field's vocabulary — the one
     * conversion, used when writing a field, when searching for a record and
     * when a filter row compares against an answer. Each caller passes the
     * field that value is actually going up against: for a filter row that is
     * the field being filtered, not the field being written.
     *
     * A choice goes into text as its label and into a picklist as its stored
     * value. Writing one and searching the other is how a form quietly makes a
     * duplicate on every submission.
     *
     * Shape is preserved: several choices stay a list, so an operator that
     * wants a list still gets one. Null means the answer is absent; what that
     * means is the caller's business — an assignment skips, a match fails.
     */
    public static Object answerValue(
        Form_Submission_Answer__c a,
        Map<String, Object> question,
        Schema.DescribeFieldResult fd
    ) {
        if (a == null) {
            return null;
        }
        if (a.Value_Unparsed__c == true) {
            // The raw text is all there is; only a text field can take it.
            return isTextLike(fd.getType()) &&
                String.isNotBlank(a.Text_Value__c)
                ? a.Text_Value__c
                : null;
        }
        Object v = valueOf(a);
        if (v == null) {
            return null;
        }
        Boolean asLabel =
            isTextLike(fd.getType()) &&
            (a.Answer_Type__c == 'Choice' ||
            a.Answer_Type__c == 'Options');
        if (!asLabel) {
            return v;
        }
        if (v instanceof List<Object>) {
            List<String> labels = new List<String>();
            for (Object o : (List<Object>) v) {
                labels.add(optionLabel(question, String.valueOf(o)));
            }
            return labels;
        }
        return optionLabel(question, String.valueOf(v));
    }

    /**
     * The field a filter path ends at ("Account.Type"), or null when the path
     * does not resolve — the filter compiler refuses those itself, with a
     * better message than we could give here.
     */
    public static Schema.DescribeFieldResult fieldAt(
        String objectApi,
        String path
    ) {
        // The lookup compiler's own resolver, so publish, the search and the
        // filter all agree about what `Customer__r.Name` means. A hop can be
        // written as the field or as the relationship, and only that code
        // knows both spellings.
        return FinalLookupService.fieldAt(objectApi, path);
    }

    public static List<Map<String, Object>> actionsOf(
        Map<String, Object> spec
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        Map<String, Object> mapping = spec == null
            ? null
            : asMap(spec.get('mapping'));
        for (
            Object a : asList(mapping == null ? null : mapping.get('actions'))
        ) {
            Map<String, Object> action = asMap(a);
            if (action != null) {
                out.add(action);
            }
        }
        return out;
    }

    /** Every question, in the order the form asks them. */
    public static List<Map<String, Object>> questionsInOrder(
        Map<String, Object> spec
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Object pageObj : asList(spec == null ? null : spec.get('pages'))) {
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
                    if (
                        el != null &&
                        el.get('id') instanceof String &&
                        FinalPublishWarnings.isQuestion(el)
                    ) {
                        out.add(el);
                    }
                }
            }
        }
        return out;
    }

    public static Map<String, Map<String, Object>> questionMap(
        Map<String, Object> spec
    ) {
        Map<String, Map<String, Object>> out = new Map<String, Map<String, Object>>();
        for (Map<String, Object> q : questionsInOrder(spec)) {
            out.put((String) q.get('id'), q);
        }
        return out;
    }

    /**
     * Questions a respondent can leave without an answer: not always
     * required, or on a page, section or element with a visibility rule
     * (rule-hidden answers are dropped before the server sees them).
     */
    public static Set<String> skippableElementIds(Map<String, Object> spec) {
        return skippable(spec).keySet();
    }

    /**
     * Why a question can go unanswered, and where that is fixed: the
     * question itself (optional, or its own rule), or the section or page
     * whose rule can hide it. `why` and `fix` finish a sentence that starts
     * with the question's name.
     */
    public class Skippable {
        public String why;
        public String fix;
        /** What Go there selects: 'element', 'section' or 'page'. */
        public String kind;
        public String id;
    }

    public static Map<String, Skippable> skippable(Map<String, Object> spec) {
        Map<String, Skippable> out = new Map<String, Skippable>();
        for (Object pageObj : asList(spec == null ? null : spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            Boolean pageRule = hasRule(page);
            for (
                Object secObj : asList(
                    page == null ? null : page.get('sections')
                )
            ) {
                Map<String, Object> sec = asMap(secObj);
                Boolean secRule = hasRule(sec);
                for (
                    Object elObj : asList(
                        sec == null ? null : sec.get('elements')
                    )
                ) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null || !(el.get('id') instanceof String)) {
                        continue;
                    }
                    Boolean optional = !isAlwaysRequired(el);
                    Boolean ownRule = hasRule(el);
                    if (!optional && !ownRule && !secRule && !pageRule) {
                        continue;
                    }
                    Skippable s = new Skippable();
                    String alsoRequired = optional
                        ? ' Make the question required too.'
                        : '';
                    if (pageRule || secRule) {
                        Boolean onPage = pageRule;
                        Map<String, Object> holder = onPage ? page : sec;
                        String name = str(
                            holder.get(onPage ? 'name' : 'title'),
                            onPage ? 'Page' : 'Section'
                        );
                        s.why =
                            'is on the ' +
                            (onPage ? 'page' : 'section') +
                            ' “' +
                            name +
                            '”, which a rule can hide';
                        s.fix =
                            'Remove that ' +
                            (onPage ? 'page' : 'section') +
                            '’s rule, or compare with something else.' +
                            alsoRequired;
                        s.kind = onPage ? 'page' : 'section';
                        s.id = str(holder.get('id'), null);
                    } else if (ownRule) {
                        s.why = optional
                            ? 'can be skipped, and a rule can hide it'
                            : 'can be hidden by its rule';
                        s.fix = optional
                            ? 'Make it required and remove its rule.'
                            : 'Remove its rule, or compare with something else.';
                        s.kind = 'element';
                        s.id = (String) el.get('id');
                    } else {
                        s.why = 'can be skipped';
                        s.fix = 'Make it required.';
                        s.kind = 'element';
                        s.id = (String) el.get('id');
                    }
                    out.put((String) el.get('id'), s);
                }
            }
        }
        return out;
    }

    private static String str(Object o, String fallback) {
        return o instanceof String && String.isNotBlank((String) o)
            ? (String) o
            : fallback;
    }

    private static Boolean hasRule(Map<String, Object> node) {
        if (node == null || node.get('visibility') == null) {
            return false;
        }
        Map<String, Object> v = asMap(node.get('visibility'));
        return v == null || !asList(v.get('rules')).isEmpty();
    }

    private static Boolean isAlwaysRequired(Map<String, Object> el) {
        if (el.get('required') == true) {
            return true;
        }
        for (Object vObj : asList(el.get('validation'))) {
            Map<String, Object> v = asMap(vObj);
            if (
                v != null &&
                v.get('type') == 'required' &&
                v.get('when') == null
            ) {
                return true;
            }
        }
        return false;
    }

    /** The option values a Choice or Options question offers. */
    public static List<String> optionValues(Map<String, Object> question) {
        List<String> out = new List<String>();
        Map<String, Object> config = asMap(question.get('config'));
        for (Object o : asList(config == null ? null : config.get('options'))) {
            Map<String, Object> opt = asMap(o);
            if (opt != null && opt.get('value') != null) {
                out.add(String.valueOf(opt.get('value')));
            }
        }
        return out;
    }

    /**
     * The label the submission's own version shows for a stored option
     * value — "the version is the dictionary" (FREEFORM_SPEC 8). Falls back
     * to the value, never to blank.
     */
    public static String optionLabel(
        Map<String, Object> question,
        String value
    ) {
        Map<String, Object> config = question == null
            ? null
            : asMap(question.get('config'));
        for (Object o : asList(config == null ? null : config.get('options'))) {
            Map<String, Object> opt = asMap(o);
            if (opt != null && String.valueOf(opt.get('value')) == value) {
                Object label = opt.get('label');
                return label == null || String.isBlank(String.valueOf(label))
                    ? value
                    : String.valueOf(label);
            }
        }
        return value;
    }

    public static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    public static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
}
