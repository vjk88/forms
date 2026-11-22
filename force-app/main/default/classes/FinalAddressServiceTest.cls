@IsTest
private class FinalAddressServiceTest {
    // Apex has no static members on inner classes, so the fake's knobs live here.
    private static Integer suggestCalls = 0;
    private static Integer detailsCalls = 0;
    private static FinalAddress.Query lastQuery;
    private static String lastDetailsId;
    private static String lastDetailsToken;
    private static List<FinalAddress.Suggestion> canned;
    private static FinalAddress.Result cannedResult;
    private static Exception toThrow;

    public class FakeProvider implements FinalAddressProvider {
        public List<FinalAddress.Suggestion> suggest(FinalAddress.Query q) {
            suggestCalls++;
            lastQuery = q;
            if (toThrow != null) {
                throw toThrow;
            }
            return canned;
        }

        public FinalAddress.Result details(String id, String sessionToken) {
            detailsCalls++;
            lastDetailsId = id;
            lastDetailsToken = sessionToken;
            if (toThrow != null) {
                throw toThrow;
            }
            return cannedResult;
        }
    }

    public class NotAProvider {
    }

    private class GoogleMock implements HttpCalloutMock {
        Integer calls = 0;

        public HttpResponse respond(HttpRequest req) {
            calls++;
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody(
                '{"suggestions":[{"placePrediction":{"placeId":"g1","structuredFormat":{"mainText":{"text":"Main St"}}}}]}'
            );
            return res;
        }
    }

    // ----- helpers -----

    private static void useFake(String providerName) {
        FinalAddressService.providerOverride = new FakeProvider();
        FinalAddressService.providerNameOverride = providerName;
    }

    private static FinalAddress.Suggestion sug(String id, String title) {
        FinalAddress.Suggestion s = new FinalAddress.Suggestion();
        s.id = id;
        s.title = title;
        return s;
    }

