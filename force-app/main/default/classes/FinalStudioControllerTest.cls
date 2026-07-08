@IsTest
private class FinalStudioControllerTest {
    private static Form__c makeForm(String name) {
        // Primary_Context_Object__c is required by an org validation rule
        Form__c f = new Form__c(
            Name = name,
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        return f;
    }

    private static Form_Version__c makeVersion(
        Id formId,
        Integer number_x,
        Boolean active,
        String spec
    ) {
        Form_Version__c v = new Form_Version__c(
            Form__c = formId,
            Version_Number__c = number_x,
            Is_Active__c = active,
            Spec_JSON__c = spec,
            Engine_Version__c = 1
        );
        insert v;
        return v;
    }

    @IsTest
    static void loadPrefersDraftOverActive() {
        Form__c f = makeForm('Load test');
        makeVersion(f.Id, 1, true, '{"specVersion":1,"v":"active"}');
        Form_Version__c draft = makeVersion(
            f.Id,
            2,
            false,
            '{"specVersion":1,"v":"draft"}'
        );

        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);
        Assert.areEqual(draft.Id, out.get('draftVersionId'), 'draft wins');
        Assert.isTrue(
            String.valueOf(out.get('specJson')).contains('"draft"'),
            'draft spec returned'
        );
        Assert.areEqual(1, out.get('activeVersionNumber'));
    }

    @IsTest
    static void loadFallsBackToActiveAndIgnoresHistory() {
        Form__c f = makeForm('History test');
        // deactivated OLD version (history — below active) is NOT a draft
        makeVersion(f.Id, 1, false, '{"specVersion":1,"v":"old"}');
        makeVersion(f.Id, 2, true, '{"specVersion":1,"v":"active"}');

        Map<String, Object> out = FinalStudioController.loadStudio(f.Id);
        Assert.isNull(out.get('draftVersionId'), 'history is not a draft');
        Assert.isTrue(
            String.valueOf(out.get('specJson')).contains('"active"')
        );
    }

    @IsTest
    static void saveCreatesThenUpdatesTheDraft() {
        Form__c f = makeForm('Save test');
        makeVersion(f.Id, 3, true, '{"specVersion":1}');

        Id draftId = FinalStudioController.saveDraft(
            f.Id,
            '{"specVersion":1,"n":1}'
        );
        Form_Version__c draft = [
            SELECT Version_Number__c, Is_Active__c, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :draftId
        ];
        Assert.areEqual(4, draft.Version_Number__c, 'max + 1');
        Assert.isFalse(draft.Is_Active__c);

        Id again = FinalStudioController.saveDraft(
            f.Id,
            '{"specVersion":1,"n":2}'
        );
        Assert.areEqual(draftId, again, 'same row updated, not a new one');
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
        Assert.isTrue(
            [SELECT Spec_JSON__c FROM Form_Version__c WHERE Id = :draftId]
            .Spec_JSON__c.contains('"n":2')
        );
    }

    @IsTest
    static void saveRejectsNonObjectJson() {
        Form__c f = makeForm('Bad json');
        try {
            FinalStudioController.saveDraft(f.Id, 'not json');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        try {
            FinalStudioController.saveDraft(f.Id, '[1,2]');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void discardDeletesOnlyInactiveRows() {
        Form__c f = makeForm('Discard test');
        Form_Version__c active = makeVersion(f.Id, 1, true, '{"specVersion":1}');
        Form_Version__c draft = makeVersion(f.Id, 2, false, '{"specVersion":1}');

        FinalStudioController.discardDraft(draft.Id);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
        // active rows are refused even if handed directly
        FinalStudioController.discardDraft(active.Id);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Version__c WHERE Form__c = :f.Id]
        );
    }

    @IsTest
    static void listFormsReportsDraftAndActiveState() {
        Form__c f = makeForm('List test');
        makeVersion(f.Id, 1, true, '{"specVersion":1}');
        makeVersion(f.Id, 2, false, '{"specVersion":1}');

        List<Map<String, Object>> rows = FinalStudioController.listForms();
        Map<String, Object> row;
        for (Map<String, Object> r : rows) {
            if (r.get('id') == f.Id) {
                row = r;
            }
        }
        Assert.isNotNull(row, 'form listed');
        Assert.areEqual(1, row.get('activeVersion'));
        Assert.areEqual(true, row.get('hasDraft'));
    }

    @IsTest
    static void describeFieldsMapsTypesAndRejectsUnknown() {
        List<Map<String, Object>> fields = FinalStudioController.describeFields(
            'Contact'
        );
        Assert.isFalse(fields.isEmpty(), 'Contact has palette fields');
        Map<String, Object> lastName;
        for (Map<String, Object> f : fields) {
            if (f.get('apiName') == 'LastName') {
                lastName = f;
            }
            Assert.isNotNull(f.get('inputType'), 'every row carries a type');
        }
        Assert.isNotNull(lastName, 'LastName is createable text');
        Assert.areEqual('text', lastName.get('inputType'));
        Assert.areEqual(true, lastName.get('required'));

        try {
            FinalStudioController.describeFields('No_Such_Object__x9');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void loadMissingFormThrowsFriendly() {
        try {
            FinalStudioController.loadStudio(
                Form__c.SObjectType.getDescribe().getKeyPrefix() +
                '000000000000'
            );
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }
}
