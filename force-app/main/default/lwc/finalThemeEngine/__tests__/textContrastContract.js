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
    '--c-text-unresolved',
    // PR B: the range text is judged on, the open page's own set, and the
    // backings (card: every card painter; page: the One at a time column)
    '--c-text-under',
    '--c-text-weak-page',
    '--c-label-color-page',
    '--c-accent-text-page',
    '--c-accent-mark-page',
    '--c-mark-idle-page',
    '--c-mark-idle-stroke-page',
    '--c-idle-value-style-page',
    '--c-text-under-page',
    '--c-card-backing',
    '--c-card-backing-image',
    '--c-card-backing-on',
    '--c-page-backing',
    '--c-page-backing-pad',
    '--c-page-backing-radius',
    '--c-page-backing-chip-pad',
    // set by the open-page swap only (viewer banners)
    '--c-banner-backing',
    '--c-page-backing-on',
    // the header: the open page's and a banner's own title and description
    // colours, and the text plates (header follow-up)
    '--c-header-text-page',
    '--c-header-text-weak-page',
    '--c-header-text-banner',
    '--c-header-text-weak-banner',
    '--c-header-plate',
    '--c-header-plate-page',
    '--c-header-plate-banner',
    '--c-pane-text-fade',
    '--c-header-text-src',
    '--c-header-text-weak-src'
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
        if (out['--c-header-text-src']) {
            out['--c-header-text'] = out['--c-header-text-src'];
            out['--c-header-text-weak'] = out['--c-header-text-weak-src'];
        }
    }
    TEXT_TREATMENT_TOKENS.forEach((key) => delete out[key]);
    return out;
}

/** Both later programs undone: focus Part B and the text treatment. */
export function withoutLater(tokens) {
    return withoutTextTreatment(withoutFocus(tokens));
}
