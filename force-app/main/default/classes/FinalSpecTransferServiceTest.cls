@IsTest
private class FinalSpecTransferServiceTest {
    @IsTest
    static void shouldRejectMalformedJson_WhenCloneRequested() {
        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone('{bad', 'form');
            Assert.fail('Malformed JSON must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('valid JSON'),
                'Error should identify malformed JSON.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectTypeMismatch_WhenExpectedTypeIsForm() {
        Map<String, Object> spec = baseSpec('survey', null);
        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Root/spec type mismatch must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('does not match'),
                'Error should identify type mismatch.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectDuplicateIds_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> section = firstSection(spec);
        List<Object> elements = listAt(section, 'elements');
        Map<String, Object> duplicate = new Map<String, Object>();
        duplicate.putAll((Map<String, Object>) elements[0]);
        elements.add(duplicate);

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Duplicate ids must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('unique'),
                'Error should identify duplicate structural ids.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectDanglingRule_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        page.put('visibility', visibility('el_missing'));

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Dangling references must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('missing element'),
                'Error should identify the dangling element id.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectInjectionShapedRecordField_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        page.put('visibility', visibility('record:Name FROM User'));

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Injection-shaped field names must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('invalid field name'),
                'Error should identify the invalid API name.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectOversizedSpec_BeforeParsing() {
        String oversized = '{"padding":"' + ''.leftPad(131073, 'x') + '"}';
        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(oversized, 'form');
            Assert.fail('Oversized specifications must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('131,072'),
                'Error should state the storage limit.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectUnavailableMappedField_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> element = (Map<String, Object>) listAt(
            firstSection(spec),
            'elements'
        )[0];
        ((Map<String, Object>) element.get('binding'))
            .put('field', 'No_Such_Field__c');

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Unknown mapped fields must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('does not exist'),
                'Error should identify the unavailable mapped field.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldAcceptAccessibleRecordRule_WhenFieldExists() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        page.put('visibility', visibility('record:LastName'));

        Test.startTest();
        FinalSpecTransferService.PreparedSpec prepared = FinalSpecTransferService.prepareClone(
            JSON.serialize(spec),
            'form'
        );
        Test.stopTest();

        Assert.areEqual(
            'Contact',
            prepared.targetObject,
            'Accessible record-rule field should pass describe validation.'
        );
    }

    @IsTest
    static void shouldAcceptWritableRepeatRelationship_WhenLookupTargetsParent() {
        Map<String, Object> spec = baseSpec('form', 'Account');
        Map<String, Object> section = firstSection(spec);
        section.put(
            'repeat',
            new Map<String, Object>{
                'childObject' => 'Contact',
                'relationshipField' => 'AccountId'
            }
        );
        Map<String, Object> element = (Map<String, Object>) listAt(
            section,
            'elements'
        )[0];
        element.put(
            'binding',
            new Map<String, Object>{
                'object' => 'Contact',
                'field' => 'LastName'
            }
        );

        Test.startTest();
        FinalSpecTransferService.PreparedSpec prepared = FinalSpecTransferService.prepareClone(
            JSON.serialize(spec),
            'form'
        );
        Test.stopTest();

        Assert.areEqual(
            'Account',
            prepared.targetObject,
            'Parent object should remain canonical after repeat validation.'
        );
        Map<String, Object> repeat = (Map<String, Object>) firstSection(
                prepared.spec
            )
            .get('repeat');
        Assert.areEqual(
            'AccountId',
            repeat.get('relationshipField'),
            'Writable lookup back to Account should be accepted.'
        );
    }

    @IsTest
    static void shouldRejectUnknownConnectedObject_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'No_Such_Object__c');

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Unknown connected objects must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('does not exist'),
                'Error should identify the missing connected object.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectUnsupportedRuleAction_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        Map<String, Object> rule = visibility('el_source');
        rule.put('action', 'execute');
        page.put('visibility', rule);

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Unsupported rule actions must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('rule action'),
                'Error should identify the unsupported rule action.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldRejectUnsupportedValidationOperator_WhenSpecIsUntrusted() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        Map<String, Object> element = (Map<String, Object>) listAt(
            firstSection(spec),
            'elements'
        )[0];
        element.put(
            'validation',
            new List<Object>{
                new Map<String, Object>{
                    'type' => 'custom',
                    'compareTo' => 'el_source',
                    'operator' => 'runCode'
                }
            }
        );

        Test.startTest();
        try {
            FinalSpecTransferService.prepareClone(JSON.serialize(spec), 'form');
            Assert.fail('Unsupported validation operators must be rejected.');
        } catch (FinalSpecTransferService.TransferException e) {
            Assert.isTrue(
                e.getMessage().contains('validation operator'),
                'Error should identify the unsupported validation operator.'
            );
        }
        Test.stopTest();
    }

    private static Map<String, Object> baseSpec(
        String formType,
        String targetObject
    ) {
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => 'source',
                'name' => 'Transfer test',
                'type' => formType,
                'targetObject' => targetObject,
                'saveMode' => 'create'
            },
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_source',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_source',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_source',
                                    'type' => formType == 'survey'
                                        ? 'nps'
                                        : 'field',
                                    'binding' => targetObject == null
                                        ? null
                                        : new Map<String, Object>{
                                              'object' => targetObject,
                                              'field' => 'LastName'
                                          }
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> visibility(String source) {
        return new Map<String, Object>{
            'rules' => new List<Object>{
                new Map<String, Object>{
                    'source' => source,
                    'operator' => 'equals',
                    'value' => 'Yes'
                }
            }
        };
    }

    private static Map<String, Object> firstSection(Map<String, Object> spec) {
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        return (Map<String, Object>) listAt(page, 'sections')[0];
    }

    private static List<Object> listAt(Map<String, Object> source, String key) {
        return (List<Object>) source.get(key);
    }
}
