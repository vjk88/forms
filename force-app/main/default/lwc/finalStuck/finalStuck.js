/**
 * finalStuck — the sticky-paint tripwire (IMPL_PLAN_PROGRESS_WAYFINDING §2).
 *
 * A sticky wayfinding strip needs its surface ONLY while pinned (so scrolled
 * content can't show through it). Painting it permanently is the glass-theme
 * band bug: translucent content-bg stacked on the card reads as a foreign gray
 * band even before any scroll.
 *
 * Watch a zero-height sentinel rendered immediately ABOVE the sticky element.
 * Pinned == the element stopped following its sentinel: the sentinel keeps
 * scrolling up while sticky holds the element, so a vertical gap opens between
 * them. Comparing against the ELEMENT (not the viewport top) makes this work
 * inside nested scroll containers too — the studio preview stage scrolls in
 * its own box ~120px below the viewport top, where a viewport-zero check
 * never fires.
 */
const PIN_GAP_PX = 4;

export function observeStuck(sentinel, target, onChange) {
    if (!sentinel || !target || typeof IntersectionObserver === 'undefined') {
        return () => {};
    }
    const io = new IntersectionObserver(([entry]) => {
        onChange(
            !entry.isIntersecting &&
                entry.boundingClientRect.top <
                    target.getBoundingClientRect().top - PIN_GAP_PX
        );
    });
    io.observe(sentinel);
    return () => io.disconnect();
}
