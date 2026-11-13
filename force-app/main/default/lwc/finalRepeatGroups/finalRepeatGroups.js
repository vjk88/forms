/**
 * finalRepeatGroups — repeating groups ("Related records"): the numbers and
 * small rules the viewer and the Studio inspector share
 * (IMPL_PLAN_RELATED_RECORDS §2, §5). A plain module; no component state.
 */

/** One absolute cap per group, whatever Max says (§5). */
export const MAX_ENTRIES_PER_GROUP = 50;

/** A whole number, or NaN. Accepts a number or a plain numeric string. */
function whole(v) {
    if (typeof v === 'number') {
        return Number.isInteger(v) ? v : NaN;
    }
    if (typeof v === 'string' && v.trim() !== '' && /^-?\d+$/.test(v.trim())) {
        return Number(v.trim());
    }
    return NaN;
}

const isUnset = (v) => v === undefined || v === null || v === '';

/**
 * The limits a group RUNS with. Min: blank → 1, else a whole number 0–50.
 * Max: blank/0 → up to 50; a positive whole number is capped at 50 (an older
 * published Max of 500 still opens). Anything else, or Min above the
 * effective maximum, is `ok: false`: the form does not open (§5).
 * @param {object} repeat The section's `repeat` block.
 * @returns {{ ok: boolean, min: number, max: number }}
 */
export function repeatLimits(repeat) {
    const r = repeat || {};
    const min = isUnset(r.min) ? 1 : whole(r.min);
    const rawMax = isUnset(r.max) ? 0 : whole(r.max);
    const max =
        rawMax === 0
            ? MAX_ENTRIES_PER_GROUP
            : Math.min(rawMax, MAX_ENTRIES_PER_GROUP);
    const ok =
        Number.isInteger(min) &&
        min >= 0 &&
        min <= MAX_ENTRIES_PER_GROUP &&
        Number.isInteger(rawMax) &&
        rawMax >= 0 &&
        min <= max;
    return ok ? { ok, min, max } : { ok, min: 0, max: MAX_ENTRIES_PER_GROUP };
}

/**
 * The inspector's stricter check (§5): what may be SAVED. Returns the message
 * for each bad setting, keyed `min` / `max`; empty when both are fine.
 * @param {*} min Candidate Min rows.
 * @param {*} max Candidate Max rows.
 * @returns {{ min?: string, max?: string }}
 */
export function limitProblems(min, max) {
    const out = {};
    const m = isUnset(min) ? 1 : whole(min);
    const x = isUnset(max) ? 0 : whole(max);
    const minOk = Number.isInteger(m) && m >= 0 && m <= MAX_ENTRIES_PER_GROUP;
    const maxOk = Number.isInteger(x) && x >= 0 && x <= MAX_ENTRIES_PER_GROUP;
    if (!minOk) {
        out.min = 'Min rows must be a whole number from 0 to 50.';
    }
    if (!maxOk) {
        out.max = 'Max rows must be blank or a whole number from 0 to 50.';
    }
    return out;
}

/** An answer that says nothing: blank text, no choice, an empty list or map.
 *  `false` IS an answer (a ticked-then-unticked box is saved as false), the
 *  same test FinalSubmitService.isBlankValue makes, so the browser and the
 *  server agree on which entries are started. */
export function isBlankAnswer(v) {
    if (v === undefined || v === null || v === '') {
        return true;
    }
    if (Array.isArray(v)) {
        return v.length === 0;
    }
    if (typeof v === 'object') {
        return Object.keys(v).length === 0;
    }
    return typeof v === 'string' && v.trim() === '';
}

/** Display-only element types: they hold no answer and take no cursor.
 *  The same list as FinalPublishWarnings.BLOCK_TYPES. */
const BLOCK_TYPES = new Set([
    'richText',
    'image',
    'callout',
    'divider',
    'spacer'
]);

/** A question someone can answer (and put the cursor in). */
export function isAnswerable(el) {
    return Boolean(el) && !BLOCK_TYPES.has(el.type);
}

/** "Fill in at least 2 entries." (§5) */
export function minimumMessage(min) {
    return `Fill in at least ${min} ${min === 1 ? 'entry' : 'entries'}.`;
}
