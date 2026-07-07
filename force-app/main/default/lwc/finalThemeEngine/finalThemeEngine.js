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
 * - `--c-section-bg/border/shadow` are intentionally NEVER emitted here: unset means
 *   "the section preset decides" (§3.1 rule 5 carve-out).
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
        display: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    },
    editorial: {
        body: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
    },
    mono: {
        body: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        display: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
    },
    geometric: {
        body: "'Avenir Next', 'Century Gothic', Futura, 'Trebuchet MS', sans-serif",
        display: "'Avenir Next', 'Century Gothic', Futura, 'Trebuchet MS', sans-serif"
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
    brutal: '5px 5px 0 rgba(0, 0, 0, 0.9)'
};

const BORDER_WIDTHS = {
    hairline: '1px',
    bold: '2px'
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
    ]
};

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
    labelPosition: 'top', // top | left
    labelStyle: 'default', // default | monoCaps | mutedSm
    radius: 'soft',
    border: 'hairline',
    density: 'comfortable',
    effects: {
        shadow: 'soft',
        glass: false,
        texture: null,
        mesh: null,
        textureIntensity: 'subtle',
        meshIntensity: 'subtle'
    },
    fieldStates: { error: '#b42318', required: '#b42318' },
    pageImage: { url: null, fit: 'cover', position: 'center', scrim: 0, opacity: 100 }
};

// Gradient surfaces (owner QA 2026-07-07, FormBuilder pattern): a gradient is
// { type: 'linear'|'radial', angle: 0-360, start: hex, end: hex } stored at
// palette.pageBgGradient / contentBgGradient / headerBgGradient. It paints as
// a background-image layer ABOVE the surface's solid color (which stays the
// fallback + the ink-derivation base for borders/contrast).
function gradientLayer(g) {
    if (!g || !g.start || !g.end) {
        return 'none';
    }
    if (g.type === 'radial') {
        return `radial-gradient(circle at 50% 0%, ${g.start}, ${g.end})`;
    }
    const angle = Number.isFinite(Number(g.angle)) ? Number(g.angle) : 135;
    return `linear-gradient(${angle}deg, ${g.start}, ${g.end})`;
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
        pal.fieldBg || (isDarkSurface(pal) ? 'rgba(255, 255, 255, 0.06)' : '#ffffff');
    const focusColor = fs.focus || pal.accent;
    const INPUT_SHELLS = {
        outline: {
            bg: outlineBg,
            border: fieldBorderColor,
            radius: null, // falls through to --c-radius via the CSS fallback
            shadow: 'none',
            shadowFocus: `0 0 0 3px ${rgba(focusColor, 0.32)}`
        },
        // the "Boutique underline": no shell, just the baseline (legacy
        // formThemes §3.2 — transparent border + inset box-shadow line)
        underline: {
            bg: 'transparent',
            border: 'transparent',
            radius: '0px',
            shadow: `inset 0 -1.5px 0 0 ${fieldBorderColor}`,
            shadowFocus: `inset 0 -2px 0 0 ${focusColor}`
        },
        // "Flat filled": sunken surface, no border
        filled: {
            bg: isDarkSurface(pal)
                ? 'rgba(255, 255, 255, 0.08)'
                : mix(pal.text, pal.contentBg, 0.06),
            border: 'transparent',
            radius: null,
            shadow: 'none',
            shadowFocus: `0 0 0 3px ${rgba(focusColor, 0.32)}`
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
        }
    };
    const labelLook = LABEL_LOOKS[p.labelStyle] || LABEL_LOOKS.default;

    let fonts = FONT_STACKS[p.typography] || FONT_STACKS.system;
    if (p.customFont && p.customFont.family) {
        const stack = `'${p.customFont.family}', ${p.customFont.fallback || 'sans-serif'}`;
        fonts = { body: stack, display: stack };
    }
    const fit = PAGE_FIT[img.fit] || PAGE_FIT.cover;
    const mesh = MESHES[fx.mesh] || [];
    const focus = fs.focus || pal.accent;
    const submitBg = pal.submitBg || pal.accent;
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
        '--c-page-bg': pal.pageBg,
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
        '--c-page-bg-gradient': gradientLayer(pal.pageBgGradient),

        // Effects (finalPageFrame .fx ONLY — fixed slots, one layer per token)
        '--c-fx-mesh-1': mesh[0] ? boostMesh(mesh[0], fx.meshIntensity) : 'none',
        '--c-fx-mesh-2': mesh[1] ? boostMesh(mesh[1], fx.meshIntensity) : 'none',
        '--c-fx-mesh-3': mesh[2] ? boostMesh(mesh[2], fx.meshIntensity) : 'none',
        '--c-fx-texture': textureLayer(fx.texture, fx.textureIntensity) || 'none',

        // Content panel
        '--c-content-bg': pal.contentBg,
        '--c-content-bg-gradient': gradientLayer(pal.contentBgGradient),
        '--c-content-border': BORDER_WIDTHS[p.border]
            ? `${BORDER_WIDTHS[p.border]} solid ${pal.borderColor || mix(pal.text, pal.contentBg, 0.16)}`
            : 'none',
        '--c-content-shadow': SHADOWS[fx.shadow] || SHADOWS.none,
        '--c-glass-blur': fx.glass ? '14px' : '0px',

        // Section (pad only — bg/border/shadow stay unset so the preset decides)
        '--c-section-pad': density.sectionPad,

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
        '--c-input-radius': shell.radius,
        '--c-input-shadow': shell.shadow,
        '--c-input-shadow-focus': shell.shadowFocus,

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
        '--c-label-color': labelLook.color,
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
        '--c-focus-ring': `0 0 0 3px ${rgba(focus, 0.32)}`,

        // Header
        '--c-header-bg': pal.headerBg,
        '--c-header-bg-gradient': gradientLayer(pal.headerBgGradient),
        '--c-header-text': pal.headerText || pal.text,
        '--c-header-text-weak': pal.headerTextWeak || pal.textWeak,

        // Actions
        '--c-submit-bg': submitBg,
        '--c-submit-text': pal.submitText || onColor(submitBg),

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
        if (tokens[key] === null || tokens[key] === undefined || tokens[key] === '') {
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
