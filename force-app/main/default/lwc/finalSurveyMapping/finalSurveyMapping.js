/**
 * finalSurveyMapping — the ONE statement of answer-type ↔ field-type
 * compatibility (SURVEY_OBJECT_SPEC). Shared by the property panel's
 * "Map to field" roster and the studio's Connected-object change flow so
 * the two can never disagree about which mappings survive.
 */

const TEXTISH = ['text', 'textarea', 'email', 'phone', 'url'];
const NUMERIC_KINDS = ['nps', 'rating', 'scale', 'emojiScale', 'likert'];

/**
 * inputTypes a mapped field must have for this spec node.
 * null = the node cannot map at all (matrix/ranking/multi — multi-row answers).
 */
export function compatInputTypes(node) {
    if (!node) {
        return null;
    }
    if (NUMERIC_KINDS.includes(node.type)) {
        return ['number'];
    }
    if (node.type === 'yesNo') {
        return ['checkbox'];
    }
    const cfg = node.config || {};
    if (node.type === 'imageChoice') {
        return cfg.multiple ? null : TEXTISH;
    }
    if (node.type === 'field') {
        const it = cfg.inputType || 'text';
        return TEXTISH.includes(it) ? TEXTISH : null;
    }
    return null;
}

/** Every mapped element in the spec: [{ el, section, page }]. */
export function mappedElements(spec) {
    const out = [];
    for (const page of (spec && spec.pages) || []) {
        for (const section of page.sections || []) {
            if (section.repeat) {
                continue; // repeaters are not mappable (spec v1)
            }
            for (const el of section.elements || []) {
                if (el.mapping && el.mapping.field) {
                    out.push({ el, section, page });
                }
            }
        }
    }
    return out;
}
