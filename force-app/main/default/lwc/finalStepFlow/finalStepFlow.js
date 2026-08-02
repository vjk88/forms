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
 * - buttons / links: NEVER auto-advance — Enter is their native activation
 *   (Back link, choice chips, rating dots); hijacking it made Enter-on-Back
 *   advance FORWARD and Enter-on-chip advance without selecting
 * - custom-element hosts: only the lightning input trio is decidable
 *   (single-line vs multiline); ANY other host is opaque — fail safe, never
 *   hijack on a guess. LWS retargets cross-boundary origins to the child
 *   HOST (org QA 2026-08-01: a chip Enter reached the nav as
 *   <c-final-element-renderer> and advanced without selecting), which is
 *   why the element renderer resolves its own keys and re-emits
 *   `advancekey` instead.
 * `target` must be the composed-path origin, not the retargeted event
 * target.
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
    if (tag === 'button' || tag === 'a' || tag === 'select') {
        return false;
    }
    if (
        type === 'radio' ||
        type === 'checkbox' ||
        type === 'button' ||
        type === 'submit'
    ) {
        return false;
    }
    if (isMultilineTarget(target)) {
        return event.ctrlKey || event.metaKey;
    }
    if (tag.includes('-') && tag !== 'lightning-input') {
        return false;
    }
    return !event.ctrlKey && !event.metaKey;
}

/** Tags the advance decision can be made from directly. Everything else on
 *  a composed path is wrapper noise — lightning internals nest the real
 *  control inside primitive hosts (org probe 2026-08-01: an input Enter
 *  reaches the renderer as lightning-primitive-input-simple, with the
 *  decidable lightning-input one hop up the path). */
const DECIDABLE_TAGS = new Set([
    'input',
    'textarea',
    'select',
    'button',
    'a',
    'lightning-input',
    'lightning-textarea',
    'lightning-input-rich-text',
    'lightning-combobox'
]);

/**
 * Walk the composed path to the first element the advance rules understand;
 * fall back to the raw target when nothing on the path is decidable (the
 * fail-safe in shouldAdvanceOnKey then refuses unknown hosts).
 */
export function resolveAdvanceOrigin(path, fallback) {
    for (const n of path || []) {
        if (!n || !n.tagName) {
            continue; // shadow roots / document have no tagName
        }
        if (
            DECIDABLE_TAGS.has(n.tagName.toLowerCase()) ||
            n.isContentEditable
        ) {
            return n;
        }
    }
    return fallback;
}

/**
 * True when the composed path crosses c-final-element-renderer. The renderer
 * resolves keyboard-advance inside its own shadow scope (where origins are
 * still real elements) and re-emits `advancekey` / `advancefocus`; raw
 * keydown/focusin from its subtree must be ignored by the navs — LWS
 * retargets them to the host (undecidable), and a transparent boundary
 * (native shadow, jsdom) would double-fire.
 */
export function fromElementRenderer(path) {
    return (path || []).some(
        (n) =>
            n.tagName && n.tagName.toLowerCase() === 'c-final-element-renderer'
    );
}

/** True when the focused element wants the Ctrl/Cmd+Enter helper wording.
 *  Includes the lightning multiline hosts — LWS hands us the host, not the
 *  native control inside it. */
export function isMultilineTarget(target) {
    if (!target || !target.tagName) {
        return false;
    }
    const tag = target.tagName.toLowerCase();
    return (
        tag === 'textarea' ||
        tag === 'lightning-textarea' ||
        tag === 'lightning-input-rich-text' ||
        Boolean(target.isContentEditable)
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
