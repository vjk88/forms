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
// The generator still picks a focus colour that would pass even as the old
// 55% glow (kept so brand recipes stay byte-identical, focus plan V5); the
// ring itself is now drawn at full strength (IMPL_PLAN_FOCUS_CONTRAST v5).
const FOCUS_ALPHA = 0.55;
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
    // Dark leaves the field to the engine's see-through wash (the same as the
    // built-in dark themes), so a field always reads lighter than whatever
    // section or page it sits on; an opaque fill vanished inside a boxed
    // section (PR 401 review).
    dark: (brand) => ({
        pageBg: mix(brand, '#0b0d12', 0.08),
        contentBg: mix(brand, '#161a22', 0.08),
        fieldBg: null,
        text: '#f1f5f9',
        textWeak: '#aab4c3',
        error: '#ff8a80',
        shadow: 'floating',
        dark: true
    })
};

// The engine's dark-field wash (finalThemeEngine outlineBg).
const DARK_FIELD = 'rgba(255, 255, 255, 0.06)';

/**
 * Every surface a form can paint, as [label, hex]. Containers: the page, the
 * card, and each section look over the card AND over the page (One at a
 * time's open page and full-bleed layouts draw sections straight on the
 * page). Fields: the field over every container. Shared by the generator
 * and the report; the test pins the labels so a surface cannot silently
 * drop out of both.
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

/**
 * @param {{color: string, secondColor?: string, style?: string, fonts?: object, name?: string}} input
 *   `color` is the MAIN brand colour: the submit button, the Bold header and
 *   the page tint. `secondColor` (optional, plan §B.4) takes the accent role:
 *   selected answers, progress, step numbers, highlights and the focus ring.
 *   Without it the accent comes from the main colour, exactly as before.
 * @returns {object|null} a theme recipe, or null for a colour that is not hex
 */
