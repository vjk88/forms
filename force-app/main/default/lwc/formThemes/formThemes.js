/**
 * Shared form template/skin model — the single source of truth imported by
 * propertyPanel, formDesigner, formPlayer and templateGallery.
 *
 * A TEMPLATE = a LAYOUT (structural shell) + a default SKIN (colours, fonts,
 * background, corners, glass). Users pick a layout, then freely edit the skin.
 * The same form BODY (sections/fields/validation) renders inside every shell.
 */

// ----- Layout archetypes (the structural choice) -----
export const FORM_LAYOUTS = [
    { value: 'classic', label: 'Classic' },
    { value: 'split', label: 'Split' },
    { value: 'immersive', label: 'Immersive' },
    { value: 'stepped', label: 'Stepped' },
    { value: 'compact', label: 'Compact' }
];

// Each template bundles a layout + a tasteful default skin.
export const LAYOUT_TEMPLATES = {
    classic: {
        name: 'classic', layout: 'classic', label: 'Classic', font: 'enterprise',
        accent: '#0176d3', surface: '#ffffff', pageBg: '#f4f6f9',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card', glass: false
    },
    split: {
        name: 'split', layout: 'split', label: 'Split', font: 'luxe',
        accent: '#c9a24b', surface: '#ffffff',
        pageBg: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'plain', glass: false
    },
    immersive: {
        name: 'immersive', layout: 'immersive', label: 'Immersive', font: 'geometric',
        accent: '#6d4bff', surface: 'rgba(255, 255, 255, 0.62)',
        pageBg: 'linear-gradient(135deg, #ff8fb1 0%, #7a5cff 52%, #16d2c4 100%)',
        radius: 'round', cardShadow: 'strong', sectionDefault: 'plain',
        glass: true
    },
    stepped: {
        name: 'stepped', layout: 'stepped', label: 'Stepped', font: 'technical',
        accent: '#e6571f', surface: '#f7f6f2', pageBg: '#eceae4',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'boxed', glass: false
    },
    compact: {
        name: 'compact', layout: 'compact', label: 'Compact', font: 'enterprise',
        accent: '#4f46e5', surface: '#ffffff', pageBg: '#f4f5f7',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'plain', glass: false
    },

    // ----- Archetype default skins (T6, boards §5 + §10 amendments). -----
    // classic above doubles as the classic archetype's default. Legacy v1
    // entries stay untouched (regression-tested byte-identical).
    splitHero: {
        name: 'splitHero', label: 'Split Hero', font: 'luxe',
        accent: '#c9a24b', surface: '#ffffff',
        pageBg: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'plain', glass: false,
        inputStyle: 'underline', panelDecor: 'frame'
    },
    wizardStepper: {
        name: 'wizardStepper', label: 'Wizard', font: 'technical',
        accent: '#e6571f', surface: '#f7f6f2', pageBg: '#eceae4',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'boxed', glass: false,
        texture: 'grid', labelStyle: 'mono-caps'
    },
    sideNav: {
        name: 'sideNav', label: 'Side Nav', font: 'enterprise',
        accent: '#2563eb', surface: '#ffffff', pageBg: '#f6f7fa',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'subtle', glass: false
    },
    conversational: {
        name: 'conversational', label: 'Conversational', font: 'editorial',
        accent: '#e8590c', surface: 'transparent', pageBg: '#faf7f2',
        radius: 'round', cardShadow: 'none', sectionDefault: 'plain', glass: false,
        inputStyle: 'underline', texture: 'grain'
    },
    immersiveGlass: {
        name: 'immersiveGlass', label: 'Immersive Dark', font: 'geometric',
        accent: '#16e0c4', surface: 'rgba(255,255,255,0.08)',
        pageBg: '#08060f', bgEffect: 'mesh',
        meshHues: ['#7a5cff', '#ff2e93', '#16e0c4', '#ffb13d'],
        radius: 'round', cardShadow: 'strong', sectionDefault: 'plain',
        glass: true, dark: true, texture: 'grain'
    },
    mosaicGrid: {
        name: 'mosaicGrid', label: 'Mosaic', font: 'system',
        accent: '#4f46e5', surface: '#ffffff', pageBg: '#eef0f6',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card', glass: false
    },
    document: {
        name: 'document', label: 'Document', font: 'editorial',
        accent: '#1f2937', surface: '#fffdf8', pageBg: '#e9e7e1',
        radius: 'sharp', cardShadow: 'medium', sectionDefault: 'plain',
        glass: false, labelPosition: 'left'
    },
    accordion: {
        name: 'accordion', label: 'Accordion', font: 'enterprise',
        accent: '#047857', surface: '#ffffff', pageBg: '#f2f6f4',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'subtle', glass: false
    },
    tabbedCard: {
        name: 'tabbedCard', label: 'Tabbed', font: 'system',
        accent: '#0d9488', surface: '#ffffff', pageBg: '#f0f4f4',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'plain', glass: false
    },
    console: {
        // Board wants the 'plex' webfont pairing — tabled with T19; the
        // 'enterprise' stack already leads with IBM Plex Sans as interim.
        name: 'console', label: 'Console', font: 'enterprise',
        accent: '#4f46e5', surface: '#ffffff', pageBg: '#f4f5f7',
        radius: 'rounded', cardShadow: 'none', sectionDefault: 'card',
        glass: false, labelPosition: 'left', labelStyle: 'muted-sm'
    },
    timeline: {
        name: 'timeline', label: 'Timeline', font: 'geometric',
        accent: '#7c3aed', surface: '#ffffff', pageBg: '#f7f5fb',
        radius: 'round', cardShadow: 'soft', sectionDefault: 'subtle', glass: false
    },
    kiosk: {
        name: 'kiosk', label: 'Kiosk', font: 'geometric',
        accent: '#d4380d', surface: '#ffffff', pageBg: '#111827',
        radius: 'pill', cardShadow: 'strong', sectionDefault: 'plain',
        glass: false, controlScale: 1.5
    },
    // Faithful SLDS skin — default for the sfRecordPage archetype (and the
    // honest "Salesforce" option in the skin picker). Additive: no existing
    // skin/form is affected.
    sfRecordPage: {
        name: 'sfRecordPage', label: 'Salesforce', font: 'salesforce',
        accent: '#0176d3', surface: '#ffffff', pageBg: '#f3f3f3',
        radius: 'slds', cardShadow: 'none', sectionDefault: 'card',
        borderColor: '#dddbda', glass: false
    }
};

