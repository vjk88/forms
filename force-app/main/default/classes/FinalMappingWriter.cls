/**
 * FinalMappingWriter — the only code that writes a mapping's records (D36).
 *
 * It writes in system mode, because a site guest can create nothing, so it
 * replaces the permission check with an explicit list: the published
 * version's own steps. A record whose object, or any populated field, is
 * not in the step it claims to belong to is refused before any DML.
 *
 * Duplicate rules still apply to every write here. allowSave is never set
 * (D40): the org's rules outrank the form.
 */
public without sharing class FinalMappingWriter {
    public class FenceException extends Exception {
    }

    private final Map<String, Map<String, Object>> actionsById = new Map<String, Map<String, Object>>();

    public FinalMappingWriter(List<Map<String, Object>> actions) {
        for (Map<String, Object> a : actions) {
            if (a.get('id') instanceof String) {
                actionsById.put((String) a.get('id'), a);
            }
        }
    }

    public Id insertFor(String actionId, SObject record) {
        check(actionId, record, false);
        Database.insert(record, true, AccessLevel.SYSTEM_MODE);
        return record.Id;
    }

    public void updateFor(String actionId, SObject record) {
        check(actionId, record, true);
        Database.update(record, true, AccessLevel.SYSTEM_MODE);
    }

    private void check(String actionId, SObject record, Boolean isUpdate) {
        Map<String, Object> action = actionsById.get(actionId);
        if (action == null) {
            throw new FenceException(
                'Step ' + actionId + ' isn’t in the published mapping.'
            );
        }
        String objectName = record.getSObjectType().getDescribe().getName();
        if (
            !objectName.equalsIgnoreCase(String.valueOf(action.get('object')))
        ) {
            throw new FenceException(
                objectName + ' isn’t the object step ' + actionId + ' writes.'
            );
        }
        Set<String> allowed = allowedFields(action, isUpdate);
        for (String field : record.getPopulatedFieldsAsMap().keySet()) {
            if (field.equalsIgnoreCase('Id')) {
                continue;
            }
            if (!allowed.contains(field.toLowerCase())) {
                throw new FenceException(
                    field + ' isn’t a field step ' + actionId + ' may write.'
                );
            }
        }
    }

    private static Set<String> allowedFields(
        Map<String, Object> action,
        Boolean isUpdate
    ) {
        Set<String> out = new Set<String>();
        if (isUpdate) {
            Map<String, Object> match = FinalMappingRules.asMap(
                action.get('match')
            );
            if (
                match == null ||
                match.get('onMatch') != FinalMappingRules.ON_MATCH_UPDATE
            ) {
                return out; // reuse: nothing may be written to a found record
            }
        }
        for (Object o : FinalMappingRules.asList(action.get('fields'))) {
            Map<String, Object> f = FinalMappingRules.asMap(o);
            if (f == null || !(f.get('field') instanceof String)) {
                continue;
            }
            if (isUpdate && f.get('writeOnMatch') != true) {
                continue;
            }
            out.add(((String) f.get('field')).toLowerCase());
        }
        return out;
    }
}
