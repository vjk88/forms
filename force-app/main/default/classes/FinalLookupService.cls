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
            found = Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE);
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
            for (
                SObject rec : Database.queryWithBinds(
                    soql,
                    binds,
                    AccessLevel.USER_MODE
                )
            ) {
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
        // Current user values (D55): a guest has none worth searching with —
        // "current user" would be the site guest — so such a filter finds
        // nothing. Everyone else's are read in one query up front.
        Set<String> userPaths = new Set<String>();
        Boolean readsUser = false;
        for (Object rowObj : rows) {
            Map<String, Object> r = asMap(rowObj);
            String p = r == null ? null : userPathOf(r.get('value'));
            if (p != null) {
                readsUser = true;
                if (!FAST_USER_FIELDS.contains(p)) {
                    userPaths.add(p);
                }
            }
        }
        if (readsUser && UserInfo.getUserType() == 'Guest') {
            out.blocked = true;
            out.blockedReason = 'This filter needs a signed-in person.';
            return out;
        }
        loadUserValues(userPaths);

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
                    'Filter field "' +
                    fieldPath +
                    '" does not exist.';
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
                out.blockedReason =
                    'Filter operator "' +
                    op +
                    '" is not supported.';
                return out;
            }
            if (op == 'like') {
                out.binds.put(key, '%' + escapeLike(stringify(resolved)) + '%');
            } else if (MULTI_VALUE_OPS.contains(op)) {
                out.binds.put(key, asStringList(resolved));
            } else {
                // A fixed value is saved as text ("false", "5", "2026-01-31");
                // bind it as the field's own type, or say why it can't be.
                // Answers and user values arrive already typed (or are a
                // publish-time placeholder); only fixed text is converted.
                Object rawValue = row.get('value');
                Boolean fixedText = !(rawValue instanceof String &&
                ((String) rawValue).startsWith('$'));
                Schema.DescribeFieldResult fd = fixedText
                    ? fieldAt(objectName, safePath)
                    : null;
                try {
                    out.binds.put(key, asFieldType(resolved, fd));
                } catch (Exception e) {
                    out.blocked = true;
                    out.blockedReason =
                        '"' +
                        String.valueOf(resolved) +
                        '" isn’t a valid value for ' +
                        (fd == null ? fieldPath : fd.getLabel()) +
                        '.';
                    return out;
                }
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

    private class ValueException extends Exception {
    }

    /**
     * Text saved for a fixed value, as the field's own type: a checkbox
     * binds true/false, a number binds a number, a date binds a date.
     * Anything that isn't text (an answer already converted) passes through.
     * Throws when the text can't be that type.
     */
    @TestVisible
    private static Object asFieldType(
        Object value,
        Schema.DescribeFieldResult fd
    ) {
        if (!(value instanceof String) || fd == null) {
            return value;
        }
        String s = ((String) value).trim();
        switch on fd.getType() {
            when BOOLEAN {
                if (s.equalsIgnoreCase('true')) {
                    return true;
                }
                if (s.equalsIgnoreCase('false')) {
                    return false;
                }
                throw new ValueException('not a checkbox value');
            }
            when INTEGER {
                return Integer.valueOf(s);
            }
            when LONG {
                return Long.valueOf(s);
            }
            when DOUBLE, CURRENCY, PERCENT {
                return Decimal.valueOf(s);
            }
            when DATE {
                return Date.valueOf(s);
            }
            when DATETIME {
                String d = s.replace('T', ' ');
                return Datetime.valueOf(d.length() == 16 ? d + ':00' : d);
            }
            when else {
                return value;
            }
        }
    }

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
            Object v = answers == null ? null : answers.get(s.substring(7));
            return isAbsent(v) ? null : v;
        }
        if (s.startsWith('$User.')) {
            return userValue(s.substring(6));
        }
        return s;
    }

    /** Read once per transaction: path ('Title', 'Profile.Name') → value. */
    private static Map<String, Object> userValues = new Map<String, Object>();

    /** Answered from UserInfo without a query. */
    private static final Set<String> FAST_USER_FIELDS = new Set<String>{
        'Id',
        'ProfileId',
        'Email',
        'Name'
    };

    private static String userPathOf(Object raw) {
        return raw instanceof String && ((String) raw).startsWith('$User.')
            ? ((String) raw).substring(6)
            : null;
    }

    /**
     * D55: any User field, or one hop (Profile.Name, UserRole.Name), read in
     * ONE query as the running user. A path that isn't a readable User field
     * is never queried — its row then has no value and blocks the filter.
     */
    private static void loadUserValues(Set<String> paths) {
        Map<String, String> canonicalByPath = new Map<String, String>();
        for (String p : paths) {
            if (userValues.containsKey(p)) {
                continue;
            }
            String canonical = resolvePath('User', p);
            Schema.DescribeFieldResult d = canonical == null
                ? null
                : fieldAt('User', canonical);
            if (
                canonical != null &&
                canonical.countMatches('.') <= 1 &&
                d != null &&
                d.isAccessible()
            ) {
                canonicalByPath.put(p, canonical);
            }
        }
        if (canonicalByPath.isEmpty()) {
            return;
        }
        List<SObject> me = Database.queryWithBinds(
            'SELECT ' +
                String.join(
                    new List<String>(new Set<String>(canonicalByPath.values())),
                    ', '
                ) +
                ' FROM User WHERE Id = :me',
            new Map<String, Object>{ 'me' => UserInfo.getUserId() },
            AccessLevel.USER_MODE
        );
        if (me.isEmpty()) {
            return;
        }
        for (String p : canonicalByPath.keySet()) {
            String canonical = canonicalByPath.get(p);
            Integer dot = canonical.indexOf('.');
            SObject holder = dot < 0
                ? me[0]
                : me[0].getSObject(canonical.substring(0, dot));
            userValues.put(
                p,
                holder == null
                    ? null
                    : holder.get(
                          dot < 0 ? canonical : canonical.substring(dot + 1)
                      )
            );
        }
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
                // Read by loadUserValues, which checked the path against
                // User's describe first; anything it refused is null.
                return userValues.get(field);
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
    /**
     * The field a filter path ends at, as a describe. `resolvePath` already
     * knows that a hop may be written as the field (`Customer__c`) or as the
     * relationship (`Customer__r`, `Account`) and emits the relationship
     * spelling; this walks that canonical path to the final field.
     *
     * Freeform mapping needs it to convert an answer against the field a
     * condition actually filters on. Rewriting the rule in a second place is
     * how the two would quietly disagree about a custom relationship.
     */
    public static Schema.DescribeFieldResult fieldAt(
        String objectName,
        String path
    ) {
        String canonical = resolvePath(objectName, path);
        if (canonical == null) {
            return null;
        }
        List<String> parts = canonical.split('\\.');
        Schema.SObjectType current = Schema.getGlobalDescribe().get(objectName);
        for (Integer i = 0; current != null && i < parts.size(); i++) {
            Map<String, Schema.SObjectField> fields = current.getDescribe()
                .fields.getMap();
            if (i == parts.size() - 1) {
                Schema.SObjectField f = fields.get(parts[i].toLowerCase());
                return f == null ? null : f.getDescribe();
            }
            Schema.SObjectType next = null;
            for (Schema.SObjectField f : fields.values()) {
                Schema.DescribeFieldResult d = f.getDescribe();
                if (
                    d.getType() == Schema.DisplayType.REFERENCE &&
                    parts[i].equalsIgnoreCase(d.getRelationshipName())
                ) {
                    List<Schema.SObjectType> refs = d.getReferenceTo();
                    next = refs.isEmpty() ? null : refs[0];
                    break;
                }
            }
            current = next;
        }
        return null;
    }

    /**
     * A field path in its canonical SELECT spelling (`Account.Type`), or
     * null when any hop isn't real. Linked-record conditions use it so they
     * accept exactly the paths lookup filters do.
     */
    public static String canonicalPath(String objectName, String path) {
        return resolvePath(objectName, path);
    }

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
        for (
            Object o : asList(raw) == null ? new List<Object>() : asList(raw)
        ) {
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
