@IsTest
private class FinalThemeControllerTest {
    private static final String THEME_JSON = '{"palette":{"accent":"#7c2d9c","pageBg":"#f4f7f5"},"typography":"system","radius":"soft"}';

    @IsTest
    static void saveListGetRoundTrip() {
        Test.startTest();
        Id themeId = FinalThemeController.saveCustomTheme(
            null,
            'Brand Purple',
            'nordic',
            THEME_JSON
        );
        Test.stopTest();

        List<FinalThemeController.ThemeSummary> all = FinalThemeController.listCustomThemes();
        System.assertEquals(1, all.size());
        System.assertEquals('Brand Purple', all[0].name);
        System.assertEquals('nordic', all[0].baseTheme);
        System.assertEquals(
            THEME_JSON,
            FinalThemeController.getCustomTheme(themeId),
            'JSON round-trips untouched'
        );
    }

    @IsTest
    static void updateExistingKeepsSameRecord() {
        Id themeId = FinalThemeController.saveCustomTheme(
            null,
            'V1',
            null,
            THEME_JSON
        );
        Id again = FinalThemeController.saveCustomTheme(
            themeId,
            'V2 renamed',
            null,
            THEME_JSON
        );
        System.assertEquals(themeId, again, 'Update, not clone');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Theme_Definition__c]
        );
        System.assertEquals(
            'V2 renamed',
            [SELECT Name FROM Theme_Definition__c LIMIT 1].Name
        );
    }

    @IsTest
    static void rejectsBadInput() {
        for (List<String> bad : new List<List<String>>{
            new List<String>{ '', THEME_JSON },
            new List<String>{ 'ok', '' },
            new List<String>{ 'ok', 'not json' },
            new List<String>{ 'ok', '[1,2,3]' }
        }) {
            try {
                FinalThemeController.saveCustomTheme(null, bad[0], null, bad[1]);
                System.assert(false, 'Expected exception for ' + bad);
            } catch (AuraHandledException e) {
                System.assert(true);
            }
        }
        System.assertEquals(0, [SELECT COUNT() FROM Theme_Definition__c]);
    }

    @IsTest
    static void getMissingThrows() {
        Id themeId = FinalThemeController.saveCustomTheme(
            null,
            'Doomed',
            null,
            THEME_JSON
        );
        FinalThemeController.deleteCustomTheme(themeId);
        try {
            FinalThemeController.getCustomTheme(themeId);
            System.assert(false, 'Expected exception');
        } catch (AuraHandledException e) {
            System.assert(true);
        }
        FinalThemeController.deleteCustomTheme(null); // no-op, no throw
    }
}
