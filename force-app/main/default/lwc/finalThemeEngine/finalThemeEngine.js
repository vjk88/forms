/**
 * finalThemeEngine — L5 token engine (ARCHITECTURE_LAYOUTS_THEMES §5).
 *
 * ONE pure function: theme properties + sparse form-level overrides → the full `--c-*`
 * token map (token contract §3.2). No DOM, no wire adapters, no component knowledge.
 *
 * Rules this module carries:
 * - It is the ONLY producer of `--c-*` values (§3.1 rule 1). Layouts consume, never write.
 * - Raw scales (spacing steps, radius sizes, type ramps, effect recipes) are JS constants
 *   in here — never emitted as CSS variables (§3.3). Only semantic tokens cross the wire.
 * - `resolveTokens(null)` → `{}` — the "no theme" render comes from finalPageFrame's
 *   neutral :host fallbacks, not from this engine.
 * - `--c-section-bg/border/shadow` emit ONLY when the global Section style (or an
 *   explicit section fill/border color) is set — unset still means "the section
 *   preset decides" (§3.1 rule 5 carve-out; global setting = owner 2026-07-11).
 * - Merge semantics (§4.3 cascade): `undefined` = not set, inherit up; `null` = an
 *   explicit value (e.g. `effects.mesh: null` turns the mesh off) and wins like any other.
 */

export const ENGINE_VERSION = 1;

// ---------------------------------------------------------------------------
// Internal scales (§3.3 — primitives stay inside the engine, never on the wire)
// ---------------------------------------------------------------------------

// Curated radius scale (§3.3 — internal, not on the wire). Themes select a key;
// the roster's raw px values quantize onto the nearest step. editorialIvory's
// `soft` (8px) is unchanged, so its snapshot stays put.
const RADIUS = {
    sharp: '0px',
    xs: '4px',
    soft: '8px',
    md: '12px',
    round: '14px',
    lg: '16px',
    xl: '20px',
    pill: '24px'
};

const DENSITY = {
    comfortable: {
        space: ['4px', '8px', '12px', '16px', '24px', '32px'],
        controlH: '44px',
        sectionPad: '20px'
    },
    compact: {
        space: ['2px', '6px', '8px', '12px', '16px', '20px'],
        controlH: '36px',
        sectionPad: '14px'
    }
};

