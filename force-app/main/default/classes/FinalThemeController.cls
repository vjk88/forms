/**
 * FinalThemeController — custom theme (Theme_Definition__c) CRUD for the
 * rebuild's themeEditor + gallery (catalog §6).
 *
 * Storage split: built-ins hide in managed code (finalThemeCatalog); custom
 * themes are records. Both carry the SAME theme-property JSON shape — the
 * engine doesn't know the difference. Internal builder surface only
 * (with sharing + USER_MODE); the published render never needs this class
 * (resolve-at-publish).
 */
public with sharing class FinalThemeController {
    private static final Integer MAX_JSON = 131072;

    public class ThemeSummary {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String baseTheme;
    }

    // not cacheable: the editor saves then immediately re-lists/re-fetches
    @AuraEnabled
    public static List<ThemeSummary> listCustomThemes() {
        List<ThemeSummary> out = new List<ThemeSummary>();
        for (Theme_Definition__c t : [
            SELECT Id, Name, Base_Theme__c
            FROM Theme_Definition__c
            WITH USER_MODE
            ORDER BY Name
            LIMIT 200
        ]) {
            ThemeSummary s = new ThemeSummary();
            s.id = t.Id;
            s.name = t.Name;
            s.baseTheme = t.Base_Theme__c;
            out.add(s);
        }
        return out;
    }

    /** The theme-property JSON for one custom theme (draft-path resolution). */
    @AuraEnabled
    public static String getCustomTheme(Id themeId) {
        if (themeId == null) {
            throw new AuraHandledException('A theme Id is required.');
        }
        List<Theme_Definition__c> rows = [
            SELECT Theme_JSON__c
            FROM Theme_Definition__c
            WHERE Id = :themeId
            WITH USER_MODE
            LIMIT 1
        ];
        if (rows.isEmpty() || String.isBlank(rows[0].Theme_JSON__c)) {
            throw new AuraHandledException('This theme could not be loaded.');
        }
        return rows[0].Theme_JSON__c;
    }

    /**
     * Save (themeId null → create; else update = the blast-radius path) or
     * Save-As-New (pass null id with a new name — the frictionless path).
     */
    @AuraEnabled
    public static Id saveCustomTheme(
        Id themeId,
        String name,
        String baseTheme,
        String themeJson
    ) {
        if (String.isBlank(name)) {
            throw new AuraHandledException('A theme name is required.');
        }
        if (String.isBlank(themeJson) || themeJson.length() > MAX_JSON) {
            throw new AuraHandledException('The theme definition is invalid.');
        }
        try {
            Object parsed = JSON.deserializeUntyped(themeJson);
            if (!(parsed instanceof Map<String, Object>)) {
                throw new AuraHandledException(
                    'The theme definition must be an object.'
                );
            }
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(
                'The theme definition is not valid JSON.'
            );
        }
        try {
            Theme_Definition__c rec = new Theme_Definition__c(
                Id = themeId,
                Name = name.trim().left(80),
                Base_Theme__c = String.isBlank(baseTheme)
                    ? null
                    : baseTheme.left(80),
                Theme_JSON__c = themeJson
            );
            upsert as user rec;
            return rec.Id;
        } catch (Exception e) {
            throw new AuraHandledException(
                'The theme could not be saved: ' + e.getMessage()
            );
        }
    }

    @AuraEnabled
    public static void deleteCustomTheme(Id themeId) {
        if (themeId == null) {
            return;
        }
        try {
            delete as user new Theme_Definition__c(Id = themeId);
        } catch (Exception e) {
            throw new AuraHandledException(
                'The theme could not be deleted: ' + e.getMessage()
            );
        }
    }
}
