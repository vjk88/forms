@IsTest
private class FinalAddressGoogleTest {
    private class Mock implements HttpCalloutMock {
        HttpRequest seen;
        Integer status;
        String body;

        Mock(Integer status, String body) {
            this.status = status;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest req) {
            seen = req;
            HttpResponse res = new HttpResponse();
            res.setStatusCode(status);
            res.setBody(body);
            return res;
        }
    }

    private static final String AUTOCOMPLETE =
        '{"suggestions":[' +
        '{"placePrediction":{"placeId":"abc123","text":{"text":"1600 Amphitheatre Pkwy, Mountain View, CA, USA"},' +
        '"structuredFormat":{"mainText":{"text":"1600 Amphitheatre Parkway"},"secondaryText":{"text":"Mountain View, CA, USA"}}}},' +
        '{"queryPrediction":{"text":{"text":"pizza near me"}}},' +
        '{"placePrediction":{"placeId":"def456","text":{"text":"Plain text only"}}}' +
        ']}';

    private static final String DETAILS =
        '{"addressComponents":[' +
        '{"longText":"1600","shortText":"1600","types":["street_number"]},' +
        '{"longText":"Amphitheatre Parkway","shortText":"Amphitheatre Pkwy","types":["route"]},' +
        '{"longText":"Suite 5","shortText":"Suite 5","types":["subpremise"]},' +
        '{"longText":"Mountain View","shortText":"Mountain View","types":["locality","political"]},' +
        '{"longText":"California","shortText":"CA","types":["administrative_area_level_1","political"]},' +
        '{"longText":"United States","shortText":"US","types":["country","political"]},' +
        '{"longText":"94043","shortText":"94043","types":["postal_code"]}' +
        '],"location":{"latitude":37.4220,"longitude":-122.0841}}';

    @IsTest
    static void autocompleteParsesPlacePredictionsOnly() {
        Mock m = new Mock(200, AUTOCOMPLETE);
        Test.setMock(HttpCalloutMock.class, m);
        FinalAddress.Query q = new FinalAddress.Query();
        q.text = '1600 amph';
        q.sessionToken = 'session-token-1';

        Test.startTest();
        List<FinalAddress.Suggestion> out = new FinalAddressGoogle().suggest(q);
        Test.stopTest();

        Assert.areEqual(2, out.size(), 'queryPrediction is skipped');
        Assert.areEqual('abc123', out[0].id);
        Assert.areEqual('1600 Amphitheatre Parkway', out[0].title);
        Assert.areEqual('Mountain View, CA, USA', out[0].subtitle);
        Assert.isFalse(out[0].isGroup);
        Assert.areEqual('def456', out[1].id);
        Assert.areEqual(
            'Plain text only',
            out[1].title,
            'falls back to text.text'
        );
        Assert.isNull(out[1].subtitle);

        Assert.areEqual('POST', m.seen.getMethod());
        Assert.areEqual(
            'callout:Final_Address_Google/v1/places:autocomplete',
            m.seen.getEndpoint()
        );
        Map<String, Object> sent = (Map<String, Object>) JSON.deserializeUntyped(
            m.seen.getBody()
        );
        Assert.areEqual('1600 amph', sent.get('input'));
        Assert.areEqual('session-token-1', sent.get('sessionToken'));
    }

    @IsTest
    static void autocompleteOmitsBlankSessionToken() {
        Mock m = new Mock(200, '{"suggestions":[]}');
        Test.setMock(HttpCalloutMock.class, m);
        FinalAddress.Query q = new FinalAddress.Query();
        q.text = 'abc';

        Test.startTest();
        List<FinalAddress.Suggestion> out = new FinalAddressGoogle().suggest(q);
        Test.stopTest();

        Assert.isTrue(out.isEmpty());
        Map<String, Object> sent = (Map<String, Object>) JSON.deserializeUntyped(
            m.seen.getBody()
        );
        Assert.isFalse(sent.containsKey('sessionToken'));
    }

