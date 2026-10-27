/**
 * The tokens IMPL_PLAN_TEXT_CONTRAST v7 (PR A) may add or change. Token
 * snapshots taken before it compare everything EXCEPT these, so every other
 * token stays pinned exactly.
 */
import { withoutFocus } from './focusContract';

export const TEXT_TREATMENT_TOKENS = [
    // added: the marker, the originals, and the role colours (each CSS
    // reader falls back to today's value)
    '--c-text-treatment',
    '--c-text-src',
    '--c-text-weak-src',
    '--c-toast-ink',
    '--c-accent-text',
    '--c-accent-mark',
    // the readable idle-mark colour; CSS reads it through -stroke (kept as
    // the plain colour for the tests and the Studio)
    '--c-mark-idle',
    '--c-mark-idle-opacity',
    '--c-mark-idle-fill',
    '--c-mark-idle-stroke',
    '--c-mark-idle-filter',
    '--c-idle-value-style',
    '--c-text-unresolved'
];

/**
 * The token bag as it was before the text treatment: the added tokens gone,
 * and the two values it adjusts in place put back from the originals it
 * carries (`--c-text-weak`, and `--c-label-color` when the marker lists
 * `label`). A bag without the marker comes back unchanged.
 */
export function withoutTextTreatment(tokens) {
    const out = { ...tokens };
    const roles = String(out['--c-text-treatment'] || '').split(' ');
    if (out['--c-text-treatment']) {
        out['--c-text-weak'] = out['--c-text-weak-src'];
        if (roles.includes('label')) {
            out['--c-label-color'] = out['--c-text-weak-src'];
        }
    }
    TEXT_TREATMENT_TOKENS.forEach((key) => delete out[key]);
    return out;
}

/** Both later programs undone: focus Part B and the text treatment. */
export function withoutLater(tokens) {
    return withoutTextTreatment(withoutFocus(tokens));
}
