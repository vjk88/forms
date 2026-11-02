/**
 * finalPdfTheme — a form's theme tokens turned into the concrete colors and
 * fonts a PDF can use (IMPL_PLAN_FORM_PDF §4.4).
 *
 * A PDF has no CSS: no var(), no color-mix(), no gradients, no web fonts. So
 * the token bag the form paints with (`resolved.tokens` for a published
 * version, the viewer's live tokens for a draft) is resolved here to plain
 * RGB colors and to bundled font keys.
 *
 * Paper is white, always — it is printed and read on screens of every theme.
 * The brand rides on the header band (its own colors, banner and logo), the
 * accent rules and headings, and the fonts. Every text color is checked
 * against what it sits on and replaced when it would be hard to read: a dark
 * theme's near-white body text must not land on white paper.
 *
 * Pure: no DOM, no Apex. Unit-tested on its own.
 */
import { BUNDLED_FONTS, bundledFont } from 'c/finalFontFamilies';

const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });
const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });

/** Readable stand-ins when a theme's own color fails contrast on paper. */
const SAFE_TEXT = Object.freeze({ r: 31, g: 41, b: 55, a: 1 }); // #1f2937
const SAFE_WEAK = Object.freeze({ r: 82, g: 96, b: 113, a: 1 }); // #526071
const SAFE_ACCENT = Object.freeze({ r: 15, g: 118, b: 110, a: 1 }); // #0f766e
const SAFE_BORDER = Object.freeze({ r: 124, g: 137, b: 153, a: 1 }); // #7c8999

const NAMED = Object.freeze({
    white: WHITE,
    black: BLACK,
    transparent: Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
    red: Object.freeze({ r: 255, g: 0, b: 0, a: 1 }),
    green: Object.freeze({ r: 0, g: 128, b: 0, a: 1 }),
    blue: Object.freeze({ r: 0, g: 0, b: 255, a: 1 }),
    gray: Object.freeze({ r: 128, g: 128, b: 128, a: 1 }),
    grey: Object.freeze({ r: 128, g: 128, b: 128, a: 1 })
});

/** Families used when the form's font is not one we can embed. */
const FALLBACK_KEYS = Object.freeze({
    sans: 'inter',
    serif: 'notoSerif',
    mono: 'ibmPlexMono'
});

const MAX_DEPTH = 8;

// ---------------------------------------------------------------- colors --

