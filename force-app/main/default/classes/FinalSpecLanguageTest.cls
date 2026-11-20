@IsTest
private class FinalSpecLanguageTest {
    private static Map<String, Object> spec() {
        return (Map<String, Object>) JSON.deserializeUntyped(
            '{"languages":{"default":"en_US","available":["en_US","fr","de_DE"]},' +
                '"translations":{"fr":{"closed.message":"Ferme."},' +
                '"de_DE":{"closed.message":"Geschlossen."}}}'
        );
    }

    @IsTest
    static void pickExactMatchWins() {
        Assert.areEqual(
            'de_DE',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'de-DE', 'fr' })
        );
        Assert.areEqual(
            'fr',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'fr' })
        );
    }

    @IsTest
    static void pickFallsBackToBaseLanguage() {
        Assert.areEqual(
            'fr',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'fr-CA' })
        );
        // an offered regional variant serves its base language
        Assert.areEqual(
            'de_DE',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'de' })
        );
    }

    @IsTest
    static void pickSkipsUnavailableThenUsesDefault() {
        Assert.areEqual(
            'fr',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'ja', 'fr' })
        );
        Assert.areEqual(
            'en_US',
            FinalSpecLanguage.pick(spec(), new List<String>{ 'ja', 'xx!' })
        );
        Assert.areEqual('en_US', FinalSpecLanguage.pick(spec(), null));
    }

    @IsTest
    static void pickIsNullWithoutALanguagesBlock() {
        Assert.isNull(
            FinalSpecLanguage.pick(
                new Map<String, Object>{ 'specVersion' => 1 },
                new List<String>{ 'fr' }
            )
        );
        Assert.isNull(FinalSpecLanguage.pick(null, new List<String>{ 'fr' }));
    }

    @IsTest
    static void textUsesExactThenBaseThenFallback() {
        Map<String, Object> s = spec();
        Assert.areEqual(
            'Ferme.',
            FinalSpecLanguage.text(s, 'fr_CA', 'closed.message', 'Closed')
        );
        Assert.areEqual(
            'Geschlossen.',
            FinalSpecLanguage.text(s, 'de_DE', 'closed.message', 'Closed')
        );
        Assert.areEqual(
            'Closed',
            FinalSpecLanguage.text(s, 'ja', 'closed.message', 'Closed')
        );
        Assert.areEqual(
            'Closed',
            FinalSpecLanguage.text(s, 'fr', 'done.title', 'Closed')
        );
        Assert.areEqual(
            'Closed',
            FinalSpecLanguage.text(s, null, 'closed.message', 'Closed')
        );
    }
}
