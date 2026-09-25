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
        if (action.match) {
            action.match = foldMatch(action.match);
        }
        fn(action);
    }
    return next;
}

/**
 * A find-or-create search is its conditions (round 1 #4). Steps saved
 * before then also had a separate "Where [field] matches the answer to
 * [question]"; that pair becomes the first condition — a row
 * `field equals the answer`, or `Field = {!question} AND (…)` in front of
 * typed conditions. Pure: returns a new match. Anything already folded, or
 * with nothing to fold, comes back as it was (minus the empty keys).
 */
export function foldMatch(match) {
    if (!match) {
        return match;
    }
    const m = JSON.parse(JSON.stringify(match));
    const key =
        m.source && m.source.kind === 'answer' ? m.source.elementKey : null;
    const field = m.field;
    delete m.field;
    delete m.source;
    delete m.prefillDeclined;
    if (!field || !key) {
        return m;
    }
    if (m.filterMode === 'soql') {
        const rest = (m.soql || '').trim();
        m.soql = rest
            ? `${field} = {!${key}} AND (${rest})`
            : `${field} = {!${key}}`;
        return m;
    }
    const filter = m.filter || { logic: 'all', rows: [] };
    const rows = filter.rows || [];
    const row = { fieldPath: field, operator: 'eq', value: `$field.${key}` };
    let customLogic = filter.customLogic || null;
    if (filter.logic === 'custom' && customLogic) {
        // The new condition is 1: renumber, and it must hold alongside the rest.
        customLogic = `1 AND (${customLogic.replace(/\d+/g, (n) =>
            String(Number(n) + 1)
        )})`;
    }
    const logic =
        rows.length && filter.logic === 'any' ? 'custom' : filter.logic;
    if (rows.length && filter.logic === 'any') {
        const rest = rows.map((_, i) => String(i + 2)).join(' OR ');
        customLogic = `1 AND (${rest})`;
    }
    m.filter = {
        ...filter,
        logic: logic || 'all',
        customLogic,
        rows: [row, ...rows]
    };
    return m;
}

/** Question ids a search compares with: built rows or typed conditions. */
export function searchAnswerIds(match) {
    const m = foldMatch(match) || {};
    if (m.filterMode === 'soql') {
        return soqlTokenIds(m.soql);
    }
    const out = [];
    ((m.filter && m.filter.rows) || []).forEach((row) => {
        [row && row.value, ...((row && row.values) || [])].forEach((v) => {
            if (typeof v === 'string' && v.startsWith('$field.')) {
                out.push(v.slice(7));
            }
        });
    });
    return out;
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
    return { filter: { logic: 'all', rows: [] } };
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
            delete existing.prefilled; // an old automatic row is now the author's
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
    });
}

/**
 * Built conditions or typed ones (D50): `filterMode` says which one the
 * search uses. The other is kept, so switching back and forth loses nothing;
 * publish and the runtime read only the one in use. `soql`, when given,
 * replaces the typed text.
 */
export function setFilterMode(spec, actionId, mode, soql) {
    return update(spec, actionId, (a) => {
        a.match = a.match || emptyMatch();
        if (mode === 'soql') {
            a.match.filterMode = 'soql';
        } else {
            delete a.match.filterMode;
        }
        if (typeof soql === 'string') {
            a.match.soql = soql;
        }
    });
}

/** Question ids a typed clause names, as {!el_x} outside quoted text. */
export function soqlTokenIds(text) {
    const out = [];
    let inQuote = false;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQuote) {
            if (c === '\\') {
                i++;
            } else if (c === "'") {
                inQuote = false;
            }
            continue;
        }
        if (c === "'") {
            inQuote = true;
            continue;
        }
        if (c === '{' && s[i + 1] === '!') {
            const close = s.indexOf('}', i);
            const id = close < 0 ? '' : s.slice(i + 2, close);
            if (/^[A-Za-z0-9_]+$/.test(id)) {
                out.push(id);
                i = close;
            }
        }
    }
    return out;
}

export function setOnMatch(spec, actionId, onMatch) {
    return update(spec, actionId, (a) => {
        a.match = { ...(a.match || emptyMatch()), onMatch };
        if (onMatch !== 'update') {
            dropOverwriteFlags(a);
        }
    });
}

/** Tick or untick "Also update when found" for one field (update mode only). */
export function setWriteOnMatch(spec, actionId, field, on) {
    return update(spec, actionId, (a) => {
        if (!a.match || a.match.onMatch !== 'update') {
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

        // Answers that narrow the search: in built rows or typed conditions.
        const m = foldMatch(a.match) || {};
        const filterKeys = new Set();
        if (m.filterMode === 'soql') {
            soqlTokenIds(m.soql).forEach((k) => filterKeys.add(k));
        } else {
            ((m.filter && m.filter.rows) || []).forEach((row) => {
                [row && row.value, ...((row && row.values) || [])].forEach(
                    (v) => {
                        if (typeof v === 'string' && v.startsWith('$field.')) {
                            filterKeys.add(v.slice(7));
                        }
                    }
                );
            });
        }
        filterKeys.forEach((key) =>
            add(key, { ...base, field: null, use: 'filter' })
        );
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

/**
 * `skippable` (optional): ids of questions someone may skip. A search that
 * uses one can't be published (D59), so the step isn't finished either.
 */
export function actionState(actions, index, skippable) {
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
        const m = foldMatch(a.match) || {};
        const typed = m.filterMode === 'soql';
        const filterDone = typed
            ? typeof m.soql === 'string' && m.soql.trim() !== ''
            : Boolean(m.filter && (m.filter.rows || []).length) &&
              m.filter.rows.every(filterRowComplete);
        const answers = searchAnswerIds(m);
        if (!m.onMatch || !filterDone || !answers.length) {
            return 'incomplete';
        }
        if (skippable && answers.some((id) => skippable.has(id))) {
            return 'incomplete';
        }
    }
    return 'ok';
}
