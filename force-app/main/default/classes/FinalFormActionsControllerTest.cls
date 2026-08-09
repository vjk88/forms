@IsTest
private class FinalFormActionsControllerTest {
    @IsTest
    static void shouldCloneCurrentFormSpec_WhenUnsavedChangesExist() {
        Form__c source = createForm('Form', 'Contact', 'Clone source');
        source.Description__c = 'Copied description';
        source.Allowed_Adapters__c = 'Internal_Record_Page;Public_Guest';
        update source;
        TestDataFactory.createFinalFormVersion(
            source.Id,
            1,
            true,
            JSON.serialize(baseSpec('form', 'Database version', 'Contact')),
            true
        );
        Map<String, Object> current = formSpecWithRules('Unsaved version');

        Test.startTest();
        Map<String, Object> result = FinalFormActionsController.cloneForm(
            source.Id,
            JSON.serialize(current),
            'Clone result'
        );
        Test.stopTest();

        Id cloneId = (Id) result.get('formId');
        Id cloneVersionId = (Id) result.get('versionId');

        Form__c clone = [
            SELECT
                Name,
                Description__c,
                Form_Type__c,
                Status__c,
                Primary_Context_Object__c,
                Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :cloneId
        ];
        Form_Version__c version = [
            SELECT Version_Number__c, Is_Active__c, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :cloneVersionId
        ];
        Map<String, Object> cloned = (Map<String, Object>) JSON.deserializeUntyped(
            version.Spec_JSON__c
        );
        Map<String, Object> formBlock = mapAt(cloned, 'form');
        List<Object> pages = listAt(cloned, 'pages');
        Map<String, Object> page = (Map<String, Object>) pages[0];
        Map<String, Object> section = (Map<String, Object>) listAt(
            page,
            'sections'
        )[0];
        List<Object> elements = listAt(section, 'elements');
        Map<String, Object> first = (Map<String, Object>) elements[0];
        Map<String, Object> second = (Map<String, Object>) elements[1];
        Map<String, Object> pageRule = mapAt(page, 'visibility');
        Map<String, Object> ruleRow = (Map<String, Object>) listAt(
            pageRule,
            'rules'
        )[0];
        Map<String, Object> validation = (Map<String, Object>) listAt(
            second,
            'validation'
        )[0];

        Assert.areEqual(
            'Clone result',
            clone.Name,
            'Clone root should use the confirmed name.'
        );
        Assert.areEqual(
            'Copied description',
            clone.Description__c,
            'Description should carry forward.'
        );
        Assert.areEqual(
            'Form',
            clone.Form_Type__c,
            'Root type should remain Form.'
        );
        Assert.areEqual(
            'Draft',
            clone.Status__c,
            'Every clone should start Draft.'
        );
        Assert.areEqual(
            'Contact',
            clone.Primary_Context_Object__c,
            'Connected object should be retained.'
        );
        Assert.isFalse(
            String.valueOf(clone.Allowed_Adapters__c).contains('Public_Guest'),
            'Guest access must not cross the clone boundary.'
        );
        Assert.areEqual(
            1,
            version.Version_Number__c,
            'Clone should have one v1 version.'
        );
        Assert.isTrue(
            version.Is_Active__c,
            'Creation convention keeps v1 active.'
        );
        Assert.areEqual(
            'Clone result',
            formBlock.get('name'),
            'Spec identity should use the new name.'
        );
        Assert.areEqual(
            String.valueOf(result.get('formId')),
            formBlock.get('id'),
            'Spec should point at the clone root.'
        );
        Assert.isFalse(
            version.Spec_JSON__c.contains('Database version'),
            'Stored history must not win over unsaved state.'
        );
        Assert.isNull(
            cloned.get('resolved'),
            'Published token snapshots must be removed.'
        );
        Assert.areNotEqual(
            'pg_source',
            page.get('id'),
            'Page id must be fresh.'
        );
        Assert.areNotEqual(
            'sec_source',
            section.get('id'),
            'Section id must be fresh.'
        );
        Assert.areNotEqual(
            'el_name',
            first.get('id'),
            'First element id must be fresh.'
        );
        Assert.areNotEqual(
            'el_email',
            second.get('id'),
            'Second element id must be fresh.'
        );
        Assert.areEqual(
            first.get('id'),
            ruleRow.get('source'),
            'Visibility source must follow the remapped element.'
        );
        Assert.areEqual(
            first.get('id'),
            validation.get('compareTo'),
            'Validation compareTo must follow the remapped element.'
        );
        Map<String, Object> whenRule = mapAt(validation, 'when');
        Map<String, Object> whenRow = (Map<String, Object>) listAt(
            whenRule,
            'rules'
        )[0];
        Assert.areEqual(
            first.get('id'),
            whenRow.get('source'),
            'Validation when source must be remapped.'
        );
    }