// Back-compat: older code referenced PRESET_THEMES.default for fallback values.
export const PRESET_THEMES = { default: LAYOUT_TEMPLATES.classic };

/* ============================================================================
 * APPEARANCE MODEL v2 — Theme → Skin → Accent (THEME_PROPERTIES_SPEC §1.2)
 * ----------------------------------------------------------------------------
 * THREE tiers the user mixes & matches with any LAYOUT:
 *   THEME = the design *language* (structural keys: font/radius/shadow/section/
 *           input/label/texture/scale — what stays constant across its skins).
 *   SKIN  = a curated *mood* variant within a theme (light/dark + surface/color),
 *           NOT just a recolor. Each theme ships 2–4.
 *   ACCENT = the single brand color knob, layered on top (§3.1 picker).
 *
 * Resolution (themeVars §2.1): THEMES[id].structure  +  SKINS[id][skin]  +
 *   { accent, palette, overrides }  →  one merged skin object  →  the SAME
 *   token producer the legacy path uses (buildTokenString). So the new model
 *   adds zero new token plumbing and the legacy LAYOUT_TEMPLATES skins above
 *   keep rendering byte-identical (regression-tested).
 *
 * The 7 themes are seeded from the proven legacy skins per the spec table.
 * ==========================================================================*/

export const THEMES = {
    lightning: {
        id: 'lightning', label: 'Lightning',
        identity: 'SLDS-faithful, native Salesforce',
        defaultSkin: 'light',
        // structural design-language keys (constant across this theme's skins)
        structure: {
            font: 'salesforce', radius: 'slds', cardShadow: 'none', sectionDefault: 'card'
        }
    },
    cloud: {
        id: 'cloud', label: 'Cloud',
        identity: 'Friendly enterprise blue, rounded, soft shadow',
        defaultSkin: 'light',
        structure: {
            font: 'enterprise', radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card'
        }
    },
    midnight: {
        id: 'midnight', label: 'Midnight',
        identity: 'Dark, glass, mesh gradient',
        defaultSkin: 'noir',
        structure: {
            font: 'geometric', radius: 'round', cardShadow: 'strong', sectionDefault: 'plain',
            glass: true, dark: true, texture: 'grain', bgEffect: 'mesh'
        }
    },
    luxe: {
        id: 'luxe', label: 'Luxe',
        identity: 'Serif display, sharp, gradient',
        defaultSkin: 'emerald',
        structure: {
            font: 'luxe', radius: 'sharp', cardShadow: 'none', sectionDefault: 'plain',
            inputStyle: 'underline', panelDecor: 'frame'
        }
    },
    editorial: {
        id: 'editorial', label: 'Editorial',
        identity: 'Warm paper, serif, refined, left labels',
        defaultSkin: 'paper',
        structure: {
            font: 'editorial', radius: 'sharp', cardShadow: 'medium', sectionDefault: 'plain',
            labelPosition: 'left', inputStyle: 'underline', texture: 'grain'
        }
    },
    blueprint: {
        id: 'blueprint', label: 'Blueprint',
        identity: 'Technical — mono-caps labels, grid texture, boxed',
        defaultSkin: 'blueprint',
        structure: {
            font: 'technical', radius: 'sharp', cardShadow: 'none', sectionDefault: 'boxed',
            texture: 'grid', labelStyle: 'mono-caps'
        }
    },
    kiosk: {
        id: 'kiosk', label: 'Kiosk',
        identity: 'Oversized touch controls, bold',
        defaultSkin: 'daylight',
        structure: {
            font: 'geometric', radius: 'pill', cardShadow: 'strong', sectionDefault: 'plain',
            controlScale: 1.5
        }
    }
};

