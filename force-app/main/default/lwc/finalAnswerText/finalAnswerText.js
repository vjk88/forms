/**
 * finalAnswerText — answers turned back into the words a person chose
 * (IMPL_PLAN_FORM_PDF §4.2). ONE wording for every place an answer is read:
 * the submission reader (on screen), the staff PDF and the respondent's PDF
 * copy. "3 out of 10", a matrix point's label, a numbered ranking, a local
 * date: if it changes, it changes everywhere.
 *
 * - answerLines(el, value)       a live answer (the viewer's payload shape)
 * - storedAnswerLines(a, el)     a stored Form_Submission_Answer__c row
 * - matrixAnswerWord(el, value)  one matrix statement's chosen point
 */
import { lookOf, optionsFor } from 'c/finalChoiceLook';
import { likertPoints, matrixPoints, scaleBounds } from 'c/finalSurveyPoints';

const SCALE_TYPES = new Set(['nps', 'rating', 'scale', 'emojiScale']);

/**
 * One stored choice value, as a person should read it.
 *
 * `options` is the choice list from the version that was FILLED IN, each
 * entry `{ value, label }`. `value` is what was stored — an internal key
 * like "vip", never the wording.
 *
 * Comparison is by string: a spec authored with numeric option values stores
 * "1" and declares 1, and those must still be the same option.
 *
 * An unmatched value falls back to the key itself, with no marker attached.
 * That case is not the exception it looks like — the orphan section renders
 * with no element at all, so EVERY answer there arrives here unmatched, and a
 * note on each one would only repeat the heading already above them. Inside a
 * live question it means the author deleted the option after someone picked
 * it; the key is still the truthful answer, and a parenthetical repeated
 * across six selections of a multi-select would cost more than it explains.
 */
export function optionLabel(value, options) {
    if (value === null || value === undefined) {
        return '';
    }
    const key = String(value);
    const hit = (options || []).find((o) => o && String(o.value) === key);
    if (!hit) {
        return key;
    }
    // An option may carry a value and no wording; the key is then all the
    // name it ever had.
    return hit.label === null ||
        hit.label === undefined ||
        String(hit.label).trim() === ''
        ? key
        : hit.label;
}

// ------------------------------------------------------------- answers --

export function isEmptyAnswer(v) {
    return (
        v === null ||
        v === undefined ||
        v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
    );
}

export function choiceOptions(el) {
    const cfg = el.config || {};
    let own = cfg.options || [];
    if (el.type === 'field') {
        own = optionsFor(cfg, lookOf(cfg, el.renderDefault).look) || [];
    }
    // A published projection compiles describe options into `render`
    // (schema §4); they name a picklist's values when the author added none.
    return own.length ? own : (el.render && el.render.options) || [];
}

export function labelOf(o) {
    if (!o) return '';
    const base = o.label || String(o.value ?? '');
    return o.emoji ? `${o.emoji} ${base}` : base;
}

/** 'YYYY-MM-DD' as a local date, without a timezone shift. */
export function formatDate(v, locale) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (!m) return String(v);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    try {
        return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC'
        }).format(d);
    } catch {
        return String(v);
    }
}

export function formatDateTime(v, locale) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    try {
        return new Intl.DateTimeFormat(locale, {
            dateStyle: 'long',
            timeStyle: 'short'
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

function yesNo(v, cfg) {
    const yes = (cfg && cfg.yesLabel) || 'Yes';
    const no = (cfg && cfg.noLabel) || 'No';
    if (v === true || v === 'true') return yes;
    if (v === false || v === 'false') return no;
    return String(v);
}

/**
 * One answer as lines of text (a multi-line answer keeps its line breaks).
 * `ctx`: { locale, lookupLabels }.
 * @returns {string[]} empty when unanswered
 */
export function answerLines(el, value, ctx = {}) {
    if (isEmptyAnswer(value)) {
        return [];
    }
    const cfg = el.config || {};
    const locale = ctx.locale;
    const type = el.type;

    if (type === 'yesNo') return [yesNo(value, cfg)];
    if (type === 'consent') {
        return [value === true || value === 'true' ? 'Agreed' : 'Not agreed'];
    }
    if (type === 'likert') {
        return [optionLabel(value, likertPoints(cfg))];
    }
    if (SCALE_TYPES.has(type)) {
        const { max } = scaleBounds(type, cfg);
        return [`${value} out of ${max}`];
    }
    if (type === 'ranking') {
        const opts = cfg.options || [];
        return (Array.isArray(value) ? value : [value]).map(
            (v, i) => `${i + 1}. ${optionLabel(v, opts)}`
        );
    }
    if (type === 'file') {
        return (Array.isArray(value) ? value : [value])
            .map((f) => (f && (f.name || f.title)) || '')
            .filter(Boolean);
    }
    if (type === 'imageChoice') {
        const opts = cfg.options || [];
        return [
            (Array.isArray(value) ? value : [value])
                .map((v) => optionLabel(v, opts))
                .join(', ')
        ];
    }

    const inputType = cfg.inputType;
    if (
        inputType === 'reference' ||
        inputType === 'lookup' ||
        type === 'lookup'
    ) {
        const label = ctx.lookupLabels && ctx.lookupLabels[el.id];
        return [label || String(value)];
    }
    const options = choiceOptions(el);
    if (options.length && !(typeof value === 'boolean')) {
        const list = Array.isArray(value)
            ? value
            : typeof value === 'string' && inputType === 'multipicklist'
              ? value.split(';')
              : [value];
        const opts = options.map((o) => ({
            value: o.value,
            label: labelOf(o)
        }));
        return [list.map((v) => optionLabel(v, opts)).join(', ')];
    }
    if (typeof value === 'boolean') {
        return [value ? 'Yes' : 'No'];
    }
    if (inputType === 'date') return [formatDate(value, locale)];
    if (inputType === 'datetime') return [formatDateTime(value, locale)];
    if (Array.isArray(value)) return [value.map(String).join(', ')];
    if (typeof value === 'object') return [JSON.stringify(value)];
    return String(value).split(/\r?\n/);
}

/** One matrix statement's chosen point, as its label ("Agree"). */
export function matrixAnswerWord(el, value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    return optionLabel(value, matrixPoints((el && el.config) || {}));
}

/**
 * A STORED answer row (FinalSubmissionController's shape: answerType plus
 * typed columns) as lines of words, through the same wording as a live one.
 * `el` is the question from the version that was filled in.
 * @returns {string[]} empty when the row holds no value
 */
export function storedAnswerLines(a, el, ctx = {}) {
    if (!a) {
        return [];
    }
    if (a.unparsed) {
        return a.text ? String(a.text).split(/\r?\n/) : [];
    }
    let value;
    switch (a.answerType) {
        case 'Boolean':
            value = Boolean(a.checked);
            break;
        case 'Number':
            value = a.number;
            break;
        case 'Date':
            return a.date ? [formatDate(a.date, ctx.locale)] : [];
        case 'DateTime':
            return a.dateTime ? [formatDateTime(a.dateTime, ctx.locale)] : [];
        case 'Options':
            try {
                value = JSON.parse(a.options || '[]');
            } catch {
                return a.options ? [String(a.options)] : [];
            }
            break;
        default:
            value = a.text;
    }
    if (!el) {
        if (isEmptyAnswer(value)) return [];
        if (typeof value === 'boolean') return [value ? 'Yes' : 'No'];
        return [Array.isArray(value) ? value.join(', ') : String(value)];
    }
    return answerLines(el, value, ctx);
}
