/**
 * finalReadableText — readable text and marks on every surface a form paints
 * (IMPL_PLAN_TEXT_CONTRAST v7). Pure: no DOM, no Apex. The brand-theme
 * generator, the theme engine and (in PR B) the viewer share this one copy.
 *
 * Moving a colour: `adjust` mixes it toward a target (the look's main text,
 * or black/white for a brand recipe) in 2% steps until a test passes. The
 * share is built by adding 0.02, exactly as the brand generator always has,
 * so brand recipes stay byte-identical; `adjustSteps` also reports the WHOLE
 * number of steps taken, which is what callers compare (a decimal that adds
 * up to 0.5000000000000002 must never decide a 50% cap).
 *
 * Judging a colour: a surface is a RANGE [darker end, lighter end] from
 * c/finalFocusTreatment. A colour reaches a ratio on a range when it sits
 * outside it and reaches the ratio against both ends.
 */
import { contrast, over, passes } from 'c/finalFocusTreatment';

/** WCAG 2.2 AA floors. */
export const TEXT = 4.5;
export const MARK = 3;
/** What we aim for: a little above the floors, so browser rounding in
 *  color-mix / compositing can never tip a pair under. */
export const TEXT_AIM = 4.6;
export const MARK_AIM = 3.1;
/** Section looks paint this share of the text colour over their container
 *  (subtle 3%, card 4%, boxed 7%; plain and outline paint none). */
export const SECTION_TINTS = [0, 0.03, 0.04, 0.07];
/** Light accent tints behind text (emoji chip 12%, thank-you check 14%). */
export const ACCENT_TINTS = [0.12, 0.14];

// ---------------------------------------------------------------- colour

export function parseHex(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) {
        return null;
    }
    const h =
        m[1].length === 3
            ? m[1]
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function toHex(rgb) {
    return `#${rgb
        .map((v) =>
            Math.round(Math.min(255, Math.max(0, v)))
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`;
}

/** `share` of colour a over colour b (both hex). */
export function mix(a, b, share) {
    const x = parseHex(a);
    const y = parseHex(b);
    return toHex(x.map((v, i) => v * share + y[i] * (1 - share)));
}

/** A painted value (hex, rgb(a), transparent) as a solid hex over `under`. */
export function composite(value, under) {
    const v = String(value || '').trim();
    if (!v || v === 'transparent') {
        return under;
    }
    if (parseHex(v)) {
        return toHex(parseHex(v));
    }
    const m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (!m || !under) {
        return null;
    }
    const parts = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
    const alpha = parts.length > 3 ? parts[3] : 1;
    return mix(toHex(parts.slice(0, 3)), under, alpha);
}

export const ratio = (a, b) => contrast(a, b) || 0;

/** The lowest ratio of `color` against a list of solid hex surfaces. */
export const worst = (color, surfaces) =>
    Math.min(...surfaces.map((s) => ratio(color, s)));

/**
 * Move `color` toward `target` until `ok(c)` holds; ends at the target at
 * worst. Returns { color, steps, ok }: `steps` is the whole number of 2%
 * steps taken (0 = unchanged, 50 = the target itself).
 */
export function adjustSteps(color, target, ok) {
    let steps = 0;
    for (let t = 0; t <= 1.0001; t += 0.02, steps += 1) {
        const c = mix(target, color, t);
        if (ok(c)) {
            return { color: c, steps, ok: true };
        }
    }
    return { color: target, steps: 50, ok: Boolean(ok(target)) };
}

/** `adjustSteps`, colour only (the brand generator's original contract). */
export function adjust(color, target, ok) {
    return adjustSteps(color, target, ok).color;
}

/** The ink for a fill: #111827 / #ffffff, else pure #000000 / #ffffff.
 *  Pure black or white reaches at least 4.58 : 1 on any colour. */
export function inkFor(fill) {
    const soft =
        ratio('#111827', fill) >= ratio('#ffffff', fill)
            ? '#111827'
            : '#ffffff';
    if (ratio(soft, fill) >= TEXT) {
        return soft;
    }
    return ratio('#000000', fill) >= ratio('#ffffff', fill)
        ? '#000000'
        : '#ffffff';
}

/**
 * Every surface a brand recipe can paint, as [label, hex]. Containers: the
 * page, the card, and each section look over the card AND over the page (One
 * at a time's open page and full-bleed layouts draw sections straight on the
 * page). Fields: the field over every container.
 */
export function brandSurfaces({ pageBg, contentBg, text, fieldBg }) {
    const page = composite(pageBg, '#ffffff');
    const card = composite(contentBg, page);
    const ink = composite(text, card);
    const containers = [
        ['page', page],
        ['card', card],
        ...SECTION_TINTS.flatMap((t) => [
            [`section ${Math.round(t * 100)}% on card`, mix(ink, card, t)],
            [`section ${Math.round(t * 100)}% on page`, mix(ink, page, t)]
        ])
    ];
    const fields = containers.map(([label, bg]) => [
        `field on ${label}`,
        composite(fieldBg, bg)
    ]);
    return { page, card, containers, fields, all: [...containers, ...fields] };
}

// ------------------------------------------------------------ text scopes

const rgbaOf = (hex, alpha) => {
    const c = parseHex(hex);
    return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : null;
};

/**
 * The surfaces text can sit on inside one container (the card, or the open
 * page), as ranges. Built from what the form actually paints:
 *   - the container, and every section look's text tint over it, and the
 *     theme's own section colour (`sectionFill`, already at its opacity);
 *   - each painted field fill (`fieldFills`: the input shell and the field
 *     fill choice chips use) over every one of those;
 *   - for body and muted text only, the light accent tints over the
 *     container (the emoji chip, the thank-you check).
 * Marks sit on the same surfaces as words (the ✓ on an image tile, the drag
 * grip and the remove × all sit on field fills).
 * @returns {{ text: Array, words: Array, marks: Array }}
 */
export function textScope({
    container,
    text,
    accent,
    sectionFill,
    fieldFills
}) {
    const sections = [
        container,
        ...(parseHex(text)
            ? SECTION_TINTS.filter((t) => t > 0).map((t) =>
                  over(rgbaOf(text, t), container)
              )
            : []),
        ...(sectionFill ? [over(sectionFill, container)] : [])
    ];
    const fills = [...new Set((fieldFills || []).filter(Boolean))].filter(
        (f) => f !== 'transparent'
    );
    const fields = sections.flatMap((r) => fills.map((f) => over(f, r)));
    const accentTints = parseHex(accent)
        ? ACCENT_TINTS.map((t) => over(rgbaOf(accent, t), container))
        : [];
    const words = [...sections, ...fields];
    return { text: [...words, ...accentTints], words, marks: words };
}

/** Does `color` reach `min` against every range in `ranges`? */
export function readsOn(color, ranges, min) {
    return ranges.every((r) => passes(color, r, min));
}

/** The lowest ratio of `color` against both ends of every range. */
export function worstOn(color, ranges) {
    return Math.min(
        ...ranges.flatMap((r) => [ratio(color, r[0]), ratio(color, r[1])])
    );
}

/**
 * Make one colour readable in a scope: `color` moved toward `toward` until it
 * reaches `min` on every range. `{ color, steps, ok }`; ok=false means even
 * `toward` itself can't pass, and the caller must not claim a pass.
 */
export function readable(color, toward, ranges, min) {
    if (!parseHex(color) || !parseHex(toward)) {
        return { color, steps: 0, ok: readsOn(color, ranges, min) };
    }
    return adjustSteps(color, toward, (c) => readsOn(c, ranges, min));
}
