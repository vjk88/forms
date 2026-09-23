/**
 * finalMappingModel — every read and write of spec.mapping, as pure
 * functions (FREEFORM_F2_MAPPING_SPEC section 4). Components stay thin:
 * they call these and emit the returned spec. Nothing here mutates its
 * input. Publish is the real judge (FinalMappingValidator); actionState
 * only gives the step list its hints.
 */
export const MAX_STEPS = 10;

export function actionsOf(spec) {
    return (spec && spec.mapping && spec.mapping.actions) || [];
}

function withActions(spec) {
    const next = JSON.parse(JSON.stringify(spec || {}));
    next.mapping = next.mapping || {};
    next.mapping.actions = next.mapping.actions || [];
    return next;
}

function update(spec, actionId, fn) {
    const next = withActions(spec);
    const action = next.mapping.actions.find((a) => a.id === actionId);
    if (action) {
        action.fields = action.fields || [];
        fn(action);
    }
    return next;
}

/** Same shape and randomness as the Studio's element ids. */
function mintActionId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (const b of bytes) {
        suffix += (b % 36).toString(36);
    }
    return `act_${suffix}`;
}

function emptyMatch() {
    return { field: null, source: null, filter: { logic: 'all', rows: [] } };
}

export function addAction(spec, objectApi, operation = 'create') {
    const next = withActions(spec);
    if (next.mapping.actions.length >= MAX_STEPS) {
        return { spec, actionId: null };
    }
    const actionId = mintActionId();
    const action = { id: actionId, object: objectApi, operation, fields: [] };
    if (operation === 'findOrCreate') {
        action.match = emptyMatch(); // no onMatch: the author must answer (D32)
    }
    next.mapping.actions.push(action);
    return { spec: next, actionId };
}

/**
 * References to the removed step stay where they are. Publish refuses them
 * and names the step, which is louder than silently clearing an author's
 * work.
 */
export function removeAction(spec, actionId) {
    const next = withActions(spec);
    next.mapping.actions = next.mapping.actions.filter(
        (a) => a.id !== actionId
    );
    return next;
}

export function moveAction(spec, fromIndex, toIndex) {
    const next = withActions(spec);
    const list = next.mapping.actions;
    if (
        fromIndex < 0 ||
        fromIndex >= list.length ||
        toIndex < 0 ||
        toIndex >= list.length
    ) {
        return next;
    }
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    return next;
}

function dropOverwriteFlags(action) {
    action.fields.forEach((f) => {
        delete f.writeOnMatch;
    });
}

export function setOperation(spec, actionId, operation) {
    return update(spec, actionId, (a) => {
        a.operation = operation;
        if (operation === 'findOrCreate') {
            a.match = a.match || emptyMatch();
        } else {
            delete a.match;
            dropOverwriteFlags(a);
        }
    });
}

export function setFieldSource(spec, actionId, field, source) {
    return update(spec, actionId, (a) => {
        const existing = a.fields.find((f) => f.field === field);
        if (existing) {
            existing.source = source;
        } else {
            a.fields.push({ field, source });
        }
    });
}

export function removeField(spec, actionId, field) {
    return update(spec, actionId, (a) => {
        a.fields = a.fields.filter((f) => f.field !== field);
    });
}

export function setMatch(spec, actionId, patch) {
    return update(spec, actionId, (a) => {
        a.match = { ...(a.match || emptyMatch()), ...patch };
        if (patch.field) {
            const matched = a.fields.find((f) => f.field === patch.field);
            if (matched) {
                delete matched.writeOnMatch;
            }
        }
    });
}

export function setOnMatch(spec, actionId, onMatch) {
    return update(spec, actionId, (a) => {
        a.match = { ...(a.match || emptyMatch()), onMatch };
        if (onMatch !== 'update') {
            dropOverwriteFlags(a);
        }
    });
}

