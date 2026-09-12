/**
 * FinalLookupService — ONE compiler, two callers.
 *
 * The same compiled WHERE clause serves type-ahead search and the submit-time
 * check. That is the whole point of this class: a dropdown that offers a record
 * the save then refuses is the bug this design exists to make impossible.
 *
 * Everything here reads config from the PUBLISHED spec. Nothing the browser
 * sends is trusted beyond a search term, the current answers, and record ids.
 *
 * Security posture:
 *  - Field paths are validated against describe before they reach a query.
 *    An unknown path is a compile failure, never a string appended to SOQL.
 *  - Values are ALWAYS bound. `Database.queryWithBinds(..., USER_MODE)` does
 *    the sharing and FLS work, so this class never hand-rolls either.
 *  - Guests are bounded by the spec itself: the object and the fields come
 *    from the published config, so a guest can only ever search what the
 *    author published.
 */
public inherited sharing class FinalLookupService {
    /** Search results cap. The spec's number, not a guess. */
    private static final Integer MAX_RESULTS = 8;
    /** Below this, searching costs more than it returns. */
    public static final Integer MIN_TERM = 2;

    private static final Set<String> MULTI_VALUE_OPS = new Set<String>{
        'in',
        'nin',
        'includes',
        'excludes'
    };
    private static final Set<String> NO_VALUE_OPS = new Set<String>{
        'isBlank',
        'isNotBlank'
    };

    // ---------------------------------------------------------------- result

    public class Row {
        @AuraEnabled
        public String id;
        @AuraEnabled
        public String title;
        @AuraEnabled
        public String subtitle;
    }

    /** A compile either produces a clause or explains why it could not. */
    public class Compiled {
        public String whereClause;
        public Map<String, Object> binds = new Map<String, Object>();
        public Boolean blocked = false;
        public String blockedReason;
    }

    public class LookupException extends Exception {
    }

    // --------------------------------------------------------------- search

    /**
     * Type-ahead. Returns at most MAX_RESULTS rows the running user may read.
     * A blocked filter returns NOTHING — never everything. Widening a filter
     * because a controlling answer is missing is how people pick the wrong
     * record and find out at save time.
     */
    public static List<Row> search(
        Map<String, Object> cfg,
        String term,
        Map<String, Object> answers
    ) {
        List<Row> out = new List<Row>();
        if (cfg == null || String.isBlank(term) || term.length() < MIN_TERM) {
            return out;
        }
        String objectName = requireObject(cfg);
        List<String> displayFields = displayFieldsOf(cfg, objectName);
        List<String> searchFields = searchFieldsOf(cfg, objectName);

        Compiled c = compile(cfg, answers, objectName);
        if (c.blocked) {
            return out;
        }

        Map<String, Object> binds = new Map<String, Object>(c.binds);
        List<String> termClauses = new List<String>();
        Integer t = 0;
        for (String f : searchFields) {
            String key = 'term' + t++;
            termClauses.add(f + ' LIKE :' + key);
            binds.put(key, '%' + escapeLike(term) + '%');
        }

        List<String> selectFields = new List<String>{ 'Id' };
        for (String f : displayFields) {
            if (!selectFields.contains(f)) {
                selectFields.add(f);
            }
        }

        String soql =
            'SELECT ' +
            String.join(selectFields, ', ') +
            ' FROM ' +
            objectName +
            ' WHERE (' +
            String.join(termClauses, ' OR ') +
            ')';
        if (String.isNotBlank(c.whereClause)) {
            soql += ' AND (' + c.whereClause + ')';
        }
        soql += ' ORDER BY ' + displayFields[0] + ' LIMIT ' + MAX_RESULTS;

        List<SObject> found;
        try {
            found = Database.queryWithBinds(
                soql,
                binds,
                AccessLevel.USER_MODE
            );
        } catch (Exception e) {
            // A field the running user cannot read, or a path describe allowed
            // but the query refuses. Return nothing rather than leak a reason.
            return out;
        }

        for (SObject rec : found) {
            Row r = new Row();
            r.id = (String) rec.get('Id');
            r.title = stringify(readPath(rec, displayFields[0]));
            if (displayFields.size() > 1) {
                r.subtitle = stringify(readPath(rec, displayFields[1]));
            }
            out.add(r);
        }
        return out;
    }

    // --------------------------------------------------------------- verify

    /**
     * Which of `ids` genuinely satisfy the filter for this user, right now.
     * Anything missing from the returned set is disqualified — wrong object,
     * unreadable, or filtered out. The caller decides what that means.
     */
    public static Set<Id> verify(
        Map<String, Object> cfg,
        Set<Id> ids,
        Map<String, Object> answers
    ) {
        Set<Id> ok = new Set<Id>();
        if (cfg == null || ids == null || ids.isEmpty()) {
            return ok;
        }
        String objectName = requireObject(cfg);
        Schema.SObjectType tp = Schema.getGlobalDescribe().get(objectName);
        if (tp == null) {
            return ok;
        }
        // An id of the wrong shape can never qualify, and must not reach SOQL.
        Set<Id> shaped = new Set<Id>();
        for (Id i : ids) {
            if (i != null && i.getSObjectType() == tp) {
                shaped.add(i);
            }
        }
        if (shaped.isEmpty()) {
            return ok;
        }

        Compiled c = compile(cfg, answers, objectName);
        if (c.blocked) {
            return ok; // a filter that cannot be compiled disqualifies everything
        }

        Map<String, Object> binds = new Map<String, Object>(c.binds);
        binds.put('ids', shaped);
        String soql = 'SELECT Id FROM ' + objectName + ' WHERE Id IN :ids';
        if (String.isNotBlank(c.whereClause)) {
            soql += ' AND (' + c.whereClause + ')';
        }
        try {
            for (SObject rec : Database.queryWithBinds(
                soql,
                binds,
                AccessLevel.USER_MODE
            )) {
                ok.add((Id) rec.get('Id'));
            }
        } catch (Exception e) {
            return new Set<Id>(); // refuse rather than guess
        }
        return ok;
    }

    // -------------------------------------------------------------- compile

    /**
     * Config + answers → a bound WHERE clause.
     *
     * A row whose value cannot be resolved BLOCKS the whole filter. It never
     * drops out. Dropping an unresolvable row silently turns a deliberately
     * narrow filter into "every record on the object".
     */
    public static Compiled compile(
        Map<String, Object> cfg,
        Map<String, Object> answers,
        String objectName
    ) {
        Compiled out = new Compiled();
        Map<String, Object> filter = asMap(cfg.get('filter'));
        if (filter == null) {
            return out;
        }
        List<Object> rows = asList(filter.get('rows'));
        if (rows == null || rows.isEmpty()) {
            return out;
        }

        List<String> pieces = new List<String>();
        Integer b = 0;
        for (Object rowObj : rows) {
            Map<String, Object> row = asMap(rowObj);
            if (row == null) {
                out.blocked = true;
                out.blockedReason = 'A filter condition is not readable.';
                return out;
            }
            String fieldPath = (String) row.get('fieldPath');
            String op = (String) row.get('operator');
            if (String.isBlank(fieldPath) || String.isBlank(op)) {
                out.blocked = true;
                out.blockedReason = 'A filter condition is incomplete.';
                return out;
            }
            String safePath = resolvePath(objectName, fieldPath);
            if (safePath == null) {
                out.blocked = true;
                out.blockedReason =
                    'Filter field "' + fieldPath + '" does not exist.';
                return out;
            }

            if (NO_VALUE_OPS.contains(op)) {
                pieces.add(
                    safePath + (op == 'isBlank' ? ' = NULL' : ' != NULL')
                );
                continue;
            }

            Object resolved = resolveValue(row, answers);
            if (resolved == null) {
                out.blocked = true;
                out.blockedReason = 'A filter condition has no value yet.';
                return out;
            }

            String key = 'b' + b++;
            String clause = clauseFor(safePath, op, key);
            if (clause == null) {
                out.blocked = true;
                out.blockedReason = 'Filter operator "' + op + '" is not supported.';
                return out;
            }
            if (op == 'like') {
                out.binds.put(key, '%' + escapeLike(stringify(resolved)) + '%');
            } else if (MULTI_VALUE_OPS.contains(op)) {
                out.binds.put(key, asStringList(resolved));
            } else {
                out.binds.put(key, resolved);
            }
            pieces.add(clause);
        }

        String logic = (String) filter.get('logic');
        if (logic == 'custom') {
            String expr = (String) filter.get('customLogic');
            String combined = FinalLookupLogic.combine(expr, pieces);
            if (combined == null) {
                out.blocked = true;
                out.blockedReason = 'The custom logic expression is malformed.';
                return out;
            }
            out.whereClause = combined;
        } else {
            out.whereClause = String.join(
                pieces,
                logic == 'any' ? ' OR ' : ' AND '
            );
        }
        return out;
    }

    // ------------------------------------------------------------- internals

    private static String clauseFor(String path, String op, String key) {
        switch on op {
            when 'eq' {
                return path + ' = :' + key;
            }
            when 'ne' {
                return path + ' != :' + key;
            }
            when 'lt' {
                return path + ' < :' + key;
            }
            when 'lte' {
                return path + ' <= :' + key;
            }
            when 'gt' {
                return path + ' > :' + key;
            }
            when 'gte' {
                return path + ' >= :' + key;
            }
            when 'like' {
                return path + ' LIKE :' + key;
            }
            when 'in' {
                return path + ' IN :' + key;
            }
            when 'nin' {
                return path + ' NOT IN :' + key;
            }
            when 'includes' {
                return path + ' INCLUDES :' + key;
            }
            when 'excludes' {
                return path + ' EXCLUDES :' + key;
            }
            when else {
                return null;
            }
        }
    }

    /**
     * Value sources. A string may carry a token:
     *   $User.<field>      — the running user
     *   $field.<elementId> — another answer on this form
     * Anything else is a constant. Multi-value operators take `values`.
     */
    private static Object resolveValue(
        Map<String, Object> row,
        Map<String, Object> answers
    ) {
        Object multi = row.get('values');
        if (multi instanceof List<Object>) {
            List<Object> vals = (List<Object>) multi;
            return vals.isEmpty() ? null : vals;
        }
        Object raw = row.get('value');
        if (!(raw instanceof String)) {
            return raw; // numbers, booleans and dates pass straight through
        }
        String s = (String) raw;
        if (String.isBlank(s)) {
            return null;
        }
        if (s.startsWith('$field.')) {
            Object v = answers == null
                ? null
                : answers.get(s.substring(7));
            return isAbsent(v) ? null : v;
        }
        if (s.startsWith('$User.')) {
            return userValue(s.substring(6));
        }
        return s;
    }

    private static Object userValue(String field) {
        switch on field {
            when 'Id' {
                return UserInfo.getUserId();
            }
            when 'ProfileId' {
                return UserInfo.getProfileId();
            }
            when 'Email' {
                return UserInfo.getUserEmail();
            }
            when 'Name' {
                return UserInfo.getName();
            }
            when else {
                // Anything else needs a real query; keep the surface small
                // rather than open a hole nobody asked for.
                return null;
            }
        }
    }

    /** Only null / '' / an empty list is an absence. `false` and `0` are answers. */
    private static Boolean isAbsent(Object v) {
        if (v == null) {
            return true;
        }
        if (v instanceof String) {
            return String.isBlank((String) v);
        }
        if (v instanceof List<Object>) {
            return ((List<Object>) v).isEmpty();
        }
        return false;
    }

    /**
     * Validate a field path against describe and return it in its canonical
     * spelling. One level of relationship traversal is checked here; deeper
     * paths are walked segment by segment, so `Account.Owner.Name` validates
     * as long as every hop is real and readable.
     */
    @TestVisible
    private static String resolvePath(String objectName, String path) {
        if (String.isBlank(path)) {
            return null;
        }
        List<String> parts = path.split('\\.');
        Schema.SObjectType current = Schema.getGlobalDescribe().get(objectName);
        if (current == null) {
            return null;
        }
        List<String> canonical = new List<String>();
        for (Integer i = 0; i < parts.size(); i++) {
            String seg = parts[i];
            Map<String, Schema.SObjectField> fields = current.getDescribe()
                .fields.getMap();
            if (i == parts.size() - 1) {
                Schema.SObjectField f = fields.get(seg.toLowerCase());
                if (f == null) {
                    return null;
                }
                canonical.add(f.getDescribe().getName());
                return String.join(canonical, '.');
            }
            // A hop may be written either way: the FIELD (`AccountId`,
            // `Job_Application__c`) or the RELATIONSHIP (`Account`,
            // `Job_Application__r`). Authors and SOQL disagree about which is
            // natural, so accept both and emit the relationship name.
            Schema.DescribeFieldResult hop = null;
            Schema.SObjectField direct = fields.get(seg.toLowerCase());
            if (direct != null) {
                Schema.DescribeFieldResult d = direct.getDescribe();
                if (d.getType() == Schema.DisplayType.REFERENCE) {
                    hop = d;
                }
            }
            if (hop == null) {
                for (Schema.SObjectField f : fields.values()) {
                    Schema.DescribeFieldResult d = f.getDescribe();
                    if (
                        d.getType() == Schema.DisplayType.REFERENCE &&
                        seg.equalsIgnoreCase(d.getRelationshipName())
                    ) {
                        hop = d;
                        break;
                    }
                }
            }
            if (hop == null || String.isBlank(hop.getRelationshipName())) {
                return null;
            }
            List<Schema.SObjectType> refs = hop.getReferenceTo();
            if (refs == null || refs.size() != 1) {
                return null; // polymorphic traversal is not v1
            }
            canonical.add(hop.getRelationshipName());
            current = refs[0];
        }
        return null;
    }

    private static String requireObject(Map<String, Object> cfg) {
        String o = (String) cfg.get('targetObject');
        if (String.isBlank(o) || Schema.getGlobalDescribe().get(o) == null) {
            throw new LookupException('This lookup is not configured.');
        }
        return o;
    }

    private static List<String> displayFieldsOf(
        Map<String, Object> cfg,
        String objectName
    ) {
        List<String> out = validPaths(cfg.get('displayFields'), objectName);
        if (out.isEmpty()) {
            String n = resolvePath(objectName, 'Name');
            out.add(n == null ? 'Id' : n);
        }
        return out;
    }

    private static List<String> searchFieldsOf(
        Map<String, Object> cfg,
        String objectName
    ) {
        List<String> out = validPaths(cfg.get('searchFields'), objectName);
        if (out.isEmpty()) {
            out = displayFieldsOf(cfg, objectName);
        }
        return out;
    }

    private static List<String> validPaths(Object raw, String objectName) {
        List<String> out = new List<String>();
        for (Object o : asList(raw) == null ? new List<Object>() : asList(raw)) {
            if (o instanceof String) {
                String safe = resolvePath(objectName, (String) o);
                if (safe != null && !out.contains(safe)) {
                    out.add(safe);
                }
            }
        }
        return out;
    }

    /** Follow a dotted path across the parent records a SOQL result carries. */
    private static Object readPath(SObject rec, String path) {
        List<String> parts = path.split('\\.');
        SObject cur = rec;
        for (Integer i = 0; i < parts.size() - 1; i++) {
            if (cur == null) {
                return null;
            }
            cur = cur.getSObject(parts[i]);
        }
        return cur == null ? null : cur.get(parts[parts.size() - 1]);
    }

    private static List<String> asStringList(Object v) {
        List<String> out = new List<String>();
        if (v instanceof List<Object>) {
            for (Object o : (List<Object>) v) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
        } else if (v != null) {
            out.add(String.valueOf(v));
        }
        return out;
    }

    /** `_` and `%` are wildcards in LIKE; a user typing them means them literally. */
    private static String escapeLike(String s) {
        return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
    }

    private static String stringify(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object> ? (List<Object>) o : null;
    }
}
