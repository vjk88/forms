/**
 * finalBrandTheme — builds a theme recipe from one brand colour
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §B.2). Pure: no DOM, no Apex.
 *
 *   buildBrandTheme({ color: '#e11d48', style: 'clean', fonts, name })
 *     → an ordinary theme recipe (the shape of a built-in), ready for
 *       saveCustomTheme;
 *   brandContrastReport(recipe)
 *     → every text / mark / focus pair, judged on the engine's RESOLVED
 *       tokens over composited surfaces, so the check is what the form paints.
 *
 * The brand colour plays three roles, kept apart because the CSS uses
 * --c-accent for several jobs (the accent-use audit, PR B1):
 *   - brand fill: the submit button is EXACTLY the brand colour;
 *   - accent: text and selected marks (stepper numbers, accordion headings,
 *     slider values, chip borders, progress) — the brand hue, darkened (light
 *     styles) or lightened (Dark) until it reaches 4.5:1 on EVERY surface it
 *     can sit on; fills that carry text use the explicit on-accent ink;
 *   - focus: chosen so the painted ring (55% of the colour over the surface)
 *     still reaches 3:1 on every surface a focusable control sits on.
 * Inks are written explicitly: #111827 / #ffffff when that pair passes,
 * otherwise #000000 / #ffffff (black or white always reach 4.58:1).
 * Body text never takes the brand colour.
 */
import { contrastRatio, resolveTokens } from 'c/finalThemeEngine';

export const BRAND_STYLES = ['clean', 'boldHeader', 'dark'];

const TEXT = 4.5;
const MARK = 3;
// What the generator aims for: a little above the WCAG floors, so browser
// rounding in color-mix / compositing can never tip a pair under.
const TEXT_AIM = 4.6;
const MARK_AIM = 3.1;
const FOCUS_ALPHA = 0.55; // --c-focus-ring paints the focus colour at 55%
// Section looks paint this share of the text colour over the card.
const SECTION_TINTS = [0, 0.03, 0.04, 0.07];
// Light accent tints behind text (emoji chip 12%, thank-you check 14%).
const ACCENT_TINTS = [0.12, 0.14];

// ---------------------------------------------------------------- colour

