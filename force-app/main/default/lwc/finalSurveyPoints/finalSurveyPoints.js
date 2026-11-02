/**
 * finalSurveyPoints — the answer scales of the survey question types, in ONE
 * place (IMPL_PLAN_FORM_PDF §4.2).
 *
 * The renderer draws these scales and the PDF writes their answers back as
 * words. Both read them from here so a default can never differ between the
 * question a person answered and the copy they download.
 */

const LIKERT_DEFAULT = Object.freeze([
    Object.freeze({ value: 1, label: 'Strongly disagree' }),
    Object.freeze({ value: 2, label: 'Disagree' }),
    Object.freeze({ value: 3, label: 'Neutral' }),
    Object.freeze({ value: 4, label: 'Agree' }),
    Object.freeze({ value: 5, label: 'Strongly agree' })
]);

const MATRIX_DEFAULT = Object.freeze([
    Object.freeze({ value: 1, label: 'Disagree' }),
    Object.freeze({ value: 2, label: 'Neutral' }),
    Object.freeze({ value: 3, label: 'Agree' }),
    Object.freeze({ value: 4, label: 'Strongly agree' })
]);

/** Sizes a `scale` question may have; anything else reads as 5. */
export const SCALE_SIZES = Object.freeze([5, 7, 10]);

function authored(cfg) {
    const pts = cfg && cfg.points;
    return Array.isArray(pts) && pts.length ? pts : null;
}

/** Likert points: authored config.points, else the classic agree-5. */
export function likertPoints(cfg) {
    return authored(cfg) || LIKERT_DEFAULT;
}

/** Matrix scale points: authored config.points, else agree-4. */
export function matrixPoints(cfg) {
    return authored(cfg) || MATRIX_DEFAULT;
}

/**
 * The lowest and highest value of a scale-family question.
 * @param {string} type element type (likert|nps|rating|scale|emojiScale)
 * @param {object} cfg  element config
 */
export function scaleBounds(type, cfg) {
    const c = cfg || {};
    if (type === 'likert') {
        const pts = likertPoints(c);
        return { min: pts[0].value, max: pts[pts.length - 1].value };
    }
    if (type === 'nps') {
        return { min: 0, max: 10 };
    }
    if (type === 'rating') {
        // segmented 5|10 (owner ruling Q1 — the 7 lives on `scale` only)
        return { min: 1, max: c.max === 10 ? 10 : 5 };
    }
    if (type === 'scale') {
        return { min: 1, max: SCALE_SIZES.includes(c.size) ? c.size : 5 };
    }
    return { min: 1, max: 5 }; // emojiScale
}
