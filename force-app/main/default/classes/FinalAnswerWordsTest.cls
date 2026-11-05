/**
 * FinalAnswerWords must say what c/finalAnswerText says (IMPL_PLAN_FORM_PDF
 * §6.4). These are the same cases finalSubmissionReader's Jest tests pin.
 */
@IsTest
private class FinalAnswerWordsTest {
    private static Map<String, Object> el(String src) {
        return (Map<String, Object>) JSON.deserializeUntyped(src);
    }

    private static Form_Submission_Answer__c row(String type) {
        return new Form_Submission_Answer__c(Answer_Type__c = type);
    }

    @IsTest
    static void scalesReadAsOutOf() {
        Form_Submission_Answer__c a = row('Number');
        a.Numeric_Value__c = 0;
        Assert.areEqual(
            '0 out of 10',
            FinalAnswerWords.storedLines(a, el('{"type":"nps"}'))[0]
        );
        a.Numeric_Value__c = 4;
        Assert.areEqual(
            '4 out of 5',
            FinalAnswerWords.storedLines(a, el('{"type":"rating"}'))[0]
        );
        Assert.areEqual(
            '4 out of 7',
            FinalAnswerWords.storedLines(
                a,
                el('{"type":"scale","config":{"size":7}}')
            )[0]
        );
    }

    @IsTest
    static void likertAndMatrixUseTheirPointLabels() {
        Form_Submission_Answer__c a = row('Number');
        a.Numeric_Value__c = 4;
        Assert.areEqual(
            'Agree',
            FinalAnswerWords.storedLines(a, el('{"type":"likert"}'))[0]
        );
        Assert.areEqual(
            'Strongly agree',
            FinalAnswerWords.matrixWord(el('{"type":"matrix"}'), a)
        );
        a.Numeric_Value__c = 2;
        Assert.areEqual(
            'Meh',
            FinalAnswerWords.matrixWord(
                el(
                    '{"type":"matrix","config":{"points":[{"value":2,"label":"Meh"}]}}'
                ),
                a
            )
        );
    }

    @IsTest
    static void rankingIsNumberedInChosenOrder() {
        Form_Submission_Answer__c a = row('Options');
        a.Selected_Options_JSON__c = '["t","s"]';
        List<String> lines = FinalAnswerWords.storedLines(
            a,
            el(
                '{"type":"ranking","config":{"options":[{"value":"s","label":"Salary"},{"value":"t","label":"Team"}]}}'
            )
        );
        Assert.areEqual(new List<String>{ '1. Team', '2. Salary' }, lines);
    }

    @IsTest
    static void choicesPrintLabelsNeverValues() {
        Map<String, Object> q = el(
            '{"type":"field","config":{"inputType":"picklist","renderAs":"Radio_Buttons","options":[{"value":"vip","label":"Priority customer"}]}}'
        );
        Form_Submission_Answer__c a = row('Choice');
        a.Text_Value__c = 'vip';
        Assert.areEqual(
            'Priority customer',
            FinalAnswerWords.storedLines(a, q)[0]
        );
        Form_Submission_Answer__c multi = row('Options');
        multi.Selected_Options_JSON__c = '["vip","gone"]';
        Assert.areEqual(
            'Priority customer, gone',
            FinalAnswerWords.storedLines(multi, q)[0]
        );
    }

    @IsTest
    static void defaultPicklistUsesSchemaOptionsThenRender() {
        Form_Submission_Answer__c a = row('Choice');
        a.Text_Value__c = 'H';
        Assert.areEqual(
            'Hot',
            FinalAnswerWords.storedLines(
                a,
                el(
                    '{"type":"field","config":{"inputType":"picklist","schemaOptions":[{"value":"H","label":"Hot"}]}}'
                )
            )[0]
        );
        Assert.areEqual(
            'Hot',
            FinalAnswerWords.storedLines(
                a,
                el(
                    '{"type":"field","config":{"inputType":"picklist"},"render":{"options":[{"value":"H","label":"Hot"}]}}'
                )
            )[0]
        );
    }

    @IsTest
    static void booleansYesNoAndConsent() {
        Form_Submission_Answer__c a = row('Boolean');
        a.Boolean_Value__c = true;
        Assert.areEqual(
            'Agreed',
            FinalAnswerWords.storedLines(a, el('{"type":"consent"}'))[0]
        );
        Assert.areEqual(
            'Yes, please',
            FinalAnswerWords.storedLines(
                a,
                el('{"type":"yesNo","config":{"yesLabel":"Yes, please"}}')
            )[0]
        );
        Assert.areEqual(
            'Yes',
            FinalAnswerWords.storedLines(
                a,
                el('{"type":"field","config":{"inputType":"checkbox"}}')
            )[0]
        );
    }

    @IsTest
    static void datesAreWordsAndTextKeepsLines() {
        Form_Submission_Answer__c d = row('Date');
        d.Date_Value__c = Date.newInstance(2026, 11, 2);
        String word = FinalAnswerWords.storedLines(
            d,
            el('{"type":"field"}')
        )[0];
        Assert.isTrue(
            word.contains('2026') && word.contains('2') && !word.contains('-'),
            word
        );
        Form_Submission_Answer__c t = row('Text');
        t.Text_Value__c = 'one\ntwo';
        Assert.areEqual(
            new List<String>{ 'one', 'two' },
            FinalAnswerWords.storedLines(t, el('{"type":"field"}'))
        );
    }

    @IsTest
    static void emptyAndOrphanAnswers() {
        Assert.areEqual(
            0,
            FinalAnswerWords.storedLines(row('Text'), el('{"type":"field"}'))
                .size()
        );
        Form_Submission_Answer__c n = row('Number');
        n.Numeric_Value__c = 12.50;
        Assert.areEqual(
            '12.5',
            FinalAnswerWords.storedLines(n, null)[0],
            'orphans read plainly'
        );
        Form_Submission_Answer__c bad = row('Number');
        bad.Value_Unparsed__c = true;
        bad.Text_Value__c = 'twelve';
        Assert.areEqual(
            'twelve',
            FinalAnswerWords.storedLines(bad, el('{"type":"nps"}'))[0],
            'unparsed stays raw'
        );
    }
}
