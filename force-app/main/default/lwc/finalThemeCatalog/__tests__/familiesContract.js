/**
 * The theme families build (IMPL_PLAN_THEME_FAMILIES, step 3): the ONE
 * allowlist of tokens its recipe edits may change. Token snapshots taken
 * before it compare everything else exactly.
 *
 * - The 17 restored themes gained `palette.inkMode: 'contrast'`: only their
 *   button and selected-answer ink may change.
 * - Cosmic Vortex's purple went 2% lighter (#a855f7 → #aa58f7): its accent,
 *   button colour, and the focus tokens derived from the accent may change.
 */
export const RESTORED = [
    'lavender',
    'terracotta',
    'vintagePaper',
    'tokyo',
    'marbleSplit',
    'claySplit',
    'botanicalSplit',
    'cyberSplit',
    'marbleLuxury',
    'sunsetDunes',
    'forestMist',
    'silkLuxury',
    'carbonMatrix',
    'cosmicVortex',
    'auroraBorealis',
    'auraSplit',
    'retroStepper'
];

const INK = ['--c-on-accent', '--c-submit-text'];
const COSMIC = [
    '--c-accent',
    '--c-submit-bg',
    '--c-field-focus',
    '--c-focus-base',
    '--c-focus-ring',
    '--c-focus-shadow',
    '--c-focus-ring-inset',
    '--c-input-shadow-focus'
];

/** The tokens the families build may change on this theme. */
export function familiesAllowed(key) {
    if (key === 'cosmicVortex') {
        return [...INK, ...COSMIC];
    }
    return RESTORED.includes(key) ? [...INK] : [];
}

/** The token bag without the tokens the families build may change. */
export function withoutFamiliesChanges(key, tokens) {
    const out = { ...tokens };
    familiesAllowed(key).forEach((t) => delete out[t]);
    return out;
}
