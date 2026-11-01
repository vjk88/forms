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
import { resolveTokens } from 'c/finalThemeEngine';
import {
    TEXT,
    MARK,
    TEXT_AIM,
    MARK_AIM,
    ACCENT_TINTS,
    parseHex,
    toHex,
    mix,
    composite,
    ratio,
    worst,
    adjust,
    adjustSteps,
    inkFor,
    brandSurfaces
} from 'c/finalReadableText';

// The colour helpers live in c/finalReadableText (IMPL_PLAN_TEXT_CONTRAST v7),
// shared with the theme engine; re-exported so callers keep one import.
export { inkFor, brandSurfaces };

export const BRAND_STYLES = ['clean', 'boldHeader', 'dark'];

// The generator still picks a focus colour that would pass even as the old
// 55% glow (kept so brand recipes stay byte-identical, focus plan V5); the
// ring itself is now drawn at full strength (IMPL_PLAN_FOCUS_CONTRAST v5).
const FOCUS_ALPHA = 0.55;

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

// ------------------------------------------------- any theme (theme creator)

// IMPL_PLAN_THEME_CREATOR: the merged theme dialog checks EVERY theme, not
// only brand recipes, and must not call a theme readable on surfaces it never
// measured. brandContrastReport above stays as it is (brand recipe tests).

/** The one recipe path each check judges, so Fix for me knows what to move. */
export const READABILITY_PATHS = {
    text: 'palette.text',
    'muted text': 'palette.textWeak',
    labels: 'palette.labelColor',
    'error text': 'fieldStates.error',
    'required marker': 'fieldStates.required',
    accent: 'palette.accent',
    'on-accent': 'palette.onAccent',
    'button text': 'palette.submitText',
    'button fill': 'palette.submitBg',
    'header title': 'palette.headerText',
    'header subtitle': 'palette.headerTextWeak',
    'focus ring': 'fieldStates.focus',
    'input border': 'palette.fieldBorderColor'
};

// Inks are picked for their fill, never nudged (pure black or white always
// reaches 4.58 : 1 on a solid colour).
const INK_FILL = {
    'palette.onAccent': '--c-accent',
    'palette.submitText': '--c-submit-bg'
};

function getPath(obj, path) {
    return path
        .split('.')
        .reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

function setPath(obj, path, value) {
    const keys = path.split('.');
    let node = obj;
    keys.slice(0, -1).forEach((key) => {
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key];
    });
    node[keys[keys.length - 1]] = value;
}

/** A gradient with both stops set (the engine paints nothing otherwise). */
const isGradient = (g) => Boolean(g && g.start && g.end);

/** Sample points along a gradient: every 10%, ends included. A SAMPLED check
 *  (review 2026-11-01): it catches a gradient passing through the text's own
 *  tone, which the two ends alone miss, but a narrow spot between two points
 *  can still slip through. */
const SAMPLES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** Colours along a gradient, start to end, at the sample points; [] when a
 *  stop isn't a hex colour (it can't be mixed), else just the two stops. */
function gradientColours(g) {
    if (!isGradient(g)) return [];
    const a = parseHex(g.start);
    const b = parseHex(g.end);
    if (!a || !b)
        return [
            [0, g.start],
            [1, g.end]
        ];
    const start = toHex(a);
    const end = toHex(b);
    return SAMPLES.map((share) => [share, mix(end, start, share)]);
}

/**
 * A gradient fill as surfaces, `[where, colour]`: each sample point at the
 * fill's opacity (0-100), composited over what it sits on.
 */
function gradientPoints(g, opacity, under, label) {
    if (!under) return [];
    const n = Number(opacity);
    const alpha = Number.isFinite(n) && n < 100 ? Math.max(n, 0) / 100 : 1;
    return gradientColours(g)
        .map(([share, colour]) => {
            const rgb = parseHex(colour);
            const value = rgb
                ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
                : colour;
            return [
                `${label} (${Math.round(share * 100)}%)`,
                composite(value, under)
            ];
        })
        .filter(([, colour]) => colour);
}

/** Does the theme paint any gradient? (The box words its verdict for it.) */
export function hasGradients(recipe) {
    const pal = (recipe && recipe.palette) || {};
    return [
        pal.pageBgGradient,
        pal.contentBgGradient,
        pal.headerBgGradient,
        pal.submitBgGradient,
        pal.headerTitleGradient
    ].some(isGradient);
}