/** The match field can never be overwritten: you don't overwrite what you searched by. */
export function setWriteOnMatch(spec, actionId, field, on) {
    return update(spec, actionId, (a) => {
        if (
            !a.match ||
            a.match.onMatch !== 'update' ||
            a.match.field === field
        ) {
            return;
        }
        const f = a.fields.find((x) => x.field === field);
        if (!f) {
            return;
        }
        if (on) {
            f.writeOnMatch = true;
        } else {
            delete f.writeOnMatch;
        }
    });
}

export function answerIndex(spec) {
    const index = new Map();
    const add = (key, entry) => {
        if (!key) return;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(entry);
    };
    actionsOf(spec).forEach((a, i) => {
        const base = { actionId: a.id, object: a.object, step: i + 1 };
        if (a.match && a.match.source && a.match.source.kind === 'answer') {
            add(a.match.source.elementKey, {
                ...base,
                field: a.match.field,
                use: 'match'
            });
        }
        (a.fields || []).forEach((f) => {
            if (!f.source) return;
            if (f.source.kind === 'answer') {
                add(f.source.elementKey, {
                    ...base,
                    field: f.field,
                    use: 'value'
                });
            } else if (
                f.source.kind === 'recordRef' &&
                typeof f.source.ref === 'string' &&
                f.source.ref.startsWith('answer:')
            ) {
                // The record picked in a lookup question, filling a relationship.
                // It IS used; without this it read as "Stored only".
                add(f.source.ref.slice(7), {
                    ...base,
                    field: f.field,
                    use: 'link'
                });
            }
        });
    });
    return index;
}

/**
 * A source is usable, not merely present. `false` and `0` are perfectly
 * good fixed values, so nothing here asks whether a value is truthy.
 */
function sourceUsable(source, earlier) {
    if (!source) return false;
    if (source.kind === 'answer') {
        return (
            typeof source.elementKey === 'string' && source.elementKey !== ''
        );
    }
    if (source.kind === 'literal') {
        return (
            source.value !== null &&
            source.value !== undefined &&
            source.value !== ''
        );
    }
    if (source.kind === 'recordRef') {
        const ref = source.ref;
        if (typeof ref !== 'string') return false;
        if (ref.startsWith('action:')) return earlier.has(ref.slice(7));
        if (ref.startsWith('answer:')) return ref.length > 'answer:'.length;
        return false; // 'link' is refused at publish while F2 has nowhere to read it
    }
    return false;
}

const NO_VALUE_OPS = new Set(['isBlank', 'isNotBlank']);
const MULTI_VALUE_OPS = new Set(['in', 'nin', 'includes', 'excludes']);

/** A condition with a field, an operator and — unless the operator needs
 *  none — a value. The same test publish applies, as a hint. */
function filterRowComplete(row) {
    if (!row || !row.fieldPath || !row.operator) return false;
    if (NO_VALUE_OPS.has(row.operator)) return true;
    if (MULTI_VALUE_OPS.has(row.operator)) {
        return Array.isArray(row.values) && row.values.length > 0;
    }
    return row.value !== null && row.value !== undefined && row.value !== '';
}

export function actionState(actions, index) {
    const a = actions[index];
    if (!a) return 'broken';
    const earlier = new Set(actions.slice(0, index).map((x) => x.id));
    const fields = a.fields || [];
    const broken = fields.some(
        (f) =>
            f.source &&
            f.source.kind === 'recordRef' &&
            typeof f.source.ref === 'string' &&
            f.source.ref.startsWith('action:') &&
            !earlier.has(f.source.ref.slice(7))
    );
    if (broken) return 'broken';
    if (!fields.length) return 'incomplete';
    // A field whose source was never picked — which is the state "Add a
    // field" leaves behind — is unfinished, not fine.
    if (fields.some((f) => !sourceUsable(f.source, earlier)))
        return 'incomplete';
    if (a.operation === 'findOrCreate') {
        const m = a.match || {};
        if (
            !m.field ||
            !sourceUsable(m.source, earlier) ||
            !m.onMatch ||
            !(m.filter && (m.filter.rows || []).length) ||
            !m.filter.rows.every(filterRowComplete)
        ) {
            return 'incomplete';
        }
    }
    return 'ok';
}
