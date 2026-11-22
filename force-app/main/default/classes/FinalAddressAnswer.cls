/**
 * FinalAddressAnswer - the one place an Address answer is understood on the
 * server (IMPL_PLAN_ADDRESS_INPUT, "The answer").
 *
 * The browser sends `{street, city, province, provinceCode, postalCode,
 * country, countryCode, latitude, longitude}` (any subset) or null. The
 * payload is plain JSON anyone can edit, so clean() re-sanitises it before it
 * is stored or checked; the validator and the submit service both go through
 * here so "blank", "required" and the stored text agree.
 *
 * `inherited sharing`: reads no records.
 */
public inherited sharing class FinalAddressAnswer {
    private static final Map<String, Integer> TEXT_LIMITS = new Map<String, Integer>{
        'street' => 255,
        'city' => 40,
        'province' => 80,
        'provinceCode' => 10,
        'postalCode' => 20,
        'country' => 80,
        'countryCode' => 10
    };

    private static final Map<String, String> PART_LABELS = new Map<String, String>{
        'street' => 'Street',
        'city' => 'City',
        'country' => 'Country',
        'province' => 'State / Province',
        'provinceCode' => 'State / Province code',
        'postalCode' => 'Zip / Postal code',
        'countryCode' => 'Country code',
        'latitude' => 'Latitude',
        'longitude' => 'Longitude'
    };

    /**
     * The parts a Freeform mapping can read, in the order the author sees
     * them, with the answer type each one is treated as (FinalMappingRules
     * .COMPATIBLE decides which fields take it).
     */
    private static final List<String> MAPPABLE_PARTS = new List<String>{
        'street',
        'city',
        'province',
        'provinceCode',
        'postalCode',
        'country',
        'countryCode',
        'latitude',
        'longitude'
    };

    /** An element that draws the Address question. */
    public static Boolean isAddress(Map<String, Object> el) {
        if (el == null || !(el.get('type') instanceof String)) {
            return false;
        }
        if ((String) el.get('type') != 'field') {
            return false;
        }
        Object cfg = el.get('config');
        if (!(cfg instanceof Map<String, Object>)) {
            return false;
        }
        Object input = ((Map<String, Object>) cfg).get('inputType');
        return input instanceof String &&
            ((String) input).toLowerCase() == 'address';
    }

    /**
     * @return only the known keys, trimmed, markup-free and capped; null
     *         when the value is not a map or no text part remains.
     */
    public static Map<String, Object> clean(Object raw) {
        if (!(raw instanceof Map<String, Object>)) {
            return null;
        }
        Map<String, Object> src = (Map<String, Object>) raw;
        Map<String, Object> out = new Map<String, Object>();
        for (String key : TEXT_LIMITS.keySet()) {
            Object v = src.get(key);
            if (!(v instanceof String)) {
                continue;
            }
            String s = cleanText(key, (String) v);
            if (String.isNotBlank(s)) {
                out.put(key, s);
            }
        }
        if (out.isEmpty()) {
            return null;
        }
        Decimal lat = asNumber(src.get('latitude'));
        Decimal lng = asNumber(src.get('longitude'));
        if (
            lat != null &&
            lng != null &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
        ) {
            out.put('latitude', lat);
            out.put('longitude', lng);
        }
        return out;
    }

    /** One line per part group: street, "city, province postalCode", country. */
    public static String format(Map<String, Object> a) {
        if (a == null) {
            return '';
        }
        List<String> lines = new List<String>();
        String street = text(a, 'street');
        if (street != null) {
            lines.add(street);
        }
        List<String> place = new List<String>();
        String city = text(a, 'city');
        String province = text(a, 'province');
        if (city != null) {
            place.add(city);
        }
        if (province != null) {
            place.add(province);
        }
        String locality = String.join(place, ', ');
        String zip = text(a, 'postalCode');
        if (zip != null) {
            locality = (locality.length() > 0 ? locality + ' ' : '') + zip;
        }
        if (locality.length() > 0) {
            lines.add(locality);
        }
        String country = text(a, 'country');
        if (country != null) {
            lines.add(country);
        }
        return String.join(lines, '\n');
    }

    /** 'street', 'city' or 'country' (that order) for the first blank one. */
    public static String firstMissingRequired(Map<String, Object> a) {
        for (String part : new List<String>{ 'street', 'city', 'country' }) {
            if (a == null || text(a, part) == null) {
                return part;
            }
        }
        return null;
    }

    public static String partLabel(String part) {
        String label = part == null ? null : PART_LABELS.get(part);
        return label == null ? part : label;
    }

    // ------------------------------------------------------------ mapping

    public static Boolean isPart(String part) {
        return part != null && MAPPABLE_PARTS.contains(part);
    }

    /** 'Number' for latitude and longitude; 'Choice' for the two codes, so
     *  they can fill State/Country code picklists (MailingCountryCode) as
     *  well as text fields; 'Text' for every other part. */
    public static String partAnswerType(String part) {
        if (part == 'latitude' || part == 'longitude') {
            return 'Number';
        }
        return part == 'provinceCode' ||
            part == 'countryCode'
            ? 'Choice'
            : 'Text';
    }

    /** Parts a respondent may leave out even when the question is required:
     *  only Street, City and Country are required, and the codes and
     *  coordinates exist only when the address came from a search pick. */
    public static Boolean isOptionalPart(String part) {
        return part != 'street' && part != 'city' && part != 'country';
    }

    /** `[{ key, label, answerType }]` for describeQuestions. */
    public static List<Map<String, String>> parts() {
        List<Map<String, String>> out = new List<Map<String, String>>();
        for (String part : MAPPABLE_PARTS) {
            out.add(
                new Map<String, String>{
                    'key' => part,
                    'label' => partLabel(part),
                    'answerType' => partAnswerType(part)
                }
            );
        }
        return out;
    }

    /**
     * The part a mapping source names, or null when it names none. A source
     * is `{ kind: 'answer', elementKey, part }` (the Studio's picker value
     * reads `answer:<elementKey>.<part>`; element ids never contain a dot).
     * A part that is not one of the nine comes back as written so the
     * validator can refuse it; callers test isPart().
     */
    public static String partOf(Map<String, Object> source) {
        if (source == null || source.get('part') == null) {
            return null;
        }
        return String.valueOf(source.get('part'));
    }

    /**
     * One part of a stored Address answer, as the plain Text or Number answer
     * the rest of the mapping pipeline already understands. Null when the
     * answer is not an address, the part is unknown, or nothing was entered
     * for it, which a mapping treats as an unanswered question.
     */
    public static Form_Submission_Answer__c partAnswer(
        Form_Submission_Answer__c a,
        String part
    ) {
        if (
            a == null ||
            a.Answer_Type__c != 'Address' ||
            !isPart(part) ||
            String.isBlank(a.Value_JSON__c)
        ) {
            return null;
        }
        Object v;
        try {
            v = ((Map<String, Object>) JSON.deserializeUntyped(a.Value_JSON__c))
                .get(part);
        } catch (Exception e) {
            return null;
        }
        if (v == null) {
            return null;
        }
        if (partAnswerType(part) == 'Number') {
            Decimal n = asNumber(v);
            return n == null
                ? null
                : new Form_Submission_Answer__c(
                      Answer_Type__c = 'Number',
                      Numeric_Value__c = n
                  );
        }
        String s = String.valueOf(v);
        return String.isBlank(s)
            ? null
            : new Form_Submission_Answer__c(
                  Answer_Type__c = 'Text',
                  Text_Value__c = s
              );
    }

    // ------------------------------------------------------------ helpers

    private static String text(Map<String, Object> a, String key) {
        Object v = a.get(key);
        return v instanceof String && String.isNotBlank((String) v)
            ? ((String) v).trim()
            : null;
    }

    private static String cleanText(String key, String raw) {
        String s;
        if (key == 'street') {
            List<String> kept = new List<String>();
            for (
                String line : raw.replace('\r\n', '\n')
                    .replace('\r', '\n')
                    .split('\n')
            ) {
                String c = line.stripHtmlTags().trim();
                if (c.length() > 0) {
                    kept.add(c);
                }
            }
            s = String.join(kept, '\n');
        } else {
            s = raw.stripHtmlTags().trim();
        }
        Integer cap = TEXT_LIMITS.get(key);
        return s.length() > cap ? s.substring(0, cap).trim() : s;
    }

    private static Decimal asNumber(Object v) {
        if (v == null || v instanceof Boolean) {
            return null;
        }
        if (v instanceof Decimal) {
            return (Decimal) v;
        }
        if (v instanceof Integer) {
            return Decimal.valueOf((Integer) v);
        }
        if (v instanceof Long) {
            return Decimal.valueOf((Long) v);
        }
        if (v instanceof Double) {
            return Decimal.valueOf((Double) v);
        }
        if (v instanceof String) {
            try {
                String s = ((String) v).trim();
                return s.length() == 0 ? null : Decimal.valueOf(s);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }
}
