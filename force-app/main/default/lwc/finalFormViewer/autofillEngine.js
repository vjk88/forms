/**
 * autofillEngine.js — Pure Autofill state machine and patch calculator.
 *
 * Owned by finalFormViewer (IMPL_PLAN_AUTOFILL_RULES §6).
 * Contains ZERO Salesforce SOQL/Apex imports, DOM manipulation, or UI logic.
 * Computes deterministic answer patches given session state, user edits,
 * and asynchronous source query results.
 */

export const POLICY_PRESERVE_EDITS = 'preserveEdits';
export const POLICY_ALWAYS_REPLACE = 'alwaysReplace';

/**
 * Computes a stable fingerprint string for an array of rules to detect
 * spec/rule changes that must invalidate pending requests.
 */
export function computeRulesFingerprint(rules = []) {
    const normalized = (rules || [])
        .filter((r) => r && r.enabled)
        .map((r) => ({
            id: r.id,
            enabled: Boolean(r.enabled),
            policy: r.policy || POLICY_PRESERVE_EDITS,
            source: r.source || {},
            mappings: (r.mappings || []).map((m) => ({
                from: m.from,
                to: m.to,
                guestAllowed: Boolean(m.guestAllowed)
            }))
        }))
        .sort((a, b) => (a.id > b.id ? 1 : -1));
    return JSON.stringify(normalized);
}

/**
 * Extracts valid enabled autofill rules from the spec's settings.prefill.autofillRules.
 */
export function extractAutofillRules(spec) {
    if (!spec) {
        return [];
    }
    const rules = spec.settings?.prefill?.autofillRules;
    if (Array.isArray(rules)) {
        return rules.filter((r) => r && r.enabled);
    }
    if (Array.isArray(spec.runtime?.autofill)) {
        return spec.runtime.autofill.map((r) => ({
            id: r.ruleId,
            enabled: true,
            policy: r.policy,
            source: { type: r.sourceType },
            mappings: (r.destinationElementIds || []).map((to) => ({ to }))
        }));
    }
    return [];
}

/**
 * Creates a fresh autofill runtime session.
 */
export function createAutofillSession({
    sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    specVersionId = null,
    rules = [],
    restoredSession = null,
    initialDefaults = {}
} = {}) {
    const enabledRules = (rules || []).filter((r) => r && r.enabled);
    const fingerprint = computeRulesFingerprint(enabledRules);

    const session = {
        sessionId,
        specVersionId,
        rulesFingerprint: fingerprint,
        rules: enabledRules,
        // editRevision[elementId] tracks every manual edit
        editRevision: { ...(restoredSession?.editRevision || {}) },
        // touched[elementId] is true if respondent manually interacted with the input
        touched: { ...(restoredSession?.touched || {}) },
        // owner[elementId] = { ruleId, sourceKey, lastAppliedValue }
        owner: { ...(restoredSession?.owner || {}) },
        // requests[ruleId] = { generation, sourceKey, startedRevisions, status }
        requests: {},
        // staticDefaults[elementId] tracks explicit initial defaults
        staticDefaults: {
            ...(initialDefaults || restoredSession?.staticDefaults || {})
        }
    };

    return session;
}

/**
 * Seeds static default values from the spec for elements that don't have answers yet.
 * Differentiates between explicit defaults (including 0, false, and non-empty strings)
 * and unconfigured/absent values.
 */
export function seedStaticDefaults(spec, currentAnswers = {}) {
    const defaults = {};
    if (!spec || !Array.isArray(spec.pages)) {
        return defaults;
    }

    for (const page of spec.pages) {
        for (const sec of page.sections || []) {
            if (sec.repeat) {
                continue;
            }
            for (const el of sec.elements || []) {
                if (!el || !el.id) {
                    continue;
                }
                const hasExisting =
                    Object.prototype.hasOwnProperty.call(
                        currentAnswers,
                        el.id
                    ) && currentAnswers[el.id] !== undefined;
                if (!hasExisting) {
                    const def = el.defaultValue ?? el.config?.defaultValue;
                    // Treat explicit false, zero, or non-empty string as an authored default
                    if (def !== undefined && def !== null) {
                        if (typeof def === 'string' && def.trim() === '') {
                            continue;
                        }
                        defaults[el.id] = def;
                    }
                }
            }
        }
    }
    return defaults;
}

/**
 * Called when respondent manually changes or clears an element answer.
 * Increments the element's edit revision, marks it touched, and strips any rule ownership.
 */
export function onManualEdit(session, elementId) {
    if (!session || !elementId) {
        return;
    }
    session.editRevision[elementId] =
        (session.editRevision[elementId] || 0) + 1;
    session.touched[elementId] = true;
    delete session.owner[elementId];
}

/**
 * Called when a source record changes (e.g. user selects a new lookup record,
 * clears a lookup, or a new token is resolved).
 *
 * Invalidates previous generation for the rule, clears untouched values owned
 * by the previous source for this rule, and records the new request identity.
 */
