/**
 * finalAnswerText — stored answer values turned back into the words a person
 * chose (IMPL_PLAN_FORM_PDF §4.2). Shared by the submission reader and the PDF
 * model, so a choice reads the same on screen and on paper.
 */

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
