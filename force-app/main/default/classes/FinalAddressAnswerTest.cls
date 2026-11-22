/**
 * FinalAddressAnswer (IMPL_PLAN_ADDRESS_INPUT, "The answer"): the one server
 * place that understands an Address answer.
 */
@IsTest
private class FinalAddressAnswerTest {
    private static Map<String, Object> full() {
        return new Map<String, Object>{
            'street' => '1 Main St',
            'city' => 'Springfield',
            'province' => 'Illinois',
            'provinceCode' => 'IL',
            'postalCode' => '62701',
            'country' => 'United States',
            'countryCode' => 'US'
        };
    }

    private static Map<String, Object> elOf(Object type, Object config) {
        return new Map<String, Object>{ 'type' => type, 'config' => config };
    }

    @IsTest
    static void isAddressNeedsFieldTypeAndAddressInput() {
        Assert.isTrue(
            FinalAddressAnswer.isAddress(
                elOf(
                    'field',
                    new Map<String, Object>{ 'inputType' => 'Address' }
                )
            )
        );
        Assert.isFalse(FinalAddressAnswer.isAddress(null));
        Assert.isFalse(FinalAddressAnswer.isAddress(new Map<String, Object>()));
        Assert.isFalse(
            FinalAddressAnswer.isAddress(
                elOf('field', new Map<String, Object>{ 'inputType' => 'text' })
            )
        );
        Assert.isFalse(
            FinalAddressAnswer.isAddress(
                elOf(
                    'rating',
                    new Map<String, Object>{ 'inputType' => 'address' }
                )
            )
        );
        Assert.isFalse(FinalAddressAnswer.isAddress(elOf('field', 'nope')));
        Assert.isFalse(
            FinalAddressAnswer.isAddress(
                elOf('field', new Map<String, Object>{ 'inputType' => 5 })
            )
        );
    }

    @IsTest
    static void cleanRefusesNonMapsAndBlankMaps() {
        Assert.isNull(FinalAddressAnswer.clean(null));
        Assert.isNull(FinalAddressAnswer.clean('1 Main St'));
        Assert.isNull(FinalAddressAnswer.clean(new List<Object>{ 'x' }));
        Assert.isNull(FinalAddressAnswer.clean(new Map<String, Object>()));
        Assert.isNull(
            FinalAddressAnswer.clean(
                new Map<String, Object>{
                    'street' => ' ',
                    'city' => '',
                    'latitude' => 10,
                    'longitude' => 10
                }
            ),
            'no text part, no address (coordinates alone do not count)'
        );
        Assert.isNull(
            FinalAddressAnswer.clean(
                new Map<String, Object>{ 'city' => 42, 'street' => true }
            ),
            'non-string text parts are dropped'
        );
    }

    @IsTest
    static void cleanKeepsOnlyKnownKeys() {
        Map<String, Object> raw = full();
        raw.put('evil', 'x');
        Map<String, Object> out = FinalAddressAnswer.clean(raw);
        Assert.areEqual(7, out.size());
        Assert.isFalse(out.containsKey('evil'));
        Assert.areEqual('IL', out.get('provinceCode'));
        Assert.areEqual('US', out.get('countryCode'));
    }

    @IsTest
    static void cleanStripsMarkupAndKeepsStreetLineBreaks() {
        Map<String, Object> out = FinalAddressAnswer.clean(
            new Map<String, Object>{
                'street' => '  <b>1 Main St</b>\r\n\n  Unit <i>4</i>  ',
                'city' => ' <i>Spring</i>field '
            }
        );
        Assert.areEqual('1 Main St\nUnit 4', out.get('street'));
        Assert.areEqual('Springfield', out.get('city'));
    }

    @IsTest
    static void cleanCapsEveryPart() {
        Map<String, Object> out = FinalAddressAnswer.clean(
            new Map<String, Object>{
                'street' => 'a'.repeat(300),
                'city' => 'b'.repeat(50),
                'province' => 'c'.repeat(100),
                'provinceCode' => 'd'.repeat(20),
                'postalCode' => 'e'.repeat(30),
                'country' => 'f'.repeat(100),
                'countryCode' => 'g'.repeat(20)
            }
        );
        Assert.areEqual(255, ((String) out.get('street')).length());
        Assert.areEqual(40, ((String) out.get('city')).length());
        Assert.areEqual(80, ((String) out.get('province')).length());
        Assert.areEqual(10, ((String) out.get('provinceCode')).length());
        Assert.areEqual(20, ((String) out.get('postalCode')).length());
        Assert.areEqual(80, ((String) out.get('country')).length());
        Assert.areEqual(10, ((String) out.get('countryCode')).length());
    }