export function onSourceChanged(session, ruleId, sourceKey) {
    if (!session || !ruleId) {
        return { clearedPatch: {}, requestIdentity: null };
    }

    const rule = session.rules.find((r) => r.id === ruleId);
    if (!rule) {
        return { clearedPatch: {}, requestIdentity: null };
    }

    const prevReq = session.requests[ruleId];
    const newGeneration = (prevReq?.generation || 0) + 1;

    // Clear untouched values owned by this rule only if sourceKey changed or cleared
    const clearedPatch = {};
    const isSourceChange = !prevReq || prevReq.sourceKey !== sourceKey;
    if (isSourceChange) {
        for (const mapping of rule.mappings || []) {
            const destId = mapping.to;
            if (!destId) {
                continue;
            }
            const currentOwner = session.owner[destId];
            // R13 — clear only what this rule still owns AND the respondent has
            // not edited SINCE that value was applied. A manual edit strips
            // ownership outright (onManualEdit), so an owner surviving here with
            // an unchanged revision means the value is genuinely Autofill's.
            // The old `!session.touched[destId]` test used a permanent flag, so
            // an alwaysReplace value written over an earlier edit was stranded.
            const editedSinceApplied =
                (session.editRevision[destId] || 0) !==
                (currentOwner?.appliedAtRevision || 0);
            if (
                currentOwner &&
                currentOwner.ruleId === ruleId &&
                !editedSinceApplied
            ) {
                clearedPatch[destId] = null;
                delete session.owner[destId];
            }
        }
    }

    // If sourceKey is empty/null, the source was cleared; do not start a new fetch
    if (!sourceKey) {
        session.requests[ruleId] = {
            generation: newGeneration,
            sourceKey: null,
            startedRevisions: {},
            status: 'cleared'
        };
        return {
            clearedPatch,
            requestIdentity: null
        };
    }

    // Snapshot destination revisions at the moment request starts
    const startedRevisions = {};
    for (const mapping of rule.mappings || []) {
        const destId = mapping.to;
        if (destId) {
            startedRevisions[destId] = session.editRevision[destId] || 0;
        }
    }

    session.requests[ruleId] = {
        generation: newGeneration,
        sourceKey,
        startedRevisions,
        status: 'pending'
    };

    const requestIdentity = {
        sessionId: session.sessionId,
        specVersionId: session.specVersionId,
        rulesFingerprint: session.rulesFingerprint,
        ruleId,
        generation: newGeneration,
        sourceKey
    };

    return {
        clearedPatch,
        requestIdentity
    };
}

/**
 * Validates whether an incoming asynchronous result matches the active request identity.
 */
export function isRequestCurrent(session, identity) {
    if (!session || !identity) {
        return false;
    }
    if (session.sessionId !== identity.sessionId) {
        return false;
    }
    if (session.specVersionId !== identity.specVersionId) {
        return false;
    }
    if (session.rulesFingerprint !== identity.rulesFingerprint) {
        return false;
    }
    const currentReq = session.requests[identity.ruleId];
    if (!currentReq) {
        return false;
    }
    if (currentReq.generation !== identity.generation) {
        return false;
    }
    if (currentReq.sourceKey !== identity.sourceKey) {
        return false;
    }
    if (currentReq.status !== 'pending') {
        return false;
    }
    return true;
}

/**
 * Computes an answer patch from a successful source record read.
 *
 * @param {Object} session - Runtime autofill session
 * @param {Object} identity - Request identity passed with the fetch
 * @param {Object} fieldValues - Map of field API name -> value (omitted fields are absent)
 * @param {Object} currentAnswers - Current form answers keyed by elementId
 * @param {Boolean} isInitialLinkLoad - True if this is the first link prefill run
 * @returns {Object} { applied: boolean, patch: Object, newOwners: Object, reason: string }
 */