    @IsTest
    static void shouldCloneSurveyWithoutObject_WhenSurveyIsDisconnected() {
        Form__c source = createForm('Survey', 'Contact', 'Survey source');
        Map<String, Object> spec = baseSpec('survey', 'Survey source', null);
        Map<String, Object> element = firstElement(spec);
        element.put('type', 'nps');
        element.put('binding', null);

        Test.startTest();
        FinalFormActionsService.CloneResult result = FinalFormActionsService.cloneForm(
            source.Id,
            JSON.serialize(spec),
            'Survey clone'
        );
        Test.stopTest();

        Form__c clone = [
            SELECT Form_Type__c, Status__c, Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :result.formId
        ];
        Assert.areEqual(
            'Survey',
            clone.Form_Type__c,
            'Survey type should remain Survey.'
        );
        Assert.areEqual(
            'Draft',
            clone.Status__c,
            'Survey clone should start Draft.'
        );
        Assert.isNull(
            clone.Primary_Context_Object__c,
            'Disconnected Survey should remain disconnected.'
        );
    }

    @IsTest
    static void shouldReuseOnlyReferencedConfigFile_WhenCloning() {
        Form__c source = createForm('Form', 'Contact', 'Asset source');
        ContentVersion referenced = createLinkedFile(
            source.Id,
            'referenced.png'
        );
        ContentVersion unrelated = createLinkedFile(source.Id, 'unrelated.png');
        Id referencedDocumentId = referenced.ContentDocumentId;
        Id unrelatedDocumentId = unrelated.ContentDocumentId;
        Integer referencedLinksBefore = [
            SELECT COUNT()
            FROM ContentDocumentLink
            WHERE ContentDocumentId = :referencedDocumentId
        ];
        Integer unrelatedLinksBefore = [
            SELECT COUNT()
            FROM ContentDocumentLink
            WHERE ContentDocumentId = :unrelatedDocumentId
        ];
        Map<String, Object> spec = baseSpec('form', 'Asset source', 'Contact');
        Map<String, Object> image = firstElement(spec);
        image.put('type', 'image');
        image.put('binding', null);
        image.put(
            'config',
            new Map<String, Object>{
                'src' => '/sfc/servlet.shepherd/version/download/' +
                referenced.Id,
                'versionId' => referenced.Id
            }
        );

        Test.startTest();
        FinalFormActionsService.CloneResult result = FinalFormActionsService.cloneForm(
            source.Id,
            JSON.serialize(spec),
            'Asset clone'
        );
        Test.stopTest();

        Assert.areEqual(
            referencedLinksBefore + 1,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE ContentDocumentId = :referencedDocumentId
            ],
            'Clone should add exactly one link to the referenced bytes.'
        );
        Assert.areEqual(
            unrelatedLinksBefore,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE ContentDocumentId = :unrelatedDocumentId
            ],
            'Clone must not add a link to unrelated Form attachments.'
        );
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :result.formId
            ],
            'Clone should receive only its referenced config file.'
        );
    }

    @IsTest
    static void shouldRollbackRoot_WhenCloneFailsAfterInsert() {
        Form__c source = createForm('Form', 'Contact', 'Rollback source');
        Integer beforeCount = [SELECT COUNT() FROM Form__c];
        FinalFormActionsService.failAfterRootInsert = true;

        Test.startTest();
        try {
            FinalFormActionsService.cloneForm(
                source.Id,
                JSON.serialize(baseSpec('form', 'Rollback source', 'Contact')),
                'Must roll back'
            );
            Assert.fail('Expected the simulated transaction failure.');
        } catch (FinalFormActionsService.ActionException e) {
            Assert.isTrue(
                e.getMessage().contains('Simulated'),
                'Expected the controlled failure path.'
            );
        }
        Test.stopTest();
        FinalFormActionsService.failAfterRootInsert = false;

        Assert.areEqual(
            beforeCount,
            [SELECT COUNT() FROM Form__c],
            'Savepoint should remove the partial root.'
        );
    }

    @IsTest
    static void shouldRejectArchivedSource_WhenCloneRequested() {
        Form__c source = createForm('Form', 'Contact', 'Archived source');
        source.Status__c = 'Archived';
        update source;

        Test.startTest();
        try {
            FinalFormActionsService.cloneForm(
                source.Id,
                JSON.serialize(baseSpec('form', 'Archived source', 'Contact')),
                'Rejected clone'
            );
            Assert.fail('Archived records must not reopen through an action.');
        } catch (FinalFormActionsService.ActionException e) {
            Assert.isTrue(
                e.getMessage().contains('Restore'),
                'Error should direct the user to Restore.'
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void shouldSurfaceActionError_WhenControllerReceivesMalformedSpec() {
        Form__c source = createForm('Form', 'Contact', 'Controller error');

        Test.startTest();
        try {
            FinalFormActionsController.cloneForm(
                source.Id,
                '{bad',
                'Rejected clone'
            );
            Assert.fail('The Lightning boundary must reject malformed specs.');
        } catch (AuraHandledException e) {
            Assert.isNotNull(
                e,
                'Controller should surface an Aura-safe error.'
            );
        }
        Test.stopTest();
    }

    private static Form__c createForm(
        String formType,
        String primaryObject,
        String name
    ) {
        Form__c form = TestDataFactory.createForms(
            1,
            formType,
            primaryObject,
            false
        )[0];
        form.Name = name;
        insert form;
        return form;
    }

    private static ContentVersion createLinkedFile(Id formId, String name) {
        ContentVersion version = new ContentVersion(
            Title = name,
            PathOnClient = name,
            VersionData = Blob.valueOf(name),
            IsMajorVersion = true
        );
        insert version;
        version = [
            SELECT Id, ContentDocumentId
            FROM ContentVersion
            WHERE Id = :version.Id
        ];
        insert new ContentDocumentLink(
            ContentDocumentId = version.ContentDocumentId,
            LinkedEntityId = formId,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        return version;
    }

    private static Map<String, Object> baseSpec(
        String formType,
        String name,
        String targetObject
    ) {
        Map<String, Object> formBlock = new Map<String, Object>{
            'id' => 'source',
            'name' => name,
            'type' => formType,
            'targetObject' => targetObject,
            'saveMode' => 'create'
        };
        return new Map<String, Object>{
            'specVersion' => 1,
            'form' => formBlock,
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'resolved' => new Map<String, Object>{
                'tokens' => new Map<String, Object>{ '--c-accent' => '#000000' }
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_source',
                    'name' => 'Page',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_source',
                            'title' => 'Section',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'el_name',
                                    'type' => 'field',
                                    'binding' => targetObject == null
                                        ? null
                                        : new Map<String, Object>{
                                              'object' => targetObject,
                                              'field' => 'LastName'
                                          },
                                    'label' => 'Name'
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> formSpecWithRules(String name) {
        Map<String, Object> spec = baseSpec('form', name, 'Contact');
        Map<String, Object> page = (Map<String, Object>) listAt(
            spec,
            'pages'
        )[0];
        page.put('visibility', visibility('el_name'));
        Map<String, Object> section = firstSection(spec);
        List<Object> elements = listAt(section, 'elements');
        elements.add(
            new Map<String, Object>{
                'id' => 'el_email',
                'type' => 'field',
                'binding' => new Map<String, Object>{
                    'object' => 'Contact',
                    'field' => 'Email'
                },
                'label' => 'Email',
                'validation' => new List<Object>{
                    new Map<String, Object>{
                        'type' => 'custom',
                        'compareTo' => 'el_name',
                        'operator' => 'equals',
                        'when' => visibility('el_name')
                    }
                }
            }
        );
        return spec;
    }

    private static Map<String, Object> visibility(String source) {
        return new Map<String, Object>{
            'action' => 'show',
            'logic' => 'all',
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

    private static Map<String, Object> firstElement(Map<String, Object> spec) {
        return (Map<String, Object>) listAt(firstSection(spec), 'elements')[0];
    }

    private static Map<String, Object> mapAt(
        Map<String, Object> source,
        String key
    ) {
        return (Map<String, Object>) source.get(key);
    }

    private static List<Object> listAt(Map<String, Object> source, String key) {
        return (List<Object>) source.get(key);
    }
}
