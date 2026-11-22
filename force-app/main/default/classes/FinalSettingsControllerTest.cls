@IsTest
private class FinalSettingsControllerTest {
    private static List<FinalAddress.Suggestion> canned = new List<FinalAddress.Suggestion>();
    private static Integer failStatus;

    public class FakeProvider implements FinalAddressProvider {
        public List<FinalAddress.Suggestion> suggest(FinalAddress.Query q) {
            if (failStatus != null) {
                throw FinalAddress.failed(failStatus);
            }
            return canned;
        }

        public FinalAddress.Result details(String id, String sessionToken) {
            return new FinalAddress.Result();
        }
    }

    public class NotAProvider {
    }

    private static FinalAddress.Suggestion sug(String id) {
        FinalAddress.Suggestion s = new FinalAddress.Suggestion();
        s.id = id;
        s.title = id;
        return s;
    }

    private static String saveError(String provider, String cls) {
        try {
            FinalSettingsController.saveAddressSettings(provider, cls);
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    @IsTest
    static void getWithNoRowIsNone() {
        FinalSettingsController.manageOverride = true;
        FinalSettingsController.AddressSettings s = FinalSettingsController.getAddressSettings();
        Assert.areEqual('None', s.provider);
        Assert.isNull(s.apexClass);
        Assert.isTrue(s.canManage);
        FinalSettingsController.manageOverride = false;
        Assert.isFalse(FinalSettingsController.getAddressSettings().canManage);
    }

    @IsTest
    static void saveGoogleThenGet() {
        FinalSettingsController.manageOverride = true;
        FinalSettingsController.saveAddressSettings('Google', 'ignored');
        FinalSettingsController.AddressSettings s = FinalSettingsController.getAddressSettings();
        Assert.areEqual('Google', s.provider);
        Assert.isNull(s.apexClass);
    }

    @IsTest
    static void saveCustomNeedsAUsableClass() {
        FinalSettingsController.manageOverride = true;
        String msg = 'That Apex class can\'t be used. It must exist, have a public constructor with no arguments, and implement FinalAddressProvider.';
        Assert.areEqual(msg, saveError('Custom', 'NoSuchClassAnywhere'));
        Assert.areEqual(msg, saveError('Custom', '  '));
        Assert.areEqual(msg, saveError('Custom', null));
        Assert.areEqual(
            msg,
            saveError('Custom', 'FinalSettingsControllerTest.NotAProvider')
        );
        Assert.areEqual(0, [SELECT COUNT() FROM Final_Settings__c]);
    }

    @IsTest
    static void saveCustomWithRealClassStoresItTrimmed() {
        FinalSettingsController.manageOverride = true;
        FinalSettingsController.saveAddressSettings(
            'Custom',
            ' FinalSettingsControllerTest.FakeProvider '
        );
        FinalSettingsController.AddressSettings s = FinalSettingsController.getAddressSettings();
        Assert.areEqual('Custom', s.provider);
        Assert.areEqual(
            'FinalSettingsControllerTest.FakeProvider',
            s.apexClass
        );
    }

    @IsTest
    static void savingTwiceUpdatesTheSameRow() {
        FinalSettingsController.manageOverride = true;
        FinalSettingsController.saveAddressSettings('Google', null);
        FinalSettingsController.saveAddressSettings(
            'Custom',
            'FinalSettingsControllerTest.FakeProvider'
        );
        FinalSettingsController.saveAddressSettings('None', null);
        Assert.areEqual(1, [SELECT COUNT() FROM Final_Settings__c]);
        FinalSettingsController.AddressSettings s = FinalSettingsController.getAddressSettings();
        Assert.areEqual('None', s.provider);
        Assert.isNull(s.apexClass);
    }

    @IsTest
    static void unknownProviderIsRefused() {
        FinalSettingsController.manageOverride = true;
        String msg = 'Choose a provider from the list.';
        Assert.areEqual(msg, saveError('Loqate', null));
        Assert.areEqual(msg, saveError(null, null));
        Assert.areEqual(msg, saveError('Bogus', null));
    }

    @IsTest
    static void withoutThePermissionSaveAndTestAreRefused() {
        FinalSettingsController.manageOverride = false;
        String msg = 'You need the Manage form settings permission to change this.';
        Assert.areEqual(msg, saveError('Google', null));
        Assert.areEqual(0, [SELECT COUNT() FROM Final_Settings__c]);
        try {
            FinalSettingsController.testAddressConnection('Google', null);
            Assert.fail('should refuse');
        } catch (AuraHandledException e) {
            Assert.areEqual(msg, e.getMessage());
        }
    }

    @IsTest
    static void testConnectionReturnsTheCount() {
        FinalSettingsController.manageOverride = true;
        FinalAddressService.providerOverride = new FakeProvider();
        canned = new List<FinalAddress.Suggestion>{
            sug('a'),
            sug('b'),
            sug('c')
        };
        FinalSettingsController.TestResult r = FinalSettingsController.testAddressConnection(
            'Google',
            null
        );
        Assert.isTrue(r.ok);
        Assert.areEqual(3, r.count);
        Assert.isNull(r.code);
    }

    @IsTest
    static void testConnectionFailureComesBackAsACode() {
        FinalSettingsController.manageOverride = true;
        FinalAddressService.providerOverride = new FakeProvider();
        failStatus = 403;
        FinalSettingsController.TestResult r = FinalSettingsController.testAddressConnection(
            'Google',
            null
        );
        Assert.isFalse(r.ok);
        Assert.areEqual('KEY_REFUSED', r.code);
        Assert.isNull(r.count);
    }

    @IsTest
    static void testConnectionWithNoProviderIsNotSetUp() {
        FinalSettingsController.manageOverride = true;
        FinalSettingsController.TestResult r = FinalSettingsController.testAddressConnection(
            'None',
            null
        );
        Assert.isFalse(r.ok);
        Assert.areEqual('NOT_SET_UP', r.code);
    }
}
