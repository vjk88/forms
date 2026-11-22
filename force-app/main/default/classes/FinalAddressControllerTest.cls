@IsTest
private class FinalAddressControllerTest {
    private static Integer suggestCalls = 0;

    public class FakeProvider implements FinalAddressProvider {
        public List<FinalAddress.Suggestion> suggest(FinalAddress.Query q) {
            suggestCalls++;
            FinalAddress.Suggestion s = new FinalAddress.Suggestion();
            s.id = 'p1';
            s.title = '1 Main St';
            s.subtitle = 'Town';
            return new List<FinalAddress.Suggestion>{ s };
        }

        public FinalAddress.Result details(String id, String sessionToken) {
            FinalAddress.Result r = new FinalAddress.Result();
            r.street = '1 Main St';
            r.city = 'Town';
            return r;
        }
    }

    private static final String ADDRESS_SPEC =
        '{"pages":[{"sections":[{"elements":[' +
        '{"id":"addr1","type":"field","config":{"inputType":"address","addressSearch":true}},' +
        '{"id":"addrOff","type":"field","config":{"inputType":"address","addressSearch":false}}' +
        ']}]}]}';

    private static Form__c makeForm(Boolean withVersion, String specJson) {
        Form__c f = new Form__c(
            Name = 'Address test',
            Primary_Context_Object__c = 'Contact',
            Status__c = 'Published',
            Is_Public__c = false,
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        if (withVersion) {
            insert new Form_Version__c(
                Form__c = f.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Engine_Version__c = 1,
                Spec_JSON__c = specJson
            );
        }
        return f;
    }

    private static void useFake() {
        FinalAddressService.providerOverride = new FakeProvider();
        FinalAddressService.providerNameOverride = 'Custom';
    }

    private static String suggestError(Id formId, String elementId) {
        try {
            FinalAddressController.suggest(
                formId,
                elementId,
                'main street',
                'token-12345',
                null
            );
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    @IsTest
    static void authorSkipsTheQuestionCheck() {
        useFake();
        Form__c f = makeForm(false, null);
        List<FinalAddress.Suggestion> out = FinalAddressController.suggest(
            f.Id,
            'anything-not-in-a-spec',
            'main street',
            'token-12345',
            null
        );
        Assert.areEqual(1, out.size());
        Assert.areEqual('p1', out[0].id);
        FinalAddress.Result r = FinalAddressController.details(
            f.Id,
            'anything-not-in-a-spec',
            'p1',
            'token-12345'
        );
        Assert.areEqual('1 Main St', r.street);
    }

    @IsTest
    static void statusWorks() {
        FinalAddressService.providerNameOverride = 'Google';
        FinalAddressService.Status s = FinalAddressController.status();
        Assert.isTrue(s.configured);
        Assert.areEqual('Results by Google', s.attribution);
    }

    @IsTest
    static void noProviderSurfacesAsPrefixedAuraError() {
        Form__c f = makeForm(false, null);
        Assert.areEqual('FINAL_ADDR:NOT_SET_UP', suggestError(f.Id, 'addr1'));
        try {
            FinalAddressController.details(f.Id, 'addr1', 'p1', null);
            Assert.fail('expected AuraHandledException');
        } catch (AuraHandledException e) {
            Assert.areEqual('FINAL_ADDR:NOT_SET_UP', e.getMessage());
        }
    }

    @IsTest
    static void missingOrUnreadableFormIsNotAllowed() {
        useFake();
        Id ghost = Id.valueOf(
            Form__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001'
        );
        Assert.areEqual('FINAL_ADDR:NOT_ALLOWED', suggestError(ghost, 'addr1'));
        Assert.areEqual('FINAL_ADDR:NOT_ALLOWED', suggestError(null, 'addr1'));
        Assert.areEqual(0, suggestCalls, 'refused before any provider call');
    }

    @IsTest
    static void respondentNeedsASearchQuestionOnThePublishedSpec() {
        useFake();
        FinalAddressController.editOverride = false;
        Form__c f = makeForm(true, ADDRESS_SPEC);

        List<FinalAddress.Suggestion> out = FinalAddressController.suggest(
            f.Id,
            'addr1',
            'main street',
            'token-12345',
            null
        );
        Assert.areEqual(1, out.size());
        FinalAddress.Result r = FinalAddressController.details(
            f.Id,
            'addr1',
            'p1',
            'token-12345'
        );
        Assert.areEqual('1 Main St', r.street);

        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(f.Id, 'addrOff')
        );
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(f.Id, 'missing')
        );
        Assert.areEqual('FINAL_ADDR:NOT_ALLOWED', suggestError(f.Id, null));
        Assert.areEqual(1, suggestCalls);
    }

    @IsTest
    static void respondentWithoutUsableActiveVersionIsNotAllowed() {
        useFake();
        FinalAddressController.editOverride = false;

        Form__c none = makeForm(false, null);
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(none.Id, 'addr1'),
            'no version'
        );

        Form__c blank = makeForm(true, null);
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(blank.Id, 'addr1'),
            'blank spec'
        );

        Form__c broken = makeForm(true, '{not json');
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(broken.Id, 'addr1'),
            'malformed spec'
        );

        Form__c notObject = makeForm(true, '[1,2]');
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(notObject.Id, 'addr1'),
            'not an object'
        );
        Assert.areEqual(0, suggestCalls);
    }
}
