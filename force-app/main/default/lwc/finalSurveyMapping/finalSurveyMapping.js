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

/**
 * SO-1×SO-3: strip record-sourced rule rows that no longer resolve after an
 * object change (`liveFields` = Set of API names on the NEW object) or a
 * disconnect (`liveFields` = null → every record row dies). MUTATES the spec
 * it is given — run it on a clone for a dialog preview, or inside the
 * studio's immutable mutate path to commit. Returns casualty labels.
 *
 * Row surgery is only safe for all/any logic (the results array just
 * shrinks); CUSTOM logic numbers its rows ("1 AND (2 OR 3)") — splicing
 * would silently rewire the expression, so a custom-logic config loses the
 * WHOLE config when any of its record rows dies.
 */
export function pruneRecordRules(spec, liveFields) {
    const casualties = [];
    const prune = (owner, label, key) => {
        const config = owner[key];
        if (!config || !Array.isArray(config.rules)) {
            return;
        }
        const dead = config.rules.filter(
            (r) =>
                typeof r.source === 'string' &&
                r.source.startsWith('record:') &&
                (!liveFields || !liveFields.has(r.source.slice(7)))
        );
        if (!dead.length) {
            return;
        }
        if (config.logic === 'custom') {
            delete owner[key];
            casualties.push(
                `${label} — rules removed (custom logic referenced the object)`
            );
            return;
        }
        const rules = config.rules.filter((r) => !dead.includes(r));
        if (rules.length) {
            owner[key] = { ...config, rules };
            casualties.push(
                `${label} — ${dead.length} record rule${
                    dead.length === 1 ? '' : 's'
                } removed`
            );
        } else {
            delete owner[key];
            casualties.push(`${label} — rules removed`);
        }
    };
    for (const page of (spec && spec.pages) || []) {
        prune(page, `Page "${page.name || page.id}"`, 'visibility');
        for (const section of page.sections || []) {
            prune(
                section,
                `Section "${section.title || section.id}"`,
                'visibility'
            );
            for (const el of section.elements || []) {
                prune(el, `"${el.label || el.id}"`, 'visibility');
                for (const v of el.validation || []) {
                    prune(v, `"${el.label || el.id}" check`, 'when');
                }
            }
        }
    }
    return casualties;
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
