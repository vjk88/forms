/**
 * finalTextFade: where the header text fade sits (IMPL_PLAN_HEADER_FADE v6).
 *
 * The wash is solid behind the words and fades to clear over RAMP px past
 * them, so the photo beside the text stays clear (owner 2026-10-31: "like
 * the mock"). Shared by the form header and the Split brand pane.
 *
 * The span is measured from the glyphs themselves (a DOM Range per text
 * block), never from the block's box, so a block stretched to full width
 * with a short title counts only its words. Until the first measurement, and
 * in a browser that can't measure, the wash covers the whole surface: the
 * text is never unprotected. The watcher writes two custom properties on the
 * wash layer (--fade-from, --fade-to) only when they change, so it can't
 * loop with a render.
 */

export const RAMP = 160;
// a hair past the glyph edges, so antialiasing never sits on the ramp
const PAD = 4;

/** Every non-blank text node under `root`, into open shadow roots too (the
 *  rich-text component keeps its words in its own shadow on some hosts). */
function textNodes(root, out = []) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === 3) {
            if (n.nodeValue && n.nodeValue.trim()) {
                out.push(n);
            }
        } else if (n.shadowRoot) {
            textNodes(n.shadowRoot, out);
        }
    }
    return out;
}

/** The visible boxes of one block: its glyph rects for text, its own box
 *  otherwise. Hidden or empty blocks give none. A Range over the whole block
 *  would also return each paragraph's box, which spans the block's width
 *  when it stretches (logoBeside), so each text node is measured alone. */
function boxesOf(block) {
    const el = block && block.el;
    if (!el || !el.isConnected) {
        return [];
    }
    const range = block.text && document.createRange();
    if (range && typeof range.getClientRects === 'function') {
        const rects = [];
        for (const node of textNodes(el)) {
            range.selectNodeContents(node);
            for (const r of range.getClientRects()) {
                if (r.width > 0 && r.height > 0) {
                    rects.push(r);
                }
            }
        }
        if (rects.length) {
            return rects;
        }
    }
    // no glyph rects (a box block, or a browser without Range rects): the
    // block's own box, which is never narrower than its words
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? [r] : [];
}

/**
 * The solid span, in the surface's own CSS px from its left edge:
 * `{ from, to }`, or null when nothing is measurable (the caller keeps the
 * full wash). `scale` is how much a transform shrinks the surface on screen
 * (the Studio preview draws a desktop form smaller): screen px divide by it.
 * A span that starts or ends within RAMP of an edge is held to that edge, so
 * the wash never fades out just short of it.
 */
export function solidSpan(surfaceRect, blocks, scale = 1) {
    const boxes = blocks.flatMap(boxesOf);
    if (!surfaceRect || !surfaceRect.width || !boxes.length || !(scale > 0)) {
        return null;
    }
    const left =
        (Math.min(...boxes.map((b) => b.left)) - surfaceRect.left) / scale;
    const right =
        (Math.max(...boxes.map((b) => b.right)) - surfaceRect.left) / scale;
    const width = surfaceRect.width / scale;
    let from = Math.max(Math.floor(left - PAD), 0);
    let to = Math.min(Math.ceil(right + PAD), width);
    if (from <= RAMP) {
        from = 0;
    }
    if (width - to <= RAMP) {
        to = width;
    }
    return { from, to };
}

/**
 * Keep a wash layer fitted to its text. `surface()` returns the element the
 * wash covers, `layer()` the wash, `blocks()` the `[{ el, text }]` to protect.
 * Returns `{ measure, disconnect }`: call measure after every render (cheap,
 * writes only on change) and disconnect when the host goes away.
 */
export function watchTextFade({ surface, layer, blocks }) {
    let observer = null;
    let watched = [];
    let last = '';
    let alive = true;

    const write = () => {
        const wash = layer();
        const box = surface();
        if (!alive || !wash || !box) {
            return;
        }
        let span = null;
        try {
            const rect = box.getBoundingClientRect();
            // a transformed ancestor draws the surface at another size than
            // its own CSS px, which is what the wash's stops are in
            const scale =
                box.offsetWidth > 0 ? rect.width / box.offsetWidth : 1;
            span = solidSpan(rect, blocks(), scale);
        } catch {
            // can't measure: the full wash (no edges) keeps the text safe
            span = null;
        }
        const value = span ? `${span.from}px|${span.to}px` : '';
        if (value === last && wash.dataset.fadeFitted === (span ? '1' : '')) {
            return;
        }
        last = value;
        if (span) {
            // the one source of the ramp's length (the CSS falls back to 0,
            // which with no edges is the full wash)
            wash.style.setProperty('--fade-ramp', `${RAMP}px`);
            wash.style.setProperty('--fade-from', `${span.from}px`);
            wash.style.setProperty('--fade-to', `${span.to}px`);
            wash.dataset.fadeFitted = '1';
        } else {
            wash.style.removeProperty('--fade-ramp');
            wash.style.removeProperty('--fade-from');
            wash.style.removeProperty('--fade-to');
            wash.dataset.fadeFitted = '';
        }
    };

    // A logo that loads late moves the text beside it (inline) without
    // resizing anything watched: re-measure on any image load inside the
    // surface (load doesn't bubble, so listen in the capture phase).
    let loadTarget = null;
    const onLoad = () => write();
    const listenLoads = (el) => {
        if (el === loadTarget) {
            return;
        }
        if (loadTarget) {
            loadTarget.removeEventListener('load', onLoad, true);
        }
        loadTarget = el || null;
        if (loadTarget) {
            loadTarget.addEventListener('load', onLoad, true);
        }
    };

    const rewatch = () => {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        listenLoads(surface());
        const targets = [surface(), ...blocks().map((b) => b.el)].filter(
            Boolean
        );
        const same =
            targets.length === watched.length &&
            targets.every((t, i) => t === watched[i]);
        if (same) {
            return;
        }
        if (observer) {
            observer.disconnect();
        }
        observer = new ResizeObserver(() => write());
        targets.forEach((t) => observer.observe(t));
        watched = targets;
    };

    // A web font changes the text's width once it lands, now or later (a
    // font picked in the Studio): re-measure on every finished load. Only
    // where resizes can be followed; otherwise the full wash stays.
    const fonts =
        typeof ResizeObserver !== 'undefined' &&
        typeof document !== 'undefined' &&
        document.fonts
            ? document.fonts
            : null;
    const onFonts = () => write();
    if (fonts && fonts.addEventListener) {
        fonts.addEventListener('loadingdone', onFonts);
    }
    if (fonts && fonts.ready) {
        fonts.ready.then(onFonts).catch(() => {});
    }

    return {
        measure() {
            if (typeof ResizeObserver === 'undefined') {
                // can't follow resizes: keep the full wash
                return;
            }
            rewatch();
            write();
        },
        disconnect() {
            alive = false;
            if (observer) {
                observer.disconnect();
            }
            observer = null;
            watched = [];
            listenLoads(null);
            if (fonts && fonts.removeEventListener) {
                fonts.removeEventListener('loadingdone', onFonts);
            }
        }
    };
}
