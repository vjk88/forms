/**
 * FinalAddressGoogle - address search through Google Places API (New).
 *
 * The call goes to the Named Credential Final_Address_Google. Its External
 * Credential adds the API key as the X-Goog-Api-Key header, so this class (and
 * the browser) never see the key.
 *
 * Parsing is deliberately defensive: Google owns the response shape, so every
 * read tolerates a missing or differently typed value, and anything that is
 * not JSON at all becomes a ProviderException with status 502 ("bad gateway":
 * the provider answered, but with nonsense).
 */
public with sharing class FinalAddressGoogle implements FinalAddressProvider {
    private static final String ENDPOINT = 'callout:Final_Address_Google';
    private static final Integer TIMEOUT_MS = 5000;

    public List<FinalAddress.Suggestion> suggest(FinalAddress.Query q) {
        Map<String, Object> body = new Map<String, Object>{ 'input' => q.text };
        if (!String.isBlank(q.sessionToken)) {
            body.put('sessionToken', q.sessionToken);
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT + '/v1/places:autocomplete');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody(JSON.serialize(body));
        req.setTimeout(TIMEOUT_MS);
        Map<String, Object> payload = send(req);

        List<FinalAddress.Suggestion> out = new List<FinalAddress.Suggestion>();
        for (Object entry : asList(payload.get('suggestions'))) {
            Map<String, Object> row = asMap(entry);
            // queryPrediction rows are search phrases, not places; skip them
            Map<String, Object> pred = row == null
                ? null
                : asMap(row.get('placePrediction'));
            if (pred == null) {
                continue;
            }
            Map<String, Object> structured = asMap(
                pred.get('structuredFormat')
            );
            FinalAddress.Suggestion s = new FinalAddress.Suggestion();
            s.id = asString(pred.get('placeId'));
            s.title = textOf(
                structured == null ? null : structured.get('mainText')
            );
            if (s.title == null) {
                s.title = textOf(pred.get('text'));
            }
            s.subtitle = textOf(
                structured == null ? null : structured.get('secondaryText')
            );
            s.isGroup = false;
            out.add(s);
        }
        return out;
    }

    public FinalAddress.Result details(String id, String sessionToken) {
        String url =
            ENDPOINT +
            '/v1/places/' +
            EncodingUtil.urlEncode(id, 'UTF-8');
        if (!String.isBlank(sessionToken)) {
            url +=
                '?sessionToken=' +
                EncodingUtil.urlEncode(sessionToken, 'UTF-8');
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint(url);
        req.setMethod('GET');
        // ask only for what we use: Google bills by the fields requested
        req.setHeader('X-Goog-FieldMask', 'addressComponents,location');
        req.setTimeout(TIMEOUT_MS);
        Map<String, Object> payload = send(req);

        // first component of each type wins
        Map<String, Map<String, Object>> byType = new Map<String, Map<String, Object>>();
        for (Object c : asList(payload.get('addressComponents'))) {
            Map<String, Object> comp = asMap(c);
            if (comp == null) {
                continue;
            }
            for (Object typeObj : asList(comp.get('types'))) {
                String type = asString(typeObj);
                if (type != null && !byType.containsKey(type)) {
                    byType.put(type, comp);
                }
            }
        }

        FinalAddress.Result r = new FinalAddress.Result();
        String num = longOf(byType, 'street_number');
        String route = longOf(byType, 'route');
        if (route == null) {
            route = longOf(byType, 'premise');
        }
        String street = ((num == null ? '' : num) +
            ' ' +
            (route == null ? '' : route))
            .trim();
        String sub = longOf(byType, 'subpremise');
        if (sub != null) {
            street = street + '\n' + sub;
        }
        street = street.trim();
        r.street = street == '' ? null : street;
        for (
            String cityType : new List<String>{
                'locality',
                'postal_town',
                'sublocality_level_1',
                'sublocality',
                'administrative_area_level_3',
                'administrative_area_level_2'
            }
        ) {
            r.city = longOf(byType, cityType);
            if (r.city != null) {
                break;
            }
        }
        r.province = longOf(byType, 'administrative_area_level_1');
        r.provinceCode = shortOf(byType, 'administrative_area_level_1');
        r.postalCode = longOf(byType, 'postal_code');
        r.country = longOf(byType, 'country');
        r.countryCode = shortOf(byType, 'country');
        Map<String, Object> loc = asMap(payload.get('location'));
        if (loc != null) {
            r.latitude = asDecimal(loc.get('latitude'));
            r.longitude = asDecimal(loc.get('longitude'));
        }
        return r;
    }

    // ---------------------------------------------------------------- helpers

    private static Map<String, Object> send(HttpRequest req) {
        HttpResponse res = new Http().send(req);
        Integer status = res.getStatusCode();
        if (status < 200 || status > 299) {
            throw FinalAddress.failed(status);
        }
        try {
            Object parsed = JSON.deserializeUntyped(res.getBody());
            if (parsed instanceof Map<String, Object>) {
                return (Map<String, Object>) parsed;
            }
        } catch (JSONException e) {
            // falls through to the 502 below
        }
        throw FinalAddress.failed(502);
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }

    private static String asString(Object o) {
        return o instanceof String ? (String) o : null;
    }

    private static Decimal asDecimal(Object o) {
        if (o == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    /** The `text` inside a Google FormattableText ({text: '...'}). */
    private static String textOf(Object formattable) {
        Map<String, Object> m = asMap(formattable);
        return m == null ? null : asString(m.get('text'));
    }

    private static String longOf(
        Map<String, Map<String, Object>> byType,
        String type
    ) {
        Map<String, Object> c = byType.get(type);
        return c == null ? null : blankToNull(asString(c.get('longText')));
    }

    private static String shortOf(
        Map<String, Map<String, Object>> byType,
        String type
    ) {
        Map<String, Object> c = byType.get(type);
        return c == null ? null : blankToNull(asString(c.get('shortText')));
    }

    private static String blankToNull(String s) {
        return String.isBlank(s) ? null : s;
    }
}
