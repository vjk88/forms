/**
 * FinalMappingSoql — reads the conditions an author typed for a
 * find-or-create search (IMPL_PLAN_F2_SEARCH Task 8, D50/D51).
 *
 * The author writes only the part after WHERE. Answers go in as
 * `{!<elementId>}` tokens, each right after a field and a comparison
 * (`Email = {!el_x}`); they are swapped for bind names (`:m0`, `:m1`, …) so
 * whatever a respondent types is only ever a bound value, never query text.
 *
 * Pure: no queries, no DML, no describe. The publish check test-runs the
 * result as the author (FinalMappingValidator); the runtime binds the
 * answers and runs it (FinalMappingService).
 */
public with sharing class FinalMappingSoql {
    public static final Integer MAX_LENGTH = 4000;

    /** Words that would turn conditions into another query (decision 8). */
    private static final Set<String> BANNED_WORDS = new Set<String>{
        'SELECT',
        'FROM',
        'LIMIT',
        'OFFSET',
        'ORDER',
        'GROUP',
        'HAVING',
        'FOR',
        'WITH',
        'USING',
        'UPDATE',
        'TYPEOF',
        'ALL'
    };

    /** `<field path> <comparison>` at the end of the text before a token. */
    private static final Pattern FIELD_AND_COMPARISON = Pattern.compile(
        '(?i)([A-Za-z_][A-Za-z0-9_.]*)(?:\\s*(!=|<>|<=|>=|=|<|>)|\\s+(LIKE))\\s*$'
    );

    private static final String PLACEMENT_PROBLEM = 'Put each answer right after a field and a comparison, like Email = {Your email}.';

    public class Token {
        /** The question, from {!el_x}. */
        public String elementId;
        /** The field before the comparison. */
        public String fieldPath;
        /** '=', '!=', '<>', '<', '<=', '>', '>=' or 'LIKE'. */
        public String operator;
        /** m0, m1, … */
        public String bindName;
    }

    public class Parsed {
        /** The conditions with each token replaced by :m0, :m1, … */
        public String whereClause;
        public List<Token> tokens = new List<Token>();
        /** Why it can't be used, or null when it can. */
        public String problem;
    }

    public static Parsed parse(String clause) {
        Parsed out = new Parsed();
        if (String.isBlank(clause)) {
            out.problem = 'Write the search, or go back to Conditions.';
            return out;
        }
        if (clause.length() > MAX_LENGTH) {
            out.problem = 'Keep the conditions under 4,000 characters.';
            return out;
        }

        String built = '';
        Boolean inQuote = false;
        Integer depth = 0;
        Boolean unbalanced = false;
        Integer n = clause.length();
        Integer i = 0;
        while (i < n) {
            String c = clause.substring(i, i + 1);
            if (inQuote) {
                if (c == '\\' && i + 1 < n) {
                    built += clause.substring(i, i + 2);
                    i += 2;
                    continue;
                }
                if (c == '\'') {
                    inQuote = false;
                }
                built += c;
                i++;
                continue;
            }
            if (c == '\'') {
                inQuote = true;
                built += c;
                i++;
                continue;
            }
            if (c == ';') {
                out.problem = 'Remove the semicolon — this box takes one set of conditions.';
                return out;
            }
            if (c == '$') {
                out.problem = 'Values like $User can’t be used here. Insert an answer instead.';
                return out;
            }
            if (
                c == ':' &&
                i + 1 < n &&
                startsBind(clause.substring(i + 1, i + 2))
            ) {
                out.problem = 'Use Insert answer instead of a : value.';
                return out;
            }
            if (isWordStart(c)) {
                Integer wordEnd = i;
                while (
                    wordEnd < n &&
                    isWordChar(clause.substring(wordEnd, wordEnd + 1))
                ) {
                    wordEnd++;
                }
                String word = clause.substring(i, wordEnd);
                if (BANNED_WORDS.contains(word.toUpperCase())) {
                    out.problem =
                        word +
                        ' can’t be used here — this box takes only the conditions after WHERE.';
                    return out;
                }
                built += word;
                i = wordEnd;
                continue;
            }
            if (c == '{') {
                Integer close = clause.indexOf('}', i);
                String braced = close < 0
                    ? clause.substring(i + 1)
                    : clause.substring(i + 1, close);
                if (
                    braced.startsWith('!') && isElementId(braced.substring(1))
                ) {
                    Matcher m = FIELD_AND_COMPARISON.matcher(built);
                    if (!m.find()) {
                        out.problem = PLACEMENT_PROBLEM;
                        return out;
                    }
                    Token t = new Token();
                    t.elementId = braced.substring(1);
                    t.fieldPath = m.group(1);
                    t.operator = (m.group(2) != null ? m.group(2) : m.group(3))
                        .toUpperCase();
                    t.bindName = 'm' + out.tokens.size();
                    out.tokens.add(t);
                    built += ':' + t.bindName;
                    i = close + 1;
                    continue;
                }
                out.problem = noSuchQuestion(braced);
                return out;
            }
            if (c == '}') {
                out.problem = noSuchQuestion('');
                return out;
            }
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth < 0) {
                    unbalanced = true;
                }
            }
            built += c;
            i++;
        }
        if (inQuote) {
            out.problem = 'A quoted value isn’t closed.';
            return out;
        }
        if (unbalanced || depth != 0) {
            out.problem = 'The brackets don’t match.';
            return out;
        }
        out.whereClause = built.trim();
        return out;
    }

    /** For LIKE: the answer matches as typed; a % or _ is never a wildcard. */
    public static String escapeLike(String s) {
        if (s == null) {
            return null;
        }
        return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
    }

    private static String noSuchQuestion(String name) {
        return 'There’s no question called "' + name + '". Use Insert answer.';
    }

    /** `:name`, `:_x`, `:(`, `: x` start a bind; `LAST_N_DAYS:30` doesn't. */
    private static Boolean startsBind(String next) {
        return next.isAlpha() ||
            next == '_' ||
            next == '(' ||
            next.isWhitespace();
    }

    private static Boolean isWordStart(String c) {
        return c.isAlpha() || c == '_';
    }

    private static Boolean isWordChar(String c) {
        return c.isAlphanumeric() || c == '_';
    }

    private static Boolean isElementId(String s) {
        return String.isNotBlank(s) && Pattern.matches('[A-Za-z0-9_]+', s);
    }
}
