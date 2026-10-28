/**
 * finalFocusTreatment — the keyboard-focus indicator (IMPL_PLAN_FOCUS_CONTRAST
 * v5, Part B). Pure: no DOM, no Apex. The engine, the viewer (open page and a
 * section's own background) and the no-theme path all call this one module.
 *
 * The indicator is two rings, judged as a whole:
 *   - outer ring: the focus colour. It touches the background around the
 *     control, so it must reach 3 : 1 against it;
 *   - inner ring: the partner (white or #111827, whichever contrasts more
 *     with the focus colour). It touches the control's own fill, so the
 *     indicator stays visible next to accent-filled buttons and tiles.
 * Underline fields keep an underline: one line in the focus colour, or the
 * two-colour underline in the fallback.
 *
 * Backgrounds are RANGES: [darker end, lighter end]. A colour the engine can
 * compute is a range of one; anything it can't see (a photo, the glow layers,
 * a gradient, the host showing through a translucent page) is "anything from
 * black to white", and each translucent layer painted above narrows it.
 * Compositing is a weighted average per channel and luminance rises with
 * every channel, so whatever sits underneath, the result lies between the
 * layer over black and the layer over white. A colour that sits outside a
 * range and reaches 3 : 1 against both ends passes against EVERY background
 * in it.
 *
 * When no colour can pass, the fallback is used: an inner white ring and an
 * outer #111827 ring (17.7 : 1 apart). W3C technique C40 guarantees one of
 * two colours 9 : 1 apart reaches 3 : 1 only over ONE solid background, so
 * over photos and gradients the fallback is a robust default that still
 * needs a browser check, not automatic proof.
 */

export const FOCUS_CONTRAST = 3;
// What a colour is chosen against: a little above the floor, so browser
// rounding of the painted ring can never tip a pair under 3 (measured: a
// colour at exactly 3.0 painted at 2.99 on Ocean Breeze's Submit button).
const FOCUS_AIM = 3.1;
export const FOCUS_DARK = '#111827';
export const FOCUS_LIGHT = '#ffffff';
export const FULL_RANGE = Object.freeze(['#000000', '#ffffff']);

const FALLBACK_UNDERLINE = `inset 0 -2px 0 0 ${FOCUS_DARK}, inset 0 -4px 0 0 ${FOCUS_LIGHT}`;

// ------------------------------------------------------------------ colour

/** {r, g, b, a} from #rgb, #rrggbb, rgb(), rgba() or `transparent`; else null. */
export function parseColor(value) {
    const s = String(value == null ? '' : value).trim();
    if (s === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
        const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
        return { r, g, b, a: 1 };
    }
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    m =
        /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i.exec(
            s
        );
    if (m) {
        const ch = (v) => Math.min(Math.max(Math.round(Number(v)), 0), 255);
        let a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
        a = Math.min(Math.max(a, 0), 1);
        return { r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a };
    }
    return null;
}

function toHex({ r, g, b }) {
    return `#${[r, g, b]
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('')}`;
}

// The readable-text search judges the same few hundred colours many times
// over; remembering their luminance keeps the engine fast on every edit.
const LUMINANCE = new Map();