// SKINS[themeId][skinId] = the mood/surface/color variant (layered on the
// theme's structure). Each carries a label + the color/surface keys only.
export const SKINS = {
    lightning: {
        light: { label: 'Light', accent: '#0176d3', surface: '#ffffff', pageBg: '#f3f3f3', borderColor: '#dddbda' },
        dark: { label: 'Dark', accent: '#1b96ff', surface: '#16213a', pageBg: '#0b0e1a', dark: true }
    },
    cloud: {
        light: { label: 'Light', accent: '#0176d3', surface: '#ffffff', pageBg: '#f4f6f9' },
        dark: { label: 'Dark', accent: '#5aa9ff', surface: '#1e2230', pageBg: '#11131c', dark: true },
        soft: { label: 'Soft', accent: '#4f46e5', surface: '#ffffff', pageBg: '#eef0f6' }
    },
    midnight: {
        noir: { label: 'Noir', accent: '#16e0c4', surface: 'rgba(255,255,255,0.08)', pageBg: '#08060f', meshHues: ['#7a5cff', '#ff2e93', '#16e0c4', '#ffb13d'] },
        aurora: { label: 'Aurora', accent: '#5ad1ff', surface: 'rgba(255,255,255,0.08)', pageBg: '#04121a', meshHues: ['#16d2c4', '#5ad1ff', '#3a7bff', '#9b6bff'] },
        nebula: { label: 'Nebula', accent: '#ff7ad9', surface: 'rgba(255,255,255,0.08)', pageBg: '#100617', meshHues: ['#ff2e93', '#9b6bff', '#5a5cff', '#ffb13d'] }
    },
    luxe: {
        emerald: { label: 'Emerald', accent: '#c9a24b', surface: '#ffffff', pageBg: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)' },
        onyx: { label: 'Onyx', accent: '#c9a24b', surface: 'rgba(255,255,255,0.06)', pageBg: 'linear-gradient(160deg, #1c1c22 0%, #0a0a0c 100%)', dark: true },
        champagne: { label: 'Champagne', accent: '#b08d57', surface: '#ffffff', pageBg: 'linear-gradient(160deg, #f7efe2 0%, #efe2cf 100%)' }
    },
    editorial: {
        paper: { label: 'Paper', accent: '#1f2937', surface: '#fffdf8', pageBg: '#e9e7e1' },
        ink: { label: 'Ink', accent: '#e8c07d', surface: '#1a1814', pageBg: '#0e0d0b', dark: true }
    },
    blueprint: {
        blueprint: { label: 'Blueprint', accent: '#e6571f', surface: '#f7f6f2', pageBg: '#eceae4' },
        graphite: { label: 'Graphite', accent: '#ff7a45', surface: '#1b1d22', pageBg: '#0f1115', dark: true }
    },
    kiosk: {
        daylight: { label: 'Daylight', accent: '#d4380d', surface: '#ffffff', pageBg: '#f5f6f8' },
        spotlight: { label: 'Spotlight', accent: '#ff5a1f', surface: '#15171c', pageBg: '#0a0b0e', dark: true }
    }
};

// Dropdown helpers for the creation flow / editor (§3.1 Theme & Skin selects).
export const THEME_OPTIONS = Object.keys(THEMES).map((id) => ({
    label: THEMES[id].label, value: id
}));

export function skinsForTheme(themeId) {
    const skins = SKINS[themeId] || {};
    return Object.keys(skins).map((id) => ({ label: skins[id].label || id, value: id }));
}

/**
 * Resolve a (themeId, skinId, {accent, palette, overrides}) selection into a
 * single flat skin object — the merge funnels through the SAME token producer
 * the legacy path uses. Unknown ids fall back to Cloud / the theme default.
 */
