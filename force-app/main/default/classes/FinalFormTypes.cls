/**
 * The one place that knows how many form types exist and what each one can do.
 *
 * Before this class, every caller asked its own private question —
 * `Form_Type__c == 'Survey' ? 'survey' : 'form'` — and the `else` silently
 * meant Form. A third type did not break those lines; it was MISFILED by them
 * (a cloned Freeform became a Form, then failed further downstream with a
 * message about the wrong thing). So callers no longer ask "is it a survey?";
 * they ask the capability they actually care about, and an unrecognized type
 * throws instead of being guessed at.
 *
 * Two vocabularies exist and both are canonical in their own place:
 *   - the PICKLIST value on `Form__c.Form_Type__c` — 'Form' | 'Survey' | 'Freeform'
 *   - the SPEC value in `spec.form.type`           — 'form' | 'survey' | 'freeform'
 * Everything inside this class is keyed by the SPEC value; `fromPicklist` and
 * `toPicklist` are the only translation points in the app.
 *
 * Design: FREEFORM_SPEC.md §4.1 (capability table). The JS half is
 * `c/finalFormTypes` and must be changed in step with this file.
 */
public with sharing class FinalFormTypes {
    public class UnknownFormTypeException extends Exception {
    }

    public static final String FORM = 'form';
    public static final String SURVEY = 'survey';
    public static final String FREEFORM = 'freeform';

    /** What one form type can do. Add a type = add a row, not 40 branches. */
    private class Definition {
        String specValue;
        String picklistValue;
        String label;
        /** Must be bound to a Salesforce object before it can be published. */
        Boolean needsObject;
        /** Answers are stored as rows in our own tables, not as a record. */
        Boolean usesAnswerStore;
        /** The palette serves authored questions, not describe-driven fields. */
        Boolean usesQuestions;
        /** Topics (chart tags), normalized scores, sentiment. */
        Boolean usesAnalytics;
        /** Connected object card, record links, record-field rules. */
        Boolean usesContextRecord;
        /** Autofill rules may be authored for this type. */
        Boolean usesAutofill;
        /** The layout is fixed by the type (surveys are one-at-a-time). */
        Boolean layoutLocked;

        Definition(
            String specValue,
            String picklistValue,
            String label,
            Boolean needsObject,
            Boolean usesAnswerStore,
            Boolean usesQuestions,
            Boolean usesAnalytics,
            Boolean usesContextRecord,
            Boolean usesAutofill,
            Boolean layoutLocked
        ) {
            this.specValue = specValue;
            this.picklistValue = picklistValue;
            this.label = label;
            this.needsObject = needsObject;
            this.usesAnswerStore = usesAnswerStore;
            this.usesQuestions = usesQuestions;
            this.usesAnalytics = usesAnalytics;
            this.usesContextRecord = usesContextRecord;
            this.usesAutofill = usesAutofill;
            this.layoutLocked = layoutLocked;
        }
    }

    //                                      spec        picklist     label        obj    store  quest  anlyt  ctx    autof  lock
    private static final Map<String, Definition> BY_SPEC = new Map<String, Definition>{
        FORM => new Definition(
            FORM,
            'Form',
            'Form',
            true,
            false,
            false,
            false,
            false,
            true,
            false
        ),
        SURVEY => new Definition(
            SURVEY,
            'Survey',
            'Survey',
            false,
            true,
            true,
            true,
            true,
            true,
            true
        ),
        // Freeform's Autofill ships with F2, when a rule can name its own
        // source object (FREEFORM_SPEC D7). The capability is TRUE here
        // because it is a property of the TYPE; the Studio hides the tab in
        // F1. Do not record Freeform as "no Autofill".
        FREEFORM => new Definition(
            FREEFORM,
            'Freeform',
            'Freeform',
            false,
            true,
            true,
            false,
            false,
            true,
            false
        )
    };

    private static final Map<String, String> SPEC_BY_PICKLIST = buildPicklistIndex();

    private static Map<String, String> buildPicklistIndex() {
        Map<String, String> out = new Map<String, String>();
        for (Definition d : BY_SPEC.values()) {
            out.put(d.picklistValue.toLowerCase(), d.specValue);
        }
        return out;
    }

    // ------------------------------------------------------- translation

    /**
     * `Form__c.Form_Type__c` → the spec value.
     * @throws UnknownFormTypeException for anything else, INCLUDING blank —
     *         guessing 'form' is what this class exists to stop.
     */
    public static String fromPicklist(String picklistValue) {
        String key = picklistValue == null
            ? ''
            : picklistValue.trim().toLowerCase();
        String specValue = SPEC_BY_PICKLIST.get(key);
        if (specValue == null) {
            throw new UnknownFormTypeException(
                'Unrecognized form type: ' + picklistValue
            );
        }
        return specValue;
    }

    /** The spec value → the `Form__c.Form_Type__c` picklist value. */
    public static String toPicklist(String specValue) {
        return definition(specValue).picklistValue;
    }

    /** Human-facing name, for library rows and messages. */
    public static String label(String specValue) {
        return definition(specValue).label;
    }

    /** True when the spec value names a type this app knows. */
    public static Boolean isKnown(String specValue) {
        return specValue != null && BY_SPEC.containsKey(specValue);
    }

    /** Every spec value, for validators that allow-list what they accept. */
    public static Set<String> specValues() {
        return BY_SPEC.keySet().clone();
    }

    /** The spec value carried by a parsed spec's `form` block. */
    public static String fromSpec(Map<String, Object> spec) {
        Object formBlock = spec == null ? null : spec.get('form');
        Object rawType = formBlock instanceof Map<String, Object>
            ? ((Map<String, Object>) formBlock).get('type')
            : null;
        if (!(rawType instanceof String)) {
            throw new UnknownFormTypeException(
                'This form specification does not say what type of form it is.'
            );
        }
        return definition((String) rawType).specValue;
    }

    /**
     * Like `fromSpec`, but a spec that says NOTHING about its type falls back
     * to `fallbackSpecValue` instead of throwing.
     *
     * Submit needs this: specs published before the type was written into the
     * spec carry no `form.type`, and the old dispatch read that absence as
     * 'not a survey' - i.e. a Form. Refusing them would break every form
     * published before today. A type that IS present but unrecognized is still
     * refused: silence is legacy, garbage is a bug.
     */
    public static String fromSpecOrDefault(
        Map<String, Object> spec,
        String fallbackSpecValue
    ) {
        Object formBlock = spec == null ? null : spec.get('form');
        Object rawType = formBlock instanceof Map<String, Object>
            ? ((Map<String, Object>) formBlock).get('type')
            : null;
        if (!(rawType instanceof String) || String.isBlank((String) rawType)) {
            return definition(fallbackSpecValue).specValue;
        }
        return definition((String) rawType).specValue;
    }

    // ------------------------------------------------------- capabilities

    public static Boolean needsObject(String specValue) {
        return definition(specValue).needsObject;
    }

    public static Boolean usesAnswerStore(String specValue) {
        return definition(specValue).usesAnswerStore;
    }

    public static Boolean usesQuestions(String specValue) {
        return definition(specValue).usesQuestions;
    }

    public static Boolean usesAnalytics(String specValue) {
        return definition(specValue).usesAnalytics;
    }

    public static Boolean usesContextRecord(String specValue) {
        return definition(specValue).usesContextRecord;
    }

    public static Boolean usesAutofill(String specValue) {
        return definition(specValue).usesAutofill;
    }

    public static Boolean layoutLocked(String specValue) {
        return definition(specValue).layoutLocked;
    }

    private static Definition definition(String specValue) {
        Definition d = specValue == null ? null : BY_SPEC.get(specValue);
        if (d == null) {
            throw new UnknownFormTypeException(
                'Unrecognized form type: ' + specValue
            );
        }
        return d;
    }
}