function luminance(hex) {
    const key = String(hex);
    if (LUMINANCE.has(key)) {
        return LUMINANCE.get(key);
    }
    const c = parseColor(hex);
    let value = null;
    if (c) {
        const lin = (v) => {
            const x = v / 255;
            return x <= 0.03928
                ? x / 12.92
                : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        value = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    }
    if (LUMINANCE.size > 20000) {
        LUMINANCE.clear();
    }
    LUMINANCE.set(key, value);
    return value;
}

export function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    if (la === null || lb === null) {
        return null;
    }
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `weight` of colour a blended into b (both parse), as hex. */
function blend(a, b, weight) {
    const x = parseColor(a);
    const y = parseColor(b);
    const w = Math.min(Math.max(weight, 0), 1);
    return toHex({
        r: x.r * w + y.r * (1 - w),
        g: x.g * w + y.g * (1 - w),
        b: x.b * w + y.b * (1 - w)
    });
}

// ------------------------------------------------------------------ ranges

/** A colour as a range of one (null when it doesn't parse). */
export function exact(color) {
    const c = parseColor(color);
    if (!c) {
        return null;
    }
    const hex = toHex(c);
    return [hex, hex];
}

/**
 * `color` painted over every background in `range`. A colour that doesn't
 * parse (a gradient, color-mix, var()) is unknown: back to black to white.
 */
export function over(color, range) {
    const c = parseColor(color);
    if (!c || !range) {
        return [...FULL_RANGE];
    }
    if (c.a >= 1) {
        return exact(color);
    }
    const end = (u) => {
        const v = parseColor(u);
        return toHex({
            r: c.r * c.a + v.r * (1 - c.a),
            g: c.g * c.a + v.g * (1 - c.a),
            b: c.b * c.a + v.b * (1 - c.a)
        });
    };
    return [end(range[0]), end(range[1])];
}

/**
 * The range a stack of layers can show, painted bottom to top over the host
 * (unknown). Each layer is { color } (a colour, possibly translucent) or
 * { unknown: true } (a photo, glow layers, a gradient, texture).
 */
export function stackRange(layers) {
    let range = [...FULL_RANGE];
    for (const layer of layers) {
        if (!layer) {
            continue;
        }
        range = layer.unknown ? [...FULL_RANGE] : over(layer.color, range);
    }
    return range;
}

/** Does `color` reach `min` (3 : 1) against every background in `range`? */
export function passes(color, range, min = FOCUS_CONTRAST) {
    if (!range) {
        return false;
    }
    const lc = luminance(color);
    const l0 = luminance(range[0]);
    const l1 = luminance(range[1]);
    if (lc === null || l0 === null || l1 === null) {
        return false;
    }
    const lo = Math.min(l0, l1);
    const hi = Math.max(l0, l1);
    // inside the range: some background matches it exactly
    if (hi - lo > 1e-9 && lc > lo && lc < hi) {
        return false;
    }
    return contrast(color, range[0]) >= min && contrast(color, range[1]) >= min;
}

export function rangeToken(range) {
    return range ? `${range[0]} ${range[1]}` : 'fallback';
}

export function rangeFromToken(value) {
    const parts = String(value || '')
        .trim()
        .split(/\s+/);
    return parts.length === 2 && parseColor(parts[0]) && parseColor(parts[1])
        ? parts
        : null;
}

// --------------------------------------------------------------- treatment

function partnerFor(color) {
    return contrast(color, FOCUS_LIGHT) >= contrast(color, FOCUS_DARK)
        ? FOCUS_LIGHT
        : FOCUS_DARK;
}

function ringFor(focus, partner) {
    return `0 0 0 2px ${partner}, 0 0 0 4px ${focus}`;
}

function fallbackTreatment() {
    return {
        fallback: true,
        focus: FOCUS_DARK,
        partner: FOCUS_LIGHT,
        ring: ringFor(FOCUS_DARK, FOCUS_LIGHT),
        underline: FALLBACK_UNDERLINE
    };
}

/**
 * The indicator for one placement.
 *   base     the theme's focus colour (or accent), returned unchanged when it
 *            already passes
 *   toward   the text colour: the first direction to move a failing colour
 *   outside  ranges the outer ring sits on (card or page, section tints,
 *            field fills): the focus colour must pass every one
 *   inside   ranges of the fills the inner ring touches (button, accent):
 *            the partner or the focus colour must pass each
 *   fallback true when a surface can't be judged at all (a card gradient)
 */
export function focusTreatment({
    base,
    toward,
    outside = [],
    inside = [],
    fallback = false
} = {}) {
    if (fallback || !parseColor(base) || outside.some((r) => !r)) {
        return fallbackTreatment();
    }
    const ok = (c) => {
        if (!outside.every((r) => passes(c, r, FOCUS_AIM))) {
            return false;
        }
        const p = partnerFor(c);
        return inside.every(
            (r) => !r || passes(p, r, FOCUS_AIM) || passes(c, r, FOCUS_AIM)
        );
    };
    const tryOne = (c) => (ok(c) ? c : null);
    let found = tryOne(base);
    // toward the text colour first, so the hue survives as long as it can
    if (!found && parseColor(toward)) {
        for (let i = 1; i <= 20 && !found; i++) {
            found = tryOne(blend(toward, base, i / 20));
        }
    }
    // then on toward near-black or white, whichever this background needs
    if (!found) {
        const from = parseColor(toward) ? toward : base;
        const worst = (c) =>
            Math.min(
                ...outside.flatMap((r) => [
                    contrast(c, r[0]),
                    contrast(c, r[1])
                ])
            );
        const end =
            worst(FOCUS_DARK) >= worst(FOCUS_LIGHT) ? FOCUS_DARK : FOCUS_LIGHT;
        for (let i = 1; i <= 20 && !found; i++) {
            found = tryOne(blend(end, from, i / 20));
        }
    }
    if (!found) {
        return fallbackTreatment();
    }
    const partner = partnerFor(found);
    return {
        fallback: false,
        focus: found,
        partner,
        ring: ringFor(found, partner),
        underline: `inset 0 -2px 0 0 ${found}`
    };
}

/**
 * The tokens a treatment paints. `style` is the field style ('underline'
 * keeps the underline shape). These tokens must never get a CSS default:
 * an old published snapshot lacks them, and that absence is the gate that
 * keeps old forms drawing exactly as before.
 */
export function focusTokens(treatment, style) {
    const underline = style === 'underline';
    return {
        '--c-field-focus': treatment.focus,
        '--c-focus-partner': treatment.partner,
        '--c-focus-ring': treatment.ring,
        '--c-focus-shadow': treatment.ring,
        // the same two rings drawn INSIDE the control, for controls whose
        // container clips (scrolling tab and rail strips): focus colour at
        // the edge, partner inside it
        '--c-focus-ring-inset': `inset 0 0 0 2px ${treatment.focus}, inset 0 0 0 4px ${treatment.partner}`,
        '--c-focus-outline': 'transparent',
        '--c-input-shadow-focus': underline
            ? treatment.underline
            : treatment.ring,
        '--c-input-focus-style': underline ? 'underline' : 'ring'
    };
}

// ------------------------------------------------------------- placements

// The page frame's no-theme colours (finalPageFrame.css :host).
const NEUTRAL = {
    page: '#f4f7f5',
    card: '#ffffff',
    field: '#ffffff',
    base: '#4b5563',
    text: '#1f2937',
    submit: '#374151'
};

/**
 * A section's own background (surface.bg), painted by the section renderer
 * outside the engine. Given the form's resolved token bag, the declarations
 * to set on that section, or '' (old snapshot, or no own background).
 */
export function sectionFocusStyle(tokens, surfaceBg) {
    const t = tokens || {};
    if (!t['--c-focus-base'] || !surfaceBg) {
        return '';
    }
    const under = rangeFromToken(t['--c-focus-under']);
    const canJudge = under && parseColor(surfaceBg);
    const sec = canJudge ? over(surfaceBg, under) : null;
    // a form with no theme carries only the focus tokens: the rest is the
    // page frame's neutral defaults
    const pick = (key, neutral) => t[key] || neutral;
    const treatment = canJudge
        ? focusTreatment({
              base: t['--c-focus-base'],
              toward: pick('--c-text', NEUTRAL.text),
              outside: [sec, over(pick('--c-field-bg', NEUTRAL.field), sec)],
              inside: [
                  exact(pick('--c-submit-bg', NEUTRAL.submit)),
                  exact(pick('--c-accent', NEUTRAL.base))
              ]
          })
        : fallbackTreatment();
    const vars = {
        ...focusTokens(treatment, t['--c-input-focus-style']),
        '--c-focus-under': rangeToken(canJudge ? sec : null)
    };
    delete vars['--c-input-focus-style'];
    delete vars['--c-focus-outline'];
    return Object.entries(vars)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
}

/** The open page (One at a time, Immersive): controls sit on the page. */
export function openPageTokens(tokens) {
    const t = tokens || {};
    if (!t['--c-focus-page-ring']) {
        return t;
    }
    return {
        ...t,
        '--c-field-focus': t['--c-focus-page-field'],
        '--c-focus-partner': t['--c-focus-page-partner'],
        '--c-focus-ring': t['--c-focus-page-ring'],
        '--c-focus-shadow': t['--c-focus-page-ring'],
        '--c-input-shadow-focus': t['--c-focus-page-input'],
        '--c-focus-under': t['--c-focus-page-under']
    };
}

/** The focus tokens for a form with no theme (§6b). */
export function neutralFocusTokens() {
    const card = exact(NEUTRAL.card);
    const page = exact(NEUTRAL.page);
    const inside = [exact(NEUTRAL.submit), exact(NEUTRAL.base)];
    const t = focusTreatment({
        base: NEUTRAL.base,
        toward: NEUTRAL.text,
        outside: [card, page, exact(NEUTRAL.field)],
        inside
    });
    const p = focusTreatment({
        base: NEUTRAL.base,
        toward: NEUTRAL.text,
        outside: [page],
        inside
    });
    return {
        ...focusTokens(t, 'outline'),
        '--c-focus-idle-filter': 'none',
        '--c-focus-idle-opacity': '1',
        '--c-focus-base': NEUTRAL.base,
        '--c-focus-under': rangeToken(card),
        '--c-focus-page-field': p.focus,
        '--c-focus-page-partner': p.partner,
        '--c-focus-page-ring': p.ring,
        '--c-focus-page-input': p.ring,
        '--c-focus-page-under': rangeToken(page)
    };
}