/**
 * Every text, mark and focus pair of ANY theme recipe, on the engine's
 * resolved tokens, plus what it cannot measure.
 *   - gradients (page, panel, header, button, header title) are SAMPLED at
 *     11 points each, never judged by the solid fill under them;
 *   - photos and mesh can't be measured from a recipe: each is named in
 *     `unchecked`, and `complete` is false;
 *   - a header with no fill is judged where it sits (page and card).
 * @returns {{ checks: Array<{name, path, where, fg, bg, ratio, min, pass,
 *   advisory?, unmeasurable?}>, unchecked: Array<{surface}>, pass: boolean,
 *   complete: boolean }}
 */
export function themeReadability(recipe) {
    const p = recipe || {};
    const pal = p.palette || {};
    const t = resolveTokens(p, null);
    const s = brandSurfaces({
        pageBg: t['--c-page-bg'],
        contentBg: t['--c-content-bg'],
        text: t['--c-text'],
        fieldBg: t['--c-field-bg']
    });
    const pageStops = gradientPoints(
        pal.pageBgGradient,
        100,
        s.page,
        'the page gradient'
    );
    const cardStops = gradientPoints(
        pal.contentBgGradient,
        pal.contentBgOpacity,
        s.page,
        'the panel gradient'
    );
    const surfaces = [...s.all, ...pageStops, ...cardStops];
    const accent = composite(t['--c-accent'], s.card);
    const tinted = accent
        ? ACCENT_TINTS.flatMap((share) => [
              [
                  `a ${Math.round(share * 100)}% accent tint`,
                  mix(accent, s.card, share)
              ],
              [
                  `a ${Math.round(share * 100)}% accent tint on the page`,
                  mix(accent, s.page, share)
              ]
          ])
        : [];

    const checks = [];
    const add = (name, fg, where, bg, min, advisory = false) => {
        const row = {
            name,
            path: READABILITY_PATHS[name],
            where,
            fg,
            bg,
            min,
            ratio: 0,
            pass: false
        };
        if (!fg || !bg) {
            row.unmeasurable = true;
        } else {
            row.ratio = Math.round(ratio(fg, bg) * 100) / 100;
            row.pass = ratio(fg, bg) >= min;
        }
        if (advisory) row.advisory = true;
        checks.push(row);
    };
    const each = (name, token, list, min) => {
        list.forEach(([where, bg]) =>
            add(name, composite(t[token], bg), where, bg, min)
        );
    };

    each('text', '--c-text', [...surfaces, ...tinted], TEXT);
    each('muted text', '--c-text-weak', [...surfaces, ...tinted], TEXT);
    each('labels', '--c-label-color', surfaces, TEXT);
    each('error text', '--c-field-error', surfaces, TEXT);
    each('required marker', '--c-field-required', surfaces, TEXT);
    each('accent', '--c-accent', surfaces, TEXT);
    if (accent) {
        add(
            'on-accent',
            composite(t['--c-on-accent'], accent),
            'the accent',
            accent,
            TEXT
        );
    }
    const submit = composite(t['--c-submit-bg'], s.card);
    const submitStops = [
        ['the button', submit],
        ...gradientPoints(
            pal.submitBgGradient,
            100,
            s.card,
            'the button gradient'
        )
    ];
    submitStops.forEach(([where, bg]) =>
        add('button text', composite(t['--c-submit-text'], bg), where, bg, TEXT)
    );
    add('button fill', submit, 'the card', s.card, MARK, true);
    add('button fill', submit, 'the page', s.page, MARK, true);

    // the header: on its own fill, else where it sits. A gradient is a fill
    // even over a see-through solid (review 2026-11-01): the engine paints it
    // over the page.
    const headerBg = t['--c-header-bg'];
    const solidFill = headerBg && headerBg !== 'transparent';
    const headerPoints = gradientPoints(
        pal.headerBgGradient,
        pal.headerBgOpacity,
        s.page,
        'the header gradient'
    );
    let headerGround = [
        ['the page', s.page],
        ['the card', s.card]
    ];
    if (solidFill || headerPoints.length) {
        headerGround = [
            ...(solidFill ? [['the header', composite(headerBg, s.page)]] : []),
            ...headerPoints
        ];
    }
    const titleColours = gradientColours(pal.headerTitleGradient);
    headerGround.forEach(([where, bg]) => {
        if (titleColours.length) {
            titleColours.forEach(([, colour]) =>
                add('header title', composite(colour, bg), where, bg, TEXT)
            );
        } else {
            add(
                'header title',
                composite(t['--c-header-text'], bg),
                where,
                bg,
                TEXT
            );
        }
        add(
            'header subtitle',
            composite(t['--c-header-text-weak'], bg),
            where,
            bg,
            TEXT
        );
    });

    each('focus ring', '--c-field-focus', surfaces, MARK);
    each('input border', '--c-field-border', surfaces, MARK);

    const unchecked = [];
    const pageImage = p.pageImage || {};
    if (pageImage.url) unchecked.push({ surface: 'page image' });
    if (pal.headerImage) unchecked.push({ surface: 'header photo' });
    if ((p.effects || {}).mesh) unchecked.push({ surface: 'background mesh' });
    checks
        .filter((c) => c.unmeasurable)
        .forEach((c) => {
            if (!unchecked.some((u) => u.surface === c.where)) {
                unchecked.push({ surface: c.where });
            }
        });

    return {
        checks,
        unchecked,
        pass: checks
            .filter((c) => !c.advisory && !c.unmeasurable)
            .every((c) => c.pass),
        complete: unchecked.length === 0
    };
}

