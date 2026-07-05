/**
 * finalStepFlow — THE shared one-at-a-time step-flow engine (catalog §2).
 *
 * `navOneAtATime` and `navSplitHero`'s Pane Flow = One at a Time both run on
 * this module — one engine, presentation per primitive, never a second
 * implementation (owner 2026-07-04). Pure functions, no DOM.
 *
 * v1 grain: one SECTION per screen.
 */

/** Flatten pages → ordered screens. */
export function buildScreens(pages) {
    const screens = [];
    (pages || []).forEach((page, pageIndex) => {
        (page.sections || []).forEach((section, sectionIndex) => {
            screens.push({
                key: section.id || `scr_${pageIndex}_${sectionIndex}`,
                pageIndex,
                sectionIndex,
                section,
                zones: page.zones,
                pageName: page.name
            });
        });
    });
    return screens;
}

export function clampIndex(index, screens) {
    const max = screens.length - 1;
    return Math.max(0, Math.min(max, index));
}

export function isLastScreen(index, screens) {
    return screens.length > 0 && index >= screens.length - 1;
}

export function progressFraction(index, screens) {
    return screens.length ? (index + 1) / screens.length : 0;
}

/**
 * Keyboard-advance decision for a keydown (catalog §2, UIUX review #13):
 * - single-line inputs: Enter advances
 * - textarea / rich text: Ctrl/Cmd+Enter advances (Enter = newline)
 * - choice inputs (select / radio / checkbox): NEVER auto-advance
 * `target` must be the composed-path origin, not the retargeted host.
 */
export function shouldAdvanceOnKey(event, target) {
    if (event.key !== 'Enter') {
        return false;
    }
    if (!target || !target.tagName) {
        return false;
    }
    const tag = target.tagName.toLowerCase();
    const type = (target.type || '').toLowerCase();
    if (tag === 'select' || type === 'radio' || type === 'checkbox') {
        return false;
    }
    if (tag === 'textarea' || target.isContentEditable) {
        return event.ctrlKey || event.metaKey;
    }
    return !event.ctrlKey && !event.metaKey;
}

/** True when the focused element wants the Ctrl/Cmd+Enter helper wording. */
export function isMultilineTarget(target) {
    if (!target || !target.tagName) {
        return false;
    }
    return (
        target.tagName.toLowerCase() === 'textarea' || Boolean(target.isContentEditable)
    );
}

/**
 * Touch devices hide the keyboard helper entirely — no modifier keys exist
 * (advance stays button-only). Media-query check, evaluated per render.
 */
export function isTouchOnly() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(hover: none) and (pointer: coarse)').matches
    );
}
