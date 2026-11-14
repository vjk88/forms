/**
 * FinalRelatedListService — related lists on a record page
 * (IMPL_PLAN_RELATED_RECORDS Part 2, slice 1 "See").
 *
 * A form that edits an existing record shows, for each repeating group, the
 * related records that already exist: the Cases of this Contact. This class
 * loads them, read-only, for the signed-in person:
 *
 *  - The group, its child object, its link field and its "Show" conditions
 *    all come from the PUBLISHED spec the server loads itself. The browser
 *    only names the version and the parent record.
 *  - The parent must be a record of the form's own object.
 *  - Every query runs WITH USER_MODE: sharing and field access decide what
 *    the person sees. A field they can't read is simply blank.
 *  - The "Show" conditions are compiled by the lookup compiler
 *    (FinalLookupService.compile), the one compiler the plan names, so the
 *    clause that lists the rows is the clause a later Save will check.
 *  - Field names never leave the server: values are keyed by question id.
 *  - Guests never load records (owner 2026-11-13: public users only add).
 *
 * One list failing (a condition that can't be compiled, a field the person
 * can't query) never fails the others: that list says so on its own.
 */
public with sharing class FinalRelatedListService {
    /** Rows shown per list; with more, the list says "Showing 50 of 312". */
    public static final Integer MAX_ROWS = 50;

    /** One list as the browser draws it. */
    public class RelatedList {
        @AuraEnabled
        public String sectionId;
        @AuraEnabled
        public List<Row> rows = new List<Row>();
        /** Every matching record, not just the rows shown. */
        @AuraEnabled
        public Integer total = 0;
        /** "Case" / "Cases", for the empty line and the links. */
        @AuraEnabled
        public String childLabel;
        @AuraEnabled
        public String childLabelPlural;
        @AuraEnabled
        public String childObject;
        /** Questions this person can't change (field access, the link). */
        @AuraEnabled
        public List<String> lockedQuestions = new List<String>();
        /** Set when this list could not be loaded; the others still are. */
        @AuraEnabled
        public String error;
    }

    public class Row {
        @AuraEnabled
        public String id;
        /** The record's own name ("00001026" for a Case). */
        @AuraEnabled
        public String name;
        /** questionId → the value as Salesforce shows it (labels, names). */
        @AuraEnabled
        public Map<String, String> cells = new Map<String, String>();
        /** questionId → the stored value (a picklist's API value, an Id),
         *  which "Show if" rules compare against, like any answer. */
        @AuraEnabled
        public Map<String, Object> values = new Map<String, Object>();
        /** Salesforce sharing lets this person edit the record. */
        @AuraEnabled
        public Boolean canEdit = false;
        /** Salesforce sharing and object access let this person delete it
         *  (slice 3; the list's Allow delete decides whether it's offered). */
        @AuraEnabled
        public Boolean canDelete = false;
    }

    /**
     * Loads every repeating group of the published version as a related list
     * of `parentRecordId`.
     * @param versionId The published version the viewer shows.
     * @param parentRecordId The record the form edits.
     * @return One entry per group, in form order.
     */
    @AuraEnabled
    public static List<RelatedList> load(Id versionId, Id parentRecordId) {
        if (UserInfo.getUserType() == 'Guest') {
            throw refusal(
                'Related records are only shown to signed-in people.'
            );
        }
        if (versionId == null || parentRecordId == null) {
            throw refusal('A form version and a record are required.');
        }
        Map<String, Object> spec = publishedSpec(versionId);
        Map<String, Object> form = asMap(spec.get('form'));
        String target = form == null ? null : (String) form.get('targetObject');
        if (
            String.isBlank(target) ||
            parentRecordId.getSObjectType().getDescribe().getName() != target
        ) {
            throw refusal(
                'This form saves to ' +
                    target +
                    ', so it can’t list related records of this record.'
            );
        }
        List<RelatedList> out = new List<RelatedList>();
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            for (
                Object secObj : asList(
                    page == null ? null : page.get('sections')
                )
            ) {
                Map<String, Object> sec = asMap(secObj);
                Map<String, Object> repeat = sec == null
                    ? null
                    : asMap(sec.get('repeat'));
                if (repeat != null) {
                    out.add(loadOne(sec, repeat, target, parentRecordId));
                }
            }
        }
        return out;
    }

    private static RelatedList loadOne(
        Map<String, Object> sec,
        Map<String, Object> repeatIn,
        String target,
        Id parentRecordId
    ) {
        RelatedList rl = new RelatedList();
        rl.sectionId = (String) sec.get('id');
        // a copy: validation canonicalizes in place
        Map<String, Object> repeat = new Map<String, Object>(repeatIn);
        String childObject;
        try {
            childObject = FinalSpecDescribeValidator.validateRepeat(
                repeat,
                target
            );
        } catch (Exception e) {
            rl.error = 'These related records can’t be listed: the group’s link is no longer valid.';
            return rl;
        }
        Schema.DescribeSObjectResult child = Schema.getGlobalDescribe()
            .get(childObject)
            .getDescribe();
        rl.childObject = child.getName();
        rl.childLabel = child.getLabel();
        rl.childLabelPlural = child.getLabelPlural();
        String link = (String) repeat.get('relationshipField');

        // "Show" conditions, compiled by the one lookup compiler
        Map<String, Object> show = asMap(repeat.get('show'));
        FinalLookupService.Compiled c = show == null
            ? new FinalLookupService.Compiled()
            : FinalLookupService.compile(
                  show,
                  // "the Contact's Account": read as this person
                  FinalLookupService.recordValues(show, target, parentRecordId),
                  childObject
              );
        if (c.blocked) {
            rl.error = c.blockedReason;
            return rl;
        }

        // what each question shows, as Salesforce would show it
        Map<String, Schema.SObjectField> fieldMap = child.fields.getMap();
        String nameField = nameFieldOf(fieldMap);
        List<String> cols = new List<String>{ 'Id' };
        if (nameField != null) {
            cols.add(nameField);
        }
        Map<String, String> aliasByElement = new Map<String, String>();
        Map<String, String> pathByElement = new Map<String, String>();
        Map<String, String> rawByElement = new Map<String, String>();
        Integer n = 0;
        for (Object elObj : asList(sec.get('elements'))) {
            Map<String, Object> el = asMap(elObj);
            Map<String, Object> binding = el == null
                ? null
                : asMap(el.get('binding'));
            String fieldName = binding == null
                ? null
                : (String) binding.get('field');
            Schema.SObjectField f = fieldName == null
                ? null
                : fieldMap.get(fieldName.toLowerCase());
            if (f == null) {
                continue;
            }
            Schema.DescribeFieldResult d = f.getDescribe();
            String elId = (String) el.get('id');
            if (!d.isUpdateable() || d.getName() == link) {
                rl.lockedQuestions.add(elId);
            }
            String alias = 'c' + n++;
            // the stored value too, for the question's own rules
            if (!cols.contains(d.getName())) {
                cols.add(d.getName());
            }
            rawByElement.put(elId, d.getName());
            switch on d.getType() {
                when PICKLIST, MULTIPICKLIST {
                    cols.add('toLabel(' + d.getName() + ') ' + alias);
                    aliasByElement.put(elId, alias);
                }
                when DATE,
                    DATETIME,
                    TIME,
                    CURRENCY,
                    DOUBLE,
                    INTEGER,
                    LONG,
                    PERCENT {
                    cols.add('FORMAT(' + d.getName() + ') ' + alias);
                    aliasByElement.put(elId, alias);
                }
                when REFERENCE {
                    String rel = d.getRelationshipName();
                    if (String.isNotBlank(rel)) {
                        String path = rel + '.Name';
                        if (!cols.contains(path)) {
                            cols.add(path);
                        }
                        pathByElement.put(elId, path);
                    }
                }
                when else {
                    if (!cols.contains(d.getName())) {
                        cols.add(d.getName());
                    }
                    pathByElement.put(elId, d.getName());
                }
            }
        }

        Map<String, Object> binds = new Map<String, Object>(c.binds);
        binds.put('parentId', parentRecordId);
        String whereClause = link + ' = :parentId';
        if (String.isNotBlank(c.whereClause)) {
            whereClause += ' AND (' + c.whereClause + ')';
        }
        try {
            rl.total = Database.countQueryWithBinds(
                'SELECT COUNT() FROM ' + childObject + ' WHERE ' + whereClause,
                binds,
                AccessLevel.USER_MODE
            );
            List<SObject> found = Database.queryWithBinds(
                'SELECT ' +
                    String.join(cols, ', ') +
                    ' FROM ' +
                    childObject +
                    ' WHERE ' +
                    whereClause +
                    ' ORDER BY CreatedDate DESC, Id DESC LIMIT ' +
                    MAX_ROWS,
                binds,
                AccessLevel.USER_MODE
            );
            for (SObject rec : found) {
                Row r = new Row();
                r.id = rec.Id;
                r.name = nameField == null ? null : text(rec.get(nameField));
                for (String elId : rawByElement.keySet()) {
                    r.values.put(elId, rec.get(rawByElement.get(elId)));
                }
                for (String elId : aliasByElement.keySet()) {
                    r.cells.put(elId, text(rec.get(aliasByElement.get(elId))));
                }
                for (String elId : pathByElement.keySet()) {
                    r.cells.put(
                        elId,
                        text(readPath(rec, pathByElement.get(elId)))
                    );
                }
                rl.rows.add(r);
            }
            // who may edit which row: Salesforce sharing, as this person
            Map<Id, Row> byId = new Map<Id, Row>();
            for (Row r : rl.rows) {
                byId.put((Id) r.id, r);
            }
            if (!byId.isEmpty()) {
                for (UserRecordAccess a : [
                    SELECT RecordId, HasEditAccess, HasDeleteAccess
                    FROM UserRecordAccess
                    WHERE
                        UserId = :UserInfo.getUserId()
                        AND RecordId IN :byId.keySet()
                ]) {
                    Row r = byId.get(a.RecordId);
                    if (r != null) {
                        r.canEdit = a.HasEditAccess;
                        r.canDelete = a.HasDeleteAccess && child.isDeletable();
                    }
                }
            }
        } catch (Exception e) {
            // A field this person can't query, or a condition the platform
            // refuses: this list says so, the others still load.
            rl.rows = new List<Row>();
            rl.total = 0;
            rl.error = 'These ' + rl.childLabelPlural + ' couldn’t be loaded.';
        }
        return rl;
    }

    // ---------------------------------------------------------------- helpers

    private static Map<String, Object> publishedSpec(Id versionId) {
        List<Form_Version__c> versions = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw refusal('No published specification found for this form.');
        }
        Object parsed = JSON.deserializeUntyped(versions[0].Spec_JSON__c);
        if (!(parsed instanceof Map<String, Object>)) {
            throw refusal('This form’s specification can’t be read.');
        }
        return (Map<String, Object>) parsed;
    }

    /** The object's own name field (CaseNumber on Case, Name elsewhere). */
    private static String nameFieldOf(Map<String, Schema.SObjectField> fields) {
        for (Schema.SObjectField f : fields.values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (d.isNameField()) {
                return d.getName();
            }
        }
        return null;
    }

    private static Object readPath(SObject rec, String path) {
        List<String> parts = path.split('\\.');
        SObject cur = rec;
        for (Integer i = 0; i < parts.size() - 1; i++) {
            cur = cur == null ? null : cur.getSObject(parts[i]);
        }
        return cur == null ? null : cur.get(parts[parts.size() - 1]);
    }

    /** Checkboxes read as Yes / No; everything else as its own text. */
    private static String text(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Boolean) {
            return (Boolean) v ? 'Yes' : 'No';
        }
        return String.valueOf(v);
    }

    private static AuraHandledException refusal(String message) {
        return FinalMappingRules.refusal(message);
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
