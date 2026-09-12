/**
 * FinalLookupLogic — the Apex twin of `evaluateCustomLogic` in
 * c/finalExpressionEngine.
 *
 * The browser parses "1 AND (2 OR 3)" to decide whether a rule is true. This
 * parses the same grammar to BUILD a WHERE clause, substituting each numbered
 * slot with the SOQL fragment already compiled for that filter row.
 *
 * The two must agree on what is well-formed, so the grammar is deliberately
 * identical: numbers, AND, OR, parentheses, nothing else. Malformed input
 * returns null and the caller blocks the filter — it never falls back to
 * something permissive.
 *
 * No precedence surprises: AND binds tighter than OR, exactly as the JS does,
 * and every combination is parenthesised on the way out so SOQL cannot
 * re-interpret it.
 */
public inherited sharing class FinalLookupLogic {
    private List<String> tokens;
    private Integer pos = 0;
    private List<String> pieces;

    private FinalLookupLogic(List<String> tokens, List<String> pieces) {
        this.tokens = tokens;
        this.pieces = pieces;
    }

    /**
     * @param expr   1-based logic over the filter rows, e.g. "1 AND (2 OR 3)"
     * @param pieces compiled SOQL fragments, index 0 = slot 1
     * @return       a parenthesised WHERE fragment, or null if malformed
     */
    public static String combine(String expr, List<String> pieces) {
        if (String.isBlank(expr) || pieces == null || pieces.isEmpty()) {
            return null;
        }
        List<String> tokens = tokenize(expr);
        if (tokens == null) {
            return null;
        }
        FinalLookupLogic p = new FinalLookupLogic(tokens, pieces);
        String out = p.parseExpr();
        // Trailing junk means the expression was not fully consumed, which the
        // JS treats as malformed too. Same verdict here.
        return (out != null && p.pos == tokens.size()) ? out : null;
    }

    /**
     * Split into numbers, AND, OR and parentheses. Anything else at all makes
     * the whole expression malformed — we compare the rejoined tokens against
     * the whitespace-stripped input, so a stray character cannot slip past.
     */
    private static List<String> tokenize(String expr) {
        List<String> out = new List<String>();
        Matcher m = Pattern.compile('(?i)\\(|\\)|\\d+|AND|OR').matcher(expr);
        String rebuilt = '';
        while (m.find()) {
            out.add(m.group());
            rebuilt += m.group();
        }
        String stripped = expr.replaceAll('\\s+', '');
        return (out.isEmpty() || rebuilt != stripped) ? null : out;
    }

    private String peek() {
        return pos < tokens.size() ? tokens[pos] : null;
    }

    private String parseExpr() {
        String left = parseTerm();
        while (left != null && 'OR'.equalsIgnoreCase(peek())) {
            pos++;
            String right = parseTerm();
            left = (right == null) ? null : '(' + left + ' OR ' + right + ')';
        }
        return left;
    }

    private String parseTerm() {
        String left = parseAtom();
        while (left != null && 'AND'.equalsIgnoreCase(peek())) {
            pos++;
            String right = parseAtom();
            left = (right == null) ? null : '(' + left + ' AND ' + right + ')';
        }
        return left;
    }

    private String parseAtom() {
        String t = peek();
        if (t == null) {
            return null;
        }
        if (t == '(') {
            pos++;
            String nested = parseExpr();
            if (nested == null || peek() != ')') {
                return null;
            }
            pos++;
            return nested;
        }
        if (!t.isNumeric()) {
            return null;
        }
        pos++;
        Integer slot = Integer.valueOf(t);
        // A reference to a row that does not exist is malformed, not "false" —
        // guessing here would quietly change what the author asked for.
        if (slot < 1 || slot > pieces.size()) {
            return null;
        }
        return pieces[slot - 1];
    }
}
