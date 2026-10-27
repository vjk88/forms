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
import { contrast, over, passes, rangeFromToken } from 'c/finalFocusTreatment';

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

// ------------------------------------------------- one container's colours

/** Below this ratio between muted and main text, an untouched slider value
 *  would read as an answer, so it goes italic. */
export const IDLE_APART = 1.6;
/** The backing's opacity is raised while that keeps muted and accent words
 *  within this many 2% steps of their own colour (50%). */
export const CAP_STEPS = 25;

/**
 * The readable colours for one container (the card, the open page, a
 * backing, or a section with its own background), as tokens.
 *   roles   { muted, label }: which theme colours may be adjusted (an
 *           author's own muted or label colour never is)
 * `{ ok, tokens, italic, mutedSteps, wordsSteps }`; ok=false means main
 * text itself can't read here, and nothing is promised.
 */
export function scopeColours({
    container,
    text,
    textWeak,
    accent,
    sectionFill,
    fieldFills,
    roles
}) {
    const scope = textScope({
        container,
        text,
        accent,
        sectionFill,
        fieldFills
    });
    if (!readsOn(text, scope.text, TEXT_AIM)) {
        return { ok: false };
    }
    const muted = readable(textWeak, text, scope.text, TEXT_AIM);
    const words = readable(accent, text, scope.words, TEXT_AIM);
    const marks = readable(accent, text, scope.marks, MARK_AIM);
    // idle stars and hearts are outlines in this colour (PR 408 ruling)
    const idle = readable(textWeak, text, scope.marks, MARK_AIM);
    const tokens = {};
    if (roles.muted && muted.ok) {
        tokens['--c-text-weak'] = muted.color;
        if (roles.label) {
            tokens['--c-label-color'] = muted.color;
        }
    }
    if (words.ok) {
        tokens['--c-accent-text'] = words.color;
    }
    if (marks.ok) {
        tokens['--c-accent-mark'] = marks.color;
    }
    if (idle.ok) {
        tokens['--c-mark-idle'] = idle.color;
        tokens['--c-mark-idle-stroke'] = `1.5px ${idle.color}`;
    }
    const weak = tokens['--c-text-weak'] || textWeak;
    return {
        ok: true,
        tokens,
        italic: ratio(weak, text) < IDLE_APART,
        mutedSteps: muted.steps,
        wordsSteps: words.steps
    };
}

/**
 * A backing for text that can't read on what's behind it (IMPL_PLAN_TEXT_
 * CONTRAST §4.4, owner D1 = A). Tries each colour in order (the look's card
 * colour, then its page colour) at whole-percent opacities from the look's
 * own card opacity up: the smallest where main text reads, then raised
 * while that brings muted and accent words within CAP_STEPS of their own
 * colour. `judge(range)` is scopeColours on that container.
 * `{ color, alpha, range }`, or null when no colour can pass.
 */
export function backingFor({ colors, ownAlpha, underlay, judge }) {
    const start = Math.max(Math.round((Number(ownAlpha) || 0) * 100), 1);
    for (const color of colors) {
        const c = parseHex(color);
        if (!c) {
            continue;
        }
        const rangeAt = (n) =>
            over(`rgba(${c[0]}, ${c[1]}, ${c[2]}, ${n / 100})`, underlay);
        let min = null;
        for (let n = start; n <= 100; n += 1) {
            if (judge(rangeAt(n)).ok) {
                min = n;
                break;
            }
        }
        if (min === null) {
            continue;
        }
        let pick = min;
        for (let n = min; n <= 100; n += 1) {
            const r = judge(rangeAt(n));
            if (r.mutedSteps <= CAP_STEPS && r.wordsSteps <= CAP_STEPS) {
                pick = n;
                break;
            }
        }
        return {
            color: toHex(c),
            alpha: pick / 100,
            css: `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${pick / 100})`,
            range: rangeAt(pick)
        };
    }
    return null;
}

// ---------------------------------------------------------- the viewer

/** The colours the open page swaps in (each written as `<token>-page`). */
export const PAGE_TEXT_TOKENS = [
    '--c-text-weak',
    '--c-label-color',
    '--c-accent-text',
    '--c-accent-mark',
    '--c-mark-idle',
    '--c-mark-idle-stroke',
    '--c-idle-value-style',
    '--c-text-under'
];

/**
 * The One at a time open page: questions sit on the page (or its backing),
 * so its colours replace the card's. A no-op without the text marker, so a
 * snapshot published before keeps exactly what it had.
 */
export function openPageTextTokens(tokens) {
    const t = tokens || {};
    if (!t['--c-text-treatment']) {
        return t;
    }
    const out = { ...t };
    PAGE_TEXT_TOKENS.forEach((key) => {
        if (t[`${key}-page`] !== undefined) {
            out[key] = t[`${key}-page`];
        }
    });
    // the viewer's banners (a failed submit) sit on the open page outside
    // the question column: they take the page backing, here only
    if (t['--c-page-backing']) {
        out['--c-banner-backing'] = t['--c-page-backing'];
    }
    return out;
}

/**
 * A section with its own background: its readable colours as inline style,
 * recalculated from the ORIGINAL colours the marker carries (never from an
 * already-adjusted value, so a section can't compound the page's change).
 * '' when there is no marker, no background, or main text can't read there.
 */
export function sectionTextStyle(tokens, surfaceBg) {
    const t = tokens || {};
    const treatment = String(t['--c-text-treatment'] || '').split(' ');
    const under = rangeFromToken(t['--c-text-under']);
    if (!t['--c-text-treatment'] || !surfaceBg || !under) {
        return '';
    }
    const container = over(surfaceBg, under);
    const muted = treatment.includes('muted');
    const r = scopeColours({
        container,
        text: t['--c-text-src'],
        // an author's own muted colour is kept, and marks derive from it
        textWeak: muted ? t['--c-text-weak-src'] : t['--c-text-weak'],
        accent: t['--c-accent'],
        sectionFill: null,
        fieldFills: [t['--c-input-bg'], t['--c-field-bg']],
        roles: { muted, label: treatment.includes('label') }
    });
    if (!r.ok) {
        return '';
    }
    return Object.entries({
        ...r.tokens,
        '--c-idle-value-style': r.italic ? 'italic' : 'normal'
    })
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
}
