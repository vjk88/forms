/**
 * FinalSpecLanguage — which of a form's offered languages to show, and the
 * translated author text for it (IMPL_PLAN_TRANSLATIONS §1-§2). Mirrors the
 * browser rules in c/finalTranslate (pickLanguage / localizeSpec), for the few
 * texts Apex itself produces before the viewer loads (the closed message).
 *
 * Spec shape: languages = { default, available: [codes] } and
 * translations = { <code>: { <key>: <text> } }. Touches no data.
 */
public with sharing class FinalSpecLanguage {
    private static final Pattern CODE = Pattern.compile(
        '^[a-z]{2,3}([_-][A-Za-z]{2})?$'
    );

    /** "fr", "fr_CA" or "fr-CA" -> "fr" / "fr_CA"; anything else -> null. */
    public static String normalize(String lang) {
        if (String.isBlank(lang) || !CODE.matcher(lang.trim()).matches()) {
            return null;
        }
        List<String> parts = lang.trim().split('[_-]');
        return parts.size() > 1
            ? parts[0] + '_' + parts[1].toUpperCase()
            : parts[0];
    }

    /**
     * The language to RECORD on a response: the respondent's language when
     * the form offers exactly that code (fr-CA is read as fr_CA), otherwise
     * the form's default; a spec with no `languages` block -> null. Unlike
     * pick() there is no base/regional matching: we store what was seen.
     */
    public static String stored(Map<String, Object> spec, String lang) {
        Map<String, Object> languages = spec == null
            ? null
            : asMap(spec.get('languages'));
        if (languages == null) {
            return null;
        }
        String code = normalize(lang);
        Object offered = languages.get('available');
        if (code != null && offered instanceof List<Object>) {
            for (Object o : (List<Object>) offered) {
                if (o instanceof String && normalize((String) o) == code) {
                    return code;
                }
            }
        }
        Object def = languages.get('default');
        return def instanceof String ? normalize((String) def) : null;
    }

    private static String baseOf(String code) {
        return code == null ? null : code.split('_')[0];
    }

    /**
     * The first candidate (in order: link param, then browser languages) the
     * form offers: exact code, then its base language (fr_CA -> fr), then an
     * offered regional variant (fr -> fr_CA). None offered -> the form's
     * default language. A spec with no `languages` block -> null.
     */
    public static String pick(Map<String, Object> spec, List<String> langs) {
        Map<String, Object> languages = spec == null
            ? null
            : asMap(spec.get('languages'));
        if (languages == null) {
            return null;
        }
        List<String> available = new List<String>();
        Object offered = languages.get('available');
        if (offered instanceof List<Object>) {
            for (Object o : (List<Object>) offered) {
                String code = o instanceof String
                    ? normalize((String) o)
                    : null;
                if (code != null) {
                    available.add(code);
                }
            }
        }
        for (String candidate : langs == null ? new List<String>() : langs) {
            String hit = match(normalize(candidate), available);
            if (hit != null) {
                return hit;
            }
        }
        Object def = languages.get('default');
        return def instanceof String ? normalize((String) def) : null;
    }

    private static String match(String code, List<String> available) {
        if (code == null) {
            return null;
        }
        String base = baseOf(code);
        for (String a : available) {
            if (a == code) {
                return a;
            }
        }
        for (String a : available) {
            if (a == base) {
                return a;
            }
        }
        for (String a : available) {
            if (baseOf(a) == base) {
                return a;
            }
        }
        return null;
    }

    /**
     * The translation of `key` (for example 'closed.message') in `lang`:
     * the exact code, then its base language. A missing or blank one returns
     * `fallback`, so a text is never blank.
     */
    public static String text(
        Map<String, Object> spec,
        String lang,
        String key,
        String fallback
    ) {
        String code = normalize(lang);
        Map<String, Object> all = spec == null
            ? null
            : asMap(spec.get('translations'));
        if (code == null || all == null) {
            return fallback;
        }
        for (String c : new List<String>{ code, baseOf(code) }) {
            Map<String, Object> table = asMap(all.get(c));
            Object value = table == null ? null : table.get(key);
            if (value instanceof String && String.isNotBlank((String) value)) {
                return (String) value;
            }
        }
        return fallback;
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }
}