    private static String suggestCode(
        String text,
        String token,
        String container
    ) {
        try {
            FinalAddressService.suggest(text, token, container);
        } catch (FinalAddressService.AddressException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    private static String detailsCode(String id, String token) {
        try {
            FinalAddressService.details(id, token);
        } catch (FinalAddressService.AddressException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    private static void setting(String provider, String className) {
        insert new Final_Settings__c(
            Name = 'org',
            Address_Provider__c = provider,
            Address_Apex_Class__c = className
        );
    }

    // ----- suggest: input guards -----

    @IsTest
    static void shortTextReturnsEmptyWithoutCallingProvider() {
        useFake('Custom');
        canned = new List<FinalAddress.Suggestion>{ sug('1', 'x') };
        Assert.isTrue(FinalAddressService.suggest('ab', null, null).isEmpty());
        Assert.isTrue(
            FinalAddressService.suggest('  a    ', null, null).isEmpty()
        );
        Assert.isTrue(FinalAddressService.suggest(null, null, null).isEmpty());
        Assert.areEqual(0, suggestCalls);
    }

    @IsTest
    static void shortTextWithContainerStillCallsProvider() {
        useFake('Custom');
        canned = new List<FinalAddress.Suggestion>{ sug('1', 'x') };
        FinalAddressService.suggest('', null, 'group-1');
        Assert.areEqual(1, suggestCalls);
        Assert.areEqual('group-1', lastQuery.container);
    }

    @IsTest
    static void whitespaceCollapsedAndTextCutAt100() {
        useFake('Custom');
        canned = new List<FinalAddress.Suggestion>();
        String raw = '  ' + 'x'.repeat(150) + '   y';
        FinalAddressService.suggest(raw, 'token-12345', null);
        Assert.areEqual(100, lastQuery.text.length());
        Assert.areEqual('x'.repeat(100), lastQuery.text);
        Assert.areEqual('token-12345', lastQuery.sessionToken);

        FinalAddressService.suggest('12  main \t street', null, null);
        Assert.areEqual('12 main street', lastQuery.text);
        Assert.isNull(lastQuery.sessionToken);
        Assert.isNull(lastQuery.container);
    }

    @IsTest
    static void badTokenAndContainerAreBadInput() {
        useFake('Custom');
        canned = new List<FinalAddress.Suggestion>();
        Assert.areEqual('BAD_INPUT', suggestCode('main street', 'short', null));
        Assert.areEqual(
            'BAD_INPUT',
            suggestCode('main street', 'has space in it', null)
        );
        Assert.areEqual(
            'BAD_INPUT',
            suggestCode('main street', 'x'.repeat(37), null)
        );
        Assert.areEqual(
            'BAD_INPUT',
            suggestCode('main street', 'token-12345', 'two words')
        );
        Assert.areEqual(
            'BAD_INPUT',
            suggestCode('main street', 'token-12345', 'x'.repeat(513))
        );
        Assert.areEqual('BAD_INPUT', detailsCode('place 1', null));
        Assert.areEqual('BAD_INPUT', detailsCode(null, null));
        Assert.areEqual('BAD_INPUT', detailsCode('x'.repeat(513), null));
        Assert.areEqual('BAD_INPUT', detailsCode('place1', 'bad token!'));
        Assert.areEqual(0, suggestCalls + detailsCalls);
    }

    // ----- suggest: output guards -----

    @IsTest
    static void resultsTrimmedToFiveAndBadRowsDropped() {
        useFake('Custom');
        canned = new List<FinalAddress.Suggestion>{
            sug('1', 'one'),
            null,
            sug('', 'blank id'),
            sug('x'.repeat(513), 'long id')
        };
        for (Integer i = 2; i <= 8; i++) {
            canned.add(sug('id' + i, 'row ' + i));
        }
        List<FinalAddress.Suggestion> out = FinalAddressService.suggest(
            'main street',
            null,
            null
        );
        Assert.areEqual(5, out.size());
        Assert.areEqual('1', out[0].id);
        Assert.areEqual('id2', out[1].id);
        Assert.areEqual('id5', out[4].id);
    }

    @IsTest
    static void suggestionTextIsStrippedCappedAndIsGroupDefaulted() {
        useFake('Custom');
        FinalAddress.Suggestion s = sug(
            '1',
            '<b>Bold</b> <script>x</script> title'
        );
        s.subtitle = 'y'.repeat(300);
        FinalAddress.Suggestion g = sug('2', 'Group');
        g.isGroup = true;
        canned = new List<FinalAddress.Suggestion>{ s, g };
        List<FinalAddress.Suggestion> out = FinalAddressService.suggest(
            'main street',
            null,
            null
        );
        Assert.isFalse(out[0].title.contains('<'));
        Assert.isTrue(out[0].title.startsWith('Bold'));
        Assert.areEqual(255, out[0].subtitle.length());
        Assert.isFalse(out[0].isGroup, 'null becomes false');
        Assert.isTrue(out[1].isGroup);
    }

    @IsTest
    static void nullProviderListIsEmpty() {
        useFake('Custom');
        canned = null;
        Assert.isTrue(
            FinalAddressService.suggest('main street', null, null).isEmpty()
        );
    }

    // ----- details -----

    @IsTest
    static void detailsAreCleanedAndCapped() {
        useFake('Custom');
        FinalAddress.Result r = new FinalAddress.Result();
        r.street = ' <i>1 Main</i>\nApt 2 ';
        r.city = 'c'.repeat(60);
        r.province = 'p'.repeat(100);
        r.provinceCode = 'q'.repeat(20);
        r.postalCode = 'z'.repeat(30);
        r.country = 'k'.repeat(100);
        r.countryCode = '   ';
        r.latitude = 10.5;
        r.longitude = 20.5;
        cannedResult = r;

        FinalAddress.Result out = FinalAddressService.details(
            'place1',
            'token-12345'
        );
        Assert.areEqual('place1', lastDetailsId);
        Assert.areEqual('token-12345', lastDetailsToken);
        Assert.areEqual('1 Main\nApt 2', out.street);
        Assert.areEqual(40, out.city.length());
        Assert.areEqual(80, out.province.length());
        Assert.areEqual(10, out.provinceCode.length());
        Assert.areEqual(20, out.postalCode.length());
        Assert.areEqual(80, out.country.length());
        Assert.isNull(out.countryCode, 'blank becomes null');
        Assert.areEqual(10.5, out.latitude);
        Assert.areEqual(20.5, out.longitude);
    }

    @IsTest
    static void outOfRangeCoordinatesAreBothDropped() {
        useFake('Custom');
        FinalAddress.Result r = new FinalAddress.Result();
        r.city = 'Town';
        r.latitude = 91;
        r.longitude = 10;
        cannedResult = r;
        FinalAddress.Result out = FinalAddressService.details('place1', null);
        Assert.isNull(out.latitude);
        Assert.isNull(out.longitude);
        Assert.areEqual('Town', out.city);

        r.latitude = 10;
        r.longitude = -181;
        out = FinalAddressService.details('place1', null);
        Assert.isNull(out.latitude);
        Assert.isNull(out.longitude);

        r.longitude = null;
        out = FinalAddressService.details('place1', null);
        Assert.isNull(out.latitude, 'half a pair is no pair');
    }

    @IsTest
    static void nullDetailsResultIsDown() {
        useFake('Custom');
        cannedResult = null;
        Assert.areEqual('DOWN', detailsCode('place1', null));
    }

    // ----- failure mapping -----

    @IsTest
    static void failureMapping() {
        useFake('Google');
        canned = new List<FinalAddress.Suggestion>();

        toThrow = FinalAddress.failed(403);
        Assert.areEqual('KEY_REFUSED', suggestCode('main street', null, null));
        Assert.areEqual('KEY_REFUSED', detailsCode('place1', null));
        toThrow = FinalAddress.failed(401);
        Assert.areEqual('KEY_REFUSED', suggestCode('main street', null, null));
        toThrow = FinalAddress.failed(429);
        Assert.areEqual('LIMIT', suggestCode('main street', null, null));
        Assert.areEqual('LIMIT', detailsCode('place1', null));
        toThrow = FinalAddress.failed(500);
        Assert.areEqual('DOWN', suggestCode('main street', null, null));

        CalloutException noAccess = new CalloutException();
        noAccess.setMessage(
            'You don\'t have read permissions on the User External Credential object'
        );
        toThrow = noAccess;
        Assert.areEqual('NO_ACCESS', suggestCode('main street', null, null));
        Assert.areEqual('NO_ACCESS', detailsCode('place1', null));

        CalloutException extCred = new CalloutException();
        extCred.setMessage('Unable to find the External Credential principal');
        toThrow = extCred;
        Assert.areEqual('NO_ACCESS', suggestCode('main street', null, null));

        // the platform's own words when no key is on the principal yet
        CalloutException noKey = new CalloutException();
        noKey.setMessage(
            'Field Final_Address_Google.Key does not exist. Check spelling.'
        );
        toThrow = noKey;
        Assert.areEqual('NO_KEY', suggestCode('main street', null, null));
        Assert.areEqual('NO_KEY', detailsCode('place1', null));

        CalloutException timeout = new CalloutException();
        timeout.setMessage('Read timed out');
        toThrow = timeout;
        Assert.areEqual('DOWN', suggestCode('main street', null, null));
        Assert.areEqual('DOWN', detailsCode('place1', null));

        CalloutException noMessage = new CalloutException();
        toThrow = noMessage;
        Assert.areEqual('DOWN', suggestCode('main street', null, null));
    }

    @IsTest
    static void customProviderRuntimeErrorIsDown() {
        useFake('Custom');
        toThrow = new MathException();
        Assert.areEqual('DOWN', suggestCode('main street', null, null));
        Assert.areEqual('DOWN', detailsCode('place1', null));
    }

    @IsTest
    static void providerThrowingAddressExceptionPassesThrough() {
        useFake('Custom');
        toThrow = new FinalAddressService.AddressException('LIMIT');
        Assert.areEqual('LIMIT', suggestCode('main street', null, null));
        Assert.areEqual('LIMIT', detailsCode('place1', null));
    }

    // ----- provider resolution + status -----

    @IsTest
    static void noProviderIsNotSetUp() {
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
        Assert.areEqual('NOT_SET_UP', detailsCode('place1', null));
        FinalAddressService.providerNameOverride = 'None';
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
        FinalAddressService.providerNameOverride = 'Loqate';
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
    }

    @IsTest
    static void googleSettingUsesTheGoogleAdapter() {
        setting('Google', null);
        GoogleMock m = new GoogleMock();
        Test.setMock(HttpCalloutMock.class, m);
        Test.startTest();
        List<FinalAddress.Suggestion> out = FinalAddressService.suggest(
            'main street',
            null,
            null
        );
        Test.stopTest();
        Assert.areEqual(1, m.calls);
        Assert.areEqual('g1', out[0].id);
        Assert.areEqual('Main St', out[0].title);
    }

    @IsTest
    static void googleNameOverrideUsesTheGoogleAdapter() {
        FinalAddressService.providerNameOverride = 'Google';
        GoogleMock m = new GoogleMock();
        Test.setMock(HttpCalloutMock.class, m);
        Test.startTest();
        FinalAddressService.suggest('main street', null, null);
        Test.stopTest();
        Assert.areEqual(1, m.calls);
    }

    @IsTest
    static void customWithBadClassNameIsNotSetUp() {
        setting('Custom', 'NoSuchClassAnywhere');
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
        Assert.isFalse(FinalAddressService.status().configured);
    }

    @IsTest
    static void customWithClassThatIsNotAProviderIsNotSetUp() {
        setting('Custom', 'FinalAddressServiceTest.NotAProvider');
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
    }

    @IsTest
    static void customWithBlankClassIsNotSetUp() {
        setting('Custom', '  ');
        Assert.areEqual('NOT_SET_UP', suggestCode('main street', null, null));
    }

    @IsTest
    static void customWithRealProviderClassWorks() {
        setting('Custom', 'FinalAddressServiceTest.FakeProvider');
        canned = new List<FinalAddress.Suggestion>{ sug('c1', 'Custom row') };
        List<FinalAddress.Suggestion> out = FinalAddressService.suggest(
            'main street',
            null,
            null
        );
        Assert.areEqual(1, suggestCalls);
        Assert.areEqual('c1', out[0].id);
        Assert.isTrue(FinalAddressService.status().configured);
    }

    @IsTest
    static void statusPerProvider() {
        FinalAddressService.Status s = FinalAddressService.status();
        Assert.isFalse(s.configured);
        Assert.areEqual('None', s.provider);

        FinalAddressService.providerNameOverride = 'Google';
        s = FinalAddressService.status();
        Assert.isTrue(s.configured);
        Assert.areEqual('Google', s.provider);
        Assert.areEqual('Google Places', s.providerLabel);
        Assert.areEqual('Results by Google', s.attribution);

        FinalAddressService.providerNameOverride = 'Loqate';
        s = FinalAddressService.status();
        Assert.isFalse(s.configured, 'adapter not built yet');
        Assert.areEqual('Loqate', s.providerLabel);
        Assert.areEqual('Results by Loqate', s.attribution);

        FinalAddressService.providerNameOverride = 'Custom';
        s = FinalAddressService.status();
        Assert.isFalse(s.configured, 'no class named');
        Assert.areEqual('Your own provider', s.providerLabel);
        Assert.isNull(s.attribution);

        FinalAddressService.providerNameOverride = 'None';
        Assert.isFalse(FinalAddressService.status().configured);
    }

    @IsTest
    static void statusReadsTheSetting() {
        setting('Google', null);
        Assert.areEqual('Google', FinalAddressService.status().provider);
    }

    // ----- toAura -----

    @IsTest
    static void toAuraCarriesPrefixedCode() {
        AuraHandledException a = FinalAddressService.toAura(
            new FinalAddressService.AddressException('DOWN')
        );
        Assert.areEqual('FINAL_ADDR:DOWN', a.getMessage());
        Assert.areEqual('FINAL_ADDR:', FinalAddressService.PREFIX);
    }

    // ----- requireSearchQuestion -----

    private static Map<String, Object> spec(
        String type,
        String inputType,
        Object addressSearch,
        Boolean inRepeat
    ) {
        Map<String, Object> cfg = new Map<String, Object>{
            'inputType' => inputType
        };
        if (addressSearch != null) {
            cfg.put('addressSearch', addressSearch);
        }
        Map<String, Object> section = new Map<String, Object>{
            'id' => 's1',
            'elements' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'other',
                    'type' => 'field',
                    'config' => new Map<String, Object>()
                },
                new Map<String, Object>{
                    'id' => 'addr1',
                    'type' => type,
                    'config' => cfg
                }
            }
        };
        if (inRepeat) {
            section.put('repeat', new Map<String, Object>{ 'min' => 1 });
        }
        return new Map<String, Object>{
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'p1',
                    'sections' => new List<Object>{ section }
                }
            }
        };
    }