function parseHex(hex) {
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

function toHex(rgb) {
    return `#${rgb
        .map((v) =>
            Math.round(Math.min(255, Math.max(0, v)))
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`;
}

/** `share` of colour a over colour b (both hex). */
function mix(a, b, share) {
    const x = parseHex(a);
    const y = parseHex(b);
    return toHex(x.map((v, i) => v * share + y[i] * (1 - share)));
}

// A painted value (hex, rgb(a), transparent) as a solid hex over `under`.
function composite(value, under) {
    const v = String(value || '').trim();
    if (!v || v === 'transparent') {
        return under;
    }
    if (parseHex(v)) {
        return toHex(parseHex(v));
    }
    const m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (!m) {
        return under;
    }
    const parts = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
    const alpha = parts.length > 3 ? parts[3] : 1;
    return mix(toHex(parts.slice(0, 3)), under, alpha);
}

const ratio = (a, b) => contrastRatio(a, b) || 0;
const worst = (color, surfaces) =>
    Math.min(...surfaces.map((s) => ratio(color, s)));

// Move `color` toward `target` in small steps until `ok(c)` holds. Keeps the
// hue (mixing toward black or white), ends at the target at worst.
function adjust(color, target, ok) {
    for (let t = 0; t <= 1.0001; t += 0.02) {
        const c = mix(target, color, t);
        if (ok(c)) {
            return c;
        }
    }
    return target;
}

/** The ink for a fill: #111827 / #ffffff, else pure #000000 / #ffffff. */
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

// ---------------------------------------------------------------- styles

const BASES = {
    clean: (brand) => ({
        pageBg: mix(brand, '#ffffff', 0.04),
        contentBg: '#ffffff',
        fieldBg: '#ffffff',
        text: '#1f2937',
        textWeak: '#4b5563',
        error: '#b42318',
        shadow: 'soft',
        dark: false
    }),
    boldHeader: (brand) => ({
        pageBg: mix(brand, '#ffffff', 0.06),
        contentBg: '#ffffff',
        fieldBg: '#ffffff',
        text: '#1f2937',
        textWeak: '#4b5563',
        error: '#b42318',
        shadow: 'soft',
        dark: false,
        header: brand
    }),
    dark: (brand) => {
        const contentBg = mix(brand, '#161a22', 0.08);
        return {
            pageBg: mix(brand, '#0b0d12', 0.08),
            contentBg,
            fieldBg: mix('#ffffff', contentBg, 0.06),
            text: '#f1f5f9',
            textWeak: '#aab4c3',
            error: '#ff8a80',
            shadow: 'floating',
            dark: true
        };
    }
};

// Every surface text and marks can sit on: page, card, each section look
// over the card, the field.
function surfacesOf(b) {
    return [
        b.pageBg,
        ...SECTION_TINTS.map((t) => mix(b.text, b.contentBg, t)),
        b.fieldBg
    ];
}

/**
 * @param {{color: string, style?: string, fonts?: object, name?: string}} input
 * @returns {object|null} a theme recipe, or null for a colour that is not hex
 */
export function buildBrandTheme({
    color,
    style = 'clean',
    fonts = null,
    name = ''
} = {}) {
    const rgb = parseHex(color);
    if (!rgb) {
        return null;
    }
    const brand = toHex(rgb);
    const base = (BASES[style] || BASES.clean)(brand);
    const surfaces = surfacesOf(base);
    const toward = base.dark ? '#ffffff' : '#000000';

    // accent: the brand hue, moved until it reads as text on every surface
    const accent = adjust(brand, toward, (c) => worst(c, surfaces) >= TEXT_AIM);

    // focus: the painted ring (55% over each surface) reaches 3:1
    const focus = adjust(accent, toward, (c) =>
        surfaces.every((s) => ratio(mix(c, s, FOCUS_ALPHA), s) >= MARK_AIM)
    );

    // body text and errors, also over the light accent tints
    const textSurfaces = [
        ...surfaces,
        ...ACCENT_TINTS.map((t) => mix(accent, base.contentBg, t))
    ];
    const textToward = base.dark ? '#ffffff' : '#000000';
    const readable = (c) => worst(c, textSurfaces) >= TEXT_AIM;
    const text = adjust(base.text, textToward, readable);
    const textWeak = adjust(base.textWeak, textToward, readable);
    const error = adjust(base.error, textToward, readable);

    const palette = {
        accent,
        onAccent: inkFor(accent),
        submitBg: brand,
        submitText: inkFor(brand),
        pageBg: base.pageBg,
        contentBg: base.contentBg,
        fieldBg: base.fieldBg,
        text,
        textWeak,
        labelColor: text,
        borderColor: mix(text, base.contentBg, 0.18),
        headerBg: base.header || 'transparent'
    };
    if (base.header) {
        const ink = inkFor(base.header);
        palette.headerText = ink;
        palette.headerTextWeak = ink;
    }

    const recipe = {
        name: name || 'Brand theme',
        tags: ['brand', style, base.dark ? 'dark' : 'light'],
        layout: 'classic',
        palette,
        fieldStates: { focus, error, required: error },
        radius: 'soft',
        border: 'hairline',
        density: 'comfortable',
        effects: {
            shadow: base.shadow,
            glass: false,
            texture: null,
            mesh: null
        },
        brand: { color: brand, style }
    };
    if (fonts && typeof fonts === 'object') {
        recipe.fonts = { ...fonts };
    } else {
        recipe.typography = 'system';
    }
    return recipe;
}

/**
 * Every contrast pair of a recipe, judged on the RESOLVED tokens with
 * see-through values composited over what they sit on.
 * @returns {{ checks: Array<{pair, ratio, min, pass}>, pass: boolean }}
 */
export function brandContrastReport(recipe) {
    const t = resolveTokens(recipe, null);
    const card = composite(t['--c-content-bg'], '#ffffff');
    const page = composite(t['--c-page-bg'], card);
    const text = composite(t['--c-text'], card);
    const surfaces = [
        ['page', page],
        ...SECTION_TINTS.map((p) => [
            `section ${p * 100}%`,
            mix(text, card, p)
        ]),
        ['field', composite(t['--c-field-bg'], card)]
    ];
    const accent = composite(t['--c-accent'], card);
    const tinted = ACCENT_TINTS.map((p) => [
        `accent tint ${p * 100}%`,
        mix(accent, card, p)
    ]);
    const checks = [];
    const add = (pair, fg, bg, min) => {
        const r = ratio(fg, bg);
        checks.push({
            pair,
            ratio: Math.round(r * 100) / 100,
            min,
            pass: r >= min
        });
    };
    for (const [token, label] of [
        ['--c-text', 'text'],
        ['--c-text-weak', 'muted text'],
        ['--c-label-color', 'labels'],
        ['--c-field-error', 'error text']
    ]) {
        const fg = composite(t[token], card);
        [...surfaces, ...tinted].forEach(([s, bg]) =>
            add(`${label} on ${s}`, fg, bg, TEXT)
        );
    }
    surfaces.forEach(([s, bg]) => add(`accent on ${s}`, accent, bg, TEXT));
    add(
        'on-accent on accent',
        composite(t['--c-on-accent'], accent),
        accent,
        TEXT
    );
    const submitBg = composite(t['--c-submit-bg'], card);
    add(
        'button text on button',
        composite(t['--c-submit-text'], submitBg),
        submitBg,
        TEXT
    );
    const headerBg = t['--c-header-bg'];
    if (headerBg && headerBg !== 'transparent') {
        const hb = composite(headerBg, page);
        add(
            'header title on header',
            composite(t['--c-header-text'], hb),
            hb,
            TEXT
        );
        add(
            'header text on header',
            composite(t['--c-header-text-weak'], hb),
            hb,
            TEXT
        );
    }
    const focus = composite(t['--c-field-focus'], card);
    surfaces.forEach(([s, bg]) =>
        add(`focus ring on ${s}`, mix(focus, bg, FOCUS_ALPHA), bg, MARK)
    );
    return { checks, pass: checks.every((c) => c.pass) };
}