export function resolveTheme(themeId, skinId, opts) {
    const o = opts || {};
    const theme = THEMES[themeId] || THEMES.cloud;
    const skinSet = SKINS[theme.id] || {};
    const resolvedSkinId = skinSet[skinId] ? skinId : theme.defaultSkin;
    const skin = skinSet[resolvedSkinId] || {};
    const merged = {
        ...theme.structure,
        ...skin,
        name: `${theme.id}:${resolvedSkinId}`,
        theme: theme.id,
        skin: resolvedSkinId
    };
    delete merged.label; // skin label is dropdown chrome, not a token input
    // Four-lane palette (T3.2) overrides colors before the single-accent knob.
    if (o.palette) applyPalette(merged, o.palette);
    if (o.accent) merged.accent = o.accent;
    if (o.overrides) Object.assign(merged, o.overrides);
    return merged;
}

/* ============================================================================
 * T3.2 — Four-lane color roles + OKLCH ramps (THEME_PROPERTIES_SPEC §12.1)
 * ----------------------------------------------------------------------------
 * A custom skin (brand kit) supplies 4 base colors — Primary / Secondary /
 * Tertiary / Neutral. Each auto-expands into a perceptually-even OKLCH ramp;
 * the ramp steps feed the component tokens. Backgrounds remain a SEPARATE axis
 * (§3.2) — Neutral only SEEDS the defaults, which any surface override can win.
 *
 * Conversion is Björn Ottosson's OKLab/OKLCH ↔ linear-sRGB. Self-contained
 * (no deps), deterministic, and unit-tested so contrast math is trustworthy.
 * ==========================================================================*/

// 10-step ramp lightness targets in OKLCH L (0..1); index 5 ≈ the base "500".
const RAMP_L = [0.97, 0.93, 0.87, 0.79, 0.70, 0.60, 0.50, 0.42, 0.33, 0.24];
// Roles map to fixed ramp indices so a kit yields a consistent token set.
const ROLE_STEP = { base: 5, dark: 7, weak: 3, faint: 1, soft: 0, strong: 8 };

function clamp01(n) {
    return n < 0 ? 0 : n > 1 ? 1 : n;
}
function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
    const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbToOklch([r255, g255, b255]) {
    const r = srgbToLinear(r255 / 255);
    const g = srgbToLinear(g255 / 255);
    const b = srgbToLinear(b255 / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [L, Math.sqrt(a * a + bb * bb), Math.atan2(bb, a)];
}
function oklchToRgb([L, C, H]) {
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl)].map(clamp01);
}

/** A 10-step hex ramp from a base color; keeps hue, walks OKLCH lightness. */
export function colorRamp(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return RAMP_L.map(() => hex || '#888888');
    const [, C, H] = rgbToOklch(rgb);
    return RAMP_L.map((L, i) => {
        // ease chroma down at the extremes so light/dark steps don't clip/muddy
        const t = Math.min(i, RAMP_L.length - 1 - i) / ((RAMP_L.length - 1) / 2);
        const c = C * (0.55 + 0.45 * t);
        return rgbToHex(oklchToRgb([L, c, H]));
    });
}

