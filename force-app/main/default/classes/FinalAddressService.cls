/**
 * FinalAddressService - the one place that picks the address provider, guards
 * what goes in and what comes out, and turns every failure into a plain code.
 *
 * Why it exists: the browser, the signed-in controller and (later) the guest
 * controller all reach a paid third-party service through here, so the rules
 * live once:
 *  - input is trimmed and bounded, so the endpoint is not a free pipe;
 *  - output is stripped of markup and length-capped, because a provider (or a
 *    customer's own class) is not trusted to hand back clean text;
 *  - the question must exist on the form's published spec with search switched
 *    on (requireSearchQuestion), so the endpoint is not a free geocoder.
 *
 * Failures throw AddressException whose message is exactly one code. Controllers
 * turn that into an AuraHandledException "FINAL_ADDR:<code>" (toAura). The
 * search text and place ids are never logged.
 */
public inherited sharing class FinalAddressService {
    public static final String PREFIX = 'FINAL_ADDR:';

    public static final String NOT_SET_UP = 'NOT_SET_UP';
    public static final String NOT_ALLOWED = 'NOT_ALLOWED';
    public static final String KEY_REFUSED = 'KEY_REFUSED';
    public static final String NO_ACCESS = 'NO_ACCESS';
    /** The provider is chosen but nobody has entered its key in Setup yet. */
    public static final String NO_KEY = 'NO_KEY';
    public static final String DOWN = 'DOWN';
    public static final String LIMIT_REACHED = 'LIMIT';
    public static final String BAD_INPUT = 'BAD_INPUT';

    /** The message is exactly one of the codes above. */
    public class AddressException extends Exception {
    }

    /** What Settings and the search box need to know about the provider. */
    public class Status {
        @AuraEnabled
        public Boolean configured;
        @AuraEnabled
        public String provider;
        @AuraEnabled
        public String providerLabel;
        @AuraEnabled
        public String attribution;
    }

    private static final Integer MIN_CHARS = 3;
    private static final Integer MAX_TEXT = 100;
    private static final Integer MAX_SUGGESTIONS = 5;
    private static final Integer MAX_ID = 512;
    private static final String SETTINGS_NAME = 'org';

    // ----- test seams -----

    /** When set, used instead of the provider the setting names. */
    @TestVisible
    private static FinalAddressProvider providerOverride;
    /** When set, used instead of Final_Settings__c.Address_Provider__c. */
    @TestVisible
    private static String providerNameOverride;

    // ---------------------------------------------------------------- public

    public static AuraHandledException toAura(AddressException e) {
        AuraHandledException a = new AuraHandledException(
            PREFIX + e.getMessage()
        );
        a.setMessage(PREFIX + e.getMessage());
        return a;
    }

    public static Status status() {
        String name = providerName();
        Status s = new Status();
        s.provider = name;
        s.configured = false;
        if (name == 'Google') {
            s.configured = true;
            s.providerLabel = 'Google Places';
            s.attribution = 'Results by Google';
        } else if (name == 'Loqate') {
            // the Loqate adapter is a later slice, so not usable yet
            s.providerLabel = 'Loqate';
            s.attribution = 'Results by Loqate';
        } else if (name == 'Custom') {
            s.configured = resolve(name, settingClassName()) != null;
            s.providerLabel = 'Your own provider';
        }
        return s;
    }

    public static List<FinalAddress.Suggestion> suggest(
        String text,
        String sessionToken,
        String container
    ) {
        String t = text == null ? '' : text.normalizeSpace();
        if (t.length() > MAX_TEXT) {
            t = t.substring(0, MAX_TEXT);
        }
        String token = checkToken(sessionToken);
        String box = String.isBlank(container) ? null : container;
        if (
            box != null && (box.length() > MAX_ID || box.containsWhitespace())
        ) {
            throw new AddressException(BAD_INPUT);
        }
        if (!willCallProvider(t, box)) {
            return new List<FinalAddress.Suggestion>();
        }
        return runSuggest(providerName(), settingClassName(), t, token, box);
    }

    /** Will suggest(text, ..., container) reach the provider (and so cost
     *  money)? False for text shorter than three characters with no group to
     *  open. Guest callers ask this before spending their cap, so the rule has
     *  one owner. */
    public static Boolean willCallProvider(String text, String container) {
        String t = text == null ? '' : text.normalizeSpace();
        return t.length() >= MIN_CHARS || !String.isBlank(container);
    }

    /** Test connection: one real suggest for a fixed search, through the
     *  provider the caller names (not necessarily the saved one). Returns how
     *  many addresses came back; failures throw AddressException like suggest. */
    public static Integer testProvider(String name, String className) {
        String n = String.isBlank(name) ? 'None' : name;
        if (n == 'None') {
            log(NOT_SET_UP, n);
            throw new AddressException(NOT_SET_UP);
        }
        return runSuggest(n, className, '1 Market St', null, null).size();
    }

    /** True when the class exists, has a public no-argument constructor and is
     *  a FinalAddressProvider. */
    public static Boolean isUsableClass(String className) {
        return instantiate(className) != null;
    }

    public static FinalAddress.Result details(String id, String sessionToken) {
        if (
            String.isBlank(id) ||
            id.length() > MAX_ID ||
            id.containsWhitespace()
        ) {
            throw new AddressException(BAD_INPUT);
        }
        String token = checkToken(sessionToken);
        String name = providerName();
        FinalAddressProvider p = requireProvider(name, settingClassName());
        FinalAddress.Result raw;
        try {
            raw = p.details(id, token);
        } catch (AddressException e) {
            throw e;
        } catch (Exception e) {
            throw failure(e, name);
        }
        if (raw == null) {
            log(DOWN, name);
            throw new AddressException(DOWN);
        }
        FinalAddress.Result r = new FinalAddress.Result();
        r.street = clean(raw.street, 255);
        r.city = clean(raw.city, 40);
        r.province = clean(raw.province, 80);
        r.provinceCode = clean(raw.provinceCode, 10);
        r.postalCode = clean(raw.postalCode, 20);
        r.country = clean(raw.country, 80);
        r.countryCode = clean(raw.countryCode, 10);
        if (
            raw.latitude != null &&
            raw.longitude != null &&
            raw.latitude >= -90 &&
            raw.latitude <= 90 &&
            raw.longitude >= -180 &&
            raw.longitude <= 180
        ) {
            r.latitude = raw.latitude;
            r.longitude = raw.longitude;
        }
        return r;
    }

    /** Throws NOT_ALLOWED unless elementId is an address question with search
     *  switched on somewhere in the spec (repeat sections included). */
    public static void requireSearchQuestion(
        Map<String, Object> spec,
        String elementId
    ) {
        if (spec == null || String.isBlank(elementId)) {
            throw new AddressException(NOT_ALLOWED);
        }
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            for (
                Object secObj : asList(
                    page == null ? null : page.get('sections')
                )
            ) {
                Map<String, Object> sec = asMap(secObj);
                for (
                    Object elObj : asList(
                        sec == null ? null : sec.get('elements')
                    )
                ) {
                    Map<String, Object> el = asMap(elObj);
                    if (el == null || elementId != str(el.get('id'))) {
                        continue;
                    }
                    Map<String, Object> cfg = asMap(el.get('config'));
                    Object search = cfg == null
                        ? null
                        : cfg.get('addressSearch');
                    if (
                        'field' == str(el.get('type')) &&
                        cfg != null &&
                        'address' == str(cfg.get('inputType')) &&
                        search instanceof Boolean &&
                        (Boolean) search
                    ) {
                        return;
                    }
                    throw new AddressException(NOT_ALLOWED);
                }
            }
        }
        throw new AddressException(NOT_ALLOWED);
    }

    // --------------------------------------------------------------- private

    private static List<FinalAddress.Suggestion> runSuggest(
        String name,
        String className,
        String t,
        String token,
        String box
    ) {
        FinalAddressProvider p = requireProvider(name, className);
        FinalAddress.Query q = new FinalAddress.Query();
        q.text = t;
        q.sessionToken = token;
        q.container = box;

        List<FinalAddress.Suggestion> raw;
        try {
            raw = p.suggest(q);
        } catch (AddressException e) {
            throw e;
        } catch (Exception e) {
            throw failure(e, name);
        }
        List<FinalAddress.Suggestion> out = new List<FinalAddress.Suggestion>();
        for (
            FinalAddress.Suggestion s : raw == null
                ? new List<FinalAddress.Suggestion>()
                : raw
        ) {
            if (out.size() >= MAX_SUGGESTIONS) {
                break;
            }
            if (s == null || String.isBlank(s.id) || s.id.length() > MAX_ID) {
                continue;
            }
            FinalAddress.Suggestion c = new FinalAddress.Suggestion();
            c.id = s.id;
            c.title = clean(s.title, 255);
            c.subtitle = clean(s.subtitle, 255);
            c.isGroup = s.isGroup == true;
            out.add(c);
        }
        return out;
    }

    private static String providerName() {
        String name = providerNameOverride;
        if (name == null) {
            Final_Settings__c s = Final_Settings__c.getInstance(SETTINGS_NAME);
            name = s == null ? null : s.Address_Provider__c;
        }
        if (String.isBlank(name) || name == 'None') {
            return 'None';
        }
        return name;
    }

    private static String settingClassName() {
        Final_Settings__c s = Final_Settings__c.getInstance(SETTINGS_NAME);
        return s == null ? null : s.Address_Apex_Class__c;
    }

    /** An instance of the named class, or null when it is not a usable
     *  FinalAddressProvider. */
    private static FinalAddressProvider instantiate(String className) {
        if (String.isBlank(className)) {
            return null;
        }
        try {
            Type t = Type.forName(className.trim());
            Object o = t == null ? null : t.newInstance();
            return o instanceof FinalAddressProvider
                ? (FinalAddressProvider) o
                : null;
        } catch (Exception e) {
            // no such class, or no public no-arg constructor
            return null;
        }
    }

    /** The provider instance, or null when none is usable. className is only
     *  read for 'Custom'. */
    private static FinalAddressProvider resolve(String name, String className) {
        if (providerOverride != null) {
            return providerOverride;
        }
        if (name == 'Google') {
            return new FinalAddressGoogle();
        }
        // 'Loqate': its adapter is a later slice, so it resolves to nothing yet
        if (name == 'Custom') {
            return instantiate(className);
        }
        return null;
    }

    private static FinalAddressProvider requireProvider(
        String name,
        String className
    ) {
        FinalAddressProvider p = resolve(name, className);
        if (p == null) {
            log(NOT_SET_UP, name);
            throw new AddressException(NOT_SET_UP);
        }
        return p;
    }

    /** Null when blank; BAD_INPUT unless 8-36 URL-safe characters. */
    private static String checkToken(String token) {
        if (String.isBlank(token)) {
            return null;
        }
        if (!Pattern.matches('^[A-Za-z0-9_-]{8,36}$', token)) {
            throw new AddressException(BAD_INPUT);
        }
        return token;
    }

    private static AddressException failure(Exception e, String name) {
        String code = DOWN;
        if (e instanceof FinalAddress.ProviderException) {
            Integer status = ((FinalAddress.ProviderException) e).httpStatus;
            if (status == 401 || status == 403) {
                code = KEY_REFUSED;
            } else if (status == 429) {
                code = LIMIT_REACHED;
            }
        } else if (e instanceof System.CalloutException) {
            String m = (e.getMessage() == null ? '' : e.getMessage())
                .toLowerCase();
            // Measured in the org: with the provider chosen but no key entered
            // on the credential's principal, the platform says
            // "Field Final_Address_Google.Key does not exist. Check spelling."
            if (m.contains('.key does not exist')) {
                code = NO_KEY;
            } else if (
                m.contains('external credential') || m.contains('permission')
            ) {
                code = NO_ACCESS;
            }
        }
        log(code, name);
        return new AddressException(code);
    }

    /** Code and provider name only: never the search text, never ids. */
    private static void log(String code, String name) {
        System.debug(
            LoggingLevel.WARN,
            'FinalAddress failed: ' + code + ' provider=' + name
        );
    }

    /** Markup stripped, trimmed, cut to max; blank becomes null. Each line is
     *  cleaned on its own because stripHtmlTags turns line breaks into spaces,
     *  and a street keeps its second line ("Suite 300"). */
    private static String clean(String s, Integer max) {
        if (s == null) {
            return null;
        }
        List<String> lines = new List<String>();
        for (String line : s.split('\r?\n')) {
            String l = line.stripHtmlTags().trim();
            if (l != '') {
                lines.add(l);
            }
        }
        String t = String.join(lines, '\n');
        if (t.length() > max) {
            t = t.substring(0, max);
        }
        return t == '' ? null : t;
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static String str(Object o) {
        return o instanceof String ? (String) o : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
}
