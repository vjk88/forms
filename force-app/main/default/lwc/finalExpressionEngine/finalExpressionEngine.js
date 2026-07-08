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
    if (v === null || v === undefined || v === '' || v === true || v === false) {
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

export function ruleMatches(rule, ctx) {
    if (!rule || !OPERATORS.has(rule.operator)) {
        return false;
    }
    const actual = ctx.getValue(rule.source);
    switch (rule.operator) {
        case 'isBlank':
            return isBlank(actual);
        case 'isNotBlank':
            return !isBlank(actual);
        case 'equals':
            // loose string compare — element values arrive as input strings
            return String(actual ?? '') === String(rule.value ?? '');
        case 'notEquals':
            return String(actual ?? '') !== String(rule.value ?? '');
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
 * Custom logic: "1 AND (2 OR 3)" over 1-based rule indexes. Tiny recursive-
 * descent parser; malformed logic → null (caller fails safe).
 */
export function evaluateCustomLogic(expr, results) {
    if (typeof expr !== 'string' || !expr.trim()) {
        return null;
    }
    const tokens = expr.match(/\(|\)|\d+|AND|OR/gi);
    if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) {
        return null;
    }
    let pos = 0;
    function parseExpr() {
        let left = parseTerm();
        while (left !== null && /^or$/i.test(tokens[pos] || '')) {
            pos += 1;
            const right = parseTerm();
            left = right === null ? null : left || right;
        }
        return left;
    }
    function parseTerm() {
        let left = parseAtom();
        while (left !== null && /^and$/i.test(tokens[pos] || '')) {
            pos += 1;
            const right = parseAtom();
            left = right === null ? null : left && right;
        }
        return left;
    }
    function parseAtom() {
        const t = tokens[pos];
        if (t === '(') {
            pos += 1;
            const inner = parseExpr();
            if (tokens[pos] !== ')') {
                return null;
            }
            pos += 1;
            return inner;
        }
        if (/^\d+$/.test(t || '')) {
            pos += 1;
            const idx = Number(t) - 1;
            if (idx < 0 || idx >= results.length) {
                return null;
            }
            return results[idx];
        }
        return null;
    }
    const out = parseExpr();
    return pos === tokens.length ? out : null;
}

/**
 * Visibility config (§7) → is the thing VISIBLE?
 * No config / no rules → visible. action 'hide' inverts a match.
 */
export function evaluateVisibility(config, ctx) {
    if (!config || !Array.isArray(config.rules) || config.rules.length === 0) {
        return true;
    }
    const results = config.rules.map((r) => ruleMatches(r, ctx));
    let matched;
    if (config.logic === 'any') {
        matched = results.some(Boolean);
    } else if (config.logic === 'custom') {
        const custom = evaluateCustomLogic(config.customLogic, results);
        matched = custom === null ? false : custom; // malformed → fail safe
    } else {
        matched = results.every(Boolean); // 'all' is the default
    }
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
            } catch (e) {
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
            if (entry.min !== null && entry.min !== undefined && n < entry.min) {
                return message;
            }
            if (entry.max !== null && entry.max !== undefined && n > entry.max) {
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
    for (const entry of (element && element.validation) || []) {
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
