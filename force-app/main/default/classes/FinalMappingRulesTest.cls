@IsTest
private class FinalMappingRulesTest {
    @IsTest
    static void compatibilityFollowsTheTable() {
        Assert.isTrue(
            FinalMappingRules.isCompatible('Email', Schema.DisplayType.EMAIL)
        );
        Assert.isTrue(
            FinalMappingRules.isCompatible(
                'Choice',
                Schema.DisplayType.PICKLIST
            )
        );
        Assert.isFalse(
            FinalMappingRules.isCompatible('Text', Schema.DisplayType.DOUBLE),
            'text never goes into a number'
        );
        Assert.isFalse(
            FinalMappingRules.isCompatible(
                'Options',
                Schema.DisplayType.STRING
            ),
            'several choices only go into a multi-select picklist'
        );
        Assert.isFalse(
            FinalMappingRules.isCompatible(null, Schema.DisplayType.STRING)
        );
    }

    @IsTest
    static void coerceConvertsOrExplains() {
        Schema.DescribeFieldResult title = Contact.Title.getDescribe();
        Assert.areEqual('CEO', FinalMappingRules.coerce('CEO', title));

        String tooLong = 'x'.repeat(title.getLength() + 1);
        try {
            FinalMappingRules.coerce(tooLong, title);
            Assert.fail('a value longer than the field must be refused');
        } catch (FinalMappingRules.MappingValueException e) {
            Assert.isTrue(e.getMessage().contains('Title'), e.getMessage());
        }

        Schema.DescribeFieldResult birthdate = Contact.Birthdate.getDescribe();
        Assert.areEqual(
            Date.newInstance(1990, 4, 2),
            FinalMappingRules.coerce('1990-04-02', birthdate)
        );
        try {
            FinalMappingRules.coerce('not a date', birthdate);
            Assert.fail('a non-date must be refused');
        } catch (FinalMappingRules.MappingValueException e) {
            Assert.isTrue(e.getMessage().contains('Birthdate'), e.getMessage());
        }
    }

