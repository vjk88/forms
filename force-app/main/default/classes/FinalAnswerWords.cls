/**
 * FinalAnswerWords — a stored answer row turned back into the words a person
 * chose, for the server-built PDF copy (IMPL_PLAN_FORM_PDF §6.4).
 *
 * This is the Apex twin of the LWC module c/finalAnswerText
 * (`storedAnswerLines`, `matrixAnswerWord`), which the Answers card and the
 * browser PDFs use. The two MUST say the same thing: "3 out of 10", a matrix
 * point's label, a numbered ranking, "Agreed". Change one, change the other;
 * FinalAnswerWordsTest and finalSubmissionReader's tests pin the same cases.
 *
 * Scale defaults mirror c/finalSurveyPoints.
 */
public inherited sharing class FinalAnswerWords {
    private static final Set<String> SCALE_TYPES = new Set<String>{
        'nps',
        'rating',
        'scale',
        'emojiScale'
    };
    private static final Set<Integer> SCALE_SIZES = new Set<Integer>{
        5,
        7,
        10
    };
    private static final Set<String> LETTER_REGIONS = new Set<String>{
        'US',
        'CA',
        'MX',
        'PH',
        'CL',
        'CO',
        'VE'
    };

    // ------------------------------------------------------------ points --

    private static List<Object> point(Integer value, String label) {
        return new List<Object>{ value, label };
    }

    @TestVisible
    static List<Map<String, Object>> likertPoints(Map<String, Object> cfg) {
        return pointsOr(
            cfg,
            new List<List<Object>>{
                point(1, 'Strongly disagree'),
                point(2, 'Disagree'),
                point(3, 'Neutral'),
                point(4, 'Agree'),
                point(5, 'Strongly agree')
            }
        );
    }

    @TestVisible
    static List<Map<String, Object>> matrixPoints(Map<String, Object> cfg) {
        return pointsOr(
            cfg,
            new List<List<Object>>{
                point(1, 'Disagree'),
                point(2, 'Neutral'),
                point(3, 'Agree'),
                point(4, 'Strongly agree')
            }
        );
    }

    private static List<Map<String, Object>> pointsOr(
        Map<String, Object> cfg,
        List<List<Object>> defaults
    ) {
        List<Map<String, Object>> authored = maps(
            cfg == null ? null : cfg.get('points')
        );
        if (!authored.isEmpty()) {
            return authored;
        }
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (List<Object> p : defaults) {
            out.add(
                new Map<String, Object>{ 'value' => p[0], 'label' => p[1] }
            );
        }
        return out;
    }

    @TestVisible
    static Integer scaleMax(String type, Map<String, Object> cfg) {
        Map<String, Object> c = cfg == null ? new Map<String, Object>() : cfg;
        if (type == 'nps') {
            return 10;
        }
        if (type == 'rating') {
            return num(c.get('max')) == 10 ? 10 : 5;
        }
        if (type == 'scale') {
            Integer size = num(c.get('size'));
            return SCALE_SIZES.contains(size) ? size : 5;
        }
        return 5; // emojiScale
    }

    // ----------------------------------------------------------- options --

    /** One stored choice value, as its label; an unknown value as itself. */
    public static String optionLabel(
        Object value,
        List<Map<String, Object>> options
    ) {
        if (value == null) {
            return '';
        }
        String key = plain(value);
        for (Map<String, Object> o : options) {
            if (
                o != null &&
                o.get('value') != null &&
                plain(o.get('value')) == key
            ) {
                String label = o.get('label') == null
                    ? ''
                    : String.valueOf(o.get('label'));
                return String.isBlank(label) ? key : label;
            }
        }
        return key;
    }

    /** The options a choice question draws (mirrors c/finalChoiceLook). */
    @TestVisible
    static List<Map<String, Object>> choiceOptions(Map<String, Object> el) {
        Map<String, Object> cfg = asMap(el.get('config'));
        List<Map<String, Object>> own = maps(cfg.get('options'));
        if (
            el.get('type') == 'field' &&
            isDefaultLook(el, cfg) &&
            cfg.get('inputType') == 'picklist'
        ) {
            List<Map<String, Object>> schema = maps(cfg.get('schemaOptions'));
            if (!schema.isEmpty()) {
                own = schema;
            }
        }
        if (!own.isEmpty()) {
            return own;
        }
        return maps(asMap(el.get('render')).get('options'));
    }

    private static Boolean isDefaultLook(
        Map<String, Object> el,
        Map<String, Object> cfg
    ) {
        Boolean hasOptions = !maps(cfg.get('options')).isEmpty();
        Object style = cfg.get('optionStyle');
        if (hasOptions && (style == 'chips' || style == 'cards')) {
            return false;
        }
        Object renderAs = cfg.get('renderAs') != null
            ? cfg.get('renderAs')
            : el.get('renderDefault');
        return renderAs == null ||
            !new Set<Object>{
                    'Dropdown',
                    'Radio_Buttons',
                    'Checkbox_Group',
                    'Custom_MultiSelect'
                }
                .contains(renderAs);
    }

    private static List<Map<String, Object>> labelled(
        List<Map<String, Object>> options
    ) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Map<String, Object> o : options) {
            String label = o.get('label') == null
                ? plain(o.get('value'))
                : String.valueOf(o.get('label'));
            if (o.get('emoji') != null) {
                label = o.get('emoji') + ' ' + label;
            }
            out.add(
                new Map<String, Object>{
                    'value' => o.get('value'),
                    'label' => label
                }
            );
        }
        return out;
    }

    // ----------------------------------------------------------- answers --

    /**
     * A stored Form_Submission_Answer__c row as lines of words.
     * @param el the question from the version that was filled in, or null
     *           for an answer whose question is gone (it reads plainly)
     */
    public static List<String> storedLines(
        Form_Submission_Answer__c a,
        Map<String, Object> el
    ) {
        if (a == null) {
            return new List<String>();
        }
        if (a.Value_Unparsed__c == true) {
            return String.isBlank(a.Text_Value__c)
                ? new List<String>()
                : a.Text_Value__c.split('\r?\n');
        }
        Object value;
        switch on a.Answer_Type__c {
            when 'Boolean' {
                value = a.Boolean_Value__c == true;
            }
            when 'Number' {
                value = a.Numeric_Value__c;
            }
            when 'Date' {
                return a.Date_Value__c == null
                    ? new List<String>()
                    : new List<String>{ formatDate(a.Date_Value__c) };
            }
            when 'DateTime' {
                return a.DateTime_Value__c == null
                    ? new List<String>()
                    : new List<String>{ formatDateTime(a.DateTime_Value__c) };
            }
            when 'Options' {
                try {
                    value = JSON.deserializeUntyped(
                        String.isBlank(a.Selected_Options_JSON__c)
                            ? '[]'
                            : a.Selected_Options_JSON__c
                    );
                } catch (Exception e) {
                    return new List<String>{ a.Selected_Options_JSON__c };
                }
            }
            when else {
                value = a.Text_Value__c;
            }
        }
        if (el == null) {
            if (isEmpty(value)) {
                return new List<String>();
            }
            if (value instanceof Boolean) {
                return new List<String>{ (Boolean) value ? 'Yes' : 'No' };
            }
            if (value instanceof List<Object>) {
                return new List<String>{
                    joinPlain((List<Object>) value, ', ')
                };
            }
            return new List<String>{ plain(value) };
        }
        return lines(el, value);
    }

    /** One matrix statement's chosen point, by label. */
    public static String matrixWord(
        Map<String, Object> el,
        Form_Submission_Answer__c a
    ) {
        Object stored = a.Numeric_Value__c != null
            ? (Object) a.Numeric_Value__c
            : (Object) a.Text_Value__c;
        if (stored == null || stored == '') {
            return '';
        }
        return optionLabel(stored, matrixPoints(asMap(el.get('config'))));
    }

    /** A live-shaped answer value as lines (mirrors finalAnswerText.answerLines). */
    @TestVisible
    static List<String> lines(Map<String, Object> el, Object value) {
        List<String> out = new List<String>();
        if (isEmpty(value)) {
            return out;
        }
        Map<String, Object> cfg = asMap(el.get('config'));
        String type = (String) el.get('type');
        if (type == 'yesNo') {
            Boolean yes = value == true || value == 'true';
            Boolean no = value == false || value == 'false';
            out.add(
                yes
                    ? str(cfg.get('yesLabel'), 'Yes')
                    : no ? str(cfg.get('noLabel'), 'No') : plain(value)
            );
            return out;
        }
        if (type == 'consent') {
            out.add(value == true || value == 'true' ? 'Agreed' : 'Not agreed');
            return out;
        }
        if (type == 'likert') {
            out.add(optionLabel(value, likertPoints(cfg)));
            return out;
        }
        if (SCALE_TYPES.contains(type)) {
            out.add(plain(value) + ' out of ' + scaleMax(type, cfg));
            return out;
        }
        if (type == 'ranking') {
            List<Map<String, Object>> opts = maps(cfg.get('options'));
            Integer i = 1;
            for (Object v : listOf(value)) {
                out.add(i + '. ' + optionLabel(v, opts));
                i++;
            }
            return out;
        }
        if (type == 'imageChoice') {
            out.add(joinLabels(listOf(value), maps(cfg.get('options'))));
            return out;
        }
        Object inputType = cfg.get('inputType');
        if (
            inputType == 'reference' ||
            inputType == 'lookup' ||
            type == 'lookup'
        ) {
            out.add(plain(value));
            return out;
        }
        List<Map<String, Object>> options = choiceOptions(el);
        if (!options.isEmpty() && !(value instanceof Boolean)) {
            List<Object> picked = new List<Object>();
            if (value instanceof List<Object>) {
                picked = (List<Object>) value;
            } else if (
                value instanceof String && inputType == 'multipicklist'
            ) {
                for (String part : ((String) value).split(';')) {
                    picked.add(part);
                }
            } else {
                picked.add(value);
            }
            out.add(joinLabels(picked, labelled(options)));
            return out;
        }
        if (value instanceof Boolean) {
            out.add((Boolean) value ? 'Yes' : 'No');
            return out;
        }
        if (value instanceof List<Object>) {
            out.add(joinPlain((List<Object>) value, ', '));
            return out;
        }
        return plain(value).split('\r?\n');
    }

    // ------------------------------------------------------------- dates --

    /** Letter for US-style locales, A4 elsewhere (mirrors the browser copy). */
    public static Boolean usesLetter() {
        List<String> parts = UserInfo.getLocale().split('_');
        return parts.size() > 1 &&
            LETTER_REGIONS.contains(parts[1].toUpperCase());
    }

    public static String formatDate(Date d) {
        Datetime noon = Datetime.newInstanceGmt(
            d,
            Time.newInstance(12, 0, 0, 0)
        );
        return noon.formatGmt(usesLetter() ? 'MMMM d, yyyy' : 'd MMMM yyyy');
    }

    public static String formatDateTime(Datetime dt) {
        return dt.format(
            usesLetter()
                ? 'MMMM d, yyyy \'at\' h:mm a'
                : 'd MMMM yyyy \'at\' HH:mm'
        );
    }

    // ----------------------------------------------------------- helpers --

    private static String joinLabels(
        List<Object> values,
        List<Map<String, Object>> options
    ) {
        List<String> words = new List<String>();
        for (Object v : values) {
            words.add(optionLabel(v, options));
        }
        return String.join(words, ', ');
    }

    private static String joinPlain(List<Object> values, String sep) {
        List<String> words = new List<String>();
        for (Object v : values) {
            words.add(plain(v));
        }
        return String.join(words, sep);
    }

    private static List<Object> listOf(Object value) {
        return value instanceof List<Object>
            ? (List<Object>) value
            : new List<Object>{ value };
    }

    @TestVisible
    static Boolean isEmpty(Object v) {
        return v == null ||
            (v instanceof String && String.isEmpty((String) v)) ||
            (v instanceof List<Object> && ((List<Object>) v).isEmpty()) ||
            (v instanceof Map<String, Object> &&
            ((Map<String, Object>) v).isEmpty());
    }

    /** A value as text: whole numbers without ".0", everything else as is. */
    public static String plain(Object v) {
        if (v == null) {
            return '';
        }
        if (v instanceof Decimal) {
            return ((Decimal) v).stripTrailingZeros().toPlainString();
        }
        if (v instanceof Double) {
            return Decimal.valueOf((Double) v)
                .stripTrailingZeros()
                .toPlainString();
        }
        return String.valueOf(v);
    }

    private static Integer num(Object v) {
        if (v instanceof Integer) {
            return (Integer) v;
        }
        if (v instanceof Decimal) {
            return ((Decimal) v).intValue();
        }
        if (v instanceof Double) {
            return ((Double) v).intValue();
        }
        return null;
    }

    private static String str(Object v, String fallback) {
        return v == null || String.isBlank(String.valueOf(v))
            ? fallback
            : String.valueOf(v);
    }

    public static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : new Map<String, Object>();
    }

    public static List<Map<String, Object>> maps(Object o) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        if (o instanceof List<Object>) {
            for (Object x : (List<Object>) o) {
                if (x instanceof Map<String, Object>) {
                    out.add((Map<String, Object>) x);
                }
            }
        }
        return out;
    }
}
