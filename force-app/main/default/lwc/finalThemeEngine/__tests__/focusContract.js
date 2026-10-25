/**
 * The focus tokens that IMPL_PLAN_FOCUS_CONTRAST v5 Part B (owner decision
 * V4) may change or add. Token snapshots taken before Part B compare
 * everything EXCEPT these, so every other token stays pinned exactly.
 */
export const FOCUS_TOKENS = [
    // changed
    '--c-field-focus',
    '--c-focus-ring',
    '--c-input-shadow-focus',
    // added (the gate: never given a CSS default)
    '--c-focus-partner',
    '--c-focus-shadow',
    '--c-focus-outline',
    '--c-input-focus-style',
    '--c-focus-base',
    '--c-focus-under',
    '--c-focus-page-field',
    '--c-focus-page-partner',
    '--c-focus-page-ring',
    '--c-focus-page-input',
    '--c-focus-page-under'
];

/** The token bag without the focus tokens. */
export function withoutFocus(tokens) {
    const out = { ...tokens };
    FOCUS_TOKENS.forEach((key) => delete out[key]);
    return out;
}