    private static Map<String, Object> withCoords(Object lat, Object lng) {
        return new Map<String, Object>{
            'city' => 'X',
            'latitude' => lat,
            'longitude' => lng
        };
    }

    @IsTest
    static void coordinatesAreKeptAsAValidPair() {
        Map<String, Object> out = FinalAddressAnswer.clean(
            withCoords(51.5, -0.12)
        );
        Assert.areEqual(51.5, (Decimal) out.get('latitude'));
        Assert.areEqual(-0.12, (Decimal) out.get('longitude'));

        out = FinalAddressAnswer.clean(withCoords(' 40.5 ', '-74'));
        Assert.areEqual(40.5, (Decimal) out.get('latitude'));
        Assert.areEqual(Decimal.valueOf(-74), (Decimal) out.get('longitude'));

        Long twenty = 20;
        out = FinalAddressAnswer.clean(withCoords(10, twenty));
        Assert.areEqual(Decimal.valueOf(10), (Decimal) out.get('latitude'));
        Assert.areEqual(Decimal.valueOf(20), (Decimal) out.get('longitude'));

        Double d1 = 1.5;
        Double d2 = 2.5;
        out = FinalAddressAnswer.clean(withCoords(d1, d2));
        Assert.areEqual(1.5, (Decimal) out.get('latitude'));
        Assert.areEqual(2.5, (Decimal) out.get('longitude'));
    }

    @IsTest
    static void coordinatesAreDroppedTogether() {
        List<List<Object>> bad = new List<List<Object>>{
            new List<Object>{ 91, 10 },
            new List<Object>{ -91, 10 },
            new List<Object>{ 10, 181 },
            new List<Object>{ 10, -181 },
            new List<Object>{ 10, null },
            new List<Object>{ null, 10 },
            new List<Object>{ 'abc', 10 },
            new List<Object>{ '', 10 },
            new List<Object>{ true, 10 },
            new List<Object>{ new List<Object>(), 10 }
        };
        for (List<Object> pair : bad) {
            Map<String, Object> out = FinalAddressAnswer.clean(
                withCoords(pair[0], pair[1])
            );
            Assert.isNotNull(out, 'the text part stays');
            Assert.isFalse(out.containsKey('latitude'), 'both dropped');
            Assert.isFalse(out.containsKey('longitude'), 'both dropped');
        }
    }

    @IsTest
    static void formatWritesOneLinePerPartGroup() {
        Assert.areEqual(
            '1 Main St\nSpringfield, Illinois 62701\nUnited States',
            FinalAddressAnswer.format(full())
        );
        Assert.areEqual(
            '1 Main St\nApt 2\nSpringfield, Illinois 62701\nUnited States',
            FinalAddressAnswer.format(
                new Map<String, Object>{
                    'street' => '1 Main St\nApt 2',
                    'city' => 'Springfield',
                    'province' => 'Illinois',
                    'postalCode' => '62701',
                    'country' => 'United States'
                }
            )
        );
    }

    @IsTest
    static void formatSkipsEmptyPartsAndStraySeparators() {
        Assert.areEqual('', FinalAddressAnswer.format(null));
        Assert.areEqual(
            'Paris\nFrance',
            FinalAddressAnswer.format(
                new Map<String, Object>{
                    'city' => 'Paris',
                    'country' => 'France'
                }
            )
        );
        Assert.areEqual(
            'IL',
            FinalAddressAnswer.format(
                new Map<String, Object>{ 'province' => 'IL' }
            )
        );
        Assert.areEqual(
            'Paris 75001',
            FinalAddressAnswer.format(
                new Map<String, Object>{
                    'city' => 'Paris',
                    'postalCode' => '75001'
                }
            )
        );
        Assert.areEqual(
            '75001',
            FinalAddressAnswer.format(
                new Map<String, Object>{
                    'postalCode' => '75001',
                    'city' => ' '
                }
            )
        );
        Assert.areEqual(
            'Texas 77001',
            FinalAddressAnswer.format(
                new Map<String, Object>{
                    'province' => 'Texas',
                    'postalCode' => '77001'
                }
            )
        );
    }