const failingPaths = (report) => [
    ...new Set(
        report.checks
            .filter((c) => !c.pass && !c.advisory && !c.unmeasurable)
            .map((c) => c.path)
    )
];

/**
 * Fix for me (IMPL_PLAN_THEME_CREATOR, ruling 4 + review): moves ONLY the
 * failing colours, in rounds, and never claims a fix it didn't make.
 *   - each candidate is a full 2%-step walk (adjustSteps) toward black AND
 *     toward white; the passing one with fewer steps wins. readable() is not
 *     used: it gives up when an endpoint fails, which skips the middle grays
 *     that pass between a dark page and a white card;
 *   - inks (on-accent, button text) are picked for their fill (inkFor);
 *   - after each round the whole report is recomputed (moving Text moves the
 *     section tints, moving Accent moves the accent tints), up to 5 rounds,
 *     stopping when a round fixes nothing;
 *   - a colour that can't pass keeps its value and is reported with the best
 *     worst-case ratio the walk FOUND (not "possible": a limited search).
 * @returns {{ recipe, fixed: string[], unfixed: Array<{path, name, where,
 *   best, min}>, report }}
 */
export function fixReadability(recipe) {
    const next = JSON.parse(JSON.stringify(recipe || {}));
    const fixed = new Set();
    const tried = new Map();
    let report = themeReadability(next);
    for (let round = 0; round < 5; round++) {
        const paths = failingPaths(report);
        if (!paths.length) break;
        let progress = false;
        const tokens = resolveTokens(next, null);
        for (const path of paths) {
            const rows = report.checks.filter(
                (c) => c.path === path && !c.advisory && !c.unmeasurable
            );
            const current =
                rows.find((r) => !r.pass)?.fg || getPath(next, path);
            const passes = (c) => rows.every((r) => ratio(c, r.bg) >= r.min);
            let pick = null;
            if (INK_FILL[path]) {
                const ink = inkFor(
                    composite(tokens[INK_FILL[path]], rows[0].bg) || rows[0].bg
                );
                if (passes(ink)) pick = ink;
            } else if (parseHex(current)) {
                const runs = ['#000000', '#ffffff']
                    .map((target) => adjustSteps(current, target, passes))
                    .filter((run) => run.ok)
                    .sort((a, b) => a.steps - b.steps);
                if (runs.length) pick = runs[0].color;
            }
            if (pick) {
                setPath(next, path, pick);
                fixed.add(path);
                progress = true;
            } else {
                tried.set(path, { rows, current });
            }
        }
        if (!progress) break;
        report = themeReadability(next);
    }
    const unfixed = failingPaths(report).map((path) => {
        const rows = report.checks.filter(
            (c) => c.path === path && !c.advisory && !c.unmeasurable
        );
        const worstRow = rows
            .filter((r) => !r.pass)
            .sort((a, b) => a.ratio - b.ratio)[0];
        const start = (tried.get(path) || {}).current || worstRow.fg;
        // the best worst-case ratio anywhere on either walk (2% steps)
        let best = Math.min(...rows.map((r) => r.ratio));
        if (parseHex(start)) {
            ['#000000', '#ffffff'].forEach((target) => {
                for (let k = 0; k <= 50; k++) {
                    const c = mix(target, start, k * 0.02);
                    const w = Math.min(...rows.map((r) => ratio(c, r.bg)));
                    if (w > best) best = w;
                }
            });
        }
        return {
            path,
            name: worstRow.name,
            where: worstRow.where,
            best: Math.round(best * 10) / 10,
            min: Math.max(...rows.map((r) => r.min))
        };
    });
    return { recipe: next, fixed: [...fixed], unfixed, report };
}