function clamp255(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

/** Split a CSS argument list on top-level commas (ignores nested parens). */
function splitTop(s, sep = ',') {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === sep && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** The argument text of the first `name(...)` call at the start of `s`. */
function callArgs(s, name) {
    const lower = s.toLowerCase();
    if (!lower.startsWith(`${name}(`)) {
        return null;
    }
    let depth = 0;
    for (let i = name.length; i < s.length; i++) {
        if (s[i] === '(') depth++;
        if (s[i] === ')') {
            depth--;
            if (depth === 0) {
                return s.slice(name.length + 1, i);
            }
        }
    }
    return null;
}

function parseHex(s) {
    const m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) {
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
}

function num(part, scale) {
    const t = String(part).trim();
    if (t.endsWith('%')) {
        return (parseFloat(t) / 100) * scale;
    }
    return parseFloat(t);
}

/** rgb()/rgba(), comma or space syntax, optional `/ alpha`. */
function parseRgb(args) {
    const [main, slashAlpha] = args.split('/');
    const parts = main.includes(',')
        ? main.split(',').map((p) => p.trim())
        : main.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const alphaPart = slashAlpha !== undefined ? slashAlpha : parts[3];
    const c = {
        r: clamp255(num(parts[0], 255)),
        g: clamp255(num(parts[1], 255)),
        b: clamp255(num(parts[2], 255)),
        a: alphaPart === undefined ? 1 : clamp01(num(alphaPart, 1))
    };
    return [c.r, c.g, c.b, c.a].some((n) => Number.isNaN(n)) ? null : c;
}

function hslToRgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function parseHsl(args) {
    const [main, slashAlpha] = args.split('/');
    const parts = main.includes(',')
        ? main.split(',').map((p) => p.trim())
        : main.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = num(parts[1], 1);
    const l = num(parts[2], 1);
    const alphaPart = slashAlpha !== undefined ? slashAlpha : parts[3];
    if ([h, s, l].some((n) => Number.isNaN(n))) return null;
    const rgb = hslToRgb(((h % 360) + 360) % 360, clamp01(s), clamp01(l));
    return {
        r: clamp255(rgb.r),
        g: clamp255(rgb.g),
        b: clamp255(rgb.b),
        a: alphaPart === undefined ? 1 : clamp01(num(alphaPart, 1))
    };
}

/** `color-mix(in srgb, A p%, B q%)` — premultiplied, as CSS does. */
function parseMix(args, tokens, depth) {
    const parts = splitTop(args);
    if (parts.length !== 3 || !/^in\s+srgb/i.test(parts[0])) return null;
    const side = (p) => {
        const m = /\s(-?[\d.]+)%\s*$/.exec(` ${p}`);
        return m
            ? { color: p.slice(0, p.lastIndexOf(m[1])).trim(), pct: +m[1] }
            : { color: p, pct: null };
    };
    const a = side(parts[1]);
    const b = side(parts[2]);
    const ca = parseColor(a.color, tokens, depth + 1);
    const cb = parseColor(b.color, tokens, depth + 1);
    if (!ca || !cb) return null;
    let pa = a.pct;
    let pb = b.pct;
    if (pa === null && pb === null) {
        pa = 50;
        pb = 50;
    } else if (pa === null) {
        pa = 100 - pb;
    } else if (pb === null) {
        pb = 100 - pa;
    }
    const sum = pa + pb;
    if (sum <= 0) return null;
    const wa = pa / sum;
    const wb = pb / sum;
    const alpha = ca.a * wa + cb.a * wb;
    const scaleAlpha = Math.min(sum, 100) / 100;
    if (alpha === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const ch = (k) => (ca[k] * ca.a * wa + cb[k] * cb.a * wb) / alpha;
    return {
        r: clamp255(ch('r')),
        g: clamp255(ch('g')),
        b: clamp255(ch('b')),
        a: clamp01(alpha * scaleAlpha)
    };
}

/** The first color stop of a gradient (the closest one-color stand-in). */
function firstStop(s, tokens, depth) {
    const re =
        /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[\w-]+\)|\b(?:white|black)\b)/i;
    const m = re.exec(s);
    return m ? parseColor(m[1], tokens, depth + 1) : null;
}

/**
 * Parses one CSS color value into `{ r, g, b, a }` (0–255, alpha 0–1), or
 * null when there is no color to be had (an image, `none`, junk).
 * `var(--x)` resolves through `tokens`; gradients give their first stop.
 */
export function parseColor(value, tokens, depth = 0) {
    if (value === null || value === undefined || depth > MAX_DEPTH) {
        return null;
    }
    const s = String(value).trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    if (lower.startsWith('var(')) {
        const args = callArgs(s, 'var');
        if (args === null) return null;
        const [name, ...rest] = splitTop(args);
        const fromToken =
            tokens && Object.prototype.hasOwnProperty.call(tokens, name)
                ? parseColor(tokens[name], tokens, depth + 1)
                : null;
        return fromToken || parseColor(rest.join(','), tokens, depth + 1);
    }
    if (Object.prototype.hasOwnProperty.call(NAMED, lower)) {
        return { ...NAMED[lower] };
    }
    if (s.startsWith('#')) return parseHex(s);
    const rgb = callArgs(s, 'rgb') ?? callArgs(s, 'rgba');
    if (rgb !== null) return parseRgb(rgb);
    const hsl = callArgs(s, 'hsl') ?? callArgs(s, 'hsla');
    if (hsl !== null) return parseHsl(hsl);
    const mix = callArgs(s, 'color-mix');
    if (mix !== null) return parseMix(mix, tokens, depth);
    if (/gradient\(/i.test(s)) return firstStop(s, tokens, depth);
    return null;
}

/** `top` painted over an opaque `bottom`. */
export function over(top, bottom) {
    const a = top.a;
    return {
        r: clamp255(top.r * a + bottom.r * (1 - a)),
        g: clamp255(top.g * a + bottom.g * (1 - a)),
        b: clamp255(top.b * a + bottom.b * (1 - a)),
        a: 1
    };
}

function luminance(c) {
    const lin = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio of two opaque colors. */
export function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Darkens `c` toward black until it reaches `ratio` on `bg` (or gives up). */
function darkenTo(c, bg, ratio) {
    let out = c;
    for (let i = 0; i < 20 && contrast(out, bg) < ratio; i++) {
        out = {
            r: clamp255(out.r * 0.88),
            g: clamp255(out.g * 0.88),
            b: clamp255(out.b * 0.88),
            a: 1
        };
    }
    return out;
}

/** Black or white, whichever reads better on `bg`. */
function inkFor(bg) {
    return contrast(WHITE, bg) >= contrast(SAFE_TEXT, bg) ? WHITE : SAFE_TEXT;
}

function opaque(value, tokens, bg) {
    const c = parseColor(value, tokens);
    return c ? over(c, bg) : null;
}

// ----------------------------------------------------------------- fonts --

/** The bundled key whose private alias the font stack names first. */
function bundledKeyIn(stack) {
    if (typeof stack !== 'string' || !stack) {
        return null;
    }
    let best = null;
    let bestAt = Infinity;
    for (const [key, font] of Object.entries(BUNDLED_FONTS)) {
        const at = stack.indexOf(font.alias);
        if (at >= 0 && at < bestAt) {
            best = key;
            bestAt = at;
        }
    }
    return best;
}

function kindOfStack(stack) {
    const s = String(stack || '').toLowerCase();
    if (/\bmonospace\b|\bmono\b|courier/.test(s)) return 'mono';
    if (/(^|[\s,"'])serif\b/.test(s.replace(/sans-serif/g, ''))) {
        return 'serif';
    }
    return 'sans';
}

/**
 * The font a PDF embeds for one `--c-font-*` stack: the bundled family the
 * stack names, else a bundled stand-in of the same kind (uploaded fonts and
 * installed-font stacks cannot be embedded — IMPL_PLAN_FORM_PDF §4.4).
 */
export function pdfFontFor(stack) {
    const key = bundledKeyIn(stack);
    if (key) {
        return { key, substituted: false };
    }
    return { key: FALLBACK_KEYS[kindOfStack(stack)], substituted: true };
}

/**
 * The TrueType files for one bundled family inside the `formPdfFonts`
 * resource (names made by scripts/fonts/build-pdf-fonts.py). A family with
 * no bold uses its one face for both.
 * @returns {{regular: string, bold: string} | null}
 */
export function pdfFontFiles(key) {
    const font = bundledFont(key);
    if (!font || !font.faces.length) {
        return null;
    }
    let regular = null;
    let bold = null;
    for (const face of font.faces) {
        const base = face.file.replace(/\.woff2$/, '');
        const weights = String(face.weight).split(' ').map(Number);
        if (weights.length > 1) {
            regular = regular || `${base}-400.ttf`;
            bold = bold || `${base}-700.ttf`;
        } else if (weights[0] >= 600) {
            bold = bold || `${base}.ttf`;
        } else {
            regular = regular || `${base}.ttf`;
        }
    }
    regular = regular || bold;
    bold = bold || regular;
    return { regular, bold };
}

// ----------------------------------------------------------------- theme --

/**
 * Concrete PDF theme from a token bag.
 * @param {object} tokens `--c-*` → CSS value (already asset-localized)
 * @returns {object} colors as {r,g,b,a} (opaque), radius in points, fonts
 */
export function pdfTheme(tokens) {
    const t = tokens || {};
    const paper = WHITE;

    let text = opaque(t['--c-text'], t, paper) || SAFE_TEXT;
    if (contrast(text, paper) < 4.5) text = SAFE_TEXT;
    let textWeak = opaque(t['--c-text-weak'], t, paper) || SAFE_WEAK;
    if (contrast(textWeak, paper) < 4.5) textWeak = SAFE_WEAK;

    const accentRaw = opaque(t['--c-accent'], t, paper) || SAFE_ACCENT;
    // Headings and rules in the accent must still read on white.
    const accent = darkenTo(accentRaw, paper, 3);

    // The header band: its own fill over the page fill, else the accent.
    const pageBg = opaque(t['--c-page-bg'], t, paper) || paper;
    // A header gradient paints ABOVE the solid fill (ARCH §3.2), so its first
    // stop is what the eye reads as the header's color.
    const headerFill =
        parseColor(t['--c-header-bg-gradient'], t) ||
        parseColor(t['--c-header-bg'], t);
    const headerBg =
        headerFill && headerFill.a > 0.05 ? over(headerFill, pageBg) : pageBg;
    let headerText = opaque(t['--c-header-text'], t, headerBg) || text;
    if (contrast(headerText, headerBg) < 4.5) headerText = inkFor(headerBg);
    let headerTextWeak =
        opaque(t['--c-header-text-weak'], t, headerBg) || headerText;
    if (contrast(headerTextWeak, headerBg) < 4.5) {
        headerTextWeak = headerText;
    }

    let border = opaque(t['--c-field-border'], t, paper) || SAFE_BORDER;
    if (contrast(border, paper) < 1.8) border = SAFE_BORDER;

    const radiusPx = parseFloat(t['--c-radius']);
    const radius = Number.isFinite(radiusPx)
        ? Math.max(0, Math.min(12, radiusPx * 0.75))
        : 4;

    return {
        paper,
        text,
        textWeak,
        accent,
        // fills only (bars, rules, ticks): text never sits on the accent
        accentFill: accentRaw,
        headerBg,
        headerText,
        headerTextWeak,
        // a header that is just white paper gets an accent rule under it
        headerIsPaper: contrast(headerBg, paper) < 1.15,
        border,
        hairline: over({ ...border, a: 0.35 }, paper),
        radius,
        fonts: {
            body: pdfFontFor(t['--c-font-body']),
            display: pdfFontFor(t['--c-font-display'] || t['--c-font-body'])
        }
    };
}
