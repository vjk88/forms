/**
 * Fill on new records (IMPL_PLAN_RELATED_RECORDS P2.6, owner rulings
 * 2026-11-13: "Quietly", "Fixed + main record").
 *
 * A repeating group may set fields on every NEW related record it creates,
 * without the person filling in the form seeing them: a fixed value ("Status
 * = New") or a field of the main record (the Contact's Account → the Case's
 * Account). Spec: `repeat.fill: [{ field, value } | { field, from }]`.
 *
 * One home for "what may be filled, and from where", so the builder's
 * picker (`FinalStudioController.describeFillSources`), Publish
 * (`FinalSpecController`) and the save (`FinalSubmitService`) all ask the
 * same question.
 */
public with sharing class FinalRepeatFill {
    /** One fill as published: a fixed value, or a main-record field. */
    public class Fill {
        public String field;
        public Object value;
        /** The main record's field to copy, or null for a fixed value. */
        public String source;
    }

    private static final Set<Schema.DisplayType> TEXT_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.STRING,
        Schema.DisplayType.TEXTAREA,
        Schema.DisplayType.EMAIL,
        Schema.DisplayType.PHONE,
        Schema.DisplayType.URL,
        Schema.DisplayType.PICKLIST,
        Schema.DisplayType.COMBOBOX
    };

    private static final Set<Schema.DisplayType> DECIMAL_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.DOUBLE,
        Schema.DisplayType.CURRENCY,
        Schema.DisplayType.PERCENT
    };

    private static final Set<Schema.DisplayType> WHOLE_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.INTEGER,
        Schema.DisplayType.LONG
    };

    /** Types with a value a fill can carry. */
    private static final Set<Schema.DisplayType> FILLABLE_TYPES = new Set<Schema.DisplayType>{
        Schema.DisplayType.STRING,
        Schema.DisplayType.TEXTAREA,
        Schema.DisplayType.EMAIL,
        Schema.DisplayType.PHONE,
        Schema.DisplayType.URL,
        Schema.DisplayType.PICKLIST,
        Schema.DisplayType.COMBOBOX,
        Schema.DisplayType.MULTIPICKLIST,
        Schema.DisplayType.DOUBLE,
        Schema.DisplayType.CURRENCY,
        Schema.DisplayType.PERCENT,
        Schema.DisplayType.INTEGER,
        Schema.DisplayType.LONG,
        Schema.DisplayType.DATE,
        Schema.DisplayType.DATETIME,
        Schema.DisplayType.BOOLEAN,
        Schema.DisplayType.REFERENCE
    };

    /** The group's fills as published; malformed entries are left out. */
    public static List<Fill> parse(Map<String, Object> repeatCfg) {
        List<Fill> out = new List<Fill>();
        Object raw = repeatCfg == null ? null : repeatCfg.get('fill');
        if (!(raw instanceof List<Object>)) {
            return out;
        }
        for (Object o : (List<Object>) raw) {
            if (!(o instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) o;
            Object field = m.get('field');
            if (!(field instanceof String) || String.isBlank((String) field)) {
                continue;
            }
            Fill f = new Fill();
            f.field = (String) field;
            Object src = m.get('from');
            if (src instanceof String && String.isNotBlank((String) src)) {
                f.source = (String) src;
            } else {
                f.value = m.get('value');
            }
            out.add(f);
        }
        return out;
    }

    /** Can this child field be filled at all? (createable, a plain value) */
    public static Boolean fillable(Schema.DescribeFieldResult fd) {
        if (fd == null || !fd.isAccessible() || !fd.isCreateable()) {
            return false;
        }
        if (!FILLABLE_TYPES.contains(fd.getType())) {
            return false;
        }
        // a polymorphic lookup (OwnerId, WhatId) names no one object
        return fd.getType() != Schema.DisplayType.REFERENCE ||
            fd.getReferenceTo().size() == 1;
    }

    /**
     * May the main record's `source` field be copied into `target`? The
     * same kind of value only: text into text, numbers into numbers, a
     * lookup only into a lookup to the same object.
     */
    public static Boolean compatible(
        Schema.DescribeFieldResult target,
        Schema.DescribeFieldResult source
    ) {
        if (target == null || source == null || !source.isAccessible()) {
            return false;
        }
        Schema.DisplayType t = target.getType();
        Schema.DisplayType s = source.getType();
        if (t == Schema.DisplayType.REFERENCE) {
            return s == Schema.DisplayType.REFERENCE &&
                target.getReferenceTo().size() == 1 &&
                source.getReferenceTo().size() == 1 &&
                target.getReferenceTo()[0] == source.getReferenceTo()[0];
        }
        if (
            t == Schema.DisplayType.STRING ||
            t == Schema.DisplayType.TEXTAREA
        ) {
            return TEXT_TYPES.contains(s);
        }
        if (DECIMAL_TYPES.contains(t)) {
            return DECIMAL_TYPES.contains(s) || WHOLE_TYPES.contains(s);
        }
        if (WHOLE_TYPES.contains(t)) {
            return WHOLE_TYPES.contains(s);
        }
        if (t == Schema.DisplayType.COMBOBOX) {
            return s == Schema.DisplayType.COMBOBOX ||
                s == Schema.DisplayType.PICKLIST;
        }
        // email, phone, URL, picklist, multi-select, date, date/time,
        // checkbox: the same type
        return FILLABLE_TYPES.contains(t) && s == t;
    }

    /** The main record's fields that may fill `childField`, by label. */
    public static List<Map<String, Object>> sources(
        String parentObject,
        String childObject,
        String childField
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        Schema.DescribeFieldResult target = describe(childObject, childField);
        Schema.SObjectType parentType = typeOf(parentObject);
        if (target == null || parentType == null || !fillable(target)) {
            return out;
        }
        for (
            Schema.SObjectField f : parentType.getDescribe()
                .fields.getMap()
                .values()
        ) {
            Schema.DescribeFieldResult fd = f.getDescribe();
            if (compatible(target, fd)) {
                out.add(
                    new Map<String, Object>{
                        'apiName' => fd.getName(),
                        'label' => fd.getLabel()
                    }
                );
            }
        }
        return out;
    }

    /**
     * Why a group's fills can't be published, or null when they can
     * (P2.6 "Publish checks"). `elements` are the group's questions: a field
     * that is already a question can't also be filled quietly.
     */
    public static String problem(
        Map<String, Object> repeatCfg,
        List<Object> elements,
        String parentObject,
        String childObject
    ) {
        Object raw = repeatCfg == null ? null : repeatCfg.get('fill');
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof List<Object>)) {
            return 'its fields to fill on new records are not a list.';
        }
        Schema.SObjectType childType = typeOf(childObject);
        if (childType == null) {
            return null; // the link check names this first
        }
        Map<String, Schema.SObjectField> childFields = childType.getDescribe()
            .fields.getMap();
        Set<String> questions = new Set<String>();
        for (Object elObj : elements == null ? new List<Object>() : elements) {
            if (!(elObj instanceof Map<String, Object>)) {
                continue;
            }
            Object b = ((Map<String, Object>) elObj).get('binding');
            if (b instanceof Map<String, Object>) {
                Object field = ((Map<String, Object>) b).get('field');
                if (field instanceof String) {
                    questions.add(((String) field).toLowerCase());
                }
            }
        }
        String link = (String) repeatCfg.get('relationshipField');
        Set<String> seen = new Set<String>();
        for (Object o : (List<Object>) raw) {
            Map<String, Object> m = o instanceof Map<String, Object>
                ? (Map<String, Object>) o
                : null;
            Object rawField = m == null ? null : m.get('field');
            if (
                !(rawField instanceof String) ||
                String.isBlank((String) rawField)
            ) {
                return 'a field to fill on new records has no field.';
            }
            String field = (String) rawField;
            Schema.SObjectField tok = childFields.get(field);
            if (tok == null) {
                return field + ' is not a field of ' + childObject + '.';
            }
            Schema.DescribeFieldResult fd = tok.getDescribe();
            String label = fd.getLabel();
            if (!seen.add(fd.getName().toLowerCase())) {
                return label + ' is filled twice on new records.';
            }
            if (link != null && fd.getName().equalsIgnoreCase(link)) {
                return label +
                    ' links each ' +
                    childObject +
                    ' to the main record, so it can’t be filled too.';
            }
            if (questions.contains(fd.getName().toLowerCase())) {
                return label +
                    ' is a question in the group, so it can’t also be filled quietly.';
            }
            if (!fillable(fd)) {
                return label + ' can’t be filled on new records.';
            }
            Object src = m.get('from');
            if (src instanceof String && String.isNotBlank((String) src)) {
                Schema.DescribeFieldResult sd = describe(
                    parentObject,
                    (String) src
                );
                if (sd == null) {
                    return label +
                        ' is filled from ' +
                        src +
                        ', which is not a field of ' +
                        parentObject +
                        '.';
                }
                if (!compatible(fd, sd)) {
                    return label +
                        ' can’t be filled from ' +
                        sd.getLabel() +
                        ': they hold different kinds of value.';
                }
                continue;
            }
            String bad = valueProblem(fd, m.get('value'));
            if (bad != null) {
                return label + ' ' + bad;
            }
        }
        return null;
    }

    /** Null when `value` fits the field, else what's wrong (after its label). */
    @SuppressWarnings('PMD.CyclomaticComplexity')
    public static String valueProblem(
        Schema.DescribeFieldResult fd,
        Object value
    ) {
        Schema.DisplayType t = fd.getType();
        if (t == Schema.DisplayType.REFERENCE) {
            return 'is a lookup: it can only be filled from the main record.';
        }
        if (t == Schema.DisplayType.BOOLEAN) {
            return value instanceof Boolean ||
                value == 'true' ||
                value == 'false'
                ? null
                : 'needs to be checked or not checked.';
        }
        String s = value == null ? '' : String.valueOf(value).trim();
        if (s == '') {
            return 'needs a value.';
        }
        try {
            if (DECIMAL_TYPES.contains(t)) {
                Decimal.valueOf(s);
            } else if (WHOLE_TYPES.contains(t)) {
                Decimal d = Decimal.valueOf(s);
                if (d != d.round(System.RoundingMode.DOWN)) {
                    return 'needs a whole number.';
                }
            } else if (t == Schema.DisplayType.DATE) {
                if (!Pattern.matches('\\d{4}-\\d{2}-\\d{2}', s)) {
                    return 'needs a date.';
                }
                Date.valueOf(s);
            } else if (t == Schema.DisplayType.DATETIME) {
                JSON.deserialize('"' + s + '"', Datetime.class);
            }
        } catch (Exception e) {
            return DECIMAL_TYPES.contains(t) || WHOLE_TYPES.contains(t)
                ? 'needs a number.'
                : 'needs a date.';
        }
        if (
            t == Schema.DisplayType.PICKLIST ||
            t == Schema.DisplayType.MULTIPICKLIST
        ) {
            Set<String> active = new Set<String>();
            for (Schema.PicklistEntry pe : fd.getPicklistValues()) {
                if (pe.isActive()) {
                    active.add(pe.getValue());
                }
            }
            List<String> parts = t == Schema.DisplayType.MULTIPICKLIST
                ? s.split(';')
                : new List<String>{ s };
            for (String p : parts) {
                if (!active.contains(p)) {
                    return 'can’t be “' + p + '”: it isn’t one of its choices.';
                }
            }
        }
        if (
            TEXT_TYPES.contains(t) &&
            fd.getLength() > 0 &&
            s.length() > fd.getLength()
        ) {
            return 'can hold at most ' + fd.getLength() + ' characters.';
        }
        return null;
    }

    /**
     * The main record's values for the fills that copy from it, read AFTER
     * the main record is written (P2.6). A signed-in person reads as
     * themselves: a field they can't read gives nothing. A guest reads
     * nothing: only fields this submission itself wrote (`written`).
     */
    public static Map<String, Object> parentValues(
        Schema.SObjectType parentType,
        Id parentId,
        SObject written,
        Set<String> fields,
        Boolean guest
    ) {
        Map<String, Object> out = new Map<String, Object>();
        if (fields == null || fields.isEmpty() || parentType == null) {
            return out;
        }
        Map<String, Schema.SObjectField> all = parentType.getDescribe()
            .fields.getMap();
        if (guest) {
            Map<String, Object> populated = written == null
                ? new Map<String, Object>()
                : written.getPopulatedFieldsAsMap();
            Map<String, Object> byLower = new Map<String, Object>();
            for (String k : populated.keySet()) {
                byLower.put(k.toLowerCase(), populated.get(k));
            }
            for (String f : fields) {
                if (byLower.containsKey(f.toLowerCase())) {
                    out.put(f, byLower.get(f.toLowerCase()));
                }
            }
            return out;
        }
        List<String> readable = new List<String>();
        for (String f : fields) {
            Schema.SObjectField tok = all.get(f);
            if (tok != null && tok.getDescribe().isAccessible()) {
                readable.add(tok.getDescribe().getName());
            }
        }
        if (readable.isEmpty() || parentId == null) {
            return out;
        }
        List<SObject> rows = Database.queryWithBinds(
            'SELECT ' +
                String.join(readable, ', ') +
                ' FROM ' +
                parentType.getDescribe().getName() +
                ' WHERE Id = :pid LIMIT 1',
            new Map<String, Object>{ 'pid' => parentId },
            AccessLevel.USER_MODE
        );
        if (rows.isEmpty()) {
            return out;
        }
        for (String f : fields) {
            Schema.SObjectField tok = all.get(f);
            if (tok != null && readable.contains(tok.getDescribe().getName())) {
                out.put(f, rows[0].get(tok));
            }
        }
        return out;
    }

    private static Schema.SObjectType typeOf(String objectApi) {
        return String.isBlank(objectApi)
            ? null
            : Schema.getGlobalDescribe().get(objectApi);
    }

    private static Schema.DescribeFieldResult describe(
        String objectApi,
        String field
    ) {
        Schema.SObjectType t = typeOf(objectApi);
        if (t == null || String.isBlank(field)) {
            return null;
        }
        Schema.SObjectField tok = t.getDescribe().fields.getMap().get(field);
        return tok == null ? null : tok.getDescribe();
    }
}