function relLuminance([r255, g255, b255]) {
    const r = srgbToLinear(r255 / 255);
    const g = srgbToLinear(g255 / 255);
    const b = srgbToLinear(b255 / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(hexA, hexB) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return 1;
    const la = relLuminance(a);
    const lb = relLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Validate a four-lane brand kit against the WCAG floors that matter for forms.
 * Returns { ok, warnings:[{pair, ratio, need}] } — warn-and-suggest, never
 * silently ship unreadable (spec §9.3).
 */
export function validatePalette(palette) {
    const p = palette || {};
    const neutral = colorRamp(p.neutral || '#71717a');
    const cardBg = neutral[0]; // lightest neutral seeds the surface
    const text = neutral[ROLE_STEP.strong];
    const primary = p.primary || '#4f46e5';
    const checks = [
        { pair: 'body text / surface', a: text, b: cardBg, need: 4.5 },
        // links/active states paint Primary AS text on the surface — a light
        // Primary on a light surface is the classic unreadable-link failure.
        { pair: 'primary link / surface', a: primary, b: cardBg, need: 4.5 },
        { pair: 'primary button text', a: onAccent(primary), b: primary, need: 4.5 }
    ];
    const warnings = checks
        .map((c) => ({ pair: c.pair, ratio: +contrastRatio(c.a, c.b).toFixed(2), need: c.need }))
        .filter((c) => c.ratio < c.need);
    return { ok: warnings.length === 0, warnings };
}

/**
 * Apply a four-lane palette onto the merged skin (runs inside resolveTheme,
 * before the single-accent knob + overrides). Primary → accent/buttons,
 * Secondary/Tertiary → their own tokens, Neutral → text/border + DEFAULT bgs.
 * Emits extra `--c-*` declarations via merged._roleTokens (buildTokenString
 * appends them — no second token producer).
 */
function applyPalette(merged, palette) {
    const p = palette || {};
    const extra = [];
    if (p.primary) {
        const r = colorRamp(p.primary);
        merged.accent = p.primary;
        merged.submitColor = p.primary;
        merged.backColor = p.primary;
        extra.push(`--c-brand-dark: ${r[ROLE_STEP.dark]}`);
    }
    if (p.secondary) {
        const r = colorRamp(p.secondary);
        extra.push(
            `--c-secondary: ${p.secondary}`,
            `--c-secondary-weak: ${r[ROLE_STEP.weak]}`,
            `--c-secondary-faint: ${r[ROLE_STEP.faint]}`
        );
    }
    if (p.tertiary) {
        const r = colorRamp(p.tertiary);
        extra.push(
            `--c-tertiary: ${p.tertiary}`,
            `--c-tertiary-weak: ${r[ROLE_STEP.weak]}`,
            `--c-tertiary-faint: ${r[ROLE_STEP.faint]}`
        );
    }
    if (p.neutral) {
        const r = colorRamp(p.neutral);
        // Neutral seeds the DEFAULT backgrounds (any §3.2 override still wins,
        // since overrides apply after applyPalette in resolveTheme).
        merged.surface = r[0];
        merged.pageBg = r[1];
        merged.borderColor = r[3];
        extra.push(
            `--c-text: ${r[ROLE_STEP.strong]}`,
            `--c-text-weak: ${r[6]}`,
            `--c-text-meta: ${r[ROLE_STEP.base]}`,
            `--c-label: ${r[7]}`,
            `--c-surface-sunken: ${r[1]}`,
            `--c-surface-alt: ${r[2]}`
        );
    }
    if (p.fonts) {
        if (p.fonts.headline) merged.headlineFont = p.fonts.headline;
        if (p.fonts.body) merged.font = p.fonts.body;
        if (p.fonts.label) merged.labelFont = p.fonts.label;
    }
    if (extra.length) {
        merged._roleTokens = (merged._roleTokens || []).concat(extra);
    }
}

// ----- Curated font pairings (system-safe stacks; custom webfonts via static
// resources can be layered on later without changing this contract) -----
export const FONT_PAIRINGS = {
    salesforce: {
        label: 'Salesforce Sans (SLDS)',
        display: "'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        body: "'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    system: {
        label: 'System UI (Native)',
        display: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    enterprise: {
        label: 'Enterprise',
        display: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
        body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    },
    editorial: {
        label: 'Editorial',
        display: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
        body: "'Iowan Old Style', Georgia, 'Times New Roman', serif"
    },
    luxe: {
        label: 'Luxe',
        display: "'Hoefler Text', 'Big Caslon', 'Playfair Display', Garamond, serif",
        body: "'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    },
    technical: {
        label: 'Technical',
        display: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
        body: "'Helvetica Neue', Arial, system-ui, sans-serif"
    },
    geometric: {
        label: 'Geometric',
        display: "'Avenir Next', 'Century Gothic', 'Futura', system-ui, sans-serif",
        body: "'Avenir Next', system-ui, 'Segoe UI', sans-serif"
    }
};

export const FONT_OPTIONS = Object.keys(FONT_PAIRINGS).map((k) => ({
    label: FONT_PAIRINGS[k].label,
    value: k
}));

const RADIUS_MAP = { sharp: '2px', slds: '4px', rounded: '8px', round: '14px', pill: '9999px' };
const SHADOW_MAP = {
    none: 'none',
    soft: '0 2px 8px rgba(0, 0, 0, 0.06)',
    medium: '0 4px 14px rgba(0, 0, 0, 0.10)',
    strong: '0 24px 60px -20px rgba(0, 0, 0, 0.55)'
};

export function radiusToken(name) {
    return RADIUS_MAP[name] || RADIUS_MAP.rounded;
}

export const RADIUS_OPTIONS = [
    { label: 'Sharp', value: 'sharp' },
    { label: 'Rounded', value: 'rounded' },
    { label: 'Round', value: 'round' },
    { label: 'Pill', value: 'pill' }
];

// Backwards-compat: older forms store a colour-only `theme`; these helpers all
// tolerate missing layout/font/glass keys and fall back to Classic defaults.
export function radiusTokenCard(theme) {
    const t = theme || {};
    const r = radiusToken(t.radius);
    return t.container === 'fullbleed' ? '0px' : t.radius === 'pill' ? '18px' : r;
}

export function fontVars(font) {
    const f = FONT_PAIRINGS[font] || FONT_PAIRINGS.enterprise;
    return `--c-font-body: ${f.body}; --c-font-display: ${f.display}`;
}

// ----- Theme Spec v2 (redesign — DESIGN_TOKENS.md §3) -----
// New skin keys: inputStyle (outline|underline|filled), inputDisplayFont,
// labelStyle (default|mono-caps|muted-sm), labelPosition (top|left),
// controlScale (1–1.5), texture (none|grain|grid), bgEffect ('mesh'),
// meshHues[], titleStyle ('gradient'), panelDecor ('frame').
// All default to v1-equivalent values: a v1 skin's existing token VALUES are
// unchanged (regression test in __tests__), v2 tokens are appended.

const SPACE_SCALES = {
    comfortable: ['4px', '8px', '12px', '16px', '24px'],
    compact: ['2px', '6px', '8px', '12px', '16px']
};
// Fixed app-shipped assets — AI/skins select by enum, never inject URLs
// (DESIGN_TOKENS §4 guardrail).
const GRAIN_SVG =
    "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.05'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const TEXTURES = {
    none: 'none',
    grain: GRAIN_SVG,
    grid:
        'repeating-linear-gradient(0deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 24px), ' +
        'repeating-linear-gradient(90deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 24px)'
};
const MESH_DEFAULT = ['#ff8fb1', '#7a5cff', '#16d2c4', '#ffd166'];
const INPUT_STYLES = ['outline', 'underline', 'filled'];
const LABEL_STYLES = ['default', 'mono-caps', 'muted-sm'];
const MONO_LABEL_STACK = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, monospace";

function clampScale(v) {
    const n = Number(v);
    if (!n || Number.isNaN(n)) return 1;
    return Math.min(Math.max(n, 1), 1.5);
}

// Readable text color for a given background. Solid light hex → dark text;
// dark hex / gradients / images → white. Used for the header surface (e.g.
// the Split Hero brand panel) so titles stay legible on any header background.
function readableOn(bg) {
    const s = (bg || '').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
        const n = parseInt(m[1], 16);
        const luma =
            0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
        return luma > 150 ? '#0b1320' : '#ffffff';
    }
    if (!s || s === 'transparent' || s === 'none') return '#0b1320';
    return '#ffffff'; // gradients / images → assume dark, use white text
}

// Text color readable ON the accent (e.g. submit buttons). Light accents
// (immersiveGlass teal) need dark text; non-hex accents fall back to white.
function onAccent(accent) {
    const m = /^#([0-9a-f]{6})$/i.exec((accent || '').trim());
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const luma =
        0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return luma > 150 ? '#0b1320' : '#ffffff';
}

/** v2 token parts. `density` comes from the LAYOUT spec, not the skin. */
function themeSpecV2Parts(theme, density, accent) {
    const d = density === 'compact' ? 'compact' : 'comfortable';
    const sp = SPACE_SCALES[d];
    const scale = clampScale(theme.controlScale);
    const baseH = d === 'compact' ? 32 : 40;
    const inputStyle = INPUT_STYLES.includes(theme.inputStyle) ? theme.inputStyle : 'outline';
    const labelStyle = LABEL_STYLES.includes(theme.labelStyle) ? theme.labelStyle : 'default';

    const parts = [
        // 3.1 density & scale
        `--c-space-1: ${sp[0]}`, `--c-space-2: ${sp[1]}`, `--c-space-3: ${sp[2]}`,
        `--c-space-4: ${sp[3]}`, `--c-space-5: ${sp[4]}`,
        `--c-control-h: ${Math.round(baseH * scale)}px`,
        `--c-control-font: ${scale}rem`,
        `--c-tap-min: ${Math.round(44 * scale)}px`,
        // 3.4 engine structural
        '--c-grid-gap: var(--c-space-4)',
        '--c-zone-pad: var(--c-space-3)',
        '--c-rail-w: 240px',
        '--c-summary-w: 280px',
        '--c-stickybar-h: 64px',
        // 3.5 motion & focus (constants — AI has no motion authority)
        '--c-ease: cubic-bezier(.2,.8,.2,1)',
        '--c-dur-1: 150ms', '--c-dur-2: 250ms', '--c-dur-3: 600ms',
        `--c-focus-ring: 0 0 0 3px color-mix(in srgb, ${accent} 25%, transparent)`,
        `--c-on-accent: ${onAccent(accent)}`
    ];

    // 3.2 inputs
    if (inputStyle === 'underline') {
        parts.push(
            '--c-input-border: 0 solid transparent',
            '--c-input-border-bottom: 1.5px solid var(--c-border, #d8dde6)',
            '--c-input-bg: transparent',
            '--c-input-radius: 0'
        );
    } else if (inputStyle === 'filled') {
        parts.push(
            '--c-input-border: 0 solid transparent',
            '--c-input-border-bottom: 0 solid transparent',
            '--c-input-bg: var(--c-surface-sunken, #f3f3f6)',
            '--c-input-radius: var(--c-radius)'
        );
    } else {
        parts.push(
            '--c-input-border: 1.5px solid var(--c-border, #d8dde6)',
            '--c-input-border-bottom: 1.5px solid var(--c-border, #d8dde6)',
            '--c-input-bg: var(--c-card-bg)',
            '--c-input-radius: var(--c-radius)'
        );
    }
    parts.push(`--c-input-font: var(${theme.inputDisplayFont ? '--c-font-display' : '--c-font-body'})`);

    // 3.2 labels — labelFace slot (NOT `label`, which is the pairing's display
    // name; T19 must use `labelFace` for the mono micro-label face).
    const pairing = FONT_PAIRINGS[theme.font] || {};
    if (labelStyle === 'mono-caps') {
        parts.push(
            '--c-label-transform: uppercase',
            `--c-label-font: ${pairing.labelFace || MONO_LABEL_STACK}`,
            '--c-label-size: 0.6875rem',
            '--c-label-tracking: 0.08em'
        );
    } else if (labelStyle === 'muted-sm') {
        parts.push(
            '--c-label-transform: none',
            `--c-label-font: ${pairing.labelFace || 'var(--c-font-body)'}`,
            '--c-label-size: 0.75rem',
            '--c-label-tracking: normal'
        );
    } else {
        parts.push(
            '--c-label-transform: none',
            '--c-label-font: var(--c-font-body)',
            '--c-label-size: 0.8125rem',
            '--c-label-tracking: normal'
        );
    }
    if (theme.labelPosition === 'left') {
        parts.push('--c-label-col: 160px');
    }

    // 3.3 surfaces & effects
    parts.push(`--c-texture: ${TEXTURES[theme.texture] || 'none'}`);
    // Title fill is always a solid color — gradient text (background-clip:text)
    // is an absolute no. Emphasis comes from weight/size in the shells.
    parts.push('--c-title-fill: var(--c-text, #16325c)');
    if (theme.panelDecor === 'frame') {
        parts.push(`--c-panel-decor-color: color-mix(in srgb, ${accent} 28%, transparent)`);
    }
    if (theme.bgEffect === 'mesh') {
        const hues = Array.isArray(theme.meshHues) ? theme.meshHues : [];
        for (let i = 0; i < 4; i++) {
            parts.push(`--c-mesh-${i + 1}: ${hues[i] || MESH_DEFAULT[i]}`);
        }
    }
    if (theme.glass) {
        parts.push('--c-glass-blur: 26px');
    }
    if (theme.dark) {
        parts.push('--c-bg-scrim: rgba(0,0,0,0.18)');
    }
    return parts;
}

/**
 * CSS custom-property string for a theme/skin. Set on the form root; the card,
 * sections, buttons, fonts and page background all inherit from it.
 *
 * TWO call signatures (dispatch by the first argument's type):
 *   - NEW (v2):  themeVars(themeId, skinId, { accent, palette, overrides }, density)
 *                resolves THEMES[id] → SKINS[id][skin] → opts (§2.1 chain).
 *   - LEGACY:    themeVars(skinObject, density)
 *                a flat skin object (LAYOUT_TEMPLATES entry or a stored theme).
 *
 * Both funnel through the same token producer, so existing forms render
 * byte-identical and the v2 model adds no second producer (DESIGN_TOKENS §1).
 *
 * @returns CSS custom-property declaration string (`--c-…: …; …`).
 */
export function themeVars(a, b, c, d) {
    if (typeof a === 'string') {
        // v2 path: (themeId, skinId, opts, density)
        return buildTokenString(resolveTheme(a, b, c), d);
    }
    // legacy path: (skinObject, density)
    return buildTokenString(a, b);
}

/**
 * The token producer — turns a flat skin object into the `--c-*` string.
 * @param t       skin object (v1 keys + Theme Spec v2 keys, all optional)
 * @param density 'comfortable' | 'compact' — from the LAYOUT spec (engine
 *                passes model density); omitted = comfortable (v1 behavior)
 */
function buildTokenString(t, density) {
    const theme = t || {};
    const accent = theme.accent || LAYOUT_TEMPLATES.classic.accent;
    const radius = radiusToken(theme.radius);
    const container = theme.container || 'boxed';
    const flat = theme.glass || container === 'flat' || container === 'fullbleed';
    const cardShadow = SHADOW_MAP[theme.cardShadow] || (flat ? 'none' : SHADOW_MAP.soft);
    const cardBorder = theme.glass
        ? '1px solid rgba(255,255,255,0.18)'
        : flat
        ? '0 solid transparent'
        : '1px solid var(--c-border-light)';

    const paddingMap = { none: '0.5rem', small: '0.75rem', medium: '1rem', large: '1.5rem' };
    const paddingVal = paddingMap[theme.sectionPadding] || paddingMap.medium;

    const parts = [
        fontVars(theme.font),
        `--c-accent: ${accent}`,
        `--c-brand: ${accent}`,
        `--c-brand-dark: ${accent}`,
        `--c-radius: ${radius}`,
        `--c-radius-card: ${radiusTokenCard(theme)}`,
        `--c-submit-bg: ${theme.submitColor || accent}`,
        `--c-back-color: ${theme.backColor || accent}`,
        `--c-card-bg: ${theme.surfaceGradient || theme.surface || '#ffffff'}`,
        `--c-card-border: ${cardBorder}`,
        `--c-card-shadow: ${cardShadow}`,
        `--c-page-bg: ${theme.pageBg || 'transparent'}`,
        `--c-header-bg: ${theme.headerBg || theme.pageBg || 'transparent'}`,
        `--c-header-text: ${readableOn(theme.headerBg || theme.pageBg)}`,
        `--c-header-text-weak: ${
            readableOn(theme.headerBg || theme.pageBg) === '#ffffff'
                ? 'rgba(255,255,255,0.82)'
                : 'var(--c-text-weak, #5e6e82)'
        }`,
        `--c-section-style: ${theme.sectionDefault || 'card'}`,
        `--c-section-header-bg: ${theme.sectionHeaderBg || 'var(--c-surface-sunken)'}`,
        `--c-section-padding: ${paddingVal}`,
        `--c-header-style: ${theme.headerStyle || 'inherit'}`
    ];

    parts.push(...themeSpecV2Parts(theme, density, accent));

    // Optional explicit border color (e.g. the Salesforce skin's SLDS #dddbda).
    // Drives the card border + divider tokens so the chrome matches exactly.
    if (theme.borderColor && !theme.dark) {
        parts.push(
            `--c-border-light: ${theme.borderColor}`,
            `--c-border: ${theme.borderColor}`
        );
    }

    // Dark skins (e.g. Immersive glass) flip the chrome text tokens so our
    // titles/labels/help text stay readable over the dark card.
    if (theme.dark) {
        parts.push(
            '--c-text: #f3f0ff',
            '--c-text-weak: #c4bfe0',
            '--c-text-meta: #a59ec9',
            '--c-label: #d7d2ee',
            '--c-border-light: rgba(255,255,255,0.16)',
            '--c-border: rgba(255,255,255,0.20)',
            '--c-surface-sunken: rgba(255,255,255,0.06)',
            '--c-surface-alt: rgba(255,255,255,0.08)'
        );
    }

    // Four-lane palette tokens (T3.2) — appended last so a custom skin's color
    // roles win over the theme/dark defaults above.
    if (Array.isArray(theme._roleTokens)) {
        parts.push(...theme._roleTokens);
    }
    return parts.join('; ');
}

// Whether a theme paints a page background behind the card (vs. transparent).
export function hasPageBackground(t) {
    const bg = t && t.pageBg;
    return !!bg && bg !== 'transparent' && bg !== 'none' && bg !== '#ffffff';
}

// The layout archetype, defaulting to classic for older colour-only themes.
export function layoutOf(t) {
    return (t && t.layout) || 'classic';
}

// ----- Section style variants -----
export const SECTION_STYLE_OPTIONS = [
    { label: 'Match template', value: 'inherit' },
    { label: 'Card (border + header)', value: 'card' },
    { label: 'Subtle (bold header, no border)', value: 'subtle' },
    { label: 'Plain (no border, minimal)', value: 'plain' },
    { label: 'Boxed (strong frame)', value: 'boxed' }
];

export function resolveSectionStyle(sectionStyle, templateDefault) {
    if (sectionStyle && sectionStyle !== 'inherit') return sectionStyle;
    return templateDefault || 'card';
}