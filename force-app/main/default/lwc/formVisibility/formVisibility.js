/**
 * c/formVisibility — pure evaluator for the declarative visibility-rule JSON
 * stored on pages/sections/elements (Visibility_Expression fields):
 *   { logic: 'all'|'any'|'custom', customLogic: '1 AND (2 OR 3)',
 *     rules: [{ field, operator, value }] }
 *
 * Behavior parity with the legacy player's evaluator. Pure functions, no DOM,
 * no Apex — consumed by c/formViewer (live) and later the wizard preview.
 * Unparseable/empty expressions evaluate to VISIBLE (never hide content on a
 * config error).
 */

export function evalVisibility(expr, values) {
    if (!expr) return true;
    let cfg;
    try {
        cfg = typeof expr === 'string' ? JSON.parse(expr) : expr;
    } catch {
        return true;
    }
    const rules = (cfg && cfg.rules) || [];
    if (!rules.length) return true;
    const results = rules.map((r) => evalRule(r, values || {}));
    if (cfg.logic === 'any') return results.some(Boolean);
    if (cfg.logic === 'custom' && cfg.customLogic) {
        return evalCustomLogic(cfg.customLogic, results);
    }
    return results.every(Boolean);
}

export function evalRule(rule, values) {
    const left = values[rule.field];
    const right = rule.value;
    const ls = left === undefined || left === null ? '' : String(left);
    const rs = right === undefined || right === null ? '' : String(right);
    switch (rule.operator) {
        case 'equals':
            return ls === rs;
        case 'notEqual':
            return ls !== rs;
        case 'contains':
            return ls.includes(rs);
        case 'notContains':
            return !ls.includes(rs);
        case 'startsWith':
            return ls.startsWith(rs);
        case 'greaterThan':
            return Number(left) > Number(right);
        case 'lessThan':
            return Number(left) < Number(right);
        case 'greaterOrEqual':
            return Number(left) >= Number(right);
        case 'lessOrEqual':
            return Number(left) <= Number(right);
        case 'isNull':
            return ls === '';
        case 'isNotNull':
            return ls !== '';
        default:
            return true;
    }
}

// Safe boolean evaluator for custom logic like "1 AND (2 OR 3)" — recursive
// descent over a whitelisted token set; anything unparseable returns true.
export function evalCustomLogic(expr, results) {
    const tokens = String(expr)
        .toUpperCase()
        .match(/\d+|AND|OR|NOT|\(|\)/g);
    if (!tokens) return true;
    let i = 0;
    // Function declarations (hoisted) so the mutual recursion below — expr →
    // term → factor → expr for parenthesized groups — resolves cleanly.
    function parseExpr() {
        let v = parseTerm();
        while (tokens[i] === 'OR') {
            i++;
            const r = parseTerm();
            v = v || r;
        }
        return v;
    }
    function parseTerm() {
        let v = parseFactor();
        while (tokens[i] === 'AND') {
            i++;
            const r = parseFactor();
            v = v && r;
        }
        return v;
    }
    function parseFactor() {
        if (tokens[i] === 'NOT') {
            i++;
            return !parseFactor();
        }
        if (tokens[i] === '(') {
            i++;
            const v = parseExpr();
            if (tokens[i] === ')') i++;
            return v;
        }
        const num = parseInt(tokens[i++], 10);
        return !!results[num - 1];
    }
    try {
        return parseExpr();
    } catch {
        return true;
    }
}