const FONT_STACKS = {
    system: {
        body: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display:
            "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    },
    editorial: {
        body: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
    },
    mono: {
        body: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        display:
            "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
    },
    geometric: {
        body: "'Avenir Next', 'Century Gothic', Futura, 'Trebuchet MS', sans-serif",
        display:
            "'Avenir Next', 'Century Gothic', Futura, 'Trebuchet MS', sans-serif"
    },
    humanist: {
        body: "Seravek, 'Gill Sans', 'Segoe UI', Verdana, sans-serif",
        display: "Seravek, 'Gill Sans', 'Segoe UI', Verdana, sans-serif"
    }
};

// Curated shadow scale (§3.3). `soft`/`floating` unchanged (editorialIvory uses
// `soft`); `medium` fills the gap, `brutal` is the flat offset the Neo-Brutalism
// family needs (a hard drop, no blur).
const SHADOWS = {
    none: 'none',
    soft: '0 8px 24px rgba(15, 23, 42, 0.08)',
    medium: '0 10px 30px rgba(15, 23, 42, 0.12)',
    floating: '0 18px 48px rgba(15, 23, 42, 0.16)',
    brutal: '5px 5px 0 rgba(0, 0, 0, 0.9)',
    // Immersive dark-scene lift (Neon Nights) — reads only against dark pages.
    deep: '0 30px 80px -20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
};

const BORDER_WIDTHS = {
    hairline: '1px',
    bold: '2px'
};

// Global Section style (owner 2026-07-11): ONE Design-mode pick paints every
// section, overriding the per-section preset classes via the --c-section-*
// tokens they already read as var() overrides. The recipes ARE the presets'
// own fallbacks (finalSectionRenderer.css) — same ink-tint color-mix, so the
// global pick and the class-decided look can never drift apart. 'flat' stays
// class-only (its zero side-padding is structural, not expressible in these
// three tokens).
// bgPct/borderPct: the same recipes as JS mix() fractions — they feed the
// guaranteed-hex swatch companions (a color-mix() string means nothing to a
// color picker; round-2 audit).
const SECTION_LOOKS = {
    plain: {
        bg: 'transparent',
        border: 'none',
        shadow: 'none',
        bgPct: 0,
        borderPct: 0
    },
    card: {
        bg: 'color-mix(in srgb, var(--c-text) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--c-text) 12%, transparent)',
        shadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
        bgPct: 0.04,
        borderPct: 0.12
    },
    boxed: {
        bg: 'color-mix(in srgb, var(--c-text) 7%, transparent)',
        border: 'none',
        shadow: 'none',
        bgPct: 0.07,
        borderPct: 0
    },
    outline: {
        bg: 'transparent',
        border: '1px solid color-mix(in srgb, var(--c-text) 18%, transparent)',
        shadow: 'none',
        bgPct: 0,
        borderPct: 0.18
    },
    subtle: {
        bg: 'color-mix(in srgb, var(--c-text) 3%, transparent)',
        border: 'none',
        shadow: 'none',
        bgPct: 0.03,
        borderPct: 0
    }
};

// Fit is the property the user picks; size+repeat are the tokens it resolves to.
// The user's image owns these two tokens EXCLUSIVELY — effects never touch them (§2.1).
const PAGE_FIT = {
    cover: { size: 'cover', repeat: 'no-repeat' },
    contain: { size: 'contain', repeat: 'no-repeat' },
    tile: { size: 'auto', repeat: 'repeat' }
};

// A mesh is up to three SINGLE-layer gradients feeding three FIXED .fx slots
// (`--c-fx-mesh-1..3`). One token = one layer (§3.1 rule 2) — layer slots can
// never shift, which is what killed the old image-fit bug class.
const MESHES = {
    aurora: [
        'radial-gradient(60% 45% at 12% 8%, rgba(45, 212, 191, 0.2), transparent 68%)',
        'radial-gradient(55% 45% at 88% 14%, rgba(129, 140, 248, 0.18), transparent 68%)',
        'radial-gradient(70% 55% at 50% 102%, rgba(251, 191, 36, 0.12), transparent 72%)'
    ],
    dusk: [
        'radial-gradient(65% 50% at 15% 12%, rgba(244, 114, 182, 0.16), transparent 70%)',
        'radial-gradient(60% 50% at 85% 90%, rgba(99, 102, 241, 0.18), transparent 70%)',
        'radial-gradient(50% 40% at 60% 0%, rgba(56, 189, 248, 0.12), transparent 72%)'
    ],
    // Neon Nights (design-explorations/04): four saturated blobs on a near-black
    // page — the only preset that uses the fourth slot. Alphas are authored at
    // full look strength; pair with meshBlend:'screen' for the glow.
    // Alphas are authored HOT because this preset ships with meshBlur 60 —
    // the blur spreads the ink, roughly halving perceived intensity (the
    // mockup blurs full-alpha solid blobs).
    neon: [
        'radial-gradient(50% 50% at 6% 2%, rgba(122, 92, 255, 0.85), transparent 70%)',
        'radial-gradient(45% 45% at 94% 10%, rgba(255, 46, 147, 0.8), transparent 70%)',
        'radial-gradient(48% 48% at 30% 104%, rgba(22, 224, 196, 0.8), transparent 72%)',
        'radial-gradient(34% 34% at 82% 96%, rgba(255, 177, 61, 0.7), transparent 70%)'
    ]
};

// Every preset's blob colors, in slot order — the panel shows these as the
// LIVE picker values while a preset is active (owner 2026-07-08: "Neon is
// still fixed colors" — editing any blob converts the mesh to 'custom',
// seeded from the preset the user was looking at, never a surprise palette).
export const MESH_SEEDS = {
    aurora: ['#2dd4bf', '#818cf8', '#fbbf24'],
    dusk: ['#f472b6', '#6366f1', '#38bdf8'],
    neon: ['#7a5cff', '#ff2e93', '#16e0c4', '#ffb13d']
};

// Custom mesh (owner plan B4): mesh:'custom' builds blobs from the user's own
// colors over the neon GEOMETRY. Alphas adapt to the blur treatment — blurred
// layers are authored hot (blur spreads the ink), unblurred stay moderate.
const MESH_GEOMETRY = [
    { g: '50% 50% at 6% 2%', hot: 0.85, base: 0.55 },
    { g: '45% 45% at 94% 10%', hot: 0.8, base: 0.5 },
    { g: '48% 48% at 30% 104%', hot: 0.8, base: 0.5 },
    { g: '34% 34% at 82% 96%', hot: 0.7, base: 0.45 }
];

function customMesh(colors, blurred) {
    // Tolerate both array and {0:..,1:..} object form (sparse-override paths).
    const list = Array.isArray(colors)
        ? colors
        : colors && typeof colors === 'object'
          ? Object.keys(colors)
                .sort()
                .map((k) => colors[k])
          : [];
    // POSITIONAL — an empty slot stays null so mesh tokens 1..4 never shift.
    return MESH_GEOMETRY.map((slot, i) => {
        if (!list[i]) {
            return null;
        }
        return `radial-gradient(${slot.g}, ${rgba(list[i], blurred ? slot.hot : slot.base)}, transparent 70%)`;
    });
}

// A texture is ONE self-tiling layer (intrinsic-size SVG data URI — tiles naturally,
// needs no background-size, so it can never collide with the image's fit tokens).
// Intensity parametrizes the ink opacity (owner QA 2026-07-07: the fixed 0.05
// was invisible on most backgrounds; FormStudio had Texture Intensity).
const EFFECT_INTENSITY = {
    subtle: { texture: 0.05, meshBoost: 1 },
    medium: { texture: 0.12, meshBoost: 2 },
    strong: { texture: 0.22, meshBoost: 3.2 }
};

function textureLayer(kind, intensity) {
    const o = (EFFECT_INTENSITY[intensity] || EFFECT_INTENSITY.subtle).texture;
    if (kind === 'dots') {
        return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='2' cy='2' r='1.1' fill='%23111827' fill-opacity='${o}'/%3E%3C/svg%3E")`;
    }
    if (kind === 'grid') {
        return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cpath d='M28 0H0v28' fill='none' stroke='%23111827' stroke-opacity='${o}'/%3E%3C/svg%3E")`;
    }
    // Film grain: SVG turbulence noise — grayscale, so it reads on BOTH light
    // and dark pages (dots/grid carry dark ink and vanish on dark themes).
    if (kind === 'grain') {
        return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${o}'/%3E%3C/svg%3E")`;
    }
    return null;
}

/** Scale every rgba alpha in a mesh gradient by the intensity boost (cap 0.6). */
function boostMesh(layer, intensity) {
    const boost = (EFFECT_INTENSITY[intensity] || EFFECT_INTENSITY.subtle)
        .meshBoost;
    if (boost === 1) {
        return layer;
    }
    return layer.replace(
        /rgba\((\d+), ?(\d+), ?(\d+), ?([0-9.]+)\)/g,
        (m, r, g, b, a) =>
            `rgba(${r}, ${g}, ${b}, ${Math.min(Number(a) * boost, 0.6).toFixed(3)})`
    );
}

// The engine's own defaults for gaps a (sparse) theme leaves open. These are NOT the
// no-theme neutrals — those live at finalPageFrame :host (§3.1 rule 5).
const DEFAULT_PROPS = {
    palette: {
        accent: '#0d9488',
        pageBg: '#f4f7f5',
        contentBg: '#ffffff',
        text: '#1f2937',
        textWeak: '#6b7280',
        headerBg: 'transparent'
    },
    typography: 'system',
    // Custom brand font (CUSTOM_FONTS.md): { key, family, fallback, resource,
    // regularPath, boldPath }. The engine only TYPESETS it (family + fallback
    // into the font tokens); registering the @font-face is finalFontLoader's
    // job at the render site. Wins over `typography` when set.
    customFont: null,
    // Field chrome (owner QA 2026-07-07, FormStudio port): input shell style
    // and theme-level label defaults. Per-element label config still wins in
    // the renderer; these set the form-wide default.
    fieldStyle: 'outline', // outline | underline | filled
    // Input-corner override (radius KEY): unset = inputs share --c-radius.
    // Lets a theme pair a curvy card with tighter inputs (Neon Nights: pill/round).
    fieldRadius: null,
    // Page-canvas corner rounding (radius KEY) — EMBEDDED contexts only (the
    // LEX tab paints the scene as a deliberate rounded canvas; the guest page
    // owns the viewport and stays square/full-bleed). Conditional token.
    pageRadius: null,
    labelPosition: 'top', // top | left
    labelStyle: 'default', // default | monoCaps | mutedSm | caps
    // Global section look (plain|card|boxed|outline|subtle): null = each
    // section's own preset class decides (the §3.1 rule 5 carve-out).
    sectionStyle: null,
    // 'none' hides section borders outright — beats the look AND a custom
    // border color (owner 2026-07-12).
    sectionBorder: null,
    radius: 'soft',
    border: 'hairline',
    density: 'comfortable',
    effects: {
        shadow: 'soft',
        glass: false, // false | true (14px) | number (custom blur px)
        texture: null,
        mesh: null,
        textureIntensity: 'subtle',
        meshIntensity: 'subtle',
        meshAnimate: false, // slow blob drift (pageFrame pauses on reduced motion)
        meshBlend: 'normal', // 'screen' = luminous blobs (dark pages only — screen on white is invisible)
        meshBlur: 0 // px; >0 = truly soft blobs — layers oversize (bleed) and blur, clipped by .fx
    },
    fieldStates: { error: '#b42318', required: '#b42318' },
    pageImage: {
        url: null,
        fit: 'cover',
        position: 'center',
        scrim: 0,
        opacity: 100
    }
};

// Gradient surfaces (owner QA 2026-07-07, FormBuilder pattern): a gradient is
// { type: 'linear'|'radial', angle: 0-360, start: hex, end: hex } stored at
// palette.pageBgGradient / contentBgGradient / headerBgGradient. It paints as
// a background-image layer ABOVE the surface's solid color (which stays the
// fallback + the ink-derivation base for borders/contrast).
function gradientLayer(g, fillOpacity) {
    if (!g || !g.start || !g.end) {
        return 'none';
    }
    const start = withFillOpacity(g.start, fillOpacity);
    const end = withFillOpacity(g.end, fillOpacity);
    if (g.type === 'radial') {
        return `radial-gradient(circle at 50% 0%, ${start}, ${end})`;
    }
    const angle = Number.isFinite(Number(g.angle)) ? Number(g.angle) : 135;
    return `linear-gradient(${angle}deg, ${start}, ${end})`;
}

// Fill opacity (owner QA 2026-07-08): each surface FILL can go translucent so
// the layers behind show through (card/header over the page backdrop). Wraps
// at token emission only — ink derivation (borders, onColor, the page veil)
// keeps reading the raw fill. color-mix because theme fills aren't always hex
// (rgba and color-mix strings exist in the catalog); at 100/unset the color
// passes through untouched so existing themes emit byte-identical tokens.
function glassPx(g) {
    if (g === true) {
        return '14px';
    }
    const n = Number(g);
    return Number.isFinite(n) && n > 0 ? `${Math.min(n, 60)}px` : '0px';
}

function withFillOpacity(color, pct) {
    const n = Number(pct);
    if (!color || !Number.isFinite(n) || n >= 100) {
        return color;
    }
    return `color-mix(in srgb, ${color} ${Math.max(n, 0)}%, transparent)`;
}

// ---------------------------------------------------------------------------
// Color utilities (deterministic JS — no color-mix() on the wire)
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
    if (typeof hex !== 'string') {
        return null;
    }
    const h = hex.trim().replace(/^#/, '');
    const full =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) {
        return null;
    }
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
    };
}

