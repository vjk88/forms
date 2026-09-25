/**
 * finalAutofillFit — what an Autofill value becomes in its question
 * (IMPL_PLAN_F2_AUTOFILL 6.7). Shared by the runtime (autofillEngine) and
 * the Studio's rule dialog, so "Try it with a record" shows exactly what
 * will fill. The server's twin is FinalAutofillRules: answerTypeOf here must
 * stay in step with its FILLABLE_INPUTS.
 */

/** The inputs Autofill fills, and the answer type each is filled as. */
const INPUTS = {
    text: 'Text',
    textarea: 'Text',
    email: 'Email',
    phone: 'Phone',
    tel: 'Phone',
    url: 'URL',
    number: 'Number',
    currency: 'Number',
    percent: 'Number',
    slider: 'Number',
    date: 'Date',
    picklist: 'Choice'
};

/** The answer type an element is filled as, or null when it can't be. */
export function answerTypeOf(el) {
    if (!el || el.type !== 'field') {
        return null;
    }
    const cfg = el.config || {};
    const kind = String(cfg.inputType || 'text').toLowerCase();
    const answerType = INPUTS[kind] || null;
    if (
        answerType === 'Choice' &&
        ['Checkbox_Group', 'Custom_MultiSelect'].includes(cfg.renderAs)
    ) {
        return null; // several choices: not filled
    }
    return answerType;
}

/**
 * Every element Autofill might fill, by id: { answerType, options }.
 */
export function extractDestinations(spec) {
    const out = {};
    const walk = (elements) => {
        (elements || []).forEach((el) => {
            if (!el) return;
            if (Array.isArray(el.elements)) walk(el.elements);
            const answerType = answerTypeOf(el);
            if (el.id && answerType) {
                out[el.id] = {
                    answerType,
                    options: (el.config && el.config.options) || null
                };
            }
        });
    };
    (spec?.pages || []).forEach((page) =>
        (page.sections || []).forEach((sec) => walk(sec.elements))
    );
    return out;
}

/** What fitValue returns for a value the question can't take. */
export const DOES_NOT_FIT = Symbol('doesNotFit');

function pad(n) {
    return String(n).padStart(2, '0');
}

/**
 * The date a value means, as 'YYYY-MM-DD'. A date-time (it has a time, 'T')
 * is read in the viewer's own time zone: 8pm Pacific on the 24th is the
 * 24th here, not the 25th it is in UTC.
 */
function dateOf(value) {
    const text = String(value);
    if (text.includes('T')) {
        const d = new Date(text);
        return Number.isNaN(d.getTime())
            ? null
            : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    const m = /^(\d{4}-\d{2}-\d{2})$/.exec(text.trim());
    return m ? m[1] : null;
}

/**
 * Turns a source value into the answer its question takes, or DOES_NOT_FIT.
 * A value that doesn't fit is never forced in.
 *   Number — a number (text that reads as one is accepted)
 *   Date   — 'YYYY-MM-DD'; a date-time keeps its local date
 *   Choice — the option whose value or label matches; none, DOES_NOT_FIT
 *   text   — a string
 * No destination known (older specs, previews) — the value as it came.
 */
export function fitValue(value, destination) {
    if (value === null || value === undefined || !destination) {
        return value;
    }
    switch (destination.answerType) {
        case 'Number': {
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : DOES_NOT_FIT;
            }
            const text = String(value).trim();
            const n = text === '' ? NaN : Number(text);
            return Number.isFinite(n) ? n : DOES_NOT_FIT;
        }
        case 'Date':
            return dateOf(value) || DOES_NOT_FIT;
        case 'Choice': {
            const options = destination.options;
            const text = String(value);
            if (!Array.isArray(options) || !options.length) {
                return text;
            }
            const hit = options.find(
                (o) => o && (String(o.value) === text || o.label === text)
            );
            return hit ? hit.value : DOES_NOT_FIT;
        }
        default:
            return typeof value === 'string' ? value : String(value);
    }
}
