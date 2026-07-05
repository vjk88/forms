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
const TEXTURES = {
    dots: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='2' cy='2' r='1.1' fill='%23111827' fill-opacity='0.05'/%3E%3C/svg%3E")`,
    grid: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cpath d='M28 0H0v28' fill='none' stroke='%23111827' stroke-opacity='0.05'/%3E%3C/svg%3E")`
};

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
    radius: 'soft',
    border: 'hairline',
    density: 'comfortable',
    effects: { shadow: 'soft', glass: false, texture: null, mesh: null },
    fieldStates: { error: '#b42318', required: '#b42318' },
    pageImage: { url: null, fit: 'cover', position: 'center', scrim: 0 }
};

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

/** Blend `weight` of hexA into hexB (0..1). Non-hex inputs fall back gracefully. */
function mix(hexA, hexB, weight) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a) {
        return hexB;
    }
    if (!b) {
        return hexA;
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
    const fonts = FONT_STACKS[p.typography] || FONT_STACKS.system;
    const fit = PAGE_FIT[img.fit] || PAGE_FIT.cover;
    const mesh = MESHES[fx.mesh] || [];
    const focus = fs.focus || pal.accent;
    const submitBg = pal.submitBg || pal.accent;
    const scrimRaw = Number(img.scrim);
    const scrim = scrimRaw > 0 ? Math.min(scrimRaw, 100) / 100 : 0;

    return {
        // Page (finalPageFrame .page — fixed 2-layer stack: scrim, then the user's image)
        '--c-page-bg': pal.pageBg,
        '--c-page-bg-image': img.url ? `url("${img.url}")` : 'none',
        '--c-page-bg-size': fit.size,
        '--c-page-bg-position': img.position || 'center',
        '--c-page-bg-repeat': fit.repeat,
        '--c-page-scrim': scrim
            ? `linear-gradient(rgba(0, 0, 0, ${scrim}), rgba(0, 0, 0, ${scrim}))`
            : 'none',

        // Effects (finalPageFrame .fx ONLY — fixed slots, one layer per token)
        '--c-fx-mesh-1': mesh[0] || 'none',
        '--c-fx-mesh-2': mesh[1] || 'none',
        '--c-fx-mesh-3': mesh[2] || 'none',
        '--c-fx-texture': TEXTURES[fx.texture] || 'none',

        // Content panel
        '--c-content-bg': pal.contentBg,
        '--c-content-border': BORDER_WIDTHS[p.border]
            ? `${BORDER_WIDTHS[p.border]} solid ${pal.borderColor || mix(pal.text, pal.contentBg, 0.16)}`
            : 'none',
        '--c-content-shadow': SHADOWS[fx.shadow] || SHADOWS.none,
        '--c-glass-blur': fx.glass ? '14px' : '0px',

        // Section (pad only — bg/border/shadow stay unset so the preset decides)
        '--c-section-pad': density.sectionPad,

        // Field
        '--c-field-bg': pal.fieldBg || '#ffffff',
        '--c-field-border': `1px solid ${pal.fieldBorderColor || mix(pal.text, pal.contentBg, 0.3)}`,
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
}

/** Token map → inline-style string for the ONE application point (finalPageFrame root). */
export function tokensToStyle(tokens) {
    return Object.entries(tokens || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
}