export function buildBrandTheme({
    color,
    secondColor = null,
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
    const s = brandSurfaces({
        ...base,
        fieldBg: base.fieldBg || DARK_FIELD
    });
    const all = s.all.map(([, hex]) => hex);
    const toward = base.dark ? '#ffffff' : '#000000';

    // accent: the second colour's hue (else the main one), moved until it
    // reads as text on every surface
    const secondRgb = parseHex(secondColor);
    const second = secondRgb ? toHex(secondRgb) : null;
    const accent = adjust(
        second || brand,
        toward,
        (c) => worst(c, all) >= TEXT_AIM
    );

    // focus: the painted ring (55% over each surface) reaches 3:1
    const focus = adjust(accent, toward, (c) =>
        all.every((bg) => ratio(mix(c, bg, FOCUS_ALPHA), bg) >= MARK_AIM)
    );

    // body text and errors, also over the light accent tints (card and page)
    const textSurfaces = [
        ...all,
        ...ACCENT_TINTS.flatMap((t) => [
            mix(accent, s.card, t),
            mix(accent, s.page, t)
        ])
    ];
    const readable = (c) => worst(c, textSurfaces) >= TEXT_AIM;
    const text = adjust(base.text, toward, readable);
    const textWeak = adjust(base.textWeak, toward, readable);
    const error = adjust(base.error, toward, readable);

    // input edges (WCAG 1.4.11): 3:1 against the field and what surrounds it
    const fieldBorderColor = adjust(
        mix(text, base.contentBg, 0.3),
        toward,
        (c) => worst(c, all) >= MARK_AIM
    );

    const palette = {
        accent,
        onAccent: inkFor(accent),
        submitBg: brand,
        submitText: inkFor(brand),
        pageBg: base.pageBg,
        contentBg: base.contentBg,
        text,
        textWeak,
        labelColor: text,
        borderColor: mix(text, base.contentBg, 0.18),
        fieldBorderColor,
        headerBg: base.header || 'transparent'
    };
    if (base.fieldBg) {
        palette.fieldBg = base.fieldBg;
    }
    if (base.header) {
        const ink = inkFor(base.header);
        palette.headerText = ink;
        // a softer description ink that still reads, so title and
        // description keep their hierarchy
        palette.headerTextWeak = adjust(
            mix(ink, base.header, 0.8),
            ink,
            (c) => ratio(c, base.header) >= TEXT_AIM
        );
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
        brand: second
            ? { color: brand, secondColor: second, style }
            : { color: brand, style }
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
 * see-through values composited over what they sit on (page at the bottom,
 * then the card, then sections and fields). A value that cannot be measured
 * (a gradient, color-mix) FAILS as "unmeasurable" rather than passing.
 * Advisory rows (the button's fill against its surroundings) are reported
 * but do not decide `pass`.
 * @returns {{ checks: Array<{pair, ratio, min, pass, advisory?}>, pass: boolean }}
 */
export function brandContrastReport(recipe) {
    const t = resolveTokens(recipe, null);
    const s = brandSurfaces({
        pageBg: t['--c-page-bg'],
        contentBg: t['--c-content-bg'],
        text: t['--c-text'],
        fieldBg: t['--c-field-bg']
    });
    const accent = composite(t['--c-accent'], s.card);
    const tinted = ACCENT_TINTS.flatMap((p) => [
        [`accent tint ${Math.round(p * 100)}% on card`, mix(accent, s.card, p)],
        [`accent tint ${Math.round(p * 100)}% on page`, mix(accent, s.page, p)]
    ]);
    const checks = [];
    const add = (pair, fg, bg, min, advisory = false) => {
        const measurable = Boolean(fg && bg);
        const r = measurable ? ratio(fg, bg) : 0;
        const row = {
            pair: measurable ? pair : `${pair} (unmeasurable)`,
            ratio: Math.round(r * 100) / 100,
            min,
            pass: measurable && r >= min
        };
        if (advisory) {
            row.advisory = true;
        }
        checks.push(row);
    };
    for (const [token, label] of [
        ['--c-text', 'text'],
        ['--c-text-weak', 'muted text'],
        ['--c-label-color', 'labels'],
        ['--c-field-error', 'error text']
    ]) {
        const fg = composite(t[token], s.card);
        [...s.all, ...tinted].forEach(([where, bg]) =>
            add(`${label} on ${where}`, fg, bg, TEXT)
        );
    }
    s.all.forEach(([where, bg]) => add(`accent on ${where}`, accent, bg, TEXT));
    add(
        'on-accent on accent',
        composite(t['--c-on-accent'], accent),
        accent,
        TEXT
    );
    const submitBg = composite(t['--c-submit-bg'], s.card);
    add(
        'button text on button',
        composite(t['--c-submit-text'], submitBg),
        submitBg,
        TEXT
    );
    // advisory: a button that blends into the card loses its shape (the
    // label still reads); B2 warns or adds an outline
    add('button fill on card', submitBg, s.card, MARK, true);
    add('button fill on page', submitBg, s.page, MARK, true);
    const headerBg = t['--c-header-bg'];
    if (headerBg && headerBg !== 'transparent') {
        const hb = composite(headerBg, s.page);
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
    // the two-colour focus ring at full strength (IMPL_PLAN_FOCUS_CONTRAST
    // v5 §4): it reads when either ring reaches 3:1 against the background
    const focus = composite(t['--c-field-focus'], s.card);
    const partner = composite(t['--c-focus-partner'], s.card);
    const ring = (bg) => {
        const partnerWins =
            partner && focus && bg && ratio(partner, bg) > ratio(focus, bg);
        return partnerWins ? partner : focus;
    };
    s.all.forEach(([where, bg]) =>
        add(`focus ring on ${where}`, ring(bg), bg, MARK)
    );
    const border = composite(t['--c-field-border'], s.card);
    s.all.forEach(([where, bg]) =>
        add(`input border on ${where}`, border, bg, MARK)
    );
    return {
        checks,
        pass: checks.filter((c) => !c.advisory).every((c) => c.pass)
    };
}