    @IsTest
    static void firstMissingRequiredFollowsStreetCityCountry() {
        Assert.areEqual(
            'street',
            FinalAddressAnswer.firstMissingRequired(null)
        );
        Assert.areEqual(
            'street',
            FinalAddressAnswer.firstMissingRequired(
                new Map<String, Object>{ 'city' => 'X', 'country' => 'Y' }
            )
        );
        Assert.areEqual(
            'city',
            FinalAddressAnswer.firstMissingRequired(
                new Map<String, Object>{ 'street' => 'S', 'country' => 'Y' }
            )
        );
        Assert.areEqual(
            'country',
            FinalAddressAnswer.firstMissingRequired(
                new Map<String, Object>{ 'street' => 'S', 'city' => 'X' }
            )
        );
        Assert.isNull(FinalAddressAnswer.firstMissingRequired(full()));
    }

    @IsTest
    static void partLabelsMatchTheBrowser() {
        Assert.areEqual('Street', FinalAddressAnswer.partLabel('street'));
        Assert.areEqual('City', FinalAddressAnswer.partLabel('city'));
        Assert.areEqual('Country', FinalAddressAnswer.partLabel('country'));
        Assert.areEqual(
            'State / Province',
            FinalAddressAnswer.partLabel('province')
        );
        Assert.areEqual(
            'Zip / Postal code',
            FinalAddressAnswer.partLabel('postalCode')
        );
        Assert.areEqual('other', FinalAddressAnswer.partLabel('other'));
        Assert.isNull(FinalAddressAnswer.partLabel(null));
    }

    @IsTest
    static void partsListNineMappableKeysWithTheirTypes() {
        List<Map<String, String>> parts = FinalAddressAnswer.parts();
        Assert.areEqual(9, parts.size());
        Assert.isTrue(FinalAddressAnswer.isPart('city'));
        Assert.isFalse(FinalAddressAnswer.isPart('houseNumber'));
        Assert.isFalse(FinalAddressAnswer.isPart(null));
        Assert.areEqual(
            'Number',
            FinalAddressAnswer.partAnswerType('latitude')
        );
        Assert.areEqual(
            'Choice',
            FinalAddressAnswer.partAnswerType('countryCode')
        );
        Assert.areEqual(
            'State / Province code',
            FinalAddressAnswer.partLabel('provinceCode')
        );
        Assert.areEqual('Latitude', FinalAddressAnswer.partLabel('latitude'));
    }

    @IsTest
    static void partOfReadsThePartAKeyedSourceNames() {
        Assert.isNull(FinalAddressAnswer.partOf(null));
        Assert.isNull(
            FinalAddressAnswer.partOf(
                new Map<String, Object>{ 'kind' => 'answer' }
            )
        );
        Assert.areEqual(
            'city',
            FinalAddressAnswer.partOf(
                new Map<String, Object>{ 'kind' => 'answer', 'part' => 'city' }
            )
        );
    }

    @IsTest
    static void partAnswerReadsOnePartAsTextOrNumber() {
        Form_Submission_Answer__c row = new Form_Submission_Answer__c(
            Answer_Type__c = 'Address',
            Value_JSON__c = '{"city":"Leeds","latitude":53.8008,"longitude":-1.5491}'
        );
        Form_Submission_Answer__c city = FinalAddressAnswer.partAnswer(
            row,
            'city'
        );
        Assert.areEqual('Text', city.Answer_Type__c);
        Assert.areEqual('Leeds', city.Text_Value__c);
        Assert.isNull(FinalAddressAnswer.partAnswer(row, 'nope'));
        Assert.isNull(
            FinalAddressAnswer.partAnswer(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Text',
                    Value_JSON__c = row.Value_JSON__c
                ),
                'city'
            ),
            'only an Address row has parts'
        );
        Assert.isNull(
            FinalAddressAnswer.partAnswer(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Address',
                    Value_JSON__c = 'not json'
                ),
                'city'
            )
        );
        Assert.isNull(FinalAddressAnswer.partAnswer(null, 'city'));
        Form_Submission_Answer__c lat = FinalAddressAnswer.partAnswer(
            row,
            'latitude'
        );
        Assert.areEqual('Number', lat.Answer_Type__c);
        Assert.areEqual(53.8008, lat.Numeric_Value__c);
        Assert.isNull(
            FinalAddressAnswer.partAnswer(
                new Form_Submission_Answer__c(
                    Answer_Type__c = 'Address',
                    Value_JSON__c = '{"city":"Leeds"}'
                ),
                'latitude'
            ),
            'a part nobody filled in is blank'
        );
    }
}
