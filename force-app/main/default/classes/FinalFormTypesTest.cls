/**
 * The point of FinalFormTypes is that an unknown type is REFUSED rather than
 * quietly treated as a Form, so most of these tests are about what it will not
 * answer. The capability rows mirror FREEFORM_SPEC §4.1; if a row changes
 * there, one of these fails.
 */
@IsTest
private class FinalFormTypesTest {
    @IsTest
    static void translatesBothVocabularies() {
        Assert.areEqual(
            'freeform',
            FinalFormTypes.fromPicklist('Freeform'),
            'picklist to spec'
        );
        Assert.areEqual(
            'survey',
            FinalFormTypes.fromPicklist('survey'),
            'case does not matter'
        );
        Assert.areEqual(
            'Form',
            FinalFormTypes.toPicklist('form'),
            'spec to picklist'
        );
        Assert.areEqual(
            'Freeform',
            FinalFormTypes.label('freeform'),
            'human label'
        );
    }

    @IsTest
    static void refusesAnUnknownPicklistValueInsteadOfGuessingForm() {
        try {
            FinalFormTypes.fromPicklist('Questionnaire');
            Assert.fail('an unrecognized type must not resolve');
        } catch (FinalFormTypes.UnknownFormTypeException e) {
            Assert.isTrue(
                e.getMessage().contains('Questionnaire'),
                'names the value it refused'
            );
        }
    }

    @IsTest
    static void refusesBlankAndNull() {
        for (String candidate : new List<String>{ null, '', '   ' }) {
            try {
                FinalFormTypes.fromPicklist(candidate);
                Assert.fail('blank must not resolve to Form');
            } catch (FinalFormTypes.UnknownFormTypeException e) {
                Assert.isNotNull(e.getMessage(), 'refused');
            }
        }
    }

    @IsTest
    static void readsTheTypeOutOfAParsedSpec() {
        Map<String, Object> spec = new Map<String, Object>{
            'form' => new Map<String, Object>{ 'type' => 'freeform' }
        };
        Assert.areEqual('freeform', FinalFormTypes.fromSpec(spec), 'from spec');

        // a spec that does not say, or says something we do not know
        for (
            Map<String, Object> bad : new List<Map<String, Object>>{
                new Map<String, Object>{},
                new Map<String, Object>{ 'form' => new Map<String, Object>{} },
                new Map<String, Object>{
                    'form' => new Map<String, Object>{ 'type' => 'quiz' }
                }
            }
        ) {
            try {
                FinalFormTypes.fromSpec(bad);
                Assert.fail('a spec with no known type must be refused');
            } catch (FinalFormTypes.UnknownFormTypeException e) {
                Assert.isNotNull(e.getMessage(), 'refused');
            }
        }
    }

    @IsTest
    static void capabilitiesMatchTheSpecTable() {
        // Form: bound to an object, no answer store, no questions
        Assert.isTrue(FinalFormTypes.needsObject('form'), 'form needs object');
        Assert.isFalse(
            FinalFormTypes.usesAnswerStore('form'),
            'form writes a record'
        );
        Assert.isFalse(
            FinalFormTypes.usesQuestions('form'),
            'form binds fields'
        );

        // Survey: answer store, questions, analytics, context record, locked layout
        Assert.isFalse(
            FinalFormTypes.needsObject('survey'),
            'survey object is optional'
        );
        Assert.isTrue(
            FinalFormTypes.usesAnalytics('survey'),
            'survey has Topics'
        );
        Assert.isTrue(
            FinalFormTypes.usesContextRecord('survey'),
            'survey has a connected record'
        );
        Assert.isTrue(
            FinalFormTypes.layoutLocked('survey'),
            'survey is one at a time'
        );

        // Freeform: survey storage WITHOUT survey analytics or context record
        Assert.isFalse(
            FinalFormTypes.needsObject('freeform'),
            'freeform never demands an object'
        );
        Assert.isTrue(
            FinalFormTypes.usesAnswerStore('freeform'),
            'freeform stores answers'
        );
        Assert.isTrue(
            FinalFormTypes.usesQuestions('freeform'),
            'freeform authors questions'
        );
        Assert.isFalse(
            FinalFormTypes.usesAnalytics('freeform'),
            'freeform has no Topics'
        );
        Assert.isFalse(
            FinalFormTypes.usesContextRecord('freeform'),
            'freeform has no connected record'
        );
        Assert.isFalse(
            FinalFormTypes.layoutLocked('freeform'),
            'freeform picks any layout'
        );
        // Autofill is a property of the TYPE; F1 only hides the tab (D7).
        Assert.isTrue(
            FinalFormTypes.usesAutofill('freeform'),
            'freeform gets Autofill in F2'
        );
    }

    @IsTest
    static void capabilityOnAnUnknownTypeThrows() {
        try {
            FinalFormTypes.usesQuestions('quiz');
            Assert.fail(
                'a capability question about an unknown type has no answer'
            );
        } catch (FinalFormTypes.UnknownFormTypeException e) {
            Assert.isNotNull(e.getMessage(), 'refused');
        }
    }

    @IsTest
    static void publishesEveryKnownValueForAllowLists() {
        Set<String> values = FinalFormTypes.specValues();
        Assert.areEqual(3, values.size(), 'three types');
        Assert.isTrue(values.contains('freeform'), 'includes freeform');
        Assert.isTrue(FinalFormTypes.isKnown('survey'), 'known');
        Assert.isFalse(FinalFormTypes.isKnown('quiz'), 'unknown');
        Assert.isFalse(FinalFormTypes.isKnown(null), 'null is not a type');

        // the caller must not be able to shrink the real table
        values.remove('form');
        Assert.areEqual(
            3,
            FinalFormTypes.specValues().size(),
            'the returned set is a copy'
        );
    }

    @IsTest
    static void aSpecWithNoTypeAtAllFallsBackForSubmit() {
        // Specs published before the type was written into the spec carry no
        // form.type at all. Submit read that absence as 'not a survey' = Form,
        // and every such form must keep working.
        Map<String, Object> legacy = new Map<String, Object>{
            'form' => new Map<String, Object>{ 'targetObject' => 'Contact' }
        };
        Assert.areEqual(
            'form',
            FinalFormTypes.fromSpecOrDefault(legacy, FinalFormTypes.FORM),
            'silence means legacy Form'
        );
        Assert.areEqual(
            'form',
            FinalFormTypes.fromSpecOrDefault(
                new Map<String, Object>(),
                FinalFormTypes.FORM
            ),
            'no form block either'
        );
        Assert.areEqual(
            'freeform',
            FinalFormTypes.fromSpecOrDefault(
                new Map<String, Object>{
                    'form' => new Map<String, Object>{ 'type' => 'freeform' }
                },
                FinalFormTypes.FORM
            ),
            'a stated type still wins'
        );
        // garbage is still garbage - the fallback is for SILENCE only
        try {
            FinalFormTypes.fromSpecOrDefault(
                new Map<String, Object>{
                    'form' => new Map<String, Object>{ 'type' => 'quiz' }
                },
                FinalFormTypes.FORM
            );
            Assert.fail('an unrecognized type must not fall back');
        } catch (FinalFormTypes.UnknownFormTypeException e) {
            Assert.isNotNull(e.getMessage(), 'refused');
        }
    }
}