    private static String requireCode(
        Map<String, Object> spec,
        String elementId
    ) {
        try {
            FinalAddressService.requireSearchQuestion(spec, elementId);
        } catch (FinalAddressService.AddressException e) {
            return e.getMessage();
        }
        return 'OK';
    }

    @IsTest
    static void requireSearchQuestionAcceptsAnAddressQuestionWithSearchOn() {
        Assert.areEqual(
            'OK',
            requireCode(spec('field', 'address', true, false), 'addr1')
        );
    }

    @IsTest
    static void requireSearchQuestionWalksRepeatSections() {
        Assert.areEqual(
            'OK',
            requireCode(spec('field', 'address', true, true), 'addr1')
        );
    }

    @IsTest
    static void requireSearchQuestionRefusals() {
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', true, false), 'nope'),
            'wrong id'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('heading', 'address', true, false), 'addr1'),
            'type is not field'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'text', true, false), 'addr1'),
            'input type is not address'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', false, false), 'addr1'),
            'search is off'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', null, false), 'addr1'),
            'search never set'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', 'true', false), 'addr1'),
            'a string is not true'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', true, false), 'other'),
            'element has no address config'
        );
        Assert.areEqual('NOT_ALLOWED', requireCode(null, 'addr1'), 'no spec');
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(spec('field', 'address', true, false), ' '),
            'blank id'
        );
        Assert.areEqual(
            'NOT_ALLOWED',
            requireCode(new Map<String, Object>(), 'addr1'),
            'empty spec'
        );
    }
}