    @IsTest
    static void detailsParsesComponents() {
        Mock m = new Mock(200, DETAILS);
        Test.setMock(HttpCalloutMock.class, m);

        Test.startTest();
        FinalAddress.Result r = new FinalAddressGoogle()
            .details('ChIJ/abc 1', 'session-token-1');
        Test.stopTest();

        Assert.areEqual('1600 Amphitheatre Parkway\nSuite 5', r.street);
        Assert.areEqual('Mountain View', r.city);
        Assert.areEqual('California', r.province);
        Assert.areEqual('CA', r.provinceCode);
        Assert.areEqual('94043', r.postalCode);
        Assert.areEqual('United States', r.country);
        Assert.areEqual('US', r.countryCode);
        Assert.areEqual(37.4220, r.latitude);
        Assert.areEqual(-122.0841, r.longitude);

        Assert.areEqual('GET', m.seen.getMethod());
        Assert.areEqual(
            'callout:Final_Address_Google/v1/places/' +
                EncodingUtil.urlEncode('ChIJ/abc 1', 'UTF-8') +
                '?sessionToken=session-token-1',
            m.seen.getEndpoint()
        );
        Assert.areEqual(
            'addressComponents,location',
            m.seen.getHeader('X-Goog-FieldMask')
        );
    }

    @IsTest
    static void detailsFallsBackToPostalTownAndPremise() {
        Mock m = new Mock(
            200,
            '{"addressComponents":[' +
                '{"longText":"The Old Mill","shortText":"Mill","types":["premise"]},' +
                '{"longText":"Bath","shortText":"Bath","types":["postal_town"]},' +
                '{"longText":"England","shortText":"England","types":["administrative_area_level_1"]},' +
                '{"longText":"BA1 1AA","shortText":"BA1 1AA","types":["postal_code"]}' +
                ']}'
        );
        Test.setMock(HttpCalloutMock.class, m);

        Test.startTest();
        FinalAddress.Result r = new FinalAddressGoogle()
            .details('place1', null);
        Test.stopTest();

        Assert.areEqual('The Old Mill', r.street);
        Assert.areEqual('Bath', r.city);
        Assert.isNull(r.latitude);
        Assert.isNull(r.longitude);
        Assert.areEqual(
            'callout:Final_Address_Google/v1/places/place1',
            m.seen.getEndpoint(),
            'no sessionToken query string when blank'
        );
    }

    @IsTest
    static void detailsWithNothingUsableGivesEmptyResult() {
        Test.setMock(HttpCalloutMock.class, new Mock(200, '{}'));
        Test.startTest();
        FinalAddress.Result r = new FinalAddressGoogle()
            .details('place1', null);
        Test.stopTest();
        Assert.isNull(r.street);
        Assert.isNull(r.city);
        Assert.isNull(r.countryCode);
    }

    @IsTest
    static void badStatusThrowsWithStatus() {
        Test.setMock(HttpCalloutMock.class, new Mock(403, '{"error":{}}'));
        FinalAddress.Query q = new FinalAddress.Query();
        q.text = 'abc';
        Test.startTest();
        try {
            new FinalAddressGoogle().suggest(q);
            Assert.fail('expected ProviderException');
        } catch (FinalAddress.ProviderException e) {
            Assert.areEqual(403, e.httpStatus);
        }
        Test.stopTest();
    }

    @IsTest
    static void malformedJsonIs502() {
        Test.setMock(HttpCalloutMock.class, new Mock(200, '<html>nope'));
        Test.startTest();
        try {
            new FinalAddressGoogle().details('place1', null);
            Assert.fail('expected ProviderException');
        } catch (FinalAddress.ProviderException e) {
            Assert.areEqual(502, e.httpStatus);
        }
        Test.stopTest();
    }

    @IsTest
    static void nonObjectJsonIs502() {
        Test.setMock(HttpCalloutMock.class, new Mock(200, '[1,2]'));
        Test.startTest();
        try {
            new FinalAddressGoogle().details('place1', null);
            Assert.fail('expected ProviderException');
        } catch (FinalAddress.ProviderException e) {
            Assert.areEqual(502, e.httpStatus);
        }
        Test.stopTest();
    }
}