function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})` : hex;
}

/**
 * Blend `weight` of hexA into hexB (0..1). Non-hex inputs fall back gracefully:
 * an unparseable base surface (rgba/gradient glass themes) degrades to a
 * translucent tint of hexA — never full-strength hexA (loud borders).
 */
function mix(hexA, hexB, weight) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a) {
        return hexB;
    }
    if (!b) {
        return rgba(hexA, Math.min(Math.max(weight, 0), 1));
    }
    const w = Math.min(Math.max(weight, 0), 1);
    const ch = (x, y) =>
        Math.round(x * w + y * (1 - w))
            .toString(16)
            .padStart(2, '0');
    return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}

/** Readable text color on the given background (YIQ brightness split). */
function onColor(hex) {
    const c = hexToRgb(hex);
    if (!c) {
        return '#111827';
    }
    const yiq = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
    return yiq >= 150 ? '#111827' : '#ffffff';
}

/** Is this a light color? (Non-hex → treated as light — the neutral default.) */
function isLight(hex) {
    const c = hexToRgb(hex);
    if (!c) {
        return true;
    }
    return (c.r * 299 + c.g * 587 + c.b * 114) / 1000 >= 150;
}

/**
 * Do fields sit on a dark surface? Judge by contentBg when it parses as hex —
 * that IS the panel inputs sit on, and colored-text themes (terminal's green)
 * fool a text-based probe. Glass/gradient surfaces fall back to the text ink.
 */
function isDarkSurface(pal) {
    const c = hexToRgb(pal.contentBg);
    if (c) {
        return (c.r * 299 + c.g * 587 + c.b * 114) / 1000 < 150;
    }
    return isLight(pal.text);
}

/** WCAG relative luminance of a hex color; null when unparseable. */
function relLuminance(hex) {
    const c = hexToRgb(hex);
    if (!c) {
        return null;
    }
    const lin = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG 2.x contrast ratio between two hex colors (1..21), or null when either
 * side is unparseable. Exported as the ONE contrast computation — every badge
 * (Simple lens, Advanced lens, themeEditor) renders this number, never its own.
 * Threshold semantics live with the consumer (4.5 normal / 3 large text).
 */
export function contrastRatio(hexA, hexB) {
    const la = relLuminance(hexA);
    const lb = relLuminance(hexB);
    if (la === null || lb === null) {
        return null;
    }
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Property merge — theme default → form-level override (§4.3; one cascade, here only)
// ---------------------------------------------------------------------------

const GROUP_KEYS = ['palette', 'effects', 'fieldStates', 'pageImage'];

function mergeProps(...layers) {
    const out = { palette: {}, effects: {}, fieldStates: {}, pageImage: {} };
    for (const layer of layers) {
        if (!layer || typeof layer !== 'object') {
            continue;
        }
        for (const [key, value] of Object.entries(layer)) {
            if (value === undefined) {
                continue;
            }
            if (GROUP_KEYS.includes(key)) {
                if (value && typeof value === 'object') {
                    for (const [gk, gv] of Object.entries(value)) {
                        if (gv !== undefined) {
                            out[key][gk] = gv;
                        }
                    }
                }
            } else {
                out[key] = value;
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// The single producer
// ---------------------------------------------------------------------------

/**
 * @param {object|null} themeProps    theme-property shape (ARCH §4.1) or null = no theme
 * @param {object|null} formOverrides SPARSE same-shape deltas (spec `theme.overrides`)
 * @returns {object} full `--c-*` → value map, or `{}` when nothing is themed
 */
export function resolveTokens(themeProps, formOverrides) {
    if (!themeProps && !formOverrides) {
        return {};
    }
    const p = mergeProps(DEFAULT_PROPS, themeProps, formOverrides);
    const pal = p.palette;
    const fx = p.effects;
    const fs = p.fieldStates;
    const img = p.pageImage;

    const density = DENSITY[p.density] || DENSITY.comfortable;

    // ---- field chrome: input shell + label defaults (owner QA 2026-07-07) ----
    const fieldBorderColor =
        pal.fieldBorderColor || mix(pal.text, pal.contentBg, 0.3);
    const outlineBg =
        pal.fieldBg ||
        (isDarkSurface(pal) ? 'rgba(255, 255, 255, 0.06)' : '#ffffff');
    const focusColor = fs.focus || pal.accent;
    // `swatch` = the guaranteed-HEX companion the panel's Input fill picker
    // shows (round-2 audit): the painted bg can be a keyword or a translucent
    // rgba the picker can't honestly parse — so each shell composites its
    // real look over the content panel with mix() instead.
    const INPUT_SHELLS = {
        outline: {
            bg: outlineBg,
            border: fieldBorderColor,
            radius: null, // falls through to --c-radius via the CSS fallback
            shadow: 'none',
            shadowFocus: `0 0 0 3px ${rgba(focusColor, 0.55)}`,
            swatch:
                pal.fieldBg ||
                (isDarkSurface(pal)
                    ? mix('#ffffff', pal.contentBg, 0.06)
                    : '#ffffff')
        },
        // the "Boutique underline": no shell, just the baseline (legacy
        // formThemes §3.2 — transparent border + inset box-shadow line)
        underline: {
            // explicit palette.fieldBg wins in EVERY shell (legacy-coverage
            // sweep 2026-07-08); the underline default stays bare
            bg: pal.fieldBg || 'transparent',
            border: 'transparent',
            radius: '0px',
            shadow: `inset 0 -1.5px 0 0 ${fieldBorderColor}`,
            shadowFocus: `inset 0 -2px 0 0 ${focusColor}`,
            // transparent shows the panel through — that IS the color you see
            swatch: pal.fieldBg || pal.contentBg
        },
        // "Flat filled": sunken surface, no border
        filled: {
            bg:
                pal.fieldBg ||
                (isDarkSurface(pal)
                    ? 'rgba(255, 255, 255, 0.08)'
                    : mix(pal.text, pal.contentBg, 0.06)),
            border: 'transparent',
            radius: null,
            shadow: 'none',
            shadowFocus: `0 0 0 3px ${rgba(focusColor, 0.55)}`,
            swatch:
                pal.fieldBg ||
                (isDarkSurface(pal)
                    ? mix('#ffffff', pal.contentBg, 0.08)
                    : mix(pal.text, pal.contentBg, 0.06))
        }
    };
    const shell = INPUT_SHELLS[p.fieldStyle] || INPUT_SHELLS.outline;

    const LABEL_FLOWS = {
        top: {
            flow: 'column',
            basis: 'none',
            mb: density.space[0],
            gap: '0px',
            align: 'stretch'
        },
        left: {
            flow: 'row',
            basis: '0 0 10rem',
            mb: '0px',
            gap: density.space[2],
            align: 'center'
        }
    };
    const labelFlow = LABEL_FLOWS[p.labelPosition] || LABEL_FLOWS.top;
    const LABEL_LOOKS = {
        default: {
            size: '0.8125rem',
            weight: '600',
            transform: 'none',
            tracking: 'normal',
            color: pal.text,
            font: null
        },
        monoCaps: {
            size: '0.6875rem',
            weight: '700',
            transform: 'uppercase',
            tracking: '0.06em',
            color: pal.text,
            font: FONT_STACKS.mono.body
        },
        mutedSm: {
            size: '0.75rem',
            weight: '500',
            transform: 'none',
            tracking: 'normal',
            color: pal.textWeak,
            font: null
        },
        // Uppercase tracked SANS (Neon Nights) — monoCaps' shape without the
        // mono font; muted so the inputs carry the contrast.
        caps: {
            size: '0.74rem',
            weight: '600',
            transform: 'uppercase',
            tracking: '0.1em',
            color: pal.textWeak,
            font: null
        }
    };
    const labelLook = LABEL_LOOKS[p.labelStyle] || LABEL_LOOKS.default;

    let fonts = FONT_STACKS[p.typography] || FONT_STACKS.system;
    if (p.customFont && p.customFont.family) {
        const stack = `'${p.customFont.family}', ${p.customFont.fallback || 'sans-serif'}`;
        fonts = { body: stack, display: stack };
    }
    const fit = PAGE_FIT[img.fit] || PAGE_FIT.cover;
    const mesh =
        fx.mesh === 'custom'
            ? customMesh(fx.meshColors, Number(fx.meshBlur) > 0)
            : MESHES[fx.mesh] || [];
    const focus = fs.focus || pal.accent;
    const submitBg = pal.submitBg || pal.accent;
    const sectionLook = SECTION_LOOKS[p.sectionStyle] || null;
    // Swatch basis: unset global style = each section's default preset (card).
    const sectionSwatchLook = sectionLook || SECTION_LOOKS.card;
    // A real translucency choice (<100) counts as a section customization —
    // it must never be an inert slider when the style is unset.
    const sectionBgOpacityOn =
        Number.isFinite(Number(pal.sectionBgOpacity)) &&
        Number(pal.sectionBgOpacity) < 100;

    // Display-title gradient ink (Neon Nights): palette.headerTitleGradient =
    // { angle, stops: ['#fff', '#d9ccff 60%', '#16e0c4'] } — stops are raw CSS
    // color-stop strings so mid-stops with positions stay expressible. Emits a
    // CONDITIONAL token pair: the gradient plus a transparent title fill (the
    // background-clip:text trick needs both or neither — a transparent title
    // with no gradient behind it is invisible text).
    const tg = pal.headerTitleGradient;
    const titleGradient =
        tg && Array.isArray(tg.stops) && tg.stops.length >= 2
            ? `linear-gradient(${
                  Number.isFinite(Number(tg.angle)) ? Number(tg.angle) : 135
              }deg, ${tg.stops.join(', ')})`
            : null;
    const scrimRaw = Number(img.scrim);
    const scrim = scrimRaw > 0 ? Math.min(scrimRaw, 100) / 100 : 0;
    // Image opacity (owner QA 2026-07-07): emulated by a pageBg-tinted veil
    // OVER the image — fading blends the image into the page fill. A slot in
    // the fixed stack, so it can never shift the image's fit tokens.
    const imgOpacityRaw = Number(img.opacity);
    const imgOpacity = Number.isFinite(imgOpacityRaw)
        ? Math.min(Math.max(imgOpacityRaw, 0), 100)
        : 100;
    const veilAlpha = img.url ? (100 - imgOpacity) / 100 : 0;
    const veilColor = veilAlpha > 0 ? rgba(pal.pageBg, veilAlpha) : null;

    const tokens = {
        // Page (finalPageFrame .page — fixed 4-layer stack, top to bottom:
        // scrim, image-opacity veil, the user's image, gradient)
        '--c-page-bg': withFillOpacity(pal.pageBg, pal.pageBgOpacity),
        '--c-page-bg-image': img.url ? `url("${img.url}")` : 'none',
        '--c-page-bg-size': fit.size,
        '--c-page-bg-position': img.position || 'center',
        '--c-page-bg-repeat': fit.repeat,
        '--c-page-scrim': scrim
            ? `linear-gradient(rgba(0, 0, 0, ${scrim}), rgba(0, 0, 0, ${scrim}))`
            : 'none',
        '--c-page-veil': veilColor
            ? `linear-gradient(${veilColor}, ${veilColor})`
            : 'none',
        '--c-page-bg-gradient': gradientLayer(
            pal.pageBgGradient,
            pal.pageBgOpacity
        ),
        // Conditional: unset = square (guest/full-bleed default; embedded CSS
        // falls back to 0)
        '--c-page-radius': RADIUS[p.pageRadius],

        // Effects (finalPageFrame .fx ONLY — fixed slots, one layer per token)
        '--c-fx-mesh-1': mesh[0]
            ? boostMesh(mesh[0], fx.meshIntensity)
            : 'none',
        '--c-fx-mesh-2': mesh[1]
            ? boostMesh(mesh[1], fx.meshIntensity)
            : 'none',
        '--c-fx-mesh-3': mesh[2]
            ? boostMesh(mesh[2], fx.meshIntensity)
            : 'none',
        '--c-fx-mesh-4': mesh[3]
            ? boostMesh(mesh[3], fx.meshIntensity)
            : 'none',
        // Presentation of the mesh layers, not the layers themselves: drift
        // animation is declared in pageFrame CSS and toggled via play-state;
        // 'screen' blend makes blobs luminous (Neon Nights, dark pages).
        '--c-mesh-anim': fx.meshAnimate ? 'running' : 'paused',
        '--c-mesh-blend': fx.meshBlend === 'screen' ? 'screen' : 'normal',
        // One prop, two tokens: real blur needs the layers oversized (bleed)
        // so the softened edges never show inside the clipped .fx viewport.
        '--c-mesh-filter':
            Number(fx.meshBlur) > 0
                ? `blur(${Math.min(Number(fx.meshBlur), 120)}px)`
                : 'none',
        '--c-mesh-bleed': Number(fx.meshBlur) > 0 ? '-15%' : '0',
        '--c-fx-texture':
            textureLayer(fx.texture, fx.textureIntensity) || 'none',

        // Content panel
        '--c-content-bg': withFillOpacity(pal.contentBg, pal.contentBgOpacity),
        '--c-content-bg-gradient': gradientLayer(
            pal.contentBgGradient,
            pal.contentBgOpacity
        ),
        '--c-content-border': BORDER_WIDTHS[p.border]
            ? `${BORDER_WIDTHS[p.border]} solid ${pal.borderColor || mix(pal.text, pal.contentBg, 0.16)}`
            : 'none',
        // The border COLOR alone — consumed by nothing in CSS; emitted so the
        // panel's Border color swatch shows the LIVE derived ink, never a
        // stale static hex (audit "swatch lies" fix 2026-07-11).
        '--c-border-color':
            pal.borderColor || mix(pal.text, pal.contentBg, 0.16),
        '--c-content-shadow': SHADOWS[fx.shadow] || SHADOWS.none,
        // true = legacy 14px; numbers AND numeric strings (the panel's depth
        // select writes strings) = custom depth, capped sane.
        '--c-glass-blur': glassPx(fx.glass),

        // Section — pad always; bg/border/shadow ONLY when the global Section
        // style or an explicit color/opacity is set (unset keeps the preset
        // carve-out; null values drop via the guard below). Explicit colors
        // win over the look; Fill opacity wraps whatever fill is in play
        // (every surface fill gets one — owner ruling 2026-07-08, sections
        // caught up 2026-07-12). Setting ONLY the opacity activates the
        // default card tint so the slider is never inert.
        '--c-section-pad': density.sectionPad,
        '--c-section-bg': withFillOpacity(
            pal.sectionBg ||
                (sectionLook
                    ? sectionLook.bg
                    : sectionBgOpacityOn
                      ? SECTION_LOOKS.card.bg
                      : null),
            pal.sectionBgOpacity
        ),
        '--c-section-border':
            p.sectionBorder === 'none'
                ? 'none'
                : pal.sectionBorderColor
                  ? `1px solid ${pal.sectionBorderColor}`
                  : sectionLook
                    ? sectionLook.border
                    : null,
        '--c-section-shadow': sectionLook ? sectionLook.shadow : null,
        // Panel-only swatch companions (guaranteed hex; the painted values
        // are color-mix() strings a picker can't parse). Unset style shows
        // the per-section default look (card). Borderless looks emit no
        // border swatch — an empty picker is the honest answer there.
        '--c-section-bg-swatch':
            pal.sectionBg ||
            mix(pal.text, pal.contentBg, sectionSwatchLook.bgPct),
        '--c-section-border-swatch':
            p.sectionBorder === 'none'
                ? null
                : pal.sectionBorderColor ||
                  (sectionSwatchLook.borderPct
                      ? mix(
                            pal.text,
                            pal.contentBg,
                            sectionSwatchLook.borderPct
                        )
                      : null),

        // Field — the input surface adapts to theme darkness: a dark surface
        // gets a lifted translucent input instead of a jarring white box;
        // light surfaces stay white. (Overridable via palette.fieldBg.)
        '--c-field-bg': outlineBg,
        // A COLOR, not a border shorthand — consumers write their own
        // `1px solid var(--c-field-border)` / `background:` / SLDS hooks.
        '--c-field-border': fieldBorderColor,

        // Input shell (fieldStyle: outline | underline | filled). The renderer's
        // SLDS hooks read these with --c-field-* / --c-radius fallbacks.
        '--c-input-bg': shell.bg,
        '--c-input-border-color': shell.border,
        // Shell first (underline pins 0), then the theme's fieldRadius KEY,
        // else absent → the CSS fallback chain lands on --c-radius.
        '--c-input-radius': shell.radius ?? RADIUS[p.fieldRadius],
        '--c-input-shadow': shell.shadow,
        '--c-input-shadow-focus': shell.shadowFocus,
        // Panel-only swatch companion (guaranteed hex) — no CSS consumes it.
        '--c-input-bg-swatch': shell.swatch,

        // Label defaults (labelPosition + labelStyle) — flow drives the .field
        // flex axis; look drives the label typography. Per-element classes win.
        '--c-label-flow': labelFlow.flow,
        '--c-label-basis': labelFlow.basis,
        '--c-label-mb': labelFlow.mb,
        '--c-label-gap': labelFlow.gap,
        '--c-label-align': labelFlow.align,
        '--c-label-size': labelLook.size,
        '--c-label-weight': labelLook.weight,
        '--c-label-transform': labelLook.transform,
        '--c-label-tracking': labelLook.tracking,
        // explicit palette.labelColor wins over the look's derived ink
        '--c-label-color': pal.labelColor || labelLook.color,
        '--c-label-font': labelLook.font,

        '--c-field-focus': focus,
        '--c-field-error': fs.error,
        '--c-field-required': fs.required,
        '--c-control-h': density.controlH,

        // Text & brand
        '--c-text': pal.text,
        '--c-text-weak': pal.textWeak,
        '--c-accent': pal.accent,
        '--c-on-accent': pal.onAccent || onColor(pal.accent),
        '--c-focus-ring': `0 0 0 3px ${rgba(focus, 0.55)}`,

        // Header
        '--c-header-bg': withFillOpacity(pal.headerBg, pal.headerBgOpacity),
        '--c-header-bg-gradient': gradientLayer(
            pal.headerBgGradient,
            pal.headerBgOpacity
        ),
        '--c-header-text': pal.headerText || pal.text,
        '--c-header-text-weak': pal.headerTextWeak || pal.textWeak,
        // Conditional pair (null → dropped by the guard below, CSS falls back
        // to --c-header-text): see titleGradient above.
        '--c-header-title-gradient': titleGradient,
        '--c-header-title-fill': titleGradient ? 'transparent' : null,

        // Actions
        '--c-submit-bg': submitBg,
        '--c-submit-text': pal.submitText || onColor(submitBg),
        // Gradient paints ABOVE the solid (same layering rule as the surface
        // fills); glow derives from the gradient's start (else the solid).
        '--c-submit-bg-gradient': gradientLayer(pal.submitBgGradient),
        '--c-submit-glow': pal.submitGlow
            ? `0 16px 40px -12px ${rgba(
                  (pal.submitBgGradient && pal.submitBgGradient.start) ||
                      submitBg,
                  0.6
              )}`
            : 'none',

        // Shape · space · type
        '--c-radius': RADIUS[p.radius] || RADIUS.soft,
        '--c-space-1': density.space[0],
        '--c-space-2': density.space[1],
        '--c-space-3': density.space[2],
        '--c-space-4': density.space[3],
        '--c-space-5': density.space[4],
        '--c-space-6': density.space[5],
        '--c-font-body': fonts.body,
        '--c-font-display': fonts.display
    };

    // Guard: an explicit `null`/empty palette value must never emit invalid
    // CSS (`--c-page-bg: null`). Dropping the token lets pageFrame's neutral win.
    for (const key of Object.keys(tokens)) {
        if (
            tokens[key] === null ||
            tokens[key] === undefined ||
            tokens[key] === ''
        ) {
            delete tokens[key];
        }
    }
    return tokens;
}

/** Token map → inline-style string for the ONE application point (finalPageFrame root). */
export function tokensToStyle(tokens) {
    return Object.entries(tokens || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
}