    @IsTest
    static void valueOfTreatsBlankAndUnparsedAsAbsent() {
        Assert.isNull(
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(Answer_Type__c = 'Text')
            )
        );
        Assert.isNull(
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Number',
                    Value_Unparsed__c = true,
                    Text_Value__c = 'twelve'
                )
            ),
            'an unparsed answer is not a value'
        );
        Assert.areEqual(
            12,
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Number',
                    Numeric_Value__c = 12
                )
            )
        );
    }

    @IsTest
    static void aChoiceConvertsToWhereverItIsGoing() {
        // The bug this function exists to prevent: writing the label and
        // searching the value, so every submission makes another record.
        Map<String, Object> question = new Map<String, Object>{
            'id' => 'el_tier',
            'type' => 'field',
            'label' => 'Tier',
            'config' => new Map<String, Object>{
                'inputType' => 'picklist',
                'options' => new List<Object>{
                    new Map<String, Object>{
                        'value' => 'vip',
                        'label' => 'Priority customer'
                    }
                }
            }
        };
        Form_Submission_Answer__c a = new Form_Submission_Answer__c(
            Element_Key__c = 'el_tier',
            Answer_Type__c = 'Choice',
            Text_Value__c = 'vip'
        );

        Assert.areEqual(
            'Priority customer',
            FinalMappingRules.answerValue(
                a,
                question,
                Contact.Title.getDescribe()
            ),
            'into a text field, the label'
        );
        Assert.areEqual(
            'vip',
            FinalMappingRules.answerValue(
                a,
                question,
                Contact.LeadSource.getDescribe()
            ),
            'into a picklist, the stored value'
        );
    }

    @IsTest
    static void answerValueKeepsSeveralChoicesAsAList() {
        Form_Submission_Answer__c a = new Form_Submission_Answer__c(
            Answer_Type__c = 'Options',
            Selected_Options_JSON__c = '["a","b"]'
        );
        Object v = FinalMappingRules.answerValue(
            a,
            new Map<String, Object>(),
            Contact.LeadSource.getDescribe()
        );
        Assert.isTrue(
            v instanceof List<Object>,
            'an operator that wants a list gets one'
        );
    }

    @IsTest
    static void answerValueIsNullWhenTheAnswerIsAbsent() {
        Assert.isNull(
            FinalMappingRules.answerValue(
                null,
                null,
                Contact.Title.getDescribe()
            )
        );
        Assert.isNull(
            FinalMappingRules.answerValue(
                new Form_Submission_Answer__c(Answer_Type__c = 'Text'),
                null,
                Contact.Title.getDescribe()
            ),
            'blank is absent; what that means is the caller’s business'
        );
    }

    @IsTest
    static void fieldAtWalksAPathWrittenEitherWay() {
        // A hop can be the field or the relationship. Both must land on the
        // same field, or a filter passes publish and then converts nothing.
        Assert.areEqual(
            'Type',
            FinalMappingRules.fieldAt('Contact', 'Account.Type').getName()
        );
        Assert.areEqual(
            'Type',
            FinalMappingRules.fieldAt('Contact', 'AccountId.Type').getName()
        );
        Assert.areEqual(
            'LastName',
            FinalMappingRules.fieldAt('Contact', 'ReportsTo.LastName')
                .getName(),
            'a relationship name, not a field name'
        );
        Assert.areEqual(
            'LastName',
            FinalMappingRules.fieldAt('Contact', 'LastName').getName()
        );
        Assert.isNull(FinalMappingRules.fieldAt('Contact', 'Nope.Nope'));
    }

    @IsTest
    static void skippableMeansNotAlwaysRequiredOrConditional() {
        Map<String, Object> optional = FinalMappingTestData.question(
            'el_opt',
            'text',
            'Optional'
        );
        optional.put('required', false);
        Map<String, Object> hidden = FinalMappingTestData.question(
            'el_hidden',
            'text',
            'Hidden sometimes'
        );
        hidden.put(
            'visibility',
            new Map<String, Object>{
                'rules' => new List<Object>{ new Map<String, Object>() }
            }
        );
        Map<String, Object> spec = FinalMappingTestData.spec(
            new List<Object>{
                FinalMappingTestData.question('el_req', 'text', 'Required'),
                optional,
                hidden
            },
            null
        );

        Set<String> skippable = FinalMappingRules.skippableElementIds(spec);

        Assert.isFalse(skippable.contains('el_req'));
        Assert.isTrue(skippable.contains('el_opt'));
        Assert.isTrue(skippable.contains('el_hidden'), 'required but hideable');
    }

    @IsTest
    static void actionsOfIsEmptyWithoutAMapping() {
        Assert.areEqual(
            0,
            FinalMappingRules.actionsOf(
                    FinalMappingTestData.spec(new List<Object>(), null)
                )
                .size()
        );
    }

    @IsTest
    static void coerceHandlesEachKindOfField() {
        Assert.areEqual(
            12.5,
            FinalMappingRules.coerce(
                '12.5',
                Account.AnnualRevenue.getDescribe()
            )
        );
        Assert.areEqual(
            40,
            FinalMappingRules.coerce(
                '40',
                Account.NumberOfEmployees.getDescribe()
            )
        );
        Assert.areEqual(
            true,
            FinalMappingRules.coerce('TRUE', Contact.DoNotCall.getDescribe())
        );
        Assert.areEqual(
            false,
            FinalMappingRules.coerce(false, Contact.DoNotCall.getDescribe())
        );
        Datetime dt = (Datetime) FinalMappingRules.coerce(
            '2026-09-22T10:00:00.000Z',
            Contact.LastCURequestDate.getDescribe()
        );
        Assert.areEqual(2026, dt.yearGmt());
        Assert.areEqual(
            'Web',
            FinalMappingRules.coerce('Web', Contact.LeadSource.getDescribe())
        );
        Object ref = FinalMappingRules.coerce(
            Account.SObjectType.getDescribe().getKeyPrefix() + '000000000001',
            Contact.AccountId.getDescribe()
        );
        Assert.isTrue(ref instanceof Id, 'a lookup gets an Id');
    }

    @IsTest
    static void coerceExplainsWhatDoesNotFit() {
        Map<Object, Schema.DescribeFieldResult> cases = new Map<Object, Schema.DescribeFieldResult>{
            'maybe' => Contact.DoNotCall.getDescribe(),
            'abc' => Account.AnnualRevenue.getDescribe(),
            'Not_A_Real_Lead_Source' => Contact.LeadSource.getDescribe(),
            'anything' => Contact.MailingAddress.getDescribe()
        };
        for (Object raw : cases.keySet()) {
            Schema.DescribeFieldResult fd = cases.get(raw);
            try {
                FinalMappingRules.coerce(raw, fd);
                Assert.fail(fd.getName() + ' took ' + raw);
            } catch (FinalMappingRules.MappingValueException e) {
                Assert.isTrue(
                    e.getMessage().contains(fd.getLabel()),
                    'names the field: ' + e.getMessage()
                );
            }
        }
    }

    @IsTest
    static void valueOfReadsEachStorageColumn() {
        Assert.areEqual(
            true,
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Boolean',
                    Boolean_Value__c = true
                )
            )
        );
        Date d = Date.newInstance(2026, 9, 22);
        Assert.areEqual(
            d,
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Date',
                    Date_Value__c = d
                )
            )
        );
        Datetime now = Datetime.now();
        Assert.areEqual(
            now,
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'DateTime',
                    DateTime_Value__c = now
                )
            )
        );
        Assert.isNull(
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Options',
                    Selected_Options_JSON__c = '[]'
                )
            ),
            'no choices is no answer'
        );
        Assert.isNull(
            FinalMappingRules.valueOf(
                new Form_Submission_Answer__c(Answer_Type__c = 'Options')
            )
        );
        Assert.isNull(FinalMappingRules.valueOf(null));
        Assert.isFalse(
            FinalMappingRules.isCompatible('Mystery', Schema.DisplayType.STRING)
        );
    }

    @IsTest
    static void labelsFallBackToTheValueNeverToBlank() {
        Map<String, Object> q = new Map<String, Object>{
            'config' => new Map<String, Object>{
                'options' => new List<Object>{
                    new Map<String, Object>{ 'value' => 'a', 'label' => '' },
                    new Map<String, Object>{ 'value' => 'b', 'label' => 'Bee' }
                }
            }
        };
        Assert.areEqual(
            'a',
            FinalMappingRules.optionLabel(q, 'a'),
            'blank label'
        );
        Assert.areEqual('Bee', FinalMappingRules.optionLabel(q, 'b'));
        Assert.areEqual(
            'zzz',
            FinalMappingRules.optionLabel(q, 'zzz'),
            'unknown value'
        );
        Assert.areEqual('x', FinalMappingRules.optionLabel(null, 'x'));
        Assert.areEqual(
            new List<String>{ 'a', 'b' },
            FinalMappingRules.optionValues(q)
        );

        Object labels = FinalMappingRules.answerValue(
            new Form_Submission_Answer__c(
                Answer_Type__c = 'Options',
                Selected_Options_JSON__c = '["b"]'
            ),
            q,
            Contact.Title.getDescribe()
        );
        Assert.areEqual(
            JSON.serialize(new List<String>{ 'Bee' }),
            JSON.serialize(labels),
            'several choices into text become their labels, still a list'
        );
    }

    @IsTest
    static void anUnparsedAnswerOnlyFitsText() {
        Form_Submission_Answer__c raw = new Form_Submission_Answer__c(
            Answer_Type__c = 'Number',
            Value_Unparsed__c = true,
            Text_Value__c = 'twelve-ish'
        );
        Assert.areEqual(
            'twelve-ish',
            FinalMappingRules.answerValue(
                raw,
                null,
                Contact.Title.getDescribe()
            )
        );
        Assert.isNull(
            FinalMappingRules.answerValue(
                raw,
                null,
                Account.AnnualRevenue.getDescribe()
            )
        );
    }
}
