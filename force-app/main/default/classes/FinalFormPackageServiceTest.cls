@IsTest
private class FinalFormPackageServiceTest {
    @IsTest
    static void shouldExportCurrentSpec_WhenPackageRequested() {
        Form__c source = createForm('Form', 'Export source', 'Contact');
        Map<String, Object> spec = baseSpec('form', 'Contact');
        mapAt(spec, 'form').put('id', String.valueOf(source.Id));
        spec.put(
            'resolved',
            new Map<String, Object>{ 'tokens' => new Map<String, Object>() }
        );

        Test.startTest();
        Map<String, Object> result = FinalFormActionsController.exportForm(
            source.Id,
            JSON.serialize(spec)
        );
        Test.stopTest();

        Map<String, Object> envelope = mapValue(
            JSON.deserializeUntyped((String) result.get('packageJson'))
        );
        Map<String, Object> exportedSpec = mapAt(envelope, 'spec');
        Assert.areEqual(
            'final-form-package',
            envelope.get('kind'),
            'Export should use the v1 package kind.'
        );
        Assert.areEqual(
            'pg_source',
            mapValue(listAt(exportedSpec, 'pages')[0]).get('id'),
            'Export must retain structural ids for rule references.'
        );
        Assert.isNull(
            mapAt(exportedSpec, 'form').get('id'),
            'Source root ids must not cross the package boundary.'
        );
        Assert.isNull(
            exportedSpec.get('resolved'),
            'Published token snapshots must not be exported.'
        );
        Assert.areEqual(
            'export-source.finalform.json',
            result.get('fileName'),
            'The browser download should receive a safe file name.'
        );
    }

    @IsTest
    static void shouldExportPortableThemeAndAssetManifest() {
        Form__c source = createForm('Form', 'Portable dependencies', 'Contact');
        Theme_Definition__c theme = new Theme_Definition__c(
            Name = 'Portable teal',
            Base_Theme__c = 'editorialIvory',
            Theme_JSON__c = '{"accent":"#00857c"}'
        );
        insert as user theme;
        ContentVersion asset = new ContentVersion(
            Title = 'hero',
            PathOnClient = 'hero.png',
            VersionData = Blob.valueOf('image bytes'),
            IsMajorVersion = true
        );
        insert as user asset;
        Map<String, Object> spec = baseSpec('form', 'Contact');
        spec.put(
            'theme',
            new Map<String, Object>{
                'source' => 'custom',
                'name' => String.valueOf(theme.Id),
                'overrides' => new Map<String, Object>()
            }
        );
        Map<String, Object> element = firstElement(spec);
        element.put('type', 'image');
        element.remove('binding');
        element.put(
            'config',
            new Map<String, Object>{
                'versionId' => String.valueOf(asset.Id),
                'src' => '/sfc/servlet.shepherd/version/download/' + asset.Id
            }
        );

        Test.startTest();
        Map<String, Object> result = FinalFormActionsController.exportForm(
            source.Id,
            JSON.serialize(spec)
        );
        Test.stopTest();

        Map<String, Object> envelope = mapValue(
            JSON.deserializeUntyped((String) result.get('packageJson'))
        );
        Map<String, Object> dependencies = mapAt(envelope, 'dependencies');
        Map<String, Object> exportedTheme = mapValue(
            dependencies.get('customTheme')
        );
        Map<String, Object> exportedAsset = mapValue(
            listAt(dependencies, 'assets')[0]
        );
        Assert.areEqual(
            'Portable teal',
            exportedTheme.get('name'),
            'Custom theme properties should be portable.'
        );
        Assert.areEqual(
            true,
            exportedAsset.get('available'),
            'The same-org content version should appear in the manifest.'
        );
        Assert.isTrue(
            JSON.serialize(result.get('warnings'))
                .contains('ASSET_BYTES_OMITTED'),
            'JSON export must disclose that binary bytes are omitted.'
        );
    }

