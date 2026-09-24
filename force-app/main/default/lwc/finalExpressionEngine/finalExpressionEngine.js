/**
 * finalExpressionEngine — THE rule evaluator (FORM_SPEC_SCHEMA §7).
 *
 * One evaluator, build + runtime: visibility configs, validation entries, and
 * their `when` gates all run through here — the editors (P3 slice 5) lint
 * with the same functions the runtime evaluates with, so build-time and
 * runtime can never disagree.
 *
 * Pure module: no LWC, no DOM, no Apex. Callers supply a context:
 *   { getValue(elementId) → current answer,
 *     getType(elementId)  → element type key ('field' subtype via render.inputType
 *                           is the caller's concern — dates pass 'date'/'datetime') }
 *
 * Runtime posture: rules FAIL SAFE — an unparseable comparison or unknown
 * operator makes the RULE false (never a silent string comparison, §7);
 * `lintVisibility` reports the same conditions as build-time errors.
 */

const OPERATORS = new Set([
    'equals',
    'notEquals',
    'contains',
    'greaterThan',
    'lessThan',
    'isBlank',
    'isNotBlank'
]);

const DATE_TYPES = new Set(['date', 'datetime']);

function isBlank(v) {
    return (
        v === null ||
        v === undefined ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
    );
}

function asNumber(v) {
    if (
        v === null ||
        v === undefined ||
        v === '' ||
        v === true ||
        v === false
    ) {
        return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function asTime(v) {
    if (isBlank(v)) {
        return null;
    }
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
}

/** §7 typing: numeric when both sides parse; date when the SOURCE is a date
 *  type; otherwise not comparable → the rule is false (fail safe). */
function compare(rule, actual, ctx) {
    const sourceType = ctx && ctx.getType ? ctx.getType(rule.source) : null;
    if (DATE_TYPES.has(sourceType)) {
        const a = asTime(actual);
        const b = asTime(rule.value);
        if (a === null || b === null) {
            return null;
        }
        return a - b;
    }
    const a = asNumber(actual);
    const b = asNumber(rule.value);
    if (a === null || b === null) {
        return null;
    }
    return a - b;
}

/** SO-3: is this row sourced from the connected record (not an answer)? */
export function isRecordRule(rule) {
    return Boolean(
        rule &&
        typeof rule.source === 'string' &&
        rule.source.startsWith('record:')
    );
}

/**
 * SO-3 fact key: a record row's verdict depends only on (field, operator,
 * value) — identical rows share one fact, wherever they live in the spec.
 * The SERVER computes facts under the same key (FinalSurveyObjectController)
 * — build-time and runtime can never disagree on identity.
 */
export function factKey(rule) {
    return `${rule.source}|${rule.operator}|${rule.value ?? ''}`;
}

export function ruleMatches(rule, ctx) {
    if (!rule || !OPERATORS.has(rule.operator)) {
        return false;
    }
    // SO-3 record rows are SERVER-frozen verdicts: the browser never holds
    // record field values (verdict booleans only, every posture — owner
    // ruling 2026-08-02). No context (plain link, guest without a token) =
    // no fact = no match: show-gated stays hidden, hide-gated stays shown.
    if (isRecordRule(rule)) {
        const facts = ctx.getRecordFacts ? ctx.getRecordFacts() : null;
        return Boolean(facts && facts[factKey(rule)]);
    }
    const actual = ctx.getValue(rule.source);
    switch (rule.operator) {
        case 'isBlank':
            return isBlank(actual);
        case 'isNotBlank':
            return !isBlank(actual);
        case 'equals': {
            // multi-select answers are arrays: "equals X" = membership (the
            // selection includes X), mirroring contains' array branch —
            // String(array) would compare "A,B" !== "A" and never match
            if (Array.isArray(actual)) {
                return actual.map(String).includes(String(rule.value ?? ''));
            }
            // loose string compare — element values arrive as input strings
            return String(actual ?? '') === String(rule.value ?? '');
        }
        case 'notEquals': {
            if (Array.isArray(actual)) {
                return !actual.map(String).includes(String(rule.value ?? ''));
            }
            return String(actual ?? '') !== String(rule.value ?? '');
        }
        case 'contains': {
            if (isBlank(actual)) {
                return false;
            }
            if (Array.isArray(actual)) {
                return actual.map(String).includes(String(rule.value));
            }
            return String(actual)
                .toLowerCase()
                .includes(String(rule.value ?? '').toLowerCase());
        }
        case 'greaterThan': {
            const d = compare(rule, actual, ctx);
            return d !== null && d > 0;
        }
        case 'lessThan': {
            const d = compare(rule, actual, ctx);
            return d !== null && d < 0;
        }
        default:
            return false;
    }
}

/**
 * A condition whose record or user details aren't available — no linked
 * record, still loading, a failed read, a guest's user details
 * (IMPL_PLAN_F2_SEARCH decision 18). Not true, not false: unknown.
 */
export const UNKNOWN = 'unknown';

const MALFORMED = Symbol('malformed');

/** Three-valued AND / OR / NOT: unknown stays unknown unless the other side decides. */
function and3(a, b) {
    if (a === false || b === false) {
        return false;
    }
    return a === true && b === true ? true : UNKNOWN;
}

function or3(a, b) {
    if (a === true || b === true) {
        return true;
    }
    return a === false && b === false ? false : UNKNOWN;
}

function not3(a) {
    return a === UNKNOWN ? UNKNOWN : !a;
}

/**
 * "1 AND (NOT 2 OR 3)" over 1-based results that are true, false or
 * UNKNOWN. NOT binds tightest, then AND, then OR. MALFORMED when the
 * expression doesn't parse or names a condition that isn't there.
 */
function evaluateLogic3(expr, results) {
    if (typeof expr !== 'string' || !expr.trim()) {
        return MALFORMED;
    }
    const tokens = expr.match(/\(|\)|\d+|AND|OR|NOT/gi);
    if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) {
        return MALFORMED;
    }
    let pos = 0;
    function parseOr() {
        let left = parseAnd();
        while (left !== MALFORMED && /^or$/i.test(tokens[pos] || '')) {
            pos += 1;
            const right = parseAnd();
            left = right === MALFORMED ? MALFORMED : or3(left, right);
        }
        return left;
    }
    function parseAnd() {
        let left = parseAtom();
        while (left !== MALFORMED && /^and$/i.test(tokens[pos] || '')) {
            pos += 1;
            const right = parseAtom();
            left = right === MALFORMED ? MALFORMED : and3(left, right);
        }
        return left;
    }
    function parseAtom() {
        const t = tokens[pos];
        if (/^not$/i.test(t || '')) {
            pos += 1;
            const inner = parseAtom();
            return inner === MALFORMED ? MALFORMED : not3(inner);
        }
        if (t === '(') {
            pos += 1;
            const inner = parseOr();
            if (tokens[pos] !== ')') {
                return MALFORMED;
            }
            pos += 1;
            return inner;
        }
        if (/^\d+$/.test(t || '')) {
            pos += 1;
            const idx = Number(t) - 1;
            if (idx < 0 || idx >= results.length) {
                return MALFORMED;
            }
            return results[idx];
        }
        return MALFORMED;
    }
    const out = parseOr();
    return pos === tokens.length ? out : MALFORMED;
}

/**
 * Custom logic: "1 AND (2 OR NOT 3)" over 1-based boolean rule results.
 * Malformed logic → null (caller fails safe). The two-valued face of
 * evaluateLogic3, kept for its existing callers.
 */
export function evaluateCustomLogic(expr, results) {
    const out = evaluateLogic3(expr, results);
    return out === MALFORMED ? null : out;
}

/**
 * Why a custom-logic expression can't be used, as a sentence — or null when
 * it can. Ported from the Form Designer's editor (visibilityEditor
 * validateCustomLogic / checkSyntax) for its specific messages; it accepts
 * exactly the grammar evaluateCustomLogic runs, so nothing it passes can
 * then fail at runtime.
 */
export function validateCustomLogic(expr, count) {
    const raw = typeof expr === 'string' ? expr.trim() : '';
    if (!raw) {
        return 'Enter the logic using condition numbers, like 1 AND (2 OR 3).';
    }
    const upper = raw.toUpperCase();
    const tokens = upper.match(/\d+|AND|OR|NOT|\(|\)/g) || [];
    if (tokens.join('') !== upper.replace(/\s+/g, '')) {
        return 'Only condition numbers, AND, OR, NOT and brackets are allowed.';
    }
    for (const t of tokens) {
        if (/^\d+$/.test(t)) {
            const n = Number(t);
            if (n < 1 || n > count) {
                return `Condition ${n} doesn’t exist — you have ${count} condition${
                    count === 1 ? '' : 's'
                }.`;
            }
        }
    }
    let i = 0;
    const fail = (message) => {
        throw new Error(message);
    };
    const incomplete =
        'The logic is incomplete — check that each AND and OR has a condition on both sides.';
    function parseAtom() {
        if (tokens[i] === 'NOT') {
            i += 1;
            parseAtom();
            return;
        }
        if (tokens[i] === '(') {
            i += 1;
            parseOr();
            if (tokens[i] !== ')') {
                fail('A bracket isn’t closed.');
            }
            i += 1;
            return;
        }
        if (tokens[i] !== undefined && /^\d+$/.test(tokens[i])) {
            i += 1;
            return;
        }
        fail(incomplete);
    }
    function parseAnd() {
        parseAtom();
        while (tokens[i] === 'AND') {
            i += 1;
            parseAtom();
        }
    }
    function parseOr() {
        parseAnd();
        while (tokens[i] === 'OR') {
            i += 1;
            parseAnd();
        }
    }
    try {
        parseOr();
    } catch (e) {
        return e.message;
    }
    if (i < tokens.length) {
        return tokens[i] === ')'
            ? 'There’s a closing bracket with no opening one.'
            : `Unexpected "${tokens[i]}" in the logic.`;
    }
    return null;
}

/**
 * Visibility config (§7) → is the thing VISIBLE?
 * No config / no rules → visible. action 'hide' inverts a match.
 */
/** A row read from the signed-in user rather than an answer or the record. */
export function isUserRule(rule) {
    return Boolean(
        rule &&
        typeof rule.source === 'string' &&
        rule.source.startsWith('user:')
    );
}

/**
 * One condition, three-valued: UNKNOWN when it reads a context that isn't
 * available. A ctx without `isAvailable` (every caller before decision 18)
 * treats every context as available, so it evaluates exactly as it did.
 */
function ruleResult(rule, ctx) {
    if (ctx && typeof ctx.isAvailable === 'function') {
        if (isRecordRule(rule) && !ctx.isAvailable('record')) {
            return UNKNOWN;
        }
        if (isUserRule(rule) && !ctx.isAvailable('user')) {
            return UNKNOWN;
        }
    }
    return ruleMatches(rule, ctx);
}

/**
 * Were these conditions met? Three-valued throughout (decision 18): a
 * condition on unavailable details is UNKNOWN, logic combines it the
 * standard way, and UNKNOWN at the end counts as not met. For every rule
 * without NOT this is exactly the old "unavailable = false" — such rules
 * only get truer as a condition goes from false to true — so nothing
 * published changes. NOT is what can tell them apart, and NOT is new.
 */
function conditionsMet(config, ctx) {
    const results = config.rules.map((r) => ruleResult(r, ctx));
    let out;
    if (config.logic === 'any') {
        out = results.reduce(or3, false);
    } else if (config.logic === 'custom') {
        out = evaluateLogic3(config.customLogic, results);
        if (out === MALFORMED) {
            return false; // malformed → fail safe
        }
    } else {
        out = results.reduce(and3, true); // 'all' is the default
    }
    return out === true;
}

export function evaluateVisibility(config, ctx) {
    if (!config || !Array.isArray(config.rules) || config.rules.length === 0) {
        return true;
    }
    const matched = conditionsMet(config, ctx);
    return config.action === 'hide' ? !matched : matched;
}

/** `when` gates on validation entries: visibility-style {logic, rules}. */
function whenApplies(when, ctx) {
    if (!when) {
        return true;
    }
    return evaluateVisibility({ ...when, action: 'show' }, ctx);
}

/**
 * One validation entry (§7) against a value → failure message or null.
 * Blank values only fail `required` — emptiness is one rule's job.
 */
export function validateEntry(entry, value, ctx) {
    if (!entry || !whenApplies(entry.when, ctx)) {
        return null;
    }
    const message = entry.message || 'This value is not valid.';
    switch (entry.type) {
        case 'required':
            return isBlank(value) || value === false ? message : null;
        case 'pattern': {
            if (isBlank(value)) {
                return null;
            }
            try {
                return new RegExp(entry.pattern).test(String(value))
                    ? null
                    : message;
            } catch {
                return null; // malformed pattern never blocks a respondent
            }
        }
        case 'range': {
            if (isBlank(value)) {
                return null;
            }
            const n = asNumber(value);
            if (n === null) {
                return message;
            }
            if (
                entry.min !== null &&
                entry.min !== undefined &&
                n < entry.min
            ) {
                return message;
            }
            if (
                entry.max !== null &&
                entry.max !== undefined &&
                n > entry.max
            ) {
                return message;
            }
            return null;
        }
        case 'custom': {
            if (isBlank(value)) {
                return null;
            }
            const matches = ruleMatches(
                {
                    source: entry.compareTo,
                    operator: entry.operator || 'equals',
                    value
                },
                ctx
            );
            // the rule reads compareTo's value and compares against OURS —
            // equals means "must match", so a non-match fails
            return matches ? null : message;
        }
        default:
            return null; // unknown types are forward-compatible no-ops
    }
}

/** All failures for one element's validation array. */
export function validateElement(element, value, ctx) {
    const out = [];
    const elType = element && element.type;
    for (const entry of (element && element.validation) || []) {
        // ---- survey-type required semantics (S4 gate findings #1/#2) ----
        if (entry.type === 'required') {
            // yesNo: FALSE is a real answer — only consent/checkbox demand true
            if (elType === 'yesNo' && value === false) {
                continue;
            }
            // matrix: required = EVERY statement answered, and the failure
            // names the missing rows (partial grids are silent data loss)
            if (elType === 'matrix') {
                const rows = (element.config && element.config.rows) || [];
                const picks = value && typeof value === 'object' ? value : {};
                const missing = rows.filter((r) => picks[r.value] == null);
                if (missing.length) {
                    out.push(
                        entry.message ||
                            `Please answer: ${missing
                                .map((r) => r.label || r.value)
                                .join(', ')}`
                    );
                }
                continue;
            }
        }
        const failure = validateEntry(entry, value, ctx);
        if (failure) {
            out.push(failure);
        }
    }
    return out;
}

/**
 * Build-time lint (§7: comparison typing + repeater scoping are SPEC errors).
 * `elementIndex` = Map(id → { type, repeatSectionId }) built by the caller.
 */
export function lintVisibility(config, elementIndex, hostRepeatSectionId) {
    const problems = [];
    if (!config || !Array.isArray(config.rules)) {
        return problems;
    }
    config.rules.forEach((rule, i) => {
        const label = `Rule ${i + 1}`;
        if (!OPERATORS.has(rule.operator)) {
            problems.push(`${label}: unknown operator "${rule.operator}".`);
        }
        // SO-3 record rows: no element to index, no repeater scoping, and
        // type coercion is the SERVER's describe-driven job — operator
        // validity (above) is the whole lint. Current-user rows (D55) have no
        // element either; their types come from User's own describe.
        if (isRecordRule(rule) || isUserRule(rule)) {
            return;
        }
        const meta = elementIndex && elementIndex.get(rule.source);
        if (!meta) {
            problems.push(`${label}: source element not found.`);
            return;
        }
        if (
            meta.repeatSectionId &&
            meta.repeatSectionId !== hostRepeatSectionId
        ) {
            problems.push(
                `${label}: elements inside a repeatable section can't drive rules outside it.`
            );
        }
        if (
            (rule.operator === 'greaterThan' || rule.operator === 'lessThan') &&
            !DATE_TYPES.has(meta.type) &&
            asNumber(rule.value) === null
        ) {
            problems.push(
                `${label}: greater/less-than needs a numeric value or a date source.`
            );
        }
    });
    if (config.logic === 'custom') {
        const probe = evaluateCustomLogic(
            config.customLogic,
            config.rules.map(() => true)
        );
        if (probe === null) {
            problems.push('The custom logic expression is malformed.');
        }
    }
    return problems;
}
