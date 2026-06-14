/**
 * c/layoutNavState — pure page-navigation state machine for the layout
 * engine (PHASE1_WORKPLAN §2.5). No DOM. Shells consume the view produced
 * by toView(); the engine owns the state and applies transitions.
 *
 * Gating per nav model (boards): stepper validates forward; sidenav/tabs/
 * accordion are free navigation (soft validation); scroll has no paging;
 * oneAtATime steps elements, not pages (the shell sub-steps within a page).
 * The validateFn hook is invoked only where the model gates.
 */

const GATED_FORWARD = ['stepper', 'oneAtATime'];

export function createNavState(spec, visiblePageKeys) {
    const keys = visiblePageKeys && visiblePageKeys.length
        ? visiblePageKeys
        : spec.pages.map((p) => p.pageKey);
    return {
        nav: spec.shell.nav,
        pageKeys: keys,
        currentIndex: 0,
        // pageKey → 'untouched' | 'visited' | 'complete' | 'error'
        states: Object.fromEntries(keys.map((k) => [k, 'untouched']))
    };
}

export function next(state, validateFn) {
    if (state.currentIndex >= state.pageKeys.length - 1) return state;
    if (GATED_FORWARD.includes(state.nav) && typeof validateFn === 'function') {
        const key = state.pageKeys[state.currentIndex];
        if (!validateFn(key)) {
            return { ...state, states: { ...state.states, [key]: 'error' } };
        }
    }
    return move(state, state.currentIndex + 1, 'complete');
}

export function back(state) {
    if (state.currentIndex === 0) return state;
    return move(state, state.currentIndex - 1, 'visited');
}

export function goTo(state, pageKey, validateFn) {
    const target = state.pageKeys.indexOf(pageKey);
    if (target === -1 || target === state.currentIndex) return state;
    // Stepper allows jumping BACK to completed steps only (board rule);
    // free-nav models jump anywhere.
    if (state.nav === 'stepper' && target > state.currentIndex) {
        return next(state, validateFn); // forward only one gated step at a time
    }
    return move(state, target, 'visited');
}

function move(state, toIndex, leavingState) {
    const leavingKey = state.pageKeys[state.currentIndex];
    const states = { ...state.states };
    if (states[leavingKey] !== 'error') states[leavingKey] = leavingState;
    return { ...state, currentIndex: toIndex, states };
}

export function markState(state, pageKey, value) {
    return { ...state, states: { ...state.states, [pageKey]: value } };
}

/** Plain serializable view for shells. */
export function toView(state) {
    const total = state.pageKeys.length;
    return {
        nav: state.nav,
        currentPageKey: state.pageKeys[state.currentIndex],
        currentIndex: state.currentIndex,
        total,
        isFirst: state.currentIndex === 0,
        isLast: state.currentIndex === total - 1,
        progressPct: total > 1 ? Math.round(((state.currentIndex + 1) / total) * 100) : 100,
        states: { ...state.states }
    };
}