    @IsTest
    static void shouldCreateTopic_WhenApprovedSurveyImportRequiresIt() {
        Map<String, Object> spec = baseSpec('survey', null);
        Map<String, Object> element = firstElement(spec);
        element.put('type', 'nps');
        element.remove('binding');
        element.put(
            'analytics',
            new Map<String, Object>{
                'topics' => new List<Object>{
                    new Map<String, Object>{
                        'id' => 'a99FOREIGN',
                        'name' => 'Onboarding'
                    }
                }
            }
        );
        String packageJson = packageJson(spec, 'survey', null);

        Test.startTest();
        Map<String, Object> inspection = FinalFormActionsController.inspectImport(
            packageJson
        );
        Map<String, Object> imported = FinalFormActionsController.importForm(
            packageJson,
            'Imported survey',
            new List<String>{ 'CREATE_SURVEY_TOPICS' }
        );
        Test.stopTest();

        Assert.isTrue(
            (Boolean) inspection.get('valid'),
            'A valid survey package should inspect successfully.'
        );
        Survey_Topic__c topic = [
            SELECT Id, Name
            FROM Survey_Topic__c
            WHERE Name = 'Onboarding'
            LIMIT 1
        ];
        Form_Version__c version = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :(Id) imported.get('formId')
            LIMIT 1
        ];
        Map<String, Object> stored = mapValue(
            JSON.deserializeUntyped(version.Spec_JSON__c)
        );
        Map<String, Object> storedTopic = mapValue(
            listAt(mapAt(firstElement(stored), 'analytics'), 'topics')[0]
        );
        Assert.areEqual(
            String.valueOf(topic.Id),
            storedTopic.get('id'),
            'Imported questions should reference the local topic id.'
        );
    }

    @IsTest
    static void shouldCreateCustomTheme_WhenApprovedDependencyIsMissing() {
        Map<String, Object> spec = baseSpec('form', 'Contact');
        spec.put(
            'theme',
            new Map<String, Object>{
                'source' => 'custom',
                'name' => 'a99ForeignTheme',
                'overrides' => new Map<String, Object>()
            }
        );
        Map<String, Object> customTheme = new Map<String, Object>{
            'sourceId' => 'a99ForeignTheme',
            'name' => 'Portable teal',
            'baseTheme' => 'editorialIvory',
            'properties' => new Map<String, Object>{ 'accent' => '#00857c' }
        };
        String packageJson = packageJson(spec, 'form', customTheme);

        Test.startTest();
        FinalFormActionsService.CloneResult imported = FinalFormActionsService.importForm(
            packageJson,
            'Themed import',
            new List<String>{ 'CREATE_CUSTOM_THEME' }
        );
        Test.stopTest();

        Theme_Definition__c theme = [
            SELECT Id, Name, Base_Theme__c
            FROM Theme_Definition__c
            WHERE Name = 'Portable teal'
            LIMIT 1
        ];
        Form_Version__c version = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :imported.formId
            LIMIT 1
        ];
        Map<String, Object> stored = mapValue(
            JSON.deserializeUntyped(version.Spec_JSON__c)
        );
        Assert.areEqual(
            String.valueOf(theme.Id),
            mapAt(stored, 'theme').get('name'),
            'The imported spec should reference the local custom theme.'
        );
        Assert.areEqual(
            'editorialIvory',
            theme.Base_Theme__c,
            'Theme provenance should cross the package boundary.'
        );
    }

    @IsTest
    static void shouldRejectImport_WhenRequiredWarningsAreNotAccepted() {
        Map<String, Object> spec = baseSpec('survey', null);
        Map<String, Object> element = firstElement(spec);
        element.put('type', 'nps');
        element.remove('binding');
        element.put(
            'analytics',
            new Map<String, Object>{
                'topics' => new List<Object>{
                    new Map<String, Object>{ 'name' => 'New shared topic' }
                }
            }
        );

        Test.startTest();
        try {
            FinalFormActionsService.importForm(
                packageJson(spec, 'survey', null),
                'Unapproved import',
                new List<String>()
            );
            Assert.fail(
                'A shared-data warning must require explicit approval.'
            );
        } catch (FinalFormActionsService.ActionException e) {
            Assert.isTrue(
                e.getMessage().contains('accept the import warnings'),
                'The error should explain the required confirmation.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldDisconnectSurvey_WhenSourceObjectIsUnavailable() {
        Map<String, Object> spec = baseSpec('survey', 'Foreign_Object__c');
        Map<String, Object> form = mapAt(spec, 'form');
        form.put('saveMode', 'update');
        String packageJson = packageJson(spec, 'survey', null);

        Test.startTest();
        Map<String, Object> inspection = FinalFormActionsController.inspectImport(
            packageJson
        );
        Map<String, Object> imported = FinalFormActionsController.importForm(
            packageJson,
            'Disconnected survey',
            new List<String>{ 'SURVEY_DISCONNECTED' }
        );
        Test.stopTest();

        Assert.isTrue(
            JSON.serialize(inspection.get('warnings'))
                .contains('SURVEY_DISCONNECTED'),
            'Inspection should disclose removed mappings.'
        );
        Form__c root = [
            SELECT Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :(Id) imported.get('formId')
        ];
        Assert.isNull(
            root.Primary_Context_Object__c,
            'A disconnected Survey should not persist a foreign object.'
        );
    }

    @IsTest
    static void shouldNormalizeInvalidSurveyMappings_AndKeepValidOnes() {
        Map<String, Object> spec = baseSpec('survey', 'Account');
        Map<String, Object> page = mapValue(listAt(spec, 'pages')[0]);
        page.put(
            'visibility',
            new Map<String, Object>{
                'rules' => new List<Object>{
                    new Map<String, Object>{
                        'source' => 'record:Missing_Field__c',
                        'operator' => 'equals',
                        'value' => 'x'
                    },
                    new Map<String, Object>{
                        'source' => 'el_source',
                        'operator' => 'equals',
                        'value' => 'Yes'
                    }
                }
            }
        );
        Map<String, Object> invalidSection = mapValue(
            listAt(page, 'sections')[0]
        );
        invalidSection.put(
            'repeat',
            new Map<String, Object>{
                'childObject' => 'Contact',
                'relationshipField' => 'Missing_Field__c'
            }
        );
        Map<String, Object> invalidElement = firstElement(spec);
        invalidElement.put(
            'binding',
            new Map<String, Object>{
                'object' => 'Contact',
                'field' => 'LastName'
            }
        );
        invalidElement.put(
            'validation',
            new List<Object>{
                new Map<String, Object>{
                    'when' => new Map<String, Object>{
                        'rules' => new List<Object>{
                            new Map<String, Object>{
                                'source' => 'record:Missing_Field__c'
                            }
                        }
                    }
                }
            }
        );
        Map<String, Object> validSection = new Map<String, Object>{
            'id' => 'sec_valid_repeat',
            'repeat' => new Map<String, Object>{
                'childObject' => 'Contact',
                'relationshipField' => 'AccountId'
            },
            'elements' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'el_valid_repeat',
                    'type' => 'field',
                    'binding' => new Map<String, Object>{
                        'object' => 'Contact',
                        'field' => 'LastName'
                    }
                }
            }
        };
        listAt(page, 'sections').add(validSection);
        List<Map<String, Object>> warnings = new List<Map<String, Object>>();

        Test.startTest();
        FinalSurveyImportNormalizer.normalize(spec, warnings);
        Test.stopTest();

        Assert.isNull(
            invalidSection.get('repeat'),
            'An invalid repeat relationship should be removed.'
        );
        Assert.isNull(
            invalidElement.get('binding'),
            'Bindings below a removed repeat should also be removed.'
        );
        Assert.isNotNull(
            validSection.get('repeat'),
            'A valid writable child relationship should survive normalization.'
        );
        Assert.areEqual(
            1,
            listAt(mapAt(page, 'visibility'), 'rules').size(),
            'Only the unavailable record rule should be pruned.'
        );
        Assert.areEqual(
            'SURVEY_DISCONNECTED',
            warnings[0].get('code'),
            'Every lossy normalization should require explicit consent.'
        );
    }

    @IsTest
    static void shouldReturnInspectionError_WhenPackageIsMalformed() {
        Test.startTest();
        Map<String, Object> inspection = FinalFormActionsController.inspectImport(
            '{bad'
        );
        Test.stopTest();
        Assert.isFalse(
            (Boolean) inspection.get('valid'),
            'Malformed packages should return a preview error, not perform DML.'
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form__c],
            'Inspection must remain read-only.'
        );
    }

    private static Form__c createForm(
        String type,
        String name,
        String targetObject
    ) {
        Form__c form = TestDataFactory.createForms(
            1,
            type,
            targetObject,
            true
        )[0];
        form.Name = name;
        update as user form;
        return form;
    }

    private static String packageJson(
        Map<String, Object> spec,
        String type,
        Object customTheme
    ) {
        return JSON.serialize(
            new Map<String, Object>{
                'kind' => 'final-form-package',
                'packageVersion' => 1,
                'metadata' => new Map<String, Object>{
                    'name' => 'Portable source',
                    'type' => type,
                    'description' => 'Portable description'
                },
                'spec' => spec,
                'dependencies' => new Map<String, Object>{
                    'customTheme' => customTheme,
                    'assets' => new List<Object>(),
                    'topics' => new List<Object>()
                }
            }
        );
    }

    private static Map<String, Object> baseSpec(
        String type,
        String targetObject
    ) {
        Map<String, Object> element = new Map<String, Object>{
            'id' => 'el_source',
            'type' => 'field',
            'label' => 'Name'
        };
        if (String.isNotBlank(targetObject)) {
            element.put(
                'binding',
                new Map<String, Object>{
                    'object' => targetObject,
                    'field' => targetObject == 'Contact' ? 'LastName' : 'Name'
                }
            );
        }
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'name' => 'Portable source',
                'type' => type,
                'targetObject' => targetObject,
                'saveMode' => 'create'
            },
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'theme' => new Map<String, Object>{
                'source' => 'builtin',
                'name' => 'editorialIvory',
                'overrides' => new Map<String, Object>()
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_source',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_source',
                            'elements' => new List<Object>{ element }
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> firstElement(Map<String, Object> spec) {
        Map<String, Object> page = mapValue(listAt(spec, 'pages')[0]);
        Map<String, Object> section = mapValue(listAt(page, 'sections')[0]);
        return mapValue(listAt(section, 'elements')[0]);
    }

    private static Map<String, Object> mapAt(
        Map<String, Object> parent,
        String key
    ) {
        return mapValue(parent.get(key));
    }

    private static Map<String, Object> mapValue(Object value) {
        return (Map<String, Object>) value;
    }

    private static List<Object> listAt(Map<String, Object> parent, String key) {
        return (List<Object>) parent.get(key);
    }
}
