/** Studio-only reconciliation. Values (including file bodies) are never serialized. */
function index(spec) {
    const fields = new Map();
    const repeats = new Map();
    for (const page of spec?.pages || []) {
        for (const section of page.sections || []) {
            if (section.repeat) {
                repeats.set(`repeat:${section.id}`, section);
            } else {
                for (const el of section.elements || []) fields.set(el.id, el);
            }
        }
    }
    return { fields, repeats };
}

function shape(el) {
    const cfg = el.config || {};
    return JSON.stringify([
        el.type,
        el.type === 'field'
            ? cfg.inputType || el.render?.inputType || 'text'
            : null,
        ['Checkbox_Group', 'Custom_MultiSelect'].includes(cfg.renderAs) ||
            (el.type === 'imageChoice' && Boolean(cfg.multiple)),
        el.binding?.object,
        el.binding?.field,
        el.binding?.scope,
        el.mapping?.field
    ]);
}

function pruneValue(value, before, after) {
    if (!before || shape(before) !== shape(after)) return undefined;
    const cfg = after.config || {};
    const oldCfg = before.config || {};
    if (after.type === 'matrix') {
        const rows = new Set((cfg.rows || []).map((r) => r.value));
        const points = new Set(
            (cfg.points?.length
                ? cfg.points
                : [1, 2, 3, 4].map((v) => ({ value: v }))
            ).map((p) => p.value)
        );
        return Object.fromEntries(
            Object.entries(value || {}).filter(
                ([row, point]) => rows.has(row) && points.has(point)
            )
        );
    }
    if (after.type === 'likert') {
        const points = cfg.points?.length
            ? cfg.points.map((p) => p.value)
            : [1, 2, 3, 4, 5];
        return points.includes(Number(value)) ? value : undefined;
    }
    if (
        ['ranking', 'imageChoice'].includes(after.type) ||
        (cfg.options || []).length > 0 ||
        (oldCfg.options || []).length > 0
    ) {
        const options = (cfg.options || []).map((o) => o.value);
        const oldOptions = (oldCfg.options || []).map((o) => o.value);
        const allowed = (v) =>
            options.includes(v) || (cfg.allowOther && !oldOptions.includes(v));
        if (Array.isArray(value)) {
            const kept = value.filter(allowed);
            return after.type === 'ranking'
                ? [...kept, ...options.filter((v) => !kept.includes(v))]
                : kept;
        }
        return allowed(value) ? value : undefined;
    }
    if (after.type === 'file' && Array.isArray(value) && !cfg.multiple)
        return value.slice(0, 1);
    return value;
}

function pruneFields(answers, before, after) {
    const result = {};
    for (const [id, el] of after) {
        if (!Object.prototype.hasOwnProperty.call(answers, id)) continue;
        const value = pruneValue(answers[id], before.get(id), el);
        if (value !== undefined) result[id] = value;
    }
    return result;
}

export function reconcileAnswers(answers, previousSpec, nextSpec) {
    const before = index(previousSpec);
    const after = index(nextSpec);
    const result = pruneFields(answers || {}, before.fields, after.fields);
    if (previousSpec?.form?.targetObject !== nextSpec?.form?.targetObject) {
        for (const [id, el] of after.fields) {
            if (el.mapping?.field) delete result[id];
        }
    }
    for (const [id, section] of after.repeats) {
        const old = before.repeats.get(id);
        if (
            !old ||
            old.repeat.childObject !== section.repeat.childObject ||
            old.repeat.relationshipField !== section.repeat.relationshipField ||
            !Array.isArray(answers?.[id])
        )
            continue;
        const oldFields = new Map(
            (old.elements || []).map((el) => [el.id, el])
        );
        const newFields = new Map(
            (section.elements || []).map((el) => [el.id, el])
        );
        const max = Number(section.repeat.max);
        const rows = max > 0 ? answers[id].slice(0, max) : answers[id];
        result[id] = rows.map((row) => pruneFields(row, oldFields, newFields));
        const min = Math.max(Number(section.repeat.min) || 1, 1);
        while (result[id].length < min) result[id].push({});
    }
    return result;
}

export function pageAnchor(page) {
    return page
        ? {
              key: page.revealKey,
              elements: (page.sections || []).flatMap((s) =>
                  (s.elements || []).map((el) => el.id)
              )
          }
        : null;
}

export function restorePage(pages, anchor, fallback = 0) {
    let found = anchor
        ? pages.findIndex((p) => p.revealKey === anchor.key)
        : -1;
    if (found < 0 && anchor?.elements?.length) {
        found = pages.findIndex((p) =>
            (p.sections || []).some((s) =>
                (s.elements || []).some((el) => anchor.elements.includes(el.id))
            )
        );
    }
    return found >= 0
        ? found
        : Math.max(0, Math.min(fallback, pages.length - 1));
}
