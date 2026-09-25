@IsTest
private class FinalAutofillRulesTest {
    private static Map<String, Object> field(String inputType) {
        return new Map<String, Object>{
            'id' => 'el_x',
            'type' => 'field',
            'config' => inputType == null
                ? new Map<String, Object>()
                : new Map<String, Object>{ 'inputType' => inputType }
        };
    }

    @IsTest
    static void everyPairingThatPublishedBeforeStillFits() {
        // Legacy: any of the five text-like sources into any text-like
        // destination (text, textarea, email, phone, url, or no inputType).
        List<Schema.DisplayType> sources = new List<Schema.DisplayType>{
            Schema.DisplayType.STRING,
            Schema.DisplayType.TEXTAREA,
            Schema.DisplayType.EMAIL,
            Schema.DisplayType.PHONE,
            Schema.DisplayType.URL
        };
        List<String> inputTypes = new List<String>{
            null,
            'text',
            'textarea',
            'email',
            'phone',
            'url'
        };
        for (Schema.DisplayType t : sources) {
            for (String inputType : inputTypes) {
                String answerType = FinalAutofillRules.destinationAnswerType(
                    field(inputType)
                );
                Assert.isNotNull(answerType, 'destination ' + inputType);
                Assert.isTrue(
                    FinalAutofillRules.fits(t, answerType),
                    t + ' into ' + inputType
                );
            }
        }
    }

    @IsTest
    static void newRowsFillNumbersDatesAndChoices() {
        Assert.isTrue(
            FinalAutofillRules.fits(Schema.DisplayType.CURRENCY, 'Number')
        );
        Assert.isTrue(
            FinalAutofillRules.fits(Schema.DisplayType.DOUBLE, 'Text')
        );
        Assert.isTrue(FinalAutofillRules.fits(Schema.DisplayType.DATE, 'Date'));
        Assert.isTrue(
            FinalAutofillRules.fits(Schema.DisplayType.DATETIME, 'Date')
        );
        Assert.isTrue(
            FinalAutofillRules.fits(Schema.DisplayType.PICKLIST, 'Choice')
        );
        // what doesn't fit
        Assert.isFalse(
            FinalAutofillRules.fits(Schema.DisplayType.STRING, 'Number')
        );
        Assert.isFalse(
            FinalAutofillRules.fits(Schema.DisplayType.DATE, 'Text')
        );
        Assert.isFalse(
            FinalAutofillRules.fits(Schema.DisplayType.BOOLEAN, 'Text')
        );
        Assert.isFalse(
            FinalAutofillRules.fits(Schema.DisplayType.MULTIPICKLIST, 'Choice')
        );
    }

    @IsTest
    static void destinationsAreInputsOfAFillableType() {
        Assert.areEqual(
            'Number',
            FinalAutofillRules.destinationAnswerType(field('number'))
        );
        Assert.areEqual(
            'Date',
            FinalAutofillRules.destinationAnswerType(field('date'))
        );
        Map<String, Object> single = field('picklist');
        ((Map<String, Object>) single.get('config'))
            .put('renderAs', 'Dropdown');
        Assert.areEqual(
            'Choice',
            FinalAutofillRules.destinationAnswerType(single)
        );
        // several choices, a checkbox and a rating widget are not destinations
        Map<String, Object> multi = field('picklist');
        ((Map<String, Object>) multi.get('config'))
            .put('renderAs', 'Checkbox_Group');
        Assert.isNull(FinalAutofillRules.destinationAnswerType(multi));
        Assert.isNull(
            FinalAutofillRules.destinationAnswerType(field('checkbox'))
        );
        Assert.isNull(
            FinalAutofillRules.destinationAnswerType(
                new Map<String, Object>{ 'id' => 'el_n', 'type' => 'nps' }
            )
        );
    }

    @IsTest
    static void supportedSourcesSkipRichText() {
        Schema.DescribeFieldResult name = Account.Name.getDescribe();
        Schema.DescribeFieldResult industry = Account.Industry.getDescribe();
        Schema.DescribeFieldResult active = User.IsActive.getDescribe();
        Assert.isTrue(FinalAutofillRules.isSupportedSource(name));
        Assert.isTrue(FinalAutofillRules.isSupportedSource(industry));
        Assert.isFalse(FinalAutofillRules.isSupportedSource(active));
        Assert.isFalse(FinalAutofillRules.isSupportedSource(null));
    }

    @IsTest
    static void theBrowserGetsTheSameTable() {
        Map<String, List<String>> table = FinalAutofillRules.fitsTable();
        Assert.areEqual(
            new List<String>{ 'Number', 'Text' },
            table.get('currency')
        );
        Assert.areEqual(new List<String>{ 'Date' }, table.get('date'));
        Assert.isFalse(table.containsKey('boolean'));
    }

    @IsTest
    static void richTextStillReadsButIsNotOffered() {
        Schema.DescribeFieldResult rich = null;
        for (
            Schema.SObjectField f : Schema.getGlobalDescribe()
                .get('Account')
                .getDescribe()
                .fields.getMap()
                .values()
        ) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (
                d.getType() == Schema.DisplayType.TEXTAREA &&
                d.isHtmlFormatted()
            ) {
                rich = d;
                break;
            }
        }
        if (rich == null) {
            return; // no rich text on Account in this org
        }
        Assert.isTrue(FinalAutofillRules.isReadableSource(rich));
        Assert.isFalse(FinalAutofillRules.isSupportedSource(rich));
    }

    @IsTest
    static void lookupsAndCheckboxesAreNeverDestinations() {
        Assert.isNull(
            FinalAutofillRules.destinationAnswerType(field('reference'))
        );
        Assert.isNull(
            FinalAutofillRules.destinationAnswerType(field('lookup'))
        );
        Assert.isNull(
            FinalAutofillRules.destinationAnswerType(field('checkbox'))
        );
        Assert.isNull(FinalAutofillRules.destinationAnswerType(field('file')));
    }

    @IsTest
    static void theInRailEditorOffersOnlyWhatFitsText() {
        Assert.isTrue(FinalAutofillRules.fillsText(Account.Name.getDescribe()));
        Assert.isTrue(
            FinalAutofillRules.fillsText(Account.AnnualRevenue.getDescribe())
        );
        Assert.isFalse(
            FinalAutofillRules.fillsText(Account.CreatedDate.getDescribe())
        );
    }
}