export function onResult(
    session,
    identity,
    fieldValues = {},
    currentAnswers = {},
    isInitialLinkLoad = false
) {
    if (!isRequestCurrent(session, identity)) {
        return {
            applied: false,
            patch: {},
            newOwners: {},
            reason: 'stale_or_invalid_request'
        };
    }

    const rule = session.rules.find((r) => r.id === identity.ruleId);
    if (!rule) {
        return {
            applied: false,
            patch: {},
            newOwners: {},
            reason: 'rule_not_found'
        };
    }

    const req = session.requests[identity.ruleId];
    const patch = {};
    const newOwners = {};
    const policy = rule.policy || POLICY_PRESERVE_EDITS;

    for (const mapping of rule.mappings || []) {
        const destId = mapping.to;
        if (!destId) {
            continue;
        }
        const sourceField = mapping.from || destId;

        // Rule: Field omitted because unreadable -> do not apply it, do not clear
        if (!Object.prototype.hasOwnProperty.call(fieldValues, sourceField)) {
            continue;
        }

        const rawValue = fieldValues[sourceField];

        // Check if respondent edited the destination AFTER this request started
        const currentRev = session.editRevision[destId] || 0;
        const startedRev = req.startedRevisions[destId] || 0;
        if (currentRev > startedRev) {
            // Edited while request was in-flight -> MUST preserve respondent edit under both policies
            continue;
        }

        // Check static default precedence on initial link load
        if (
            isInitialLinkLoad &&
            Object.prototype.hasOwnProperty.call(session.staticDefaults, destId)
        ) {
            // Static defaults win initial link Autofill, including alwaysReplace
            continue;
        }

        const currentOwner = session.owner[destId];
        const hasAnswer =
            Object.prototype.hasOwnProperty.call(currentAnswers, destId) &&
            currentAnswers[destId] !== undefined &&
            currentAnswers[destId] !== null;

        // Destination decision based on policy
        if (policy === POLICY_PRESERVE_EDITS) {
            // If already touched/edited by respondent earlier -> preserve it
            if (session.touched[destId]) {
                continue;
            }
            // If destination already has an answer that wasn't owned by this rule -> preserve it
            if (
                hasAnswer &&
                (!currentOwner || currentOwner.ruleId !== rule.id)
            ) {
                continue;
            }
        }

        // If field value is null -> clear untouched owned value
        if (rawValue === null) {
            if (currentOwner?.ruleId === rule.id || hasAnswer) {
                patch[destId] = null;
            }
            delete session.owner[destId];
        } else {
            // Apply mapped value
            patch[destId] = rawValue;
            newOwners[destId] = {
                ruleId: rule.id,
                sourceKey: identity.sourceKey,
                lastAppliedValue: rawValue,
                // R13 — stamp the edit revision AT THE MOMENT we take ownership.
                // `touched` is a permanent historical flag, so using it to decide
                // clearing meant an alwaysReplace value applied over an earlier
                // manual edit could never be cleared again. Comparing revisions
                // asks the question that actually matters: has the respondent
                // edited this since Autofill last owned it?
                appliedAtRevision: session.editRevision[destId] || 0
            };
            session.owner[destId] = newOwners[destId];
        }
    }

    req.status = 'complete';

    return {
        applied: true,
        patch,
        newOwners,
        reason: 'applied'
    };
}

/**
 * Marks a pending request as timed out or failed.
 */
export function onRequestFailure(session, identity, reason = 'failed') {
    if (!isRequestCurrent(session, identity)) {
        return false;
    }
    const req = session.requests[identity.ruleId];
    if (req) {
        req.status = reason;
        return true;
    }
    return false;
}

/**
 * Prunes session state across builder edits while preserving valid answers and ownership.
 */
export function reconcileAutofillSession(session, nextSpec) {
    if (!session || !nextSpec) {
        return session;
    }
    const nextRules = extractAutofillRules(nextSpec);
    const nextFingerprint = computeRulesFingerprint(nextRules);
    const prevFingerprint = session.rulesFingerprint;

    session.rules = nextRules;
    session.rulesFingerprint = nextFingerprint;

    // R10 — cancel bookkeeping for requests the edit just invalidated.
    // isRequestCurrent already REJECTS their late results, because the
    // fingerprint moved, so no wrong value can land. What lingered was the
    // request entry itself: it stayed `pending` forever, and the viewer keeps a
    // live timeout plus a disabled "Finishing Autofill…" Submit per pending
    // request. The fingerprint is whole-session, so any rule edit invalidates
    // every in-flight request — cancelling them all here matches the rule
    // isRequestCurrent already enforces.
    const nextRuleIds = new Set(nextRules.map((r) => r.id));
    const cancelledRuleIds = [];
    for (const ruleId of Object.keys(session.requests || {})) {
        const req = session.requests[ruleId];
        const survives =
            nextRuleIds.has(ruleId) && prevFingerprint === nextFingerprint;
        if (req && req.status === 'pending' && !survives) {
            req.status = 'cancelled';
            cancelledRuleIds.push(ruleId);
        }
        if (!nextRuleIds.has(ruleId)) {
            // Rule removed or disabled: drop its bookkeeping entirely (§9).
            delete session.requests[ruleId];
            for (const elId of Object.keys(session.owner)) {
                if (session.owner[elId]?.ruleId === ruleId) {
                    delete session.owner[elId];
                }
            }
        }
    }
    // Runtime-only hint so the viewer can drop timers/among its own pending
    // list. Never persisted into the spec or preview design JSON.
    session.lastCancelledRuleIds = cancelledRuleIds;

    // Collect valid element IDs in the new spec
    const validElementIds = new Set();
    for (const page of nextSpec.pages || []) {
        for (const sec of page.sections || []) {
            for (const el of sec.elements || []) {
                if (el && el.id) {
                    validElementIds.add(el.id);
                }
            }
        }
    }

    // Prune removed elements from ownership and revisions
    for (const elId of Object.keys(session.owner)) {
        if (!validElementIds.has(elId)) {
            delete session.owner[elId];
            delete session.editRevision[elId];
            delete session.touched[elId];
        }
    }

    return session;
}
