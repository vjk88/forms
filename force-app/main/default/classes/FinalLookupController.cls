/**
 * FinalLookupController — the only door the browser gets.
 *
 * The client sends a search term, the current answers and ids. It never sends
 * filter criteria, a target object, or a field list; all of that is read from
 * the PUBLISHED spec here. A tampered payload therefore buys nothing: the worst
 * it can do is search what the author already published.
 *
 * Guests reach `search` only when the author opted that element in
 * (`lookupConfig.allowGuest`). The default is off.
 */
public with sharing class FinalLookupController {
    private static final String UNAVAILABLE = 'This form is not available.';

    @AuraEnabled
    public static List<FinalLookupService.Row> search(
        Id formId,
        Id versionId,
        String elementId,
        String term,
        String answersJson
    ) {
        Map<String, Object> cfg = publishedConfig(formId, versionId, elementId);
        if (UserInfo.getUserType() == 'Guest' && cfg.get('allowGuest') != true) {
            // Say nothing about why. A guest learns only that there is nothing
            // to see, never that a lookup exists and is restricted.
            return new List<FinalLookupService.Row>();
        }
        try {
            return FinalLookupService.search(
                cfg,
                term,
                answersOf(answersJson)
            );
        } catch (FinalLookupService.LookupException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    /**
     * Authoring: the fields an author may filter, display or search on, for one
     * object, plus one level of relationship for the picker to drill into.
     * Never reachable by a guest — this is Studio only.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> describeLookupFields(
        String objectApiName,
        String relationshipName
    ) {
        if (UserInfo.getUserType() == 'Guest') {
            throw new AuraHandledException('Unauthorized');
        }
        Schema.SObjectType tp = Schema.getGlobalDescribe().get(objectApiName);
        if (tp == null) {
            throw new AuraHandledException('Unknown object.');
        }
        Schema.SObjectType target = tp;
        String prefix = '';
        if (String.isNotBlank(relationshipName)) {
            target = hop(tp, relationshipName);
            if (target == null) {
                throw new AuraHandledException('Unknown relationship.');
            }
            prefix = relationshipName + '.';
        }

        List<Map<String, Object>> fields = new List<Map<String, Object>>();
        List<Map<String, Object>> rels = new List<Map<String, Object>>();
        for (Schema.SObjectField f : target.getDescribe().fields.getMap().values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (!d.isAccessible()) {
                continue;
            }
            if (d.isFilterable()) {
                fields.add(
                    new Map<String, Object>{
                        'path' => prefix + d.getName(),
                        'label' => d.getLabel(),
                        'type' => String.valueOf(d.getType()).toLowerCase(),
                        'picklistValues' => picklistOf(d)
                    }
                );
            }
            // Only offer a further hop when we are still at the root; deeper
            // drilling is allowed by the compiler but would bury the author.
            if (
                String.isBlank(prefix) &&
                d.getType() == Schema.DisplayType.REFERENCE &&
                String.isNotBlank(d.getRelationshipName()) &&
                d.getReferenceTo() != null &&
                d.getReferenceTo().size() == 1
            ) {
                rels.add(
                    new Map<String, Object>{
                        'name' => d.getRelationshipName(),
                        'label' => d.getLabel(),
                        'object' => String.valueOf(d.getReferenceTo()[0])
                    }
                );
            }
        }
        return new Map<String, Object>{
            'fields' => fields,
            'relationships' => rels
        };
    }

    // ------------------------------------------------------------- internals

    private static Schema.SObjectType hop(
        Schema.SObjectType source,
        String relationshipName
    ) {
        for (
            Schema.SObjectField f : source.getDescribe().fields.getMap().values()
        ) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (
                d.getType() == Schema.DisplayType.REFERENCE &&
                relationshipName.equalsIgnoreCase(d.getRelationshipName()) &&
                d.getReferenceTo() != null &&
                d.getReferenceTo().size() == 1
            ) {
                return d.getReferenceTo()[0];
            }
        }
        return null;
    }

    private static List<String> picklistOf(Schema.DescribeFieldResult d) {
        List<String> out = new List<String>();
        if (
            d.getType() == Schema.DisplayType.PICKLIST ||
            d.getType() == Schema.DisplayType.MULTIPICKLIST
        ) {
            for (Schema.PicklistEntry e : d.getPicklistValues()) {
                if (e.isActive()) {
                    out.add(e.getValue());
                }
            }
        }
        return out;
    }

    /** The element's config, straight from the active published version. */
    @TestVisible
    private static Map<String, Object> publishedConfig(
        Id formId,
        Id versionId,
        String elementId
    ) {
        if (formId == null || versionId == null || String.isBlank(elementId)) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        List<Form_Version__c> versions = [
            SELECT Id, Spec_JSON__c
            FROM Form_Version__c
            WHERE
                Id = :versionId
                AND Form__c = :formId
                AND Is_Active__c = TRUE
                AND Form__r.Status__c = 'Published'
            LIMIT 1
        ];
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            versions[0].Spec_JSON__c
        );
        Map<String, Object> cfg = findLookupConfig(spec, elementId);
        if (cfg == null) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        return cfg;
    }

    private static Map<String, Object> findLookupConfig(
        Map<String, Object> spec,
        String elementId
    ) {
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null) {
                    continue;
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null || elementId != (String) el.get('id')) {
                        continue;
                    }
                    return asMap(el.get('lookupConfig'));
                }
            }
        }
        return null;
    }

    private static Map<String, Object> answersOf(String payload) {
        if (String.isBlank(payload)) {
            return new Map<String, Object>();
        }
        try {
            Object parsed = JSON.deserializeUntyped(payload);
            Map<String, Object> m = asMap(parsed);
            return m == null ? new Map<String, Object>() : m;
        } catch (Exception e) {
            return new Map<String, Object>();
        }
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
