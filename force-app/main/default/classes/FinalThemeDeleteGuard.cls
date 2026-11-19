/**
 * Refuses to delete a saved theme (Theme_Definition__c) while any live
 * form's WORKING spec still references it. A form's working spec is its
 * draft if one exists, else its active version. Published guests are safe
 * (published specs carry frozen tokens), but the Studio edits the working
 * spec, and a missing theme record would silently turn the draft default.
 *
 * Runs without sharing on purpose: the guard must see every form that uses
 * the theme, even ones the deleting user cannot see, or the check would let
 * a delete through. It reads only ids, names and spec text, and returns
 * nothing to the client beyond the form names in the error message.
 */
public without sharing class FinalThemeDeleteGuard {
    private static final Integer NAMES_SHOWN = 3;

    public static void beforeDelete(List<Theme_Definition__c> oldRows) {
        if (oldRows == null || oldRows.isEmpty()) {
            return;
        }
        // Match key per theme: a double quote + the 15-char id prefix (the
        // 18-char id starts with it, so one contains() covers both forms).
        Map<Id, String> keyByTheme = new Map<Id, String>();
        for (Theme_Definition__c t : oldRows) {
            keyByTheme.put(t.Id, '"' + String.valueOf(t.Id).substring(0, 15));
        }

        Set<Id> workingIds = workingVersionIds();
        if (workingIds.isEmpty()) {
            return;
        }

        Map<Id, List<String>> formsByTheme = new Map<Id, List<String>>();
        for (Form_Version__c v : [
            SELECT Id, Form__c, Form__r.Name, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id IN :workingIds
            WITH SYSTEM_MODE
        ]) {
            String spec = v.Spec_JSON__c;
            if (String.isBlank(spec)) {
                continue; // nothing to match
            }
            for (Id themeId : keyByTheme.keySet()) {
                if (spec.contains(keyByTheme.get(themeId))) {
                    if (!formsByTheme.containsKey(themeId)) {
                        formsByTheme.put(themeId, new List<String>());
                    }
                    formsByTheme.get(themeId).add(v.Form__r.Name);
                }
            }
        }

        for (Theme_Definition__c t : oldRows) {
            List<String> names = formsByTheme.get(t.Id);
            if (names == null || names.isEmpty()) {
                continue;
            }
            Integer n = names.size();
            List<String> shown = new List<String>();
            for (Integer i = 0; i < Math.min(n, NAMES_SHOWN); i++) {
                shown.add(names[i]);
            }
            String msg =
                'This theme is used by ' +
                (n == 1 ? '1 form: ' : n + ' forms: ') +
                String.join(shown, ', ') +
                (n > NAMES_SHOWN ? ' and ' + (n - NAMES_SHOWN) + ' more' : '') +
                (n == 1
                    ? '. Switch it to another theme first.'
                    : '. Switch them to another theme first.');
            t.addError(msg);
        }
    }

    /** One working version id per non-archived form: draft, else active. */
    private static Set<Id> workingVersionIds() {
        Map<Id, List<Form_Version__c>> byForm = new Map<Id, List<Form_Version__c>>();
        for (Form_Version__c v : [
            SELECT Id, Form__c, Is_Active__c, Version_Number__c
            FROM Form_Version__c
            WHERE Form__r.Status__c != 'Archived'
            WITH SYSTEM_MODE
            ORDER BY Form__c, Version_Number__c DESC
        ]) {
            if (!byForm.containsKey(v.Form__c)) {
                byForm.put(v.Form__c, new List<Form_Version__c>());
            }
            byForm.get(v.Form__c).add(v);
        }

        Set<Id> out = new Set<Id>();
        for (List<Form_Version__c> versions : byForm.values()) {
            Form_Version__c active = null;
            for (Form_Version__c v : versions) {
                if (v.Is_Active__c == true) {
                    active = v;
                    break;
                }
            }
            Decimal floor = active == null ? 0 : active.Version_Number__c;
            Form_Version__c working = active;
            for (Form_Version__c v : versions) {
                // DESC order: first inactive above the active one is the draft
                if (v.Is_Active__c != true && v.Version_Number__c > floor) {
                    working = v;
                    break;
                }
            }
            if (working != null) {
                out.add(working.Id);
            }
        }
        return out;
    }
}
