/**
 * Pure lookup-filter logic, shared by the Studio editor and the form runtime.
 *
 * No network, no DOM, no Apex imports, no component state. Everything here is
 * a function of its arguments, which is what lets the same rules be trusted in
 * the authoring preview and in the live form without drifting apart.
 *
 * The server re-derives all of this at submit. Nothing here is a security
 * boundary — it is the reason the form behaves sensibly before the server
 * gets involved. See FinalLookupPolicy.cls for the boundary.
 */

export const LOOKUP_CONFIG_VERSION = 1;

/** Why a lookup is unusable right now. */
export const BLOCKED = {
    SOURCE_REQUIRED: 'SOURCE_REQUIRED',
    CONFIG_UNAVAILABLE: 'CONFIG_UNAVAILABLE'
};

/**
 * Is this a real answer?
 *
 * ONLY null, undefined and the empty string are absences. `false` and `0` are
 * answers a respondent deliberately gave, and a truthiness test would throw
 * both away — disabling a lookup the respondent has in fact filled in.
 */
export function isAnswered(value) {
    return value !== null && value !== undefined && value !== '';
}

/** Value equality that treats 3 and '3' as the same answer, and null as ''. */
export function sameAnswer(a, b) {
    if (a === b) {
        return true;
    }
    if (!isAnswered(a) && !isAnswered(b)) {
        return true;
    }
    if (!isAnswered(a) || !isAnswered(b)) {
        return false;
    }
    if (typeof a === 'boolean' || typeof b === 'boolean') {
        return Boolean(a) === Boolean(b);
    }
    return String(a) === String(b);
}

/** The lookup config on an element, or null when there is none or it is of a
 *  version this build does not understand. Never guess at an unknown version. */
export function readLookupConfig(element) {
    const cfg = element && element.lookupConfig;
    if (!cfg || typeof cfg !== 'object') {
        return null;
    }
    if (cfg.version !== LOOKUP_CONFIG_VERSION) {
        return null;
    }
    return cfg;
}

function criteriaOf(cfg) {
    const list = cfg && cfg.filter && cfg.filter.criteria;
    return Array.isArray(list) ? list : [];
}

/** Element ids whose answers this lookup reads. */
export function sourcesOf(cfg) {
    const out = [];
    for (const c of criteriaOf(cfg)) {
        const v = c && c.value;
        if (v && v.kind === 'answer' && v.elementId) {
            out.push(v.elementId);
        }
    }
    return out;
}

/**
 * Walk a form model and collect every filtered lookup.
 * Returns Map(elementId -> { config, sources: string[] }).
 */
export function indexLookups(model) {
    const index = new Map();
    const pages = (model && model.pages) || [];
    for (const page of pages) {
        for (const section of page.sections || []) {
            for (const el of section.elements || []) {
                const cfg = readLookupConfig(el);
                if (cfg) {
                    index.set(el.id, { config: cfg, sources: sourcesOf(cfg) });
                }
            }
        }
    }
    return index;
}

/**
 * Dependency graph: which lookups must be revisited when an answer changes.
 * `dependents` maps a SOURCE element id to the lookup ids that read it.
 */
export function buildGraph(index) {
    const dependents = new Map();
    for (const [lookupId, entry] of index) {
        for (const sourceId of entry.sources) {
            if (!dependents.has(sourceId)) {
                dependents.set(sourceId, new Set());
            }
            dependents.get(sourceId).add(lookupId);
        }
    }
    return { dependents };
}

/**
 * Every lookup affected by a change to `changedElementId`, in an order where a
 * parent always precedes its children.
 *
 * Breadth-first with a visited set, so a diamond (two lookups both feeding a
 * third) yields that third lookup ONCE. Clearing it twice would fire two
 * rounds of downstream work for one user action. A cycle cannot loop forever
 * here either, though publish refuses cycles long before this runs.
 */
export function affectedLookups(graph, changedElementId) {
    const ordered = [];
    const seen = new Set();
    let frontier = [changedElementId];
    while (frontier.length) {
        const next = [];
        for (const id of frontier) {
            const kids = graph.dependents.get(id);
            if (!kids) {
                continue;
            }
            for (const kid of kids) {
                if (seen.has(kid)) {
                    continue;
                }
                seen.add(kid);
                ordered.push(kid);
                next.push(kid);
            }
        }
        frontier = next;
    }
    return ordered;
}

/**
 * Turn an authored config plus the current answers into what the native
 * control wants, or a reason it cannot be used.
 *
 * Returns { filter, blocked, reason }:
 *  - `blocked: true` means disable the control. It NEVER means "search
 *    everything": an unresolvable criterion widens a deliberately narrow
 *    filter to the whole object, which is the opposite of the author's intent.
 *  - `filter: null` with `blocked: false` means there is genuinely no filter,
 *    which is the unconfigured case and the existing behaviour.
 */
export function compileFilter(cfg, answers) {
    if (!cfg) {
        return { filter: null, blocked: false, reason: null };
    }
    const criteria = criteriaOf(cfg);
    if (!criteria.length) {
        return { filter: null, blocked: false, reason: null };
    }
    const state = answers || {};
    const out = [];

    for (const c of criteria) {
        if (!c || !c.fieldPath || !c.operator || !c.value) {
            return {
                filter: null,
                blocked: true,
                reason: BLOCKED.CONFIG_UNAVAILABLE
            };
        }
        let value;
        if (c.value.kind === 'answer') {
            const raw = state[c.value.elementId];
            if (!isAnswered(raw)) {
                return {
                    filter: null,
                    blocked: true,
                    reason: BLOCKED.SOURCE_REQUIRED
                };
            }
            value = raw;
        } else if (c.value.kind === 'constant') {
            if (!('value' in c.value)) {
                return {
                    filter: null,
                    blocked: true,
                    reason: BLOCKED.CONFIG_UNAVAILABLE
                };
            }
            value = c.value.value;
        } else {
            return {
                filter: null,
                blocked: true,
                reason: BLOCKED.CONFIG_UNAVAILABLE
            };
        }
        out.push({
            fieldPath: c.fieldPath,
            operator: c.operator,
            value
        });
    }

    const filter = { criteria: out };
    if (cfg.filter.mode === 'any' && out.length > 1) {
        // Native default is AND; OR has to be spelled out positionally.
        filter.filterLogic = out.map((_, i) => i + 1).join(' OR ');
    }
    return { filter, blocked: false, reason: null };
}

/**
 * A fingerprint of everything that would change what the control may search.
 *
 * The runtime remounts the native child when this changes, because native
 * events carry no request identity: a selection made against the old filter
 * can land after the filter has moved on, and only a generation stamp can tell
 * the two apart.
 */
export function filterFingerprint(cfg, answers, extra) {
    const { filter, blocked, reason } = compileFilter(cfg, answers);
    return JSON.stringify({
        e: extra || null,
        b: blocked,
        r: reason,
        f: filter
    });
}

/** The native display/matching blocks, passed through untouched when present. */
export function displayInfoOf(cfg) {
    return cfg && cfg.displayInfo ? cfg.displayInfo : undefined;
}

export function matchingInfoOf(cfg) {
    return cfg && cfg.matchingInfo ? cfg.matchingInfo : undefined;
}
