/**
 * FinalAutofillRules — what Autofill may read, what it may fill, and which
 * pairs fit (IMPL_PLAN_F2_AUTOFILL 6.4). One table, used by the validator,
 * the Studio describes and the browser (through fitsTable), so the three
 * can never disagree.
 *
 * A destination is described by its ANSWER type — the same
 * FinalSubmitService.answerTypeOf that decides how an answer is stored — so
 * a bound Form field and an unbound Freeform question are judged alike.
 *
 * Compatibility: every pairing the validator accepted before (any of the
 * five text-like source types into any text-like destination) is still in
 * the table. New rows only add.
 */
public with sharing class FinalAutofillRules {
    /** The answer types Autofill can fill. */
    public static final Set<String> DESTINATION_TYPES = new Set<String>{
        'Text',
        'Email',
        'Phone',
        'URL',
        'Number',
        'Date',
        'Choice'
    };

    /** Mirrors the browser's list (c/finalAutofillFit answerTypeOf). */
    private static final Set<String> FILLABLE_INPUTS = new Set<String>{
        'text',
        'textarea',
        'email',
        'phone',
        'tel',
        'url',
        'number',
        'currency',
        'percent',
        'slider',
        'date',
        'picklist'
    };

    private static final Set<String> TEXT_LIKE = new Set<String>{
        'Text',
        'Email',
        'Phone',
        'URL'
    };

    private static final Map<Schema.DisplayType, Set<String>> FITS = new Map<Schema.DisplayType, Set<String>>{
        Schema.DisplayType.STRING => TEXT_LIKE,
        Schema.DisplayType.TEXTAREA => TEXT_LIKE,
        Schema.DisplayType.EMAIL => TEXT_LIKE,
        Schema.DisplayType.PHONE => TEXT_LIKE,
        Schema.DisplayType.URL => TEXT_LIKE,
        Schema.DisplayType.DOUBLE => new Set<String>{ 'Number', 'Text' },
        Schema.DisplayType.INTEGER => new Set<String>{ 'Number', 'Text' },
        Schema.DisplayType.LONG => new Set<String>{ 'Number', 'Text' },
        Schema.DisplayType.CURRENCY => new Set<String>{ 'Number', 'Text' },
        Schema.DisplayType.PERCENT => new Set<String>{ 'Number', 'Text' },
        Schema.DisplayType.DATE => new Set<String>{ 'Date' },
        // its date part (decision 6)
        Schema.DisplayType.DATETIME => new Set<String>{ 'Date' },
        Schema.DisplayType.PICKLIST => new Set<String>{ 'Choice', 'Text' }
    };

    /** Relationships the signed-in person's own record may hop through. */
    public static final Set<String> USER_HOPS = new Set<String>{
        'contact',
        'account',
        'manager'
    };

    /** A source path, resolved: its SELECT spelling and its field. */
    public class ResolvedPath {
        public String path;
        public Schema.DescribeFieldResult field;
        public Boolean hop;
        ResolvedPath(
            String path,
            Schema.DescribeFieldResult field,
            Boolean hop
        ) {
            this.path = path;
            this.field = field;
            this.hop = hop;
        }
    }

    /**
     * A field, or one hop to a field (`Account.Name`), that the RUNNING user
     * may read (IMPL_PLAN_F2_AUTOFILL 7.1). Three checks for a hop: the lookup
     * field is readable, the object it points at is readable, and the field
     * there is readable. A polymorphic lookup is never a hop (it has no single
     * object), and never more than one dot. Null when any check fails.
     */
    public static ResolvedPath readablePath(String objectApi, String path) {
        if (String.isBlank(objectApi) || String.isBlank(path)) {
            return null;
        }
        List<String> parts = path.split('\\.');
        if (parts.size() > 2) {
            return null;
        }
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(objectApi.toLowerCase());
        if (t == null || !t.getDescribe().isAccessible()) {
            return null;
        }
        Map<String, Schema.SObjectField> fields = t.getDescribe()
            .fields.getMap();
        if (parts.size() == 1) {
            Schema.SObjectField f = fields.get(parts[0].toLowerCase());
            if (f == null || !f.getDescribe().isAccessible()) {
                return null;
            }
            return new ResolvedPath(
                f.getDescribe().getName(),
                f.getDescribe(),
                false
            );
        }
        Schema.DescribeFieldResult lookup = null;
        for (Schema.SObjectField f : fields.values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (
                d.getType() == Schema.DisplayType.REFERENCE &&
                parts[0].equalsIgnoreCase(d.getRelationshipName())
            ) {
                lookup = d;
                break;
            }
        }
        if (
            lookup == null ||
            !lookup.isAccessible() ||
            lookup.getReferenceTo().size() != 1
        ) {
            return null;
        }
        Schema.DescribeSObjectResult related = lookup.getReferenceTo()[0]
            .getDescribe();
        if (!related.isAccessible()) {
            return null;
        }
        Schema.SObjectField target = related.fields.getMap()
            .get(parts[1].toLowerCase());
        if (target == null || !target.getDescribe().isAccessible()) {
            return null;
        }
        return new ResolvedPath(
            lookup.getRelationshipName() + '.' + target.getDescribe().getName(),
            target.getDescribe(),
            true
        );
    }

    /** A source field Autofill may OFFER. Rich text is never offered. */
    public static Boolean isSupportedSource(Schema.DescribeFieldResult fd) {
        if (!isReadableSource(fd)) {
            return false;
        }
        return !(fd.getType() == Schema.DisplayType.TEXTAREA &&
        fd.isHtmlFormatted());
    }

    /**
     * A source field Autofill may READ at publish: every row type, rich text
     * included. Rules saved before this table read rich text and must still
     * publish (the compatibility promise); it just isn't offered any more.
     */
    public static Boolean isReadableSource(Schema.DescribeFieldResult fd) {
        return fd != null && FITS.containsKey(fd.getType());
    }

    /**
     * A source the Form/Survey in-rail editor may offer until slice D: that
     * editor lists only text-like destinations, so only sources that fit one
     * (text-likes, numbers, picklists; never a date).
     */
    public static Boolean fillsText(Schema.DescribeFieldResult fd) {
        return isSupportedSource(fd) && fits(fd.getType(), 'Text');
    }

    /** Whether a field of this type can fill an answer of that type. */
    public static Boolean fits(Schema.DisplayType type, String answerType) {
        Set<String> fills = FITS.get(type);
        return fills != null && fills.contains(answerType);
    }

    /**
     * The table for the browser: lower-case describe type (as the Studio's
     * field describes spell it) to the answer types it can fill.
     */
    public static Map<String, List<String>> fitsTable() {
        Map<String, List<String>> out = new Map<String, List<String>>();
        for (Schema.DisplayType t : FITS.keySet()) {
            List<String> fills = new List<String>(FITS.get(t));
            fills.sort();
            out.put(String.valueOf(t).toLowerCase(), fills);
        }
        return out;
    }

    /**
     * The answer type an element would be filled as, or null when it can't
     * be a destination: only input elements (`type: 'field'`, bound or not)
     * whose answer type Autofill fills. Rating widgets, several-choice
     * questions, files and blocks are never destinations.
     */
    public static String destinationAnswerType(Map<String, Object> el) {
        if (el == null || el.get('type') != 'field') {
            return null;
        }
        // Only inputs Autofill knows. answerTypeOf reads anything else (a
        // lookup, a checkbox) as Text; the browser's copy rejects them, and
        // so must this.
        Map<String, Object> cfg = el.get(
                'config'
            ) instanceof Map<String, Object>
            ? (Map<String, Object>) el.get('config')
            : null;
        Object kind = cfg == null ? null : cfg.get('inputType');
        if (
            kind != null &&
            !FILLABLE_INPUTS.contains(String.valueOf(kind).toLowerCase())
        ) {
            return null;
        }
        String answerType = FinalSubmitService.answerTypeOf(el);
        return DESTINATION_TYPES.contains(answerType) ? answerType : null;
    }
}
